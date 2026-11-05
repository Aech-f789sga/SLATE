/**
 * One page at a time, or one long strip.
 *
 * The editor has always shown a single sheet that fills the window, and a page
 * turn is a flip: the old page peels away and the new one lands in the same
 * place. That is the right model for a notebook you read a page at a time, and
 * the wrong one for a long document — you cannot scroll, you cannot see where
 * you are, and the flip makes every page change a small performance.
 *
 * So the Page card gets a choice. "Long strip" stacks every page down the
 * window with a narrow gap between them, the way a rolled-up scroll reads: the
 * gap is the only marker of a page break, which is exactly enough to tell you
 * the sheet ended and not enough to break the flow of the writing.
 *
 * The engine is not asked to change. It still draws exactly one page into one
 * canvas, and every coordinate in it — strokes, text boxes, the pen pill's
 * hit-testing, the lasso — stays in page space, which is why none of that code
 * needs to know this exists. What changes is only where that canvas *sits*: the
 * live sheet is the engine's own `#wrap`, moved into the strip at the position
 * of the current page, and the pages above and below are static renders into
 * their own canvases.
 *
 * That has two consequences worth naming:
 *
 *   • Scrolling is what changes the page. A scroll handler works out which
 *     sheet owns the reading line and, when it changes, hands the engine a new
 *     `pi` through its own `load()`. So a stroke always lands on the page you
 *     are looking at.
 *   • Only the current page is editable, because only the current page is the
 *     engine's canvas. That is the same contract as the single-page view, just
 *     reached by scrolling instead of flipping.
 *
 * Off-screen pages are painted lazily and released when they are far away, so a
 * forty-page notebook costs a handful of canvases rather than forty.
 */

const KEY = 'inkpad-page-flow';

/** Space between two pages. Small on purpose: it is a page break, not a gap. */
const GAP = 12;

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T | null;
  } catch {
    return null;
  }
}

const CSS = `
/* ---- the strip ---- */
html[data-flow="strip"] #stage{justify-content:center;scrollbar-gutter:stable}
#pstrip{
  display:flex;flex-direction:column;align-items:stretch;
  gap:${GAP}px;margin:0 auto;flex:none;
  max-width:100%;padding-bottom:26px;
}
/* the engine sets a pixel width on #wrap from its own layout pass; inside the
   strip that width is the strip's width, so the auto margins have nothing to do */
#pstrip > #wrap{margin:0;flex:none}
.ps-sheet{
  position:relative;flex:none;width:100%;overflow:hidden;
  background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.25);
}
.ps-sheet > canvas{display:block;width:100%;height:100%}
/* an unrendered sheet is the same white box, so the strip never changes height
   while you scroll through it */
/* A finger has to be able to scroll the strip. With Pen only on, the canvas
   ignores touch pointers before it calls preventDefault, so allowing a vertical
   pan here costs nothing: the pen still draws, the finger scrolls. With Pen only
   off the engine does preventDefault on the press, which cancels the pan and
   keeps the finger drawing. */
html[data-flow="strip"] #cv{touch-action:pan-y}
`;

let on = false;
let want = false;
let strip: HTMLElement | null = null;
let stage: HTMLElement | null = null;
let wrap: HTMLElement | null = null;
/** One element per page, index-aligned. Exactly one of them is `wrap`. */
let sheets: HTMLElement[] = [];
/** The page count the strip was built for. */
let built = -1;
/** The page index this module last agreed with the engine about. */
let lastPi = -1;
/** Ignore the scroll events we caused ourselves until this timestamp. */
let quiet = 0;
let savedScrl = false;
let origGo: any = null;
let io: IntersectionObserver | null = null;
let ro: ResizeObserver | null = null;
let poll = 0;
let ticking = false;

/* ------------------------------------------------------------------ */
/* Talking to the engine                                               */
/* ------------------------------------------------------------------ */

const count = () => ev<number>('nb && nb.pages ? nb.pages.length : 0') || 0;
const cur = () => ev<number>('typeof pi === "number" ? pi : 0') || 0;

function pageAt(i: number): any {
  return ev<any>(`nb && nb.pages ? nb.pages[${i}] : null`);
}

