import { chromium } from 'playwright';

const id = process.argv[2] || 'horror';
const browser = await chromium.launch();
const errors = [];

for (const mode of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(mode + ' ' + e.message));
  await page.goto('http://[::1]:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(
    ([id, mode]) => {
      const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
      b?.click();
      document.getElementById('tour-root')?.remove();
      const t = window.__inkpadTheme;
      t.choice.id = id;
      t.choice.mode = mode;
      t.choice.wall = true;
      t.apply();
      const mk = (n) => ({
        id: n + Math.random(),
        name: n,
        upd: Date.now() - Math.random() * 1e7,
        cover: '#2f6df6',
        pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
      });
      window.lib.push(mk('Field notes'), mk('Chapter two'), mk('Sketchbook'));
      window.eval('save()');
      window.showLib();
    },
    [id, mode],
  );
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `shots/theme-${id}-${mode}.png` });
  await ctx.close();
}

await browser.close();
console.log(errors.length ? errors.slice(0, 4).join('\n') : 'ok');
