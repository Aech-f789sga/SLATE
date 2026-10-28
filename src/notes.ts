/**
 * Sticky notes — GoodNotes' coloured note cards.
 *
 * A note is not a new object type. It is two ordinary page objects pushed in
 * order: a filled rectangle (the card) and a text object on top of it. That
 * buys us everything for free — undo, the eraser, lasso select, resize, layer
 * order, export and cloud sync all already understand both halves.
 *
 * The card is drawn by the shape renderer that `shapes.ts` patches, so it gets
 * the fill wash from `s.fc`; the text is created through the engine's own
 * `openText()` so typing inside the note behaves exactly like the text tool.
 */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

function el(tag: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}

interface NoteSkin {
  id: string;
  label: string;
  fill: string;
  edge: string;
  ink: string;
}

/** Paper-stock colours: a wash, a slightly deeper edge, and readable ink. */
const SKINS: NoteSkin[] = [
  { id: 'yellow', label: 'Yellow', fill: '#ffe9a8', edge: '#efd074', ink: '#4a3c12' },
  { id: 'pink', label: 'Pink', fill: '#ffd7e2', edge: '#f0a9bf', ink: '#5c2334' },
  { id: 'green', label: 'Green', fill: '#d5f2d3', edge: '#a4d5a0', ink: '#1f4423' },
  { id: 'blue', label: 'Blue', fill: '#d6e8ff', edge: '#a5c6ef', ink: '#173a63' },
  { id: 'purple', label: 'Purple', fill: '#e7dcff', edge: '#c0aef0', ink: '#33235c' },
  { id: 'orange', label: 'Orange', fill: '#ffe1c3', edge: '#f0b989', ink: '#5b3111' },
  { id: 'grey', label: 'Grey', fill: '#eceff3', edge: '#ccd4df', ink: '#2f3a47' },
];

const SKIN_KEY = 'inkpad-note-skin';
let skinId = 'yellow';

function currentSkin(): NoteSkin {
  return SKINS.find((s) => s.id === skinId) || SKINS[0];
}

function loadSkin() {
  try {
    const v = localStorage.getItem(SKIN_KEY) || '';
    if (SKINS.some((s) => s.id === v)) skinId = v;
  } catch {
    /* private mode */
  }
}

