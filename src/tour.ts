/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guided tours + install guide for Inkpad.
 *
 * - A spotlight tour for the Home / library screen.
 * - A tool-by-tool tour inside the editor. Every step carries a looping canvas
 *   animation that shows the tool actually being used, so new users can see
 *   what a tool does instead of reading about it.
 * - A platform-aware "Add to Home Screen" guide for iOS/iPadOS and Android.
 *
 * The animations are drawn with Canvas 2D at runtime (no video files): they
 * stay crisp at any DPR, work offline, and cost a few kB instead of megabytes.
 */

/* ------------------------------------------------------------------ */
/* Tiny helpers                                                        */
/* ------------------------------------------------------------------ */

function el(tag: string, css = '', text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
}

/** Same as el(), but the third argument is parsed as HTML. */
function elHTML(tag: string, css = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  e.innerHTML = html;
  return e;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T | null;

function isVisible(e: Element | null): boolean {
  if (!e) return false;
  const r = e.getBoundingClientRect();
  return r.width > 1 && r.height > 1 && getComputedStyle(e as HTMLElement).visibility !== 'hidden';
}

function rectOf(e: Element | null): DOMRect | null {
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 || r.height > 0 ? r : null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function byText(sel: string, text: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) =>
      (e.textContent || '').toLowerCase().includes(text.toLowerCase())
    ) || null
  );
}

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;

/** True once the browser offers a one-tap PWA install. */
let canPromptInstall = false;
window.addEventListener('beforeinstallprompt', () => {
  canPromptInstall = true;
});

/* ------------------------------------------------------------------ */
/* Demo animation engine                                               */
/* ------------------------------------------------------------------ */

type Draw = (g: CanvasRenderingContext2D, w: number, h: number, p: number) => void;
interface Demo {
  ms: number;
  draw: Draw;
}

const INK = '#16307a';
const ACC = '#2f6df6';

function paper(g: CanvasRenderingContext2D, w: number, h: number, margin = true) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e5ecf9';
  g.lineWidth = 1;
  for (let y = 20; y < h; y += 20) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(w, y + 0.5);
    g.stroke();
  }
  if (margin) {
    g.strokeStyle = 'rgba(244,112,140,.42)';
    g.beginPath();
    g.moveTo(w * 0.17, 0);
    g.lineTo(w * 0.17, h);
    g.stroke();
  }
}

