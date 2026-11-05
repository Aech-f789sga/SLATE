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

const state = () => page.evaluate(() => {
  const p = document.getElementById('ink-pen');
  const r = p.getBoundingClientRect();
  const rail = document.getElementById('pen-dock');
  return {
    focus: document.documentElement.dataset.focus,
    on: p.classList.contains('on'),
    peek: p.classList.contains('peek'),
    disp: getComputedStyle(p).display,
    box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    railSide: rail?.dataset.side,
    rail: (() => { const b = rail.getBoundingClientRect(); return `${Math.round(b.top)}..${Math.round(b.bottom)}`; })(),
    buttons: [...p.querySelectorAll('button')].map((b) => b.title.slice(0, 14)),
  };
});

// lock the page
await page.evaluate(() => document.getElementById('ink-lock').click());
await page.waitForTimeout(600);
console.log('locked, nothing picked', JSON.stringify(await state()));

// pick the first pen from the rail
const slot = await page.evaluate(() => { const s = document.querySelectorAll('#pen-dock .pd-slot')[0]; const b = s.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await page.mouse.click(slot.x, slot.y);
await page.waitForTimeout(400);
console.log('pen picked  ', JSON.stringify(await state()));
await page.screenshot({ path: 'shots/lock-pill.png', clip: { x: 0, y: 0, width: 1440, height: 300 } });

// it should go away on its own
await page.waitForTimeout(4200);
console.log('after 4.6s  ', JSON.stringify(await state()));

// eraser: pick the eraser slot
const er = await page.evaluate(() => {
  const slots = [...document.querySelectorAll('#pen-dock .pd-slot')];
  const i = slots.findIndex((s) => /Eraser/i.test(s.getAttribute('aria-label') || ''));
  const b = slots[i].getBoundingClientRect();
  return { i, x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
await page.mouse.click(er.x, er.y);
await page.waitForTimeout(400);
console.log('eraser picked', JSON.stringify(await state()));
await page.screenshot({ path: 'shots/lock-eraser-pill.png', clip: { x: 0, y: 0, width: 1440, height: 300 } });
await browser.close();
