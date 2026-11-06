/**
 * Curvable Line — a Canva-style line with one draggable bend handle.
 *
 * The Shapes picker offers `qcurve` as a tool. The engine draws it as a
 * straight chord (`q = [0, 0]`) and src/shapes.ts stamps that kind onto the
 * committed stroke. This module supplies the missing half: a real control at
 * the curve's midpoint which, when dragged, writes the bend back into `s.q`.
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
let active: any = null;
let drag: { id: number; s: any; frame: Frame; sx: number; sy: number; snapped: boolean } | null = null;
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

  layer.append(guide, handle);
  document.body.append(layer);

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
/* Position / visibility                                               */
/* ------------------------------------------------------------------ */

function place() {
  if (!layer || !handle || !guide) return;
  const s = target();
  active = s;

  if (!s || !s.a || !s.b) {
    handle.style.display = 'none';
    guide.style.display = 'none';
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
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
