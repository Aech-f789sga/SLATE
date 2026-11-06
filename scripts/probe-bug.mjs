/* Regression probe for "Report a bug".
 *
 *   node scripts/probe-bug.mjs [baseURL] [tag]
 *
 * Covers:
 *   1. The entry exists in the home dropdown and is a real button.
 *   2. It opens a dialog with a focused textarea.
 *   3. Sending POSTs the message, the reply address and the build context.
 *   4. A real `{ok:true}` closes the dialog and says so.
 *   5. An unconfigured endpoint (503) falls back to a mail draft instead of
 *      claiming a send that never happened.
 *   6. So does a non-JSON answer — a dev server's SPA fallback is 200 + HTML,
 *      and that must not count as success.
 *   7. An empty message is refused without a request.
 *   8. Escape closes the dialog.
 *   9. The endpoint itself: method guard, empty message, no key → 503, and with
 *      a key it mails aechmoose@gmail.com.
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

/* ---------------------------------------------------------------- */
/* 9. The endpoint, without touching the network                     */
/* ---------------------------------------------------------------- */
const { default: report } = await import('../api/report.js');

function fakeRes() {
  const r = {
    code: 0,
    body: null,
    headers: {},
    status(c) {
      r.code = c;
      return r;
    },
    json(b) {
      r.body = b;
      return r;
    },
    setHeader(k, v) {
      r.headers[k] = v;
    },
  };
  return r;
}

{
  const res = fakeRes();
  await report({ method: 'GET', headers: {}, body: null }, res);
  ok('the endpoint refuses GET', res.code === 405, `status ${res.code}`);
}
{
  const res = fakeRes();
  await report({ method: 'POST', headers: {}, body: { message: '  ' } }, res);
  ok('the endpoint refuses an empty message', res.code === 400, `status ${res.code}`);
}
{
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const res = fakeRes();
  await report({ method: 'POST', headers: {}, body: { message: 'the page froze' } }, res);
  ok('no mail key means a 503, not a fake success', res.code === 503, JSON.stringify(res.body));
  if (saved) process.env.RESEND_API_KEY = saved;
}
{
  const saved = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_test';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => '{}' };
  };
  const res = fakeRes();
  await report(
    { method: 'POST', headers: {}, body: { message: 'pinch deletes ink', email: 'a@b.co', context: 'version: 1' } },
    res
  );
  globalThis.fetch = realFetch;
  if (saved) process.env.RESEND_API_KEY = saved;
  else delete process.env.RESEND_API_KEY;
  const sent = calls[0] && JSON.parse(calls[0].init.body);
  ok('with a key it answers ok', res.code === 200 && res.body && res.body.ok === true, JSON.stringify(res.body));
  ok('it mails the owner', !!sent && sent.to[0] === 'aechmoose@gmail.com', sent ? sent.to.join(',') : 'no request');
  ok(
    'the mail carries the message, the context and the reply-to',
    !!sent && sent.text.includes('pinch deletes ink') && sent.text.includes('version: 1') && sent.reply_to === 'a@b.co',
    sent ? sent.subject : 'no request'
  );
}

/* ---------------------------------------------------------------- */
/* 1-8. The UI                                                       */
/* ---------------------------------------------------------------- */
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
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));

const entry = await page.evaluate(() => {
  const b = document.getElementById('bug-btn');
  if (!b) return null;
  const nav = document.getElementById('nav');
  return { inNav: !!(nav && nav.contains(b)), tag: b.tagName, text: b.textContent.trim() };
});
ok('the home dropdown has the entry', !!entry && entry.inNav && entry.tag === 'BUTTON', JSON.stringify(entry));
ok('the entry reads "Report a bug"', !!entry && /Report a bug/.test(entry.text), entry ? entry.text : 'missing');

/* open it */
if (await page.evaluate(() => getComputedStyle(document.getElementById('nav')).display === 'none')) {
  await page.click('#nav-hide');
  await page.waitForTimeout(250);
}
await page.click('#bug-btn');
await page.waitForTimeout(300);

