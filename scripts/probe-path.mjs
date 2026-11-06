/* Regression probe for the Bend Line path tool and selection properties.
 *
 *   node scripts/probe-path.mjs [baseURL] [tag]
 *
 * Covers:
 *   1. The Curves picker offers Bend Line and Elbow Line next to Curvable Line.
 *   2. Drawing a Bend Line commits a real `path` stroke with normalised nodes.
 *   3. Pressing anywhere along it adds a bend THERE (not only at the midpoint),
 *      and the curve passes through the dragged point.
 *   4. Dragging an existing node moves that node.
 *   5. Double-clicking a node sharpens / rounds it.
 *   6. Round / Rounded / Sharp produce three visually distinct lines.
 *   7. The elbow preset starts perpendicular with three nodes.
 *   8. One undo entry per gesture, and undo restores the node count.
 *   9. A selected path still resizes through the engine (nodes are normalised).
 *  10. Selection weight and colour controls act on the selection, with undo.
 *  11. No page errors.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
const TAG = process.argv[3] || '';
const shotsDir = fileURLToPath(new URL('../shots/', import.meta.url));
const shot = (name) => path.join(shotsDir, name.replace(/\.png$/, (TAG ? `-${TAG}` : '') + '.png'));
console.log(`target: ${BASE}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.addInitScript(() => {
  try {
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
  } catch {
    /* private mode */
  }
});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/net::ERR_FAILED/.test(t)) return;
  errors.push(t);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1100);
await page.evaluate(() => {
  const n = {
    id: Date.now(),
    name: 'Path',
    upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((n) => n.remove());
});
await page.waitForTimeout(200);

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

const geom = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.x, y: r.y, kx: r.width / 800, ky: r.height / 1100 };
});
const S = (x, y) => [geom.x + x * geom.kx, geom.y + y * geom.ky];

const pageSig = async () =>
  crypto.createHash('sha1').update(await page.locator('#cv').screenshot()).digest('hex').slice(0, 12);

const clearPage = () => page.evaluate(() => {
  pg().strokes.length = 0;
  sel = [];
  draw();
});

const last = () => E(`(function(){var s=pg().strokes;return s[s.length-1]})()`);
const selectLast = () =>
  page.evaluate(() => {
    const st = eval('pg().strokes');
    const s = st[st.length - 1];
    eval('(function(x){ sel=[x]; tool="sel"; draw(); syncTools(); })')(s);
  });

/** Drag from a page point to another page point. */
async function drag(from, to, steps = 8) {
  await page.mouse.move(...S(from[0], from[1]));
  await page.mouse.down();
  await page.mouse.move(...S(to[0], to[1]), { steps });
  await page.mouse.up();
  await page.waitForTimeout(220);
}

/* ================================================================== */
console.log('\n== 1. Curves picker');
const picks = await E(
  `Array.from(document.querySelectorAll('#sh-pick .sh-pg.sh-wide .sh-pb')).map(b=>b.dataset.pathkind||b.dataset.kind)`
);
ok('Bend Line and Elbow Line join Curvable Line', JSON.stringify(picks) === '["qcurve","path","elbow"]', JSON.stringify(picks));

/* ================================================================== */
console.log('\n== 2. Drawing a Bend Line');
await clearPage();
await page.evaluate(() => window.__slatePath.arm('path'));
await drag([140, 430], [660, 410], 10);

const drawn = await last();
ok('commits a path stroke', drawn && drawn.k === 'path', drawn && drawn.k);
ok('has two nodes, both smooth', Array.isArray(drawn.poly) && drawn.poly.length === 2 && drawn.poly.every((q) => q[2] === 1), JSON.stringify(drawn.poly));
ok('nodes are normalised 0…1', drawn.poly.every((q) => q[0] >= 0 && q[0] <= 1 && q[1] >= 0 && q[1] <= 1));
ok('the path keeps the ink it was drawn with', drawn.w > 0 && !!drawn.c, `w=${drawn.w} c=${drawn.c}`);

const sampled = await E(`__slatePath.sample(__slatePath.target()||pg().strokes[pg().strokes.length-1]).length`);
ok('samples to a dense polyline', sampled > 40, `${sampled} points`);

/* ================================================================== */
console.log('\n== 3. Bending anywhere along the line');
await selectLast();
await page.waitForTimeout(400);
const beforeSig = await pageSig();

// 25 % along the line, deliberately away from the midpoint.
const quarter = await page.evaluate(() => {
  const S = window.__slatePath;
  const pts = S.sample(S.target());
  return pts[Math.floor(pts.length * 0.25)];
});
await drag([quarter[0], quarter[1]], [quarter[0] + 10, quarter[1] - 120], 10);

