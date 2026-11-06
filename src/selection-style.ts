/**
 * Selection properties — stroke weight and colour for whatever is selected.
 *
 * The engine has always known how to restyle a selection: `setBrush` writes
 * `s.w` and `setCol` writes `s.c`. What was missing was a control, so changing
 * the weight of a line you had already drawn meant deleting it and drawing it
 * again. These two live in the selection bar, which is only on screen while
 * something is selected — the properties and the object they belong to appear
 * and disappear together.
 *
 * Two deliberate exclusions:
 *   • Text is skipped by the weight control. A text stroke's `w` is its WRAP
 *     WIDTH, not a stroke weight, so writing it would re-flow the paragraph
 *     instead of thickening anything.
 *   • Images and video have no stroke, so they are skipped by both.
 *
 * Undo is one entry per interaction: a click on − or + is one step, and a
 * session with the colour picker is one step no matter how far the user drags
 * around the wheel.
 */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

const MIN_W = 0.5;
const MAX_W = 120;
/** One click multiplies by this, so the control works from 0.5 to 120 alike. */
const STEP = 1.25;

let cluster: HTMLElement | null = null;
let widthOut: HTMLElement | null = null;
let swatch: HTMLElement | null = null;
let colorInput: HTMLInputElement | null = null;
/** One undo entry per colour-picker session, not per `input` event. */
let colorArmed = false;

function selected(): any[] {
  return (ev<any[]>('sel') || []).filter(Boolean);
}

/** Strokes whose `w` really is a stroke weight. */
function weightTargets(list: any[]): any[] {
  return list.filter(
    (s) => typeof s.w === 'number' && s.t !== 'text' && s.t !== 'img' && s.t !== 'vid' && s.t !== 'ers'
  );
}

function colorTargets(list: any[]): any[] {
  return list.filter((s) => s.t !== 'img' && s.t !== 'vid' && s.t !== 'ers' && s.c);
}

function repaint() {
  ev('try{ draw(); save(); thumbs(); }catch(e){}');
}

function setWidth(w: number) {
  const targets = weightTargets(selected());
  if (!targets.length) return;
  const v = Math.max(MIN_W, Math.min(MAX_W, w));
  targets.forEach((s) => {
    s.w = v;
  });
  repaint();
  paint();
}

function setColor(c: string) {
  const targets = colorTargets(selected());
  if (!targets.length) return;
  targets.forEach((s) => {
    s.c = c;
  });
  // Keep the engine's own ink in step, so the next stroke matches what the
  // user just chose rather than the colour they picked an hour ago.
  ev(
    `(function(){ try{ color=${JSON.stringify(c)}; var n=document.getElementById('col'); if(n) n.value=${JSON.stringify(c)}; }catch(e){} })()`
  );
  repaint();
  paint();
}

