import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(600);

const sample = () => page.evaluate(() => {
  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  // count dark-ish pixels down a vertical strip: a ruling change alters the count
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 200 && d[i + 3] > 0) dark++;
  return dark;
});

console.log('dark before', await sample());
await page.click('#pgm');
await page.waitForTimeout(400);
const clickChip = (t) => page.evaluate((label) => {
  const d = document.querySelector('.pgm-detail');
  const b = [...d.querySelectorAll('button')].find((x) => x.textContent === label);
  if (!b) return 'missing ' + label;
  b.click();
  return 'clicked ' + label;
}, t);
console.log(await clickChip('10'));
await page.waitForTimeout(700);
console.log('dark after ruling 10', await sample());
console.log(await clickChip('Off'));
await page.waitForTimeout(700);
console.log('dark after margin off', await sample());
console.log(await clickChip('Grain on'));
await page.waitForTimeout(700);
console.log('dark after grain toggle', await sample());
console.log('prefs', await page.evaluate(() => localStorage.getItem('inkpad-paper-prefs')));
await browser.close();
