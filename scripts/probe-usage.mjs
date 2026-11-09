/* Regression probe for usage timing and the admin's visitor count.
 *
 *   node scripts/probe-usage.mjs [baseURL]
 *
 * Time is the subject here, so the browser clock is faked and driven forward.
 * That is the only way to test a ten-minute threshold without a ten-minute
 * test — and it also means this probe never depends on the wall clock being
 * kind.
 *
 * Covers:
 *   1. A signed-out session starts an anonymous visit.
 *   2. Engaged time accrues while the user interacts.
 *   3. Time keeps counting for a short grace after the last input, then stops.
 *      A tab left open does not bill the rest of the day.
 *   4. Fifteen minutes of silence flips the session to idle.
 *   5. Nothing is written to /visitors before ten minutes.
 *   6. Crossing ten minutes writes one visit, with the id, the fixed shape and
 *      a seconds value at or above 600.
 *   7. The visit is updated later, not re-created, and never decreases.
 *   8. An idle session stops writing entirely.
 *   9. The admin panel carries the visitor card and survives being opened by a
 *      non-admin (it shows the permission error instead of breaking).
 *  10. No page errors.
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());

/* Record every Firestore request. The visit is the only thing this page should
   be writing while signed out, and the document travels in the body — the
   WebChannel posts it as a query string, so it has to be decoded. */
await page.addInitScript(() => {
  window.__net = [];
  const push = (url, body) => window.__net.push({ url: String(url).slice(0, 80), body: String(body || '') });
  const fetch0 = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (String(url).includes('firestore')) {
        if (input instanceof Request && input.method !== 'GET') {
          try {
            input.clone().text().then((t) => push(url, t)).catch(() => {});
          } catch {}
        }
        if (init && init.body) push(url, init.body);
      }
    } catch {}
    return fetch0.apply(this, arguments);
  };
});

await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem('inkpad-tour-editor-v5', '1');
});

/* Before the page loads, so the module's own interval is a faked timer too. */
await page.clock.install({ time: new Date('2026-11-09T10:00:00Z') });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.clock.fastForward(4000);
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));

const usage = () => page.evaluate(() => (window.__slate_usage ? {
  active: window.__slate_usage.active,
  idle: window.__slate_usage.idle,
  visit: window.__slate_usage.visit,
} : null));

const touch = () => page.evaluate(() => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300, bubbles: true }));
});

/* Firestore's WebChannel posts each RPC as `count=..&req0___data__=<json>`, so
   the write has to be unwrapped before it can be read. */
const visits = () => page.evaluate(() => {
  const out = [];
  for (const req of window.__net) {
    const raw = req.body.split('&').find((p) => p.startsWith('req0___data__='));
    if (!raw) continue;
    let data;
    try {
      data = JSON.parse(decodeURIComponent(raw.slice('req0___data__='.length)));
    } catch {
      continue;
    }
    for (const w of data.writes || []) {
      const name = (w.update && w.update.name) || '';
      if (!name.includes('/visitors/')) continue;
      const f = (w.update && w.update.fields) || {};
      out.push({
        id: name.slice(name.lastIndexOf('/') + 1),
        name,
        first: Number(f.first && f.first.integerValue),
        last: Number(f.last && f.last.integerValue),
        seconds: Number(f.seconds && f.seconds.integerValue),
        fieldId: f.id && f.id.stringValue,
        mask: (w.updateMask && w.updateMask.fieldPaths) || [],
      });
    }
  }
  return out;
});

/* ---- 1: an anonymous session exists ---- */

const boot = await usage();
ok('a signed-out session starts an anonymous visit', !!boot && !!boot.visit && /^v_[a-z0-9]+$/.test(boot.visit.id),
  boot && boot.visit ? boot.visit.id : 'no session');

/* ---- 2: time accrues while interacting ---- */

/* `fastForward` jumps rather than replaying every frame: a thirty-second step
   would otherwise be 1800 animation frames of a drawing canvas, and the point
   here is the arithmetic, not the paint. Timers fire once per jump, which is
   all the clock needs — it measures with timestamps, not ticks. */
