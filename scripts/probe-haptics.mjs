/* Regression probe for the surface-haptics layer.
 *
 *   node scripts/probe-haptics.mjs [baseURL] [tag]
 *
 * Headless Chromium has no vibration motor and, on the desktop, no
 * `navigator.vibrate` at all — so the probe installs a recorder in place of the
 * real API before the page boots. That matters: it exercises the genuine call
 * path (support detection, the pulse scheduler, the level presets) rather than
 * a test-only branch, and it lets us assert on the thing that actually decides
 * how the feature feels, which is the *timing* of the pulses.
 *
 * Input is driven through the DevTools protocol, because the engine calls
 * `setPointerCapture` and synthetic events cannot survive that.
 *
 * Covers:
 *   1. The module replaced the engine's no-op shim.
 *   2. A pen stroke ticks, and every tick is a sane duration.
 *   3. Ticks are gated by travel — a nib that barely moves stays quiet.
 *   4. The minimum gap holds, so pulses never truncate each other.
 *   5. Light < medium < firm, in that order.
 *   6. Off is silent, and so is a mouse.
 *   7. Shapes and selections do not tick.
 *   8. A finger on a touchscreen ticks too.
 *   9. The panel select reflects and drives the setting.
 *  10. Without the API the row is disabled rather than lying.
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

/** A stroke from a→b in `steps` samples, optionally with a mouse pointer. */
async function drag(a, b, steps = 24, kind = 'pen') {
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
  }
  await pen('mouseReleased', b[0], b[1], 0);
}

const ticks = () => E('window.__slateHaptics.recent()');
const clear = () => E('window.__slateHaptics.reset()');
const setLevel = (v) => E(`window.__slateHaptics.setLevel('${v}')`);

/* ---------------------------------------------------------------- */
/* 1. Wiring                                                         */
/* ---------------------------------------------------------------- */

console.log('\n== 1. The module is wired in');
const wired = await E('({ mod: !!window.__slateHaptics, ha: !!window.HA, same: window.HA && window.HA.tick === window.__slateHaptics.tick, level: window.__slateHaptics.level() })');
ok('window.__slateHaptics exists', wired.mod === true);
ok('the engine shim was replaced', wired.same === true, `HA.tick identity ${wired.same}`);
ok('it defaults to medium', wired.level === 'medium', String(wired.level));
ok('support is detected through the stubbed API', (await E('window.__slateHaptics.supported()')) === true);

/* ---------------------------------------------------------------- */
/* 2. A stroke ticks                                                 */
/* ---------------------------------------------------------------- */

console.log('\n== 2. Drawing produces ticks');
await E('(function(){ tool="pen"; syncTools(); })()');
await clear();
await drag(T(120, 300), T(620, 520), 40);
const t2 = await ticks();
ok('a stroke produced ticks', t2.length >= 6, `${t2.length} ticks`);
const durations = t2.map((x) => x.ms);
ok('every tick is a plausible pulse', durations.every((d) => d >= 3 && d <= 20), `[${Math.min(...durations)}…${Math.max(...durations)}] ms`);
ok('the first tick is the nib landing', durations[0] >= durations[1], `land ${durations[0]} vs tick ${durations[1]}`);

/* ---------------------------------------------------------------- */
/* 3. Travel gating                                                  */
/* ---------------------------------------------------------------- */

console.log('\n== 3. Ticks follow the nib, not the clock');
await clear();
await pen('mousePressed', ...T(200, 700), 0.5);
await page.waitForTimeout(60);
const afterLand = (await ticks()).length;
ok('touching down gives exactly one landing tick', afterLand === 1, `${afterLand} ticks`);

// Nudge by a couple of pixels: below the travel threshold, so still nothing.
const [nx, ny] = T(200, 700);
for (let i = 1; i <= 3; i++) await pen('mouseMoved', nx + i, ny, 0.5);
await page.waitForTimeout(120);
const afterNudge = (await ticks()).length;
ok('a nib that barely moves stays quiet', afterNudge === 1, `${afterNudge} ticks after a 3px nudge`);

// Holding perfectly still must stay silent no matter how long we wait.
await page.waitForTimeout(420);
ok('resting the pen produces no ticks', (await ticks()).length === afterNudge);

// Now move properly, and it wakes up.
for (let i = 1; i <= 10; i++) await pen('mouseMoved', nx + i * 8, ny, 0.5);
await page.waitForTimeout(80);
const afterMove = (await ticks()).length;
ok('real movement resumes the ticks', afterMove > afterNudge, `${afterNudge} → ${afterMove}`);
await pen('mouseReleased', nx + 80, ny, 0);

/* ---------------------------------------------------------------- */
/* 4. The gap is respected                                           */
/* ---------------------------------------------------------------- */

console.log('\n== 4. Pulses never truncate each other');
const gaps = t2.slice(1).map((x, i) => x.at - t2[i].at);
ok('consecutive ticks keep a real gap', Math.min(...gaps) >= 20, `min gap ${Math.min(...gaps).toFixed(1)} ms`);
const preset = await E('window.__slateHaptics.preset()');
ok('the gap matches the medium preset', Math.min(...gaps) >= preset.gap - 4, `preset ${preset.gap} ms`);

