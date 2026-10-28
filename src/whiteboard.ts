/**
 * Whiteboard — a borderless canvas.
 *
 * The engine is page-based: `#wrap` is sized to one page and `#stage` centres
 * it. Two things it already does make a whiteboard cheap to build:
 *
 *   • `layout()` sizes the page by a global zoom `z`, and `#stage` is
 *     `overflow:auto` — so zoom is `z` plus a layout, and pan is scroll
 *   • `wantD()` derives the backing-store density from the *CSS* width, so
 *     zooming in genuinely raises resolution instead of upscaling pixels
 *
 * A whiteboard is therefore a notebook with `board: true` and a single large
 * page. This module creates those, hides the page bar while one is open, and
 * adds the mouse affordances the engine only has for touch (ctrl+wheel zoom,
 * space/middle-drag pan, keyboard zoom).
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

/* ------------------------------------------------------------------ */
/* Board geometry                                                      */
/* ------------------------------------------------------------------ */

/** Large enough to feel endless, small enough for a sane backing store. */
const BOARD_W = 3200;
const BOARD_H = 2400;
const MIN_Z = 0.2;
const MAX_Z = 5;

function isBoard(): boolean {
  const nb = ev<any>('nb');
  return !!(nb && nb.board);
}

function stage(): HTMLElement | null {
  return document.getElementById('stage');
}

function canvas(): HTMLCanvasElement | null {
  return document.getElementById('cv') as HTMLCanvasElement | null;
}

function zoomNow(): number {
  return ev<number>('z') || 1;
}

/**
 * Set the zoom while keeping the page point under (ax, ay) fixed on screen.
 * The engine only exposes `zoom(f)`, which clamps to [0.5, 3]; a whiteboard
 * needs a wider range, so `z` is written directly and `layout()` re-run.
 */
function setZoom(nz: number, ax?: number, ay?: number) {
  const cv = canvas();
  const st = stage();
  if (!cv || !st) return;
  const z = Math.max(MIN_Z, Math.min(MAX_Z, nz));
  if (Math.abs(z - zoomNow()) < 0.0005) return;

  const r0 = cv.getBoundingClientRect();
  const fx = ax === undefined ? 0.5 : (ax - r0.left) / (r0.width || 1);
  const fy = ay === undefined ? 0.5 : (ay - r0.top) / (r0.height || 1);

  ev(`try{ z=${z}; layout(); }catch(e){}`);

  const r1 = cv.getBoundingClientRect();
  if (ax !== undefined && ay !== undefined) {
    st.scrollLeft += r1.left + fx * r1.width - ax;
    st.scrollTop += r1.top + fy * r1.height - ay;
  }
  paintHud();
}

function zoomBy(f: number, ax?: number, ay?: number) {
  setZoom(zoomNow() * f, ax, ay);
}

/** Reset to "fit the board in the window". */
function fitBoard() {
  ev('try{ z=1; layout(); }catch(e){}');
  const st = stage();
  if (st) {
    st.scrollLeft = Math.max(0, (st.scrollWidth - st.clientWidth) / 2);
    st.scrollTop = Math.max(0, (st.scrollHeight - st.clientHeight) / 2);
  }
  paintHud();
}

/* ------------------------------------------------------------------ */
/* Creating a board                                                    */
/* ------------------------------------------------------------------ */

