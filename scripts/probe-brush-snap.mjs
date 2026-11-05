/** A stamped brush — dashed, dotted, splatter — must keep its mark when snapped. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'B', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
  window.__inkpad_ink.setDash('solid');
});
await page.waitForTimeout(600);

const box = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  const p = eval('pg()');
  return { x: r.x, y: r.y, k: r.width / (p.pw || 800) };
});
const S = (x, y) => [box.x + x * box.k, box.y + y * box.k];

/** How many separate runs of ink along the line's row band — dashes give many. */
async function runs(y) {
  return page.evaluate((yy) => {
    const cv = document.getElementById('cv');
    const g = cv.getContext('2d');
    const k = cv.width / 800;
    const d = g.getImageData(0, Math.round(yy * k) - 2, cv.width, 5).data;
    const w = cv.width;
    let n = 0, inRun = false;
    for (let x = 0; x < w; x++) {
      let dark = false;
      for (let row = 0; row < 5; row++) {
        const i = (row * w + x) * 4;
        if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) dark = true;
      }
      if (dark && !inRun) { n++; inRun = true; }
      if (!dark) inRun = false;
    }
    return n;
  }, y);
}

async function draw(brush, y, hold) {
  await page.evaluate(([b]) => {
    eval('pg().strokes.length=0; tool="pen"; setCol("#111"); setBrush(4); draw();');
    window.__inkpad_ink.penType(b);
  }, [brush]);
  await page.waitForTimeout(300);
  const line = Array.from({ length: 24 }, (_, i) => [180 + i * 15, y]);
  const [first, ...rest] = line;
  await page.mouse.move(...S(first[0], first[1]));
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(...S(p[0], p[1]), { steps: 1 });
  await page.waitForTimeout(hold);
  await page.mouse.up();
  await page.waitForTimeout(800);
  const got = await page.evaluate(() => {
    const s = eval('pg().strokes');
    const l = s[s.length - 1];
    return l ? { t: l.t, k: l.k || '', v: l.v || '' } : null;
  });
  const r = await runs(y);
  console.log(brush.padEnd(4), hold + 'ms', JSON.stringify(got), 'runs', r);
  return { got, r };
}

const free = await draw('dd1', 300, 200);
const snapped = await draw('dd1', 420, 1400);
for (const [b, y] of [['dd0', 540], ['dd3', 660], ['pb0', 780]]) await draw(b, y, 1400);
const el = await page.$('#cv');
const eb = await el.boundingBox();
await page.screenshot({ path: 'shots/brush-snap.png', clip: { x: eb.x + 160 * (eb.width / 800), y: eb.y + 270 * (eb.height / 1100), width: 420 * (eb.width / 800), height: 220 * (eb.height / 1100) } });
console.log('freehand runs', free.r, 'snapped runs', snapped.r);
await browser.close();
