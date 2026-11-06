/* Regression probe for the page bar inside lock (focus) mode.
 *
 *   node scripts/probe-lock-pages.mjs [baseURL] [tag]
 *
 * The lock hides every toolbar, and it used to take the page bar with them —
 * so a locked notebook had no way to turn the page or add one, which is exactly
 * what you still need while writing.
 *
 * Covers:
 *   1. Locking hides the toolbar but keeps the page bar.
 *   2. The bar is a floating pill, not a full-width strip.
 *   3. Next and previous actually turn the page.
 *   4. "+ Page" adds one.
 *   5. Duplicate and delete stay hidden — those are editing decisions.
 *   6. In long-strip mode the arrows and the counter go away, "+ Page" stays.
 *   7. Unlocking puts the bar back where it was.
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
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove());
  const nb = { id: Date.now(), name: 'Lock', upd: Date.now(), pages: [] };
  for (let i = 0; i < 3; i++) nb.pages.push({ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 });
  window.lib.push(nb);
  window.openNotebook(nb);
});
await page.waitForTimeout(1400);
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));

const shown = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      rect: [r.left, r.top, r.width, r.height].map(Math.round),
    };
  }, sel);

/* lock */
await page.evaluate(() => window.__inkpad_focus.set(true, true));
await page.waitForTimeout(400);

ok('locking still hides the toolbar', !(await shown('#tb')).visible, JSON.stringify(await shown('#tb')));

const bar = await shown('#pg');
ok('the page bar survives the lock', !!bar && bar.visible, JSON.stringify(bar));
ok(
  'it floats as a pill instead of spanning the window',
  !!bar && bar.rect[2] < 1280 * 0.6,
  bar ? `${bar.rect[2]}px wide of 1280` : 'missing'
);
ok('duplicate and delete stay with the toolbars', !(await shown('#dup')).visible && !(await shown('#del')).visible);

const pageNo = () => page.evaluate(() => window.eval('pi'));
const pages = () => page.evaluate(() => window.eval('nb.pages.length'));
const label = () => page.evaluate(() => (document.getElementById('pn') || {}).textContent || '');

const before = await pageNo();
await page.click('#next');
/* the flip animation owns the page for ~1s; a turn during it is ignored */
await page.waitForTimeout(1500);
const afterNext = await pageNo();
await page.click('#prev');
await page.waitForTimeout(1500);
const afterPrev = await pageNo();
ok('the next arrow turns the page', afterNext === before + 1, `${before} → ${afterNext}`);
ok('the previous arrow turns it back', afterPrev === before, `${afterNext} → ${afterPrev}`);
ok('the counter follows', new RegExp(`Page ${afterPrev + 1} of`).test(await label()), await label());

const n0 = await pages();
await page.click('#add');
await page.waitForTimeout(600);
const n1 = await pages();
ok('"+ Page" adds a page while locked', n1 === n0 + 1, `${n0} → ${n1} pages`);

/* long strip: the arrows go, the add stays */
await page.evaluate(() => {
  document.documentElement.dataset.flow = 'strip';
});
await page.waitForTimeout(250);
const stripNext = await shown('#next');
const stripAdd = await shown('#add');
ok('in long strip the arrows go away', !stripNext.visible, JSON.stringify(stripNext));
ok('in long strip "+ Page" stays', stripAdd.visible);
await page.evaluate(() => {
  delete document.documentElement.dataset.flow;
});
await page.waitForTimeout(250);
ok('leaving the strip brings the arrows back', (await shown('#next')).visible);

/* unlock */
await page.evaluate(() => window.__inkpad_focus.set(false, true));
await page.waitForTimeout(400);
const unlocked = await shown('#pg');
ok(
  'unlocking puts the bar back in the page flow',
  !!unlocked && unlocked.visible && unlocked.rect[2] > 1280 * 0.9,
  unlocked ? `${unlocked.rect[2]}px wide` : 'missing'
);

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.evaluate(() => window.__inkpad_focus.set(true, true));
await page.waitForTimeout(300);
await page.screenshot({ path: `shots/lock-pages${TAG ? '-' + TAG : ''}.png` });
await ctx.close();
await browser.close();

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
