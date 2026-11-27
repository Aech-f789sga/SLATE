/**
 * Symbolab-style Math Expression Builder & Font-Aware Canvas Bridge.
 *
 * Exposes:
 *  - `window.__slateMath`: Canvas2D measurement & rendering bridge consumed by
 *    `index.html` (`bb0`, `rtText`, `svgPage`) so any text box containing math
 *    notation renders in its own selected font (`FF(s.f)`), size, weight,
 *    slant, color, underline, strikethrough, alignment, opacity, rotation, and
 *    Text Box Style (`s.tb`).
 *  - `window.__slateMathPad`: Interactive Symbolab-inspired keypad & live
 *    font-aware preview modal (`open`, `close`, `isOpen`).
 *  - `window.__slateKeepTxOnBlur`: Blur guard so moving focus from the open
 *    canvas `#tx` textarea into `#math-pad` or `#rt-bar` does not prematurely
 *    commit/close the active text box.
 */

import {
  containsMathSyntax,
  createCanvasMeasurer,
  drawMathBlock,
  findNextSlotRange,
  insertTemplateAtCursor,
  MATH_KEYPAD,
  MATH_TABS,
  measureMathBlock,
  type MathTabId,
  type MathTemplateItem,
} from './math-expr.ts';

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Canvas2D Bridge for index.html                                     */
/* ------------------------------------------------------------------ */

