/**
 * Does the renderer actually honour `ho` on a shape?
 *
 * Draws two identical squares — one opaque, one at 40 % — and reads the pixel in
 * the middle of each edge. If the translucent one is not lighter, the wrapper
 * that is supposed to apply `ho` is not being reached.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'S', upd: Date.now(), pages: [{ tpl: 'blank', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});
await page.waitForTimeout(400);

const out = await page.evaluate(() => {
  eval(`
    pg().strokes.length = 0;
    // opaque
    pg().strokes.push({ t:'shape', k:'rect', c:'#e5383b', w:20, a:[80,120], b:[280,320] });
    // 40 % — the highlighter's density
    pg().strokes.push({ t:'shape', k:'rect', c:'#e5383b', w:20, ho:0.4, a:[340,120], b:[540,320] });
    // a highlighter-painted shape
    pg().strokes.push({ t:'shape', k:'rect', c:'#e5383b', w:60, ho:0.34, hl:1, a:[80,400], b:[540,600] });
    draw();
  `);
  const cv = document.getElementById('cv');
  const r = cv.getBoundingClientRect();
  const pgv = eval('pg()');
  const k = cv.width / (pgv.pw || 800);
  const g = cv.getContext('2d');
  const at = (x, y) => {
    const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  return {
    opaque: at(180, 120),
    forty: at(440, 120),
    hlEdge: at(300, 400),
    paper: at(700, 900),
    k,
  };
});
console.log(JSON.stringify(out));
await page.locator('#cv').screenshot({ path: 'shots/ho-check.png' });
await browser.close();
