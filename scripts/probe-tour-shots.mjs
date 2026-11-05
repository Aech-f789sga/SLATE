/**
 * Screenshot the steps whose animations are new, so the drawings can be judged
 * rather than only counted.
 */
import { chromium } from 'playwright';

const WANT = ['Themes, wallpapers and music'];
const WANT_ED = ['Paper template', 'Zoom — up to 800 %', 'The pen dock'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1500);

const shotCard = async (name) => {
  const box = await page.evaluate(() => {
    const c = document.getElementById('tour-card');
    const r = c.getBoundingClientRect();
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 };
  });
  await page.screenshot({ path: `shots/tour-${name}.png`, clip: box });
};

for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(700);
  const title = await page.evaluate(() => document.getElementById('tour-title')?.textContent || '');
  if (WANT.includes(title)) {
    await page.waitForTimeout(1200); // let the loop get past its first frame
    await shotCard('home-theme');
    console.log('captured home:', title);
  }
  const n = await page.$('#tour-next');
  if (!n) break;
  const before = await page.evaluate(() => document.getElementById('tour-count')?.textContent);
  await n.click();
  const after = await page.evaluate(() => document.getElementById('tour-count')?.textContent);
  if (before === after) break;
}

await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  const nb = {
    id: Date.now(), name: 'T', upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(nb);
  window.openNotebook(nb);
});
await page.waitForTimeout(2400);

for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(650);
  const title = await page.evaluate(() => document.getElementById('tour-title')?.textContent || '');
  if (WANT_ED.includes(title)) {
    await page.waitForTimeout(1200);
    await shotCard(`ed-${WANT_ED.indexOf(title)}`);
    console.log('captured editor:', title);
  }
  const n = await page.$('#tour-next');
  if (!n) break;
  const before = await page.evaluate(() => document.getElementById('tour-count')?.textContent);
  await n.click();
  const after = await page.evaluate(() => document.getElementById('tour-count')?.textContent);
  if (before === after) break;
}

await browser.close();
