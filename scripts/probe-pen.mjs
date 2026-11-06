/* Regression probe for the pen / stylus input layer.
 *
 *   node scripts/probe-pen.mjs [baseURL] [tag]
 *
 * Synthetic DOM events cannot exercise this code: the engine calls
 * `setPointerCapture`, which throws on a pointer id the browser has never seen,
 * and `getCoalescedEvents` returns nothing for events it did not create. So the
 * probe drives real input through the DevTools protocol instead —
 * `Input.dispatchMouseEvent` with `pointerType: 'pen'` produces genuine
 * `pointerdown` / `pointermove` / `pointerup` events carrying `pressure`,
 * `tiltX`, `tiltY` and `twist`, and `Input.dispatchTouchEvent` produces real
 * touch pointers with a contact radius.
 *
 * Covers:
 *   1. The module is wired into the engine (PENAPI really was replaced).
 *   2. A pen stroke records pressure, and a pressure ramp produces a taper.
 *   3. Raw pressure is normalised against the device's own observed range.
 *   4. Tilt is derived exactly from tiltX/tiltY, and altitudeAngle wins.
 *   5. Twist is exposed when present and null when the device omits it.
 *   6. A palm landing while the pen is down draws nothing.
 *   7. Touch stays blocked for a moment after the pen lifts, then works again.
 *   8. A palm-sized contact is rejected; a fingertip is not.
 *   9. Two-finger pinch still zooms while palm rejection is armed.
 *  10. Coalesced samples reach the stroke, and no page errors occur.
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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
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
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/fonts\.googleapis|fonts\.gstatic|_vercel\/insights/.test(u)) return;
  errors.push('request failed: ' + u);
});
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
  const n = { id: Date.now(), name: 'Pen', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((n) => n.remove());
});
await page.waitForTimeout(250);

const cdp = await context.newCDPSession(page);

const E = (expr) =>
  page.evaluate((x) => {
    try {
      return eval(x);
    } catch (e) {
      return 'ERR:' + e.message;
    }
  }, expr);

let failed = 0;
const ok = (label, pass, detail = '') => {
  if (pass) console.log(`PASS ${label}${detail ? '  — ' + detail : ''}`);
  else {
    failed++;
    console.log(`FAIL ${label}${detail ? '  — ' + detail : ''}`);
  }
};

/* Page geometry → viewport coordinates. */
const g = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, kx: r.width / 800, ky: r.height / 1100 };
});
const T = (px, py) => [g.x + px * g.kx, g.y + py * g.ky];

/* ---------------------------------------------------------------- */
/* Input drivers                                                     */
/* ---------------------------------------------------------------- */

/** One pen sample. `force` is pressure, `tilt`/`twist` are in degrees. */
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
    tiltX: o.tiltX ?? 0,
    tiltY: o.tiltY ?? 0,
    twist: o.twist ?? 0,
  });
}

/** A full pen stroke through [x, y, force?] triples. */
async function stroke(points, o = {}) {
  const [x0, y0, f0] = points[0];
  await pen('mousePressed', x0, y0, { ...o, force: f0 ?? o.force ?? 0.5 });
  for (let i = 1; i < points.length; i++) {
    const [x, y, f] = points[i];
    await pen('mouseMoved', x, y, { ...o, force: f ?? o.force ?? 0.5 });
  }
  const [xl, yl] = points[points.length - 1];
  await pen('mouseReleased', xl, yl, { ...o, force: 0 });
}

const touchPoints = (list) =>
  list.map((p, i) => ({
    x: p[0],
    y: p[1],
    radiusX: p[2] ?? 5,
    radiusY: p[3] ?? 5,
    force: 0.5,
    id: p[4] ?? i,
  }));

async function touch(type, list) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: touchPoints(list) });
}

const lastStroke = () =>
  E(`(function(){var s=pg().strokes[pg().strokes.length-1];return s?{t:s.t,n:(s.p||[]).length,pr:s.pr,p:(s.p||[]).slice(0,40).map(function(q){return q[2]})}:null})()`);

const undoLen = () => E('undo.length');
const strokeCount = () => E('pg().strokes.length');

