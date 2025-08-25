// ===== Numbers: Zen Digit Dissolve — Inclusive Multiscript (fast, cached) =====
// Big number cycles through: latin → eastern → devanagari → chinese → japanese → thai → bengali
// Particles ALWAYS draw Latin (European) digits from the auction number.
// URL params:
//   ?num=2025
//   ?dur=600
//   ?breath=8
//   ?step=8
//   ?tiny=full
//   ?cycle=10
//   ?mode=latin|eastern|devanagari|chinese|japanese|thai|bengali

let BASE_NUMBER_TEXT = "131";
let RUN_SECONDS = null;
let BREATH_SECONDS = 6;
let TINY_MODE = "chars";    // 'chars' | 'full'
let SAMPLE_STEP = 6;
let CYCLE_SECONDS = 10;
let LOCK_MODE = null;       // when set, disables cycling

// Offscreen raster for main text sampling
let pg;
let particles = [];
let lastBuildKey = "";
let startMillis = 0;

// Visual constants
const BG = 0, FG = 255;
const TARGET_SCALE = 0.78;
const MARGIN_FRAC = 0.12;

// Motion tuning
const EXHALE_SPREAD = 28;
const EXHALE_JITTER = 0.9;
const INHALE_TIGHTNESS = 0.18;
const DRIFT_NOISE_SCALE = 0.002;
const DRIFT_NOISE_STRENGTH = 0.9;

// HUD
const HUD_FADE = 140;

// Glyph sprite cache for tiny particles: key = glyph + "@" + sizeInt
let glyphCache = new Map();

// Cycle order (prioritized for global coverage)
const FORMAT_ORDER = ["latin", "eastern", "devanagari", "chinese", "japanese", "thai", "bengali"];

function getParams() {
  const u = new URL(window.location.href);

  const n = u.searchParams.get("num");
  if (n && n.trim() !== "") BASE_NUMBER_TEXT = n.trim();

  const d = u.searchParams.get("dur");
  if (d !== null) {
    const sec = parseInt(d, 10);
    if (Number.isFinite(sec) && sec > 0) RUN_SECONDS = sec;
  }

  const b = u.searchParams.get("breath");
  if (b !== null) {
    const sec = parseFloat(b);
    if (Number.isFinite(sec) && sec > 0.5) BREATH_SECONDS = sec;
  }

  const tiny = u.searchParams.get("tiny");
  if (tiny && tiny.toLowerCase() === "full") TINY_MODE = "full";

  const st = u.searchParams.get("step");
  if (st !== null) {
    const v = parseInt(st, 10);
    if (Number.isFinite(v) && v >= 3 && v <= 24) SAMPLE_STEP = v;
  }

  const cyc = u.searchParams.get("cycle");
  if (cyc !== null) {
    const v = parseFloat(cyc);
    if (Number.isFinite(v) && v >= 2) CYCLE_SECONDS = v;
  }

  const mode = u.searchParams.get("mode");
  if (mode) {
    const m = mode.toLowerCase();
    if (FORMAT_ORDER.includes(m)) LOCK_MODE = m;
  }
}

function setup() {
  getParams();
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  textAlign(CENTER, CENTER);
  // Tiny particles use monospace for consistent spacing; big text uses sans for Unicode fallbacks
  textFont('monospace');
  startMillis = millis();
  buildTextParticles(); // initial
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildTextParticles();
}

