/**
 * Slate's UI system — one place for the numbers that used to be guessed in a
 * dozen different modules.
 *
 * The standards this follows, with their actual measurements:
 *
 *   Material Design 3, Icon buttons — a 24dp icon lives in a container whose
 *   target must be at least 48x48dp. Apple HIG asks for at least 44x44pt.
 *   We use 40px on precise pointers and 44px on coarse ones, and centre the
 *   icon with grid rather than with a line box (a glyph's ink does not sit in
 *   the middle of its line box, and the offset changes with the font).
 *
 *   Material Design 3, Menus (baseline specs) — 48dp list items, 12dp
 *   horizontal padding, 24dp leading/trailing icons, 8dp divider padding.
 *   Menus appear below or in front of the element that generates them, and
 *   "if a menu is in a position to be cut off, it should automatically
 *   reposition to appear to the left, right, or above" the trigger.
 *
 *   Apple HIG, Layout — respect safe areas and keep controls clear of edges;
 *   the 8px gutter below is that rule expressed as a number.
 *
 * Everything here is CSS-and-DOM only: no framework, no dependency on any
 * other module, so it can be loaded first and imported by anyone.
 *
 * Division of labour: this module owns icon normalisation, the anchoring
 * primitive and dragging. The feature modules call `anchorBelow()` from their
 * own `place()` functions — that keeps one authoritative positioning decision
 * per panel instead of a second, later observer fighting the module for it.
 */

export const UI = {
  /** gutter between a floating panel and any viewport edge */
  edge: 8,
  /** gap between a trigger and the panel it opens */
  gap: 8,
  /** icon button box on a precise pointer */
  iconBox: 40,
  /** icon button box on a coarse pointer (Apple HIG 44pt floor) */
  iconTouch: 44,
  /** M3 baseline menu list item */
  menuItem: 48,
  /** M3 icon grid */
  icon: 24,
} as const;

/** The one primary stack. Declared in index.html too, so it exists at first paint. */
export const PRIMARY_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans", sans-serif';

/** A geometrically centred cross, drawn on the M3 24dp icon grid. */
export const CROSS_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M6 6l12 12M18 6L6 18"/></svg>';

const CSS = `
/* The primary family is inherited by every native text control. Module CSS
   that still needs a family uses var(--slate-font) / -mono / -display. */
html,body,button,input,select,textarea{font-family:var(--slate-font)}

/* Icons are centred by geometry, not by the accidents of a font's metrics.
   normaliseButton() tags buttons whose only content is a glyph or an SVG.

   "display" is deliberately NOT !important here. An important declaration
   outranks both a component's own display:none rule and an inline
   style.display = 'none', so every icon-only button that hides itself was
   pinned open — the padlock and the "?" launcher stayed on the library screen,
   where neither belongs, and the pen dock's grip showed up outside lock mode.
   The centring declarations stay important; only the question of whether the
   button exists at all is left to the component that owns it. */
button[data-slate-icon]{
  display:inline-grid;place-items:center!important;align-content:center;
  line-height:1!important;text-align:center!important;
}
button[data-slate-icon] > svg{display:block;margin:0;flex:none}
button[data-slate-icon="cross"] > svg{width:16px;height:16px}
@media (pointer:coarse){
  button[data-slate-icon]{min-width:var(--slate-icon-touch);min-height:var(--slate-icon-touch)}
}

/* A "+" set as text is centred on the font's math axis, not on the box, and
   its side bearings change with every theme font. The Any Colour button and
   its kin use a symmetric SVG on the 24dp grid instead, so the ink's centre
   and the box's centre are the same point. Grid, not a line box, does the
   centring; every property that could reintroduce a line box is pinned. */
button[data-slate-icon="plus"] > svg{
  display:block;width:12px;height:12px;margin:0;flex:none;
  align-self:center;justify-self:center;
}
button[data-slate-icon="plus"]{
  grid-template-columns:1fr;grid-template-rows:1fr;
  align-items:center;justify-items:center;align-content:center;justify-content:center;
  line-height:0!important;padding:0!important;box-sizing:border-box;
}
.slate-icon-center{
  display:grid!important;place-items:center!important;
  align-content:center!important;justify-content:center!important;
  line-height:0!important;padding:0!important;box-sizing:border-box;
}
.slate-icon-center > svg{
  display:block;margin:0;flex:none;align-self:center;justify-self:center;
}

/* ---- Clickability ----------------------------------------------------
   The tour mounts a full-screen, fully transparent layer at z-index 300.
   When it is not actually running that layer must never swallow a press meant
   for a control beneath it — an orphaned overlay reads as "every icon is
   dead". Likewise, floating ink panels and their controls stay live and above
   the second toolbar row (z-index 60) and the engine drawer (70), while the
   tour/modal layers (250/300) still outrank them. */
html:not(.tour-on) #tour-root{pointer-events:none!important}
#ink-pen,#ink-pop,.ink-sheet{pointer-events:auto!important}
#ink-pop,.ink-sheet{z-index:90!important}
#ink-pen button,#ink-pop button,.ink-sheet button,
#ink-pen input,#ink-pop input,.ink-sheet input{pointer-events:auto!important}

.slate-grab{cursor:grab;touch-action:none}
.slate-grab:active{cursor:grabbing}
body.slate-dragging,body.slate-dragging *{user-select:none!important;cursor:grabbing!important}
`;

