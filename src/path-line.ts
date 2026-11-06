/**
 * Bend Line — a multi-point path you can bend anywhere along its length.
 *
 * The existing Curvable Line (`qcurve`) is a single quadratic: one control
 * point, so dragging anywhere just slides the same midpoint and the shape can
 * only ever be one symmetric arc. This is the other thing Canva does: a path
 * made of bend points, where grabbing the line anywhere ADDS a bend there and
 * the curve follows your finger.
 *
 * Model
 * -----
 * A stroke of kind `path` stores its bend points in `poly` as
 *
 *     [u, v, smooth, round]   — u/v normalised inside the a/b box, 0…1
 *
 * Reusing the box plus normalised points is the whole trick: the engine's own
 * move (`mv`), resize (`tf`) and rotate (`s.r`) only ever touch `a`, `b` and
 * `w`, so a path scales and rotates with the selection handle for free. No
 * separate matrix, no fix-ups on transform.
 *
 * Corners
 * -------
 * `smooth` means "the curve passes through this point with a continuous
 * tangent" — a flowing bend. `smooth = 0` means the path arrives and leaves
 * straight, i.e. an edge; `round` then cuts that edge with an arc, which is the
 * rounded-corner look. The three states the user can pick are therefore:
 *
 *     Round    → smooth through every point (flowing curve)
 *     Rounded  → straight edges, corners cut with an arc
 *     Sharp    → straight edges, mitred corners
 *
 * A single node can also be flipped with a double-click.
 *
 * Rendering
 * ---------
 * The path is sampled to a dense polyline and stroked. That keeps one code
 * path for the renderer, the hit-test polyline (`shapePts`, used by the lasso
 * and the eraser) and the warp rasteriser, and it means a corner is a real
 * vertex rather than an artefact of a join style.
 */

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

type Pt = [number, number];

/** One bend point, in page units. */
interface Node {
  p: Pt;
  /** Curve passes through with a continuous tangent. */
  sm: boolean;
  /** Corner radius as a fraction of the shorter adjacent segment, 0…0.5. */
  rd: number;
}

interface Screen {
  x: number;
  y: number;
}

function canvasEl(): HTMLCanvasElement | null {
  return document.getElementById('cv') as HTMLCanvasElement | null;
}

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

function toPage(clientX: number, clientY: number): Pt {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return [clientX, clientY];
  const r = cv.getBoundingClientRect();
  return [((clientX - r.left) / (r.width || 1)) * W, ((clientY - r.top) / (r.height || 1)) * H];
}

function toScreen(x: number, y: number): Screen {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return { x, y };
  const r = cv.getBoundingClientRect();
  return { x: r.left + (x / W) * r.width, y: r.top + (y / H) * r.height };
}

/** How many page units one screen pixel covers, for hit tolerances. */
function pagePerPx(): number {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  if (!cv) return 1;
  return W / (cv.getBoundingClientRect().width || 1);
}

const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);

function isPath(s: any): boolean {
  return !!s && s.t === 'shape' && s.k === 'path';
}

/* ------------------------------------------------------------------ */
/* Node <-> stroke                                                     */
/* ------------------------------------------------------------------ */

/** Read a stroke's bend points back out in page units. */
function nodesPage(s: any): Node[] {
  const a = (s.a || [0, 0]) as Pt;
  const b = (s.b || [1, 1]) as Pt;
  const w = b[0] - a[0] || 1;
  const h = b[1] - a[1] || 1;
  const poly = Array.isArray(s.poly) ? s.poly : [];
  return poly.map((q: any) => ({
    p: [a[0] + (Number(q[0]) || 0) * w, a[1] + (Number(q[1]) || 0) * h] as Pt,
    // Older or hand-made paths default to smooth: a bare polyline is the
    // exception, not the rule, for this tool.
    sm: q.length > 2 ? !!Number(q[2]) : true,
    rd: q.length > 3 ? Number(q[3]) || 0 : 0,
  }));
}