function newBoard(name?: string) {
  const lib = ev<any[]>('lib');
  if (!lib) return;

  const nb = {
    id: Date.now(),
    name: name || 'Whiteboard',
    cover: '#1f2a3a',
    cov: 'plain',
    upd: Date.now(),
    board: true,
    pages: [
      {
        tpl: 'dot',
        strokes: [],
        pp: { k: 'dot', bg: '#ffffff', ln: '#d7dfec', gap: 80, lw: 2.4 },
        pw: BOARD_W,
        ph: BOARD_H,
      },
    ],
  };

  lib.unshift(nb);
  ev('try{ save(); showLib(); }catch(e){}');

  // `open` is not reachable from the global scope here — the browser's own
  // window.open wins the name — so go through the card, which is the engine's
  // own entry point and runs its internal binding.
  const card = document.querySelector('#grid .card') as HTMLElement | null;
  if (card) card.click();
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

let hud: HTMLElement | null = null;
let hudFace: HTMLElement | null = null;

function buildHud() {
  if (hud) return;
  hud = div('wb-hud');
  hud.id = 'wb-hud';

  const out = btn('wb-btn', '−');
  out.title = 'Zoom out';
  out.onclick = () => zoomBy(1 / 1.25);

  hudFace = btn('wb-face', '100%');
  hudFace.title = 'Reset to fit';
  hudFace.onclick = () => fitBoard();

  const zin = btn('wb-btn', '+');
  zin.title = 'Zoom in';
  zin.onclick = () => zoomBy(1.25);

  const fit = btn('wb-btn wb-fit');
  fit.title = 'Fit board';
  fit.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  fit.onclick = () => fitBoard();

  hud.append(out, hudFace, zin, fit);
  document.body.append(hud);
}

function paintHud() {
  if (!hud) return;
  const on = isBoard() && !!document.getElementById('ed') &&
    getComputedStyle(document.getElementById('ed')!).display !== 'none';
  hud.classList.toggle('on', on);
  if (hudFace) hudFace.textContent = Math.round(zoomNow() * 100) + '%';
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

let spaceDown = false;
let panning = false;

function hookInput() {
  const st = stage();
  if (!st) return;

  // ctrl/cmd + wheel zooms; a plain wheel keeps the engine's native scroll
  st.addEventListener(
    'wheel',
    (e) => {
      if (!isBoard() || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
    },
    { passive: false }
  );

  window.addEventListener('keydown', (e) => {
    if (!isBoard()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

    if (e.code === 'Space' && !spaceDown) {
      spaceDown = true;
      st.classList.add('wb-grab');
      e.preventDefault();
    }
    if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      fitBoard();
    }
    if (e.key === '=' || e.key === '+') zoomBy(1.25);
    if (e.key === '-' || e.key === '_') zoomBy(1 / 1.25);
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      st.classList.remove('wb-grab');
    }
  });

  // middle-drag or space-drag pans; capture so the engine never sees the stroke
  st.addEventListener(
    'pointerdown',
    (e) => {
      if (!isBoard()) return;
      const isPan = e.button === 1 || (spaceDown && e.button === 0);
      if (!isPan) return;
      e.preventDefault();
      e.stopPropagation();
      panning = true;
      st.classList.add('wb-grabbing');
      const x0 = e.clientX;
      const y0 = e.clientY;
      const sl = st.scrollLeft;
      const stp = st.scrollTop;
      const move = (m: PointerEvent) => {
        st.scrollLeft = sl - (m.clientX - x0);
        st.scrollTop = stp - (m.clientY - y0);
      };
      const up = () => {
        panning = false;
        st.classList.remove('wb-grabbing');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    true
  );

  st.addEventListener('dblclick', (e) => {
    if (!isBoard() || !spaceDown) return;
    e.stopPropagation();
    fitBoard();
  });

  // a board has no pages, so the bar is meaningless there
  let lastBoard = false;
  window.setInterval(() => {
    const on = isBoard();
    const bar = document.getElementById('pg');
    if (bar) bar.style.display = on ? 'none' : '';
    document.body.classList.toggle('wb-mode', on);
    if (on !== lastBoard) {
      lastBoard = on;
      if (on) window.setTimeout(fitBoard, 60);
      paintHud();
    }
  }, 250);

  window.addEventListener('resize', () => paintHud());
  void panning;
}

/* ------------------------------------------------------------------ */
/* Library entry                                                       */
/* ------------------------------------------------------------------ */

function hookNewButton() {
  const top = document.getElementById('gn-top');
  if (!top || document.getElementById('gn-board')) return;

  const b = btn('gn-board', '▢ Board');
  b.id = 'gn-board';
  b.title = 'New whiteboard';
  b.onclick = () => newBoard();
  const newBtn = document.getElementById('gn-new');
  if (newBtn) top.insertBefore(b, newBtn);
  else top.append(b);
}

/** Tag board cards on the shelf so they read differently from notebooks. */
function badgeCards() {
  const lib = ev<any[]>('lib') || [];
  const flt = ev<string>('flt') || 'all';
  const q = ((document.getElementById('find') as HTMLInputElement | null)?.value || '').toLowerCase();
  const list = lib
    .filter(
      (n) =>
        (n.name || '').toLowerCase().includes(q) &&
        (flt === 'trash' ? n.del : !n.del && (flt !== 'fav' || n.fav))
    )
    .sort((a, b) => (b.upd || 0) - (a.upd || 0));

  const cards = Array.from(document.querySelectorAll('#grid .card')) as HTMLElement[];
  cards.forEach((card, i) => {
    const n = list[i];
    if (!n) return;
    const cv = card.querySelector('.cv') as HTMLElement | null;
    if (!cv) return;
    cv.classList.toggle('is-board', !!n.board);
  });
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#gn-board{
  border:1px solid var(--gn-line,#e6e2dc)!important;background:#fff!important;
  border-radius:10px;padding:8px 13px!important;cursor:pointer;
  font:600 12.5px/1 inherit;color:#3c4654;white-space:nowrap;
}
#gn-board:hover{background:#f6f8fb!important;border-color:#d6dce6!important;color:#1f4fbf}

#wb-hud{
  position:fixed;right:18px;bottom:18px;z-index:30;display:none;align-items:center;gap:2px;
  padding:5px;border-radius:14px;background:#fff;border:1px solid #eef1f6;font-family:inherit;
  box-shadow:0 10px 26px rgba(8,20,38,.18),0 1px 3px rgba(8,20,38,.08);
}
#wb-hud.on{display:flex}
#wb-hud .wb-btn{
  width:30px;height:30px;border-radius:9px;border:0!important;background:transparent!important;
  color:#3c4654;cursor:pointer;display:grid;place-items:center;padding:0!important;
  font:700 15px/1 inherit;
}
#wb-hud .wb-btn:hover{background:#f2f5fa}
#wb-hud .wb-btn svg{width:16px;height:16px;display:block}
#wb-hud .wb-face{
  min-width:52px;height:30px;border-radius:9px;border:0!important;background:transparent!important;
  color:#2b3542;cursor:pointer;font:700 12px/1 inherit;padding:0 6px!important;
  font-variant-numeric:tabular-nums;
}
#wb-hud .wb-face:hover{background:#f2f5fa}

body.wb-mode #gn-foot{display:none!important}

#stage.wb-grab{cursor:grab}
#stage.wb-grabbing{cursor:grabbing}

/* board thumbnails are a different shape, so mark the cover subtly */
.card .cv.is-board{box-shadow:0 5px 16px rgba(16,32,64,.16),inset 0 0 0 1px rgba(255,255,255,.25)}
.card .cv.is-board::after{
  content:'BOARD';position:absolute;left:7px;bottom:7px;
  font:800 7.5px/1 inherit;letter-spacing:.1em;color:rgba(255,255,255,.92);
  background:rgba(16,32,64,.42);border-radius:4px;padding:3px 5px;
}
.card .cv{position:relative}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!document.getElementById('libm')) return;

  const style = document.createElement('style');
  style.id = 'gn-board-style';
  style.textContent = CSS;
  document.head.append(style);

  buildHud();
  hookNewButton();
  hookInput();

  const grid = document.getElementById('grid');
  if (grid) {
    new MutationObserver(() => window.requestAnimationFrame(badgeCards)).observe(grid, {
      childList: true,
    });
  }

  window.setInterval(() => {
    hookNewButton();
    paintHud();
  }, 400);

  (window as any).__inkpad_board = {
    create: newBoard,
    isBoard,
    zoom: (z: number) => setZoom(z),
    zoomBy,
    fit: fitBoard,
    size: { w: BOARD_W, h: BOARD_H },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
