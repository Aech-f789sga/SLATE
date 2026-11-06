/**
 * Behavioural probe for the in-app update check.
 *
 * Serves nothing itself: point it at a `vite preview` of dist/. It rewrites
 * dist/version.json mid-run to simulate a deploy landing under a running client,
 * which is the exact situation the feature exists for.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const URL_BASE = process.argv[2] || 'http://localhost:4199/';
const VERSION_FILE = process.argv[3] || 'dist/version.json';

const FIRST_CHECK_MS = 8000; // must match FIRST_CHECK_DELAY_MS in updateCheck.ts
const SETTLE = FIRST_CHECK_MS + 3500;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const original = fs.readFileSync(VERSION_FILE, 'utf8');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const cardClass = () =>
  page.evaluate(() => document.querySelector('.slate-upd')?.className ?? '(absent)');
const isOn = async () => (await cardClass()).includes('on');

/** The onboarding tour owns the screen on a fresh profile and mounts on its own
 *  schedule, so racing it with clicks is unreliable. Pin it closed with CSS:
 *  overlayOpen() reads computed style, so this reads as "no overlay". */
async function dismissTour() {
  await page
    .addStyleTag({ content: '#tour-root{display:none!important}' })
    .catch(() => {});
  await sleep(300);
}

try {
  /* 1. Same version deployed — nothing should appear. */
  console.log('\n[1] client and server on the same version');
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await dismissTour();
  await sleep(SETTLE);
  const homeExists = await page.evaluate(() => !!document.getElementById('lib'));
  check('library screen rendered', homeExists, homeExists ? '' : '#lib missing');
  check('no prompt when versions match', !(await isOn()), await cardClass());

  /* 2. A newer deploy appears. */
  console.log('\n[2] a newer build is deployed while the client runs');
  fs.writeFileSync(
    VERSION_FILE,
    JSON.stringify({ version: 'probe-newer-build', builtAt: new Date().toISOString() }, null, 2)
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await dismissTour();
  await sleep(SETTLE);
  const msg = await page.evaluate(
    () => document.querySelector('.slate-upd .msg')?.textContent ?? ''
  );
  check('prompt appears on home', await isOn(), await cardClass());
  check('prompt names the version', msg.includes('probe-newer-build'), msg);
  await page.screenshot({ path: 'update-prompt-home.png' });

  /* 3. Opening a note must hide it. */
  console.log('\n[3] user opens a note');
  await page.evaluate(() => {
    document.getElementById('ed')?.style.setProperty('display', 'flex');
  });
  await sleep(2200);
  check('prompt hidden inside a note', !(await isOn()), await cardClass());

  /* 4. Back to home — it returns. */
  console.log('\n[4] user returns to home');
  await page.evaluate(() => {
    document.getElementById('ed')?.style.setProperty('display', 'none');
  });
  await sleep(2200);
  check('prompt returns on home', await isOn(), await cardClass());

  /* 5. A modal must suppress it. */
  console.log('\n[5] a modal is open');
  await page.evaluate(() => document.getElementById('md')?.classList.add('on'));
  await sleep(2200);
  check('prompt hidden behind a modal', !(await isOn()), await cardClass());
  await page.evaluate(() => document.getElementById('md')?.classList.remove('on'));
  await sleep(2200);
  check('prompt returns when the modal closes', await isOn(), await cardClass());

  /* 6. "Later" snoozes it. */
  console.log('\n[6] user taps Later');
  await page.click('.slate-upd .later');
  await sleep(600);
  const snoozeMs =
    Number(await page.evaluate(() => localStorage.getItem('slate.upd.snooze'))) - Date.now();
  check('prompt hidden after Later', !(await isOn()), await cardClass());
  check(
    'snooze stored for ~3h',
    snoozeMs > 2.5 * 3600e3 && snoozeMs < 3.5 * 3600e3,
    `${(snoozeMs / 3600e3).toFixed(1)}h`
  );

  /* 7. Snooze expires — it comes back without a reload. */
  console.log('\n[7] snooze expires');
  await page.evaluate(() => localStorage.setItem('slate.upd.snooze', '0'));
  await sleep(2200);
  check('prompt returns after snooze expires', await isOn(), await cardClass());
} finally {
  fs.writeFileSync(VERSION_FILE, original);
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (errors.length) {
  console.log('\n--- page errors ---');
  console.log(errors.slice(0, 8).join('\n'));
}
process.exit(failed.length ? 1 : 0);
