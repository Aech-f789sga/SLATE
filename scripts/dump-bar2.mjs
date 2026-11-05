import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'Shot', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const b2 = document.getElementById('bar2');
  const desc = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.dataset && n.dataset.t ? '[t=' + n.dataset.t + ']' : '') + (n.className ? '.' + String(n.className).replace(/\s+/g, '.') : '');
  const out = [];
  for (const c of b2.children) out.push(desc(c) + ' :: ' + (c.textContent || '').trim().slice(0, 26));
  return { bar2: out, bar: [...document.getElementById('bar').children].map(desc) };
}));
await browser.close();
