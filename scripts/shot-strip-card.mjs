import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const mk = (tpl) => ({ tpl, col: '', strokes: [], pw: 800, ph: 1100 });
  const n = { id: Date.now(), name: 'Strip', upd: Date.now(), pages: [mk('lined'), mk('lined'), mk('lined')] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.evaluate(() => window.__inkpad_pagestrip.set(true));
await page.waitForTimeout(700);
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(800);
const box = await page.evaluate(() => {
  const r = document.getElementById('bar2').getBoundingClientRect();
  return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: Math.min(r.width + 12, 1400), height: Math.min(r.height + 12, 880) };
});
await page.screenshot({ path: 'shots/strip-card-full.png', clip: box });
const chips = await page.evaluate(() => {
  const h = document.querySelector('#bar2 .pgm-flow');
  return [...h.querySelectorAll('button')].map((b) => ({ t: b.textContent, bg: getComputedStyle(b).backgroundColor, c: getComputedStyle(b).color, bd: getComputedStyle(b).borderColor }));
});
console.log(JSON.stringify(chips, null, 1));
await browser.close();
