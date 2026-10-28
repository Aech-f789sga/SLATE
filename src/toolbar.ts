/**
 * Toolbar — one deduplicated, GoodNotes-shaped tool rail.
 *
 * The engine ships a very wide single row plus a second row of page controls,
 * and several batches since have added their own buttons on top. The result was
 * three ways to pick a colour, three ways to start a shape, two erasers and two
 * thickness readouts — each in its own panel.
 *
 * This module is the single place that decides *where every control lives*:
 *
 *   row 1 (dark)  ‹ Library · title │ pen highlighter eraser │ shapes text │
 *                 lasso laser fill │ image sticker snap │ undo redo │
 *                 accessories more
 *   row 2 (light) font* │ page template colour dpi │ clear page │
 *                 selection* │ full screen sidebar │ share paper settings │
 *                 pen-only sound │ guides layers animate video symbols figures
 *
 * `*` = contextual, only shown when it can actually do something.
 *
 * Nothing is re-implemented and no handler is rewired: buttons are moved with
 * `append`, which keeps every listener and every engine lookup intact.
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

function kids(root: HTMLElement): HTMLElement[] {
  return [...root.children] as HTMLElement[];
}

function pick(root: HTMLElement, sel: string): HTMLElement[] {
  return kids(root).filter((n) => {
    try {
      return n.matches(sel);
    } catch {
      return false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Duplicates that our own panels replaced                             */
/* ------------------------------------------------------------------ */

/**
 * `#sws` + `#col`      the legacy swatch strip — the pen pill owns colour now
 * `[data-t=pe]`        the stroke eraser — folded into Eraser Settings
 * `line` `rect` `ell`  three shape buttons — the Shapes picker owns all kinds
 */
const SUPERSEDED = [
  '#sws',
  '#col',
  '[data-t="pe"]',
  '[data-t="line"]',
  '[data-t="rect"]',
  '[data-t="ell"]',
];

/** Engine extras that are real features but belong on the secondary row. */
const TO_ROW2 = [
  'button[title="Guides, symmetry and perspective"]',
  'button[title^="Layers"]',
  'button[title^="Animate next drawing"]',
  'button[title="Play animation"]',
  'button[title="Insert video"]',
  'button[title="Engineering symbols"]',
  'button[title="Figure library"]',
];

/** Buttons our own modules create; they are insert tools, so row 1. */
const TO_ROW1 = ['#gn-stk-btn', '#snap-btn'];

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const ROW1: string[][] = [
  ['#back'],
  ['#title'],
  ['[data-t="pen"]', '[data-t="hl"]', '[data-t="er"]'],
  ['#sh-trigger', '[data-t="text"]'],
  ['[data-t="sel"]', '[data-t="laser"]', '[data-t="bk"]'],
  ['#img', '#gn-stk-btn', '#snap-btn'],
  ['#undo', '#redo'],
  ['#acc-trigger', '#more'],
];

const ROW2: string[][] = [
  ['#fnt'],
  ['#tpl', '#pc', 'select:not(#fnt):not(#tpl):not(#pc)', '#clr'],
  ['#sg', '#ss', '#dsel'],
  ['#zo', '#zi', '#fs', '#side-t'],
  ['#share', 'button[title^="Paper"]', 'button[title="Settings"]'],
  ['label'],
  [
    'button[title="Guides, symmetry and perspective"]',
    'button[title^="Layers"]',
    'button[title^="Animate next drawing"]',
    'button[title="Play animation"]',
    'button[title="Insert video"]',
    'button[title="Engineering symbols"]',
    'button[title="Figure library"]',
  ],
];

function makeSep(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'sep';
  s.setAttribute('data-gnsep', '1');
  return s;
}

/**
 * A rule only makes sense between two things you can see. Contextual controls
 * come and go, so re-check every rule after the order and the visibility have
 * both settled — otherwise a hidden font picker leaves a floating divider at
 * the start of the row.
 */
function fixSeps(root: HTMLElement) {
  const all = kids(root);
  const visible = (n: HTMLElement | null) =>
    !!n && !n.hasAttribute('data-gnsep') && getComputedStyle(n).display !== 'none';

  all.forEach((n, i) => {
    if (!n.hasAttribute('data-gnsep')) return;
    let prev: HTMLElement | null = null;
    let next: HTMLElement | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (!all[j].hasAttribute('data-gnsep')) {
        prev = all[j];
        break;
      }
    }
    for (let j = i + 1; j < all.length; j++) {
      if (!all[j].hasAttribute('data-gnsep')) {
        next = all[j];
        break;
      }
    }
    n.style.display = visible(prev) && visible(next) ? '' : 'none';
  });
}

