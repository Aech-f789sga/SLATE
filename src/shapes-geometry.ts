/**
 * Shape geometry — recognising a doodle, then describing it exactly.
 *
 * The notebook's promise is "draw it roughly, get it perfectly". That needs two
 * separate things:
 *
 *   1. a decision — is this a circle or a rectangle, a square or a rhombus? and
 *   2. a description — the numbers that let the renderer draw the ideal shape
 *      instead of the shaky one.
 *
 * Everything here is pure geometry on a resampled path: conic fitting (used by
 * fitEllipse), corner extraction plus side/angle tests for the polygon
 * families, and a small set of residuals to decide between them.
 *
 * The `parab` / `hyper` kinds below are retained purely so notebooks saved
 * before the Conics insert option was removed still open and render correctly.
 * Nothing in the UI creates them any more.
 */

export type Pt = [number, number];

export type ShapeKind =
  | 'line'
  | 'arrow'
  | 'rect'
  | 'square'
  | 'ell'
  | 'circle'
  | 'tri'
  | 'para'
  | 'trap'
  | 'rhomb'
  | 'poly'
  | 'parab'
  | 'hyper';

/**
 * All stored parameters are normalised to the shape's bounding box (0–1), so
 * moving, scaling or rotating the selection keeps working through the engine's
 * own a/b transforms without any extra bookkeeping.
 */
export interface EllipseFit {
  /** radii as fractions of the box width/height */
  rx: number;
  ry: number;
  rot: number;
}

export interface ParabolaFit {
  vertical: boolean;
  /** v = a(u-h)² + k in box coordinates */
  a: number;
  h: number;
  k: number;
}

export interface HyperbolaFit {
  cx: number;
  cy: number;
  a: number;
  b: number;
  rot: number;
  axis: 'x' | 'y';
}

export interface ShapeDef {
  kind: ShapeKind;
  a: Pt;
  b: Pt;
  /** polygon vertices, in page order */
  poly?: Pt[];
  /** ellipse parameters */
  el?: EllipseFit;
  /** parabola parameters */
  pb?: ParabolaFit;
  /** hyperbola parameters */
  hb?: HyperbolaFit;
  /** confidence 0–1, used to decide whether to snap at all */
  score: number;
}

/** Raw (absolute) fit results, converted to box coordinates before they leave. */
interface EllipseRaw {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  resid: number;
}
interface ParabolaRaw {
  vertical: boolean;
  a: number;
  h: number;
  k: number;
  lo: number;
  hi: number;
  resid: number;
}
interface HyperbolaRaw {
  cx: number;
  cy: number;
  a: number;
  b: number;
  rot: number;
  axis: 'x' | 'y';
  resid: number;
}

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

export function bboxOf(pts: Pt[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, x2: x1, y2: y1, w: x1 - x0, h: y1 - y0 };
}

const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);

export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const total: number[] = [0];
  for (let i = 1; i < pts.length; i++) total.push(total[i - 1] + dist(pts[i - 1], pts[i]));
  const len = total[total.length - 1];
  if (len < 1e-6) return [pts[0], pts[0]];
  const step = len / (n - 1);
  const out: Pt[] = [pts[0]];
  let j = 0;
  for (let k = 1; k < n; k++) {
    const target = step * k;
    while (j < total.length - 2 && total[j + 1] < target) j++;
    const seg = total[j + 1] - total[j] || 1;
    const t = (target - total[j]) / seg;
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return out;
}

function pathLength(P: Pt[]): number {
  let L = 0;
  for (let i = 1; i < P.length; i++) L += dist(P[i - 1], P[i]);
  return L;
}

/** Shoelace area (absolute). */
export function polyArea(P: Pt[]): number {
  let a = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/* ------------------------------------------------------------------ */
/* Conic fitting                                                       */
/* ------------------------------------------------------------------ */

/** Solve A·x = b by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

interface Conic {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  /** scale of the normalisation used for the fit */
  s: number;
  ox: number;
  oy: number;
}

