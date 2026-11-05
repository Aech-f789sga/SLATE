import { chromium } from 'playwright';
const browser = await chromium.launch();
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
  t.choice.id = 'lofi-chill';
  t.choice.mode = 'light';
  t.choice.wall = true;
  t.apply();
});
await page.waitForTimeout(1400);

const audit = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter : '';
    const f = cs.filter && cs.filter !== 'none' ? cs.filter : '';
    if (!bf && !f) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 20000) continue;
    out.push({
      sel: el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0],
      bf,
      f,
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }
  const wall = document.getElementById('gx-wall');
  const wcs = getComputedStyle(wall);
  return {
    blurs: out,
    wall: {
      bg: wcs.backgroundImage.slice(0, 80),
      size: wcs.backgroundSize,
      filter: wcs.filter,
      opacity: wcs.opacity,
      attr: document.documentElement.dataset.gxWallfx,
    },
    dpr: devicePixelRatio,
  };
});
console.log(JSON.stringify(audit, null, 1));
await browser.close();
