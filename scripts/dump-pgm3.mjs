import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'S',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1600);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(400);
const info = () => page.evaluate(() => {
  const b = document.getElementById('bar2'); const t = document.getElementById('tb');
  const rb = b.getBoundingClientRect(); const rt = t.getBoundingClientRect();
  return { open: b.classList.contains('open'), bar2: [Math.round(rb.x), Math.round(rb.y), Math.round(rb.width), Math.round(rb.height)],
    tb: [Math.round(rt.x), Math.round(rt.y), Math.round(rt.width), Math.round(rt.height)],
    inline: b.getAttribute('style'),
    kids: [...b.children].map(n => `${n.tagName.toLowerCase()}${n.id?'#'+n.id:''}${n.className?'.'+String(n.className).split(' ')[0]:''}${getComputedStyle(n).display==='none'?'(hidden)':''}`) };
});
console.log('closed', JSON.stringify(await info(), null, 1));
await page.click('#pgm');
await page.waitForTimeout(400);
console.log('open  ', JSON.stringify(await info(), null, 1));
await browser.close();
