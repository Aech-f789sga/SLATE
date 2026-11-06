/**
 * Rich Text — a Word-style formatting bar for the text tool.
 *
 * The engine stores a text object as
 *
 *   { t:'text', c, s, x, y, txt, w, f, rt:{ b, i, u, st, al } }
 *
 * where `f` is the font key, `s` the size and `rt` the run of formatting added
 * here: bold, italic, underline, strikethrough and alignment. Every field is
 * optional, so text written before this module existed still renders with the
 * weight and slant it always had.
 *
 * The bar edits whichever text is in front of the user:
 *
 *   • while a text box is open (the engine's textarea) it retunes that box live,
 *   • with text objects selected it formats the whole selection in one undo step,
 *   • with nothing selected it sets the defaults for the NEXT text box.
 *
 * Crucially, each edit is applied ON TOP OF the target's own formatting, never
 * on top of the global defaults — otherwise bolding one word would silently
 * reset the font of a text that was written in a different family.
 *
 * Rendering lives in index.html (`rtText`, `fnt`, `bb0`) so measurement and
 * painting always agree; this module is only the UI and the state.
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

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type Align = 'left' | 'center' | 'right' | 'justify';

interface RT {
  b: boolean;
  i: boolean;
  u: boolean;
  st: boolean;
  al: Align;
}

const DEFAULT: RT = { b: false, i: false, u: false, st: false, al: 'left' };
const KEY = 'inkpad-richtext';

/** Defaults for the NEXT text box. */
let state: RT = { ...DEFAULT };
let family = 'arial';
let fontSize = 28;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (v && typeof v === 'object') {
      state = { ...DEFAULT, ...(v.rt || {}) };
      if (typeof v.family === 'string') family = v.family;
      if (Number.isFinite(v.fontSize)) fontSize = Number(v.fontSize);
    }
  } catch {
    /* corrupt entry — keep defaults */
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ rt: state, family, fontSize }));
  } catch {
    /* private mode */
  }
}

function publishDefaults() {
  (window as any).__rtDefault = { ...state };
}

/** Text objects currently selected. */
function selectedTexts(): any[] {
  const sel = ev<any[]>('sel') || [];
  return sel.filter((s) => s && s.t === 'text');
}

function editing(): any {
  const te = ev<any>('te');
  return te && typeof te === 'object' ? te : null;
}

