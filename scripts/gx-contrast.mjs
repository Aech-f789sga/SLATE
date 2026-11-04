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
  const t = window.__inkpadTheme;
  t.choice.id = 'cyberdeck';
  t.choice.mode = 'dark';
  t.apply();
});
await page.waitForTimeout(400);

const scan = () =>
  page.evaluate(() => {
    const parse = (c) => {
      const m = (c || '').match(/[\d.]+/g);
      if (!m) return null;
      return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.5) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childElementCount && (el.textContent || '').trim().length < 2) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.3) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 8) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      // only leaf-ish text nodes matter
      const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!hasOwnText) continue;
      const fg = parse(s.color);
      if (!fg || fg.a < 0.3) continue;
      const bg = bgOf(el);
      const l1 = lum(fg);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < 2.2) {
        bad.push({
          sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.') : ''),
          text: el.textContent.trim().slice(0, 18),
          fg: s.color,
          bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
          ratio: +ratio.toFixed(2),
        });
      }
    }
    return bad.slice(0, 25);
  });

const shot = async (label, file) => {
  const bad = await scan();
  console.log(`\n== ${label}: ${bad.length} low-contrast`);
  for (const b of bad) console.log(`  ${b.ratio}  ${b.sel}  "${b.text}"  ${b.fg} on ${b.bg}`);
  if (file) await page.screenshot({ path: file });
};

await shot('shelf', 'shots/gx-c-shelf.png');

await page.evaluate(() => document.querySelector('#grid .new')?.click());
await page.waitForTimeout(800);
await shot('create sheet', 'shots/gx-c-create.png');
await page.evaluate(() => document.querySelector('#md .box .gn-st-foot button, #md .box button')?.click());
await page.waitForTimeout(400);

await page.evaluate(() => document.getElementById('gn-study-btn')?.click());
await page.waitForTimeout(800);
await shot('study', 'shots/gx-c-study.png');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await page.evaluate(() => document.getElementById('gn-board')?.click());
await page.waitForTimeout(900);
await shot('board', 'shots/gx-c-board.png');

await browser.close();
