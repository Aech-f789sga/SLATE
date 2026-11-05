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
  const chain = (el) => {
    const rows = [];
    let n = el;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      rows.push({
        tag: n.id ? '#' + n.id : n.tagName + '.' + String(n.className).split(' ')[0],
        z: cs.zIndex,
        pos: cs.position,
        tf: cs.transform !== 'none' || cs.filter !== 'none' || cs.clipPath !== 'none',
      });
      n = n.parentElement;
    }
    return rows;
  };
  return {
    pen: chain(document.getElementById('ink-pen')),
    card: chain(document.getElementById('bar2')),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