/* ------------------------------------------------------------------ */
/* Stylesheet: injected once, and kept last in <head>                   */
/* ------------------------------------------------------------------ */

let sheet: HTMLStyleElement | null = null;

function installSheet() {
  if (sheet) return;
  sheet = document.createElement('style');
  sheet.id = 'slate-ui-system';
  sheet.textContent = CSS;
  document.head.appendChild(sheet);

  // Every other module appends its own <style> at boot. Ours has to stay last
  // so equal-specificity rules resolve to the system tokens rather than to a
  // module's private copy of the same declaration.
  new MutationObserver(keepSheetLast).observe(document.head, { childList: true });
}

function keepSheetLast() {
  if (!sheet || document.head.lastElementChild === sheet) return;
  document.head.appendChild(sheet);
}

/* ------------------------------------------------------------------ */
/* Icon normalisation                                                  */
/* ------------------------------------------------------------------ */

const CROSS_GLYPHS = new Set(['✕', '×', '✖', '✗', '✘']);

/**
 * A glyph sitting in a line box is centred on the *font's* idea of centre,
 * which moves with the font — the theme palette's ✕ visibly drifted because
 * each theme loads different font metrics. Replace close glyphs with a
 * symmetric SVG and tag every single-glyph / single-SVG button so the grid
 * rule above can centre it exactly.
 */
function normaliseButton(b: HTMLButtonElement) {
  // Idempotent. Writing the same data attribute again would fire another
  // mutation record and could keep the observer busy forever.
  if (b.dataset.slateIcon) return;

  const text = (b.textContent || '').trim();
  const kids = Array.from(b.children);

  if (kids.length === 0 && CROSS_GLYPHS.has(text)) {
    b.innerHTML = CROSS_SVG;
    b.dataset.slateIcon = 'cross';
    if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'Close');
    return;
  }
  if ((kids.length === 0 && text.length > 0 && Array.from(text).length <= 2) ||
      (kids.length === 1 && kids[0].tagName.toLowerCase() === 'svg')) {
    b.dataset.slateIcon = '1';
  }
}

function scanIcons() {
  document.querySelectorAll<HTMLButtonElement>('button').forEach(normaliseButton);
}

/* ------------------------------------------------------------------ */
/* Anchoring                                                           */
/* ------------------------------------------------------------------ */

export type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type Anchor = HTMLElement | RectLike;

export type AnchorOptions = {
  /** horizontal relationship to the trigger */
  align?: 'center' | 'start' | 'end';
  /** distance between trigger and panel */
  gap?: number;
  /** minimum distance from any viewport edge */
  edge?: number;
  /** never let the panel open higher than this (toolbar floor) */
  minTop?: number;
  /** allow the panel to flip above the trigger when it would be clipped */
  flip?: boolean;
};

export type Placement = {
  left: number;
  top: number;
  side: 'below' | 'above';
  /** where the panel lands when left/top are 0 — the transformed-ancestor offset */
  originX: number;
  originY: number;
};

