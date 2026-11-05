/**
 * Walk both tours and check that every step with a clip really plays it:
 * the <video> must be visible, decoded, and moving.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

const failedReqs = [];
page.on('requestfailed', (r) => {
  if (r.url().includes('/demos/')) failedReqs.push(r.url());
});

await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1600);

const read = () =>
  page.evaluate(() => {
    const wrap = document.getElementById('tour-demo-wrap');
    const v = document.getElementById('tour-video');
    const cv = document.getElementById('tour-demo');
    const tag = document.getElementById('tour-demo-tag');
    return {
      title: document.getElementById('tour-title')?.textContent || '',
      count: document.getElementById('tour-count')?.textContent || '',
      wrap: wrap ? getComputedStyle(wrap).display : 'none',
      vidShown: v ? getComputedStyle(v).display !== 'none' && !!v.offsetParent : false,
      src: v ? (v.getAttribute('src') || '') : '',
      ready: v ? v.readyState : -1,
      w: v ? v.videoWidth : 0,
      t: v ? v.currentTime : -1,
      paused: v ? v.paused : true,
      cvShown: cv ? getComputedStyle(cv).display !== 'none' : false,
      tag: tag ? tag.textContent : '',
    };
  });

async function walk(label, max) {
  const rows = [];
  for (let i = 0; i < max; i++) {
    await page.waitForTimeout(520);
    const a = await read();
    await page.waitForTimeout(420);
    const b = await read();
    rows.push({ ...b, moved: b.t > a.t + 0.02 });
    const n = await page.$('#tour-next');
    if (!n) break;
    await n.click();
    const after = await page.evaluate(() => document.getElementById('tour-count')?.textContent);
    if (after === b.count) break;
  }
  console.log('\n== ' + label + ' (' + rows.length + ' steps)');
  let bad = 0;
  for (const r of rows) {
    const kind = r.vidShown ? 'VIDEO' : r.cvShown ? 'canvas' : 'none ';
    const ok = !r.vidShown || (r.ready >= 2 && r.w > 0 && r.moved);
    if (r.vidShown && !ok) bad++;
    console.log(
      `  ${kind} ${ok ? 'ok  ' : 'BAD '} ${String(r.w).padStart(4)}w r${r.ready} t${r.t.toFixed(2)} ${r.moved ? 'moving' : 'stuck '} ${r.tag.padEnd(9)} | ${r.title.slice(0, 40)}`
    );
  }
  console.log('  bad video steps:', bad);
  return bad;
}

const b1 = await walk('home tour', 16);

// into the editor
await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  const nb = { id: Date.now(), name: 'Probe', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(nb);
  window.openNotebook(nb);
});
await page.waitForTimeout(2600);
await page.evaluate(() => document.getElementById('tour-fab')?.click());
await page.waitForTimeout(1200);
const b2 = await walk('editor tour', 60);

console.log('\nfailed clip requests:', failedReqs.length, failedReqs.slice(0, 5).join(' '));
await browser.close();
process.exit(b1 + b2 ? 1 : 0);
