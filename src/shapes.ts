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
  if (raw.length < 8) return null;
  const b = bboxOf(raw);
  const diag = Math.hypot(b.w, b.h);
  if (diag < 44) return null;

  const P = resample(raw, 64);
  const gap = dist(P[0], P[P.length - 1]);
  const closed = gap < diag * 0.3;

  if (!closed) {
    const dev = maxDeviation(P, P[0], P[P.length - 1]);
    // a line is a line when it barely leaves its own chord
    if (dev < diag * 0.1) return { k: 'line', a: P[0], b: P[P.length - 1] };
    return null;
  }

  const box = b.w * b.h || 1;
  const ratio = polyArea(P) / box;

  // how much of the path lies along the bounding box edges — a rectangle does
  const onEdge =
    P.filter(([x, y]) => {
      const dx = Math.min(Math.abs(x - b.x), Math.abs(x - b.x2));
      const dy = Math.min(Math.abs(y - b.y), Math.abs(y - b.y2));
      return Math.min(dx, dy) < Math.max(7, diag * 0.055);
    }).length / P.length;

  const a: Pt = [b.x, b.y];
  const c: Pt = [b.x2, b.y2];

  if (ratio > 0.87 && onEdge > 0.5) return { k: 'rect', a, b: c };
  if (ratio >= 0.62) return { k: 'ell', a, b: c };
  if (ratio >= 0.36 && cornerCount(P) <= 5) return { k: 'tri', a, b: c };
  return null;
}

/* ------------------------------------------------------------------ */
/* Renderer hook                                                       */
/* ------------------------------------------------------------------ */

const FILLS = ['#f5c542', '#7bd88f', '#7cc4ff', '#f28ab2', '#c3a6ff', '#d9dde3'];

const style = {
  fill: null as string | null,
  opacity: 0.35,
  dashed: false,
  recognise: true,
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
      if (typeof s.dashed === 'boolean') style.dashed = s.dashed;
      if (typeof s.recognise === 'boolean') style.recognise = s.recognise;
    }
  } catch {
    /* ignore */
  }
}

function saveStyle() {
  lsSet(
    'inkpad-shape-style',
    JSON.stringify({ fill: style.fill, opacity: style.opacity, dashed: style.dashed, recognise: style.recognise })
  );
}

/**
 * Wrap `shp` so filled shapes get their wash painted before the engine draws
 * the outline, and so the triangle kind renders at all.
 */
