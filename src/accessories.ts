/**
 * Accessories — the GoodNotes floating tools.
 *
 *   • Ruler        a draggable, rotatable straightedge; strokes drawn while it
 *                  is up are projected onto its edge, keeping their pressure
 *   • Zoom Window  a lens that magnifies the page under the pen
 *   • Time Keeper  a session timer for the open notebook
 *   • Toolbar      show/hide individual tools in the engine's own rows
 *
 * All four are additive: nothing here replaces an engine routine except the
 * ruler, which rewrites `cur.p` mid-gesture (the stroke object the engine is
 * already drawing), so undo, layers and export see an ordinary pen stroke.
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

function btn(className: string, text?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  if (text !== undefined) b.textContent = text;
  return b;
}

function div(className: string, text?: string): HTMLElement {
  const d = document.createElement('div');
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

function lsGet(k: string, fallback: string): string {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
}

function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

/** Map page units to client pixels for the live canvas. */
function pageToClient(): { left: number; top: number; sx: number; sy: number } | null {
  const cv = document.getElementById('cv') as HTMLCanvasElement | null;
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  return { left: r.left, top: r.top, sx: r.width / W, sy: r.height / H };
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  ruler: false,
  zoom: false,
  timer: false,
  hidden: [] as string[],
};

const HIDDEN_KEY = 'inkpad-hidden-tools';

function loadState() {
  try {
    const v = JSON.parse(lsGet(HIDDEN_KEY, '[]'));
    if (Array.isArray(v)) state.hidden = v.filter((x) => typeof x === 'string');
  } catch {
    /* ignore */
  }
  state.ruler = lsGet('inkpad-ruler', '0') === '1';
  state.zoom = lsGet('inkpad-zoomwin', '0') === '1';
  state.timer = lsGet('inkpad-timekeeper', '0') === '1';
}

function saveState() {
  lsSet('inkpad-ruler', state.ruler ? '1' : '0');
  lsSet('inkpad-zoomwin', state.zoom ? '1' : '0');
  lsSet('inkpad-timekeeper', state.timer ? '1' : '0');
  lsSet(HIDDEN_KEY, JSON.stringify(state.hidden));
}

/* ------------------------------------------------------------------ */
/* Ruler                                                               */
/* ------------------------------------------------------------------ */

interface Ruler {
  cx: number;
  cy: number;
  len: number;
  ang: number;
}

const ruler: Ruler = { cx: 400, cy: 620, len: 700, ang: 0 };
const RULER_H = 46; // on-screen px

let rulerEl: HTMLElement | null = null;

function clampRuler() {
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  ruler.len = Math.max(120, Math.min(ruler.len, Math.hypot(W, H)));
  ruler.cx = Math.max(-80, Math.min(W + 80, ruler.cx));
  ruler.cy = Math.max(-80, Math.min(H + 80, ruler.cy));
}

function placeRuler() {
  if (!rulerEl) return;
  const m = pageToClient();
  if (!m) return;
  const x = m.left + ruler.cx * m.sx;
  const y = m.top + ruler.cy * m.sy;
  const w = ruler.len * m.sx;
  rulerEl.style.width = Math.round(w) + 'px';
  rulerEl.style.left = Math.round(x) + 'px';
  rulerEl.style.top = Math.round(y) + 'px';
  rulerEl.style.transform = `translate(-50%,-50%) rotate(${ruler.ang}rad)`;
}

