/**
 * Accessories — the GoodNotes floating tools.
 *
 *   • Ruler & Guides   the engine's own straightedge, circle, grids and thirds,
 *                      with stroke snapping — surfaced here instead of being
 *                      buried behind an icon in the secondary row
 *   • Symmetry         vertical / horizontal / quad / radial / kaleidoscope
 *   • Perspective      1-, 2- and 3-point guides with stroke snapping
 *   • Zoom Window      a lens that magnifies the page under the pen
 *   • Time Keeper      a session timer for the open notebook
 *   • Toolbar          show/hide individual tools in the engine's own rows
 *
 * Everything is additive. The guides are the engine's own (`GD`), so strokes
 * snap in `pos()` and symmetry copies are written by `symAdd()` — this module
 * only puts a menu in front of them.
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
  // older builds stored tools that no longer exist as separate buttons
  const known = new Set([...Object.keys(TOOL_LABELS), ...Object.keys(EXTRA)]);
  state.hidden = state.hidden.filter((k) => known.has(k));
  state.zoom = lsGet('inkpad-zoomwin', '0') === '1';
  state.timer = lsGet('inkpad-timekeeper', '0') === '1';
}

function saveState() {
  lsSet('inkpad-zoomwin', state.zoom ? '1' : '0');
  lsSet('inkpad-timekeeper', state.timer ? '1' : '0');
  lsSet(HIDDEN_KEY, JSON.stringify(state.hidden));
}

/* ------------------------------------------------------------------ */
/* Guides, symmetry and perspective (the engine's own)                 */
/* ------------------------------------------------------------------ */

type GuideKind = 'g' | 's' | 'p';

interface GuideState {
  g: string;
  s: string;
  p: string;
  sn: number;
}

function guideState(): GuideState {
  const g = ev<GuideState>('GD');
  return g && typeof g === 'object' ? g : { g: 'none', s: 'none', p: 'none', sn: 6 };
}

function guideOn(kind: GuideKind): boolean {
  return guideState()[kind] !== 'none';
}

/** The value each mode falls back to when you switch it on. */
const GUIDE_ON: Record<GuideKind, string> = { g: 'ruler', s: 'v', p: '2' };

function setGuide(kind: GuideKind, on: boolean) {
  const val = on ? GUIDE_ON[kind] : 'none';
  ev(`(function(){
    try{
      gdInit();
      GD.${kind} = ${JSON.stringify(val)};
      if(${JSON.stringify(kind)} === 'p'){
        const hy = H * 0.35;
        GD.vp = GD.p === '1' ? [[W/2,hy]] : GD.p === '2' ? [[W*0.08,hy],[W*0.92,hy]] : [[W*0.08,hy],[W*0.92,hy],[W/2,H*0.98]];
      }
      gdSave();
      draw();
    }catch(e){}
  })()`);
  paintMenu();
}

/** Open the engine's own guides drawer — it holds every option for all three. */
function openGuidePanel() {
  ev(`(function(){
    try{ openDr(document.getElementById('acc-trigger'), fillGuides); }catch(e){}
  })()`);
}

/**
 * Make every guide snap, not just two of them.
 *
 * The engine's `gdTool()` only turns snapping on for the straight ruler, the
 * circle and perspective lines — pick the square grid, the isometric grid or
 * thirds and `SNAPON` stays false, so the stroke is pure freehand. Its `gSnap()`
 * also has no case for those three kinds at all, and it latches the first point
 * onto a *line* for the whole stroke, which is right for a ruler and wrong for a
 * lattice.
 *
 * So: widen the tool test, keep the engine's latch for the ruler/circle/
 * perspective, widen the ruler's reach to the band that is actually drawn, and
 * add per-point snapping for the three kinds it ignores.
 */
