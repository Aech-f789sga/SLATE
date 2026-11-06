/* Regression probe for the in-app update prompt.
 *
 *   node scripts/probe-update.mjs [baseURL] [tag]
 *
 * Runs against a PRODUCTION build (`npm run build` + `vite preview`), because
 * `initUpdateCheck` deliberately does nothing under the dev server — there is
 * no version.json to compare and no meaningful build id. A probe pointed at
 * :3000 would pass every assertion by never running.
 *
 * `/version.json` is intercepted so the page believes a newer deploy exists.
 * That is the whole trick: the comparison is version-string equality, so
 * handing back a different id is exactly what a real deploy looks like.
 *
 * Covers:
 *   1. The policy numbers: a check every minute, a five-minute snooze.
 *   2. A stale build is detected and the card appears.
 *   3. "Later" snoozes for five minutes and hides it.
 *   4. When the snooze expires the card comes back on its own.
 *   5. Over a note it waits for the pen to stop, and clears the page bar.
 *   6. A current build shows nothing.
 *   7. No page errors.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/';
const TAG = process.argv[3] || '';
console.log(`target: ${BASE}${TAG ? ` (${TAG})` : ''}`);

const FAKE = '999999999999'; // guaranteed to differ from any real build id

const browser = await chromium.launch();

let failed = 0;
const ok = (label, pass, detail = '') => {
  if (pass) console.log(`PASS ${label}${detail ? '  — ' + detail : ''}`);
  else {
    failed++;
    console.log(`FAIL ${label}${detail ? '  — ' + detail : ''}`);
  }
};

/**
 * @param {string|null} version  what /version.json should claim, or null to
 *                               serve the real file.
 */
async function open(version) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 860 } });
  const page = await context.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  if (version) {
    await page.route('**/version.json*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version, builtAt: new Date().toISOString() }) }),
    );
  }
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
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  return { context, page, errors };
}

const visible = (page) => page.evaluate(() => {
  const c = document.querySelector('.slate-upd');
  return !!c && c.classList.contains('on');
});

/* ---------------------------------------------------------------- */
/* 1 & 2. Policy, and a stale build                                  */
/* ---------------------------------------------------------------- */

console.log('\n== 1. The check policy');
const { context, page, errors } = await open(FAKE);
const cfg = await page.evaluate(() => window.__slateUpd && window.__slateUpd.config());
ok('the update checker is running', !!cfg, JSON.stringify(cfg));
ok('it checks once a minute', cfg && cfg.checkMs === 60000, `${cfg && cfg.checkMs} ms`);
ok('Later snoozes for five minutes', cfg && cfg.snoozeMs === 300000, `${cfg && cfg.snoozeMs} ms`);
ok('it waits for a pause before covering a note', cfg && cfg.idleMs === 2500, `${cfg && cfg.idleMs} ms`);

console.log('\n== 2. A newer build is noticed');
ok('nothing is shown before the first check runs', (await visible(page)) === false);

// The first check is deliberately delayed so the app can paint.
await page.waitForTimeout(9500);
const st = await page.evaluate(() => window.__slateUpd.state());
ok('the running build is older than the deployed one', st.local !== FAKE && st.pending === FAKE, `local ${st.local}, pending ${st.pending}`);
ok('the card is visible', (await visible(page)) === true);
const card = await page.evaluate(() => {
  const c = document.querySelector('.slate-upd');
  if (!c) return null;
  return {
    title: c.querySelector('h4').textContent,
    msg: c.querySelector('.msg').textContent,
    buttons: [...c.querySelectorAll('button')].map((b) => b.textContent),
  };
});
ok('it says an update is available', /update/i.test(card.title), card.title);
ok('the message offers both outcomes', /later/i.test(card.msg) && /five minutes/i.test(card.msg), card.msg.slice(0, 70) + '…');
ok('there are exactly two choices', JSON.stringify(card.buttons) === JSON.stringify(['Later', 'Update now']), JSON.stringify(card.buttons));

/* ---------------------------------------------------------------- */
/* 3. Later                                                          */
/* ---------------------------------------------------------------- */

console.log('\n== 3. "Later" buys five minutes');
const before = Date.now();
await page.click('.slate-upd .later');
await page.waitForTimeout(250);
const after = await page.evaluate(() => window.__slateUpd.state());
ok('the card hides', (await visible(page)) === false);
const delta = after.snoozeUntil - before;
ok('the snooze is five minutes out', Math.abs(delta - 300000) < 5000, `${Math.round(delta / 1000)}s`);

// It must stay hidden while the snooze holds.
await page.waitForTimeout(2200);
ok('it does not immediately re-appear', (await visible(page)) === false);

/* ---------------------------------------------------------------- */
/* 4. The snooze expiring                                            */
/* ---------------------------------------------------------------- */

console.log('\n== 4. It asks again when the snooze runs out');
await page.evaluate(() => localStorage.setItem('slate.upd.snooze', String(Date.now() - 1000)));
await page.waitForTimeout(1600);
ok('the card returns by itself', (await visible(page)) === true);

/* ---------------------------------------------------------------- */
/* 5. Over a note                                                    */
/* ---------------------------------------------------------------- */

console.log('\n== 5. It waits for the pen to stop before covering a note');
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'Update', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((n) => n.remove()));

// Keep the pointer moving, as a drawing hand would.
for (let i = 0; i < 12; i++) {
  await page.mouse.move(300 + i * 12, 420 + (i % 3) * 10);
  await page.waitForTimeout(260);
}
ok('it stays away while the hand is moving', (await visible(page)) === false);

await page.waitForTimeout(3600);
ok('it appears once the hand stops', (await visible(page)) === true);

const placed = await page.evaluate(() => {
  const c = document.querySelector('.slate-upd').getBoundingClientRect();
  const pg = document.getElementById('pg');
  const pgr = pg ? pg.getBoundingClientRect() : null;
  return { cardBottom: c.bottom, pageBarTop: pgr ? pgr.top : null };
});
ok('it sits clear of the page bar', placed.pageBarTop !== null && placed.cardBottom <= placed.pageBarTop + 2, `card ends at ${Math.round(placed.cardBottom)}, bar starts at ${Math.round(placed.pageBarTop)}`);

await page.screenshot({ path: `shots/update-card${TAG ? '-' + TAG : ''}.png` });

/* ---------------------------------------------------------------- */
/* 6. A current build                                                */
/* ---------------------------------------------------------------- */

console.log('\n== 6. An up-to-date build shows nothing');
await context.close();
const fresh = await open(null); // serve the real version.json
await fresh.page.waitForTimeout(9500);
const freshState = await fresh.page.evaluate(() => window.__slateUpd.state());
ok('the pending build matches the running one', freshState.pending === null, String(freshState.pending));
ok('no card is shown', (await visible(fresh.page)) === false);

/* ---------------------------------------------------------------- */
/* 7. Errors                                                         */
/* ---------------------------------------------------------------- */

console.log('\n== 7. No page errors');
ok('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');
ok('no uncaught errors (second run)', fresh.errors.length === 0, fresh.errors.slice(0, 2).join(' | ') || 'clean');

await fresh.context.close();
await browser.close();

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
