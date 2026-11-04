/**
 * Ink OCR — turning handwriting into characters, on device.
 *
 * The notebook needs two things from recognition:
 *
 *   1. lasso a word or a formula → convert it to a text object or to LaTeX,
 *   2. notice that a line of ink ends in "=" → offer the calculator.
 *
 * There is no network model here and no training data. Instead each glyph is
 * compared against the *same* characters rendered in the handwriting fonts the
 * app already ships, using a symmetric chamfer distance between ink skeletons.
 * That is crude next to a neural net, but it is instant, private, works
 * offline, and — because the comparison is against handwriting shapes rather
 * than print — it is markedly better on pen input than OCR trained on scans.
 *
 * Everything it produces is editable, and every caller shows a confirmation
 * step before replacing ink.
 */

export type Pt = [number, number];

export interface InkStroke {
  /** Page-space points. A third element (pressure) is ignored. */
  p: Pt[] | number[][];
  w?: number;
}

export interface Glyph {
  strokes: number[];
  box: [number, number, number, number];
  ch: string;
  conf: number;
  /** Raised above the line, or dropped below it. */
  script?: 'sup' | 'sub';
}

export interface OcrResult {
  text: string;
  latex: string;
  glyphs: Glyph[];
  confidence: number;
  /** True when the ink looks like maths rather than prose. */
  math: boolean;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const HAND_FONTS = [
  'Caveat',
  'Kalam',
  'Patrick Hand',
  'Indie Flower',
  'Reenie Beanie',
  'Homemade Apple',
  'Dancing Script',
  // System hands, so the bank still has variety when the web fonts have not
  // arrived (offline, first paint, or a blocked font CDN).
  '"Segoe Script"',
  '"Bradley Hand"',
  '"Comic Sans MS"',
  '"Snell Roundhand"',
  'cursive',
];

const MATH_FONT = 'Georgia, "Times New Roman", serif';

/**
 * Canonical stroke skeletons. A bare vertical line is how most people write a
 * "1", and no typeface renders one that thin — without these, a plain "1"
 * matches ")" better than it matches the serifed glyph in a fallback font.
 */
const SKEL = '__skeleton';
const SKELETONS: Record<string, number[][][]> = {
  '1': [[[0.5, 0], [0.5, 1]]],
  l: [[[0.5, 0], [0.5, 1]]],
  I: [[[0.5, 0], [0.5, 1]]],
  '|': [[[0.5, 0], [0.5, 1]]],
  '-': [[[0, 0.5], [1, 0.5]]],
  '+': [[[0, 0.5], [1, 0.5]], [[0.5, 0], [0.5, 1]]],
  '=': [[[0, 0.34], [1, 0.34]], [[0, 0.66], [1, 0.66]]],
  '/': [[[0, 1], [1, 0]]],
  '\\': [[[0, 0], [1, 1]]],
  '^': [[[0, 1], [0.5, 0], [1, 1]]],
  '.': [[[0.5, 0.94], [0.5, 1]]],
};

function skeletonField(ch: string): Field | null {
  const segs = SKELETONS[ch];
  if (!segs) return null;
  const c = document.createElement('canvas');
  c.width = G;
  c.height = G;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const xs = segs.flat().map((p) => p[0]);
  const ys = segs.flat().map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1e-6, Math.max(...xs) - minX);
  const h = Math.max(1e-6, Math.max(...ys) - minY);
  const pad = 3;
  const k = (G - pad * 2) / Math.max(w, h);
  const ox = (G - w * k) / 2 - minX * k;
  const oy = (G - h * k) / 2 - minY * k;
  for (const seg of segs) {
    g.beginPath();
    seg.forEach((p, i) => (i ? g.lineTo(ox + p[0] * k, oy + p[1] * k) : g.moveTo(ox + p[0] * k, oy + p[1] * k)));
    g.stroke();
  }
  const d = g.getImageData(0, 0, G, G).data;
  const f = emptyField();
  for (let i = 0; i < G * G; i++) f.ink[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  return buildDist(f);
}

/**
 * The maths bank used to be digits and operators only, so a handwritten "cos"
 * had nowhere to land and came back as "003" — the nearest digits. Every letter
 * a formula can contain has to be in here, even though it costs comparisons.
 */
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const GREEK = 'πθαβγδφλμσωΣΔ';
const MATH_CHARS = '0123456789+-=()[]<>/|.,^*%_' + LOWER + GREEK + '√∞∫∑';
const WORD_CHARS = LOWER + LOWER.toUpperCase() + '0123456789.,!?-=+()/\'"';


function bboxOf(strokes: InkStroke[], ids: number[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    for (const q of strokes[id].p) {
      if (q[0] < x0) x0 = q[0];
      if (q[1] < y0) y0 = q[1];
      if (q[0] > x1) x1 = q[0];
      if (q[1] > y1) y1 = q[1];
    }
  }
  return [x0, y0, x1, y1];
}

/** Distance from p to segment ab. */
function ptSeg(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** 0 when the segments cross, otherwise the closest approach. */
function segSeg(a1: number[], a2: number[], b1: number[], b2: number[]): number {
  const d1x = a2[0] - a1[0];
  const d1y = a2[1] - a1[1];
  const d2x = b2[0] - b1[0];
  const d2y = b2[1] - b1[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) > 1e-9) {
    const t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / den;
    const u = ((b1[0] - a1[0]) * d1y - (b1[1] - a1[1]) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(ptSeg(a1, b1, b2), ptSeg(a2, b1, b2), ptSeg(b1, a1, a2), ptSeg(b2, a1, a2));
}

/** Evenly resample a polyline so long strokes stay cheap to compare. */
function samples(s: InkStroke, max = 24): number[][] {
  const p = s.p;
  if (p.length <= max) return p.map((q) => [q[0], q[1]]);
  const out: number[][] = [];
  for (let i = 0; i < max; i++) {
    const q = p[Math.round((i * (p.length - 1)) / (max - 1))];
    out.push([q[0], q[1]]);
  }
  return out;
}

/**
 * Closest approach between two strokes. Comparing vertices alone is wrong for
 * sparse polylines: the arms of a "+" cross between their endpoints and would
 * read as far apart, splitting one symbol into two glyphs.
 */
function gapBetween(a: InkStroke, b: InkStroke): number {
  const A = samples(a);
  const B = samples(b);
  let best = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i];
    const a2 = A[Math.min(i + 1, A.length - 1)];
    for (let j = 0; j < B.length; j++) {
      const d = segSeg(a1, a2, B[j], B[Math.min(j + 1, B.length - 1)]);
      if (d < best) {
        best = d;
        if (best === 0) return 0;
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Segmentation                                                        */
/* ------------------------------------------------------------------ */

/** Group strokes into glyphs: close, horizontally overlapping marks merge. */
export function segment(strokes: InkStroke[]): Glyph[] {
  const n = strokes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const boxes = strokes.map((_, i) => bboxOf(strokes, [i]));
  const heights = boxes.map((b) => b[3] - b[1]);
  const medianH = heights.length ? heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 20;
  const joinGap = Math.max(6, medianH * 0.55);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = boxes[i];
      const B = boxes[j];
      const g = gapBetween(strokes[i], strokes[j]);
      if (g >= joinGap) continue;
      // Same glyph means one stroke's centre lies over the other's body. A
      // plain x-overlap test is too eager: the right arm of a "+" sits a few
      // px from the next digit and would swallow it.
      const tol = joinGap * 0.3;
      const cxA = (A[0] + A[2]) / 2;
      const cxB = (B[0] + B[2]) / 2;
      const inA = cxB >= A[0] - tol && cxB <= A[2] + tol;
      const inB = cxA >= B[0] - tol && cxA <= B[2] + tol;
      if (inA || inB) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r) || [];
    g.push(i);
    groups.set(r, g);
  }

  const glyphs: Glyph[] = [...groups.values()].map((ids) => ({
    strokes: ids,
    box: bboxOf(strokes, ids),
    ch: '',
    conf: 0,
  }));
  glyphs.sort((a, b) => a.box[0] - b.box[0]);
  return glyphs;
}

/* ------------------------------------------------------------------ */
/* Raster + distance field                                             */
/* ------------------------------------------------------------------ */

const G = 40; // glyph grid

interface Field {
  ink: Uint8Array;
  dist: Float32Array;
}

function emptyField(): Field {
  return { ink: new Uint8Array(G * G), dist: new Float32Array(G * G).fill(99) };
}

/** Two-pass chamfer distance to the nearest ink pixel. */
function buildDist(f: Field): Field {
  const d = f.dist;
  for (let i = 0; i < G * G; i++) d[i] = f.ink[i] ? 0 : 99;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= G || y >= G ? 99 : d[y * G + x]);
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const i = y * G + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
    }
  }
  for (let y = G - 1; y >= 0; y--) {
    for (let x = G - 1; x >= 0; x--) {
      const i = y * G + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
    }
  }
  return f;
}

