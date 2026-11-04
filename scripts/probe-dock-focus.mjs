/**
 * The four things asked for in one pass: the eraser's two modes, the pointer's
 * two trails, focus mode with a dock that lives on any edge, and reordering a
 * pen by holding it.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.removeItem('inkpad-pen-dock');
  localStorage.removeItem('inkpad-pen-dock-v2');
  localStorage.removeItem('inkpad-dock-focus-side');
  const n = { id: Date.now(), name: 'Dock', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
});
await page.waitForTimeout(600);

const log = (...a) => console.log(...a);
const state = () =>
  page.evaluate(() => {
    const disp = (id) => {
      const n = document.getElementById(id);
      return n ? getComputedStyle(n).display : 'gone';
    };
    return {
      slots: window.__inkpad_pen_dock.slots().map((s) => `${s.kind}${s.erase ? ':' + s.erase : ''}${s.laser ? ':' + s.laser : ''}`),
      side: window.__inkpad_pen_dock.side(),
      dockSide: document.getElementById('pen-dock')?.dataset.side,
      tool: window.eval('tool'),
      LM: window.eval('typeof LM !== "undefined" ? LM : "?"'),
      focus: document.documentElement.dataset.focus,
      lock: disp('ink-lock'),
      tb: disp('tb'),
      fab: disp('tour-fab'),
      pill: disp('ink-pen'),
    };
  });

log('dock at rest          ', JSON.stringify(await state()));

// --- eraser: both kinds, from the dock ------------------------------------
const erIdx = await page.evaluate(() => window.__inkpad_pen_dock.slots().findIndex((s) => s.kind === 'eraser'));
await page.click(`#pen-dock .pd-slot[data-i="${erIdx}"]`);
await page.waitForTimeout(400);
log('eraser slot (stroke)  ', JSON.stringify(await state()).slice(0, 160));

await page.evaluate(() => {
  window.__inkpad_pen_dock.open(0);
});
await page.waitForTimeout(300);
await page.evaluate((i) => {
  const row = [...document.querySelectorAll('#pen-sheet .ps-row')][i];
  [...row.querySelectorAll('.ps-erase .ps-b')].find((b) => /pixel/i.test(b.textContent)).click();
}, erIdx);
await page.waitForTimeout(500);
log('eraser → pixel        ', JSON.stringify(await state()).slice(0, 160));
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelector('#pen-sheet .ps-x')?.click());
await page.waitForTimeout(300);

// --- pointer: both trails --------------------------------------------------
const lsIdx = await page.evaluate(() => window.__inkpad_pen_dock.slots().findIndex((s) => s.kind === 'laser'));
await page.click(`#pen-dock .pd-slot[data-i="${lsIdx}"]`);
await page.waitForTimeout(400);
log('pointer slot (hold)   ', JSON.stringify(await state()).slice(0, 160));
await page.evaluate((i) => window.__inkpad_pen_dock.open(i), lsIdx);
await page.waitForTimeout(300);
await page.evaluate((i) => {
  const row = [...document.querySelectorAll('#pen-sheet .ps-row')][i];
  [...row.querySelectorAll('.ps-erase .ps-b')].find((b) => /fades/i.test(b.textContent)).click();
}, lsIdx);
await page.waitForTimeout(500);
log('pointer → fade        ', JSON.stringify(await state()).slice(0, 160));

// the arrows are gone from the sheet
const arrows = await page.evaluate(() => document.querySelectorAll('#pen-sheet .ps-order').length);
log('order arrows in sheet ', arrows);

await page.evaluate(() => document.querySelector('#pen-sheet .ps-x')?.click());
await page.waitForTimeout(300);

// --- focus mode ------------------------------------------------------------
await page.click('#ink-lock');
await page.waitForTimeout(700);
log('locked                ', JSON.stringify(await state()));
await page.screenshot({ path: 'shots/dock-focus-top.png' });

// drag the grip to the left edge
const grip = await page.locator('#pen-dock .pd-grip').boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await page.mouse.down();
await page.mouse.move(40, 450, { steps: 12 });
await page.waitForTimeout(120);
await page.mouse.up();
await page.waitForTimeout(500);
log('dragged to left       ', JSON.stringify(await state()).slice(0, 120));
await page.screenshot({ path: 'shots/dock-focus-left.png' });

// and to the right
const grip2 = await page.locator('#pen-dock .pd-grip').boundingBox();
await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + grip2.height / 2);
await page.mouse.down();
await page.mouse.move(1400, 460, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
log('dragged to right      ', JSON.stringify(await state()).slice(0, 120));

// unlock
await page.click('#ink-lock');
await page.waitForTimeout(600);
log('unlocked              ', JSON.stringify(await state()));

// --- reorder by holding a pen ---------------------------------------------
const before = await page.evaluate(() => window.__inkpad_pen_dock.slots().map((s) => s.kind));
const first = await page.locator('#pen-dock .pd-slot[data-i="0"]').boundingBox();
const fourth = await page.locator('#pen-dock .pd-slot[data-i="3"]').boundingBox();
await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
await page.mouse.down();
await page.waitForTimeout(1200); // past the one-second hold
const lifted = await page.evaluate(() => document.querySelectorAll('#pen-dock .pd-lift').length);
await page.mouse.move(fourth.x + fourth.width / 2, fourth.y + fourth.height / 2 + 6, { steps: 14 });
await page.waitForTimeout(200);
const line = await page.evaluate(() => document.querySelectorAll('#pen-dock .pd-line').length);
await page.mouse.up();
await page.waitForTimeout(600);
const after = await page.evaluate(() => window.__inkpad_pen_dock.slots().map((s) => s.kind));
log('lifted / line shown   ', lifted, '/', line);
log('order before          ', before.join(' '));
log('order after           ', after.join(' '));

// and it survives a reload
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
const kept = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem('inkpad-pen-dock')).map((s) => s.kind);
  } catch {
    return [];
  }
});
log('order after reload    ', kept.join(' '));

await browser.close();
