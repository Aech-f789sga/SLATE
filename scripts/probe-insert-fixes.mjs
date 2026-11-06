/* Regression probe for the three UI/graphics fixes:
 *
 *   1. Toolbar Customization (and every other child sheet) must not overlap the
 *      Accessories menu.
 *   2. The page-bar fold chevron must sit in the bottom-right corner, BELOW the
 *      tour '?' icon, and must fold/unfold the bar without disappearing.
 *   3. Circle / ellipse / polygon must grow outwards from their CENTRE, and a
 *      rotation applied while the pointer is held must survive onto the
 *      committed stroke (and be reflected in hit-testing).
 *
 *   node scripts/probe-insert-fixes.mjs [baseURL] [tag]
 *
 * Defaults to the local dev server. Passing the deployed URL + a tag (e.g.
 * "live") runs the exact same interactions against production and suffixes the
 * screenshots so the local baselines are not overwritten.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
const TAG = process.argv[3] || '';
const shotsDir = fileURLToPath(new URL('../shots/', import.meta.url));
fs.mkdirSync(shotsDir, { recursive: true });
const shot = (name) => path.join(shotsDir, name.replace(/\.png$/, (TAG ? `-${TAG}` : '') + '.png'));
console.log(`target: ${BASE}`);

const VW = 1440;
const VH = 900;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/fonts\.googleapis|fonts\.gstatic|_vercel\/insights/.test(u)) return;
  errors.push('request failed: ' + u);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/net::ERR_FAILED/.test(t)) return; // deliberately aborted web fonts
  errors.push(t);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1100);
await page.evaluate(() => {
  const n = {
    id: Date.now(),
    name: 'Insert fixes',
    upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(900);
// Keep #tour-fab! Only the intro / tour overlay is in the way of these tests.
await page.evaluate(() => {
  const skip = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  skip?.click();
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((n) => n.remove());
});
await page.waitForTimeout(450);

const E = (expr) =>
  page.evaluate((x) => {
    try {
      return eval(x);
    } catch (e) {
      return 'ERR:' + e.message;
    }
  }, expr);

let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};
const rect = (sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n || getComputedStyle(n).display === 'none') return null;
    const r = n.getBoundingClientRect();
    return {
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
    };
  }, sel);
const area = (a, b) =>
  a && b
    ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y))
    : -1;
const onScreen = (r, vw, vh) =>
  !!r && r.x >= -1 && r.y >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1 && r.w > 24 && r.h > 24;

/* ------------------------------------------------------------------ */
console.log('\n== 1. Accessories child sheets never cover the menu');
await page.evaluate(() => document.getElementById('acc-trigger').click());
await page.waitForTimeout(300);
const pop = await rect('#acc-pop');
ok('accessories menu is open and on screen', onScreen(pop, VW, VH), JSON.stringify(pop));

const SHEETS = [
  ['tools', '#acc-tools'],
  ['smart', '#acc-smart'],
  ['snap', '#acc-snap'],
  ['media', '#acc-media'],
];
for (const [id, sel] of SHEETS) {
  await page.evaluate((k) => document.querySelector(`.acc-item[data-acc="${k}"]`).click(), id);
  await page.waitForTimeout(180);
  const r = await rect(sel);
  const m = await rect('#acc-pop');
  const o = area(m, r);
  ok(`${id} sheet visible and on screen`, onScreen(r, VW, VH), JSON.stringify(r));
  ok(`${id} sheet does not overlap #acc-pop (${o} px²)`, o === 0, String(o));
}

// The whole point of the fix: the menu rows must still be hittable.
await page.evaluate(() => document.querySelector('.acc-item[data-acc="tools"]').click());
await page.waitForTimeout(180);
const hit = await page.evaluate(() => {
  const row = document.querySelector('.acc-item[data-acc="smart"]');
  const r = row.getBoundingClientRect();
  const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { tag: e?.tagName, inMenu: !!(e && e.closest('#acc-pop')), inSheet: !!(e && e.closest('#acc-tools')) };
});
ok('menu row is clickable while the tools sheet is open', hit.inMenu && !hit.inSheet, JSON.stringify(hit));
await page.screenshot({ path: shot('insert-fixes-acc.png') });