function installCanvasBridge() {
  (window as any).__slateMath = {
    hasMath: containsMathSyntax,
    measureTextBox(ctx: CanvasRenderingContext2D, s: any, fontFamily: string): [number, number, number, number] {
      const measurer = createCanvasMeasurer(ctx, fontFamily || 'Arial,sans-serif');
      const rt = s?.rt || {};
      const block = measureMathBlock(measurer, s?.txt || '', {
        fontSize: Number(s?.s) || 24,
        bold: !!rt.b,
        italic: !!rt.i,
        maxWidth: s?.w,
      });
      const w = Math.max(12, s?.w || 0, block.width);
      return [s.x, s.y, s.x + w, s.y + block.height];
    },
    drawTextBox(ctx: CanvasRenderingContext2D, s: any, fontFamily: string) {
      const rt = s?.rt || {};
      return drawMathBlock(ctx, s?.txt || '', s.x, s.y, {
        fontFamily: fontFamily || 'Arial,sans-serif',
        fontSize: Number(s?.s) || 24,
        color: s?.c || '#111111',
        bold: !!rt.b,
        italic: !!rt.i,
        underline: !!rt.u,
        strike: !!rt.st,
        align: rt.al || 'left',
        maxWidth: s?.w,
      });
    },
    drawMathBlock,
  };
}

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const CSS = `
#gn-math-btn svg{width:19px;height:19px;display:block}
#rt-math-btn{font-weight:700;font-size:14px!important;width:auto!important;padding:0 7px!important;gap:3px;display:inline-flex!important;align-items:center}

#math-pad{
  position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;
  padding:16px;background:rgba(14,22,36,.42);backdrop-filter:blur(4px);
  font-family:var(--slate-font,system-ui,-apple-system,sans-serif);
}
#math-pad.on{display:flex}

.mp-card{
  width:min(96vw,660px);max-height:90vh;overflow:auto;
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);
  border:1px solid var(--bd,#d9d9de);border-radius:16px;
  box-shadow:0 22px 54px rgba(10,18,34,.28);
  padding:18px;display:flex;flex-direction:column;gap:14px;
}

.mp-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.mp-title-wrap{display:flex;flex-direction:column;gap:2px;min-width:0}
.mp-title{font-size:16px;font-weight:700;letter-spacing:-.015em;margin:0}
.mp-sub{font-size:12px;color:var(--mu,#6e6e73);margin:0}
.mp-close{
  width:32px;height:32px;padding:0;border-radius:9px;
  border:1px solid transparent;background:transparent;color:var(--tx,#1c1c1e);
  display:grid;place-items:center;cursor:pointer;font-size:16px;flex:none;
}
.mp-close:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
.mp-close:focus-visible,.mp-tab:focus-visible,.mp-key:focus-visible,.mp-btn:focus-visible,.mp-mini-btn:focus-visible,.mp-sel:focus-visible,#mp-input:focus-visible{
  outline:2px solid var(--ac,#2f6df6);outline-offset:2px;
}

.mp-prev-wrap{
  border:1px solid var(--bd,#d9d9de);border-radius:12px;overflow:hidden;
  background:color-mix(in srgb,var(--bg,#e6e9ef) 45%,var(--sf,#fff));
}
.mp-prev-bar{
  display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  padding:8px 12px;border-bottom:1px solid var(--bd,#d9d9de);
  background:var(--sf,#fff);font-size:12px;
}
.mp-prev-lbl{font-weight:600;color:var(--mu,#6e6e73);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}
.mp-prev-ctrls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mp-prev-ctrls label{font-size:12px;color:var(--mu,#6e6e73)}
.mp-sel{
  height:28px;border:1px solid var(--bd,#d9d9de);border-radius:8px;
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);font-size:12.5px;padding:0 8px;cursor:pointer;
}
.mp-fmt-btn{
  width:28px;height:28px;padding:0;border:1px solid var(--bd,#d9d9de);border-radius:8px;
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);cursor:pointer;display:grid;place-items:center;font-size:12.5px;
}
.mp-fmt-btn.on{background:color-mix(in srgb,var(--ac,#2f6df6) 15%,transparent);color:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6)}

.mp-prev-stage{
  position:relative;min-height:92px;max-height:175px;overflow:auto;
  display:flex;align-items:center;justify-content:center;padding:12px 16px;
}
#mp-prev-cv{display:block;max-width:100%}
.mp-prev-empty{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:13px;color:var(--mu,#6e6e73);pointer-events:none;text-align:center;padding:0 16px;
}

.mp-ed-wrap{display:flex;flex-direction:column;gap:6px}
#mp-input{
  width:100%;min-height:64px;max-height:140px;resize:vertical;
  font-family:var(--slate-font-mono,ui-monospace,monospace);font-size:14px;line-height:1.45;
  padding:10px 12px;border-radius:11px;border:1px solid var(--bd,#d9d9de);
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);
}
.mp-ed-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.mp-ed-btns{display:flex;align-items:center;gap:6px}
.mp-mini-btn{
  height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--bd,#d9d9de);
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);font-size:12px;font-weight:600;cursor:pointer;
}
.mp-mini-btn:hover{border-color:var(--ac,#2f6df6)}
.mp-hint{font-size:11.5px;color:var(--mu,#6e6e73)}

.mp-tabs{
  display:flex;gap:4px;border-bottom:1px solid var(--bd,#d9d9de);
  overflow-x:auto;scrollbar-width:none;padding-bottom:1px;
}
.mp-tabs::-webkit-scrollbar{display:none}
.mp-tab{
  flex:none;white-space:nowrap;border:0;border-bottom:2px solid transparent;border-radius:8px 8px 0 0;
  background:transparent;color:var(--mu,#6e6e73);padding:8px 12px;
  font-size:12.5px;font-weight:600;cursor:pointer;
}
.mp-tab:hover{color:var(--tx,#1c1c1e)}
.mp-tab.on{color:var(--ac,#2f6df6);border-bottom-color:var(--ac,#2f6df6);background:color-mix(in srgb,var(--ac,#2f6df6) 8%,transparent)}

.mp-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:6px;
  max-height:190px;overflow:auto;padding:2px;
}
.mp-key{
  min-height:42px;padding:6px 6px;border-radius:10px;
  border:1px solid var(--bd,#d9d9de);background:var(--sf,#fff);color:var(--tx,#1c1c1e);
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  font-size:14.5px;font-weight:500;line-height:1.15;transition:border-color .12s,background .12s;
}
.mp-key:hover{border-color:var(--ac,#2f6df6);background:color-mix(in srgb,var(--ac,#2f6df6) 7%,var(--sf,#fff))}
.mp-key:active{transform:translateY(1px)}

.mp-slot{
  display:inline-block;width:9px;height:11px;border:1.25px dashed currentColor;border-radius:2px;
  vertical-align:middle;opacity:.72;font-size:0;line-height:0;margin:0 1px;
}
.mp-ico-frac{display:inline-flex;flex-direction:column;align-items:center;gap:1px;font-size:11px;line-height:1}
.mp-ico-frac i{display:block;width:100%;min-width:14px;height:1.3px;background:currentColor}
.mp-ico-script{font-size:13px;line-height:1}
.mp-ico-script sup,.mp-ico-script sub{font-size:9px}
.mp-ico-binom{display:inline-flex;align-items:center;gap:2px;font-size:14px;line-height:1}
.mp-ico-binom span{display:inline-block;font-size:9px;line-height:1.15}

.mp-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:2px}
.mp-btn{
  height:36px;padding:0 16px;border-radius:10px;border:1px solid var(--bd,#d9d9de);
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);font-size:13.5px;font-weight:600;cursor:pointer;
}
.mp-btn-pri{background:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6);color:#fff}
.mp-btn-pri:hover{filter:brightness(1.06)}

@media(max-width:560px){
  .mp-card{padding:14px;gap:10px}
  .mp-grid{grid-template-columns:repeat(auto-fill,minmax(58px,1fr))}
  .mp-key{min-height:38px;font-size:13.5px}
}
`;