function fmt(w: number): string {
  const r = Math.round(w * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function step(dir: number) {
  const targets = weightTargets(selected());
  if (!targets.length) return;
  const base = Number(targets[0].w) || 1;
  const next = dir > 0 ? base * STEP : base / STEP;
  // A single undo entry per click: the value is derived from the selection, so
  // there is nothing to coalesce.
  ev('try{ snap(); }catch(e){}');
  setWidth(Math.round(next * 10) / 10);
}

function build() {
  const bar = document.getElementById('sbar');
  if (!bar || cluster) return false;

  cluster = document.createElement('div');
  cluster.id = 'ss-cluster';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'ss-step';
  minus.dataset.step = '-1';
  minus.title = 'Thinner';
  minus.setAttribute('aria-label', 'Thinner');
  minus.textContent = '−';
  minus.onclick = (e) => {
    e.stopPropagation();
    step(-1);
  };

  widthOut = document.createElement('span');
  widthOut.className = 'ss-w';
  widthOut.textContent = '3';
  widthOut.title = 'Stroke weight';

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'ss-step';
  plus.dataset.step = '1';
  plus.title = 'Thicker';
  plus.setAttribute('aria-label', 'Thicker');
  plus.textContent = '+';
  plus.onclick = (e) => {
    e.stopPropagation();
    step(1);
  };

  const color = document.createElement('label');
  color.className = 'ss-color';
  color.title = 'Colour';

  swatch = document.createElement('span');
  swatch.className = 'ss-swatch';

  colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#111111';
  colorInput.setAttribute('aria-label', 'Colour');
  colorInput.addEventListener('input', () => {
    if (!colorArmed) {
      ev('try{ snap(); }catch(e){}');
      colorArmed = true;
    }
    setColor(colorInput!.value);
  });
  colorInput.addEventListener('change', () => {
    colorArmed = false;
    ev('try{ save(); }catch(e){}');
  });

  color.append(swatch, colorInput);
  cluster.append(minus, widthOut, plus, color);
  // Properties before actions reads better than burying them after "Warp".
  bar.prepend(cluster);

  const style = document.createElement('style');
  style.id = 'ss-style';
  style.textContent = CSS;
  document.head.append(style);
  return true;
}

function paint() {
  if (!cluster) return;
  const list = selected();
  const wTargets = weightTargets(list);
  const cTargets = colorTargets(list);

  cluster.classList.toggle('ss-off', !wTargets.length && !cTargets.length);

  const stepBtns = cluster.querySelectorAll<HTMLButtonElement>('.ss-step');
  stepBtns.forEach((b) => {
    b.disabled = !wTargets.length;
  });
  if (widthOut) {
    widthOut.textContent = wTargets.length ? fmt(Number(wTargets[0].w) || 0) : '—';
    widthOut.classList.toggle('ss-dim', !wTargets.length);
  }

  if (swatch) {
    const c = cTargets.length ? String(cTargets[0].c) : '';
    swatch.style.background = c || 'transparent';
    swatch.classList.toggle('ss-none', !c);
  }
  const colorWrap = cluster.querySelector<HTMLElement>('.ss-color');
  if (colorWrap) {
    colorWrap.classList.toggle('ss-disabled', !cTargets.length);
    if (cTargets.length && colorInput && document.activeElement !== colorInput) {
      const v = String(cTargets[0].c);
      // only accept a real hex, or the input silently resets to black
      if (/^#[0-9a-f]{6}$/i.test(v)) colorInput.value = v;
    }
  }
}

const CSS = `
#ss-cluster{
  display:flex;align-items:center;gap:3px;flex:none;
  background:var(--bd,#e3e7ee);border-radius:9px;padding:2px;
  margin-right:2px;
}
#ss-cluster.ss-off{opacity:.45}
#ss-cluster .ss-step{
  width:22px;height:22px;padding:0;border:0;border-radius:6px;
  background:var(--sf,#fff);color:inherit;cursor:pointer;
  font:600 14px/1 var(--slate-font,system-ui);display:grid;place-items:center;
}
#ss-cluster .ss-step:hover:not(:disabled){background:rgba(127,127,127,.18)}
#ss-cluster .ss-step:disabled{cursor:default;opacity:.4}
#ss-cluster .ss-w{
  min-width:26px;text-align:center;color:inherit;
  font:600 11px/1 var(--slate-font-mono,ui-monospace);
  font-variant-numeric:tabular-nums;
}
#ss-cluster .ss-w.ss-dim{opacity:.4}
#ss-cluster .ss-color{
  position:relative;width:22px;height:22px;border-radius:6px;overflow:hidden;
  background:var(--sf,#fff);cursor:pointer;flex:none;
  box-shadow:inset 0 0 0 1px rgba(127,127,127,.35);
}
#ss-cluster .ss-color.ss-disabled{cursor:default;opacity:.5}
#ss-cluster .ss-swatch{
  position:absolute;inset:4px;border-radius:3px;pointer-events:none;
  background:#111;
}
#ss-cluster .ss-swatch.ss-none{
  background:linear-gradient(135deg,transparent 45%,#e2574c 45% 55%,transparent 55%);
}
#ss-cluster .ss-color input{
  position:absolute;inset:-8px;width:calc(100% + 16px);height:calc(100% + 16px);
  border:0;padding:0;background:none;cursor:pointer;opacity:0;
}
`;

function boot() {
  let tries = 0;
  const start = () => {
    if (build()) {
      paint();
      window.setInterval(paint, 240);
      return;
    }
    // The selection bar is built by the engine's own init, which can land after
    // this module evaluates.
    if (++tries < 40) window.setTimeout(start, 150);
  };
  start();

  (window as any).__slateSelStyle = {
    step,
    setWidth: (w: number) => {
      ev('try{ snap(); }catch(e){}');
      setWidth(w);
    },
    setColor: (c: string) => {
      ev('try{ snap(); }catch(e){}');
      setColor(c);
    },
    weightTargets: () => weightTargets(selected()).length,
    colorTargets: () => colorTargets(selected()).length,
    cluster: () => cluster,
    width: () => (weightTargets(selected())[0] || {}).w,
    color: () => (colorTargets(selected())[0] || {}).c,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
