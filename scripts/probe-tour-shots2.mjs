/** Screenshot the tour card at the steps that now play a recording. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const WANT_HOME = ['Find anything fast', 'Themes, wallpapers and music', 'Install it like an app'];
const WANT_ED = ['✎ Pen', '🖍 Highlighter', 'The page card', 'Zoom — up to 800 %', 'Clear page'];

fs.mkdirSync('shots/tourvid', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1600);

const shot = async (name) => {
  const box = await page.evaluate(() => {
    const c = document.getElementById('tour-card');
    const r = c.getBoundingClientRect();
    return { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.width + 12, height: r.height + 12 };
  });
  await page.screenshot({ path: `shots/tourvid/${name}.png`, clip: box });
};

const walk = async (want, tag) => {
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(700);
    const title = await page.evaluate(() => document.getElementById('tour-title')?.textContent || '');
    if (want.includes(title)) {
      await page.waitForTimeout(900);
      await shot(`${tag}-${want.indexOf(title)}`);
      console.log('shot', tag, title);
    }
    const n = await page.$('#tour-next');
    if (!n) break;
    const before = await page.evaluate(() => document.getElementById('tour-count')?.textContent);
    await n.click();
    const after = await page.evaluate(() => document.getElementById('tour-count')?.textContent);
    if (before === after) break;
  }
};

await walk(WANT_HOME, 'home');
await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  const nb = { id: Date.now(), name: 'Probe', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(nb);
  window.openNotebook(nb);
});
await page.waitForTimeout(2600);
await page.evaluate(() => document.getElementById('tour-fab')?.click());
await page.waitForTimeout(1200);
await walk(WANT_ED, 'ed');
await browser.close();
