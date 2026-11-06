/* Regression probe: exporting a notebook from the library card menu.
 *
 *   node scripts/probe-lib-export.mjs [baseURL]
 *
 * The ⋯ menu on a library card can now export the notebook without opening it.
 * The sheet is the editor's own "Export and share" — same seven routes, same
 * code — and the exporters are lent the chosen notebook for as long as the
 * work takes, because every one of them reads the module-level nb/pi.
 *
 * Covers:
 *   1. The card menu offers Export.
 *   2. Choosing it closes the menu and opens the export sheet.
 *   3. The sheet carries the same seven routes as the editor's.
 *   4. With nothing open, the single-page routes say "first page", not "this
 *      page".
 *   5. The backup route hands over the notebook that was picked, not another.
 *   6. The PNG route names page 1 and produces a real image.
 *   7. nb is still null afterwards — the lend was handed back.
 *   8. Opening a card still works, so the lend left no state behind.
 *   9. The editor's own sheet still says "this page".
 *  10. The editor drawer still clears the toolbar.
 *  11. No page errors.
 *  12. On a phone the library sheet docks at the bottom, over the mood pill.
 *  13. On a phone the editor sheet docks too, instead of stretching.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
console.log(`target: ${BASE}`);

let failed = 0;
const ok = (label, pass, detail = '') => {
  if (pass) console.log(`PASS ${label}${detail ? '  — ' + detail : ''}`);
  else {
    failed++;
    console.log(`FAIL ${label}${detail ? '  — ' + detail : ''}`);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  // Two notebooks, so "the one that was picked" is a real question.
  const mk = (id, name) => ({
    id,
    name,
    upd: Date.now() - id,
    pages: [
      { tpl: 'lined', col: '', strokes: [{ t: 'pen', c: '#111111', w: 3, p: [[100, 200], [300, 260], [500, 220]] }], pw: 800, ph: 1100 },
      { tpl: 'grid', col: '', strokes: [], pw: 800, ph: 1100 },
    ],
  });
  localStorage.setItem('inkpad', JSON.stringify([mk(1, 'Alpha notebook'), mk(2, 'Beta notebook')]));
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));

/* Capture what the exporters would have saved, instead of touching the disk. */
await page.evaluate(() => {
  window.__cap = [];
  window.saveBlob = async (blob, name) => {
    let text = '';
    let size = 0;
    try {
      size = blob.size;
      if (/json|svg|text/.test(blob.type)) text = await blob.text();
    } catch {}
    window.__cap.push({ name, size, type: blob.type, text });
  };
});

/* ---- 1 & 2: the menu entry ---- */

const cards = await page.$$('#grid .card');
ok('0. two cards are on the shelf', cards.length === 2, `${cards.length} cards`);

/* `#grid` starts with the "+ new" tile, so nth-of-type is not the card index. */
await (await cards[0].$('.lib-more')).click();
await page.waitForTimeout(350);
const items = await page.$$eval('#lib-menu .lm-item span', (s) => s.map((x) => x.textContent));
ok('1. the card menu offers Export', items.includes('Export'), items.join(', '));

await page.evaluate(() => {
  const it = [...document.querySelectorAll('#lib-menu .lm-item')].find((x) => x.textContent.trim() === 'Export');
  it.click();
});
await page.waitForTimeout(500);

const sheet = await page.evaluate(() => {
  const d = document.getElementById('gn-drw');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const cs = getComputedStyle(d);
  return {
    visible: cs.display !== 'none' && r.width > 0,
    menuOpen: document.getElementById('lib-menu')?.classList.contains('on'),
    labels: [...d.querySelectorAll('button > div:first-child')].map((x) => x.textContent),
    note: d.textContent,
  };
});
ok('2. choosing it closes the menu and opens the sheet', !!sheet?.visible && sheet.menuOpen === false, `sheet:${sheet?.visible} menu:${sheet?.menuOpen}`);

const ROUTES = ['PDF, all pages', 'Layered PSD', 'Vector SVG', 'Image PNG', 'Everything (ZIP)', 'Inkpad backup', 'Print'];
ok(
  '3. the sheet carries the same seven routes',
  ROUTES.every((r) => sheet?.labels.some((l) => l.startsWith(r))),
  (sheet?.labels || []).join(' · ')
);
ok(
  '4. single-page routes name the page instead of "this page"',
  sheet?.labels.includes('Vector SVG, first page') && sheet?.labels.includes('Image PNG, first page'),
  (sheet?.labels || []).filter((l) => /SVG|PNG/.test(l)).join(' · ')
);

/* ---- 5: the backup route exports the notebook that was picked ---- */

const pick = await page.evaluate(() => {
  const d = document.getElementById('gn-drw');
  const b = [...d.querySelectorAll('button')].find((x) => x.textContent.startsWith('Inkpad backup'));
  b.click();
  return !!b;
});
await page.waitForTimeout(900);
const backup = await page.evaluate(() => {
  const c = window.__cap.find((x) => /\.inkpad\.json$/.test(x.name));
  if (!c) return null;
  let data = null;
  try { data = JSON.parse(c.text); } catch {}
  return { name: c.name, notebook: data && data.name, pages: data && data.pages && data.pages.length, strokes: data && data.pages && data.pages[0].strokes.length };
});
ok(
  '5. the backup route exports the notebook that was picked',
  !!backup && /Alpha notebook/.test(backup.name) && backup.notebook === 'Alpha notebook' && backup.pages === 2 && backup.strokes === 1,
  JSON.stringify(backup)
);

/* ---- 6: a per-page route renders page 1 ---- */

