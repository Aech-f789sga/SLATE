/**
 * Check that every theme with a soundtrack actually reports it.
 *
 * For each theme id: wear the theme, let the panel refresh, then read what the
 * panel says it is playing. That is the only honest test — the media table
 * being correct on disk says nothing about whether the engine picked it up.
 *
 *   node scripts/probe-mods.mjs
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

// The app unlocks audio on the first gesture, and the panel reports LIVE only
// once playback has actually started.
//
// Not `networkidle`: the audio elements preload with `preload="auto"` and keep
// the network busy, so that state never settles and the navigation times out.
await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gxm', { state: 'attached', timeout: 15000 });

// The pill is only built once a theme that ships media is worn — the default
// Slate theme has no soundtrack, so there is nothing to show a pill about.
await page.evaluate(() => {
  document.documentElement.dataset.gxTheme = 'anime';
});
await page.waitForSelector('.gxm-fab', { state: 'attached', timeout: 15000 });
await page.mouse.click(400, 300);

const rows = [];
for (const id of THEMES) {
  await page.evaluate((t) => {
    document.documentElement.dataset.gxTheme = t;
  }, id);
  await page.waitForTimeout(260);

  const info = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)?.textContent?.trim() ?? '';
    return {
      name: q('.gxm-fab-name'),
      track: q('.gxm-track'),
      wall: q('.gxm-wall-label'),
      badge: q('.gxm-badge'),
      sfxRow: !!document.querySelector('.gxm-sfx-row'),
    };
  });
  rows.push({ id, ...info });
}

for (const r of rows) {
  const ok = r.track ? 'ok  ' : 'MISS';
  console.log(
    `${ok} ${r.id.padEnd(28)} ${r.name.padEnd(24)} | ${r.track.padEnd(22)} | sfx:${r.sfxRow ? 'yes' : 'no '} | ${r.wall}`,
  );
}

await browser.close();
