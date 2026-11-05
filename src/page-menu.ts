/**
 * One Page button instead of a row of fifteen.
 *
 * The engine builds a second toolbar row (`#bar2`) out of everything that did
 * not fit in the dark bar: paper, template, dpi, clear, zoom, fullscreen,
 * share, pen type, pressure, the selection nudges, Pen only and Sound. On a
 * laptop that row is a wall of controls that all say "page" in one way or
 * another, and it costs a strip of canvas.
 *
 * This module leaves the engine's markup where it is — re-parenting those
 * controls breaks the modules that insert next to them — and hides the row
 * behind a single pill. The row *is* the panel: it opens into a card, laid out
 * in labelled groups, and closes on the same button, on an outside press, on
 * Escape, or when a page action fires.
 */

const CSS = `
/* ---- closed: the pill sits where the row used to be ---- */
html[data-bar=full] #bar2:not(.open){
  background:transparent!important;border:0!important;box-shadow:none!important;
  padding:0!important;width:max-content!important;max-width:100%!important;
}
html[data-bar=full] #bar2:not(.open) > *:not(#pgm-head){display:none!important}
html[data-bar=full] #bar2:not(.open) .pgm-x{display:none!important}
html[data-bar=compact] #pgm-head{display:none!important}

#pgm-head{display:flex;align-items:center;gap:4px;order:-1}
#bar2 #pgm{
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 11px!important;border-radius:11px!important;
  background:#fff!important;color:#2b3542!important;
  font:600 12.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;
  box-shadow:0 8px 22px rgba(8,20,38,.22)!important;cursor:pointer;
  border:1px solid #eaeef5!important;
}
#bar2 #pgm:hover{background:#f7f9fd!important}
#bar2 #pgm svg{width:14px;height:14px;display:block;opacity:.8}
#bar2 #pgm .pgm-sub{font-weight:500;color:#8a94a6;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#bar2 #pgm .pgm-car{transition:transform .16s ease;opacity:.55}
#bar2.open #pgm .pgm-car{transform:rotate(180deg)}

/* ---- open: a card of labelled rows ---- */
/* The bar is its own stacking context and the ink pill (z 28) plus its
   popovers (z 34) sit right under it, so an open card has to win that fight. */
html[data-pgm="1"] #tb{z-index:40!important}
/* ...but anything the card *opens* has to win against the card. Guides,
   Layers, Engineering symbols and the Figure library are all the engine's
   drawer, which sits at z 30 — under the card at 60, so the window opened
   behind the menu and you could only see the sliver that stuck out. */
html[data-pgm="1"] #gn-drw{z-index:70!important}
html[data-bar=full] #bar2.open{
  position:fixed!important;left:0;top:0;margin:0!important;
  display:flex!important;flex-wrap:wrap!important;align-items:center!important;
  justify-content:flex-start!important;
  gap:4px 6px!important;padding:8px 11px 10px!important;
  width:max-content!important;max-width:min(94vw,620px)!important;
  max-height:calc(100vh - 130px)!important;overflow-y:auto!important;overflow-x:hidden!important;
  background:#fff!important;border:1px solid #e7ecf4!important;border-radius:15px!important;
  box-shadow:0 18px 44px rgba(8,20,38,.28)!important;z-index:60;
}
html[data-bar=full] #bar2.open #pgm-head{
  flex:0 0 100%;justify-content:space-between;
  padding:0 2px 5px!important;border-bottom:1px solid #f0f3f8;margin-bottom:4px;
}
html[data-bar=full] #bar2.open #pgm{
  box-shadow:none!important;border:0!important;background:transparent!important;
  padding:0!important;font:600 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;
  letter-spacing:.09em;text-transform:uppercase;color:#8a94a6!important;
}
html[data-bar=full] #bar2.open #pgm .pgm-sub,
html[data-bar=full] #bar2.open #pgm .pgm-car{display:none}

/* A zero-height, full-width spacer is the only way to start a new line in a
   wrapping flex row without wrapping the controls in a container — and wrapping
   them is what breaks the engine's own insertions. */
#bar2 .pgm-br{flex:0 0 100%;height:0;margin:0;padding:0;border:0}
/* the paper detail rows, hosted from paper-pro. A column, not a wrapped row:
   each setting gets its own line, and a row of chips cannot run into the title
   of the next one. */
#bar2 .pgm-detail{
  flex:0 0 100%;display:flex;flex-direction:column;align-items:stretch;gap:1px;
  padding:6px 0 2px;margin-top:4px;border-top:1px solid #f0f3f8;
}
#bar2 .pgm-detail > div{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}
/* page flow: one page at a time, or one long strip */
#bar2 .pgm-flow{
  flex:0 0 100%;display:flex;flex-direction:column;align-items:stretch;gap:1px;
  padding:6px 0 2px;margin-top:4px;border-top:1px solid #f0f3f8;
}
#bar2 .pgm-flow > div{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}
#bar2 .pgm-lab{
  flex:0 0 auto;font:600 9.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  letter-spacing:.09em;text-transform:uppercase;color:#a3adbd;
  padding:3px 2px 3px 0;pointer-events:none;align-self:center;
}
/* separators are noise inside a card */
#bar2.open > .sep{display:none!important}
/* The card gives every engine button the same pale fill. The chips below the
   rows draw their own — which option is chosen — and that rule used to flatten
   all of them to the same grey, so a setting looked unset whichever one you
   pressed. They are excluded above, and the chosen one is restated here so no
   later sheet can flatten it again. */
#bar2.open .pgm-chip{background:#f4f6fa!important}
#bar2.open .pgm-chip.on{
  background:color-mix(in srgb,var(--ac) 14%,transparent)!important;
  border-color:var(--ac)!important;color:var(--ac)!important;
}
#bar2.open select,
#bar2.open button:not(#pgm),
#bar2.open label{font-size:12px!important;border-radius:9px!important}
#bar2.open select{padding:6px 7px!important;max-width:170px}
#bar2.open label{display:inline-flex;align-items:center;gap:6px;padding:5px 8px!important}
#bar2.open button.pgm-x{
  margin-left:auto;width:24px;height:24px;padding:0!important;
  display:grid;place-items:center;border-radius:7px!important;
  background:#f2f4f8!important;color:#5d6776!important;font-size:11px;
}
#bar2.open button.pgm-x:hover{background:#e8ecf3!important}
#bar2.open button:not(.pgm-x):not(#pgm):not(.pgm-chip){background:#f4f6fa!important}
/* The pills are a fixed pale fill, so their glyphs have to be fixed dark ink.
   The theme paints every #bar2 control with --tx, and --tx is near-white on a
   dark theme — which made the icons white on a white pill and they vanished
   (Black Hole, Cozy, and anything else with a dark surface). The engine's icons
   are inline <svg stroke="currentColor">, so this one property is the whole
   fix.
   Two deliberate omissions. A toggled button is excluded because it sits on
   the accent and needs the white text it already asks for. And the selector
   carries no #pgm or .pgm-x in its :not() chain, which keeps it at two ids —
   the three hand-written skins (lofi, cyberdeck, minecraft) each give the card
   their own fill *and* ink in one rule at three ids, so they still win and keep
   their own look. This rule is only for the twenty material themes, which have
   no such pairing of their own. */
html #tb #bar2.open button:not(.pgm-chip):not(.on){
  color:#2b3542!important;
}
`;

const ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8.5L19 8v12.5H6z"/>' +
  '<path d="M14 3.5V8h4.5"/><path d="M9 13h7M9 16.5h4.5"/></svg>';
const CARET =
  '<svg class="pgm-car" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

/** Where each group of controls starts, in reading order. */
const GROUPS: [string, string][] = [
  ['#fnt', 'Text'],
  ['#tpl', 'Paper'],
  ['#clr', 'This page'],
  ['#zo', 'View'],
  ['#pt', 'Pen'],
  ['#sg', 'Selection'],
  // Pen only and Sound used to close this list. They live in their own pill now
  // (`editor-menu.ts`) — they are session switches, not page settings, and they
  // were the two things people opened this card *for* mid-sentence. What trails
  // after them is the engine's and the other modules' tool triggers, which were
  // never part of an "Editor" group and now get a heading that says so.
  ['button[title^="Guides"]', 'Tools'],
];

let bar2: HTMLElement | null = null;
let btn: HTMLButtonElement | null = null;
let sub: HTMLElement | null = null;
let built = false;
/** Watches the row so the group headings survive the engine's rewrites. */
let mo: MutationObserver | null = null;

/**
 * Put a heading and a line break in front of each group.
 *
 * The row is a wrapping flex container, and flex has no "keep this with the
 * next item" — so a heading can end up dangling at the end of a line. A
 * zero-height full-width spacer before it starts a fresh line instead, and the
 * heading then sits at the left of its own controls. Nothing is re-parented:
 * the engine keeps inserting into this row, and moving its children breaks
 * that.
 *
 * The engine does not leave the row alone, though. Opening the card makes it
 * re-append every control it owns in its own order, and anything it does not
 * recognise — these headings — is pushed to the end: the labels ended up in a
 * column under the controls, each on an empty row. So this is not a one-shot
 * any more. The observer below re-runs it whenever the row changes, and the
 * `labelsOk` guard keeps that from turning into a loop, because a second pass
 * finds nothing to do.
 */

