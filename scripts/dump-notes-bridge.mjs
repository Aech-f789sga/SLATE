import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1600);
console.log('bridge keys', await page.evaluate(() => Object.keys((window).__inkpad_notes || {}).join(',')));
console.log('has toggle', await page.evaluate(() => typeof (window).__inkpad_notes?.toggle));
const res = await page.evaluate(() => {
  try { (window).__inkpad_notes.toggle(document.getElementById('acc-trigger')); return 'called'; }
  catch (e) { return 'threw ' + e.message; }
});
await page.waitForTimeout(500);
console.log(res, 'note exists', await page.evaluate(() => !!document.getElementById('gn-note')), 'on', await page.evaluate(() => document.getElementById('gn-note')?.classList.contains('on')));
await browser.close();