/**
 * The viewport point a panel's `left:0;top:0` actually resolves to.
 *
 * This is not the same as its offsetParent. `left` is measured from the
 * containing block, and a transformed ancestor — or an absolutely positioned
 * box wider than the screen — becomes that containing block while offsetParent
 * still reports the nearest *positioned* ancestor. On a phone the two were
 * 197px apart, which is why a dragged panel snapped sideways on the first move
 * and then tracked at the wrong rate: the pointer had to travel far past the
 * target before the panel arrived. Measuring costs one forced layout per drag
 * and is right in every case, including margins, which cancel out.
 */
function zeroOrigin(panel: HTMLElement): { x: number; y: number } {
  const s = panel.style;
  const keep = { left: s.left, top: s.top, right: s.right, bottom: s.bottom, transition: s.transition };
  s.transition = 'none';
  s.left = '0px';
  s.top = '0px';
  s.right = 'auto';
  s.bottom = 'auto';
  const r = panel.getBoundingClientRect();
  s.left = keep.left;
  s.top = keep.top;
  s.right = keep.right;
  s.bottom = keep.bottom;
  s.transition = keep.transition;
  return { x: r.left, y: r.top };
}

/** Guards the deferred transition restore against a newer anchor call. */
const anchorToken = new WeakMap<HTMLElement, object>();

/**
 * The inline box styles a panel had before we first positioned it. `open()`
 * in page-menu calls place() twice, so a "restore to whatever the style is
 * now" approach would restore our own `transition:none`; and `anchorBelow`
 * sets `position:fixed` inline on a row that is in normal flow when closed,
 * so closing has to put that back too.
 */
type BoxStyles = {
  position: string;
  left: string;
  top: string;
  right: string;
  bottom: string;
  transform: string;
  transition: string;
};
const baseBox = new WeakMap<HTMLElement, BoxStyles>();
/** The transition value that must come back after measurement, not `none`. */
const transitionBase = new WeakMap<HTMLElement, string>();
/** A pending "did the content settle at a different size?" check. */
const settledCheck = new WeakMap<HTMLElement, object>();

function readBox(el: HTMLElement): BoxStyles {
  const s = el.style;
  return {
    position: s.position, left: s.left, top: s.top, right: s.right,
    bottom: s.bottom, transform: s.transform, transition: s.transition,
  };
}

export function rectOf(a: Anchor): RectLike {
  if (a instanceof HTMLElement) {
    const r = a.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }
  return a;
}

export function clamp(lo: number, hi: number, n: number) {
  return Math.min(Math.max(n, lo), Math.max(lo, hi));
}

/**
 * Place a panel directly below its trigger, centred on it, flipping above when
 * the bottom edge would be clipped and clamping horizontally to the viewport.
 *
 * The measure-at-zero step is not optional: several panels live inside `#bar`,
 * which some skins put a filter/transform on. A fixed box inside a transformed
 * ancestor is positioned against that ancestor, not the window, so raw
 * viewport coordinates land in the wrong place. Measuring where the panel
 * actually sits at `left:0;top:0` gives us the offset to subtract.
 */
