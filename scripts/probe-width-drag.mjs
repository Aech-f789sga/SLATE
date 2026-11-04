/**
 * The two things a probe cannot see from the DOM alone: does dragging the
 * popover slider survive the repaints it causes, and does a wheel change on a
 * dock slot reach the pill?
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

// open the highlighter's brush popover from the toolbar
await page.click('#tb [data-t="hl"]');
await page.waitForTimeout(700);

const r = await page.evaluate(() => {
  const el = document.querySelector('#ink-brush .brush-wm input[type=range]');
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height, v: el.value };
});
if (!r) {
  console.log('NO SLIDER');
  await browser.close();
  process.exit(1);
}

// drag the thumb rightwards in several steps
await page.mouse.move(r.x + r.w * 0.4, r.y + r.h / 2);
await page.mouse.down();
const seen = [];
for (const f of [0.5, 0.6, 0.7, 0.8]) {
  await page.mouse.move(r.x + r.w * f, r.y + r.h / 2, { steps: 2 });
  await page.waitForTimeout(90);
  seen.push(
    await page.evaluate(() => {
      const el = document.querySelector('#ink-brush .brush-wm input[type=range]');
      return {
        slider: el ? +el.value : null,
        out: document.querySelector('#ink-brush .wm-out')?.textContent,
        size: +eval('size').toFixed(2),
        model: +window.__inkpad_widths.width('hl').toFixed(2),
      };
    })
  );
}
await page.mouse.up();
await page.waitForTimeout(400);
console.log('drag frames', JSON.stringify(seen));

const climbed = seen.every((s, i) => i === 0 || s.slider >= seen[i - 1].slider);
console.log(climbed ? 'drag survived' : 'DRAG BROKE — the slider was rebuilt mid-gesture');

// the pill is hidden while the popover owns the screen, so close it first
await page.mouse.click(700, 720);
await page.waitForTimeout(500);
const pill = await page.evaluate(() => ({
  on: !!document.querySelector('#ink-pen.on'),
  titles: [...document.querySelectorAll('#ink-pen .w')].map((n) => n.title),
  dots: [...document.querySelectorAll('#ink-pen .w')].map((n) => (n.classList.contains('on') ? '●' : n.classList.contains('near') ? 'o' : '·')).join(''),
}));
console.log('pill', JSON.stringify(pill));

// make the dock's highlighter the active pen, then wheel over it
await page.click('#pen-dock .pd-slot[data-i="3"]');
await page.waitForTimeout(400);
const before = await page.evaluate(() => ({
  dockMm: window.__inkpad_pen_dock.slots()[3].mm,
  model: +window.__inkpad_widths.width('hl').toFixed(2),
}));
await page.evaluate(() => {
  const slot = document.querySelector('#pen-dock .pd-slot[data-i="3"]');
  slot.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
  dockMm: window.__inkpad_pen_dock.slots()[3].mm,
  model: +window.__inkpad_widths.width('hl').toFixed(2),
  size: +eval('size').toFixed(2),
  dots: [...document.querySelectorAll('#ink-pen .w')].map((n) => (n.classList.contains('on') ? '●' : n.classList.contains('near') ? 'o' : '·')).join(''),
}));
console.log('wheel before', JSON.stringify(before));
console.log('wheel after ', JSON.stringify(after));

await browser.close();
