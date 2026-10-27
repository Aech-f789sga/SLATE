/**
 * Text — GoodNotes-style text box styling.
 *
 * The engine already has a text tool: tapping with it opens a textarea, and
 * blurring commits `{t:"text", c, s, x, y, txt, w, f}` — plain glyphs, no box.
 * GoodNotes wraps a text box in a fill, a border, a corner radius, a drop
 * shadow and inner padding, and exposes all of it as Text Box Style.
 *
 * So this module does two things:
 *
 *   1. Teaches the renderer about a `tb` sub-object on text strokes — the fill,
 *      border, radius, shadow and padding. The properties ride on the stroke, so
 *      undo, layers, thumbnails, cloud sync and export all keep working with no
 *      extra plumbing.
 *   2. Puts a compact style pill in front of it (preset chips + a settings
 *      sheet), which writes to the selection when there is one and otherwise
 *      becomes the default for the next box.
 *
 * The engine uses `s.r` for rotation, so every new property is namespaced under
 * `s.tb` rather than added at the top level.
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
  return cls(el('div'), className, text);
}

function span(className: string, text?: string): HTMLElement {
  return cls(el('span'), className, text);
}

function cls<T extends HTMLElement>(node: T, className: string, text?: string): T {
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------------ */
/* Style model                                                         */
/* ------------------------------------------------------------------ */

interface TbStyle {
  bg: string;
  bd: string;
  r: number;
  sh: boolean;
  bw: number;
  pad: number;
}

interface Preset {
  id: string;
  label: string;
  style: TbStyle;
}

const NONE = 'transparent';

const PRESETS: Preset[] = [
  {
    id: 'plain',
    label: 'Plain',
    style: { bg: NONE, bd: NONE, r: 8, sh: false, bw: 0, pad: 6 },
  },
  {
    id: 'sticky',
    label: 'Sticky',
    style: { bg: '#fff4b8', bd: '#ecd77e', r: 4, sh: true, bw: 1, pad: 12 },
  },
  {
    id: 'callout',
    label: 'Callout',
    style: { bg: '#ffffff', bd: '#d3dce8', r: 14, sh: true, bw: 2, pad: 14 },
  },
  {
    id: 'tint',
    label: 'Tint',
    style: { bg: '#eaf1ff', bd: NONE, r: 10, sh: false, bw: 0, pad: 10 },
  },
  {
    id: 'outline',
    label: 'Outline',
    style: { bg: NONE, bd: '#9aa6b6', r: 6, sh: false, bw: 2, pad: 12 },
  },
  {
    id: 'tag',
    label: 'Tag',
    style: { bg: '#1f2a3a', bd: NONE, r: 999, sh: true, bw: 0, pad: 10 },
  },
];

const DEFAULT_STYLE: TbStyle = { ...PRESETS[0].style };

const state: { on: boolean; preset: string; style: TbStyle; tab: 'presets' | 'advanced' } = {
  on: true,
  preset: 'plain',
  style: { ...DEFAULT_STYLE },
  tab: 'presets',
};

function loadStyle() {
  const raw = lsGet('inkpad-textstyle');
  if (!raw) return;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object') {
      state.on = v.on !== false;
      state.preset = typeof v.preset === 'string' ? v.preset : 'plain';
      state.style = { ...DEFAULT_STYLE, ...(v.style || {}) };
    }
  } catch {
    /* ignore a corrupt entry */
  }
}

function saveStyle() {
  lsSet('inkpad-textstyle', JSON.stringify({ on: state.on, preset: state.preset, style: state.style }));
}

function sameStyle(a: TbStyle, b: TbStyle): boolean {
  return (
    a.bg === b.bg && a.bd === b.bd && a.r === b.r && a.sh === b.sh && a.bw === b.bw && a.pad === b.pad
  );
}

/* ------------------------------------------------------------------ */
/* Renderer hook                                                       */
/* ------------------------------------------------------------------ */

/**
 * Override `stroke` and `bb0`, not the text branch itself: the engine draws a
 * text item with three lines inside a shared renderer, and replacing the whole
 * `render` would lose rotation, erasing and layer handling.
 */
