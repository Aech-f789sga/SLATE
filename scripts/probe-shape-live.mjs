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
  [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''))?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});
await page.waitForTimeout(400);

const box = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  const p = eval('pg()');
  return { x: r.x, y: r.y, k: r.width / (p.pw || 800) };
});
const S = (x, y) => [box.x + x * box.k, box.y + y * box.k];

const cur = () =>
  page.evaluate(() => {
    const c = eval('cur');
    if (!c) return null;
    return { t: c.t, k: c.k, a: c.a && c.a.map(Math.round), b: c.b && c.b.map(Math.round), poly: !!c.poly, el: !!c.el };
  });

const last = () =>
  page.evaluate(() => {
    const s = eval('pg().strokes');
    const l = s[s.length - 1];
    return l ? { t: l.t, k: l.k, a: l.a && l.a.map(Math.round), b: l.b && l.b.map(Math.round), poly: !!l.poly, el: !!l.el, n: s.length } : null;
  });

const clear = () => page.evaluate(() => { eval('pg().strokes.length=0; draw();'); });

function loop(V, per = 10, wob = 2.5) {
  const out = [];
  for (let i = 0; i < V.length; i++) {
    const a = V[i];
    const b = V[(i + 1) % V.length];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push([a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * wob, a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * wob]);
    }
  }
  out.push([V[0][0], V[0][1]]);
  return out;
}

/* ---------------- 1. shape tool: circle preview + persistence ------------- */
console.log('\n== shape tool');
await page.evaluate(() => window.__inkpad_shape.setTool('circle'));
await page.waitForTimeout(300);

const dragShape = async () => {
  await page.mouse.move(...S(200, 250));
  await page.mouse.down();
  await page.mouse.move(...S(300, 330), { steps: 6 });
  const mid = await cur();
  await page.mouse.move(...S(420, 400), { steps: 6 });
  const mid2 = await cur();
  await page.mouse.up();
  await page.waitForTimeout(350);
  return { mid, mid2, done: await last() };
};

await clear();
const d1 = await dragShape();
console.log('stroke 1 preview', JSON.stringify(d1.mid2));
console.log('stroke 1 commit ', JSON.stringify(d1.done));
const d2 = await dragShape();
console.log('stroke 2 preview', JSON.stringify(d2.mid2));
console.log('stroke 2 commit ', JSON.stringify(d2.done));

/* ---------------- 0. the hold setting ---------------- */
console.log('== hold setting');
await page.evaluate(() => document.getElementById('acc-trigger')?.click());
await page.waitForTimeout(300);
const menu = await page.evaluate(() =>
  [...document.querySelectorAll('#acc-pop .acc-item')].map((r) => r.dataset.acc),
);
await page.evaluate(() => document.querySelector('#acc-pop [data-acc="snap"]')?.click());
await page.waitForTimeout(300);
const sheet = await page.evaluate(() => {
  const s = document.getElementById('acc-snap');
  const m = document.getElementById('acc-pop');
  const sr = s?.getBoundingClientRect();
  const mr = m?.getBoundingClientRect();
  return {
    visible: !!s?.classList.contains('on'),
    label: s?.querySelector('#snap-num')?.textContent,
    range: s?.querySelector('#snap-range')?.value,
    // the sheet must not sit on top of the menu it came from
    overlapsMenu: !!(sr && mr && sr.left < mr.right && sr.right > mr.left && sr.top < mr.bottom && sr.bottom > mr.top),
    onScreen: !!(sr && sr.top >= 0 && sr.bottom <= window.innerHeight && sr.left >= 0 && sr.right <= window.innerWidth),
  };
});
console.log('menu  ', JSON.stringify(menu));
console.log('sheet ', JSON.stringify(sheet));
await page.screenshot({ path: 'shots/snap-hold-sheet.png' });

const applied = await page.evaluate(() => {
  const r = document.getElementById('snap-range');
  r.value = '700';
  r.dispatchEvent(new Event('input', { bubbles: true }));
  return {
    label: document.getElementById('snap-num')?.textContent,
    stored: localStorage.getItem('inkpad-snap-hold'),
  };
});
console.log('set   ', JSON.stringify(applied));

