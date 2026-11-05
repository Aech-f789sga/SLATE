import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'Shot', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(1400);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(500);

const state = () => page.evaluate(() => ({
  open: window.__inkpad_pagemenu.isOpen(),
  visible: [...document.getElementById('bar2').children].filter(n => getComputedStyle(n).display !== 'none').length,
}));
console.log('closed', await state());
await page.click('#pgm');
await page.waitForTimeout(350);
console.log('open  ', await state());
console.log('open rects', await page.evaluate(() => {
  const r = document.getElementById('pgm').getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], hit: hit && (hit.id || hit.className || hit.tagName), tbZ: getComputedStyle(document.getElementById('tb')).zIndex, pgmAttr: document.documentElement.dataset.pgm };
}));
await page.screenshot({ path: 'shots/page-menu-open.png', clip: { x: 300, y: 60, width: 840, height: 460 } });
// same button closes it
await page.click('#pgm');
await page.waitForTimeout(300);
console.log('again ', await state());
// outside press closes it
await page.click('#pgm');
await page.waitForTimeout(300);
await page.mouse.click(700, 500);
await page.waitForTimeout(300);
console.log('outside', await state());
// escape closes it
await page.click('#pgm');
await page.waitForTimeout(250);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
console.log('escape', await state());
await browser.close();
