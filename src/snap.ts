/**
 * Object snap — a magnetic pen.
 *
 * When enabled, the point where the pen lands (and the point where it lifts)
 * is pulled onto the nearest *tip* of an existing object or the *crossing* of
 * two existing objects, within a small radius. Like CAD object snap, but for
 * handwriting: start a line exactly where the last one ended, close a box on a
 * corner, or drop a stroke exactly onto an intersection.
 *
 * How it hooks in: the engine's own pointer handlers are plain functions in a
 * classic <script>, so their bindings live in the global lexical scope. We read
 * them once through an indirect eval and then
 *   • pointerdown — rewrite `clientX/clientY` on the event before the engine
 *     reads them (capture phase on window beats the canvas listener), and
 *   • pointerup — nudge `cur.b` / the last point of `cur.p` before `end()`
 *     commits the object, so undo/redo stays consistent.
 * Nothing is patched inside the engine, so a future engine change can only
 * disable this module, never break drawing.
 */

type Pt = [number, number];
type Kind = 'tip' | 'corner' | 'cross';

interface Cand {
  x: number;
  y: number;
  k: Kind;
}

const KEY = 'inkpad-snap';
/** Tools whose first and last point are worth snapping. */
const DRAW = new Set(['pen', 'hl', 'line', 'rect', 'ell', 'arrow', 'hid', 'ax2', 'ax3']);
const CELL = 56; // page units per spatial-hash cell

interface Bridge {
  ok: boolean;
  W: number;
  H: number;
  tool: string;
  cur: any;
  page: () => any;
  draw: () => void;
  canvas: HTMLCanvasElement;
}

/* ------------------------------------------------------------------ */
/* Engine bridge                                                       */
/* ------------------------------------------------------------------ */

function makeBridge(): Bridge {
  try {
    const f = (window as any).eval(
      `(function(){
        if (typeof pos !== 'function' || typeof pg !== 'function') return null;
        return {
          ok: true,
          get W(){ return W; },
          get H(){ return H; },
          get tool(){ return tool; },
          get cur(){ return cur; },
          page: function(){ return pg(); },
          draw: function(){ draw(); },
          canvas: cv
        };
      })`
    );
    const b = f && f();
    if (b && b.ok && b.canvas) return b as Bridge;
  } catch {
    /* engine shape changed — snap stays dormant */
  }
  return {
    ok: false,
    W: 800,
    H: 1100,
    tool: '',
    cur: null,
    page: () => null,
    draw: () => {},
    canvas: document.createElement('canvas'),
  };
}

const B = makeBridge();

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let on = false;
try {
  on = localStorage.getItem(KEY) === '1';
} catch {
  on = false;
}

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

let idxPage: any = null;
let idxKey = '';
let ends: Cand[] = [];
let segs: Seg[] = [];
let grid = new Map<string, number[]>();

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

function rect(): DOMRect {
  return B.canvas.getBoundingClientRect();
}

function toPage(cx: number, cy: number): Pt {
  const r = rect();
  if (!r.width || !r.height) return [0, 0];
  return [((cx - r.left) * B.W) / r.width, ((cy - r.top) * B.H) / r.height];
}

function toCss(x: number, y: number): Pt {
  const r = rect();
  return [r.left + (x * r.width) / B.W, r.top + (y * r.height) / B.H];
}

/** 13 CSS px expressed in page units, so it feels the same at any zoom. */
function radius(): number {
  const r = rect();
  return r.width ? (13 * B.W) / r.width : 16;
}

function key(cx: number, cy: number): string {
  return cx + ',' + cy;
}

function addSeg(a: Pt, b: Pt) {
  const i = segs.length;
  segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
  const c0 = Math.floor(Math.min(a[0], b[0]) / CELL);
  const c1 = Math.floor(Math.max(a[0], b[0]) / CELL);
  const r0 = Math.floor(Math.min(a[1], b[1]) / CELL);
  const r1 = Math.floor(Math.max(a[1], b[1]) / CELL);
  if ((c1 - c0) * (r1 - r0) > 400) return; // absurdly long segment: skip hashing
  for (let cx = c0; cx <= c1; cx++)
    for (let cy = r0; cy <= r1; cy++) {
      const k = key(cx, cy);
      const arr = grid.get(k);
      if (arr) arr.push(i);
      else grid.set(k, [i]);
    }
}

