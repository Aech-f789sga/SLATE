/**
 * Walk both tours and report, per step, what a person would actually see.
 *
 * The tour is text only now, so the things worth measuring are different: does
 * the step have a title and a sentence, is the card fully on screen, does the
 * spotlight land on a real target, and does the copy fit without the card
 * having to scroll.
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '3000';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-install-dismissed', '1');
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1500);
// run both tours from the bridge rather than relying on the first-visit flag
await page.evaluate(() => window.__inkpad_tour?.home());

const read = async () =>
  page.evaluate(() => {
    const card = document.getElementById('tour-card');
    if (!card) return null;
    const hole = document.getElementById('tour-hole');
    const cr = card.getBoundingClientRect();
    const body = card.querySelector('#tour-body');
    return {
      title: card.querySelector('#tour-title')?.textContent || '',
      count: card.querySelector('#tour-count')?.textContent || '',
      bodyLen: (body?.textContent || '').trim().length,
      overflow: card.scrollHeight > card.clientHeight + 2,
      offscreen:
        cr.left < -1 || cr.top < -1 || cr.right > window.innerWidth + 1 || cr.bottom > window.innerHeight + 1,
      holeOpacity: hole ? getComputedStyle(hole).opacity : '-',
      holeW: hole ? Math.round(hole.getBoundingClientRect().width) : 0,
      hasDemo: !!document.getElementById('tour-demo-wrap') || !!document.getElementById('tour-video'),
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
    if (!r) break;
    r.holeOpacity = r.holeOpacity === '1' || first.holeOpacity === '1' ? '1' : r.holeOpacity;
    if (!r.title) break;
    if (rows.length && rows[rows.length - 1].count === r.count) break;
    rows.push(r);
    const nextBtn = await page.$('#tour-next');
    if (!nextBtn) break;
    await nextBtn.click();
    const after = await read();
    if (after && after.count === r.count) break; // last step
  }
  console.log(`\n=== ${label}: ${rows.length} steps ===`);
  for (const r of rows) {
    const flags = [];
    if (!r.bodyLen) flags.push('NO BODY');
    else if (r.bodyLen > 260) flags.push(`long body (${r.bodyLen})`);
    if (r.overflow) flags.push('card scrolls');
    if (r.offscreen) flags.push('card off screen');
    if (r.holeOpacity === '0') flags.push('no spotlight');
    if (r.hasDemo) flags.push('DEMO ELEMENT STILL IN DOM');
    console.log(`${r.count.padEnd(7)} ${r.title.slice(0, 38).padEnd(40)} ${flags.join(', ') || 'ok'}`);
  }
  return rows;
};

const home = await walk('home tour');
// leave it, then open a notebook for the editor tour
await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  const n = {
    id: Date.now(),
    name: 'Tour',
    upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(2500);
await page.evaluate(() => window.__inkpad_tour?.editor());
await page.waitForTimeout(900);
const editor = await walk('editor tour');

const all = [...home, ...editor];
const bad = all.filter((r) => !r.bodyLen || r.overflow || r.offscreen || r.hasDemo);
const long = all.filter((r) => r.bodyLen > 260);
console.log(`\ntotal steps: ${all.length}`);
console.log(`steps with a problem: ${bad.length ? bad.map((b) => b.title).join(', ') : 'none'}`);
console.log(`steps with long copy: ${long.length ? long.map((b) => `${b.title} (${b.bodyLen})`).join(', ') : 'none'}`);

await browser.close();
