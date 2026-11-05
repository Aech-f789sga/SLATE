import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
const page = await ctx.newPage();
await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1300);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
  const t = window.__inkpadTheme;
  t.choice.id = 'lofi-chill';
  t.choice.mode = 'light';
  t.choice.wall = true;
  t.apply();
});
await page.waitForTimeout(1400);
await page.screenshot({ path: 'shots/fix-lofi-light-hd.png' });

// New notebook dialog: the lined cover preview
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /new/i.test(x.textContent || ''));
  b?.click();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/fix-new-notebook.png' });

const geom = await page.evaluate(() => {
  const cv = document.querySelector('#nm-prev canvas, .nm-cover canvas, canvas');
  const r = cv?.getBoundingClientRect();
  return { has: !!cv, w: r && Math.round(r.width), h: r && Math.round(r.height) };
});
console.log(JSON.stringify(geom));
await browser.close();
