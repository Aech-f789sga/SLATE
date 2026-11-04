/**
 * Shapes — GoodNotes' "draw it and hold" plus fill, opacity and a third kind.
 *
 * The engine already renders `{t:'shape', k:'line'|'rect'|'ell'|'arrow'|…}`
 * strokes with a dashed option, so nothing here re-implements the outline. Two
 * gaps are filled instead:
 *
 *   1. Recognition — a hand-drawn stroke that ends in a pause is analysed and
 *      swapped for a clean line / rectangle / oval / triangle.
 *   2. Fill — a shape can carry `fc` (colour) and `fop` (opacity), painted
 *      underneath the engine's own outline by wrapping `shp()`.
 *
 * Both live behind a small floating panel that appears with the shape tools.
 */

import {
  recogniseShape,
  shapeFromBox,
  shapeOutline,
  SHAPE_NAMES,
  type Pt as GeoPt,
  type ShapeKind as GeoKind,
} from './shapes-geometry';

/* ------------------------------------------------------------------ */
/* Engine access                                                       */
/* ------------------------------------------------------------------ */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

function el(tag: string, css?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

type Pt = [number, number];

interface ShapeOut {
  k: string;
  a: Pt;
  b: Pt;
  pts?: Pt[];
  poly?: Pt[];
  el?: any;
  pb?: any;
  hb?: any;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

function dist(p: Pt, q: Pt): number {
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
}

function bboxOf(pts: Pt[]) {
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

/** Evenly spaced resample, so every measure below is scale-free. */
function resample(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = [pts[0]];
  const total: number[] = [0];
  for (let i = 1; i < pts.length; i++) total.push(total[i - 1] + dist(pts[i - 1], pts[i]));
  const len = total[total.length - 1];
  if (len < 1) return [pts[0], pts[pts.length - 1]];
  const step = len / (n - 1);
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

/** Largest perpendicular distance from the chord p→q. */
function maxDeviation(pts: Pt[], p: Pt, q: Pt): number {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const L = Math.hypot(dx, dy) || 1;
  let worst = 0;
  for (const [x, y] of pts) {
    const d = Math.abs((x - p[0]) * dy - (y - p[1]) * dx) / L;
    if (d > worst) worst = d;
  }
  return worst;
}

/** Turning angles over the resampled path, counted as corners. */
function cornerCount(P: Pt[]): number {
  const n = P.length;
  let count = 0;
  const win = 4;
  for (let i = win; i < n - win; i++) {
    const a = P[i - win];
    const b = P[i];
    const c = P[i + win];
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    const lu = Math.hypot(u[0], u[1]) || 1;
    const lv = Math.hypot(v[0], v[1]) || 1;
    const cos = (u[0] * v[0] + u[1] * v[1]) / (lu * lv);
    const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (ang > 42) {
      // require a local maximum so one corner is not counted many times
      let peak = true;
      for (let j = Math.max(win, i - win); j <= Math.min(n - win - 1, i + win); j++) {
        if (j === i) continue;
        const aa = P[j - win];
        const bb = P[j];
        const cc = P[j + win];
        const uu = [bb[0] - aa[0], bb[1] - aa[1]];
        const vv = [cc[0] - bb[0], cc[1] - bb[1]];
        const luu = Math.hypot(uu[0], uu[1]) || 1;
        const lvv = Math.hypot(vv[0], vv[1]) || 1;
        const cs = (uu[0] * vv[0] + uu[1] * vv[1]) / (luu * lvv);
        const ag = (Math.acos(Math.max(-1, Math.min(1, cs))) * 180) / Math.PI;
        if (ag > ang) {
          peak = false;
          break;
        }
      }
      if (peak) count++;
    }
  }
  return count;
}

/** Shoelace area of a closed path, used as a scale-free shape signature. */
function polyArea(P: Pt[]): number {
  let a = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[(i + 1) % P.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/**
 * Classify a drawn path. Returns null when nothing convincing was found, which
 * is the common case — most pen strokes are handwriting, not shapes.
 *
 * The closed-shape test leans on area-over-bounding-box: a rectangle fills it,
 * an oval fills π/4 of it, a triangle fills half. That single number separates
 * the three far more reliably than counting corners on a shaky hand line.
 */
function recognise(raw: Pt[]): ShapeOut | null {
  const geo = recogniseShape(raw as GeoPt[], { minSize: 44 });
  if (!geo) return null;
  return {
    k: geo.kind,
    a: geo.a,
    b: geo.b,
    poly: geo.poly,
    el: geo.el,
    pb: geo.pb,
    hb: geo.hb,
  };
}

/* ------------------------------------------------------------------ */
/* Renderer hook                                                       */
/* ------------------------------------------------------------------ */

const FILLS = ['#f5c542', '#7bd88f', '#7cc4ff', '#f28ab2', '#c3a6ff', '#d9dde3'];

/** Solid, ruled dash, or dotted — the three a GoodNotes line offers. */
type Dash = 'solid' | 'dash' | 'dot';

const style = {
  fill: null as string | null,
  opacity: 0.35,
  dash: 'solid' as Dash,
  recognise: true,
  axis: ['#e5383b', '#2a9d4f', '#2f6df6'] as string[],
};

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

function loadStyle() {
  const raw = lsGet('inkpad-shape-style');
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      if (s.fill === null || typeof s.fill === 'string') style.fill = s.fill;
      if (typeof s.opacity === 'number') style.opacity = Math.max(0.05, Math.min(1, s.opacity));
      // `dashed` is the older boolean; keep reading it so a saved toolbar keeps working
      if (s.dash === 'dash' || s.dash === 'dot' || s.dash === 'solid') style.dash = s.dash;
      else if (s.dashed === true) style.dash = 'dash';
      if (typeof s.recognise === 'boolean') style.recognise = s.recognise;
      if (Array.isArray(s.axis) && s.axis.length === 3) {
        style.axis = s.axis.map((c: unknown, i: number) =>
          typeof c === 'string' ? c : ['#e5383b', '#2a9d4f', '#2f6df6'][i]
        );
      }
    }
  } catch {
    /* ignore */
  }
}

function saveStyle() {
  lsSet(
    'inkpad-shape-style',
    JSON.stringify({
      fill: style.fill,
      opacity: style.opacity,
      dash: style.dash,
      recognise: style.recognise,
      axis: style.axis,
    })
  );
}

/** Read the engine's live axis palette (it owns the default and the rendering). */
function engineAxes(): string[] {
  const a = ev<string[]>('axc');
  return Array.isArray(a) && a.length === 3 ? a.slice() : ['#e5383b', '#2a9d4f', '#2f6df6'];
}

/** Push our saved palette into the engine, which is what new axes read from. */
function pushAxes() {
  const a = style.axis;
  ev(
    `(function(){ try{ axc[0]=${JSON.stringify(a[0])}; axc[1]=${JSON.stringify(a[1])}; axc[2]=${JSON.stringify(a[2])}; }catch(e){} })()`
  );
}

function setAxis(i: number, hex: string) {
  style.axis[i] = hex;
  saveStyle();
  ev(`(function(){ try{ axc[${i}] = ${JSON.stringify(hex)}; }catch(e){} })()`);
  const sel = (ev<any[]>('sel') || []).filter(
    (s) => s && s.t === 'shape' && (s.k === 'ax2' || s.k === 'ax3')
  );
  if (sel.length) {
    sel.forEach((s) => {
      const base = Array.isArray(s.ac) && s.ac.length === 3 ? s.ac.slice() : engineAxes();
      base[i] = hex;
      s.ac = base;
    });
    repaint();
  }
  paint();
}

/** Put the dash mode onto a shape stroke in the form the renderer reads. */
function applyDash(s: any) {
  if (style.dash === 'solid') {
    delete s.ds;
    delete s.dm;
    return;
  }
  s.ds = true;
  s.dm = style.dash;
}

/**
 * Wrap `shp` so filled shapes get their wash painted before the engine draws
 * the outline, and so the triangle kind renders at all.
 */
function installShapeEngine() {
  // the renderer calls back into this module, so hand it the real functions
  (window as any).__shapeOutline = (s: any) =>
    shapeOutline(
      {
        kind: s.k,
        a: s.a,
        b: s.b,
        poly: s.poly,
        el: s.el,
        pb: s.pb,
        hb: s.hb,
      },
      120
    );

  ev(`(function(){
    if (window.__gnShapeHooked) return;
    window.__gnShapeHooked = true;

    var S = window.__gnShape || (window.__gnShape = {});
    var origShp = shp;
    var origPts = shapePts;
    var origDraw = draw;

    // The engine paints the in-flight stroke from the tool alone, so a circle
    // picked in the picker would preview as the rectangle it is built from.
    // Rewrite the live stroke just before each paint instead.
    draw = function(){
      try { window.__gnPreviewCur && window.__gnPreviewCur(); } catch (e) {}
      return origDraw.apply(this, arguments);
    };

    function isCustom(s){
      return !!(s && s.t === 'shape' && (s.poly || s.el || s.pb || s.hb));
    }
    S.isCustom = isCustom;

    shapePts = function(s){
      if (isCustom(s)) {
        var P = window.__shapeOutline(s);
        if (P && P.length > 1) return P;
      }
      return origPts.apply(this, arguments);
    };

    function trace(c, P, smooth){
      c.beginPath();
      c.moveTo(P[0][0], P[0][1]);
      if (smooth && P.length > 4) {
        for (var i = 1; i < P.length - 1; i++) {
          var mx = (P[i][0] + P[i+1][0]) / 2, my = (P[i][1] + P[i+1][1]) / 2;
          c.quadraticCurveTo(P[i][0], P[i][1], mx, my);
        }
        c.lineTo(P[P.length-1][0], P[P.length-1][1]);
      } else {
        for (var j = 1; j < P.length; j++) c.lineTo(P[j][0], P[j][1]);
      }
    }

    shp = function(c, s){
      if (!isCustom(s)) return origShp.apply(this, arguments);

      var P = window.__shapeOutline(s);
      if (!P || P.length < 2) return origShp.apply(this, arguments);

      var closed = !!s.poly || s.k === 'circle' || s.k === 'ell';
      var smooth = s.k === 'circle' || s.k === 'ell' || s.k === 'parab' || s.k === 'hyper' || !!s.el;

      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';

      if (closed && s.fc) {
        c.globalAlpha = Math.max(0.04, Math.min(1, s.fop == null ? 1 : s.fop));
        c.fillStyle = s.fc;
        trace(c, P, smooth);
        c.closePath();
        c.fill();
        c.globalAlpha = 1;
      }

      c.strokeStyle = s.c;
      c.lineWidth = s.w;
      if (s.ds) {
        if (s.dm === 'dot') {
          c.lineCap = 'round';
          c.setLineDash([0.1, Math.max(5, s.w * 2.8)]);
        } else {
          c.lineCap = 'butt';
          c.setLineDash([Math.max(7, s.w * 4), Math.max(6, s.w * 3)]);
        }
      }
      trace(c, P, smooth);
      if (closed) c.closePath();
      c.stroke();
      c.restore();
    };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Recognition hook                                                    */
/* ------------------------------------------------------------------ */

const HOLD_MS = 420;

/** Movement under this still counts as holding still — a hand is never frozen. */
const JITTER = 2.6;

/** Never let a resize collapse below this, or the engine drops the stroke. */
const MIN_BOX = 10;

let lastRun: any = null;

let path: Pt[] = [];
let drawing = false;
let shapePending = false;
let holdTimer = 0;
let strokesBefore = 0;

/**
 * The shape a hold produced, while the finger is still down.
 *
 * Keeping the anchor and the normalised outline means a drag after the snap is
 * a resize rather than a new stroke: the outline scales with the box, so the
 * user can place the shape before lifting.
 */
interface Snap {
  kind: string;
  anchor: Pt;
  target: Pt;
  line: boolean;
  norm: { poly?: Pt[]; el?: any; pb?: any; hb?: any };
}
let snap: Snap | null = null;
/** Carried from pointerup to the deferred fix-up, once `snap` is cleared. */
let pendingSnap: Snap | null = null;

/** Raw drag box for the shape tool, tracked before the engine normalises it. */
let rawA: Pt | null = null;
let rawB: Pt | null = null;

/** Previous pointer position, used to tell a hold from a slow drag. */
let prevPoint: Pt | null = null;

function canvasEl(): HTMLCanvasElement | null {
  return document.getElementById('cv') as HTMLCanvasElement | null;
}

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

function toPage(e: PointerEvent, cv: HTMLCanvasElement): Pt {
  const r = cv.getBoundingClientRect();
  // strokes are stored in page units (0…W, 0…H), not in backing-store pixels
  const W = ev<number>('W') || cv.width;
  const H = ev<number>('H') || cv.height;
  return [((e.clientX - r.left) / (r.width || 1)) * W, ((e.clientY - r.top) / (r.height || 1)) * H];
}

function hookRecognition() {
  const cv = canvasEl();
  if (!cv || (cv as any).__gnShapeHook) return;
  (cv as any).__gnShapeHook = true;

  cv.addEventListener(
    'pointerdown',
    (e) => {
      snap = null;
      if (!style.recognise) return;
      if (ev<string>('tool') !== 'pen') return;
      drawing = true;
      path = [toPage(e, cv)];
      prevPoint = path[0];
      strokesBefore = (ev<any[]>('pg().strokes') || []).length;
      armHold();
    },
    true
  );

  cv.addEventListener(
    'pointermove',
    (e) => {
      if (!drawing) return;
      const p = toPage(e, cv);
      if (snap) {
        resizeTo(p);
        return;
      }
      const last = path[path.length - 1];
      if (!last || dist(last, p) > 1.5) path.push(p);
      // Restart the clock only on real movement, measured against the previous
      // pointer position. Comparing against the last accepted point instead
      // means a slow hand keeps resetting the timer and nothing ever snaps.
      if (!prevPoint || dist(prevPoint, p) > JITTER) armHold();
      prevPoint = p;
    },
    true
  );

  const finish = () => {
    window.clearTimeout(holdTimer);
    if (!drawing && !shapePending) return;
    if (drawing) {
      drawing = false;
      const pts = path;
      const wasSnapped = !!snap;
      pendingSnap = snap;
      snap = null;
      path = [];
      if (wasSnapped) {
        window.setTimeout(finaliseSnap, 0);
        return;
      }
      if (!style.recognise) return;
      // The engine turns any large closed loop into an oval on release. Run the
      // classifier over the same points so a square comes back a square, and
      // fall back to the plain hold test for open strokes.
      const madeOval = (() => {
        const all = ev<any[]>('pg().strokes') || [];
        // a release outside the canvas never reaches the engine, so the last
        // stroke would be somebody else's
        if (all.length <= strokesBefore) return false;
        const s = all[all.length - 1];
        return !!s && s.t === 'shape' && s.k === 'ell';
      })();
      if (pts.length >= 8 && (madeOval || performance.now() - lastMove > HOLD_MS)) {
        window.setTimeout(() => commit(pts), 0);
      }
      return;
    }
    // a shape tool gesture — stamp the current fill/dash onto it
    shapePending = false;
    window.setTimeout(stampStyle, 0);
  };

  // shape tools need the same post-gesture pass, without any recognition
  cv.addEventListener(
    'pointerdown',
    () => {
      shapePending = toolIsShape();
    },
    true
  );

  window.addEventListener('pointerup', finish, false);
  window.addEventListener('pointercancel', finish, false);
}

/* ------------------------------------------------------------------ */
/* Hold, snap, resize                                                  */
/* ------------------------------------------------------------------ */

let lastMove = 0;

/**
 * Track the raw drag box for the shape tool.
 *
 * Listeners sit on `document` in the capture phase, which runs before anything
 * the engine listens to on the canvas — so the box is always current by the
 * time the paint happens, with no one-frame lag.
 */
function hookShapePreview() {
  const cv = canvasEl();
  if (!cv) return;

  document.addEventListener(
    'pointerdown',
    (e) => {
      rawA = null;
      rawB = null;
      if (!forced || !toolIsShape()) return;
      const p = toPage(e as PointerEvent, cv);
      rawA = p;
      rawB = p;
    },
    true
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      if (!rawA) return;
      rawB = toPage(e as PointerEvent, cv);
    },
    true
  );

  const clear = () => window.setTimeout(() => ((rawA = null), (rawB = null)), 40);
  document.addEventListener('pointerup', clear, true);
  document.addEventListener('pointercancel', clear, true);

  (window as any).__gnPreviewCur = () => {
    const cur = ev<any>('cur');
    if (!cur) return;

    // A hold that has snapped owns the stroke: the engine keeps writing the
    // raw pointer into `cur.b` on every move, so the geometry is re-applied
    // here, at paint time, where nothing can overwrite it afterwards.
    if (snap) {
      const [a, b] = snapBox();
      cur.t = 'shape';
      cur.k = snap.kind;
      cur.a = a;
      cur.b = b;
      setDerived(cur, snap.norm);
      return;
    }

    if (cur.t !== 'shape' || !forced || !rawA || !rawB) return;
    const geo = shapeFromBox(forced as GeoKind, rawA, rawB, { sides: polySides });
    cur.k = forced;
    cur.a = geo.a;
    cur.b = geo.b;
    setDerived(cur, geo);
  };
}

/** The box a snapped shape should occupy, from its fixed corner and the finger. */
function snapBox(): [Pt, Pt] {
  if (!snap) return [[0, 0], [0, 0]];
  const [ax, ay] = snap.anchor;
  const [px, py] = snap.target;

  if (snap.line) return [snap.anchor, snap.target];

  let dx = px - ax;
  let dy = py - ay;
  // a circle or square keeps its proportions while you drag the corner
  if (snap.kind === 'circle' || snap.kind === 'square') {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  if (Math.abs(dx) < MIN_BOX) dx = (dx < 0 ? -1 : 1) * MIN_BOX;
  if (Math.abs(dy) < MIN_BOX) dy = (dy < 0 ? -1 : 1) * MIN_BOX;

  return [
    [Math.min(ax, ax + dx), Math.min(ay, ay + dy)],
    [Math.max(ax, ax + dx), Math.max(ay, ay + dy)],
  ];
}

function armHold() {
  lastMove = performance.now();
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(trySnap, HOLD_MS);
}

function trySnap() {
  if (!drawing || snap) return;
  const pts = path;
  if (pts.length < 8) return;
  const shape = recognise(pts);
  if (!shape) return;
  beginSnap(shape);
}

/** Turn the live pen stroke into the recognised shape, still under the finger. */
function beginSnap(shape: ShapeOut) {
  const line = shape.k === 'line' || shape.k === 'arrow';
  const b = boxOf(shape.a, shape.b);
  const tip = path[path.length - 1] || shape.b;

  // The corner you are not holding becomes the pivot, so a drag grows the shape
  // away from it — the way a selection handle behaves everywhere else.
  const anchor: Pt = line
    ? shape.a
    : [tip[0] > (b.x + b.x2) / 2 ? b.x : b.x2, tip[1] > (b.y + b.y2) / 2 ? b.y : b.y2];

  snap = {
    kind: shape.k,
    anchor,
    target: line ? shape.b : tip,
    line,
    norm: { poly: shape.poly, el: shape.el, pb: shape.pb, hb: shape.hb },
  };
  ev('try{ draw(); }catch(e){}');
  flash(shape.k);
}

function resizeTo(p: Pt) {
  if (!snap) return;
  snap.target = p;
  ev('try{ draw(); }catch(e){}');
}

/** The engine copies only k/a/b on release, so put the outline back. */
function finaliseSnap() {
  const sn = pendingSnap;
  pendingSnap = null;
  if (!sn || !editorOpen()) return;
  const strokes = ev<any[]>('pg().strokes') || [];
  if (strokes.length <= strokesBefore) return;
  const s = strokes[strokes.length - 1];
  if (!s || s.t !== 'shape') return;
  setDerived(s, sn.norm);
  applyStyle(s, false);
  ev('try{ draw(); save(); thumbs(); }catch(e){}');
}

function boxOf(a: Pt, b: Pt) {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    x2: Math.max(a[0], b[0]),
    y2: Math.max(a[1], b[1]),
  };
}

function setDerived(target: any, norm: { poly?: Pt[]; el?: any; pb?: any; hb?: any }) {
  delete target.poly;
  delete target.el;
  delete target.pb;
  delete target.hb;
  if (norm.poly) target.poly = norm.poly;
  if (norm.el) target.el = norm.el;
  if (norm.pb) target.pb = norm.pb;
  if (norm.hb) target.hb = norm.hb;
}

/**
 * The engine builds shape strokes from the tool alone, so fill and dash are
 * applied here once the stroke exists — and a derived kind (circle, triangle,
 * polygon…) gets its real outline back, which the engine drops on release.
 */
function stampStyle() {
  if (!editorOpen()) return;
  const strokes = ev<any[]>('pg().strokes');
  if (!strokes || !strokes.length) return;
  const s = strokes[strokes.length - 1];
  if (!s || s.t !== 'shape') return;
  applyStyle(s, !!forced);
}

function applyStyle(s: any, geometry: boolean) {
  let changed = false;

  // The picker keeps its selection, so every stroke with that kind selected is
  // rebuilt from its box: the box is the authority, the outline is normalised
  // inside it, which is what makes a drag a resize rather than a redraw.
  if (geometry && forced) {
    const geo = shapeFromBox(forced as GeoKind, s.a, s.b, { sides: polySides });
    s.k = forced;
    s.a = geo.a;
    s.b = geo.b;
    setDerived(s, geo);
    changed = true;
  }

  if (style.fill && (s.k === 'rect' || s.k === 'ell' || s.k === 'tri' || s.poly || s.el)) {
    s.fc = style.fill;
    s.fop = style.opacity;
    changed = true;
  }
  if (style.dash !== 'solid' && (s.dm !== style.dash || !s.ds)) {
    applyDash(s);
    changed = true;
  }
  if (changed) ev('try{ draw(); save(); thumbs(); }catch(e){}');
}

/** Diagnostics for one classified path — used by the harness, harmless otherwise. */
function metricsOf(raw: Pt[]) {
  const b = bboxOf(raw);
  const diag = Math.hypot(b.w, b.h);
  const P = resample(raw, 64);
  const onEdge =
    P.filter(([x, y]) => {
      const dx = Math.min(Math.abs(x - b.x), Math.abs(x - b.x2));
      const dy = Math.min(Math.abs(y - b.y), Math.abs(y - b.y2));
      return Math.min(dx, dy) < Math.max(7, diag * 0.055);
    }).length / P.length;
  return {
    n: raw.length,
    diag: Math.round(diag),
    ratio: +(polyArea(P) / (b.w * b.h || 1)).toFixed(3),
    onEdge: +onEdge.toFixed(3),
    gap: Math.round(dist(P[0], P[P.length - 1])),
    corners: cornerCount(P),
    box: [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)],
  };
}

/**
 * Refine the stroke the engine just committed.
 *
 * The engine already turns a closed stroke into an oval and a straight one into
 * a line, so the job here is narrower: correct its oval into a rectangle or a
 * triangle when the geometry says so, convert a plain pen stroke that it left
 * alone, and carry the fill / dash style onto the result.
 *
 * The stroke is rewritten in place rather than popped and replaced — the engine
 * still holds a reference to it while it finishes the gesture.
 */
function commit(raw: Pt[]) {
  if (!editorOpen()) return;
  if (ev<string>('tool') !== 'pen') return;

  const shape = recognise(raw);
  lastRun = { metrics: metricsOf(raw), shape };
  if (!shape) return;

  let tries = 0;
  const apply = () => {
    const strokes = ev<any[]>('pg().strokes');
    const s = strokes && strokes.length ? strokes[strokes.length - 1] : null;
    if (!s) {
      // the engine pushes on pointerup, which can land a frame later
      if (++tries < 10) requestAnimationFrame(apply);
      return;
    }
    if (s.t !== 'pen' && s.t !== 'shape') return;
    if (s.t === 'shape' && s.k === shape.k) return;

    const made: any = { ...s };
    delete made.p;
    made.t = 'shape';
    made.k = shape.k;
    made.a = shape.a;
    made.b = shape.b;
    delete made.poly;
    delete made.el;
    delete made.pb;
    delete made.hb;
    if (shape.poly) made.poly = shape.poly;
    if (shape.el) made.el = shape.el;
    if (shape.pb) made.pb = shape.pb;
    if (shape.hb) made.hb = shape.hb;
    made.w = Math.max(2, Math.min(8, s.w || 3));
    made.c = s.c;
    if (style.dash !== 'solid') {
      made.ds = true;
      made.dm = style.dash;
    }
    if (style.fill && shape.k !== 'line' && shape.k !== 'parab' && shape.k !== 'hyper') {
      made.fc = style.fill;
      made.fop = style.opacity;
    }

    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, made);

    ev('try{ draw(); save(); }catch(e){}');
    flash(shape.k);
  };
  requestAnimationFrame(apply);
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

let panel: HTMLElement | null = null;
let hint: HTMLElement | null = null;
let hintTimer = 0;

const SHAPE_TOOLS = [
  'line', 'rect', 'ell', 'arrow', 'hid', 'ax2', 'ax3',
  'tri', 'square', 'circle', 'para', 'trap', 'rhomb', 'poly', 'parab', 'hyper',
];

/** Kinds the engine cannot build itself: they arrive as a rect and are renamed. */
const DERIVED = new Set(['tri', 'square', 'circle', 'para', 'trap', 'rhomb', 'poly', 'parab', 'hyper']);

/** How many sides the polygon tool draws. */
let polySides = 6;

function toolIsShape(): boolean {
  const t = ev<string>('tool');
  return !!t && SHAPE_TOOLS.includes(t);
}

function flash(k: string) {
  if (!hint) return;
  hint.textContent = `${SHAPE_NAMES[k] || 'Shape'} snapped`;
  hint.classList.add('on');
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => hint?.classList.remove('on'), 1100);
}

function buildPanel() {
  if (panel) return;

  panel = el('div', '');
  panel.id = 'ink-shape';

  const fills = el('div', '');
  fills.className = 'sh-fills';

  const none = el('button', '') as HTMLButtonElement;
  none.type = 'button';
  none.className = 'sh-fill sh-none';
  none.title = 'No fill';
  none.onclick = () => setFill(null);
  fills.append(none);

  FILLS.forEach((c) => {
    const b = el('button', '') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'sh-fill';
    b.dataset.fill = c;
    b.title = 'Fill';
    b.style.setProperty('--swc', c);
    b.onclick = () => setFill(c);
    fills.append(b);
  });

  const op = el('input', '') as HTMLInputElement;
  op.type = 'range';
  op.min = '5';
  op.max = '100';
  op.step = '1';
  op.className = 'sh-op';
  op.title = 'Fill opacity';
  op.value = String(Math.round(style.opacity * 100));
  op.oninput = () => {
    style.opacity = Number(op.value) / 100;
    saveStyle();
    repaint();
  };

  // ---- dash: solid / ruled dash / dotted ----------------------------------
  const dashGroup = el('div', '');
  dashGroup.className = 'sh-dash';

  const DASHES: { id: Dash; label: string; tip: string; svg: string }[] = [
    {
      id: 'solid',
      label: 'Solid',
      tip: 'Solid line',
      svg: '<path d="M3 12h18"/>',
    },
    {
      id: 'dash',
      label: 'Dashed',
      tip: 'Clean, evenly ruled dash',
      svg: '<path d="M3 12h4M9.5 12h4M16 12h5"/>',
    },
    {
      id: 'dot',
      label: 'Dotted',
      tip: 'Evenly spaced dots',
      svg: '<path d="M4 12h.01M8.7 12h.01M13.3 12h.01M18 12h.01" stroke-width="3"/>',
    },
  ];

  DASHES.forEach((d) => {
    const b = el('button', '') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'sh-dashb';
    b.dataset.dash = d.id;
    b.title = d.tip;
    b.setAttribute('aria-label', d.label);
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      `stroke-linecap="round">${d.svg}</svg>`;
    b.onclick = () => setDash(d.id);
    dashGroup.append(b);
  });

  const rec = el('button', '', '✨') as HTMLButtonElement;
  rec.type = 'button';
  rec.className = 'sh-tg';
  rec.title = 'Snap hand-drawn shapes';
  rec.onclick = () => {
    style.recognise = !style.recognise;
    saveStyle();
    paint();
  };

  // ---- axis colours (xy / xyz only) ---------------------------------------
  const axis = el('div', '');
  axis.className = 'sh-axis';
  axis.title = 'Axis colours';
  ['X', 'Y', 'Z'].forEach((label, i) => {
    const wrap = el('label', '');
    wrap.className = 'sh-ax';
    const sw = el('input') as HTMLInputElement;
    sw.type = 'color';
    sw.value = style.axis[i];
    sw.title = `${label} axis colour`;
    sw.oninput = () => setAxis(i, sw.value);
    const tag = el('i', '', label);
    wrap.append(sw, tag);
    axis.append(wrap);
  });

  panel.append(fills, op, dashGroup, axis, rec);
  document.body.append(panel);

  hint = el('div', '');
  hint.id = 'ink-shape-hint';
  document.body.append(hint);

  paint();
}

function setDash(mode: Dash) {
  style.dash = mode;
  saveStyle();
  // keep the engine's own dashed flag in step so its drawer agrees
  ev(`(function(){ try{ dashOn = ${mode !== 'solid'}; }catch(e){} })()`);
  const sel = (ev<any[]>('sel') || []).filter((s) => s && s.t === 'shape');
  if (sel.length) {
    sel.forEach((s) => applyDash(s));
    repaint();
  }
  paint();
}

function setFill(c: string | null) {
  style.fill = c;
  saveStyle();
  paint();
  // a shape is already selected? restyle it in place
  const sel = ev<any[]>('sel') || [];
  const shapes = sel.filter((s) => s && s.t === 'shape');
  if (shapes.length) {
    shapes.forEach((s) => {
      if (c && (s.k === 'rect' || s.k === 'ell' || s.k === 'tri')) {
        s.fc = c;
        s.fop = style.opacity;
      } else {
        delete s.fc;
        delete s.fop;
      }
    });
    repaint();
  }
}

function repaint() {
  ev('try{ draw(); save(); }catch(e){}');
}

function paint() {
  if (!panel) return;
  const on = editorOpen() && toolIsShape() && !picker?.classList.contains('on');
  panel.classList.toggle('on', on);

  // the toolbar grows a second row for shape tools, so measure its real bottom
  const tb = document.getElementById('tb');
  const top = tb ? Math.round(tb.getBoundingClientRect().bottom) + 8 : 128;
  panel.style.top = `${top}px`;
  if (hint) hint.style.top = `${top + 46}px`;

  const kind = forced || ev<string>('tool') || '';
  const isAxis = kind === 'ax2' || kind === 'ax3';
  const canFill = kind === 'rect' || kind === 'ell' || kind === 'tri' || kind === 'square' || kind === 'circle' || kind === 'rhomb' || kind === 'para' || kind === 'trap' || kind === 'poly';

  panel.querySelectorAll<HTMLElement>('.sh-fill').forEach((n) => {
    n.classList.toggle('on', (n.dataset.fill ?? null) === style.fill);
  });

  const fills = panel.querySelector<HTMLElement>('.sh-fills');
  const op = panel.querySelector<HTMLElement>('.sh-op');
  if (fills) fills.style.display = canFill ? '' : 'none';
  if (op) op.style.display = canFill ? '' : 'none';

  panel.querySelectorAll<HTMLElement>('.sh-dashb').forEach((n) => {
    n.classList.toggle('on', n.dataset.dash === style.dash);
  });

  const rec = panel.querySelector<HTMLElement>('.sh-tg');
  if (rec) rec.classList.toggle('on', style.recognise);

  const axis = panel.querySelector<HTMLElement>('.sh-axis');
  if (axis) {
    axis.style.display = isAxis ? '' : 'none';
    // a selected axis shape carries its own palette, so show that one
    const picked = (ev<any[]>('sel') || []).filter(
      (s) => s && s.t === 'shape' && (s.k === 'ax2' || s.k === 'ax3')
    );
    const cols =
      picked.length && Array.isArray(picked[0].ac) && picked[0].ac.length === 3
        ? picked[0].ac
        : style.axis;
    axis.querySelectorAll<HTMLInputElement>('input[type=color]').forEach((n, i) => {
      if (n.value !== cols[i]) n.value = cols[i];
    });
  }
}

/* ------------------------------------------------------------------ */
/* Shape picker                                                        */
/* ------------------------------------------------------------------ */

/**
 * The engine's toolbar only surfaces line / rect / oval, but its draw path
 * already handles `arrow`, `ax2` (elbow connector) and `ax3` (curved
 * connector) — they are just unreachable. A picker in the primary row exposes
 * all seven in one popover, which also keeps the choice out of the crowded
 * secondary row where it used to get clipped.
 */
interface ShapeKind {
  id: string;
  label: string;
  svg: string;
}

interface ShapePick {
  id: string;
  label: string;
  svg: string;
  group: 'basic' | 'poly' | 'curve';
}

const KINDS: ShapePick[] = [
  { id: 'line', label: 'Line', group: 'basic', svg: '<path d="M4 19 19 5"/>' },
  { id: 'arrow', label: 'Arrow', group: 'basic', svg: '<path d="M4 19 19 5M19 5h-6M19 5v6"/>' },
  { id: 'rect', label: 'Rectangle', group: 'basic', svg: '<rect x="3.5" y="6" width="17" height="12" rx="1.6"/>' },
  { id: 'square', label: 'Square', group: 'basic', svg: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.4"/>' },
  { id: 'circle', label: 'Circle', group: 'basic', svg: '<circle cx="12" cy="12" r="8"/>' },
  { id: 'ell', label: 'Ellipse', group: 'basic', svg: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>' },
  { id: 'tri', label: 'Triangle', group: 'basic', svg: '<path d="M12 5.5 20 19H4z"/>' },
  { id: 'rhomb', label: 'Rhombus', group: 'basic', svg: '<path d="M12 4 20 12 12 20 4 12z"/>' },
  { id: 'para', label: 'Parallelogram', group: 'basic', svg: '<path d="M7 6h13l-3 12H4z"/>' },
  { id: 'trap', label: 'Trapezoid', group: 'basic', svg: '<path d="M7 6h10l4 12H3z"/>' },
  { id: 'poly', label: 'Polygon', group: 'poly', svg: '<path d="M12 4l7 4v8l-7 4-7-4V8z"/>' },
  { id: 'parab', label: 'Parabola', group: 'curve', svg: '<path d="M4 5c0 9 4 14 8 14s8-5 8-14"/>' },
  { id: 'hyper', label: 'Hyperbola', group: 'curve', svg: '<path d="M5 19c6 0 3-14 7-14M19 5c-6 0-3 14-7 14"/>' },
  { id: 'ax2', label: 'Axes', group: 'basic', svg: '<path d="M4 4v15h16"/><path d="M4 4l-2 3M4 4l3-2M20 19l-3 2M20 19l2-3"/>' },
  { id: 'ax3', label: '3 axes', group: 'basic', svg: '<path d="M12 20V5M12 20l-8-4M12 20l8-4"/><path d="M12 5l-2 3M12 5l2 3"/>' },
  { id: 'hid', label: 'Dashed', group: 'basic', svg: '<path d="M4 12h4M11 12h4M18 12h2"/>' },
];

const GROUPS: { id: 'basic' | 'poly' | 'curve'; title: string }[] = [
  { id: 'basic', title: 'Shapes' },
  { id: 'poly', title: 'Polygons' },
  { id: 'curve', title: 'Conics' },
];

let picker: HTMLElement | null = null;
let pickBtn: HTMLButtonElement | null = null;

/**
 * The engine's draw branch only knows line/rect/ell/arrow/hid/ax2/ax3, so a
 * triangle has to arrive as a rect and be renamed on release. `forced` carries
 * that intent for exactly one stroke.
 */
let forced: string | null = null;

function setTool(t: string) {
  forced = DERIVED.has(t) ? t : null;
  const real = DERIVED.has(t) ? 'rect' : t;
  ev(`try{ tool=${JSON.stringify(real)}; sel=[]; draw(); syncTools(); }catch(e){}`);
  paintPicker();
  paint();
}

function buildPicker() {
  if (picker) return;

  picker = el('div', '');
  picker.id = 'sh-pick';

  for (const g of GROUPS) {
    const head = el('div', '', g.title);
    head.className = 'sh-ph';
    picker.append(head);

    const grid = el('div', '');
    grid.className = 'sh-pg';

    for (const k of KINDS.filter((x) => x.group === g.id)) {
      const b = el('button', '') as HTMLButtonElement;
      b.type = 'button';
      b.className = 'sh-pb';
      b.dataset.kind = k.id;
      b.title = k.label;
      b.innerHTML =
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
        `stroke-linecap="round" stroke-linejoin="round">${k.svg}</svg><span>${k.label}</span>`;
      b.onclick = () => {
        setTool(k.id);
        picker?.classList.remove('on');
      };
      grid.append(b);
    }
    picker.append(grid);

    if (g.id === 'poly') {
      const row = el('div', '');
      row.className = 'sh-sides';
      const lab = el('span', '', 'Sides');
      row.append(lab);
      for (let n = 5; n <= 12; n++) {
        const b = el('button', '', String(n)) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.sides = String(n);
        b.onclick = () => {
          polySides = n;
          paintPicker();
          setTool('poly');
        };
        row.append(b);
      }
      picker.append(row);
    }
  }

  document.body.append(picker);

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest) return;
      if (t.closest('#sh-pick') || t.closest('#sh-trigger')) return;
      picker?.classList.remove('on');
    },
    true
  );
}

function paintPicker() {
  if (!picker) return;
  const t = forced || ev<string>('tool');
  picker.querySelectorAll<HTMLElement>('.sh-pb').forEach((n) => {
    n.classList.toggle('on', n.dataset.kind === t);
  });
  picker.querySelectorAll<HTMLElement>('.sh-sides button').forEach((n) => {
    n.classList.toggle('on', Number(n.dataset.sides) === polySides);
  });
  pickBtn?.classList.toggle('on', !!t && SHAPE_TOOLS.includes(t));
}

function hookToolbar() {
  if (pickBtn) return;
  const bar = document.getElementById('bar');
  if (!bar) return;

  pickBtn = el('button', '') as HTMLButtonElement;
  pickBtn.id = 'sh-trigger';
  pickBtn.type = 'button';
  pickBtn.title = 'Shapes';
  pickBtn.setAttribute('aria-label', 'Shapes');
  pickBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12.5" width="8.5" height="8.5" rx="1.4"/>' +
    '<circle cx="16.5" cy="7.5" r="4.5"/></svg>';
  pickBtn.onclick = (e) => {
    e.stopPropagation();
    if (!picker) return;
    if (picker.classList.contains('on')) {
      picker.classList.remove('on');
      return;
    }
    paintPicker();
    picker.classList.add('on');
    const r = pickBtn!.getBoundingClientRect();
    const tb = document.getElementById('tb');
    const floor = tb ? Math.round(tb.getBoundingClientRect().bottom) : r.bottom;
    const w = picker.offsetWidth;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left - w / 2 + r.width / 2));
    picker.style.left = Math.round(left) + 'px';
    picker.style.top = Math.round(Math.max(r.bottom, floor) + 8) + 'px';
  };

  // sit next to the engine's own shape buttons
  const anchor = bar.querySelector('[data-t="rect"]') || bar.querySelector('[data-t="ell"]');
  if (anchor && anchor.parentElement === bar) anchor.after(pickBtn);
  else bar.append(pickBtn);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const CSS = `
#ink-shape{
  position:fixed;left:50%;transform:translateX(-50%) translateY(8px);
  top:128px;
  display:none;align-items:center;gap:9px;
  flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 16px);
  background:#fff;border:1px solid #e3e7ee;border-radius:14px;
  padding:7px 10px;box-shadow:0 8px 22px rgba(16,32,64,.16);
  z-index:40;font-family:inherit;opacity:0;transition:opacity .14s ease,transform .14s ease;
}
#ink-shape.on{display:flex;opacity:1;transform:translateX(-50%) translateY(0)}
#ink-shape .sh-fills{display:flex;gap:5px;align-items:center}
#ink-shape .sh-fill{
  width:20px;height:20px;border-radius:6px;padding:0;cursor:pointer;flex:none;
  border:2px solid transparent;background:var(--swc,#fff)!important;
  box-shadow:inset 0 0 0 1px rgba(16,32,64,.18);
}
#ink-shape .sh-fill.on{border-color:var(--gn-acc,#2f6df6);box-shadow:inset 0 0 0 1px rgba(16,32,64,.18),0 0 0 2px rgba(47,109,246,.2)}
#ink-shape .sh-none{
  position:relative;background:
    linear-gradient(135deg,transparent 45%,#e2574c 45% 55%,transparent 55%) #fff!important;
}
#ink-shape .sh-op{
  -webkit-appearance:none;appearance:none;width:66px;height:4px;border-radius:2px;
  background:#dfe4ec;outline:none;cursor:pointer;
}
#ink-shape .sh-op::-webkit-slider-thumb{
  -webkit-appearance:none;width:13px;height:13px;border-radius:50%;
  background:var(--gn-acc,#2f6df6);box-shadow:0 1px 3px rgba(16,32,64,.3);cursor:pointer;
}
#ink-shape .sh-tg{
  width:26px;height:26px;border-radius:8px;border:1px solid #e3e7ee;background:#f7f8fa;
  color:#5b6673;font-size:13px;cursor:pointer;line-height:1;flex:none;
}
#ink-shape .sh-tg.on{background:#e8f0ff;border-color:var(--gn-acc,#2f6df6);color:#1f4fbf}

/* dash: a three-way segmented control, not a toggle */
#ink-shape .sh-dash{display:flex;gap:2px;background:#f1f3f7;border-radius:9px;padding:2px}
#ink-shape .sh-dashb{
  width:28px;height:22px;border:0;border-radius:7px;background:transparent;padding:0;
  color:#5b6673;cursor:pointer;display:grid;place-items:center;
}
#ink-shape .sh-dashb svg{width:17px;height:17px;display:block}
#ink-shape .sh-dashb:hover{background:#e7ebf2}
#ink-shape .sh-dashb.on{background:#fff;color:#1f4fbf;box-shadow:0 1px 3px rgba(16,32,64,.18)}

/* per-axis colours for the xy / xyz shapes */
#ink-shape .sh-axis{display:flex;gap:5px;align-items:center}
#ink-shape .sh-ax{
  position:relative;width:24px;height:24px;border-radius:7px;overflow:hidden;
  box-shadow:inset 0 0 0 1px rgba(16,32,64,.18);cursor:pointer;flex:none;
}
#ink-shape .sh-ax input{
  position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);
  border:0;padding:0;background:none;cursor:pointer;
}
#ink-shape .sh-ax i{
  position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;
  font:700 10px/1 ui-monospace,Menlo,monospace;color:#fff;
  text-shadow:0 1px 2px rgba(0,0,0,.45);
}
#ink-shape-hint{
  position:fixed;left:50%;transform:translateX(-50%);
  top:180px;
  background:#1c2430;color:#fff;font-size:11.5px;font-weight:600;
  padding:5px 11px;border-radius:999px;z-index:41;opacity:0;pointer-events:none;
  transition:opacity .16s ease;
}
#ink-shape-hint.on{opacity:1}
@media(max-width:640px){
  #ink-shape{gap:6px;padding:6px 8px;border-radius:12px}
  #ink-shape .sh-op{width:48px}
  #ink-shape .sh-fill{width:18px;height:18px}
}

