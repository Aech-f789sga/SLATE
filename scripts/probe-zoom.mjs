/* Regression probe for pinch-zoom and the high-zoom detail layer.
 *
 *   node scripts/probe-zoom.mjs [baseURL] [tag]
 *
 * Two bugs from one report:
 *
 *   1. Pinching to zoom deleted drawings, one per pinch. The scribble-to-erase
 *      recogniser listened on the window and appended every pointer's movement
 *      to a single trail without checking whose it was, so two fingers moving
 *      apart produced exactly the signature it looks for — many reversals, a
 *      long path over a small box — and deleted whatever the box covered.
 *
 *   2. A page at 800% on a phone looked like 200 dpi. The page canvas has to
 *      hold the whole page, so its density is `screen density / zoom`; at 800%
 *      on a 3x screen that is 13 device pixels per unit, 149 megapixels, which
 *      no browser will rasterise on the GPU. The density was capped, and the
 *      cap is what the eye saw. Now a window-sized layer is painted on top at
 *      the density the screen needs.
 *
 * Covers:
 *   1. A pinch keeps every stroke, twice over.
 *   2. A pinch still zooms.
 *   3. Scribble-to-erase still erases — the fix must not disable the feature.
 *   4. At 800% on a phone the detail layer is on and far denser than the page.
 *   5. At 100% it is off, because the page canvas is already the sharper one.
 *   6. The layer is cheaper than the canvas it replaces, not just sharper.
 *   7. The layer tracks the stage and repaints when the page scrolls.
 *   8. Drawing at 800% still lands under the finger.
 *   9. A page turn hands the layer back instead of leaving the page soft.
 *  10. "Desktop site" mode gets the handheld budget, not the desktop one.
 *  11. Desktop-site at 100% stays inside that budget per frame.
 *  12. Desktop-site at 800% turns the layer on and is far denser for no more
 *      cost than the page canvas.
 *  13. No page errors.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
const TAG = process.argv[3] || '';
console.log(`target: ${BASE}`);

const browser = await chromium.launch();
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};

/* "Desktop site" on the same phone: a desktop user agent, a 980 px layout
   viewport, and a coarse pointer. This is the mode that was slow. */
const DESK = {
  viewport: { width: 980, height: 1743 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

let failed = 0;
const ok = (label, pass, detail = '') => {
  if (pass) console.log(`PASS ${label}${detail ? '  — ' + detail : ''}`);
  else {
    failed++;
    console.log(`FAIL ${label}${detail ? '  — ' + detail : ''}`);
  }
};

async function open(opts = PHONE, strokes = 0) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1300);
  await page.evaluate((n) => {
    document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove());
    const nb = { id: Date.now(), name: 'Zoom', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
    for (let i = 0; i < n; i++) {
      const pts = [];
      for (let k = 0; k < 14; k++) pts.push([60 + (i % 8) * 90 + k * 4, 100 + Math.floor(i / 8) * 120 + Math.sin(k) * 7, 0.6]);
      nb.pages[0].strokes.push({ t: 'pen', c: '#123', w: 2, v: 'ball', sd: i, pr: 1, p: pts });
    }
    window.lib.push(nb);
    window.openNotebook(nb);
  }, strokes);
  await page.waitForTimeout(1100);
  await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors };
}

const geo = (page) =>
  page.evaluate(() => {
    const b = document.getElementById('cv').getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
const count = (page) => page.evaluate(() => window.eval('pg().strokes.length'));
const zoom = (page) => page.evaluate(() => window.eval('z'));

async function touchStroke(cdp, r, pts) {
  const P = (ux, uy) => ({ x: r.x + (ux * r.w) / 800, y: r.y + (uy * r.h) / 1100 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...P(pts[0][0], pts[0][1]), id: 1 }] });
  for (let i = 1; i < pts.length; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...P(pts[i][0], pts[i][1]), id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/* ---------------------------------------------------------------- */
/* 1-2. Pinch must not delete, and must still zoom                    */
/* ---------------------------------------------------------------- */

const A = await open(PHONE);
const r0 = await geo(A.page);
await touchStroke(A.cdp, r0, [[120, 200], [200, 210], [280, 190], [360, 215]]);
await touchStroke(A.cdp, r0, [[120, 400], [200, 410], [280, 390], [360, 415]]);
await touchStroke(A.cdp, r0, [[120, 600], [200, 610], [280, 590], [360, 615]]);
await A.page.waitForTimeout(300);
const drawn = await count(A.page);
const zBefore = await zoom(A.page);

async function pinch(page, cdp, r, from, to, steps = 8) {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: c.x - from, y: c.y, id: 1 }, { x: c.x + from, y: c.y, id: 2 }],
  });
  for (let i = 1; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: c.x - d, y: c.y, id: 1 }, { x: c.x + d, y: c.y, id: 2 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
}