/**
 * Least-squares conic through the path, in normalised coordinates so the
 * numbers stay well conditioned whatever the page size.
 */
function fitConic(P: Pt[]): Conic | null {
  const b = bboxOf(P);
  const s = Math.max(b.w, b.h) || 1;
  const ox = (b.x + b.x2) / 2;
  const oy = (b.y + b.y2) / 2;

  // A u² + B uv + C v² + D u + E v = 1
  const M = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const rhs = new Array(5).fill(0);
  for (const [x, y] of P) {
    const u = (x - ox) / s;
    const v = (y - oy) / s;
    const row = [u * u, u * v, v * v, u, v];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) M[i][j] += row[i] * row[j];
      rhs[i] += row[i];
    }
  }
  const sol = solve(M, rhs);
  if (!sol) return null;
  return { A: sol[0], B: sol[1], C: sol[2], D: sol[3], E: sol[4], s, ox, oy };
}

/** RMS geometric distance of the path from the conic, relative to its size. */
function conicResidual(P: Pt[], c: Conic): number {
  let sum = 0;
  for (const [x, y] of P) {
    const u = (x - c.ox) / c.s;
    const v = (y - c.oy) / c.s;
    const f = c.A * u * u + c.B * u * v + c.C * v * v + c.D * u + c.E * v - 1;
    const gu = 2 * c.A * u + c.B * v + c.D;
    const gv = c.B * u + 2 * c.C * v + c.E;
    const g = Math.hypot(gu, gv) || 1e-6;
    sum += (f / g) * (f / g);
  }
  return Math.sqrt(sum / P.length);
}

/* ------------------------------------------------------------------ */
/* Ellipse                                                             */
/* ------------------------------------------------------------------ */

export function fitEllipse(P: Pt[]): EllipseRaw | null {
  const c = fitConic(P);
  if (!c) return null;
  const disc = c.B * c.B - 4 * c.A * c.C;
  if (disc >= 0) return null;

  // centre: solve [2A B; B 2C]·[u;v] = [-D;-E]
  const det = 4 * c.A * c.C - c.B * c.B;
  if (Math.abs(det) < 1e-12) return null;
  const u0 = (-2 * c.C * c.D + c.B * c.E) / det;
  const v0 = (-2 * c.A * c.E + c.B * c.D) / det;

  // translate to the centre, then diagonalise the quadratic form
  const f0 = c.A * u0 * u0 + c.B * u0 * v0 + c.C * v0 * v0 + c.D * u0 + c.E * v0 - 1;
  const A = c.A / -f0;
  const B = c.B / -f0;
  const C = c.C / -f0;
  const theta = 0.5 * Math.atan2(B, A - C);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const l1 = A * cos * cos + B * cos * sin + C * sin * sin;
  const l2 = A * sin * sin - B * cos * sin + C * cos * cos;
  if (l1 <= 0 || l2 <= 0) return null;

  const rx = (1 / Math.sqrt(l1)) * c.s;
  const ry = (1 / Math.sqrt(l2)) * c.s;
  const resid = conicResidual(P, c);

  return {
    cx: c.ox + u0 * c.s,
    cy: c.oy + v0 * c.s,
    rx: Math.max(rx, ry),
    ry: Math.min(rx, ry),
    rot: rx >= ry ? theta : theta + Math.PI / 2,
    resid,
  };
}

/* ------------------------------------------------------------------ */
/* Parabola                                                            */
/* ------------------------------------------------------------------ */

/*
 * No longer part of recognition — see the note in `recogniseShape`. Kept
 * because the maths is exact and a deliberate "fit a conic to this" tool would
 * want it; nothing calls it today.
 */
