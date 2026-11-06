/**
 * Lasso tools — turn selected ink into text, or into LaTeX.
 *
 * The engine's lasso already selects strokes and shows a bar with duplicate /
 * delete / animate. What it cannot do is answer the question "is this
 * handwriting, and what does it say?".
 *
 * So when a selection is made of ink, a small pill appears above it:
 *
 *   • Text   — read the ink and drop a real text object in its place,
 *   • LaTeX  — same read, but emitted as a formula source,
 *   • Copy   — put the reading on the clipboard without touching the page.
 *
 * The reading is always shown in an editable box first. Recognition is good on
 * clean maths and fair on prose; the confirmation step is what makes it usable
 * either way, and it also lets a mis-read glyph be fixed with two keystrokes.
 */

import { readInk, type InkStroke } from './math/ocr';
import { onnxOn, readWithOnnx } from './math/onnx';
import { onSmartChange, smartOn } from './smart';

/* ------------------------------------------------------------------ */
/* Engine access                                                       */
/* ------------------------------------------------------------------ */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T | null;
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

type Mode = 'text' | 'latex';

let pill: HTMLElement | null = null;
let card: HTMLElement | null = null;
let lastSig = '';
let current: { strokes: InkStroke[]; box: [number, number, number, number]; count: number } | null = null;

/* ------------------------------------------------------------------ */
/* Reading the selection                                               */
/* ------------------------------------------------------------------ */

function selInk(): any[] {
  const sel = ev<any[]>('sel') || [];
  return sel.filter((s) => s && (s.t === 'pen' || s.t === 'hl') && Array.isArray(s.p) && s.p.length);
}

function boxOf(items: any[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of items) {
    for (const q of s.p) {
      if (q[0] < x0) x0 = q[0];
      if (q[1] < y0) y0 = q[1];
      if (q[0] > x1) x1 = q[0];
      if (q[1] > y1) y1 = q[1];
    }
  }
  return [x0, y0, x1, y1];
}

/** Page units → viewport pixels. */
function toScreen(x: number, y: number): { x: number; y: number } {
  const cv = document.getElementById('cv') as HTMLCanvasElement | null;
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return { x, y };
  const r = cv.getBoundingClientRect();
  return { x: r.left + (x / W) * r.width, y: r.top + (y / H) * r.height };
}

/**
 * Text-ness: several glyph-sized strokes sharing a baseline, none of them huge.
 * A drawing (a house, a diagram) fails this and the pill says "Convert" instead
 * of pretending it read a word.
 */
function textLikeness(items: any[], box: [number, number, number, number]): number {
  const h = box[3] - box[1];
  const w = box[2] - box[0];
  if (h <= 0 || w <= 0) return 0;
  const count = items.length;
  const ratio = w / h;
  let score = 0;
  if (count >= 2) score += 0.3;
  if (count >= 4) score += 0.2;
  if (ratio > 0.7 && ratio < 14) score += 0.25;
  if (h < 120) score += 0.15;
  // strokes per glyph-ish area: handwriting is dense, drawings are sparse
  const density = count / Math.max(1, w / Math.max(8, h));
  if (density > 0.6) score += 0.1;
  return Math.min(1, score);
}

/* ------------------------------------------------------------------ */
/* Pill                                                                */
/* ------------------------------------------------------------------ */

function buildPill() {
  if (pill) return;
  pill = el('div');
  pill.id = 'lasso-pill';
  pill.innerHTML = `
    <button class="lp-b lp-text" type="button" title="Convert the selected ink to text">
      <span class="lp-ic">T</span><span class="lp-lb">Text</span>
    </button>
    <button class="lp-b lp-latex" type="button" title="Convert the selected ink to LaTeX">
      <span class="lp-ic">∑</span><span class="lp-lb">LaTeX</span>
    </button>
    <button class="lp-b lp-copy" type="button" title="Copy what it reads">⧉</button>`;
  document.body.append(pill);

  (pill.querySelector('.lp-text') as HTMLElement).onclick = (e) => {
    e.stopPropagation();
    openCard('text');
  };
  (pill.querySelector('.lp-latex') as HTMLElement).onclick = (e) => {
    e.stopPropagation();
    openCard('latex');
  };
  (pill.querySelector('.lp-copy') as HTMLElement).onclick = (e) => {
    e.stopPropagation();
    const read = readSelection();
    if (!read) return;
    navigator.clipboard?.writeText(read.text).then(() => flash('Copied'), () => flash('Copy failed'));
  };
}

