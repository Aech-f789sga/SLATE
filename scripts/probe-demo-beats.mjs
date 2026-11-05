/**
 * Learn the exact click sequence the demo video needs, rather than guessing it.
 *
 * Three questions, all about beats that did not exist when the capture script
 * was written:
 *
 *   1. Does a cloned tool in the editor card open its drawer, and what closes it?
 *   2. Where does the soundtrack board sit, and does the theme panel cover it?
 *   3. Does the theme panel's Load button actually change `data-gx-theme`?
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '5199';
const W = 1920;
const H = 1080;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  const mk = (name, cover) => ({
    id: 'nb-' + name.toLowerCase().replace(/\W+/g, ''),
    name,
    cover,
    upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  });
  localStorage.setItem('inkpad', JSON.stringify([mk('Algebra II', '#2f6df6'), mk('Field Notes', '#2a9d4f')]));
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

const box = async (sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const q = n.getBoundingClientRect();
    if (!q.width) return null;
    return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) };
  }, sel);

/* ---- 1. theme panel + Load ---- */
console.log('\n== themes ==');
console.log('theme button   ', await box('#gx-theme-btn'));
await page.click('#gx-theme-btn');
await page.waitForTimeout(700);

const pickAndLoad = async (id) => {
  const before = await page.getAttribute('html', 'data-gx-theme');
  const cardBox = await box(`.gxp-card[data-id="${id}"]`);
  if (!cardBox) return { id, error: 'no card' };
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), `.gxp-card[data-id="${id}"]`);
  await page.waitForTimeout(300);
  await page.click(`.gxp-card[data-id="${id}"]`);
  await page.waitForTimeout(250);
  const btn = await page.evaluate(() => {
    const b = document.querySelector('.gxp-go');
    return b ? { text: b.textContent, disabled: b.disabled } : null;
  });
  await page.click('.gxp-go');
  await page.waitForTimeout(1200);
  const after = await page.getAttribute('html', 'data-gx-theme');
  return { id, before, btn, after, changed: before !== after };
};

console.log('cyberdeck      ', await pickAndLoad('cyberdeck'));
console.log('anime          ', await pickAndLoad('anime'));

console.log('panel open     ', await box('#gxp'));
await page.click('.gxp-x');
await page.waitForTimeout(900);

/* ---- 2. the soundtrack board ---- */
console.log('\n== soundtrack board ==');
console.log('gxm root       ', await box('#gxm'));
console.log('gxm fab        ', await box('#gxm .gxm-fab'));
console.log('gxm classes    ', await page.evaluate(() => document.getElementById('gxm')?.className));
await page.click('#gxm .gxm-fab');
await page.waitForTimeout(600);
console.log('board open     ', await box('#gxm'));
console.log('stepper        ', await box('#gxm [data-trk="1"]'));
console.log('track text     ', await page.textContent('#gxm .gxm-track'));
console.log('num            ', await page.textContent('#gxm .gxm-tnum').catch(() => null));
const t0 = await page.textContent('#gxm .gxm-tnum').catch(() => null);
await page.click('#gxm [data-trk="1"]');
await page.waitForTimeout(700);
const t1 = await page.textContent('#gxm .gxm-tnum').catch(() => null);
console.log('skip track     ', { from: t0, to: t1 });
console.log('board close btn', await box('#gxm .gxm-x'));

/* ---- 3. the editor card's tools ---- */
console.log('\n== editor card ==');
await page.evaluate(() => document.getElementById('gxm')?.classList.remove('open'));
await page.evaluate(() => window.openNotebook(JSON.parse(localStorage.getItem('inkpad'))[0]));
await page.waitForTimeout(2200);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

await page.click('#edm');
await page.waitForTimeout(900);
console.log('card           ', await box('#edm-card'));
console.log('titles         ', await page.evaluate(() =>
  Array.from(document.querySelectorAll('#edm-card .edm-tools button')).map((b) => b.title || b.getAttribute('aria-label'))
));

const first = await page.evaluate(() => {
  const b = document.querySelector('#edm-card .edm-tools button');
  if (!b) return null;
  const q = b.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2, title: b.title };
});
console.log('first tool     ', first);

const drawer = async () =>
  page.evaluate(() => {
    const d = document.getElementById('gn-drw');
    if (!d) return 'missing';
    const q = d.getBoundingClientRect();
    return { display: getComputedStyle(d).display, w: Math.round(q.width), h: Math.round(q.height) };
  });

await page.mouse.click(first.x, first.y);
await page.waitForTimeout(900);
console.log('drawer after 1 ', await drawer());
console.log('card still open', await page.evaluate(() => document.getElementById('edm-card')?.classList.contains('open')));

await page.mouse.click(first.x, first.y);
await page.waitForTimeout(900);
console.log('drawer after 2 ', await drawer());

// if the second click did not close it, try the documented close path
const d2 = await drawer();
if (d2.display === 'block') {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  console.log('drawer after Esc', await drawer());
}

/* ---- 4. does the page card still read three groups? ---- */
await page.click('.edm-x').catch(() => {});
await page.waitForTimeout(500);
await page.click('#pgm');
await page.waitForTimeout(900);
console.log('\npage card heads', await page.evaluate(() =>
  Array.from(document.querySelectorAll('#pgm-card h4, #pgm-card .pgm-h')).map((n) => n.textContent.trim())
));
console.log('page card box  ', await box('#pgm-card'));

await ctx.close();
await browser.close();
