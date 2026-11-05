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
  p.pp = { bg: '#fff6a8', k: 'lined', ln: 'rgba(60,110,200,.45)', mg: 'rgba(220,60,60,.6)', mx: 100, gap: 32 };
  window.lib.push({ id: Date.now(), name: 'Legal', upd: Date.now(), pages: [p] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const c = document.getElementById('cv');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0, red = 0;
  for (let i = 0; i < d.length; i += 4 * 7) {
    if (d[i] < 232 && d[i + 3] > 8) n++;
    if (d[i] - d[i + 1] > 22 && d[i] - d[i + 2] > 22) red++;
  }
  let err = null;
  try { window.eval('draw()'); } catch (e) { err = String(e && e.message); }
  return { ink: n, red, err, pp: !!window.eval('pg().pp'), tpl: window.eval('pg().tpl') };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: 'shots/paper-pp-legal.png' });
await browser.close();