await page.evaluate(() => {
  const card = document.querySelectorAll('#grid .card')[0];
  card.querySelector('.lib-more').click();
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const it = [...document.querySelectorAll('#lib-menu .lm-item')].find((x) => x.textContent.trim() === 'Export');
  it.click();
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const d = document.getElementById('gn-drw');
  [...d.querySelectorAll('button')].find((x) => x.textContent.startsWith('Image PNG')).click();
});
await page.waitForTimeout(1500);
const png = await page.evaluate(() => window.__cap.find((x) => /\.png$/.test(x.name)));
ok(
  '6. the PNG route names page 1 and produces a real image',
  !!png && /-page1\.png$/.test(png.name) && png.type === 'image/png' && png.size > 1000,
  png ? `${png.name} · ${png.size} bytes` : 'no capture'
);

/* ---- 7 & 8: the lend was handed back ---- */

const after = await page.evaluate(() => ({ nb: window.eval('nb'), pi: window.eval('pi') }));
ok('7. nb is still null afterwards', after.nb === null, `nb:${String(after.nb)} pi:${after.pi}`);

await (await page.$$('#grid .card'))[0].click();
await page.waitForTimeout(1800);
const opened = await page.evaluate(() => ({
  ed: getComputedStyle(document.getElementById('ed')).display,
  name: window.eval('nb')?.name,
  pi: window.eval('pi'),
}));
ok('8. opening a card still works', opened.ed === 'flex' && !!opened.name, `ed:${opened.ed} nb:${opened.name} pi:${opened.pi}`);

/* ---- 9: the editor sheet is unchanged ---- */

await page.evaluate(() => document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove()));
// #share lives in the legacy bar, which the editor menu hides on desktop, so
// open the sheet the way that button does rather than clicking a hidden node.
await page.evaluate(() => window.eval("openDr(document.querySelector('#share'), fillShare)"));
await page.waitForTimeout(500);
const editorLabels = await page.evaluate(() =>
  [...document.querySelectorAll('#gn-drw button > div:first-child')].map((x) => x.textContent)
);
ok(
  '9. the editor sheet still says "this page"',
  editorLabels.includes('Vector SVG, this page') && editorLabels.includes('Image PNG, this page'),
  editorLabels.filter((l) => /SVG|PNG/.test(l)).join(' · ')
);

/* The drawer's top is clamped under the editor's toolbar by theme.ts. That
   clamp must keep working for the editor, and stand down everywhere else. */
const edBox = await page.evaluate(() => {
  const d = document.getElementById('gn-drw').getBoundingClientRect();
  const t = document.getElementById('tb').getBoundingClientRect();
  return { top: Math.round(d.top), tbBottom: Math.round(t.bottom), vh: innerHeight };
});
ok(
  '10. the editor drawer still clears the toolbar',
  edBox.top >= edBox.tbBottom && edBox.top < edBox.vh / 2,
  `top ${edBox.top} vs toolbar bottom ${edBox.tbBottom}`
);

ok('11. no page errors', errors.length === 0, errors.join(' | ').slice(0, 200));

/* ---- 12 & 13: the same two sheets on a phone ---- */

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const pp = await phone.newPage();
await pp.route('https://fonts.googleapis.com/**', (r) => r.abort());
await pp.route('https://fonts.gstatic.com/**', (r) => r.abort());
await pp.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v5', '1');
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad', JSON.stringify([{ id: 9, name: 'Pocket notes', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] }]));
});
await pp.goto(BASE, { waitUntil: 'domcontentloaded' });
await pp.waitForSelector('#grid', { timeout: 20000 });
await pp.waitForTimeout(1600);
await pp.evaluate(() => {
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove());
  document.querySelectorAll('#grid .card')[0].querySelector('.lib-more').click();
});
await pp.waitForTimeout(300);
await pp.evaluate(() => [...document.querySelectorAll('#lib-menu .lm-item')].find((x) => x.textContent.trim() === 'Export').click());
await pp.waitForTimeout(800);

const pocket = await pp.evaluate(() => {
  const d = document.getElementById('gn-drw');
  const r = d.getBoundingClientRect();
  const pill = document.getElementById('gxm');
  const pr = pill ? pill.getBoundingClientRect() : null;
  const top = pr ? document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2) : null;
  return {
    gapBelow: Math.round(innerHeight - (r.top + r.height)),
    height: Math.round(r.height),
    vh: innerHeight,
    pill: !!pr,
    pillCoveredBy: top ? top.closest('#gn-drw') ? 'sheet' : top.id || top.className : 'nothing',
  };
});
ok(
  '12. on a phone the library sheet docks to the bottom, over the mood pill',
  pocket.gapBelow <= 12 && pocket.height <= pocket.vh * 0.6 && (!pocket.pill || pocket.pillCoveredBy === 'sheet'),
  `${pocket.gapBelow}px below · ${pocket.height}px tall · pill: ${pocket.pillCoveredBy}`
);

await pp.evaluate(() => {
  window.openNotebook(window.lib[0]);
});
await pp.waitForTimeout(1600);
await pp.evaluate(() => {
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((x) => x.remove());
  window.eval("openDr(document.querySelector('#share'), fillShare)");
});
await pp.waitForTimeout(600);
const edPhone = await pp.evaluate(() => {
  const d = document.getElementById('gn-drw').getBoundingClientRect();
  return { gapBelow: Math.round(innerHeight - (d.top + d.height)), height: Math.round(d.height), vh: innerHeight, top: Math.round(d.top) };
});
ok(
  '13. the editor sheet docks on a phone too, instead of stretching',
  edPhone.gapBelow <= 12 && edPhone.height <= edPhone.vh * 0.6,
  `${edPhone.gapBelow}px below · ${edPhone.height}px tall · top ${edPhone.top}`
);
await phone.close();

await browser.close();
console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