/* ---------------------------------------------------------------- */
console.log('\n== 1. The module is wired into the engine');
/* ---------------------------------------------------------------- */

const wired = await E(`(function(){
  var p=window.__slatePen, a=window.PENAPI;
  if(!p||!a)return {ok:0};
  return {ok:1,sameAccept:p.accept===a.accept,sameTilt:p.tilt===a.tilt,samePressure:p.pressure===a.pressure,state:p.state(),mode:p.palmMode()};
})()`);
ok('window.__slatePen is present', wired && wired.ok === 1, JSON.stringify(wired && wired.ok));
ok('PENAPI.accept is the module implementation', !!wired?.sameAccept);
ok('PENAPI.tilt is the module implementation', !!wired?.sameTilt);
ok('PENAPI.pressure is the module implementation', !!wired?.samePressure);
ok('palm mode defaults to automatic', wired?.mode === 'auto', String(wired?.mode));

/* ---------------------------------------------------------------- */
console.log('\n== 2. A pen stroke records pressure');
/* ---------------------------------------------------------------- */

await E(`(function(){tool='pen';var p=document.getElementById('prs');p.value='1';p.dispatchEvent(new Event('change'));draw()})()`);

const ramp = [];
for (let i = 0; i <= 14; i++) {
  const [x, y] = T(120 + i * 22, 260 + i * 6);
  ramp.push([x, y, 0.08 + (i / 14) * 0.9]);
}
await stroke(ramp);
await page.waitForTimeout(300);

const s1 = await lastStroke();
ok('the stroke was committed', s1 && s1.t === 'pen', JSON.stringify(s1 && s1.t));
ok('it recorded a point per sample', s1 && s1.n >= 8, `${s1?.n} points`);
ok('pressure was switched on for the stroke', s1 && s1.pr === 1, `pr=${s1?.pr}`);

const prs = (s1?.p || []).filter((v) => typeof v === 'number');
const pmin = Math.min(...prs);
const pmax = Math.max(...prs);
ok('widths vary with pressure', pmax - pmin > 0.25, `${pmin.toFixed(2)} … ${pmax.toFixed(2)}`);

const prof = await E(`window.__slatePen.profile().pen`);
ok('the device range was learned', prof && prof.variable === true, `lo=${prof?.lo?.toFixed(2)} hi=${prof?.hi?.toFixed(2)} n=${prof?.n}`);
ok('the learned range brackets the ramp', prof && prof.lo <= 0.12 && prof.hi >= 0.9, `${prof?.lo?.toFixed(2)}…${prof?.hi?.toFixed(2)}`);

/* ---------------------------------------------------------------- */
console.log('\n== 3. Pressure normalises against the device range');
/* ---------------------------------------------------------------- */

const norm = await E(`(function(){
  var P=window.__slatePen, pr=P.profile().pen;
  function at(v){return P.normalise('pen',v)}
  return {lo:pr.lo,hi:pr.hi,z:at(pr.lo),mid:at((pr.lo+pr.hi)/2),one:at(pr.hi),over:at(1),under:at(0)};
})()`);
ok('the low end maps to 0', Math.abs(norm.z) < 0.02, String(norm.z));
ok('the midpoint maps to 0.5', Math.abs(norm.mid - 0.5) < 0.06, String(norm.mid?.toFixed(3)));
ok('the high end maps to 1', Math.abs(norm.one - 1) < 0.02, String(norm.one));
ok('values clamp inside 0…1', norm.over <= 1 && norm.under >= 0, `${norm.under} … ${norm.over}`);

const split = await E(`(function(){
  // A pen and a mouse must not share a range: the mouse's constant 0.5 used to
  // drag the pen's span down until every stroke came out flat.
  var P=window.__slatePen, pr=P.profile();
  return {pen:pr.pen.variable,mouse:pr.mouse.variable,penN:pr.pen.n,mouseN:pr.mouse.n};
})()`);
ok('the mouse has its own, separate profile', split.penN > 0 && split.mouseN === 0, `pen n=${split.penN}, mouse n=${split.mouseN}`);

