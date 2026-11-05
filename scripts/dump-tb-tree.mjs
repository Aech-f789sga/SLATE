import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1600);
console.log(await page.evaluate(() => {
  const tb = document.getElementById('tb');
  const out = [];
  for (const row of tb.children) {
    out.push(`${row.tagName.toLowerCase()}#${row.id || '-'} kids=${row.children.length}`);
    for (const c of row.children) {
      out.push(`    ${c.tagName.toLowerCase()}${c.id ? '#' + c.id : ''}.${(c.className || '').toString().slice(0, 18)} "${(c.textContent || '').trim().slice(0, 16)}"`);
    }
  }
  return out.join('\n');
}));
await browser.close();