function cubicPt(
  p0: number[],
  p1: number[],
  p2: number[],
  p3: number[],
  t: number
): number[] {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** A signature-like S curve scaled into the canvas. */
function sPath(w: number, h: number, n = 64): number[][] {
  const P0 = [w * 0.1, h * 0.76];
  const P1 = [w * 0.32, h * 0.18];
  const P2 = [w * 0.56, h * 0.52];
  const P3 = [w * 0.9, h * 0.26];
  const out: number[][] = [];
  for (let i = 0; i <= n; i++) out.push(cubicPt(P0, P1, P2, P3, i / n));
  return out;
}

/** Fill a variable-width ribbon through the given points. */
function ribbon(
  g: CanvasRenderingContext2D,
  pts: number[][],
  widthAt: (i: number, n: number) => number,
  color: string,
  alpha = 1
) {
  if (pts.length < 2) return;
  const L: number[][] = [];
  const R: number[][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const hw = widthAt(i, n) / 2;
    L.push([pts[i][0] - dy * hw, pts[i][1] + dx * hw]);
    R.push([pts[i][0] + dy * hw, pts[i][1] - dx * hw]);
  }
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fill();
  g.restore();
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function chip(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  bg: string,
  fg: string,
  size = 10
) {
  g.save();
  g.font = `600 ${size}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
  const tw = g.measureText(label).width;
  const w = tw + size * 1.5;
  const h = size * 1.9;
  g.fillStyle = bg;
  roundRect(g, x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.fillText(label, x + size * 0.75, y + h / 2 + 0.5);
  g.restore();
  return w;
}

const DEMOS: Record<string, Demo> = {
  /* --- pen: pressure-tapered ink --------------------------------- */
  pen: {
    ms: 2600,
    draw(g, w, h, p) {
      paper(g, w, h);
      const all = sPath(w, h);
      const n = Math.max(2, Math.round(all.length * clamp(p * 1.08, 0, 1)));
      const pts = all.slice(0, n);
      ribbon(
        g,
        pts,
        (i) => 1.5 + 6.4 * Math.pow(Math.sin(Math.PI * (i / (all.length - 1))), 0.55),
        INK
      );
      if (p < 0.98 && pts.length) {
        const head = pts[pts.length - 1];
        g.fillStyle = INK;
        g.beginPath();
        g.arc(head[0], head[1], 3.4, 0, 7);
        g.fill();
      }
    },
  },

  /* --- highlighter ------------------------------------------------- */
  hl: {
    ms: 2800,
    draw(g, w, h, p) {
      paper(g, w, h);
      g.save();
      g.font = `600 ${Math.round(h * 0.19)}px Georgia, "Times New Roman", serif`;
      g.fillStyle = '#4a5568';
      g.fillText('highlight', w * 0.16, h * 0.42);
      g.fillText('without', w * 0.16, h * 0.74);
      g.restore();
      g.save();
      g.globalCompositeOperation = 'multiply';
      const bandH = h * 0.2;
      const first = clamp(p / 0.55, 0, 1);
      const second = clamp((p - 0.45) / 0.45, 0, 1);
      const x0 = w * 0.14;
      const full = w * 0.62;
      if (first > 0) {
        g.fillStyle = 'rgba(255,210,63,.62)';
        roundRect(g, x0, h * 0.3, full * first, bandH, bandH * 0.28);
        g.fill();
      }
      if (second > 0) {
        g.fillStyle = 'rgba(255,210,63,.62)';
        roundRect(g, x0, h * 0.62, full * second, bandH, bandH * 0.28);
        g.fill();
      }
      g.restore();
    },
  },

  /* --- eraser: pen eraser end wiping a stroke ---------------------- */
  er: {
    ms: 3000,
    draw(g, w, h, p) {
      paper(g, w, h);
      const all = sPath(w, h);
      ribbon(g, all, () => 7, INK, 0.95);
      const zig: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        zig.push([w * (0.1 + 0.8 * t), h * (0.5 + Math.sin(t * Math.PI * 3) * 0.28)]);
      }
      const e = clamp((p - 0.12) / 0.62, 0, 1);
      if (e > 0) {
        const n = Math.max(2, Math.round(zig.length * e));
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.lineWidth = 17;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = '#000';
        g.beginPath();
        g.moveTo(zig[0][0], zig[0][1]);
        for (let i = 1; i < n; i++) g.lineTo(zig[i][0], zig[i][1]);
        g.stroke();
        g.restore();
        const head = zig[Math.min(n - 1, zig.length - 1)];
        g.save();
        g.fillStyle = 'rgba(255,255,255,.92)';
        g.strokeStyle = '#b9c3d6';
        g.lineWidth = 1.5;
        roundRect(g, head[0] - 9, head[1] - 9, 18, 18, 5);
        g.fill();
        g.stroke();
        g.restore();
      }
    },
  },

  /* --- lasso select ------------------------------------------------ */
  sel: {
    ms: 3200,
    draw(g, w, h, p) {
      paper(g, w, h);
      const drawn = clamp(p / 0.45, 0, 1);
      const lift = clamp((p - 0.5) / 0.35, 0, 1);
      const bx = w * 0.16;
      const by = h * 0.22;
      const bw = w * 0.5;
      const bh = h * 0.56;

      g.save();
      g.translate(lift * 14, -lift * 6);
      g.fillStyle = 'rgba(47,109,246,.06)';
      roundRect(g, bx, by, bw, bh, 10);
      g.fill();
      g.fillStyle = INK;
      g.font = `600 ${Math.round(h * 0.18)}px system-ui,sans-serif`;
      g.fillText('move me', bx + 12, by + bh * 0.55);
      g.restore();

      g.save();
      g.setLineDash([6, 4]);
      g.lineDashOffset = -p * 30;
      g.strokeStyle = ACC;
      g.lineWidth = 1.8;
      if (drawn < 1) {
        // the lasso itself drawing around the content
        const per = 2 * (bw + bh);
        g.setLineDash([6, 4]);
        g.beginPath();
        g.moveTo(bx, by);
        const seg = per * drawn;
        if (seg < bw) g.lineTo(bx + seg, by);
        else if (seg < bw + bh) {
          g.lineTo(bx + bw, by);
          g.lineTo(bx + bw, by + (seg - bw));
        } else if (seg < 2 * bw + bh) {
          g.lineTo(bx + bw, by);
          g.lineTo(bx + bw, by + bh);
          g.lineTo(bx + bw - (seg - bw - bh), by + bh);
        } else {
          g.lineTo(bx + bw, by);
          g.lineTo(bx + bw, by + bh);
          g.lineTo(bx, by + bh);
          g.lineTo(bx, by + bh - (seg - 2 * bw - bh));
        }
        g.stroke();
      } else {
        roundRect(g, bx + lift * 14, by - lift * 6, bw, bh, 10);
        g.stroke();
        // corner handles
        g.setLineDash([]);
        g.fillStyle = '#fff';
        g.strokeStyle = ACC;
        [
          [bx + lift * 14, by - lift * 6],
          [bx + bw + lift * 14, by - lift * 6],
          [bx + lift * 14, by + bh - lift * 6],
          [bx + bw + lift * 14, by + bh - lift * 6],
        ].forEach(([x, y]) => {
          g.beginPath();
          g.arc(x, y, 3.4, 0, 7);
          g.fill();
          g.stroke();
        });
      }
      g.restore();
    },
  },

  /* --- shapes ------------------------------------------------------ */
  shape: {
    ms: 3000,
    draw(g, w, h, p) {
      paper(g, w, h);
      const q = clamp(p / 0.55, 0, 1);
      const x0 = w * 0.18;
      const y0 = h * 0.24;
      const x1 = x0 + (w * 0.52 - x0 + w * 0.18) * q * 0.86;
      const y1 = y0 + (h * 0.5 - y0 + h * 0.2) * q;
      g.save();
      g.strokeStyle = ACC;
      g.lineWidth = 2;
      if (q < 1) g.setLineDash([5, 4]);
      roundRect(g, x0, y0, Math.max(4, x1 - x0), Math.max(4, y1 - y0), 8);
      g.stroke();
      if (q >= 1) {
        g.setLineDash([]);
        g.fillStyle = '#fff';
        [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([x, y]) => {
          g.beginPath();
          g.rect(x - 3.2, y - 3.2, 6.4, 6.4);
          g.fill();
          g.stroke();
        });
      }
      g.restore();
      // drag indicator
      const hx = x0 + (x1 - x0) * Math.min(1, q * 1.6);
      const hy = y0 + (y1 - y0) * Math.min(1, q * 1.6);
      g.fillStyle = 'rgba(47,109,246,.9)';
      g.beginPath();
      g.arc(hx, hy, 3.6, 0, 7);
      g.fill();
    },
  },

  /* --- text -------------------------------------------------------- */
  text: {
    ms: 3000,
    draw(g, w, h, p) {
      paper(g, w, h);
      const txt = 'Hello';
      const n = Math.floor(txt.length * clamp(p / 0.62, 0, 1));
      const size = Math.round(h * 0.26);
      g.font = `600 ${size}px system-ui,-apple-system,Segoe UI,sans-serif`;
      g.textBaseline = 'alphabetic';
      g.fillStyle = INK;
      g.fillText(txt.slice(0, n), w * 0.22, h * 0.6);
      if (p > 0.1 && Math.floor(p * 12) % 2 === 0) {
        const cw = g.measureText(txt.slice(0, n)).width;
        g.fillStyle = ACC;
        g.fillRect(w * 0.22 + cw + 1.5, h * 0.6 - size * 0.82, 2, size * 0.96);
      }
      g.strokeStyle = 'rgba(47,109,246,.35)';
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(w * 0.2, h * 0.6 + 4);
      g.lineTo(w * 0.86, h * 0.6 + 4);
      g.stroke();
      g.setLineDash([]);
    },
  },

  /* --- laser pointer ----------------------------------------------- */
  laser: {
    ms: 2400,
    draw(g, w, h, p) {
      paper(g, w, h);
      const all = sPath(w, h);
      const idx = Math.min(all.length - 1, Math.floor(all.length * p));
      for (let k = 11; k >= 0; k--) {
        const i = idx - k;
        if (i < 0) continue;
        const a = (1 - k / 12) * 0.5;
        g.fillStyle = `rgba(229,56,59,${a.toFixed(3)})`;
        g.beginPath();
        g.arc(all[i][0], all[i][1], 5.6 - k * 0.36, 0, 7);
        g.fill();
      }
      const [hx, hy] = all[idx];
      const rg = g.createRadialGradient(hx, hy, 0, hx, hy, 18);
      rg.addColorStop(0, 'rgba(255,92,92,.95)');
      rg.addColorStop(0.45, 'rgba(229,56,59,.55)');
      rg.addColorStop(1, 'rgba(229,56,59,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(hx, hy, 18, 0, 7);
      g.fill();
      g.fillStyle = '#ff4d4d';
      g.beginPath();
      g.arc(hx, hy, 3, 0, 7);
      g.fill();
    },
  },

  /* --- undo -------------------------------------------------------- */
  undo: {
    ms: 2800,
    draw(g, w, h, p) {
      paper(g, w, h);
      const grow = clamp(p / 0.45, 0, 1);
      const fade = p < 0.66 ? 1 : Math.max(0, 1 - (p - 0.66) / 0.28);
      const all = sPath(w, h);
      const n = Math.max(2, Math.round(all.length * grow));
      if (fade > 0.01) ribbon(g, all.slice(0, n), () => 6, INK, fade);
      if (p > 0.5) {
        const a = clamp((p - 0.5) / 0.12, 0, 1);
        g.save();
        g.globalAlpha = a;
        chip(g, w * 0.66, h * 0.16, '↶  Undo', 'rgba(47,109,246,.12)', ACC, 10);
        g.restore();
      }
    },
  },

  /* --- colour swatches --------------------------------------------- */
  colors: {
    ms: 3000,
    draw(g, w, h, p) {
      paper(g, w, h);
      const cols = ['#111111', '#2f6df6', '#e5383b', '#2a9d4f', '#f4a300'];
      const all = sPath(w, h).map(([x, y]) => [x, y * 0.86]);
      const n = all.length;
      const active = Math.min(cols.length - 1, Math.floor(p * cols.length));
      for (let c = 0; c < cols.length; c++) {
        const from = Math.floor((c / cols.length) * n);
        const to = Math.floor(((c + 1) / cols.length) * n);
        const upto = Math.min(to, Math.floor(n * p));
        if (upto <= from) continue;
        ribbon(g, all.slice(from, upto), () => 6, cols[c], 1);
      }
      // swatch row
      const sw = 14;
      const gap = 10;
      const total = cols.length * sw + (cols.length - 1) * gap;
      let x = (w - total) / 2;
      const y = h - 18;
      cols.forEach((c, i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x + sw / 2, y, sw / 2, 0, 7);
        g.fill();
        if (i === active) {
          g.strokeStyle = ACC;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x + sw / 2, y, sw / 2 + 3, 0, 7);
          g.stroke();
        }
        x += sw + gap;
      });
    },
  },

  /* --- snap: the pen is pulled onto an existing corner -------------- */
  snap: {
    ms: 3400,
    draw(g, w, h, p) {
      paper(g, w, h);
      const ax = w * 0.14;
      const ay = h * 0.74;
      const bx = w * 0.44;
      const by = h * 0.34;
      const dx = w * 0.72;
      const dy = h * 0.76;

      // two strokes already on the page, meeting at (bx, by)
      g.save();
      g.strokeStyle = INK;
      g.lineWidth = 2.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(dx, dy);
      g.stroke();
      g.restore();

      // an incoming stroke that stops just short, then jumps onto the corner
      const travel = clamp(p / 0.66, 0, 1);
      const eased = 1 - Math.pow(1 - travel, 3);
      const sx = w * 0.92;
      const sy = h * 0.88;
      const gapX = bx + (sx - bx) * 0.2;
      const gapY = by + (sy - by) * 0.2;
      const snapped = p > 0.7;
      const ex = snapped ? bx : sx + (gapX - sx) * eased;
      const ey = snapped ? by : sy + (gapY - sy) * eased;

      const pts: number[][] = [];
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        pts.push([sx + (ex - sx) * t, sy + (ey - sy) * t + Math.sin(t * Math.PI) * h * 0.05]);
      }
      ribbon(g, pts, () => 5.2, INK);

      // the magnet marker sitting on the target
      if (p > 0.36) {
        const pulse = snapped ? 1 + 0.16 * Math.sin((p - 0.7) * 42) : 1;
        g.save();
        g.strokeStyle = ACC;
        g.lineWidth = 2;
        g.globalAlpha = snapped ? 0.95 : 0.55;
        g.beginPath();
        g.arc(bx, by, 9 * pulse, 0, 7);
        g.stroke();
        g.fillStyle = ACC;
        g.beginPath();
        g.arc(bx, by, 2.4, 0, 7);
        g.fill();
        g.restore();
      }
      if (snapped) chip(g, w * 0.5, h * 0.07, 'snapped', ACC, '#fff', 9);
    },
  },

  /* --- paint bucket: pour colour into a closed shape ---------------- */
  fill: {
    ms: 2800,
    draw(g, w, h, p) {
      paper(g, w, h);
      const x = w * 0.24;
      const y = h * 0.26;
      const bw = w * 0.52;
      const bh = h * 0.5;

      g.save();
      roundRect(g, x, y, bw, bh, 10);
      g.strokeStyle = INK;
      g.lineWidth = 2.6;
      g.stroke();
      g.restore();

      const t = clamp((p - 0.12) / 0.6, 0, 1);
      if (t > 0) {
        g.save();
        roundRect(g, x, y, bw, bh, 10);
        g.clip();
        g.fillStyle = 'rgba(47,109,246,.34)';
        g.fillRect(x, y + bh * (1 - t), bw, bh * t);
        g.restore();
      }

      // the bucket tip rides the surface as it rises
      const tipY = t > 0 && t < 1 ? y + bh * (1 - t) : y + bh * 0.44;
      g.save();
      g.translate(x + bw * 0.5, tipY);
      g.fillStyle = '#f4a300';
      g.beginPath();
      g.moveTo(-7, 0);
      g.lineTo(7, 0);
      g.lineTo(0, 9);
      g.closePath();
      g.fill();
      g.fillStyle = INK;
      g.fillRect(-1.3, -9, 2.6, 9);
      g.restore();

      if (p > 0.82) chip(g, w * 0.5, h * 0.07, 'filled', ACC, '#fff', 9);
    },
  },

  /* --- thickness / pressure ---------------------------------------- */
  pressure: {
    ms: 3000,
    draw(g, w, h, p) {
      paper(g, w, h);
      const pulse = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
      const wid = 1.4 + 7.6 * pulse;
      const y = h * 0.44;
      const pts: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        pts.push([w * (0.18 + 0.62 * t), y + Math.sin(t * Math.PI * 2) * h * 0.05]);
      }
      ribbon(g, pts, () => wid, INK, 1);
      // pressure meter
      const mx = w * 0.1;
      const mh = h * 0.42;
      const my = h * 0.3;
      g.fillStyle = 'rgba(47,109,246,.14)';
      roundRect(g, mx - 4, my, 8, mh, 4);
      g.fill();
      g.fillStyle = ACC;
      roundRect(g, mx - 4, my + mh * (1 - pulse), 8, mh * pulse, 4);
      g.fill();
      g.save();
      g.font = '600 9px system-ui,sans-serif';
      g.fillStyle = '#8b93a6';
      g.textAlign = 'center';
      g.fillText('pressure', mx, my + mh + 12);
      g.restore();
      g.save();
      g.font = '600 10px system-ui,sans-serif';
      g.fillStyle = ACC;
      g.textAlign = 'right';
      g.fillText(wid.toFixed(1) + ' px', w - 10, h * 0.16);
      g.restore();
    },
  },

  /* --- insert image ------------------------------------------------ */
  image: {
    ms: 3000,
    draw(g, w, h, p) {
      paper(g, w, h);
      const slide = clamp(p / 0.55, 0, 1);
      const ease = 1 - Math.pow(1 - slide, 3);
      const iw = w * 0.42;
      const ih = h * 0.5;
      const x = w * 0.3 + (1 - ease) * w * 0.5;
      const y = h * 0.24;

      g.save();
      g.shadowColor = 'rgba(16,32,64,.28)';
      g.shadowBlur = 12;
      g.shadowOffsetY = 4;
      g.fillStyle = '#dbeafe';
      roundRect(g, x, y, iw, ih, 6);
      g.fill();
      g.restore();

      // a tiny "photo": sky, sun and two hills
      g.save();
      roundRect(g, x, y, iw, ih, 6);
      g.clip();
      g.fillStyle = '#cfe3ff';
      g.fillRect(x, y, iw, ih);
      g.fillStyle = '#ffd66e';
      g.beginPath();
      g.arc(x + iw * 0.76, y + ih * 0.24, iw * 0.1, 0, 7);
      g.fill();
      g.fillStyle = '#9dc08b';
      g.beginPath();
      g.moveTo(x, y + ih);
      g.lineTo(x + iw * 0.34, y + ih * 0.46);
      g.lineTo(x + iw * 0.62, y + ih);
      g.closePath();
      g.fill();
      g.fillStyle = '#6f9e5c';
      g.beginPath();
      g.moveTo(x + iw * 0.42, y + ih);
      g.lineTo(x + iw * 0.74, y + ih * 0.58);
      g.lineTo(x + iw, y + ih);
      g.closePath();
      g.fill();
      g.restore();

      if (p > 0.55) {
        g.save();
        g.strokeStyle = ACC;
        g.lineWidth = 1.6;
        g.setLineDash([5, 4]);
        g.strokeRect(x - 3, y - 3, iw + 6, ih + 6);
        g.setLineDash([]);
        g.fillStyle = '#fff';
        [[x - 3, y - 3], [x + iw + 3, y - 3], [x - 3, y + ih + 3], [x + iw + 3, y + ih + 3]].forEach(([hx, hy]) => {
          g.beginPath();
          g.rect(hx - 3.4, hy - 3.4, 6.8, 6.8);
          g.fill();
          g.stroke();
        });
        g.restore();
      }
    },
  },

  /* --- pages ------------------------------------------------------- */
  pages: {
    ms: 3200,
    draw(g, w, h, p) {
      g.fillStyle = '#eef2f9';
      g.fillRect(0, 0, w, h);
      const flip = clamp((p - 0.45) / 0.22, 0, 1);
      const pw = w * 0.42;
      const ph = h * 0.66;
      const y = (h - ph) / 2;
      const drawPage = (x: number, front: boolean) => {
        g.save();
        g.shadowColor = 'rgba(16,32,64,.18)';
        g.shadowBlur = 10;
        g.shadowOffsetY = 3;
        g.fillStyle = '#fff';
        roundRect(g, x, y, pw, ph, 6);
        g.fill();
        g.restore();
        if (front) {
          g.strokeStyle = '#dbe4f5';
          g.lineWidth = 1;
          for (let i = 1; i < 6; i++) {
            g.beginPath();
            g.moveTo(x + 10, y + (ph / 6) * i);
            g.lineTo(x + pw - 10, y + (ph / 6) * i);
            g.stroke();
          }
        }
      };
      const x1 = w * 0.14;
      const x2 = w * 0.46;
      drawPage(x1, true);
      // page turning over the right hand slot
      const sx = Math.max(0.02, Math.abs(Math.cos(flip * Math.PI)));
      g.save();
      g.translate(x2 + pw / 2, y + ph / 2);
      g.scale(sx, 1);
      g.translate(-pw / 2, -ph / 2);
      drawPage(0, flip < 0.5);
      g.restore();
      // page chip
      g.save();
      g.font = '600 10px system-ui,sans-serif';
      g.fillStyle = '#5b6478';
      g.textAlign = 'center';
      const num = 1 + (p > 0.7 ? 1 : 0);
      g.fillText(num + ' / 3', w / 2, h - 12);
      g.restore();
    },
  },

  /* --- share / export ---------------------------------------------- */
  share: {
    ms: 3000,
    draw(g, w, h, p) {
      g.fillStyle = '#eef2f9';
      g.fillRect(0, 0, w, h);
      const px = w * 0.16;
      const py = h * 0.2;
      const pw = w * 0.26;
      const ph = h * 0.6;
      g.save();
      g.shadowColor = 'rgba(16,32,64,.18)';
      g.shadowBlur = 10;
      g.shadowOffsetY = 3;
      g.fillStyle = '#fff';
      roundRect(g, px, py, pw, ph, 5);
      g.fill();
      g.restore();
      g.strokeStyle = '#dbe4f5';
      for (let i = 1; i < 5; i++) {
        g.beginPath();
        g.moveTo(px + 8, py + (ph / 5) * i);
        g.lineTo(px + pw - 8, py + (ph / 5) * i);
        g.stroke();
      }
      // arrow
      const a = clamp(p / 0.4, 0, 1);
      const ax0 = px + pw + 12;
      const ax1 = ax0 + (w * 0.2) * a;
      const ay = py + ph / 2;
      g.strokeStyle = ACC;
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ax0, ay);
      g.lineTo(ax1, ay);
      if (a > 0.9) {
        g.moveTo(ax1 - 5, ay - 5);
        g.lineTo(ax1, ay);
        g.lineTo(ax1 - 5, ay + 5);
      }
      g.stroke();
      if (p > 0.45) {
        const b = clamp((p - 0.45) / 0.2, 0, 1);
        g.save();
        g.globalAlpha = b;
        chip(g, ax1 + 8, ay - 9, 'PDF', 'rgba(229,56,59,.12)', '#e5383b', 10);
        chip(g, ax1 + 8, ay + 8, 'PNG', 'rgba(42,157,79,.12)', '#2a9d4f', 10);
        g.restore();
      }
      if (p > 0.72) {
        const c = clamp((p - 0.72) / 0.18, 0, 1);
        g.save();
        g.globalAlpha = c;
        g.font = '600 10px system-ui,sans-serif';
        g.fillStyle = '#5b6478';
        g.fillText('GoodNotes · Notability · OneNote', w * 0.14, h - 12);
        g.restore();
      }
    },
  },

  /* --- cloud sync --------------------------------------------------- */
  cloud: {
    ms: 3200,
    draw(g, w, h, p) {
      g.fillStyle = '#eef2f9';
      g.fillRect(0, 0, w, h);
      const rise = clamp(p / 0.5, 0, 1);
      const ease = 1 - Math.pow(1 - rise, 3);
      const done = p > 0.55;
      const cx = w * 0.62;
      const cy = h * 0.34;

      // cloud first so the notebook can disappear behind it
      const col = done ? '#2a9d4f' : '#9fb0cc';
      g.fillStyle = col;
      g.beginPath();
      g.arc(cx - 17, cy + 5, 12, 0, 7);
      g.arc(cx, cy - 5, 15, 0, 7);
      g.arc(cx + 18, cy + 5, 12, 0, 7);
      g.fill();
      roundRect(g, cx - 29, cy + 2, 58, 14, 7);
      g.fill();

      // notebook card rising and fading out into the cloud
      const alpha = 1 - clamp((rise - 0.72) / 0.28, 0, 1);
      if (alpha > 0.02) {
        const cardX = w * 0.12 + ease * (cx - 30 - w * 0.12);
        const cardY = h * 0.72 - ease * (h * 0.72 - (cy + 6));
        g.save();
        g.globalAlpha = alpha;
        g.shadowColor = 'rgba(16,32,64,.22)';
        g.shadowBlur = 10;
        g.shadowOffsetY = 4;
        g.fillStyle = '#2f6df6';
        roundRect(g, cardX, cardY, 58, 40, 6);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,.92)';
        roundRect(g, cardX + 7, cardY + 7, 44, 26, 3);
        g.fill();
        g.restore();
      }

      if (done) {
        const c = clamp((p - 0.55) / 0.14, 0, 1);
        g.save();
        g.strokeStyle = '#fff';
        g.lineWidth = 3.4;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        const seg = 24 * c;
        g.setLineDash([seg, 40]);
        g.beginPath();
        g.moveTo(cx - 8, cy + 4);
        g.lineTo(cx - 2, cy + 10);
        g.lineTo(cx + 9, cy - 5);
        g.stroke();
        g.restore();

        g.save();
        g.globalAlpha = c;
        g.font = '600 10px system-ui,sans-serif';
        g.fillStyle = '#2a9d4f';
        g.textAlign = 'center';
        g.fillText('Synced', cx, cy + 38);
        g.restore();
      }
    },
  },

  /* --- pen button mapping ------------------------------------------ */
  penmap: {
    ms: 3200,
    draw(g, w, h, p) {
      g.fillStyle = '#eef2f9';
      g.fillRect(0, 0, w, h);
      const press = p > 0.35 && p < 0.72;
      // stylus
      g.save();
      g.translate(w * 0.5, h * 0.52);
      g.rotate(-0.5);
      g.fillStyle = '#334155';
      roundRect(g, -70, -7, 120, 14, 7);
      g.fill();
      g.fillStyle = '#94a3b8';
      roundRect(g, -70, -7, 26, 14, 7);
      g.fill();
      g.fillStyle = '#0f172a';
      g.beginPath();
      g.moveTo(50, -6);
      g.lineTo(70, 0);
      g.lineTo(50, 6);
      g.closePath();
      g.fill();
      // barrel button
      g.fillStyle = press ? ACC : '#64748b';
      roundRect(g, -18, -13, 22, 7, 3.5);
      g.fill();
      g.restore();

      // tool chips
      const y = h * 0.16;
      chip(g, w * 0.16, y, '✎  Pen', press ? 'rgba(0,0,0,.05)' : 'rgba(47,109,246,.14)', press ? '#8b93a6' : ACC, 10);
      chip(g, w * 0.52, y, '◻  Eraser', press ? 'rgba(47,109,246,.14)' : 'rgba(0,0,0,.05)', press ? ACC : '#8b93a6', 10);

      if (press) {
        g.save();
        g.globalAlpha = 0.9;
        g.strokeStyle = ACC;
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(w * 0.5 - 8, h * 0.52 - 10, 20 + Math.sin(p * 30) * 2, 0, 7);
        g.stroke();
        g.restore();
      }
      g.save();
      g.font = '600 9px system-ui,sans-serif';
      g.fillStyle = '#8b93a6';
      g.textAlign = 'center';
      g.fillText('barrel button', w * 0.5, h - 10);
      g.restore();
    },
  },

  /* --- library search ---------------------------------------------- */
  search: {
    ms: 3200,
    draw(g, w, h, p) {
      g.fillStyle = '#eef2f9';
      g.fillRect(0, 0, w, h);
      // search field
      g.fillStyle = '#fff';
      g.strokeStyle = '#dbe4f5';
      g.lineWidth = 1;
      roundRect(g, w * 0.08, h * 0.1, w * 0.84, 24, 12);
      g.fill();
      g.stroke();
      // magnifier
      g.save();
      g.strokeStyle = '#9aa6bd';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(w * 0.13, h * 0.1 + 11, 4, 0, 7);
      g.moveTo(w * 0.13 + 3, h * 0.1 + 14);
      g.lineTo(w * 0.13 + 6, h * 0.1 + 17);
      g.stroke();
      g.restore();

      const q = 'meeting';
      const n = Math.floor(q.length * clamp(p / 0.45, 0, 1));
      g.save();
      g.font = '500 10.5px system-ui,sans-serif';
      g.fillStyle = '#5b6478';
      g.textBaseline = 'middle';
      g.fillText(q.slice(0, n), w * 0.16 + 4, h * 0.1 + 12);
      if (p < 0.45 && Math.floor(p * 20) % 2 === 0) {
        const cw = g.measureText(q.slice(0, n)).width;
        g.fillStyle = ACC;
        g.fillRect(w * 0.16 + 5 + cw, h * 0.1 + 6, 1.5, 12);
      }
      g.restore();

      // four cards, the non-matching two fade back instead of re-flowing
      const names = ['Meeting notes', 'Sketch 3', 'Meeting plan', 'Ideas'];
      const hit = [true, false, true, false];
      const filtering = clamp((p - 0.45) / 0.2, 0, 1);
      const cw = w * 0.2;
      const ch = h * 0.5;
      const gap = w * 0.023;
      const total = 4 * cw + 3 * gap;
      let x = (w - total) / 2;
      const y = h * 0.4;
      names.forEach((nm, i) => {
        const a = hit[i] ? 1 : 1 - filtering * 0.62;
        g.save();
        g.globalAlpha = a;
        g.fillStyle = '#fff';
        g.shadowColor = 'rgba(16,32,64,.14)';
        g.shadowBlur = 7;
        roundRect(g, x, y, cw, ch, 5);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = ['#2f6df6', '#22a06b', '#f0a500', '#8b5cf6'][i];
        roundRect(g, x + 4, y + 4, cw - 8, ch * 0.3, 3);
        g.fill();
        g.fillStyle = '#5b6478';
        g.font = '500 7.5px system-ui,sans-serif';
        g.fillText(nm.split(' ')[0], x + 4, y + ch * 0.3 + 14);
        g.restore();
        x += cw + gap;
      });
    },
  },

  /* --- install to home screen --------------------------------------- */
  install: {
    ms: 4800,
    draw(g, w, h, p) {
      // Wide, short canvas → storyboard: home grid, toolbar, share popover,
      // then the icon lands in the free slot.
      g.fillStyle = '#eef2f9';
      g.fillRect(0, 0, w, h);

      const tbH = Math.max(22, h * 0.18);
      const avail = h - tbH - 8;
      const cols = 4;
      const rows = 2;
      const isz = Math.min(w * 0.125, avail / 2.4);
      const gap = isz * 0.4;
      const gridW = cols * isz + (cols - 1) * gap;
      const gridH = rows * isz + (rows - 1) * gap;
      const gx = (w - gridW) / 2;
      const gy = 2 + (avail - gridH) / 2;
      const slotX = (c: number) => gx + c * (isz + gap);
      const slotY = (r: number) => gy + r * (isz + gap);

      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if (r === rows - 1 && c === cols - 1) continue; // kept free for Inkpad
          g.fillStyle = '#dbe4f5';
          roundRect(g, slotX(c), slotY(r), isz, isz, isz * 0.24);
          g.fill();
        }

      // browser toolbar
      const tbY = h - tbH;
      g.fillStyle = '#fff';
      roundRect(g, 0, tbY, w, tbH + 12, 10);
      g.fill();
      g.fillStyle = '#eef1f7';
      roundRect(g, w * 0.28, tbY + tbH * 0.28, w * 0.34, tbH * 0.44, tbH * 0.22);
      g.fill();

      // share glyph — square with an arrow leaving it
      const s = tbH * 0.3;
      const sx = w * 0.9;
      const sy = tbY + tbH * 0.5;
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 5);
      g.save();
      g.globalAlpha = 0.5 + pulse * 0.5;
      g.strokeStyle = ACC;
      g.lineWidth = Math.max(1.2, s * 0.16);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(sx - s, sy + s * 0.1);
      g.lineTo(sx - s, sy + s);
      g.lineTo(sx + s, sy + s);
      g.lineTo(sx + s, sy + s * 0.1);
      g.moveTo(sx, sy + s * 0.25);
      g.lineTo(sx, sy - s * 1.15);
      g.moveTo(sx - s * 0.6, sy - s * 0.6);
      g.lineTo(sx, sy - s * 1.2);
      g.lineTo(sx + s * 0.6, sy - s * 0.6);
      g.stroke();
      g.restore();

      const ring = clamp((p - 0.03) / 0.14, 0, 1);
      if (ring > 0 && ring < 1) {
        g.save();
        g.globalAlpha = (1 - ring) * 0.55;
        g.strokeStyle = ACC;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(sx, sy, s * (0.9 + ring * 2.2), 0, 7);
        g.stroke();
        g.restore();
      }

      // share popover above the toolbar
      const pop = clamp((p - 0.18) / 0.12, 0, 1) * (1 - clamp((p - 0.64) / 0.1, 0, 1));
      if (pop > 0) {
        const rh = Math.max(15, tbH * 0.74);
        const pw = Math.min(w * 0.52, 170);
        const ph = rh * 3 + 10;
        const px = w * 0.97 - pw;
        const py = tbY - 5 - ph * pop;
        g.save();
        g.globalAlpha = clamp(pop * 1.8, 0, 1);
        g.shadowColor = 'rgba(16,32,64,.24)';
        g.shadowBlur = 13;
        g.shadowOffsetY = 2;
        g.fillStyle = '#fff';
        roundRect(g, px, py, pw, ph, 9);
        g.fill();
        g.restore();
        g.save();
        g.globalAlpha = clamp(pop * 1.8, 0, 1);
        g.textBaseline = 'middle';
        const fs = Math.max(7.5, Math.round(rh * 0.46));
        ['Copy', 'Add to Home Screen', 'Print'].forEach((label, i) => {
          const ry = py + 5 + i * rh;
          const on = i === 1 ? clamp((p - 0.4) / 0.08, 0, 1) : 0;
          if (on > 0) {
            g.fillStyle = `rgba(47,109,246,${0.15 * on})`;
            roundRect(g, px + 3, ry + 1, pw - 6, rh - 2, 6);
            g.fill();
          }
          g.font = `${on > 0.5 ? '700' : '500'} ${fs}px system-ui,sans-serif`;
          g.fillStyle = on > 0.5 ? ACC : '#5b6478';
          g.fillText(label, px + 9, ry + rh / 2);
        });
        g.restore();
      }

      // the Inkpad icon lands in the free slot, with a "done" badge
      const drop = clamp((p - 0.74) / 0.15, 0, 1);
      if (drop > 0) {
        const ix = slotX(cols - 1);
        const iy = slotY(rows - 1);
        const sc = 0.5 + 0.5 * drop + Math.sin(drop * Math.PI) * 0.16;
        g.save();
        g.translate(ix + isz / 2, iy + isz / 2);
        g.scale(sc, sc);
        const tile = g.createLinearGradient(-isz / 2, -isz / 2, isz / 2, isz / 2);
        tile.addColorStop(0, '#5b93ff');
        tile.addColorStop(0.55, '#2f6df6');
        tile.addColorStop(1, '#1b46c2');
        g.fillStyle = tile;
        roundRect(g, -isz / 2, -isz / 2, isz, isz, isz * 0.24);
        g.fill();
        g.fillStyle = '#fff';
        roundRect(g, -isz * 0.27, -isz * 0.3, isz * 0.54, isz * 0.6, isz * 0.06);
        g.fill();
        g.strokeStyle = '#f4708c';
        g.lineWidth = Math.max(0.7, isz * 0.026);
        g.beginPath();
        g.moveTo(-isz * 0.13, -isz * 0.3);
        g.lineTo(-isz * 0.13, isz * 0.3);
        g.stroke();
        g.strokeStyle = INK;
        g.lineWidth = Math.max(1.1, isz * 0.07);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-isz * 0.2, isz * 0.16);
        g.quadraticCurveTo(0, -isz * 0.14, isz * 0.2, -isz * 0.02);
        g.stroke();
        g.restore();

        if (drop > 0.75) {
          const b = clamp((drop - 0.75) / 0.25, 0, 1);
          const bx = ix + isz * 0.86;
          const by = iy + isz * 0.86;
          g.save();
          g.globalAlpha = b;
          g.fillStyle = '#22a06b';
          g.beginPath();
          g.arc(bx, by, isz * 0.2 * (0.6 + 0.4 * b), 0, 7);
          g.fill();
          g.strokeStyle = '#fff';
          g.lineWidth = Math.max(1.1, isz * 0.055);
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.beginPath();
          g.moveTo(bx - isz * 0.08, by);
          g.lineTo(bx - isz * 0.01, by + isz * 0.07);
          g.lineTo(bx + isz * 0.09, by - isz * 0.07);
          g.stroke();
          g.restore();
        }
      }
    },
  },

  /* --- favourites --------------------------------------------------- */
  fav: {
    ms: 2600,
    draw(g, w, h, p) {
      g.fillStyle = '#eef2f9';
      g.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.46;
      const fill = clamp((p - 0.3) / 0.3, 0, 1);
      const pop = 1 + Math.sin(clamp((p - 0.3) / 0.5, 0, 1) * Math.PI) * 0.18;
      g.save();
      g.translate(cx, cy);
      g.scale(pop, pop);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 34 : 15;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.closePath();
      if (fill > 0) {
        g.globalAlpha = fill;
        g.fillStyle = '#f4a300';
        g.fill();
        g.globalAlpha = 1;
      }
      g.strokeStyle = fill > 0.5 ? '#f4a300' : '#8b93a6';
      g.lineWidth = 2.4;
      g.lineJoin = 'round';
      g.stroke();
      g.restore();
      g.save();
      g.font = '600 10px system-ui,sans-serif';
      g.fillStyle = '#8b93a6';
      g.textAlign = 'center';
      g.fillText('Favorites', w / 2, h - 14);
      g.restore();
    },
  },
};

/* ------------------------------------------------------------------ */
/* Demo player                                                         */
/* ------------------------------------------------------------------ */

class DemoPlayer {
  private cv: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private key = '';
  private t0 = 0;
  private paused = false;

  private ro: ResizeObserver | null = null;

  attach(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.g = cv.getContext('2d');
    this.resize();
    if (!this.ro && 'ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(cv);
    }
  }

  resize() {
    if (!this.cv || !this.g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth || 260;
    const h = this.cv.clientHeight || 132;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  play(key: string) {
    const demo = DEMOS[key];
    if (!demo) return;
    this.stop();
    this.key = key;
    this.t0 = performance.now();
    const loop = (now: number) => {
      if (!this.g || !this.cv) return;
      const w = this.cv.clientWidth;
      const h = this.cv.clientHeight;
      const p = ((now - this.t0) % demo.ms) / demo.ms;
      this.g.clearRect(0, 0, w, h);
      try {
        demo.draw(this.g, w, h, p);
      } catch {
        /* a broken demo must never break the tour */
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.key = '';
  }
}

/* ------------------------------------------------------------------ */
/* Tour engine                                                         */
/* ------------------------------------------------------------------ */

interface Step {
  /** Element to spotlight. Omit for a centred "welcome" card. */
  target?: () => HTMLElement | null;
  title: string;
  body: string;
  demo?: string;
  /** Extra space around the spotlight, px. */
  pad?: number;
  /** Force the card to a docked position instead of floating near the target. */
  place?: 'dock';
  /** Runs before the step is shown (e.g. open the overflow menu). */
  before?: () => void;
  /** Runs when leaving the step. */
  after?: () => void;
}

const TOUR_VER = 'v2';
const HOME_FLAG = `inkpad-tour-home-${TOUR_VER}`;
const EDITOR_FLAG = `inkpad-tour-editor-${TOUR_VER}`;

let active: {
  id: string;
  steps: Step[];
  i: number;
  root: HTMLElement;
  hole: HTMLElement;
  ring: HTMLElement;
  dim: HTMLElement;
  card: HTMLElement;
  demo: DemoPlayer;
  timer: number;
} | null = null;

function tourRoot(): HTMLElement {
  let root = document.getElementById('tour-root');
  if (root) return root;

  root = el('div', '') as HTMLElement;
  root.id = 'tour-root';
  root.innerHTML = `
    <div id="tour-dim"></div>
    <div id="tour-hole"></div>
    <div id="tour-ring"></div>
    <div id="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div id="tour-top">
        <span id="tour-count"></span>
        <button id="tour-x" aria-label="Close tour">✕</button>
      </div>
      <h3 id="tour-title"></h3>
      <p id="tour-body"></p>
      <div id="tour-demo-wrap">
        <span id="tour-demo-tag">LIVE DEMO</span>
        <canvas id="tour-demo"></canvas>
      </div>
      <div id="tour-foot">
        <button id="tour-skip">Skip tour</button>
        <div id="tour-nav">
          <button id="tour-back">Back</button>
          <button id="tour-next" class="on">Next</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function stopTour(completed: boolean, id?: string) {
  if (!active) return;
  const { root, timer, demo, steps, i } = active;
  clearInterval(timer);
  demo.stop();
  try {
    steps[i]?.after?.();
  } catch {
    /* ignore */
  }
  root.remove();
  document.documentElement.classList.remove('tour-on');
  if (completed && id) localStorage.setItem(`inkpad-tour-${id}-${TOUR_VER}`, '1');
  active = null;
}

type DockMode = 'float' | 'bottom' | 'top' | 'dock';

function placeCard(card: HTMLElement, hole: DOMRect | null, mode: DockMode) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const M = 12;

  if (mode === 'bottom' || mode === 'dock' || !hole) {
    card.style.width = mode === 'dock' ? 'min(420px, calc(100vw - 24px))' : 'auto';
    card.style.left = mode === 'dock' ? '50%' : '10px';
    card.style.right = mode === 'dock' ? 'auto' : '10px';
    card.style.transform = mode === 'dock' ? 'translateX(-50%)' : 'none';
    card.style.bottom = '10px';
    card.style.top = 'auto';
    return;
  }
  if (mode === 'top') {
    card.style.width = 'auto';
    card.style.left = '10px';
    card.style.right = '10px';
    card.style.transform = 'none';
    card.style.top = '10px';
    card.style.bottom = 'auto';
    return;
  }

  card.style.transform = 'none';
  card.style.width = Math.min(360, vw - 28) + 'px';
  card.style.right = 'auto';
  card.style.bottom = 'auto';
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  let x = clamp(hole.left + hole.width / 2 - cw / 2, M, vw - cw - M);
  let y: number;

  // Sidebar-style targets (left rail): sit beside them instead of on top.
  if (hole.left < vw * 0.34 && hole.right + M + cw <= vw - M) {
    card.style.left = hole.right + M + 'px';
    card.style.top = clamp(hole.top + hole.height / 2 - ch / 2, M, vh - ch - M) + 'px';
    return;
  }

  if (hole.bottom + M + ch <= vh - M) {
    y = hole.bottom + M;
  } else if (hole.top - M - ch >= M) {
    y = hole.top - M - ch;
  } else {
    y = clamp(vh - ch - M, M, vh - ch - M);
    x = hole.right + M + cw <= vw - M ? hole.right + M : clamp(hole.left - M - cw, M, vw - cw - M);
  }
  card.style.left = x + 'px';
  card.style.top = y + 'px';
}

function showStep(idx: number) {
  if (!active) return;
  const { steps, hole, ring, dim, card, demo } = active;
  // stop the previous step's repaint loop, otherwise its stale closure keeps
  // moving the spotlight back to the old target
  if (active.timer) {
    clearInterval(active.timer);
    active.timer = 0;
  }
  active.i = idx;
  const step = steps[idx];
  if (!step) {
    stopTour(true, active.id);
    return;
  }

  // leaving the previous step may need cleanup (close a popover, ...)
  if (idx > 0) {
    try {
      steps[idx - 1]?.after?.();
    } catch {
      /* ignore */
    }
  }
  try {
    step.before?.();
  } catch {
    /* ignore */
  }

  const target = step.target ? step.target() : null;
  if (target) target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });

  const paint = () => {
    if (!active) return;
    const t = step.target ? step.target() : null;
    const r = t ? rectOf(t) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r && isVisible(t)) {
      const pad = step.pad ?? 8;
      const x = clamp(r.left - pad, 2, vw - 10);
      const y = clamp(r.top - pad, 2, vh - 10);
      const w = Math.min(r.width + pad * 2, vw - x - 2);
      const h = Math.min(r.height + pad * 2, vh - y - 2);
      hole.style.left = x + 'px';
      hole.style.top = y + 'px';
      hole.style.width = w + 'px';
      hole.style.height = h + 'px';
      hole.style.opacity = '1';
      dim.style.opacity = '0';
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      ring.style.width = w + 'px';
      ring.style.height = h + 'px';
      ring.style.opacity = '1';
      const narrow = window.innerWidth < 620;
      if (step.place === 'dock') {
        placeCard(card, null, 'dock');
      } else if (narrow) {
        // keep the card away from the thing being explained
        const targetLow = r.top + r.height / 2 > window.innerHeight * 0.45;
        placeCard(card, null, targetLow ? 'top' : 'bottom');
      } else {
        placeCard(card, new DOMRect(x, y, w, h), 'float');
      }
    } else {
      hole.style.opacity = '0';
      ring.style.opacity = '0';
      dim.style.opacity = '1';
      placeCard(card, null, 'dock');
    }
  };

  card.querySelector('#tour-count')!.textContent = `${idx + 1} / ${steps.length}`;
  card.querySelector('#tour-title')!.textContent = step.title;
  card.querySelector('#tour-body')!.innerHTML = step.body;
  const wrap = card.querySelector('#tour-demo-wrap') as HTMLElement;
  if (step.demo && DEMOS[step.demo]) {
    wrap.style.display = 'block';
    const cv = card.querySelector('#tour-demo') as HTMLCanvasElement;
    demo.attach(cv);
    demo.play(step.demo);
  } else {
    wrap.style.display = 'none';
    demo.stop();
  }
  const back = card.querySelector('#tour-back') as HTMLButtonElement;
  const next = card.querySelector('#tour-next') as HTMLButtonElement;
  back.style.visibility = idx === 0 ? 'hidden' : 'visible';
  next.textContent = idx === steps.length - 1 ? 'Finish' : 'Next';

  paint();
  // keep the spotlight glued to the target (scroll, layout shifts, popovers)
  setTimeout(paint, 60);
  setTimeout(paint, 340);
  if (active) active.timer = window.setInterval(paint, 220);
}