function buildRuler() {
  if (rulerEl) return;
  rulerEl = div('rl');
  rulerEl.id = 'gn-ruler';
  rulerEl.innerHTML =
    '<div class="rl-glass"></div>' +
    '<div class="rl-grip rl-move" title="Drag the ruler"></div>' +
    '<div class="rl-grip rl-rot" title="Rotate"></div>';
  document.body.append(rulerEl);

  const move = rulerEl.querySelector('.rl-move') as HTMLElement;
  const rot = rulerEl.querySelector('.rl-rot') as HTMLElement;

  move.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    move.setPointerCapture(e.pointerId);
    const m = pageToClient();
    if (!m) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const cx0 = ruler.cx;
    const cy0 = ruler.cy;
    const onMove = (ev2: PointerEvent) => {
      ruler.cx = cx0 + (ev2.clientX - x0) / m.sx;
      ruler.cy = cy0 + (ev2.clientY - y0) / m.sy;
      clampRuler();
      placeRuler();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  rot.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    rot.setPointerCapture(e.pointerId);
    const m = pageToClient();
    if (!m) return;
    const cx = m.left + ruler.cx * m.sx;
    const cy = m.top + ruler.cy * m.sy;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const base = ruler.ang;
    const onMove = (ev2: PointerEvent) => {
      const a = Math.atan2(ev2.clientY - cy, ev2.clientX - cx);
      ruler.ang = base + (a - a0);
      placeRuler();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function paintRuler() {
  if (!rulerEl) return;
  const on = editorOpen() && state.ruler;
  rulerEl.classList.toggle('on', on);
  if (on) placeRuler();
}

/**
 * Snap a page-space point onto the ruler edge nearest the stroke's origin.
 * Pressure (the third tuple slot) is preserved so the line still tapers.
 */
function project(pts: number[][], side: number): number[][] {
  const u = [Math.cos(ruler.ang), Math.sin(ruler.ang)];
  const n = [-u[1], u[0]];
  // place the line just outside the ruler's edge: the ruler is a fixed pixel
  // height, so the page-space offset has to go back through the canvas scale
  const scale = pageToClient()?.sy || 1;
  const half = (RULER_H / 2 + 4) / scale;
  const out: number[][] = [];
  for (const p of pts) {
    const dx = p[0] - ruler.cx;
    const dy = p[1] - ruler.cy;
    let t = dx * u[0] + dy * u[1];
    t = Math.max(-ruler.len / 2, Math.min(ruler.len / 2, t));
    const x = ruler.cx + u[0] * t + n[0] * half * side;
    const y = ruler.cy + u[1] * t + n[1] * half * side;
    out.push(p.length > 2 ? [x, y, p[2]] : [x, y]);
  }
  return out;
}

/** Which side of the ruler the pen started on. */
function sideOf(pts: number[][]): number {
  if (!pts.length) return -1;
  const n = [-Math.sin(ruler.ang), Math.cos(ruler.ang)];
  const dx = pts[0][0] - ruler.cx;
  const dy = pts[0][1] - ruler.cy;
  return dx * n[0] + dy * n[1] >= 0 ? 1 : -1;
}

let rulerLoop = 0;

function hookRuler() {
  const cv = document.getElementById('cv');
  if (!cv) return;

  cv.addEventListener(
    'pointerdown',
    (e) => {
      if (!state.ruler || !editorOpen()) return;
      const tool = ev<string>('tool');
      if (tool !== 'pen' && tool !== 'hl') return;
      if ((e.target as HTMLElement)?.closest?.('#gn-ruler')) return;

      let side = 0;
      const tick = () => {
        const cur = ev<any>('cur');
        if (!cur || !cur.p || !cur.p.length) {
          rulerLoop = 0;
          return;
        }
        if (!side) side = sideOf(cur.p);
        cur.p = project(cur.p, side);
        rulerLoop = window.requestAnimationFrame(tick);
      };
      rulerLoop = window.requestAnimationFrame(tick);
    },
    true
  );

  window.addEventListener(
    'pointerup',
    () => {
      if (rulerLoop) {
        window.cancelAnimationFrame(rulerLoop);
        rulerLoop = 0;
      }
      // one last pass, after the engine has appended its final samples
      window.setTimeout(() => {
        if (!state.ruler) return;
        const S = ev<any[]>('pg().strokes') || [];
        const last = S[S.length - 1];
        if (!last || (last.t !== 'pen' && last.t !== 'hl') || !last.p) return;
        last.p = project(last.p, sideOf(last.p));
        ev('try{ draw(); }catch(e){}');
      }, 0);
    },
    false
  );
}

/* ------------------------------------------------------------------ */
/* Zoom window                                                         */
/* ------------------------------------------------------------------ */

let zoomEl: HTMLElement | null = null;
let zoomCv: HTMLCanvasElement | null = null;
let zoomCtx: CanvasRenderingContext2D | null = null;

const ZOOM_SIZE = 190;
const ZOOM_FACTOR = 2.4;

function buildZoom() {
  if (zoomEl) return;
  zoomEl = div('zw');
  zoomEl.id = 'gn-zoomwin';
  zoomCv = document.createElement('canvas');
  zoomCv.width = ZOOM_SIZE;
  zoomCv.height = ZOOM_SIZE;
  zoomEl.append(zoomCv);
  const ring = div('zw-ring');
  zoomEl.append(ring);
  document.body.append(zoomEl);
  zoomCtx = zoomCv.getContext('2d');

  window.addEventListener('pointermove', onZoomMove, { passive: true });
}

function onZoomMove(e: PointerEvent) {
  if (!state.zoom || !editorOpen() || !zoomCtx || !zoomEl) return;
  const cv = document.getElementById('cv') as HTMLCanvasElement | null;
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
    zoomEl.classList.remove('on');
    return;
  }
  zoomEl.classList.add('on');

  // the lens sits up and to the left of the pen so it never covers the tip
  const x = Math.min(window.innerWidth - ZOOM_SIZE - 12, Math.max(12, e.clientX - ZOOM_SIZE - 34));
  const y = Math.min(window.innerHeight - ZOOM_SIZE - 12, Math.max(12, e.clientY - ZOOM_SIZE - 24));
  zoomEl.style.left = Math.round(x) + 'px';
  zoomEl.style.top = Math.round(y) + 'px';

  const bx = ((e.clientX - r.left) / r.width) * cv.width;
  const by = ((e.clientY - r.top) / r.height) * cv.height;
  const sw = ZOOM_SIZE / ZOOM_FACTOR;
  const sh = sw;

  zoomCtx.save();
  zoomCtx.fillStyle = '#fff';
  zoomCtx.fillRect(0, 0, ZOOM_SIZE, ZOOM_SIZE);
  zoomCtx.imageSmoothingEnabled = true;
  zoomCtx.drawImage(cv, bx - sw / 2, by - sh / 2, sw, sh, 0, 0, ZOOM_SIZE, ZOOM_SIZE);
  zoomCtx.restore();
}

function paintZoom() {
  if (!zoomEl) return;
  if (!state.zoom || !editorOpen()) zoomEl.classList.remove('on');
}

/* ------------------------------------------------------------------ */
/* Time keeper                                                         */
/* ------------------------------------------------------------------ */

interface TimerState {
  ms: number;
  startedAt: number;
  running: boolean;
}

const timer: TimerState = { ms: 0, startedAt: 0, running: false };
let timerEl: HTMLElement | null = null;
let timerFace: HTMLElement | null = null;
let timerTick = 0;

function timerKey(): string {
  const nb = ev<any>('nb');
  return 'inkpad-timer-' + (nb && nb.id != null ? nb.id : 'none');
}

function loadTimer() {
  try {
    const v = JSON.parse(lsGet(timerKey(), '{}'));
    if (v && typeof v.ms === 'number') {
      timer.ms = v.ms;
      timer.startedAt = 0;
      timer.running = false;
    }
  } catch {
    /* ignore */
  }
}

function saveTimer() {
  lsSet(timerKey(), JSON.stringify({ ms: timer.ms }));
}

function elapsed(): number {
  return timer.ms + (timer.running ? Date.now() - timer.startedAt : 0);
}

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function buildTimer() {
  if (timerEl) return;
  timerEl = div('tk');
  timerEl.id = 'gn-timekeeper';

  const dot = div('tk-dot');
  timerFace = div('tk-face', '0:00');
  const play = btn('tk-btn');
  play.title = 'Start / pause';
  play.dataset.role = 'play';
  play.onclick = () => {
    if (timer.running) {
      timer.ms = elapsed();
      timer.running = false;
    } else {
      timer.startedAt = Date.now();
      timer.running = true;
    }
    saveTimer();
    paintTimer();
  };

  const reset = btn('tk-btn');
  reset.title = 'Reset';
  reset.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/></svg>';
  reset.onclick = () => {
    timer.ms = 0;
    timer.running = false;
    saveTimer();
    paintTimer();
  };

  timerEl.append(dot, timerFace, play, reset);
  document.body.append(timerEl);

  window.clearInterval(timerTick);
  timerTick = window.setInterval(() => {
    if (!state.timer || !editorOpen()) return;
    if (timerFace) timerFace.textContent = fmt(elapsed());
  }, 500);
}

function paintTimer() {
  if (!timerEl) return;
  const on = state.timer && editorOpen();
  timerEl.classList.toggle('on', on);
  timerEl.classList.toggle('run', timer.running);
  if (timerFace) timerFace.textContent = fmt(elapsed());
  const play = timerEl.querySelector<HTMLElement>('[data-role="play"]');
  if (play) {
    play.innerHTML = timer.running
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.6" height="14" rx="1"/><rect x="13.4" y="5" width="3.6" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
  }
  const tb = document.getElementById('tb');
  if (tb) timerEl.style.top = Math.round(tb.getBoundingClientRect().bottom + 8) + 'px';
}

/* ------------------------------------------------------------------ */
/* Toolbar customization                                               */
/* ------------------------------------------------------------------ */

const TOOL_LABELS: Record<string, string> = {
  pen: 'Pen',
  hl: 'Highlighter',
  er: 'Eraser',
  pe: 'Precision eraser',
  line: 'Line',
  rect: 'Rectangle',
  ell: 'Oval',
  text: 'Text',
  sel: 'Lasso',
  laser: 'Laser pointer',
  bk: 'Bucket fill',
};

function applyHidden() {
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((n) => {
    const t = n.dataset.t || '';
    const hide = state.hidden.includes(t);
    n.style.display = hide ? 'none' : '';
  });
}

function buildToolSheet(): HTMLElement {
  const node = div('acc-sheet');
  node.id = 'acc-tools';
  const head = div('acc-sh', 'Toolbar');
  node.append(head);

  const list = div('acc-list');
  for (const [id, label] of Object.entries(TOOL_LABELS)) {
    const row = div('acc-row');
    const name = div('acc-name', label);
    const tg = btn('acc-tg');
    tg.dataset.tool = id;
    tg.onclick = () => {
      if (state.hidden.includes(id)) state.hidden = state.hidden.filter((x) => x !== id);
      else state.hidden.push(id);
      saveState();
      applyHidden();
      paintTools();
    };
    row.append(name, tg);
    list.append(row);
  }
  node.append(list);

  const foot = div('acc-foot');
  const reset = btn('acc-reset', 'Show all');
  reset.onclick = () => {
    state.hidden = [];
    saveState();
    applyHidden();
    paintTools();
  };
  foot.append(reset);
  node.append(foot);
  return node;
}

let toolSheet: HTMLElement | null = null;

function paintTools() {
  if (!toolSheet) return;
  toolSheet.querySelectorAll<HTMLElement>('.acc-tg').forEach((n) => {
    n.classList.toggle('on', !state.hidden.includes(n.dataset.tool || ''));
  });
  toolSheet
    .querySelectorAll<HTMLElement>('.acc-row')
    .forEach((r) => r.classList.toggle('off', state.hidden.includes(r.dataset.tool || '')));
}

/* ------------------------------------------------------------------ */
/* Accessory menu                                                      */
/* ------------------------------------------------------------------ */

let accBtn: HTMLElement | null = null;
let accPop: HTMLElement | null = null;

const MENU: { id: string; label: string; icon: string }[] = [
  {
    id: 'ruler',
    label: 'Ruler',
    icon: '<path d="M3 9h18v6H3z"/><path d="M7 9v3M11 9v3M15 9v3M19 9v3"/>',
  },
  {
    id: 'zoom',
    label: 'Zoom Window',
    icon: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 21 21M8.5 11h5M11 8.5v5"/>',
  },
  {
    id: 'timer',
    label: 'Time Keeper',
    icon: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 3h5"/>',
  },
  {
    id: 'tools',
    label: 'Toolbar Customization',
    icon: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  },
];

function buildMenu() {
  if (accPop) return;
  accPop = div('acc-pop');
  accPop.id = 'acc-pop';
  const head = div('acc-sh', 'Accessories');
  accPop.append(head);

  for (const item of MENU) {
    const row = btn('acc-item');
    row.dataset.acc = item.id;
    row.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
      `stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>` +
      `<span>${item.label}</span><i class="acc-sw"></i>`;
    row.onclick = () => {
      if (item.id === 'tools') {
        toolSheet?.classList.toggle('on');
        paintTools();
        if (toolSheet?.classList.contains('on')) placeUnder(toolSheet, row);
        return;
      }
      toggle(item.id as 'ruler' | 'zoom' | 'timer');
      paintMenu();
    };
    accPop.append(row);
  }

  document.body.append(accPop);

  toolSheet = buildToolSheet();
  document.body.append(toolSheet);

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest) return;
      if (t.closest('#acc-pop') || t.closest('#acc-trigger') || t.closest('#acc-tools')) return;
      accPop?.classList.remove('on');
      toolSheet?.classList.remove('on');
    },
    true
  );
}

