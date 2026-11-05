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
});

const theme = async (id) => {
  await page.evaluate((id) => {
    const t = window.__inkpadTheme;
    t.choice.id = id;
    t.choice.mode = 'dark';
    t.choice.wall = true;
    t.apply();
  }, id);
  await page.waitForTimeout(1500);
};

const state = () =>
  page.evaluate(() => {
    const g = document.getElementById('gxm');
    return {
      on: !!g && g.classList.contains('on'),
      state: g?.dataset.state,
      badge: g?.querySelector('.gxm-badge')?.textContent,
    };
  });

// unlock with a real gesture on empty shelf
await theme('lofi-chill');
await page.mouse.click(980, 560);
await page.waitForTimeout(1500);
const a = await state();

// away to a built-in theme that ships no music
await theme('slate');
const b = await state();

// and back
await theme('lofi-chill');
await page.waitForTimeout(2200);
const c = await state();

console.log(JSON.stringify({ playing: a, away: b, back: c }, null, 1));
await browser.close();
