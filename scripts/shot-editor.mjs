import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'Shot', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n); window.openNotebook(n);
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/now-full.png' });
console.log(await page.evaluate(() => {
  const ids = ['tb', 'bar2', 'gn-tabs', 'gn-foot', 'ink-pen', 'acc-trigger', 'sh-trigger', 'snap-btn', 'cloud-btn'];
  const out = {};
  for (const id of ids) {
    const n = document.getElementById(id);
    if (!n) { out[id] = 'none'; continue; }
    const r = n.getBoundingClientRect();
    out[id] = `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
  }
  return out;
}));
await browser.close();
