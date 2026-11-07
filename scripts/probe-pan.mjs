/* Regression probe for the pan tool.
 *
 *   node scripts/probe-pan.mjs [baseURL]
 *
 * A pan is a view gesture, not an edit. That distinction is the whole point of
 * this suite: the page has to move under the hand exactly, and the notebook
 * must come out of the gesture byte-identical — same strokes, same undo stack,
 * same tool. The same drag is then driven from a pen's barrel button, which
 * borrows the pan tool for the duration of the press and has to give the
 * previous tool back on lift.
 *
 * Covers:
 *   1. The toolbar carries a pan button with an icon and a name.
 *   2. Choosing it arms the tool, lights the button and turns the cursor into
 *      a grab hand.
 *   3. At 100 % — where the page fits and there is nothing to scroll — dragging
 *      moves the page by exactly the drag distance.
 *   4. The same is true downwards once there is room to move.
 *   5. Zoomed in, the same drag scrolls the stage by exactly the drag distance.
 *   6. No drag added a stroke, removed one, or pushed an undo step.
 *   7. The pen comes back afterwards and still draws where it is put.
 *   8. The stylus panel offers Pan in all three button mappings.
 *   9. A pen barrel button mapped to Pan pans, then hands the pen back.
 *  10. A second finger during a pan hands the gesture to pinch without
 *      disturbing the ink or the undo stack.
 *  11. The toolbar keeps its exact shape: same height, same rows, no clipping.
 *  12. No page errors.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
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

const SEED = `
  (function(){
    document.querySelectorAll('#intro,#tour-root,#tour-card').forEach(function(x){x.remove()});
    var mk = function(id,name){return {id:id,name:name,upd:Date.now()-id,pages:[{tpl:'lined',col:'',strokes:[
      {t:'pen',c:'#2f6df6',w:3,p:[[80,120],[200,140],[320,120]]},
      {t:'pen',c:'#e5383b',w:3,p:[[80,300],[200,320],[320,300]]}
    ],pw:800,ph:1100}]}};
    window.lib.length = 0;
    window.lib.push(mk(1,'Pan one'), mk(2,'Pan two'));
    window.openNotebook(window.lib[0]);
  })()`;

/* ---------------------------------------------------------------- */
/* 1-7, 11. Desktop                                                   */
/* ---------------------------------------------------------------- */

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
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
await page.waitForTimeout(1400);
await page.evaluate(SEED);
await page.waitForTimeout(1400);
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));

const cdp = await ctx.newCDPSession(page);

/* ---- 1: the button ---- */

