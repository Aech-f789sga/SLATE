/**
 * After the anchor fix: does the drawer sit under the clone, does a chip apply,
 * and can it be dismissed without leaving an ink dot?
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '5199';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem(
    'inkpad',
    JSON.stringify([
      {
        id: 'nb-a',
        name: 'Algebra II',
        cover: '#2f6df6',
        upd: Date.now(),
        pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
      },
    ])
  );
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 30000 });
await page.waitForTimeout(1400);
await page.evaluate(() => document.getElementById('tour-root')?.remove());
await page.evaluate(() => window.openNotebook(JSON.parse(localStorage.getItem('inkpad'))[0]));
await page.waitForTimeout(2200);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

const box = async (sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const q = n.getBoundingClientRect();
    if (!q.width) return null;
    return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) };
  }, sel);

console.log('cv           ', await box('#cv'));
console.log('bar2         ', await box('#bar2'));

await page.click('#edm');
await page.waitForTimeout(800);

const g = await page.evaluate(() => {
  const b = document.querySelector('#edm-card .edm-tools button');
  const q = b.getBoundingClientRect();
  return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
});
console.log('guides clone ', g);

await page.mouse.click(g.x, g.y);
await page.waitForTimeout(800);
console.log('drawer       ', await box('#gn-drw'));
console.log('under clone? ', await page.evaluate((p) => {
  const d = document.getElementById('gn-drw').getBoundingClientRect();
  return { dx: Math.round(p.x - d.x), dy: Math.round(p.y - d.y), cardEndsY: 322 };
}, g));

const chip = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('#gn-drw button')).find((n) => n.textContent.trim() === 'Square grid');
  const q = b.getBoundingClientRect();
  return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
});
await page.mouse.click(chip.x, chip.y);
await page.waitForTimeout(800);
console.log('guide mode   ', await page.evaluate(() => GD.g));
console.log('card open    ', await page.evaluate(() => document.getElementById('edm-card').classList.contains('open')));
console.log('drawer       ', await page.evaluate(() => getComputedStyle(document.getElementById('gn-drw')).display));

const strokesBefore = await page.evaluate(() => pg().strokes.length);
// dismiss on the grey surround, left of the page
const cv = await box('#cv');
const target = { x: Math.max(6, cv.x - 26), y: cv.y + Math.round(cv.h / 2) };
console.log('dismiss at   ', target, 'outside cv?', target.x < cv.x);
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(700);
const strokesAfter = await page.evaluate(() => pg().strokes.length);
console.log('drawer after ', await page.evaluate(() => getComputedStyle(document.getElementById('gn-drw')).display));
console.log('strokes      ', { before: strokesBefore, after: strokesAfter, inked: strokesAfter > strokesBefore });
console.log('guides stay  ', await page.evaluate(() => GD.g));

await page.screenshot({ path: 'shots/demo-guides.png' });
await ctx.close();
await browser.close();