function toggle(id: 'ruler' | 'zoom' | 'timer') {
  state[id] = !state[id];
  saveState();
  if (id === 'ruler') paintRuler();
  if (id === 'zoom') paintZoom();
  if (id === 'timer') {
    loadTimer();
    paintTimer();
  }
}

function paintMenu() {
  if (!accPop) return;
  accPop.querySelectorAll<HTMLElement>('.acc-item').forEach((n) => {
    const id = n.dataset.acc || '';
    if (id === 'tools') return;
    n.classList.toggle('on', !!(state as any)[id]);
  });
  accBtn?.classList.toggle('on', state.ruler || state.zoom || state.timer);
}

function placeUnder(node: HTMLElement, anchor: HTMLElement) {
  node.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const tb = document.getElementById('tb');
  const floor = tb ? Math.round(tb.getBoundingClientRect().bottom) : r.bottom;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
  let top = Math.max(r.bottom, floor) + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  node.style.left = Math.round(left) + 'px';
  node.style.top = Math.round(top) + 'px';
}

function hookTrigger() {
  if (accBtn) return;
  const bar = document.getElementById('bar');
  if (!bar) return;

  accBtn = btn('');
  accBtn.id = 'acc-trigger';
  accBtn.title = 'Accessories';
  accBtn.setAttribute('aria-label', 'Accessories');
  accBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9z"/>' +
    '<path d="M18.5 16.5 19.3 19l2.2.8-2.2.8-.8 2.4"/></svg>';
  accBtn.onclick = (e) => {
    e.stopPropagation();
    if (!accPop) return;
    if (accPop.classList.contains('on')) {
      accPop.classList.remove('on');
      return;
    }
    paintMenu();
    placeUnder(accPop, accBtn!);
  };
  bar.append(accBtn);
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#acc-trigger{
  width:30px;height:30px;border-radius:8px;border:0!important;background:transparent!important;
  color:#3c4654;cursor:pointer;display:grid;place-items:center;padding:0!important;flex:none;
}
#acc-trigger:hover{background:#eef1f6}
#acc-trigger.on{background:#e3edff!important;color:#1f4fbf}
#acc-trigger svg{width:18px;height:18px;display:block}