/* ------------------------------------------------------------------ */
/* State & Modal                                                      */
/* ------------------------------------------------------------------ */

type Target =
  | { mode: 'tx'; start: number; end: number }
  | { mode: 'stroke'; stroke: any }
  | { mode: 'new'; x?: number; y?: number };

let overlay: HTMLElement | null = null;
let inputEl: HTMLTextAreaElement | null = null;
let fontSel: HTMLSelectElement | null = null;
let boldBtn: HTMLButtonElement | null = null;
let italicBtn: HTMLButtonElement | null = null;
let prevStage: HTMLElement | null = null;
let prevCanvas: HTMLCanvasElement | null = null;
let prevEmpty: HTMLElement | null = null;
let gridEl: HTMLElement | null = null;
let submitBtn: HTMLButtonElement | null = null;

let activeTab: MathTabId = 'basic';
let activeFont = 'arial';
let activeBold = false;
let activeItalic = false;
let target: Target = { mode: 'new' };

function getFonts(): Record<string, [string, string]> {
  return ev<Record<string, [string, string]>>('FONTS') || {
    arial: ['Arial', 'Arial,Helvetica,sans-serif'],
    georgia: ['Georgia', 'Georgia,serif'],
    courier: ['Courier', "'Courier New',monospace"],
  };
}

function resolveFF(fontKey: string): string {
  const f = ev<string>(`FF(${JSON.stringify(fontKey)})`);
  if (f) return f;
  const fonts = getFonts();
  return (fonts[fontKey] || fonts.arial || ['Arial', 'Arial,sans-serif'])[1];
}

function populateFontSelect() {
  if (!fontSel) return;
  const fonts = getFonts();
  fontSel.innerHTML = '';
  for (const [k, v] of Object.entries(fonts)) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = v[0];
    opt.style.fontFamily = v[1];
    fontSel.append(opt);
  }
  fontSel.value = fonts[activeFont] ? activeFont : Object.keys(fonts)[0] || 'arial';
}

