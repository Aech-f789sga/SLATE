/**
 * Accessories — the GoodNotes floating tools.
 *
 *   • Zoom Window      a lens that magnifies the page under the pen
 *   • Time Keeper      a session timer for the open notebook
 *   • Toolbar          show/hide individual tools in the engine's own rows
 *
 * Ruler, guides, symmetry and perspective are deliberately *not* listed here:
 * the engine already ships one combined guides button in the secondary toolbar
 * row that opens every one of those options in a single drawer. Two doors to the
 * same room just made both look unreliable.
 *
 * Everything is additive. The guides are the engine's own (`GD`), so strokes
 * snap in `pos()` and symmetry copies are written by `symAdd()` — this module
 * only widens that machinery (see `hookGuideSnap`) and puts a menu in front of
 * the rest.
 */

/* ------------------------------------------------------------------ */
/* Engine access                                                       */
/* ------------------------------------------------------------------ */

import { anySmart, onSmartChange, setSmart, smartOn, type SmartKey } from './smart';
import { onnxCfg, onnxState, setOnnx, warmOnnx, type ModelKind } from './math/onnx';
import { onSnapHold, setSnapHoldMs, snapHoldMs } from './shapes';

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

    /**
     * Isometric paper is three families of parallel lines (vertical, +30deg,
     * -30deg) spaced 32 apart, matching what drawGuides() paints. Latch the
     * stroke onto the nearest of those lines and run along it, so the doodle
     * follows the gridline instead of jumping between lattice dots.
     */
    function isoLine(q){
      var x = q[0], y = q[1];
      var S3 = 0.8660254;
      var cands = [
        // vertical rules: x = 32m
        { c: x,        k: 32 * Math.round(x / 32) },
        // +30deg: -0.5x + 0.866y = 32m
        { c: -0.5 * x + S3 * y, k: 32 * Math.round((-0.5 * x + S3 * y) / 32) },
        // -30deg:  0.5x + 0.866y = 32m
        { c:  0.5 * x + S3 * y, k: 32 * Math.round(( 0.5 * x + S3 * y) / 32) }
      ];
      var best = 0, bd = 1e9;
      for (var i = 0; i < cands.length; i++) {
        var d = Math.abs(cands[i].c - cands[i].k);
        if (d < bd) { bd = d; best = i; }
      }
      var kk = cands[best].k;
      if (best === 0) return { t:'l', p:[kk, 0],            d:[0, 1],          hl:1e9 };
      if (best === 1) return { t:'l', p:[-2 * kk, 0],       d:[S3, 0.5],       hl:1e9 };
      return            { t:'l', p:[ 2 * kk, 0],            d:[S3, -0.5],      hl:1e9 };
    }

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

      // ---- isometric: follow the nearest gridline, not the nearest dot
      if (g === 'iso') {
        if (SNL === null) SNL = isoLine(q) || 0;
        var L = SNL;
        if (!L || L.t !== 'l') return q;
        var t = (q[0] - L.p[0]) * L.d[0] + (q[1] - L.p[1]) * L.d[1];
        return [L.p[0] + L.d[0] * t, L.p[1] + L.d[1] * t];
      }

      if (g === 'grid' || g === 'third') return snapLattice(q, g);

      /**
       * The straight ruler is drawn as a band 22 screen px either side of its
       * axis, and the engine latches the centre of that band — so the line
       * appeared *inside* the ruler. Latch the edge nearest the pen instead, so
       * the ink runs along the ruler's rim the way a real ruler works.
       */
      if (g === 'ruler' && SNL === null) {
        var s = k(), r = GD.r;
        var ca = Math.cos(r.a), sa = Math.sin(r.a), hl = r.l / 2, hw = 22 * s;
        var nx = -sa, ny = ca;                       // unit normal to the axis
        var sd = (q[0] - r.x) * nx + (q[1] - r.y) * ny;
        if (Math.abs(sd) < hw + 10 * s) {
          var side = sd >= 0 ? 1 : -1;
          SNL = {
            t: 'l',
            p: [r.x + nx * hw * side, r.y + ny * hw * side],
            d: [ca, sa],
            hl: hl
          };
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
let smartSheet: HTMLElement | null = null;

/**
 * The three smart-ink switches, where people actually reach for them.
 *
 * They live in Settings too, but a switch you have to open a settings sheet to
 * find is a switch nobody flips. Same state object either way — `smart.ts` is
 * the single source of truth, so the two surfaces can never disagree.
 */
const SMART_ROWS: { key: SmartKey; label: string; note: string }[] = [
  { key: 'calc', label: 'Auto-calculate', note: 'Solve what you write after an = sign' },
  { key: 'toText', label: 'Ink → text', note: 'Turn a lassoed scribble into typed text' },
  { key: 'toLatex', label: 'Ink → LaTeX', note: 'Turn a lassoed formula into maths' },
];

function buildSmartSheet(): HTMLElement {
  const node = div('acc-sheet');
  node.id = 'acc-smart';
  node.append(div('acc-sh', 'Smart ink'));

  const list = div('acc-list');
  for (const row of SMART_ROWS) {
    const r = div('acc-row');
    r.dataset.smart = row.key;
    const wrap = div('acc-name');
    wrap.textContent = row.label;
    const note = div('acc-note', row.note);
    const tg = btn('acc-tg');
    tg.dataset.smart = row.key;
    tg.setAttribute('role', 'switch');
    tg.onclick = () => {
      setSmart(row.key, !smartOn(row.key));
      paintSmart();
    };
    r.append(wrap, tg);
    list.append(r, note);
  }

  // a fourth row that opens a sheet rather than flipping a flag — the model is
  // configuration, not a mode
  const more = div('acc-row');
  more.id = 'acc-onnx-open';
  more.append(div('acc-name', 'Handwriting model'));
  const go = div('acc-go');
  go.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  more.append(go);
  more.onclick = () => openOnnx();
  list.append(more);

  node.append(list);

  const foot = div('acc-foot');
  foot.append(div('acc-hint', 'Off until you ask for them'));
  node.append(foot);
  return node;
}

function paintSmart() {
  if (!smartSheet) return;
  smartSheet.querySelectorAll<HTMLElement>('.acc-tg').forEach((n) => {
    const k = n.dataset.smart as SmartKey;
    n.classList.toggle('on', smartOn(k));
  });
  smartSheet
    .querySelectorAll<HTMLElement>('.acc-row')
    .forEach((r) => r.classList.toggle('off', !smartOn(r.dataset.smart as SmartKey)));
}

/* ------------------------------------------------------------------ */
/* Hold to snap                                                        */
/* ------------------------------------------------------------------ */

/**
 * One number, and it is the one people actually want to change.
 *
 * The hold is a taste call: 300 ms suits someone sketching shapes on purpose,
 * five seconds suits someone annotating a page who never wants the pen
 * reinterpreted. The setting lives here rather than in a settings sheet for the
 * same reason the smart-ink switches do — it is a pen behaviour, and you tune
 * it while holding the pen.
 */
let snapSheet: HTMLElement | null = null;

function secs(ms: number): string {
  // the slider steps in 100 ms, so one decimal is always exact
  return `${(ms / 1000).toFixed(1)} s`;
}

function buildSnapSheet(): HTMLElement {
  const node = div('acc-sheet');
  node.id = 'acc-snap';
  node.innerHTML = `
    <div class="acc-sh">Hold to snap</div>
    <div class="snap-body">
      <p class="acc-note">How long the pen has to rest before a doodle becomes a shape or a line. Nothing snaps while you are still moving.</p>
      <div class="snap-val"><b id="snap-num">2.0 s</b><span>idle before it snaps</span></div>
      <input type="range" id="snap-range" min="300" max="5000" step="100" aria-label="Hold time">
      <div class="snap-scale"><span>0.3 s</span><span>5 s</span></div>
    </div>
    <div class="acc-foot">
      <span class="acc-hint" id="snap-hint">Shapes and lines</span>
      <button class="acc-reset" id="snap-reset" type="button">Default</button>
    </div>`;

  const range = node.querySelector('#snap-range') as HTMLInputElement;
  const num = node.querySelector('#snap-num') as HTMLElement;

  range.oninput = () => {
    setSnapHoldMs(parseInt(range.value, 10));
    num.textContent = secs(snapHoldMs());
  };
  // pointerup ends the drag; commit there too so a keyboard user's change lands
  range.onchange = () => setSnapHoldMs(parseInt(range.value, 10));

  (node.querySelector('#snap-reset') as HTMLElement).onclick = () => {
    setSnapHoldMs(2000);
    paintSnap();
  };

  return node;
}

function paintSnap() {
  if (!snapSheet) return;
  const range = snapSheet.querySelector('#snap-range') as HTMLInputElement;
  const num = snapSheet.querySelector('#snap-num') as HTMLElement;
  const v = snapHoldMs();
  if (document.activeElement !== range) range.value = String(v);
  num.textContent = secs(v);
}

function openSnap() {
  if (!snapSheet) return;
  paintSnap();
  const anchor = accPop?.querySelector('[data-acc="snap"]') as HTMLElement | null;
  snapSheet.classList.add('on');
  if (anchor) placeUnder(snapSheet, anchor);
}

/* ------------------------------------------------------------------ */
/* Handwriting model                                                   */
/* ------------------------------------------------------------------ */

/**
 * The door to the optional ONNX reader.
 *
 * It sits at the bottom of Smart ink because that is the only thing it can
 * affect: the two conversion actions. Everything about it is opt-in, including
 * the download — a notebook that never turns it on never fetches a wasm
 * runtime, and turning it on with a bad URL leaves the built-in reader exactly
 * as it was.
 */
let onnxSheet: HTMLElement | null = null;

function buildOnnxSheet(): HTMLElement {
  const node = div('acc-sheet');
  node.id = 'acc-onnx';
  node.innerHTML = `
    <div class="acc-sh">Handwriting model</div>
    <div class="onnx-body">
      <div class="acc-row" id="onnx-on-row">
        <span class="acc-name">Use an ONNX model</span>
        <button class="acc-tg" id="onnx-on" type="button" role="switch" aria-label="Use an ONNX model"></button>
      </div>
      <p class="acc-note">Off is the built-in reader. On, onnxruntime-web is fetched the first time you convert — and the built-in read is still the fallback.</p>
      <label class="onnx-f">Model (.onnx)
        <input id="onnx-model" type="text" spellcheck="false" placeholder="https://…/model.onnx">
      </label>
      <label class="onnx-f">Shape
        <select id="onnx-kind">
          <option value="ctc">CTC — one graph</option>
          <option value="seq2seq">Encoder + decoder</option>
        </select>
      </label>
      <label class="onnx-f" id="onnx-dec-f">Decoder (.onnx)
        <input id="onnx-dec" type="text" spellcheck="false" placeholder="https://…/decoder.onnx">
      </label>
      <label class="onnx-f">Labels (JSON)
        <input id="onnx-vocab" type="text" spellcheck="false" placeholder="optional — ASCII by default">
      </label>
      <div class="onnx-st" id="onnx-st"></div>
    </div>
    <div class="acc-foot">
      <span class="acc-hint" id="onnx-hint">Not loaded</span>
      <button class="acc-reset" id="onnx-load" type="button">Load</button>
    </div>`;

  const q = <T extends HTMLElement>(s: string) => node.querySelector(s) as T;

  q<HTMLElement>('#onnx-on').onclick = () => {
    setOnnx({ on: !onnxCfg().on });
    paintOnnx();
  };

  const bind = (id: string, key: 'model' | 'decoder' | 'vocab' | 'kind') => {
    const el = q<HTMLInputElement>(id);
    el.onchange = () => {
      setOnnx({ [key]: el.value.trim() } as any);
      paintOnnx();
    };
  };
  bind('#onnx-model', 'model');
  bind('#onnx-dec', 'decoder');
  bind('#onnx-vocab', 'vocab');
  bind('#onnx-kind', 'kind');

  q<HTMLElement>('#onnx-load').onclick = async () => {
    const hint = q<HTMLElement>('#onnx-hint');
    const btnEl = q<HTMLElement>('#onnx-load');
    hint.textContent = 'Loading…';
    btnEl.classList.add('idle');
    const msg = await warmOnnx();
    hint.textContent = msg;
    btnEl.classList.remove('idle');
    paintOnnx();
  };

  return node;
}

function paintOnnx() {
  if (!onnxSheet) return;
  const c = onnxCfg();
  const q = <T extends HTMLElement>(s: string) => onnxSheet!.querySelector(s) as T;

  q<HTMLElement>('#onnx-on').classList.toggle('on', c.on);
  q<HTMLElement>('#onnx-on-row').classList.toggle('off', !c.on);

  const set = (id: string, v: string) => {
    const el = q<HTMLInputElement>(id);
    if (el && document.activeElement !== el) el.value = v;
  };
  set('#onnx-model', c.model);
  set('#onnx-dec', c.decoder);
  set('#onnx-vocab', c.vocab);
  q<HTMLSelectElement>('#onnx-kind').value = c.kind;

  // the decoder is only a thing for the two-graph shape
  q<HTMLElement>('#onnx-dec-f').style.display = c.kind === 'seq2seq' ? '' : 'none';

  const st = onnxState();
  const line = q<HTMLElement>('#onnx-st');
  line.dataset.s = st.state;
  line.textContent =
    st.state === 'failed'
      ? st.note
      : st.state === 'ready'
        ? 'Model loaded'
        : c.on && !c.model
          ? 'Add a model URL to use this'
          : c.on
            ? 'Ready to load'
            : 'Off — the built-in reader handles everything';
}

function openOnnx() {
  if (!onnxSheet || !smartSheet) return;
  if (onnxSheet.classList.contains('on')) {
    onnxSheet.classList.remove('on');
    return;
  }
  paintOnnx();
  onnxSheet.classList.add('on');

  // Sit beside the Smart ink sheet rather than under it: the row that opens
  // this is the last one in that sheet, so "under" is off the bottom of the
  // screen and the generic placer would flip it up on top of its own parent.
  const s = smartSheet.getBoundingClientRect();
  const w = onnxSheet.offsetWidth;
  const h = onnxSheet.offsetHeight;
  let left = s.left - w - 8;
  if (left < 8) left = Math.min(window.innerWidth - w - 8, s.left);
  const top = Math.max(8, Math.min(s.top, window.innerHeight - h - 8));
  onnxSheet.style.left = Math.round(left) + 'px';
  onnxSheet.style.top = Math.round(top) + 'px';
}

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  /** present for the three guide rows — these read their state from the engine */
  kind?: GuideKind;
}

const MENU: MenuItem[] = [
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
  {
    id: 'smart',
    label: 'Smart ink',
    icon: '<path d="M5 19 12 5l7 14"/><path d="M8.5 13h7"/><path d="M19.5 4.5 20 6l1.5.5L20 7l-.5 1.5L19 7l-1.5-.5L19 6z"/>',
  },
  {
    id: 'snap',
    label: 'Hold to snap',
    icon: '<path d="M12 7.5V12l3 2"/><circle cx="12" cy="12" r="8.4"/><path d="M8 3.2h8"/>',
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
    } else if (item.id === 'tools' || item.id === 'smart' || item.id === 'snap') {
      const go = el('i', '') as HTMLElement;
      go.className = 'acc-go';
      go.innerHTML = ICON_GO;
      row.append(go);
    }

    if (item.id !== 'tools' && item.id !== 'smart' && item.id !== 'snap') {
      const sw = div('acc-sw');
      row.append(sw);
    }

    row.onclick = () => {
      if (item.id === 'tools') {
        smartSheet?.classList.remove('on');
        snapSheet?.classList.remove('on');
        toolSheet?.classList.toggle('on');
        paintTools();
        // hang the sheet under the menu it came from, not under its own row,
        // or it covers the item you just pressed
        if (toolSheet?.classList.contains('on')) placeUnder(toolSheet, accPop || row);
        return;
      }
      if (item.id === 'smart') {
        toolSheet?.classList.remove('on');
        snapSheet?.classList.remove('on');
        paintSmart();
        smartSheet?.classList.toggle('on');
        if (smartSheet?.classList.contains('on')) placeUnder(smartSheet, accPop || row);
        return;
      }
      if (item.id === 'snap') {
        toolSheet?.classList.remove('on');
        smartSheet?.classList.remove('on');
        onnxSheet?.classList.remove('on');
        snapSheet?.classList.toggle('on');
        if (snapSheet?.classList.contains('on')) placeUnder(snapSheet, accPop || row);
        else snapSheet?.classList.remove('on');
        paintSnap();
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

  smartSheet = buildSmartSheet();
  document.body.append(smartSheet);

  onnxSheet = buildOnnxSheet();
  document.body.append(onnxSheet);

  snapSheet = buildSnapSheet();
  document.body.append(snapSheet);
  // the sheet is the only place the value is shown, so it has to follow a
  // change made anywhere else
  onSnapHold(() => paintSnap());

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest) return;
      if (
        t.closest('#acc-pop') ||
        t.closest('#acc-trigger') ||
        t.closest('#acc-tools') ||
        t.closest('#acc-smart') ||
        t.closest('#acc-onnx') ||
        t.closest('#acc-snap')
      )
        return;
      accPop?.classList.remove('on');
      toolSheet?.classList.remove('on');
      smartSheet?.classList.remove('on');
      onnxSheet?.classList.remove('on');
      snapSheet?.classList.remove('on');
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
    else if (id === 'smart') on = anySmart();
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
      smartSheet?.classList.remove('on');
      onnxSheet?.classList.remove('on');
      snapSheet?.classList.remove('on');
      return;
    }
    // the customization sheet is anchored to this menu; it must not outlive it
    toolSheet?.classList.remove('on');
    smartSheet?.classList.remove('on');
    onnxSheet?.classList.remove('on');
    snapSheet?.classList.remove('on');
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

#acc-smart{
  position:fixed;z-index:45;display:none;width:252px;padding:10px 10px 0;
  background:#fff;border:1px solid #eef1f6;border-radius:14px;
  box-shadow:0 16px 38px rgba(8,20,38,.20),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;max-height:min(72vh,470px);
  flex-direction:column;overflow:hidden;
}
#acc-smart.on{display:flex}
#acc-smart .acc-sh{flex:none}
#acc-smart .acc-row{margin-top:2px}
#acc-smart .acc-note{
  font:500 10.5px/1.35 inherit;color:#9aa5b4;padding:0 4px 4px 7px;margin-top:-2px;
}