#acc-pop{
  position:fixed;z-index:44;display:none;width:238px;padding:8px;
  background:#fff;border:1px solid #eef1f6;border-radius:14px;
  box-shadow:0 16px 38px rgba(8,20,38,.20),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;
}
#acc-pop.on{display:block}
.acc-sh{
  font:700 9.5px/1 inherit;letter-spacing:.09em;text-transform:uppercase;
  color:#8b95a3;margin:2px 0 8px 5px;
}
.acc-item{
  width:100%;display:flex;align-items:center;gap:9px;border:0!important;
  background:transparent!important;border-radius:9px;padding:7px 7px!important;
  cursor:pointer;color:#3c4654;font:600 12.5px/1 inherit;text-align:left;
}
.acc-item:hover{background:#f4f7fb}
.acc-item.on{background:#eef4ff!important;color:#1f4fbf}
.acc-item svg{width:18px;height:18px;flex:none;opacity:.85}
.acc-item span{flex:1}
.acc-item .acc-sw{
  width:32px;height:18px;border-radius:999px;background:#d8dee7!important;position:relative;flex:none;
  transition:background .15s ease;
}
.acc-item .acc-sw::after{
  content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
  background:#fff;box-shadow:0 1px 2px rgba(16,32,64,.3);transition:transform .15s ease;
}
.acc-item.on .acc-sw{background:#2f6df6!important}
.acc-item.on .acc-sw::after{transform:translateX(14px)}

#acc-tools{
  position:fixed;z-index:45;display:none;width:212px;padding:10px 10px 8px;
  background:#fff;border:1px solid #eef1f6;border-radius:14px;
  box-shadow:0 16px 38px rgba(8,20,38,.20),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;max-height:70vh;overflow:auto;
}
#acc-tools.on{display:block}
.acc-list{display:flex;flex-direction:column;gap:1px}
.acc-row{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 7px;border-radius:8px}
.acc-row:hover{background:#f6f8fb}
.acc-name{flex:1;font:500 12px/1.3 inherit;color:#3c4654}
.acc-tg{
  width:32px;height:18px;border-radius:999px;border:0!important;background:#d8dee7!important;
  position:relative;cursor:pointer;flex:none;padding:0!important;transition:background .15s ease;
}
.acc-tg::after{
  content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
  background:#fff;box-shadow:0 1px 2px rgba(16,32,64,.3);transition:transform .15s ease;
}
.acc-tg.on{background:#2f6df6!important}
.acc-tg.on::after{transform:translateX(14px)}
.acc-foot{display:flex;justify-content:flex-end;margin-top:6px;padding-top:6px;border-top:1px solid #eef1f6}
.acc-reset{
  border:0!important;background:transparent!important;color:#2f6df6!important;
  font:700 11px/1 inherit;cursor:pointer;padding:5px 7px!important;border-radius:7px;
}
.acc-reset:hover{background:#eef4ff}

#gn-ruler{
  position:fixed;z-index:27;display:none;height:46px;
  transform-origin:center center;pointer-events:none;
  filter:drop-shadow(0 6px 14px rgba(16,32,64,.22));
}
#gn-ruler.on{display:block}
#gn-ruler .rl-glass{
  position:absolute;inset:0;border-radius:6px;
  background:
    repeating-linear-gradient(90deg,rgba(40,60,90,.55) 0 1px,transparent 1px 10px),
    repeating-linear-gradient(90deg,rgba(40,60,90,.9) 0 1px,transparent 1px 50px),
    linear-gradient(180deg,rgba(255,248,220,.72),rgba(255,240,196,.62));
  border:1px solid rgba(120,140,170,.55);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.85),inset 0 -1px 0 rgba(120,140,170,.35);
}
#gn-ruler .rl-grip{
  position:absolute;pointer-events:auto;cursor:grab;
  background:rgba(255,255,255,.9);border:1px solid rgba(120,140,170,.6);
  border-radius:999px;
}
#gn-ruler .rl-move{
  left:50%;top:50%;width:46px;height:16px;margin:-8px 0 0 -23px;
  background:
    repeating-linear-gradient(90deg,rgba(120,140,170,.7) 0 1px,transparent 1px 5px),
    rgba(255,255,255,.92);
}
#gn-ruler .rl-rot{
  right:-11px;top:50%;width:22px;height:22px;margin-top:-11px;cursor:ew-resize;
  background:
    radial-gradient(circle at 50% 50%,#2f6df6 0 3px,transparent 3px),
    rgba(255,255,255,.95);
}

#gn-zoomwin{
  position:fixed;z-index:29;display:none;width:190px;height:190px;border-radius:50%;
  overflow:hidden;background:#fff;pointer-events:none;
  box-shadow:0 10px 30px rgba(16,32,64,.28),0 0 0 3px rgba(255,255,255,.9),0 0 0 4px rgba(120,140,170,.45);
}
#gn-zoomwin.on{display:block}
#gn-zoomwin canvas{display:block;width:190px;height:190px}
#gn-zoomwin .zw-ring{
  position:absolute;inset:0;border-radius:50%;
  box-shadow:inset 0 0 22px rgba(16,32,64,.14);
}

