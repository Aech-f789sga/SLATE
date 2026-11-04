import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160));
});
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});
await page.waitForTimeout(500);

const btn = await page.evaluate(() => {
  const b = document.getElementById('gx-theme-btn');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { text: b.textContent?.trim(), w: Math.round(r.width), h: Math.round(r.height) };
});
console.log('shelf theme button:', JSON.stringify(btn));

await page.screenshot({ path: 'shots/theme-home.png' });

// open the picker
await page.evaluate(() => window.__inkpadTheme.open());
await page.waitForTimeout(600);
const cards = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#gx-theme-panel .gxp-card')];
  return { count: c.length, names: c.slice(0, 6).map((x) => x.querySelector('.gxp-name')?.textContent) };
});
console.log('picker cards:', JSON.stringify(cards));
await page.screenshot({ path: 'shots/theme-panel.png' });

// pick Cyberdeck, then screenshot the shelf
const applied = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#gx-theme-panel .gxp-card')].find(
    (x) => (x.querySelector('.gxp-name')?.textContent || '') === 'Cyberdeck'
  );
  c?.click();
  const cs = getComputedStyle(document.documentElement);
  return {
    theme: document.documentElement.dataset.theme,
    bg: cs.getPropertyValue('--bg').trim(),
    ac: cs.getPropertyValue('--ac').trim(),
    wall: getComputedStyle(document.getElementById('gx-wall')).backgroundImage.slice(0, 70),
  };
});
console.log('after Cyberdeck:', JSON.stringify(applied, null, 1));
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('gx-theme-panel').classList.remove('on'));
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/theme-cyberdeck.png' });

// dark mode variant
await page.evaluate(() => {
  const b = document.querySelector('#gx-theme-panel .gxp-modes button[data-m="dark"]');
  b?.click();
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/theme-dark.png' });

await browser.close();
