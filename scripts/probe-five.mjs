import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/tmp/slate-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v4', '1');
  localStorage.setItem('inkpad-tour-editor-v4', '1');
  localStorage.setItem('inkpad-install-dismissed', '1');
  localStorage.setItem('inkpad-timekeeper', '1');
  // only on the very first load — a reload has to keep what was stored
  if (!sessionStorage.getItem('__probe')) {
    sessionStorage.setItem('__probe', '1');
    localStorage.removeItem('inkpad-timer-pos');
    localStorage.removeItem('inkpad-dock-along');
    localStorage.removeItem('inkpad-pg-min');
  }
});
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid');
await page.waitForTimeout(1400);

const log = (...a) => console.log(...a);

/* ---------------- 1. theme panel: home only ---------------- */

const pill = async () =>
  page.evaluate(() => {
    const n = document.getElementById('gxm');
    if (!n) return { exists: false };
    const r = n.getBoundingClientRect();
    return {
      exists: true,
      display: getComputedStyle(n).display,
      cls: n.className,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: (n.textContent || '').trim().slice(0, 40),
    };
  });

log('gxm on home (no mod theme):', JSON.stringify(await pill()));
await page.evaluate(() => {
  document.documentElement.dataset.gxTheme = 'minecraft-sound-fireplace';
});
await page.waitForTimeout(900);
const homePill = await pill();
log('gxm on home (mod theme):    ', JSON.stringify(homePill));
await page.screenshot({ path: `${OUT}/1-home-pill.png` });

/* ---------------- 2. editor ---------------- */

await page.evaluate(() => {
  const n = {
    id: Date.now(),
    name: 'D',
    upd: Date.now(),
    pages: [
      { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 },
      { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 },
    ],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(2200);

const edPill = await pill();
log('gxm in editor:              ', JSON.stringify(edPill));
log('gxm is gone in editor:', edPill.display === 'none');

/* ---------------- 3. lock icon ---------------- */

const lockState = () =>
  page.evaluate(() => {
    const b = document.getElementById('ink-lock');
    if (!b) return null;
    const html = b.innerHTML;
    const closed = html.includes('a4 4 0 018 0v2.7');
    const open = html.includes('a4 4 0 017.4-2.1');
    return { closed, open, title: b.title, pressed: b.getAttribute('aria-pressed'), shown: getComputedStyle(b).display };
  });

const before = await lockState();
log('lock, unlocked:', JSON.stringify(before));
await page.click('#ink-lock');
await page.waitForTimeout(700);
const after = await lockState();
log('lock, locked:  ', JSON.stringify(after));
log('icons correct:', before.open && !before.closed && after.closed && !after.open);
await page.screenshot({ path: `${OUT}/2-focus-locked.png` });

/* ---------------- 4. pen dock: free placement along the edge ---------------- */

const dockInfo = () =>
  page.evaluate(() => {
    const d = document.getElementById('pen-dock');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return {
      side: d.dataset.side,
      cy: d.style.getPropertyValue('--cy'),
      cx: d.style.getPropertyValue('--cx'),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      along: window.__inkpad_pen_dock?.along(),
    };
  });

log('dock on focus entry:', JSON.stringify(await dockInfo()));

const grip = await page.evaluate(() => {
  const g = document.querySelector('#pen-dock .pd-grip');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
log('grip at', grip);

// drag it left, along the top edge, to sit near the top-left corner
await page.mouse.move(grip[0], grip[1]);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  const t = i / 12;
  await page.mouse.move(grip[0] + (140 - grip[0]) * t, grip[1] + (26 - grip[1]) * t);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(500);
const moved = await dockInfo();
log('dock after drop:   ', JSON.stringify(moved));
await page.screenshot({ path: `${OUT}/3-dock-corner.png` });

// and once more, to the right side, to prove it is per edge and sticks
const grip2 = await page.evaluate(() => {
  const g = document.querySelector('#pen-dock .pd-grip');
  const r = g.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
await page.mouse.move(grip2[0], grip2[1]);
await page.mouse.down();
for (let i = 1; i <= 14; i++) {
  const t = i / 14;
  await page.mouse.move(grip2[0] + (1240 - grip2[0]) * t, grip2[1] + (700 - grip2[1]) * t);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(500);
const right = await dockInfo();
log('dock on right:     ', JSON.stringify(right));
await page.screenshot({ path: `${OUT}/4-dock-right.png` });

// leave focus mode again
await page.click('#ink-lock');
await page.waitForTimeout(600);
log('lock, unlocked again:', JSON.stringify(await lockState()));

/* ---------------- 5. page row fold ---------------- */

const rowState = () =>
  page.evaluate(() => {
    const p = document.getElementById('pg');
    const f = document.getElementById('pg-fold');
    const foot = document.getElementById('gn-foot');
    const r = p.getBoundingClientRect();
    const kids = [...p.children].map((n) => ({
      id: n.id || n.className,
      shown: getComputedStyle(n).display !== 'none',
    }));
    return {
      fold: !!f,
      attr: document.documentElement.dataset.pgMin,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      kids,
      foot: foot ? { display: getComputedStyle(foot).display, text: (foot.textContent || '').trim() } : null,
    };
  });

log('page row open:  ', JSON.stringify(await rowState()));
await page.screenshot({ path: `${OUT}/5-row-open.png` });
await page.click('#pg-fold');
await page.waitForTimeout(400);
const folded = await rowState();
log('page row folded:', JSON.stringify(folded));
await page.screenshot({ path: `${OUT}/6-row-folded.png` });

/* ---------------- 6. timer drag ---------------- */

const timerState = () =>
  page.evaluate(() => {
    const t = document.getElementById('gn-timekeeper');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return {
      display: getComputedStyle(t).display,
      left: t.style.left,
      top: t.style.top,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      saved: localStorage.getItem('inkpad-timer-pos'),
    };
  });

log('timer initial:', JSON.stringify(await timerState()));
const face = await page.evaluate(() => {
  const f = document.querySelector('#gn-timekeeper .tk-face');
  const r = f.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
await page.mouse.move(face[0], face[1]);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  const t = i / 12;
  await page.mouse.move(face[0] + (900 - face[0]) * t, face[1] + (600 - face[1]) * t);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(400);
log('timer dragged:', JSON.stringify(await timerState()));
await page.screenshot({ path: `${OUT}/7-timer-moved.png` });

// a click on a button inside the pill must still be a click, not a drag
const before2 = await timerState();
await page.click('#gn-timekeeper [data-role="play"]');
await page.waitForTimeout(300);
const after2 = await timerState();
log('play still works:', before2.rect[0] === after2.rect[0] && before2.rect[1] === after2.rect[1]);

/* ---------------- 7. persistence across reload ---------------- */

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid');
await page.waitForTimeout(1200);
log('fold persisted:', await page.evaluate(() => document.documentElement.dataset.pgMin));
log('timer pos persisted:', await page.evaluate(() => localStorage.getItem('inkpad-timer-pos')));
log('dock along persisted:', await page.evaluate(() => localStorage.getItem('inkpad-dock-along')));

await browser.close();
