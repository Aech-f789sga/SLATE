import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'M',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
console.log('toolbar img hidden', await page.evaluate(() => {
  const img = document.getElementById('img');
  const vid = document.querySelector('#tb button[title="Insert video"]');
  return { img: img ? getComputedStyle(img).display : 'missing', video: vid ? getComputedStyle(vid).display : 'missing' };
}));
await page.click('#acc-trigger');
await page.waitForTimeout(300);
console.log('menu rows', await page.evaluate(() => [...document.querySelectorAll('#acc-pop .acc-item')].map((n) => n.textContent.trim())));
await page.evaluate(() => { const rows=[...document.querySelectorAll('#acc-pop .acc-item')]; rows.find(r=>/insert media/i.test(r.textContent||''))?.click(); });
await page.waitForTimeout(400);
console.log('sheet', await page.evaluate(() => {
  const s = document.getElementById('acc-media');
  return { on: s.classList.contains('on'), rows: [...s.querySelectorAll('.acc-row')].map((r) => r.textContent.trim().slice(0, 40)) };
}));
const r = await page.evaluate(() => { const b = document.getElementById('acc-media').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
console.log('rect', JSON.stringify(r));
await page.screenshot({ path: 'shots/acc-media.png', clip: { x: Math.max(0, r.x - 40), y: Math.max(0, r.y - 60), width: 360, height: 260 } });
// clicking a row must reach the hidden engine button without throwing
const clicked = await page.evaluate(() => {
  const img = document.getElementById('img');
  let got = 0;
  img.addEventListener('click', () => got++);
  document.querySelector('#acc-media .acc-row').click();
  return new Promise((res) => setTimeout(() => res(got), 200));
});
console.log('image row fired', clicked);
await browser.close();
