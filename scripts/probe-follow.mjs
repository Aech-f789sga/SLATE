/* Regression probe for "the page and the panels follow my fingers".
 *
 *   node scripts/probe-follow.mjs [baseURL] [tag]
 *
 * Two reports, one cause each:
 *
 *   1. Dragging a panel did not follow the pointer. A panel's `left` is
 *      measured from its containing block, and on a phone that block sits
 *      197px away from the panel's offsetParent, so writing a viewport
 *      coordinate into style.left put the panel somewhere else: the first move
 *      snapped it 77px the wrong way, and after that the pointer had to travel
 *      far past the target before the panel arrived.
 *
 *   2. Zooming did not stay where you pinched. The wrap is resized from its
 *      top-left corner, and the old code only scrolled by the midpoint delta,
 *      so the page grew away from the fingers — pinching at the right edge of
 *      the paper looked like zooming into the middle.
 *
 * Covers:
 *   1. A dragged panel starts where it was and moves 1:1 with the pointer.
 *   2. It moves in the same direction as the pointer, on both axes.
 *   3. It cannot be dragged off the screen.
 *   4. A pinch keeps the grabbed page point under the fingers.
 *   5. Two-finger pan follows the fingers.
 *   6. The zoom buttons anchor at the mouse.
 *   7. Ctrl+wheel anchors at the cursor.
 *   8. No page errors.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
const TAG = process.argv[3] || '';
console.log(`target: ${BASE}`);

let failed = 0;
const ok = (label, pass, detail = '') => {
  if (pass) console.log(`PASS ${label}${detail ? '  — ' + detail : ''}`);
  else {
    failed++;
    console.log(`FAIL ${label}${detail ? '  — ' + detail : ''}`);
  }
};

const browser = await chromium.launch();
const PHONE = {
  viewport: { width: 420, height: 900 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};

async function open(opts = PHONE) {
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
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove());
    const nb = {
      id: Date.now(),
      name: 'Follow',
      upd: Date.now(),
      pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
    };
    window.lib.push(nb);
    window.openNotebook(nb);
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors };
}

/* ---------------------------------------------------------------- */
/* 1-3. Dragging a panel                                             */
/* ---------------------------------------------------------------- */

const A = await open(PHONE);
await A.page.click('#more');
await A.page.waitForTimeout(600);

const panel = await A.page.evaluate(() => {
  const el = document.getElementById('bar2');
  const r = el.getBoundingClientRect();
  /* a quiet point: one that hits the panel itself, not a child control */
  let quiet = null;
  for (let y = r.top + 2; y < r.bottom - 2 && !quiet; y += 3)
    for (let x = r.left + 2; x < r.right - 2; x += 3) {
      if (document.elementFromPoint(x, y) === el) {
        quiet = { x, y };
        break;
      }
    }
  return { rect: [r.left, r.top, r.width, r.height], quiet };
});
ok('the panel has a quiet drag surface', !!panel.quiet, JSON.stringify(panel.quiet));

const rectOf = (page) =>
  page.evaluate(() => {
    const r = document.getElementById('bar2').getBoundingClientRect();
    return [r.left, r.top];
  });

if (panel.quiet) {
  const sx = panel.quiet.x;
  const sy = panel.quiet.y;
  const before = await rectOf(A.page);
  await A.page.mouse.move(sx, sy);
  await A.page.mouse.down();
  const track = [];
  for (let i = 1; i <= 10; i++) {
    await A.page.mouse.move(sx + 12 * i, sy + 6 * i);
    await A.page.waitForTimeout(12);
    track.push(await rectOf(A.page));
  }
  await A.page.mouse.up();
  const last = track[track.length - 1];
  const gx = (last[0] - before[0]) / 120;
  const gy = (last[1] - before[1]) / 60;
  const firstStep = track[0];
  ok(
    'a dragged panel follows the pointer 1:1',
    Math.abs(gx - 1) < 0.06 && Math.abs(gy - 1) < 0.06,
    `gain ${gx.toFixed(2)}, ${gy.toFixed(2)}`
  );
  ok(
    'it moves the way the pointer moves, from where it was',
    gx > 0 && gy > 0 && Math.abs(firstStep[0] - (before[0] + 12)) < 4,
    `first step ${Math.round(firstStep[0] - before[0])}px right of ${Math.round(before[0])}`
  );

  /* 3. drag hard to the right: a sliver must stay on screen */
  const again = await A.page.evaluate(() => {
    const el = document.getElementById('bar2');
    const r = el.getBoundingClientRect();
    for (let y = r.top + 2; y < r.bottom - 2; y += 3)
      for (let x = r.left + 2; x < r.right - 2; x += 3)
        if (document.elementFromPoint(x, y) === el) return { x, y };
    return null;
  });
  if (again) {
    await A.page.mouse.move(again.x, again.y);
    await A.page.mouse.down();
    for (let i = 1; i <= 12; i++) await A.page.mouse.move(again.x + 60 * i, again.y);
  }
  await A.page.mouse.up();
  const far = await A.page.evaluate(() => {
    const r = document.getElementById('bar2').getBoundingClientRect();
    return { left: r.left, right: r.right, vw: innerWidth };
  });
  ok(
    'it cannot be dragged off the screen',
    far.right > 0 && far.left < far.vw,
    `left ${Math.round(far.left)} right ${Math.round(far.right)} of ${far.vw}`
  );
}