/* ------------------------------------------------------------------ */
/* Sheets                                                              */
/* ------------------------------------------------------------------ */

/**
 * A page that is not the one you are writing on.
 *
 * Its height is reserved by the aspect ratio, not by the canvas, so an
 * unrendered sheet still takes up the right amount of room — the strip must not
 * grow or shrink under the scrollbar as pages come into view.
 */
function makeSheet(i: number): HTMLElement {
  const s = document.createElement('div');
  s.className = 'ps-sheet';
  s.dataset.i = String(i);
  const p = pageAt(i);
  s.style.aspectRatio = `${(p && p.pw) || 800} / ${(p && p.ph) || 1100}`;
  return s;
}

/** Paint a static page, at device resolution, through the engine's own renderer. */
function paintSheet(el: HTMLElement) {
  if (!el || el === wrap || el.parentElement !== strip) return;
  const i = Number(el.dataset.i);
  if (!Number.isFinite(i)) return;
  const p = pageAt(i);
  if (!p) return;
  const pw = p.pw || 800;
  const ph = p.ph || 1100;
  const cssW = el.clientWidth;
  if (cssW < 8) return;

  // capped: these are previews of pages you are not writing on, and a page is
  // a lot of pixels to keep around forty times over
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(64, Math.round(cssW * dpr));
  const h = Math.max(64, Math.round((w * ph) / pw));

  let c = el.querySelector('canvas') as HTMLCanvasElement | null;
  if (!c) {
    c = document.createElement('canvas');
    el.append(c);
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d');
  if (!g) return;
  g.setTransform(w / pw, 0, 0, h / ph, 0, 0);

  // render() takes a context, and an indirect eval cannot be handed one — so it
  // goes on the window for the length of the call
  (window as any).__psCtx = g;
  ev(`try{ render(__psCtx, nb.pages[${i}]) }catch(e){}`);
  (window as any).__psCtx = null;
}

function dropSheet(el: HTMLElement) {
  if (!el || el === wrap) return;
  const c = el.querySelector('canvas');
  if (c) c.remove();
}

/* ------------------------------------------------------------------ */
/* Building and moving the live page                                   */
/* ------------------------------------------------------------------ */

function fitWidth() {
  if (!strip || !wrap) return;
  const w = wrap.clientWidth;
  if (w > 0 && strip.style.width !== `${w}px`) strip.style.width = `${w}px`;
}

function build() {
  if (!stage || !wrap) return;
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'pstrip';
  }
  if (strip.parentElement !== stage) stage.append(strip);

  const n = count();
  const live = Math.max(0, Math.min(n - 1, cur()));

  // re-appending in index order is the whole layout: the engine's wrap is just
  // the sheet for the current page, and every other sheet is a static render
  strip.textContent = '';
  sheets = [];
  for (let i = 0; i < n; i++) {
    const el = i === live ? wrap : makeSheet(i);
    strip.append(el);
    sheets.push(el);
  }
  built = n;
  lastPi = live;

  io?.disconnect();
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (ents) => {
        for (const e of ents) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) paintSheet(el);
          else dropSheet(el);
        }
      },
      // two viewports of lead on either side: a page is painted before it can
      // be scrolled into view, and released long after it left
      { root: stage, rootMargin: '200% 0px 200% 0px' }
    );
    for (const el of sheets) if (el !== wrap) io.observe(el);
  }

  ro?.disconnect();
  if (typeof ResizeObserver === 'function') {
    let fitRaf = 0;
    ro = new ResizeObserver(() => {
      cancelAnimationFrame(fitRaf);
      fitRaf = requestAnimationFrame(() => fitWidth());
    });
    ro.observe(wrap);
    ro.observe(stage);
  }
  fitWidth();
}

/**
 * Move the engine's canvas to the page it now belongs to, and hand the page it
 * just left back to a static render.
 *
 * Both swaps replace a box of the same size, so the strip does not change
 * height and the scroll position does not move.
 */