/* ---------------------------------------------------------------- */
console.log('\n== 4. Tilt is derived exactly');
/* ---------------------------------------------------------------- */

const tilt = await E(`(function(){
  var P=window.__slatePen, R=Math.PI/2;
  return {
    upright:P.tilt({pointerType:'pen',tiltX:0,tiltY:0}),
    deg45:P.tilt({pointerType:'pen',tiltX:45,tiltY:0}),
    deg80:P.tilt({pointerType:'pen',tiltX:80,tiltY:0}),
    altPrefers:P.tilt({pointerType:'pen',altitudeAngle:0,tiltX:0,tiltY:0}),
    altUpright:P.tilt({pointerType:'pen',altitudeAngle:R,tiltX:45,tiltY:0}),
    altOf45:P.altitude({pointerType:'pen',tiltX:45,tiltY:0})
  };
})()`);
ok('an upright pen reads 0 tilt', Math.abs(tilt.upright) < 0.01, String(tilt.upright));
ok('45° reads 0.5 tilt', Math.abs(tilt.deg45 - 0.5) < 0.02, String(tilt.deg45?.toFixed(3)));
ok('80° reads about 0.89 tilt', Math.abs(tilt.deg80 - 0.889) < 0.02, String(tilt.deg80?.toFixed(3)));
ok('altitudeAngle is 45° for tiltX=45', Math.abs(tilt.altOf45 - Math.PI / 4) < 0.02, String(tilt.altOf45?.toFixed(3)));
ok('altitudeAngle wins over tiltX', Math.abs(tilt.altUpright) < 0.01, String(tilt.altUpright));

const twist = await E(`(function(){
  var P=window.__slatePen;
  return {none:P.twist({pointerType:'pen'}),q:P.twist({pointerType:'pen',twist:90}),w:P.twist({pointerType:'pen',twist:359})};
})()`);
ok('twist is null when the device omits it', twist.none === null, String(twist.none));
ok('twist 90° becomes π/2', Math.abs(twist.q - Math.PI / 2) < 0.01, String(twist.q?.toFixed(3)));
ok('twist 359° stays near 2π', Math.abs(twist.w - (359 * Math.PI) / 180) < 0.01, String(twist.w?.toFixed(3)));

// End to end: a tilted pen must lay down a wider line than an upright one.
await E(`pg().strokes=[];draw()`);
await stroke(
  [T(120, 400), T(200, 400), T(280, 400), T(360, 400), T(440, 400)].map((p) => [p[0], p[1], 0.5]),
  { tiltX: 0 }
);
await page.waitForTimeout(120);
const flat = await E(`(function(){var s=pg().strokes[pg().strokes.length-1];return s?Math.max.apply(null,s.p.map(function(q){return q[2]})):0})()`);

await E(`pg().strokes=[];draw()`);
await stroke(
  [T(120, 480), T(200, 480), T(280, 480), T(360, 480), T(440, 480)].map((p) => [p[0], p[1], 0.5]),
  { tiltX: 65 }
);
await page.waitForTimeout(120);
const tilted = await E(`(function(){var s=pg().strokes[pg().strokes.length-1];return s?Math.max.apply(null,s.p.map(function(q){return q[2]})):0})()`);
ok('a tilted pen draws wider than an upright one', tilted > flat + 0.05, `${flat?.toFixed(2)} → ${tilted?.toFixed(2)}`);

/* ---------------------------------------------------------------- */
console.log('\n== 5. A palm cannot draw while the pen is down');
/* ---------------------------------------------------------------- */

await E(`pg().strokes=[];undo=[];draw()`);

const [px, py] = T(300, 600);
await pen('mousePressed', px, py, { force: 0.4 });
await page.waitForTimeout(60);
// The pen's own pointerdown pushes the undo entry; the baseline has to be taken
// after it, or the palm looks guilty of a snapshot the pen took.
const before = await undoLen();

// The palm lands mid-stroke, wide and heavy.
const [tx, ty] = T(600, 700);
await touch('touchStart', [[tx, ty, 34, 30, 7]]);
await page.waitForTimeout(120);

