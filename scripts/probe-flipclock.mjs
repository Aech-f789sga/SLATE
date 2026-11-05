import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'T',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(600);
// open the timer from the accessories menu
await page.click('#acc-trigger');
await page.waitForTimeout(300);
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#acc-pop .acc-item')];
  const t = rows.find((r) => /time/i.test(r.textContent || ''));
  t?.click();
});
await page.waitForTimeout(700);
const info = () => page.evaluate(() => {
  const el = document.getElementById('gn-timekeeper');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const digits = [...el.querySelectorAll('.tk-d')].map((d) => d.querySelector('.tk-h-t i')?.textContent).join('');
  return { on: el.classList.contains('on'), run: el.classList.contains('run'), digits,
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    cells: el.querySelectorAll('.tk-d').length, btns: el.querySelectorAll('.tk-btn').length };
});
console.log('initial', await info());
// start it and watch a second tick over
await page.click('#gn-timekeeper .tk-btn[title="Start / pause"]');
await page.waitForTimeout(1400);
console.log('running', await info());
const r = await page.evaluate(() => { const b = document.getElementById('gn-timekeeper').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
await page.screenshot({ path: 'shots/flipclock.png', clip: { x: r.x - 8, y: r.y - 8, width: r.w + 16, height: r.h + 16 } });
await page.waitForTimeout(1600);
console.log('after   ', await info());
await page.screenshot({ path: 'shots/flipclock2.png', clip: { x: r.x - 8, y: r.y - 8, width: r.w + 16, height: r.h + 16 } });
// the x hides it
await page.click('#gn-timekeeper .tk-btn[title="Hide the timer"]');
await page.waitForTimeout(400);
console.log('closed ', await info());
await browser.close();