function installShapeEngine() {
  ev(`(function(){
    if (window.__gnShapeHooked) return;
    window.__gnShapeHooked = true;

    var S = window.__gnShape || (window.__gnShape = {});
    var origShp = shp;
    var origPts = shapePts;

    function triP(s){
      var x0=s.a[0], y0=s.a[1], x1=s.b[0], y1=s.b[1];
      return [[(x0+x1)/2, Math.min(y0,y1)], [Math.max(x0,x1), Math.max(y0,y1)], [Math.min(x0,x1), Math.max(y0,y1)]];
    }
    S.triP = triP;

    shapePts = function(s){
      if (s && s.t === 'shape' && s.k === 'tri') {
        var P = triP(s);
        return [P[0], P[1], P[2], P[0]];
      }
      return origPts.apply(this, arguments);
    };

    shp = function(c, s){
      if (!s || s.t !== 'shape') return origShp.apply(this, arguments);

      if (s.k === 'tri') {
        var P = triP(s);
        c.save();
        c.lineCap = c.lineJoin = 'round';
        if (s.fc) {
          c.globalAlpha = Math.max(0.04, Math.min(1, s.fop == null ? 1 : s.fop));
          c.fillStyle = s.fc;
          c.beginPath();
          c.moveTo(P[0][0], P[0][1]);
          c.lineTo(P[1][0], P[1][1]);
          c.lineTo(P[2][0], P[2][1]);
          c.closePath();
          c.fill();
          c.globalAlpha = 1;
        }
        c.strokeStyle = s.c;
        c.lineWidth = s.w;
        if (s.ds) c.setLineDash([s.w * 3 + 6, s.w * 2 + 4]);
        c.beginPath();
        c.moveTo(P[0][0], P[0][1]);
        c.lineTo(P[1][0], P[1][1]);
        c.lineTo(P[2][0], P[2][1]);
        c.closePath();
        c.stroke();
        c.restore();
        return;
      }

      if (s.fc && (s.k === 'rect' || s.k === 'ell')) {
        c.save();
        c.globalAlpha = Math.max(0.04, Math.min(1, s.fop == null ? 1 : s.fop));
        c.fillStyle = s.fc;
        c.beginPath();
        if (s.k === 'rect') {
          c.rect(s.a[0], s.a[1], s.b[0] - s.a[0], s.b[1] - s.a[1]);
        } else {
          c.ellipse((s.a[0]+s.b[0])/2, (s.a[1]+s.b[1])/2,
                    Math.abs(s.b[0]-s.a[0])/2, Math.abs(s.b[1]-s.a[1])/2, 0, 0, 7);
        }
        c.fill();
        c.restore();
      }

      return origShp.apply(this, arguments);
    };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Recognition hook                                                    */
/* ------------------------------------------------------------------ */

const HOLD_MS = 380;

let lastRun: any = null;

let path: Pt[] = [];
let drawing = false;
let shapePending = false;
let lastMove = 0;

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
      if (!style.recognise) return;
      if (ev<string>('tool') !== 'pen') return;
      drawing = true;
      path = [toPage(e, cv)];
      lastMove = performance.now();
    },
    true
  );

  cv.addEventListener(
    'pointermove',
    (e) => {
      if (!drawing) return;
      const p = toPage(e, cv);
      const last = path[path.length - 1];
      if (!last || dist(last, p) > 1.5) {
        path.push(p);
        lastMove = performance.now();
      }
    },
    true
  );

  const finish = () => {
    if (!drawing && !shapePending) return;
    if (drawing) {
      drawing = false;
      const held = performance.now() - lastMove;
      const pts = path;
      path = [];
      if (style.recognise && held >= HOLD_MS && pts.length >= 8) {
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

/**
 * The engine builds shape strokes from the tool alone, so fill and dash are
 * applied here once the stroke exists.
 */
function stampStyle() {
  if (!editorOpen()) return;
  const strokes = ev<any[]>('pg().strokes');
  if (!strokes || !strokes.length) return;
  const s = strokes[strokes.length - 1];
  if (!s || s.t !== 'shape') return;

  let changed = false;
  if (style.fill && (s.k === 'rect' || s.k === 'ell' || s.k === 'tri')) {
    s.fc = style.fill;
    s.fop = style.opacity;
    changed = true;
  }
  if (style.dashed && !s.ds) {
    s.ds = true;
    changed = true;
  }
  if (changed) ev('try{ draw(); save(); }catch(e){}');
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
    made.w = Math.max(2, Math.min(8, s.w || 3));
    made.c = s.c;
    if (style.dashed) made.ds = true;
    if (style.fill && shape.k !== 'line') {
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

const SHAPE_TOOLS = ['line', 'rect', 'ell', 'arrow', 'hid', 'ax2', 'ax3'];

function toolIsShape(): boolean {
  const t = ev<string>('tool');
  return !!t && SHAPE_TOOLS.includes(t);
}

function flash(k: string) {
  if (!hint) return;
  const names: Record<string, string> = { line: 'Line', rect: 'Rectangle', ell: 'Oval', tri: 'Triangle' };
  hint.textContent = `${names[k] || 'Shape'} snapped`;
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

  const dash = el('button', '', '⋯') as HTMLButtonElement;
  dash.type = 'button';
  dash.className = 'sh-tg';
  dash.title = 'Dashed outline';
  dash.onclick = () => {
    style.dashed = !style.dashed;
    saveStyle();
    // keep the engine's own dashed flag in step so its drawer agrees
    ev(`(function(){ try{ dashOn = ${style.dashed}; }catch(e){} })()`);
    const sel = (ev<any[]>('sel') || []).filter((s) => s && s.t === 'shape');
    if (sel.length) {
      sel.forEach((s) => (s.ds = style.dashed));
      repaint();
    }
    paint();
  };

  const rec = el('button', '', '✨') as HTMLButtonElement;
  rec.type = 'button';
  rec.className = 'sh-tg';
  rec.title = 'Snap hand-drawn shapes';
  rec.onclick = () => {
    style.recognise = !style.recognise;
    saveStyle();
    paint();
  };

  panel.append(fills, op, dash, rec);
  document.body.append(panel);

  hint = el('div', '');
  hint.id = 'ink-shape-hint';
  document.body.append(hint);

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
  const on = editorOpen() && toolIsShape();
  panel.classList.toggle('on', on);

  // the toolbar grows a second row for shape tools, so measure its real bottom
  const tb = document.getElementById('tb');
  const top = tb ? Math.round(tb.getBoundingClientRect().bottom) + 8 : 128;
  panel.style.top = `${top}px`;
  if (hint) hint.style.top = `${top + 46}px`;

  panel.querySelectorAll<HTMLElement>('.sh-fill').forEach((n) => {
    n.classList.toggle('on', (n.dataset.fill ?? null) === style.fill);
  });
  const dash = panel.querySelectorAll<HTMLElement>('.sh-tg')[0];
  const rec = panel.querySelectorAll<HTMLElement>('.sh-tg')[1];
  if (dash) dash.classList.toggle('on', style.dashed);
  if (rec) rec.classList.toggle('on', style.recognise);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const CSS = `
#ink-shape{
  position:fixed;left:50%;transform:translateX(-50%) translateY(8px);
  top:128px;
  display:none;align-items:center;gap:9px;
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
`;

function boot() {
  loadStyle();
  installShapeEngine();
  hookRecognition();
  buildPanel();

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
      hookRecognition();
    }
    paint();
  }, 220);

  (window as any).__inkpad_shape = {
    style,
    recognise,
    commit,
    paint,
    setFill,
    metrics: metricsOf,
    last: () => lastRun,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
