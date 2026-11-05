/**
 * Did each theme's material actually land?
 *
 * A family sets `--mt-r`, `--mt-blur` and friends on the theme's root, and the
 * generic rules read them. So the honest test is to wear the theme and read
 * the *computed* value back off a real panel — if the family did not apply,
 * `--mt-r` is empty and the panel keeps its default radius.
 *
 *   node scripts/probe-materials.mjs [theme ...]
 */

import { chromium } from 'playwright';

const ALL = [
  'slate',
  'day-one',
  'msi',
  'cyberdeck',
  'minecraft-sound-fireplace',
  'lofi-chill',
  'grand-theft-auto-san-andreas',
  'blockified',
  'violet-nebula',
  'anime',
  'monkey-rizz',
  'the-traveller',
  'cozy',
  'creamy-keyboard',
  'hollow-knight',
  'elden-ring',
  'japanese-lofi-mix',
  'horror',
  'black-hole',
  'josh-hutcherson',
  'spaced-out',
  'medieval',
  'legendary-rift',
  'naruto-itachi-uchiha',
  'capybara-party',
];

const themes = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gxm', { state: 'attached', timeout: 15000 });

const rows = [];
for (const id of themes) {
  await page.evaluate((t) => {
    document.documentElement.dataset.gxTheme = t;
  }, id);
  await page.waitForTimeout(180);

  const info = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const tb = document.querySelector('#tb');
    const tbc = tb ? getComputedStyle(tb) : null;
    return {
      r: root.getPropertyValue('--mt-r').trim(),
      blur: root.getPropertyValue('--mt-blur').trim(),
      tbRadius: tbc?.borderRadius ?? '',
      tbBlur: tbc?.backdropFilter ?? '',
      tbBg: (tbc?.backgroundColor ?? '').slice(0, 30),
    };
  });
  rows.push({ id, ...info });
}

for (const r of rows) {
  const has = r.r ? 'mat ' : '--- ';
  console.log(
    `${has}${r.id.padEnd(28)} --mt-r:${(r.r || 'none').padEnd(8)} tb-radius:${(r.tbRadius || '?').padEnd(10)} blur:${r.blur || 'none'}`,
  );
}

const missing = rows.filter((r) => !r.r).map((r) => r.id);
console.log(`\nno material: ${missing.length ? missing.join(', ') : 'none'}`);

await browser.close();
