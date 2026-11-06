/**
 * Warp — a Transform / Effects action in the contextual selection bar.
 *
 * This is a genuine pixel transformation, not a CSS filter or a decorative
 * preview. The selected objects are rasterised into an offscreen Canvas 2D
 * buffer; for every destination pixel an INVERSE displacement field is solved
 * and the source is sampled bilinearly in premultiplied-alpha space. The result
 * replaces the selection as one transparent image layer.
 *
 *   Arc    — exact inverse of a circular bend: θ = (x-cx)/R, r = R-(y-cy)
 *   Bulge  — monotonic radial power law, rs = R·(rd/R)^(1+k)
 *   Flag   — horizontal sway by row + vertical ripple by column
 *   Wave   — vertical-dominant sinusoid (the flag's coefficients swapped)
 *   Manual — a draggable mesh; each cell is split into two triangles and the
 *            source is found by barycentric inverse mapping
 *
 * Inverse mapping (rather than forward splatting) is what keeps the warped
 * result free of holes: every destination pixel has exactly one source lookup.
 *
 * The preview is drawn twice from one buffer: a thumbnail inside the panel and
 * a live composite straight onto the page canvas, so the effect is visible on
 * the object itself while the intensity slider or a mesh node is being dragged.
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

type Pt = [number, number];

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

type Style = 'arc' | 'bulge' | 'flag' | 'wave' | 'manual';

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
  {
    id: 'manual',
    name: 'Manual',
    hint: 'Drag the mesh nodes to shape the selection by hand',
    svg:
      '<path d="M4 4h16v16H4z" opacity=".55"/><path d="M4 12h16M12 4v16" opacity=".55"/>' +
      '<circle cx="4" cy="4" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="4" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="20" cy="4" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="4" cy="12" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="20" cy="12" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="4" cy="20" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="20" r="2.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="20" cy="20" r="2.1" fill="currentColor" stroke="none"/>',
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

  if (style === 'manual') return [dx, dy];

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
/* Manual mesh                                                         */
/* ------------------------------------------------------------------ */

/** Cells per axis. 3×3 means a 4×4 grid of draggable nodes. */
const MESH = { cols: 3, rows: 3 };
/** Node positions in PAGE units. Empty until a selection is captured. */
let mesh: Pt[] = [];
/** The box + pad the current mesh was built for, so a rebuild is detectable. */
let meshKey = '';

function meshPoints(b: Box, pad: number, cols: number, rows: number): Pt[] {
  const x0 = b.x - pad;
  const y0 = b.y - pad;
  const x1 = b.x + b.w + pad;
  const y1 = b.y + b.h + pad;
  const out: Pt[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      out.push([x0 + ((x1 - x0) * i) / cols, y0 + ((y1 - y0) * j) / rows]);
    }
  }
  return out;
}

function resetMesh(force = false) {
  if (!box) {
    mesh = [];
    meshKey = '';
    return;
  }
  const key = `${Math.round(box.x)}|${Math.round(box.y)}|${Math.round(box.w)}|${Math.round(box.h)}|${pad}|${MESH.cols}|${MESH.rows}`;
  if (!force && key === meshKey && mesh.length) return;
  meshKey = key;
  mesh = meshPoints(box, pad, MESH.cols, MESH.rows);
  buildMeshDom();
  placeMesh();
}

/**
 * Barycentric coordinates of P inside triangle A,B,C.
 * Returns [u, v, w] with P = u·A + v·B + w·C, or null for a degenerate triangle.
 */
function bary(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  px: number, py: number
): [number, number, number] | null {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  return [u, v, 1 - u - v];
}

/**
 * Mesh warp.
 *
 * Every grid cell becomes two triangles. A triangle is an affine map, so the
 * inverse is a plain barycentric solve — exact, hole-free and cheap. Iterating
 * the destination triangle's bounding box (rather than the whole buffer) keeps
 * the cost proportional to the deformed area.
 */
