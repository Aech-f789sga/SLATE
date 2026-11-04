/**
 * Auto calculation — write an equation, get an answer.
 *
 * Two ways in:
 *
 *   • the text tool, when a line ends in "=",
 *   • the pen, when the ink ends in an equals sign (the "=" is found by the
 *     same on-device recogniser the lasso uses).
 *
 * Either way a small card appears beside the work with the answer. It is a
 * suggestion, not a modal: start doodling, tap the page, or ignore it for a few
 * seconds and it leaves on its own. "Insert" turns the answer into a text
 * object so it becomes part of the page.
 *
 * The maths itself lives in ./math/core — this file is only the trigger, the
 * settings and the card.
 */

import { calculate, type AngleMode, type CalcOptions, type CalcResult } from './math/core';
import { endsWithEquals, readInk, type InkStroke } from './math/ocr';

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
/* Settings                                                            */
/* ------------------------------------------------------------------ */

interface Settings extends CalcOptions {
  auto: boolean;
  /** Also watch ink, not just the text tool. */
  ink: boolean;
}

const KEY = 'inkpad-calc';

const settings: Settings = {
  mode: 'rad',
  exact: true,
  decimals: 8,
  units: true,
  auto: true,
  ink: true,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.mode === 'deg' || s.mode === 'rad') settings.mode = s.mode;
    if (typeof s.exact === 'boolean') settings.exact = s.exact;
    if (Number(s.decimals) >= 2 && Number(s.decimals) <= 12) settings.decimals = Number(s.decimals);
    if (typeof s.units === 'boolean') settings.units = s.units;
    if (typeof s.auto === 'boolean') settings.auto = s.auto;
    if (typeof s.ink === 'boolean') settings.ink = s.ink;
  } catch {
    /* defaults */
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* The card                                                            */
/* ------------------------------------------------------------------ */

let pop: HTMLElement | null = null;
let popTimer = 0;
let lastKey = '';
let lastResult: { text: string; latex?: string } | null = null;
let anchor: { x: number; y: number } = { x: 0, y: 0 };

function buildPop() {
  if (pop) return;
  pop = el('div');
  pop.id = 'calc-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Calculation result');
  pop.innerHTML = `
    <div class="cp-top"><span class="cp-tag">=</span><span class="cp-expr"></span></div>
    <div class="cp-res"></div>
    <div class="cp-note"></div>
    <div class="cp-acts">
      <button class="cp-insert" type="button">Insert</button>
      <button class="cp-copy" type="button">Copy</button>
      <button class="cp-latex" type="button">LaTeX</button>
      <button class="cp-x" type="button" aria-label="Dismiss">✕</button>
    </div>`;
  document.body.append(pop);

  (pop.querySelector('.cp-x') as HTMLElement).onclick = hide;
  (pop.querySelector('.cp-insert') as HTMLElement).onclick = () => insert(lastResult?.text ?? '');
  (pop.querySelector('.cp-copy') as HTMLElement).onclick = () => {
    if (!lastResult) return;
    navigator.clipboard?.writeText(lastResult.text).then(
      () => flash('Copied'),
      () => flash('Copy failed')
    );
  };
  (pop.querySelector('.cp-latex') as HTMLElement).onclick = () => {
    if (!lastResult?.latex) return;
    navigator.clipboard?.writeText(lastResult.latex).then(
      () => flash('LaTeX copied'),
      () => flash('Copy failed')
    );
  };

  // any gesture elsewhere dismisses it, which is the "ignore and keep working" path
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!pop || !pop.classList.contains('on')) return;
      const t = e.target as HTMLElement;
      if (pop.contains(t)) return;
      hide();
    },
    true
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}

function flash(msg: string) {
  const n = pop?.querySelector('.cp-note') as HTMLElement | null;
  if (!n) return;
  n.textContent = msg;
  n.classList.add('on');
  window.setTimeout(() => n.classList.remove('on'), 1200);
}

function hide() {
  pop?.classList.remove('on');
  window.clearTimeout(popTimer);
}

