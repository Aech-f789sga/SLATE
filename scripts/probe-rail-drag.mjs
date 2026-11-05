import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1600);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('ink-lock').click());
await page.waitForTimeout(600);

const state = () => page.evaluate(() => {
  const d = document.getElementById('pen-dock');
  const r = d.getBoundingClientRect();
  return { side: d.dataset.side, box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`, dragging: d.classList.contains('pd-dragging') };
});

console.log('start      ', JSON.stringify(await state()));
const grip = await page.evaluate(() => { const g = document.querySelector('#pen-dock .pd-grip'); const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
await page.waitForTimeout(100);
// drag towards the bottom edge, but stop halfway first
await page.mouse.move(720, 450, { steps: 6 });
await page.waitForTimeout(150);
console.log('mid (middle)', JSON.stringify(await state()));
await page.mouse.move(720, 880, { steps: 6 });
await page.waitForTimeout(150);
console.log('near bottom ', JSON.stringify(await state()));
await page.screenshot({ path: 'shots/rail-drag-live.png' });
await page.mouse.move(1400, 450, { steps: 6 });
await page.waitForTimeout(150);
console.log('near right  ', JSON.stringify(await state()));
await page.mouse.up();
await page.waitForTimeout(300);
console.log('after drop  ', JSON.stringify(await state()));
await browser.close();
