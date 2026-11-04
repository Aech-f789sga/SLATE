import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', r => r.abort());
await page.route('https://fonts.gstatic.com/**', r => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'UI', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find(b => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach(n => n.remove());
});
await page.waitForTimeout(500);

const panels = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 30) continue;
    out.push({
      id: el.id || '',
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 30),
      z: cs.zIndex,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      txt: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 46),
    });
  }
  return out;
});

async function step(name, action) {
  await action();
  await page.waitForTimeout(700);
  const p = await panels();
  console.log(`\n### ${name}`);
  for (const x of p) console.log(`  z=${String(x.z).padEnd(4)} ${String(x.box.join(',')).padEnd(22)} #${x.id || x.cls} :: ${x.txt}`);
  await page.screenshot({ path: `${OUT}/p-${name}.png` });
}

await page.keyboard.press('Escape');
await page.mouse.click(1200, 800);
await page.waitForTimeout(300);

await step('boot', async () => {});

const btn = (title) => page.locator(`[title="${title}"]`).first();

await step('brush', async () => { await btn('Brushes').click(); });
await step('highlighter', async () => { await btn('Highlighter').click(); });
await step('eraser', async () => { await btn('Erasers').click(); });
await step('lasso', async () => { await btn('Lasso').click(); });
await step('laser', async () => { await btn('Laser pointer').click(); });

await browser.close();
