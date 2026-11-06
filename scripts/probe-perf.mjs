/* Regression probe for pen latency and the live-preview pixel budget.
 *
 *   node scripts/probe-perf.mjs [baseURL] [tag]
 *
 * The report that prompted this probe had two halves that turned out to be one
 * bug: "when I doodle faster there are gaps where nothing is written" and "there
 * is a noticeable delay at 1200 dpi". Both came from the paint path. Every input
 * sample painted the whole page synchronously, and past a certain backing-store
 * size the page stopped being GPU-rasterised at all, so a single paint cost more
 * than a whole frame. The handler then ran behind the digitiser, the browser
 * merged the queued moves, and ink arrived in clumps.
 *
 * Two things are asserted here, and they are deliberately independent:
 *
 *   - the backing store never grows past the size where painting falls off the
 *     fast path (8 MP measured; 8.2 MP = 1.5 ms, 8.5 MP = 15 ms), while still
 *     being large enough to look sharp;
 *   - a burst of samples paints at most once, and every sample still reaches the
 *     stroke.
 *
 * The second half matters more than the first. Coalescing the paint must not
 * cost points: the fix moves the paint, never the data.
 *
 * Covers:
 *   1. 600 dpi is the default, and a stored choice still wins.
 *   2. The backing store stays under the budget at every dpi and zoom.
 *   3. …while still being sharp enough to be worth showing.
 *   4. A full page paints inside a frame budget at 1200 dpi.
 *   5. A fast stroke keeps every sample.
 *   6. A synchronous burst paints once, not once per sample.
 *   7. The stroke that lands on the page is the stroke that was drawn.
 *   8. No page errors.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
const TAG = process.argv[3] || '';
const shotsDir = fileURLToPath(new URL('../shots/', import.meta.url));
const shot = (name) => path.join(shotsDir, name.replace(/\.png$/, (TAG ? `-${TAG}` : '') + '.png'));
console.log(`target: ${BASE}`);

const browser = await chromium.launch();

const initScript = () => {
  try {
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
  } catch {
    /* private mode */
  }
};

/** deviceScaleFactor 2 on purpose: that is the case where the budget binds. */
async function open(storedDpi) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  if (storedDpi) await page.addInitScript((v) => localStorage.setItem('inkpad-dpi', v), String(storedDpi));
  await page.addInitScript(initScript);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    const n = { id: Date.now(), name: 'Perf', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
    window.lib.push(n);
    window.openNotebook(n);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((n) => n.remove());
  });
  await page.waitForTimeout(250);
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, errors };
}

let failed = 0;
const ok = (label, pass, detail = '') => {
  if (pass) console.log(`PASS ${label}${detail ? '  — ' + detail : ''}`);
  else {
    failed++;
    console.log(`FAIL ${label}${detail ? '  — ' + detail : ''}`);
  }
};

const { context, page, cdp, errors } = await open();
const E = (expr) =>
  page.evaluate((x) => {
    try {
      return eval(x);
    } catch (e) {
      return 'ERR:' + e.message;
    }
  }, expr);

const g = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, kx: r.width / 800, ky: r.height / 1100 };
});
const T = (px, py) => [g.x + px * g.kx, g.y + py * g.ky];

async function pen(type, x, y, force = 0.5) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseReleased' ? 'left' : type === 'mousePressed' ? 'left' : 'none',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
    pointerType: 'pen',
    force,
  });
}

/* ---------------------------------------------------------------- */
/* 1. The default resolution                                         */
/* ---------------------------------------------------------------- */

console.log('\n== 1. 600 dpi is the default');
const dpiNow = await E('DPI');
ok('DPI is 6 out of the box', dpiNow === 6, String(dpiNow));
const label = await E(
  '(function(){var s=[].slice.call(document.querySelectorAll("select")).filter(function(x){return [].some.call(x.options,function(o){return /1200 dpi/.test(o.textContent)})})[0];return s?s.options[s.selectedIndex].textContent:null})()'
);
ok('the picker reads 600 dpi', /600/.test(String(label)), String(label));

const stored = await open(12);
const dpiStored = await stored.page.evaluate(() => window.eval('DPI'));
ok('a stored 1200 dpi choice still wins', dpiStored === 12, String(dpiStored));
await stored.context.close();