/** Re-order a row into the given groups, with a rule between each group. */
function applyOrder(root: HTMLElement, groups: string[][]) {
  const flat: HTMLElement[] = [];
  const startsGroup = new Set<HTMLElement>();

  for (const group of groups) {
    const bucket: HTMLElement[] = [];
    for (const sel of group) {
      for (const n of pick(root, sel)) if (!bucket.includes(n)) bucket.push(n);
    }
    if (!bucket.length) continue;
    startsGroup.add(bucket[0]);
    flat.push(...bucket);
  }
  // anything we did not name keeps its relative place at the end
  for (const n of kids(root)) {
    if (!flat.includes(n) && !n.hasAttribute('data-gnsep')) flat.push(n);
  }

  const cur = kids(root).filter((n) => !n.hasAttribute('data-gnsep'));
  const same = cur.length === flat.length && cur.every((n, i) => n === flat[i]);
  const seps = root.querySelectorAll('[data-gnsep]').length;
  if (same && seps > 0) return;

  root.querySelectorAll('[data-gnsep]').forEach((n) => n.remove());
  let seen = 0;
  for (const n of flat) {
    if (seen > 0 && startsGroup.has(n)) root.append(makeSep());
    root.append(n);
    seen++;
  }
}

/* ------------------------------------------------------------------ */
/* Contextual row                                                      */
/* ------------------------------------------------------------------ */

const CONTEXTUAL: { sel: string; when: (sel: boolean) => boolean }[] = [
  { sel: '#fnt', when: () => ev<string>('tool') === 'text' },
  { sel: '#sg', when: (hasSel) => hasSel },
  { sel: '#ss', when: (hasSel) => hasSel },
  { sel: '#dsel', when: (hasSel) => hasSel },
];

function hasSelection(): boolean {
  const n = ev<number>('sel && sel.length ? sel.length : 0');
  return typeof n === 'number' && n > 0;
}

let lastCtx = '';

function paintContext() {
  const hasSel = hasSelection();
  const flags = CONTEXTUAL.map((c) => c.when(hasSel));
  const key = flags.map((f) => (f ? '1' : '0')).join('');
  if (key === lastCtx) return;
  lastCtx = key;
  CONTEXTUAL.forEach((c, i) => {
    document.querySelectorAll<HTMLElement>(`#bar2 ${c.sel}`).forEach((n) => {
      n.style.display = flags[i] ? '' : 'none';
    });
  });
  const bar2 = document.getElementById('bar2');
  if (bar2) fixSeps(bar2);
}

/* ------------------------------------------------------------------ */
/* The pass                                                            */
/* ------------------------------------------------------------------ */

let booted = false;

function markSuperseded() {
  for (const sel of SUPERSEDED) {
    document.querySelectorAll<HTMLElement>(`#tb ${sel}`).forEach((n) => {
      if (!n.hasAttribute('data-gnhide')) n.setAttribute('data-gnhide', '1');
    });
  }
  // the engine's own ink inputs already carry data-inkhide; the toolbar only
  // needs to know they must not reappear when a hidden tool is toggled back on
  document.querySelectorAll<HTMLElement>('#tb [data-inkhide]').forEach((n) => {
    if (!n.hasAttribute('data-gnhide')) n.setAttribute('data-gnhide', '1');
  });
}

function reorg() {
  const bar = document.getElementById('bar');
  const bar2 = document.getElementById('bar2');
  if (!bar || !bar2) return;

  markSuperseded();

  // 1. promote our insert-tool buttons into the main rail
  for (const sel of TO_ROW1) {
    for (const n of document.querySelectorAll<HTMLElement>(`#tb ${sel}`)) {
      if (n.parentElement !== bar) bar.append(n);
    }
  }
  // 2. demote the engine's secondary extras into the second row
  for (const sel of TO_ROW2) {
    for (const n of document.querySelectorAll<HTMLElement>(`#tb ${sel}`)) {
      if (n.parentElement !== bar2) bar2.append(n);
    }
  }
  // 3. order both rows
  applyOrder(bar, ROW1);
  applyOrder(bar2, ROW2);
  // 4. contextual visibility, then tidy the rules around it
  paintContext();
  fixSeps(bar);
  fixSeps(bar2);

  if (!booted) {
    booted = true;
    document.documentElement.dataset.gnrail = '1';
  }
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
html[data-gnrail="1"] #tb [data-gnhide]{display:none!important}

#tb .sep{width:1px;height:20px;background:rgba(255,255,255,.22);margin:0 4px;flex:none;align-self:center}
#tb #bar2 .sep{background:#e3e7ee}

/* row 2 reads as a page bar, not a pile of loose controls */
#tb #bar2{padding:5px 10px 6px!important;row-gap:6px!important}
#tb #bar2 > .sep{height:18px;margin:0 5px}

/* the two rows must never both look like the primary rail */
#tb #bar2 button{color:#41505f!important}
#tb #bar2 button.on{background:var(--gn-acc,#2f6df6)!important;color:#fff!important}

@media(max-width:760px){
  #tb .sep{display:none}
}
`;

function boot() {
  if (!document.getElementById('tb')) {
    window.setTimeout(boot, 300);
    return;
  }
  const style = document.createElement('style');
  style.id = 'gn-rail-style';
  style.textContent = CSS;
  document.head.append(style);

  // the other modules create their buttons on their own timers, so settle a few
  // times on the way up and then keep an eye on it
  [120, 400, 900, 1600, 2600, 4000].forEach((ms) => window.setTimeout(reorg, ms));
  window.setInterval(reorg, 2500);
  // contextual controls have to react to the tool at pen speed, not at
  // layout speed, so they get their own faster tick
  window.setInterval(paintContext, 300);

  (window as any).__inkpad_rail = { reorg, layout: () => ({ row1: ROW1, row2: ROW2 }) };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
