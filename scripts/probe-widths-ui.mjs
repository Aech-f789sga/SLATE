/** Pictures of the two new controls: the popover's slider and the level editor. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.removeItem('inkpad-widths');
  const n = { id: Date.now(), name: 'W', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});
await page.waitForTimeout(500);

// highlighter tab of the brush popover
await page.click('#pen-dock .pd-slot[data-i="3"]');
await page.waitForTimeout(300);
await page.click('#tb [data-t="hl"]');
await page.waitForTimeout(600);
await page.locator('#ink-brush').screenshot({ path: 'shots/w-popover.png' });

// pen settings
await page.mouse.click(700, 700);
await page.waitForTimeout(400);
await page.evaluate(() => window.__inkpad_ink.openPen());
await page.waitForTimeout(500);
await page.locator('#ink-penset').screenshot({ path: 'shots/w-levels.png' });

await page.mouse.click(700, 700);
await page.waitForTimeout(400);
await page.locator('#ink-pen').screenshot({ path: 'shots/w-pill.png' });

await browser.close();
console.log('ok');