/**
 * Rasterise a glyph into the comparison grid.
 *
 * `rot` spins the ink about the glyph's own centre first, and the box is
 * recomputed afterwards so the rotated shape is still normalised to fill the
 * grid. Without that step a letter drawn on a tilted page is compared against
 * upright templates and loses to whichever upright character happens to be
 * blunter — which is how a slanted "s" turns into a "3".
 */
function rasterStrokes(strokes: InkStroke[], ids: number[], box: [number, number, number, number], pad = 3, rot = 0): Field {
  let pts: number[][][] = ids.map((id) => strokes[id].p.map((q) => [q[0], q[1]]));

  if (rot) {
    const cx = (box[0] + box[2]) / 2;
    const cy = (box[1] + box[3]) / 2;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    pts = pts.map((sp) =>
      sp.map((q) => {
        const dx = q[0] - cx;
        const dy = q[1] - cy;
        return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
      })
    );
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sp of pts) {
      for (const q of sp) {
        if (q[0] < x0) x0 = q[0];
        if (q[1] < y0) y0 = q[1];
        if (q[0] > x1) x1 = q[0];
        if (q[1] > y1) y1 = q[1];
      }
    }
    if (isFinite(x0)) box = [x0, y0, x1, y1];
  }

  const c = document.createElement('canvas');
  c.width = G;
  c.height = G;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  const w = Math.max(1, box[2] - box[0]);
  const h = Math.max(1, box[3] - box[1]);
  const k = (G - pad * 2) / Math.max(w, h);
  const ox = (G - w * k) / 2;
  const oy = (G - h * k) / 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  ids.forEach((id, si) => {
    const s = strokes[id];
    const sp = pts[si];
    g.lineWidth = Math.max(1.6, (s.w || 2) * k * 0.8);
    g.beginPath();
    sp.forEach((q, i) => (i ? g.lineTo(ox + (q[0] - box[0]) * k, oy + (q[1] - box[1]) * k) : g.moveTo(ox + (q[0] - box[0]) * k, oy + (q[1] - box[1]) * k)));
    if (sp.length === 1) g.lineTo(ox + (sp[0][0] - box[0]) * k + 0.5, oy + (sp[0][1] - box[1]) * k + 0.5);
    g.stroke();
  });
  const data = g.getImageData(0, 0, G, G).data;
  const f = emptyField();
  for (let i = 0; i < G * G; i++) f.ink[i] = data[i * 4 + 3] > 40 ? 1 : 0;
  return buildDist(f);
}

