/**
 * Touch-hold & drag reordering for:
 *   1. Notebooks in the Library shelf (`#grid .card[data-id]`)
 *   2. Pages in the Editor thumbnails sidebar (`#side canvas`)
 *
 * Uses pointer-event hold detection (~380ms, cancels cleanly if the finger moves
 * > 8px so native vertical scrolling and quick taps never break).
 */
import {
  LIB_ORDER_STORAGE_KEY,
  computeGridDropIndex,
  computeVerticalDropIndex,
  moveNotebookInOrder,
  parseNotebookOrder,
  reorderPagesState,
  serializeNotebookOrder,
  sortNotebooksWithOrder,
  type ItemRect,
  type OrderableNotebook,
} from './reorder-logic';

const HOLD_MS = 380;
const MOVE_CANCEL_PX = 8;

const CSS = `
/* Suppress native long-press selection/callout while holding to reorder */
#grid .card,
#side,
#side canvas {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
#grid .card {
  touch-action: pan-y;
}
#side canvas {
  touch-action: pan-y;
}
#libm.ro-sorting,
#side.ro-sorting {
  touch-action: none !important;
  overscroll-behavior: contain;
}
#grid .card.ro-card-slot {
  opacity: 0.28 !important;
  border-radius: 12px;
  outline: 2px dashed var(--ac, #2f6df6);
  outline-offset: 4px;
  transform: scale(0.97);
  transition: transform 0.14s ease, opacity 0.14s ease;
}
.ro-grid-ghost {
  position: fixed !important;
  z-index: 920 !important;
  margin: 0 !important;
  pointer-events: none !important;
  transform: scale(1.04) !important;
  border-radius: 12px;
  box-shadow: 0 20px 44px rgba(8, 20, 38, 0.30), 0 4px 12px rgba(8, 20, 38, 0.14) !important;
  opacity: 0.96;
  cursor: grabbing !important;
}
.ro-grid-ghost .lib-more,
.ro-grid-ghost .fv,
.ro-grid-ghost .dl {
  pointer-events: none !important;
}
#grid.list .ro-grid-ghost,
.ro-grid-ghost.ro-list-ghost {
  background: var(--sf, #fff) !important;
  border: 1px solid var(--ac, #2f6df6) !important;
  padding: 10px 14px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14px;
}

#side canvas.ro-side-slot {
  opacity: 0.24 !important;
  border: 2px dashed var(--ac, #2f6df6) !important;
  box-shadow: none !important;
  transform: scale(0.96);
}
.ro-side-ghost {
  position: fixed !important;
  z-index: 920 !important;
  margin: 0 !important;
  pointer-events: none !important;
  border-radius: 8px !important;
  border: 2px solid var(--ac, #2f6df6) !important;
  box-shadow: 0 16px 36px rgba(8, 20, 38, 0.34), 0 3px 10px rgba(8, 20, 38, 0.16) !important;
  background: #fff;
  transform: scale(1.05);
}
.ro-side-line {
  position: fixed;
  z-index: 915;
  height: 3px;
  border-radius: 999px;
  background: var(--ac, #2f6df6);
  box-shadow: 0 0 8px color-mix(in srgb, var(--ac, #2f6df6) 55%, transparent);
  pointer-events: none;
}
.ro-side-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ac, #2f6df6);
}
#gn-page {
  cursor: pointer;
}
#gn-page:hover {
  border-color: var(--ac, #2f6df6) !important;
  color: var(--ac, #2f6df6) !important;
}
html[data-ro-side="1"]:not([data-dev="phone"]) #pen-dock[data-side="left"] {
  left: 140px;
  transition: left 0.16s ease;
}
html[data-ro-side="1"]:not([data-dev="phone"]) body.pd-open[data-pd="left"] #stage {
  padding-left: 66px;
}
`;

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