// Narrow viewport: neither side fits, so the placer must hide the menu instead
// of stacking the sheet on top of it.
await page.setViewportSize({ width: 900, height: 700 });
await page.waitForTimeout(320);
await page.evaluate(() => window.__inkpad_acc?.place?.());
await page.waitForTimeout(160);
const narrowPop = await rect('#acc-pop');
const narrowTools = await rect('#acc-tools');
ok('narrow viewport: no overlap either', area(narrowPop, narrowTools) === 0,
  `pop=${JSON.stringify(narrowPop)} tools=${JSON.stringify(narrowTools)}`);
ok('narrow viewport: tools sheet still on screen', onScreen(narrowTools, 900, 700), JSON.stringify(narrowTools));
await page.setViewportSize({ width: VW, height: VH });
await page.waitForTimeout(320);
await page.evaluate(() => window.__inkpad_acc?.place?.());
await page.waitForTimeout(160);

/* ------------------------------------------------------------------ */
console.log('\n== 2. Page-bar fold below the tour icon');
await page.evaluate(() => {
  document.getElementById('acc-trigger').click();
  window.__inkpad_pgfold?.place?.();
});
await page.waitForTimeout(250);
const pg = await rect('#pg');
const fold = await rect('#pg-fold');
const fab = await rect('#tour-fab');
console.log('#pg       ', JSON.stringify(pg));
console.log('#pg-fold  ', JSON.stringify(fold));
console.log('#tour-fab ', JSON.stringify(fab));
ok('tour icon is visible', onScreen(fab, VW, VH), JSON.stringify(fab));
ok('fold is visible', !!fold && fold.w >= 24 && fold.h >= 24, JSON.stringify(fold));
ok('fold is fixed to the viewport', await page.evaluate(() => getComputedStyle(document.getElementById('pg-fold')).position === 'fixed'));
ok('fold is in the bottom-right corner', !!fold && VW - fold.right < 60 && VH - fold.bottom < 80, JSON.stringify(fold));
ok('fold is BELOW the tour icon', !!fold && !!fab && fold.y >= fab.bottom - 2, `fold.y=${fold?.y} fab.bottom=${fab?.bottom}`);
ok('fold is horizontally aligned with the tour icon', !!fold && !!fab &&
  Math.abs((fold.x + fold.w / 2) - (fab.x + fab.w / 2)) < 24,
  `fold=${fold && fold.x + fold.w / 2} fab=${fab && fab.x + fab.w / 2}`);
ok('fold is a child of #pg (inherits editor visibility)', await page.evaluate(() => document.getElementById('pg-fold')?.parentElement?.id === 'pg'));
const clickable = await page.evaluate(() => {
  const b = document.getElementById('pg-fold');
  const r = b.getBoundingClientRect();
  const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!(e && (e === b || b.contains(e)));
});
ok('fold is not covered by another control', clickable);

const hExpanded = pg?.h ?? 0;
await page.evaluate(() => document.getElementById('pg-fold').click());
await page.waitForTimeout(220);
const folded = await page.evaluate(() => ({
  min: document.documentElement.dataset.pgMin,
  addHidden: getComputedStyle(document.getElementById('add')).display === 'none',
  foldVisible: getComputedStyle(document.getElementById('pg-fold')).display !== 'none',
  h: document.getElementById('pg').getBoundingClientRect().height,
}));
ok('clicking folds the page controls', folded.min === '1' && folded.addHidden, JSON.stringify(folded));
ok('folded bar gives its height back to the canvas', folded.h < hExpanded, `${folded.h} < ${hExpanded}`);
ok('fold control stays visible when folded', folded.foldVisible);
await page.screenshot({ path: shot('insert-fixes-fold.png') });
await page.evaluate(() => document.getElementById('pg-fold').click());
await page.waitForTimeout(220);
ok('clicking again restores the page controls', await E('document.documentElement.dataset.pgMin') === '0' &&
  await page.evaluate(() => getComputedStyle(document.getElementById('add')).display !== 'none'));