/* ---------------------------------------------------------------- */
/* 4-5. Pinch anchor and two-finger pan                              */
/* ---------------------------------------------------------------- */

const B = await open(PHONE);

const geom = (page) =>
  page.evaluate(() => {
    const r = document.getElementById('cv').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

/* pinch out at 80% across, so "zooms in the middle" would be obvious */
const g0 = await geom(B.page);
const anchor = { x: g0.left + g0.width * 0.8, y: g0.top + g0.height * 0.5 };
const fx = (anchor.x - g0.left) / g0.width;
const fy = (anchor.y - g0.top) / g0.height;

await B.cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: anchor.x - 30, y: anchor.y, id: 1 },
    { x: anchor.x + 30, y: anchor.y, id: 2 },
  ],
});
for (let i = 1; i <= 10; i++) {
  const d = 30 + 5 * i;
  await B.cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: anchor.x - d, y: anchor.y, id: 1 },
      { x: anchor.x + d, y: anchor.y, id: 2 },
    ],
  });
  await B.page.waitForTimeout(16);
}
await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await B.page.waitForTimeout(300);

const g1 = await geom(B.page);
const z1 = await B.page.evaluate(() => window.eval('z'));
const drift = Math.hypot(g1.left + fx * g1.width - anchor.x, g1.top + fy * g1.height - anchor.y);
ok('the pinch zooms in', z1 > 1.2, `z ${z1.toFixed(2)}`);
ok('the pinched point stays under the fingers', drift < 10, `drift ${Math.round(drift)}px at z=${z1.toFixed(2)}`);

/* two-finger pan: same distance, both fingers move by the same delta */
const g2 = await geom(B.page);
/* aim at the middle of what is actually on screen, not the middle of a canvas
   that may be far larger than the window */
const mid = await B.page.evaluate(() => {
  const r = document.getElementById('stage').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const panBy = { x: 70, y: 50 };
await B.cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: mid.x - 60, y: mid.y, id: 1 },
    { x: mid.x + 60, y: mid.y, id: 2 },
  ],
});
for (let i = 1; i <= 8; i++) {
  const dx = (panBy.x * i) / 8;
  const dy = (panBy.y * i) / 8;
  await B.cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: mid.x - 60 + dx, y: mid.y + dy, id: 1 },
      { x: mid.x + 60 + dx, y: mid.y + dy, id: 2 },
    ],
  });
  await B.page.waitForTimeout(16);
}
await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await B.page.waitForTimeout(300);

const g3 = await geom(B.page);
ok(
  'two-finger pan moves the page with the fingers',
  Math.abs(g3.left - g2.left - panBy.x) < 12 && Math.abs(g3.top - g2.top - panBy.y) < 12,
  `moved ${Math.round(g3.left - g2.left)},${Math.round(g3.top - g2.top)} wanted ${panBy.x},${panBy.y}`
);
ok('no page errors (phone)', B.errors.length === 0, B.errors.slice(0, 2).join(' | '));
await B.ctx.close();

/* ---------------------------------------------------------------- */
/* 6-7. Desktop zoom anchors at the mouse                            */
/* ---------------------------------------------------------------- */

const C = await open({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });

/* zoom in a few times first so there is somewhere to move to */
const where = await C.page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.left + r.width * 0.75, y: r.top + r.height * 0.4 };
});
await C.page.mouse.move(where.x, where.y);
await C.page.waitForTimeout(80);

const fractionUnder = (page, pt) =>
  page.evaluate(
    (p) => {
      const r = document.getElementById('cv').getBoundingClientRect();
      return { fx: (p.x - r.left) / r.width, fy: (p.y - r.top) / r.height, z: window.eval('z') };
    },
    pt
  );

const f0 = await fractionUnder(C.page, where);
/* click without moving the pointer, so the "last mouse position" is the one we
   aimed at — this is also how a real click on the button behaves */
await C.page.$eval('#zi', (b) => b.click());
await C.page.$eval('#zi', (b) => b.click());
await C.page.waitForTimeout(250);
const f1 = await fractionUnder(C.page, where);
ok(
  'the zoom button anchors at the mouse',
  f1.z > f0.z && Math.abs(f1.fx - f0.fx) < 0.02 && Math.abs(f1.fy - f0.fy) < 0.02,
  `z ${f0.z.toFixed(2)}→${f1.z.toFixed(2)}, fraction ${f0.fx.toFixed(3)}→${f1.fx.toFixed(3)}`
);

/* ctrl+wheel at a different point */
const wheelAt = { x: where.x - 180, y: where.y + 90 };
const w0 = await fractionUnder(C.page, wheelAt);
await C.page.evaluate((p) => {
  document
    .getElementById('stage')
    .dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
}, wheelAt);
await C.page.waitForTimeout(250);
const w1 = await fractionUnder(C.page, wheelAt);
ok(
  'ctrl+wheel anchors at the cursor',
  w1.z > w0.z && Math.abs(w1.fx - w0.fx) < 0.02 && Math.abs(w1.fy - w0.fy) < 0.02,
  `z ${w0.z.toFixed(2)}→${w1.z.toFixed(2)}, fraction ${w0.fx.toFixed(3)}→${w1.fx.toFixed(3)}`
);

ok('no page errors (desktop)', C.errors.length === 0, C.errors.slice(0, 2).join(' | '));
await C.page.screenshot({ path: `shots/follow${TAG ? '-' + TAG : ''}.png` });
await C.ctx.close();

await browser.close();
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