function hookGuideSnap() {
  ev(`(function(){
    if (window.__gnGuideHooked) return;
    window.__gnGuideHooked = true;

    function k(){ return W / cv.getBoundingClientRect().width; }

    var origTool = gdTool;
    gdTool = function(){
      var base = origTool.apply(this, arguments);   // resets SNL, keep that
      if (base) return true;
      if (!['pen','hl','line','arrow','hid'].includes(tool)) return false;
      return GD.g !== 'none' || GD.p !== 'none';
    };

    var origSnap = gSnap;

    function snapLattice(q, g){
      var s = k(), th = 14 * s, x = q[0], y = q[1], best = null, bd = th;

      if (g === 'grid') {
        var gx = 32 * Math.round(x / 32), gy = 32 * Math.round(y / 32);
        var dx = Math.abs(x - gx), dy = Math.abs(y - gy);
        // an intersection when both axes are close, otherwise the nearer axis
        if (dx < bd && dy < bd) return [gx, gy];
        if (dx < bd && dx <= dy) return [gx, y];
        if (dy < bd) return [x, gy];
        return q;
      }

      if (g === 'iso') {
        // dots sit on rows of height g*0.866, every other row offset by g/2
        var step = 32, hh = step * 0.866;
        var row = Math.round((y - step) / hh);
        for (var r = row - 1; r <= row + 1; r++) {
          var oy = step + r * hh;
          var off = r % 2 ? step / 2 : 0;
          var col = Math.round((x - step - off) / step);
          for (var c = col - 1; c <= col + 1; c++) {
            var ox = step + off + c * step;
            var d = Math.hypot(x - ox, y - oy);
            if (d < bd) { bd = d; best = [ox, oy]; }
          }
        }
        return best || q;
      }

      // thirds: three vertical and three horizontal rules
      var fs = [1/3, 0.5, 2/3];
      for (var i = 0; i < fs.length; i++) {
        var vx = W * fs[i], vy = H * fs[i];
        var d2 = Math.abs(x - vx);
        if (d2 < bd) { bd = d2; best = [vx, y]; }
        d2 = Math.abs(y - vy);
        if (d2 < bd) { bd = d2; best = [x, vy]; }
      }
      return best || q;
    }

    gSnap = function(q){
      var g = GD.g;
      if (g === 'grid' || g === 'iso' || g === 'third') return snapLattice(q, g);

      // the straight ruler's band is drawn 22 px either side of the line but the
      // engine only latches within 16, so the outer part of the band did nothing
      if (g === 'ruler' && SNL === null) {
        var s = k(), r = GD.r, d = [Math.cos(r.a), Math.sin(r.a)], hl = r.l / 2;
        var t = Math.max(-hl, Math.min(hl, (q[0]-r.x)*d[0] + (q[1]-r.y)*d[1]));
        var px = r.x + d[0]*t, py = r.y + d[1]*t;
        if (Math.hypot(q[0]-px, q[1]-py) < 26 * s) {
          SNL = { t:'l', p:[r.x, r.y], d:d, hl:hl };
        }
      }
      return origSnap.apply(this, arguments);
    };

    // The handles were grabbed within 18 px while the dots are drawn at 10, so
    // pressing near the middle of the ruler moved it instead of drawing. Match
    // the hit area to what you can see.
    var origDown = gdDown;
    gdDown = function(x, y){
      if (!nb || (GD.g === 'none' && GD.s === 'none' && GD.p === 'none')) return false;
      gdInit();
      var s = k(), hs = gdHandles();
      for (var i = hs.length - 1; i >= 0; i--) {
        if (Math.hypot(x - hs[i].p[0], y - hs[i].p[1]) < 10 * s) { GDR = hs[i]; return true; }
      }
      return false;
    };
  })()`);
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
  text: 'Text',
  sel: 'Lasso',
  laser: 'Laser pointer',
  bk: 'Bucket fill',
};

/**
 * Buttons that are ours rather than the engine's `[data-t]` tools. They belong
 * in the same list — a toolbar editor that cannot hide half the toolbar is not
 * a toolbar editor.
 */
const EXTRA: Record<string, string> = {
  shapes: '#sh-trigger',
  img: '#img',
  stickers: '#gn-stk-btn',
  notes: '#gn-note-btn',
  snap: '#snap-btn',
  undo: '#undo',
  redo: '#redo',
  accessories: '#acc-trigger',
};

const EXTRA_LABELS: Record<string, string> = {
  shapes: 'Shapes',
  img: 'Image',
  stickers: 'Stickers',
  notes: 'Sticky notes',
  snap: 'Snap',
  undo: 'Undo',
  redo: 'Redo',
  accessories: 'Accessories',
};

