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
  t.choice.id = 'lofi-chill';
  t.choice.wall = true;
  t.apply();
  window.lib.push({
    id: 'e' + Math.random(),
    name: 'Eraser probe',
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
  // select the eraser the way the toolbar does
  window.eval("try{ tool='er'; syncTools(); }catch(e){}");
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/eraser-strip.png', clip: { x: 300, y: 40, width: 700, height: 180 } });

const state = await page.evaluate(() => {
  const s = document.querySelector('#ink-pen .wsl');
  if (!s) return { slider: false };
  const before = { min: s.min, max: s.max, value: s.value };
  s.value = String(Math.round((Number(s.min) + Number(s.max)) / 2));
  s.dispatchEvent(new Event('input', { bubbles: true }));
  return {
    slider: true,
    before,
    after: s.value,
    title: s.title,
    // does the dock's eraser agree?
    dock: document.querySelector('#pen-dock [data-tool="er"]')?.getAttribute('data-w') ?? null,
    stored: (() => {
      try {
        return localStorage.getItem('inkpad-widths');
      } catch {
        return null;
      }
    })(),
  };
});
console.log(JSON.stringify(state));
await browser.close();