function boxSegs(x: number, y: number, w: number, h: number) {
  const a: Pt = [x, y];
  const b: Pt = [x + w, y];
  const c: Pt = [x + w, y + h];
  const d: Pt = [x, y + h];
  addSeg(a, b);
  addSeg(b, c);
  addSeg(c, d);
  addSeg(d, a);
}

function buildIndex(page: any) {
  const strokes: any[] = (page && page.strokes) || [];
  const last = strokes.length ? strokes[strokes.length - 1] : null;
  const k = (last ? last.sd + ':' : '0') + strokes.length;
  if (idxPage === page && idxKey === k) return;
  idxPage = page;
  idxKey = k;
  ends = [];
  segs = [];
  grid = new Map();

  for (const s of strokes) {
    if (!s || s.t === 'ers') continue;
    if (s.t === 'shape' && s.a && s.b) {
      ends.push({ x: s.a[0], y: s.a[1], k: 'tip' }, { x: s.b[0], y: s.b[1], k: 'tip' });
      if (s.k === 'rect' || s.k === 'ell') {
        ends.push({ x: s.a[0], y: s.b[1], k: 'corner' }, { x: s.b[0], y: s.a[1], k: 'corner' });
        boxSegs(s.a[0], s.a[1], s.b[0] - s.a[0], s.b[1] - s.a[1]);
      } else {
        addSeg(s.a as Pt, s.b as Pt);
      }
    } else if (s.t === 'text') {
      if (typeof s.x === 'number') ends.push({ x: s.x, y: s.y, k: 'tip' });
      if (typeof s.x === 'number' && typeof s.w === 'number')
        boxSegs(s.x, s.y, s.w, (s.s || 20) * 1.35);
    } else if ((s.t === 'img' || s.t === 'vid') && typeof s.x === 'number') {
      const w = s.w || 0;
      const h = s.h || 0;
      ends.push(
        { x: s.x, y: s.y, k: 'corner' },
        { x: s.x + w, y: s.y, k: 'corner' },
        { x: s.x, y: s.y + h, k: 'corner' },
        { x: s.x + w, y: s.y + h, k: 'corner' }
      );
      boxSegs(s.x, s.y, w, h);
    } else if (Array.isArray(s.p) && s.p.length) {
      const f = s.p[0];
      const l = s.p[s.p.length - 1];
      ends.push({ x: f[0], y: f[1], k: 'tip' });
      if (s.p.length > 1) ends.push({ x: l[0], y: l[1], k: 'tip' });
      for (let i = 1; i < s.p.length; i++) addSeg(s.p[i - 1] as Pt, s.p[i] as Pt);
    }
  }
}

function nearSegs(x: number, y: number, r: number): Seg[] {
  const out: Seg[] = [];
  const seen = new Set<number>();
  const c0 = Math.floor((x - r) / CELL);
  const c1 = Math.floor((x + r) / CELL);
  const r0 = Math.floor((y - r) / CELL);
  const r1 = Math.floor((y + r) / CELL);
  for (let cx = c0; cx <= c1; cx++)
    for (let cy = r0; cy <= r1; cy++) {
      const arr = grid.get(key(cx, cy));
      if (!arr) continue;
      for (const i of arr) {
        if (seen.has(i)) continue;
        seen.add(i);
        out.push(segs[i]);
        if (out.length > 140) return out;
      }
    }
  return out;
}

function cross(a: Seg, b: Seg): Pt | null {
  const d1x = a.x2 - a.x1;
  const d1y = a.y2 - a.y1;
  const d2x = b.x2 - b.x1;
  const d2y = b.y2 - b.y1;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.x1 - a.x1) * d2y - (b.y1 - a.y1) * d2x) / den;
  const u = ((b.x1 - a.x1) * d1y - (b.y1 - a.y1) * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a.x1 + t * d1x, a.y1 + t * d1y];
}