const btn = await page.evaluate(() => {
  const b = document.querySelector('#bar button[data-t="pan"]');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {
    svg: !!b.querySelector('svg'),
    title: b.getAttribute('title') || '',
    aria: b.getAttribute('aria-label') || '',
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
});
ok(
  '1. the toolbar has a pan button',
  !!btn && btn.svg && btn.w >= 20 && btn.h >= 20 && /pan/i.test(btn.title + ' ' + btn.aria),
  btn ? `${btn.w}x${btn.h} svg:${btn.svg} "${btn.title}"` : 'missing'
);

/* ---- 2: arming it ---- */

const armed = await page.evaluate(() => {
  document.querySelector('#bar button[data-t="pan"]').click();
  return {
    tool: window.eval('tool'),
    on: document.querySelector('#bar button[data-t="pan"]').classList.contains('on'),
    others: [...document.querySelectorAll('#bar button[data-t].on')].map((b) => b.dataset.t),
    cursor: getComputedStyle(document.getElementById('cv')).cursor,
  };
});
ok(
  '2. choosing pan arms it',
  armed.tool === 'pan' && armed.on && armed.others.length === 1 && armed.cursor === 'grab',
  `tool:${armed.tool} on:${armed.on} others:[${armed.others}] cursor:${armed.cursor}`
);

/* ---- helpers ---- */

const geom = () =>
  page.evaluate(() => {
    const c = document.getElementById('cv').getBoundingClientRect();
    const s = document.getElementById('stage');
    return {
      left: c.left,
      top: c.top,
      w: c.width,
      h: c.height,
      canX: s.scrollWidth > s.clientWidth + 1,
      canY: s.scrollHeight > s.clientHeight + 1,
      sl: s.scrollLeft,
      st: s.scrollTop,
      z: window.eval('z'),
    };
  });

const ink = () =>
  page.evaluate(() => ({
    strokes: window.eval('pg().strokes.length'),
    undo: window.eval('undo.length'),
    redo: window.eval('redo.length'),
  }));

/** Put the page back at its resting position so a drag always has room. */
async function rewind() {
  await page.evaluate(() => {
    const s = document.getElementById('stage');
    s.scrollLeft = 0;
    s.scrollTop = 0;
    window.eval('panX=0;panY=0;placePage()');
  });
  await page.waitForTimeout(120);
}

/** A point that is on the page and on screen — the canvas centre is off-screen
 *  once the page is bigger than the window, so the stage centre is clamped
 *  into the page's own rect. */
const aimPoint = () =>
  page.evaluate(() => {
    const c = document.getElementById('cv').getBoundingClientRect();
    const s = document.getElementById('stage').getBoundingClientRect();
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    return {
      x: Math.round(clamp(s.left + s.width / 2, c.left + 40, c.right - 40)),
      y: Math.round(clamp(s.top + s.height / 2, c.top + 40, c.bottom - 40)),
    };
  });

/** Drag with the mouse from the middle of the page by (dx, dy). */
async function drag(dx, dy, steps = 8) {
  const a = await aimPoint();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + (dx * i) / steps, a.y + (dy * i) / steps);
    await page.waitForTimeout(12);
  }
  const mid = await geom();
  await page.mouse.up();
  await page.waitForTimeout(120);
  return mid;
}

/* ---- 3: 100 %, the page fits, margin regime ---- */

const ink0 = await ink();
await rewind();
let g0 = await geom();
ok('3a. at 100 % the page fits across', g0.canX === false, `canX:${g0.canX} z:${g0.z} page:${Math.round(g0.w)}px`);

const g3 = await drag(90, 0);
const movedX = g3.left - g0.left;
ok('3. dragging moves the page by the drag distance', Math.abs(movedX - 90) <= 2, `dragged 90, page moved ${movedX.toFixed(1)}`);

/* ---- 4: the vertical, once there is room for it ----
   At 100 % the page is laid out to fill the window's height, so it has no
   vertical slack at all — which is correct, the whole page is already visible.
   Step back to 70 % to give the page somewhere to go. */

await page.evaluate(() => window.zoomAt(0.7, 640, 450));
await page.waitForTimeout(400);
await rewind();
g0 = await geom();
const g4v = await drag(0, 60);
const movedY = g4v.top - g0.top;
ok(
  '4. the same holds downwards',
  g0.canY === false && Math.abs(movedY - 60) <= 2,
  `z:${g0.z} canY:${g0.canY}, dragged 60, page moved ${movedY.toFixed(1)}`
);

/* ---- 6: nothing was edited ---- */

const ink1 = await ink();
ok(
  '6. panning changed no ink and no history',
  ink1.strokes === ink0.strokes && ink1.undo === ink0.undo && ink1.redo === ink0.redo,
  `strokes ${ink0.strokes}->${ink1.strokes}, undo ${ink0.undo}->${ink1.undo}, redo ${ink0.redo}->${ink1.redo}`
);

/* ---- 5: zoomed in, scroll regime ---- */

await page.evaluate(() => {
  window.eval('z=1;layout()');
  window.zoomAt(4, 640, 450);
});
await page.waitForTimeout(500);
await rewind();
g0 = await geom();
ok('5a. zoomed in the page overflows', g0.canX === true && g0.canY === true, `canX:${g0.canX} canY:${g0.canY} z:${g0.z}`);