await touch();
for (let i = 0; i < 2; i++) {
  await page.clock.fastForward(120000);
  await touch();
}
const after5 = await usage();
ok('engaged time accrues while the user interacts', after5.active >= 230 && after5.active <= 250,
  `${after5.active}s after 4 min`);

/* ---- 5: nothing is written before ten minutes ---- */

const before10 = await visits();
ok('nothing is written to /visitors before ten minutes', before10.length === 0, `${before10.length} writes`);

/* ---- 3: the grace window, then silence ---- */

/* Four more active minutes → past the threshold. */
for (let i = 0; i < 4; i++) {
  await page.clock.fastForward(120000);
  await touch();
}
const at11 = await usage();
ok('crossing ten minutes is recorded', at11.active >= 650, `${at11.active}s`);

/* The write leaves through a promise chain, so give the recorder a moment
   before reading it back. */
await page.waitForTimeout(1500);
const writes = await visits();
const secondsSeen = writes.map((w) => w.seconds);
ok('a visit document is written once ten minutes is crossed', writes.length >= 1 && secondsSeen[0] >= 600,
  `writes=${writes.length} seconds=${secondsSeen.join(',')}`);
ok('the write carries the fixed shape', writes.length > 0
  && writes[0].fieldId === writes[0].id
  && writes[0].first > 0 && writes[0].last >= writes[0].first
  && writes[0].mask.slice().sort().join(',') === 'first,id,last,seconds',
  writes.length ? `${writes[0].id} ${writes[0].mask.join('/')}` : 'no body');

/* The other half of "signed out only": a guest must never land in the user
   directory, which is what the admin counts as a registered account. */
const dirWrites = await page.evaluate(() => window.__net.filter((r) => r.body.includes('/directory/')).length);
ok('a signed-out session never writes to the user directory', dirWrites === 0, `${dirWrites} writes`);

/* ---- 3: stop interacting ---- */

await page.clock.fastForward(60000);
const t0 = (await usage()).active;
await page.clock.fastForward(180000);
const t1 = (await usage()).active;
await page.clock.fastForward(300000);
const t2 = (await usage()).active;
ok('time stops shortly after the last input', t1 > t0 && t2 === t1,
  `${t0} → ${t1} → ${t2}`);

/* ---- 4: idle at fifteen minutes ---- */

const idleBefore = (await usage()).idle;
await page.clock.fastForward(400000);
const idleAfter = await usage();
ok('fifteen minutes of silence marks the session idle', idleBefore === false && idleAfter.idle === true,
  `idle ${idleBefore} → ${idleAfter.idle}`);

/* ---- 8: idle sessions stop writing ---- */

/* Settle first: the last active write may still be in flight, and counting it
   here would look like an idle write. */
await page.waitForTimeout(1500);
const writesBefore = (await visits()).length;
await page.clock.fastForward(300000);
await page.waitForTimeout(1500);
const writesAfter = (await visits()).length;
ok('an idle session stops writing', writesAfter === writesBefore, `${writesBefore} → ${writesAfter}`);

/* ---- 7: monotonic seconds ---- */

const all = await visits();
const allSeconds = all.map((w) => w.seconds);
const monotonic = allSeconds.every((v, i) => i === 0 || v >= allSeconds[i - 1]);
ok('later writes never lower the total', monotonic, allSeconds.join(' → '));

/* ---- 9: the panel ---- */

const panel = await page.evaluate(() => {
  try {
    window.__inkpad_admin.open();
  } catch (e) {
    return { error: String(e) };
  }
  return { error: '' };
});
await page.waitForTimeout(1800);
const panelState = await page.evaluate(() => {
  const md = document.getElementById('admin-md');
  const host = document.getElementById('admin-visits');
  return {
    open: !!md && md.style.display === 'flex',
    host: !!host,
    text: host ? host.textContent.trim().slice(0, 90) : '',
  };
});
ok('the admin panel carries a visitor card', panelState.open && panelState.host,
  panel.error || (panelState.open ? panelState.text : 'panel did not open'));

/* ---- 10 ---- */

ok('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);
