/**
 * Curvable Line — a Canva-style line you can grab anywhere and bend.
 *
 * The Shapes picker offers `qcurve` as a tool. The engine draws it as a
 * straight chord (`q = [0, 0]`) and src/shapes.ts stamps that kind onto the
 * committed stroke. This module supplies the missing half: a live bend control
 * that writes the curve back into `s.q`.
 *
 * Two ways to bend it, both on the same quadratic:
 *   • the diamond handle at the curve's midpoint (the classic affordance), and
 *   • pressing anywhere ALONG the path and dragging — the curve is then
 *     re-solved so it passes exactly through the point under the pointer.
 *
 * The second one is what makes it feel like Canva's line tool. For a quadratic
 * with fixed endpoints A and B, a single control point cannot satisfy an
 * arbitrary (t, point) pair *and* stay independent, but it can satisfy exactly
 * one: solving B(t) = P for C gives
 *
 *     C = (P − (1−t)²A − t²B) / (2(1−t)t)
 *
 * so grabbing at t and moving to P puts the curve through P precisely, and the
 * control point is regenerated on every move. That is the "automatically
 * generate and adjust the control point" behaviour, without ever showing the
 * user a raw bezier handle they did not ask for.
 *
 * Geometry is a Quadratic Bézier, everywhere:
 *   • index.html `shp()`          → ctx.quadraticCurveTo(C, B)
 *   • index.html `shapePts()`     → B(t) = (1-t)²A + 2(1-t)tC + t²B
 *   • the picker icon             → <path d="M… Q… …">
 *   • `window.__qFrame(s)`        → the single source of truth for A/B/C/H
 *
 * `s.q = [along, normal]` is the offset of the curve's MIDPOINT from the chord
 * midpoint, in the line's own orthonormal frame, in units of the chord length.
 * B(0.5) = (A + 2C + B) / 4, so the control point C sits at twice that
 * offset. Normalising this way means the engine's own move / resize / rotate
 * transforms keep the bend attached to the line for free — no separate matrix.
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

interface Frame {
  m: Pt; // chord midpoint
  h: Pt; // curve midpoint — where the handle lives
  c: Pt; // quadratic control point
  L: number;
  ux: number;
  uy: number;
  n: Pt; // unit normal
}

function frameOf(s: any): Frame {
  const f = (window as any).__qFrame;
  if (typeof f === 'function') return f(s) as Frame;
  // Defensive fallback: identical maths, for the frame before index.html runs.
  const a = s.a as Pt;
  const b = s.b as Pt;
  const q = (Array.isArray(s.q) ? s.q : [0, 0]) as Pt;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const ox = L * (q[0] * ux - q[1] * uy);
  const oy = L * (q[0] * uy + q[1] * ux);
  return {
    m: [mx, my],
    h: [mx + ox, my + oy],
    c: [mx + 2 * ox, my + 2 * oy],
    L,
    ux,
    uy,
    n: [-uy, ux],
  };
}

function canvasEl(): HTMLCanvasElement | null {
  return document.getElementById('cv') as HTMLCanvasElement | null;
}

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

/** Viewport pixels → page units (0…W, 0…H), matching the engine's pos(). */
function toPage(clientX: number, clientY: number): Pt {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return [clientX, clientY];
  const r = cv.getBoundingClientRect();
  return [((clientX - r.left) / (r.width || 1)) * W, ((clientY - r.top) / (r.height || 1)) * H];
}

/** Page units → viewport pixels. */
function toScreen(x: number, y: number): Pt {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return [x, y];
  const r = cv.getBoundingClientRect();
  return [r.left + (x / W) * r.width, r.top + (y / H) * r.height];
}

const clamp = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));

/* ------------------------------------------------------------------ */
/* Which line owns the handle                                          */
/* ------------------------------------------------------------------ */

/**
 * A selected curvable line always owns the handle. Otherwise, while the
 * Curvable Line tool is armed, the most recently drawn one does — that is the
 * "draw a line, then bend it" flow, with no extra click to select it first.
 */
