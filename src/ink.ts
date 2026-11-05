/**
 * Ink — the GoodNotes-style pen, colour and eraser panels.
 *
 * The engine already implements every ink control we need, but hides them as
 * raw inputs in the secondary toolbar: a `<select id="pt">` for the pen type, a
 * range plus number for thickness, a range plus number for "Predictive"
 * (stroke stabilization), a swatch strip and a native colour input.
 *
 * This module keeps all of those as the source of truth and puts a GoodNotes
 * sub-toolbar in front of them:
 *
 *   • pen panel   — six pen types, three thicknesses, six colours, a custom slot
 *   • colour      — Presets / Custom / Recent, with an HSB wheel and saved customs
 *   • pen settings— the predictive slider, pressure preset and exact thickness
 *   • eraser      — three sizes plus a settings popover (highlighter-only,
 *                   tape-only, clear page, auto-deselect)
 *
 * Nothing here re-implements drawing: the panels write to the engine's own
 * controls (`#pt`, `#size`, `setBrush`, `setCol`, `SMO`) so undo, layers,
 * thumbnails and export all keep working.
 *
 * Thickness is the exception to "the engine is the source of truth": one nib is
 * described in three places (the pill's dots, the popover's slider, the dock's
 * millimetres), so the number lives in `./widths` and this module only presents
 * it. See the note at the top of that file.
 */

import {
  adopt,
  activeTool,
  applyActive,
  engineTool,
  isInkTool,
  mmLabel,
  mmOf,
  onWidth,
  resetSteps,
  setSteps,
  setWidth,
  steps,
  unitsOf,
  width,
  type InkTool,
} from './widths';

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

function cls<T extends HTMLElement>(node: T, className: string): T {
  node.className = className;
  return node;
}

function sec(title: string): HTMLElement {
  return cls(el('div', '', title), 'sec');
}

function ls(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
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
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

function hsbToHex(h: number, s: number, b: number): string {
  const l = (b / 100) * (1 - s / 200);
  const sat = l === 0 || l === 1 ? 0 : (b / 100 - l) / Math.min(l, 1 - l);
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    bl = 0;
  if (hp < 1) [r, g, bl] = [c, x, 0];
  else if (hp < 2) [r, g, bl] = [x, c, 0];
  else if (hp < 3) [r, g, bl] = [0, c, x];
  else if (hp < 4) [r, g, bl] = [0, x, c];
  else if (hp < 5) [r, g, bl] = [x, 0, c];
  else [r, g, bl] = [c, 0, x];
  const to = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v + m)) * 255)
      .toString(16)
      .padStart(2, '0');
  return '#' + to(r) + to(g) + to(bl);
}

function hexToHsb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [210, 80, 20];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  return [h, s, max * 100];
}

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

const HUES = [0, 28, 48, 78, 150, 196, 222, 268, 322];
const TONES = [82, 68, 55, 42, 30];

function presetPalette(): string[] {
  const out: string[] = [];
  for (const l of TONES) for (const h of HUES) out.push(hsbToHex(h, l > 75 ? 70 : 86, l));
  ['#ffffff', '#e8e8e8', '#cccccc', '#a0a0a0', '#7a7a7a', '#585858', '#383838', '#1c1c1c', '#000000'].forEach(
    (c) => out.push(c),
  );
  return out;
}

const PRESETS = presetPalette();

const RECENT_KEY = 'inkpad-recent-colors';
const SAVED_KEY = 'inkpad-saved-colors';

function readList(key: string): string[] {
  try {
    const raw = JSON.parse(ls(key, '[]'));
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

function pushList(key: string, hex: string, max: number) {
  const list = readList(key).filter((c) => c.toLowerCase() !== hex.toLowerCase());
  list.unshift(hex);
  lsSet(key, JSON.stringify(list.slice(0, max)));
}

/* ------------------------------------------------------------------ */
/* Pen types                                                           */
/* ------------------------------------------------------------------ */

const PEN_TYPES: { v: string; label: string; tip: string }[] = [
  { v: 'ball', label: 'Ball Pen', tip: 'Even, everyday line' },
  { v: 'fountain', label: 'Fountain', tip: 'Tapered nib, pressure aware' },
  { v: 'brush', label: 'Brush', tip: 'Soft, expressive swell' },
  { v: 'pencil', label: 'Pencil', tip: 'Grainy graphite' },
  { v: 'crayon', label: 'Crayon', tip: 'Waxy, broken edge' },
  { v: 'marker', label: 'Marker', tip: 'Wide translucent stroke' },
];

/**
 * The pill's three dots are levels, not constants: `./widths` owns them so the
 * settings sheet can rewrite them. This is the shape of the row the pill paints.
 */
const DOTS = ['Thin', 'Medium', 'Thick'];

/** How a nib is named in the settings sheet. */
const TOOL_NAME: Record<InkTool, string> = {
  pen: 'Pen',
  pe: 'Pixel eraser',
  hl: 'Highlighter',
  er: 'Eraser',
};

/* ------------------------------------------------------------------ */
/* Shared state                                                        */
/* ------------------------------------------------------------------ */

let lastTool = '';
let lastOpen = false;
let penPanel: HTMLElement | null = null;
let colorPop: HTMLElement | null = null;
let penSheet: HTMLElement | null = null;
let erSheet: HTMLElement | null = null;
let popAnchor: HTMLElement | null = null;

let eraserMode: 'all' | 'hl' | 'tape' = (ls('inkpad-eraser-mode', 'all') as any) || 'all';
let autoDeselect = ls('inkpad-auto-deselect', '0') === '1';

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#ink-pen{
  position:fixed;z-index:28;display:none;align-items:center;gap:2px;
  padding:6px 7px;border-radius:16px;background:#fff;
  box-shadow:0 8px 26px rgba(8,20,38,.20),0 1px 3px rgba(8,20,38,.10);
  border:1px solid #eef1f6;
}
#ink-pen.on{display:flex}
#ink-pen .grp{display:flex;align-items:center;gap:2px}
#ink-pen .div{width:1px;height:22px;background:#eceff4;margin:0 5px;flex:none}
#ink-pen button{
  border:0!important;background:transparent!important;padding:0!important;margin:0;
  width:32px;height:32px;border-radius:10px;cursor:pointer;display:grid;place-items:center;
  color:#3c4654;flex:none;transition:background .12s ease,color .12s ease;
}
#ink-pen button:hover{background:#f2f5fa}
#ink-pen button.on{background:#e3edff!important;color:#1f4fbf}
/* A selected swatch is shown by the ring around it, never by repainting it:
   the button.on rule is a more specific selector than .sw, so it used to win
   and the colour you were holding became a pale blue circle that named
   nothing. */
#ink-pen button.sw.on{background:var(--swc,#111)!important}
#ink-pen button svg{width:19px;height:19px;display:block}
#ink-pen .w{display:grid;place-items:center}
#ink-pen .w i{display:block;border-radius:999px;background:currentColor}
/* a width between levels: hint at the nearest one without claiming it */
#ink-pen .w.near{background:#f5f8fd}
#ink-pen .w.near i{opacity:.45}
/* The eraser's continuous thickness. The three dots are levels; this is the
   space between them, and it writes through setWidth so the dock's eraser and
   the engine's own size follow the same number. */
#ink-pen .wsl{
  -webkit-appearance:none;appearance:none;flex:none;
  width:84px;height:3px;border-radius:2px;margin:0 3px;cursor:pointer;
  background:color-mix(in srgb, currentColor 24%, transparent);
}
#ink-pen .wsl::-webkit-slider-thumb{
  -webkit-appearance:none;width:13px;height:13px;border-radius:50%;
  background:currentColor;border:2px solid #fff;
  box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;
}
#ink-pen .wsl::-moz-range-thumb{
  width:13px;height:13px;border-radius:50%;background:currentColor;
  border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;
}
#ink-pen .sw{
  width:22px!important;height:22px!important;border-radius:50%!important;
  background:var(--swc,#111)!important;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);flex:none;
}
#ink-pen .sw.on{box-shadow:inset 0 0 0 1px rgba(0,0,0,.12),0 0 0 2px #fff,0 0 0 3.5px #2f6df6}
.ink-sheet .sw{
  width:22px!important;height:22px!important;border-radius:50%!important;padding:0!important;
  border:0!important;background:var(--swc,#111)!important;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);flex:none;cursor:pointer;
}
.ink-sheet .sw.on{box-shadow:inset 0 0 0 1px rgba(0,0,0,.12),0 0 0 2px #fff,0 0 0 3.5px #2f6df6}
.ink-sheet .swplus{
  width:24px!important;height:24px!important;border-radius:50%!important;padding:0!important;
  border:0!important;background:conic-gradient(#f66,#fc6,#6c6,#6cf,#c6f,#f66)!important;
  box-shadow:inset 0 0 0 2px #fff,0 0 0 1px #d7dce5;
  display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px;cursor:pointer;
}
#ink-pen .swplus{
  width:24px!important;height:24px!important;border-radius:50%!important;
  background:conic-gradient(#f66,#fc6,#6c6,#6cf,#c6f,#f66)!important;
  box-shadow:inset 0 0 0 2px #fff,0 0 0 1px #d7dce5;
  display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px;
}

/* ---- popovers ---- */
#ink-pop{
  position:fixed;z-index:34;display:none;background:#fff;border-radius:16px;
  border:1px solid #eaeef5;box-shadow:0 18px 46px rgba(8,20,38,.26);
  padding:12px;color:#1c2430;
  /* 9 swatches + 8 gaps + padding, but never wider than the screen */
  width:270px;max-width:calc(100vw - 16px);box-sizing:border-box;
}
#ink-pop.on{display:block}
#ink-pop .ttl{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
#ink-pop .ttl b{font-size:13.5px;font-weight:700;letter-spacing:.01em}
#ink-pop .ttl a{font-size:12.5px;color:#2f6df6;cursor:pointer;font-weight:600}
#ink-pop .tabs{display:flex;gap:2px;background:#f1f3f7;border-radius:9px;padding:2px;margin-bottom:10px}
#ink-pop .tabs button{
  border:0;background:transparent;border-radius:7px;padding:6px 10px;font-size:12px;
  font-weight:600;color:#66707d;cursor:pointer;flex:1;
}
#ink-pop .tabs button.on{background:#fff;color:#1f3a63;box-shadow:0 1px 3px rgba(16,32,64,.16)}
/* fluid columns: the swatches shrink with the box instead of spilling out of it */
#ink-pop .grid{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px}
#ink-pop .grid button{
  width:100%;aspect-ratio:1;height:auto;border-radius:50%;border:0;padding:0;cursor:pointer;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.10);
}
#ink-pop .grid button.on{box-shadow:inset 0 0 0 1px rgba(0,0,0,.10),0 0 0 2px #fff,0 0 0 3.5px #2f6df6}
#ink-pop .empty{font-size:12px;color:#8b95a3;padding:14px 2px;text-align:center}

