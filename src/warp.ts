/**
 * Warp — a Transform / Effects action in the contextual selection bar.
 *
 * This is a genuine pixel transformation, not a CSS filter or a decorative
 * preview. The selected objects are rasterised into an offscreen Canvas 2D
 * buffer; for every destination pixel an INVERSE displacement field is solved
 * (analytically for Arc / Bulge / Twist, by fixed-point iteration for Flag /
 * Wave) and the source is sampled bilinearly in premultiplied-alpha space.
 * The result replaces the selection as one transparent image layer.
 *
 *   Arc   — exact inverse of a circular bend: θ = (x-cx)/R, r = R-(y-cy)
 *   Bulge — monotonic radial power law, rs = R·(rd/R)^(1+k)
 *   Flag  — horizontal sway by row + vertical ripple by column
 *   Wave  — vertical-dominant sinusoid (the flag's coefficients swapped)
 *
 * Inverse mapping (rather than forward splatting) is what keeps the warped
 * result free of holes: every destination pixel has exactly one source lookup.
 */

import { anchorBelow, makeDraggable, rectOf, resetDrag } from './ui-system';

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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Raster {
  w: number;
  h: number;
  data: ImageData;
  /** page → buffer scale and buffer origin, shared by the inverse mapper */
  kx: number;
  ky: number;
  ox: number;
  oy: number;
}

type Style = 'arc' | 'bulge' | 'flag' | 'wave';

const STYLES: { id: Style; name: string; hint: string; svg: string }[] = [
  {
    id: 'arc',
    name: 'Arc',
    hint: 'Bend the selection around a circular arc',
    svg: '<path d="M3 18 Q12 4 21 18"/><path d="M3 19h18" opacity=".35"/>',
  },
  {
    id: 'bulge',
    name: 'Bulge',
    hint: 'Fisheye magnification from the centre',
    svg: '<path d="M3 12 C7 3 17 3 21 12 C17 21 7 21 3 12Z"/>',
  },
  {
    id: 'flag',
    name: 'Flag',
    hint: 'Horizontal sway, like cloth in the wind',
    svg: '<path d="M4 4v16"/><path d="M4 5 C10 3 14 9 20 6"/><path d="M4 19 C10 17 14 23 20 20"/>',
  },
  {
    id: 'wave',
    name: 'Wave',
    hint: 'Vertical sine wave across the width',
    svg: '<path d="M2 12 Q6 3 10 12 T18 12 T22 12"/>',
  },
];

/* ------------------------------------------------------------------ */
/* Inverse displacement fields (dest → source, in page units)           */
/* ------------------------------------------------------------------ */

function inverse(style: Style, dx: number, dy: number, b: Box, amt: number): [number, number] | null {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  if (style === 'arc') {
    // Forward: x' = cx + r·sinθ ; y' = cy + R − r·cosθ ; r = R − (y − cy)
    // Inverse: θ = atan2(x'−cx, cy+R−y') ; r = hypot(…) ; y = cy+R−r
    const a = 0.16 + amt * 1.0; // half-angle in radians
    const R = Math.max(1, b.w / 2 / a);
    const ex = dx - cx;
    const ey = cy + R - dy;
    const theta = Math.atan2(ex, ey);
    if (Math.abs(theta) > a * 1.03) return null;
    const r = Math.hypot(ex, ey);
    if (r <= 0) return null;
    return [cx + theta * R, cy + R - r];
  }

  if (style === 'bulge') {
    // rd = R·(rs/R)^(1/(1+k)) is strictly increasing, so its inverse is exact:
    // rs = R·(rd/R)^(1+k). k = 0 → identity; k > 0 magnifies the centre.
    const R = Math.max(1, Math.hypot(b.w, b.h) / 2);
    const rd = Math.hypot(dx - cx, dy - cy);
    const k = amt * 1.15;
    if (rd < 1e-6) return [dx, dy];
    const rs = R * Math.pow(Math.min(1, rd / R), 1 + k);
    const ratio = rs / rd;
    return [cx + (dx - cx) * ratio, cy + (dy - cy) * ratio];
  }

  // Flag / Wave. Forward is a coupled sinusoid; invert by fixed-point iteration
  // (it is a contraction for these amplitudes, six steps converge well below
  // a pixel). Both share the solver — only the amplitudes/frequencies differ.
  const isFlag = style === 'flag';
  const A = (isFlag ? 0.24 : 0.05) * amt * b.h; // horizontal sway amplitude
  const B = (isFlag ? 0.07 : 0.22) * amt * b.h; // vertical ripple amplitude
  const kY = (2 * Math.PI * (isFlag ? 1.15 : 1.6)) / Math.max(1, b.h);
  const kX = (2 * Math.PI * (isFlag ? 1.0 : 1.35)) / Math.max(1, b.w);
  let sx = dx;
  let sy = dy;
  for (let i = 0; i < 6; i++) {
    sx = dx - A * Math.sin(kY * (sy - b.y));
    sy = dy - B * Math.sin(kX * (sx - b.x));
  }
  return [sx, sy];
}