function target(): any | null {
  if (!editorOpen()) return null;
  // Never overlay a handle onto a gesture in progress.
  if (ev<any>('cur')) return null;

  const sel = ev<any[]>('sel') || [];
  if (sel.length === 1 && sel[0] && sel[0].t === 'shape' && sel[0].k === 'qcurve') {
    if (isOnPage(sel[0])) return sel[0];
  }

  const armed = document.querySelector('#sh-pick .sh-pb.on[data-kind="qcurve"]');
  if (armed) {
    const S = ev<any[]>('pg().strokes') || [];
    for (let i = S.length - 1; i >= 0; i--) {
      if (S[i] && S[i].t === 'shape' && S[i].k === 'qcurve') return S[i];
    }
  }
  return null;
}

function isOnPage(s: any): boolean {
  const S = ev<any[]>('pg().strokes') || [];
  return S.indexOf(s) !== -1;
}

/* ------------------------------------------------------------------ */
/* The draggable midpoint control                                      */
/* ------------------------------------------------------------------ */

let layer: HTMLElement | null = null;
let handle: HTMLElement | null = null;
let guide: HTMLElement | null = null;
let hover: HTMLElement | null = null;
let active: any = null;
let drag: { id: number; s: any; frame: Frame; sx: number; sy: number; snapped: boolean } | null = null;
/** A drag that started on the path itself rather than on the diamond. */
let pathDrag: { s: any; t: number; sx: number; sy: number; snapped: boolean } | null = null;
let hoverRaf = 0;
let saveTimer = 0;

const CSS = `
#q-layer{position:fixed;inset:0;pointer-events:none;z-index:12;overflow:hidden}
#q-guide{
  position:absolute;height:0;border-top:1.5px dashed var(--ac,#2f6df6);
  opacity:.65;transform-origin:0 50%;display:none;
}
#q-handle{
  position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;
  border-radius:7px;background:var(--sf,#fff);
  border:2px solid var(--ac,#2f6df6);
  box-shadow:0 2px 8px rgba(0,0,0,.28);
  display:none;place-items:center;pointer-events:auto;
  cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;
  color:var(--ac,#2f6df6);transition:box-shadow .12s ease;
}
#q-handle:hover{box-shadow:0 3px 12px rgba(47,109,246,.5)}
#q-handle.q-dragging{cursor:grabbing;box-shadow:0 4px 16px rgba(47,109,246,.65)}
#q-handle svg{width:12px;height:12px;display:block}
#q-handle:focus-visible{outline:3px solid color-mix(in srgb,var(--ac,#2f6df6) 45%,transparent);outline-offset:2px}
/* Follows the pointer along the curve so it is obvious the whole line is grabbable. */
#q-hover{
  position:absolute;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;
  background:var(--ac,#2f6df6);box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.3);
  display:none;pointer-events:none;opacity:.9;
}
@media (pointer:coarse){#q-handle{width:28px;height:28px;margin:-14px 0 0 -14px}}
`;

