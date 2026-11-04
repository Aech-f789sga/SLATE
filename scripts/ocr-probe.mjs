import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(async () => {
  const mod = await import('/src/math/ocr.ts');
  const readInk = mod.readInk;

  // --- stroke builders (page units, baseline at y=0, cap height 20) ---
  const rot = (pts, cx, cy, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
  };
  const mk = (pts) => ({ p: pts, w: 3 });

  // Real ink is never perfectly straight; a zero-width box would also break the
  // raster normalisation, so every synthetic glyph gets a little shake.
  // Deterministic shake, so a pass rate means something across runs.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const wob = (pts, amt = 0.7) =>
    pts.map(([x, y]) => [x + (rnd() - 0.5) * amt, y + (rnd() - 0.5) * amt]);

  function arc(cx, cy, rx, ry, a0, a1, n = 22) {
    const p = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      p.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
    }
    return p;
  }
  const letterC = (cx, cy, h) => wob(arc(cx, cy, h * 0.46, h * 0.5, 0.75, Math.PI * 2 - 0.75));
  const letterO = (cx, cy, h) => wob(arc(cx, cy, h * 0.44, h * 0.5, 0, Math.PI * 2, 26));
  const letterS = (cx, cy, h) => {
    const p = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const y = cy + h * 0.5 - t * h;
      p.push([cx + Math.sin(2 * Math.PI * t) * h * 0.26, y]);
    }
    return wob(p);
  };
  const letterX = (cx, cy, h) => [
    wob([[cx - h * 0.32, cy - h * 0.5], [cx + h * 0.32, cy + h * 0.5]]),
    wob([[cx + h * 0.32, cy - h * 0.5], [cx - h * 0.32, cy + h * 0.5]]),
  ];
  const letterI = (cx, cy, h) => [wob([[cx, cy - h * 0.5], [cx, cy + h * 0.5]])];
  const letterN = (cx, cy, h) => [
    wob([
      [cx - h * 0.3, cy + h * 0.5],
      [cx - h * 0.3, cy - h * 0.5],
      [cx + h * 0.3, cy + h * 0.5],
      [cx + h * 0.3, cy - h * 0.5],
    ]),
  ];
  const digitOne = (cx, cy, h) => [
    wob([[cx, cy - h * 0.5], [cx, cy + h * 0.5]]),
    wob([[cx - h * 0.14, cy - h * 0.34], [cx, cy - h * 0.5]]),
  ];
  const digitTwo = (cx, cy, h) => {
    const top = arc(cx, cy - h * 0.26, h * 0.24, h * 0.24, Math.PI * 1.1, Math.PI * 2.4, 14);
    return [wob(top.concat([[cx - h * 0.26, cy + h * 0.5], [cx + h * 0.28, cy + h * 0.5]]))];
  };
  const slash = (cx, cy, h) => [wob([[cx - h * 0.24, cy + h * 0.5], [cx + h * 0.24, cy - h * 0.5]])];

  // every builder returns either one point-list or a list of point-lists
  const strokesOf = (parts) =>
    parts.flatMap((p) => (Array.isArray(p[0]) && Array.isArray(p[0][0]) ? p : [p])).map(mk);

  // --- cases ---
  const cases = [];
  const H = 20;

  // cos^x  — the reported failure
  cases.push({
    name: 'cos^x',
    want: { text: 'cosˣ', latex: '\\cos^{x}' },
    strokes: strokesOf([letterC(8, -10, H), letterO(26, -10, H), letterS(42, -10, H), letterX(56, -24, H * 0.62)]),
  });

  // plain "cos", no exponent
  cases.push({
    name: 'cos',
    want: { text: 'cos', latex: '\\cos' },
    strokes: strokesOf([letterC(8, -10, H), letterO(26, -10, H), letterS(42, -10, H)]),
  });

  // sin
  cases.push({
    name: 'sin',
    want: { text: 'sin', latex: '\\sin' },
    strokes: strokesOf([letterS(8, -10, H), letterI(22, -10, H), letterN(34, -10, H)]),
  });

  // cos tilted 16 degrees — the rotation case
  const tilt = 0.28;
  const tilted = [letterC(8, -10, H), letterO(26, -10, H), letterS(42, -10, H)].map((p) =>
    rot(p, 25, -10, tilt)
  );
  cases.push({
    name: 'cos tilted 16°',
    want: { text: 'cos', latex: '\\cos' },
    strokes: strokesOf(tilted),
  });

  // x^2 — a single letter with a numeric exponent
  cases.push({
    name: 'x^2',
    want: { text: 'x²', latex: 'x^{2}' },
    strokes: strokesOf([letterX(8, -10, H), digitTwo(22, -26, H * 0.62)]),
  });

  // 1/2 fraction
  cases.push({
    name: '1/2',
    want: { text: '1/2', latex: '\\frac{1}{2}' },
    strokes: strokesOf([digitOne(8, -10, H), slash(18, -10, H), digitTwo(30, -10, H)]),
  });

  // the same word at a range of writing angles
  for (const deg of [-30, -20, -10, 10, 20, 30]) {
    const a = (deg * Math.PI) / 180;
    const line = [letterC(8, -10, H), letterO(26, -10, H), letterS(42, -10, H)].map((p) => rot(p, 25, -10, a));
    cases.push({ name: `cos @ ${deg}°`, want: { text: 'cos', latex: '\\cos' }, strokes: strokesOf(line) });
  }

  // negative cases: plain numbers must NOT be snapped into function names
  cases.push({
    name: '12 stays 12',
    want: { text: '12', latex: '1 2' },
    strokes: strokesOf([digitOne(8, -10, H), digitTwo(24, -10, H)]),
  });
  cases.push({
    name: 'x+1 stays',
    want: { text: 'x+1', latex: 'x + 1' },
    strokes: strokesOf([letterX(8, -10, H), [[22, -10], [36, -10]], [[29, -17], [29, -3]], digitOne(50, -10, H)]),
  });

  const res = [];
  for (const c of cases) {
    let r;
    try {
      r = readInk(c.strokes, { math: true });
    } catch (e) {
      res.push({ name: c.name, err: String(e && e.message || e) });
      continue;
    }
    res.push({
      name: c.name,
      want: c.want,
      text: r.text,
      latex: r.latex,
      conf: +r.confidence.toFixed(2),
      glyphs: r.glyphs.map((g) => `${g.ch}${g.script ? ':' + g.script : ''}`).join(' '),
    });
  }
  return res;
});

let pass = 0;
for (const r of out) {
  if (r.err) {
    console.log('ERROR', r.name, r.err);
    continue;
  }
  const okT = r.text === r.want.text;
  const okL = r.latex === r.want.latex;
  if (okT && okL) pass++;
  console.log(
    `${okT && okL ? 'PASS' : 'FAIL'}  ${r.name.padEnd(15)} text ${JSON.stringify(r.text).padEnd(10)} latex ${JSON.stringify(r.latex).padEnd(16)} conf ${r.conf}  [${r.glyphs}]`
  );
  if (!okT) console.log(`        want text  ${JSON.stringify(r.want.text)}`);
  if (!okL) console.log(`        want latex ${JSON.stringify(r.want.latex)}`);
}
console.log(`\n${pass}/${out.length}`);
await browser.close();