function show(res: CalcResult, expr: string, at: { x: number; y: number }) {
  buildPop();
  if (!pop) return;
  lastResult = { text: res.text, latex: res.latex };

  const exprNode = pop.querySelector('.cp-expr') as HTMLElement;
  const resNode = pop.querySelector('.cp-res') as HTMLElement;
  const noteNode = pop.querySelector('.cp-note') as HTMLElement;

  exprNode.textContent = expr.replace(/\s*=\s*$/, '');
  resNode.textContent = res.ok ? res.text : res.error || 'Could not read that';
  resNode.classList.toggle('bad', !res.ok);
  noteNode.textContent = res.note || '';
  noteNode.classList.toggle('on', !!res.note);
  (pop.querySelector('.cp-latex') as HTMLElement).style.display = res.latex ? '' : 'none';
  (pop.querySelector('.cp-insert') as HTMLElement).style.display = res.ok ? '' : 'none';

  anchor = at;
  pop.classList.add('on');
  place(at);

  window.clearTimeout(popTimer);
  popTimer = window.setTimeout(hide, 9000);
}

function place(at: { x: number; y: number }) {
  if (!pop) return;
  const r = pop.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = at.x + 16;
  let y = at.y + 16;
  if (x + r.width > vw - 10) x = Math.max(10, at.x - r.width - 16);
  if (y + r.height > vh - 10) y = Math.max(10, at.y - r.height - 16);
  pop.style.left = Math.round(x) + 'px';
  pop.style.top = Math.round(y) + 'px';
}

/* ------------------------------------------------------------------ */
/* Inserting the answer                                                */
/* ------------------------------------------------------------------ */

function insert(text: string) {
  if (!text) return;
  const x = anchor.x;
  const y = anchor.y;
  ev(`(function(){
    try{
      var pageX = ${x}, pageY = ${y};
      snap();
      pg().strokes.push({ t:'text', c: color, s: 26, x: pageX, y: pageY, txt: ${JSON.stringify(text)}, f: 'arial' });
      draw(); save(); thumbs();
    }catch(e){}
  })()`);
  hide();
}

/** Convert a client point into page units. */
function toPage(clientX: number, clientY: number): { x: number; y: number } {
  const cv = document.getElementById('cv') as HTMLCanvasElement | null;
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return { x: clientX, y: clientY };
  const r = cv.getBoundingClientRect();
  return { x: ((clientX - r.left) / (r.width || 1)) * W, y: ((clientY - r.top) / (r.height || 1)) * H };
}

/* ------------------------------------------------------------------ */
/* Trigger 1 — the text tool                                           */
/* ------------------------------------------------------------------ */