/**
 * Write bend points back onto the stroke.
 *
 * The box is recomputed from the points on every write, so dragging an
 * endpoint grows the line instead of clipping it — which is why endpoints are
 * just nodes like any other.
 *
 * A degenerate box is widened to one page unit *centred on the line*, so a
 * perfectly horizontal or vertical path keeps its exact coordinates (v = 0.5
 * maps back to the same y) while the normalisation stays finite.
 */
function setNodes(s: any, nodes: Node[]) {
  if (!nodes.length) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    if (n.p[0] < x0) x0 = n.p[0];
    if (n.p[1] < y0) y0 = n.p[1];
    if (n.p[0] > x1) x1 = n.p[0];
    if (n.p[1] > y1) y1 = n.p[1];
  }
  if (x1 - x0 < 1) {
    const c = (x0 + x1) / 2;
    x0 = c - 0.5;
    x1 = c + 0.5;
  }
  if (y1 - y0 < 1) {
    const c = (y0 + y1) / 2;
    y0 = c - 0.5;
    y1 = c + 0.5;
  }
  const w = x1 - x0;
  const h = y1 - y0;
  s.a = [x0, y0];
  s.b = [x1, y1];
  s.poly = nodes.map((n) => [
    Math.round(((n.p[0] - x0) / w) * 10000) / 10000,
    Math.round(((n.p[1] - y0) / h) * 10000) / 10000,
    n.sm ? 1 : 0,
    Math.round(n.rd * 1000) / 1000,
  ]);
}

/* ------------------------------------------------------------------ */
/* Sampling                                                            */
/* ------------------------------------------------------------------ */

/** Roughly one sample every three page units — smooth at any zoom we allow. */
const STEP = 3;

function sampleCubic(p0: Pt, c1: Pt, c2: Pt, p3: Pt, out: Pt[]) {
  const n = Math.max(3, Math.min(120, Math.ceil((dist(p0, c1) + dist(c1, c2) + dist(c2, p3)) / STEP)));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
    ]);
  }
}

function sampleQuad(p0: Pt, c: Pt, p1: Pt, out: Pt[]) {
  const n = Math.max(3, Math.min(60, Math.ceil((dist(p0, c) + dist(c, p1)) / STEP)));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ]);
  }
}

/**
 * Turn bend points into a dense polyline.
 *
 * A segment is drawn as a Catmull-Rom curve only when BOTH ends are smooth: a
 * sharp corner has to force its two adjacent segments straight, otherwise it
 * would not be a corner at all. Rounded corners keep the straight approach and
 * cut the vertex with a quadratic, which is the same shape as a rounded
 * rectangle's corner.
 */