const bent = await last();
ok('a bend point was added', bent.poly.length === 3, `${bent.poly.length} nodes`);
const bendNodes = await E(`__slatePath.nodes(__slatePath.target())`);
const dragTarget = [quarter[0] + 10, quarter[1] - 120];
const nearBend = Math.min(...bendNodes.map((n) => Math.hypot(n.p[0] - dragTarget[0], n.p[1] - dragTarget[1])));
ok('the new point landed where the press was', nearBend < 12, `${nearBend.toFixed(1)} units from the drag target`);

// The curve must actually pass through that point, not just hold a control.
const curveGap = await page.evaluate((t) => {
  const S = window.__slatePath;
  const pts = S.sample(S.target());
  return Math.min(...pts.map((p) => Math.hypot(p[0] - t[0], p[1] - t[1])));
}, dragTarget);
ok('the drawn curve passes through the dragged point', curveGap < 6, `${curveGap.toFixed(2)} units`);
ok('the line visibly changed', (await pageSig()) !== beforeSig);

/* ================================================================== */
console.log('\n== 4. Dragging an existing node');
const nodeCount = await E(`document.querySelectorAll('.pl-node').length`);
const visHandles = await page.evaluate(
  () => Array.from(document.querySelectorAll('.pl-node')).filter((n) => getComputedStyle(n).display !== 'none').length
);
ok('one handle per interior bend point', nodeCount === 3 && visHandles === 1, `${visHandles} visible of ${nodeCount} nodes`);

const h1 = await page.locator('.pl-node').nth(1).boundingBox();
await page.mouse.move(h1.x + h1.width / 2, h1.y + h1.height / 2);
await page.mouse.down();
await page.mouse.move(h1.x + h1.width / 2 + 70, h1.y + h1.height / 2 - 40, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);

const moved = await E(`__slatePath.nodes(__slatePath.target())[1].p`);
const movedDelta = Math.hypot(moved[0] - dragTarget[0], moved[1] - dragTarget[1]);
ok('the node followed the pointer', movedDelta > 30, `${movedDelta.toFixed(1)} units moved`);

/* ================================================================== */
console.log('\n== 5. Double-click sharpens a node');
const smBefore = await E(`__slatePath.nodes(__slatePath.target())[1].sm`);
await page.locator('.pl-node').nth(1).dblclick({ force: true });
await page.waitForTimeout(250);
const smAfter = await E(`__slatePath.nodes(__slatePath.target())[1].sm`);
ok('double-click flips the corner style', smBefore !== smAfter, `${smBefore} → ${smAfter}`);

/* ================================================================== */
console.log('\n== 6. Round / Rounded / Sharp');
const modes = {};
for (const m of ['round', 'rounded', 'sharp']) {
  await page.evaluate((x) => window.__slatePath.setCorners(x), m);
  await page.waitForTimeout(220);
  modes[m] = { sig: await pageSig(), mode: await E(`__slatePath.cornerMode()`) };
}
ok('each corner mode reports itself', modes.round.mode === 'round' && modes.rounded.mode === 'rounded' && modes.sharp.mode === 'sharp', JSON.stringify(Object.fromEntries(Object.entries(modes).map(([k, v]) => [k, v.mode]))));
const sigs = new Set([modes.round.sig, modes.rounded.sig, modes.sharp.sig]);
ok('the three modes render differently', sigs.size === 3, `${sigs.size} distinct of 3`);

const btnOn = await page.evaluate(() => {
  const on = Array.from(document.querySelectorAll('#pl-panel button[data-corner].on')).map((b) => b.dataset.corner);
  return on;
});
ok('exactly one corner button is active', btnOn.length === 1, JSON.stringify(btnOn));

/* ================================================================== */
console.log('\n== 7. Elbow preset');
await clearPage();
await page.evaluate(() => window.__slatePath.arm('elbow'));
await drag([200, 300], [520, 560], 10);
const elbow = await last();
ok('elbow commits as a path', elbow.k === 'path');
ok('elbow has a perpendicular corner', elbow.poly.length === 3 && elbow.poly[1][2] === 0, JSON.stringify(elbow.poly));
const corner = await E(`__slatePath.nodes(pg().strokes[pg().strokes.length-1])[1].p`);
ok('the corner sits at the right angle', Math.abs(corner[0] - 520) < 4 && Math.abs(corner[1] - 300) < 4, `corner ${corner.map((n) => n.toFixed(1))}`);