export function anchorBelow(panel: HTMLElement, anchor: Anchor, opts: AnchorOptions = {}): Placement | null {
  if (!panel || !anchor) return null;
  // Once a user has dragged a panel, its position is theirs until it closes.
  if (panel.dataset.slateDragged === '1') return null;

  const r = rectOf(anchor);
  if (!r.width && !r.height) return null;

  const gap = opts.gap ?? UI.gap;
  const edge = opts.edge ?? UI.edge;
  const align = opts.align ?? 'center';
  const flip = opts.flip !== false;

  const st = panel.style;
  if (!baseBox.has(panel)) baseBox.set(panel, readBox(panel));
  const oldLeft = st.left;
  const oldTop = st.top;
  // Remember the *original* transition. When a module anchors twice in one
  // tick (page-menu does), the second call must not adopt the first call's
  // `none` as the value to restore.
  if (!transitionBase.has(panel)) transitionBase.set(panel, st.transition);
  st.position = 'fixed';
  // Inline styles beat any selector, so this also removes the translate()
  // used by the old vertical-centring tricks without an !important rule that
  // would break entry animations on panels we do not anchor. Killing the
  // transition during the measurement matters just as much: a panel that
  // animates `transform` would still report its *in-flight* rect at left:0,
  // which makes the origin correction wrong by half the panel's height.
  st.transition = 'none';
  st.transform = 'none';
  st.right = 'auto';
  st.bottom = 'auto';
  st.left = '0px';
  st.top = '0px';

  const at0 = panel.getBoundingClientRect();
  const w = at0.width || panel.offsetWidth;
  const h = at0.height || panel.offsetHeight;
  if (!w || !h) {
    st.left = oldLeft;
    st.top = oldTop;
    const base = transitionBase.get(panel) ?? '';
    if (base) st.transition = base;
    else st.removeProperty('transition');
    return null;
  }

  const originX = at0.left;
  const originY = at0.top;

  let wantLeft =
    align === 'start' ? r.left : align === 'end' ? r.right - w : r.left + r.width / 2 - w / 2;
  wantLeft = clamp(edge, window.innerWidth - w - edge, wantLeft);

  const below = Math.max(r.bottom + gap, opts.minTop ?? -Infinity);
  let wantTop = below;
  let side: 'below' | 'above' = 'below';

  if (flip && below + h > window.innerHeight - edge) {
    const above = r.top - h - gap;
    if (above >= edge) {
      wantTop = above;
      side = 'above';
    } else {
      // Neither side fits. Keep the trigger relationship and let the panel's
      // own scrolling body take the overflow instead of covering the trigger.
      wantTop = clamp(edge, window.innerHeight - h - edge, below);
    }
  }

  st.left = `${Math.round(wantLeft - originX)}px`;
  st.top = `${Math.round(wantTop - originY)}px`;
  // Restore after one painted frame. Doing it synchronously would restart the
  // very transition we suppressed; a single rAF runs *before* that paint, so
  // nest one more. The token makes a second anchor call win the restore.
  const token = {};
  anchorToken.set(panel, token);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (anchorToken.get(panel) !== token) return;
      const base = transitionBase.get(panel) ?? '';
      if (base) st.transition = base;
      else st.removeProperty('transition');
      transitionBase.delete(panel);
    });
  });

  // A panel can finish laying itself out a frame after it opens — a select
  // filled from state, a KaTeX run, a canvas sized in JS. The engine's drawer
  // grows ~60px wider, which shifts its centre off the trigger. Place now so
  // there is no flash, then correct once the box has actually settled.
  const settle = {};
  settledCheck.set(panel, settle);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (settledCheck.get(panel) !== settle) return;
      if (!panel.isConnected || panel.dataset.slateDragged === '1' || !isVisible(panel)) return;
      const now = panel.getBoundingClientRect();
      if (Math.abs(now.width - w) < 1 && Math.abs(now.height - h) < 1) return;
      anchorBelow(panel, anchor, opts);
    });
  });
  return { left: Math.round(wantLeft), top: Math.round(wantTop), side, originX, originY };
}

/* ------------------------------------------------------------------ */
/* Dragging                                                            */
/* ------------------------------------------------------------------ */

type DragMode = 'offset' | 'transform';
type DragMemo = BoxStyles & {
  mode: DragMode;
};
const dragMemo = new WeakMap<HTMLElement, DragMemo>();
const dragState = new WeakMap<HTMLElement, { dx: number; dy: number; mode: DragMode }>();

const NO_DRAG =
  'button,input,select,textarea,a,label,canvas,[role="slider"],[role="switch"],[data-no-drag],[contenteditable="true"]';

