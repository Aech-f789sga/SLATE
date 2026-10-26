/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BRX } from './brushData';

export function drawShape(c: CanvasRenderingContext2D, s: any) {
  c.save();
  c.strokeStyle = c.fillStyle = s.c;
  c.lineWidth = s.w;
  c.lineCap = c.lineJoin = 'round';
  if (s.ds) c.setLineDash([s.w * 3 + 6, s.w * 2 + 4]);
  const [x0, y0] = s.a;
  const [x1, y1] = s.b;
  const k = s.k;

  const ah = (x: number, y: number, dx: number, dy: number, col?: string) => {
    const L = Math.hypot(dx, dy) || 1;
    const u = [dx / L, dy / L];
    const h = 12 + s.w * 3.5;
    c.save();
    c.setLineDash([]);
    c.fillStyle = col || s.c;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - u[0] * h + u[1] * h * 0.28, y - u[1] * h - u[0] * h * 0.28);
    c.lineTo(x - u[0] * h - u[1] * h * 0.28, y - u[1] * h + u[0] * h * 0.28);
    c.closePath();
    c.fill();
    c.restore();
  };

  if (k === 'rect') {
    c.beginPath();
    c.rect(x0, y0, x1 - x0, y1 - y0);
    c.stroke();
  } else if (k === 'ell') {
    c.beginPath();
    c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, 7);
    c.stroke();
  } else if (k === 'ax2' || k === 'ax3') {
    const A = s.ac || ['#e5383b', '#2a9d4f', '#2f6df6'];
    const ax = (p: number[], q: number[], col: string, lb: string) => {
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      c.strokeStyle = col;
      c.beginPath();
      const e = (12 + s.w * 3.5) * 0.8;
      c.moveTo(p[0], p[1]);
      c.lineTo(q[0] - ((q[0] - p[0]) / L) * e, q[1] - ((q[1] - p[1]) / L) * e);
      c.stroke();
      ah(q[0], q[1], q[0] - p[0], q[1] - p[1], col);
      c.save();
      c.setLineDash([]);
      c.fillStyle = col;
      c.font = 'bold 16px sans-serif';
      c.textBaseline = 'middle';
      c.fillText(lb, q[0] + ((q[0] - p[0]) / L) * 16 - 4, q[1] + ((q[1] - p[1]) / L) * 16);
      c.restore();
    };
    ax([x0, y0], [x1, y0], A[0], 'x');
    ax([x0, y0], [x0, y1], A[1], 'y');
    if (k === 'ax3') {
      const L = Math.max(Math.abs(s.b[0] - s.a[0]), Math.abs(s.b[1] - s.a[1])) * 0.6;
      const zEnd = [s.a[0] - L * 0.7, s.a[1] + L * 0.7];
      ax([x0, y0], zEnd, A[2], 'z');
    }
  } else {
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    const e = k === 'arrow' ? (12 + s.w * 3.5) * 0.8 : 0;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1 - ((x1 - x0) / L) * e, y1 - ((y1 - y0) / L) * e);
    c.stroke();
    if (k === 'arrow') ah(x1, y1, x1 - x0, y1 - y0);
  }
  c.restore();
}

export function drawPath(c: CanvasRenderingContext2D, p: Array<[number, number] | [number, number, number]>) {
  c.beginPath();
  c.moveTo(p[0][0], p[0][1]);
  if (p.length === 1) c.lineTo(p[0][0] + 0.01, p[0][1]);
  for (let i = 1; i < p.length - 1; i++) {
    c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
  }
  if (p.length > 1) c.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
}

export function drawVarStroke(c: CanvasRenderingContext2D, p: any[], w0: number, tex: boolean) {
  const n = p.length;
  const L: number[][] = [];
  const R: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)];
    const b = p[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const h = (w0 * (p[i][2] || 1)) / 2;
    L.push([p[i][0] - dy * h, p[i][1] + dx * h]);
    R.push([p[i][0] + dy * h, p[i][1] - dx * h]);
  }
  c.beginPath();
  c.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath();
  c.fill();
  if (c.globalAlpha >= 1) {
    [p[0], p[n - 1]].forEach((q) => {
      c.beginPath();
      c.arc(q[0], q[1], (w0 * (q[2] || 1)) / 2, 0, 7);
      c.fill();
    });
  }
  if (tex) {
    c.setLineDash([1, 2.5]);
    c.lineWidth = 1.4;
    c.stroke();
  }
}
