import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'R', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(500);

const vw = await page.evaluate(() => window.innerWidth);

// every control in the pill must be inside the viewport and at least 20 px wide
const geom = await page.evaluate(() => {
  const p = document.getElementById('ink-pen');
  return [...p.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { t: b.title.slice(0, 18), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
  });
});
const off = geom.filter((g) => g.l < 0 || g.r > vw);
console.log('controls', geom.length, 'off-screen', off.length, off.length ? JSON.stringify(off) : '');

// the last colour swatch is the one that used to be hidden behind the edge
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#ink-pen .sw')].find((x) => x.title === '#9b5de5');
  b.click();
});
await page.waitForTimeout(250);
console.log('purple picked ->', await page.evaluate(() => window.eval('color')));

// the gear must open a sheet that fits the screen
await page.evaluate(() => document.querySelector('#ink-pen button[title="Pen settings"]').click());
await page.waitForTimeout(400);
console.log(
  'sheet',
  JSON.stringify(
    await page.evaluate(() => {
      const s = document.querySelector('.ink-sheet.on') || document.querySelector('.ink-sheet');
      if (!s) return 'none';
      const r = s.getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), vw: window.innerWidth };
    }),
  ),
);
await page.screenshot({ path: 'shots/phone-pill-sheet.png' });
await browser.close();