await pinch(A.page, A.cdp, r0, 40, 120);
const afterIn = await count(A.page);
const zIn = await zoom(A.page);
await pinch(A.page, A.cdp, r0, 120, 40);
const afterOut = await count(A.page);
const zOut = await zoom(A.page);

ok('a pinch keeps every stroke', afterIn === drawn && afterOut === drawn, `${drawn} → ${afterIn} → ${afterOut}`);
ok('pinching out zooms in', zIn > zBefore + 0.1, `${zBefore} → ${zIn}`);
ok('pinching in zooms back out', zOut < zIn, `${zIn} → ${zOut}`);

/* ---------------------------------------------------------------- */
/* 3. Scribble to erase still erases                                  */
/* ---------------------------------------------------------------- */

const B = await open(PHONE);
const r1 = await geo(B.page);
await touchStroke(B.cdp, r1, [[150, 300], [250, 300], [350, 300]]);
await B.page.waitForTimeout(250);
const beforeScratch = await count(B.page);

/* a deliberate scratch-out over the stroke: many reversals, long path, small box */
const P = (ux, uy) => ({ x: r1.x + (ux * r1.w) / 800, y: r1.y + (uy * r1.h) / 1100 });
const start = P(160, 296);
await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
for (let i = 0; i < 26; i++) {
  const x = 160 + (i % 2 ? 60 : 0) + (i % 4 < 2 ? 12 : -12);
  const y = 296 + (i % 3) * 9;
  const q = P(x, y);
  await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, id: 1 }] });
  await B.page.waitForTimeout(14);
}
await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await B.page.waitForTimeout(600);
const afterScratch = await count(B.page);
ok('scribble-to-erase still erases', afterScratch < beforeScratch, `${beforeScratch} → ${afterScratch}`);
await B.ctx.close();

/* ---------------------------------------------------------------- */
/* 4-6. The detail layer                                              */
/* ---------------------------------------------------------------- */

const D = await open(PHONE, 60);
await D.page.evaluate(() => {
  window.eval('z=1');
  window.eval('layout()');
  window.eval('fit()');
});
await D.page.waitForTimeout(400);
const at1 = await D.page.evaluate(() => window.__slateDetail());
ok('at 100% the layer stays off', at1.on === 0, JSON.stringify(at1));
ok('at 100% the page canvas is the sharper one', at1.page > at1.window, `page ${at1.page} vs window ${at1.window}`);

await D.page.evaluate(() => {
  window.eval('z=8');
  window.eval('layout()');
  window.eval('fit()');
});
await D.page.waitForTimeout(500);
const at8 = await D.page.evaluate(() => window.__slateDetail());
ok('at 800% the layer turns on', at8.on === 1, JSON.stringify(at8));
ok('at 800% the window is far denser than the page', at8.window >= at8.page * 3, `window ${at8.window} vs page ${at8.page}`);
ok('at 800% the layer is cheaper than the page canvas', at8.px < at8.base, `${(at8.px / 1e6).toFixed(2)} MP vs ${(at8.base / 1e6).toFixed(2)} MP`);

/* 7. it tracks the stage, and repaints when the page scrolls */
const tracks = await D.page.evaluate(() => {
  const s = document.getElementById('stage').getBoundingClientRect();
  const d = document.getElementById('cvd').getBoundingClientRect();
  return { dx: Math.abs(d.x - s.x), dy: Math.abs(d.y - s.y), dw: Math.abs(d.width - s.width), dh: Math.abs(d.height - s.height) };
});
ok('the layer sits exactly over the stage', tracks.dx < 2 && tracks.dy < 2 && tracks.dw < 2 && tracks.dh < 2, JSON.stringify(tracks));

const scrolled = await D.page.evaluate(() => {
  const s = document.getElementById('stage');
  const c = document.getElementById('cvd');
  const before = c.getContext('2d').getImageData(0, 0, 1, 1).data.join(',');
  s.scrollLeft += 220;
  s.scrollTop += 180;
  s.dispatchEvent(new Event('scroll'));
  return new Promise((res) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const after = c.getContext('2d').getImageData(0, 0, 1, 1).data.join(',');
        const d = c.getBoundingClientRect();
        const sr = s.getBoundingClientRect();
        res({ changed: before !== after, dx: Math.abs(d.x - sr.x), dy: Math.abs(d.y - sr.y), before, after });
      })
    )
  );
});
ok('scrolling repaints the layer', scrolled.changed, `${scrolled.before} → ${scrolled.after}`);
ok('the layer still tracks the stage after scrolling', scrolled.dx < 2 && scrolled.dy < 2, `dx ${scrolled.dx} dy ${scrolled.dy}`);