function renderKeypad() {
  if (!gridEl || !overlay) return;
  overlay.querySelectorAll<HTMLElement>('.mp-tab').forEach((t) => {
    const on = t.dataset.tab === activeTab;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  gridEl.innerHTML = '';
  const items: MathTemplateItem[] = MATH_KEYPAD[activeTab] || [];
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mp-key';
    b.dataset.tpl = item.id;
    b.title = `${item.title} (${item.template.trim()})`;
    b.setAttribute('aria-label', item.title);
    if (item.iconHtml) b.innerHTML = item.iconHtml;
    else b.textContent = item.label;
    b.onclick = () => applyTemplate(item);
    gridEl.append(b);
  }
}

function applyTemplate(item: MathTemplateItem) {
  if (!inputEl) return;
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? start;
  const res = insertTemplateAtCursor(inputEl.value, start, end, item);
  inputEl.value = res.value;
  inputEl.focus();
  try {
    inputEl.setSelectionRange(res.selStart, res.selEnd);
  } catch {
    /* ignore */
  }
  renderPreview();
}

function jumpSlot(dir: 1 | -1) {
  if (!inputEl) return;
  const pos = inputEl.selectionStart ?? 0;
  const range = findNextSlotRange(inputEl.value, pos, dir);
  inputEl.focus();
  if (range) {
    try {
      inputEl.setSelectionRange(range.start, range.end);
    } catch {
      /* ignore */
    }
  }
}

function renderPreview() {
  if (!prevCanvas || !prevStage || !prevEmpty || !inputEl) return;
  const raw = inputEl.value.trimEnd();
  prevEmpty.style.display = raw.trim() ? 'none' : 'flex';

  const paperCol = ev<string>('pg()&&pg().col') || '#ffffff';
  prevStage.style.background = paperCol;
  const isDarkPaper = /^#1[0-9a-f]/i.test(paperCol);
  const strokeCol = isDarkPaper ? '#f2f2f5' : '#111111';

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const ctx = prevCanvas.getContext('2d');
  if (!ctx) return;

  if (!raw.trim()) {
    prevCanvas.width = Math.round(320 * dpr);
    prevCanvas.height = Math.round(64 * dpr);
    prevCanvas.style.width = '320px';
    prevCanvas.style.height = '64px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, prevCanvas.width, prevCanvas.height);
    return;
  }

  const ff = resolveFF(activeFont);
  const previewPx = 28;
  const measurer = createCanvasMeasurer(ctx, ff);
  const block = measureMathBlock(measurer, raw, {
    fontSize: previewPx,
    bold: activeBold,
    italic: activeItalic,
  });

  const padX = 18;
  const padY = 14;
  const availW = Math.max(240, prevStage.clientWidth - 36);
  const natW = Math.max(40, block.width + padX * 2);
  const natH = Math.max(52, block.height + padY * 2);
  const fitScale = natW > availW ? Math.max(0.55, availW / natW) : 1;

  const cssW = Math.ceil(natW * fitScale);
  const cssH = Math.ceil(natH * fitScale);
  prevCanvas.width = Math.max(1, Math.round(cssW * dpr));
  prevCanvas.height = Math.max(1, Math.round(cssH * dpr));
  prevCanvas.style.width = `${cssW}px`;
  prevCanvas.style.height = `${cssH}px`;

  ctx.setTransform(dpr * fitScale, 0, 0, dpr * fitScale, 0, 0);
  ctx.clearRect(0, 0, natW, natH);
  drawMathBlock(ctx, raw, padX, padY, {
    fontFamily: ff,
    fontSize: previewPx,
    color: strokeCol,
    bold: activeBold,
    italic: activeItalic,
    align: 'left',
  });
}

function ensureStyle() {
  if (document.getElementById('gn-math-style')) return;
  const style = document.createElement('style');
  style.id = 'gn-math-style';
  style.textContent = CSS;
  document.head.append(style);
}

function buildModal() {
  if (overlay) return;
  ensureStyle();

  overlay = document.createElement('div');
  overlay.id = 'math-pad';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'mp-dialog-title');

  overlay.innerHTML = `
    <div class="mp-card">
      <div class="mp-head">
        <div class="mp-title-wrap">
          <h2 class="mp-title" id="mp-dialog-title">Math Expression</h2>
          <p class="mp-sub">Build structured formulas — rendered in your selected notebook font</p>
        </div>
        <button type="button" class="mp-close" aria-label="Close math builder">✕</button>
      </div>

      <div class="mp-prev-wrap">
        <div class="mp-prev-bar">
          <span class="mp-prev-lbl">Live Preview</span>
          <div class="mp-prev-ctrls">
            <label for="mp-font">Font</label>
            <select id="mp-font" class="mp-sel" aria-label="Math expression font"></select>
            <button type="button" class="mp-fmt-btn" id="mp-bold" title="Bold" aria-label="Bold" aria-pressed="false"><b>B</b></button>
            <button type="button" class="mp-fmt-btn" id="mp-italic" title="Italic" aria-label="Italic" aria-pressed="false"><i>I</i></button>
          </div>
        </div>
        <div class="mp-prev-stage">
          <canvas id="mp-prev-cv"></canvas>
          <div class="mp-prev-empty">Choose a template below or type an expression (e.g. \\frac{x^2}{2})</div>
        </div>
      </div>

      <div class="mp-ed-wrap">
        <textarea id="mp-input" rows="2" spellcheck="false" aria-label="Math expression source" placeholder="Type or tap templates: e.g. \\frac{x^{2} + 1}{\\sqrt{x}} or \\int_{0}^{1} x^{2} dx"></textarea>
        <div class="mp-ed-actions">
          <div class="mp-ed-btns">
            <button type="button" class="mp-mini-btn" id="mp-prev-slot">‹ Prev slot</button>
            <button type="button" class="mp-mini-btn" id="mp-next-slot">Next slot (Tab) ›</button>
            <button type="button" class="mp-mini-btn" id="mp-clear">Clear</button>
          </div>
          <span class="mp-hint">Ctrl/Cmd + Enter to insert</span>
        </div>
      </div>

      <div class="mp-tabs" role="tablist" aria-label="Math symbol categories">
        ${MATH_TABS.map(
          (t, i) =>
            `<button type="button" class="mp-tab${i === 0 ? ' on' : ''}" role="tab" data-tab="${t.id}" aria-selected="${i === 0 ? 'true' : 'false'}">${t.label}</button>`,
        ).join('')}
      </div>

      <div class="mp-grid" id="mp-grid"></div>

      <div class="mp-foot">
        <button type="button" class="mp-btn" id="mp-cancel">Cancel</button>
        <button type="button" class="mp-btn mp-btn-pri" id="mp-insert">Insert expression</button>
      </div>
    </div>
  `;

  document.body.append(overlay);

  inputEl = overlay.querySelector('#mp-input') as HTMLTextAreaElement;
  fontSel = overlay.querySelector('#mp-font') as HTMLSelectElement;
  boldBtn = overlay.querySelector('#mp-bold') as HTMLButtonElement;
  italicBtn = overlay.querySelector('#mp-italic') as HTMLButtonElement;
  prevStage = overlay.querySelector('.mp-prev-stage') as HTMLElement;
  prevCanvas = overlay.querySelector('#mp-prev-cv') as HTMLCanvasElement;
  prevEmpty = overlay.querySelector('.mp-prev-empty') as HTMLElement;
  gridEl = overlay.querySelector('#mp-grid') as HTMLElement;
  submitBtn = overlay.querySelector('#mp-insert') as HTMLButtonElement;

  (overlay.querySelector('.mp-close') as HTMLButtonElement).onclick = () => closeMathPad();
  (overlay.querySelector('#mp-cancel') as HTMLButtonElement).onclick = () => closeMathPad();
  submitBtn.onclick = () => submitMathPad();

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) closeMathPad();
  });

  overlay.querySelectorAll<HTMLElement>('.mp-tab').forEach((t) => {
    t.onclick = () => {
      activeTab = (t.dataset.tab as MathTabId) || 'basic';
      renderKeypad();
    };
  });

  fontSel.onchange = () => {
    activeFont = fontSel!.value || 'arial';
    try {
      (document as any).fonts?.load?.(`24px ${resolveFF(activeFont)}`).then(() => renderPreview());
    } catch {
      /* ignore */
    }
    renderPreview();
  };

  boldBtn.onclick = () => {
    activeBold = !activeBold;
    syncFormatBtns();
    renderPreview();
  };
  italicBtn.onclick = () => {
    activeItalic = !activeItalic;
    syncFormatBtns();
    renderPreview();
  };

  (overlay.querySelector('#mp-prev-slot') as HTMLButtonElement).onclick = () => jumpSlot(-1);
  (overlay.querySelector('#mp-next-slot') as HTMLButtonElement).onclick = () => jumpSlot(1);
  (overlay.querySelector('#mp-clear') as HTMLButtonElement).onclick = () => {
    if (!inputEl) return;
    inputEl.value = '';
    inputEl.focus();
    renderPreview();
  };

  inputEl.addEventListener('input', () => renderPreview());
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      jumpSlot(e.shiftKey ? -1 : 1);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submitMathPad();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMathPad();
    }
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && isOpen()) {
        e.preventDefault();
        closeMathPad();
      }
    },
    true,
  );
}

