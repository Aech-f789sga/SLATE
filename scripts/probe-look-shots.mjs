import { chromium } from 'playwright';

const URL = 'http://[::1]:4173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});

await page.evaluate(() => {
  window.lib.push({
    id: 'p' + Math.random(),
    name: 'Room notes',
    upd: Date.now(),
    cover: '#2f6df6',
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  });
  window.eval('save()');
  window.showLib();
});

const setTheme = async (id, mode) => {
  await page.evaluate(
    ([id, mode]) => {
      const t = window.__inkpadTheme;
      t.choice.id = id;
      t.choice.mode = mode;
      t.choice.wall = true;
      t.apply();
    },
    [id, mode],
  );
  await page.waitForTimeout(1000);
};

const setLook = async (hd, alpha) => {
  await page.evaluate(
    ([hd, alpha]) => {
      const p = document.getElementById('gxm');
      p.querySelector(`[data-look="${hd ? 'hd' : 'blur'}"]`)?.click();
      const op = p.querySelector('.gxm-op');
      if (op) {
        op.value = String(alpha);
        op.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    [hd, alpha],
  );
  await page.waitForTimeout(700);
};

// shelf, blur then hd
await setTheme('lofi-chill', 'light');
await setLook(false, 1);
await page.screenshot({ path: 'shots/look2-shelf-blur.png' });
await setLook(true, 1);
await page.screenshot({ path: 'shots/look2-shelf-hd.png' });

// editor, hd then blur
await page.evaluate(() => window.openNotebook(window.lib[window.lib.length - 1]));
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/look2-editor-hd.png' });
await setLook(false, 1);
await page.screenshot({ path: 'shots/look2-editor-blur.png' });
await setLook(true, 0.5);
await page.screenshot({ path: 'shots/look2-editor-hd-50.png' });

// the theme picker carries the same two controls
await page.evaluate(() => {
  document.getElementById('gx-theme-panel')?.remove();
  const b = document.getElementById('gx-theme-btn');
  b?.click();
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/look2-picker.png' });

const picker = await page.evaluate(() => {
  const p = document.getElementById('gx-theme-panel');
  if (!p) return null;
  return {
    sharp: [...p.querySelectorAll('[data-look]')].map((b) => b.textContent + ':' + b.className),
    alpha: p.querySelector('#gxp-wall-a')?.value,
    pct: p.querySelector('#gxp-wall-ap')?.textContent,
  };
});
console.log('picker:', JSON.stringify(picker));
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no page errors');
await browser.close();
