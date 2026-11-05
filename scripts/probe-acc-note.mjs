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

const openMenu = async () => {
  const open = await page.evaluate(() => document.getElementById('acc-pop')?.classList.contains('on'));
  if (!open) { await page.evaluate(() => document.getElementById('acc-trigger').click()); await page.waitForTimeout(350); }
};
const clickRow = async (id) => {
  await openMenu();
  const p = await page.evaluate((k) => { const r = [...document.querySelectorAll('#acc-pop .acc-item')].find((n) => n.dataset.acc === k); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
  if (!p) return 'no row ' + id;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(450);
  return 'clicked';
};

console.log(await clickRow('notes'));
console.log('note popover:', await page.evaluate(() => { const n = document.getElementById('gn-note'); if (!n) return 'missing'; const r = n.getBoundingClientRect(); return `on=${n.classList.contains('on')} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} vw=${innerWidth}`; }));
await page.screenshot({ path: 'shots/acc-note.png', clip: { x: 700, y: 40, width: 740, height: 520 } });

console.log(await clickRow('stickers'));
await page.waitForTimeout(400);
console.log('stickers panel:', await page.evaluate(() => { const n = document.getElementById('gn-stk'); return n ? `on=${getComputedStyle(n).display}` : 'missing'; }));
await browser.close();