function build() {
  if (layer) return;
  layer = document.createElement('div');
  layer.id = 'q-layer';

  guide = document.createElement('div');
  guide.id = 'q-guide';

  handle = document.createElement('div');
  handle.id = 'q-handle';
  handle.setAttribute('role', 'slider');
  handle.setAttribute('tabindex', '0');
  handle.setAttribute('aria-label', 'Curve bend — drag to bend the line, double-click to straighten');
  handle.setAttribute('aria-valuemin', '-100');
  handle.setAttribute('aria-valuemax', '100');
  handle.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3l9 9-9 9-9-9z"/></svg>';

  hover = document.createElement('div');
  hover.id = 'q-hover';

  layer.append(guide, hover, handle);
  document.body.append(layer);

  hookPathDrag();

  // Explicit mousedown / mousemove / mouseup binding on the midpoint control,
  // with pointer events for pen and touch. Mouse emits both families, so the
  // `drag` guard below makes the duplicate start/move a no-op.
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') onDown(e);
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') onMove(e);
  });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') onUp();
  });
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onUp);

  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    straighten();
  });

  handle.addEventListener('keydown', (e) => {
    if (!active) return;
    const step: Record<string, Pt> = {
      ArrowLeft: [-0.03, 0],
      ArrowRight: [0.03, 0],
      ArrowUp: [0, -0.03],
      ArrowDown: [0, 0.03],
    };
    const d = step[e.key];
    if (d) {
      e.preventDefault();
      ev('try{ snap(); }catch(e){}');
      setQ(active, ((active.q as Pt) || [0, 0])[0] + d[0], ((active.q as Pt) || [0, 0])[1] + d[1]);
      afterChange(false);
    } else if (e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault();
      straighten();
    }
  });

  const style = document.createElement('style');
  style.id = 'q-line-style';
  style.textContent = CSS;
  document.head.append(style);
}

function setQ(s: any, u: number, v: number) {
  // Keep the bend sane: too far along the chord folds the curve over itself.
  s.q = [
    Math.round(clamp(-0.55, 0.55, u) * 1000) / 1000,
    Math.round(clamp(-1.35, 1.35, v) * 1000) / 1000,
  ];
}

/** B(t) of the quadratic A → C → B. */
function bez(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

/**
 * Closest point on the curve to `p`, in page units.
 *
 * A coarse sweep locates the basin, then a ternary search refines it. 48 + 24
 * evaluations is far below a frame budget, and it is exact enough that the
 * grab point sits on the stroke rather than a pixel beside it.
 */
function nearestOnCurve(s: any, p: Pt): { t: number; p: Pt; d: number } {
  const F = frameOf(s);
  const A = s.a as Pt;
  const B = s.b as Pt;
  const C = F.c;
  let bt = 0.5;
  let bd = Infinity;
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const q = bez(A, C, B, t);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) {
      bd = d;
      bt = t;
    }
  }
  let lo = Math.max(0, bt - 1 / N);
  let hi = Math.min(1, bt + 1 / N);
  for (let k = 0; k < 24; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const q1 = bez(A, C, B, m1);
    const q2 = bez(A, C, B, m2);
    const d1 = Math.hypot(q1[0] - p[0], q1[1] - p[1]);
    const d2 = Math.hypot(q2[0] - p[0], q2[1] - p[1]);
    if (d1 < d2) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  const q = bez(A, C, B, t);
  return { t, p: q, d: Math.hypot(q[0] - p[0], q[1] - p[1]) };
}

/**
 * Re-solve the control point so B(t) lands exactly on `p`.
 *
 * t is held away from the endpoints: the divisor 2(1−t)t → 0 there, and the
 * implied control point would shoot off to infinity for no visual gain.
 */
function setFromPoint(s: any, t: number, p: Pt) {
  const tt = clamp(0.14, 0.86, t);
  const u = 1 - tt;
  const den = 2 * u * tt;
  const A = s.a as Pt;
  const B = s.b as Pt;
  const C: Pt = [
    (p[0] - u * u * A[0] - tt * tt * B[0]) / den,
    (p[1] - u * u * A[1] - tt * tt * B[1]) / den,
  ];
  // C = m + 2·offset, expressed back in the chord's own frame.
  const F = frameOf(s);
  const ox = (C[0] - F.m[0]) / 2;
  const oy = (C[1] - F.m[1]) / 2;
  const along = (ox * F.ux + oy * F.uy) / F.L;
  const normal = (ox * F.n[0] + oy * F.n[1]) / F.L;
  setQ(s, along, normal);
}

/** How many page units one screen pixel covers, for hit tolerances. */
function pagePerPx(): number {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  if (!cv) return 1;
  return W / (cv.getBoundingClientRect().width || 1);
}

