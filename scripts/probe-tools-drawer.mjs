/**
 * Where does each tool's dropdown open, and does a second press close it?
 *
 * Both questions come from the same report: the four dropdowns land at the far
 * left over the pen dock, and pressing the same icon twice leaves it open.
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '5188';
const W = Number(process.env.W || 1920);
const H = Number(process.env.H || 1080);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem('inkpad-guest-dismissed', '1');
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
await page.evaluate(() => window.openNotebook(JSON.parse(localStorage.getItem('inkpad'))[0]));
await page.waitForTimeout(2200);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

const rect = (sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const q = n.getBoundingClientRect();
    if (!q.width && !q.height) return null;
    return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) };
  }, sel);

const drawer = () =>
  page.evaluate(() => {
    const d = document.getElementById('gn-drw');
    if (!d) return null;
    const q = d.getBoundingClientRect();
    return {
      display: getComputedStyle(d).display,
      x: Math.round(q.x),
      y: Math.round(q.y),
      w: Math.round(q.width),
      h: Math.round(q.height),
    };
  });

const penDock = await rect('#ink-pen');
console.log(`viewport ${W}x${H}`);
console.log('pen dock  ', penDock);

await page.click('#edm');
await page.waitForTimeout(800);

const tools = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#edm-card .edm-tools button')).map((b, i) => {
    const q = b.getBoundingClientRect();
    return { i, title: (b.title || '').split(':')[0], x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
  })
);

const overlaps = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

for (const t of tools) {
  // the card can close on an outside press, so re-open it before each tool
  const open = await page.evaluate(() => document.getElementById('edm-card')?.classList.contains('open'));
  if (!open) {
    await page.click('#edm');
    await page.waitForTimeout(600);
  }
  const box = await page.evaluate((i) => {
    const b = document.querySelectorAll('#edm-card .edm-tools button')[i];
    const q = b.getBoundingClientRect();
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  }, t.i);

  const state = [];
  let first = null;
  for (let n = 0; n < 3; n++) {
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(520);
    const d = await drawer();
    const on = !!d && d.display === 'block';
    state.push(on ? 'open' : 'shut');
    if (n === 0 && on) first = d;
    // the card may have been shut by an outside press; keep it open for the
    // next press of the same button
    if (!(await page.evaluate(() => document.getElementById('edm-card')?.classList.contains('open')))) {
      await page.click('#edm');
      await page.waitForTimeout(500);
    }
  }

  console.log(
    `${String(t.i)} ${t.title.padEnd(22)}`,
    state.join(' -> '),
    first
      ? {
          at: `${first.x},${first.y}`,
          overlapsPenDock: overlaps(first, penDock),
          toggleWorks: state.join() === 'open,shut,open',
        }
      : { opened: false }
  );

  // leave nothing open for the next tool
  await page.evaluate(() => {
    try {
      closeDr();
    } catch {
      /* older engine builds have no global */
    }
  });
  await page.waitForTimeout(200);
}

await ctx.close();
await browser.close();
