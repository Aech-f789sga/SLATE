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
await page.waitForTimeout(1500);
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

const dump = async (label) => {
  const r = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 40 || b.height < 24) continue;
      if (el.closest('#pen-dock') || el.closest('#pen-sheet')) continue;
      if (b.y > 400) continue;
      out.push({ id: el.id || '', cls: String(el.className || '').slice(0, 26), z: cs.zIndex, box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], txt: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 34) });
    }
    return out;
  });
  console.log(label, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/${label}.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } });
};

await dump('u1-rest');

const clickTitle = async (t) => {
  const ok = await page.evaluate((tt) => {
    const b = [...document.querySelectorAll('#bar button, #bar2 button')].find(n => (n.getAttribute('title') || '') === tt);
    if (b) { b.click(); return true; }
    return false;
  }, t);
  await page.waitForTimeout(700);
  return ok;
};

for (const t of ['Brushes', 'Highlighter', 'Erasers', 'Lasso', 'Laser pointer']) {
  const ok = await clickTitle(t);
  await page.waitForTimeout(500);
  await dump('u2-' + t.replace(/\s+/g, '-').toLowerCase());
  console.log('   clicked', t, ok);
}

await browser.close();