/* 8. drawing at 800% still lands under the finger. The page is scrolled here,
   so the check is: the point in the middle of the stage must map to the page
   unit the canvas says it does, and the stroke must start there. */
const r2 = await geo(D.page);
const mid = await D.page.evaluate(() => {
  const b = document.getElementById('stage').getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
const target = { ux: ((mid.x - r2.x) * 800) / r2.w, uy: ((mid.y - r2.y) * 1100) / r2.h };
await D.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...mid, id: 1 }] });
for (let i = 1; i <= 6; i++) {
  await D.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mid.x + i * 4, y: mid.y + i * 2, id: 1 }] });
}
await D.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await D.page.waitForTimeout(400);
const landed = await D.page.evaluate(() => {
  const s = window.eval('pg().strokes');
  const last = s[s.length - 1];
  return last && last.p ? last.p[0].slice(0, 2) : null;
});
const near = landed && Math.hypot(landed[0] - target.ux, landed[1] - target.uy) < 12;
ok('drawing at 800% lands under the finger', !!near, landed ? `asked ${Math.round(target.ux)},${Math.round(target.uy)} got ${landed.map((v) => Math.round(v))}` : 'no stroke');

/* 9. A page turn must hand the layer back. Every flip path paints its pages
   while `flipping` is still set, and `flipping` switches the layer off for that
   paint — so the flag has to be cleared before the final repaint, or a zoomed
   page comes back soft and stays soft until the next stroke. */
await D.page.evaluate(() => {
  window.eval('FLIP=true');
  window.eval('nb.pages.push({tpl:"lined",col:"",strokes:[],pw:800,ph:1100})');
  window.eval('thumbs()');
});
const flipped = await D.page.evaluate(
  () =>
    new Promise((res) => {
      window.eval('goPage(1)');
      setTimeout(
        () =>
          res({
            pi: window.eval('pi'),
            flipping: window.eval('flipping'),
            on: window.__slateDetail().on,
            shown: document.getElementById('cvd').style.display,
          }),
        1500
      );
    })
);
ok(
  'a page turn hands the layer back',
  flipped.pi === 1 && flipped.flipping === 0 && flipped.on === 1 && flipped.shown === 'block',
  JSON.stringify(flipped)
);

ok('no page errors', D.errors.length === 0, D.errors.slice(0, 3).join(' | '));
await D.page.screenshot({ path: `shots/zoom-800${TAG ? '-' + TAG : ''}.png` });
await D.ctx.close();

/* ---------------------------------------------------------------- */
/* 10-13. The same page in "desktop site" mode                        */
/* ---------------------------------------------------------------- */
/* The report had two halves: pixelated at 800%, and slow only in desktop mode.
   Both came from the same place. The budget was chosen by sniffing the user
   agent, so this mode got the desktop budget — 7.92 MP per frame instead of
   3.52 — and the layer could not help, because its density was capped at the
   same MAXPIX and so its cost was always exactly the page canvas's, which lost
   the "cheaper" test every time. Now the budget follows the pointer type (which
   does not change with the layout mode) and the layer is capped by the page
   canvas instead, so it wins on sharpness at equal cost. */

const E = await open(DESK, 40);
const deskCap = await E.page.evaluate(() => window.eval('MAXPIX'));
ok('desktop-site mode gets the handheld budget', deskCap <= 4.2e6, `${(deskCap / 1e6).toFixed(1)} MP`);

await E.page.evaluate(() => {
  window.eval('z=1');
  window.eval('layout()');
  window.eval('fit()');
});
await E.page.waitForTimeout(400);
const d1 = await E.page.evaluate(() => window.__slateDetail());
ok('desktop-site at 100% stays inside that budget', d1.base <= 4.3e6, `${(d1.base / 1e6).toFixed(2)} MP per frame`);

await E.page.evaluate(() => {
  window.eval('z=8');
  window.eval('layout()');
  window.eval('fit()');
});
await E.page.waitForTimeout(500);
const d8 = await E.page.evaluate(() => window.__slateDetail());
ok('desktop-site at 800% turns the layer on', d8.on === 1, JSON.stringify(d8));
ok('desktop-site at 800% is far denser than the page', d8.window >= d8.page * 3, `window ${d8.window} vs page ${d8.page}`);
ok('desktop-site at 800% costs no more than the page canvas', d8.px <= d8.base * 1.02, `${(d8.px / 1e6).toFixed(2)} MP vs ${(d8.base / 1e6).toFixed(2)} MP`);
ok('desktop-site raises no page errors', E.errors.length === 0, E.errors.slice(0, 3).join(' | '));
await E.page.screenshot({ path: `shots/zoom-desksite${TAG ? '-' + TAG : ''}.png` });
await E.ctx.close();

await browser.close();
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