function installTextEngine() {
  ev(`(function(){
    if (window.__gnTxtHooked) return;
    window.__gnTxtHooked = true;

    var origStroke = stroke;
    var origBB0 = bb0;

    function rr(c, x, y, w, h, r){
      r = Math.max(0, Math.min(r || 0, Math.min(Math.abs(w), Math.abs(h)) / 2));
      c.beginPath();
      if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    stroke = function(c, s){
      if (s && s.t === 'text' && s.tb) {
        var b = origBB0(s, c);
        var p = s.tb.pad || 0;
        var x = b[0] - p, y = b[1] - p;
        var w = (b[2] - b[0]) + p * 2, h = (b[3] - b[1]) + p * 2;
        c.save();
        if (s.tb.sh) {
          c.shadowColor = 'rgba(16,32,64,.26)';
          c.shadowBlur = 10;
          c.shadowOffsetY = 3;
        }
        if (s.tb.bg && s.tb.bg !== 'transparent') {
          rr(c, x, y, w, h, s.tb.r);
          c.fillStyle = s.tb.bg;
          c.fill();
        }
        c.shadowColor = 'transparent';
        c.shadowBlur = 0;
        c.shadowOffsetX = 0;
        c.shadowOffsetY = 0;
        if ((s.tb.bw || 0) > 0 && s.tb.bd && s.tb.bd !== 'transparent') {
          rr(c, x, y, w, h, s.tb.r);
          c.strokeStyle = s.tb.bd;
          c.lineWidth = s.tb.bw;
          c.stroke();
        }
        c.restore();
      }
      return origStroke.apply(this, arguments);
    };

    bb0 = function(s, c){
      var b = (c === undefined) ? origBB0(s) : origBB0(s, c);
      if (s && s.t === 'text' && s.tb) {
        var p = s.tb.pad || 0;
        return [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
      }
      return b;
    };

    // NOTE: commitText is bound to the textarea's blur at registration time, so
    // reassigning the global never fires. Stamping happens in stampOnBlur().

    window.__gnTxt = { rr: rr, origBB0: origBB0 };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Applying the style                                                  */
/* ------------------------------------------------------------------ */

function selectedTexts(): any[] {
  const sel = ev<any[]>('sel') || [];
  return sel.filter((s) => s && s.t === 'text');
}

/** Write the current style onto every selected text box. */
function applyToSelection(): boolean {
  const items = selectedTexts();
  if (!items.length) return false;
  ev('snap()');
  for (const s of items) {
    if (state.on) s.tb = { ...state.style };
    else delete s.tb;
  }
  ev('try{ draw(); save(); thumbs(); }catch(e){}');
  return true;
}

function hasTextSelection(): boolean {
  return selectedTexts().length > 0;
}

/* ------------------------------------------------------------------ */
/* Stamping new boxes                                                  */
/* ------------------------------------------------------------------ */

/**
 * The engine registers `commitText` directly as the textarea's blur handler,
 * so replacing the global does nothing — the listener already holds the old
 * function. Instead, remember the stroke count when a textarea takes focus and
 * stamp whatever it appended when that textarea blurs.
 */
let focusCount = -1;

function hookCommit() {
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== 'TEXTAREA') return;
      focusCount = (ev<any[]>('pg().strokes') || []).length;
    },
    true
  );

  document.addEventListener(
    'blur',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== 'TEXTAREA') return;
      const before = focusCount;
      focusCount = -1;
      if (before < 0) return;
      // the engine commits synchronously on blur, so this lands a frame later
      window.setTimeout(() => {
        if (!state.on) return;
        const S = ev<any[]>('pg().strokes') || [];
        if (S.length <= before) return;
        const it = S[S.length - 1];
        if (!it || it.t !== 'text' || it.tb) return;
        it.tb = { ...state.style };
        ev('try{ draw(); save(); thumbs(); }catch(e){}');
        paintPill();
      }, 0);
    },
    true
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

let pill: HTMLElement | null = null;
let sheet: HTMLElement | null = null;
let sheetAnchor: HTMLElement | null = null;

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  if (!ed) return false;
  return getComputedStyle(ed).display !== 'none';
}

function toolIsText(): boolean {
  return ev<string>('tool') === 'text';
}

/** A swatch grid for one colour channel, `none` included. */
function colourRow(
  host: HTMLElement,
  value: string,
  swatches: string[],
  onPick: (c: string) => void
): HTMLInputElement {
  const row = div('tx-swrow');
  const none = btn('tx-sw tx-none');
  none.title = 'No colour';
  none.dataset.c = NONE;
  none.onclick = () => onPick(NONE);
  row.append(none);
  for (const c of swatches) {
    const b = btn('tx-sw');
    b.title = c;
    b.dataset.c = c;
    b.style.setProperty('--swc', c);
    b.onclick = () => onPick(c);
    row.append(b);
  }
  const custom = el('input', '') as HTMLInputElement;
  custom.type = 'color';
  custom.className = 'tx-pick';
  custom.title = 'Custom colour';
  custom.value = value === NONE ? '#ffffff' : value;
  custom.oninput = () => onPick(custom.value);
  row.append(custom);
  host.append(row);
  markColourRow(row, value);
  return custom;
}

function markColourRow(row: HTMLElement, value: string) {
  row.querySelectorAll<HTMLElement>('.tx-sw').forEach((n) => {
    n.classList.toggle('on', n.dataset.c === value);
  });
}

const BG_SWATCHES = ['#ffffff', '#fff4b8', '#ffe0e6', '#e3f6e8', '#eaf1ff', '#f1e9ff', '#f2f4f7'];
const BD_SWATCHES = ['#d3dce8', '#9aa6b6', '#1f2a3a', '#ecd77e', '#f2a3b3', '#7ec98f', '#6aa8f5'];

function buildSheet(): HTMLElement {
  const node = div('tx-sheet');
  node.id = 'tx-set';

  const tabs = div('tx-tabs');
  const tPre = btn('tx-tab', 'Presets');
  tPre.dataset.tab = 'presets';
  const tAdv = btn('tx-tab', 'Advanced');
  tAdv.dataset.tab = 'advanced';
  tabs.append(tPre, tAdv);
  node.append(tabs);

  /* ---- presets ---- */
  const pre = div('tx-pane');
  pre.dataset.pane = 'presets';
  const grid = div('tx-grid');
  for (const p of PRESETS) {
    const b = btn('tx-card');
    b.dataset.preset = p.id;
    const demo = div('tx-demo');
    demo.style.background = p.style.bg === NONE ? '#fff' : p.style.bg;
    demo.style.borderRadius = Math.min(14, p.style.r) + 'px';
    demo.style.border = p.style.bw ? `${p.style.bw}px solid ${p.style.bd}` : '1px solid #e6e2dc';
    if (p.style.sh) demo.style.boxShadow = '0 3px 8px rgba(16,32,64,.22)';
    demo.textContent = 'Aa';
    if (p.style.bg === '#1f2a3a') demo.style.color = '#fff';
    const cap = cls(el('div'), 'tx-cap', p.label);
    b.append(demo, cap);
    b.onclick = () => {
      state.preset = p.id;
      state.style = { ...p.style };
      saveStyle();
      applyToSelection();
      paintPill();
    };
    grid.append(b);
  }
  pre.append(grid);
  node.append(pre);

  /* ---- advanced ---- */
  const adv = div('tx-pane');
  adv.dataset.pane = 'advanced';

  const addRow = (label: string) => {
    const w = div('tx-row');
    const l = cls(el('div'), 'tx-label', label);
    w.append(l);
    adv.append(w);
    return w;
  };

  const bgRow = addRow('Background Color');
  const bgPick = colourRow(bgRow, state.style.bg, BG_SWATCHES, (c) => {
    state.style.bg = c;
    commit();
    markColourRow(bgRow, c);
    syncSheet();
  });

  const bdRow = addRow('Border Color');
  const bdPick = colourRow(bdRow, state.style.bd, BD_SWATCHES, (c) => {
    state.style.bd = c;
    commit();
    markColourRow(bdRow, c);
    syncSheet();
  });

  const slider = (
    label: string,
    key: 'r' | 'bw' | 'pad',
    min: number,
    max: number,
    unit: string
  ) => {
    const w = addRow(label);
    const line = div('tx-line');
    const input = el('input', '') as HTMLInputElement;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(state.style[key]);
    input.className = 'tx-range';
    const out = cls(el('span'), 'tx-num', input.value + unit);
    input.oninput = () => {
      state.style[key] = Number(input.value);
      out.textContent = input.value + unit;
      commit();
    };
    line.append(input, out);
    w.append(line);
    return { input, out, unit };
  };

  const rS = slider('Round Corner', 'r', 0, 32, ' pt');
  const bS = slider('Border', 'bw', 0, 8, ' pt');
  const pS = slider('Padding', 'pad', 0, 32, ' pt');

  const shRow = addRow('Shadow');
  const shTg = btn('tx-tg');
  shTg.title = 'Drop shadow';
  shTg.onclick = () => {
    state.style.sh = !state.style.sh;
    commit();
    syncSheet();
  };
  shRow.append(shTg);

  const onRow = addRow('Text Box Style');
  const onTg = btn('tx-tg');
  onTg.title = 'Style text boxes';
  onTg.onclick = () => {
    state.on = !state.on;
    saveStyle();
    commit();
    syncSheet();
    paintPill();
  };
  onRow.append(onTg);

  node.append(adv);

  // keep the local refs alive for syncSheet()
  sheetRefs = { pre, adv, tPre, tAdv, bgPick, bdPick, bgRow, bdRow, rS, bS, pS, shTg, onTg };
  return node;
}

let sheetRefs: {
  pre: HTMLElement;
  adv: HTMLElement;
  tPre: HTMLElement;
  tAdv: HTMLElement;
  bgPick: HTMLInputElement;
  bdPick: HTMLInputElement;
  bgRow: HTMLElement;
  bdRow: HTMLElement;
  rS: { input: HTMLInputElement; out: HTMLElement; unit: string };
  bS: { input: HTMLInputElement; out: HTMLElement; unit: string };
  pS: { input: HTMLInputElement; out: HTMLElement; unit: string };
  shTg: HTMLElement;
  onTg: HTMLElement;
} | null = null;

/** Push the model into the sheet's controls. */
function syncSheet() {
  const R = sheetRefs;
  if (!R) return;
  R.tPre.classList.toggle('on', state.tab === 'presets');
  R.tAdv.classList.toggle('on', state.tab === 'advanced');
  R.pre.style.display = state.tab === 'presets' ? 'block' : 'none';
  R.adv.style.display = state.tab === 'advanced' ? 'block' : 'none';

  R.bgPick.value = state.style.bg === NONE ? '#ffffff' : state.style.bg;
  R.bdPick.value = state.style.bd === NONE ? '#ffffff' : state.style.bd;
  markColourRow(R.bgRow, state.style.bg);
  markColourRow(R.bdRow, state.style.bd);

  R.rS.input.value = String(state.style.r);
  R.rS.out.textContent = state.style.r + R.rS.unit;
  R.bS.input.value = String(state.style.bw);
  R.bS.out.textContent = state.style.bw + R.bS.unit;
  R.pS.input.value = String(state.style.pad);
  R.pS.out.textContent = state.style.pad + R.pS.unit;

  R.shTg.classList.toggle('on', state.style.sh);
  R.onTg.classList.toggle('on', state.on);

  sheet?.querySelectorAll<HTMLElement>('.tx-card').forEach((n) => {
    n.classList.toggle('on', (n as HTMLElement).dataset.preset === state.preset);
  });
}

/** Persist, apply to the selection when there is one, and repaint the UI. */
function commit() {
  saveStyle();
  applyToSelection();
  paintPill();
}

function buildPill(): HTMLElement {
  const node = div('tx-pill');
  node.id = 'txt-pill';

  const tag = span('tx-tag', 'Aa');
  node.append(tag);

  node.append(div('tx-div'));

  for (const p of PRESETS) {
    const b = btn('tx-chip');
    b.title = p.label;
    b.dataset.preset = p.id;
    const dot = el('i');
    dot.style.background = p.style.bg === NONE ? '#fff' : p.style.bg;
    dot.style.border = p.style.bw ? `${Math.max(1, p.style.bw)}px solid ${p.style.bd}` : '1px solid #cfd6e0';
    b.append(dot);
    b.onclick = () => {
      state.preset = p.id;
      state.style = { ...p.style };
      saveStyle();
      applyToSelection();
      paintPill();
    };
    node.append(b);
  }

  node.append(div('tx-div'));

  const gear = btn('tx-gear');
  gear.title = 'Text Box Style';
  gear.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.4"/><circle cx="10" cy="17" r="2.4"/></svg>';
  gear.onclick = (e) => {
    e.stopPropagation();
    if (!sheet) return;
    if (sheet.classList.contains('on') && sheetAnchor === gear) {
      sheet.classList.remove('on');
      return;
    }
    sheetAnchor = gear;
    syncSheet();
    placePop(sheet, gear);
  };
  node.append(gear);

  return node;
}

function placePop(node: HTMLElement, anchor: HTMLElement) {
  node.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left - w / 2 + r.width / 2));
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) {
    const above = r.top - h - 8;
    top = above > 8 ? above : Math.max(8, window.innerHeight - h - 8);
  }
  node.style.left = Math.round(left) + 'px';
  node.style.top = Math.round(top) + 'px';
}

function paintPill() {
  if (!pill) return;
  const show = editorOpen() && (toolIsText() || hasTextSelection());
  pill.classList.toggle('on', show);

  pill.querySelectorAll<HTMLElement>('.tx-chip').forEach((n) => {
    n.classList.toggle('on', (n as HTMLElement).dataset.preset === state.preset);
  });
  const gear = pill.querySelector('.tx-gear');
  if (gear) gear.classList.toggle('on', state.on);

  if (!show) {
    sheet?.classList.remove('on');
    return;
  }

  const tb = document.getElementById('tb');
  if (!tb) return;
  const r = tb.getBoundingClientRect();
  // the ink pill owns the slot directly under the toolbar; step below it when
  // both are up (a text box selected while a pen is active)
  const ink = document.getElementById('ink-pen');
  const inkUp = !!ink && ink.classList.contains('on');
  const drop = inkUp ? Math.round(ink.getBoundingClientRect().height) + 6 : 0;
  pill.style.top = Math.round(r.bottom + 8 + drop) + 'px';
  const w = pill.offsetWidth;
  pill.style.left = Math.round(Math.max(8, window.innerWidth / 2 - w / 2)) + 'px';
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#txt-pill{
  position:fixed;z-index:28;display:none;align-items:center;gap:2px;
  padding:6px 7px;border-radius:16px;background:#fff;
  box-shadow:0 8px 26px rgba(8,20,38,.20),0 1px 3px rgba(8,20,38,.10);
  border:1px solid #eef1f6;font-family:inherit;
}
#txt-pill.on{display:flex}
#txt-pill .tx-tag{
  font:700 13px/1 ui-rounded,'SF Pro Rounded',system-ui,sans-serif;
  color:#3c4654;padding:0 7px 0 4px;letter-spacing:.2px;
}
#txt-pill .tx-div{width:1px;height:22px;background:#eceff4;margin:0 5px;flex:none}
#txt-pill button{
  border:0!important;background:transparent!important;padding:0!important;margin:0;
  cursor:pointer;border-radius:10px;display:grid;place-items:center;
  color:#3c4654;flex:none;transition:background .12s ease;
}
#txt-pill .tx-chip{width:30px;height:30px}
#txt-pill .tx-chip:hover{background:#f2f5fa}
#txt-pill .tx-chip.on{background:#e3edff!important;box-shadow:inset 0 0 0 1px #b9d0ff}
#txt-pill .tx-chip i{display:block;width:16px;height:16px;border-radius:5px}
#txt-pill .tx-gear{width:32px;height:32px}
#txt-pill .tx-gear:hover{background:#f2f5fa}
#txt-pill .tx-gear.on{background:#e3edff!important;color:#1f4fbf}
#txt-pill .tx-gear svg{width:18px;height:18px;display:block}

#tx-set{
  position:fixed;z-index:34;display:none;width:268px;padding:12px;
  border-radius:16px;background:#fff;border:1px solid #eef1f6;
  box-shadow:0 18px 44px rgba(8,20,38,.22),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;max-height:min(70vh,520px);overflow:auto;
}
#tx-set.on{display:block}
.tx-tabs{display:flex;gap:2px;background:#f2f4f7;border-radius:10px;padding:2px;margin-bottom:10px}
.tx-tab{
  flex:1;border:0!important;background:transparent!important;border-radius:8px;
  padding:6px 0!important;font:600 12px/1 inherit;color:#5b6675;cursor:pointer;
}
.tx-tab.on{background:#fff!important;color:#1f3a63;box-shadow:0 1px 3px rgba(16,32,64,.14)}
.tx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.tx-card{
  border:2px solid transparent!important;background:#fff!important;border-radius:11px;
  padding:6px 4px 5px!important;cursor:pointer;display:flex;flex-direction:column;
  align-items:center;gap:4px;box-shadow:0 1px 3px rgba(16,32,64,.10);
}
.tx-card.on{border-color:var(--gn-acc,#2f6df6)!important;box-shadow:0 0 0 2px rgba(47,109,246,.16)}
.tx-demo{
  width:100%;height:34px;display:grid;place-items:center;
  font:600 13px/1 inherit;color:#1f2a3a;
}
.tx-cap{font:600 9.5px/1 inherit;color:#77828f;letter-spacing:.02em}
.tx-row{margin-bottom:11px}
.tx-label{
  font:700 9.5px/1 inherit;letter-spacing:.08em;text-transform:uppercase;
  color:#8b95a3;margin-bottom:6px;
}
.tx-swrow{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.tx-sw{
  width:22px!important;height:22px!important;border-radius:50%!important;padding:0!important;
  border:0!important;background:var(--swc,#111)!important;cursor:pointer;flex:none;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);
}
.tx-sw.on{box-shadow:inset 0 0 0 1px rgba(0,0,0,.12),0 0 0 2px #fff,0 0 0 3.5px #2f6df6}
.tx-sw.tx-none{
  background:
    linear-gradient(135deg,transparent 44%,#e2555f 44% 56%,transparent 56%),
    #fff!important;
}
.tx-pick{
  width:24px;height:24px;padding:0;border:1px solid #e6e2dc;border-radius:7px;
  background:#fff;cursor:pointer;flex:none;
}
.tx-pick::-webkit-color-swatch-wrapper{padding:2px}
.tx-pick::-webkit-color-swatch{border:0;border-radius:5px}
.tx-line{display:flex;align-items:center;gap:8px}
.tx-range{flex:1;accent-color:var(--gn-acc,#2f6df6);height:18px}
.tx-num{
  font:600 10.5px/1 inherit;color:#5b6675;min-width:34px;text-align:right;
  font-variant-numeric:tabular-nums;
}
.tx-tg{
  width:40px!important;height:23px!important;border-radius:999px!important;padding:0!important;
  border:0!important;background:#d8dee7!important;position:relative;cursor:pointer;
  transition:background .15s ease;
}
.tx-tg::after{
  content:'';position:absolute;top:2.5px;left:2.5px;width:18px;height:18px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(16,32,64,.28);transition:transform .15s ease;
}
.tx-tg.on{background:var(--gn-acc,#2f6df6)!important}
.tx-tg.on::after{transform:translateX(17px)}
@media(max-width:620px){
  #tx-set{width:min(92vw,268px)}
  #txt-pill .tx-chip{width:26px;height:26px}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!document.getElementById('ed')) return;
  loadStyle();
  (window as any).__gnTxtStyle = state;
  installTextEngine();
  hookCommit();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  pill = buildPill();
  sheet = buildSheet();
  document.body.append(pill, sheet);

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest) return;
      if (t.closest('#tx-set') || t.closest('#txt-pill')) return;
      sheet?.classList.remove('on');
    },
    true
  );

  // tab clicks
  sheet.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest('.tx-tab') as HTMLElement | null;
    if (!tab) return;
    state.tab = (tab.dataset.tab as 'presets' | 'advanced') || 'presets';
    syncSheet();
  });

  // the pill has to follow the toolbar and the tool, so poll rather than
  // listen — the engine swaps rows in and out without firing events
  let lastTool = '';
  let lastOpen = false;
  let lastSel = 0;
  window.setInterval(() => {
    const t = ev<string>('tool') || '';
    const open = editorOpen();
    const sel = (ev<any[]>('sel') || []).length;
    if (t === lastTool && open === lastOpen && sel === lastSel) return;
    lastTool = t;
    lastOpen = open;
    lastSel = sel;
    paintPill();
  }, 220);

  window.addEventListener('resize', () => paintPill());
  paintPill();

  (window as any).__inkpad_text = {
    state,
    apply: applyToSelection,
    presets: PRESETS,
    pill: () => pill,
    sheet: () => sheet,
  };
}

boot();
