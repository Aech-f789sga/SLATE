/* Regression probe for the surface-haptics layer.
 *
 *   node scripts/probe-haptics.mjs [baseURL] [tag]
 *
 * Headless Chromium has no vibration motor and, on the desktop, no
 * `navigator.vibrate` at all — so the probe installs a recorder in place of the
 * real API before the page boots. That matters: it exercises the genuine call
 * path (support detection, the pattern builder, the watchdog, the presets)
 * rather than a test-only branch, and it lets the assertions target the thing
 * that actually decides whether a phone feels anything: the SHAPE of the
 * pattern handed to the motor, and when it is sent.
 *
 * The first version of this module called `vibrate(7)` once per tick, which
 * tested green and produced nothing on hardware — too many round trips, pulses
 * too short for an OEM motor. These assertions exist so that cannot regress
 * silently: they check that each call is a long pattern, not a single blip.
 *
 * Input is driven through the DevTools protocol, because the engine calls
 * `setPointerCapture` and synthetic events cannot survive that.
 *
 * Covers:
 *   1. The module replaced the shim, and starts OFF.
 *   2. A stroke sends a pattern array with pulses a motor can resolve.
 *   3. A long stroke keeps the pattern refreshed.
 *   4. A motionless pen is cut off, and moving again resumes it.
 *   5. Light < medium < firm, in that order.
 *   6. Off is silent, and so is a mouse.
 *   7. Shapes and selections do not buzz.
 *   8. A finger buzzes too.
 *   9. The panel select, Test button and status line.
 *  10. Without the API the row is disabled and explains itself.
 *  11. No page errors.
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

/** Shared boot: tour flags off, plus a recorder standing in for the motor. */
const initScript = () => {
  try {
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
  } catch {
    /* private mode */
  }
  window.__vib = [];
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: (p) => {
      window.__vib.push({ p, at: performance.now() });
      return true;
    },
  });
};

async function open(target) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.addInitScript(initScript);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(target || BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    const n = { id: Date.now(), name: 'Haptics', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
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

/* ---------------------------------------------------------------- */
/* Input drivers                                                     */
/* ---------------------------------------------------------------- */

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

/** a→b in `steps` samples, optionally pausing between them. */
async function drag(a, b, steps = 24, kind = 'pen', delay = 0) {
  if (kind === 'mouse') {
    await page.mouse.move(...a);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps);
    }
    await page.mouse.up();
    return;
  }
  await pen('mousePressed', a[0], a[1], 0.5);
  for (let i = 1; i <= steps; i++) {
    await pen('mouseMoved', a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps, 0.5);
    if (delay) await page.waitForTimeout(delay);
  }
  await pen('mouseReleased', b[0], b[1], 0);
}

/** Everything the page sent to the motor, plus convenient views of it. */
const vib = () => E('window.__vib');
const clear = () =>
  page.evaluate(() => {
    window.__vib.length = 0;
    window.__slateHaptics.reset();
  });
const patterns = (list) => list.filter((v) => Array.isArray(v.p));
const stops = (list) => list.filter((v) => v.p === 0);
const setLevel = (v) => E(`window.__slateHaptics.setLevel('${v}')`);

/* ---------------------------------------------------------------- */
/* 1. Wiring, and the default                                        */
/* ---------------------------------------------------------------- */

console.log('\n== 1. The module is wired in, and starts off');
const wired = await E('({ mod: !!window.__slateHaptics, same: window.HA && window.HA.tick === window.__slateHaptics.tick, level: window.__slateHaptics.level() })');
ok('window.__slateHaptics exists', wired.mod === true);
ok('the engine shim was replaced', wired.same === true);
ok('it is OFF by default', wired.level === 'off', String(wired.level));
ok('support is detected through the stubbed API', (await E('window.__slateHaptics.supported()')) === true);

// Default off must mean silent, not merely labelled off.
await E('(function(){ tool="pen"; syncTools(); })()');
await clear();
await drag(T(120, 300), T(620, 520), 30);
ok('the default state sends nothing at all', (await vib()).length === 0, `${(await vib()).length} calls`);

/* ---------------------------------------------------------------- */
/* 2. A stroke sends a PATTERN, not a blip                           */
/* ---------------------------------------------------------------- */

console.log('\n== 2. Drawing sends a pattern');
await setLevel('medium');
await clear();
await drag(T(120, 300), T(620, 520), 30);
const first = patterns(await vib());
ok('a stroke produced a pattern call', first.length >= 1, `${first.length} calls`);
const arr = first[0]?.p || [];
ok('the payload is an array', Array.isArray(arr) && arr.length >= 10, `${arr.length} entries`);
ok('it alternates on/off', arr.length % 2 === 0 && arr[0] > 0 && arr[1] > 0, `[${arr.slice(0, 4).join(', ')}…]`);

const on = arr[0];
const off = arr[1];
ok('the pulse is long enough for a motor to resolve', on >= 10, `${on} ms`);
ok('the pulse leaves real silence between ticks', off >= 20, `${off} ms`);

