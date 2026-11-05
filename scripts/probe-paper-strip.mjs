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
  window.lib.push({ id: Date.now(), name: 'S', upd: Date.now(), pages: [mk(), mk(), mk()] });
  window.openNotebook(window.lib[window.lib.length - 1]);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /skip tour/i.test(x.textContent || ''));
  b?.click();
  document.getElementById('tour-root')?.remove();
});
await page.evaluate(() => window.__inkpad_pagestrip.set(true));
await page.waitForTimeout(800);
await page.evaluate(() => document.getElementById('pgm').click());
await page.waitForTimeout(600);

const sheetsInk = () =>
  page.evaluate(() => {
    const st = document.getElementById('pstrip');
    return [...st.children].map((el) => {
      if (el.id === 'wrap') return 'live';
      const c = el.querySelector('canvas');
      if (!c) return 'none';
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4 * 11) if (d[i] < 232 && d[i + 3] > 8) n++;
      return n;
    });
  });

console.log('ruling 8', JSON.stringify(await sheetsInk()));
const clickChip = (label) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll('#bar2 .pgm-detail button')].find((x) => x.textContent === t && !x.disabled);
    b?.click();
    return !!b;
  }, label);
console.log('click 10', await clickChip('10'));
await page.waitForTimeout(900);
console.log('ruling 10', JSON.stringify(await sheetsInk()));
console.log('grain off', await clickChip('Grain on'));
await page.waitForTimeout(900);
console.log('no grain ', JSON.stringify(await sheetsInk()));
await browser.close();