export function isVisible(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Drag a floating panel by its header (or by any quiet area of the panel when
 * there is no header). Interactive children keep their own behaviour — a close
 * button must close, not start a drag.
 *
 * Fixed panels move with left/top; panels that stay in flow (the theme dialog
 * inside its centred overlay) move with a translate instead.
 */
export function makeDraggable(panel: HTMLElement, handleSelector?: string) {
  if (!panel || panel.dataset.slateDrag === '1') return;
  panel.dataset.slateDrag = '1';

  // The whole panel advertises the grab cursor; a named header gets it too,
  // but it is not the *only* drag surface. Several headers are made entirely
  // of buttons (the page menu's, for one), and a user must still be able to
  // move that panel from its quiet area.
  panel.classList.add('slate-grab');
  if (handleSelector) {
    panel.querySelectorAll<HTMLElement>(handleSelector).forEach((h) => h.classList.add('slate-grab'));
  }

  panel.addEventListener(
    'pointerdown',
    (down) => {
      if (down.pointerType === 'mouse' && down.button !== 0) return;
      const target = down.target as Element | null;
      if (!target || !target.closest) return;
      if (target.closest(NO_DRAG)) return;
      // Dragging works from any quiet part of the panel. Interactive children
      // keep their own behaviour (a close button must close, not start a drag).
      if (!isVisible(panel)) return;

      const mode: DragMode =
        getComputedStyle(panel).position === 'fixed' || getComputedStyle(panel).position === 'absolute'
          ? 'offset'
          : 'transform';

      if (!dragMemo.has(panel)) {
        dragMemo.set(panel, { mode, ...readBox(panel) });
      }

      const start = panel.getBoundingClientRect();
      /* Where this panel's own `left`/`top` are measured from — which is not
         always the viewport, and not always its offsetParent either. Writing a
         viewport coordinate straight into style.left is what made the panel
         jump on the first move and then track at the wrong rate. */
      const o0 = zeroOrigin(panel);
      const curLeft = start.left - o0.x;
      const curTop = start.top - o0.y;
      const px = down.clientX;
      const py = down.clientY;
      let moved = false;
      let dx = 0;
      let dy = 0;

      const move = (ev: PointerEvent) => {
        dx = ev.clientX - px;
        dy = ev.clientY - py;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        if (!moved) {
          moved = true;
          document.body.classList.add('slate-dragging');
          panel.dataset.slateDragged = '1';
          // Some panels never leave the DOM when closed — #bar2 just drops
          // its `open` class and collapses to a pill. Remember that the open
          // state is what made it draggable, so the registry can spot a close.
          panel.dataset.slateDragOpen = panel.classList.contains('open') ? '1' : '0';
        }
        ev.preventDefault();
        if (mode === 'offset') {
          const w = panel.offsetWidth;
          /* Clamp the *visual* position, then convert the applied delta back
             into the panel's own coordinate space. Adding dx to the stored
             `left` instead would have been wrong by exactly the containing
             block's offset. */
          const left = clamp(
            UI.edge - w + UI.iconBox,
            window.innerWidth - UI.iconBox,
            start.left + dx,
          );
          const top = clamp(UI.edge, window.innerHeight - UI.iconBox, start.top + dy);
          panel.style.left = `${Math.round(curLeft + (left - start.left))}px`;
          panel.style.top = `${Math.round(curTop + (top - start.top))}px`;
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        } else {
          panel.style.transform = `translate(${Math.round(dx)}px,${Math.round(dy)}px)`;
        }
      };

      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        document.body.classList.remove('slate-dragging');
        if (moved) dragState.set(panel, { dx, dy, mode });
      };

      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    },
    true,
  );
}

/**
 * Put a floating panel back exactly as it was before it was anchored or
 * dragged. This runs on close (including for panels that never actually got
 * dragged: `anchorBelow` sets `position:fixed` inline, which would otherwise
 * leave the collapsed trigger parked in mid-screen forever).
 */
export function resetDrag(panel: HTMLElement) {
  if (!panel) return;
  const memo = baseBox.get(panel) || dragMemo.get(panel);
  if (memo) {
    const s = panel.style;
    s.position = memo.position;
    s.left = memo.left;
    s.top = memo.top;
    s.right = memo.right;
    s.bottom = memo.bottom;
    s.transform = memo.transform;
    if (memo.transition) s.transition = memo.transition;
    else s.removeProperty('transition');
  }
  // Cancel any pending measurement restore so it cannot overwrite us later.
  anchorToken.delete(panel);
  transitionBase.delete(panel);
  settledCheck.delete(panel);
  dragState.delete(panel);
  delete panel.dataset.slateDragged;
  delete panel.dataset.slateDragOpen;
}

/** Anchor a panel to a trigger and make it draggable, in one call. */
export function bindFloating(panel: HTMLElement, trigger: Anchor, opts: AnchorOptions = {}) {
  if (!panel) return;
  makeDraggable(panel);
  return anchorBelow(panel, trigger, opts);
}

/* ------------------------------------------------------------------ */
/* Drag registry — panels are built lazily by their own modules         */
/* ------------------------------------------------------------------ */

type DragSpec = { panel: string; handle?: string };