function onDown(e: MouseEvent | PointerEvent) {
  if (drag || !active) return;
  e.preventDefault();
  e.stopPropagation();
  const s = active;
  // The undo snapshot is taken on the first real movement, not on mousedown:
  // a plain click on the handle (or a double-click to straighten) must not
  // leave a no-op entry in the undo stack.
  drag = {
    id: 'pointerId' in e ? (e as PointerEvent).pointerId : -1,
    s,
    frame: frameOf(s),
    sx: e.clientX,
    sy: e.clientY,
    snapped: false,
  };
  handle?.classList.add('q-dragging');
  const pid = 'pointerId' in e ? (e as PointerEvent).pointerId : null;
  if (pid !== null && pid !== undefined && handle) {
    try {
      handle.setPointerCapture(pid);
    } catch {
      /* the window-level move/up listeners cover any loss of capture */
    }
  }
}

function onMove(e: MouseEvent | PointerEvent) {
  if (!drag) return;
  e.preventDefault();
  if (!drag.snapped) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 2) return;
    ev('try{ snap(); }catch(e){}');
    drag.snapped = true;
  }
  const { s, frame } = drag;
  const [px, py] = toPage(e.clientX, e.clientY);
  const dx = px - frame.m[0];
  const dy = py - frame.m[1];
  const along = (dx * frame.ux + dy * frame.uy) / frame.L;
  const normal = (dx * frame.n[0] + dy * frame.n[1]) / frame.L;
  setQ(s, along, normal);
  afterChange(true);
}

function onUp() {
  if (!drag) return;
  const s = drag.s;
  const didChange = drag.snapped;
  drag = null;
  handle?.classList.remove('q-dragging');
  if (didChange) {
    window.clearTimeout(saveTimer);
    ev('try{ draw(); save(); thumbs(); }catch(e){}');
  }
  if (s && handle) {
    const v = (s.q as Pt) || [0, 0];
    handle.setAttribute('aria-valuenow', String(Math.round(v[1] * 100)));
  }
  place();
}

function afterChange(throttled: boolean) {
  ev('try{ draw(); }catch(e){}');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => ev('try{ save(); }catch(e){}'), throttled ? 220 : 0);
}

function straighten() {
  if (!active) return;
  ev('try{ snap(); }catch(e){}');
  setQ(active, 0, 0);
  afterChange(false);
  ev('try{ thumbs(); }catch(e){}');
  place();
}

/* ------------------------------------------------------------------ */
/* Dragging the line anywhere along its path                           */
/* ------------------------------------------------------------------ */

function canGrab(): boolean {
  if (!active || !editorOpen()) return false;
  // Never hijack a gesture that is already in progress.
  return !ev<any>('cur');
}

/** Bending is an edit action: the lasso tool, or the Curvable Line tool. */
function pathToolArmed(): boolean {
  if (ev<string>('tool') === 'sel') return true;
  return !!document.querySelector('#sh-pick .sh-pb.on[data-kind="qcurve"]');
}

function hideHover() {
  if (hover) hover.style.display = 'none';
  const cv = canvasEl();
  if (cv && cv.style.cursor === 'grab') cv.style.cursor = '';
}

function showHoverAt(p: Pt) {
  if (!hover) return;
  const [x, y] = toScreen(p[0], p[1]);
  hover.style.display = 'block';
  hover.style.left = `${x}px`;
  hover.style.top = `${y}px`;
  const cv = canvasEl();
  if (cv) cv.style.cursor = 'grab';
}