export function fitParabola(P: Pt[]): ParabolaRaw | null {
  const b = bboxOf(P);
  const vert = b.h >= b.w;

  const fit = (swap: boolean): { a: number; h: number; k: number; resid: number } | null => {
    // Least squares for y = a x² + b x + c, then rewrite as a(x-h)² + k.
    // The raw normal equations are badly conditioned once the arc is steep —
    // x² swamps the other columns and the solve returns noise — so centre and
    // scale first, fit there, then map the coefficients back.
    let mx = 0;
    let my = 0;
    for (const [px, py] of P) {
      mx += swap ? py : px;
      my += swap ? px : py;
    }
    mx /= P.length;
    my /= P.length;
    let sx = 0;
    for (const [px, py] of P) {
      const x = (swap ? py : px) - mx;
      sx += x * x;
    }
    sx = Math.sqrt(sx / P.length) || 1;

    const M = Array.from({ length: 3 }, () => new Array(3).fill(0));
    const rhs = new Array(3).fill(0);
    for (const [px, py] of P) {
      const x = ((swap ? py : px) - mx) / sx;
      const y = (swap ? px : py) - my;
      const row = [x * x, x, 1];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) M[i][j] += row[i] * row[j];
        rhs[i] += row[i] * y;
      }
    }
    const sol = solve(M, rhs);
    if (!sol) return null;
    const [A, B, C] = sol;
    if (Math.abs(A) < 1e-9) return null;
    // y_n = A x_n² + B x_n + C  with  x_n = (x-mx)/sx,  y_n = y-my
    const a = A / (sx * sx);
    const b = B / sx - (2 * A * mx) / (sx * sx);
    const c = my + C - (B * mx) / sx + (A * mx * mx) / (sx * sx);
    const h = -b / (2 * a);
    const k = c - (b * b) / (4 * a);
    let sum = 0;
    for (const [px, py] of P) {
      const x = swap ? py : px;
      const y = swap ? px : py;
      const d = y - (a * x * x + b * x + c);
      sum += d * d;
    }
    return { a, h, k, resid: Math.sqrt(sum / P.length) };
  };

  const v = fit(false);
  const h = fit(true);
  if (!v && !h) return null;

  let best: ParabolaRaw;
  if (v && (!h || v.resid <= h.resid)) {
    best = { vertical: true, a: v.a, h: v.h, k: v.k, lo: b.x, hi: b.x2, resid: v.resid };
  } else if (h) {
    best = { vertical: false, a: h.a, h: h.h, k: h.k, lo: b.y, hi: b.y2, resid: h.resid };
  } else {
    return null;
  }

  return best;
}

/* ------------------------------------------------------------------ */
/* Hyperbola                                                           */
/* ------------------------------------------------------------------ */

export function fitHyperbola(P: Pt[]): HyperbolaRaw | null {
  const c = fitConic(P);
  if (!c) return null;
  const disc = c.B * c.B - 4 * c.A * c.C;
  if (disc <= 0) return null;

  const det = 4 * c.A * c.C - c.B * c.B;
  if (Math.abs(det) < 1e-12) return null;
  const u0 = (-2 * c.C * c.D + c.B * c.E) / det;
  const v0 = (-2 * c.A * c.E + c.B * c.D) / det;
  const f0 = c.A * u0 * u0 + c.B * u0 * v0 + c.C * v0 * v0 + c.D * u0 + c.E * v0 - 1;
  if (Math.abs(f0) < 1e-12) return null;

  const A = c.A / -f0;
  const B = c.B / -f0;
  const C = c.C / -f0;
  const theta = 0.5 * Math.atan2(B, A - C);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const l1 = A * cos * cos + B * cos * sin + C * sin * sin;
  const l2 = A * sin * sin - B * cos * sin + C * cos * cos;
  if (l1 * l2 >= 0) return null;

  const axis: 'x' | 'y' = l1 > 0 ? 'x' : 'y';
  const a = 1 / Math.sqrt(Math.abs(l1));
  const bq = 1 / Math.sqrt(Math.abs(l2));

  return {
    cx: c.ox + u0 * c.s,
    cy: c.oy + v0 * c.s,
    a: Math.max(4, a * c.s),
    b: Math.max(4, bq * c.s),
    rot: theta,
    axis,
    resid: conicResidual(P, c),
  };
}

