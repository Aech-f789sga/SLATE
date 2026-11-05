import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
await page.click('#pgm');
await page.waitForTimeout(500);
const before = await page.evaluate(() => localStorage.getItem('inkpad-paper-prefs'));
console.log('prefs before', before);
// what do the chips look like?
console.log(await page.evaluate(() => {
  const d = document.querySelector('.pgm-detail');
  if (!d) return 'no detail host';
  return [...d.querySelectorAll('button')].map((b) => `${b.textContent}:${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}@${Math.round(b.getBoundingClientRect().top)}`).join(' ');
}));
// click the "7" ruling chip
const hit = await page.evaluate(() => {
  const d = document.querySelector('.pgm-detail');
  const b = [...d.querySelectorAll('button')].find((x) => x.textContent === '7');
  if (!b) return 'no chip';
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { top: Math.round(r.top), left: Math.round(r.left), covered: el === b ? 'self' : (el && (el.id || el.className || el.tagName)) };
});
console.log('chip 7 hit', JSON.stringify(hit));
await page.evaluate(() => {
  const d = document.querySelector('.pgm-detail');
  [...d.querySelectorAll('button')].find((x) => x.textContent === '7').click();
});
await page.waitForTimeout(600);
console.log('prefs after', await page.evaluate(() => localStorage.getItem('inkpad-paper-prefs')));
await browser.close();