/* ------------------------------------------------------------------ */
/* Template bank                                                       */
/* ------------------------------------------------------------------ */

const templateCache = new Map<string, Field>();

/**
 * A template is normalised exactly like the ink it will be compared against:
 * render at high resolution, take the *ink* bounding box, then scale that box
 * into the grid with the same padding. Centring on the font's em box instead
 * leaves every glyph a pixel or two off, and at 32x32 that is the whole margin
 * between "6" and ")".
 */
function template(ch: string, font: string): Field {
  const key = ch + '|' + font;
  const hit = templateCache.get(key);
  if (hit) return hit;
  if (font === SKEL) {
    const sk = skeletonField(ch);
    if (sk) {
      templateCache.set(key, sk);
      return sk;
    }
    // no skeleton for this character: fall through to the font render
  }

  const T = 64;
  const c = document.createElement('canvas');
  c.width = T;
  c.height = T;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.font = `48px ${font}`;
  const m = g.measureText(ch);
  const asc = m.actualBoundingBoxAscent || 34;
  const desc = m.actualBoundingBoxDescent || 10;
  const w = Math.max(1, m.width);
  const h = Math.max(1, asc + desc);
  const k = Math.min((T - 10) / w, (T - 10) / h);
  g.font = `${48 * k}px ${font}`;
  g.fillText(ch, 5, 5 + asc * k);

  const d = g.getImageData(0, 0, T, T).data;
  let x0 = T, y0 = T, x1 = -1, y1 = -1;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if (d[(y * T + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  const f = emptyField();
  if (x1 >= x0) {
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const pad = 3;
    const kk = (G - pad * 2) / Math.max(bw, bh);
    const ox = (G - bw * kk) / 2;
    const oy = (G - bh * kk) / 2;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (d[((y0 + y) * T + (x0 + x)) * 4 + 3] <= 40) continue;
        const gx = Math.round(ox + x * kk);
        const gy = Math.round(oy + y * kk);
        if (gx >= 0 && gx < G && gy >= 0 && gy < G) f.ink[gy * G + gx] = 1;
      }
    }
  }
  const built = buildDist(f);
  templateCache.set(key, built);
  return built;
}

function chamfer(a: Field, b: Field): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < G * G; i++) {
    if (a.ink[i]) {
      sum += b.dist[i];
      n++;
    }
  }
  return n ? sum / n : 99;
}