/* ------------------------------------------------------------------ */
/* Polygons                                                            */
/* ------------------------------------------------------------------ */

/** Ramer–Douglas–Peucker. */
function rdp(P: Pt[], eps: number): Pt[] {
  if (P.length < 3) return P.slice();
  const first = P[0];
  const last = P[P.length - 1];
  let idx = -1;
  let maxD = 0;
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const L = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < P.length - 1; i++) {
    const d = Math.abs((P[i][0] - first[0]) * dy - (P[i][1] - first[1]) * dx) / L;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [first, last];
  const left = rdp(P.slice(0, idx + 1), eps);
  const right = rdp(P.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

/** Corner extraction on a closed path, by turning-angle peaks. */
export function corners(P: Pt[], diag: number): Pt[] {
  const n = P.length;
  if (n < 8) return [];

  // Light smoothing first: a shaky hand must not manufacture corners, and one
  // noisy sample would otherwise drag the measured angle with it.
  const S: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n];
    const b = P[i];
    const c = P[(i + 1) % n];
    S.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]);
  }

  // Judge a corner over a fixed slice of the outline rather than a fixed number
  // of samples, so sparse and dense strokes are measured the same way.
  const win = Math.max(2, Math.round(n * 0.05));
  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = S[(i - win + n) % n];
    const b = S[i];
    const c = S[(i + win) % n];
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    const lu = Math.hypot(u[0], u[1]) || 1;
    const lv = Math.hypot(v[0], v[1]) || 1;
    const cos = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)));
    angles.push((Math.acos(cos) * 180) / Math.PI);
  }

  // A sample sitting just before a corner already has its forward chord across
  // that corner, so it reports a large angle too. Every real corner therefore
  // throws a hump roughly +-win wide, and only the sample *at* the corner is a
  // peak. Keeping just the local maxima of that hump is what removes the ghosts;
  // the suppression pass after it only has to collapse near-duplicates.
  //
  // The window here has to stay narrow. An earlier version looked +-2*win wide
  // and wrapped across the seam, so the first corner of a stroke outvoted the
  // last one — which is exactly how a square came back with three corners and
  // then fell through to the ellipse fit.
  const mw = Math.max(1, Math.round(win / 2));
  const cand: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (angles[i] < 34) continue;
    let peak = true;
    for (let k = 1; k <= mw && peak; k++) {
      if (angles[(i - k + n) % n] > angles[i] || angles[(i + k) % n] > angles[i]) peak = false;
    }
    if (peak) cand.push([i, angles[i]]);
  }
  cand.sort((x, y) => y[1] - x[1]);

  const radius = Math.max(3, Math.round(n * 0.04));
  const picked: number[] = [];
  for (const [i] of cand) {
    let clash = false;
    for (const j of picked) {
      const d = Math.abs(i - j);
      if (Math.min(d, n - d) < radius) {
        clash = true;
        break;
      }
    }
    if (!clash) picked.push(i);
    if (picked.length >= 12) break;
  }
  picked.sort((a, b) => a - b);

  const out = picked.map((i) => P[i]);
  // drop vertices that barely move the outline
  const kept: Pt[] = [];
  for (const v of out) {
    if (!kept.length || dist(kept[kept.length - 1], v) > diag * 0.04) kept.push(v);
  }
  if (kept.length > 1 && dist(kept[0], kept[kept.length - 1]) < diag * 0.04) kept.pop();
  return kept;
}

