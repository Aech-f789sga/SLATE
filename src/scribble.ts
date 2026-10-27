/**
 * Scribble to erase — GoodNotes' party trick.
 *
 * Scratch back and forth over a word, a doodle or a shape and it disappears.
 * The gesture is recognised from the pointer trail (many direction reversals,
 * high path length relative to the area covered, short duration) so ordinary
 * writing — which has turns but not that density — is never touched.
 *
 * Nothing is patched: the module observes pointer events, then hands the
 * matching strokes to the engine's own `delSel()`, which keeps undo, layers
 * and thumbnails consistent.
 */

const KEY = 'inkpad-scribble';

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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Canvas → page-unit scale, so thresholds can be expressed in CSS pixels. */
function bridge(): { cv: HTMLCanvasElement; k: number } | null {
  const cv = document.getElementById('cv') as HTMLCanvasElement | null;
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  const W = ev<number>('typeof W === "number" ? W : 800') || 800;
  if (!r.width) return null;
  return { cv, k: W / r.width };
}

function enabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

function setEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {}
  const cb = document.getElementById('gn-scr-toggle') as HTMLInputElement | null;
  if (cb) cb.checked = on;
}

/* ------------------------------------------------------------------ */
/* Gesture tracking                                                    */
/* ------------------------------------------------------------------ */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Trail {
  pts: [number, number][];
  t0: number;
  turns: number;
  len: number;
  box: Box;
}

let trail: Trail | null = null;

const DRAW_TOOLS = new Set(['pen', 'hl', 'pen2']);

function toolNow(): string {
  return ev<string>('typeof tool === "string" ? tool : ""') || '';
}

function growBox(b: Box, x: number, y: number) {
  b.x0 = Math.min(b.x0, x);
  b.y0 = Math.min(b.y0, y);
  b.x1 = Math.max(b.x1, x);
  b.y1 = Math.max(b.y1, y);
}

function onDown(e: PointerEvent) {
  trail = null;
  if (!enabled()) return;
  if (!DRAW_TOOLS.has(toolNow())) return;
  const cv = document.getElementById('cv');
  if (!cv || !cv.contains(e.target as Node)) return;
  trail = {
    pts: [[e.clientX, e.clientY]],
    t0: performance.now(),
    turns: 0,
    len: 0,
    box: { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY },
  };
}

function onMove(e: PointerEvent) {
  const t = trail;
  if (!t) return;
  const last = t.pts[t.pts.length - 1];
  const dx = e.clientX - last[0];
  const dy = e.clientY - last[1];
  const d = Math.hypot(dx, dy);
  if (d < 2.5) return;

  if (t.pts.length >= 2) {
    const p0 = t.pts[t.pts.length - 2];
    const p1 = t.pts[t.pts.length - 1];
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const cos = (ax * dx + ay * dy) / (Math.hypot(ax, ay) * d || 1);
    // a reversal is a turn sharper than ~110 degrees
    if (cos < -0.34) t.turns++;
  }

  t.len += d;
  t.pts.push([e.clientX, e.clientY]);
  growBox(t.box, e.clientX, e.clientY);
}

/** True when the trail looks like a deliberate scratch-out. */
function isScribble(t: Trail): boolean {
  const dur = performance.now() - t.t0;
  const span = Math.max(t.box.x1 - t.box.x0, t.box.y1 - t.box.y0);
  if (t.pts.length < 14) return false;
  if (dur < 200) return false;
  if (span > 300) return false;
  if (span < 18) return false;
  if (t.turns < 5) return false;
  return t.len >= span * 4.5;
}

function onUp() {
  const t = trail;
  trail = null;
  if (!t) return;
  const ok = isScribble(t);
  const info = {
    pts: t.pts.length,
    turns: t.turns,
    len: Math.round(t.len),
    span: Math.round(Math.max(t.box.x1 - t.box.x0, t.box.y1 - t.box.y0)),
    dur: Math.round(performance.now() - t.t0),
    ok,
  };
  (window as any).__inkpad_scribble.last = info;
  if (!ok) return;

  // let the engine commit its stroke first, then decide
  window.setTimeout(() => apply(t), 0);
}

function apply(t: Trail) {
  const b = bridge();
  if (!b) return;
  const r = b.cv.getBoundingClientRect();
  // client px → page units, with a small margin so a scratch that just grazes
  // a stroke still catches it
  const pad = 6;
  const box: Rect = {
    x: (t.box.x0 - r.left - pad) * b.k,
    y: (t.box.y0 - r.top - pad) * b.k,
    w: (t.box.x1 - t.box.x0 + pad * 2) * b.k,
    h: (t.box.y1 - t.box.y0 + pad * 2) * b.k,
  };
  if (box.w <= 0 || box.h <= 0) return;

  (window as any).__gnScr = box;
  const hit = ev<number>(`(function(){
    var b = window.__gnScr;
    var x1 = b.x + b.w, y1 = b.y + b.h;
    var st = pg().strokes;
    var out = [];
    for (var i = 0; i < st.length; i++) {
      var s = st[i];
      if (!s || s.t === 'ers') continue;
      var q;
      try { q = bb(s); } catch (e) { continue; }
      if (!q) continue;
      if (q[0] < x1 && q[2] > b.x && q[1] < y1 && q[3] > b.y) out.push(s);
    }
    sel = out;
    return out.length;
  })()`);

  if (!hit) return;
  ev('try{ delSel(); }catch(e){}');
}

/* ------------------------------------------------------------------ */
/* Settings toggle                                                     */
/* ------------------------------------------------------------------ */

/** Add the switch to the engine's Settings drawer, once per open. */
function decorateSettings() {
  const drw = document.getElementById('gn-drw');
  if (!drw || drw.style.display !== 'block') return;
  if (!/Page turning/.test(drw.textContent || '')) return;
  if (drw.querySelector('#gn-scr-row')) return;

  const row = document.createElement('label');
  row.id = 'gn-scr-row';
  row.style.cssText =
    'display:flex;gap:8px;align-items:center;padding:6px 0;font-size:13px;cursor:pointer';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = 'gn-scr-toggle';
  cb.checked = enabled();
  cb.onchange = () => setEnabled(cb.checked);
  const span = document.createElement('span');
  span.innerHTML = 'Scribble to erase <span style="color:#8b95a3">(scratch out a word or shape to delete it)</span>';
  row.append(cb, span);
  drw.append(row);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', () => (trail = null), true);

  const drw = document.getElementById('gn-drw');
  if (drw) new MutationObserver(decorateSettings).observe(drw, { attributes: true, childList: true, subtree: true });

  (window as any).__inkpad_scribble = {
    on: enabled,
    set: setEnabled,
    /** exposed for tests: run the recogniser over a synthetic trail */
    apply,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
