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
    name: 'Minecraft probe',
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
await page.screenshot({ path: 'shots/stack-mc.png' });

const info = await page.evaluate(() => {
  const bar = document.getElementById('bar2');
  const cs = getComputedStyle(bar);
  const r = bar.getBoundingClientRect();
  const sel = bar.querySelector('select');
  const sr = sel?.getBoundingClientRect();
  // what paints at a point just inside the card, over the page behind it?
  const hit = document.elementFromPoint(Math.round(r.left + 20), Math.round(r.top + r.height - 8));
  return {
    bg: cs.backgroundColor,
    img: cs.backgroundImage,
    clip: cs.clipPath,
    z: cs.zIndex,
    rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    vh: innerHeight,
    bottomOverflow: Math.round(r.bottom - innerHeight),
    selectRect: sr && { t: Math.round(sr.top), b: Math.round(sr.bottom) },
    hit: hit ? hit.id || hit.className : null,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