function applyHidden() {
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((n) => {
    const t = n.dataset.t || '';
    const hide = state.hidden.includes(t);
    n.style.display = hide ? 'none' : '';
  });
  for (const [key, sel] of Object.entries(EXTRA)) {
    const n = document.querySelector<HTMLElement>(`#tb ${sel}`);
    if (!n) continue;
    n.style.display = state.hidden.includes(key) ? 'none' : '';
  }
}

function buildToolSheet(): HTMLElement {
  const node = div('acc-sheet');
  node.id = 'acc-tools';
  const head = div('acc-sh', 'Toolbar');
  node.append(head);

  const list = div('acc-list');
  const rows: [string, string][] = [
    ...Object.entries(TOOL_LABELS),
    ...Object.entries(EXTRA_LABELS),
  ];
  for (const [id, label] of rows) {
    const row = div('acc-row');
    row.dataset.tool = id;
    const name = div('acc-name', label);
    const tg = btn('acc-tg');
    tg.dataset.tool = id;
    tg.setAttribute('role', 'switch');
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
  const hint = div('acc-hint', 'All tools shown');
  const reset = btn('acc-reset', 'Show all');
  reset.onclick = () => {
    if (!state.hidden.length) return;
    state.hidden = [];
    saveState();
    applyHidden();
    paintTools();
  };
  foot.append(hint, reset);
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

  // the footer used to look dead: it did the same nothing whether or not a tool
  // was hidden. Say how many are hidden and disable the button at zero.
  const n = state.hidden.length;
  const hint = toolSheet.querySelector<HTMLElement>('.acc-hint');
  const reset = toolSheet.querySelector<HTMLButtonElement>('.acc-reset');
  if (hint) hint.textContent = n ? `${n} hidden` : 'All tools shown';
  if (reset) {
    reset.disabled = n === 0;
    reset.classList.toggle('idle', n === 0);
    reset.textContent = n ? 'Show all' : 'Reset';
  }
}

/* ------------------------------------------------------------------ */
/* Accessory menu                                                      */
/* ------------------------------------------------------------------ */

let accBtn: HTMLElement | null = null;
let accPop: HTMLElement | null = null;

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  /** present for the three guide rows — these read their state from the engine */
  kind?: GuideKind;
}