function runTour(id: string, allSteps: Step[]) {
  stopTour(false);
  const steps = allSteps.filter((s) => (s.target ? s.target() !== null : true));
  if (!steps.length) return;
  const root = tourRoot();
  document.documentElement.classList.add('tour-on');
  root.style.display = 'block';

  const hole = root.querySelector('#tour-hole') as HTMLElement;
  const ring = root.querySelector('#tour-ring') as HTMLElement;
  const dim = root.querySelector('#tour-dim') as HTMLElement;
  const card = root.querySelector('#tour-card') as HTMLElement;
  const demo = new DemoPlayer();

  active = { id, steps, i: 0, root, hole, ring, dim, card, demo, timer: 0 };

  (card.querySelector('#tour-next') as HTMLElement).onclick = () => {
    if (!active) return;
    if (active.i >= active.steps.length - 1) stopTour(true, active.id);
    else showStep(active.i + 1);
  };
  (card.querySelector('#tour-back') as HTMLElement).onclick = () => {
    if (active && active.i > 0) showStep(active.i - 1);
  };
  // Skipping still counts as "seen": the tour must not nag on every visit.
  const skip = () => stopTour(true, active ? active.id : undefined);
  (card.querySelector('#tour-skip') as HTMLElement).onclick = skip;
  (card.querySelector('#tour-x') as HTMLElement).onclick = skip;

  showStep(0);
}