/** The direct child of the card that starts a group, or null if it is hidden. */
function anchorFor(sel: string): Element | null {
  if (!bar2) return null;
  const target = bar2.querySelector<HTMLElement>(sel);
  if (!target || getComputedStyle(target).display === 'none') return null;
  // Pen only / Sound sit inside their own <label>, so walk up to the child of
  // the card — inserting *before* it is safe, moving it is not
  let node: Element | null = target;
  while (node && node.parentElement !== bar2) node = node.parentElement;
  if (!node || node.id === 'pgm-head' || node.classList.contains('pgm-lab')) return null;
  return node;
}

/** True when every heading already sits immediately before its group. */
function labelsOk(): boolean {
  for (const [sel, name] of GROUPS) {
    const a = anchorFor(sel);
    if (!a) continue;
    const lab = a.previousElementSibling;
    if (!lab || !lab.classList.contains('pgm-lab') || lab.textContent !== name) return false;
  }
  return true;
}

function layout() {
  if (!bar2 || labelsOk()) return;
  bar2.querySelectorAll('.pgm-br,.pgm-lab').forEach((n) => n.remove());
  for (const [sel, name] of GROUPS) {
    const a = anchorFor(sel);
    if (!a) continue;
    const br = document.createElement('i');
    br.className = 'pgm-br';
    const lab = document.createElement('span');
    lab.className = 'pgm-lab';
    lab.textContent = name;
    bar2.insertBefore(br, a);
    bar2.insertBefore(lab, a);
  }
}

function build() {
  bar2 = document.getElementById('bar2');
  if (!bar2 || built) return;
  built = true;

  btn = document.createElement('button');
  btn.id = 'pgm';
  btn.type = 'button';
  btn.title = 'Page setup';
  btn.setAttribute('aria-label', 'Page setup');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = ICON + '<span>Page</span><span class="pgm-sub"></span>' + CARET;
  sub = btn.querySelector('.pgm-sub');
  btn.onclick = (e) => {
    e.stopPropagation();
    if (bar2!.classList.contains('open')) close();
    else open();
  };

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'pgm-x';
  x.setAttribute('aria-label', 'Close');
  x.textContent = '✕';
  x.onclick = (e) => {
    e.stopPropagation();
    close();
  };

  const head = document.createElement('div');
  head.id = 'pgm-head';
  head.append(btn, x);
  bar2.insertBefore(head, bar2.firstChild);

  // the engine rewrites this row whenever the tools sync; put the headings
  // back on the frame after it does
  mo?.disconnect();
  mo = new MutationObserver(() => layout());
  mo.observe(bar2, { childList: true });

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (!t) return;
    if (t.id === 'tpl' || t.id === 'pc') {
      paint();
      // the paper rows depend on which paper this is
      mountDetail(true);
      place();
    }
  });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    // a page action is a one-shot: close so the result is visible
    if (t && t.closest && t.closest('#bar2') && !t.closest('#pgm') && t.closest('#clr')) close();
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!bar2 || !bar2.classList.contains('open')) return;
      const t = e.target as HTMLElement;
      if (!t.closest) return;
      if (t.closest('#bar2') || t.closest('#pgm')) return;
      close();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('resize', () => close());

  paint();
}

/**
 * Hang the card under the toolbar.
 *
 * `#bar2` lives inside `#bar`, which is itself positioned, so `top:100%` lands
 * the card *over* the row instead of under it. Measure the bar and pin the card
 * to the viewport instead.
 */
