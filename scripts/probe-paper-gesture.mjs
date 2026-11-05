import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const mk = (tpl) => ({ tpl, col: '', strokes: [], pw: 800, ph: 1100 });
  window.lib.push({ id: Date.now(), name: 'Paper', upd: Date.now(), pages: [mk('lined'), mk('lined')] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(700);

const ink = () =>
  page.evaluate(() => {
    const c = document.getElementById('cv');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 232 && d[i + 3] > 8) n++;
    return n;
  });

// a real gesture: click the select, then keyboard-select the next option
console.log('before click', await ink());
await page.click('#tpl');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
console.log(
  'after gesture',
  JSON.stringify(await page.evaluate(() => ({ tpl: window.eval('pg().tpl'), sel: document.getElementById('tpl').value }))),
  await ink()
);
await page.screenshot({ path: 'shots/paper-gesture.png' });

// does the card stay where it is, or does the row rebuild and lose the value?
const state = await page.evaluate(() => {
  const s = document.getElementById('tpl');
  const r = s.getBoundingClientRect();
  return {
    value: s.value,
    selectedIndex: s.selectedIndex,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    detailRows: document.querySelectorAll('#bar2 .pgm-detail > div').length,
  };
});
console.log('after', JSON.stringify(state));

// now with the strip on
await page.evaluate(() => window.__inkpad_pagestrip.set(true));
await page.waitForTimeout(800);
await page.selectOption('#tpl', 'grid');
await page.waitForTimeout(700);
const strip = await page.evaluate(() => {
  const st = document.getElementById('pstrip');
  return {
    tpl: window.eval('pg().tpl'),
    live: [...st.children].findIndex((e) => e.id === 'wrap'),
    sheets: [...st.children].length,
  };
});
console.log('strip grid', JSON.stringify(strip), await ink());
await page.screenshot({ path: 'shots/paper-strip-grid.png' });

await browser.close();