/* keyboard + resize handling */
window.addEventListener(
  'keydown',
  (e) => {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stopTour(false);
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      const btn = active.card.querySelector('#tour-next') as HTMLButtonElement;
      btn?.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      (active.card.querySelector('#tour-back') as HTMLButtonElement)?.click();
    }
  },
  true
);
window.addEventListener('resize', () => {
  if (!active) return;
  active.demo.resize();
  showStep(active.i);
});

/* ------------------------------------------------------------------ */
/* Tour content                                                        */
/* ------------------------------------------------------------------ */

function navLink(filter: string): HTMLElement | null {
  return document.querySelector(`#nav a[data-f="${filter}"]`);
}

function openOverflowIfNeeded(sel: string) {
  const t = document.querySelector(sel) as HTMLElement | null;
  const tb = document.getElementById('tb');
  if (t && !isVisible(t) && tb) tb.classList.add('more');
}

function closeOverflow() {
  document.getElementById('tb')?.classList.remove('more');
}

/** Open the overflow panel only where the sub-toolbar is actually hidden. */
function ensureOverflow() {
  const b2 = document.getElementById('bar2');
  const tb = document.getElementById('tb');
  if (b2 && tb && !isVisible(b2)) tb.classList.add('more');
}

/**
 * Find a control by its tooltip. Many engine buttons carry no id, so the title
 * is the only stable handle; `prefix` copes with labels that change state
 * ("Animate next drawing: off" / "… on").
 */
