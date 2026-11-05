import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const [name, w, h, mob] of [['desk', 1440, 900, false], ['phone', 390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const n={id:Date.now(),name:'Field notes',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/final-${name}.png` });
  await ctx.close();
}
await browser.close();
