import { chromium } from 'playwright';

const browser = await chromium.launch();
const THEMES = ['lofi-chill', 'cyberdeck', 'minecraft-sound-fireplace'];
const MODES = ['dark', 'light'];

for (const id of THEMES) {
  for (const mode of MODES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(id, mode, 'PAGEERROR', e.message));
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#grid', { timeout: 20000 });
    await page.waitForTimeout(1400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
      b?.click();
      document.getElementById('tour-root')?.remove();
    });
    await page.waitForTimeout(400);
    await page.evaluate(
      ([id, mode]) => {
        const t = window.__inkpadTheme;
        t.choice.id = id;
        t.choice.mode = mode;
        t.choice.wall = true;
        t.apply();
      },
      [id, mode]
    );
    await page.waitForTimeout(700);
    // a few notebooks so the shelf is not empty
    await page.evaluate(() => {
      const mk = (name, tpl) => ({
        id: name + Math.random(),
        name,
        upd: Date.now() - Math.random() * 1e7,
        cover: '#2f6df6',
        pages: [{ tpl, col: '', strokes: [], pw: 800, ph: 1100 }],
      });
      window.lib.push(mk('Sunset notes', 'lined'), mk('Chord ideas', 'grid'), mk('Sketchbook', 'blank'));
      window.eval('save()');
      window.showLib();
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `shots/skin-${id}-${mode}-shelf.png` });

    // into a notebook
    await page.evaluate(() => {
      const n = window.lib[window.lib.length - 1];
      window.openNotebook(n);
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
      b?.click();
      document.getElementById('tour-root')?.remove();
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `shots/skin-${id}-${mode}-editor.png` });

    // and with the page card open
    await page.evaluate(() => document.getElementById('pgm')?.click());
    await page.waitForTimeout(700);
    await page.screenshot({ path: `shots/skin-${id}-${mode}-card.png` });
    console.log(id, mode, 'ok');
    await ctx.close();
  }
}
await browser.close();
