/**
 * One chevron that folds the page bar away.
 *
 * The engine's page bar is six controls wide — back, the page number, forward,
 * add, duplicate, delete — and it sits under the canvas for the whole session.
 * On a phone, or on a laptop held sideways, that strip is a sixth of the screen
 * spent on something you touch a few times a page.
 *
 * So the bar folds. The chevron is not part of that strip any more: it is a
 * fixed control in the bottom-right corner, directly *below* the tour icon,
 * where the other corner controls (?) and focus lock already live. Keeping it
 * as a child of `#pg` is deliberate — it inherits the editor's visibility and
 * focus-mode hiding, while `position:fixed` takes it out of the centred row.
 *
 * Nothing is re-parented and nothing is rebuilt — the engine owns these buttons
 * and keeps re-binding them, so this only adds a class of hiding to the row's
 * own children and lets them come back untouched.
 *
 * The footer pills (`1 / 2` and `100%`, bottom left) are deliberately *not*
 * part of the fold. They are a different element in a different module, they
 * are read far more often than they are clicked, and folding them would take
 * away the only page counter left on screen.
 */

const KEY = 'inkpad-pg-min';

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
  'stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';

const CSS = `
/* Bottom-right corner stack: focus lock (top), tour '?' (middle), this fold
   (bottom). The exact offsets are recomputed from the tour button, which lifts
   itself when the animation filmstrip is showing — the CSS values are only the
   pre-placement fallback. */
#pg > #pg-fold{
  position:fixed;right:18px;bottom:32px;z-index:59;
  display:grid;place-items:center;
  width:32px;height:32px;padding:0;flex:none;
  border:1px solid var(--bd,#d9d9de);border-radius:50%;
  background:var(--sf,#fff);color:var(--mu,#8a94a6);cursor:pointer;
  box-shadow:0 6px 18px rgba(6,12,28,.18);
  transition:transform .18s ease,color .15s ease,border-color .15s ease;
}
#pg > #pg-fold:hover{
  color:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6);transform:translateY(-1px);
}
#pg > #pg-fold svg{transition:transform .18s ease}

/* ---- folded: the row's controls are gone, the chevron turns over ---- */
html[data-pg-min="1"] #pg > *:not(#pg-fold){display:none!important}
html[data-pg-min="1"] #pg > #pg-fold svg{transform:rotate(180deg)}
/* Folded, the row gives its height back to the canvas: every control is hidden,
   the padding thins down, and only the fixed corner chevron is left on screen.
   Its fill and top rule go too, so no empty slab sits under the page. */
html[data-pg-min="1"] #pg{
  padding-top:2px;padding-bottom:2px;
  background:transparent;
  border-top-color:transparent;
}
/* On a short viewport #pg is already a floating pill in the bottom-right
   corner, so the chevron belongs back inside that pill rather than floating
   over it as a second control. */
html[data-short="1"] #pg > #pg-fold{
  position:static;width:24px;height:24px;border-radius:8px;
  box-shadow:none;transform:none;
}
html[data-short="1"][data-pg-min="1"] #pg{
  justify-content:center;
  padding:3px 4px;
  border-color:transparent;
}
`;

let bar: HTMLElement | null = null;
let btn: HTMLButtonElement | null = null;
let lastKey = '';

function folded(): boolean {
  return document.documentElement.dataset.pgMin === '1';
}

/**
 * Put the chevron under the tour button.
 *
 * `placeFab()` in the tour module lifts the '?' button whenever the animation
 * strip appears, so reading its rect is the only way to stay below it. Called
 * from that module, on resize / orientation change, and on a slow tick to catch
 * the button being shown or hidden by the tour watcher.
 */
function place(force = false) {
  if (!btn) return;

  // The phone pill owns its own chevron; no fixed offsets there.
  if (document.documentElement.dataset.short === '1') {
    if (lastKey !== 'short') {
      lastKey = 'short';
      btn.style.removeProperty('right');
      btn.style.removeProperty('bottom');
    }
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = btn.offsetWidth || 32;
  const h = btn.offsetHeight || 32;

  let cx = vw - 34;      // centre of the '?' button at its default right:14
  let fabBottom = 74;    // its default CSS bottom
  const fab = document.getElementById('tour-fab');
  if (fab && getComputedStyle(fab).display !== 'none') {
    const r = fab.getBoundingClientRect();
    if (r.width > 0) {
      cx = (r.left + r.right) / 2;
      fabBottom = vh - r.bottom;
    }
  }

  // Below the '?' means a smaller bottom offset: leave a 10 px gap between
  // the top of this button and the bottom of the tour button.
  const bottom = Math.max(8, Math.round(fabBottom - h - 10));
  const right = Math.max(8, Math.round(vw - cx - w / 2));
  const key = `${right}|${bottom}|${vw}|${vh}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  btn.style.right = right + 'px';
  btn.style.bottom = bottom + 'px';
}

function paint() {
  if (!btn) return;
  const min = folded();
  btn.title = min ? 'Show the page controls' : 'Hide the page controls';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-expanded', min ? 'false' : 'true');
}

function set(min: boolean, remember = true) {
  document.documentElement.dataset.pgMin = min ? '1' : '0';
  if (remember) {
    try {
      localStorage.setItem(KEY, min ? '1' : '0');
    } catch {
      /* private mode: the fold still works, it just forgets */
    }
  }
  place(true);
  paint();
}

function build() {
  if (btn) return;
  bar = document.getElementById('pg');
  if (!bar) return;

  btn = document.createElement('button');
  btn.id = 'pg-fold';
  btn.type = 'button';
  btn.innerHTML = CHEVRON;
  btn.onclick = (e) => {
    e.stopPropagation();
    set(!folded());
  };
  // Still a child of #pg so it inherits editor visibility and focus-mode
  // hiding, but visually out of the row: fixed, bottom-right, below the tour.
  bar.append(btn);

  const style = document.createElement('style');
  style.id = 'pg-fold-style';
  style.textContent = CSS;
  document.head.append(style);

  let stored = '';
  try {
    stored = localStorage.getItem(KEY) || '';
  } catch {
    stored = '';
  }
  set(stored === '1', false);

  window.addEventListener('resize', () => place());
  window.addEventListener('orientationchange', () => place(true));
  // The tour button is shown/hidden by a watcher rather than an event we own.
  window.setInterval(() => place(), 400);
  window.requestAnimationFrame(() => place(true));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
else build();

/** Small surface for the tour and for probes. */
(window as any).__inkpad_pgfold = {
  get: () => folded(),
  set: (v: boolean) => set(v),
  place: () => place(true),
};