function manualWarp(
  src: Raster,
  nodes: Pt[],
  cols: number,
  rows: number,
  b: Box,
  padding: number
): HTMLCanvasElement | null {
  const out = document.createElement('canvas');
  out.width = src.w;
  out.height = src.h;
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  const dst = g.createImageData(src.w, src.h);
  const S = src.data.data;
  const D = dst.data;

  const toBuf = (p: Pt): Pt => [(p[0] - src.ox) * src.kx, (p[1] - src.oy) * src.ky];
  const basePage = meshPoints(b, padding, cols, rows);
  const base: Pt[] = basePage.map(toBuf);
  const dest: Pt[] = basePage.map((p, i) => toBuf(nodes[i] || p));

  const tri = (a: number, bb: number, c: number) => {
    const D0 = dest[a];
    const D1 = dest[bb];
    const D2 = dest[c];
    if (!D0 || !D1 || !D2) return;
    const den = (D1[1] - D2[1]) * (D0[0] - D2[0]) + (D2[0] - D1[0]) * (D0[1] - D2[1]);
    if (Math.abs(den) < 1e-9) return;
    const S0 = base[a];
    const S1 = base[bb];
    const S2 = base[c];

    const minX = Math.max(0, Math.floor(Math.min(D0[0], D1[0], D2[0])));
    const maxX = Math.min(src.w - 1, Math.ceil(Math.max(D0[0], D1[0], D2[0])));
    const minY = Math.max(0, Math.floor(Math.min(D0[1], D1[1], D2[1])));
    const maxY = Math.min(src.h - 1, Math.ceil(Math.max(D0[1], D1[1], D2[1])));

    for (let j = minY; j <= maxY; j++) {
      const py = j + 0.5;
      for (let i = minX; i <= maxX; i++) {
        const px = i + 0.5;
        const u = ((D1[1] - D2[1]) * (px - D2[0]) + (D2[0] - D1[0]) * (py - D2[1])) / den;
        const v = ((D2[1] - D0[1]) * (px - D2[0]) + (D0[0] - D2[0]) * (py - D2[1])) / den;
        const w = 1 - u - v;
        // A hair of tolerance closes the seam along the shared diagonal.
        if (u < -0.0005 || v < -0.0005 || w < -0.0005) continue;
        const sx = u * S0[0] + v * S1[0] + w * S2[0] - 0.5;
        const sy = u * S0[1] + v * S1[1] + w * S2[1] - 0.5;
        sample(S, src.w, src.h, sx, sy, D, (j * src.w + i) * 4);
      }
    }
  };

  const at = (i: number, j: number) => i + j * (cols + 1);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i, j);
      const bb = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      tri(a, bb, c);
      tri(a, c, d);
    }
  }

  g.putImageData(dst, 0, 0);
  return out;
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

/** External images taint a canvas, which makes getImageData() throw. */
function isSafe(s: any): boolean {
  if (!s) return false;
  if (s.t !== 'img') return true;
  return /^data:/i.test(String(s.src || ''));
}

function drawItems(items: any[], b: Box, pad: number, scale: number): Raster | null {
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
    // SecurityError: an external image was drawn. The caller retries without it.
    return null;
  }
  return { w, h, data, kx, ky, ox, oy };
}

interface RasterResult {
  raster: Raster | null;
  /** items actually baked into `raster` — what Apply is allowed to replace */
  used: any[];
  /** items left out because they would taint the buffer */
  skipped: any[];
  tainted: boolean;
}