#gn-timekeeper{
  position:fixed;left:16px;z-index:28;display:none;
  align-items:center;gap:7px;padding:5px 7px 5px 10px;border-radius:999px;
  background:#fff;border:1px solid #eef1f6;font-family:inherit;
  box-shadow:0 8px 24px rgba(8,20,38,.18),0 1px 3px rgba(8,20,38,.08);
}
#gn-timekeeper.on{display:flex}
#gn-timekeeper .tk-dot{width:7px;height:7px;border-radius:50%;background:#c8d0da;flex:none}
#gn-timekeeper.run .tk-dot{background:#e5383b;box-shadow:0 0 0 3px rgba(229,56,59,.18)}
#gn-timekeeper .tk-face{
  font:700 12.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:#2b3542;font-variant-numeric:tabular-nums;min-width:44px;
}
#gn-timekeeper .tk-btn{
  width:26px;height:26px;border-radius:50%;border:0!important;background:#f2f5fa!important;
  color:#3c4654;display:grid;place-items:center;cursor:pointer;padding:0!important;flex:none;
}
#gn-timekeeper .tk-btn:hover{background:#e6ecf6!important}
#gn-timekeeper .tk-btn svg{width:13px;height:13px;display:block}
@media(max-width:620px){
  #gn-zoomwin{width:140px;height:140px}
  #gn-zoomwin canvas{width:140px;height:140px}
  #acc-pop,#acc-tools{width:min(92vw,238px)}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!document.getElementById('ed')) return;

  const style = document.createElement('style');
  style.id = 'gn-acc-style';
  style.textContent = CSS;
  document.head.append(style);

  loadState();
  buildRuler();
  buildZoom();
  buildTimer();
  buildMenu();
  hookTrigger();
  hookRuler();
  applyHidden();

  let lastOpen = false;
  window.setInterval(() => {
    const open = editorOpen();
    if (open !== lastOpen) {
      lastOpen = open;
      if (!open) {
        rulerEl?.classList.remove('on');
        zoomEl?.classList.remove('on');
        timerEl?.classList.remove('on');
      }
      paintRuler();
      paintZoom();
      paintTimer();
      paintMenu();
    }
    if (open && state.ruler) placeRuler();
  }, 250);

  window.addEventListener('resize', () => {
    paintRuler();
    paintTimer();
  });

  (window as any).__inkpad_acc = {
    state,
    ruler,
    timer,
    toggle,
    project,
    paint: () => {
      paintRuler();
      paintZoom();
      paintTimer();
      paintMenu();
    },
    hidden: () => state.hidden,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