function place() {
  if (!bar2) return;
  const tb = document.getElementById('tb');
  if (!tb) return;
  const r = tb.getBoundingClientRect();
  // A fixed box is positioned against its nearest transformed ancestor, not the
  // viewport, so ask the browser where the card actually landed and shift it by
  // the difference instead of trusting the coordinates.
  bar2.style.left = '0px';
  bar2.style.top = '0px';
  const b = bar2.getBoundingClientRect();
  const wantLeft = Math.max(8, Math.min(window.innerWidth - 8 - b.width, r.left + r.width / 2 - b.width / 2));
  const wantTop = r.bottom + 6;
  bar2.style.left = `${Math.round(wantLeft - b.left)}px`;
  bar2.style.top = `${Math.round(wantTop - b.top)}px`;
}

/** The page's own record — the selects can lag behind it after a page turn. */
function pageInfo(): { tpl: string; col: string } {
  try {
    const p = (0, eval)('typeof pg === "function" ? pg() : null');
    return { tpl: p?.tpl || '', col: p?.col || '' };
  } catch {
    return { tpl: '', col: '' };
  }
}

function optionText(sel: HTMLSelectElement | null, value: string): string {
  if (!sel || !value) return '';
  const opt = Array.from(sel.options).find((o) => o.value === value);
  return opt ? opt.text : '';
}

function paint() {
  if (!sub) return;
  const tpl = document.getElementById('tpl') as HTMLSelectElement | null;
  const pc = document.getElementById('pc') as HTMLSelectElement | null;
  const info = pageInfo();
  const paper =
    optionText(tpl, info.tpl) ||
    (tpl && tpl.selectedIndex >= 0 ? tpl.options[tpl.selectedIndex].text : '');
  const colour = optionText(pc, info.col);
  const next = [paper, colour].filter(Boolean).join(' · ');
  if (sub.textContent !== next) {
    sub.textContent = next;
    btn?.setAttribute('aria-label', `Page setup — ${next || 'paper'}`);
  }
}

/** Paper ruling, grid, margin and texture — the rows the drawer used to hold. */
function mountDetail(force = false) {
  if (!bar2) return;
  let host = bar2.querySelector<HTMLElement>('.pgm-detail');
  if (!host) {
    host = document.createElement('div');
    host.className = 'pgm-detail';
    bar2.append(host);
  }
  if (host.childElementCount && !force) return;
  // which rows apply depends on the paper, so a template change rebuilds it
  host.innerHTML = '';
  const fn = (window as any).__paperDetail;
  if (typeof fn === 'function') {
    try {
      fn(host);
    } catch {
      /* paper detail is a bonus; the card works without it */
    }
  }
}

/**
 * How pages follow one another: the current page alone, or a strip of them.
 *
 * It lives in this card rather than the drawer because it is a property of the
 * page, like the ruling — and because the drawer is a settings screen you open
 * to change something once, while this is a thing you switch when the document
 * changes shape.
 */
function mountFlow() {
  if (!bar2) return;
  let host = bar2.querySelector<HTMLElement>('.pgm-flow');
  if (!host) {
    host = document.createElement('div');
    host.className = 'pgm-flow';
    bar2.append(host);
  }
  const fn = (window as any).__inkpad_pagestrip?.panel;
  if (typeof fn !== 'function') return;
  try {
    fn(host);
  } catch {
    /* the card still works without the row */
  }
}

function open() {
  if (!bar2) return;
  paint();
  bar2.classList.add('open');
  document.documentElement.dataset.pgm = '1';
  place();
  try {
    layout();
  } catch {
    /* the row was rebuilt under us; grouping is a nicety, not a feature */
  }
  mountDetail();
  mountFlow();
  place();
  btn?.setAttribute('aria-expanded', 'true');
}

function close() {
  if (!bar2 || !bar2.classList.contains('open')) return;
  bar2.classList.remove('open');
  delete document.documentElement.dataset.pgm;
  btn?.setAttribute('aria-expanded', 'false');
}

function boot() {
  const style = document.createElement('style');
  style.id = 'pgm-style';
  style.textContent = CSS;
  document.head.append(style);

  const tick = () => {
    const row = document.getElementById('bar2');
    // the engine rebuilds the row when a notebook opens, so wait until it is
    // filled before taking it over
    if (!row) return;
    if (!row.querySelector('#pgm') && (row.querySelector('#tpl') || row.children.length)) {
      built = false;
      build();
    }
    // the pill names the paper, and the paper changes with the page
    paint();
  };
  tick();
  window.setInterval(tick, 900);
}

boot();

(window as any).__inkpad_pagemenu = {
  open,
  close,
  toggle: () => (bar2?.classList.contains('open') ? close() : open()),
  isOpen: () => !!bar2?.classList.contains('open'),
};