function findSnap(px: number, py: number): Cand | null {
  buildIndex(B.page());
  const r = radius();
  let best: Cand | null = null;
  let bd = r;

  for (const e of ends) {
    if (Math.abs(e.x - px) > r || Math.abs(e.y - py) > r) continue;
    const d = Math.hypot(e.x - px, e.y - py);
    // ends and corners win ties against crossings
    const w = e.k === 'tip' ? d * 0.86 : e.k === 'corner' ? d * 0.93 : d;
    if (d < r && w < bd) {
      bd = w;
      best = e;
    }
  }

  const near = nearSegs(px, py, r);
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const p = cross(near[i], near[j]);
      if (!p) continue;
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < bd) {
        bd = d;
        best = { x: p[0], y: p[1], k: 'cross' };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Marker overlay                                                      */
/* ------------------------------------------------------------------ */

let ov: HTMLCanvasElement | null = null;
let flashTimer = 0;
let marked: Cand | null = null;

function overlay(): HTMLCanvasElement {
  if (ov && ov.isConnected) return ov;
  const host = B.canvas.parentElement || document.body;
  ov = document.createElement('canvas');
  ov.id = 'snap-ov';
  host.appendChild(ov);
  return ov;
}

function clearMarker() {
  marked = null;
  if (ov && ov.isConnected) {
    const g = ov.getContext('2d');
    if (g) g.clearRect(0, 0, ov.width, ov.height);
  }
}

function paintMarker(c: Cand) {
  const cv = overlay();
  const r = rect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr);
  const h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const g = cv.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);

  const [cx, cy] = toCss(c.x, c.y);
  const x = cx - r.left;
  const y = cy - r.top;
  const A = '#2f6df6';

  g.lineCap = 'round';
  g.lineJoin = 'round';

  // white halo so the marker reads on dark paper and on ink
  const halo = (fn: () => void) => {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.92)';
    g.lineWidth = 4;
    fn();
    g.restore();
  };
  const stroke = (fn: () => void) => {
    g.save();
    g.strokeStyle = A;
    g.lineWidth = 1.7;
    fn();
    g.restore();
  };

  const ring = () => {
    g.beginPath();
    g.arc(x, y, 7, 0, 7);
    g.stroke();
  };
  const xMark = () => {
    g.beginPath();
    g.moveTo(x - 5, y - 5);
    g.lineTo(x + 5, y + 5);
    g.moveTo(x - 5, y + 5);
    g.lineTo(x + 5, y - 5);
    g.stroke();
  };
  const cornerMark = () => {
    g.beginPath();
    g.moveTo(x - 6, y - 1);
    g.lineTo(x - 6, y - 6);
    g.lineTo(x - 1, y - 6);
    g.moveTo(x + 1, y + 6);
    g.lineTo(x + 6, y + 6);
    g.lineTo(x + 6, y + 1);
    g.stroke();
  };

  halo(() => {
    if (c.k === 'cross') {
      xMark();
      ring();
    } else if (c.k === 'corner') {
      cornerMark();
    } else {
      ring();
    }
  });
  stroke(() => {
    if (c.k === 'cross') {
      xMark();
      ring();
    } else if (c.k === 'corner') {
      cornerMark();
    } else {
      ring();
    }
  });

  g.fillStyle = A;
  if (c.k === 'tip') {
    g.fillRect(x - 2.1, y - 2.1, 4.2, 4.2);
  } else if (c.k === 'cross') {
    g.beginPath();
    g.arc(x, y, 1.8, 0, 7);
    g.fill();
  }
  marked = c;
}

function flash(c: Cand) {
  paintMarker(c);
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(clearMarker, 420);
}

/* ------------------------------------------------------------------ */
/* Pointer hooks                                                       */
/* ------------------------------------------------------------------ */

