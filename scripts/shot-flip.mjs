import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'T',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.click('#acc-trigger');
await page.waitForTimeout(300);
await page.evaluate(() => { const rows=[...document.querySelectorAll('#acc-pop .acc-item')]; rows.find(r=>/time/i.test(r.textContent||''))?.click(); });
await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('gn-timekeeper').querySelector('[title="Start / pause"]').click());
// wait until the seconds digit is about to turn, then grab two frames of the flip
await page.waitForTimeout(700);
const r = await page.evaluate(() => { const b = document.getElementById('gn-timekeeper').getBoundingClientRect(); return { x: b.x, y: b.y, w: 120, h: b.height }; });
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: `shots/flip-${i}.png`, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
  await page.waitForTimeout(70);
}
await browser.close();
