/**
 * The editor pill and its card: does it sit beside the page pill, does it drop
 * down and go back up, do the two checkboxes drive the engine's own `#po` and
 * `#snd`, and does the page card still behave.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = process.env.PORT || '5199';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem(
    'inkpad',
    JSON.stringify([
      {
        id: 'shot1',
        t: 'Algebra II',
        cov: '#2f6df6',
        upd: Date.now(),
        pages: [
          { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 },
          { tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 },
        ],
      },
    ])
  );
});

const out = (k, v) => console.log(`${k.padEnd(34)} ${v}`);

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(900);
await page.evaluate(() => {
  const lib = JSON.parse(localStorage.getItem('inkpad') || '[]');
  window.openNotebook(lib[0]);
});
await page.waitForTimeout(1600);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

/* ---- 1. the pill is beside the page pill, in the closed bar ---- */
const geom = await page.evaluate(() => {
  const r = (id) => {
    const n = document.getElementById(id);
    if (!n) return null;
    const q = n.getBoundingClientRect();
    return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) };
  };
  const po = document.getElementById('po');
  const lab = po?.closest('label');
  return {
    pgm: r('pgm'),
    edm: r('edm'),
    card: r('edm-card'),
    poLabel: lab ? getComputedStyle(lab).display : 'no label',
    sndLabel: (() => {
      const s = document.getElementById('snd')?.closest('label');
      return s ? getComputedStyle(s).display : 'no label';
    })(),
  };
});
out('page pill', JSON.stringify(geom.pgm));
out('editor pill', JSON.stringify(geom.edm));
out('pill gap (px)', geom.edm && geom.pgm ? geom.edm.x - (geom.pgm.x + geom.pgm.w) : 'n/a');
out('same row (y)', geom.edm && geom.pgm ? geom.edm.y - geom.pgm.y : 'n/a');
out('card display (closed)', geom.card ? geom.card.w : 'not rendered');
out('engine Pen only label', geom.poLabel);
out('engine Sound label', geom.sndLabel);

/* ---- 2. it drops down ---- */
await page.evaluate(() => window.__inkpad_edmenu.open());
await page.waitForTimeout(350);
const openGeom = await page.evaluate(() => {
  const c = document.getElementById('edm-card').getBoundingClientRect();
  const p = document.getElementById('edm').getBoundingClientRect();
  return {
    x: Math.round(c.x),
    y: Math.round(c.y),
    w: Math.round(c.width),
    h: Math.round(c.height),
    belowPill: Math.round(c.y - p.bottom),
    rightAligned: Math.round(p.right - c.right),
    open: document.getElementById('edm-card').classList.contains('open'),
    expanded: document.getElementById('edm').getAttribute('aria-expanded'),
    onScreen: c.x >= 0 && c.y >= 0 && c.right <= innerWidth && c.bottom <= innerHeight,
  };
});
out('card open', JSON.stringify(openGeom));
await page.screenshot({ path: `${OUT}/edm-open.png` });
await page.screenshot({
  path: `${OUT}/edm-open-crop.png`,
  clip: { x: openGeom.x - 40, y: openGeom.y - 70, width: openGeom.w + 80, height: openGeom.h + 100 },
});

/* ---- 3. the mirror drives the engine ---- */
const mirror = await page.evaluate(() => {
  const m = document.getElementById('edm-po');
  const real = document.getElementById('po');
  const before = real.checked;
  m.checked = !before;
  m.dispatchEvent(new Event('change'));
  return { before, after: real.checked, touchAction: document.getElementById('cv').style.touchAction };
});
out('Pen only mirror -> #po', JSON.stringify(mirror));

const snd = await page.evaluate(() => {
  const m = document.getElementById('edm-snd');
  const real = document.getElementById('snd');
  const before = real.checked;
  m.checked = !before;
  m.dispatchEvent(new Event('change'));
  return { before, after: real.checked };
});
out('Sound mirror -> #snd', JSON.stringify(snd));

/* ---- 4. the engine writing back reaches the mirror ---- */
const back = await page.evaluate(() => {
  const real = document.getElementById('po');
  real.checked = true;
  real.dispatchEvent(new Event('change'));
  return document.getElementById('edm-po').checked;
});
out('engine #po change -> mirror', back);

/* ---- 5. outside press closes it ---- */
await page.mouse.click(200, 620);
await page.waitForTimeout(250);
out('closed by outside press', !(await page.evaluate(() => window.__inkpad_edmenu.isOpen())));
out('card display after close', await page.evaluate(() => getComputedStyle(document.getElementById('edm-card')).display));

/* ---- 6. the two cards are exclusive ---- */
await page.evaluate(() => window.__inkpad_edmenu.open());
await page.waitForTimeout(220);
await page.evaluate(() => window.__inkpad_pagemenu.open());
await page.waitForTimeout(300);
out('page card closed the editor', !(await page.evaluate(() => window.__inkpad_edmenu.isOpen())));
const both = await page.evaluate(() => {
  const c = document.getElementById('edm-card');
  const b = document.getElementById('bar2');
  return { edm: getComputedStyle(c).display, bar: b.classList.contains('open') };
});
out('while page card is open', JSON.stringify(both));
await page.screenshot({ path: `${OUT}/pgm-open-after.png` });

/* ---- 7. and back the other way ---- */
await page.evaluate(() => window.__inkpad_edmenu.open());
await page.waitForTimeout(300);
const rev = await page.evaluate(() => ({
  edm: window.__inkpad_edmenu.isOpen(),
  bar: window.__inkpad_pagemenu.isOpen(),
  pillVisible: getComputedStyle(document.getElementById('edm')).display,
}));
out('editor reopens, page card shuts', JSON.stringify(rev));

/* ---- 8. the card keeps the editor group out of it ---- */
const groups = await page.evaluate(() => {
  const b = document.getElementById('bar2');
  return Array.from(b.querySelectorAll('.pgm-lab')).map((n) => n.textContent);
});
out('card headings', JSON.stringify(groups));

await browser.close();