function samplePath(nodes: Node[]): Pt[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) return [nodes[0].p];

  const cutIn: (Pt | null)[] = new Array(n).fill(null);
  const cutOut: (Pt | null)[] = new Array(n).fill(null);

  for (let i = 1; i < n - 1; i++) {
    const nd = nodes[i];
    if (nd.sm || !(nd.rd > 0)) continue;
    const prev = nodes[i - 1].p;
    const cur = nd.p;
    const next = nodes[i + 1].p;
    const l1 = dist(prev, cur);
    const l2 = dist(cur, next);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const c = Math.min(0.5, nd.rd) * Math.min(l1, l2);
    cutIn[i] = [cur[0] + ((prev[0] - cur[0]) / l1) * c, cur[1] + ((prev[1] - cur[1]) / l1) * c];
    cutOut[i] = [cur[0] + ((next[0] - cur[0]) / l2) * c, cur[1] + ((next[1] - cur[1]) / l2) * c];
  }

  const out: Pt[] = [nodes[0].p];
  let cursor: Pt = nodes[0].p;

  for (let i = 0; i < n - 1; i++) {
    const A = nodes[i];
    const B = nodes[i + 1];
    const start = cutOut[i] ?? A.p;
    const end = cutIn[i + 1] ?? B.p;

    if (start !== cursor) {
      out.push(start);
      cursor = start;
    }

    if (A.sm && B.sm) {
      // Catmull-Rom tangents from the neighbours, as cubic control points.
      const pm = (nodes[i - 1] ?? A).p;
      const pn = (nodes[i + 2] ?? B).p;
      const t1: Pt = [(B.p[0] - pm[0]) / 2, (B.p[1] - pm[1]) / 2];
      const t2: Pt = [(pn[0] - A.p[0]) / 2, (pn[1] - A.p[1]) / 2];
      sampleCubic(
        cursor,
        [cursor[0] + t1[0] / 3, cursor[1] + t1[1] / 3],
        [end[0] - t2[0] / 3, end[1] - t2[1] / 3],
        end,
        out
      );
    } else {
      out.push(end);
    }
    cursor = end;

    const after = cutOut[i + 1];
    if (after) {
      sampleQuad(cursor, B.p, after, out);
      cursor = after;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/**
 * Paint a path stroke.
 *
 * Called from inside `shp`, which the engine already runs with the canvas
 * rotated for `s.r`, so rotation needs no handling here.
 */
function paintPath(c: CanvasRenderingContext2D, s: any) {
  const nodes = nodesPage(s);
  if (nodes.length < 2) return;
  const P = samplePath(nodes);
  if (P.length < 2) return;

  // A mitre join is what makes a sharp corner actually sharp; a dense curve is
  // unaffected because consecutive segments there are nearly collinear.
  const hard = nodes.some((n) => !n.sm && !(n.rd > 0));

  c.save();
  c.strokeStyle = s.c;
  c.lineWidth = s.w;
  c.lineCap = 'round';
  c.lineJoin = hard ? 'miter' : 'round';
  c.miterLimit = 4;
  if (s.ho != null) c.globalAlpha *= Math.max(0.02, Math.min(1, s.ho));

  if (s.ds) {
    if (s.dm === 'dot') {
      c.lineCap = 'round';
      c.setLineDash([0.1, Math.max(5, s.w * 2.8)]);
    } else {
      c.lineCap = 'butt';
      c.setLineDash([Math.max(7, s.w * 4), Math.max(6, s.w * 3)]);
    }
  }

  c.beginPath();
  c.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]);
  c.stroke();
  c.restore();
}

/**
 * The hit-test polyline.
 *
 * The engine rotates shapes by transforming the canvas, so the points the
 * lasso and eraser test against have to be rotated here or a rotated path is
 * drawn in one place and selected in another.
 */
function ptsRotated(s: any): Pt[] {
  const P = samplePath(nodesPage(s));
  if (!s.r || !P.length) return P;
  const bb0 = ev<(q: any) => number[]>('bb0');
  if (typeof bb0 !== 'function') return P;
  const b = bb0(s);
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  const co = Math.cos(s.r);
  const si = Math.sin(s.r);
  return P.map(
    (q) =>
      [
        cx + (q[0] - cx) * co - (q[1] - cy) * si,
        cy + (q[0] - cx) * si + (q[1] - cy) * co,
      ] as Pt
  );
}

/* ------------------------------------------------------------------ */
/* Engine hooks                                                        */
/* ------------------------------------------------------------------ */