function syncFormatBtns() {
  if (boldBtn) {
    boldBtn.classList.toggle('on', activeBold);
    boldBtn.setAttribute('aria-pressed', activeBold ? 'true' : 'false');
  }
  if (italicBtn) {
    italicBtn.classList.toggle('on', activeItalic);
    italicBtn.setAttribute('aria-pressed', activeItalic ? 'true' : 'false');
  }
}

function isOpen(): boolean {
  return !!overlay && overlay.classList.contains('on');
}

function openMathPad(opts?: { x?: number; y?: number; initialExpr?: string }) {
  buildModal();
  if (!overlay || !inputEl || !submitBtn) return;

  const te = ev<any>('te');
  const sel = ev<any[]>('sel') || [];
  const tx = document.getElementById('tx') as HTMLTextAreaElement | null;
  const richState = (window as any).__slateRich?.state?.();

  if (te && tx) {
    const start = tx.selectionStart ?? tx.value.length;
    const end = tx.selectionEnd ?? start;
    const picked = tx.value.slice(start, end);
    target = { mode: 'tx', start, end };
    activeFont = te.f || richState?.family || ev<string>('$("#fnt").value') || 'arial';
    activeBold = !!te.rt?.b;
    activeItalic = !!te.rt?.i;
    inputEl.value = opts?.initialExpr ?? picked;
    submitBtn.textContent = 'Insert into text';
  } else if (sel.length === 1 && sel[0]?.t === 'text') {
    const it = sel[0];
    target = { mode: 'stroke', stroke: it };
    activeFont = it.f || richState?.family || ev<string>('$("#fnt").value') || 'arial';
    activeBold = !!it.rt?.b;
    activeItalic = !!it.rt?.i;
    inputEl.value = opts?.initialExpr ?? (it.txt || '');
    submitBtn.textContent = 'Update text box';
  } else {
    target = { mode: 'new', x: opts?.x, y: opts?.y };
    activeFont = richState?.family || ev<string>('$("#fnt").value') || 'arial';
    activeBold = !!richState?.rt?.b;
    activeItalic = !!richState?.rt?.i;
    inputEl.value = opts?.initialExpr ?? '';
    submitBtn.textContent = 'Insert on page';
  }

  populateFontSelect();
  syncFormatBtns();
  renderKeypad();

  overlay.classList.add('on');
  try {
    (document as any).fonts?.load?.(`24px ${resolveFF(activeFont)}`).then(() => renderPreview());
  } catch {
    /* ignore */
  }
  renderPreview();

  window.setTimeout(() => {
    inputEl?.focus();
    if (inputEl && inputEl.value) {
      const len = inputEl.value.length;
      try {
        inputEl.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }
  }, 20);
}

function closeMathPad(restoreTx = true) {
  if (!overlay) return;
  overlay.classList.remove('on');
  if (restoreTx && target.mode === 'tx') {
    const tx = document.getElementById('tx') as HTMLTextAreaElement | null;
    if (tx && tx.style.display !== 'none') {
      window.setTimeout(() => {
        try {
          tx.focus();
        } catch {
          /* ignore */
        }
      }, 10);
    }
  }
}

function syncEngineFontUI(fontKey: string) {
  const fntEl = document.getElementById('fnt') as HTMLSelectElement | null;
  if (fntEl) fntEl.value = fontKey;
  try {
    (window as any).eval(`lastFnt = ${JSON.stringify(fontKey)};`);
  } catch {
    /* ignore */
  }
}

function computeVisibleCenter(): { x: number; y: number } {
  const stage = document.getElementById('stage');
  const cv = document.getElementById('cv');
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!stage || !cv) return { x: W * 0.25, y: H * 0.25 };
  const sr = stage.getBoundingClientRect();
  const cr = cv.getBoundingClientRect();
  if (!cr.width || !cr.height) return { x: W * 0.25, y: H * 0.25 };
  const vx = Math.max(cr.left, sr.left) + (Math.min(cr.right, sr.right) - Math.max(cr.left, sr.left)) * 0.5;
  const vy = Math.max(cr.top, sr.top) + (Math.min(cr.bottom, sr.bottom) - Math.max(cr.top, sr.top)) * 0.42;
  const px = Math.max(48, Math.min(W - 140, ((vx - cr.left) / cr.width) * W - 60));
  const py = Math.max(60, Math.min(H - 100, ((vy - cr.top) / cr.height) * H - 24));
  return { x: Math.round(px), y: Math.round(py) };
}

