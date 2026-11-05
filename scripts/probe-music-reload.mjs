/**
 * Does the soundtrack start on its own after a reload?
 *
 * The report was: refresh, music is silent, open the music panel, music
 * starts. That smells like the audio only ever beginning inside the panel's
 * click handler, so this probe reloads with a theme already chosen and does
 * *nothing* for a few seconds, then counts requests for the stems.
 *
 *   node scripts/probe-music-reload.mjs
 */

import { chromium } from 'playwright';

const browser = await chromium.launch({
  // A returning visitor is allowed to autoplay by Chrome's media engagement
  // rules. `no-user-gesture-required` reproduces that allowance, so a failure
  // here is our bug rather than the browser's policy.
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ serviceWorkers: 'block' });
const page = await ctx.newPage();

await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v2', '1');
  localStorage.setItem('inkpad-tour-editor-v2', '1');
  localStorage.setItem('inkpad-install-dismissed', '1');
});

const stemHits = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('/mods/') && u.includes('/music/')) stemHits.push(u);
});

// Pick a theme that has music, so the reload restores it.
await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gx-theme-btn', { state: 'attached', timeout: 15000 });
await page.click('#gx-theme-btn');
await page.waitForSelector('.gxp-card', { state: 'attached' });
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.gxp-card')].find((x) => x.dataset.id === 'anime');
  c?.click();
});
await page.waitForTimeout(1200);

// Reload — this is the moment the user describes.
stemHits.length = 0;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gx-theme-btn', { state: 'attached', timeout: 15000 });

// Do not touch anything.
await page.waitForTimeout(3000);

const theme = await page.evaluate(() => document.documentElement.dataset.gxTheme);
console.log(`theme after reload: ${theme}`);
console.log(`stem requests with no interaction: ${stemHits.length}`);
for (const h of stemHits.slice(0, 4)) console.log('  ' + h.split('/mods/')[1]);

// Now click somewhere harmless and see whether that is what starts it.
await page.mouse.click(640, 600);
await page.waitForTimeout(1500);
console.log(`stem requests after one click: ${stemHits.length}`);

await browser.close();