function isCanvas(t: EventTarget | null): boolean {
  return t === B.canvas;
}

function onDown(e: PointerEvent) {
  if (!on || !B.ok || !isCanvas(e.target)) return;
  if (!DRAW.has(B.tool)) return;
  const [px, py] = toPage(e.clientX, e.clientY);
  const c = findSnap(px, py);
  if (!c) return;
  const [sx, sy] = toCss(c.x, c.y);
  try {
    Object.defineProperty(e, 'clientX', { value: sx, configurable: true });
    Object.defineProperty(e, 'clientY', { value: sy, configurable: true });
  } catch {
    /* non-extensible event: draw unsnapped rather than not at all */
  }
  flash(c);
}

function onUp(e: PointerEvent) {
  if (!on || !B.ok) return;
  const cur = B.cur;
  if (!cur) return;
  let ox: number;
  let oy: number;
  if (cur.t === 'shape' && Array.isArray(cur.b)) {
    ox = cur.b[0];
    oy = cur.b[1];
  } else if (Array.isArray(cur.p) && cur.p.length) {
    const l = cur.p[cur.p.length - 1];
    ox = l[0];
    oy = l[1];
  } else {
    return;
  }
  const c = findSnap(ox, oy);
  if (!c) return;
  if (cur.t === 'shape' && Array.isArray(cur.b)) {
    cur.b = [c.x, c.y];
  } else {
    const i = cur.p.length - 1;
    const last = cur.p[i];
    cur.p[i] = [c.x, c.y, last[2]];
  }
  flash(c);
  requestAnimationFrame(() => {
    try {
      B.draw();
    } catch {
      /* ignore */
    }
  });
}

let hoverRaf = 0;

function onMove(e: PointerEvent) {
  if (!on || !B.ok) return;
  if (B.cur) {
    clearMarker();
    return;
  }
  if (!isCanvas(e.target)) {
    clearMarker();
    return;
  }
  if (hoverRaf) return;
  const cx = e.clientX;
  const cy = e.clientY;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    if (B.cur) return;
    const [px, py] = toPage(cx, cy);
    const c = findSnap(px, py);
    if (c) paintMarker(c);
    else if (marked) clearMarker();
  });
}

/* ------------------------------------------------------------------ */
/* Toggle                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
#wrap{position:relative}
#snap-ov{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3}
#snap-btn{white-space:nowrap}
`;

function setOn(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* private mode */
  }
  const b = document.getElementById('snap-btn');
  if (b) {
    b.classList.toggle('on', v);
    b.setAttribute('aria-pressed', v ? 'true' : 'false');
  }
  if (!v) clearMarker();
}

function ensureButton() {
  if (document.getElementById('snap-btn')) return;
  const bar2 = document.getElementById('bar2');
  if (!bar2) return;
  const b = document.createElement('button');
  b.id = 'snap-btn';
  b.type = 'button';
  b.title = 'Object snap — pull the pen onto line ends, corners and crossings';
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.textContent = '🧲 Snap';
  if (on) b.classList.add('on');
  b.onclick = () => setOn(!on);
  const po = bar2.querySelector('#po');
  const host = po ? po.closest('label') || po : null;
  bar2.insertBefore(b, host || null);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

if (B.ok) {
  const style = document.createElement('style');
  style.id = 'snap-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointercancel', () => clearMarker(), true);

  // The toolbar is rebuilt when a notebook opens, so keep re-asserting.
  ensureButton();
  window.setInterval(ensureButton, 900);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (marked) paintMarker(marked);
      else clearMarker();
    }).observe(B.canvas);
  }

  window.addEventListener('resize', () => {
    if (marked) paintMarker(marked);
  });

  (window as any).__inkpad_snap = {
    get on() {
      return on;
    },
    set: setOn,
    find: (cx: number, cy: number) => findSnap(...toPage(cx, cy)),
    cands: () => ({ ends: ends.length, segs: segs.length }),
    bridge: B,
  };
}