function hookEngine() {
  (window as any).__plPaint = paintPath;
  (window as any).__plPts = ptsRotated;

  ev(`(function(){
    if (window.__plHooked) return;
    window.__plHooked = true;
    var origShp = shp;
    shp = function(c, s){
      if (s && s.t === 'shape' && s.k === 'path') {
        try { return window.__plPaint(c, s); } catch (e) {}
      }
      return origShp.apply(this, arguments);
    };
    var origPts = shapePts;
    shapePts = function(s){
      if (s && s.t === 'shape' && s.k === 'path') {
        try { return window.__plPts(s); } catch (e) {}
      }
      return origPts.apply(this, arguments);
    };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Tool arming and live insertion                                      */
/* ------------------------------------------------------------------ */

type Arm = 'path' | 'elbow';

let armed: Arm | null = null;
let rawA: Pt | null = null;
let rawB: Pt | null = null;

function lineNodes(a: Pt, b: Pt): Node[] {
  return [
    { p: [a[0], a[1]], sm: true, rd: 0 },
    { p: [b[0], b[1]], sm: true, rd: 0 },
  ];
}

/**
 * The elbow preset: horizontal, then vertical — the perpendicular bend the
 * request asks for. Its corner starts sharp so it reads as an elbow rather
 * than a wobble, and Round turns it into a curve in one click.
 */
function elbowNodes(a: Pt, b: Pt): Node[] {
  if (Math.abs(b[0] - a[0]) < 2 || Math.abs(b[1] - a[1]) < 2) return lineNodes(a, b);
  return [
    { p: [a[0], a[1]], sm: true, rd: 0 },
    { p: [b[0], a[1]], sm: false, rd: 0 },
    { p: [b[0], b[1]], sm: true, rd: 0 },
  ];
}

function nodesFor(kind: Arm, a: Pt, b: Pt): Node[] {
  return kind === 'elbow' ? elbowNodes(a, b) : lineNodes(a, b);
}

/**
 * Rewrite the in-flight stroke into a path.
 *
 * The engine builds the preview from the tool alone (`tool = 'rect'`), so the
 * stroke has to be corrected at paint time — the same place shapes.ts fixes up
 * its own derived kinds. Doing it here also means the committed stroke is
 * already correct: `end()` copies `k` and `poly` straight off `cur`, so there
 * is no post-release fix-up and undo stays a single engine entry.
 */
function preview() {
  if (!armed || !rawA || !rawB) return;
  const cur = ev<any>('cur');
  if (!cur || cur.t !== 'shape') return;
  const nodes = nodesFor(armed, rawA, rawB);
  if (nodes.length < 2) return;
  setNodes(cur, nodes);
  cur.k = 'path';
  delete cur.r;
}

function hookTool() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!armed || !editorOpen()) return;
      const cv = canvasEl();
      if (!cv || e.target !== cv) return;
      rawA = toPage(e.clientX, e.clientY);
      rawB = rawA;
    },
    true
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      if (!armed || !rawA) return;
      rawB = toPage(e.clientX, e.clientY);
    },
    true
  );

  // Capture phase, so the stroke is corrected before the engine's own
  // pointerup handler reads `cur` and commits it.
  document.addEventListener(
    'pointerup',
    (e) => {
      if (!armed || !rawA) return;
      rawB = toPage(e.clientX, e.clientY);
      preview();
      window.setTimeout(() => {
        rawA = null;
        rawB = null;
      }, 0);
    },
    true
  );
}

/* ------------------------------------------------------------------ */
/* Selection overlay                                                   */
/* ------------------------------------------------------------------ */

let layer: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let handles: HTMLElement[] = [];
let shape: any = null;
let nodeDrag: { s: any; idx: number; sx: number; sy: number; moved: boolean } | null = null;
let saveTimer = 0;

const CSS = `
#pl-layer{position:fixed;inset:0;pointer-events:none;z-index:13;overflow:hidden;display:none}
.pl-node{
  position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
  background:#fff;border:2px solid var(--ac,#2f6df6);
  box-shadow:0 1px 4px rgba(0,0,0,.32);
  display:none;pointer-events:auto;cursor:grab;
  touch-action:none;user-select:none;-webkit-user-select:none;
}
.pl-node:hover{transform:scale(1.15)}
.pl-node.pl-sharp{background:var(--ac,#2f6df6)}
.pl-node.pl-drag{cursor:grabbing;transform:scale(1.15)}
#pl-panel{
  position:fixed;left:50%;transform:translateX(-50%) translateY(6px);
  bottom:104px;display:none;align-items:center;gap:5px;
  background:var(--sf,#fff);border:1px solid var(--bd,#e3e7ee);border-radius:12px;
  padding:5px 7px;box-shadow:0 8px 22px rgba(16,32,64,.18);
  z-index:14;font-family:inherit;opacity:0;transition:opacity .14s ease,transform .14s ease;
}
#pl-panel.on{display:flex;opacity:1;transform:translateX(-50%) translateY(0)}
#pl-panel .pl-lab{
  font:700 9px/1 var(--slate-font,system-ui);letter-spacing:.08em;text-transform:uppercase;
  color:#8b95a3;margin:0 2px 0 1px;
}
#pl-panel button{
  border:1px solid #e3e7ee;background:#f7f9fc;border-radius:7px;padding:4px 8px;
  font:600 10.5px/1 var(--slate-font,system-ui);color:#5b6673;cursor:pointer;
}
#pl-panel button:hover{background:#eef3fb}
#pl-panel button.on{background:#eaf1ff;border-color:var(--ac,#2f6df6);color:#1f4fbf}
@media(pointer:coarse){#pl-node{width:20px;height:20px;margin:-10px 0 0 -10px}}
`;

function build() {
  if (layer) return;

  layer = document.createElement('div');
  layer.id = 'pl-layer';

  panel = document.createElement('div');
  panel.id = 'pl-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Line corners');

  const lab = document.createElement('span');
  lab.className = 'pl-lab';
  lab.textContent = 'Corners';

  const modes: { id: 'round' | 'rounded' | 'sharp'; label: string; tip: string }[] = [
    { id: 'round', label: 'Round', tip: 'Curve through every point' },
    { id: 'rounded', label: 'Rounded', tip: 'Straight edges with rounded corners' },
    { id: 'sharp', label: 'Sharp', tip: 'Straight edges with sharp corners' },
  ];
  panel.append(lab);
  for (const m of modes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.corner = m.id;
    b.textContent = m.label;
    b.title = m.tip;
    b.onclick = (e) => {
      e.stopPropagation();
      setCorners(m.id);
    };
    panel.append(b);
  }

  document.body.append(layer, panel);

  const style = document.createElement('style');
  style.id = 'pl-style';
  style.textContent = CSS;
  document.head.append(style);
}

/** Grow the handle pool to `n`, never shrink it — re-use keeps dragging stable. */
function ensureHandles(n: number) {
  while (handles.length < n) {
    const h = document.createElement('div');
    h.className = 'pl-node';
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '-1');
    h.title = 'Drag to move this point — double-click to sharpen or round it';
    h.addEventListener('pointerdown', (e) => {
      const idx = Number(h.dataset.idx);
      if (!Number.isFinite(idx)) return;
      startNodeDrag(e as PointerEvent, idx, h);
    });
    h.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(h.dataset.idx);
      if (Number.isFinite(idx)) toggleNode(idx);
    });
    layer?.append(h);
    handles.push(h);
  }
}

/**
 * The path the handles belong to: exactly one selected path shape.
 *
 * Deliberately narrower than the curve-line module, which also adopts the most
 * recently drawn line while its tool is armed. For a multi-point path those
 * handles would sit on top of the canvas during the next draw and steal the
 * press, so they only appear for an explicit selection.
 */
function target(): any | null {
  if (!editorOpen()) return null;
  if (ev<any>('cur')) return null;
  const sel = ev<any[]>('sel') || [];
  if (sel.length === 1 && isPath(sel[0])) {
    const all = ev<any[]>('pg().strokes') || [];
    if (all.indexOf(sel[0]) !== -1) return sel[0];
  }
  return null;
}

function place() {
  if (!layer || !panel) return;
  const s = target();
  shape = s;

  if (!s) {
    layer.style.display = 'none';
    panel.classList.remove('on');
    return;
  }

  const nodes = nodesPage(s);
  if (nodes.length < 2) {
    layer.style.display = 'none';
    panel.classList.remove('on');
    return;
  }

  layer.style.display = 'block';
  ensureHandles(nodes.length);

  nodes.forEach((n, i) => {
    const h = handles[i];
    const at = toScreen(n.p[0], n.p[1]);
    // Endpoints get no handle. The engine's resize handles sit at the box
    // corners — which for a straight line or an elbow ARE the endpoints — so a
    // handle there would cover them and make the path impossible to resize.
    // Dragging a corner still moves the endpoints, because the nodes are
    // normalised inside that box.
    const end = i === 0 || i === nodes.length - 1;
    h.style.display = end ? 'none' : 'block';
    h.style.left = `${at.x}px`;
    h.style.top = `${at.y}px`;
    h.dataset.idx = String(i);
    h.classList.toggle('pl-sharp', !n.sm);
  });
  for (let i = nodes.length; i < handles.length; i++) handles[i].style.display = 'none';

  panel.classList.add('on');
  const mode = cornerMode(nodes);
  panel.querySelectorAll<HTMLElement>('button[data-corner]').forEach((b) => {
    b.classList.toggle('on', b.dataset.corner === mode);
  });

  // Sit directly above the selection bar rather than at a guessed offset: the
  // bar changes height with the viewport and wraps its own buttons.
  const sb = document.getElementById('sbar');
  if (sb && getComputedStyle(sb).display !== 'none') {
    const r = sb.getBoundingClientRect();
    panel.style.bottom = 'auto';
    panel.style.top = `${Math.round(r.top - panel.offsetHeight - 8)}px`;
  } else {
    panel.style.top = '';
    panel.style.bottom = '104px';
  }
}

function cornerMode(nodes: Node[]): string {
  if (nodes.every((n) => n.sm)) return 'round';
  const sharp = nodes.filter((n) => !n.sm);
  if (sharp.every((n) => n.rd > 0)) return 'rounded';
  if (sharp.every((n) => !(n.rd > 0))) return 'sharp';
  return '';
}

function repaint(persist = false) {
  ev('try{ draw(); }catch(e){}');
  if (persist) ev('try{ save(); thumbs(); }catch(e){}');
}

function throttledSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => ev('try{ save(); }catch(e){}'), 220);
}

/* ------------------------------------------------------------------ */
/* Node editing                                                        */
/* ------------------------------------------------------------------ */

function startNodeDrag(e: PointerEvent, idx: number, el: HTMLElement) {
  if (!shape) return;
  e.preventDefault();
  e.stopPropagation();
  nodeDrag = { s: shape, idx, sx: e.clientX, sy: e.clientY, moved: false };
  el.classList.add('pl-drag');
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* the window listeners cover a lost capture */
  }
}

/** One undo entry per gesture, taken on the first real movement. */
function beginEdit(): boolean {
  if (nodeDrag?.moved) return false;
  ev('try{ snap(); }catch(e){}');
  return true;
}

function hookNodeDrag() {
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!nodeDrag) return;
      e.preventDefault();
      if (!nodeDrag.moved) {
        if (Math.hypot(e.clientX - nodeDrag.sx, e.clientY - nodeDrag.sy) < 2) return;
        beginEdit();
        nodeDrag.moved = true;
      }
      const nodes = nodesPage(nodeDrag.s);
      const n = nodes[nodeDrag.idx];
      if (!n) return;
      n.p = toPage(e.clientX, e.clientY);
      setNodes(nodeDrag.s, nodes);
      repaint();
      throttledSave();
      place();
    },
    true
  );

  const finish = () => {
    if (!nodeDrag) return;
    const moved = nodeDrag.moved;
    nodeDrag = null;
    handles.forEach((h) => h.classList.remove('pl-drag'));
    if (moved) ev('try{ save(); thumbs(); }catch(e){}');
    place();
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
}

/** Nearest point on the chord of each segment — good enough to pick a segment. */
function nearestSegment(s: any, p: Pt): { idx: number; d: number } | null {
  const nodes = nodesPage(s);
  let best: { idx: number; d: number } | null = null;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i].p;
    const b = nodes[i + 1].p;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
    t = Math.max(0.08, Math.min(0.92, t));
    const q: Pt = [a[0] + dx * t, a[1] + dy * t];
    const d = dist(q, p);
    if (!best || d < best.d) best = { idx: i, d };
  }
  return best;
}

/**
 * Is the press on one of the engine's own selection handles?
 *
 * The eight box handles and the rotation handle sit at the same places a bend
 * point often does — a straight line's endpoints ARE two of its box corners.
 * Inserting a node there would make the path impossible to resize or rotate, so
 * the box wins and insertion only claims the stretches in between.
 */
function nearSelectionHandle(p: Pt): boolean {
  const selBox = ev<() => number[]>('selBox');
  const cor = ev<(b: number[]) => Pt[]>('cor');
  if (typeof selBox !== 'function' || typeof cor !== 'function') return false;
  if (!(ev<any[]>('sel') || []).length) return false;

  const b = selBox();
  const tol = 16 * pagePerPx();
  if (Math.hypot(p[0] - (b[0] + b[2]) / 2, p[1] - (b[1] - 34)) < tol) return true;
  const C = cor(b);
  return C.some((c) => Math.hypot(p[0] - c[0], p[1] - c[1]) < tol);
}

/**
 * Press anywhere on the path to add a bend there and drag it.
 *
 * Capture phase and `stopPropagation` so the engine never starts a lasso for
 * the same press — the line is what was grabbed, not the page.
 */
function hookInsert() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (nodeDrag || !shape || !editorOpen()) return;
      if (ev<any>('cur')) return;
      const cv = canvasEl();
      if (!cv || e.target !== cv) return;
      const p = toPage(e.clientX, e.clientY);
      if (nearSelectionHandle(p)) return;
      const hit = nearestSegment(shape, p);
      if (!hit || hit.d > 14 * pagePerPx()) return;

      e.preventDefault();
      e.stopPropagation();

      const nodes = nodesPage(shape);
      ev('try{ snap(); }catch(e){}');
      nodes.splice(hit.idx + 1, 0, { p: [p[0], p[1]], sm: true, rd: 0 });
      setNodes(shape, nodes);
      // The insertion already changed the shape, so the drag starts "moved"
      // and must not push a second undo entry.
      nodeDrag = { s: shape, idx: hit.idx + 1, sx: e.clientX, sy: e.clientY, moved: true };
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* window listeners cover it */
      }
      repaint();
      place();
    },
    true
  );
}

function toggleNode(idx: number) {
  if (!shape) return;
  const nodes = nodesPage(shape);
  const n = nodes[idx];
  if (!n) return;
  ev('try{ snap(); }catch(e){}');
  n.sm = !n.sm;
  n.rd = 0;
  setNodes(shape, nodes);
  repaint(true);
  place();
}

function setCorners(mode: 'round' | 'rounded' | 'sharp') {
  if (!shape) return;
  ev('try{ snap(); }catch(e){}');
  const nodes = nodesPage(shape);
  for (const n of nodes) {
    if (mode === 'round') {
      n.sm = true;
      n.rd = 0;
    } else if (mode === 'rounded') {
      n.sm = false;
      n.rd = 0.32;
    } else {
      n.sm = false;
      n.rd = 0;
    }
  }
  setNodes(shape, nodes);
  repaint(true);
  place();
}

/* ------------------------------------------------------------------ */
/* Picker                                                              */
/* ------------------------------------------------------------------ */

const PICKS: { id: Arm; label: string; tip: string; svg: string }[] = [
  {
    id: 'path',
    label: 'Bend Line',
    tip: 'A line you can bend anywhere — drag along it to add a curve',
    svg:
      '<path d="M3 18C6.5 5 10.5 20 21 7"/>' +
      '<circle cx="8" cy="10.5" r="1.9" fill="currentColor" stroke="none"/>' +
      '<circle cx="15" cy="13.5" r="1.9" fill="currentColor" stroke="none"/>',
  },
  {
    id: 'elbow',
    label: 'Elbow Line',
    tip: 'A right-angle line — round its corner or bend it further',
    svg:
      '<path d="M4 19h9V5h7"/>' +
      '<circle cx="13" cy="19" r="1.9" fill="currentColor" stroke="none"/>',
  },
];

function arm(kind: Arm) {
  armed = kind;
  rawA = null;
  rawB = null;
  ev('try{ tool="rect"; sel=[]; draw(); syncTools(); }catch(e){}');
  paintArmed();
}

function paintArmed() {
  document.querySelectorAll<HTMLElement>('#sh-pick .sh-pb').forEach((b) => {
    const own = b.dataset.pathkind;
    if (own) b.classList.toggle('on', own === armed);
    else if (armed) b.classList.remove('on');
  });
}

function injectPicker(): boolean {
  const grid = document.querySelector('#sh-pick .sh-pg.sh-wide');
  if (!grid) return false;
  if (grid.querySelector('[data-pathkind]')) return true;

  for (const p of PICKS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sh-pb';
    b.dataset.pathkind = p.id;
    b.title = p.tip;
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      `stroke-linecap="round" stroke-linejoin="round">${p.svg}</svg><span>${p.label}</span>`;
    b.onclick = (e) => {
      e.stopPropagation();
      arm(p.id);
      document.getElementById('sh-pick')?.classList.remove('on');
    };
    grid.append(b);
  }

  const tip = document.createElement('p');
  tip.className = 'sh-tip';
  tip.textContent =
    'Drag anywhere along a Bend Line to add another curve. Double-click a point to sharpen or round it.';
  grid.after(tip);
  return true;
}

/**
 * Any other tool choice disarms this one.
 *
 * The picker and the toolbar are both plain buttons that know nothing about
 * this module, so the intent is read off the click rather than pushed in.
 */
function hookDisarm() {
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      const pb = t.closest('.sh-pb') as HTMLElement | null;
      if (pb && !pb.dataset.pathkind) {
        armed = null;
        rawA = null;
        rawB = null;
        paintArmed();
        return;
      }
      if (t.closest('[data-t]')) {
        armed = null;
        rawA = null;
        rawB = null;
        paintArmed();
      }
    },
    true
  );
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function hookDraw() {
  ev(`(function(){
    if (window.__plDrawHooked) return;
    window.__plDrawHooked = true;
    var od = draw;
    draw = function(){
      try { window.__plPreview && window.__plPreview(); } catch (e) {}
      var r = od.apply(this, arguments);
      try { window.__slatePath && window.__slatePath.place(); } catch (e) {}
      return r;
    };
  })()`);
}

function boot() {
  build();
  hookEngine();
  hookDraw();
  hookTool();
  hookNodeDrag();
  hookInsert();
  hookDisarm();

  (window as any).__plPreview = preview;
  (window as any).__slatePath = {
    arm,
    armed: () => armed,
    target: () => shape,
    isPath,
    nodes: (s?: any) => nodesPage(s || shape),
    sample: (s?: any) => samplePath(nodesPage(s || shape)),
    setCorners,
    toggleNode,
    nearestSegment,
    handles: () => handles,
    panel: () => panel,
    cornerMode: () => (shape ? cornerMode(nodesPage(shape)) : ''),
    setNodes: (s: any, pts: Pt[]) => {
      setNodes(s, pts.map((p) => ({ p, sm: true, rd: 0 })));
    },
  };

  window.setInterval(() => {
    place();
    if (armed) paintArmed();
    // The picker is built by shapes.ts on its own schedule; adopt it whenever
    // it appears rather than assuming a load order.
    injectPicker();
  }, 240);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
