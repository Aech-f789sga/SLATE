import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'T',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.click('#acc-trigger');
await page.waitForTimeout(300);
await page.evaluate(() => { const rows=[...document.querySelectorAll('#acc-pop .acc-item')]; rows.find(r=>/time/i.test(r.textContent||''))?.click(); });
await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('gn-timekeeper').querySelector('[title="Start / pause"]').click());
const frames = [];
for (let i = 0; i < 26; i++) {
  frames.push(await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#gn-timekeeper .tk-d')];
    const go = cells.map((c, i) => (c.classList.contains('go') ? i : -1)).filter((i) => i >= 0);
    const flip = go.length ? getComputedStyle(cells[go[0]].querySelector('.tk-f-t')).transform : '';
    return { t: Math.round(performance.now()), digits: cells.map((c) => c.querySelector('.tk-h-t i')?.textContent).join(''), go, flip: flip.slice(0, 40) };
  }));
  await page.waitForTimeout(45);
}
for (const f of frames) console.log(f.digits, f.go.length ? `flip cell ${f.go} ${f.flip}` : '');
await browser.close();
