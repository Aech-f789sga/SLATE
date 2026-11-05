/**
 * Does every file the media table promises actually exist?
 *
 * The panel saying "4 layers · synced" only proves the table is wired; it says
 * nothing about whether those four paths resolve. So this wears each theme in
 * turn with music and effects switched on, and watches the network: anything
 * under /mods/ that does not come back 200 is a broken promise, and the
 * <audio> elements would have failed silently in exactly that way.
 *
 *   node scripts/probe-media-urls.mjs
 */

import { chromium } from 'playwright';

const THEMES = [
  'anime',
  'lofi-chill',
  'cyberdeck',
  'minecraft-sound-fireplace',
  'cozy',
  'horror',
  'violet-nebula',
  'medieval',
  'spaced-out',
  'legendary-rift',
  'the-traveller',
  'capybara-party',
  'blockified',
  'day-one',
];

const browser = await chromium.launch();
const page = await browser.newPage();

const seen = new Map(); // url -> status
const bad = [];

page.on('response', (res) => {
  const url = res.url();
  if (!url.includes('/mods/')) return;
  const status = res.status();
  seen.set(url, status);
  // 206 is the normal answer for audio: the browser asks for a byte range so it
  // can seek without downloading the whole file. Only 2xx counts as missing.
  if (status !== 200 && status !== 206) bad.push(`${status} ${url}`);
});

await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gxm', { state: 'attached', timeout: 15000 });

// Turn on the two switches that cause files to be requested: the soundtrack
// and the interface sounds. Both default to off for effects.
await page.evaluate(() => {
  document.documentElement.dataset.gxTheme = 'anime';
});
await page.waitForSelector('.gxm-fab', { state: 'attached', timeout: 15000 });
await page.mouse.click(400, 300);

for (const id of THEMES) {
  await page.evaluate((t) => {
    document.documentElement.dataset.gxTheme = t;
  }, id);
  // give the stems a moment to be created and start fetching
  await page.waitForTimeout(700);

  // poke the effects pool so its mp3s are requested too
  await page.evaluate(() => {
    const sw = document.querySelector('.gxm-sfx-row .gxm-sw');
    if (sw && sw.getAttribute('aria-checked') !== 'true') sw.click();
  });
  await page.waitForTimeout(250);
  // play a click so at least one effect sample is fetched
  await page.mouse.click(20, 20);
  await page.waitForTimeout(250);
}

// Flush whatever is still in flight.
await page.waitForTimeout(1500);

const mods = [...seen.entries()].filter(([u]) => u.includes('/mods/'));
console.log(`requests seen under /mods/: ${mods.length}`);
console.log(`non-200: ${bad.length}`);
for (const b of bad) console.log('  ' + b);

// Group by mod to show the shape of what was actually fetched.
const byMod = new Map();
for (const [url] of mods) {
  const id = url.split('/mods/')[1]?.split('/')[0] ?? '?';
  byMod.set(id, (byMod.get(id) ?? 0) + 1);
}
console.log('--- per mod ---');
for (const [id, n] of [...byMod.entries()].sort()) console.log(`  ${id.padEnd(28)} ${n}`);

await browser.close();