const DRAG_SPECS: DragSpec[] = [
  { panel: '#bar2', handle: '#pgm-head' },
  { panel: '#edm-card', handle: '.edm-head' },
  // #gn-drw is bound by the engine's openDr() via bindFloating(), which knows
  // the trigger at the moment of the press.
  { panel: '#sh-pick' },
  { panel: '#pen-sheet', handle: '.ps-head' },
  // The board is the floating part; #gxm is just the corner container.
  { panel: '.gxm-board', handle: '.gxm-head' },
  { panel: '#gx-theme-panel .gxp-box', handle: '.gxp-head' },
  { panel: '#ink-pop', handle: '.ttl' },
  { panel: '.ink-sheet', handle: '.hd' },
  { panel: '#lasso-card', handle: '.lc-head' },
  { panel: '#calc-pop', handle: '.cp-top' },
  { panel: '#gn-stk', handle: '.gn-stk-head' },
  { panel: '#note-edit', handle: '.hd' },
];

const tracked = new Map<HTMLElement, boolean>();

/**
 * "Open" is not the same as "visible". A panel hidden with display:none is
 * gone, but #bar2 keeps its pill on screen and merely loses the `open` class.
 * Both count as a close, otherwise a dragged panel keeps its offset forever.
 */
function isActive(el: HTMLElement): boolean {
  if (!el.isConnected || !isVisible(el)) return false;
  if (el.dataset.slateDragOpen === '1' && !el.classList.contains('open')) return false;
  return true;
}

function syncPanels() {
  for (const spec of DRAG_SPECS) {
    document.querySelectorAll<HTMLElement>(spec.panel).forEach((el) => {
      if (!el.dataset.slateDrag) makeDraggable(el, spec.handle);
    });
  }
  // A panel that just closed gives up its drag offset, so the next opening is
  // anchored to its trigger again rather than to last time's screen position.
  for (const [el, wasActive] of tracked) {
    const nowActive = isActive(el);
    if (wasActive && !nowActive) resetDrag(el);
    tracked.set(el, nowActive);
  }
  for (const spec of DRAG_SPECS) {
    document.querySelectorAll<HTMLElement>(spec.panel).forEach((el) => {
      if (!tracked.has(el)) tracked.set(el, isActive(el));
    });
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

let queued = false;
let pendingForce = false;
let lastScan = 0;
let trailingTimer = 0;

function runScan() {
  lastScan = performance.now();
  scanIcons();
  syncPanels();
}

function schedule(force = false) {
  if (force) pendingForce = true;
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const forced = pendingForce;
    pendingForce = false;
    // Icon scans are cheap but the drawing surface mutates constantly; one
    // pass every 120ms is enough. A mutation landing *inside* that window
    // still gets a trailing pass, or it would be dropped entirely.
    if (forced || performance.now() - lastScan > 120) {
      runScan();
    } else if (!trailingTimer) {
      trailingTimer = window.setTimeout(() => {
        trailingTimer = 0;
        runScan();
      }, 130);
    }
  });
}

/** Newly built buttons and panels are handled at once, not on the throttle. */
function handleRecords(records: MutationRecord[]) {
  for (const r of records) {
    if (r.type === 'childList') {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        if (n.tagName === 'BUTTON') normaliseButton(n as HTMLButtonElement);
        n.querySelectorAll<HTMLButtonElement>('button').forEach(normaliseButton);
        for (const spec of DRAG_SPECS) {
          if (n.matches(spec.panel)) makeDraggable(n as HTMLElement, spec.handle);
          n.querySelectorAll<HTMLElement>(spec.panel).forEach((el) => makeDraggable(el, spec.handle));
        }
      }
    } else if (r.type === 'attributes' && r.target instanceof HTMLButtonElement) {
      normaliseButton(r.target);
    }
  }
  schedule();
}

function boot() {
  installSheet();
  scanIcons();
  syncPanels();
  lastScan = performance.now();

  new MutationObserver(handleRecords).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open'],
  });

  window.addEventListener('resize', () => schedule(true));
  window.addEventListener('orientationchange', () => schedule(true));

  (window as unknown as { __slateUI: unknown }).__slateUI = {
    anchorBelow,
    bindFloating,
    makeDraggable,
    resetDrag,
    isVisible,
    UI,
    CROSS_SVG,
    specs: DRAG_SPECS.map((s) => s.panel),
    placement: (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