#acc-onnx{
  position:fixed;z-index:46;display:none;width:292px;padding:10px 10px 0;
  background:#fff;border:1px solid #eef1f6;border-radius:14px;
  box-shadow:0 16px 38px rgba(8,20,38,.20),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;flex-direction:column;overflow:hidden;
}
#acc-onnx.on{display:flex}
#acc-onnx .acc-sh{flex:none}
#acc-onnx .acc-row{margin-top:2px;cursor:pointer}
#acc-onnx .acc-note{font:500 10.5px/1.35 inherit;color:#9aa5b4;padding:0 4px 8px 7px;margin:0}
#acc-onnx .acc-go svg{width:13px;height:13px;display:block}
.onnx-body{display:flex;flex-direction:column;gap:7px;padding-bottom:8px}
.onnx-f{
  display:flex;flex-direction:column;gap:3px;padding:0 4px;
  font:600 10.5px/1 inherit;color:#8b96a5;letter-spacing:.02em;
}
.onnx-f input,.onnx-f select{
  width:100%;font:500 11.5px/1.3 inherit;color:#2b3542;padding:6px 8px;border-radius:8px;
  border:1px solid #e2e8f0;background:#f8fafc;outline:none;box-sizing:border-box;
}
.onnx-f input:focus,.onnx-f select:focus{border-color:#2f6df6;background:#fff}
.onnx-st{
  min-height:26px;margin:2px 4px 0;padding:6px 8px;border-radius:8px;background:#f6f8fb;
  font:500 10.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b96a5;
  word-break:break-word;
}
.onnx-st[data-s="failed"]{background:#fdf1f1;color:#c94b4b}
.onnx-st[data-s="ready"]{background:#eef9f1;color:#2a9d4f}

#acc-snap{
  position:fixed;z-index:46;display:none;width:262px;padding:10px 10px 0;
  background:#fff;border:1px solid #eef1f6;border-radius:14px;
  box-shadow:0 16px 38px rgba(8,20,38,.20),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;flex-direction:column;overflow:hidden;
}
#acc-snap.on{display:flex}
#acc-snap .acc-sh{flex:none}
#acc-snap .acc-note{font:500 10.5px/1.4 inherit;color:#9aa5b4;padding:0 4px 10px 7px;margin:0}
.snap-body{display:flex;flex-direction:column;padding-bottom:10px}
.snap-val{display:flex;align-items:baseline;gap:7px;padding:0 7px 6px}
.snap-val b{font:700 19px/1 inherit;color:#2b3542;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.snap-val span{font:500 10.5px/1 inherit;color:#9aa5b4}
#snap-range{
  -webkit-appearance:none;appearance:none;width:calc(100% - 14px);margin:0 7px;
  height:4px;border-radius:999px;background:#e6ecf5;outline:none;
}
#snap-range::-webkit-slider-thumb{
  -webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;
  background:#2f6df6;border:2px solid #fff;box-shadow:0 1px 4px rgba(16,32,64,.35);cursor:pointer;
}
#snap-range::-moz-range-thumb{
  width:16px;height:16px;border-radius:50%;background:#2f6df6;border:2px solid #fff;
  box-shadow:0 1px 4px rgba(16,32,64,.35);cursor:pointer;
}
.snap-scale{display:flex;justify-content:space-between;padding:5px 9px 0;font:600 9.5px/1 inherit;color:#b3bcc8}
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

  // Settings has the same three switches; whichever moves, both repaint
  onSmartChange(() => {
    paintSmart();
    paintMenu();
  });

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