function flash(msg: string) {
  const n = card?.querySelector('.lc-hint') as HTMLElement | null;
  if (n) {
    n.textContent = msg;
    window.setTimeout(() => {
      if (n) n.textContent = '';
    }, 1400);
  }
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function buildCard() {
  if (card) return;
  card = el('div');
  card.id = 'lasso-card';
  card.innerHTML = `
    <div class="lc-head">
      <b class="lc-title">Convert selection</b>
      <span class="lc-conf"></span>
      <button class="lc-x" type="button" aria-label="Close">✕</button>
    </div>
    <div class="lc-tabs">
      <button class="lc-tab on" data-m="text" type="button">Text</button>
      <button class="lc-tab" data-m="latex" type="button">LaTeX</button>
      <span class="lc-hint"></span>
    </div>
    <textarea class="lc-area" spellcheck="false" aria-label="Recognised text"></textarea>
    <div class="lc-prev" aria-hidden="true"></div>
    <div class="lc-foot">
      <span class="lc-note">Edit before inserting — recognition is a guess, you are the proof.</span>
      <div class="lc-btns">
        <button class="lc-cancel" type="button">Cancel</button>
        <button class="lc-insert" type="button">Insert</button>
      </div>
    </div>`;
  document.body.append(card);

  (card.querySelector('.lc-x') as HTMLElement).onclick = closeCard;
  (card.querySelector('.lc-cancel') as HTMLElement).onclick = closeCard;
  (card.querySelector('.lc-insert') as HTMLElement).onclick = insert;

  let mode: Mode = 'text';
  card.querySelectorAll<HTMLElement>('.lc-tab').forEach((tab) => {
    tab.onclick = () => {
      mode = (tab.dataset.m as Mode) || 'text';
      card!.dataset.mode = mode;
      card!.querySelectorAll<HTMLElement>('.lc-tab').forEach((t) => t.classList.toggle('on', t.dataset.m === mode));
      if (!current) return;
      const read = readInk(current.strokes, { math: mode === 'latex' });
      (card!.querySelector('.lc-area') as HTMLTextAreaElement).value = mode === 'latex' ? read.latex : read.text;
      (card!.querySelector('.lc-conf') as HTMLElement).textContent = confLabel(read.confidence);
      (card!.querySelector('.lc-conf') as HTMLElement).dataset.v = String(Math.round(read.confidence * 100));
      paintPreview(true);
      if (mode === 'latex') refineWithModel(++cardSeq);
    };
  });

  (card.querySelector('.lc-area') as HTMLTextAreaElement).oninput = () => paintPreview();
}

/* ------------------------------------------------------------------ */
/* Formula preview                                                     */
/* ------------------------------------------------------------------ */

/**
 * The LaTeX tab produces source, and source is unreadable at the moment you
 * most need to judge it — right after the read. KaTeX renders it, so a wrong
 * read looks wrong immediately instead of after you paste it.
 *
 * Imported lazily: a notebook that never converts a formula should not pay for
 * the renderer or its font files. If the chunk cannot be fetched — offline on
 * a first run — the source is shown as plain text rather than nothing.
 */
let katex: any = null;
let katexTried = false;
let katexLoad: Promise<void> | null = null;

function loadKatex(): Promise<void> {
  if (katexLoad) return katexLoad;
  katexLoad = (async () => {
    try {
      const [mod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
      katex = (mod as any).default || mod;
    } catch {
      katex = null;
    } finally {
      katexTried = true;
    }
  })();
  return katexLoad;
}

function rawInto(prev: HTMLElement, src: string) {
  prev.innerHTML = '<span class="lc-raw"></span>';
  (prev.firstElementChild as HTMLElement).textContent = src;
}

let prevTimer = 0;

function paintPreview(now = false) {
  if (!card) return;
  const prev = card.querySelector('.lc-prev') as HTMLElement | null;
  const area = card.querySelector('.lc-area') as HTMLTextAreaElement | null;
  if (!prev || !area) return;
  const src = card.dataset.mode === 'latex' ? area.value.trim() : '';
  if (!src) {
    prev.innerHTML = '';
    return;
  }

  const run = async () => {
    if (!katex && !katexTried) await loadKatex();
    if (!prev.isConnected) return;
    if (!katex) return rawInto(prev, src);
    try {
      katex.render(src, prev, { displayMode: true, throwOnError: false, strict: false });
    } catch {
      rawInto(prev, src);
    }
  };

  window.clearTimeout(prevTimer);
  if (now) void run();
  else prevTimer = window.setTimeout(run, 140);
}

function confLabel(c: number): string {
  if (c > 0.72) return 'good read';
  if (c > 0.45) return 'check it';
  return 'rough read';
}

/* ------------------------------------------------------------------ */
/* Optional model                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every open of the card gets a number, so an answer that arrives after you
 * have closed it — or moved to another selection — is dropped instead of
 * overwriting whatever is on screen now.
 */
let cardSeq = 0;

/**
 * Ask the optional ONNX model, if one is configured.
 *
 * The built-in read is already on screen before this runs, so the model is a
 * correction rather than a wait. If it fails, times out, or comes back stale,
 * nothing happens at all — the guess you already had stands.
 */
function refineWithModel(seq: number) {
  if (!onnxOn() || !current) return;
  const strokes = current.strokes;
  void readWithOnnx(strokes).then((r) => {
    if (!r || !r.text || seq !== cardSeq) return;
    if (!card || !card.classList.contains('on') || card.dataset.mode !== 'latex') return;
    const area = card.querySelector('.lc-area') as HTMLTextAreaElement | null;
    if (!area) return;
    area.value = r.text;
    const conf = card.querySelector('.lc-conf') as HTMLElement | null;
    if (conf) {
      const p = Math.max(0, Math.min(1, r.conf));
      conf.textContent = p > 0.72 ? 'model · good' : p > 0.45 ? 'model · check' : 'model · rough';
      conf.dataset.v = String(Math.round(p * 100));
    }
    paintPreview(true);
  });
}

function readSelection(): { text: string; latex: string; confidence: number } | null {
  if (!current) return null;
  const read = readInk(current.strokes, { math: true });
  return read;
}

function openCard(mode: Mode) {
  buildCard();
  if (!card || !current) return;
  const read = readInk(current.strokes, { math: mode === 'latex' });
  card.dataset.mode = mode;
  card.querySelectorAll<HTMLElement>('.lc-tab').forEach((t) => t.classList.toggle('on', t.dataset.m === mode));
  (card.querySelector('.lc-area') as HTMLTextAreaElement).value = mode === 'latex' ? read.latex : read.text;
  const conf = card.querySelector('.lc-conf') as HTMLElement;
  conf.textContent = confLabel(read.confidence);
  conf.dataset.v = String(Math.round(read.confidence * 100));
  paintPreview(true);
  if (mode === 'latex') refineWithModel(++cardSeq);

  const at = toScreen(current.box[0], current.box[3]);
  card.classList.add('on');
  const r = card.getBoundingClientRect();
  let x = at.x;
  let y = at.y + 12;
  if (x + r.width > window.innerWidth - 10) x = window.innerWidth - r.width - 10;
  if (y + r.height > window.innerHeight - 10) y = Math.max(10, at.y - r.height - 12);
  card.style.left = Math.max(8, Math.round(x)) + 'px';
  card.style.top = Math.round(y) + 'px';
  window.setTimeout(() => (card!.querySelector('.lc-area') as HTMLTextAreaElement).focus(), 40);
}

function closeCard() {
  // invalidates any model answer still in flight
  cardSeq++;
  card?.classList.remove('on');
}

/* ------------------------------------------------------------------ */
/* Insert                                                              */
/* ------------------------------------------------------------------ */

function insert() {
  if (!card || !current) return;
  const area = card.querySelector('.lc-area') as HTMLTextAreaElement;
  const txt = area.value.trim();
  if (!txt) return;
  const mode = (card.dataset.mode as Mode) || 'text';
  const box = current.box;
  const height = Math.max(16, box[3] - box[1]);
  const size = Math.round(Math.max(16, Math.min(64, height * 0.95)));
  const font = mode === 'latex' ? 'courier' : 'kalam';

  ev(`(function(){
    try{
      snap();
      var selArr = sel || [];
      pg().strokes = pg().strokes.filter(function(s){ return selArr.indexOf(s) < 0; });
      pg().strokes.push({
        t:'text', c: color, s: ${size},
        x: ${JSON.stringify(box[0])}, y: ${JSON.stringify(box[1])},
        txt: ${JSON.stringify(txt)}, f: ${JSON.stringify(font)}
      });
      sel = []; draw(); save(); thumbs();
    }catch(e){}
  })()`);

  closeCard();
  current = null;
  hidePill();
}

/* ------------------------------------------------------------------ */
/* Watching the selection                                              */
/* ------------------------------------------------------------------ */

function hidePill() {
  pill?.classList.remove('on');
}

function tick() {
  const ed = document.getElementById('ed');
  const open = !!ed && getComputedStyle(ed).display !== 'none';
  if (!open) {
    hidePill();
    closeCard();
    lastSig = '';
    return;
  }

  const items = selInk();
  if (!items.length) {
    hidePill();
    if (card?.classList.contains('on')) closeCard();
    lastSig = '';
    current = null;
    return;
  }

  const box = boxOf(items);
  const sig = `${items.length}:${Math.round(box[0])}:${Math.round(box[1])}:${Math.round(box[2])}:${Math.round(box[3])}`;
  if (sig === lastSig) return;
  lastSig = sig;

  current = {
    strokes: items.map((s) => ({ p: s.p.map((q: number[]) => [q[0], q[1]]), w: s.w })),
    box,
    count: items.length,
  };

  buildPill();
  if (!pill) return;

  // With every conversion switched off there is nothing to offer, so the pill
  // never appears. That is the default: select ink and you get the engine's own
  // bar (duplicate / delete / animate), not an offer to read your writing.
  const canText = smartOn('toText');
  const canTex = smartOn('toLatex');
  if (!canText && !canTex) {
    hidePill();
    return;
  }

  const likeness = textLikeness(items, box);
  const textBtn = pill.querySelector('.lp-text') as HTMLElement | null;
  if (textBtn) {
    textBtn.style.display = canText ? '' : 'none';
    const label = textBtn.querySelector('.lp-lb') as HTMLElement | null;
    if (label) label.textContent = likeness > 0.5 ? 'Text' : 'Convert';
  }
  const latex = pill.querySelector('.lp-latex') as HTMLElement | null;
  // a drawing is unlikely to be a formula, unless LaTeX is the only way in
  if (latex) latex.style.display = canTex && (likeness > 0.35 || !canText) ? '' : 'none';

  const top = toScreen((box[0] + box[2]) / 2, box[1]);
  pill.classList.add('on');
  const r = pill.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - r.width - 8, top.x - r.width / 2));
  const y = Math.max(8, top.y - r.height - 10);
  pill.style.left = Math.round(x) + 'px';
  pill.style.top = Math.round(y) + 'px';
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#lasso-pill{
  position:fixed;z-index:44;display:none;align-items:center;gap:2px;
  background:var(--sf,#fff);border:1px solid var(--bd,#d9d9de);border-radius:11px;
  box-shadow:0 10px 26px rgba(8,20,38,.18);padding:3px;font:12px/1 var(--slate-font);
}
#lasso-pill.on{display:flex}
#lasso-pill .lp-b{
  display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--tx,#1c1c1e);
  border-radius:8px;padding:4px 8px;cursor:pointer;font:600 11.5px/1 var(--slate-font);
}
#lasso-pill .lp-b:hover{background:color-mix(in srgb,var(--ac,#2f6df6) 12%,transparent);color:var(--ac,#2f6df6)}
#lasso-pill .lp-ic{
  font:700 11px/1 var(--slate-font-mono);color:var(--ac,#2f6df6);
  background:color-mix(in srgb,var(--ac,#2f6df6) 13%,transparent);border-radius:5px;padding:3px 4px;
}
#lasso-pill .lp-copy{color:var(--mu,#6e6e73);font-size:12px}

#lasso-card{
  position:fixed;z-index:56;display:none;width:min(360px,calc(100vw - 20px));
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);
  border:1px solid var(--bd,#d9d9de);border-radius:14px;
  box-shadow:0 18px 44px rgba(8,20,38,.24);padding:11px;
  font:13px/1.35 var(--slate-font);opacity:0;transform:translateY(6px) scale(.98);
  transition:opacity .15s ease,transform .15s ease;
}
#lasso-card.on{display:block;opacity:1;transform:none}
#lasso-card .lc-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
#lasso-card .lc-title{font-size:12.5px;flex:1}
#lasso-card .lc-conf{
  font:600 9.5px/1 var(--slate-font-mono);letter-spacing:.04em;text-transform:uppercase;
  color:#2a9d4f;background:rgba(42,157,79,.12);border-radius:999px;padding:4px 7px;
}
#lasso-card .lc-conf[data-v="1"]{color:#b06a00;background:rgba(244,163,0,.14)}
#lasso-card .lc-conf[data-v="2"]{color:#c94b4b;background:rgba(229,56,59,.12)}
#lasso-card .lc-x{border:0;background:transparent;cursor:pointer;color:var(--mu,#6e6e73);font-size:13px;padding:2px 4px}
#lasso-card .lc-tabs{display:flex;align-items:center;gap:4px;margin-bottom:7px}
#lasso-card .lc-tab{
  border:1px solid var(--bd,#d9d9de);background:transparent;border-radius:8px;
  font:600 11px/1 var(--slate-font);padding:4px 9px;cursor:pointer;color:var(--mu,#6e6e73);
}
#lasso-card .lc-tab.on{background:color-mix(in srgb,var(--ac,#2f6df6) 13%,transparent);border-color:var(--ac,#2f6df6);color:var(--ac,#2f6df6)}
#lasso-card .lc-hint{margin-left:auto;font-size:10.5px;color:var(--mu,#6e6e73)}
#lasso-card .lc-area{
  width:100%;min-height:64px;max-height:180px;resize:vertical;
  font:13px/1.45 var(--slate-font-mono);
  padding:8px;border-radius:9px;border:1px solid var(--bd,#d9d9de);
  background:var(--bg,#e6e9ef);color:var(--tx,#1c1c1e);outline:none;
}
#lasso-card[data-mode=latex] .lc-area{font-family:var(--slate-font-mono)}

/* the rendered formula — without it the LaTeX tab is just punctuation */
#lasso-card .lc-prev{
  display:none;margin-top:7px;padding:10px 12px;border-radius:9px;
  border:1px dashed color-mix(in srgb,var(--bd,#d9d9de) 80%,transparent);
  background:color-mix(in srgb,var(--sf,#fff) 70%,transparent);
  color:var(--tx,#1c1c1e);overflow-x:auto;overflow-y:hidden;
  min-height:34px;line-height:1.2;
}
#lasso-card[data-mode=latex] .lc-prev{display:block}
#lasso-card .lc-prev:empty{display:none}
#lasso-card .lc-prev .katex{font-size:1.12em}
#lasso-card .lc-prev .lc-raw{
  font:12px/1.4 var(--slate-font-mono);color:var(--mu,#6e6e73);
}
#lasso-card .lc-foot{display:flex;align-items:center;gap:8px;margin-top:8px}
#lasso-card .lc-note{font-size:10.5px;color:var(--mu,#6e6e73);flex:1;line-height:1.35}
#lasso-card .lc-btns{display:flex;gap:6px}
#lasso-card .lc-btns button{
  font-size:11.5px;padding:4px 10px;border-radius:8px;border:1px solid var(--bd,#d9d9de);
  background:transparent;color:var(--tx,#1c1c1e);cursor:pointer;
}
#lasso-card .lc-insert{background:var(--ac,#2f6df6)!important;border-color:var(--ac,#2f6df6)!important;color:#fff!important}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  buildPill();
  const style = document.createElement('style');
  style.id = 'lasso-style';
  style.textContent = CSS;
  document.head.append(style);

  window.setInterval(tick, 260);

  // switching the features off must take the pill away immediately
  onSmartChange(() => {
    if (!smartOn('toText') && !smartOn('toLatex')) {
      hidePill();
      closeCard();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCard();
    }
  });

  (window as any).__inkpad_lasso = {
    read: () => readSelection(),
    open: openCard,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
