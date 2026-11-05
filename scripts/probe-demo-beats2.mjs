/**
 * Validate the two beats that changed, end to end, before filming them.
 *
 *   node scripts/probe-demo-beats2.mjs
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '5199';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem(
    'inkpad',
    JSON.stringify([
      {
        id: 'nb-a',
        name: 'Algebra II',
        cover: '#2f6df6',
        upd: Date.now(),
        pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
      },
    ])
  );
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 30000 });
await page.waitForTimeout(1400);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

const box = async (sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const q = n.getBoundingClientRect();
    if (!q.width) return null;
    return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) };
  }, sel);

await page.evaluate(() => window.openNotebook(JSON.parse(localStorage.getItem('inkpad'))[0]));
await page.waitForTimeout(2200);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

/* ---- page card ---- */
await page.click('#pgm');
await page.waitForTimeout(900);
console.log('bar2 classes ', await page.getAttribute('#bar2', 'class'));
console.log('bar2 box     ', await box('#bar2'));
console.log('paper select ', await box('#tpl'));
console.log('heads        ', await page.evaluate(() =>
  Array.from(document.querySelectorAll('#bar2 .pgm-h, #bar2 h4')).map((n) => n.textContent.trim())
));

/* ---- editor card, then a tool ---- */
await page.click('.pgm-x');
await page.waitForTimeout(900);
await page.click('#edm');
await page.waitForTimeout(900);
console.log('\ncard         ', await box('#edm-card'));
console.log('snd row      ', await box('#edm-snd'));

const g = await page.evaluate(() => {
  const b = document.querySelector('#edm-card .edm-tools button');
  const q = b.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2, title: b.title };
});
await page.mouse.click(g.x, g.y);
await page.waitForTimeout(800);
console.log('drawer       ', await box('#gn-drw'));
console.log('chips        ', await page.evaluate(() =>
  Array.from(document.querySelectorAll('#gn-drw button')).map((b) => b.textContent.trim())
));

const chip = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('#gn-drw button')).find((n) => n.textContent.trim() === 'Square grid');
  if (!b) return null;
  const q = b.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
});
console.log('grid chip    ', chip);
if (chip) {
  await page.mouse.click(chip.x, chip.y);
  await page.waitForTimeout(700);
  console.log('guide mode   ', await page.evaluate(() => (typeof GD !== 'undefined' ? GD.g : 'no GD')));
  console.log('drawer after ', await page.evaluate(() => getComputedStyle(document.getElementById('gn-drw')).display));
}

/* ---- closing the card should take the drawer with it ---- */
await page.click('#edm-card .edm-x');
await page.waitForTimeout(800);
console.log('after close  ', {
  drawer: await page.evaluate(() => getComputedStyle(document.getElementById('gn-drw')).display),
  card: await page.evaluate(() => document.getElementById('edm-card')?.classList.contains('open')),
});

await page.screenshot({ path: 'shots/demo-beat5-check.png' });
console.log('shot -> shots/demo-beat5-check.png');

await ctx.close();
await browser.close();