function rasterise(items: any[], b: Box, pad: number, scale: number): RasterResult {
  const all = drawItems(items, b, pad, scale);
  if (all) return { raster: all, used: items.slice(), skipped: [], tainted: false };

  const safe = items.filter(isSafe);
  const skipped = items.filter((s) => !isSafe(s));
  if (safe.length) {
    const retry = drawItems(safe, b, pad, scale);
    if (retry) return { raster: retry, used: safe, skipped, tainted: true };
  }
  return { raster: null, used: safe, skipped, tainted: true };
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

/** One entry point so preview and Apply can never disagree. */
function buildField(src: Raster, b: Box): HTMLCanvasElement | null {
  if (style === 'manual') return manualWarp(src, mesh, MESH.cols, MESH.rows, b, pad);
  return warpBuffer(src, b, style, amount / 100);
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

const CSS = `
#warp-btn{font-weight:600}
.wp-panel{
  position:fixed;z-index:20;display:none;width:280px;
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
  width:100%;height:132px;border-radius:10px;border:1px solid var(--bd,#d9d9de);
  background-color:#f4f6fa;
  background-image:linear-gradient(45deg,rgba(127,127,127,.12) 25%,transparent 25%,transparent 75%,rgba(127,127,127,.12) 75%),
                   linear-gradient(45deg,rgba(127,127,127,.12) 25%,transparent 25%,transparent 75%,rgba(127,127,127,.12) 75%);
  background-size:14px 14px;background-position:0 0,7px 7px;
  display:grid;place-items:center;overflow:hidden;margin-bottom:10px;
  position:relative;
}
.wp-prev canvas{max-width:100%;max-height:100%;object-fit:contain;display:block}
.wp-empty{
  font-size:11px;line-height:1.35;color:var(--mu,#6e6e73);text-align:center;
  padding:0 12px;max-width:100%;
}
.wp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
.wp-style{
  display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:9px;
  border:1px solid var(--bd,#d9d9de);background:transparent;color:inherit;
  font-size:11.5px;font-weight:600;cursor:pointer;text-align:left;
}
.wp-style:hover{border-color:var(--ac,#2f6df6)}
.wp-style.on{background:color-mix(in srgb,var(--ac,#2f6df6) 13%,transparent);border-color:var(--ac,#2f6df6);color:var(--ac,#2f6df6)}
.wp-style.wide{grid-column:1/-1}
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
.wp-note.warn{color:#b4690e}
.wp-manual{display:none;margin-bottom:10px}
.wp-manual.on{display:block}
.wp-meshrow{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mu,#6e6e73);margin-bottom:6px}
.wp-meshrow span{flex:1}
.wp-mbtn{
  border:1px solid var(--bd,#d9d9de);background:transparent;color:inherit;
  border-radius:7px;padding:3px 7px;font-size:10.5px;font-weight:600;cursor:pointer;
}
.wp-mbtn.on{background:color-mix(in srgb,var(--ac,#2f6df6) 14%,transparent);border-color:var(--ac,#2f6df6);color:var(--ac,#2f6df6)}
.wp-mreset{
  width:100%;border:1px dashed var(--bd,#d9d9de);background:transparent;color:var(--mu,#6e6e73);
  border-radius:8px;padding:5px;font-size:10.5px;cursor:pointer;
}
.wp-mreset:hover{border-color:var(--ac,#2f6df6);color:var(--ac,#2f6df6)}
/* ---- manual mesh overlay ---- */
#wm-layer{position:fixed;inset:0;pointer-events:none;z-index:14;overflow:hidden;display:none}
#wm-layer.on{display:block}
#wm-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
#wm-svg path{fill:none;stroke:var(--ac,#2f6df6);stroke-width:1.1;opacity:.5}
.wm-node{
  position:absolute;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;border-radius:50%;
  background:#fff;border:2px solid var(--ac,#2f6df6);
  box-shadow:0 1px 4px rgba(0,0,0,.3);
  pointer-events:auto;cursor:grab;touch-action:none;
  transition:transform .1s ease;
}
.wm-node:hover{transform:scale(1.22)}
.wm-node.on{cursor:grabbing;transform:scale(1.3);background:var(--ac,#2f6df6)}
`;

let panel: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;
let preview: HTMLCanvasElement | null = null;
let previewBox: HTMLElement | null = null;
let emptyLabel: HTMLElement | null = null;
let applyBtn: HTMLButtonElement | null = null;
let amountInput: HTMLInputElement | null = null;
let amountOut: HTMLOutputElement | null = null;
let manualBlock: HTMLElement | null = null;
let noteEl: HTMLElement | null = null;
let styleButtons = new Map<Style, HTMLButtonElement>();
let meshSizeButtons: HTMLButtonElement[] = [];
let picked: any[] = [];
let box: Box | null = null;
let pad = 32;
let style: Style = 'arc';
let amount = 60;
let raf = 0;
let refreshTimer = 0;
let retryTimer = 0;

/** The most recent warped buffer, shared by the thumbnail and the page preview. */
let lastOut: HTMLCanvasElement | null = null;
let lastBox: Box | null = null;
/** True only while the panel is open, so draw() never paints a stale preview. */
let liveActive = false;
/** Items that could not be baked (external images) — reported, never destroyed. */
let skippedItems: any[] = [];

/* ---- mesh overlay refs ---- */
let meshLayer: HTMLElement | null = null;
let meshSvg: SVGSVGElement | null = null;
let meshNodesEl: HTMLElement[] = [];
let meshDrag: { idx: number; id: number } | null = null;

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
  x.innerHTML =
    (window as any).__slateUI?.CROSS_SVG ||
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
    if (s.id === 'manual') b.classList.add('wide');
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${s.svg}</svg><span>${s.name}</span>`;
    b.onclick = () => {
      style = s.id;
      paintStyles();
      if (style === 'manual') {
        resetMesh(true);
        showMesh();
      } else hideMesh();
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

  /* ---- manual mesh controls ---- */
  manualBlock = el('div', 'wp-manual');
  const meshRow = el('div', 'wp-meshrow');
  meshRow.append(el('span', '', 'Mesh'));
  for (const n of [2, 3, 4]) {
    const b = el('button', 'wp-mbtn', `${n}×${n}`) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.n = String(n);
    b.onclick = () => {
      MESH.cols = n;
      MESH.rows = n;
      resetMesh(true);
      paintMeshButtons();
      schedulePreview();
    };
    meshRow.append(b);
    meshSizeButtons.push(b);
  }
  const mReset = el('button', 'wp-mreset', 'Reset nodes') as HTMLButtonElement;
  mReset.type = 'button';
  mReset.onclick = () => {
    resetMesh(true);
    schedulePreview();
  };
  manualBlock.append(meshRow, mReset);
  manualBlock.append(el('p', 'wp-note', 'Drag any node on the page to shape the warp.'));
  paintMeshButtons();

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
    hideMesh();
    paintStyles();
    schedulePreview();
  };
  foot.append(applyBtn, reset);

  noteEl = el(
    'p',
    'wp-note',
    'Real Canvas pixel displacement. Applying replaces the selection with one transparent layer — Ctrl/Cmd + Z restores the original objects.'
  );

  panel.append(head, previewBox, grid, row, manualBlock, foot, noteEl);
  document.body.append(panel);

  makeDraggable(panel, '.wp-head');

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!panel || panel.style.display === 'none') return;
      const t = e.target as HTMLElement;
      if (panel.contains(t) || (button && button.contains(t))) return;
      // The mesh handles live outside the panel but belong to it.
      if (meshLayer && meshLayer.contains(t)) return;
      close();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && panel.style.display !== 'none') close();
  });
}

function paintMeshButtons() {
  for (const b of meshSizeButtons) {
    b.classList.toggle('on', Number(b.dataset.n) === MESH.cols);
  }
}

function paintStyles() {
  for (const [id, b] of styleButtons) {
    b.classList.toggle('on', id === style);
    b.setAttribute('aria-pressed', id === style ? 'true' : 'false');
  }
  manualBlock?.classList.toggle('on', style === 'manual');
}

function captureSelection() {
  // Erasers are page-wide subtractions and videos are live DOM elements —
  // neither can be baked into a static pixel layer. Everything else can.
  picked = (ev<any[]>('sel') || []).filter((s) => s && s.t !== 'ers' && s.t !== 'vid');
  box = bboxOf(picked);
  pad = box ? Math.max(28, Math.round(Math.max(box.w, box.h) * 0.34)) : 32;
  if (applyBtn) applyBtn.disabled = !box || !picked.length;
  resetMesh();
}

function schedulePreview() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderPreview();
  });
}

function showEmpty(msg: string) {
  if (preview) preview.style.display = 'none';
  if (emptyLabel) {
    emptyLabel.style.display = 'block';
    emptyLabel.textContent = msg;
  }
}

/** Any selected image still decoding? Then the raster is missing it. */
function pendingImages(): number {
  const IM = ev<Record<string, HTMLImageElement>>('IM');
  if (!IM) return 0;
  let n = 0;
  for (const s of picked) {
    if (!s || s.t !== 'img' || !s.src) continue;
    const i = IM[s.src];
    if (!i || !i.complete || !i.naturalWidth) n++;
  }
  return n;
}

function setNote(msg: string, warn = false) {
  if (!noteEl) return;
  noteEl.textContent = msg;
  noteEl.classList.toggle('warn', warn);
}

const DEFAULT_NOTE =
  'Real Canvas pixel displacement. Applying replaces the selection with one transparent layer — Ctrl/Cmd + Z restores the original objects.';

function renderPreview(tries = 0) {
  if (!preview || !previewBox || !emptyLabel) return;

  if (!box || !picked.length) {
    showEmpty('Select something on the page to warp it.');
    lastOut = null;
    lastBox = null;
    skippedItems = [];
    setNote(DEFAULT_NOTE);
    paintLive();
    return;
  }

  const ow = box.w + 2 * pad;
  const oh = box.h + 2 * pad;
  // One buffer serves both surfaces: big enough for the page, small enough to
  // stay interactive while a slider or a mesh node is moving.
  const scale = Math.max(0.2, Math.min(2, 560 / Math.max(ow, oh)));
  const res = rasterise(picked, box, pad, scale);
  skippedItems = res.skipped;

  if (!res.raster) {
    showEmpty(
      res.tainted
        ? 'This selection is an image loaded from another site, so its pixels cannot be read. Select drawn strokes, or a pasted image.'
        : 'Could not read this selection. Try selecting the objects again.'
    );
    lastOut = null;
    lastBox = null;
    setNote(
      res.tainted
        ? 'Cross-origin images cannot be pixel-sampled by the browser. Warp works on strokes, text, shapes and pasted (data-URL) images.'
        : DEFAULT_NOTE,
      res.tainted
    );
    paintLive();
    return;
  }

  const out = buildField(res.raster, box);
  if (!out) {
    showEmpty('Could not build the warp field. Try a smaller selection.');
    lastOut = null;
    paintLive();
    return;
  }

  lastOut = out;
  lastBox = { x: box.x - pad, y: box.y - pad, w: ow, h: oh };

  emptyLabel.style.display = 'none';
  preview.style.display = 'block';
  preview.width = out.width;
  preview.height = out.height;
  const g = preview.getContext('2d');
  if (g) {
    g.clearRect(0, 0, preview.width, preview.height);
    g.drawImage(out, 0, 0);
  }

  if (res.skipped.length) {
    setNote(
      `Applied to the drawn content only — ${res.skipped.length} external image${
        res.skipped.length > 1 ? 's were' : ' was'
      } left untouched.`,
      true
    );
  } else {
    setNote(DEFAULT_NOTE);
  }

  paintLive();

  // A sticker or pasted image may finish decoding after the first pass; refresh
  // until every selected image is ready rather than showing a half-empty warp.
  const waiting = pendingImages();
  if (waiting > 0 && tries < 10) {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => renderPreview(tries + 1), 180);
  }
}

/**
 * Composite the warped buffer straight onto the page canvas.
 *
 * `draw()` paints the whole page; we re-render it without the selected objects
 * and then lay the warped layer over their exact footprint. Nothing in the
 * document changes, so closing the panel simply repaints and the originals are
 * back — there is no "preview" copy to undo.
 */
function paintLive() {
  if (!liveActive || !panel || panel.style.display === 'none') return;
  if (!lastOut || !lastBox) return;
  const ctx = ev<CanvasRenderingContext2D>('ctx');
  const page = ev<any>('pg()');
  const render = (window as any).render;
  if (!ctx || !page || typeof render !== 'function') return;

  const keep = (page.strokes || []).filter((s: any) => picked.indexOf(s) === -1);
  try {
    render(ctx, Object.assign({}, page, { strokes: keep }), null);
    ctx.drawImage(lastOut, lastBox.x, lastBox.y, lastBox.w, lastBox.h);
  } catch {
    return;
  }

  // Keep the selection frame so it is obvious which objects are being warped.
  if (box) {
    ctx.save();
    ctx.strokeStyle = '#2f6df6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
    ctx.restore();
  }
}

function hookDraw() {
  ev(`(function(){
    if (window.__warpDrawHooked) return;
    window.__warpDrawHooked = 1;
    var od = draw;
    draw = function(){
      var r = od.apply(this, arguments);
      try { window.__slateWarp && window.__slateWarp.paintLive(); } catch (e) {}
      return r;
    };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Mesh overlay (Manual warp)                                          */
/* ------------------------------------------------------------------ */

function canvasEl(): HTMLCanvasElement | null {
  return document.getElementById('cv') as HTMLCanvasElement | null;
}

/** Page units → viewport pixels, matching the engine's own scaling. */
function toScreen(x: number, y: number): Pt {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return [x, y];
  const r = cv.getBoundingClientRect();
  return [r.left + (x / W) * r.width, r.top + (y / H) * r.height];
}

/** Viewport pixels → page units. */
function toPage(clientX: number, clientY: number): Pt {
  const cv = canvasEl();
  const W = ev<number>('W') || 800;
  const H = ev<number>('H') || 1100;
  if (!cv) return [clientX, clientY];
  const r = cv.getBoundingClientRect();
  return [((clientX - r.left) / (r.width || 1)) * W, ((clientY - r.top) / (r.height || 1)) * H];
}

function ensureMeshLayer() {
  if (meshLayer) return;
  meshLayer = el('div');
  meshLayer.id = 'wm-layer';
  meshSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  meshSvg.id = 'wm-svg';
  meshLayer.append(meshSvg);
  document.body.append(meshLayer);

  window.addEventListener('pointermove', (e) => {
    if (!meshDrag) return;
    const p = toPage(e.clientX, e.clientY);
    mesh[meshDrag.idx] = p;
    placeMesh();
    schedulePreview();
  });
  const stop = () => {
    if (!meshDrag) return;
    meshNodesEl[meshDrag.idx]?.classList.remove('on');
    meshDrag = null;
  };
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  window.addEventListener('blur', stop);
}

function buildMeshDom() {
  ensureMeshLayer();
  if (!meshLayer) return;
  // Reuse handles across size changes so dragging is never interrupted.
  while (meshNodesEl.length > mesh.length) {
    meshNodesEl.pop()?.remove();
  }
  while (meshNodesEl.length < mesh.length) {
    const idx = meshNodesEl.length;
    const n = el('div', 'wm-node');
    n.dataset.i = String(idx);
    n.setAttribute('role', 'slider');
    n.setAttribute('aria-label', `Mesh node ${idx + 1}`);
    n.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      meshDrag = { idx, id: e.pointerId };
      n.classList.add('on');
      try {
        n.setPointerCapture(e.pointerId);
      } catch {
        /* window listeners cover a lost capture */
      }
    });
    meshLayer.append(n);
    meshNodesEl.push(n);
  }
}

function showMesh() {
  ensureMeshLayer();
  if (!meshLayer) return;
  meshLayer.classList.add('on');
  resetMesh();
  placeMesh();
}

function hideMesh() {
  meshLayer?.classList.remove('on');
  meshDrag = null;
}

function placeMesh() {
  if (!meshLayer || !meshSvg) return;
  if (!liveActive || style !== 'manual' || !mesh.length || !box) {
    meshLayer.classList.remove('on');
    return;
  }
  meshLayer.classList.add('on');

  const cols = MESH.cols;
  const rows = MESH.rows;
  const scr = mesh.map((p) => toScreen(p[0], p[1]));

  // grid lines: one polyline per row and per column
  let d = '';
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const p = scr[i + j * (cols + 1)];
      d += (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
  }
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const p = scr[i + j * (cols + 1)];
      d += (j === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
  }
  meshSvg.innerHTML = `<path d="${d}"/>`;

  for (let i = 0; i < meshNodesEl.length && i < scr.length; i++) {
    const n = meshNodesEl[i];
    n.style.left = scr[i][0] + 'px';
    n.style.top = scr[i][1] + 'px';
  }
}

/* ------------------------------------------------------------------ */
/* Open / close / apply                                                */
/* ------------------------------------------------------------------ */

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
  paintMeshButtons();
  liveActive = true;
  if (style === 'manual') showMesh();
  else hideMesh();
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
  const wasLive = liveActive;
  liveActive = false;
  panel.style.display = 'none';
  resetDrag(panel);
  hideMesh();
  lastOut = null;
  lastBox = null;
  window.clearTimeout(retryTimer);
  // Repaint so the page goes back to the real, unwarped objects.
  if (wasLive) ev('try{ draw(); }catch(e){}');
}

function apply(): boolean {
  captureSelection();
  if (!box || !picked.length) return false;
  const ow = box.w + 2 * pad;
  const oh = box.h + 2 * pad;
  // Cap the work at roughly 0.9 MP so the warp stays interactive.
  const scale = Math.max(1, Math.min(2, Math.sqrt(900000 / (ow * oh))));
  const res = rasterise(picked, box, pad, scale);
  if (!res.raster) {
    ev(
      `try{ toast("${
        res.tainted
          ? 'That image is loaded from another site, so it cannot be warped.'
          : 'Could not warp this selection.'
      }"); }catch(e){}`
    );
    return false;
  }
  const out = buildField(res.raster, box);
  if (!out) return false;

  const url = out.toDataURL('image/png');
  const strokes = ev<any[]>('pg().strokes');
  if (!strokes) return false;

  // Only the objects that actually went into the buffer are replaced; an
  // external image that had to be skipped stays on the page untouched.
  const used = res.used;
  if (!used.length) return false;

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
  const first = strokes.findIndex((s) => used.indexOf(s) !== -1);
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (used.indexOf(strokes[i]) !== -1) strokes.splice(i, 1);
  }
  strokes.splice(first < 0 ? strokes.length : Math.min(first, strokes.length), 0, layerStroke);
  liveActive = false;
  hideMesh();
  ev('try{ sel=[]; draw(); save(); thumbs(); }catch(e){}');
  ev(
    `try{ toast("${
      res.skipped.length
        ? 'Warp applied — external image left unchanged'
        : 'Warp applied — Ctrl/Cmd + Z to undo'
    }"); }catch(e){}`
  );
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

  ensureMeshLayer();
  hookDraw();

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
        if (style === 'manual') showMesh();
        schedulePreview();
      }
    }
  }, 260);

  window.addEventListener('resize', () => {
    if (liveActive) {
      placeMesh();
      paintLive();
    }
  });

  (window as any).__slateWarp = {
    open: () => open((button || document.getElementById('sbar')) as HTMLElement),
    close,
    apply,
    styles: STYLES.map((s) => s.id),
    setStyle: (id: Style) => {
      style = id;
      paintStyles();
      if (style === 'manual') {
        resetMesh(true);
        showMesh();
      } else hideMesh();
      schedulePreview();
    },
    setAmount: (n: number) => {
      amount = Math.max(0, Math.min(100, n));
      if (amountInput) amountInput.value = String(amount);
      if (amountOut) amountOut.textContent = `${amount}%`;
      schedulePreview();
    },
    // ---- mesh surface, used by the regression probe ----
    mesh: () => mesh.map((p) => [p[0], p[1]] as Pt),
    meshSize: () => ({ cols: MESH.cols, rows: MESH.rows }),
    setMeshSize: (cols: number, rows: number) => {
      MESH.cols = Math.max(1, Math.min(6, cols));
      MESH.rows = Math.max(1, Math.min(6, rows));
      resetMesh(true);
      paintMeshButtons();
      schedulePreview();
    },
    setNode: (i: number, x: number, y: number) => {
      if (!mesh[i]) return false;
      mesh[i] = [x, y];
      placeMesh();
      schedulePreview();
      return true;
    },
    resetMesh: () => {
      resetMesh(true);
      schedulePreview();
    },
    live: () => ({
      active: liveActive,
      out: lastOut ? [lastOut.width, lastOut.height] : null,
      box: lastBox,
      skipped: skippedItems.length,
    }),
    inverse,
    rasterise,
    warpBuffer,
    manualWarp,
    state: () => ({ style, amount, picked: picked.length, box }),
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