function hookPathDrag() {
  // Capture phase, so the press is claimed before the engine starts a lasso or
  // a brand-new stroke — but only when the line really is what was touched.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (drag || pathDrag || !canGrab() || !pathToolArmed()) return;
      const cv = canvasEl();
      if (!cv || e.target !== cv) return;
      const n = nearestOnCurve(active, toPage(e.clientX, e.clientY));
      if (n.d > 14 * pagePerPx()) return;
      e.preventDefault();
      e.stopPropagation();
      hideHover();
      pathDrag = { s: active, t: n.t, sx: e.clientX, sy: e.clientY, snapped: false };
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* the window listeners cover a lost capture */
      }
    },
    true
  );

  window.addEventListener(
    'pointermove',
    (e) => {
      if (pathDrag) {
        e.preventDefault();
        if (!pathDrag.snapped) {
          if (Math.hypot(e.clientX - pathDrag.sx, e.clientY - pathDrag.sy) < 2) return;
          // One undo entry per gesture, taken on the first real movement.
          ev('try{ snap(); }catch(e){}');
          pathDrag.snapped = true;
        }
        setFromPoint(pathDrag.s, pathDrag.t, toPage(e.clientX, e.clientY));
        afterChange(true);
        return;
      }

      if (drag || !canGrab() || !pathToolArmed() || hoverRaf) return;
      const cx = e.clientX;
      const cy = e.clientY;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (!active || !canGrab()) {
          hideHover();
          return;
        }
        const cv = canvasEl();
        if (!cv) {
          hideHover();
          return;
        }
        const r = cv.getBoundingClientRect();
        if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) {
          hideHover();
          return;
        }
        const n = nearestOnCurve(active, toPage(cx, cy));
        if (n.d <= 14 * pagePerPx()) showHoverAt(n.p);
        else hideHover();
      });
    },
    true
  );

  const finish = () => {
    if (!pathDrag) return;
    const changed = pathDrag.snapped;
    pathDrag = null;
    if (changed) ev('try{ draw(); save(); thumbs(); }catch(e){}');
    place();
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
}

/* ------------------------------------------------------------------ */
/* Position / visibility                                               */
/* ------------------------------------------------------------------ */

function place() {
  if (!layer || !handle || !guide) return;
  const s = target();
  active = s;

  if (!s || !s.a || !s.b) {
    handle.style.display = 'none';
    guide.style.display = 'none';
    hideHover();
    return;
  }

  const F = frameOf(s);
  const [mx, my] = toScreen(F.m[0], F.m[1]);
  const [hx, hy] = toScreen(F.h[0], F.h[1]);
  const len = Math.hypot(hx - mx, hy - my);

  handle.style.display = 'grid';
  handle.style.left = `${hx}px`;
  handle.style.top = `${hy}px`;
  const q = (s.q as Pt) || [0, 0];
  handle.setAttribute('aria-valuenow', String(Math.round(q[1] * 100)));

  if (len > 7) {
    guide.style.display = 'block';
    guide.style.left = `${mx}px`;
    guide.style.top = `${my}px`;
    guide.style.width = `${len}px`;
    guide.style.transform = `rotate(${Math.atan2(hy - my, hx - mx)}rad)`;
  } else {
    guide.style.display = 'none';
  }
}

/**
 * Wrap draw() so the handle is glued to the canvas on every repaint — zoom,
 * stage scroll, page flip and selection resize all call draw(). An interval
 * covers the quiet case where only the tool changes.
 */
function hookDraw() {
  ev(`(function(){
    if (window.__qDrawHooked) return;
    window.__qDrawHooked = true;
    var od = draw;
    draw = function(){
      var r = od.apply(this, arguments);
      try { window.__slateCurve && window.__slateCurve.place(); } catch (e) {}
      return r;
    };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  build();
  hookDraw();
  window.setInterval(place, 240);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);

  (window as any).__slateCurve = {
    frame: frameOf,
    target,
    place,
    setQ: (u: number, v: number) => {
      if (!active) return null;
      ev('try{ snap(); }catch(e){}');
      setQ(active, u, v);
      afterChange(false);
      return active.q as Pt;
    },
    straighten,
    handle: () => handle,
    active: () => active,
    nearest: (s: any, p: Pt) => nearestOnCurve(s, p),
    setFromPoint: (s: any, t: number, p: Pt) => {
      setFromPoint(s, t, p);
      afterChange(false);
      return s.q as Pt;
    },
    dragging: () => !!pathDrag,
    hover: () => hover,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
