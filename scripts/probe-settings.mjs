import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'S',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
const opened = await page.evaluate(() => {
  const b = document.querySelector('#tb button[title="Settings"]');
  if (!b) return false;
  b.click();
  return true;
});
await page.waitForTimeout(700);
console.log('drawer opened', opened);
console.log(await page.evaluate(() => {
  const d = document.getElementById('gn-drw');
  return (d.textContent || '').replace(/\s+/g, ' ').slice(0, 700);
}));
const r = await page.evaluate(() => { const b = document.getElementById('gn-drw').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
await page.screenshot({ path: 'shots/settings-drawer.png', clip: { x: r.x, y: r.y, width: r.w, height: Math.min(r.h, 820) } });
await browser.close();
