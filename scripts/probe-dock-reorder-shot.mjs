import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 3 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'R', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
  window.__inkpad_focus.set(true, true);
});
await page.waitForTimeout(800);
const a = await page.locator('#pen-dock .pd-slot[data-i="0"]').boundingBox();
const c = await page.locator('#pen-dock .pd-slot[data-i="3"]').boundingBox();
await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
await page.mouse.down();
await page.waitForTimeout(1150);
await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 12 });
await page.waitForTimeout(250);
const info = await page.evaluate(() => {
  const l = document.querySelector('#pen-dock .pd-line');
  const r = l?.getBoundingClientRect();
  return l ? { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), bg: getComputedStyle(l).backgroundColor } : null;
});
console.log('line', JSON.stringify(info));
await page.screenshot({ path: 'shots/dock-reorder-zoom.png', clip: { x: 480, y: 0, width: 320, height: 110 } });
await page.mouse.up();
await browser.close();
