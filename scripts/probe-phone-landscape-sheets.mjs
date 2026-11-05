import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
const rect = (sel) => page.evaluate((s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); const on = getComputedStyle(n).display !== 'none'; return on ? { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } : 'hidden'; }, sel);

await page.evaluate(() => document.querySelector('#ink-pen button[title="Pen settings"]').click());
await page.waitForTimeout(400);
console.log('pen sheet', JSON.stringify(await rect('.ink-sheet.on')));
await page.screenshot({ path: 'shots/phone-land-sheet.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// dock slot sheet: double tap the first pen
const slot = await page.evaluate(() => { const s = document.querySelector('#pen-dock .pd-slot'); const b = s.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await page.touchscreen.tap(slot.x, slot.y);
await page.waitForTimeout(120);
await page.touchscreen.tap(slot.x, slot.y);
await page.waitForTimeout(600);
console.log('pen slot sheet', JSON.stringify(await rect('#pen-sheet.on')));
await page.screenshot({ path: 'shots/phone-land-slot.png' });
await browser.close();
