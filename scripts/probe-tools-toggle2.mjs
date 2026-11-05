/**
 * The neighbours of the toggle fix: switching between tools, dismissing by
 * pressing away, and the two buttons that never open a drawer at all.
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

const drawer = () =>
  page.evaluate(() => {
    const d = document.getElementById('gn-drw');
    if (!d) return { display: 'missing' };
    const q = d.getBoundingClientRect();
    return { display: getComputedStyle(d).display, x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) };
  });

const pen = await page.evaluate(() => {
  const p = document.getElementById('ink-pen').getBoundingClientRect();
  return { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) };
});

const tool = async (i) =>
  page.evaluate((n) => {
    const b = document.querySelectorAll('#edm-card .edm-tools button')[n];
    const q = b.getBoundingClientRect();
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  }, i);

const press = async (p, settle = 520) => {
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(settle);
};

await page.click('#edm');
await page.waitForTimeout(800);
console.log(`viewport ${W}x${H}  pen row ${JSON.stringify(pen)}`);

/* switch: Guides open, then Layers */
await press(await tool(0));
const a = await drawer();
await press(await tool(1));
const b = await drawer();
console.log('switch        ', {
  guidesWas: a.display,
  layersIs: b.display,
  movedToLayers: b.x !== a.x,
  clearOfPen: b.y >= pen.y + pen.h,
});

/* dismiss by pressing away, then reopen from the same icon */
const cv = await page.evaluate(() => {
  const q = document.getElementById('cv').getBoundingClientRect();
  return { x: q.x, y: q.y, w: q.width, h: q.height };
});
await press({ x: cv.x + cv.w * 0.5, y: cv.y + cv.h * 0.72 });
const afterAway = await drawer();
// pressing away shuts the card too — that is the card's own rule — so bring it
// back before reaching for the icon again
if (!(await page.evaluate(() => document.getElementById('edm-card')?.classList.contains('open')))) {
  await page.click('#edm');
  await page.waitForTimeout(700);
}
await press(await tool(1));
const reopened = await drawer();
console.log('press away    ', {
  closed: afterAway.display !== 'block',
  reopensFromSameIcon: reopened.display === 'block',
});

/* the two that are not dropdowns */
const title = (i) => page.evaluate((n) => document.querySelectorAll('#edm-card .edm-tools button')[n].title, i);
const before = await title(2);
await press(await tool(2), 1200);
const after1 = await title(2);
await press(await tool(2), 1200);
const after2 = await title(2);
console.log('animate       ', { before, after1, after2, toggles: before !== after1 && before === after2 });

await page.screenshot({ path: `shots/tools-${W}x${H}.png` });
await ctx.close();
await browser.close();
