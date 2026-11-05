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
await page.waitForTimeout(500);
// stop the clock on a fixed time so nothing is mid-flip
await page.evaluate(() => {
  const el = document.getElementById('gn-timekeeper');
  el.querySelector('[title="Start / pause"]').click();
});
await page.waitForTimeout(150);
await page.evaluate(() => document.getElementById('gn-timekeeper').querySelector('[title="Start / pause"]').click());
await page.waitForTimeout(1200);
const r = await page.evaluate(() => { const b = document.getElementById('gn-timekeeper').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
await page.screenshot({ path: 'shots/clock-zoom.png', clip: { x: r.x, y: r.y, width: 130, height: r.h } });
console.log(await page.evaluate(() => [...document.querySelectorAll('#gn-timekeeper .tk-d')].map(d => {
  const g = (s) => { const n = d.querySelector(s); const r = n.getBoundingClientRect(); return `${n.textContent}@${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
  return { top: g('.tk-h-t i'), bot: g('.tk-h-b i') };
})));
await browser.close();