/* ---------------------------------------------------------------- */
/* 5. Levels are ordered                                             */
/* ---------------------------------------------------------------- */

console.log('\n== 5. Light < medium < firm');
const measure = async (level) => {
  await setLevel(level);
  await clear();
  await drag(T(140, 380), T(640, 560), 40);
  const t = await ticks();
  const d = t.map((x) => x.ms);
  return { n: d.length, mean: d.reduce((a, b) => a + b, 0) / (d.length || 1) };
};
const light = await measure('light');
const medium = await measure('medium');
const firm = await measure('firm');
ok('light is gentler than medium', light.mean < medium.mean, `${light.mean.toFixed(1)} vs ${medium.mean.toFixed(1)} ms`);
ok('medium is gentler than firm', medium.mean < firm.mean, `${medium.mean.toFixed(1)} vs ${firm.mean.toFixed(1)} ms`);
ok('a firmer level also ticks more densely', firm.n > light.n, `${light.n} vs ${firm.n} ticks`);

/* ---------------------------------------------------------------- */
/* 6. Off, and the mouse                                             */
/* ---------------------------------------------------------------- */

console.log('\n== 6. Off is silent, and so is a mouse');
await setLevel('off');
await clear();
await drag(T(160, 420), T(600, 540), 30);
ok('off produces no ticks', (await ticks()).length === 0, `${(await ticks()).length} ticks`);

await setLevel('medium');
await clear();
await drag(T(160, 420), T(600, 540), 30, 'mouse');
ok('a mouse produces no ticks', (await ticks()).length === 0, `${(await ticks()).length} ticks`);

/* ---------------------------------------------------------------- */
/* 7. Shapes and selections stay quiet                               */
/* ---------------------------------------------------------------- */

console.log('\n== 7. Only freehand ink ticks');
await clear();
await E('(function(){ tool="rect"; syncTools(); })()');
await drag(T(200, 400), T(560, 620), 24);
ok('drawing a shape produces no ticks', (await ticks()).length === 0, `${(await ticks()).length} ticks`);

await clear();
await E('(function(){ tool="sel"; syncTools(); })()');
await drag(T(120, 300), T(660, 660), 24);
ok('a selection drag produces no ticks', (await ticks()).length === 0, `${(await ticks()).length} ticks`);

/* ---------------------------------------------------------------- */
/* 8. Touch                                                          */
/* ---------------------------------------------------------------- */

console.log('\n== 8. A finger ticks too');
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
const t8 = await ticks();
ok('a finger stroke produces ticks', t8.length >= 3, `${t8.length} ticks`);

/* ---------------------------------------------------------------- */
/* 9. The panel select                                               */
/* ---------------------------------------------------------------- */

console.log('\n== 9. The panel control');
await E('openPenPanel()');
await page.waitForTimeout(350);
const panel = await E(`(function(){
  var s=document.getElementById('pen-hap');
  if(!s) return {exists:false};
  var md=document.getElementById('pen-md');
  return {exists:true,value:s.value,disabled:s.disabled,shown:md.classList.contains('on'),
          opts:[].map.call(s.options,function(o){return o.value})};
})()`);
ok('the haptics select exists', panel.exists === true);
ok('it offers off / light / medium / firm', JSON.stringify(panel.opts) === JSON.stringify(['off', 'light', 'medium', 'firm']), JSON.stringify(panel.opts));
ok('it shows the current level', panel.value === 'medium', String(panel.value));
ok('it is enabled when the API exists', panel.disabled === false);
ok('the stylus sheet is actually visible', panel.shown === true);

// Choosing a level from the panel must reach the module, and give a sample.
await page.evaluate(() => {
  const s = document.getElementById('pen-hap');
  s.value = 'firm';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(120);
const afterPick = await E('({ level: window.__slateHaptics.level(), last: (window.__vib||[]).slice(-1)[0] })');
ok('the select drives the module', afterPick.level === 'firm', String(afterPick.level));
ok('picking a level plays a sample pattern', Array.isArray(afterPick.last && afterPick.last.p), JSON.stringify(afterPick.last && afterPick.last.p));

// Persisted?
const stored = await page.evaluate(() => localStorage.getItem('slate-haptics'));
ok('the level is remembered', stored === 'firm', String(stored));

await page.screenshot({ path: shot('haptics-panel.png'), clip: await page.evaluate(() => {
  const r = document.getElementById('pen-md').querySelector('.box').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 520) };
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
  return { supported: window.__slateHaptics.supported(), disabled: s.disabled, row: s.closest('.row').className, title: s.title };
});
ok('support reports false', dead.supported === false);
ok('the control is disabled, not silently broken', dead.disabled === true);
ok('the row is dimmed and explains why', /pen-hap-off/.test(dead.row) && /no vibration/i.test(dead.title), dead.title);

/* ---------------------------------------------------------------- */
/* 11. Errors                                                        */
/* ---------------------------------------------------------------- */

console.log('\n== 11. No page errors');
ok('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

await noApi.close();
await browser.close();

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
