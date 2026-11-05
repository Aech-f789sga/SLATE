/**
 * Look at the Page card as it is now: full screen, then a crop of the card, and
 * a dump of the row's children in document order.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = process.env.PORT || '5199';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  const nb = {
    id: 'shot1',
    t: 'Algebra II',
    cov: '#2f6df6',
    upd: Date.now(),
    pages: [
      { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 },
      { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 },
    ],
  };
  localStorage.setItem('inkpad', JSON.stringify([nb]));
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(900);
await page.evaluate(() => {
  const lib = JSON.parse(localStorage.getItem('inkpad') || '[]');
  window.openNotebook(lib[0]);
});
await page.waitForTimeout(1600);
await page.evaluate(() => document.getElementById('tour-root')?.remove());
await page.screenshot({ path: `${OUT}/card-closed.png` });

await page.evaluate(() => window.__inkpad_pagemenu?.open());
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/card-open.png` });

const r = await page.evaluate(() => {
  const b = document.getElementById('bar2');
  const q = b.getBoundingClientRect();
  return { x: q.x, y: q.y, width: q.width, height: q.height };
});
await page.screenshot({
  path: `${OUT}/card-crop.png`,
  clip: { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 },
});

console.log('card', JSON.stringify(r));
console.log(
  JSON.stringify(
    await page.evaluate(() =>
      Array.from(document.getElementById('bar2').children).map((n) => ({
        tag: n.tagName.toLowerCase(),
        id: n.id || '',
        cls: typeof n.className === 'string' ? n.className : '',
        txt: (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
        vis: getComputedStyle(n).display,
      }))
    ),
    null,
    1
  )
);

await browser.close();
