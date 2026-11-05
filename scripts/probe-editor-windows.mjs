import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);
await page.click('#pgm');
await page.waitForTimeout(400);

const buttons = await page.evaluate(() => {
  const card = document.getElementById('bar2');
  const lab = [...card.querySelectorAll('.pgm-lab')].find((n) => n.textContent === 'Editor');
  const out = [];
  let n = lab ? lab.nextElementSibling : null;
  while (n && !n.classList.contains('pgm-br') && !n.classList.contains('pgm-lab')) {
    if (n.tagName === 'BUTTON') {
      const r = n.getBoundingClientRect();
      if (r.width) out.push({ title: n.title || n.textContent.trim().slice(0, 12), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
    n = n.nextElementSibling;
  }
  return out;
});
console.log('editor buttons:', buttons.map((b) => b.title).join(' | '));

const cardBox = await page.evaluate(() => { const r = document.getElementById('bar2').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
const report = () => page.evaluate((card) => {
  const out = [];
  for (const n of document.querySelectorAll('body > *')) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    const r = n.getBoundingClientRect();
    if (r.width < 60 || r.height < 30) continue;
    const z = Number(cs.zIndex) || 0;
    const over = !(r.right < card.l || r.left > card.r || r.bottom < card.t || r.top > card.b);
    if (!over) continue;
    out.push(`${n.id ? '#' + n.id : n.tagName.toLowerCase()} z=${z} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
}, cardBox);

for (const b of buttons) {
  if (/full screen/i.test(b.title)) continue;
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(450);
  const v = await report();
  const z = await page.evaluate(() => getComputedStyle(document.getElementById('bar2')).zIndex);
  console.log(`--- "${b.title}" (card z=${z})`);
  console.log(v.length ? v.join('\n') : '   nothing overlapping');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  if (!(await page.evaluate(() => document.getElementById('bar2').classList.contains('open')))) {
    await page.evaluate(() => document.getElementById('pgm').click());
    await page.waitForTimeout(300);
  }
}
await browser.close();