function score(a: Field, b: Field): number {
  return (chamfer(a, b) + chamfer(b, a)) / 2;
}

/** Characters that look alike get a small prior nudge when the context agrees. */
const PRIMARY_FONTS = ['Caveat', MATH_FONT, SKEL, '"Comic Sans MS"'];

/**
 * Two-stage match. The bank is now large enough that scoring every character
 * against every font is wasteful, so the whole set is first tried against a few
 * representative fonts and only the shortlist gets the full handwriting bank.
 * Costs about a third of the naive version and picks the same winner.
 */
function classify(field: Field, charset: string, fonts: string[]): { ch: string; conf: number } {
  const coarse: [string, number][] = [];
  for (const ch of charset) {
    let best = Infinity;
    for (const font of PRIMARY_FONTS) {
      const s = score(field, template(ch, font));
      if (s < best) best = s;
    }
    coarse.push([ch, best]);
  }
  coarse.sort((a, b) => a[1] - b[1]);

  let bestCh = coarse.length ? coarse[0][0] : '';
  let bestScore = Infinity;
  for (const [ch] of coarse.slice(0, 7)) {
    for (const font of fonts) {
      const s = score(field, template(ch, font));
      if (s < bestScore) {
        bestScore = s;
        bestCh = ch;
      }
    }
  }
  return { ch: bestCh, conf: bestScore };
}

/**
 * Tilts tried when upright does not fit. ±30° covers a page written on your
 * knee or a formula scrawled along a margin; past that the letters themselves
 * stop being letters and the extra range only invents matches.
 */
const TILTS = [0, -0.175, 0.175, -0.35, 0.35, -0.52, 0.52];

function classifyGlyph(
  strokes: InkStroke[],
  ids: number[],
  box: [number, number, number, number],
  charset: string,
  fonts: string[]
): { ch: string; conf: number; tilt: number } {
  const upright = classify(rasterStrokes(strokes, ids, box, 3, 0), charset, fonts);
  let best = { ch: upright.ch, conf: upright.conf, tilt: 0 };
  if (upright.conf < 1.2) return best;

  for (const tilt of TILTS) {
    if (!tilt) continue;
    const r = classify(rasterStrokes(strokes, ids, box, 3, tilt), charset, fonts);
    // A spun match has to win clearly. Without the margin the search simply
    // finds new ways to be wrong — a "c" turned far enough scores as a "0".
    if (r.conf < best.conf * 0.82) best = { ch: r.ch, conf: r.conf, tilt };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Post-processing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Superscripts are rendered from a token stream rather than from the finished
 * string. The old version glued a unicode superscript onto the text and then
 * guessed the LaTeX back out of it, which is why an "x" exponent could come out
 * of the round trip as something else entirely.
 */
const SUPERS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ',
  l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ',
  x: 'ˣ', y: 'ʸ', z: 'ᶻ',
};

const SUBS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', i: 'ᵢ', n: 'ₙ', u: 'ᵤ',
};

const TEX_CH: Record<string, string> = {
  π: '\\pi', θ: '\\theta', α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta',
  φ: '\\phi', λ: '\\lambda', μ: '\\mu', σ: '\\sigma', ω: '\\omega', Σ: '\\Sigma',
  Δ: '\\Delta', '∞': '\\infty', '∫': '\\int', '∑': '\\sum',
  '×': '\\times', '÷': '\\div', '·': '\\cdot',
  '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '→': '\\to',
};

/**
 * Function names are matched with a confusion table, because a hand "c" reads
 * as a "0" far more often than a machine OCR would ever admit. Without this,
 * "c0s" stays "c0s" instead of becoming cos.
 */