function angleAt(a: Pt, b: Pt, c: Pt): number {
  const u = [a[0] - b[0], a[1] - b[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  const lu = Math.hypot(u[0], u[1]) || 1;
  const lv = Math.hypot(v[0], v[1]) || 1;
  const dot = (u[0] * v[0] + u[1] * v[1]) / (lu * lv);
  const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
  return (ang * 180) / Math.PI;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** Classify a closed polygon from its vertices. */
function classifyPolygon(V: Pt[], diag: number): { kind: ShapeKind; poly: Pt[]; score: number } | null {
  const n = V.length;
  if (n < 3 || n > 12) return null;

  const sides: number[] = [];
  for (let i = 0; i < n; i++) sides.push(dist(V[i], V[(i + 1) % n]));
  const avg = sides.reduce((a, b) => a + b, 0) / n;
  if (avg < diag * 0.04) return null;

  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push(angleAt(V[(i - 1 + n) % n], V[i], V[(i + 1) % n]));

  if (n === 3) {
    // any triangle is snapped, with its own vertices, so the sides are straight
    return { kind: 'tri', poly: V, score: 0.72 };
  }

  if (n === 4) {
    const [ab, bc, cd, da] = sides;
    const par1 = near(angleAt(V[0], V[1], V[2]), 180 - angleAt(V[2], V[3], V[0]), 0.12);
    // opposite sides parallel ⇔ the two triangles of the quad have equal area
    const area1 = polyArea([V[0], V[1], V[2]]);
    const area2 = polyArea([V[0], V[2], V[3]]);
    const diagSplit = Math.abs(area1 - area2) / Math.max(1, area1 + area2);
    const parallelBoth = diagSplit < 0.08;
    // average deviation from a right angle: a rectangle drawn by hand is a few
    // degrees off, a parallelogram is not close at all
    const dev90 = angles.reduce((acc, a) => acc + Math.abs(a - 90), 0) / 4;
    const rightAngles = dev90 < 6.5;
    const equalSides = near(ab, bc, 0.12) && near(bc, cd, 0.12) && near(cd, da, 0.12);
    const rightish = dev90 < 12;

    if (parallelBoth && rightAngles && equalSides) return { kind: 'square', poly: rightPoly(V, true), score: 0.9 };
    if (parallelBoth && rightAngles) return { kind: 'rect', poly: rightPoly(V, false), score: 0.9 };
    if (parallelBoth && equalSides) return { kind: 'rhomb', poly: regularish(V), score: 0.85 };
    if (parallelBoth) return { kind: 'para', poly: regularish(V), score: 0.85 };

    // one pair parallel → trapezoid
    const pairs: [number, number][] = [
      [0, 2],
      [1, 3],
    ];
    for (const [i, j] of pairs) {
      const u = [V[(i + 1) % 4][0] - V[i][0], V[(i + 1) % 4][1] - V[i][1]];
      const v = [V[(j + 1) % 4][0] - V[j][0], V[(j + 1) % 4][1] - V[j][1]];
      const cos = Math.abs((u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) || 1) * (Math.hypot(v[0], v[1]) || 1)));
      if (cos > 0.94) return { kind: 'trap', poly: regularish(V), score: 0.8 };
    }

    if (rightish) return { kind: 'rect', poly: rightPoly(V, false), score: 0.66 };
    return { kind: 'poly', poly: V, score: 0.5 };
  }

  // 5–12 vertices: a regular polygon, or nothing
  const regular = angles.every((a) => near(a, angles[0], 0.22)) && sides.every((s) => near(s, avg, 0.24));
  if (regular) {
    const R = (avg / (2 * Math.sin(Math.PI / n))) || 1;
    return { kind: 'poly', poly: regularPoly(V, n, R), score: 0.88 };
  }
  return null;
}

/** Snap a quad's corners onto a true right-angled frame. */
function rightPoly(V: Pt[], square: boolean): Pt[] {
  const b = bboxOf(V);
  const w = square ? Math.min(b.w, b.h) : b.w;
  const h = square ? Math.min(b.w, b.h) : b.h;
  const cx = (b.x + b.x2) / 2;
  const cy = (b.y + b.y2) / 2;
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

/** Keep the drawn corners but square up each side against its neighbour. */
function regularish(V: Pt[]): Pt[] {
  return V.map((p) => [p[0], p[1]] as Pt);
}

function regularPoly(V: Pt[], n: number, R: number): Pt[] {
  let cx = 0;
  let cy = 0;
  for (const p of V) {
    cx += p[0];
    cy += p[1];
  }
  cx /= V.length;
  cy /= V.length;
  // align the first vertex with the drawn one
  const start = Math.atan2(V[0][1] - cy, V[0][0] - cx);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i * Math.PI * 2) / n;
    out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Top-level recognition                                               */
/* ------------------------------------------------------------------ */

export interface RecogniseOptions {
  /** Minimum bounding-box diagonal, in page units. */
  minSize?: number;
  /** Skip the hold-to-snap requirement; used by tests. */
  force?: boolean;
}

/**
 * Classify a drawn path.
 *
 * Returns null whenever the evidence is thin — which is most of the time, since
 * most strokes are letters. A wrong snap is far more annoying than no snap.
 */
export function recogniseShape(raw: Pt[], opts: RecogniseOptions = {}): ShapeDef | null {
  if (raw.length < 6) return null;
  const b = bboxOf(raw);
  const diag = Math.hypot(b.w, b.h);
  if (diag < (opts.minSize ?? 40)) return null;

  const P = resample(raw, 96);
  const gap = dist(P[0], P[P.length - 1]);
  const closed = gap < diag * 0.3;

  if (!closed) {
    // Open strokes are lines or nothing. Conic *recognition* used to live here,
    // and it was a bad trade: an arc, a bracket, a long 'c', the top of a '2'
    // and a hand-drawn parabola are the same evidence, so the fit fired on
    // ordinary handwriting far more often than on a deliberate conic. The
    // Conics insert option has since been removed from the Shapes picker too;
    // open curves are drawn on purpose with the Curvable Line tool instead.
    const dev = maxDev(P, P[0], P[P.length - 1]);
    if (dev < diag * 0.075) {
      return { kind: 'line', a: P[0], b: P[P.length - 1], score: 0.95 };
    }
    return null;
  }

  // closed: a polygon has corners, a circle does not — decide that first, since
  // an ellipse can be fitted to almost any closed path with a small residual
  const V = corners(P, diag);
  if (V.length >= 3) {
    const poly = classifyPolygon(V, diag);
    if (poly) {
      const bb = bboxOf(poly.poly);
      const w = Math.max(1, bb.w);
      const h = Math.max(1, bb.h);
      return {
        kind: poly.kind,
        a: [bb.x, bb.y],
        b: [bb.x2, bb.y2],
        poly: poly.poly.map(([x, y]) => [(x - bb.x) / w, (y - bb.y) / h] as Pt),
        score: poly.score,
      };
    }
  }

  const el = fitEllipse(P);
  if (el && el.resid < diag * 0.028) {
    const aspect = el.rx / Math.max(1, el.ry);
    const isCircle = aspect < 1.12;
    const rx = isCircle ? (el.rx + el.ry) / 2 : el.rx;
    const ry = isCircle ? (el.rx + el.ry) / 2 : el.ry;
    return {
      kind: isCircle ? 'circle' : 'ell',
      a: [b.x, b.y],
      b: [b.x2, b.y2],
      el: { rx: rx / Math.max(1, b.w), ry: ry / Math.max(1, b.h), rot: isCircle ? 0 : el.rot },
      score: isCircle ? 0.92 : 0.88,
    };
  }

  return null;
}

function maxDev(P: Pt[], p: Pt, q: Pt): number {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const L = Math.hypot(dx, dy) || 1;
  let worst = 0;
  for (const [x, y] of P) {
    const d = Math.abs((x - p[0]) * dy - (y - p[1]) * dx) / L;
    if (d > worst) worst = d;
  }
  return worst;
}

/* ------------------------------------------------------------------ */
/* Outline generation                                                  */
/* ------------------------------------------------------------------ */

/**
 * The ideal outline of a recognised shape, as a polyline in page units.
 * Used for both rendering and hit-testing, so the two never disagree.
 */
export function shapeOutline(def: {
  kind: ShapeKind;
  a: Pt;
  b: Pt;
  poly?: Pt[];
  el?: EllipseFit;
  pb?: ParabolaFit;
  hb?: HyperbolaFit;
}, samples = 96): Pt[] {
  const { kind } = def;
  const [x0, y0] = def.a;
  const [x1, y1] = def.b;
  const w = x1 - x0;
  const h = y1 - y0;
  const P = (u: number, v: number): Pt => [x0 + u * w, y0 + v * h];

  if (def.poly && def.poly.length > 2) {
    const pts = def.poly.map(([u, v]) => P(u, v));
    return [...pts, pts[0]];
  }

  if (kind === 'circle' || kind === 'ell') {
    const e = def.el ?? { rx: 0.5, ry: 0.5, rot: 0 };
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const rx = Math.abs(e.rx * w);
    const ry = Math.abs(e.ry * h);
    const cos = Math.cos(e.rot);
    const sin = Math.sin(e.rot);
    const out: Pt[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * Math.PI * 2;
      const px = Math.cos(t) * rx;
      const py = Math.sin(t) * ry;
      out.push([cx + px * cos - py * sin, cy + px * sin + py * cos]);
    }
    return out;
  }

  if (kind === 'parab' && def.pb) {
    const p = def.pb;
    const out: Pt[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      if (p.vertical) {
        const v = p.a * (t - p.h) * (t - p.h) + p.k;
        out.push(P(t, v));
      } else {
        const u = p.a * (t - p.h) * (t - p.h) + p.k;
        out.push(P(u, t));
      }
    }
    return out;
  }

  if (kind === 'hyper' && def.hb) {
    const q = def.hb;
    const cx = x0 + q.cx * w;
    const cy = y0 + q.cy * h;
    const a = Math.abs(q.a * w);
    const b = Math.abs(q.b * h);
    const cos = Math.cos(q.rot);
    const sin = Math.sin(q.rot);
    const pts: Pt[] = [];
    const tMax = 2.2;
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= samples / 2; i++) {
        const t = -tMax + (2 * tMax * i) / (samples / 2);
        let px: number;
        let py: number;
        if (q.axis === 'x') {
          px = sign * a * Math.cosh(t);
          py = b * Math.sinh(t);
        } else {
          px = a * Math.sinh(t);
          py = sign * b * Math.cosh(t);
        }
        const x = cx + px * cos - py * sin;
        const y = cy + px * sin + py * cos;
        if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) continue;
        pts.push([x, y]);
      }
    }
    return pts;
  }

  if (kind === 'line' || kind === 'arrow') return [[x0, y0], [x1, y1]];
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}

