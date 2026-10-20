/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point {
  0: number;
  1: number;
  2?: number; // pressure or thickness modifier
}

export type BoundingBox = [number, number, number, number]; // [minX, minY, maxX, maxY]

export function dens(p: Point[], st: number): Point[] {
  if (!p || p.length === 0) return [];
  const o: Point[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(d / Math.max(1, st));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (b[2] !== undefined && a[2] !== undefined) {
        o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      } else {
        o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    o.push(b);
  }
  return o;
}

export function inPoly(q: [number, number], P: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i];
    const b = P[j];
    if (
      a[1] > q[1] !== b[1] > q[1] &&
      q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      c = !c;
    }
  }
  return c;
}

export function zEnd(a: [number, number], b: [number, number]): [number, number] {
  const L = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 0.6;
  return [a[0] - L * 0.7, a[1] + L * 0.7];
}

export function shapePts(
  k: string,
  a: [number, number],
  b: [number, number]
): [number, number][] {
  const L: [number, number][] = [];
  const line = (u: [number, number], v: [number, number]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(v[0] - u[0], v[1] - u[1]) / 6));
    for (let i = 0; i <= n; i++) {
      L.push([u[0] + ((v[0] - u[0]) * i) / n, u[1] + ((v[1] - u[1]) * i) / n]);
    }
  };

  if (k === 'line' || k === 'arrow' || k === 'hid') {
    line(a, b);
  } else if (k === 'ax2' || k === 'ax3') {
    line(a, [b[0], a[1]]);
    line(a, [a[0], b[1]]);
    if (k === 'ax3') {
      line(a, zEnd(a, b));
    }
  } else if (k === 'rect') {
    const c: [number, number][] = [a, [b[0], a[1]], b, [a[0], b[1]], a];
    for (let i = 0; i < 4; i++) {
      line(c[i], c[i + 1]);
    }
  } else {
    // Ellipse
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const rx = Math.abs(b[0] - a[0]) / 2;
    const ry = Math.abs(b[1] - a[1]) / 2;
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      L.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
  }
  return L;
}

export function rotateBox(box: BoundingBox, rad: number): BoundingBox {
  if (!rad) return box;
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const co = Math.cos(rad);
  const si = Math.sin(rad);
  const corners: [number, number][] = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[0], box[3]],
    [box[2], box[3]],
  ];
  const P = corners.map(
    (q) =>
      [
        cx + (q[0] - cx) * co - (q[1] - cy) * si,
        cy + (q[0] - cx) * si + (q[1] - cy) * co,
      ] as [number, number]
  );
  return [
    Math.min(...P.map((q) => q[0])),
    Math.min(...P.map((q) => q[1])),
    Math.max(...P.map((q) => q[0])),
    Math.max(...P.map((q) => q[1])),
  ];
}
