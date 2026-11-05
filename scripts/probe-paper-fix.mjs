import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const mk = () => ({ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 });
  const a = mk();
  a.pp = { k: 'lined', bg: '#ffffff', ln: 'rgba(120,140,170,.4)', gap: 32, lw: 1 };
  window.lib.push({ id: Date.now(), name: 'Custom', upd: Date.now(), pages: [a, mk()] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(600);

const state = () =>
  page.evaluate(() => {
    const c = document.getElementById('cv');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let red = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      if (d[i] < 232 && d[i + 3] > 8) n++;
      if (d[i] - d[i + 1] > 22 && d[i] - d[i + 2] > 22) red++;
    }
    return { tpl: window.eval('pg().tpl'), pp: !!window.eval('pg().pp'), sel: document.getElementById('tpl').value, ink: n, red };
  });

console.log('pp page   ', JSON.stringify(await state()));
await page.screenshot({ path: 'shots/paper-pp-before.png' });

await page.selectOption('#tpl', 'grid');
await page.waitForTimeout(700);
console.log('-> grid   ', JSON.stringify(await state()));

await page.selectOption('#tpl', 'margin');
await page.waitForTimeout(700);
console.log('-> margin ', JSON.stringify(await state()));
await page.screenshot({ path: 'shots/paper-margin.png' });

// the red rule should survive a "Margin: Off" press, because it is the paper
const off = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#bar2 .pgm-detail button')].find((x) => x.textContent === 'Off');
  b?.click();
  return !!b;
});
await page.waitForTimeout(700);
console.log('margin off', off, JSON.stringify(await state()));

// the option is really in the select
const opts = await page.evaluate(() => [...document.getElementById('tpl').options].map((o) => o.value + ':' + o.text));
console.log('options   ', JSON.stringify(opts));
await browser.close();
