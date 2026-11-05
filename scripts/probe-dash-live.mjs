/** What the stroke looks like *while* it is held, not only after release. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'L', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(600);

const box = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  const p = eval('pg()');
  return { x: r.x, y: r.y, k: r.width / (p.pw || 800) };
});
const S = (x, y) => [box.x + x * box.k, box.y + y * box.k];

await page.evaluate(() => {
  eval('pg().strokes.length=0; tool="pen"; setCol("#111"); setBrush(4); draw();');
  window.__inkpad_ink.setDash('dash');
});
await page.waitForTimeout(250);

const line = Array.from({ length: 26 }, (_, i) => [200 + i * 14, 300 + i * 0.6]);
const [first, ...rest] = line;
await page.mouse.move(...S(first[0], first[1]));
await page.mouse.down();
for (const p of rest) await page.mouse.move(...S(p[0], p[1]), { steps: 1 });
await page.waitForTimeout(1400);
console.log('live cur   ', JSON.stringify(await page.evaluate(() => {
  const c = eval('cur');
  return c ? { t: c.t, k: c.k || '', ds: c.ds ? 1 : 0, dm: c.dm || '' } : null;
})));
await page.screenshot({ path: 'shots/dash-live.png', clip: { x: box.x + 180 * box.k, y: box.y + 260 * box.k, width: 460, height: 90 } });
await page.mouse.up();
await page.waitForTimeout(700);
console.log('committed  ', JSON.stringify(await page.evaluate(() => {
  const s = eval('pg().strokes');
  const l = s[s.length - 1];
  return l ? { t: l.t, k: l.k || '', ds: l.ds ? 1 : 0, dm: l.dm || '' } : null;
})));
await browser.close();