function submitMathPad() {
  if (!inputEl) return;
  const expr = inputEl.value.trimEnd();
  if (!expr.trim()) {
    closeMathPad();
    return;
  }

  const chosenFont = activeFont || 'arial';
  const richApi = (window as any).__slateRich;

  if (target.mode === 'tx') {
    const tx = document.getElementById('tx') as HTMLTextAreaElement | null;
    const te = ev<any>('te');
    const savedStart = target.start;
    const savedEnd = target.end;
    closeMathPad(false);
    if (tx && te) {
      const val = tx.value;
      const before = val.slice(0, savedStart);
      const after = val.slice(savedEnd);
      tx.value = before + expr + after;
      te.f = chosenFont;
      te.rt = { b: activeBold, i: activeItalic, u: !!te.rt?.u, st: !!te.rt?.st, al: te.rt?.al || 'left' };
      syncEngineFontUI(chosenFont);
      try {
        const ff = resolveFF(chosenFont);
        tx.style.fontFamily = ff;
        tx.style.fontWeight = activeBold ? '700' : '400';
        tx.style.fontStyle = activeItalic ? 'italic' : 'normal';
        (tx as any).oninput?.();
      } catch {
        /* ignore */
      }
      if (richApi?.set) {
        richApi.set({ f: chosenFont, b: activeBold, i: activeItalic });
      }
      window.setTimeout(() => {
        try {
          tx.focus();
          const pos = before.length + expr.length;
          tx.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      }, 10);
    }
    return;
  }

  if (target.mode === 'stroke' && target.stroke) {
    const s = target.stroke;
    closeMathPad(false);
    ev('snap()');
    s.txt = expr;
    s.f = chosenFont;
    s.rt = { b: activeBold, i: activeItalic, u: !!s.rt?.u, st: !!s.rt?.st, al: s.rt?.al || 'left' };
    syncEngineFontUI(chosenFont);
    if (richApi?.set) {
      richApi.set({ f: chosenFont, b: activeBold, i: activeItalic });
    }
    ev('try{ draw(); save(); thumbs(); }catch(e){}');
    return;
  }

  // Insert brand-new text box containing the math expression
  const pt =
    target.mode === 'new' && typeof target.x === 'number' && typeof target.y === 'number'
      ? { x: target.x, y: target.y }
      : computeVisibleCenter();
  closeMathPad(false);

  const curSize =
    (richApi?.state && Number.isFinite(richApi.state().fontSize) ? richApi.state().fontSize : null) ||
    ev<number>('10 + size * 3') ||
    28;
  const col = ev<string>('color') || '#111111';
  const defaultRt = richApi?.state?.()?.rt || { b: false, i: false, u: false, st: false, al: 'left' };
  const tbState = (window as any).__gnTxtStyle;
  const tbCopy = tbState && tbState.on && tbState.style ? { ...tbState.style } : undefined;

  syncEngineFontUI(chosenFont);
  if (richApi?.set) {
    richApi.set({ f: chosenFont, b: activeBold, i: activeItalic });
  }

  const newStroke = {
    t: 'text',
    c: col,
    s: curSize,
    x: pt.x,
    y: pt.y,
    txt: expr,
    w: undefined,
    f: chosenFont,
    rt: { ...defaultRt, b: activeBold, i: activeItalic },
    ...(tbCopy ? { tb: tbCopy } : {}),
  };

  (window as any).__slatePendingMathStroke = newStroke;
  ev(`(function(){
    var it = window.__slatePendingMathStroke;
    delete window.__slatePendingMathStroke;
    if (!it || !pg()) return;
    snap();
    if (typeof lyInit === 'function') lyInit(pg());
    if (pg().al) it.ly = pg().al;
    pg().strokes.push(it);
    sel = [it];
    tool = 'sel';
    syncTools();
    draw();
    save();
    thumbs();
  })()`);
}

/* ------------------------------------------------------------------ */
/* Toolbar button + Blur guard                                        */
/* ------------------------------------------------------------------ */

function installToolbarButton() {
  const bar = document.getElementById('bar');
  const txtBtn = bar?.querySelector('[data-t="text"]');
  if (!bar || !txtBtn || document.getElementById('gn-math-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'gn-math-btn';
  btn.type = 'button';
  btn.className = 'ic';
  btn.title = 'Insert math expression (Symbolab-style)';
  btn.setAttribute('aria-label', 'Insert math expression');
  btn.innerHTML = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 5H6l6.5 7L6 19h12"/></svg>`;

  btn.addEventListener('mousedown', (e) => {
    // Keep any open #tx textarea alive until openMathPad snapshots its caret/selection
    e.preventDefault();
  });
  btn.onclick = () => {
    openMathPad();
  };

  txtBtn.after(btn);
}

function installBlurGuard() {
  (window as any).__slateKeepTxOnBlur = (e?: FocusEvent) => {
    if (isOpen()) return true;
    const to = e?.relatedTarget as HTMLElement | null;
    if (!to || !to.closest) return false;
    return !!(to.closest('#math-pad') || to.closest('#rt-bar') || to.closest('#gn-math-btn'));
  };
}

function boot() {
  ensureStyle();
  installCanvasBridge();
  installBlurGuard();

  (window as any).__slateMathPad = {
    open: openMathPad,
    close: closeMathPad,
    isOpen,
  };

  if (document.getElementById('bar')) {
    installToolbarButton();
  } else {
    window.setTimeout(installToolbarButton, 150);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
