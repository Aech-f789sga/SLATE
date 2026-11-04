/** The padlock sits above the tour button, and the hold default reads 1.0 s. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.removeItem('inkpad-snap-hold');
  const n = { id: Date.now(), name: 'Lock', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(700);

const geom = await page.evaluate(() => {
  const lock = document.getElementById('ink-lock').getBoundingClientRect();
  const fab = document.getElementById('tour-fab').getBoundingClientRect();
  return { lock: { r: Math.round(lock.right), b: Math.round(lock.bottom) }, fab: { r: Math.round(fab.right), b: Math.round(fab.bottom) } };
});
console.log('lock / tour           ', JSON.stringify(geom), geom.lock.b < geom.fab.b && Math.abs(geom.lock.r - geom.fab.r) < 2 ? 'OK above, same column' : 'MISPLACED');

const hold = await page.evaluate(() => ({
  ms: window.__inkpad_shape.hold(),
  stored: localStorage.getItem('inkpad-snap-hold'),
}));
console.log('hold default          ', JSON.stringify(hold));

// the sheet, read through its own UI
await page.evaluate(() => document.querySelector('#acc-trigger')?.click());
await page.waitForTimeout(400);
const sheet = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#acc-pop [data-acc]')].find((n) => n.dataset.acc === 'snap');
  row?.click();
  return null;
});
await page.waitForTimeout(500);
const read = await page.evaluate(() => {
  const n = document.getElementById('acc-snap');
  return n ? { on: n.classList.contains('on'), num: n.querySelector('#snap-num')?.textContent, range: n.querySelector('#snap-range')?.value } : null;
});
console.log('snap sheet            ', JSON.stringify(read));

await page.evaluate(() => document.querySelector('#snap-reset')?.click());
await page.waitForTimeout(300);
console.log('after Default         ', JSON.stringify(await page.evaluate(() => window.__inkpad_shape.hold())));

await browser.close();
