import { chromium } from 'playwright';

const URL = 'http://[::1]:4173/';
const browser = await chromium.launch();
const errors = [];

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});

// a notebook with one page, so the paper renderer has something to draw
await page.evaluate(() => {
  window.lib.push({
    id: 'probe' + Math.random(),
    name: 'Paper probe',
    upd: Date.now(),
    cover: '#2f6df6',
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  });
  window.eval('save()');
  window.showLib();
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(600);

/** Count pixels close to the margin rule's colour on the page canvas. */
const redInk = () =>
  page.evaluate(() => {
    const cv = document.getElementById('cv');
    const c = cv.getContext('2d');
    const { width: w, height: h } = cv;
    const d = c.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      // the rule is rgba(206,80,80,.6) over paper: clearly red, clearly not ink
      if (r > 150 && r - g > 45 && r - b > 45 && g < 190) n++;
    }
    return n;
  });

const setTpl = async (t) => {
  await page.evaluate((tpl) => {
    const s = document.getElementById('tpl');
    s.value = tpl;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, t);
  await page.waitForTimeout(700);
};

const tpls = ['lined', 'margin', 'grid', 'dot', 'cornell', 'blank'];
const margin = {};
for (const t of tpls) {
  await setTpl(t);
  margin[t] = await redInk();
}
console.log('margin pixels per paper:', JSON.stringify(margin));

// ---- wallpaper look ----
await page.evaluate(() => {
  const t = window.__inkpadTheme;
  t.choice.id = 'lofi-chill';
  t.choice.mode = 'light';
  t.choice.wall = true;
  t.apply();
});
await page.waitForTimeout(1000);

const look = () =>
  page.evaluate(() => {
    const g = (id) => document.getElementById(id);
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const root = document.documentElement;
    return {
      attr: root.dataset.gxWallfx,
      alpha: root.style.getPropertyValue('--gx-wall-a'),
      wallOpacity: cs(g('gx-wall'))?.opacity,
      libmBlur: cs(g('libm'))?.backdropFilter,
      navBlur: cs(g('nav'))?.backdropFilter,
    };
  });

const blurState = await look();
await page.screenshot({ path: 'shots/look-blur.png' });

await page.evaluate(() => {
  const p = document.getElementById('gxm');
  p.querySelector('[data-look="hd"]').click();
  const op = p.querySelector('.gxm-op');
  op.value = '0.55';
  op.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(900);
const hdState = await look();
await page.screenshot({ path: 'shots/look-hd-55.png' });

// reload: the choice must survive
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1500);
const afterReload = await look();

console.log('blur :', JSON.stringify(blurState));
console.log('hd   :', JSON.stringify(hdState));
console.log('after:', JSON.stringify(afterReload));

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