/* HSB wheel */
#ink-wheel{position:relative;width:176px;height:176px;margin:2px auto 8px}
#ink-wheel canvas{position:absolute;inset:0;width:176px;height:176px}
#ink-sq{
  position:absolute;left:50%;top:50%;width:84px;height:84px;margin:-42px 0 0 -42px;
  border-radius:8px;cursor:crosshair;box-shadow:0 0 0 1px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.18);
  touch-action:none;
}
#ink-sq i{
  position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;
  border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none;
}
#ink-hex{
  display:flex;align-items:center;gap:8px;justify-content:center;font-size:12px;color:#66707d;
}
#ink-hex code{font:600 12px ui-monospace,Menlo,monospace;color:#1c2430}
#ink-hex button{
  border:1px solid #e2e7ef;background:#fff;border-radius:8px;padding:5px 10px;
  font-size:12px;font-weight:600;color:#2f6df6;cursor:pointer;
}

/* sheets (pen + eraser settings) */
.ink-sheet{
  position:fixed;z-index:34;display:none;width:290px;background:#fff;border-radius:16px;
  border:1px solid #eaeef5;box-shadow:0 18px 46px rgba(8,20,38,.26);color:#1c2430;overflow:hidden;
}
.ink-sheet.on{display:block}
.ink-sheet .hd{padding:13px 16px 10px;font-size:13.5px;font-weight:700;text-align:center;border-bottom:1px solid #f1f3f7}
.ink-sheet .hd-tabs{display:flex;gap:4px;padding:8px;justify-content:center}
.ink-sheet .hd-tab{
  flex:1;max-width:130px;padding:7px 10px;border:0;border-radius:9px;background:transparent;
  font:600 12.5px/1 inherit;color:#69747f;cursor:pointer;transition:background .14s,color .14s;
}
.ink-sheet .hd-tab:hover{background:#f2f5fa;color:#3a4450}
.ink-sheet .hd-tab.on{background:#e8f0ff;color:#1f4fbf}
.ink-sheet .bw.hw i{border-radius:999px;background:currentColor;display:block}
.ink-sheet .chipbtn{
  padding:6px 11px;border-radius:9px;border:1px solid #e3e8f0;background:#fff;
  font:600 11.5px/1 inherit;color:#5b6673;cursor:pointer;
}
.ink-sheet .chipbtn.on{border-color:#2f6df6;background:#eaf1ff;color:#1f4fbf}
.ink-sheet .hlnote{padding:10px 16px 14px;font-size:11.5px;line-height:1.4;color:#8b95a3}
.ink-sheet .bd{padding:6px 0 4px;max-height:min(62vh,420px);overflow:auto}
.ink-sheet .row{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 16px;font-size:13px;border-bottom:1px solid #f6f7fa;
}
.ink-sheet .row:last-child{border-bottom:0}
.ink-sheet .row .lb{color:#1c2430}
.ink-sheet .row .sub{display:block;font-size:11px;color:#8b95a3;margin-top:1px}
.ink-sheet .sec{
  padding:9px 16px 5px;font-size:10.5px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:#9aa3b0;
}
/* the three thickness levels, editable */
.ink-sheet .sec .lvl-reset{
  float:right;border:0;background:transparent;padding:0;margin-top:-2px;cursor:pointer;
  font:600 10.5px/1 inherit;letter-spacing:.02em;text-transform:none;color:#2f6df6;
}
.ink-sheet .lvls{padding:2px 16px 8px}
.ink-sheet .lvl{
  display:flex;align-items:center;gap:9px;padding:5px 0;font-size:12.5px;color:#1c2430;
}
.ink-sheet .lvl-dot{
  display:block;border-radius:999px;background:#3c4654;flex:none;margin-left:1px;
}
.ink-sheet .lvl-nm{width:56px;flex:none;color:#54606f}
.ink-sheet .lvl input[type=number]{
  width:58px;border:1px solid #e2e7ef;border-radius:7px;padding:4px 6px;font-size:12px;
  text-align:center;color:#1c2430;font-variant-numeric:tabular-nums;
}
.ink-sheet .lvl-mm{font-size:11px;color:#8b95a3;margin-left:-4px}
.ink-sheet .lvl-use{
  margin-left:auto;border:1px solid #e2e7ef;background:#fff;border-radius:7px;
  padding:3px 9px;font:600 11px/1 inherit;color:#54606f;cursor:pointer;
}
.ink-sheet .lvl-use:hover{border-color:#2f6df6;color:#2f6df6}
.ink-sheet input[type=range]{width:104px;accent-color:#2f6df6}
.ink-sheet .num{
  width:46px;border:1px solid #e2e7ef;border-radius:7px;padding:4px 6px;font-size:12px;
  text-align:center;color:#1c2430;
}
.ink-sheet select{
  border:1px solid #e2e7ef;border-radius:8px;padding:5px 7px;font-size:12px;
  background:#fff;color:#1c2430;
}
.ink-sheet .types{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:4px 16px 12px}
.ink-sheet .types button{
  border:1px solid #e6eaf1;background:#fafbfd;border-radius:10px;padding:9px 4px;
  font-size:11px;font-weight:600;color:#4a5568;cursor:pointer;line-height:1.25;
}
.ink-sheet .types button.on{border-color:#2f6df6;background:#eef4ff;color:#1f4fbf}
.ink-sheet .danger{color:#d93a3a}
.ink-sheet .sw-line{display:flex;align-items:center;gap:8px;font-size:12px;color:#66707d}
.ink-sheet .sw-line i{width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}

/* brush picker */
#ink-brush{width:330px;max-width:calc(100vw - 16px)}
#ink-brush .bd{max-height:min(70vh,500px)}
.brush-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:8px 14px 4px}
/* the engine's 32 brush presets, two to a row with a live stroke preview */
.brush-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:2px 14px 4px}
.brush-preset{
  display:flex;flex-direction:column;gap:3px;padding:5px 6px 6px;cursor:pointer;text-align:left;
  border:1px solid var(--gn-line,#e6e2dc);border-radius:9px;background:#fff;
  transition:background .12s ease,border-color .12s ease;
}
.brush-preset:hover{background:#f4f7fc;border-color:#d3dcea}
.brush-preset.on{border-color:#2f6df6;background:#eef4ff}
.brush-preset canvas{display:block;width:100%;height:34px;border-radius:5px;background:#fbfcfe}
.brush-preset .pn{
  font:600 10.5px/1.2 inherit;color:#3c4654;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.brush-preset.on .pn{color:#1f4fbf}
.brush-tile{
  display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px 8px;
  border:1px solid #e6eaf1;background:#fafbfd;border-radius:12px;cursor:pointer;
  transition:border-color .12s ease,background .12s ease,transform .12s ease;
}
.brush-tile:hover{background:#f4f7fc;border-color:#d3dcea}
.brush-tile.on{border-color:#2f6df6;background:#eef4ff}
.brush-tile .bi{display:grid;place-items:center;width:26px;height:26px;color:#3c4654}
.brush-tile.on .bi{color:#1f4fbf}
.brush-tile .bi svg{width:22px;height:22px;display:block}
.brush-tile .bn{font:700 11px/1.15 inherit;color:#2b3542;text-align:center}
.brush-tile .bt{font:500 9px/1.2 inherit;color:#96a0ad;text-align:center}
.brush-w{display:flex;gap:7px;padding:2px 14px 12px}
.brush-w .bw{
  flex:1;height:34px;display:grid;place-items:center;border:1px solid #e6eaf1;
  background:#fafbfd;border-radius:10px;cursor:pointer;
}
.brush-w .bw:hover{background:#f4f7fc}
.brush-w .bw.on{border-color:#2f6df6;background:#eef4ff}
.brush-w .bw.near{border-color:#dbe6f8;background:#f8fbff}
.brush-w .bw.near i{opacity:.45}
.brush-w .bw i{display:block;border-radius:999px;background:#3c4654}
.brush-w .bw.on i{background:#1f4fbf}
/* continuous thickness under the three levels */
.brush-wm{display:flex;align-items:center;gap:10px;padding:0 14px 13px;margin-top:-4px}
.brush-wm input[type=range]{
  -webkit-appearance:none;appearance:none;flex:1;height:4px;border-radius:2px;
  background:linear-gradient(90deg,#dfe4ec,#c9d3e2);outline:none;cursor:pointer;margin:0;
}
.brush-wm input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#2f6df6;
  box-shadow:0 1px 3px rgba(16,32,64,.32);cursor:pointer;border:2px solid #fff;
}
.brush-wm input[type=range]::-moz-range-thumb{
  width:12px;height:12px;border-radius:50%;background:#2f6df6;border:2px solid #fff;cursor:pointer;
}
.brush-wm .wm-out{
  font:600 11px/1 ui-monospace,Menlo,monospace;color:#54606f;min-width:52px;text-align:right;
}

/* toggle */
.ink-tg{position:relative;width:42px;height:25px;border-radius:999px;background:#dfe3ea;cursor:pointer;
  border:0;padding:0;flex:none;transition:background .16s ease}
.ink-tg.on{background:#34c759}
.ink-tg::after{content:"";position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.24);transition:transform .16s ease}
.ink-tg.on::after{transform:translateX(17px)}

/* hide the engine's raw ink inputs while our panel owns them */
html[data-inkpen="1"] [data-inkhide]{display:none!important}
html[data-inkpen="1"] #bar2{min-height:34px}

/* A phone cannot hold seventeen controls across one row: the pill used to run
   off the right edge and the last swatches were only reachable by scrolling a
   control strip, which is not something a thumb can do. It breaks into two
   rows instead and every target shrinks a little — still 28 px, which is a
   comfortable press — so the whole set stays on screen at once. */
@media(max-width:620px){
  #ink-pop{width:min(270px,calc(100vw - 16px))}
  #ink-pen{
    max-width:calc(100vw - 12px);box-sizing:border-box;
    flex-wrap:wrap;justify-content:center;gap:2px 0;
    padding:5px 6px;border-radius:15px;
  }
  /* the group breaks are what wrap the rows now; a 1 px line would just float
     between two centred rows and read as noise */
  #ink-pen .div{display:none}
  #ink-pen .grp{gap:1px;padding:0 5px}
  #ink-pen button{width:28px;height:28px;border-radius:9px}
  #ink-pen button svg{width:17px;height:17px}
  #ink-pen .sw,#ink-pen .swplus{width:20px!important;height:20px!important}
  .ink-sheet{width:min(92vw,300px)}
}
/* pre-empt the engine's brush drawer for the ink tools so it never flashes */
body.ink-nodrw #gn-drw{display:none!important}
`;

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const ico = (d: string) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  d +
  '</svg>';

const PEN_ICONS: Record<string, string> = {
  ball: ico('<path d="M4 20l3.5-1 11-11-2.5-2.5-11 11L4 20z"/><path d="M14.5 5.5L18 9"/>'),
  fountain: ico('<path d="M5 19c2-6 6-11 12-13"/><path d="M14 4l6 1-1 6"/><path d="M5 19l2.5-.8"/>'),
  brush: ico('<path d="M6 18c3 1 5-1 6-4 1-3 4-5 7-4"/><path d="M18 4c1 3 0 6-2 7"/><path d="M5 20l1-2"/>'),
  pencil: ico('<path d="M5 19l2.5-.6 10-10-1.9-1.9-10 10L5 19z"/><path d="M6 21h13"/>'),
  crayon: ico('<path d="M8 20l-1.5-3L14 4.5 18 7 10.5 19.5 8 20z"/><path d="M14 4.5l4 2.5"/>'),
  marker: ico('<rect x="7" y="10" width="7" height="9" rx="1.5"/><path d="M10.5 10V6l2-2 2 2v4"/>'),
};

const ICO_COLOR = ico(
  '<circle cx="12" cy="12" r="8"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
);
const ICO_GEAR = ico(
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003.6 15a2 2 0 110-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010.5 4a2 2 0 114 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0020.4 11a2 2 0 110 4z"/>',
);

/* ------------------------------------------------------------------ */
/* Engine bridges                                                      */
/* ------------------------------------------------------------------ */

function currentColor(): string {
  return ev<string>('color') || '#111111';
}

function currentPenType(): string {
  const sel = document.getElementById('pt') as HTMLSelectElement | null;
  return sel ? sel.value : 'ball';
}

function setPenType(v: string) {
  const sel = document.getElementById('pt') as HTMLSelectElement | null;
  if (sel) {
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // apply to an active selection too, so a picked stroke restyles in place
  ev(`(function(){
    if (typeof sel === 'undefined' || !sel || !sel.length) return;
    sel.forEach(function(s){ if (s && (s.t === 'pen')) s.v = ${JSON.stringify(v)}; });
    try { draw(); save(); } catch(e){}
  })()`);
  paintPanel();
}

/**
 * The width in play for a tool.
 *
 * The engine's `size` is what a stroke is actually painted with, so when the
 * tool in hand is that tool the engine is believed over the record — that is how
 * the engine's own size control stays authoritative. For a tool that is not in
 * hand the record is the only thing that knows.
 */
function sizeOf(t: InkTool): number {
  if (engineTool() === t) {
    const v = ev<number>('size');
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      adopt(t, v);
      return v;
    }
  }
  return width(t);
}

/** Change the width of whichever tool is in hand. */
function setSize(v: number) {
  setWidth(activeTool(), v);
  paintPanel();
}

/**
 * Change the width of a named tool — what the brush popover's tabs need, since
 * the Highlighter tab must move the highlighter even when a pen is selected.
 */
function setSizeFor(t: InkTool, v: number) {
  setWidth(t, v);
  paintPanel();
  // only re-place a popover that is already up: `placePop` opens what it touches
  if (!brushPop || !brushPop.classList.contains('on')) return;
  paintBrushPop();
  placePop(brushPop, brushAnchor || brushPop);
}

/**
 * Move the "which level am I on" highlight without rebuilding the popover.
 *
 * The continuous slider cannot go through `setSizeFor`: rebuilding the popover
 * on every input event replaces the node the finger is dragging, and the drag
 * dies. So a live change only re-marks the dots.
 */
function markLevels(t: InkTool) {
  if (!brushPop) return;
  const ws = steps(t);
  const size = sizeOf(t);
  const near = nearestLevel(ws, size);
  brushPop.querySelectorAll<HTMLElement>('.brush-w .bw[data-lvl]').forEach((b) => {
    const i = Number(b.dataset.lvl);
    if (!(i < ws.length)) return;
    const exact = onLevel(ws[i], size);
    b.classList.toggle('on', exact);
    b.classList.toggle('near', !exact && i === near);
  });
}

/** The continuous slider's live path: record, repaint the pill, re-mark the dots. */
function setSizeLive(t: InkTool, v: number) {
  setWidth(t, v);
  paintPanel();
  markLevels(t);
}

function setColor(hex: string) {
  ev(`(function(){ try { setCol(${JSON.stringify(hex)}); } catch(e){} })()`);
  const sws = document.querySelectorAll('#sws .sw');
  sws.forEach((n) => {
    const b = getComputedStyle(n).backgroundColor;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(b);
    if (!m) return;
    const h =
      '#' +
      [m[1], m[2], m[3]]
        .map((x) => parseInt(x, 10).toString(16).padStart(2, '0'))
        .join('');
    n.classList.toggle('on', h.toLowerCase() === hex.toLowerCase());
  });
  pushList(RECENT_KEY, hex, 24);
  paintPanel();
  paintColorPop();
}

function setPredictive(v: number) {
  ev(`(function(){ try { SMO = Math.max(0, Math.min(100, ${v})); localStorage.setItem('inkpad-smo', SMO); } catch(e){} })()`);
}

/* ------------------------------------------------------------------ */
/* Dashed pen                                                          */
/* ------------------------------------------------------------------ */

type DashMode = 'solid' | 'dash' | 'dot';

const DASH_KEY = 'inkpad-pendash';
let dashMode: DashMode = 'solid';

function loadDash() {
  try {
    const v = localStorage.getItem(DASH_KEY) || '';
    if (v === 'dash' || v === 'dot' || v === 'solid') dashMode = v;
  } catch {
    /* private mode */
  }
}

function setDashMode(m: DashMode) {
  dashMode = m;
  try {
    localStorage.setItem(DASH_KEY, m);
  } catch {
    /* private mode */
  }
  ev(`(function(){ window.__gnPenDash = ${JSON.stringify(m)}; })()`);
}

/**
 * The engine has no dashed pen: `end()` rebuilds the committed stroke from a
 * fixed field list, so a flag put on the live stroke is thrown away. Two hooks
 * therefore, one for each half of the problem:
 *
 *   • `stroke()` is wrapped so a stroke carrying `ds` is drawn as a real
 *     polyline dash — crisp butt caps, even spacing, no pressure ribbon — which
 *     is what a "formal" dashed line looks like rather than a wobbly sketch;
 *   • the strokes the engine pushed during the gesture are tagged on the way
 *     out, so the dash survives save, reload, undo and sync.
 */
function hookDashStroke() {
  ev(`(function(){
    if (window.__gnDashHooked) return;
    window.__gnDashHooked = true;
    window.__gnPenDash = ${JSON.stringify(dashMode)};

    var orig = stroke;

    function drawDash(c, s){
      var p = s.p;
      if (!p || p.length < 2) return;
      var w = s.w || 2;
      var isHl = s.t === 'hl';
      c.save();
      c.lineCap = 'butt';
      c.lineJoin = 'round';
      c.strokeStyle = s.c;
      c.lineWidth = isHl ? w * 2.2 : w;
      if (isHl) c.globalAlpha = c.globalAlpha * 0.42;
      var dm = s.dm || window.__gnPenDash || 'dash';
      if (dm === 'dot') {
        c.lineCap = 'round';
        c.setLineDash([0.01, Math.max(5, w * 2.6)]);
      } else {
        c.setLineDash([Math.max(6, w * 3), Math.max(5, w * 2.2)]);
      }
      pth(c, p);
      c.stroke();
      c.restore();
    }

    stroke = function(c, s){
      if (s && s.p && s.p.length > 1 && (s.t === 'pen' || s.t === 'hl')) {
        var live = window.__gnPenDash;
        if (s.ds || (live && live !== 'solid' && s === cur)) {
          drawDash(c, s);
          return;
        }
      }
      return orig.apply(this, arguments);
    };
  })()`);
}

/** Strokes already on the page when the gesture started. */
let pdCount = 0;
let pdTool = '';

function hookDashCommit() {
  window.addEventListener(
    'pointerdown',
    () => {
      if (dashMode === 'solid') return;
      pdCount = ev<number>('(typeof pg === "function" && pg()) ? pg().strokes.length : 0') ?? 0;
      pdTool = ev<string>('tool') || '';
      if (pdTool !== 'pen' && pdTool !== 'hl') return;
      // give the live stroke its dashes straight away so the preview matches
      window.setTimeout(() => {
        ev(`(function(){ try{ if(cur && (cur.t==='pen'||cur.t==='hl')){ cur.ds=1; cur.dm=${JSON.stringify(dashMode)}; } }catch(e){} })()`);
      }, 0);
    },
    true,
  );

  window.addEventListener('pointerup', () => {
    if (dashMode === 'solid') return;
    if (pdTool !== 'pen' && pdTool !== 'hl') return;
    ev(`(function(){
      try{
        if (typeof pg !== 'function' || !nb) return;
        var p = pg(), n = ${pdCount};
        if (!p || p.strokes.length <= n) return;
        var hit = false;
        for (var i = n; i < p.strokes.length; i++) {
          var s = p.strokes[i];
          if (!s) continue;
          if (s.t === 'pen' || s.t === 'hl' ||
              (s.t === 'shape' && (s.k === 'line' || s.k === 'rect' || s.k === 'ell'))) {
            s.ds = 1;
            s.dm = ${JSON.stringify(dashMode)};
            hit = true;
          }
        }
        if (hit) { draw(); save(); }
      }catch(e){}
    })()`);
  });
}

/* ------------------------------------------------------------------ */
/* Pen panel                                                           */
/* ------------------------------------------------------------------ */

function buildPenPanel() {
  if (penPanel) return;
  const p = el('div');
  p.id = 'ink-pen';
  document.body.append(p);
  penPanel = p;
  paintPanel();
}

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  if (!ed) return false;
  return getComputedStyle(ed).display !== 'none';
}

/** How close a width has to be to a level before it counts as being on it. */
function onLevel(w: number, size: number): boolean {
  return Math.abs(w - size) < Math.max(0.2, w * 0.03);
}

/** Index of the level nearest to `size` — used to hint at one without claiming it. */
function nearestLevel(ws: number[], size: number): number {
  let best = 0;
  ws.forEach((w, i) => {
    if (Math.abs(w - size) < Math.abs(ws[best] - size)) best = i;
  });
  return best;
}

/**
 * Whether the pill is allowed on screen while the page is locked.
 *
 * Focus mode hides the toolbar, and the pill is part of it — which also took
 * away width and colour, the two things you reach for right after picking a
 * pen. So the rail can ask for it: the pill comes up on the pen you picked and
 * goes away again a few seconds after you stop touching it.
 */
let peek = false;
let peekTimer = 0;

function peekPill(ms = 4000) {
  peek = true;
  paintPanel();
  window.clearTimeout(peekTimer);
  peekTimer = window.setTimeout(() => {
    peek = false;
    paintPanel();
  }, ms);
}

function endPeek() {
  window.clearTimeout(peekTimer);
  if (!peek) return;
  peek = false;
  paintPanel();
}

function paintPanel() {
  if (!penPanel) return;
  const tool = ev<string>('tool') || 'pen';
  const isEr = tool === 'er';
  const inkTool = tool === 'pen' || tool === 'pe' || tool === 'hl' || isEr;
  const focusOn = document.documentElement.dataset.focus === '1';
  const show = editorOpen() && !panelLock && !drawerLock && inkTool && (!focusOn || peek);
  penPanel.classList.toggle('on', show);
  penPanel.classList.toggle('peek', focusOn && peek);
  document.documentElement.dataset.inkpen = show ? '1' : '0';
  if (!show) {
    // Suppressed because a popover owns the screen: leave the popover alone.
    // Suppressed because the tool is no longer an ink tool: close everything.
    if (!inkTool) {
      hidePop();
      hideSheets();
    }
    return;
  }
  penPanel.textContent = '';

  if (isEr) {
    const grp = el('div', '');
    grp.className = 'grp';
    const erTool: InkTool = isInkTool(tool) ? tool : 'er';
    const erSteps = steps(erTool);
    const erSize = sizeOf(erTool);
    const erNear = nearestLevel(erSteps, erSize);
    erSteps.forEach((w, i) => {
      const b = el('button') as HTMLButtonElement;
      b.className = 'w';
      b.title = ['Small eraser', 'Medium eraser', 'Large eraser'][i] + ' — ' + mmLabel(mmOf(erTool, w));
      b.innerHTML = '<i style="width:' + (8 + i * 6) + 'px;height:' + (8 + i * 6) + 'px"></i>';
      const exact = onLevel(w, erSize);
      b.classList.toggle('on', exact);
      b.classList.toggle('near', !exact && i === erNear);
      b.onclick = () => setSize(w);
      grp.append(b);
    });
    penPanel.append(grp);

    // The three dots are levels; the eraser can also take any width between
    // them, and that control belongs here rather than three menus deep. It
    // writes through setWidth, which is the same record the dock's eraser and
    // the engine's own size read, so all three stay on one number.
    const slider = el('input') as HTMLInputElement;
    slider.type = 'range';
    slider.className = 'wsl';
    const lo = Math.min(...erSteps);
    const hi = Math.max(...erSteps);
    slider.min = String(lo);
    slider.max = String(hi);
    slider.step = '1';
    slider.value = String(Math.round(erSize));
    slider.setAttribute('aria-label', 'Eraser thickness');
    slider.title = 'Eraser thickness — ' + mmLabel(mmOf(erTool, erSize));
    slider.oninput = () => {
      const v = Number(slider.value);
      setWidth(erTool, v);
      slider.title = 'Eraser thickness — ' + mmLabel(mmOf(erTool, v));
      // Re-mark the dots in place. Going through paintPanel() would replace
      // the node the finger is dragging and the drag would die.
      const near = nearestLevel(erSteps, v);
      grp.querySelectorAll<HTMLElement>('.w').forEach((b, i) => {
        const exact = onLevel(erSteps[i], v);
        b.classList.toggle('on', exact);
        b.classList.toggle('near', !exact && i === near);
      });
    };
    penPanel.append(slider);
    penPanel.append(divider());
    const gear = el('button') as HTMLButtonElement;
    gear.title = 'Eraser settings';
    gear.innerHTML = ICO_GEAR;
    gear.onclick = () => openEraserSettings(gear);
    penPanel.append(gear);
    place();
    return;
  }

  // pen types
  const types = el('div', '');
  types.className = 'grp';
  const active = currentPenType();
  PEN_TYPES.forEach((t) => {
    const b = el('button') as HTMLButtonElement;
    b.title = t.label + ' — ' + t.tip;
    b.innerHTML = PEN_ICONS[t.v] || PEN_ICONS.ball;
    b.classList.toggle('on', t.v === active);
    b.onclick = () => setPenType(t.v);
    types.append(b);
  });
  penPanel.append(types, divider());

  // widths
  const widths = el('div', '');
  widths.className = 'grp';
  const wTool: InkTool = isInkTool(tool) ? tool : 'pen';
  const ws = steps(wTool);
  const size = sizeOf(wTool);
  const near = nearestLevel(ws, size);
  ws.forEach((w, i) => {
    const b = el('button') as HTMLButtonElement;
    b.className = 'w';
    b.title = DOTS[i] + ' — ' + mmLabel(mmOf(wTool, w));
    const d = 4 + i * 4;
    b.innerHTML = '<i style="width:' + d + 'px;height:' + d + 'px"></i>';
    // A custom width — dragged in the dock or typed in the settings sheet — sits
    // between levels. It lights none of them, and the nearest one is only
    // hinted at, so the row never claims a level the nib is not on.
    const exact = onLevel(w, size);
    b.classList.toggle('on', exact);
    b.classList.toggle('near', !exact && i === near);
    b.onclick = () => setSize(w);
    widths.append(b);
  });
  penPanel.append(widths, divider());

  // colours
  const cols = el('div', '');
  cols.className = 'grp';
  const cur = currentColor().toLowerCase();
  const base = ['#111111', '#f24d5c', '#f7a1c4', '#5aa9f5', '#a8c94a', '#9b5de5'];
  base.forEach((c) => {
    const b = el('button') as HTMLButtonElement;
    b.className = 'sw';
    b.style.setProperty('--swc', c);
    b.title = c;
    b.classList.toggle('on', c === cur);
    b.onclick = () => setColor(c);
    cols.append(b);
  });
  const plus = el('button') as HTMLButtonElement;
  plus.className = 'swplus';
  plus.title = 'Pen colour';
  plus.textContent = '+';
  plus.onclick = () => openColorPopover(plus);
  cols.append(plus);
  penPanel.append(cols, divider());

  const gear = el('button') as HTMLButtonElement;
  gear.title = 'Pen settings';
  gear.innerHTML = ICO_GEAR;
  gear.onclick = () => openPenSettings(gear);
  penPanel.append(gear);

  place();
}

function divider(): HTMLElement {
  const d = el('div', '');
  d.className = 'div';
  return d;
}

function place() {
  if (!penPanel || !penPanel.classList.contains('on')) return;
  const w = penPanel.offsetWidth;
  const left = Math.max(8, Math.round((window.innerWidth - w) / 2));
  penPanel.style.left = left + 'px';

  // With the page locked there is no toolbar to hang under, and the rail can be
  // on any edge: sit under it when it is along the top, above it when it is
  // along the bottom, and at the top of the window when it is down a side.
  if (document.documentElement.dataset.focus === '1') {
    const rail = document.getElementById('pen-dock');
    const r = rail ? rail.getBoundingClientRect() : null;
    const side = rail?.dataset.side || 'left';
    let top = 10;
    if (r && r.height) {
      if (side === 'top') top = r.bottom + 8;
      else if (side === 'bottom') top = Math.max(10, r.top - penPanel.offsetHeight - 8);
    }
    penPanel.style.top = Math.round(top) + 'px';
    return;
  }

  const tb = document.getElementById('tb');
  if (!tb) return;
  const r = tb.getBoundingClientRect();
  penPanel.style.top = Math.round(r.bottom + 8) + 'px';
}

/* ------------------------------------------------------------------ */
/* Colour popover                                                      */
/* ------------------------------------------------------------------ */

let wheelHue = 210;
let wheelSat = 80;
let wheelBri = 30;

function buildColorPopover() {
  if (colorPop) return;
  const p = el('div');
  p.id = 'ink-pop';
  document.body.append(p);
  colorPop = p;
  paintColorPop();
}

function paintColorPop() {
  if (!colorPop) return;
  const cur = currentColor().toLowerCase();
  colorPop.textContent = '';

  const ttl = el('div', '');
  ttl.className = 'ttl';
  ttl.innerHTML = '<b>Pen Color</b>';
  const edit = el('a', '', 'Edit');
  edit.onclick = () => {
    setTab('custom');
  };
  ttl.append(edit);
  colorPop.append(ttl);

  const tabs = el('div', '');
  tabs.className = 'tabs';
  (['presets', 'custom', 'recent'] as const).forEach((t) => {
    const b = el('button', '', t === 'presets' ? 'Presets' : t === 'custom' ? 'Custom' : 'Recent');
    b.dataset.tab = t;
    b.classList.toggle('on', tab === t);
    b.onclick = () => setTab(t);
    tabs.append(b);
  });
  colorPop.append(tabs);

  const body = el('div', '');
  colorPop.append(body);

  if (tab === 'presets') {
    const g = el('div', '');
    g.className = 'grid';
    const saved = readList(SAVED_KEY);
    const all = saved.concat(PRESETS);
    all.forEach((c) => {
      const b = el('button') as HTMLButtonElement;
      b.style.background = c;
      b.title = c;
      b.classList.toggle('on', c.toLowerCase() === cur);
      b.onclick = () => setColor(c);
      g.append(b);
    });
    body.append(g);
  } else if (tab === 'recent') {
    const list = readList(RECENT_KEY);
    if (!list.length) {
body.append(cls(el('div', '', 'Colours you pick will show up here.'), 'empty'));
    } else {
      const g = el('div', '');
      g.className = 'grid';
      list.forEach((c) => {
        const b = el('button') as HTMLButtonElement;
        b.style.background = c;
        b.title = c;
        b.classList.toggle('on', c.toLowerCase() === cur);
        b.onclick = () => setColor(c);
        g.append(b);
      });
      body.append(g);
    }
  } else {
    body.append(buildWheel(cur));
  }
}

function buildWheel(cur: string): HTMLElement {
  const wrap = el('div', '');
  wrap.id = 'ink-wheel';

  const cv = document.createElement('canvas');
  cv.width = 352;
  cv.height = 352;
  wrap.append(cv);

  const sq = el('div', '');
  sq.id = 'ink-sq';
  const dot = el('i', '');
  sq.append(dot);
  wrap.append(sq);

  const [h0, s0, b0] = hexToHsb(cur);
  if (!wheelTouched) {
    wheelHue = h0;
    wheelSat = s0;
    wheelBri = b0;
  }

  const drawRing = () => {
    const g = cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 352, 352);
    const cx = 176,
      cy = 176,
      rOut = 172,
      rIn = 134;
    for (let a = 0; a < 360; a += 1) {
      const a0 = ((a - 0.6) * Math.PI) / 180;
      const a1 = ((a + 0.6) * Math.PI) / 180;
      g.beginPath();
      g.arc(cx, cy, rOut, a0, a1);
      g.arc(cx, cy, rIn, a1, a0, true);
      g.closePath();
      g.fillStyle = 'hsl(' + a + ',90%,52%)';
      g.fill();
    }
    // marker
    const rad = (wheelHue * Math.PI) / 180;
    const mr = (rOut + rIn) / 2;
    g.beginPath();
    g.arc(cx + Math.cos(rad) * mr, cy + Math.sin(rad) * mr, 12, 0, 7);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.stroke();
  };

  const paintSq = () => {
    sq.style.background =
      'linear-gradient(to top, #000, transparent),' +
      'linear-gradient(to right, #fff, hsl(' +
      wheelHue +
      ',100%,50%))';
    dot.style.left = wheelSat + '%';
    dot.style.top = 100 - wheelBri + '%';
  };

  const commit = () => {
    const hex = hsbToHex(wheelHue, wheelSat, wheelBri);
    hexOut.textContent = hex.toUpperCase();
    setColor(hex);
  };

  // ring drag
  const ringPick = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    let a = (Math.atan2(y, x) * 180) / Math.PI;
    if (a < 0) a += 360;
    wheelHue = a;
    wheelTouched = true;
    drawRing();
    paintSq();
    commit();
  };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ringPick(e);
    const mv = (m: PointerEvent) => ringPick(m);
    const up = () => {
      cv.removeEventListener('pointermove', mv);
      cv.removeEventListener('pointerup', up);
    };
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', up);
  });

  // square drag
  const sqPick = (e: PointerEvent) => {
    const r = sq.getBoundingClientRect();
    wheelSat = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    wheelBri = Math.max(0, Math.min(100, (1 - (e.clientY - r.top) / r.height) * 100));
    wheelTouched = true;
    paintSq();
    commit();
  };
  sq.addEventListener('pointerdown', (e) => {
    sq.setPointerCapture(e.pointerId);
    sqPick(e);
    const mv = (m: PointerEvent) => sqPick(m);
    const up = () => {
      sq.removeEventListener('pointermove', mv);
      sq.removeEventListener('pointerup', up);
    };
    sq.addEventListener('pointermove', mv);
    sq.addEventListener('pointerup', up);
  });

  drawRing();
  paintSq();

  const hexOut = el('code', '', cur.toUpperCase());
  const foot = el('div', '');
  foot.id = 'ink-hex';
  const save = el('button', '', 'Add to Presets');
  save.onclick = () => {
    pushList(SAVED_KEY, hsbToHex(wheelHue, wheelSat, wheelBri), 24);
    setTab('presets');
  };
  foot.append(hexOut, save);

  const outer = el('div', '');
  outer.append(wrap, foot);
  return outer;
}

let wheelTouched = false;
let tab: 'presets' | 'custom' | 'recent' = 'presets';

function setTab(t: 'presets' | 'custom' | 'recent') {
  tab = t;
  wheelTouched = false;
  paintColorPop();
}

/**
 * Only one ink panel can be up at a time, and tapping the icon that opened a
 * panel puts it away again. Both rules live here so the pill's three popovers
 * cannot drift apart.
 */
type PanelKind = 'color' | 'pen' | 'er' | 'brush';
let activePanel: PanelKind | '' = '';
/**
 * While a popover is up the floating tool row is hidden. The row sits at the
 * same height as the popovers and they used to stack — one in front, one
 * behind — which is what made the brushes button look like it opened twice.
 */
let panelLock = false;
/** True while the engine's own drawer is up; the tool row steps aside for it. */
let drawerLock = false;

/** Drop every popover without touching the floating tool row. */
function closePopovers() {
  const had = !!activePanel || panelLock;
  colorPop?.classList.remove('on');
  penSheet?.classList.remove('on');
  erSheet?.classList.remove('on');
  brushPop?.classList.remove('on');
  activePanel = '';
  panelLock = false;
  // A sheet suppresses the pill while it is up, so the pill's dots went stale
  // the moment it opened. Redraw it now that it has the screen back — but only
  // if something was actually open, or `paintPanel`'s own "close everything"
  // path would call this again and never return.
  if (had) paintPanel();
}

/** Close every panel — popovers, the tool row and the engine's drawer. */
function closePanels() {
  closePopovers();
  closeDrawer();
  paintPanel();
}

/** Close everything, then take ownership of the screen for one panel. */
function beginPanel(kind: PanelKind) {
  closePopovers();
  closeDrawer();
  activePanel = kind;
  panelLock = true;
  penPanel?.classList.remove('on');
  document.documentElement.dataset.inkpen = '0';
}

function openColorPopover(anchor: HTMLElement) {
  if (activePanel === 'color') {
    closePanels();
    return;
  }
  buildColorPopover();
  if (!colorPop) return;
  beginPanel('color');
  popAnchor = anchor;
  tab = 'presets';
  wheelTouched = false;
  paintColorPop();
  placePop(colorPop, anchor);
  colorPop.classList.add('on');
}

function hidePop() {
  closePopovers();
}

/* ------------------------------------------------------------------ */
/* Pen settings sheet                                                  */
/* ------------------------------------------------------------------ */

function buildPenSheet() {
  if (penSheet) return;
  const s = el('div');
  s.id = 'ink-penset';
  s.className = 'ink-sheet';
  document.body.append(s);
  penSheet = s;
}

function paintPenSheet() {
  if (!penSheet) return;
  penSheet.textContent = '';
  const hd = el('div', '', 'Pen Settings');
  hd.className = 'hd';
  penSheet.append(hd);

  const bd = el('div', '');
  bd.className = 'bd';

  // Thickness levels. The pill shows three dots; this is where their values are
  // set. They are per tool, so the title says which nib you are editing, and a
  // level is a millimetre figure — the unit the dock already speaks.
  const lt = activeTool();
  const lvTitle = sec('Thickness · ' + TOOL_NAME[lt]);
  const reset = el('button', '', 'Reset') as HTMLButtonElement;
  reset.type = 'button';
  reset.className = 'lvl-reset';
  reset.title = 'Back to the standard three';
  reset.onclick = () => {
    resetSteps(lt);
    paintPenSheet();
    paintPanel();
  };
  lvTitle.append(reset);
  bd.append(lvTitle);

  const list = steps(lt);
  const lvWrap = el('div', '');
  lvWrap.className = 'lvls';
  list.forEach((units, i) => {
    const r = el('div', '');
    r.className = 'lvl';

    const dot = el('span', '');
    dot.className = 'lvl-dot';
    const dia = 6 + i * 5;
    dot.style.width = dia + 'px';
    dot.style.height = dia + 'px';

    const nm = el('span', '', DOTS[i]);
    nm.className = 'lvl-nm';

    const num = el('input') as HTMLInputElement;
    num.type = 'number';
    num.min = '0.1';
    num.max = '60';
    num.step = '0.1';
    num.value = mmOf(lt, units).toFixed(2).replace(/0$/, '');
    num.setAttribute('aria-label', DOTS[i] + ' thickness in millimetres');

    const commit = () => {
      const mm = Number(num.value);
      if (!Number.isFinite(mm) || mm <= 0) {
        num.value = mmOf(lt, steps(lt)[i]).toFixed(2).replace(/0$/, '');
        return;
      }
      const next = steps(lt);
      next[i] = unitsOf(lt, mm);
      setSteps(lt, next);
      paintPanel();
      if (brushPop) paintBrushPop();
      num.value = mmOf(lt, next[i]).toFixed(2).replace(/0$/, '');
    };
    num.onchange = commit;
    num.onblur = commit;

    const use = el('button', '', 'Use') as HTMLButtonElement;
    use.type = 'button';
    use.className = 'lvl-use';
    use.title = 'Make this the current thickness';
    use.onclick = () => {
      setSizeFor(lt, unitsOf(lt, Number(num.value) || mmOf(lt, units)));
      paintPenSheet();
    };

    const unit = el('span', '', 'mm');
    unit.className = 'lvl-mm';

    r.append(dot, nm, num, unit, use);
    lvWrap.append(r);
  });
  bd.append(lvWrap);

  // Pen type and thickness live on the floating pill; only the things the pill
  // cannot show belong in here, so nothing is offered twice.

  // predictive / stabilization
bd.append(sec('Stroke Stabilization'));
  const smo = row('Predictive', 'Steadies and smooths the line');
  const range = el('input') as HTMLInputElement;
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = String(ev<number>('SMO') ?? 15);
  const out = el('code', 'font:600 12px ui-monospace,Menlo,monospace;color:#1c2430', range.value + '%');
  range.oninput = () => {
    out.textContent = range.value + '%';
    setPredictive(+range.value);
  };
  smo.append(range, out);
  bd.append(smo);

  // line style — a dashed stroke is a pen property, not a shape one
  bd.append(sec('Line Style'));
  const types = el('div', '');
  types.className = 'types';
  ([
    ['solid', 'Solid'],
    ['dash', 'Dashed'],
    ['dot', 'Dotted'],
  ] as [DashMode, string][]).forEach(([m, label]) => {
    const b = el('button', '', label) as HTMLButtonElement;
    b.type = 'button';
    b.title = m === 'solid' ? 'Continuous line' : m === 'dash' ? 'Even, formal dashes' : 'Round dots';
    b.classList.toggle('on', dashMode === m);
    b.onclick = () => {
      setDashMode(m);
      paintPenSheet();
    };
    types.append(b);
  });
  bd.append(types);

  // pressure
bd.append(sec('Stylus'));
  const pres = row('Pressure', 'Re-pick when you change pen');
  const psel = document.createElement('select');
  [
    ['1', 'Normal'],
    ['.6', 'Soft'],
    ['1.7', 'Firm'],
    ['off', 'Off'],
  ].forEach(([v, label]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    psel.append(o);
  });
  const curPrs = (document.getElementById('prs') as HTMLSelectElement | null)?.value || '1';
  psel.value = curPrs;
  psel.onchange = () => {
    const target = document.getElementById('prs') as HTMLSelectElement | null;
    if (target) {
      target.value = psel.value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  pres.append(psel);
  bd.append(pres);

  penSheet.append(bd);
}

function row(label: string, sub?: string): HTMLElement {
  const r = el('div', '');
  r.className = 'row';
  const l = el('div', '');
  const b = el('span', '', label);
  b.className = 'lb';
  l.append(b);
  if (sub) l.append(cls(el('span', '', sub), 'sub'));
  r.append(l);
  return r;
}

function openPenSettings(anchor: HTMLElement) {
  if (activePanel === 'pen') {
    closePanels();
    return;
  }
  buildPenSheet();
  if (!penSheet) return;
  beginPanel('pen');
  paintPenSheet();
  placePop(penSheet, anchor);
  penSheet.classList.add('on');
  penSheet.dataset.kind = 'pen';
}

/* ------------------------------------------------------------------ */
/* Brush picker                                                        */
/* ------------------------------------------------------------------ */

/**
 * The engine's own brush drawer is what the pen button used to open, and it is
 * gone (our pill owns brush choice now). Suppressing it left the button looking
 * dead, so give it the dropdown it deserves: the six brushes by name, with a
 * one-line description each and the thickness row underneath.
 */
let brushPop: HTMLElement | null = null;
let brushAnchor: HTMLElement | null = null;

const BRUSH_BLURB: Record<string, string> = {
  ball: 'Even everyday line',
  fountain: 'Tapered, pressure aware',
  brush: 'Soft expressive swell',
  pencil: 'Grainy graphite',
  crayon: 'Waxy broken edge',
  marker: 'Wide and translucent',
};

/** One of the engine's 32 presets (`BRD`), slimmed down for the picker. */
interface BrushPreset {
  id: string;
  n: string;
  sz: number;
}

/** The three preset families, in the order the engine's own panel used. */
const PRESET_FAMILIES: { prefix: string; title: string }[] = [
  { prefix: 'dd', title: 'Dashes & dots' },
  { prefix: 'pb', title: 'Particle burst' },
  { prefix: 'cs', title: 'Calligraphy' },
];

let presets: BrushPreset[] | null = null;

function brushPresets(): BrushPreset[] {
  if (presets) return presets;
  presets =
    ev<BrushPreset[]>(`(function(){
      try{
        return BRD.map(function(x){ return { id: x.id, n: x.n, sz: x.sz || 3 }; });
      }catch(e){ return []; }
    })()`) || [];
  return presets;
}

/**
 * Draw one preset's stroke sample with the engine's own `pvw()`, so the tile
 * looks exactly like the mark it makes.
 */
function drawPresetPreview(cv: HTMLCanvasElement, v: string, w: number) {
  const W = 128;
  const H = 34;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  let col = ev<string>('color') || '#1c2430';
  if (col.toLowerCase() === '#ffffff') col = '#888888';
  (window as any).__gnPv = g;
  ev(`(function(){
    try{ pvw(window.__gnPv, { t:'pen', c:${JSON.stringify(col)}, w:${w}, v:${JSON.stringify(v)} }); }catch(e){}
  })()`);
  (window as any).__gnPv = null;
}

function buildBrushPop() {
  if (brushPop) return;
  const p = el('div');
  p.id = 'ink-brush';
  p.className = 'ink-sheet';
  document.body.append(p);
  brushPop = p;
}

/**
 * Which face of the brush panel is showing. The Highlighter button used to
 * open the pen list, which is why pressing it looked like it opened "Brushes".
 * Both buttons open the same sheet now, each on its own tab.
 */
let brushTab: 'pen' | 'hl' = 'pen';

const HL_SWATCHES = ['#f7e463', '#7ee0a8', '#7fc8ff', '#ff9ec7', '#c3a6ff', '#ffb570'];

function paintBrushPop() {
  if (!brushPop) return;
  brushPop.textContent = '';

  const hd = el('div', '');
  hd.className = 'hd hd-tabs';
  (['pen', 'hl'] as const).forEach((k) => {
    const b = el('button', '', k === 'pen' ? 'Pen' : 'Highlighter') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'hd-tab';
    b.classList.toggle('on', brushTab === k);
    b.onclick = () => {
      brushTab = k;
      paintBrushPop();
      if (brushPop) placePop(brushPop, brushAnchor || brushPop);
    };
    hd.append(b);
  });
  brushPop.append(hd);

  const bd = el('div', '');
  bd.className = 'bd';
  brushPop.append(bd);

  if (brushTab === 'hl') {
    paintHighlighterTab(bd);
    return;
  }

  const grid = el('div', '');
  grid.className = 'brush-grid';
  const active = currentPenType();
  bd.append(sec('Pen'));
  PEN_TYPES.forEach((t) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'brush-tile';
    b.title = t.label + ' — ' + (BRUSH_BLURB[t.v] || t.tip);
    b.classList.toggle('on', t.v === active);
    const ic = el('span', '');
    ic.className = 'bi';
    ic.innerHTML = PEN_ICONS[t.v] || PEN_ICONS.ball;
    const nm = el('span', '', t.label.replace(' Pen', ''));
    nm.className = 'bn';
    const tp = el('span', '', BRUSH_BLURB[t.v] || t.tip);
    tp.className = 'bt';
    b.append(ic, nm, tp);
    b.onclick = () => {
      setPenType(t.v);
      paintBrushPop();
    };
    grid.append(b);
  });
  bd.append(grid);

  // the engine's own preset library, grouped the way its drawer used to group it
  const all = brushPresets();
  PRESET_FAMILIES.forEach((fam) => {
    const list = all.filter((x) => x.id.startsWith(fam.prefix));
    if (!list.length) return;
    bd.append(sec(fam.title));
    const pg = el('div', '');
    pg.className = 'brush-presets';
    list.forEach((x) => {
      const b = el('button') as HTMLButtonElement;
      b.type = 'button';
      b.className = 'brush-preset';
      b.title = x.n;
      b.classList.toggle('on', x.id === active);
      const c = document.createElement('canvas');
      b.append(c);
      const nm = el('span', '', x.n);
      nm.className = 'pn';
      b.append(nm);
      b.onclick = () => {
        setPenType(x.id);
        paintBrushPop();
      };
      pg.append(b);
      // paint after the node is in the document so the dpr maths is right
      drawPresetPreview(c, x.id, x.sz);
    });
    bd.append(pg);
  });

  bd.append(sec('Thickness'));
  paintWidthRow(bd, 'pen');
}

/**
 * The thickness controls for one tool: its three levels, then a continuous
 * slider for anything between them.
 *
 * `t` is the *tab's* tool, not the engine's. Opening this from the Pen button
 * and switching to the Highlighter tab must move the highlighter, and it must do
 * so even though a pen is the tool in hand — otherwise the Highlighter tab is a
 * decoration, which is what it used to be.
 */
function paintWidthRow(bd: HTMLElement, t: InkTool) {
  const ws = steps(t);
  const size = sizeOf(t);
  const near = nearestLevel(ws, size);

  const wr = el('div', '');
  wr.className = 'brush-w';
  ws.forEach((w, i) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'bw';
    b.dataset.lvl = String(i);
    b.title = (DOTS[i] || String(w)) + ' — ' + mmLabel(mmOf(t, w));
    const d = 5 + i * 5;
    b.innerHTML = '<i style="width:' + d + 'px;height:' + d + 'px"></i>';
    const exact = onLevel(w, size);
    b.classList.toggle('on', exact);
    b.classList.toggle('near', !exact && i === near);
    b.onclick = () => setSizeFor(t, w);
    wr.append(b);
  });
  bd.append(wr);

  // continuous: the levels are shortcuts, this is the whole range
  const row = el('div', '');
  row.className = 'brush-wm';
  const mm = mmOf(t, size);
  const range = el('input') as HTMLInputElement;
  range.type = 'range';
  range.min = '0';
  range.max = '1000';
  range.step = '1';
  range.value = String(mmToSlider(mm));
  range.setAttribute('aria-label', 'Thickness');
  const out = el('code', '', mmLabel(mm));
  out.className = 'wm-out';
  range.oninput = () => {
    const next = sliderToMm(Number(range.value));
    out.textContent = mmLabel(next);
    setSizeLive(t, unitsOf(t, next));
  };
  // settle on release: rebuild so the dots and the readout agree exactly
  range.onchange = () => paintBrushPop();
  row.append(range, out);
  bd.append(row);
}

/* The slider is logarithmic: a 0.2 mm fineliner and a 20 mm marker both need
   room, and a linear slider spends nine tenths of its travel above 1 mm. */
const MM_MIN = 0.1;
const MM_MAX = 40;

function mmToSlider(mm: number): number {
  const v = Math.max(MM_MIN, Math.min(MM_MAX, mm));
  const t = (Math.log(v) - Math.log(MM_MIN)) / (Math.log(MM_MAX) - Math.log(MM_MIN));
  return Math.round(t * 1000);
}

function sliderToMm(v: number): number {
  const t = Math.max(0, Math.min(1, v / 1000));
  return Math.exp(Math.log(MM_MIN) + t * (Math.log(MM_MAX) - Math.log(MM_MIN)));
}

/** The paper module owns the highlighter's alpha, so reach through it. */
function hlPrefs(): any {
  return (window as any).__inkpad_paper?.prefs || null;
}

function setHlOpacity(v: number) {
  const p = hlPrefs();
  if (!p) return;
  p.hlOpacity = v;
  try {
    (window as any).__inkpad_paper?.save?.();
    (window as any).__inkpad_paper?.invalidate?.();
  } catch {}
  ev('(function(){ try { draw(); } catch(e){} })()');
}

function paintHighlighterTab(bd: HTMLElement) {
  const p = hlPrefs();
  const cur = String(p?.hlBlend || 'auto');

  bd.append(sec('Tip'));
  paintWidthRow(bd, 'hl');

  bd.append(sec('Colour'));
  const cols = el('div', '');
  cols.className = 'brush-w';
  const now = currentColor().toLowerCase();
  HL_SWATCHES.forEach((c) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'sw';
    b.style.setProperty('--swc', c);
    b.title = c;
    b.classList.toggle('on', c === now);
    b.onclick = () => {
      setColor(c);
      paintBrushPop();
    };
    cols.append(b);
  });
  const plus = el('button') as HTMLButtonElement;
  plus.type = 'button';
  plus.className = 'swplus';
  plus.title = 'Any colour';
  plus.textContent = '+';
  plus.onclick = () => openColorPopover(plus);
  cols.append(plus);
  bd.append(cols);

  bd.append(sec('Opacity'));
  const op = el('div', '');
  op.className = 'brush-w';
  [0.18, 0.26, 0.34, 0.46, 0.6].forEach((v) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'bw hw';
    b.title = Math.round(v * 100) + '%';
    b.innerHTML = '<i style="width:18px;height:18px;opacity:' + v + '"></i>';
    b.classList.toggle('on', p ? Math.abs((p.hlOpacity ?? 0.34) - v) < 0.03 : false);
    b.onclick = () => {
      setHlOpacity(v);
      paintBrushPop();
    };
    op.append(b);
  });
  bd.append(op);

  bd.append(sec('Blend'));
  const bl = el('div', '');
  bl.className = 'brush-w';
  ([['auto', 'Auto'], ['multiply', 'Multiply'], ['normal', 'Normal']] as const).forEach(([k, label]) => {
    const b = el('button', '', label) as HTMLButtonElement;
    b.type = 'button';
    b.className = 'chipbtn';
    b.classList.toggle('on', cur === k);
    b.onclick = () => {
      const pp = hlPrefs();
      if (pp) {
        pp.hlBlend = k;
        try {
          (window as any).__inkpad_paper?.save?.();
          (window as any).__inkpad_paper?.invalidate?.();
        } catch {}
      }
      ev('(function(){ try { draw(); } catch(e){} })()');
      paintBrushPop();
    };
    bl.append(b);
  });
  bd.append(bl);

  const note = el('div', '', 'Highlights sit under the ink and never hide it.');
  note.className = 'hlnote';
  bd.append(note);
}

function toggleBrush(anchor: HTMLElement, want: 'pen' | 'hl' = 'pen') {
  // a second press on the same button puts it away again
  if (activePanel === 'brush' && brushAnchor === anchor && brushTab === want) {
    closePanels();
    return;
  }
  buildBrushPop();
  if (!brushPop) return;
  brushTab = want;
  beginPanel('brush');
  paintBrushPop();
  placePop(brushPop, anchor);
  brushPop.classList.add('on');
  brushPop.dataset.kind = 'brush';
  brushAnchor = anchor;
}

/* ------------------------------------------------------------------ */
/* Eraser settings sheet                                               */
/* ------------------------------------------------------------------ */

function buildErSheet() {
  if (erSheet) return;
  const s = el('div');
  s.id = 'ink-erset';
  s.className = 'ink-sheet';
  s.style.width = '300px';
  document.body.append(s);
  erSheet = s;
}

function paintErSheet() {
  if (!erSheet) return;
  pushEraserMode();
  erSheet.textContent = '';
  const hd = el('div', '', 'Eraser Settings');
  hd.className = 'hd';
  erSheet.append(hd);

  const bd = el('div', '');
  bd.className = 'bd';

  bd.append(toggleRow('Erase Highlighter Only', 'Leave pen and pencil untouched', eraserMode === 'hl', (on) => {
    eraserMode = on ? 'hl' : 'all';
    lsSet('inkpad-eraser-mode', eraserMode);
    pushEraserMode();
    paintErSheet();
  }));
  bd.append(toggleRow('Erase Tape Only', 'Only lift washi and tape', eraserMode === 'tape', (on) => {
    eraserMode = on ? 'tape' : 'all';
    lsSet('inkpad-eraser-mode', eraserMode);
    pushEraserMode();
    paintErSheet();
  }));
  // the engine's second eraser (whole-stroke) used to be its own toolbar button;
  // it is the same tool with a different reach, so it is a mode here instead
  bd.append(toggleRow('Erase Whole Stroke', 'Lift the entire line instead of a piece of it', ev<string>('tool') === 'pe', (on) => {
    ev(`(function(){ try{ tool = ${JSON.stringify(on ? 'pe' : 'er')}; syncTools(); }catch(e){} })()`);
    lastTool = on ? 'pe' : 'er';
    paintErSheet();
  }));

  const clear = el('div', '');
  clear.className = 'row';
  const cl = el('span', '', 'Clear Page');
  cl.className = 'lb danger';
  const cb = el('button', '', 'Clear');
  cb.className = 'lb';
  cb.style.cssText =
    'border:1px solid #f0c9c9;background:#fff5f5;color:#d93a3a;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer';
  cb.onclick = () => {
    const btn = document.getElementById('clr');
    if (btn) btn.click();
    hideSheets();
  };
  clear.append(cl, cb);
  bd.append(clear);

bd.append(sec('Settings'));
  bd.append(toggleRow('Auto-Deselect', 'Drop the selection after each stroke', autoDeselect, (on) => {
    autoDeselect = on;
    lsSet('inkpad-auto-deselect', on ? '1' : '0');
    paintErSheet();
  }));

  erSheet.append(bd);
}

function toggleRow(label: string, sub: string, on: boolean, cb: (v: boolean) => void): HTMLElement {
  const r = row(label, sub);
  const t = el('button') as HTMLButtonElement;
  t.className = 'ink-tg' + (on ? ' on' : '');
  t.type = 'button';
  t.setAttribute('role', 'switch');
  t.setAttribute('aria-checked', on ? 'true' : 'false');
  t.onclick = () => cb(!on);
  r.append(t);
  return r;
}

function openEraserSettings(anchor: HTMLElement) {
  if (activePanel === 'er') {
    closePanels();
    return;
  }
  buildErSheet();
  if (!erSheet) return;
  closePanels();
  paintErSheet();
  placePop(erSheet, anchor);
  erSheet.classList.add('on');
  erSheet.dataset.kind = 'er';
  activePanel = 'er';
}

function hideSheets() {
  closePopovers();
}

/* ------------------------------------------------------------------ */
/* Popover placement                                                   */
/* ------------------------------------------------------------------ */

/**
 * Bottom edge of the whole toolbar block. Panels used to be placed relative to
 * the button that opened them, which put them *inside* the toolbar band — the
 * top of the panel ended up behind the page-settings row, which is why it
 * looked cut off. Every popover now docks below this line instead.
 */
function toolbarFloor(): number {
  let bottom = 0;
  const tb = document.getElementById('tb');
  if (tb) bottom = tb.getBoundingClientRect().bottom;
  const sbar = document.getElementById('sbar');
  if (sbar && getComputedStyle(sbar).display !== 'none') {
    bottom = Math.max(bottom, sbar.getBoundingClientRect().bottom);
  }
  return Math.round(bottom) + 8;
}

function placePop(node: HTMLElement, anchor: HTMLElement) {
  node.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth;
  const floor = toolbarFloor();
  const h = node.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left - w / 2 + r.width / 2));
  let top = Math.max(floor, r.bottom + 8);
  if (top + h > window.innerHeight - 8) {
    const above = r.top - h - 8;
    top = above >= floor ? above : floor;
  }
  node.style.left = Math.round(left) + 'px';
  node.style.top = Math.round(top) + 'px';

  // if it still does not fit, take the height out of the scrolling body rather
  // than letting the sheet run off the bottom of the window
  const bd = node.querySelector('.bd') as HTMLElement | null;
  if (bd) {
    const over = top + node.offsetHeight - (window.innerHeight - 8);
    if (over > 0) {
      const cur = bd.getBoundingClientRect().height;
      bd.style.maxHeight = Math.max(140, Math.round(cur - over)) + 'px';
    }
  }
}

/* ------------------------------------------------------------------ */
/* Restricted erasing                                                  */
/* ------------------------------------------------------------------ */

/**
 * "Erase highlighter only" / "erase tape only" cannot be done by intercepting
 * the engine's eraser: it has two paths (whole-stroke and precision), and the
 * precision path splits a stroke into fragments rather than deleting it.
 *
 * So we snapshot the page when the eraser goes down and reconcile afterwards:
 * anything the gesture removed that the mode protects is put back, and any
 * fragments it created are dropped. This works whichever path the engine took,
 * and keeps the eraser's own trail so the visual feedback stays intact.
 */
let erSnap: any[] | null = null;
let erRaf = 0;

function reconcile() {
  if (!erSnap || eraserMode === 'all') return;
  const now = ev<any[]>('pg().strokes');
  if (!Array.isArray(now)) return;

  const live = new Set(now);
  const kept: any[] = [];
  for (const s of erSnap) {
    if (live.has(s)) {
      kept.push(s);
    } else {
      const protect = eraserMode === 'hl' ? s.t !== 'hl' : !s.__tape;
      if (protect) kept.push(s);
    }
  }
  // preserve the eraser's own trail strokes so the feedback still draws
  for (const s of now) {
    if (!erSnap.includes(s) && (s.t === 'er' || s.t === 'ers')) kept.push(s);
  }
  if (kept.length === now.length && kept.every((s, i) => s === now[i])) return;

  (window as any).__inkErRecon = kept;
  ev(`(function(){ try { pg().strokes = window.__inkErRecon; draw(); } catch(e){} })()`);
}

function hookEraser() {
  const cv = document.getElementById('cv');
  if (!cv) {
    window.setTimeout(hookEraser, 600);
    return;
  }

  cv.addEventListener(
    'pointerdown',
    () => {
      if (ev<string>('tool') !== 'er' || eraserMode === 'all') return;
      erSnap = (ev<any[]>('pg().strokes') || []).slice();
      cancelAnimationFrame(erRaf);
      const loop = () => {
        reconcile();
        erRaf = requestAnimationFrame(loop);
      };
      erRaf = requestAnimationFrame(loop);
    },
    true,
  );

  const stop = () => {
    cancelAnimationFrame(erRaf);
    // bubble phase: the engine has finished erasing by the time this runs
    window.setTimeout(() => {
      reconcile();
      erSnap = null;
    }, 0);
  };
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

function pushEraserMode() {
  (window as any).__inkEraseMode = eraserMode;
}

/* ------------------------------------------------------------------ */
/* Auto-deselect                                                       */
/* ------------------------------------------------------------------ */

function hookAutoDeselect() {
  window.addEventListener(
    'pointerup',
    () => {
      if (!autoDeselect) return;
      const tool = ev<string>('tool');
      if (tool === 'sel' || tool === 'text') return;
      window.setTimeout(() => {
        ev(`(function(){ try { if (sel && sel.length) { sel = []; draw(); } } catch(e){} })()`);
      }, 30);
    },
    true,
  );
}

/* ------------------------------------------------------------------ */
/* Hide engine's raw ink inputs                                        */
/* ------------------------------------------------------------------ */

function markEngineControls() {
  const ids = ['pt', 'prs', 'size', 'sizen'];
  ids.forEach((id) => {
    const n = document.getElementById(id);
    if (n) n.setAttribute('data-inkhide', '1');
  });
  // the predictive range/number/span the engine appends after #sizen
  const sizen = document.getElementById('sizen');
  if (sizen) {
    let n = sizen.nextElementSibling;
    let guard = 0;
    while (n && guard++ < 6) {
      const isPred =
        (n instanceof HTMLInputElement && /Predictive/.test(n.title || '')) ||
        (n instanceof HTMLSpanElement && /Predictive/.test(n.textContent || ''));
      if (isPred) n.setAttribute('data-inkhide', '1');
      else if (!(n instanceof HTMLInputElement)) break;
      n = n.nextElementSibling;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Suppress the engine's pen drawer                                    */
/* ------------------------------------------------------------------ */

function closeDrawer() {
  ev(`(function(){ try { closeDr(); } catch(e){} })()`);
}

/**
 * Clicking a drawing tool makes the engine open its own options drawer. That
 * drawer used to hold the pen type / thickness / predictive controls, but our
 * panel owns those now — and while it is open it covers the top of the page and
 * swallows strokes. So for the ink tools it is suppressed before it is painted.
 *
 * The same drawer is also what the Settings button opens, and that one has to
 * survive: only a drawer that follows a tool click is shadowed.
 */
function hookDrawer() {
  const attach = (): boolean => {
    const drw = document.getElementById('gn-drw');
    if (!drw) return false;
    new MutationObserver(() => {
      if (drw.style.display !== 'block') {
        if (drawerLock) {
          drawerLock = false;
          paintPanel();
        }
        return;
      }
      // A drawer opened by an ink-tool press is cancelled on the next tick, so
      // it must not take the brush panel down with it on the way out. That race
      // was the "the brush window shows, then disappears": the engine opened
      // its drawer a task after we opened ours, and this callback closed ours
      // while closing the engine's.
      if (document.body.classList.contains('ink-nodrw')) {
        window.setTimeout(closeDrawer, 0);
        return;
      }
      // the drawer and our tool row sit at the same height, so only one of
      // them may be up: the row steps aside while the drawer is showing
      drawerLock = true;
      closePopovers();
      paintPanel();
    }).observe(drw, { attributes: true, attributeFilter: ['style'] });
    return true;
  };
  if (!attach()) window.setTimeout(() => attach(), 600);

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      const hit = t.closest('#tb [data-t]') as HTMLElement | null;
      if (!hit) return;

      // Pre-empt the drawer instead of closing it afterwards. The engine opens
      // it from its own pointerdown handler; a capture listener on the same
      // node runs first, so blanketing it with `!important` here means it is
      // never painted at all. Closing it a frame later (the old way) showed a
      // one-frame flash — that was the "brushes dropdown disappears quickly".
      const tool = hit.dataset.t || '';
      if (tool !== 'pen' && tool !== 'pe' && tool !== 'hl') return;
      document.body.classList.add('ink-nodrw');
      window.setTimeout(() => document.body.classList.remove('ink-nodrw'), 320);

      // ...and put our own brush dropdown in its place, on the same press.
      // The highlighter opens the same sheet on its own tab: it used to open
      // the pen list, which read as "the highlighter shows the brushes window".
      if (tool === 'pen' || tool === 'hl') {
        const btn = hit;
        window.setTimeout(() => toggleBrush(btn, tool === 'hl' ? 'hl' : 'pen'), 0);
      }
    },
    true,
  );

  // Belt and braces: any press on the page closes a stale drawer so it can
  // never sit between the user and their strokes.
  const cv = document.getElementById('cv');
  if (cv) cv.addEventListener('pointerdown', () => closeDrawer(), true);
}

/* ------------------------------------------------------------------ */
/* Sync loop                                                           */
/* ------------------------------------------------------------------ */

function tick() {
  const tool = ev<string>('tool') || '';
  const open = editorOpen();
  if (tool !== lastTool || open !== lastOpen) {
    lastTool = tool;
    lastOpen = open;
    // each tool remembers its own nib, so switching from a 0.4 mm pen to the
    // highlighter does not hand the highlighter the pen's width
    if (isInkTool(tool)) applyActive();
    paintPanel();
    // switching inside the ink family must not close the settings you are in
    const ink = tool === 'pen' || tool === 'pe' || tool === 'hl' || tool === 'er';
    if (!ink) {
      hidePop();
      hideSheets();
    }
  }
  place();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!document.getElementById('tb')) {
    window.setTimeout(boot, 300);
    return;
  }
  const style = document.createElement('style');
  style.id = 'ink-style';
  style.textContent = CSS;
  document.head.append(style);

  markEngineControls();
  buildPenPanel();
  hookEraser();
  hookDrawer();
  pushEraserMode();
  hookAutoDeselect();
  loadDash();
  hookDashStroke();
  hookDashCommit();

  // close popovers on outside press
  window.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#ink-pen') || t.closest('#ink-pop') || t.closest('.ink-sheet')) return;
      // the brush picker lives under the pen button: let it own that press, or
      // the toggle would be closed here and reopened by the handler above
      if (t.closest('#tb [data-t="pen"]') || t.closest('#tb [data-t="hl"]')) return;
      hidePop();
      hideSheets();
    },
    true,
  );
  window.addEventListener('resize', () => {
    place();
    hidePop();
    hideSheets();
  });

  // touching the pill is a reason to keep it up: picking a width or a colour
  // resets the clock, so it never disappears from under a finger
  penPanel?.addEventListener('pointerdown', () => {
    if (peek) peekPill();
  });
  // unlocking brings the toolbar back, so the pill no longer needs asking for
  document.addEventListener('inkpad-focus', () => {
    if (document.documentElement.dataset.focus !== '1') endPeek();
  });

  window.setInterval(tick, 220);
  paintPanel();

  // the dock and the settings sheet write the same record, so follow it
  onWidth((t) => {
    paintPanel();
    markLevels(t);
    if (penSheet?.classList.contains('on')) paintPenSheet();
  });

  (window as any).__inkpad_ink = {
    panel: () => penPanel,
    /** Focus mode: bring the pill up for a few seconds (the rail calls this). */
    peek: (ms?: number) => peekPill(ms),
    endPeek: () => endPeek(),
    color: (hex: string) => setColor(hex),
    penType: (v: string) => setPenType(v),
    size: (v: number) => setSize(v),
    widthFor: (t: InkTool, v: number) => setSizeFor(t, v),
    widths: (t: InkTool) => ({ steps: steps(t), mm: mmOf(t) }),
    eraserMode: (m: 'all' | 'hl' | 'tape') => {
      eraserMode = m;
      pushEraserMode();
    },
    openColor: () => {
      const b = penPanel?.querySelector('.swplus') as HTMLElement | null;
      if (b) openColorPopover(b);
    },
    openPen: () => {
      const b = [...(penPanel?.querySelectorAll('button') || [])].pop() as HTMLElement | undefined;
      if (b) openPenSettings(b);
    },
    setDash: (m: DashMode) => {
      setDashMode(m);
      paintPenSheet();
    },
    dash: () => dashMode,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