function draw() {
  background(BG);

  // Which script to display right now
  const currentFormat = LOCK_MODE || getCycledFormat();
  const displayText = formatNumber(BASE_NUMBER_TEXT, currentFormat);

  // Rebuild raster if size/format/step changed
  const buildKey = displayText + "|" + width + "x" + height + "|" + SAMPLE_STEP;
  if (buildKey !== lastBuildKey) buildTextParticles(displayText);

  // Breath cycle: triangle 0..1..0 over inhale+exhale
  const t = millis() / 1000.0;
  const period = BREATH_SECONDS * 2;
  const cyc = (t % period) / period;                         // 0..1
  const tri = cyc < 0.5 ? (cyc * 2.0) : (2.0 - cyc * 2.0);   // 0..1..0
  const exhale = 1.0 - tri;

  // Update + draw particles (Latin-digit sprites)
  noStroke();
  for (let p of particles) {
    const n = noise(p.home.x * DRIFT_NOISE_SCALE, p.home.y * DRIFT_NOISE_SCALE, t * 0.15);
    const ang = p.theta + n * TWO_PI;
    const spread = EXHALE_SPREAD * (0.4 + EXHALE_JITTER * p.rand);
    const drift = createVector(cos(ang), sin(ang)).mult(spread * exhale);

    const f = flowForce(p.home.x, p.home.y, t).mult(DRIFT_NOISE_STRENGTH * exhale);
    drift.add(f);

    const target = p5.Vector.add(p.home, drift);
    const easing = lerp(1.0 - INHALE_TIGHTNESS, 0.08, exhale);

    p.pos.x = lerp(p.pos.x, target.x, easing);
    p.pos.y = lerp(p.pos.y, target.y, easing);

    const alpha = 200 + 55 * tri;

    // blit cached sprite
    const sizeInt = Math.round(p.textSize);
    const key = p.glyph + "@" + sizeInt;
    let sprite = glyphCache.get(key);
    if (!sprite) {
      sprite = renderGlyphSprite(p.glyph, sizeInt);
      glyphCache.set(key, sprite);
    }
    push();
    translate(p.pos.x, p.pos.y);
    tint(FG, alpha);
    imageMode(CENTER);
    image(sprite, 0, 0);
    pop();
  }

  if (RUN_SECONDS !== null) {
    const remaining = Math.max(0, RUN_SECONDS - (millis() - startMillis) / 1000);
    drawCountdown(remaining);
  }
}

// ---------------- Flow + HUD ----------------

function flowForce(x, y, t) {
  const s = 0.0013;
  const nx = noise(x * s, y * s, t * 0.07);
  const ny = noise((x + 999) * s, (y - 777) * s, t * 0.07);
  const ang = map(nx, 0, 1, -PI, PI);
  const magnitude = map(ny, 0, 1, 0.2, 1.0);
  return createVector(cos(ang), sin(ang)).mult(magnitude);
}

function drawCountdown(remainingSec) {
  const mm = floor(remainingSec / 60);
  const ss = floor(remainingSec % 60);
  const txt = nf(mm, 2) + ":" + nf(ss, 2);
  push();
  textAlign(RIGHT, BOTTOM);
  textSize(14);
  fill(FG, HUD_FADE);
  noStroke();
  text(txt, width - 14, height - 12);
  pop();
}

// ------------- Build particles from rasterized big text -------------

function buildTextParticles(displayText = null) {
  glyphCache.clear();

  if (displayText === null) {
    const fmt = LOCK_MODE || getCycledFormat();
    displayText = formatNumber(BASE_NUMBER_TEXT, fmt);
  }

  const minDim = min(width, height);
  const margin = minDim * MARGIN_FRAC;
  const targetH = minDim * TARGET_SCALE;

  if (pg) pg.remove();
  pg = createGraphics(width, height);
  pg.pixelDensity(1);
  pg.background(0);
  pg.fill(255);
  pg.noStroke();
  pg.textAlign(CENTER, CENTER);
  // Big text: let browser pick a Unicode-capable sans-serif
  pg.textFont('sans-serif');

  let ts = max(12, targetH);
  pg.textSize(ts);

  const availW = width - margin * 2;
  let wText = pg.textWidth(displayText);
  if (wText > availW) {
    ts = ts * (availW / wText);
    ts = max(12, ts);
    pg.textSize(ts);
  }

  pg.text(displayText, width / 2, height / 2);

  // Sample buffer into particles
  pg.loadPixels();
  particles = [];
  const pw = pg.width, ph = pg.height;

  const glyphs = prepareLatinGlyphs(BASE_NUMBER_TEXT); // particles from Latin digits only
  for (let y = 0; y < ph; y += SAMPLE_STEP) {
    for (let x = 0; x < pw; x += SAMPLE_STEP) {
      const idx = 4 * (y * pw + x);
      const r = pg.pixels[idx + 0];
      const g = pg.pixels[idx + 1];
      const b = pg.pixels[idx + 2];
      const a = pg.pixels[idx + 3];
      if (a > 10 && (r + g + b) > 500) {
        particles.push(makeParticle(x, y, glyphs));
      }
    }
  }

  lastBuildKey = displayText + "|" + width + "x" + height + "|" + SAMPLE_STEP;
}