function byTitle(title: string, prefix = false) {
  return () => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('#bar [title], #bar2 [title]'));
    return (
      all.find((n) => {
        const t = n.getAttribute('title') || '';
        return prefix ? t.startsWith(title) : t === title;
      }) || null
    );
  };
}

const HOME_STEPS: Step[] = [
  {
    title: 'Welcome to Inkpad 👋',
    body:
      'A short tour of the library. It takes about a minute, and you can leave at any point with <b>Skip tour</b>.',
    demo: 'pen',
  },
  {
    target: () => document.getElementById('nav'),
    title: 'Your shelves',
    body:
      '<b>Documents</b> holds every notebook, <b>Favorites</b> pins the ones you open daily, and <b>Trash</b> keeps deleted notebooks until you empty it.',
  },
  {
    target: () => document.querySelector('.new') as HTMLElement | null,
    title: 'Create a notebook',
    body:
      'Tap the <b>+</b> card, give the notebook a title and pick a paper style: lined, blank, grid, dotted or Cornell notes.',
    pad: 6,
  },
  {
    target: () => document.getElementById('find'),
    title: 'Find anything fast',
    body: 'Search filters your notebooks by title as you type. It works offline too.',
    demo: 'search',
  },
  {
    target: () => byText('#libm button', 'Import backup'),
    title: 'Coming from another device?',
    body:
      '<b>Import backup</b> restores a <code>.inkpad</code> file exported from another phone, tablet or browser.',
    pad: 6,
  },
  {
    target: () => document.getElementById('pen-btn'),
    title: 'Stylus & pen setup',
    body:
      'Tell Inkpad which stylus you use. Choose what the <b>eraser end</b> and the <b>barrel buttons</b> do, test pressure live, and turn on palm rejection.',
    demo: 'penmap',
  },
  {
    target: () => document.getElementById('cloud-btn'),
    title: 'Cloud backup',
    body:
      'Sign in to keep a copy of every notebook in the cloud. Each notebook can sync on its own — look for the little <b>☁️</b> toggle on its card.',
    demo: 'cloud',
  },
  {
    target: () =>
      (document.getElementById('auth-login-btn') as HTMLElement | null) ||
      (document.getElementById('user-info-box') as HTMLElement | null),
    title: 'Sign in (optional)',
    body:
      'Without an account your notebooks still survive a refresh, but they live on this device only. Signing in protects them if the browser clears its storage.',
  },
  {
    target: () => document.getElementById('install-btn'),
    title: 'Install it like an app',
    body:
      'On iPad or iPhone: <b>Share → Add to Home Screen</b>. On Android: <b>⋮ → Install app</b>. Full steps are one tap away.',
    demo: 'install',
  },
  {
    target: () => document.getElementById('beta-badge'),
    title: 'Beta — and how to reach us',
    body:
      'Inkpad is still in <b>BETA</b>. Something broken or missing? Mail <b>aechmoose@gmail.com</b> — it is also the contact shown to users.',
    pad: 6,
  },
  {
    title: 'That’s the library',
    body:
      'Open any notebook and the tool tour starts automatically. You can replay either tour any time from <b>🎬 Tour</b> in the sidebar.',
  },
];