/* ---------------------------------------------------------------- */
/* 2. The budget                                                     */
/* ---------------------------------------------------------------- */

console.log('\n== 2. The backing store stays on the fast paint path');
const budget = await E('({ max: MAXPIX, mob: MOB, cap: CAPD })');
ok('the desktop budget is 8 MP', budget.max === 8e6, String(budget.max));
ok('the device cap is still a cap', budget.cap >= 4, String(budget.cap));

const grid = await page.evaluate(() => {
  /* Indirect eval, so the page's top-level `let DPI` is reachable. */
  const G = (s) => window.eval(s);
  const out = [];
  for (const dpi of [2, 3, 4, 6, 8, 10, 12]) {
    for (const z of [1, 2, 3, 4]) {
      G(`DPI=${dpi}`); G(`z=${z}`); G('layout()'); G('fit()');
      const cv = document.getElementById('cv');
      out.push({ dpi, z, d: G('wantD()'), px: cv.width * cv.height, w: cv.width, h: cv.height });
    }
  }
  G('DPI=6'); G('z=1'); G('layout()'); G('fit()');
  return out;
});
const over = grid.filter((r) => r.px > budget.max + 1);
ok('no dpi or zoom overshoots the budget', over.length === 0, over.length ? JSON.stringify(over.slice(0, 4)) : `${grid.length} combinations`);
const maxSeen = grid.reduce((a, r) => Math.max(a, r.px), 0);
ok('the largest backing store is under 8 MP', maxSeen <= budget.max, `${(maxSeen / 1e6).toFixed(2)} MP`);
const raised = grid.filter((r) => r.d > r.dpi + 0.001);
ok('no setting renders above its own dpi', raised.length === 0, raised.length ? JSON.stringify(raised.slice(0, 3)) : 'all capped');

console.log('\n== 3. …and is still sharp enough to be worth showing');
/* The budget must be the only thing that ever binds. At 100% zoom the page is
   shown at roughly half its unit count on a 2x screen, so `need` is small and
   the budget should not be involved at all; at 300% zoom the budget does bind,
   and the check is that it is spent down to the last quarter step rather than
   leaving sharpness on the table. */
const sharp = await page.evaluate(() => {
  const G = (s) => window.eval(s);
  const out = [];
  for (const z of [1, 3]) {
    G('DPI=12'); G(`z=${z}`); G('layout()'); G('fit()');
    const w = document.getElementById('wrap');
    const need = Math.max(0.75, (w.clientWidth * (devicePixelRatio || 1)) / 800 * 1.2);
    const budget = Math.sqrt(G('MAXPIX') / (G('W') * G('H')));
    out.push({ z, d: G('wantD()'), need: +need.toFixed(2), budget: +budget.toFixed(2) });
  }
  G('DPI=6'); G('z=1'); G('layout()'); G('fit()');
  return out;
});
const at1 = sharp.find((r) => r.z === 1);
const at3 = sharp.find((r) => r.z === 3);
ok('at 100% zoom the budget does not bind', at1.d >= at1.need - 0.01, `d=${at1.d}, need=${at1.need}, budget=${at1.budget}`);
ok('at 300% zoom the renderer spends the whole budget', at3.d >= at3.budget - 0.25, `d=${at3.d}, budget=${at3.budget}`);
ok('the capped dpi never exceeds the setting', at3.d <= 12, `d=${at3.d}`);

/* ---------------------------------------------------------------- */
/* 4. Paint cost                                                     */
/* ---------------------------------------------------------------- */

