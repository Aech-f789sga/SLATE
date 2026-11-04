import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'S', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.querySelectorAll('#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});
await page.waitForTimeout(400);

// open the engine's Settings drawer
const opened = await page.evaluate(() => {
  const b = document.querySelector('button[title="Settings"]');
  if (!b) return false;
  b.click();
  return true;
});
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('button')].filter((b) =>
    /^(Auto-calculate|Ink → text|Ink → LaTeX)$/.test((b.textContent || '').trim())
  );
  return {
    opened: !!document.querySelector('#gn-drw'),
    smartTitle: [...document.querySelectorAll('div')].some((d) => (d.textContent || '').trim() === 'Smart ink'),
    chips: chips.map((c) => ({
      label: (c.textContent || '').trim(),
      on: getComputedStyle(c).borderColor.includes('47, 109, 246') || c.style.borderColor.includes('var(--ac)'),
      bg: getComputedStyle(c).backgroundColor,
    })),
  };
});

console.log('settings button clicked:', opened);
console.log('drawer present:', info.opened);
console.log('“Smart ink” heading:', info.smartTitle);
console.log('chips:', JSON.stringify(info.chips, null, 1));

// screenshot the drawer only
const drw = await page.$('#gn-drw');
if (drw) await drw.screenshot({ path: 'shots/settings-smart.png' });
await page.screenshot({ path: 'shots/settings-full.png' });

// now toggle Ink -> text and confirm the flag persisted
const toggled = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Ink → text');
  b?.click();
  return JSON.parse(localStorage.getItem('inkpad-smart') || '{}');
});
console.log('after toggling Ink → text, stored:', JSON.stringify(toggled));

// does the auto-calc watcher actually see the switch?
const calc = await page.evaluate(() => {
  const before = window.__calc?.settings?.auto;
  const b = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Auto-calculate');
  b?.click();
  return { before, after: window.__calc?.settings?.auto, stored: JSON.parse(localStorage.getItem('inkpad-smart') || '{}') };
});
console.log('calc watcher auto: before', calc.before, '-> after toggle', calc.after, 'stored', JSON.stringify(calc.stored));

await browser.close();