function saveSkin() {
  try {
    localStorage.setItem(SKIN_KEY, skinId);
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------------ */
/* Insert                                                              */
/* ------------------------------------------------------------------ */

function insertNote() {
  const skin = currentSkin();

  ev(`(function(){
    try{
      if (typeof pg !== 'function' || !nb) return;
      // a half-typed note must not be lost when a second one is dropped
      try { if (typeof commitText === 'function') commitText(); } catch(e){}

      var W0 = (typeof W === 'number' && W) ? W : 800;
      var H0 = (typeof H === 'number' && H) ? H : 1100;
      var w = Math.min(300, W0 * 0.46);
      var h = Math.min(232, H0 * 0.26);
      var x = Math.round((W0 - w) / 2);
      var y = Math.round(H0 * 0.16);

      var note = {
        t:'shape', k:'rect',
        c: ${JSON.stringify(skin.edge)},
        fc: ${JSON.stringify(skin.fill)},
        fop: 1, w: 1.2,
        a: [x, y], b: [x + w, y + h]
      };
      try { snap(); } catch(e){}
      pg().strokes.push(note);

      var pad = 16;
      openText(x + pad, y + pad + 2);
      if (te) {
        te.w = w - pad * 2;
        te.s = 15;
        te.c = ${JSON.stringify(skin.ink)};
        try { te.f = $('#fnt').value || 'arial'; } catch(e){}
        Object.assign(tx.style, {
          width: te.w * sc() + 'px',
          color: te.c,
          fontFamily: (typeof FF === 'function') ? FF(te.f) : ''
        });
        tx.focus();
      }
      draw(); save(); thumbs();
    }catch(e){}
  })()`);

  hide();
  toast('Sticky note added');
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

let pop: HTMLElement | null = null;

function build(): HTMLElement {
  if (pop) return pop;
  pop = el('div');
  pop.id = 'gn-note';
  pop.innerHTML =
    '<div class="gn-note-head"><b>Sticky note</b><i>Pick a colour</i></div>' +
    '<div class="gn-note-grid"></div>' +
    '<div class="gn-note-foot">The note lands on the page with the cursor inside — type, then tap away.</div>';
  document.body.append(pop);

  const grid = pop.querySelector('.gn-note-grid') as HTMLElement;
  SKINS.forEach((s) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'gn-note-sw';
    b.dataset.skin = s.id;
    b.title = s.label + ' note';
    b.setAttribute('aria-label', s.label + ' sticky note');
    b.style.background = s.fill;
    b.style.borderColor = s.edge;
    b.onclick = () => {
      skinId = s.id;
      saveSkin();
      paint();
      insertNote();
    };
    grid.append(b);
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest('#gn-note') || t.closest('#gn-note-btn')) return;
      hide();
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  return pop;
}

function paint() {
  if (!pop) return;
  pop.querySelectorAll<HTMLElement>('.gn-note-sw').forEach((n) => {
    n.classList.toggle('on', n.dataset.skin === skinId);
  });
}

function hide() {
  pop?.classList.remove('on');
}

function toggle(anchor: HTMLElement) {
  const node = build();
  if (node.classList.contains('on')) {
    hide();
    return;
  }
  paint();
  node.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const tb = document.getElementById('tb');
  const floor = tb ? Math.round(tb.getBoundingClientRect().bottom) : r.bottom;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  let top = Math.max(r.bottom, floor) + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  node.style.left = Math.round(left) + 'px';
  node.style.top = Math.round(top) + 'px';
}

function toast(msg: string) {
  const t = el('div', msg);
  t.className = 'gn-toast';
  document.body.append(t);
  window.setTimeout(() => t.classList.add('out'), 900);
  window.setTimeout(() => t.remove(), 1500);
}

/* ------------------------------------------------------------------ */
/* Toolbar button                                                      */
/* ------------------------------------------------------------------ */

function ensureButton() {
  const bar = document.getElementById('bar') || document.getElementById('bar2');
  if (!bar || document.getElementById('gn-note-btn')) return;
  const b = el('button') as HTMLButtonElement;
  b.id = 'gn-note-btn';
  b.type = 'button';
  b.title = 'Sticky note — drop a coloured note card on the page';
  b.setAttribute('aria-label', 'Sticky note');
  b.textContent = '🗒️ Note';
  b.onclick = () => toggle(b);
  const stk = document.getElementById('gn-stk-btn');
  if (stk && stk.parentElement === bar) bar.insertBefore(b, stk.nextSibling);
  else bar.append(b);
}

const CSS = `
#gn-note{
  position:fixed;z-index:46;display:none;width:min(268px,calc(100vw - 16px));
  background:#fff;border:1px solid #eef1f6;border-radius:16px;padding:12px;
  box-shadow:0 18px 44px rgba(8,20,38,.22),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;box-sizing:border-box;
}
#gn-note.on{display:block}
.gn-note-head{display:flex;align-items:baseline;gap:7px;margin:0 2px 10px}
.gn-note-head b{font:800 13px/1 inherit;color:#1c2430;letter-spacing:-.01em}
.gn-note-head i{font:500 10.5px/1 inherit;color:#9aa5b4;font-style:normal}
.gn-note-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.gn-note-sw{
  aspect-ratio:1;border-radius:10px;border:1.5px solid #e3e8ef;cursor:pointer;padding:0;
  box-shadow:inset 0 -6px 0 rgba(0,0,0,.035);transition:transform .12s ease,box-shadow .12s ease;
}
.gn-note-sw:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(8,20,38,.16)}
.gn-note-sw.on{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #2f6df6}
.gn-note-foot{margin:10px 2px 0;font:500 10.5px/1.45 inherit;color:#9aa5b4}
#bar #gn-note-btn{font-size:12px!important;font-weight:600;white-space:nowrap}
@media(max-width:620px){
  #bar #gn-note-btn{font-size:0!important;width:34px;padding:0!important}
  #bar #gn-note-btn::before{content:'🗒️';font-size:15px}
}
`;

function boot() {
  if (document.getElementById('gn-note-style')) return;
  const style = document.createElement('style');
  style.id = 'gn-note-style';
  style.textContent = CSS;
  document.head.append(style);

  loadSkin();
  ensureButton();
  window.setInterval(ensureButton, 900);

  (window as any).__inkpad_notes = {
    add: () => insertNote(),
    skins: SKINS,
    setSkin: (id: string) => {
      if (!SKINS.some((s) => s.id === id)) return;
      skinId = id;
      saveSkin();
      paint();
    },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