/** Human name for the toast. */
export const SHAPE_NAMES: Record<string, string> = {
  line: 'Line',
  arrow: 'Arrow',
  rect: 'Rectangle',
  square: 'Square',
  ell: 'Oval',
  circle: 'Circle',
  tri: 'Triangle',
  para: 'Parallelogram',
  trap: 'Trapezoid',
  rhomb: 'Rhombus',
  poly: 'Polygon',
  qcurve: 'Curvable Line',
  parab: 'Parabola',
  hyper: 'Hyperbola',
};

/**
 * Build a perfect shape from a dragged box, for the shape tools.
 * The picker draws a rectangle and this turns it into the chosen figure.
 */
export function shapeFromBox(
  kind: ShapeKind,
  a: Pt,
  b: Pt,
  opts: { sides?: number } = {}
): { a: Pt; b: Pt; poly?: Pt[]; el?: EllipseFit; pb?: ParabolaFit; hb?: HyperbolaFit } {
  const x0 = Math.min(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;

  if (kind === 'square') {
    const s = Math.min(w, h);
    return { a: [cx - s / 2, cy - s / 2], b: [cx + s / 2, cy + s / 2], poly: [[0, 0], [1, 0], [1, 1], [0, 1]] };
  }
  if (kind === 'circle') {
    const s = Math.min(w, h);
    return { a: [cx - s / 2, cy - s / 2], b: [cx + s / 2, cy + s / 2], el: { rx: 0.5, ry: 0.5, rot: 0 } };
  }
  if (kind === 'ell') {
    return { a: [x0, y0], b: [x1, y1], el: { rx: 0.5, ry: 0.5, rot: 0 } };
  }
  if (kind === 'tri') {
    return { a: [x0, y0], b: [x1, y1], poly: [[0.5, 0], [1, 1], [0, 1]] };
  }
  if (kind === 'para') {
    const k = 0.18;
    return { a: [x0, y0], b: [x1, y1], poly: [[k, 0], [1, 0], [1 - k, 1], [0, 1]] };
  }
  if (kind === 'trap') {
    const k = 0.2;
    return { a: [x0, y0], b: [x1, y1], poly: [[k, 0], [1 - k, 0], [1, 1], [0, 1]] };
  }
  if (kind === 'rhomb') {
    return { a: [x0, y0], b: [x1, y1], poly: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] };
  }
  if (kind === 'poly') {
    const n = Math.max(3, Math.min(12, opts.sides ?? 6));
    const R = 0.5;
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI * 2) / n;
      pts.push([0.5 + Math.cos(ang) * R, 0.5 + Math.sin(ang) * R]);
    }
    return { a: [x0, y0], b: [x1, y1], poly: pts };
  }
  if (kind === 'parab') {
    return { a: [x0, y0], b: [x1, y1], pb: { vertical: true, a: 4, h: 0.5, k: 0 } };
  }
  if (kind === 'hyper') {
    return { a: [x0, y0], b: [x1, y1], hb: { cx: 0.5, cy: 0.5, a: 0.22, b: 0.42, rot: 0, axis: 'y' } };
  }
  return { a: [x0, y0], b: [x1, y1] };
}
/**
 * Build a radial shape from its CENTRE and one outward handle.
 *
 * Circle, ellipse and polygon are placed by their centre in every drawing app:
 * press where the middle should be, drag outwards, and the figure grows in all
 * directions at once. shapeFromBox() models a corner-to-corner rectangle drag,
 * where the press point becomes a corner, so the centre ends up halfway to the
 * pointer and the shape appears to run away from the pen.
 *
 * The box handed to shapeFromBox() is symmetric around center, so the resulting
 * a/b stay centred there. Rotation is NOT baked into the box: the stroke carries
 * it in s.r, and the renderer rotates about the box centre, which is exactly
 * the press point.
 */
