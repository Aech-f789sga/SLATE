import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
await page.click('#pgm');
await page.waitForTimeout(400);
const b = await page.evaluate(() => {
  const card = document.getElementById('bar2');
  const lab = [...card.querySelectorAll('.pgm-lab')].find((n) => n.textContent === 'Editor');
  let n = lab.nextElementSibling;
  while (n && !n.classList.contains('pgm-br')) {
    if (n.tagName === 'BUTTON' && /Guides/.test(n.title)) { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    n = n.nextElementSibling;
  }
  return null;
});
await page.mouse.click(b.x, b.y);
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/drawer-over-card.png', clip: { x: 380, y: 80, width: 760, height: 560 } });
await browser.close();
