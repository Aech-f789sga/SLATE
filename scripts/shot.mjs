/**
 * Screenshot themes the way a person would wear them.
 *
 * Setting `data-gx-theme` by hand is not enough and quietly lies: that
 * attribute only drives the CSS skins. The palette, the feel variables and the
 * wallpaper are applied by themes.ts, which is private — so the only honest
 * way to put a theme on is to open the picker and click the card, exactly like
 * a user. Doing it by attribute produced a screenshot of a theme that had its
 * material but none of its colour.
 *
 *   node scripts/shot.mjs <theme-id> [...]
 */

import { chromium } from 'playwright';

const themes = process.argv.slice(2);
if (!themes.length) {
  console.error('usage: node scripts/shot.mjs <theme-id> [...]');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 1,
});

await page.addInitScript(() => {
  // A first-run tour covers the shelf and eats every click. Mark it done the
  // way the tour itself does, so the probe can drive the real UI.
  localStorage.setItem('inkpad-tour-home-v2', '1');
  localStorage.setItem('inkpad-tour-editor-v2', '1');
  localStorage.setItem('inkpad-install-dismissed', '1');
});

await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gx-theme-btn', { state: 'attached', timeout: 15000 });

async function wear(id) {
  await page.click('#gx-theme-btn');
  await page.waitForSelector('.gxp-grid .gxp-card', { state: 'attached' });

  const ok = await page.evaluate((want) => {
    const cards = [...document.querySelectorAll('.gxp-grid .gxp-card')];
    const card = cards.find((c) => c.dataset.id === want);
    if (!card) return false;
    card.click();
    return true;
  }, id);

  if (!ok) throw new Error(`no picker card for theme "${id}"`);
  await page.waitForTimeout(600);
  // close the picker so it does not cover the shelf in the shot
  await page.evaluate(() => {
    document.querySelector('.gxp-x')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(500);
}

for (const id of themes) {
  await wear(id);
  await page.screenshot({ path: `shots/${id}.png` });
  const applied = await page.evaluate(() => ({
    theme: document.documentElement.dataset.gxTheme,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    wallOn: document.getElementById('gx-wall')?.dataset.on,
  }));
  console.log(`${id.padEnd(26)} gx-theme:${applied.theme.padEnd(26)} --bg:${applied.bg} wall:${applied.wallOn}`);
}

await browser.close();
