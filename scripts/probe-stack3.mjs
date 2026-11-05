import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
  t.choice.id = 'minecraft-sound-fireplace';
  t.choice.wall = true;
  t.apply();
  window.lib.push({
    id: 'm' + Math.random(),
    name: 'P',
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

const out = await page.evaluate(() => {
  const bar = document.getElementById('bar2');
  const r = bar.getBoundingClientRect();
  const pts = [
    [r.left + 30, r.top + 150],
    [r.left + 5, r.top + 150],
    [r.right - 30, r.bottom - 30],
    [r.left + 30, r.top + 5],
  ];
  return pts.map(([x, y]) => {
    const el = document.elementFromPoint(Math.round(x), Math.round(y));
    if (!el) return { x: Math.round(x), y: Math.round(y), hit: null };
    const cs = getComputedStyle(el);
    return {
      x: Math.round(x),
      y: Math.round(y),
      hit: el.id ? '#' + el.id : el.tagName + '.' + String(el.className).split(' ')[0],
      z: cs.zIndex,
      pos: cs.position,
    };
  });
});
console.log(JSON.stringify(out));
await browser.close();