function hookText() {
  ev(`(function(){
    if (window.__calcTextHooked) return;
    window.__calcTextHooked = true;
    var orig = commitText;
    commitText = function(){
      var raw = '';
      try { raw = (document.getElementById('tx') || {}).value || ''; } catch(e){}
      var r = orig.apply(this, arguments);
      try {
        if (raw && /=\\s*$/.test(raw.trim()) && window.__calcOffer) window.__calcOffer(raw, null);
      } catch(e){}
      return r;
    };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Trigger 2 — ink ending in "="                                       */
/* ------------------------------------------------------------------ */

let inkTimer = 0;

function onStrokeEnd() {
  if (!settings.auto || !settings.ink) return;
  window.clearTimeout(inkTimer);
  inkTimer = window.setTimeout(inspectInk, 320);
}

/**
 * Look at the tail of the page: if the last few strokes form a short line of
 * ink ending in "=", read them and offer the answer.
 */
function inspectInk() {
  if (ev<string>('tool') !== 'pen') return;
  const strokes = ev<any[]>('pg().strokes');
  if (!strokes || strokes.length < 2) return;

  const ink = strokes.filter((s) => s && s.t === 'pen' && Array.isArray(s.p) && s.p.length);
  if (ink.length < 2) return;
  const tail = ink.slice(-9);

  // a rough band check: everything on the same line of writing
  let y0 = Infinity;
  let y1 = -Infinity;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const s of tail) {
    for (const q of s.p) {
      if (q[1] < y0) y0 = q[1];
      if (q[1] > y1) y1 = q[1];
      if (q[0] < x0) x0 = q[0];
      if (q[0] > x1) x1 = q[0];
    }
  }
  if (y1 - y0 > 120 || x1 - x0 < 20) return;

  const input: InkStroke[] = tail.map((s) => ({ p: s.p.map((q: number[]) => [q[0], q[1]]), w: s.w }));
  let ends = false;
  try {
    ends = endsWithEquals(input);
  } catch {
    ends = false;
  }
  if (!ends) {
    // cheaper fallback: the very last stroke is two short horizontal bars
    const last = tail[tail.length - 1];
    const b = bbox(last.p);
    const w = b[2] - b[0];
    const h = b[3] - b[1];
    ends = w > h * 1.6 && h < 10;
  }
  if (!ends) return;

  const key = `${tail.length}:${Math.round(x1)}:${Math.round(y1)}:${ink.length}`;
  if (key === lastKey) return;
  lastKey = key;

  const read = readInk(input, { math: true });
  if (!read.text || !/=$/.test(read.text.trim())) return;

  const res = calculate(read.text, settings);
  const cv = document.getElementById('cv');
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  const sx = r.left + (x1 / W) * r.width;
  const sy = r.top + (y1 / H) * r.height;
  const page = toPage(sx, sy);
  show(res, read.text, { x: sx, y: sy });
  anchor = page;
}

function bbox(pts: number[][]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of pts) {
    if (q[0] < x0) x0 = q[0];
    if (q[1] < y0) y0 = q[1];
    if (q[0] > x1) x1 = q[0];
    if (q[1] > y1) y1 = q[1];
  }
  return [x0, y0, x1, y1];
}

/* ------------------------------------------------------------------ */
/* Settings section                                                    */
/* ------------------------------------------------------------------ */

function chip(g: HTMLElement, label: string, on: boolean, fn: () => void) {
  const b = el('button', '', label) as HTMLButtonElement;
  b.style.cssText =
    'font-size:12px;padding:4px 9px;border-radius:9px;border:1px solid ' +
    (on ? 'var(--ac)' : 'var(--bd)') +
    ';background:' +
    (on ? 'color-mix(in srgb,var(--ac) 14%,transparent)' : 'transparent') +
    ';color:' +
    (on ? 'var(--ac)' : 'var(--tx)') +
    ';cursor:pointer';
  b.onclick = fn;
  g.append(b);
  return b;
}

function group(d: HTMLElement, title: string) {
  d.append(el('div', 'font-weight:600;margin:10px 0 4px;font-size:12px;color:var(--mu)', title));
  const g = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center');
  d.append(g);
  return g;
}

function installSettings() {
  ev(`(function(){
    if (window.__calcSettingsHooked) return;
    window.__calcSettingsHooked = true;
    var orig = fillSet;
    fillSet = function(d){
      orig(d);
      try { window.__calcSettings(d); } catch(e){}
    };
  })()`);
}

function calcSettings(d: HTMLElement) {
  d.append(el('div', 'height:1px;background:var(--bd);margin:12px 0 2px'));

  const ang = group(d, 'Angles');
  (['rad', 'deg'] as AngleMode[]).forEach((m) => {
    chip(ang, m === 'rad' ? 'Radians' : 'Degrees', settings.mode === m, () => {
      settings.mode = m;
      save();
      rebuild(d);
    });
  });

  const on = group(d, 'Auto calculation');
  chip(on, settings.auto ? 'On' : 'Off', settings.auto, () => {
    settings.auto = !settings.auto;
    save();
    rebuild(d);
  });
  chip(on, settings.ink ? 'Watch ink' : 'Text only', settings.ink, () => {
    settings.ink = !settings.ink;
    save();
    rebuild(d);
  });

  const form = group(d, 'Answers');
  chip(form, settings.exact ? 'Exact' : 'Decimal', settings.exact, () => {
    settings.exact = !settings.exact;
    save();
    rebuild(d);
  });
  [4, 6, 8, 10].forEach((n) => {
    chip(form, `${n} dp`, settings.decimals === n, () => {
      settings.decimals = n;
      save();
      rebuild(d);
    });
  });

  const units = group(d, 'Units');
  chip(units, settings.units ? 'Convert units' : 'Numbers only', settings.units, () => {
    settings.units = !settings.units;
    save();
    rebuild(d);
  });

  d.append(
    el(
      'div',
      'color:var(--mu);font-size:11.5px;margin-top:8px;line-height:1.45',
      'Write an expression and finish it with “=”. Works on trig identities, equations in x, and units such as “5 cm to in”.'
    )
  );
}

function rebuild(d: HTMLElement) {
  const scroll = d.scrollTop;
  const fill = ev<any>('fillSet');
  if (typeof fill !== 'function') return;
  d.innerHTML = '';
  fill(d);
  d.scrollTop = scroll;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#calc-pop{
  position:fixed;z-index:58;display:none;min-width:180px;max-width:min(320px,86vw);
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);
  border:1px solid var(--bd,#d9d9de);border-radius:14px;
  box-shadow:0 16px 40px rgba(8,20,38,.22),0 2px 6px rgba(8,20,38,.08);
  padding:10px 12px 9px;font:13px/1.35 inherit;
  opacity:0;transform:translateY(4px) scale(.98);
  transition:opacity .14s ease,transform .14s ease;
}
#calc-pop.on{display:block;opacity:1;transform:none}
#calc-pop .cp-top{display:flex;align-items:baseline;gap:7px;min-width:0}
#calc-pop .cp-tag{
  width:16px;height:16px;border-radius:5px;background:color-mix(in srgb,var(--ac,#2f6df6) 14%,transparent);
  color:var(--ac,#2f6df6);font:700 11px/16px ui-monospace,monospace;text-align:center;flex:none;
}
#calc-pop .cp-expr{
  font:12px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mu,#6e6e73);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;
}
#calc-pop .cp-res{
  font:600 21px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;
  margin:5px 0 1px;letter-spacing:-.01em;word-break:break-word;
}
#calc-pop .cp-res.bad{font-size:14px;font-weight:500;color:#c94b4b}
#calc-pop .cp-note{
  font-size:11px;color:var(--mu,#6e6e73);max-height:0;overflow:hidden;opacity:0;
  transition:opacity .12s ease,max-height .12s ease;
}
#calc-pop .cp-note.on{max-height:60px;opacity:1;margin-top:2px}
#calc-pop .cp-acts{display:flex;gap:6px;margin-top:8px;align-items:center}
#calc-pop .cp-acts button{
  font-size:11.5px;padding:3px 9px;border-radius:8px;border:1px solid var(--bd,#d9d9de);
  background:transparent;color:var(--tx,#1c1c1e);cursor:pointer;
}
#calc-pop .cp-acts button:hover{border-color:var(--ac,#2f6df6);color:var(--ac,#2f6df6)}
#calc-pop .cp-insert{
  background:var(--ac,#2f6df6)!important;border-color:var(--ac,#2f6df6)!important;color:#fff!important;
}
#calc-pop .cp-x{margin-left:auto;border:0!important;color:var(--mu,#6e6e73)!important;padding:2px 4px!important}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  load();
  buildPop();
  hookText();
  installSettings();

  const style = document.createElement('style');
  style.id = 'calc-style';
  style.textContent = CSS;
  document.head.append(style);

  // offered by the text tool through eval
  (window as any).__calcOffer = (raw: string, at: { x: number; y: number } | null) => {
    if (!settings.auto) return;
    const text = String(raw).trim();
    if (!/=$/.test(text)) return;
    const res = calculate(text, settings);
    const pos = at ?? caret();
    show(res, text, pos);
    anchor = toPage(pos.x, pos.y);
  };
  (window as any).__calcSettings = calcSettings;
  (window as any).__calc = { settings, calculate: (s: string) => calculate(s, settings) };

  const cv = document.getElementById('cv');
  if (cv) cv.addEventListener('pointerup', onStrokeEnd, true);
  window.setInterval(() => {
    const c = document.getElementById('cv');
    if (c && !(c as any).__calcHooked) {
      (c as any).__calcHooked = true;
      c.addEventListener('pointerup', onStrokeEnd, true);
    }
  }, 700);
}

/** Where the text box was, so the card appears next to it. */
function caret(): { x: number; y: number } {
  const tx = document.getElementById('tx') as HTMLTextAreaElement | null;
  if (tx && tx.style.display !== 'none') {
    const r = tx.getBoundingClientRect();
    return { x: r.right, y: r.top + r.height / 2 };
  }
  // The text tool commits before it asks, so the caret is already gone. Anchor
  // to the text object it just wrote instead of dropping the card mid-screen.
  const strokes = ev<any[]>('pg().strokes') || [];
  const cv = document.getElementById('cv');
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s && s.t === 'text' && cv) {
      const W = ev<number>('W') || 800;
      const H = ev<number>('H') || 1100;
      const r = cv.getBoundingClientRect();
      return { x: r.left + (s.x / W) * r.width, y: r.top + (s.y / H) * r.height };
    }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
