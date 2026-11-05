/**
 * One chevron that folds the page bar away.
 *
 * The engine's page bar is six controls wide — back, the page number, forward,
 * add, duplicate, delete — and it sits under the canvas for the whole session.
 * On a phone, or on a laptop held sideways, that strip is a sixth of the screen
 * spent on something you touch a few times a page.
 *
 * So the bar folds: one chevron on its left edge, the row behind it. Nothing is
 * re-parented and nothing is rebuilt — the engine owns these buttons and keeps
 * re-binding them, so this only adds a class of hiding to the row's own
 * children and lets them come back untouched.
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
#pg > #pg-fold{
  display:inline-flex;align-items:center;justify-content:center;
  width:24px;height:24px;padding:0;flex:none;
  border:1px solid var(--bd,#d9d9de);border-radius:8px;
  background:transparent;color:var(--mu,#8a94a6);cursor:pointer;
  transition:transform .18s ease,color .15s ease,border-color .15s ease;
}
#pg > #pg-fold:hover{color:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6)}
#pg > #pg-fold svg{transition:transform .18s ease}

/* ---- folded: the row is gone, the chevron turns over ---- */
html[data-pg-min="1"] #pg > *:not(#pg-fold){display:none!important}
html[data-pg-min="1"] #pg > #pg-fold svg{transform:rotate(180deg)}
/* A folded bar should not keep painting an empty slab under the canvas: it
   drops its fill and its rule and lets the chevron sit on the page instead. */
html[data-pg-min="1"] #pg{
  justify-content:flex-end;
  padding:2px 8px;
  background:transparent;
  border-top-color:transparent;
}
/* In the phone layout the bar is already a floating pill in the corner, so it
   keeps that frame — only the fill goes, to match the folded look. */
html[data-short="1"][data-pg-min="1"] #pg{
  justify-content:center;
  padding:2px 4px;
  border-color:transparent;
}
`;

let bar: HTMLElement | null = null;
let btn: HTMLButtonElement | null = null;

function folded(): boolean {
  return document.documentElement.dataset.pgMin === '1';
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
  // left edge, as far from Delete as the row allows
  bar.insertBefore(btn, bar.firstChild);

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
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
else build();

/** Small surface for the tour and for probes. */
(window as any).__inkpad_pgfold = {
  get: () => folded(),
  set: (v: boolean) => set(v),
};