const during = await E(`(function(){var p=window.__slatePen.state();return {reason:p.lastReason,penDown:p.penDown,undo:undo.length,cur:cur?cur.t:null}})()`);
ok('the palm was refused', /pen is down/.test(String(during.reason)), String(during.reason));
ok('the refusal is reported as pen-down', during.penDown === true);
ok('the palm started no stroke', during.undo === before, `undo ${before} → ${during.undo}`);
ok('the pen stroke is still the active one', during.cur === 'pen', String(during.cur));

await touch('touchEnd', []);
await pen('mouseReleased', px, py, { force: 0 });
await page.waitForTimeout(200);

/* ---------------------------------------------------------------- */
console.log('\n== 6. Touch stays blocked briefly after the pen lifts');
/* ---------------------------------------------------------------- */

const t1 = await undoLen();
await touch('touchStart', [[...T(500, 300), 5, 5, 8]]);
await touch('touchEnd', []);
await page.waitForTimeout(80);
const blocked = await undoLen();
ok('a touch immediately after lifting is refused', blocked === t1, `undo ${t1} → ${blocked}`);

await page.waitForTimeout(900);
await touch('touchStart', [[...T(520, 320), 5, 5, 9]]);
await page.waitForTimeout(60);
await touch('touchMove', [[...T(560, 340), 5, 5, 9]]);
await touch('touchEnd', []);
await page.waitForTimeout(200);
const afterGrace = await strokeCount();
ok('after the grace period a finger draws again', afterGrace > 0, `${afterGrace} stroke(s)`);

/* ---------------------------------------------------------------- */
console.log('\n== 7. Contact size is used when there is no pen');
/* ---------------------------------------------------------------- */

await E(`pg().strokes=[];undo=[];draw()`);
await page.waitForTimeout(900);

const palmW = await E(`(function(){
  var e={pointerType:'touch',width:60,height:52};
  return {palm:window.__slatePen.palmSized(e),finger:window.__slatePen.palmSized({pointerType:'touch',width:12,height:10}),unknown:window.__slatePen.palmSized({pointerType:'touch',width:1,height:1})};
})()`);
ok('a wide contact is treated as a palm', palmW.palm === true);
ok('a fingertip is not', palmW.finger === false);
ok('an unknown size is never assumed to be a palm', palmW.unknown === false);

const u0 = await undoLen();
await touch('touchStart', [[...T(400, 760), 32, 30, 11]]);
await touch('touchEnd', []);
await page.waitForTimeout(150);
const u1 = await undoLen();
ok('a palm-sized touch draws nothing', u1 === u0, `undo ${u0} → ${u1}`);

/* ---------------------------------------------------------------- */
console.log('\n== 8. Pinch still zooms while palm rejection is armed');
/* ---------------------------------------------------------------- */

await E(`window.__slatePen.setPalmMode('pen')`);
await page.waitForTimeout(80);
const z0 = await E('z');
await touch('touchStart', [
  [...T(300, 500), 5, 5, 21],
  [...T(400, 500), 5, 5, 22],
]);
await touch('touchMove', [
  [...T(240, 500), 5, 5, 21],
  [...T(460, 500), 5, 5, 22],
]);
await page.waitForTimeout(120);
const z1 = await E('z');
await touch('touchEnd', []);
ok('two-finger pinch changes the zoom', Math.abs(z1 - z0) > 0.05, `${z0} → ${z1?.toFixed?.(2)}`);
await E(`window.__slatePen.setPalmMode('auto');z=1;layout();draw()`);

/* ---------------------------------------------------------------- */
console.log('\n== 9. Coalesced samples reach the stroke');
/* ---------------------------------------------------------------- */

await E(`(function(){
  window.__samp=null;
  var cv=document.getElementById('cv');
  cv.addEventListener('pointermove',function(e){ if(e.pointerType!=='pen')return; window.__samp=window.__slatePen.samples(e); },{once:true});
  tool='pen';draw();
})()`);

