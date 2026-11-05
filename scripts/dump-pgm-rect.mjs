import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'S',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1600);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(600);
console.log(await page.evaluate(() => {
  const g = (id) => { const n = document.getElementById(id); if (!n) return 'none'; const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} z=${cs.zIndex} pos=${cs.position}`; };
  const b2 = document.getElementById('bar2');
  const r = b2.getBoundingClientRect();
  const el = document.elementFromPoint(720, 110);
  const chain = [];
  let n = el;
  while (n && chain.length < 6) { chain.push(n.tagName + (n.id ? '#' + n.id : '') + (n.className ? '.' + String(n.className).split(' ')[0] : '')); n = n.parentElement; }
  return { hit: chain, dataBar: document.documentElement.dataset.bar, pgm: g('pgm'), bar2: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, inkPen: g('ink-pen'), tb: g('tb'), kids: b2.children.length };
}));
await browser.close();