/* ------------------------------------------------------------------ */
/* Rasterise the selection, then resample through the inverse field      */
/* ------------------------------------------------------------------ */

function bboxOf(items: any[]): Box | null {
  const bb = (window as any).bb;
  if (typeof bb !== 'function') return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of items) {
    let r: number[];
    try {
      r = bb(s);
    } catch {
      continue;
    }
    if (!r || !r.every(Number.isFinite)) continue;
    x0 = Math.min(x0, r[0]);
    y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r[2]);
    y1 = Math.max(y1, r[3]);
  }
  if (!Number.isFinite(x0) || x1 - x0 < 2 || y1 - y0 < 2) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function rasterise(items: any[], b: Box, pad: number, scale: number): Raster | null {
  const ow = b.w + 2 * pad;
  const oh = b.h + 2 * pad;
  const w = Math.max(2, Math.round(ow * scale));
  const h = Math.max(2, Math.round(oh * scale));
  const cnv = document.createElement('canvas');
  cnv.width = w;
  cnv.height = h;
  const g = cnv.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  const kx = w / ow;
  const ky = h / oh;
  const ox = b.x - pad;
  const oy = b.y - pad;
  g.setTransform(kx, 0, 0, ky, -ox * kx, -oy * ky);
  const stroke = (window as any).stroke;
  if (typeof stroke !== 'function') return null;
  for (const s of items) {
    try {
      stroke(g, s);
    } catch {
      /* one exotic object must not abort the whole warp */
    }
  }
  let data: ImageData;
  try {
    data = g.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  return { w, h, data, kx, ky, ox, oy };
}

/** Bilinear sample in premultiplied alpha, so transparent edges never bleed colour. */
function sample(S: Uint8ClampedArray, w: number, h: number, x: number, y: number, D: Uint8ClampedArray, o: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < -1 || y0 < -1 || x0 >= w || y0 >= h) {
    D[o] = D[o + 1] = D[o + 2] = D[o + 3] = 0;
    return;
  }
  const fx = x - x0;
  const fy = y - y0;
  const ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  const pts = [
    [x0, y0],
    [x0 + 1, y0],
    [x0, y0 + 1],
    [x0 + 1, y0 + 1],
  ];
  let r = 0;
  let g = 0;
  let bl = 0;
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const wt = ws[i];
    const [px, py] = pts[i];
    if (wt <= 0 || px < 0 || py < 0 || px >= w || py >= h) continue;
    const ii = (py * w + px) * 4;
    const al = S[ii + 3] / 255;
    r += wt * S[ii] * al;
    g += wt * S[ii + 1] * al;
    bl += wt * S[ii + 2] * al;
    a += wt * S[ii + 3];
  }
  if (a <= 0.5) {
    D[o] = D[o + 1] = D[o + 2] = D[o + 3] = 0;
    return;
  }
  const inv = 255 / a;
  D[o] = r * inv;
  D[o + 1] = g * inv;
  D[o + 2] = bl * inv;
  D[o + 3] = a;
}

