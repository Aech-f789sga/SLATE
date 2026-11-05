import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
// a DOTTED page, which is what the report was about
await page.evaluate(() => { const n={id:Date.now(),name:'R',upd:Date.now(),pages:[{tpl:'dot',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/skip tour/i.test(x.textContent||'')); b?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(600);

const reddish = () => page.evaluate(() => {
  const cv = document.getElementById('cv');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1] + 25 && d[i] > d[i + 2] + 25) n++;
  return n;
});

console.log('margin on  (dotted): reddish px', await reddish());
await page.click('#pgm');
await page.waitForTimeout(400);
console.log('rows shown', await page.evaluate(() => [...document.querySelectorAll('.pgm-detail > div')].map((d) => d.textContent.slice(0, 34)).filter(Boolean)));
console.log('disabled chips', await page.evaluate(() => [...document.querySelectorAll('.pgm-detail button')].filter((b) => b.disabled).length));
await page.evaluate(() => [...document.querySelectorAll('.pgm-detail button')].find((b) => b.textContent === 'Off').click());
await page.waitForTimeout(600);
console.log('margin off (dotted): reddish px', await reddish());
await page.screenshot({ path: 'shots/paper-dotted.png', clip: { x: 380, y: 90, width: 700, height: 380 } });
await browser.close();
