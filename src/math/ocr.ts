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

const MATH_CHARS = '0123456789+-=()/xyzabnt.^%π√';
const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-=+()/\'"';

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

const G = 32; // glyph grid

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

function rasterStrokes(strokes: InkStroke[], ids: number[], box: [number, number, number, number], pad = 3): Field {
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
  for (const id of ids) {
    const s = strokes[id];
    g.lineWidth = Math.max(1.6, (s.w || 2) * k * 0.8);
    g.beginPath();
    s.p.forEach((q, i) => (i ? g.lineTo(ox + (q[0] - box[0]) * k, oy + (q[1] - box[1]) * k) : g.moveTo(ox + (q[0] - box[0]) * k, oy + (q[1] - box[1]) * k)));
    if (s.p.length === 1) g.lineTo(ox + (s.p[0][0] - box[0]) * k + 0.5, oy + (s.p[0][1] - box[1]) * k + 0.5);
    g.stroke();
  }
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
function classify(field: Field, charset: string, fonts: string[]): { ch: string; conf: number } {
  let best = { ch: '', conf: 0 };
  let bestScore = Infinity;
  for (const ch of charset) {
    for (const font of fonts) {
      const t = template(ch, font);
      const s = score(field, t);
      if (s < bestScore) {
        bestScore = s;
        best = { ch, conf: s };
      }
    }
  }
  return { ch: best.ch, conf: bestScore };
}

/* ------------------------------------------------------------------ */
/* Post-processing                                                     */
/* ------------------------------------------------------------------ */

const SUPERS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  n: 'ⁿ', x: 'ˣ', '-': '⁻',
};

function looksMath(glyphs: Glyph[], text: string): boolean {
  const mathy = /[0-9+\-=^/()]/;
  const digits = (text.match(/[0-9]/g) || []).length;
  return mathy.test(text) && digits >= 1 && glyphs.length <= 18;
}

function toLatex(text: string): string {
  let s = text
    .replace(/π/g, '\\pi ')
    .replace(/√/g, '\\sqrt')
    .replace(/×/g, '\\times ')
    .replace(/÷/g, '\\div ')
    .replace(/·/g, '\\cdot ')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿˣ]+/g, (m) => {
      const plain = m
        .split('')
        .map((c) => Object.entries(SUPERS).find(([, v]) => v === c)?.[0] ?? c)
        .join('');
      return '^{' + plain + '}';
    });
  // simple a/b → \frac{a}{b}
  s = s.replace(/(\d+|[a-z])\s*\/\s*(\d+|[a-z])/g, (_, a, b) => `\\frac{${a}}{${b}}`);
  return s;
}

/** Common handwriting confusions, fixed by context. */
function tidy(text: string): string {
  let s = text;
  s = s.replace(/\s+/g, '');
  // a lone "l" or "I" between digits is a 1
  s = s.replace(/(?<=[0-9+\-(])\s*[lI|]\s*(?=[0-9+\-)=])/g, '1');
  s = s.replace(/(?<=[0-9])\s*[oO]\s*(?=[0-9+\-=])/g, '0');
  // "x" between digits is a multiplication sign
  s = s.replace(/(?<=[0-9])\s*[x×]\s*(?=[0-9])/g, '×');
  s = s.replace(/--/g, '-');
  return s;
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
  const heights = glyphs.map((g) => g.box[3] - g.box[1]).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 20;
  const baseline = glyphs.length
    ? glyphs.map((g) => g.box[3]).sort((a, b) => a - b)[Math.floor(glyphs.length * 0.75)]
    : 0;

  // Superscripts sit high and small; subscripts low and small.
  for (const g of glyphs) {
    const h = g.box[3] - g.box[1];
    if (h < medianH * 0.68) {
      if (g.box[3] < baseline - medianH * 0.25) g.script = 'sup';
      else if (g.box[1] > baseline + medianH * 0.1) g.script = 'sub';
    }
  }

  const charset = (opts.math === true ? MATH_CHARS : opts.math === false ? WORD_CHARS : MATH_CHARS + WORD_CHARS) + (opts.extra || '');
  const fonts = [...HAND_FONTS, MATH_FONT, SKEL];

  let total = 0;
  for (const g of glyphs) {
    const field = rasterStrokes(strokes, g.strokes, g.box);
    const { ch, conf } = classify(field, charset, fonts);
    g.ch = ch;
    g.conf = conf;
    total += conf;
  }

  let raw = '';
  for (const g of glyphs) {
    if (g.script === 'sup' && SUPERS[g.ch]) raw += SUPERS[g.ch];
    else if (g.script === 'sub') raw += '₍' + g.ch + '₎';
    else raw += g.ch;
  }

  const math = opts.math ?? looksMath(glyphs, raw);
  const text = math ? tidy(raw) : raw.replace(/\s+/g, ' ').trim();
  const confidence = glyphs.length ? Math.max(0, 1 - total / glyphs.length / 12) : 0;

  return {
    text,
    latex: toLatex(text),
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