const FNS = [
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp',
  'lim', 'max', 'min', 'det', 'mod', 'abs', 'gcd', 'deg', 'arg', 'sgn',
];

const CONFUSE: Record<string, string> = {
  '0': 'o', '1': 'l', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'b', '7': 't', '8': 'b', '9': 'g',
  '|': 'l', 'I': 'l',
};

const normCh = (c: string) => CONFUSE[c] ?? c.toLowerCase();

/** Edit distance where a digit standing in for its lookalike letter is free. */
function fnDist(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const same = normCh(a[i - 1]) === b[j - 1];
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (same ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function bestFn(run: string): string | null {
  const low = run.toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const f of FNS) {
    // Only same-length runs compete. Allowing a deletion let "gln" become "ln",
    // which silently ate a character the writer really drew.
    if (f.length !== low.length) continue;
    const d = fnDist(low, f);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return bestD <= 1 ? best : null;
}

interface Tok {
  ch: string;
  script?: 'sup' | 'sub';
  word?: boolean;
}

function markScripts(glyphs: Glyph[]) {
  const hs = glyphs.map((g) => g.box[3] - g.box[1]).sort((a, b) => a - b);
  const medianH = hs[Math.floor(hs.length / 2)] || 20;

  // Measure the line from its full-height glyphs only. Including a superscript
  // in the average pulls the baseline up and then nothing looks raised any more.
  const body = glyphs.filter((g) => g.box[3] - g.box[1] >= medianH * 0.8);
  const bodyH = body.length ? body.reduce((a, g) => a + (g.box[3] - g.box[1]), 0) / body.length : medianH;

  // Superscripts are judged against a line fitted through the glyph centres, not
  // against a horizontal baseline. A formula written on a tilted page has glyph
  // bottoms at wildly different heights, and a flat baseline would read the end
  // of the line as an exponent.
  const cx = glyphs.map((g) => (g.box[0] + g.box[2]) / 2);
  const cy = glyphs.map((g) => (g.box[1] + g.box[3]) / 2);

  let slope = 0;
  let icept = cy.length ? cy.slice().sort((a, b) => a - b)[Math.floor(cy.length / 2)] : 0;
  let keep = glyphs.map((_, i) => i);
  for (let pass = 0; pass < 2 && keep.length >= 3; pass++) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const i of keep) {
      sx += cx[i];
      sy += cy[i];
      sxx += cx[i] * cx[i];
      sxy += cx[i] * cy[i];
    }
    const n = keep.length;
    const den = n * sxx - sx * sx;
    slope = Math.abs(den) > 1e-6 ? (n * sxy - sx * sy) / den : 0;
    icept = (sy - slope * sx) / n;
    // drop the worst offender once, so a single raised mark cannot tilt the line
    let worst = -1;
    let worstD = 0;
    for (const i of keep) {
      const d = Math.abs(cy[i] - (slope * cx[i] + icept));
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0 && worstD > bodyH * 0.5) keep = keep.filter((i) => i !== worst);
    else break;
  }

  glyphs.forEach((g, i) => {
    g.script = undefined;
    const h = g.box[3] - g.box[1];
    if (h >= bodyH * 0.82) return;
    const off = cy[i] - (slope * cx[i] + icept);
    if (off < -bodyH * 0.22) g.script = 'sup';
    else if (off > bodyH * 0.12) g.script = 'sub';
  });
}

function toTokens(glyphs: Glyph[]): Tok[] {
  const toks: Tok[] = glyphs.map((g) => ({ ch: g.ch, script: g.script }));
  // An explicit caret is the writer telling us the next mark is an exponent.
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].ch === '^' && !toks[i].script) {
      toks[i].ch = '';
      toks[i + 1].script = 'sup';
    }
  }
  return toks;
}

/** Collapse runs of letters into words so function names can be recognised. */
function snapFns(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  let buf: Tok[] = [];
  const flush = () => {
    if (!buf.length) return;
    const s = buf.map((t) => t.ch).join('');
    if (buf.length >= 2 && /[a-z]/i.test(s)) {
      const hit = bestFn(s);
      if (hit) {
        out.push({ ch: hit, word: true });
        buf = [];
        return;
      }
    }
    out.push(...buf);
    buf = [];
  };
  for (const t of toks) {
    if (t.ch && !t.script && t.ch.length === 1 && /[a-z0-9|]/i.test(t.ch)) {
      buf.push(t);
      continue;
    }
    flush();
    if (t.ch) out.push(t);
  }
  flush();
  return out;
}