function relocate() {
  if (!strip || !wrap) return;
  const n = cur();
  const here = sheets.indexOf(wrap);
  if (here === n) return;

  if (here >= 0) {
    const s = makeSheet(here);
    wrap.replaceWith(s);
    sheets[here] = s;
    io?.observe(s);
    paintSheet(s);
  }
  const at = sheets[n];
  if (at && at !== wrap) {
    at.replaceWith(wrap);
    io?.unobserve(at);
    sheets[n] = wrap;
  }
}

/** Give the engine a different current page, through its own page load. */
function syncTo(n: number) {
  if (n === cur()) return;
  ev(`try{ pi = ${n}; load(); }catch(e){}`);
  lastPi = n;
  relocate();
}

/* ------------------------------------------------------------------ */
/* Scrolling is what turns the page                                    */
/* ------------------------------------------------------------------ */

/** The sheet that owns the reading line — a third of the way down the window. */
function nearest(): number {
  if (!stage || !sheets.length) return cur();
  const sr = stage.getBoundingClientRect();
  const line = sr.top + Math.min(sr.height * 0.34, 260);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sheets.length; i++) {
    const r = sheets[i].getBoundingClientRect();
    const d = line < r.top ? r.top - line : line > r.bottom ? line - r.bottom : 0;
    if (d < bestD) {
      bestD = d;
      best = i;
      if (d === 0) break;
    }
  }
  return best;
}

function onScroll() {
  if (!on || Date.now() < quiet || ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    if (!on || Date.now() < quiet) return;
    const n = nearest();
    if (n !== cur()) syncTo(n);
  });
}

function scrollToPage(n: number) {
  if (!stage || !sheets[n]) return;
  const sr = stage.getBoundingClientRect();
  const r = sheets[n].getBoundingClientRect();
  quiet = Date.now() + 160;
  stage.scrollTo({ top: Math.max(0, stage.scrollTop + (r.top - sr.top) - 8), behavior: 'auto' });
}

/** Go to a page the way a page turn would: land on it, and leave it editable. */
function goTo(n: number) {
  if (!on) return;
  const total = count();
  if (n < 0 || n >= total) return;
  if (total !== built) build();
  syncTo(n);
  scrollToPage(n);
}

/* ------------------------------------------------------------------ */
/* Enable / disable                                                    */
/* ------------------------------------------------------------------ */

function hookNav(stripMode: boolean) {
  const prev = document.getElementById('prev') as HTMLElement | null;
  const next = document.getElementById('next') as HTMLElement | null;
  if (stripMode) {
    if (prev) prev.onclick = () => goTo(cur() - 1);
    if (next) next.onclick = () => goTo(cur() + 1);
  } else {
    // the engine's own handlers, restored
    if (prev) prev.onclick = () => ev('try{ if(pi>0){ pi--; load() } }catch(e){}');
    if (next) next.onclick = () => ev('try{ if(pi<nb.pages.length-1){ pi++; load() } }catch(e){}');
  }
}

function enable() {
  if (on) return;
  stage = document.getElementById('stage');
  wrap = document.getElementById('wrap');
  if (!stage || !wrap) return;

  on = true;
  document.documentElement.dataset.flow = 'strip';

  // The engine turns pages on a wheel or a swipe at the edges of the stage.
  // In a strip that gesture is just scrolling, and its "jump to the edge of the
  // page" would throw the strip back to the top of the document.
  savedScrl = ev<boolean>('typeof SCRL === "boolean" ? SCRL : false') === true;
  ev('try{ SCRL = false }catch(e){}');

  origGo = (window as any).goPage;
  (window as any).goPage = (n: number) => {
    if (on) goTo(n);
    else if (typeof origGo === 'function') origGo(n);
  };
  hookNav(true);

  build();
  scrollToPage(Math.max(0, cur()));
  stage.addEventListener('scroll', onScroll, { passive: true });
  poll = window.setInterval(tick, 180);
}