function warpBuffer(src: Raster, b: Box, style: Style, amt: number): HTMLCanvasElement | null {
  const out = document.createElement('canvas');
  out.width = src.w;
  out.height = src.h;
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  const dst = g.createImageData(src.w, src.h);
  const S = src.data.data;
  const D = dst.data;
  for (let j = 0; j < src.h; j++) {
    const dy = src.oy + (j + 0.5) / src.ky;
    for (let i = 0; i < src.w; i++) {
      const dx = src.ox + (i + 0.5) / src.kx;
      const p = inverse(style, dx, dy, b, amt);
      if (!p) continue; // outside the warped surface → stays transparent
      const sx = (p[0] - src.ox) * src.kx - 0.5;
      const sy = (p[1] - src.oy) * src.ky - 0.5;
      sample(S, src.w, src.h, sx, sy, D, (j * src.w + i) * 4);
    }
  }
  g.putImageData(dst, 0, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

const CSS = `
#warp-btn{font-weight:600}
.wp-panel{
  position:fixed;z-index:20;display:none;width:264px;
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);
  border:1px solid var(--bd,#d9d9de);border-radius:16px;
  box-shadow:0 12px 36px rgba(0,0,0,.26);padding:12px;
  font:13px/1.4 var(--slate-font);
}
.wp-head{display:flex;align-items:center;gap:8px;margin:0 0 8px;cursor:grab}
.wp-head b{font-size:13px;font-weight:700;flex:1}
.wp-head small{font-size:10px;color:var(--mu,#6e6e73);font-weight:500}
.wp-x{
  border:0;background:transparent;padding:2px;width:26px;height:26px;
  display:inline-grid;place-items:center;cursor:pointer;flex:none;color:inherit;border-radius:8px;
}
.wp-x:hover{background:rgba(127,127,127,.15)}
.wp-prev{
  width:100%;height:118px;border-radius:10px;border:1px dashed var(--bd,#d9d9de);
  background-color:var(--bg,#e6e9ef);
  background-image:linear-gradient(45deg,rgba(127,127,127,.09) 25%,transparent 25%,transparent 75%,rgba(127,127,127,.09) 75%),
                   linear-gradient(45deg,rgba(127,127,127,.09) 25%,transparent 25%,transparent 75%,rgba(127,127,127,.09) 75%);
  background-size:14px 14px;background-position:0 0,7px 7px;
  display:grid;place-items:center;overflow:hidden;margin-bottom:10px;
}
.wp-prev canvas{max-width:100%;max-height:100%;object-fit:contain}
.wp-empty{font-size:11px;color:var(--mu,#6e6e73);text-align:center;padding:0 8px}
.wp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
.wp-style{
  display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:9px;
  border:1px solid var(--bd,#d9d9de);background:transparent;color:inherit;
  font-size:11.5px;font-weight:600;cursor:pointer;text-align:left;
}
.wp-style:hover{border-color:var(--ac,#2f6df6)}
.wp-style.on{background:color-mix(in srgb,var(--ac,#2f6df6) 13%,transparent);border-color:var(--ac,#2f6df6);color:var(--ac,#2f6df6)}
.wp-style svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.wp-row{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--mu,#6e6e73);margin-bottom:10px}
.wp-row input[type=range]{flex:1;width:auto;min-width:0}
.wp-row output{width:34px;text-align:right;font-variant-numeric:tabular-nums;color:var(--tx,#1c1c1e);font-weight:600}
.wp-foot{display:flex;align-items:center;gap:8px}
.wp-apply{
  flex:1;background:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6);color:#fff;
  border-radius:9px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;
}
.wp-apply:disabled{opacity:.45;cursor:default}
.wp-reset{background:transparent;border-color:var(--bd,#d9d9de);border-radius:9px;padding:8px 10px;font-size:12px;cursor:pointer}
.wp-note{margin:8px 1px 0;font-size:10px;line-height:1.4;color:var(--mu,#6e6e73)}
`;

let panel: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;
let preview: HTMLCanvasElement | null = null;
let previewBox: HTMLElement | null = null;
let emptyLabel: HTMLElement | null = null;
let applyBtn: HTMLButtonElement | null = null;
let amountInput: HTMLInputElement | null = null;
let amountOut: HTMLOutputElement | null = null;
let styleButtons = new Map<Style, HTMLButtonElement>();
let picked: any[] = [];
let box: Box | null = null;
let pad = 32;
let style: Style = 'arc';
let amount = 60;
let raf = 0;
let refreshTimer = 0;

function addButton() {
  const bar = document.getElementById('sbar');
  if (!bar || button) return;
  button = el('button', '', 'Warp') as HTMLButtonElement;
  button.id = 'warp-btn';
  button.type = 'button';
  button.title = 'Warp the selected objects (Transform / Effects)';
  button.setAttribute('aria-label', 'Warp selection');
  button.onclick = (e) => {
    e.stopPropagation();
    if (panel && panel.style.display !== 'none') close();
    else open(button as HTMLElement);
  };
  bar.append(button);
}

function build() {
  if (panel) return;
  panel = el('div', 'wp-panel');
  panel.id = 'warp-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Warp');

  const head = el('div', 'wp-head');
  const title = el('b', '', 'Warp');
  const sub = el('small', '', 'Transform / Effects');
  const x = el('button', 'wp-x') as HTMLButtonElement;
  x.type = 'button';
  x.title = 'Close';
  x.setAttribute('aria-label', 'Close warp panel');
  x.innerHTML = (window as any).__slateUI?.CROSS_SVG ||
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  x.onclick = () => close();
  head.append(title, sub, x);

  previewBox = el('div', 'wp-prev');
  preview = el('canvas') as HTMLCanvasElement;
  preview.id = 'warp-prev';
  emptyLabel = el('div', 'wp-empty', 'Select something on the page to warp it.');
  previewBox.append(preview, emptyLabel);

  const grid = el('div', 'wp-grid');
  for (const s of STYLES) {
    const b = el('button', 'wp-style') as HTMLButtonElement;
    b.type = 'button';
    b.title = s.hint;
    b.dataset.style = s.id;
    b.innerHTML =
      `<svg viewBox="0 0 24 24" aria-hidden="true">${s.svg}</svg><span>${s.name}</span>`;
    b.onclick = () => {
      style = s.id;
      paintStyles();
      schedulePreview();
    };
    grid.append(b);
    styleButtons.set(s.id, b);
  }

  const row = el('label', 'wp-row');
  row.append(el('span', '', 'Intensity'));
  amountInput = el('input') as HTMLInputElement;
  amountInput.type = 'range';
  amountInput.min = '0';
  amountInput.max = '100';
  amountInput.value = String(amount);
  amountInput.setAttribute('aria-label', 'Warp intensity');
  amountOut = el('output', '', `${amount}%`);
  amountInput.oninput = () => {
    amount = Number(amountInput?.value || 0);
    if (amountOut) amountOut.textContent = `${amount}%`;
    schedulePreview();
  };
  row.append(amountInput, amountOut);

  const foot = el('div', 'wp-foot');
  applyBtn = el('button', 'wp-apply', 'Apply warp') as HTMLButtonElement;
  applyBtn.type = 'button';
  applyBtn.onclick = () => apply();
  const reset = el('button', 'wp-reset', 'Reset') as HTMLButtonElement;
  reset.type = 'button';
  reset.title = 'Back to no distortion';
  reset.onclick = () => {
    style = 'arc';
    amount = 60;
    if (amountInput) amountInput.value = '60';
    if (amountOut) amountOut.textContent = '60%';
    paintStyles();
    schedulePreview();
  };
  foot.append(applyBtn, reset);

  const note = el(
    'p',
    'wp-note',
    'Real Canvas pixel displacement. Applying replaces the selection with one transparent layer — Ctrl/Cmd + Z restores the original objects.'
  );

  panel.append(head, previewBox, grid, row, foot, note);
  document.body.append(panel);

  makeDraggable(panel, '.wp-head');

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!panel || panel.style.display === 'none') return;
      const t = e.target as HTMLElement;
      if (panel.contains(t) || (button && button.contains(t))) return;
      close();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && panel.style.display !== 'none') close();
  });
}

