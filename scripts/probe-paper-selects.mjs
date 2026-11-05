import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const mk = (tpl) => ({ tpl, col: '', strokes: [], pw: 800, ph: 1100 });
  window.lib.push({ id: Date.now(), name: 'Paper', upd: Date.now(), pages: [mk('lined')] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(700);

const hit = await page.evaluate(() => {
  const s = document.getElementById('tpl');
  const r = s.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const el = document.elementFromPoint(x, y);
  return {
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    hit: el ? el.tagName + '#' + el.id + '.' + el.className : null,
    hasOnchange: !!s.onchange,
    z: getComputedStyle(s).zIndex,
    pe: getComputedStyle(s).pointerEvents,
    opacity: getComputedStyle(s).opacity,
    display: getComputedStyle(s).display,
  };
});
console.log('select', JSON.stringify(hit));

// count dark pixels on the canvas, to see whether the paper actually changes
const ink = () =>
  page.evaluate(() => {
    const c = document.getElementById('cv');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 232 && d[i + 3] > 8) n++;
    return n;
  });

console.log('lined   px', await ink());
await page.selectOption('#tpl', 'grid');
await page.waitForTimeout(700);
console.log('after grid', JSON.stringify(await page.evaluate(() => ({
  tpl: window.eval('pg().tpl'),
  sel: document.getElementById('tpl').value,
}))), await ink());

// and directly through the engine, bypassing the select
await page.evaluate(() => { window.eval("pg().tpl='dot'; draw(); save()"); });
await page.waitForTimeout(600);
console.log('forced dot', await ink());

await page.selectOption('#tpl', 'grid');
await page.waitForTimeout(600);
console.log('grid again', JSON.stringify(await page.evaluate(() => ({ tpl: window.eval('pg().tpl'), sel: document.getElementById('tpl').value }))), await ink());

// the colour select too
await page.selectOption('#pc', '#fbf3dc');
await page.waitForTimeout(600);
console.log('cream   ', JSON.stringify(await page.evaluate(() => ({ col: window.eval('pg().col'), sel: document.getElementById('pc').value }))));

await browser.close();