const MENU: MenuItem[] = [
  {
    id: 'guides',
    label: 'Ruler & Guides',
    kind: 'g',
    icon: '<path d="M3 9h18v6H3z"/><path d="M7 9v3M11 9v3M15 9v3M19 9v3"/>',
  },
  {
    id: 'symmetry',
    label: 'Symmetry',
    kind: 's',
    icon: '<path d="M12 3v18"/><path d="M8.5 7.5 4.5 12l4 4.5M15.5 7.5l4 4.5-4 4.5"/>',
  },
  {
    id: 'perspective',
    label: 'Perspective',
    kind: 'p',
    icon: '<path d="M3 20 12 6.5 21 20"/><path d="M7.2 13.4h9.6"/>',
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

const ICON_MORE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/>' +
  '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg>';

const ICON_GO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 6 6 6-6 6"/></svg>';

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
      `<span>${item.label}</span>`;

    if (item.kind) {
      // a second, smaller control: open the engine's drawer for the full set of
      // options (which ruler, which symmetry, how many segments, …)
      const more = btn('acc-more');
      more.title = 'More options';
      more.setAttribute('aria-label', item.label + ' options');
      more.innerHTML = ICON_MORE;
      more.onclick = (e) => {
        e.stopPropagation();
        openGuidePanel();
      };
      row.append(more);
    } else if (item.id === 'tools') {
      const go = el('i', '') as HTMLElement;
      go.className = 'acc-go';
      go.innerHTML = ICON_GO;
      row.append(go);
    }

    if (item.id !== 'tools') {
      const sw = div('acc-sw');
      row.append(sw);
    }

    row.onclick = () => {
      if (item.id === 'tools') {
        toolSheet?.classList.toggle('on');
        paintTools();
        // hang the sheet under the menu it came from, not under its own row,
        // or it covers the item you just pressed
        if (toolSheet?.classList.contains('on')) placeUnder(toolSheet, accPop || row);
        return;
      }
      toggle(item.id);
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

function toggle(id: string) {
  const item = MENU.find((m) => m.id === id);
  if (item && item.kind) {
    setGuide(item.kind, !guideOn(item.kind));
    return;
  }
  if (id === 'zoom') {
    state.zoom = !state.zoom;
    saveState();
    paintZoom();
  } else if (id === 'timer') {
    state.timer = !state.timer;
    saveState();
    loadTimer();
    paintTimer();
  }
}

function paintMenu() {
  if (!accPop) return;
  const g = guideState();
  let any = false;
  accPop.querySelectorAll<HTMLElement>('.acc-item').forEach((n) => {
    const id = n.dataset.acc || '';
    const item = MENU.find((m) => m.id === id);
    let on = false;
    if (item && item.kind) on = g[item.kind] !== 'none';
    else if (id === 'zoom') on = state.zoom;
    else if (id === 'timer') on = state.timer;
    n.classList.toggle('on', on);
    if (on) any = true;
  });
  accBtn?.classList.toggle('on', any);
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
      toolSheet?.classList.remove('on');
      return;
    }
    // the customization sheet is anchored to this menu; it must not outlive it
    toolSheet?.classList.remove('on');
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
.acc-more{
  width:22px;height:22px;border-radius:6px;border:0!important;background:transparent!important;
  color:#9aa5b4;display:grid;place-items:center;padding:0!important;flex:none;cursor:pointer;
}
.acc-more:hover{background:#e9eff9!important;color:#2f6df6}
.acc-more svg{width:15px;height:15px;display:block}
.acc-item.on .acc-more{color:#7f9ee0}
.acc-go{width:22px;height:22px;display:grid;place-items:center;flex:none;color:#b3bcc8}
.acc-go svg{width:14px;height:14px;display:block}

#acc-tools{
  position:fixed;z-index:45;display:none;width:228px;padding:10px 10px 0;
  background:#fff;border:1px solid #eef1f6;border-radius:14px;
  box-shadow:0 16px 38px rgba(8,20,38,.20),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;max-height:min(72vh,470px);
  flex-direction:column;overflow:hidden;
}
#acc-tools.on{display:flex}
#acc-tools .acc-sh{flex:none}
.acc-list{display:flex;flex-direction:column;gap:1px;flex:1;overflow:auto;min-height:0;padding-bottom:4px}
.acc-row{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 7px;border-radius:8px}
.acc-row:hover{background:#f6f8fb}
.acc-row.off .acc-name{color:#a6b0bd}
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
.acc-foot{
  display:flex;justify-content:stretch;align-items:center;gap:8px;flex:none;margin:0 -10px;
  padding:8px 10px 9px;border-top:1px solid #eef1f6;background:#fff;
}
.acc-hint{flex:1;font:600 10.5px/1 inherit;color:#9aa5b4;letter-spacing:.02em}
.acc-reset{
  flex:none;border:0!important;background:#eef4ff!important;color:#2f6df6!important;
  font:700 12px/1 inherit;cursor:pointer;padding:9px 14px!important;border-radius:9px;
}
.acc-reset:hover{background:#e2ecff!important}
.acc-reset.idle{background:#f4f6f9!important;color:#aab3bf!important;cursor:default}

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
  buildZoom();
  buildTimer();
  buildMenu();
  hookTrigger();
  hookGuideSnap();
  applyHidden();

  let lastOpen = false;
  window.setInterval(() => {
    const open = editorOpen();
    if (open !== lastOpen) {
      lastOpen = open;
      if (!open) {
        zoomEl?.classList.remove('on');
        timerEl?.classList.remove('on');
      }
      paintZoom();
      paintTimer();
      paintMenu();
    }
  }, 250);

  window.addEventListener('resize', () => {
    paintTimer();
  });

  (window as any).__inkpad_acc = {
    state,
    timer,
    toggle,
    guideState,
    setGuide,
    openGuidePanel,
    paint: () => {
      paintZoom();
      paintTimer();
      paintMenu();
    },
    hidden: () => state.hidden,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
