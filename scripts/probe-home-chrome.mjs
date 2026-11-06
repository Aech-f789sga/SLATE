/* Regression probe: the floating chrome belongs to the editor, not the library.
 *
 *   node scripts/probe-home-chrome.mjs [baseURL]
 *
 * The padlock (focus mode) and the "?" launcher (tool tour) are editor-only
 * controls. Both hid themselves with display:none, and both kept showing on
 * the library screen anyway, floating over the shelf next to nothing they
 * could act on.
 *
 * One rule was responsible: the icon normaliser pinned every icon-only button
 * to display:inline-grid!important, and an important declaration outranks a
 * component's own rule *and* an inline style.display — so the two buttons were
 * un-hideable. The same rule also exposed the pen dock's grip outside lock
 * mode.
 *
 * Covers:
 *   1. The padlock is not on the library screen.
 *   2. The "?" launcher is not on the library screen.
 *   3. Nothing icon-only has taken their place in that corner.
 *   4. Both appear once a notebook is open.
 *   5. The padlock still sits directly above the "?".
 *   6. Icon centring survived: glyphs are still on the button's centre.
 *   7. The pen dock grip is hidden outside lock mode and shown inside it.
 *   8. Both disappear again on the way back to the library.
 *   9. No page errors.
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
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
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));

const shown = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      display: cs.display,
      rect: [r.left, r.top, r.width, r.height].map(Math.round),
    };
  }, sel);

/* ---- library ---- */

const homeLock = await shown('#ink-lock');
ok('1. padlock is not on the library screen', homeLock && !homeLock.visible, homeLock ? `display:${homeLock.display}` : 'absent');

const homeFab = await shown('#tour-fab');
ok('2. "?" launcher is not on the library screen', homeFab && !homeFab.visible, homeFab ? `display:${homeFab.display}` : 'absent');

/* Their old corner: 14 px in from the right edge, 74 px and 122 px up. */
const corner = await page.evaluate(() => {
  const probe = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'nothing';
    const b = el.closest('button');
    if (b) return `button#${b.id || '(no id)'}${b.dataset.slateIcon ? '[icon]' : ''}`;
    return `${el.tagName.toLowerCase()}#${el.id || ''}`.trim();
  };
  const w = innerWidth;
  const h = innerHeight;
  return {
    fabSpot: probe(w - 34, h - 94),
    lockSpot: probe(w - 34, h - 142),
    overLibrary: !!document.elementFromPoint(w - 34, h - 94)?.closest('#lib, #nav, #libm'),
  };
});
const stray = /button#(ink-lock|tour-fab)|\[icon\]/;
ok(
  '3. nothing icon-only has taken their place in that corner',
  !stray.test(corner.fabSpot) && !stray.test(corner.lockSpot) && corner.overLibrary,
  `at fab spot: ${corner.fabSpot} · at lock spot: ${corner.lockSpot}`
);

/* ---- notebook ---- */

await page.evaluate(() => {
  const nb = { id: Date.now(), name: 'Chrome', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(nb);
  window.openNotebook(nb);
});
await page.waitForTimeout(1600);
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));

const noteLock = await shown('#ink-lock');
const noteFab = await shown('#tour-fab');
ok('4. both appear once a notebook is open', !!(noteLock?.visible && noteFab?.visible), `lock:${noteLock?.visible} fab:${noteFab?.visible}`);

const gap = noteLock && noteFab ? noteFab.rect[1] - (noteLock.rect[1] + noteLock.rect[3]) : null;
ok('5. the padlock still sits directly above the "?"', gap === 8, `gap ${gap} px`);

/* ---- back to the library ---- */

const centred = await page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('button[data-slate-icon]')) {
    if (getComputedStyle(b).display === 'none') continue;
    const r = b.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) continue;
    const kid = b.firstElementChild;
    if (!kid || kid.tagName.toLowerCase() !== 'svg') continue;
    const k = kid.getBoundingClientRect();
    out.push({
      id: b.id || b.className || '(anon)',
      dx: Math.abs((k.left + k.width / 2) - (r.left + r.width / 2)),
      dy: Math.abs((k.top + k.height / 2) - (r.top + r.height / 2)),
    });
  }
  return out;
});
const worst = centred.reduce((m, c) => Math.max(m, c.dx, c.dy), 0);
ok('6. icon centring survived', centred.length >= 5 && worst <= 1, `${centred.length} svg buttons, worst offset ${worst.toFixed(2)} px`);

/* ---- pen dock grip ---- */

const grip = await page.evaluate(async () => {
  const g = document.querySelector('#pen-dock .pd-grip');
  if (!g) return { absent: true };
  const vis = () => getComputedStyle(g).display !== 'none' && g.getBoundingClientRect().width > 0;
  const before = vis();
  window.__inkpad_focus?.set?.(true, true);
  await new Promise((r) => setTimeout(r, 250));
  const afterLock = vis();
  window.__inkpad_focus?.set?.(false, true);
  return { before, afterLock };
});
if (grip.absent) console.log('SKIP 7. pen dock grip — the dock is not mounted in this build');
else ok('7. the dock grip only shows in lock mode', grip.before === false && grip.afterLock === true, `normal:${grip.before} locked:${grip.afterLock}`);

await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('#back').click());
await page.waitForTimeout(1600);
const backLock = await shown('#ink-lock');
const backFab = await shown('#tour-fab');
ok('8. both disappear again on the way back', !!(backLock && !backLock.visible && backFab && !backFab.visible), `lock:${backLock?.visible} fab:${backFab?.visible}`);

await page.waitForTimeout(400);
ok('9. no page errors', errors.length === 0, errors.join(' | ').slice(0, 200));

await browser.close();
console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