const dlg = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"][aria-label="Report a bug"]');
  if (!d) return null;
  const ta = d.querySelector('textarea');
  return { open: true, focused: document.activeElement === ta, hasMail: !!d.querySelector('input[type=email]') };
});
ok('it opens a dialog with a focused textarea', !!dlg && dlg.focused && dlg.hasMail, JSON.stringify(dlg));

/* 7. empty message is refused without a request */
let posts = 0;
await page.route('**/api/report', (r) => {
  posts++;
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
});
await page.click('[role="dialog"][aria-label="Report a bug"] button:has-text("Send report")');
await page.waitForTimeout(300);
const emptyRefused = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"][aria-label="Report a bug"]');
  const s = d && d.querySelector('[role=status]');
  return { still: !!d, said: s ? s.textContent : '' };
});
ok('an empty report is refused without a request', posts === 0 && emptyRefused.still, `${posts} request(s), "${emptyRefused.said}"`);

/* 3-4. a real send */
let payload = null;
await page.unroute('**/api/report');
await page.route('**/api/report', async (r) => {
  payload = r.request().postDataJSON();
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
});
await page.fill('[role="dialog"][aria-label="Report a bug"] textarea', 'Pinching to zoom deleted a stroke on my phone.');
await page.fill('[role="dialog"][aria-label="Report a bug"] input[type=email]', 'me@example.com');
await page.click('[role="dialog"][aria-label="Report a bug"] button:has-text("Send report")');
await page.waitForTimeout(500);
const afterSend = await page.evaluate(() => ({
  closed: !document.querySelector('[role="dialog"][aria-label="Report a bug"]'),
  toast: (document.getElementById('toast') || {}).textContent || '',
}));
ok('a real send closes the dialog', afterSend.closed, JSON.stringify(afterSend));
ok('and says the report went out', /thank/i.test(afterSend.toast), afterSend.toast);
ok(
  'the message and reply address are posted',
  !!payload && payload.message.includes('Pinching to zoom') && payload.email === 'me@example.com',
  payload ? payload.email : 'no payload'
);
ok(
  'the post carries build context',
  !!payload && /version:/.test(payload.context) && /device:/.test(payload.context) && /screen:/.test(payload.context),
  payload ? payload.context.split('\n')[0] : 'none'
);

/* 5. 503 → mail draft */
const reopen = async () => {
  await page.click('#bug-btn');
  await page.waitForTimeout(250);
};
await page.unroute('**/api/report');
await page.route('**/api/report', (r) =>
  r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unconfigured' }) })
);
await reopen();
await page.fill('[role="dialog"][aria-label="Report a bug"] textarea', 'second report');
await page.click('[role="dialog"][aria-label="Report a bug"] button:has-text("Send report")');
await page.waitForTimeout(500);
const unconf = await page.evaluate(() => ({
  closed: !document.querySelector('[role="dialog"][aria-label="Report a bug"]'),
  toast: (document.getElementById('toast') || {}).textContent || '',
}));
ok('an unconfigured endpoint falls back to a draft', unconf.closed && /mail app/i.test(unconf.toast), unconf.toast);

/* 6. 200 + HTML (SPA fallback) must not count as a send */
await page.unroute('**/api/report');
await page.route('**/api/report', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>' })
);
await reopen();
await page.fill('[role="dialog"][aria-label="Report a bug"] textarea', 'third report');
await page.click('[role="dialog"][aria-label="Report a bug"] button:has-text("Send report")');
await page.waitForTimeout(500);
const html = await page.evaluate(() => ({
  closed: !document.querySelector('[role="dialog"][aria-label="Report a bug"]'),
  toast: (document.getElementById('toast') || {}).textContent || '',
}));
ok('a 200 with HTML is not treated as sent', html.closed && /mail app/i.test(html.toast), html.toast);

/* 8. Escape */
await reopen();
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
ok('Escape closes the dialog', await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Report a bug"]')));

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.screenshot({ path: `shots/bug-report${TAG ? '-' + TAG : ''}.png` });
await ctx.close();
await browser.close();

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