/* ------------------------------------------------------------------ */
console.log('\n== 3. Centre-out insertion for circle / ellipse / polygon');
const geom = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  let W = 800, H = 1100;
  try { W = eval('W'); H = eval('H'); } catch (e) { /* defaults */ }
  return { x: r.x, y: r.y, w: r.width, h: r.height, kx: r.width / W, ky: r.height / H };
});
// A band of the canvas that is actually visible and clear of the toolbar,
// the shape style panel and the bottom page bar.
const safe = {
  x0: Math.max(geom.x + 30, 40),
  x1: Math.min(geom.x + geom.w - 30, VW - 40),
  y0: Math.max(geom.y + 30, 220),
  y1: Math.min(geom.y + geom.h - 30, VH - 150),
};
console.log('canvas', JSON.stringify(geom), 'safe', JSON.stringify(safe));
ok('canvas has a usable drawing band', safe.x1 - safe.x0 > 300 && safe.y1 - safe.y0 > 260, JSON.stringify(safe));
const P = (fx, fy) => [
  safe.x0 + (safe.x1 - safe.x0) * fx,
  safe.y0 + (safe.y1 - safe.y0) * fy,
];
const toPage = ([cx, cy]) => [(cx - geom.x) / geom.kx, (cy - geom.y) / geom.ky];

async function pick(kind) {
  await page.evaluate(() => document.getElementById('sh-trigger').click());
  await page.waitForTimeout(140);
  await page.click(`#sh-pick .sh-pb[data-kind="${kind}"]`);
  await page.waitForTimeout(160);
}

async function radial(kind, fx, fy, dx, dy) {
  await pick(kind);
  const [cx, cy] = P(fx, fy);
  const [hx, hy] = [cx + dx, cy + dy];
  const centre = toPage([cx, cy]);
  const handle = toPage([hx, hy]);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(hx, hy, { steps: 12 });
  const live = await E('cur && ({k:cur.k,a:cur.a,b:cur.b,r:cur.r||0,poly:cur.poly&&cur.poly.length,el:!!cur.el})');
  const state = await E('window.__inkpad_shape.insert()');
  await page.mouse.up();
  await page.waitForTimeout(280);
  const made = await E(
    '(()=>{const s=pg().strokes[pg().strokes.length-1];return {t:s.t,k:s.k,a:s.a,b:s.b,r:s.r||0,poly:s.poly&&s.poly.length,el:!!s.el}})()'
  );
  return { centre, handle, live, state, made };
}

const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;
const centreOf = (s) => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
const dPage = (c, h) => Math.hypot(h[0] - c[0], h[1] - c[1]);

for (const [kind, fx, fy] of [['circle', 0.22, 0.18], ['ell', 0.62, 0.18], ['poly', 0.38, 0.62]]) {
  const r = await radial(kind, fx, fy, 90, 60);
  const c = r.centre;
  const lc = centreOf(r.live);
  const mc = centreOf(r.made);
  ok(`${kind}: live box is centred on the press point`, near(lc[0], c[0]) && near(lc[1], c[1]),
    `live=${JSON.stringify(lc)} press=${JSON.stringify(c)}`);
  ok(`${kind}: committed box is centred on the press point`, near(mc[0], c[0]) && near(mc[1], c[1]),
    `made=${JSON.stringify(mc)} press=${JSON.stringify(c)}`);
  ok(`${kind}: grows outwards in BOTH axes`, r.made.a[0] < c[0] && r.made.b[0] > c[0] &&
    r.made.a[1] < c[1] && r.made.b[1] > c[1], JSON.stringify(r.made));
  if (kind === 'ell') {
    const hw = (r.made.b[0] - r.made.a[0]) / 2;
    const hh = (r.made.b[1] - r.made.a[1]) / 2;
    const dx = Math.abs(r.handle[0] - c[0]);
    const dy = Math.abs(r.handle[1] - c[1]);
    ok('ell: half-axes follow the drag without degenerating',
      hw >= dx - 1 && hh >= dy - 1 && hh > 20, `hw=${hw} hh=${hh} dx=${dx} dy=${dy}`);
  } else {
    ok(`${kind}: radius follows the drag distance`,
      Math.abs((r.made.b[0] - r.made.a[0]) / 2 - dPage(c, r.handle)) < 4,
      `r=${(r.made.b[0] - r.made.a[0]) / 2} drag=${dPage(c, r.handle)}`);
  }
  ok(`${kind}: kind and derived geometry survive release`,
    r.made.k === kind && (r.made.el === true || r.made.poly >= 3), JSON.stringify(r.made));
  ok(`${kind}: a straight drag stays unrotated`, Math.abs(r.made.r) < 0.01, String(r.made.r));
  ok(`${kind}: insert state records the press point as rawA`, !!r.state.rawA &&
    near(r.state.rawA[0], c[0]) && near(r.state.rawA[1], c[1]), JSON.stringify(r.state));
  ok(`${kind}: insert state resolves the active kind`, r.state.kind === kind, JSON.stringify(r.state));
}

