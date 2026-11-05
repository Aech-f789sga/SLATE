import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const mk = () => ({ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 });
  const a = mk();
  a.pp = { k: 'lined', bg: '#ffffff', ln: 'rgba(120,140,170,.4)', gap: 32, lw: 1 };
  window.lib.push({ id: Date.now(), name: 'Two', upd: Date.now(), pages: [a, mk()] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1600);
const out = await page.evaluate(() => {
  const c = document.getElementById('cv');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 232 && d[i + 3] > 8) n++;
  return { ink: n, w: c.width, h: c.height, pp: JSON.stringify(window.eval('pg().pp')) };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: 'shots/paper-pp-ln.png' });
await browser.close();