const EDITOR_STEPS: Step[] = [
  {
    title: 'The tool tour',
    body:
      'Every tool is shown with a looping animation so you can see it working. Move with <b>Next</b>, or press <b>Esc</b> to leave.',
    demo: 'pen',
  },

  /* ---- writing ---------------------------------------------------- */
  {
    target: () => document.querySelector('[data-t="pen"]') as HTMLElement | null,
    title: '✎ Pen',
    body:
      'Your main writing tool. <b>Pressure changes the line width</b> — press lightly for hairlines, harder for bold strokes.',
    demo: 'pen',
  },
  {
    // the nib list lives in the pen's own panel, so the pen button is the target
    target: () => document.querySelector('[data-t="pen"]') as HTMLElement | null,
    title: 'Pen nib',
    body:
      'Tap the pen again to open its panel: six nibs — ballpoint, fountain, brush, pencil, crayon and marker. Each has its own taper and texture, so a page can switch feel halfway through.',
  },
  {
    target: () => document.querySelector('[data-t="hl"]') as HTMLElement | null,
    title: '🖍 Highlighter',
    body:
      'Draws a wide, translucent band that lets the text underneath show through. Perfect for marking up a page you already wrote.',
    demo: 'hl',
  },
  {
    target: () => document.querySelector('[data-t="er"]') as HTMLElement | null,
    title: 'Eraser',
    body:
      'Wipes strokes back to blank paper. If your stylus has an <b>eraser end</b>, flipping the pen switches to the eraser automatically — set that up in <b>Stylus &amp; pen</b>.',
    demo: 'er',
  },
  {
    // both eraser modes sit behind the eraser button
    target: () => document.querySelector('[data-t="er"]') as HTMLElement | null,
    title: 'Whole-stroke eraser',
    body:
      'The eraser panel holds two modes: rub through a stroke like a real eraser, or remove the <b>entire stroke</b> with one touch. The second is much faster when you want a line gone completely.',
    demo: 'er',
  },
  {
    title: 'Scribble to erase',
    body:
      'Scratch back and forth over a word, a doodle or a shape and it disappears — no need to switch tools. Only a dense scratch triggers it, so ordinary writing is never touched. Turn it off under <b>Settings → Scribble to erase</b>.',
    demo: 'er',
  },

  /* ---- selecting -------------------------------------------------- */
  {
    target: () => document.querySelector('[data-t="sel"]') as HTMLElement | null,
    title: 'Lasso select',
    body:
      'Circle anything to select it, then <b>drag to move</b>. The selection controls in the toolbar let you enlarge ⤢, shrink ⤡ or delete it.',
    demo: 'sel',
  },
  {
    target: () => document.getElementById('sg'),
    title: 'Resize or delete a selection',
    body:
      'With something selected, ⤢ enlarges it, ⤡ shrinks it and the bin removes it. Scaling works on handwriting, shapes and images alike.',
    before: ensureOverflow,
    after: closeOverflow,
  },

  /* ---- shapes ----------------------------------------------------- */
  {
    // rectangle, oval, arrow, hidden line and axes all live in this one panel
    target: () => document.querySelector('[data-t="line"]') as HTMLElement | null,
    title: 'Shapes, arrows & axes',
    body:
      'One panel holds a straight <b>line</b>, an <b>arrow</b>, a dashed <b>hidden line</b>, <b>rectangles</b>, <b>ovals</b>, and 2D / 3D <b>axes</b> for graphs. Drag to size — the preview follows your finger.',
    demo: 'shape',
  },
  {
    target: () => document.querySelector('[data-t="bk"]') as HTMLElement | null,
    title: 'Paint bucket',
    body:
      'Tap inside a closed shape to fill it, or tap a line to recolour it. Fill a rough circle you drew by hand and it behaves like a real shape.',
    demo: 'fill',
  },

  /* ---- text and media --------------------------------------------- */
  {
    target: () => document.querySelector('[data-t="text"]') as HTMLElement | null,
    title: 'Text',
    body:
      'Tap anywhere to type. Text stays editable, unlike handwriting, and it can be moved or restyled later.',
    demo: 'text',
  },
  {
    target: () => document.getElementById('fnt'),
    title: 'Fonts',
    body:
      'Pick the typeface for new text — Arnie, Georgia, Courier and more. Existing text keeps the font it was written in.',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.getElementById('img'),
    title: 'Insert an image',
    body:
      'Drop a photo or diagram onto the page. Move and resize it like any other object, then draw on top of it.',
    demo: 'image',
  },
  {
    target: byTitle('Insert video'),
    title: 'Insert a video',
    body:
      'Embed a clip on the page and play it right there — useful for lectures, recorded experiments or a worked example you want to keep beside your notes.',
  },
  {
    target: byTitle('Figure library'),
    title: 'Figure library',
    body:
      'Ready-made shapes for science and maths — circuits, arrows, containers and more — so you can assemble a diagram without drawing every part by hand.',
  },
  {
    target: () => document.getElementById('gn-stk-btn'),
    title: 'Stickers',
    body:
      'Stars, arrows, ticks, leaves and more. Tap one to drop it on the page, then drag or resize it like any picture. Stickers export with the page and sync with the notebook.',
    pad: 10,
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: byTitle('Engineering symbols'),
    title: 'Engineering symbols',
    body:
      'A palette of symbols you can stamp straight onto the page: resistors, capacitors, valves, flow arrows and the rest of the usual notation.',
  },

  /* ---- drawing aids ----------------------------------------------- */
  {
    target: () => document.querySelector('[data-t="laser"]') as HTMLElement | null,
    title: 'Laser pointer',
    body:
      'A glowing dot that fades as you move — handy when teaching or presenting on a projector. Nothing is saved to the page.',
    demo: 'laser',
  },
  {
    target: byTitle('Guides, symmetry and perspective'),
    title: 'Guides & symmetry',
    body:
      'Overlay ruled guides, mirror everything you draw across an axis, or snap to a perspective grid — the fastest way to keep a sketch in proportion.',
  },
  {
    target: byTitle('Layers (per page)'),
    title: 'Layers',
    body:
      'Each page can hold several layers. Keep annotations on one and artwork on another, then hide or reorder them without touching the ink itself.',
  },
  {
    target: byTitle('Animate next drawing', true),
    title: 'Animate a drawing',
    body:
      'Turn animation on, draw, and Inkpad records the stroke. Press ▶ to play it back — handy for showing how a diagram was built up.',
  },

  /* ---- colour and thickness --------------------------------------- */
  {
    target: () => document.getElementById('sws'),
    title: 'Colour',
    body:
      'Five ready swatches, plus the round picker for any shade you like. The choice applies to pens, highlighter, shapes and text.',
    demo: 'colors',
  },
  {
    target: () => document.getElementById('size'),
    title: 'Thickness & pressure',
    body:
      'The slider sets the base thickness in 0.1 steps, and the number beside it accepts an exact value. Pressure response scales it while you draw.',
    demo: 'pressure',
    pad: 12,
    place: 'dock',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.getElementById('prs'),
    title: 'Pressure response',
    body:
      'How strongly the line reacts to how hard you press. Turn it down for a flatter, more technical line; up for expressive calligraphy.',
    before: ensureOverflow,
    after: closeOverflow,
  },

  /* ---- snap -------------------------------------------------------- */
  {
    target: () => document.getElementById('snap-btn'),
    title: '🧲 Snap',
    body:
      'Toggle this on and the pen <b>magnetises</b> to the tip or corner of an existing object, and to the point where two lines cross. Close a shape exactly, join a stroke to the end of another, or land on an intersection — the marker shows the target before you commit.',
    demo: 'snap',
    pad: 10,
    before: ensureOverflow,
    after: closeOverflow,
  },

  /* ---- view -------------------------------------------------------- */
  {
    target: () => document.getElementById('zi'),
    title: 'Zoom',
    body:
      'Zoom in and out, or pinch on a touchscreen. Pan with two fingers, or hold <b>Space</b> and drag on a computer.',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.getElementById('side-t'),
    title: 'Page thumbnails',
    body:
      'Opens a strip of live page previews down the left. Tap any page to jump straight to it — the quickest way around a long notebook.',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.getElementById('fs'),
    title: 'Full screen',
    body:
      'Hides every panel so only paper is left. Tap again, or press <b>Esc</b>, to bring the tools back.',
    before: ensureOverflow,
    after: closeOverflow,
  },

  /* ---- paper ------------------------------------------------------- */
  {
    target: () => document.getElementById('tpl'),
    title: 'Paper template',
    body:
      'Blank, lined, grid, dotted or Cornell — change it per page at any time. Your ink stays exactly where it is.',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.getElementById('pc'),
    title: 'Paper colour',
    body:
      'White, cream, and darker shades for low light. Handy for matching a real notebook, or for a page you plan to print.',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.querySelector('#bar2 [title="Page resolution"]') as HTMLElement | null,
    title: 'Export resolution',
    body:
      'How many dots per inch the page is rendered at when you export. Higher is sharper and heavier — 300 dpi is a good print default.',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.getElementById('clr'),
    title: 'Clear page',
    body:
      'Empties the current page in one go. Other pages are untouched, and <b>undo</b> still brings the ink back if you change your mind.',
    before: ensureOverflow,
    after: closeOverflow,
  },

  /* ---- history and pages ------------------------------------------ */
  {
    target: () => document.getElementById('undo'),
    title: 'Undo & redo',
    body:
      'Every stroke is undoable — ↶ steps back, ↷ steps forward. Nothing is lost until you clear the page.',
    demo: 'undo',
  },
  {
    target: () => document.getElementById('pg'),
    title: 'Pages',
    body:
      'Add, duplicate and delete pages, and step through them with ‹ ›. Each page keeps its own paper style and background colour.',
    demo: 'pages',
  },

  /* ---- output ------------------------------------------------------ */
  {
    target: () => document.getElementById('share'),
    title: 'Export & share',
    body:
      'Send the notebook out as <b>PDF</b> (all pages) or <b>PNG</b>, ready for GoodNotes, Notability, OneNote, Samsung Notes or Apple Notes.',
    demo: 'share',
    before: ensureOverflow,
    after: closeOverflow,
  },
  {
    target: () => document.getElementById('back'),
    title: 'Back to the library',
    body:
      'Everything saves automatically as you write. ‹ <b>Library</b> returns to your shelves, and the notebook is right where you left it.',
  },
  {
    title: 'You’re ready to write ✍️',
    body:
      'Replay this tour any time with the <b>?</b> button at the bottom-right of the canvas.',
  },
];