function loadOrderIds(): string[] {
  try {
    return parseNotebookOrder(localStorage.getItem(LIB_ORDER_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveOrderIds(ids: readonly string[]) {
  try {
    localStorage.setItem(LIB_ORDER_STORAGE_KEY, serializeNotebookOrder(ids));
  } catch {
    /* private mode / quota */
  }
}

function playLiftFeedback() {
  try {
    (window as any).__inkpad_sfx?.play?.('tap');
  } catch {
    /* optional sfx */
  }
  try {
    navigator.vibrate?.(12);
  } catch {
    /* optional vibration */
  }
}

function rectToItem(r: DOMRect): ItemRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/* ------------------------------------------------------------------ */
/* Shared window hooks                                                 */
/* ------------------------------------------------------------------ */

(window as any).__inkpad_sortLib = function <T extends OrderableNotebook>(list: readonly T[]): T[] {
  return sortNotebooksWithOrder(list, loadOrderIds());
};

(window as any).__inkpad_reorderPagesState = reorderPagesState;

/* ------------------------------------------------------------------ */
/* Notebook shelf touch-hold reorder                                   */
/* ------------------------------------------------------------------ */

interface GridPress {
  pointerId: number;
  x: number;
  y: number;
  card: HTMLElement;
  timer: number;
}

interface GridDrag {
  pointerId: number;
  card: HTMLElement;
  ghost: HTMLElement;
  isList: boolean;
  fromIdx: number;
  toIdx: number;
  visibleIds: string[];
  homeRects: ItemRect[];
  grab: { x: number; y: number };
  startScrollTop: number;
  lastX: number;
  lastY: number;
  raf: number;
}

let gridPress: GridPress | null = null;
let gridDrag: GridDrag | null = null;
let noGridClickUntil = 0;

function cancelGridPress() {
  if (!gridPress) return;
  window.clearTimeout(gridPress.timer);
  gridPress = null;
}

function visibleGridCards(): HTMLElement[] {
  const grid = document.getElementById('grid');
  if (!grid) return [];
  return Array.from(grid.querySelectorAll<HTMLElement>('.card[data-id]')).filter(
    (c) => getComputedStyle(c).display !== 'none',
  );
}

function cloneCardForGhost(card: HTMLElement, rect: DOMRect, isList: boolean): HTMLElement {
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.classList.remove('ro-card-slot');
  ghost.classList.add('ro-grid-ghost');
  if (isList) ghost.classList.add('ro-list-ghost');
  ghost.style.left = `${Math.round(rect.left)}px`;
  ghost.style.top = `${Math.round(rect.top)}px`;
  ghost.style.width = `${Math.round(rect.width)}px`;
  ghost.style.height = `${Math.round(rect.height)}px`;

  // cloneNode leaves <canvas> blank — copy the rendered page cover bitmap.
  const srcCanvases = card.querySelectorAll('canvas');
  const dstCanvases = ghost.querySelectorAll('canvas');
  srcCanvases.forEach((src, i) => {
    const dst = dstCanvases[i];
    if (!dst) return;
    dst.width = src.width;
    dst.height = src.height;
    const ctx = dst.getContext('2d');
    if (ctx) {
      try {
        ctx.drawImage(src, 0, 0);
      } catch {
        /* ignore tainted canvas if any */
      }
    }
  });

  document.body.appendChild(ghost);
  return ghost;
}

function moveCardSlotInGrid(card: HTMLElement, visibleCards: HTMLElement[], toIdx: number) {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const others = visibleCards.filter((c) => c !== card);
  const clamped = Math.max(0, Math.min(others.length, toIdx));
  if (clamped < others.length) {
    const ref = others[clamped];
    if (card.nextElementSibling !== ref) {
      grid.insertBefore(card, ref);
    }
  } else if (others.length > 0) {
    const last = others[others.length - 1];
    if (last.nextElementSibling !== card) {
      grid.insertBefore(card, last.nextElementSibling);
    }
  }
}

function stepGridAutoScroll() {
  if (!gridDrag) return;
  const libm = document.getElementById('libm');
  if (libm && libm.scrollHeight > libm.clientHeight + 2) {
    const r = libm.getBoundingClientRect();
    const edge = 56;
    let delta = 0;
    if (gridDrag.lastY < r.top + edge) {
      delta = -Math.ceil(((r.top + edge - gridDrag.lastY) / edge) * 14);
    } else if (gridDrag.lastY > r.bottom - edge) {
      delta = Math.ceil(((gridDrag.lastY - (r.bottom - edge)) / edge) * 14);
    }
    if (delta !== 0) {
      const prev = libm.scrollTop;
      libm.scrollTop = prev + delta;
      if (libm.scrollTop !== prev) {
        updateGridDragTarget(gridDrag.lastX, gridDrag.lastY);
      }
    }
  }
  gridDrag.raf = window.requestAnimationFrame(stepGridAutoScroll);
}

function updateGridDragTarget(clientX: number, clientY: number) {
  if (!gridDrag) return;
  gridDrag.lastX = clientX;
  gridDrag.lastY = clientY;
  gridDrag.ghost.style.left = `${Math.round(clientX - gridDrag.grab.x)}px`;
  gridDrag.ghost.style.top = `${Math.round(clientY - gridDrag.grab.y)}px`;

  const libm = document.getElementById('libm');
  const scrollDelta = libm ? libm.scrollTop - gridDrag.startScrollTop : 0;
  const adjY = clientY + scrollDelta;

  const nextTo = computeGridDropIndex(
    gridDrag.homeRects,
    gridDrag.fromIdx,
    clientX,
    adjY,
    gridDrag.isList,
  );
  if (nextTo !== gridDrag.toIdx) {
    gridDrag.toIdx = nextTo;
    const cards = visibleGridCards();
    moveCardSlotInGrid(gridDrag.card, cards, nextTo);
  }
}

function beginGridDrag(p: GridPress) {
  gridPress = null;
  const grid = document.getElementById('grid');
  const libm = document.getElementById('libm');
  if (!grid || !p.card.isConnected) return;

  const visible = visibleGridCards();
  const fromIdx = visible.indexOf(p.card);
  if (fromIdx < 0 || visible.length < 2) return;

  const rect = p.card.getBoundingClientRect();
  const isList = grid.classList.contains('list');
  const homeRects = visible.map((c) => rectToItem(c.getBoundingClientRect()));
  const visibleIds = visible.map((c) => String(c.dataset.id || ''));

  document.documentElement.dataset.roGridDrag = '1';
  libm?.classList.add('ro-sorting');
  const ghost = cloneCardForGhost(p.card, rect, isList);
  p.card.classList.add('ro-card-slot');

  try {
    p.card.setPointerCapture(p.pointerId);
  } catch {
    /* capture optional on synthetic/non-active pointers */
  }

  gridDrag = {
    pointerId: p.pointerId,
    card: p.card,
    ghost,
    isList,
    fromIdx,
    toIdx: fromIdx,
    visibleIds,
    homeRects,
    grab: { x: p.x - rect.left, y: p.y - rect.top },
    startScrollTop: libm ? libm.scrollTop : 0,
    lastX: p.x,
    lastY: p.y,
    raf: window.requestAnimationFrame(stepGridAutoScroll),
  };

  playLiftFeedback();
}

function endGridDrag(commit: boolean) {
  if (!gridDrag) return;
  const d = gridDrag;
  gridDrag = null;
  if (d.raf) window.cancelAnimationFrame(d.raf);

  d.ghost.remove();
  d.card.classList.remove('ro-card-slot');
  document.getElementById('libm')?.classList.remove('ro-sorting');
  delete document.documentElement.dataset.roGridDrag;
  try {
    if (d.card.hasPointerCapture?.(d.pointerId)) {
      d.card.releasePointerCapture(d.pointerId);
    }
  } catch {
    /* ignore */
  }

  noGridClickUntil = Date.now() + 450;

  if (commit && d.toIdx !== d.fromIdx) {
    const lib = ev<OrderableNotebook[]>('lib') || [];
    const sortedAllIds = sortNotebooksWithOrder(lib, loadOrderIds()).map((n) => String(n.id));
    const nextOrder = moveNotebookInOrder(
      d.visibleIds,
      loadOrderIds(),
      sortedAllIds,
      d.fromIdx,
      d.toIdx,
    );
    saveOrderIds(nextOrder);
    ev('try{ showLib(); }catch(e){}');
  } else if (!commit && d.toIdx !== d.fromIdx) {
    ev('try{ showLib(); }catch(e){}');
  }
}

/* ------------------------------------------------------------------ */
/* Page thumbnails sidebar (`#side`) touch-hold reorder                */
/* ------------------------------------------------------------------ */

interface SidePress {
  pointerId: number;
  x: number;
  y: number;
  canvas: HTMLCanvasElement;
  timer: number;
}

interface SideDrag {
  pointerId: number;
  canvas: HTMLCanvasElement;
  ghost: HTMLCanvasElement;
  line: HTMLElement;
  fromIdx: number;
  toIdx: number;
  homeRects: ItemRect[];
  grab: { x: number; y: number };
  startScrollTop: number;
  lastX: number;
  lastY: number;
  raf: number;
}

let sidePress: SidePress | null = null;
let sideDrag: SideDrag | null = null;
let noSideClickUntil = 0;

function cancelSidePress() {
  if (!sidePress) return;
  window.clearTimeout(sidePress.timer);
  sidePress = null;
}

function sideCanvases(): HTMLCanvasElement[] {
  const side = document.getElementById('side');
  if (!side) return [];
  return Array.from(side.querySelectorAll<HTMLCanvasElement>('canvas'));
}

function cloneSideCanvas(src: HTMLCanvasElement, rect: DOMRect): HTMLCanvasElement {
  const ghost = document.createElement('canvas');
  ghost.width = src.width;
  ghost.height = src.height;
  ghost.className = 'ro-side-ghost';
  ghost.style.left = `${Math.round(rect.left)}px`;
  ghost.style.top = `${Math.round(rect.top)}px`;
  ghost.style.width = `${Math.round(rect.width)}px`;
  ghost.style.height = `${Math.round(rect.height)}px`;
  const ctx = ghost.getContext('2d');
  if (ctx) {
    try {
      ctx.drawImage(src, 0, 0);
    } catch {
      /* ignore */
    }
  }
  document.body.appendChild(ghost);
  return ghost;
}

function placeSideLine(d: SideDrag) {
  const side = document.getElementById('side');
  if (!side) return;
  const sideRect = side.getBoundingClientRect();
  const others = sideCanvases().filter((c) => c !== d.canvas);
  const at = Math.max(0, Math.min(others.length, d.toIdx));

  let top: number;
  if (!others.length) {
    top = sideRect.top + 20;
  } else if (at < others.length) {
    const r = others[at].getBoundingClientRect();
    top = r.top - 6;
  } else {
    const r = others[others.length - 1].getBoundingClientRect();
    top = r.bottom + 4;
  }

  const clampedTop = Math.max(sideRect.top + 4, Math.min(sideRect.bottom - 6, top));
  d.line.style.left = `${Math.round(sideRect.left + 8)}px`;
  d.line.style.width = `${Math.max(40, Math.round(sideRect.width - 16))}px`;
  d.line.style.top = `${Math.round(clampedTop)}px`;
}

function moveSideCanvasSlot(canvas: HTMLCanvasElement, toIdx: number) {
  const side = document.getElementById('side');
  if (!side) return;
  const others = sideCanvases().filter((c) => c !== canvas);
  const clamped = Math.max(0, Math.min(others.length, toIdx));
  if (clamped < others.length) {
    const ref = others[clamped];
    if (canvas.nextElementSibling !== ref) {
      side.insertBefore(canvas, ref);
    }
  } else if (others.length > 0) {
    const last = others[others.length - 1];
    if (last.nextElementSibling !== canvas) {
      side.insertBefore(canvas, last.nextElementSibling);
    }
  }
}

function stepSideAutoScroll() {
  if (!sideDrag) return;
  const side = document.getElementById('side');
  if (side && side.scrollHeight > side.clientHeight + 2) {
    const r = side.getBoundingClientRect();
    const edge = 46;
    let delta = 0;
    if (sideDrag.lastY < r.top + edge) {
      delta = -Math.ceil(((r.top + edge - sideDrag.lastY) / edge) * 12);
    } else if (sideDrag.lastY > r.bottom - edge) {
      delta = Math.ceil(((sideDrag.lastY - (r.bottom - edge)) / edge) * 12);
    }
    if (delta !== 0) {
      const prev = side.scrollTop;
      side.scrollTop = prev + delta;
      if (side.scrollTop !== prev) {
        updateSideDragTarget(sideDrag.lastX, sideDrag.lastY);
      }
    }
  }
  sideDrag.raf = window.requestAnimationFrame(stepSideAutoScroll);
}

function updateSideDragTarget(clientX: number, clientY: number) {
  if (!sideDrag) return;
  sideDrag.lastX = clientX;
  sideDrag.lastY = clientY;
  sideDrag.ghost.style.left = `${Math.round(clientX - sideDrag.grab.x)}px`;
  sideDrag.ghost.style.top = `${Math.round(clientY - sideDrag.grab.y)}px`;

  const side = document.getElementById('side');
  const scrollDelta = side ? side.scrollTop - sideDrag.startScrollTop : 0;
  const adjY = clientY + scrollDelta;

  const nextTo = computeVerticalDropIndex(sideDrag.homeRects, sideDrag.fromIdx, adjY);
  if (nextTo !== sideDrag.toIdx) {
    sideDrag.toIdx = nextTo;
    moveSideCanvasSlot(sideDrag.canvas, nextTo);
  }
  placeSideLine(sideDrag);
}

function beginSideDrag(p: SidePress) {
  sidePress = null;
  const side = document.getElementById('side');
  if (!side || !p.canvas.isConnected) return;

  const list = sideCanvases();
  const fromIdx = list.indexOf(p.canvas);
  if (fromIdx < 0 || list.length < 2) return;

  const rect = p.canvas.getBoundingClientRect();
  const homeRects = list.map((c) => rectToItem(c.getBoundingClientRect()));

  document.documentElement.dataset.roSideDrag = '1';
  side.classList.add('ro-sorting');
  const ghost = cloneSideCanvas(p.canvas, rect);
  p.canvas.classList.add('ro-side-slot');

  const line = document.createElement('div');
  line.className = 'ro-side-line';
  document.body.appendChild(line);

  try {
    p.canvas.setPointerCapture(p.pointerId);
  } catch {
    /* optional */
  }

  sideDrag = {
    pointerId: p.pointerId,
    canvas: p.canvas,
    ghost,
    line,
    fromIdx,
    toIdx: fromIdx,
    homeRects,
    grab: { x: p.x - rect.left, y: p.y - rect.top },
    startScrollTop: side.scrollTop,
    lastX: p.x,
    lastY: p.y,
    raf: window.requestAnimationFrame(stepSideAutoScroll),
  };

  placeSideLine(sideDrag);
  playLiftFeedback();
}

function endSideDrag(commit: boolean) {
  if (!sideDrag) return;
  const d = sideDrag;
  sideDrag = null;
  if (d.raf) window.cancelAnimationFrame(d.raf);

  d.ghost.remove();
  d.line.remove();
  d.canvas.classList.remove('ro-side-slot');
  document.getElementById('side')?.classList.remove('ro-sorting');
  delete document.documentElement.dataset.roSideDrag;
  try {
    if (d.canvas.hasPointerCapture?.(d.pointerId)) {
      d.canvas.releasePointerCapture(d.pointerId);
    }
  } catch {
    /* ignore */
  }

  noSideClickUntil = Date.now() + 450;

  if (commit && d.toIdx !== d.fromIdx) {
    const reorderFn = (window as any).__slateReorderPage;
    if (typeof reorderFn === 'function') {
      reorderFn(d.fromIdx, d.toIdx);
      const pn = document.getElementById('pn')?.textContent || '';
      const m = pn.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
      const gp = document.getElementById('gn-page');
      if (m && gp) gp.textContent = `${m[1]} / ${m[2]}`;
    }
  } else if (!commit && d.toIdx !== d.fromIdx) {
    ev('try{ thumbs(true); }catch(e){}');
  }
}

/* ------------------------------------------------------------------ */
/* Event listeners & boot                                              */
/* ------------------------------------------------------------------ */

function hookFooterPagePill() {
  const syncSideAttr = () => {
    const side = document.getElementById('side');
    const ed = document.getElementById('ed');
    const open =
      !!side &&
      !!ed &&
      getComputedStyle(ed).display !== 'none' &&
      getComputedStyle(side).display !== 'none';
    if (open) document.documentElement.dataset.roSide = '1';
    else delete document.documentElement.dataset.roSide;
  };
  const sideEl = document.getElementById('side');
  const edEl = document.getElementById('ed');
  if (sideEl) {
    new MutationObserver(syncSideAttr).observe(sideEl, { attributes: true, attributeFilter: ['style'] });
  }
  if (edEl) {
    new MutationObserver(syncSideAttr).observe(edEl, { attributes: true, attributeFilter: ['style'] });
  }
  syncSideAttr();

  const check = () => {
    syncSideAttr();
    const p = document.getElementById('gn-page');
    if (!p || p.dataset.roBound === '1') return;
    p.dataset.roBound = '1';
    p.title = 'Page thumbnails (view & hold to rearrange pages)';
    p.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('side-t')?.click();
      window.requestAnimationFrame(syncSideAttr);
    });
  };
  check();
  window.setInterval(check, 700);
}

function boot() {
  const style = document.createElement('style');
  style.id = 'ro-reorder-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  const grid = document.getElementById('grid');
  if (grid) {
    grid.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (!target?.closest) return;
        if (target.closest('button, a, input, select, .lib-more, .fv, .dl, .new')) return;
        const card = target.closest('#grid .card[data-id]') as HTMLElement | null;
        if (!card) return;
        if (visibleGridCards().length < 2) return;

        cancelGridPress();
        const p: GridPress = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          card,
          timer: 0,
        };
        p.timer = window.setTimeout(() => {
          if (gridPress === p) beginGridDrag(p);
        }, HOLD_MS);
        gridPress = p;
      },
      true,
    );

    grid.addEventListener(
      'click',
      (e) => {
        if (Date.now() < noGridClickUntil) {
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );

    grid.addEventListener(
      'contextmenu',
      (e) => {
        if (gridPress || gridDrag || Date.now() < noGridClickUntil) {
          e.preventDefault();
        }
      },
      true,
    );
  }

  const side = document.getElementById('side');
  if (side) {
    side.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (!target?.closest) return;
        const canvas = target.closest('#side canvas') as HTMLCanvasElement | null;
        if (!canvas) return;
        if (sideCanvases().length < 2) return;

        cancelSidePress();
        const p: SidePress = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          canvas,
          timer: 0,
        };
        p.timer = window.setTimeout(() => {
          if (sidePress === p) beginSideDrag(p);
        }, HOLD_MS);
        sidePress = p;
      },
      true,
    );

    side.addEventListener(
      'click',
      (e) => {
        if (Date.now() < noSideClickUntil) {
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );

    side.addEventListener(
      'contextmenu',
      (e) => {
        if (sidePress || sideDrag || Date.now() < noSideClickUntil) {
          e.preventDefault();
        }
      },
      true,
    );
  }

  window.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (gridPress && e.pointerId === gridPress.pointerId) {
        if (Math.hypot(e.clientX - gridPress.x, e.clientY - gridPress.y) > MOVE_CANCEL_PX) {
          cancelGridPress();
        }
      }
      if (gridDrag && e.pointerId === gridDrag.pointerId) {
        updateGridDragTarget(e.clientX, e.clientY);
      }

      if (sidePress && e.pointerId === sidePress.pointerId) {
        if (Math.hypot(e.clientX - sidePress.x, e.clientY - sidePress.y) > MOVE_CANCEL_PX) {
          cancelSidePress();
        }
      }
      if (sideDrag && e.pointerId === sideDrag.pointerId) {
        updateSideDragTarget(e.clientX, e.clientY);
      }
    },
    true,
  );

  // Block native touch scroll only once a touch-hold drag has lifted an item.
  window.addEventListener(
    'touchmove',
    (e) => {
      if (gridDrag || sideDrag) {
        e.preventDefault();
      }
    },
    { passive: false, capture: true },
  );

  window.addEventListener(
    'pointerup',
    (e: PointerEvent) => {
      if (gridPress && e.pointerId === gridPress.pointerId) cancelGridPress();
      if (gridDrag && e.pointerId === gridDrag.pointerId) endGridDrag(true);
      if (sidePress && e.pointerId === sidePress.pointerId) cancelSidePress();
      if (sideDrag && e.pointerId === sideDrag.pointerId) endSideDrag(true);
    },
    true,
  );

  window.addEventListener(
    'pointercancel',
    () => {
      cancelGridPress();
      if (gridDrag) endGridDrag(false);
      cancelSidePress();
      if (sideDrag) endSideDrag(false);
    },
    true,
  );

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelGridPress();
      if (gridDrag) endGridDrag(false);
      cancelSidePress();
      if (sideDrag) endSideDrag(false);
    }
  });

  window.addEventListener('blur', () => {
    cancelGridPress();
    if (gridDrag) endGridDrag(false);
    cancelSidePress();
    if (sideDrag) endSideDrag(false);
  });

  hookFooterPagePill();

  // If custom order was stored before modules finished booting, refresh the shelf once.
  if (loadOrderIds().length > 0) {
    ev('try{ showLib(); }catch(e){}');
  }

  (window as any).__inkpad_reorder = {
    getOrder: loadOrderIds,
    setOrder: (ids: string[]) => {
      saveOrderIds(ids);
      ev('try{ showLib(); }catch(e){}');
    },
    moveNotebook: (fromIdx: number, toIdx: number) => {
      const visible = visibleGridCards();
      const visibleIds = visible.map((c) => String(c.dataset.id || ''));
      const lib = ev<OrderableNotebook[]>('lib') || [];
      const sortedAllIds = sortNotebooksWithOrder(lib, loadOrderIds()).map((n) => String(n.id));
      const next = moveNotebookInOrder(visibleIds, loadOrderIds(), sortedAllIds, fromIdx, toIdx);
      saveOrderIds(next);
      ev('try{ showLib(); }catch(e){}');
      return next;
    },
    movePage: (fromIdx: number, toIdx: number) => {
      const fn = (window as any).__slateReorderPage;
      return typeof fn === 'function' ? fn(fromIdx, toIdx) : false;
    },
    holdMs: HOLD_MS,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
