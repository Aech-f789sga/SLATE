/**
 * A dock saved before the eraser and the pointer existed gains both — once.
 *
 * The dock is read at boot, so the old value has to be in storage *before* the
 * page loads; writing it afterwards only tests the in-memory default.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);

const OLD = [
  { id: 'p1', kind: 'pen', brush: 'ball', mm: 0.4, color: '#111111' },
  { id: 'p2', kind: 'pen', brush: 'fountain', mm: 0.8, color: '#2f6df6' },
  { id: 'p3', kind: 'pen', brush: 'brush', mm: 2.2, color: '#e5383b' },
  { id: 'p4', kind: 'highlighter', brush: 'marker', mm: 4, color: '#ffd93d' },
];

await page.evaluate((old) => {
  localStorage.setItem('inkpad-pen-dock', JSON.stringify(old));
  localStorage.removeItem('inkpad-pen-dock-v2');
}, OLD);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1600);

const after = await page.evaluate(() => ({
  slots: window.__inkpad_pen_dock.slots().map((s) => `${s.kind}${s.erase ? ':' + s.erase : ''}${s.laser ? ':' + s.laser : ''}`),
  flag: localStorage.getItem('inkpad-pen-dock-v2'),
}));
console.log('migrated dock         ', after.slots.join(' '), '| flag', after.flag);

// trim the eraser out and reload: the migration must not fire a second time
await page.evaluate(() => {
  const keep = JSON.parse(localStorage.getItem('inkpad-pen-dock')).filter((s) => s.kind !== 'eraser');
  localStorage.setItem('inkpad-pen-dock', JSON.stringify(keep));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1600);
const kept = await page.evaluate(() => window.__inkpad_pen_dock.slots().map((s) => s.kind));
console.log('after trimming        ', kept.join(' '));

await browser.close();