const preset = await E('window.__slateHaptics.preset()');
ok('the on/off times match the medium preset', Math.abs(off - preset.gap) <= 1 && on >= preset.pulse * 0.9, `${on}/${off} vs ${preset.pulse}/${preset.gap}`);

/* ---------------------------------------------------------------- */
/* 3. The pattern is refreshed while drawing                         */
/* ---------------------------------------------------------------- */

console.log('\n== 3. A long stroke keeps the texture going');
await clear();
await drag(T(140, 340), T(640, 560), 30, 'pen', 34); // ≈1s of continuous drawing
const long = patterns(await vib());
ok('the pattern is re-issued during a long stroke', long.length >= 2, `${long.length} calls`);
if (long.length >= 2) {
  const gapMs = long[1].at - long[0].at;
  const st = await E('window.__slateHaptics.state()');
  ok('re-issues before the pattern runs out', gapMs < st.patternMs, `${Math.round(gapMs)} ms < ${st.patternMs} ms`);
  ok('and not wastefully often', gapMs > 200, `${Math.round(gapMs)} ms apart`);
}

/* ---------------------------------------------------------------- */
/* 4. It stops when the nib stops                                    */
/* ---------------------------------------------------------------- */

console.log('\n== 4. Silence follows the nib');
await clear();
const [sx, sy] = T(240, 720);
await pen('mousePressed', sx, sy, 0.5);
for (let i = 1; i <= 8; i++) await pen('mouseMoved', sx + i * 9, sy, 0.5);
const beforeIdle = await vib();
ok('moving issues a pattern', patterns(beforeIdle).length >= 1, `${patterns(beforeIdle).length} calls`);

// Hold still, still pressed. A pattern would otherwise play out on its own.
await page.waitForTimeout(520);
const afterIdle = await vib();
ok('a motionless pen is cut off', stops(afterIdle).length >= 1, `${stops(afterIdle).length} stop calls`);
const lastStop = stops(afterIdle).slice(-1)[0];
const lastPat = patterns(afterIdle).slice(-1)[0];
ok('the stop comes after the pattern, not before', lastStop && lastPat && lastStop.at > lastPat.at);

// Moving again restarts it.
await pen('mouseMoved', sx + 90, sy, 0.5);
await pen('mouseMoved', sx + 120, sy, 0.5);
await page.waitForTimeout(60);
const resumed = patterns(await vib());
ok('movement resumes the texture', resumed.length > patterns(afterIdle).length, `${patterns(afterIdle).length} → ${resumed.length}`);
await pen('mouseReleased', sx + 120, sy, 0);

/* ---------------------------------------------------------------- */
/* 5. Levels are ordered                                             */
/* ---------------------------------------------------------------- */

console.log('\n== 5. Light < medium < firm');
const measure = async (level) => {
  await setLevel(level);
  await clear();
  await drag(T(140, 380), T(640, 560), 26);
  const a = patterns(await vib())[0]?.p || [];
  return { on: a[0] || 0, off: a[1] || 0 };
};
const light = await measure('light');
const medium = await measure('medium');
const firm = await measure('firm');
ok('light is gentler than medium', light.on < medium.on, `${light.on} vs ${medium.on} ms`);
ok('medium is gentler than firm', medium.on < firm.on, `${medium.on} vs ${firm.on} ms`);
ok('a firmer level is also denser', firm.off < light.off, `${light.off} vs ${firm.off} ms gap`);
ok('every level stays perceptible', Math.min(light.on, medium.on, firm.on) >= 10, `${light.on}/${medium.on}/${firm.on} ms`);

/* ---------------------------------------------------------------- */
/* 6. Off, and the mouse                                             */
/* ---------------------------------------------------------------- */

console.log('\n== 6. Off is silent, and so is a mouse');
await setLevel('off');
await clear();
await drag(T(160, 420), T(600, 540), 30);
ok('off produces no calls', (await vib()).length === 0, `${(await vib()).length} calls`);

await setLevel('medium');
await clear();
await drag(T(160, 420), T(600, 540), 30, 'mouse');
ok('a mouse produces no calls', (await vib()).length === 0, `${(await vib()).length} calls`);

/* ---------------------------------------------------------------- */
/* 7. Shapes and selections stay quiet                               */
/* ---------------------------------------------------------------- */

console.log('\n== 7. Only freehand ink buzzes');
await clear();
await E('(function(){ tool="rect"; syncTools(); })()');
await drag(T(200, 400), T(560, 620), 24);
ok('drawing a shape produces no calls', (await vib()).length === 0, `${(await vib()).length} calls`);

await clear();
await E('(function(){ tool="sel"; syncTools(); })()');
await drag(T(120, 300), T(660, 660), 24);
ok('a selection drag produces no calls', (await vib()).length === 0, `${(await vib()).length} calls`);

/* ---------------------------------------------------------------- */
/* 8. Touch                                                          */
/* ---------------------------------------------------------------- */

