/** Pictures of the dock at rest and the settings sheet's new mode rows. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.removeItem('inkpad-pen-dock');
  localStorage.removeItem('inkpad-pen-dock-v2');
  const n = { id: Date.now(), name: 'Dock', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
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

await page.screenshot({ path: 'shots/dock-rest.png', clip: { x: 0, y: 120, width: 260, height: 520 } });

// the eraser row and the pointer row
await page.evaluate(() => {
  window.__inkpad_pen_dock.open(4);
  const row = [...document.querySelectorAll('#pen-sheet .ps-row')][4];
  row.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(600);
await page.locator('#pen-sheet').screenshot({ path: 'shots/dock-sheet-eraser.png' });

await page.evaluate(() => {
  window.__inkpad_pen_dock.open(5);
  const row = [...document.querySelectorAll('#pen-sheet .ps-row')][5];
  row.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(600);
await page.locator('#pen-sheet').screenshot({ path: 'shots/dock-sheet-pointer.png' });

await browser.close();
console.log('ok');