await stroke([T(120, 900), T(160, 900), T(200, 900), T(240, 900), T(280, 900)]);
await page.waitForTimeout(200);
const samp = await E(`(function(){var s=window.__samp;if(!s)return null;return {n:s.length,ids:s.map(function(q){return q.pointerId}),sorted:s.every(function(q,i){return i===0||q.timeStamp>=s[i-1].timeStamp})}})()`);
ok('samples() returns a non-empty list', samp && samp.n >= 1, `${samp?.n} sample(s)`);
ok('every sample belongs to the same pointer', samp && new Set(samp.ids).size === 1, JSON.stringify(samp?.ids));
ok('samples are in time order', !!samp?.sorted);

const syn = await E(`(function(){
  var e=new PointerEvent('pointermove',{pointerId:3});
  var s=window.__slatePen.samples(e);
  return {n:s.length,same:s[0]===e};
})()`);
ok('a synthetic event falls back to itself', syn.n === 1 && syn.same === true);

// The real digitiser folds several samples into one event; CDP does not, so the
// filter is exercised against a hand-built list. It must drop a foreign pointer
// id and an out-of-order sample, and keep the rest.
const filt = await E(`(function(){
  var e={pointerId:1,timeStamp:100,clientX:9,clientY:9};
  e.getCoalescedEvents=function(){return [
    {pointerId:1,timeStamp:90,clientX:7,clientY:7},
    {pointerId:2,timeStamp:95,clientX:8,clientY:8},
    {pointerId:1,timeStamp:80,clientX:6,clientY:6},
    {pointerId:1,timeStamp:100,clientX:9,clientY:9}
  ]};
  var s=window.__slatePen.samples(e);
  return {n:s.length,ts:s.map(function(q){return q.timeStamp})};
})()`);
ok('a foreign pointer id is dropped', filt.n === 2, `${filt.n} kept`);
ok('an out-of-order sample is dropped', JSON.stringify(filt.ts) === '[90,100]', JSON.stringify(filt.ts));

/* ---------------------------------------------------------------- */
console.log('\n== 10. Pen panel exposes the new controls');
/* ---------------------------------------------------------------- */

await E(`(function(){try{openPenPanel()}catch(e){}})()`);
await page.waitForTimeout(500);
const panel = await E(`(function(){
  var sel=document.getElementById('pen-palm');
  return {sel:!!sel,value:sel?sel.value:null,recal:!!document.getElementById('pen-recal'),pad:!!document.getElementById('pen-pad')};
})()`);
ok('the palm mode select exists', panel.sel === true);
ok('it shows the current mode', panel.value === 'auto', String(panel.value));
ok('the recalibrate control exists', panel.recal === true);

// The controls existing in the DOM is not the same as the sheet opening: a
// throw part-way through openPenPanel leaves them built but the modal hidden.
const shown = await E(`(function(){
  var m=document.getElementById('pen-md');
  return !!m && m.classList.contains('on') && getComputedStyle(m).display!=='none';
})()`);
ok('the sheet actually opens', shown === true);

// The toolbar's "Pen only" checkbox and the panel select are one setting, and
// the checkbox also decides whether touch may scroll the page.
await E(`(function(){var c=document.getElementById('po');c.checked=true;c.dispatchEvent(new Event('change'))})()`);
const m1 = await E(`window.__slatePen.palmMode()`);
const ta1 = await E(`document.getElementById('cv').style.touchAction`);
ok('the toolbar checkbox switches to pen-only', m1 === 'pen', String(m1));
ok('pen-only hands touch back to the browser for scrolling', /pan/.test(String(ta1)), String(ta1));

await E(`(function(){var c=document.getElementById('po');c.checked=false;c.dispatchEvent(new Event('change'))})()`);
const m2 = await E(`window.__slatePen.palmMode()`);
const ta2 = await E(`document.getElementById('cv').style.touchAction`);
ok('unchecking it returns to automatic', m2 === 'auto', String(m2));
ok('the canvas takes the gesture back', ta2 === 'none', String(ta2));

await page.screenshot({ path: shot('pen-panel.png') });

/* ---------------------------------------------------------------- */
console.log('\n== 11. No page errors');
/* ---------------------------------------------------------------- */

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
