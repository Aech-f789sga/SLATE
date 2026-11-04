/**
 * Does a snapped stroke keep the ink it was drawn with?
 *
 * The complaint was concrete: a highlighter that snaps comes back "thin and bold
 * like a pen". So the same line and the same box are drawn with three nibs —
 * pen, highlighter, marker — held long enough to snap, and what lands on the page
 * is compared with what the stroke was painting before the snap.
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
  const n = { id: Date.now(), name: 'S', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
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

function loop(V, per = 9, wob = 3) {
  const out = [];
  for (let i = 0; i < V.length; i++) {
    const a = V[i];
    const b = V[(i + 1) % V.length];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push([a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * wob, a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * wob]);
    }
  }
  out.push([V[0][0] + (Math.random() - 0.5) * wob, V[0][1] + (Math.random() - 0.5) * wob]);
  return out;
}

async function draw(name, tool, size, brush, path, hold = 2600) {
  await page.evaluate(
    ([t, w, b]) => {
      eval(`pg().strokes.length=0; tool=${JSON.stringify(t)}; setCol("#e5383b"); setBrush(${w},1);`);
      const pt = document.getElementById('pt');
      if (pt) {
        pt.value = b;
        pt.dispatchEvent(new Event('change', { bubbles: true }));
      }
      eval('draw()');
    },
    [tool, size, brush]
  );
  // a tick may re-assert the active pen's remembered width; read what is really set
  await page.waitForTimeout(450);
  const setup = await page.evaluate(() => ({ size: eval('size'), v: document.getElementById('pt').value }));
  const [first, ...rest] = path;
  await page.mouse.move(...S(first[0], first[1]));
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(...S(p[0], p[1]), { steps: 1 });
  await page.waitForTimeout(hold);
  await page.mouse.up();
  await page.waitForTimeout(700);

  const got = await page.evaluate(() => {
    const s = eval('pg().strokes');
    const l = s[s.length - 1];
    if (!l) return null;
    return { t: l.t, k: l.k || '', w: +(l.w || 0).toFixed(2), ho: l.ho == null ? null : +l.ho.toFixed(3), hl: l.hl ? 1 : 0, n: s.length };
  });
  console.log(name.padEnd(22), JSON.stringify({ ...got, size: +setup.size.toFixed(2), v: setup.v }));
  return { ...got, size: setup.size, v: setup.v, src: tool };
}

const line = Array.from({ length: 26 }, (_, i) => [200 + i * 12, 250 + i * 1]);
const square = loop([[240, 380], [440, 380], [440, 560], [240, 560]]);

const penLine = await draw('pen line', 'pen', 4, 'ball', line);
const hlLine = await draw('highlighter line', 'hl', 14, 'marker', line);
const hlBox = await draw('highlighter box', 'hl', 14, 'marker', square);
const mkLine = await draw('marker line', 'pen', 4, 'marker', line);
const crBox = await draw('crayon box', 'pen', 4, 'crayon', square);

await page.screenshot({ path: 'shots/hl-snap-form.png' });
await browser.close();

/* What each nib paints at, worked out from what the engine was actually set to:
   the highlighter multiplies by 4, the marker by 2.5, the crayon by 2. */
const MUL = { ball: 1, marker: 2.5, crayon: 2 };
const ALPHA = { ball: 1, marker: 0.7, crayon: 0.75 };
const want = (g, k) => ({
  k,
  w: g.size * (g.src === 'hl' ? 4 : MUL[g.v] ?? 1),
  ho: g.src === 'hl' ? 0.34 : ALPHA[g.v] ?? 1,
});

let ok = 0;
let tot = 0;
console.log('\nsummary');
for (const [name, g, kind] of [
  ['pen line', penLine, 'line'],
  ['highlighter line', hlLine, 'line'],
  ['highlighter box', hlBox, 'square'],
  ['marker line', mkLine, 'line'],
  ['crayon box', crBox, 'square'],
]) {
  const w = want(g, kind);
  tot++;
  const pass =
    g && g.t === 'shape' && g.k === w.k && Math.abs(g.w - w.w) < 0.6 && (w.ho >= 0.995 ? g.ho == null : g.ho != null && Math.abs(g.ho - w.ho) < 0.03);
  if (pass) ok++;
  console.log(
    ` ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} want ${w.k}/${w.w.toFixed(2)}/${w.ho >= 0.995 ? '-' : w.ho}  got ${g ? `${g.k}/${g.w}/${g.ho ?? '-'}` : 'none'}`
  );
}
console.log(`${ok}/${tot}`);