/** Context fixes applied to tokens, so text and LaTeX can never disagree. */
function tidyToks(toks: Tok[], math: boolean): Tok[] {
  const out = toks.map((t) => ({ ...t }));
  for (let i = 1; i < out.length - 1; i++) {
    const t = out[i];
    if (t.script || t.word) continue;
    const prev = out[i - 1];
    const next = out[i + 1];
    const prevDigit = !prev.script && /[0-9+\-(]/.test(prev.ch);
    const nextDigit = !next.script && /[0-9+\-)=/]/.test(next.ch);
    if (t.ch === 'l' || t.ch === 'I' || t.ch === '|') {
      if (prevDigit && nextDigit) t.ch = '1';
    } else if (t.ch === 'o' || t.ch === 'O') {
      if (prevDigit && nextDigit) t.ch = '0';
    } else if (t.ch === 'x' || t.ch === '×') {
      if (!prev.script && !next.script && /[0-9]/.test(prev.ch) && /[0-9]/.test(next.ch)) t.ch = '×';
    }
  }
  // In a formula a lone vertical is a one. The letter l and the digit 1 share a
  // skeleton, so the tie has to be broken by what the line is made of — and a
  // maths line almost never contains a bare "l" variable.
  if (math) {
    for (const t of out) {
      if (!t.word && !t.script && (t.ch === 'l' || t.ch === 'I' || t.ch === '|')) t.ch = '1';
    }
  }
  // "--" is a single minus
  for (let i = 1; i < out.length; i++) {
    if (out[i].ch === '-' && out[i - 1].ch === '-' && !out[i].script && !out[i - 1].script) {
      out[i].ch = '';
    }
  }
  return out.filter((t) => t.ch);
}

function supText(s: string): string | null {
  let out = '';
  for (const c of s) {
    const u = SUPERS[c];
    if (!u) return null;
    out += u;
  }
  return out;
}

function renderText(toks: Tok[]): string {
  let out = '';
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.ch) {
      i++;
      continue;
    }
    if (!t.script) {
      out += t.ch;
      i++;
      continue;
    }
    const kind = t.script;
    let run = '';
    while (i < toks.length && toks[i].script === kind && toks[i].ch) {
      run += toks[i].ch;
      i++;
    }
    if (kind === 'sup') out += supText(run) ?? '^(' + run + ')';
    else out += (run.split('').map((c) => SUBS[c] ?? c).join('')) ;
  }
  return out;
}

function plainTex(t: Tok): string {
  if (t.word) return FNS.includes(t.ch) ? '\\' + t.ch : t.ch;
  return TEX_CH[t.ch] ?? t.ch;
}

const OPS = new Set(['+', '-', '=', '<', '>', '×', '÷', '·', ',']);

interface Unit {
  base: string;
  sup?: string;
  sub?: string;
  op: boolean;
}