/* ------------------------------------------------------------------ */
/* Install guide                                                       */
/* ------------------------------------------------------------------ */

const SHARE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;
const PLUS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const DOTS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;
const HOME_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/></svg>`;

function installRow(icon: string, text: string, accent = false): HTMLElement {
  const row = el(
    'div',
    'display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.45' +
      (accent ? ';background:rgba(47,109,246,.09);border-radius:10px;padding:8px 10px' : '')
  );
  const ic = el('span', 'flex:none;color:' + (accent ? 'var(--ac)' : 'var(--mu)') + ';margin-top:1px');
  ic.innerHTML = icon;
  row.appendChild(ic);
  const tx = el('span', accent ? 'font-weight:600' : 'color:var(--tx)');
  tx.innerHTML = text;
  row.appendChild(tx);
  return row;
}

function buildInstallPanel(): HTMLElement {
  let md = document.getElementById('install-md');
  if (md) return md;
  md = el('div', '') as HTMLElement;
  md.id = 'install-md';
  md.innerHTML =
    '<div class="box">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
    '<b style="font-size:17px">📲 Install Inkpad</b>' +
    '<button class="ic" id="install-close" style="font-size:16px;padding:2px 6px" aria-label="Close">✕</button>' +
    '</div>' +
    '<div id="install-tabs" role="tablist"></div>' +
    '<div id="install-body"></div>' +
    '<div id="install-note" style="font-size:11.5px;color:var(--mu);line-height:1.5"></div>' +
    '</div>';
  document.body.appendChild(md);

  const close = () => md!.classList.remove('on');
  md.querySelector('#install-close')!.addEventListener('click', close);
  md.addEventListener('pointerdown', (e) => {
    if (e.target === md) close();
  });
  return md;
}

function renderInstallTab(md: HTMLElement, tab: 'ios' | 'android' | 'desktop') {
  const tabs = md.querySelector('#install-tabs') as HTMLElement;
  const body = md.querySelector('#install-body') as HTMLElement;
  const note = md.querySelector('#install-note') as HTMLElement;

  const defs: [string, string][] = [
    ['ios', 'iPhone / iPad'],
    ['android', 'Android'],
    ['desktop', 'Computer'],
  ];
  tabs.innerHTML = '';
  tabs.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  defs.forEach(([k, label]) => {
    const b = el('button', 'font-size:12px;padding:6px 11px;border-radius:999px', label) as HTMLButtonElement;
    const on = k === tab;
    b.style.borderColor = on ? 'var(--ac)' : 'var(--bd)';
    b.style.color = on ? 'var(--ac)' : 'var(--mu)';
    b.style.background = on ? 'rgba(47,109,246,.1)' : 'transparent';
    b.style.fontWeight = on ? '600' : '400';
    b.onclick = () => renderInstallTab(md, k as any);
    tabs.appendChild(b);
  });

  body.innerHTML = '';
  body.style.cssText = 'display:flex;flex-direction:column;gap:9px;margin-top:4px';

  // Browsers that support one-tap install (Chrome / Edge / Samsung) get a
  // primary button; everyone else follows the manual steps below.
  if (canPromptInstall) {
    const go = el(
      'button',
      'font-weight:600;padding:10px;font-size:13.5px;background:var(--ac);color:#fff;border:0;border-radius:11px;cursor:pointer',
      '⚡ Install Inkpad now'
    ) as HTMLButtonElement;
    go.onclick = async () => {
      await (window as any).__inkpad_cloud?.promptInstall?.();
      md.classList.remove('on');
    };
    body.appendChild(go);
  }

  if (tab === 'ios') {
    body.appendChild(
      elHTML(
        'div',
        'font-size:12.5px;color:var(--mu);line-height:1.5',
        'Open Inkpad in <b style="color:var(--tx)">Safari</b>. (On iPadOS 13+ any browser works, but the Share sheet is most reliable in Safari.)'
      )
    );
    body.appendChild(installRow(SHARE_ICON, 'Tap the <b>Share</b> button in the browser toolbar — the square with an arrow pointing up.'));
    body.appendChild(installRow(PLUS_ICON, 'Scroll down the share sheet and tap <b>Add to Home Screen</b>.', true));
    body.appendChild(installRow(HOME_ICON, 'Keep the name as <b>Inkpad</b>, then tap <b>Add</b>. The icon appears on your home screen.'));
    note.innerHTML =
      'The icon and name come from Inkpad itself, so it will appear as <b style="color:var(--tx)">Inkpad</b>. Installed, it opens full screen without browser bars and your notebooks stay available offline.';
  } else if (tab === 'android') {
    body.appendChild(
      elHTML(
        'div',
        'font-size:12.5px;color:var(--mu);line-height:1.5',
        'Open Inkpad in <b style="color:var(--tx)">Chrome</b> (or Edge / Samsung Internet).'
      )
    );
    body.appendChild(installRow(DOTS_ICON, 'Tap the <b>⋮</b> menu in the top-right corner.'));
    body.appendChild(installRow(PLUS_ICON, 'Choose <b>Install app</b> (older versions say <b>Add to Home screen</b>).', true));
    body.appendChild(installRow(HOME_ICON, 'Confirm — Inkpad is added to your home screen and app drawer.'));
    note.innerHTML =
      'Installed as a PWA, Inkpad gets its own window, works offline, and Android keeps its storage instead of clearing it.';
  } else {
    body.appendChild(
      elHTML(
        'div',
        'font-size:12.5px;color:var(--mu);line-height:1.5',
        'Inkpad installs as a desktop app from Chrome or Edge.'
      )
    );
    body.appendChild(installRow(PLUS_ICON, 'Click the <b>install icon</b> at the right end of the address bar.', true));
    body.appendChild(installRow(HOME_ICON, 'Or open <b>⋮ → Install Inkpad</b> and confirm.'));
    note.innerHTML =
      'Firefox and Safari on macOS do not install PWAs — use Chrome or Edge for the desktop app.';
  }
}

function openInstall() {
  const md = buildInstallPanel();
  const tab: 'ios' | 'android' | 'desktop' = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  renderInstallTab(md, tab);
  md.classList.add('on');
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function navButton(id: string, label: string, onclick: () => void) {
  if (document.getElementById(id)) return;
  const nav = document.getElementById('nav');
  if (!nav) return;
  const b = el(
    'button',
    'text-align:left;background:transparent;border:0;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;color:inherit',
    label
  ) as HTMLButtonElement;
  b.id = id;
  b.type = 'button';
  b.onclick = onclick;
  const before = document.getElementById('auth-login-btn') || document.getElementById('user-info-box');
  if (before && before.parentNode === nav) nav.insertBefore(b, before);
  else nav.appendChild(b);
}

function ensureNavButtons() {
  navButton('tour-btn', '🎬 Tour', () => runTour('home', HOME_STEPS));
  navButton('install-btn', '📲 Install app', openInstall);
}

/** Small "?" launcher inside the editor. */
function ensureFab() {
  if (document.getElementById('tour-fab')) return;
  const b = el('button', '', '?') as HTMLButtonElement;
  b.id = 'tour-fab';
  b.type = 'button';
  b.title = 'Replay the tool tour';
  b.setAttribute('aria-label', 'Replay the tool tour');
  b.onclick = () => runTour('editor', EDITOR_STEPS);
  document.body.appendChild(b);
}

/**
 * The animation frame bar sits across the bottom of the page whenever animation
 * is on, right under the "?" button. Lift the button clear of it rather than
 * parking it at a fixed height — the bar's own height changes with the filmstrip.
 */
function placeFab() {
  const fab = document.getElementById('tour-fab');
  if (!fab) return;
  let bottom = 74;
  const frb = document.getElementById('frb');
  if (frb && getComputedStyle(frb).display !== 'none') {
    const r = frb.getBoundingClientRect();
    if (r.height > 0) bottom = Math.max(bottom, Math.round(window.innerHeight - r.top) + 10);
  }
  fab.style.bottom = bottom + 'px';
}

function edVisible(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

/* ------------------------------------------------------------------ */
/* Auto-start                                                          */
/* ------------------------------------------------------------------ */

let autoEditorTimer = 0;

function maybeAutoStartHome() {
  if (localStorage.getItem(HOME_FLAG)) return;
  if (edVisible()) return;
  if (document.getElementById('auth-md')?.classList.contains('on')) return;
  if (active) return;
  runTour('home', HOME_STEPS);
}

function watchEditor() {
  let wasOpen = edVisible();
  const tick = () => {
    const open = edVisible();
    const fab = document.getElementById('tour-fab');
    if (fab) fab.style.display = open ? 'flex' : 'none';
    if (open) placeFab();
    if (open && !wasOpen) {
      // first time in the editor: offer the tool tour
      clearTimeout(autoEditorTimer);
      if (!localStorage.getItem(EDITOR_FLAG) && !active) {
        autoEditorTimer = window.setTimeout(() => {
          if (!active && edVisible()) runTour('editor', EDITOR_STEPS);
        }, 900);
      }
    }
    if (!open && wasOpen) stopTour(false);
    wasOpen = open;
  };
  tick();
  new MutationObserver(tick).observe(document.getElementById('ed') || document.body, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  setInterval(tick, 700);
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
#tour-root{position:fixed;inset:0;z-index:300;display:none;pointer-events:auto;font:inherit}
#tour-dim{position:absolute;inset:0;background:rgba(9,12,20,.62);opacity:0;transition:opacity .2s;pointer-events:none}
#tour-hole{position:absolute;border-radius:12px;box-shadow:0 0 0 9999px rgba(9,12,20,.62);transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1),width .26s cubic-bezier(.22,.61,.36,1),height .26s cubic-bezier(.22,.61,.36,1),opacity .2s;pointer-events:none;opacity:0}
#tour-ring{position:absolute;border:2px solid var(--ac);border-radius:14px;pointer-events:none;opacity:0;transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1),width .26s cubic-bezier(.22,.61,.36,1),height .26s cubic-bezier(.22,.61,.36,1),opacity .2s;animation:tourPulse 1.8s ease-out infinite}
@keyframes tourPulse{0%{box-shadow:0 0 0 0 rgba(47,109,246,.45)}70%{box-shadow:0 0 0 10px rgba(47,109,246,0)}100%{box-shadow:0 0 0 0 rgba(47,109,246,0)}}
#tour-card{position:absolute;background:var(--sf);color:var(--tx);border:1px solid var(--bd);border-radius:16px;padding:14px 15px 12px;box-shadow:0 18px 44px rgba(6,12,28,.34);display:flex;flex-direction:column;gap:9px;max-height:min(78vh,560px);overflow:auto;transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1)}
#tour-top{display:flex;justify-content:space-between;align-items:center}
#tour-count{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--ac);background:rgba(47,109,246,.12);padding:2px 8px;border-radius:999px}
#tour-x{border:0;background:transparent;color:var(--mu);font-size:15px;cursor:pointer;padding:2px 4px;line-height:1}
#tour-title{margin:0;font-size:16.5px;line-height:1.25}
#tour-body{margin:0;font-size:13px;line-height:1.55;color:var(--mu)}
#tour-body b{color:var(--tx)}
#tour-body code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:4px;font-size:12px}
#tour-demo-wrap{position:relative;display:none;border:1px solid var(--bd);border-radius:11px;overflow:hidden;background:#fff;margin-top:2px}
#tour-demo-tag{position:absolute;top:6px;left:6px;z-index:2;font-size:8.5px;font-weight:800;letter-spacing:.09em;color:#fff;background:rgba(20,28,48,.55);padding:2px 6px;border-radius:999px;pointer-events:none}
#tour-demo{display:block;width:100%;height:132px}
#tour-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:2px}
#tour-skip{border:0;background:transparent;color:var(--mu);font-size:12px;cursor:pointer;padding:6px 2px;text-decoration:underline}
#tour-nav{display:flex;gap:8px}
#tour-nav button{font-size:13px;padding:8px 15px;border-radius:10px;cursor:pointer}
#tour-nav #tour-next{font-weight:600}
#tour-fab{position:fixed;right:14px;bottom:74px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid var(--bd);background:var(--sf);color:var(--ac);font:600 17px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(6,12,28,.18);display:none;align-items:center;justify-content:center}
#tour-fab:hover{background:color-mix(in srgb,var(--ac) 12%,var(--sf))}
/* the engine's own install button is replaced by the guide entry point */
#nav #pwa-btn{display:none!important}
#install-md{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;z-index:250;padding:16px}
#install-md.on{display:flex}
#install-md .box{background:var(--sf);color:var(--tx);border-radius:18px;padding:18px;width:min(94vw,420px);max-height:88vh;overflow:auto;display:flex;flex-direction:column;gap:11px;border:1px solid var(--bd);box-shadow:0 18px 44px rgba(6,12,28,.3)}
html.tour-on #tour-fab{display:none!important}
@media (max-width:620px){
  #tour-demo{height:112px}
  #tour-card{padding:12px 13px 10px;border-radius:14px 14px 0 0}
  #tour-nav button{padding:9px 16px}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  const style = document.createElement('style');
  style.id = 'tour-styles';
  style.textContent = CSS;
  document.head.appendChild(style);

  ensureNavButtons();
  ensureFab();
  watchEditor();

  // Home tour on first visit (give the library a moment to paint).
  setTimeout(maybeAutoStartHome, 1100);

  // Offer the install guide once on iOS, where the flow is least obvious.
  if (isIOS && !isStandalone && !localStorage.getItem('inkpad-install-dismissed')) {
    setTimeout(() => {
      if (active || document.getElementById('install-md')?.classList.contains('on')) return;
      const md = buildInstallPanel();
      const body = md.querySelector('#install-body') as HTMLElement;
      const note = md.querySelector('#install-note') as HTMLElement;
      renderInstallTab(md, 'ios');
      const dismiss = el('button', 'font-size:12px;padding:6px 10px;align-self:flex-start;margin-top:2px', 'Don’t show this again') as HTMLButtonElement;
      dismiss.onclick = () => {
        localStorage.setItem('inkpad-install-dismissed', '1');
        md.classList.remove('on');
      };
      body.appendChild(dismiss);
      note.textContent = 'You can reopen this any time from “📲 Install app” in the sidebar.';
      md.classList.add('on');
    }, 2200);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/* Test / debug bridge */
(window as any).__inkpad_tour = {
  home: () => runTour('home', HOME_STEPS),
  editor: () => runTour('editor', EDITOR_STEPS),
  install: openInstall,
  stop: () => stopTour(false),
  reset() {
    localStorage.removeItem(HOME_FLAG);
    localStorage.removeItem(EDITOR_FLAG);
    localStorage.removeItem('inkpad-install-dismissed');
  },
  get running() {
    return !!active;
  },
  demos: Object.keys(DEMOS),
};
