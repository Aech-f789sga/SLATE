import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
const page = await ctx.newPage();
await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
  const t = window.__inkpadTheme;
  t.choice.id = 'anime';
  t.choice.wall = true;
  t.apply();
});
await page.waitForTimeout(1000);
await page.mouse.click(980, 560);
await page.waitForTimeout(2000);

const s = await page.evaluate(() => {
  const g = document.getElementById('gxm');
  return {
    panel: g?.className,
    state: g?.dataset.state,
    badge: g?.querySelector('.gxm-badge')?.textContent,
    track: g?.querySelector('.gxm-track')?.textContent,
    wall: g?.querySelector('.gxm-wall-label')?.textContent,
  };
});
console.log(JSON.stringify(s));
await browser.close();
