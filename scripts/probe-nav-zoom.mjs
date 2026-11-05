/**
 * Zoom ceiling and the sidebar toggle.
 *
 * Zoom is clamped inside the page script, so the only honest test is to click
 * the zoom control and measure the page grow. And the sidebar toggle has to
 * survive a reload, otherwise it is a button that forgets.
 *
 *   node scripts/probe-nav-zoom.mjs
 */

import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();

await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v2', '1');
  localStorage.setItem('inkpad-tour-editor-v2', '1');
  localStorage.setItem('inkpad-install-dismissed', '1');
});

await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gn-new', { state: 'attached', timeout: 15000 });

/* ---------------- sidebar ---------------- */

const before = await page.evaluate(() => {
  const nav = document.getElementById('nav');
  return {
    btn: !!document.getElementById('nav-hide'),
    navShown: !!nav && getComputedStyle(nav).display !== 'none',
    navW: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
    libmW: Math.round(document.getElementById('libm').getBoundingClientRect().width),
  };
});

await page.click('#nav-hide');
await page.waitForTimeout(350);

const after = await page.evaluate(() => {
  const nav = document.getElementById('nav');
  return {
    navShown: !!nav && getComputedStyle(nav).display !== 'none',
    libmW: Math.round(document.getElementById('libm').getBoundingClientRect().width),
    attr: document.documentElement.dataset.nav,
  };
});

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#nav-hide', { state: 'attached', timeout: 15000 });
await page.waitForTimeout(300);
const persisted = await page.evaluate(() => {
  const nav = document.getElementById('nav');
  return {
    navShown: !!nav && getComputedStyle(nav).display !== 'none',
    attr: document.documentElement.dataset.nav,
  };
});

console.log(
  `sidebar: button:${before.btn}  ${before.navW}px -> hidden:${!after.navShown}  ` +
    `shelf ${before.libmW} -> ${after.libmW}px  persisted:${!persisted.navShown}`,
);

// put it back so the zoom test has the normal layout
await page.click('#nav-hide');
await page.waitForTimeout(300);

/* ---------------- zoom ---------------- */

// Open a notebook so there is a page to zoom: New opens the create sheet, and
// its confirm button is #ok.
await page.click('#gn-new');
await page.waitForSelector('#ok', { state: 'visible', timeout: 10000 });
await page.click('#ok');
await page.waitForTimeout(1500);

// The zoom controls live in the page menu, not the toolbar, so drive the same
// handler the app wires to ctrl+wheel on the stage: zoom(1.1) per notch.
const wheel = (deltaY, n) =>
  page.evaluate(
    ([d, count]) => {
      const stage = document.getElementById('stage');
      if (!stage) return;
      for (let i = 0; i < count; i++) {
        stage.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: d,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    [deltaY, n],
  );

const pageWidth = () =>
  page.evaluate(() => {
    // #cv is the page canvas; #pg is the strip of thumbnails along the bottom.
    const cv = document.getElementById('cv');
    if (!cv) return 0;
    return Math.round(cv.getBoundingClientRect().width);
  });

const w0 = await pageWidth();
await wheel(-100, 40);
await page.waitForTimeout(400);
const wMax = await pageWidth();

console.log(`zoom: page ${w0}px -> ${wMax}px after 40 notches (ratio ${(wMax / (w0 || 1)).toFixed(1)}x)`);

// And back down, to be sure the floor still holds.
await wheel(100, 60);
await page.waitForTimeout(400);
const wMin = await pageWidth();
console.log(`zoom floor: ${wMin}px (ratio ${(wMin / (w0 || 1)).toFixed(2)}x of the starting size)`);

await browser.close();