function disable() {
  if (!on) return;
  on = false;
  delete document.documentElement.dataset.flow;

  (window as any).goPage = origGo;
  ev(`try{ SCRL = ${savedScrl ? 'true' : 'false'} }catch(e){}`);
  hookNav(false);

  stage?.removeEventListener('scroll', onScroll);
  window.clearInterval(poll);
  io?.disconnect();
  io = null;
  ro?.disconnect();
  ro = null;

  if (strip && stage && wrap) {
    stage.insertBefore(wrap, strip);
    strip.remove();
  }
  strip = null;
  sheets = [];
  built = -1;
  lastPi = -1;
  ev('try{ fit() }catch(e){}');
}

/* ------------------------------------------------------------------ */
/* Watching for changes the strip did not make                         */
/* ------------------------------------------------------------------ */

function tick() {
  if (!on) return;
  const n = count();
  if (n !== built) {
    build();
    scrollToPage(Math.max(0, cur()));
    return;
  }
  const p = cur();
  if (p !== lastPi) {
    // the engine changed the page itself — a new page, a duplicate, a delete
    lastPi = p;
    relocate();
    scrollToPage(p);
  }
}

/* ------------------------------------------------------------------ */
/* The Page card row                                                   */
/* ------------------------------------------------------------------ */

function chip(label: string, active: boolean, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  // same opt-out as the paper chips: the card's blanket button fill would
  // otherwise make both choices look unset
  b.className = 'pgm-chip' + (active ? ' on' : '');
  b.style.cssText =
    'font-size:12px;padding:4px 9px;border-radius:9px;border:1px solid ' +
    (active ? 'var(--ac)' : 'var(--bd)') +
    ';background:' +
    (active ? 'color-mix(in srgb,var(--ac) 14%,transparent)' : 'transparent') +
    ';color:' +
    (active ? 'var(--ac)' : 'var(--tx)') +
    ';cursor:pointer';
  b.onclick = fn;
  return b;
}

function renderPanel(host: HTMLElement) {
  host.innerHTML = '';

  const t = document.createElement('div');
  t.style.cssText = 'font-weight:600;margin:10px 0 4px;font-size:12px;color:var(--mu)';
  t.textContent = 'Page flow';
  host.append(t);

  const n = document.createElement('div');
  n.style.cssText = 'font-size:11px;color:var(--mu);opacity:.85;margin:-2px 0 4px';
  n.textContent = 'How one page leads into the next.';
  host.append(n);

  const g = document.createElement('div');
  g.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center';
  host.append(g);
  g.append(chip('One page at a time', !on, () => set(false)));
  g.append(chip('Long strip', on, () => set(true)));

  const note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:var(--mu);opacity:.85;margin:4px 0 0';
  note.textContent = on
    ? 'Pages stack down the window and scroll, with a narrow gap at each page break. The flip is not used.'
    : 'The page you are on fills the window, and turning a page flips it over.';
  host.append(note);
}

function set(v: boolean) {
  want = v;
  try {
    localStorage.setItem(KEY, v ? 'strip' : 'single');
  } catch {
    /* the setting is a convenience; the session still honours the click */
  }
  if (v) enable();
  else disable();
  const host = document.querySelector('#bar2 .pgm-flow');
  if (host) renderPanel(host as HTMLElement);
}

function boot() {
  const style = document.createElement('style');
  style.id = 'pstrip-style';
  style.textContent = CSS;
  document.head.append(style);

  try {
    want = localStorage.getItem(KEY) === 'strip';
  } catch {
    want = false;
  }
  if (want) enable();

  // a notebook opened after this module booted still has to land in a strip
  window.setInterval(() => {
    if (!want || on) return;
    if (count() > 0) enable();
  }, 700);
}

boot();

(window as any).__inkpad_pagestrip = {
  on: () => on,
  want: () => want,
  set,
  toggle: () => set(!on),
  goTo,
  panel: renderPanel,
  /** Tests and other modules: force a full rebuild after editing page data. */
  refresh: () => {
    if (!on) return;
    build();
    scrollToPage(Math.max(0, cur()));
  },
  /**
   * Repaint the static pages in place.
   *
   * They are cached because nothing on them changes while you are writing on
   * another page — but the paper underneath all of them can change, and then
   * every sheet is stale and the strip shows the old ruling next to the new one.
   */
  repaint: () => {
    if (!on) return;
    for (const el of sheets) if (el !== wrap) paintSheet(el);
  },
};
