import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1400);
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => /skip tour/i.test(b.textContent || ''))
    ?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});

const pick = async (name, mode) => {
  await page.evaluate(
    ([n, m]) => {
      const t = window.__inkpadTheme;
      const id = window.__gxIds[n];
      t.choice.id = id;
      t.choice.mode = m;
      t.choice.wall = true;
      t.apply();
    },
    [name, mode]
  );
  await page.waitForTimeout(750);
};

// expose the id list once
const ids = await page.evaluate(async () => {
  const m = await import('/src/themes-data.ts');
  window.__gxIds = {};
  for (const t of m.ALL_THEMES) window.__gxIds[t.name] = t.id;
  return m.ALL_THEMES.map((t) => [t.id, t.name, !!t.wall]);
});
console.log('themes:', ids.length, ids.slice(0, 6));

for (const [name, mode, file] of [
  ['Cyberdeck', 'light', 'shots/gx-light.png'],
  ['Cyberdeck', 'dark', 'shots/gx-dark.png'],
]) {
  await pick(name, mode);
  const info = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    const wall = document.getElementById('gx-wall');
    return {
      wallOn: wall.dataset.on,
      wallOpacity: getComputedStyle(wall).opacity,
      libmBg: cs('#libm').backgroundColor,
      navBg: cs('#nav').backgroundColor,
      navBlur: cs('#nav').backdropFilter,
      rootVars: {
        bg: document.documentElement.style.getPropertyValue('--bg'),
        paper: document.documentElement.style.getPropertyValue('--gn-paper'),
        bar: document.documentElement.style.getPropertyValue('--gx-bar'),
      },
      bodyText: getComputedStyle(document.getElementById('lh')).color,
    };
  });
  console.log(name, mode, JSON.stringify(info));
  await page.screenshot({ path: file });
}

await browser.close();
