import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
const page = await ctx.newPage();
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

const snap = () =>
  page.evaluate(() => {
    const s = document.getElementById('stage');
    const st = document.getElementById('pstrip');
    return {
      flow: document.documentElement.dataset.flow || '(none)',
      pi: window.eval('pi'),
      n: window.eval('nb.pages.length'),
      sheets: st ? [...st.children].map((e) => e.dataset.i ?? 'live') : [],
      scrollTop: Math.round(s.scrollTop),
      scrollH: s.scrollHeight,
      clientH: s.clientHeight,
    };
  });

console.log('start   ', JSON.stringify(await snap()));

// wheel over the canvas scrolls the strip instead of turning pages
const cvBox = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(cvBox.x, cvBox.y);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(800);
console.log('wheel   ', JSON.stringify(await snap()));

// a thumbnail click should land on that page, not flip
await page.evaluate(() => {
  document.getElementById('side-t').click();
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const c = document.querySelectorAll('#side canvas')[0];
  c?.click();
});
await page.waitForTimeout(800);
console.log('thumb 0 ', JSON.stringify(await snap()));

// add a page after the current one
await page.evaluate(() => document.getElementById('add').click());
await page.waitForTimeout(900);
console.log('add     ', JSON.stringify(await snap()));

// duplicate, then delete
await page.evaluate(() => document.getElementById('dup').click());
await page.waitForTimeout(900);
console.log('dup     ', JSON.stringify(await snap()));
await page.evaluate(() => document.getElementById('del').click());
await page.waitForTimeout(200);
await page.evaluate(() => document.getElementById('del').click());
await page.waitForTimeout(900);
console.log('del     ', JSON.stringify(await snap()));

// persistence: reload and reopen
await page.evaluate(() => window.eval('save()'));
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1400);
const persisted = await page.evaluate(() => localStorage.getItem('inkpad-page-flow'));
console.log('saved   ', persisted);
await page.evaluate(() => {
  const n = window.lib.find((x) => x.name === 'Strip');
  if (n) window.openNotebook(n);
});
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(600);
console.log('reopen  ', JSON.stringify(await snap()));
await page.screenshot({ path: 'shots/strip-reopen.png' });

await browser.close();
