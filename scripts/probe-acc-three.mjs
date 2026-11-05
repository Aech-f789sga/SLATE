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

console.log('toolbar buttons visible:', await page.evaluate(() => ['gn-stk-btn','gn-note-btn','snap-btn'].map((id) => { const n = document.getElementById(id); return `${id}=${n ? getComputedStyle(n).display : 'missing'}`; }).join(' ')));
await page.evaluate(() => document.getElementById('acc-trigger').click());
await page.waitForTimeout(400);
console.log('menu rows:', await page.evaluate(() => [...document.querySelectorAll('#acc-pop .acc-item')].map((n) => n.dataset.acc).join(',')));
await page.screenshot({ path: 'shots/acc-menu.png', clip: { x: 1000, y: 40, width: 440, height: 520 } });

// object snap row toggles
const snapRow = await page.evaluate(() => { const r = [...document.querySelectorAll('#acc-pop .acc-item')].find((n) => n.dataset.acc === 'osnap'); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await page.mouse.click(snapRow.x, snapRow.y);
await page.waitForTimeout(300);
console.log('snap after row click:', await page.evaluate(() => (window).__inkpad_snap.on), 'row on:', await page.evaluate(() => [...document.querySelectorAll('#acc-pop .acc-item')].find((n) => n.dataset.acc === 'osnap').classList.contains('on')));
await page.mouse.click(snapRow.x, snapRow.y);
await page.waitForTimeout(300);
console.log('snap after 2nd click:', await page.evaluate(() => (window).__inkpad_snap.on));

// sticky note row opens the popover near the row
await page.evaluate(() => document.getElementById('acc-trigger').click());
await page.waitForTimeout(300);
const noteRow = await page.evaluate(() => { const r = [...document.querySelectorAll('#acc-pop .acc-item')].find((n) => n.dataset.acc === 'notes'); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await page.mouse.click(noteRow.x, noteRow.y);
await page.waitForTimeout(400);
console.log('note popover:', await page.evaluate(() => { const n = document.getElementById('gn-note'); if (!n) return 'missing'; const r = n.getBoundingClientRect(); return `on=${n.classList.contains('on')} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; }));
await page.screenshot({ path: 'shots/acc-note.png', clip: { x: 700, y: 40, width: 740, height: 520 } });
await browser.close();