function paintStyles() {
  for (const [id, b] of styleButtons) {
    b.classList.toggle('on', id === style);
    b.setAttribute('aria-pressed', id === style ? 'true' : 'false');
  }
}

function captureSelection() {
  // Erasers are page-wide subtractions and videos are live DOM elements —
  // neither can be baked into a static pixel layer. Everything else can.
  picked = (ev<any[]>('sel') || []).filter((s) => s && s.t !== 'ers' && s.t !== 'vid');
  box = bboxOf(picked);
  pad = box ? Math.max(28, Math.round(Math.max(box.w, box.h) * 0.34)) : 32;
  if (applyBtn) applyBtn.disabled = !box || !picked.length;
}

function schedulePreview() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderPreview();
  });
}

function renderPreview() {
  if (!preview || !previewBox || !emptyLabel || !box || !picked.length) {
    if (preview) preview.style.display = 'none';
    if (emptyLabel) emptyLabel.style.display = 'block';
    return;
  }
  const ow = box.w + 2 * pad;
  const oh = box.h + 2 * pad;
  const scale = Math.max(0.15, Math.min(1, 238 / ow, 116 / oh));
  const src = rasterise(picked, box, pad, scale);
  const out = src ? warpBuffer(src, box, style, amount / 100) : null;
  if (!out) {
    preview.style.display = 'none';
    emptyLabel.style.display = 'block';
    return;
  }
  emptyLabel.style.display = 'none';
  preview.style.display = 'block';
  preview.width = out.width;
  preview.height = out.height;
  const g = preview.getContext('2d');
  if (g) {
    g.clearRect(0, 0, preview.width, preview.height);
    g.drawImage(out, 0, 0);
  }
}