#sh-trigger{
  width:30px;height:30px;border-radius:8px;border:0!important;background:transparent!important;
  color:#3c4654;cursor:pointer;display:grid;place-items:center;padding:0!important;flex:none;
}
#sh-trigger:hover{background:#eef1f6}
#sh-trigger.on{background:#e3edff!important;color:#1f4fbf}
#sh-trigger svg{width:18px;height:18px;display:block}

#sh-pick{
  position:fixed;z-index:42;display:none;width:300px;padding:10px;
  max-height:min(78vh,640px);overflow:auto;
  background:#fff;border:1px solid #eef1f6;border-radius:14px;
  box-shadow:0 16px 38px rgba(8,20,38,.20),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;
}
#sh-pick.on{display:block}
#sh-pick .sh-ph{
  font:700 9.5px/1 inherit;letter-spacing:.09em;text-transform:uppercase;
  color:#8b95a3;margin:0 0 8px 3px;
}
#sh-pick .sh-pg{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
#sh-pick .sh-pb{
  border:2px solid transparent!important;background:#f7f9fc!important;border-radius:9px;
  padding:6px 2px 4px!important;cursor:pointer;display:flex;flex-direction:column;
  align-items:center;gap:2px;color:#3c4654;
}
#sh-pick .sh-pb:hover{background:#eef3fb!important}
#sh-pick .sh-pb.on{border-color:var(--gn-acc,#2f6df6)!important;background:#eaf1ff!important;color:#1f4fbf}
#sh-pick .sh-pb svg{width:20px;height:20px;display:block}
#sh-pick .sh-pb span{
  font:600 9px/1.12 inherit;color:#77828f;letter-spacing:.01em;white-space:normal;
  text-align:center;max-width:92px;min-height:20px;display:flex;align-items:center;justify-content:center;
}
#sh-pick .sh-sides{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin:0 0 8px 3px}
#sh-pick .sh-sides span{
  font:700 9px/1 inherit;letter-spacing:.08em;text-transform:uppercase;color:#8b95a3;margin-right:3px;
}
#sh-pick .sh-sides button{
  width:24px;height:22px;padding:0;border:1px solid #e3e7ee;background:#f7f9fc;border-radius:6px;
  font:600 10.5px/1 ui-monospace,monospace;color:#5b6673;cursor:pointer;
}
#sh-pick .sh-sides button.on{background:#eaf1ff;border-color:var(--gn-acc,#2f6df6);color:#1f4fbf}
#sh-pick .sh-pb.on span{color:#1f4fbf}
`;

function boot() {
  loadStyle();
  pushAxes();
  installShapeEngine();
  hookRecognition();
  hookShapePreview();
  buildPanel();
  buildPicker();
  hookToolbar();

  const s = document.createElement('style');
  s.id = 'gn-shape-style';
  s.textContent = CSS;
  document.head.append(s);

  // the canvas is recreated when a notebook opens, so keep re-hooking
  const ed = document.getElementById('ed');
  if (ed) new MutationObserver(() => hookRecognition()).observe(ed, { childList: true, subtree: true });

  let lastTool: string | null = null;
  window.setInterval(() => {
    const t = ev<string>('tool');
    if (t !== lastTool) {
      lastTool = t ?? null;
      // a tool change from the engine's own row clears any pending triangle
      if (forced && t !== 'rect') forced = null;
      hookToolbar();
      hookRecognition();
      paintPicker();
    }
    paint();
  }, 220);

  (window as any).__inkpad_shape = {
    style,
    recognise,
    commit,
    paint,
    setFill,
    setTool,
    setDash,
    setAxis,
    kinds: KINDS,
    metrics: metricsOf,
    last: () => lastRun,
    live: () => ({ drawing, snap, path: path.length, pts: path.map((q) => q.map(Math.round)), hold: !!holdTimer, tool: ev<string>('tool'), rec: style.recognise }),
    trySnap,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
