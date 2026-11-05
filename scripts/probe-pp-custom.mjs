import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const p = { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 };
  p.pp = { k: 'lined', bg: '#ffffff', ln: '#8aa0c0', gap: 32, lw: 1 };
  window.lib.push({ id: Date.now(), name: 'Custom', upd: Date.now(), pages: [p] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const c = document.getElementById('cv');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 232 && d[i + 3] > 8) n++;
  let err = null;
  try { window.eval('draw()'); } catch (e) { err = String(e && e.message); }
  const d2 = g.getImageData(0, 0, c.width, c.height).data;
  let n2 = 0;
  for (let i = 0; i < d2.length; i += 4 * 7) if (d2[i] < 232 && d2[i + 3] > 8) n2++;
  return { before: n, after: n2, err, W: window.eval('W'), H: window.eval('H') };
});
console.log(JSON.stringify(out));
await browser.close();