const g5 = await drag(-80, -60);
const sx5 = g5.left - g0.left;
const sy5 = g5.top - g0.top;
ok(
  '5. zoomed in, dragging scrolls by the drag distance',
  Math.abs(sx5 + 80) <= 2 && Math.abs(sy5 + 60) <= 2,
  `dragged (-80,-60), page moved (${sx5.toFixed(1)}, ${sy5.toFixed(1)}), scroll (${g0.sl.toFixed(0)},${g0.st.toFixed(0)})->(${g5.sl.toFixed(0)},${g5.st.toFixed(0)})`
);

/* ---- 7: the pen still draws afterwards ---- */

await page.evaluate(() => {
  window.eval("z=1;layout();tool='pen';syncTools();closeDr()");
});
await page.waitForTimeout(500);
await rewind();
const before7 = await ink();
const g7 = await geom();

async function pen(type, x, y, o = {}) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseReleased' ? 'left' : type === 'mousePressed' ? 'left' : 'none',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
    pointerType: 'pen',
    force: o.force ?? 0.5,
  });
}

const tx = Math.round(g7.left + g7.w * 0.5);
const ty = Math.round(g7.top + g7.h * 0.55);
await pen('mousePressed', tx, ty);
for (let i = 1; i <= 6; i++) await pen('mouseMoved', tx + i * 9, ty + i * 4);
await pen('mouseReleased', tx + 54, ty + 24);
await page.waitForTimeout(400);

const after7 = await ink();
const last = await page.evaluate(() => {
  const s = window.eval('pg().strokes');
  return s[s.length - 1];
});
const expectPx = ((tx - g7.left) / g7.w) * 800;
const expectPy = ((ty - g7.top) / g7.h) * 1100;
const firstPt = last && last.p ? last.p[0] : null;
ok(
  '7. the pen draws where it is put after a pan',
  after7.strokes === before7.strokes + 1 &&
    !!firstPt &&
    Math.abs(firstPt[0] - expectPx) < 12 &&
    Math.abs(firstPt[1] - expectPy) < 12,
  `strokes ${before7.strokes}->${after7.strokes}, first point ${
    firstPt ? firstPt.map((v) => Math.round(v)).join(',') : 'none'
  } vs ${Math.round(expectPx)},${Math.round(expectPy)}`
);

/* ---------------------------------------------------------------- */
/* 8. The stylus panel offers pan for every button                    */
/* ---------------------------------------------------------------- */

const panel = await page.evaluate(() => {
  window.openPenPanel();
  const read = (id) => [...document.querySelectorAll('#' + id + ' option')].map((o) => o.value);
  const out = { eraser: read('pen-eraser'), side: read('pen-side'), side2: read('pen-side2') };
  document.querySelector('#pen-close')?.click();
  return out;
});
ok(
  '8. every pen button can be mapped to Pan',
  ['eraser', 'side', 'side2'].every((k) => panel[k].includes('pan')),
  Object.entries(panel)
    .map(([k, v]) => `${k}:${v.length}${v.includes('pan') ? ' ✓' : ' ✗'}`)
    .join(' ')
);

/* ---------------------------------------------------------------- */
/* 9. A barrel button mapped to Pan                                   */
/* ---------------------------------------------------------------- */

await page.evaluate(() => {
  window.eval("PENCFG.side='pan';tool='pen';syncTools();closeDr()");
});
await page.waitForTimeout(200);
await page.evaluate(() => window.zoomAt(3, 640, 450));
await page.waitForTimeout(500);
await rewind();

const g9 = await geom();
const ink9 = await ink();
const a9 = await aimPoint();

const barrel = async (type, x, y) => {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'right',
    buttons: type === 'mouseReleased' ? 0 : 2,
    clickCount: 1,
    pointerType: 'pen',
    force: type === 'mouseReleased' ? 0 : 0.5,
  });
};

