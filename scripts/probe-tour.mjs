/**
 * Walk both tours and report, per step, what a person would actually see:
 * whether the step found its target, whether the spotlight landed on it, and
 * whether the demo canvas has anything on it. A step whose canvas is blank is
 * a step claiming to show something it does not.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1500);

const read = async () =>
  page.evaluate(() => {
    const card = document.getElementById('tour-card');
    const wrap = document.getElementById('tour-demo-wrap');
    const cv = document.getElementById('tour-demo');
    let ink = 0;
    let colors = 0;
    if (cv && wrap && getComputedStyle(wrap).display !== 'none' && cv.width > 0) {
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 37) {
        const k = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4);
        if (!seen.has(k)) {
          seen.add(k);
          colors++;
        }
        if (d[i] + d[i + 1] + d[i + 2] < 690) ink++;
      }
    }
    const hole = document.getElementById('tour-hole');
    return {
      title: card?.querySelector('#tour-title')?.textContent || '',
      count: card?.querySelector('#tour-count')?.textContent || '',
      demoShown: !!wrap && getComputedStyle(wrap).display !== 'none',
      demoColors: colors,
      demoInk: ink,
      holeOpacity: hole ? getComputedStyle(hole).opacity : '-',
      holeW: hole ? Math.round(hole.getBoundingClientRect().width) : 0,
    };
  });

const walk = async (label) => {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    // The spotlight has an opacity transition, so a single read right after
    // Next can catch it at 0 and report a working step as broken.
    await page.waitForTimeout(600);
    const first = await read();
    await page.waitForTimeout(400);
    const r = await read();
    r.holeOpacity = r.holeOpacity === '1' || first.holeOpacity === '1' ? '1' : r.holeOpacity;
    if (!r.title) break;
    if (rows.length && rows[rows.length - 1].count === r.count) break;
    rows.push(r);
    const nextBtn = await page.$('#tour-next');
    if (!nextBtn) break;
    await nextBtn.click();
    const after = await read();
    if (after.count === r.count) break; // last step
  }
  console.log(`\n=== ${label}: ${rows.length} steps ===`);
  for (const r of rows) {
    const flags = [];
    if (!r.demoShown) flags.push('no demo');
    else if (r.demoColors < 4) flags.push(`BLANK canvas (${r.demoColors} tones)`);
    if (r.holeOpacity === '0') flags.push('no spotlight');
    console.log(`${r.count.padEnd(7)} ${r.title.slice(0, 40).padEnd(42)} ${flags.join(', ') || 'ok'}`);
  }
  return rows;
};

const home = await walk('home tour');
// leave it, then open a notebook for the editor tour
await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  const n = {
    id: Date.now(), name: 'Tour', upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(2500);
const editor = await walk('editor tour');

const noDemo = [...home, ...editor].filter((r) => !r.demoShown).length;
const blank = [...home, ...editor].filter((r) => r.demoShown && r.demoColors < 4);
console.log(`\nsteps with no animation: ${noDemo}`);
console.log(`steps with a blank animation: ${blank.length ? blank.map((b) => b.title).join(', ') : 'none'}`);

await browser.close();