console.log('\n== 4. A full page paints inside a frame');
const paint = await page.evaluate(() => {
  const G = (s) => window.eval(s);
  G('pg()').strokes.length = 0;
  for (let i = 0; i < 200; i++) {
    const x = 60 + (i % 10) * 70, y = 80 + Math.floor(i / 10) * 50;
    const pts = [];
    for (let k = 0; k < 12; k++) pts.push([x + k * 4, y + Math.sin(k) * 6, 0.6]);
    G('pg()').strokes.push({ t: 'pen', c: '#123', w: 2, v: 'ball', sd: i, pr: 1, p: pts });
  }
  const out = [];
  for (const [dpi, z] of [[6, 1], [12, 1], [12, 3]]) {
    G(`DPI=${dpi}`); G(`z=${z}`); G('layout()'); G('fit()');
    G('draw()');
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) G('draw()');
    out.push({ dpi, z, d: G('wantD()'), ms: +((performance.now() - t0) / 10).toFixed(2) });
  }
  G('DPI=6'); G('z=1'); G('layout()'); G('fit()');
  return out;
});
for (const r of paint) {
  ok(`a 200-stroke page paints in <8 ms at ${r.dpi * 100} dpi, zoom ${r.z}`, r.ms < 8, `${r.ms} ms, d=${r.d}`);
}

/* ---------------------------------------------------------------- */
/* 5-7. A fast stroke                                                */
/* ---------------------------------------------------------------- */

console.log('\n== 5. A fast stroke keeps every sample');
await E('(function(){var s=document.getElementById("pen");if(s)s.click();return tool})()');
await E('(function(){window.__dc=0;var o=window.draw;window.draw=function(){window.__dc++;return o.apply(this,arguments)};return 1})()');

const before = await E('pg().strokes.length');
const a = T(120, 200), b = T(680, 900);
const N = 120;
await pen('mousePressed', a[0], a[1], 0.5);
await E('window.__dc=0');

/* One synchronous burst: this is what a stalled main thread looks like, and the
   old code painted 120 times inside it. */
const burst = await page.evaluate(
  ({ ax, ay, bx, by, n }) => {
    const cv = document.getElementById('cv');
    const t0 = performance.now();
    for (let i = 1; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const y = ay + ((by - ay) * i) / n + Math.sin(i / 6) * 14;
      cv.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'pen',
          isPrimary: true,
          pressure: 0.5,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        })
      );
    }
    return { ms: +(performance.now() - t0).toFixed(1), draws: window.__dc, pts: window.eval('cur?cur.p.length:0') };
  },
  { ax: a[0], ay: a[1], bx: b[0], by: b[1], n: N }
);
ok('every sample reached the stroke', burst.pts >= N - 1, `${burst.pts} points from ${N} samples`);
ok('the burst did not paint once per sample', burst.draws <= 2, `${burst.draws} paints in ${burst.ms} ms`);
ok('no sample waited on the renderer', burst.ms / N < 1, `${burst.ms} ms for ${N} samples, ${(burst.ms / N).toFixed(2)} ms each`);

const after = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(window.__dc)))));
ok('a frame after the burst the stroke is painted', after >= 1, `${after} paints`);

await pen('mouseReleased', b[0], b[1], 0);
await page.waitForTimeout(400);

console.log('\n== 7. The stroke on the page is the stroke that was drawn');
const landed = await page.evaluate(() => {
  const s = window.eval('pg()').strokes;
  const last = s[s.length - 1];
  if (!last || !last.p) return null;
  let len = 0, gap = 0;
  for (let i = 1; i < last.p.length; i++) {
    const d = Math.hypot(last.p[i][0] - last.p[i - 1][0], last.p[i][1] - last.p[i - 1][1]);
    len += d;
    if (d > gap) gap = d;
  }
  return { n: s.length, pts: last.p.length, len: Math.round(len), gap: +gap.toFixed(1), t: last.t };
});
ok('the stroke was committed', landed && landed.n === before + 1, landed ? `${before} -> ${landed.n} strokes` : '');
ok('it kept a dense point list', landed && landed.pts >= N - 1, landed ? `${landed.pts} points` : '');
ok('no hole in the ink', landed && landed.gap < 40, landed ? `longest segment ${landed.gap} units over ${landed.len} total` : '');
ok('it is still a freehand stroke, not a snapped shape', landed && landed.t === 'pen', landed ? landed.t : '');

await page.screenshot({ path: shot('perf-stroke.png'), clip: { x: g.x, y: g.y, width: g.w, height: g.h } });

console.log('\n== 8. Page errors');
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${failed === 0 ? 'all checks passed' : failed + ' check(s) failed'}`);
process.exit(failed === 0 ? 0 : 1);
