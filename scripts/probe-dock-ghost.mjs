/** Holding a pen must preview the slot it will take, in normal and lock mode. */
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  localStorage.setItem('inkpad-pen-dock-v2', '1');
  localStorage.setItem('inkpad-pen-dock', JSON.stringify([
    { id: 'p1', kind: 'pen', brush: 'ball', mm: 0.4, color: '#111111' },
    { id: 'p2', kind: 'pen', brush: 'fountain', mm: 0.8, color: '#2f6df6' },
    { id: 'p3', kind: 'pen', brush: 'brush', mm: 2.2, color: '#e5383b' },
    { id: 'p4', kind: 'highlighter', brush: 'marker', mm: 4, color: '#ffd93d' },
    { id: 'p5', kind: 'eraser', brush: 'ball', mm: 1.6, color: '#f2b6c2', erase: 'stroke' },
    { id: 'p6', kind: 'bucket', brush: 'ball', mm: 0.4, color: '#2a9d4f' },
  ]));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const n={id:Date.now(),name:'D',upd:Date.now(),pages:[{tpl:'lined',col:'',strokes:[],pw:800,ph:1100}]}; window.lib.push(n); window.openNotebook(n); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const s=[...document.querySelectorAll('button')].find(b=>/skip tour/i.test(b.textContent||'')); s?.click(); document.getElementById('tour-root')?.remove(); });
await page.waitForTimeout(600);

const slot = (i) => page.evaluate((k) => {
  const n = document.querySelectorAll('#pen-dock .pd-slot')[k];
  const r = n.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, color: n.style.getPropertyValue('--pen') };
}, i);

async function lift(from, dy) {
  const a = await slot(from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.waitForTimeout(1200);            // the hold
  await page.mouse.move(a.x, a.y + dy, { steps: 6 });
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => {
    const g = document.querySelector('#pen-dock .pd-ghost');
    const slots = [...document.querySelectorAll('#pen-dock .pd-slot')];
    return {
      ghost: !!g,
      ghostAt: g ? slots.indexOf(g) : -1,
      ghostArt: g ? !!g.querySelector('.pd-art svg') : false,
      count: slots.length,
    };
  });
  return { state, at: a };
}

const r1 = await lift(0, 120);
console.log('normal', JSON.stringify(r1.state));
const r = await page.evaluate(() => { const b = document.getElementById('pen-dock').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
await page.screenshot({ path: 'shots/dock-ghost.png', clip: { x: r.x - 6, y: r.y - 6, width: r.w + 90, height: r.h + 12 } });
await page.mouse.up();
await page.waitForTimeout(400);

// the bucket slot
const kinds = await page.evaluate(() => [...document.querySelectorAll('#pen-dock .pd-slot')].map((n) => n.getAttribute('aria-label')));
console.log('slots', JSON.stringify(kinds));
const bucket = await page.evaluate(() => {
  const n = [...document.querySelectorAll('#pen-dock .pd-slot')].find((x) => /bucket/i.test(x.getAttribute('aria-label') || ''));
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (bucket) {
  await page.mouse.click(bucket.x, bucket.y);
  await page.waitForTimeout(400);
  console.log('tool after bucket', await page.evaluate(() => eval('tool')));
}
// lock mode: the rail moves to the top edge and the preview must follow it
await page.evaluate(() => window.__inkpad_focus.set(true));
await page.waitForTimeout(700);
const f = await page.evaluate(() => {
  const b = document.getElementById('pen-dock').getBoundingClientRect();
  return { side: document.getElementById('pen-dock').dataset.side, x: b.x, y: b.y, w: b.width, h: b.height };
});
console.log('focus side', f.side);
const s0 = await slot(0);
await page.mouse.move(s0.x, s0.y);
await page.mouse.down();
await page.waitForTimeout(1200);
await page.mouse.move(s0.x + 120, s0.y, { steps: 6 });
await page.waitForTimeout(200);
console.log('focus', JSON.stringify(await page.evaluate(() => {
  const g = document.querySelector('#pen-dock .pd-ghost');
  return { ghost: !!g, art: !!g?.querySelector('.pd-art svg') };
})));
await page.screenshot({ path: 'shots/dock-ghost-focus.png', clip: { x: f.x - 6, y: f.y - 6, width: f.w + 12, height: f.h + 90 } });
await page.mouse.up();
await page.waitForTimeout(300);
await page.evaluate(() => window.__inkpad_focus.set(false));
await browser.close();
