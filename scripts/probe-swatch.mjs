import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
console.log(await page.evaluate(() => [...document.querySelectorAll('#ink-pen .sw')].map((b) => {
  const cs = getComputedStyle(b);
  return `${b.title} on=${b.classList.contains('on')} bg=${cs.backgroundColor}`;
})));
// pick red, then check the ring moved and the fill is red
await page.evaluate(() => [...document.querySelectorAll('#ink-pen .sw')].find((b) => b.title === '#f24d5c').click());
await page.waitForTimeout(250);
console.log(await page.evaluate(() => [...document.querySelectorAll('#ink-pen .sw')].map((b) => `${b.title} on=${b.classList.contains('on')} bg=${getComputedStyle(b).backgroundColor}`)));
console.log('colour', await page.evaluate(() => window.eval('color')));
await browser.close();