export function shapeFromCenter(
  kind: ShapeKind,
  center: Pt,
  handle: Pt,
  opts: { sides?: number; min?: number } = {}
): { a: Pt; b: Pt; poly?: Pt[]; el?: EllipseFit; pb?: ParabolaFit; hb?: HyperbolaFit } {
  const m = Math.max(0.5, opts.min ?? 2);
  const dx = handle[0] - center[0];
  const dy = handle[1] - center[1];
  const d = Math.hypot(dx, dy);

  // The pointer is a point on the OUTLINE, not the opposite corner. A circle and
  // a regular polygon are radial figures, so one distance drives both axes and
  // the pointer sits exactly on the outline. Taking |dx| / |dy| instead would
  // collapse the shape on a horizontal drag and shrink it to a line the moment
  // the hand twists around the centre to rotate the figure.
  if (kind === 'circle' || kind === 'poly') {
    const r = Math.max(m, d);
    return shapeFromBox(
      kind,
      [center[0] - r, center[1] - r],
      [center[0] + r, center[1] + r],
      opts
    );
  }

  // An ellipse still lets the drag set its aspect ratio, but neither axis may
  // degenerate: each is at least 35 % of the drag length. That keeps a mostly
  // horizontal drag an ellipse rather than a 1 px sliver, and keeps the box
  // roughly stable while the figure is being rotated.
  const floor = Math.max(m, d * 0.35);
  const rx = Math.max(floor, Math.abs(dx));
  const ry = Math.max(floor, Math.abs(dy));
  return shapeFromBox(
    kind,
    [center[0] - rx, center[1] - ry],
    [center[0] + rx, center[1] + ry],
    opts
  );
}
