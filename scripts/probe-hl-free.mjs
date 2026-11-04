/**
 * The freehand highlighter must still be translucent after the refactor that
 * pulled `hlMode`/`hlAlpha` out of `drawHighlighter`.
 *
 * Draws one highlighter swipe with no hold (so it stays a stroke, not a shape)
 * and samples the middle of it against the paper.
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

const box = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  const p = eval('pg()');
  return { x: r.x, y: r.y, k: r.width / (p.pw || 800) };
});
const S = (x, y) => [box.x + x * box.k, box.y + y * box.k];

await page.evaluate(() => {
  eval('pg().strokes.length=0; tool="hl"; setCol("#e5383b"); setBrush(14,1); draw();');
});
await page.waitForTimeout(400);
await page.mouse.move(...S(160, 300));
await page.mouse.down();
for (let i = 1; i <= 30; i++) await page.mouse.move(...S(160 + i * 13, 300 + i * 0.8), { steps: 1 });
await page.mouse.up(); // no hold: stays a stroke
await page.waitForTimeout(600);

const out = await page.evaluate(() => {
  const cv = document.getElementById('cv');
  const p = eval('pg()');
  const k = cv.width / (p.pw || 800);
  const g = cv.getContext('2d');
  const at = (x, y) => {
    const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const last = p.strokes[p.strokes.length - 1];
  return { t: last.t, w: last.w, ink: at(350, 300), paper: at(700, 800) };
});
console.log(JSON.stringify(out));

const [r, gg, b] = out.ink;
const [pr, pg2, pb] = out.paper;
// #e5383b is (229,56,59): a solid highlighter would land near that. A wash keeps
// the red but lifts the green and blue towards the paper.
const solid = Math.abs(gg - 56) < 40;
console.log(out.t === 'hl' ? 'stroke kept' : 'STROKE LOST');
console.log(solid ? 'OPAQUE — the refactor broke the blend' : 'translucent ok');
await browser.close();
