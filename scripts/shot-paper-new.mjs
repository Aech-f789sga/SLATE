import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const mk = (tpl) => ({ tpl, col: '', strokes: [], pw: 800, ph: 1100 });
  window.lib.push({ id: Date.now(), name: 'Papers', upd: Date.now(), pages: [mk('margin'), mk('grid')] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(400);
const clip = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 };
});
await page.screenshot({ path: 'shots/paper-margin-page.png', clip });

// a page carrying a ready-made paper, with the card open on the explanation row
await page.evaluate(() => {
  const p = window.eval('pg()');
  p.pp = { k: 'lined', bg: '#ffffff', ln: '#8aa0c0', gap: 32, lw: 1 };
  window.eval('draw(); save()');
  document.getElementById('pgm').click();
});
await page.waitForTimeout(800);
const box = await page.evaluate(() => {
  const r = document.getElementById('bar2').getBoundingClientRect();
  return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: Math.min(r.width + 12, 1400), height: Math.min(r.height + 12, 880) };
});
await page.screenshot({ path: 'shots/paper-pp-row2.png', clip: box });
console.log('ok');
await browser.close();
