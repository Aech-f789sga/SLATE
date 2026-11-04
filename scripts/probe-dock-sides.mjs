/** Every edge, and a reorder performed on a horizontal rail. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.removeItem('inkpad-pen-dock');
  localStorage.removeItem('inkpad-pen-dock-v2');
  localStorage.removeItem('inkpad-dock-focus-side');
  const n = { id: Date.now(), name: 'Sides', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(600);
await page.evaluate(() => window.__inkpad_focus.set(true, true));
await page.waitForTimeout(700);

for (const side of ['top', 'bottom', 'right']) {
  await page.evaluate((s) => window.__inkpad_pen_dock.setSide(s), side);
  await page.waitForTimeout(500);
  const box = await page.evaluate(() => {
    const d = document.getElementById('pen-dock').getBoundingClientRect();
    return { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) };
  });
  console.log(side.padEnd(7), JSON.stringify(box));
  await page.screenshot({ path: `shots/dock-${side}.png` });
}

// reorder on a horizontal rail: hold the first pen and drop it past the third
await page.evaluate(() => window.__inkpad_pen_dock.setSide('top'));
await page.waitForTimeout(500);
const before = await page.evaluate(() => window.__inkpad_pen_dock.slots().map((s) => s.color));
const a = await page.locator('#pen-dock .pd-slot[data-i="0"]').boundingBox();
const c = await page.locator('#pen-dock .pd-slot[data-i="2"]').boundingBox();
await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
await page.mouse.down();
await page.waitForTimeout(1150);
const lifted = await page.evaluate(() => document.querySelectorAll('#pen-dock .pd-lift').length);
await page.mouse.move(c.x + c.width / 2 + 8, c.y + c.height / 2, { steps: 12 });
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/dock-reorder-top.png' });
await page.mouse.up();
await page.waitForTimeout(600);
const after = await page.evaluate(() => window.__inkpad_pen_dock.slots().map((s) => s.color));
console.log('lifted', lifted);
console.log('before', before.join(' '));
console.log('after ', after.join(' '));

await browser.close();