console.log('\n== 8. A finger buzzes too');
await E('(function(){ tool="pen"; syncTools(); })()');
// A real pen sends pointerleave when it lifts out of the digitiser's range,
// which is what clears the hover state that blocks touch. CDP does not, so the
// probe supplies the event the hardware would have produced.
await E(`(function(){var c=document.getElementById('cv');c.dispatchEvent(new PointerEvent('pointerleave',{pointerType:'pen',bubbles:false}))})()`);
await page.waitForTimeout(900);
await clear();
const ta = T(200, 760);
const tb = T(600, 820);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ta[0], y: ta[1], radiusX: 3, radiusY: 3, force: 0.6 }] });
for (let i = 1; i <= 20; i++) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: ta[0] + ((tb[0] - ta[0]) * i) / 20, y: ta[1] + ((tb[1] - ta[1]) * i) / 20, radiusX: 3, radiusY: 3, force: 0.6 }],
  });
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const touchCalls = await vib();
ok('a finger stroke sends a pattern', patterns(touchCalls).length >= 1, `${patterns(touchCalls).length} calls`);

/* ---------------------------------------------------------------- */
/* 9. The panel control                                              */
/* ---------------------------------------------------------------- */

console.log('\n== 9. The panel control');
await E('openPenPanel()');
await page.waitForTimeout(350);
const panel = await E(`(function(){
  var s=document.getElementById('pen-hap'), t=document.getElementById('pen-hap-test'), st=document.getElementById('pen-hap-status');
  if(!s) return {exists:false};
  var md=document.getElementById('pen-md');
  return {exists:true,value:s.value,disabled:s.disabled,shown:md.classList.contains('on'),
          test:!!t, testDisabled:t?t.disabled:null, status:st?st.textContent:'',
          opts:[].map.call(s.options,function(o){return o.value})};
})()`);
ok('the haptics select exists', panel.exists === true);
ok('it offers off / light / medium / firm', JSON.stringify(panel.opts) === JSON.stringify(['off', 'light', 'medium', 'firm']), JSON.stringify(panel.opts));
ok('it is enabled when the API exists', panel.disabled === false);
ok('the stylus sheet is actually visible', panel.shown === true);
ok('there is a Test button', panel.test === true);
ok('the status line explains what the API is doing', typeof panel.status === 'string' && panel.status.length > 8, panel.status);

// Off means the Test button has nothing to test.
await page.evaluate(() => {
  const s = document.getElementById('pen-hap');
  s.value = 'off';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(80);
ok('Test is disabled while off', (await E(`document.getElementById('pen-hap-test').disabled`)) === true);

await page.evaluate(() => {
  const s = document.getElementById('pen-hap');
  s.value = 'firm';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(120);
const afterPick = await E('({ level: window.__slateHaptics.level(), last: (window.__vib||[]).slice(-1)[0] })');
ok('the select drives the module', afterPick.level === 'firm', String(afterPick.level));
ok('picking a level plays a sample', Array.isArray(afterPick.last && afterPick.last.p), JSON.stringify(afterPick.last && afterPick.last.p));
ok('Test becomes usable', (await E(`document.getElementById('pen-hap-test').disabled`)) === false);

const stored = await page.evaluate(() => localStorage.getItem('slate-haptics-v2'));
ok('the level is remembered', stored === 'firm', String(stored));

await page.screenshot({ path: shot('haptics-panel.png'), clip: await page.evaluate(() => {
  const box = document.getElementById('pen-md').querySelector('.box');
  box.scrollTop = box.scrollHeight;
  const r = box.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}) });

/* ---------------------------------------------------------------- */
/* 10. Without the API                                               */
/* ---------------------------------------------------------------- */

console.log('\n== 10. A browser with no vibration API');
await context.close();
const noApi = await browser.newContext({ viewport: { width: 1200, height: 860 } });
const p2 = await noApi.newPage();
await p2.route('https://fonts.googleapis.com/**', (r) => r.abort());
await p2.route('https://fonts.gstatic.com/**', (r) => r.abort());
await p2.addInitScript(() => {
  try {
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
  } catch {
    /* private mode */
  }
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
});
await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('#grid', { timeout: 20000 });
await p2.waitForTimeout(1100);
await p2.evaluate(() => {
  const n = { id: Date.now(), name: 'NoVib', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await p2.waitForTimeout(700);
await p2.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((n) => n.remove()));
await p2.evaluate(() => window.eval('openPenPanel()'));
await p2.waitForTimeout(350);
const dead = await p2.evaluate(() => {
  const s = document.getElementById('pen-hap');
  const t = document.getElementById('pen-hap-test');
  const st = document.getElementById('pen-hap-status');
  return { supported: window.__slateHaptics.supported(), disabled: s.disabled, test: t.disabled, row: s.closest('.row').className, status: st.textContent };
});
ok('support reports false', dead.supported === false);
ok('the control is disabled, not silently broken', dead.disabled === true);
ok('the Test button is disabled too', dead.test === true);
ok('the row is dimmed', /pen-hap-off/.test(dead.row));
ok('the status says why', /no vibration/i.test(dead.status), dead.status);

/* ---------------------------------------------------------------- */
/* 11. Errors                                                        */
/* ---------------------------------------------------------------- */

console.log('\n== 11. No page errors');
ok('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

await noApi.close();
await browser.close();

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