function open(trigger: HTMLElement) {
  build();
  if (!panel) return;
  captureSelection();
  // Freeze the trigger rect before anything can hide or rebuild it — the
  // lesson from the off-screen popover bug.
  const r = rectOf(trigger);
  panel.style.display = 'block';
  resetDrag(panel);
  panel.style.display = 'block';
  anchorBelow(panel, r, { align: 'center' });
  paintStyles();
  renderPreview();
  // Images inside the selection may finish decoding a frame later.
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    if (!panel || panel.style.display === 'none') return;
    captureSelection();
    renderPreview();
  }, 320);
}

function close() {
  if (!panel) return;
  panel.style.display = 'none';
  resetDrag(panel);
}

function apply(): boolean {
  captureSelection();
  if (!box || !picked.length) return false;
  const ow = box.w + 2 * pad;
  const oh = box.h + 2 * pad;
  // Cap the work at roughly 0.9 MP so the warp stays interactive.
  const scale = Math.max(1, Math.min(2, Math.sqrt(900000 / (ow * oh))));
  const src = rasterise(picked, box, pad, scale);
  if (!src) return false;
  const out = warpBuffer(src, box, style, amount / 100);
  if (!out) return false;

  const url = out.toDataURL('image/png');
  const strokes = ev<any[]>('pg().strokes');
  if (!strokes) return false;

  // One undo step, captured before the mutation.
  ev('try{ snap(); }catch(e){}');
  const layerStroke = {
    t: 'img',
    src: url,
    x: box.x - pad,
    y: box.y - pad,
    w: ow,
    h: oh,
    ts: Date.now(),
  };
  const first = strokes.findIndex((s) => picked.indexOf(s) !== -1);
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (picked.indexOf(strokes[i]) !== -1) strokes.splice(i, 1);
  }
  strokes.splice(first < 0 ? strokes.length : Math.min(first, strokes.length), 0, layerStroke);
  ev('try{ sel=[]; draw(); save(); thumbs(); }catch(e){}');
  ev('try{ toast("Warp applied — Ctrl/Cmd + Z to undo"); }catch(e){}');
  close();
  return true;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  const s = document.createElement('style');
  s.textContent = CSS;
  s.id = 'warp-style';
  if (!document.getElementById('warp-style')) document.head.append(s);

  // Watch for a selection so the panel can refresh its snapshot; the button
  // itself is inserted as soon as the engine's contextual bar exists.
  let lastSig = '';
  window.setInterval(() => {
    addButton();
    const sel = ev<any[]>('sel') || [];
    const sig =
      sel.length +
      ':' +
      sel
        .map((x) =>
          [x && x.t, x && x.k, x && x.a && x.a[0], x && x.b && x.b[0], x && x.x, x && x.y].join(':')
        )
        .join('|');
    if (sig !== lastSig) {
      lastSig = sig;
      if (panel && panel.style.display !== 'none') {
        captureSelection();
        schedulePreview();
      }
    }
  }, 260);

  (window as any).__slateWarp = {
    open: () => open((button || document.getElementById('sbar')) as HTMLElement),
    close,
    apply,
    styles: STYLES.map((s) => s.id),
    setStyle: (id: Style) => {
      style = id;
      paintStyles();
      schedulePreview();
    },
    setAmount: (n: number) => {
      amount = Math.max(0, Math.min(100, n));
      if (amountInput) amountInput.value = String(amount);
      if (amountOut) amountOut.textContent = `${amount}%`;
      schedulePreview();
    },
    inverse,
    rasterise,
    warpBuffer,
    state: () => ({ style, amount, picked: picked.length, box }),
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