await barrel('mousePressed', a9.x, a9.y);
const toolDuring = await page.evaluate(() => window.eval('tool'));
for (let i = 1; i <= 6; i++) await barrel('mouseMoved', a9.x - i * 10, a9.y - i * 6);
const g9b = await geom();
await barrel('mouseReleased', a9.x - 60, a9.y - 36);
await page.waitForTimeout(300);
const toolAfter = await page.evaluate(() => window.eval('tool'));
const ink9b = await ink();

ok(
  '9a. the barrel button arms pan for the press only',
  toolDuring === 'pan' && toolAfter === 'pen',
  `during:${toolDuring} after:${toolAfter}`
);
ok(
  '9b. the barrel drag moved the page',
  Math.abs(g9b.left - g9.left + 60) <= 3 && Math.abs(g9b.top - g9.top + 36) <= 3,
  `moved (${(g9b.left - g9.left).toFixed(1)}, ${(g9b.top - g9.top).toFixed(1)})`
);
ok(
  '9c. the barrel drag left the ink alone',
  ink9b.strokes === ink9.strokes && ink9b.undo === ink9.undo,
  `strokes ${ink9.strokes}->${ink9b.strokes}, undo ${ink9.undo}->${ink9b.undo}`
);

/* ---- 9d: the same press, moved like a scratch-out ----
   Panning back and forth has the turns and the length that the scribble-to-
   erase detector looks for. The detector starts its trail on the capture
   phase, before the engine has resolved the barrel button into a tool, so
   without a guard it would delete whatever the drag covered. */

await rewind();
const ink9c = await ink();
const a9d = await aimPoint();
/* Leftwards and upwards, because rewind() leaves the stage at its origin and a
   drag towards the origin has nowhere to scroll. */
const zig = [];
for (let i = 0; i < 16; i++) zig.push([a9d.x - (i % 2 ? 60 : 0), a9d.y - i * 3]);
const scribBefore = await page.evaluate(() => JSON.stringify((window.__inkpad_scribble || {}).last || null));

await barrel('mousePressed', zig[0][0], zig[0][1]);
for (const [x, y] of zig) {
  await barrel('mouseMoved', x, y);
  await page.waitForTimeout(30);
}
const g9d = await geom();
await barrel('mouseReleased', zig[zig.length - 1][0], zig[zig.length - 1][1]);
await page.waitForTimeout(500);
const ink9d = await ink();
const scribAfter = await page.evaluate(() => JSON.stringify((window.__inkpad_scribble || {}).last || null));

ok(
  '9d. a scratch-shaped pan deletes nothing',
  ink9d.strokes === ink9c.strokes && g9d.left - g9.left < -20 && scribAfter === scribBefore,
  `strokes ${ink9c.strokes}->${ink9d.strokes}, page moved ${(g9d.left - g9.left).toFixed(0)}px, scribble ${scribAfter}`
);

/* ---------------------------------------------------------------- */

const shape = async () => {
  return page.evaluate(() => {
    const b = document.getElementById('bar');
    const all = [...b.querySelectorAll('button[data-t]')];
    const vis = all.filter((x) => getComputedStyle(x).display !== 'none');
    return {
      names: vis.map((x) => x.dataset.t),
      rows: [...new Set(vis.map((x) => Math.round(x.getBoundingClientRect().top)))].length,
      h: Math.round(b.getBoundingClientRect().height),
      tb: Math.round(document.getElementById('tb').getBoundingClientRect().height),
      clip: Math.round(b.scrollWidth) - Math.round(b.clientWidth),
      thin: vis.filter((x) => x.getBoundingClientRect().width < 12).map((x) => x.dataset.t),
    };
  });
};
const withPan = await shape();
await page.evaluate(() => {
  document.querySelector('[data-t="pan"]').style.display = 'none';
});
await page.waitForTimeout(200);
const noPan = await shape();
ok(
  '11. the toolbar is exactly as it was, plus one button',
  withPan.h === noPan.h && withPan.tb === noPan.tb && withPan.rows === 1 && withPan.clip === noPan.clip && withPan.thin.length === 0,
  `${withPan.names.length} tools (was ${noPan.names.length}), rows:${withPan.rows}, bar:${withPan.h}px (was ${noPan.h}), tb:${withPan.tb}px, overflow:${withPan.clip}px`
);
ok(
  '11b. nothing else went missing',
  noPan.names.every((n) => withPan.names.includes(n)) && withPan.names.includes('pan'),
  withPan.names.join(', ')
);

