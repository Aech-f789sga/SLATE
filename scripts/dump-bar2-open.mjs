import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'S',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1400);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.evaluate(() => window.__inkpad_pagemenu.open());
await page.waitForTimeout(400);
console.log(await page.evaluate(() => [...document.getElementById('bar2').children].map((n,i) => {
  const cs = getComputedStyle(n);
  return `${i} ${n.tagName.toLowerCase()}${n.id?'#'+n.id:''}${n.className?'.'+n.className:''} disp=${cs.display} order=${cs.order} hidden=${n.hasAttribute('hidden')}`;
})));
await browser.close();