// A rectangle must keep the OLD corner-to-corner behaviour — the fix is scoped
// to the three radial figures, not to every shape tool.
await pick('rect');
{
  const [cx, cy] = P(0.72, 0.66);
  const [hx, hy] = [cx + 90, cy + 60];
  const press = toPage([cx, cy]);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(hx, hy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(280);
  const made = await E('(()=>{const s=pg().strokes[pg().strokes.length-1];return {k:s.k,a:s.a,b:s.b}})()');
  ok('rect still starts at the press CORNER (regression guard)',
    made.k === 'rect' && near(made.a[0], press[0], 2) && near(made.a[1], press[1], 2),
    `a=${JSON.stringify(made.a)} press=${JSON.stringify(press)}`);
}
await page.screenshot({ path: shot('insert-fixes-shapes.png') });

/* ------------------------------------------------------------------ */
console.log('\n== 4. Live rotation survives release and hit-testing');
await pick('poly');
{
  const [cx, cy] = P(0.5, 0.36);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // First outward move fixes the base direction; the second is a 90° twist.
  await page.mouse.move(cx + 100, cy, { steps: 12 });
  await page.waitForTimeout(60);
  await page.mouse.move(cx, cy + 100, { steps: 14 });
  await page.waitForTimeout(120);
  const live = await E('cur && ({k:cur.k,r:cur.r||0,a:cur.a,b:cur.b})');
  const st = await E('window.__inkpad_shape.insert()');
  ok('pointer twist rotates the live preview', Math.abs(live.r) > 1.0, JSON.stringify(live));
  ok('twist is recorded in insert state', Math.abs(st.twistRot) > 1.0, JSON.stringify(st));

  // Device orientation is a second, independent rotation source.
  await page.evaluate(() => {
    const fire = (gamma) => {
      const e = new Event('deviceorientation');
      Object.defineProperty(e, 'gamma', { value: gamma });
      window.dispatchEvent(e);
    };
    fire(0);
    fire(30);
  });
  await page.waitForTimeout(120);
  const st2 = await E('window.__inkpad_shape.insert()');
  ok('deviceorientation adds rotation while held', Math.abs(st2.deviceRot) > 0.2, JSON.stringify(st2));
  const live2 = await E('cur && ({r:cur.r||0})');
  ok('device rotation reaches the live stroke', Math.abs(live2.r - live.r) > 0.2,
    `before=${live.r} after=${live2.r}`);

  await page.mouse.up();
  await page.waitForTimeout(320);
  const made = await E(
    '(()=>{const s=pg().strokes[pg().strokes.length-1];return {k:s.k,r:s.r||0,a:s.a,b:s.b,poly:s.poly&&s.poly.length}})()'
  );
  ok('committed polygon keeps its rotation', Math.abs(made.r) > 1.0, JSON.stringify(made));
  ok('committed rotation matches the release angle', Math.abs(made.r - st2.rot) < 0.05,
    `made=${made.r} live=${st2.rot}`);
  const pts = await E(
    '(()=>{const s=pg().strokes[pg().strokes.length-1];const P=window.__shapeOutline(s)[0],Q=shapePts(s)[0];return {P,Q,d:Math.hypot(Q[0]-P[0],Q[1]-P[1])}})()'
  );
  ok('hit-testing points are rotated with the drawing', pts.d > 20, JSON.stringify(pts));
  await page.screenshot({ path: shot('insert-fixes-rotation.png') });
}

/* ------------------------------------------------------------------ */
console.log('\n== 5. Page errors');
ok('no page errors', errors.length === 0, errors.join(' | ') || '(none)');

await browser.close();
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed ? 1 : 0);
