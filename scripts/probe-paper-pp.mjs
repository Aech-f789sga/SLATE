import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
// a page that carries a custom paper, the way the drawer's ready-made papers do
await page.evaluate(() => {
  const mk = () => ({ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 });
  const p = mk();
  p.pp = { k: 'lined', bg: '#ffffff', ln: 'rgba(120,140,170,.4)', gap: 32, lw: 1 };
  window.lib.push({ id: Date.now(), name: 'Custom', upd: Date.now(), pages: [p] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(600);

const ink = () =>
  page.evaluate(() => {
    const c = document.getElementById('cv');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 232 && d[i + 3] > 8) n++;
    return n;
  });

console.log('pp set   ', JSON.stringify(await page.evaluate(() => ({ tpl: window.eval('pg().tpl'), pp: !!window.eval('pg().pp') }))), await ink());
await page.selectOption('#tpl', 'grid');
await page.waitForTimeout(700);
console.log('after grid', JSON.stringify(await page.evaluate(() => ({ tpl: window.eval('pg().tpl'), pp: !!window.eval('pg().pp'), sel: document.getElementById('tpl').value }))), await ink());
await page.screenshot({ path: 'shots/paper-pp.png' });
await browser.close();
