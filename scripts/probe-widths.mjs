/**
 * One nib, three controls — does adjusting it in one place move the others?
 *
 * Checks the four directions that matter:
 *   pill dots → engine + dock
 *   popover slider → engine + dock + pill
 *   dock millimetres → engine + pill
 *   settings-sheet level edit → the pill's dot
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.removeItem('inkpad-widths');
  localStorage.removeItem('inkpad-pen-dock');
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

const state = () =>
  page.evaluate(() => {
    const W = window.__inkpad_widths;
    const dock = window.__inkpad_pen_dock;
    const slot = dock.slots().find((s) => s.id === localStorage.getItem('inkpad-pen-active'));
    return {
      tool: eval('tool'),
      size: eval('size'),
      model: { pen: W.width('pen'), hl: W.width('hl') },
      dockMm: slot ? slot.mm : null,
      dockKind: slot ? slot.kind : null,
      pillDots: [...document.querySelectorAll('#ink-pen .w')].map((n) => (n.classList.contains('on') ? '●' : '·')).join(''),
      pillTitles: [...document.querySelectorAll('#ink-pen .w')].map((n) => n.title),
    };
  });

const log = (label, s) =>
  console.log(
    label.padEnd(26),
    JSON.stringify({ tool: s.tool, size: +(+s.size).toFixed(2), model: { pen: +s.model.pen.toFixed(2), hl: +s.model.hl.toFixed(2) }, dock: s.dockMm, dots: s.pillDots })
  );

// 1. pick the highlighter from the dock
await page.click('#pen-dock .pd-slot[data-i="3"]');
await page.waitForTimeout(400);
log('dock → highlighter', await state());

// 2. the pill's thickest dot
await page.evaluate(() => window.__inkpad_ink.size(22));
await page.waitForTimeout(300);
log('pill dot 22', await state());

// 3. the popover slider for the highlighter
await page.evaluate(() => {
  window.__inkpad_ink.widthFor('hl', 12);
});
await page.waitForTimeout(300);
log('pill → 12', await state());

// 4. the dock's own millimetre field, through its settings sheet
await page.evaluate(() => {
  window.__inkpad_pen_dock.open(3);
  const row = document.querySelectorAll('#pen-sheet .ps-row')[3];
  const num = row.querySelector('.ps-thick input[type=number]');
  num.value = '6';
  num.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(400);
log('dock → 6 mm', await state());

// 5. and back out: does the pill's dot row still agree?
const sheet = await page.evaluate(() => {
  const row = document.querySelectorAll('#pen-sheet .ps-row')[3];
  return { num: row.querySelector('.ps-thick input[type=number]').value, name: row.querySelector('.ps-name').textContent };
});
console.log('dock sheet row            ', JSON.stringify(sheet));

// 6. edit a level in the pen settings sheet and see the pill follow
await page.evaluate(() => {
  document.querySelector('#pen-sheet .ps-x')?.click();
  eval('tool="hl"');
});
await page.waitForTimeout(300);
await page.evaluate(() => window.__inkpad_ink.openPen());
await page.waitForTimeout(300);
const before = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ink-penset .lvl')];
  return rows.map((r) => r.querySelector('input').value);
});
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ink-penset .lvl')];
  const num = rows[0].querySelector('input');
  num.value = '12';
  num.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(400);
const after = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#ink-penset .lvl')];
  return {
    mm: rows.map((r) => r.querySelector('input').value),
    model: window.__inkpad_widths.steps('hl').map((v) => +v.toFixed(2)),
  };
});
console.log('levels before             ', JSON.stringify(before));
console.log('levels after              ', JSON.stringify(after));

// the pill is suppressed while a sheet owns the panel, so close it and look again
await page.mouse.click(700, 700);
await page.waitForTimeout(500);
const pillAfter = await page.evaluate(() => ({
  sheetOpen: !!document.querySelector('#ink-penset.on'),
  titles: [...document.querySelectorAll('#ink-pen .w')].map((n) => n.title),
  dots: [...document.querySelectorAll('#ink-pen .w')].map((n) => (n.classList.contains('on') ? '●' : '·')).join(''),
}));
console.log('pill after level edit     ', JSON.stringify(pillAfter));

// 7. pen and highlighter must not share a width
await page.evaluate(() => {
  eval('tool="pen"');
});
await page.waitForTimeout(500);
const pen = await page.evaluate(() => ({ tool: eval('tool'), size: eval('size'), model: window.__inkpad_widths.width('pen') }));
console.log('switch to pen             ', JSON.stringify(pen));
await page.evaluate(() => {
  eval('tool="hl"');
});
await page.waitForTimeout(500);
const hl = await page.evaluate(() => ({ tool: eval('tool'), size: eval('size'), model: window.__inkpad_widths.width('hl') }));
console.log('switch back to hl         ', JSON.stringify(hl));

await page.screenshot({ path: 'shots/widths.png' });
await browser.close();
