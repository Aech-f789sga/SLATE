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
  t.choice.wall = true;
  t.apply();
  window.lib.push({
    id: 'z' + Math.random(),
    name: 'Stack probe',
    upd: Date.now(),
    cover: '#2f6df6',
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  });
  window.eval('save()');
  window.showLib();
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1700);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
  document.getElementById('pgm')?.click();
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/stack-card.png' });

const info = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      z: cs.zIndex,
      pos: cs.position,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      h: Math.round(r.height),
      ov: cs.overflow,
    };
  };
  // what is actually on top at the card's bottom edge?
  const bar = document.getElementById('bar2');
  const r = bar.getBoundingClientRect();
  const probes = [0.5, 0.85, 0.97].map((f) => {
    const y = Math.round(r.top + r.height * f);
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), y);
    return { y, hit: el ? (el.id || el.className || el.tagName) + '' : null };
  });
  return {
    bar2: pick('#bar2'),
    pg: pick('#pg'),
    inkPen: pick('#ink-pen'),
    gxm: pick('#gxm'),
    tb: pick('#tb'),
    probes,
    vh: innerHeight,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