/** Consume the atom after a √, unwrapping one level of brackets. */
function takeGroup(toks: Tok[], i: number): { tex: string; next: number } {
  if (i >= toks.length) return { tex: '', next: i };
  if (toks[i].ch !== '(') return { tex: plainTex(toks[i]), next: i + 1 };
  let depth = 0;
  let tex = '';
  let j = i;
  for (; j < toks.length; j++) {
    const c = toks[j].ch;
    if (!c) continue;
    if (c === '(') {
      depth++;
      if (depth === 1) continue;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
    tex += plainTex(toks[j]);
  }
  return { tex, next: j };
}

function renderLatex(toks: Tok[]): string {
  const units: Unit[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.ch) {
      i++;
      continue;
    }
    if (t.script) {
      const kind = t.script;
      let run = '';
      while (i < toks.length && toks[i].script === kind && toks[i].ch) {
        run += plainTex(toks[i]);
        i++;
      }
      const last = units[units.length - 1];
      if (!last) {
        units.push({ base: '', sup: kind === 'sup' ? run : undefined, sub: kind === 'sub' ? run : undefined, op: false });
      } else if (kind === 'sup') last.sup = (last.sup || '') + run;
      else last.sub = (last.sub || '') + run;
      continue;
    }
    if (t.ch === '√') {
      const g = takeGroup(toks, i + 1);
      units.push({ base: '\\sqrt{' + g.tex + '}', op: false });
      i = g.next;
      continue;
    }
    units.push({ base: plainTex(t), op: OPS.has(t.ch) });
    i++;
  }

  // a/b → \frac{a}{b}, but never across an operator
  for (let k = 1; k < units.length - 1; k++) {
    if (units[k].base !== '/') continue;
    const l = units[k - 1];
    const r = units[k + 1];
    if (l.op || r.op) continue;
    units.splice(k - 1, 3, { base: `\\frac{${l.base}}{${r.base}}`, sup: r.sup, sub: r.sub, op: false });
    k--;
  }

  const parts: string[] = [];
  for (const u of units) {
    let s = u.base;
    if (u.sub) s += '_{' + u.sub + '}';
    if (u.sup) s += '^{' + u.sup + '}';
    if (s) parts.push(s);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function looksMath(glyphs: Glyph[], text: string): boolean {
  const mathy = /[0-9+\-=^/()×÷·√π]|\b(sin|cos|tan|log|ln|exp|lim)\b/;
  const digits = (text.match(/[0-9]/g) || []).length;
  return mathy.test(text) && digits >= 1 && glyphs.length <= 18;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export interface OcrOptions {
  /** Force maths or prose; auto-detected when omitted. */
  math?: boolean;
  /** Extra characters to consider (e.g. greek letters). */
  extra?: string;
}

/**
 * Read a set of strokes. Returns text plus the per-glyph boxes so the caller
 * can highlight what it read.
 */
export function readInk(strokes: InkStroke[], opts: OcrOptions = {}): OcrResult {
  if (!strokes.length) return { text: '', latex: '', glyphs: [], confidence: 0, math: false };

  const glyphs = segment(strokes);
  markScripts(glyphs);

  const charset = (opts.math === true ? MATH_CHARS : opts.math === false ? WORD_CHARS : MATH_CHARS + WORD_CHARS) + (opts.extra || '');
  const fonts = [...HAND_FONTS, MATH_FONT, SKEL];

  let total = 0;
  for (const g of glyphs) {
    const { ch, conf } = classifyGlyph(strokes, g.strokes, g.box, charset, fonts);
    g.ch = ch;
    g.conf = conf;
    total += conf;
  }

  // A bracket has to be wide enough to hold something. A near-vertical mark that
  // scores as one is a "1" with its little flag — and at 32x32 the flag and the
  // bracket's top serif are the same few pixels.
  for (const g of glyphs) {
    if (g.ch !== '[' && g.ch !== ']') continue;
    const w = g.box[2] - g.box[0];
    const h = Math.max(1, g.box[3] - g.box[1]);
    if (w / h < 0.26) g.ch = '1';
  }

  const math = opts.math ?? looksMath(glyphs, glyphs.map((g) => g.ch).join(''));
  const toks = tidyToks(snapFns(toTokens(glyphs)), math);
  const text = math ? renderText(toks) : renderText(toks).trim();
  const confidence = glyphs.length ? Math.max(0, 1 - total / glyphs.length / 12) : 0;

  return {
    text,
    latex: math ? renderLatex(toks) : renderText(toks),
    glyphs,
    confidence,
    math,
  };
}

/** Cheap check used by the "=" watcher: does this ink end in an equals sign? */
export function endsWithEquals(strokes: InkStroke[]): boolean {
  if (!strokes.length) return false;
  const glyphs = segment(strokes);
  if (!glyphs.length) return false;
  const last = glyphs[glyphs.length - 1];
  const w = last.box[2] - last.box[0];
  const h = last.box[3] - last.box[1];
  // two short horizontal bars, one above the other
  if (h <= 0) return false;
  if (w < h * 1.2) return false;
  const ids = last.strokes;
  if (ids.length === 2) {
    const a = strokes[ids[0]];
    const b = strokes[ids[1]];
    const ha = bboxOf(strokes, [ids[0]])[3] - bboxOf(strokes, [ids[0]])[1];
    const hb = bboxOf(strokes, [ids[1]])[3] - bboxOf(strokes, [ids[1]])[1];
    return ha < h * 0.45 && hb < h * 0.45;
  }
  if (ids.length === 1) {
    // one continuous zig-zag drawn as "="
    const p = a0(strokes[ids[0]]);
    const ys = p.map((q) => q[1]);
    const span = Math.max(...ys) - Math.min(...ys);
    return span < h * 1.4 && p.length >= 4;
  }
  return false;
}

function a0(s: InkStroke): Pt[] {
  return s.p.map((q) => [q[0], q[1]] as Pt);
}
