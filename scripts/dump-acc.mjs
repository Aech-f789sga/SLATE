import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'T',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.click('#acc-trigger');
await page.waitForTimeout(400);
console.log(await page.evaluate(() => [...document.querySelectorAll('#acc-pop .acc-item')].map(n => `${n.tagName.toLowerCase()}.${n.className} :: ${(n.textContent||'').trim().slice(0,30)}`)));
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#acc-pop .acc-item')];
  const t = rows.find((r) => /time/i.test(r.textContent || ''));
  t?.click();
});
await page.waitForTimeout(500);
console.log('handler', await page.evaluate(() => {
  const b = document.querySelector('[data-acc="timer"]');
  return { has: !!b, onclick: typeof b?.onclick, ds: b?.dataset.acc, state: (window).__acc_state ?? null };
}));
console.log('ls', await page.evaluate(() => Object.entries(localStorage).filter(([k]) => /acc|state/i.test(k)).map(([k, v]) => k + '=' + v).join(' | ')));
console.log('timer on?', await page.evaluate(() => {
  const el = document.getElementById('gn-timekeeper');
  return { cls: el.className, display: getComputedStyle(el).display, rows: document.querySelectorAll('#acc-pop .acc-item').length };
}));
await browser.close();
