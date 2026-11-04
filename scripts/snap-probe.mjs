import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', r => r.abort());
await page.route('https://fonts.gstatic.com/**', r => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.removeItem('inkpad-snap-hold');
  // whatever an older probe left in memory, put the shipped default back
  window.__inkpad_shape.setHold(1000);
  const n = { id: Date.now(), name: 'S', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find(b => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach(n => n.remove());
});
await page.waitForTimeout(400);

const box = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  const p = eval('pg()');
  return { x: r.x, y: r.y, k: r.width / (p.pw || 800) };
});
const S = (x, y) => [box.x + x * box.k, box.y + y * box.k];

/** A closed hand-drawn loop through `V`, `per` samples per side, `wob` px of shake. */
function loop(V, per = 9, wob = 3) {
  const out = [];
  for (let i = 0; i < V.length; i++) {
    const a = V[i];
    const b = V[(i + 1) % V.length];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push([a[0] + (b[0] - a[0]) * t + (Math.random() - .5) * wob, a[1] + (b[1] - a[1]) * t + (Math.random() - .5) * wob]);
    }
  }
  out.push([V[0][0] + (Math.random() - .5) * wob, V[0][1] + (Math.random() - .5) * wob]);
  return out;
}

async function drawHold(name, path, hold = 1300) {
  await page.evaluate(() => { eval('pg().strokes.length=0; tool="pen"; setCol("#111"); setBrush(3); draw();'); });
  await page.waitForTimeout(150);
  const [first, ...rest] = path;
  await page.mouse.move(...S(first[0], first[1]));
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(...S(p[0], p[1]), { steps: 1 });
  await page.waitForTimeout(hold);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const got = await page.evaluate(() => {
    const s = eval('pg().strokes');
    const l = s[s.length - 1];
    return l ? { t: l.t, k: l.k, n: s.length, p: l.p ? l.p.length : 0 } : null;
  });
  const raw = await page.evaluate(() => {
    const s = eval('pg().strokes');
    const l = s[s.length - 1];
    return l && l.p ? l.p.map(q => [q[0], q[1]]) : null;
  });
  if (raw) fs.writeFileSync(`shots/pts-${name}.json`, JSON.stringify(raw));
  console.log(name.padEnd(14), '->', JSON.stringify(got));
  return got;
}

const results = {};
results.square = await drawHold('square', loop([[260, 300], [450, 300], [450, 490], [260, 490]]));
results.rect = await drawHold('rectangle', loop([[250, 300], [560, 300], [560, 460], [250, 460]]));
results.tri = await drawHold('triangle', loop([[300, 300], [470, 300], [385, 430]]));
results.triR = await drawHold('right-triangle', loop([[220, 300], [220, 470], [420, 470]]));
results.para = await drawHold('parallelogram', loop([[250, 300], [480, 300], [430, 470], [200, 470]]));
results.pent = await drawHold('pentagon', loop(Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
  return [380 + Math.cos(a) * 120, 390 + Math.sin(a) * 120];
})));

const circ = [];
for (let i = 0; i <= 48; i++) {
  const t = (i / 48) * Math.PI * 2;
  circ.push([400 + Math.cos(t) * 90 + (Math.random() - .5) * 3, 380 + Math.sin(t) * 90 + (Math.random() - .5) * 3]);
}
results.circle = await drawHold('circle', circ);

// the default is one second now: a 700 ms pause must leave the stroke alone
results.tooQuick = await drawHold('too-quick', loop([[260, 300], [450, 300], [450, 490], [260, 490]]), 700);

await page.screenshot({ path: 'shots/snap-all.png' });
await browser.close();

const want = { square: 'square', rect: 'rect', tri: 'tri', triR: 'tri', para: 'para', pent: 'poly', circle: 'circle', tooQuick: 'pen' };
console.log('\nsummary');
let ok = 0, tot = 0;
for (const [k, w] of Object.entries(want)) {
  const g = results[k];
  const got = g && g.t === 'shape' ? g.k : (g ? g.t : 'none');
  const pass = got === w;
  if (pass) ok++;
  tot++;
  console.log(` ${pass ? 'PASS' : 'FAIL'}  ${k.padEnd(15)} want ${w.padEnd(7)} got ${got}`);
}
console.log(`${ok}/${tot}`);