// back to the default so the drawing tests below run against 2 s
await page.evaluate(() => document.getElementById('snap-reset')?.click());
await page.waitForTimeout(150);
const restored = await page.evaluate(() => ({
  label: document.getElementById('snap-num')?.textContent,
  stored: localStorage.getItem('inkpad-snap-hold'),
}));
console.log('reset ', JSON.stringify(restored));
await page.evaluate(() => document.getElementById('acc-trigger')?.click());
await page.waitForTimeout(250);

/* ---------------- 2. hold-to-snap with jitter, live resize --------------- */
console.log('\n== hold to snap (square, with jitter)');
await page.evaluate(() => { eval('tool="pen"; setCol("#111"); setBrush(3); draw();'); });
await page.waitForTimeout(200);
await clear();

const square = loop([[240, 300], [430, 300], [430, 480], [240, 480]]);
await page.mouse.move(...S(square[0][0], square[0][1]));
await page.mouse.down();
for (const p of square) await page.mouse.move(...S(p[0], p[1]), { steps: 1 });

// a hand never sits still: nudge a pixel or two around where it stopped. The
// nudge has to stay under the jitter threshold, or it restarts the hold clock
// and the hold never completes.
const still = async (base, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await page.mouse.move(...S(base[0] + Math.random(), base[1] + Math.random()), { steps: 1 });
    await page.waitForTimeout(45);
  }
};

// loop() ends back at its first vertex, so that is where the pen stopped
await still([240, 300], 1200);
console.log('at 1200ms    ', JSON.stringify(await cur()));
await still([240, 300], 1400);
const snapped = await cur();
console.log('at 2600ms    ', JSON.stringify(snapped));

// resize by dragging the free corner outward while still holding
await page.mouse.move(...S(150, 210), { steps: 8 });
await page.waitForTimeout(120);
const resized = await cur();
console.log('after resize ', JSON.stringify(resized));
await page.mouse.up();
await page.waitForTimeout(400);
const sq = await last();
console.log('committed    ', JSON.stringify(sq));

/* ---------------- 3. line: straighten on hold, drag the end -------------- */
console.log('\n== line hold');
await clear();
await page.mouse.move(...S(200, 620));
await page.mouse.down();
for (let i = 1; i <= 24; i++) {
  await page.mouse.move(...S(200 + i * 8, 620 + Math.sin(i / 3) * 9), { steps: 1 });
}

// A line waits for its own, longer hold. The nudge has to stay well under the
// jitter threshold or it re-arms the timer and the hold never completes.
await still([392, 620], 1200);
const early = await cur();
console.log('at 1200ms    ', JSON.stringify(early));

await still([392, 620], 1400);
const lineSnap = await cur();
console.log('at 2600ms    ', JSON.stringify(lineSnap));

await page.mouse.move(...S(300, 760), { steps: 6 });
const lineMoved = await cur();
console.log('after drag   ', JSON.stringify(lineMoved));
await page.mouse.up();
await page.waitForTimeout(400);
console.log('committed    ', JSON.stringify(await last()));

/* ---------------- 4. slow draw, then stop -------------------------------- */
/**
 * The regression this probe exists for. Drawing slowly means every pointer
 * event moves a pixel or two — under the jitter threshold — so a clock that
 * only restarts on "big" moves never restarts at all: it fires mid-stroke,
 * recognises half a shape, gives up, and never comes back. Snapping then only
 * worked if you drew quickly.
 */
console.log('\n== slow draw, then hold');
await clear();

// a square with a point every ~2 px, i.e. no single event is a real "move"
const V = [[240, 300], [430, 300], [430, 480], [240, 480]];
const fine = [];
for (let i = 0; i < V.length; i++) {
  const a = V[i];
  const b = V[(i + 1) % V.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.round(len / 2);
  for (let k = 0; k < n; k++) {
    const t = k / n;
    fine.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
}
fine.push(V[0]);

await page.mouse.move(...S(fine[0][0], fine[0][1]));
await page.mouse.down();
const drawStart = Date.now();
for (const p of fine) await page.mouse.move(...S(p[0], p[1]));
const drawMs = Date.now() - drawStart;
console.log(`drew ${fine.length} points over ${drawMs} ms (${(drawMs / fine.length).toFixed(1)} ms each)`);

await still(V[0], 2600);
const slowSnap = await cur();
console.log('after hold   ', JSON.stringify(slowSnap));
await page.mouse.up();
await page.waitForTimeout(400);
console.log('committed    ', JSON.stringify(await last()));

await page.screenshot({ path: 'shots/shape-live.png' });
await browser.close();
