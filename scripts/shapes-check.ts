import { recogniseShape, type Pt } from '../src/shapes-geometry';

function jitter(p: Pt, amt: number): Pt {
  return [p[0] + (Math.random() - 0.5) * amt, p[1] + (Math.random() - 0.5) * amt];
}

function circle(cx: number, cy: number, r: number, n = 60): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 * 1.03;
    out.push(jitter([cx + Math.cos(t) * r, cy + Math.sin(t) * r], 3));
  }
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 60): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 * 1.02;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    out.push(jitter([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)], 2));
  }
  return out;
}

function polygon(V: Pt[], n = 5): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < V.length; i++) {
    const a = V[i];
    const b = V[(i + 1) % V.length];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push(jitter([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], 2));
    }
  }
  out.push(V[0]);
  return out;
}

function poly(cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): Pt[] {
  const V: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * Math.PI * 2) / sides;
    V.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return V;
}

function parabola(cx: number, cy: number, w: number, h: number, n = 50): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(jitter([cx - w / 2 + w * t, cy + h * (t - 0.5) * (t - 0.5) * 4], 2));
  }
  return out;
}

function hyperbola(cx: number, cy: number, a: number, b: number, n = 30): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -1.3 + (2.6 * i) / n;
    out.push(jitter([cx + a * Math.cosh(t), cy + b * Math.sinh(t)], 2));
  }
  for (let i = 0; i <= n; i++) {
    const t = -1.3 + (2.6 * i) / n;
    out.push(jitter([cx - a * Math.cosh(t), cy + b * Math.sinh(t)], 2));
  }
  return out;
}

const cases: [string, Pt[], string][] = [
  ['circle', circle(300, 300, 90), 'circle'],
  ['ellipse', ellipse(300, 300, 130, 70), 'ell'],
  ['rotated ellipse', ellipse(300, 300, 120, 60, 0.6), 'ell'],
  ['square', polygon([[-70, -70], [70, -70], [70, 70], [-70, 70]].map(([x, y]) => [300 + x, 300 + y] as Pt)), 'square'],
  ['rect', polygon([[-110, -60], [110, -60], [110, 60], [-110, 60]].map(([x, y]) => [300 + x, 300 + y] as Pt)), 'rect'],
  ['triangle', polygon([[300, 180], [400, 380], [200, 380]]), 'tri'],
  ['right triangle', polygon([[180, 180], [180, 380], [400, 380]]), 'tri'],
  ['parallelogram', polygon([[220, 180], [470, 180], [400, 380], [150, 380]]), 'para'],
  ['trapezoid', polygon([[230, 180], [370, 180], [430, 380], [170, 380]]), 'trap'],
  ['rhombus', polygon([[300, 170], [400, 300], [300, 430], [200, 300]]), 'rhomb'],
  ['pentagon', polygon(poly(300, 300, 120, 5)), 'poly'],
  ['hexagon', polygon(poly(300, 300, 120, 6)), 'poly'],
  ['octagon', polygon(poly(300, 300, 120, 8)), 'poly'],
  // Conics are never guessed at: the fit fired on ordinary handwriting far more
  // often than on a deliberate parabola, so an open curve stays a stroke.
  ['parabola', parabola(300, 300, 260, 160), 'none'],
  ['hyperbola', hyperbola(300, 300, 60, 90), 'none'],
  ['line', Array.from({ length: 40 }, (_, i) => jitter([100 + i * 8, 120 + i * 5], 2)), 'line'],
];

let pass = 0;
for (const [name, pts, want] of cases) {
  const r = recogniseShape(pts, { force: true });
  const got = r?.kind ?? 'none';
  const ok = got === want;
  if (ok) pass++;
  console.log((ok ? '✓' : '✗').padEnd(2), name.padEnd(16), '→', got.padEnd(8), r ? `score ${r.score.toFixed(2)}` : '', ok ? '' : `[want ${want}]`);
}
console.log(`\n${pass}/${cases.length}`);
