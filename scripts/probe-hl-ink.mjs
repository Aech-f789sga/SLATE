/** A picture of snapped ink: highlighter, marker and pen, side by side. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
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
  eval('pg().strokes.length=0; draw();');
});
await page.waitForTimeout(400);

const box = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  const p = eval('pg()');
  return { x: r.x, y: r.y, k: r.width / (p.pw || 800) };
});
const S = (x, y) => [box.x + x * box.k, box.y + y * box.k];

async function draw(tool, size, brush, path, hold = 2600) {
  await page.evaluate(
    ([t, w, b]) => {
      eval(`tool=${JSON.stringify(t)}; setCol("#e5383b"); setBrush(${w},1);`);
      const pt = document.getElementById('pt');
      if (pt) {
        pt.value = b;
        pt.dispatchEvent(new Event('change', { bubbles: true }));
      }
      eval('draw()');
    },
    [tool, size, brush]
  );
  await page.waitForTimeout(400);
  const [first, ...rest] = path;
  await page.mouse.move(...S(first[0], first[1]));
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(...S(p[0], p[1]), { steps: 1 });
  await page.waitForTimeout(hold);
  await page.mouse.up();
  await page.waitForTimeout(600);
}

const line = (y) => Array.from({ length: 30 }, (_, i) => [150 + i * 14, y + i * 0.6]);
const rect = (x, y, w, h) => {
  const V = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = V[i];
    const b = V[(i + 1) % 4];
    for (let k = 0; k < 10; k++) {
      const t = k / 10;
      out.push([a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * 2.5, a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * 2.5]);
    }
  }
  out.push(V[0]);
  return out;
};

await draw('hl', 14, 'marker', line(180));
await draw('pen', 4, 'ball', line(300));
await draw('pen', 4, 'marker', line(380));
await draw('hl', 14, 'marker', rect(300, 480, 220, 160));
await draw('pen', 4, 'crayon', rect(560, 480, 140, 160));

await page.evaluate(() => {
  document.querySelectorAll('#tour,.tour').forEach((n) => n.remove());
});
await page.locator('#cv').screenshot({ path: 'shots/hl-snap-ink.png' });
await browser.close();
console.log('ok');