function textarea(): HTMLTextAreaElement | null {
  return document.getElementById('tx') as HTMLTextAreaElement | null;
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

/** Mirror a text box's formatting onto the live textarea. */
function styleTextarea(te: any) {
  const tx = textarea();
  if (!tx || !te) return;
  const R: RT = { ...DEFAULT, ...(te.rt || {}) };
  const scale = ev<number>('sc()') || 1;
  tx.style.fontFamily = ev<string>(`FF(${JSON.stringify(te.f || family)})`) || '';
  tx.style.fontSize = `${te.s * scale}px`;
  tx.style.fontWeight = R.b ? '700' : '400';
  tx.style.fontStyle = R.i ? 'italic' : 'normal';
  tx.style.textAlign = R.al;
  tx.style.textDecoration =
    [R.u ? 'underline' : '', R.st ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
  // The engine's own oninput re-measures the box; call it so the width follows.
  try {
    (tx as any).oninput?.();
  } catch {
    /* the handler is replaced on every openText */
  }
}

/**
 * One undo step per interaction, not per keystroke.
 *
 * A held arrow key or a typed size fires many `input` events; snapshotting on
 * each would bury the previous state. `armed` is set on pointerdown / focus and
 * cleared a tick after the interaction ends.
 */
let armed = false;
let disarm = 0;

function arm() {
  if (editing()) return; // the engine snapshots when the text box is committed
  if (!selectedTexts().length) return;
  if (armed) return;
  armed = true;
  ev('try{ snap(); }catch(e){}');
  window.clearTimeout(disarm);
  disarm = window.setTimeout(() => (armed = false), 600);
}

interface Patch {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  st?: boolean;
  al?: Align;
  f?: string;
  s?: number;
}

/**
 * Apply a patch to the live text box, or to every selected text, or — with no
 * target — to the defaults. Always merges with the TARGET's own values.
 */
function commitPatch(patch: Patch) {
  // Family and size live at the top level of the stroke (`f` / `s`); only the
  // five run attributes belong in `rt`. Keeping them apart is what stops a
  // stray `rt.f` from being persisted and re-read as formatting later.
  const { f, s, ...rtPatch } = patch;
  const te = editing();
  const items = selectedTexts();

  if (te) {
    te.rt = { ...DEFAULT, ...(te.rt || {}), ...rtPatch };
    if (f) te.f = f;
    if (s) te.s = s;
    styleTextarea(te);
    state = { ...te.rt };
    if (te.f) family = te.f;
    if (Number.isFinite(te.s)) fontSize = te.s;
  } else if (items.length) {
    for (const it of items) {
      it.rt = { ...DEFAULT, ...(it.rt || {}), ...rtPatch };
      if (f) it.f = f;
      if (s) it.s = s;
    }
    state = { ...DEFAULT, ...(items[0].rt || {}) };
    if (items[0].f) family = items[0].f;
    if (Number.isFinite(items[0].s)) fontSize = items[0].s;
    ev('try{ draw(); save(); thumbs(); }catch(e){}');
  } else {
    Object.assign(state, rtPatch);
    if (f) family = f;
    if (s) fontSize = s;
  }

  save();
  publishDefaults();
  paint();
}

/** Put the caret back in the box after a control that had to take focus. */
function refocus() {
  if (!editing()) return;
  const tx = textarea();
  if (!tx) return;
  tx.focus();
  const n = tx.value.length;
  try {
    tx.setSelectionRange(n, n);
  } catch {
    /* selection is unavailable on some mobile keyboards */
  }
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

const ALIGN_SVG: Record<Align, string> = {
  left: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  center: '<path d="M4 6h16M7 12h10M6 18h12"/>',
  right: '<path d="M4 6h16M10 12h10M7 18h13"/>',
  justify: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

const CSS = `
#rt-bar{
  position:fixed;z-index:29;display:none;align-items:center;gap:3px;
  padding:5px 7px;border-radius:13px;background:var(--sf,#fff);
  color:var(--tx,#1c1c1e);
  border:1px solid var(--bd,#e6e9ef);
  box-shadow:0 10px 30px rgba(8,20,38,.22),0 1px 3px rgba(8,20,38,.10);
  font:12px/1 var(--slate-font);
  max-width:calc(100vw - 16px);
}
#rt-bar.on{display:flex}
#rt-bar .rt-fam{
  height:26px;border:1px solid var(--bd,#dfe3ea);border-radius:7px;
  background:transparent;color:inherit;font:600 11.5px/1 var(--slate-font);
  padding:0 4px;max-width:104px;cursor:pointer;
}
#rt-bar .rt-size{
  width:46px;height:26px;border:1px solid var(--bd,#dfe3ea);border-radius:7px;
  background:transparent;color:inherit;font:600 11.5px/1 var(--slate-font);
  text-align:center;padding:0 2px;
  font-variant-numeric:tabular-nums;
}
#rt-bar .rt-size::-webkit-inner-spin-button{opacity:.4}
#rt-bar .rt-sep{width:1px;height:20px;background:var(--bd,#e6e9ef);margin:0 3px;flex:none}
#rt-bar button{
  width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;
  color:inherit;cursor:pointer;display:grid;place-items:center;flex:none;
  font:600 13px/1 var(--slate-font);
  transition:background .12s ease,color .12s ease;
}
#rt-bar button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
#rt-bar button.on{background:color-mix(in srgb,var(--ac,#2f6df6) 16%,transparent);color:var(--ac,#2f6df6)}
#rt-bar button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
#rt-bar button b,#rt-bar button i,#rt-bar button u,#rt-bar button s{pointer-events:none}
@media(max-width:560px){
  #rt-bar{gap:1px;padding:4px 5px}
  #rt-bar .rt-fam{max-width:76px}
  #rt-bar button{width:26px;height:26px}
}
`;

let bar: HTMLElement | null = null;
let famSel: HTMLSelectElement | null = null;
let sizeInput: HTMLInputElement | null = null;
let toggleBtns = new Map<string, HTMLButtonElement>();
let alignBtns = new Map<Align, HTMLButtonElement>();

function build() {
  if (bar) return;
  bar = document.createElement('div');
  bar.id = 'rt-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Text formatting');

  famSel = document.createElement('select');
  famSel.className = 'rt-fam';
  famSel.id = 'rt-fam';
  famSel.setAttribute('aria-label', 'Font family');
  const FONTS = ev<Record<string, [string, string]>>('FONTS') || {};
  for (const [k, v] of Object.entries(FONTS)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = v[0];
    o.style.fontFamily = v[1];
    famSel.append(o);
  }
  famSel.onchange = () => {
    arm();
    commitPatch({ f: famSel?.value || 'arial' });
    refocus();
  };

  sizeInput = document.createElement('input');
  sizeInput.className = 'rt-size';
  sizeInput.id = 'rt-size';
  sizeInput.type = 'number';
  sizeInput.min = '6';
  sizeInput.max = '240';
  sizeInput.step = '1';
  sizeInput.setAttribute('aria-label', 'Font size');
  sizeInput.onfocus = () => arm();
  sizeInput.oninput = () => {
    const v = Number(sizeInput?.value);
    if (!Number.isFinite(v) || v < 6) return;
    commitPatch({ s: Math.min(240, Math.round(v)) });
  };
  // Enter / blur is the natural end of a size edit — hand the caret back.
  sizeInput.onchange = () => refocus();

  const mk = (key: 'b' | 'i' | 'u' | 'st', title: string, html: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.rt = key;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = html;
    b.onclick = () => {
      arm();
      commitPatch({ [key]: !currentRT()[key] } as Patch);
    };
    return b;
  };

  const sep = () => {
    const s = document.createElement('span');
    s.className = 'rt-sep';
    return s;
  };

  bar.append(famSel, sizeInput, sep());
  toggleBtns.set('b', mk('b', 'Bold', '<b>B</b>'));
  toggleBtns.set('i', mk('i', 'Italic', '<i>I</i>'));
  toggleBtns.set('u', mk('u', 'Underline', '<u>U</u>'));
  toggleBtns.set('st', mk('st', 'Strikethrough', '<s>S</s>'));
  for (const b of toggleBtns.values()) bar.append(b);
  bar.append(sep());

  for (const al of ['left', 'center', 'right', 'justify'] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.al = al;
    b.title = `Align ${al}`;
    b.setAttribute('aria-label', `Align ${al}`);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ALIGN_SVG[al]}</svg>`;
    b.onclick = () => {
      arm();
      commitPatch({ al });
    };
    alignBtns.set(al, b);
    bar.append(b);
  }

  // Formatting buttons must not blur the engine's textarea: a blur would commit
  // the text and close the box mid-edit. Cancelling mousedown keeps the caret
  // where it is while the button's click still fires. The family select and the
  // size field DO need the default, so they are excluded.
  bar.addEventListener(
    'mousedown',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button')) e.preventDefault();
    },
    true
  );

  // Snapshot before the first change of an interaction, keyboard included.
  bar.addEventListener('pointerdown', () => arm(), true);
  bar.addEventListener('keydown', () => arm(), true);
  bar.addEventListener('pointerup', () => {
    window.clearTimeout(disarm);
    disarm = window.setTimeout(() => (armed = false), 60);
  });

  document.body.append(bar);

  const style = document.createElement('style');
  style.id = 'rt-style';
  style.textContent = CSS;
  document.head.append(style);

  // The engine commits and closes the text box on the textarea's blur. Picking
  // a font from this bar has to move focus for a moment, so that one blur is
  // swallowed — otherwise choosing a family would end the edit.
  document.addEventListener(
    'blur',
    (e) => {
      const tx = textarea();
      if (!tx || e.target !== tx) return;
      const to = e.relatedTarget as Node | null;
      if (to && bar && bar.contains(to)) e.stopPropagation();
    },
    true
  );

  // Ctrl/Cmd + B/I/U while typing in the engine's textarea.
  document.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tx = textarea();
      if (!tx || document.activeElement !== tx) return;
      const k = e.key.toLowerCase();
      if (k !== 'b' && k !== 'i' && k !== 'u') return;
      e.preventDefault();
      commitPatch({ [k]: !currentRT()[k as 'b' | 'i' | 'u'] } as Patch);
    },
    true
  );
}

/** The style the bar should display: live box → selection → defaults. */
function currentRT(): RT {
  const te = editing();
  if (te && te.rt) return { ...DEFAULT, ...te.rt };
  const items = selectedTexts();
  if (items.length && items[0].rt) return { ...DEFAULT, ...items[0].rt };
  return { ...state };
}

function currentFamily(): string {
  const te = editing();
  if (te && te.f) return te.f;
  const items = selectedTexts();
  if (items.length && items[0].f) return items[0].f;
  return family;
}

function currentSize(): number {
  const te = editing();
  if (te && Number.isFinite(te.s)) return te.s;
  const items = selectedTexts();
  if (items.length && Number.isFinite(items[0].s)) return items[0].s;
  return fontSize;
}

function paint() {
  if (!bar) return;
  const R = currentRT();
  for (const [k, b] of toggleBtns) {
    const on = !!(R as any)[k];
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  for (const [al, b] of alignBtns) {
    const on = R.al === al;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (famSel) famSel.value = currentFamily();
  if (sizeInput && document.activeElement !== sizeInput) sizeInput.value = String(Math.round(currentSize()));
}

function place() {
  if (!bar) return;
  const w = bar.offsetWidth;
  const h = bar.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const te = editing();
  if (te) {
    const tx = textarea();
    const r = tx?.getBoundingClientRect();
    if (r && r.width > 0) {
      let top = r.top - h - 8;
      if (top < 8) top = Math.min(vh - h - 8, r.bottom + 8);
      bar.style.top = Math.round(top) + 'px';
      bar.style.left = Math.round(Math.max(8, Math.min(vw - w - 8, r.left))) + 'px';
      return;
    }
  }

  // Selection / tool mode: under the toolbar, and under the text-style pill
  // when that one is up, so the two never overlap.
  const tb = document.getElementById('tb');
  let top = tb ? tb.getBoundingClientRect().bottom + 8 : 64;
  const pill = document.getElementById('txt-pill');
  if (pill && pill.classList.contains('on')) {
    const pr = pill.getBoundingClientRect();
    if (pr.height > 0) top = Math.max(top, pr.bottom + 6);
  }
  bar.style.top = Math.round(Math.min(top, vh - h - 8)) + 'px';
  bar.style.left = Math.round(Math.max(8, vw / 2 - w / 2)) + 'px';
}

let visible = false;

function update() {
  if (!bar) return;
  const te = editing();
  const texts = selectedTexts();
  const tool = ev<string>('tool');
  const show = editorOpen() && (!!te || texts.length > 0 || tool === 'text');
  if (show !== visible) {
    visible = show;
    bar.classList.toggle('on', show);
  }
  if (!show) return;
  paint();
  place();
}

/**
 * Make the bar's defaults apply to a freshly opened text box.
 *
 * The engine's openText() builds `te` from the pen size and the toolbar's font
 * select; wrapping it is the only way to hand it the rich-text defaults without
 * touching the engine's own layout maths.
 */
function hookOpenText() {
  const w = window as any;
  if (w.__rtOpenHooked) return;
  const orig = w.openText;
  if (typeof orig !== 'function') return;
  w.__rtOpenHooked = true;
  w.openText = function (x: number, y: number, hit: any) {
    const r = orig.call(this, x, y, hit);
    const te = ev<any>('te');
    if (te) {
      if (hit && hit.rt) te.rt = { ...DEFAULT, ...hit.rt };
      else {
        te.rt = { ...state };
        if (!hit) {
          te.f = family;
          te.s = fontSize;
        }
      }
      styleTextarea(te);
    }
    return r;
  };
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!document.getElementById('ed')) return;
  load();
  publishDefaults();
  build();
  hookOpenText();

  // The engine creates its textarea lazily and swaps tools without events, so
  // poll — the same approach the text-style pill uses.
  let last = '';
  window.setInterval(() => {
    const te = editing();
    const texts = selectedTexts();
    const sig = `${!!te}|${te ? te.txt : ''}|${texts.length}|${ev<string>('tool')}|${editorOpen()}`;
    if (sig !== last) {
      last = sig;
      if (te && !te.rt) te.rt = { ...state };
      update();
    } else if (visible) {
      place();
    }
  }, 200);

  window.addEventListener('resize', () => visible && place());
  window.addEventListener('scroll', () => visible && place(), true);

  (window as any).__slateRich = {
    bar: () => bar,
    state: () => ({ ...state, family, fontSize }),
    apply: () => commitPatch({}),
    set: (patch: Patch) => commitPatch(patch),
    setFamily: (f: string) => commitPatch({ f }),
    setSize: (n: number) => commitPatch({ s: Math.max(6, Math.min(240, Math.round(n))) }),
    editing: () => !!editing(),
    visible: () => visible,
    current: () => currentRT(),
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
