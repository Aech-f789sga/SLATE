import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
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
await page.waitForTimeout(600);

console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const d = document.getElementById('pen-dock');
      const tb = document.getElementById('tb');
      const r = d.getBoundingClientRect();
      const t = tb.getBoundingClientRect();
      const cs = getComputedStyle(d);
      return {
        innerH: window.innerHeight,
        mqShort: matchMedia('(max-height:520px)').matches,
        slotH: cs.getPropertyValue('--slot-h'),
        cy: cs.getPropertyValue('--cy'),
        dock: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
        tbBottom: Math.round(t.bottom),
        foot: [...d.querySelectorAll('.pd-foot > *')].map((n) => {
          const b = n.getBoundingClientRect();
          return `${n.className || n.tagName} ${Math.round(b.top)}..${Math.round(b.bottom)}`;
        }),
        slots: [...d.querySelectorAll('.pd-slot')].map((n) => {
          const b = n.getBoundingClientRect();
          return `${Math.round(b.top)}..${Math.round(b.bottom)}`;
        }),
      };
    }),
    null,
    1,
  ),
);
await browser.close();
