/**
 * Lasso → LaTeX card, with the rendered preview.
 *
 * The card used to show LaTeX source and nothing else, which is the one form
 * in which you cannot tell a good read from a bad one. KaTeX now renders it
 * live. This checks that the chunk loads, that the formula actually paints,
 * and that the plain-source fallback still works when it cannot.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 140));
});
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => /skip tour/i.test(b.textContent || ''))
    ?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
  const n = {
    id: Date.now(),
    name: 'LaTeX',
    upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(900);

/* ---------------- ink: "x=2" ---------------- */
const built = await page.evaluate(async () => {
  const smart = await import('/src/smart.ts');
  smart.setSmart('toLatex', true);
  smart.setSmart('toText', false);

  const seg = (a, b, n = 14) =>
    Array.from({ length: n + 1 }, (_, i) => [
      a[0] + ((b[0] - a[0]) * i) / n,
      a[1] + ((b[1] - a[1]) * i) / n,
    ]);
  const arc = (cx, cy, rx, ry, a0, a1, n = 18) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = a0 + ((a1 - a0) * i) / n;
      return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
    });

  const H = 64;
  const y0 = 360;
  const strokes = [
    // x
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([120, y0], [176, y0 + H]) },
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([176, y0], [120, y0 + H]) },
    // =
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([206, y0 + H * 0.34], [258, y0 + H * 0.34]) },
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([206, y0 + H * 0.66], [258, y0 + H * 0.66]) },
    // 2
    { t: 'pen', c: '#1b1b1f', s: 3, p: arc(300, y0 + H * 0.26, 26, H * 0.26, Math.PI, Math.PI * 2.1, 20) },
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([326, y0 + H * 0.4], [286, y0 + H]) },
    { t: 'pen', c: '#1b1b1f', s: 3, p: seg([286, y0 + H], [334, y0 + H]) },
  ];

  // the engine keeps `pg`, `draw` and `sel` inside its own script scope, so
  // they are only reachable through eval
  const json = JSON.stringify(strokes);
  const n = window.eval(
    `(function(){ var s = ${json}; pg().strokes.push.apply(pg().strokes, s); draw(); sel = s; return pg().strokes.length; })()`,
  );
  return { n, latexOn: smart.smartOn('toLatex') };
});
console.log('ink:', JSON.stringify(built));

await page.waitForTimeout(700);
const pill = await page.evaluate(() => {
  const p = document.getElementById('lasso-pill');
  const b = p?.querySelector('.lp-latex');
  return { on: !!p?.classList.contains('on'), latexVisible: !!b && b.style.display !== 'none' };
});
console.log('pill:', JSON.stringify(pill));

/* ---------------- the card ---------------- */
await page.evaluate(() => {
  (document.querySelector('#lasso-pill .lp-latex'))?.click();
});
await page.waitForTimeout(1200);

const card = await page.evaluate(() => {
  const c = document.getElementById('lasso-card');
  const prev = c?.querySelector('.lc-prev');
  const area = c?.querySelector('.lc-area');
  const katex = prev?.querySelector('.katex');
  return {
    open: !!c?.classList.contains('on'),
    mode: c?.dataset.mode,
    source: area?.value ?? null,
    prevVisible: prev ? getComputedStyle(prev).display !== 'none' : false,
    katex: !!katex,
    katexError: !!prev?.querySelector('.katex-error'),
    katexText: (katex?.textContent || '').slice(0, 40),
    rawFallback: !!prev?.querySelector('.lc-raw'),
    height: prev ? Math.round(prev.getBoundingClientRect().height) : 0,
  };
});
console.log('card:', JSON.stringify(card));

await page.screenshot({ path: 'shots/latex-card.png' });

/* ---------------- editing re-renders ---------------- */
await page.evaluate(() => {
  const area = document.querySelector('#lasso-card .lc-area');
  area.value = '\\frac{a}{b}+\\sqrt{c}';
  area.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(600);
const edited = await page.evaluate(() => {
  const prev = document.querySelector('#lasso-card .lc-prev');
  return {
    katex: !!prev.querySelector('.katex'),
    hasFrac: !!prev.querySelector('.mfrac'),
    hasSqrt: !!prev.querySelector('.sqrt'),
    text: (prev.textContent || '').slice(0, 30),
  };
});
console.log('edited:', JSON.stringify(edited));
await page.screenshot({ path: 'shots/latex-card-frac.png', clip: { x: 0, y: 0, width: 900, height: 560 } });
// the card sits near the bottom of the page, so grab the element itself
await page.locator('#lasso-card').screenshot({ path: 'shots/latex-card-only.png' });

/* ---------------- text mode hides it ---------------- */
await page.evaluate(() => {
  (document.querySelector('#lasso-card .lc-tab[data-m="text"]'))?.click();
});
await page.waitForTimeout(300);
const textMode = await page.evaluate(() => {
  const prev = document.querySelector('#lasso-card .lc-prev');
  return { display: getComputedStyle(prev).display, empty: prev.innerHTML === '' };
});
console.log('text mode:', JSON.stringify(textMode));

await browser.close();