/* ================================================================== */
console.log('\n== 8. Undo');
await selectLast();
await page.waitForTimeout(300);
const undoBefore = await E('undo.length');
const nodesBefore = await E(`__slatePath.nodes(__slatePath.target()).length`);
await page.evaluate(() => window.__slatePath.setCorners('sharp'));
await page.waitForTimeout(200);
const undoAfter = await E('undo.length');
ok('a corner change is exactly one undo step', undoAfter === undoBefore + 1, `${undoBefore} → ${undoAfter}`);
await page.evaluate(() => document.getElementById('undo').click());
await page.waitForTimeout(300);
const restored = await E(`__slatePath.nodes(pg().strokes[pg().strokes.length-1]).length`);
ok('undo keeps the node count', restored === nodesBefore, `${nodesBefore} → ${restored}`);

/* ================================================================== */
console.log('\n== 9. A path still resizes through the engine');
const box = await E(`(function(){var s=pg().strokes[pg().strokes.length-1];return {a:s.a,b:s.b,n:s.poly.length,w:s.w}})()`);
await selectLast();
await page.waitForTimeout(300);
// The box CORNER: endpoints carry no node handle, so the corner is free to
// resize the whole path about the opposite corner.
await drag([box.b[0], box.b[1]], [box.b[0] - 150, box.b[1] - 130], 10);
const resized = await E(`(function(){var s=pg().strokes[pg().strokes.length-1];return {a:s.a,b:s.b,n:s.poly.length,w:s.w}})()`);
const shrank = resized.b[0] - resized.a[0] < box.b[0] - box.a[0] - 40;
ok('the box shrank with the handle', shrank, `${(box.b[0] - box.a[0]).toFixed(0)} → ${(resized.b[0] - resized.a[0]).toFixed(0)}`);
ok('normalised nodes survive the resize', resized.n === box.n, `${box.n} → ${resized.n}`);
ok('stroke weight scales with the box', resized.w < box.w, `${box.w} → ${resized.w}`);

/* ================================================================== */
console.log('\n== 10. Selection weight and colour');
await clearPage();
await page.evaluate(() => window.__slatePath.arm('path'));
await drag([200, 400], [600, 400], 8);
await selectLast();
await page.waitForTimeout(400);

ok('the properties cluster is in the selection bar', await page.evaluate(() => !!document.querySelector('#sbar #ss-cluster')));
ok('it reports the stroke weight', (await E(`document.querySelector('#ss-cluster .ss-w').textContent`)) !== '—');

const w0 = await E(`pg().strokes[pg().strokes.length-1].w`);
await page.locator('#ss-cluster .ss-step[data-step="1"]').click();
await page.waitForTimeout(200);
const w1 = await E(`pg().strokes[pg().strokes.length-1].w`);
ok('+ thickens the selection', w1 > w0, `${w0} → ${w1}`);

const undoW = await E('undo.length');
await page.locator('#ss-cluster .ss-step[data-step="-1"]').click();
await page.waitForTimeout(200);
const w2 = await E(`pg().strokes[pg().strokes.length-1].w`);
ok('− thins it back', w2 < w1, `${w1} → ${w2}`);
ok('each click is one undo step', (await E('undo.length')) === undoW + 1);

const c0 = await E(`pg().strokes[pg().strokes.length-1].c`);
await page.evaluate(() => window.__slateSelStyle.setColor('#c2185b'));
await page.waitForTimeout(200);
const c1 = await E(`pg().strokes[pg().strokes.length-1].c`);
ok('colour applies to the selection', c1 === '#c2185b', `${c0} → ${c1}`);
ok('the swatch reflects it', (await E(`document.querySelector('#ss-cluster .ss-swatch').style.background`)).length > 0);

await page.evaluate(() => document.getElementById('undo').click());
await page.waitForTimeout(250);
ok('undo restores the old colour', (await E(`pg().strokes[pg().strokes.length-1].c`)) === c0);

// text must not be treated as a stroke weight
await clearPage();
await page.evaluate(() => {
  eval('(function(){ var it={t:"text",c:"#111",s:28,x:200,y:300,txt:"Weight is not font size",f:"inter",w:180}; pg().strokes.push(it); sel=[it]; tool="sel"; draw(); syncTools(); })()');
});
await page.waitForTimeout(350);
ok('text is excluded from the weight control', (await E(`__slateSelStyle.weightTargets()`)) === 0);
ok('but text still takes a colour', (await E(`__slateSelStyle.colorTargets()`)) === 1);

/* ================================================================== */
console.log('\n== 11. Page errors');
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.screenshot({ path: shot('path-line.png') });
console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}  (${BASE})`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
