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

console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const p = document.getElementById('ink-pen');
      if (!p) return { missing: true };
      const r = p.getBoundingClientRect();
      const cs = getComputedStyle(p);
      return {
        box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        vw: window.innerWidth,
        overflowX: cs.overflowX,
        wrap: cs.flexWrap,
        scrollW: p.scrollWidth,
        clientW: p.clientWidth,
        children: [...p.children].map((n) => {
          const b = n.getBoundingClientRect();
          return {
            cls: n.className || n.tagName.toLowerCase(),
            w: Math.round(b.width),
            h: Math.round(b.height),
            kids: n.children.length,
            btnW: n.children[0] ? Math.round(n.children[0].getBoundingClientRect().width) : null,
          };
        }),
      };
    }),
    null,
    1,
  ),
);
await browser.close();
