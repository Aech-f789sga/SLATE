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
  window.lib.push({
    id: 'c' + Math.random(),
    name: 'Card probe',
    upd: Date.now(),
    cover: '#2f6df6',
    pages: [{ tpl: 'grid', col: '', strokes: [], pw: 800, ph: 1100 }],
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

const setTpl = async (t) => {
  await page.evaluate((tpl) => {
    const s = document.getElementById('tpl');
    s.value = tpl;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, t);
  await page.waitForTimeout(600);
};

await setTpl('grid');
await page.evaluate(() => document.getElementById('pgm')?.click());
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/look2-card-grid.png' });

const onGrid = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#bar2 .pgm-lab, #bar2 .pgm-chip')];
  const i = rows.findIndex((r) => /margin rule/i.test(r.textContent || ''));
  return {
    row: i >= 0 ? rows.slice(i, i + 3).map((r) => r.textContent) : null,
    note: [...document.querySelectorAll('#bar2 div')]
      .map((d) => d.textContent || '')
      .find((t) => /Lined \+ margin paper/i.test(t)),
  };
});

// the signpost chip should actually switch the paper
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#bar2 .pgm-chip')].find((x) =>
    /use that paper/i.test(x.textContent || ''),
  );
  b?.click();
});
await page.waitForTimeout(900);
const after = await page.evaluate(() => document.getElementById('tpl').value);
await page.screenshot({ path: 'shots/look2-card-margin.png' });

console.log(JSON.stringify({ onGrid, after }));
await browser.close();
