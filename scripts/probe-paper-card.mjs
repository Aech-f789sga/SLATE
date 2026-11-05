import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const [w, h, mob] of [[1440, 900, false], [1112, 834, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
  const page = await ctx.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'dot',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
  await page.waitForTimeout(500);
  await page.click('#pgm');
  await page.waitForTimeout(500);
  console.log(w + 'x' + h, JSON.stringify(await page.evaluate(() => {
    const b = document.getElementById('bar2');
    const r = b.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), scrollH: b.scrollHeight, clientH: b.clientHeight, vh: innerHeight };
  })));
  await page.screenshot({ path: `shots/paper-card-${w}.png`, clip: { x: 300, y: 60, width: 760, height: Math.min(500, h - 80) } });
  await ctx.close();
}
await browser.close();
