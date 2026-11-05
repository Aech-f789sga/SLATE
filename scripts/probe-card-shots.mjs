/**
 * Screenshot the open page card itself (not the top of the window) for a few
 * themes, so the icons can be judged directly.
 */
import { chromium } from 'playwright';

const THEMES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['black-hole', 'cozy', 'lofi-chill', 'cyberdeck', 'medieval'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  const n = {
    id: Date.now(), name: 'T', upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(2200);

for (const id of THEMES) {
  await page.evaluate(() => document.getElementById('back')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('gx-theme-btn')?.click());
  await page.waitForTimeout(400);
  await page.evaluate((t) => {
    document.querySelector(`#gx-theme-panel .gxp-card[data-id="${t}"]`)?.click();
  }, id);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('gx-theme-panel')?.classList.remove('on'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.openNotebook(window.lib[window.lib.length - 1]));
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    document.getElementById('tour-skip')?.click();
    document.getElementById('tour-x')?.click();
  });
  for (let a = 0; a < 2; a++) {
    const open = await page.evaluate(() => document.getElementById('bar2')?.classList.contains('open'));
    if (open) break;
    await page.evaluate(() => document.getElementById('pgm')?.click());
    await page.waitForTimeout(700);
  }
  const box = await page.evaluate(() => {
    const r = document.getElementById('bar2').getBoundingClientRect();
    return { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: Math.min(r.width + 12, 700), height: Math.min(r.height + 12, 500) };
  });
  await page.screenshot({ path: `shots/cardfull-${id}.png`, clip: box });
  console.log(id, JSON.stringify(box));
}
await browser.close();