// Particles always Latin digits
function prepareLatinGlyphs(s) {
  const digits = s.replace(/\D/g, '');
  const chars = (digits.length ? digits : "0").split("");
  if (TINY_MODE === "full") return [digits.length ? digits : "0"];
  return chars;
}

function pickGlyph(glyphs) {
  return glyphs[floor(random(glyphs.length))];
}

function makeParticle(x, y, glyphs) {
  const jitter = random(-2, 2);
  const base = (TINY_MODE === "full") ? 9 : 12;
  const variance = (TINY_MODE === "full") ? 2.0 : 3.0;
  return {
    home: createVector(x, y),
    pos: createVector(x + jitter, y + jitter),
    textSize: Math.max(6, Math.round(random(base - 1, base + variance))),
    glyph: pickGlyph(glyphs),
    theta: random(TWO_PI),
    rand: random()
  };
}

// Render tiny glyph once to offscreen sprite (fast blit)
function renderGlyphSprite(glyph, sz) {
  const pad = Math.ceil(sz * 0.4);
  const w = ceil(sz * Math.max(1, glyph.length) + pad * 2);
  const h = ceil(sz + pad * 2);
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  g.background(0, 0); // transparent
  g.fill(255);
  g.noStroke();
  g.textAlign(CENTER, CENTER);
  g.textFont('monospace');
  g.textSize(sz);
  g.text(glyph, g.width / 2, g.height / 2);
  return g;
}

// ---------------- Script cycling & formatting ----------------

function getCycledFormat() {
  const elapsed = (millis() - startMillis) / 1000.0;
  const idx = floor(elapsed / CYCLE_SECONDS) % FORMAT_ORDER.length;
  return FORMAT_ORDER[idx];
}

function formatNumber(baseText, mode) {
  // Per-digit mapping; preserves non-digits as-is
  switch (mode) {
    case "eastern":    return mapDigits(baseText, EASTERN_ARABIC);
    case "devanagari": return mapDigits(baseText, DEVANAGARI);
    case "chinese":    return mapDigitsWithZero(baseText, CJK_CHINESE_ZERO, CJK_COMMON);
    case "japanese":   return mapDigitsWithZero(baseText, JAPANESE_ZERO, CJK_COMMON);
    case "thai":       return mapDigits(baseText, THAI);
    case "bengali":    return mapDigits(baseText, BENGALI);
    default:           return baseText; // latin
  }
}

function mapDigits(s, table) {
  return s.replace(/\d/g, d => table[parseInt(d, 10)]);
}

// Some scripts use different glyphs for "0"
function mapDigitsWithZero(s, zeroChar, commonTable) {
  return s.replace(/\d/g, d => (d === '0' ? zeroChar : commonTable[parseInt(d, 10)]));
}

// Digit tables
const EASTERN_ARABIC = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
const DEVANAGARI     = ['०','१','२','३','४','५','६','७','८','९'];
const THAI           = ['๐','๑','๒','๓','๔','๕','๖','๗','๘','๙'];
const BENGALI        = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
// Chinese/Japanese share 1-9; zero differs commonly:
const CJK_COMMON     = ['零','一','二','三','四','五','六','七','八','九']; // zero here is used for Chinese
const CJK_CHINESE_ZERO = '零';
const JAPANESE_ZERO  = '〇'; // maru

// ---------------- Dev helpers ----------------

function keyTyped() {
  if (key === 'r') {
    BASE_NUMBER_TEXT = String(floor(random(1, 9999)));
    buildTextParticles();
  }
  if (key === 'c') {
    LOCK_MODE = LOCK_MODE ? null : "latin";
  }
}