/* ---------------------------------------------------------------- */
/* 10. A second finger during a pan                                   */
/* ---------------------------------------------------------------- */

const pctx = await browser.newContext({
  viewport: { width: 420, height: 900 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
});
const phone = await pctx.newPage();
await phone.route('https://fonts.googleapis.com/**', (r) => r.abort());
await phone.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem('inkpad-tour-editor-v5', '1');
});
const perrors = [];
phone.on('pageerror', (e) => perrors.push(String(e)));
await phone.goto(BASE, { waitUntil: 'domcontentloaded' });
await phone.waitForSelector('#grid', { timeout: 20000 });
await phone.waitForTimeout(1400);
await phone.evaluate(SEED);
await phone.waitForTimeout(1400);
await phone.evaluate(() => {
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove());
  document.querySelector('#bar button[data-t="pan"]').click();
});
await phone.waitForTimeout(300);

const pcdp = await pctx.newCDPSession(phone);
const t = (list) => list.map((p, i) => ({ x: p[0], y: p[1], radiusX: 5, radiusY: 5, force: 0.5, id: p[4] ?? i }));
const touch = (type, list) => pcdp.send('Input.dispatchTouchEvent', { type, touchPoints: t(list) });

const pg0 = await phone.evaluate(() => {
  const c = document.getElementById('cv').getBoundingClientRect();
  const s = document.getElementById('stage');
  s.scrollLeft = 0;
  s.scrollTop = 0;
  window.eval('panX=0;panY=0;placePage()');
  return {
    cx: c.left + c.width / 2,
    cy: c.top + c.height / 2,
    strokes: window.eval('pg().strokes.length'),
    undo: window.eval('undo.length'),
    z: window.eval('z'),
    tool: window.eval('tool'),
  };
});

await touch('touchStart', [[pg0.cx, pg0.cy]]);
for (let i = 1; i <= 5; i++) await touch('touchMove', [[pg0.cx + i * 6, pg0.cy + i * 4]]);
/* second finger: this is where pinch takes over from the pan */
await touch('touchStart', [
  [pg0.cx + 30, pg0.cy + 20],
  [pg0.cx + 90, pg0.cy + 20],
]);
for (let i = 1; i <= 6; i++) {
  await touch('touchMove', [
    [pg0.cx + 30 - i * 6, pg0.cy + 20],
    [pg0.cx + 90 + i * 6, pg0.cy + 20],
  ]);
}
await touch('touchEnd', []);
await phone.waitForTimeout(500);

const pg1 = await phone.evaluate(() => ({
  strokes: window.eval('pg().strokes.length'),
  undo: window.eval('undo.length'),
  z: window.eval('z'),
  pan: window.eval('panDrag'),
  tool: window.eval('tool'),
}));
ok(
  '10. a second finger hands the pan to pinch cleanly',
  pg1.strokes === pg0.strokes && pg1.undo === pg0.undo && pg1.z > pg0.z && pg1.pan === null && pg1.tool === 'pan',
  `strokes ${pg0.strokes}->${pg1.strokes}, undo ${pg0.undo}->${pg1.undo}, z ${pg0.z.toFixed(2)}->${pg1.z.toFixed(2)}, panDrag:${pg1.pan}, tool:${pg1.tool}`
);

/* ---------------------------------------------------------------- */
/* 12. Errors                                                         */
/* ---------------------------------------------------------------- */

ok('12. no page errors', errors.length === 0 && perrors.length === 0, [...errors, ...perrors].join(' | ').slice(0, 200));

await browser.close();
console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
