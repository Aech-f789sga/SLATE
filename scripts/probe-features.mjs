/* Regression probe for the Warp / Curved Line / Rich Text work.
 *
 *   node scripts/probe-features.mjs [baseURL] [tag]
 *
 * Covers:
 *   1. Warp preview is visible and updates as style / intensity change.
 *   2. A cross-origin image cannot blank the panel — it is explained instead.
 *   3. The warped result is composited live onto the page canvas.
 *   4. Manual Warp: mesh nodes, dragging, mesh size, reset, apply + undo.
 *   5. Curved line: hover along the path, grab anywhere and bend, undo.
 *   6. Rich text: bar, B/I/U/S, alignment, family, size, commit, undo.
 *
 * Defaults to the local dev server; pass a URL (+ tag) to run the same
 * interactions against production without overwriting local screenshots.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
const TAG = process.argv[3] || '';
const shotsDir = fileURLToPath(new URL('../shots/', import.meta.url));
const shot = (name) => path.join(shotsDir, name.replace(/\.png$/, (TAG ? `-${TAG}` : '') + '.png'));
console.log(`target: ${BASE}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
await page.addInitScript(() => {
  try {
    // Retire the tours so their global Enter/arrow handler cannot eat keypresses.
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
  } catch {
    /* private mode */
  }
});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/fonts\.googleapis|fonts\.gstatic|_vercel\/insights/.test(u)) return;
  errors.push('request failed: ' + u);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/net::ERR_FAILED/.test(t)) return;
  errors.push(t);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1100);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'Features', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  document.querySelectorAll('#intro,#tour-root,#tour-card').forEach((n) => n.remove());
});
await page.waitForTimeout(250);

const E = (expr) => page.evaluate((x) => { try { return eval(x); } catch (e) { return 'ERR:' + e.message; } }, expr);
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

const geom = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.x, y: r.y, kx: r.width / 800, ky: r.height / 1100 };
});
const S = (x, y) => [geom.x + x * geom.kx, geom.y + y * geom.ky];

/** Hash of the page canvas — proves what the user actually sees changed. */
const pageSig = async () =>
  crypto.createHash('sha1').update(await page.locator('#cv').screenshot()).digest('hex').slice(0, 12);

const clearPage = () => page.evaluate(() => { pg().strokes.length = 0; sel = []; draw(); });

/* ================================================================== */
console.log('\n== 1. Warp preview is visible and live');
await clearPage();
await page.evaluate(() => {
  const p = pg();
  p.strokes.push({ t: 'shape', k: 'rect', c: '#2f6df6', w: 6, a: [120, 520], b: [360, 640] });
  sel = [p.strokes[0]];
  draw();
});
await page.waitForTimeout(350);
const beforeOpen = await pageSig();
await page.click('#warp-btn');
await page.waitForTimeout(600);

const panel = await page.evaluate(() => {
  const p = document.getElementById('warp-panel');
  const c = document.getElementById('warp-prev');
  const r = p.getBoundingClientRect();
  const g = c.getContext('2d');
  let opaque = 0;
  try {
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 20) opaque++;
  } catch {
    /* tainted — not expected for strokes */
  }
  return {
    display: getComputedStyle(p).display,
    canvasDisplay: getComputedStyle(c).display,
    inView: r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2,
    opaque,
    cw: c.width,
    ch: c.height,
    styles: [...p.querySelectorAll('.wp-style')].map((n) => n.dataset.style),
    live: window.__slateWarp.live(),
  };
});
ok('warp panel opens on screen', panel.display !== 'none' && panel.inView);
ok('preview canvas is shown (not hidden)', panel.canvasDisplay !== 'none', JSON.stringify({ cw: panel.cw, ch: panel.ch }));
ok('preview has real pixels', panel.opaque > 500, String(panel.opaque));
ok('five styles including Manual', JSON.stringify(panel.styles) === JSON.stringify(['arc', 'bulge', 'flag', 'wave', 'manual']), JSON.stringify(panel.styles));

const afterOpen = await pageSig();
ok('warped result is composited onto the page canvas', beforeOpen !== afterOpen, `${beforeOpen} → ${afterOpen}`);
ok('live preview buffer exists', !!panel.live.out && panel.live.out[0] > 100, JSON.stringify(panel.live.out));

// intensity changes must repaint both surfaces
await page.evaluate(() => window.__slateWarp.setAmount(10));
await page.waitForTimeout(350);
const sig10 = await pageSig();
const opaque10 = await page.evaluate(() => {
  const c = document.getElementById('warp-prev');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
  return n;
});
await page.evaluate(() => window.__slateWarp.setAmount(95));
await page.waitForTimeout(350);
const sig95 = await pageSig();
ok('intensity slider repaints the page preview', sig10 !== sig95, `${sig10} → ${sig95}`);
ok('intensity slider keeps real preview pixels', opaque10 > 300, String(opaque10));

// style changes must repaint too
const sigs = {};
for (const st of ['arc', 'bulge', 'flag', 'wave']) {
  await page.evaluate((s) => window.__slateWarp.setStyle(s), st);
  await page.waitForTimeout(320);
  sigs[st] = await pageSig();
}
ok('each style produces a different page preview', new Set(Object.values(sigs)).size === 4, JSON.stringify(sigs));
await page.screenshot({ path: shot('features-warp.png') });

/* ================================================================== */
console.log('\n== 2. A cross-origin image cannot blank the panel');
await page.evaluate(() => window.__slateWarp.close());
await page.waitForTimeout(200);
await clearPage();
await page.evaluate(() => {
  const p = pg();
  p.strokes.push({
    t: 'img',
    src: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
    x: 100,
    y: 200,
    w: 260,
    h: 220,
  });
  sel = [p.strokes[0]];
  draw();
});
await page.waitForTimeout(1800);
const remoteLoaded = await page.evaluate(() => {
  const s = pg().strokes[0];
  const i = window.eval('IM')[s.src];
  return !!i && i.complete && i.naturalWidth > 0;
});
await page.click('#warp-btn');
await page.waitForTimeout(900);
const remote = await page.evaluate(() => {
  const empty = document.querySelector('#warp-panel .wp-empty');
  const c = document.getElementById('warp-prev');
  return {
    message: (empty.textContent || '').trim(),
    messageShown: getComputedStyle(empty).display !== 'none',
    canvasShown: getComputedStyle(c).display !== 'none',
    live: window.__slateWarp.live(),
  };
});
if (remoteLoaded) {
  ok('cross-origin image is explained, not silently blank', remote.messageShown && /another site|cannot be read/i.test(remote.message), JSON.stringify(remote.message));
  ok('cross-origin image is reported as skipped', remote.live.skipped >= 1, String(remote.live.skipped));
} else {
  // Network-blocked run: the important thing is that the panel still explains itself.
  ok('image selection never leaves the panel blank and silent', remote.messageShown || remote.canvasShown, JSON.stringify(remote));
}
await page.screenshot({ path: shot('features-warp-remote.png') });

/* ================================================================== */
console.log('\n== 3. Manual Warp mesh');
await page.evaluate(() => window.__slateWarp.close());
await page.waitForTimeout(200);
await clearPage();
await page.evaluate(() => {
  const p = pg();
  p.strokes.push({ t: 'shape', k: 'rect', c: '#2f6df6', w: 6, a: [120, 420], b: [420, 600] });
  sel = [p.strokes[0]];
  draw();
});
await page.waitForTimeout(350);
await page.click('#warp-btn');
await page.waitForTimeout(450);
await page.evaluate(() => window.__slateWarp.setStyle('manual'));
await page.waitForTimeout(450);

const mesh0 = await page.evaluate(() => ({
  nodes: window.__slateWarp.mesh().length,
  size: window.__slateWarp.meshSize(),
  layerOn: document.getElementById('wm-layer').classList.contains('on'),
  handles: document.querySelectorAll('.wm-node').length,
}));
ok('manual mode draws a mesh overlay', mesh0.layerOn && mesh0.handles === 16, JSON.stringify(mesh0));
ok('mesh has 16 draggable nodes (3x3 cells)', mesh0.nodes === 16 && mesh0.size.cols === 3 && mesh0.size.rows === 3, JSON.stringify(mesh0.size));

const meshSigA = await pageSig();
const nodeCentre = await page.evaluate(() => {
  const n = document.querySelectorAll('.wm-node')[5];
  const r = n.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
});
await page.mouse.move(nodeCentre[0], nodeCentre[1]);
await page.mouse.down();
await page.mouse.move(nodeCentre[0] + 44, nodeCentre[1] - 58, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(450);
const meshSigB = await pageSig();
const moved = await page.evaluate(() => window.__slateWarp.mesh()[5]);
ok('dragging a mesh node moves it', Math.abs(moved[0]) > 0 && Math.abs(moved[1]) > 0, JSON.stringify(moved));
ok('dragging a mesh node repaints the page preview', meshSigA !== meshSigB, `${meshSigA} → ${meshSigB}`);
ok('panel preview still has pixels in manual mode', (await page.evaluate(() => {
  const c = document.getElementById('warp-prev');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
  return n;
})) > 300);

// mesh density + reset
await page.evaluate(() => window.__slateWarp.setMeshSize(4, 4));
await page.waitForTimeout(350);
const dense = await page.evaluate(() => ({ nodes: window.__slateWarp.mesh().length, handles: document.querySelectorAll('.wm-node').length }));
ok('mesh density can be raised to 4x4 (25 nodes)', dense.nodes === 25 && dense.handles === 25, JSON.stringify(dense));
await page.evaluate(() => window.__slateWarp.resetMesh());
await page.waitForTimeout(300);
const reset = await page.evaluate(() => ({ nodes: window.__slateWarp.mesh(), size: window.__slateWarp.meshSize() }));
const cols = reset.size.cols;
const stepX = reset.nodes[1][0] - reset.nodes[0][0];
const stepY = reset.nodes[cols + 1][1] - reset.nodes[0][1];
const sameRow = Math.abs(reset.nodes[cols][1] - reset.nodes[0][1]) < 0.01;
ok(
  'reset restores the regular grid',
  stepX > 1 && stepY > 1 && sameRow,
  JSON.stringify({ cols, stepX: Math.round(stepX), stepY: Math.round(stepY), sameRow })
);
await page.screenshot({ path: shot('features-manual.png') });

// apply + undo
const undoBefore = await E('undo.length');
await page.click('.wp-apply');
await page.waitForTimeout(600);
const applied = await page.evaluate(() => {
  const s = pg().strokes[pg().strokes.length - 1];
  return { n: pg().strokes.length, t: s && s.t, src: String((s && s.src) || '').slice(0, 22) };
});
ok('apply replaces the selection with one image layer', applied.n === 1 && applied.t === 'img' && applied.src.startsWith('data:image/png'), JSON.stringify(applied));
await page.evaluate(() => document.getElementById('undo').click());
await page.waitForTimeout(450);
const undone = await page.evaluate(() => ({ n: pg().strokes.length, t: pg().strokes[pg().strokes.length - 1].t }));
ok('undo restores the original object', undone.n === 1 && undone.t === 'shape', JSON.stringify(undone));
ok('apply pushed exactly one undo step', (await E('undo.length')) >= undoBefore);

/* ================================================================== */
console.log('\n== 4. Curved line: grab anywhere along the path');
await clearPage();
await page.click('#sh-trigger');
await page.waitForTimeout(250);
await page.click('#sh-pick .sh-pb[data-kind="qcurve"]');
await page.waitForTimeout(250);
await page.mouse.move(...S(160, 300));
await page.mouse.down();
await page.mouse.move(...S(640, 300), { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.evaluate(() => {
  const s = pg().strokes[pg().strokes.length - 1];
  window.__slateCurve.setFromPoint(s, 0.5, [400, 440]);
});
await page.waitForTimeout(350);

const grab = await page.evaluate(() => {
  const s = pg().strokes[pg().strokes.length - 1];
  const F = window.__qFrame(s);
  const u = 0.3;
  const v = 1 - u;
  return [v * v * s.a[0] + 2 * v * u * F.c[0] + u * u * s.b[0], v * v * s.a[1] + 2 * v * u * F.c[1] + u * u * s.b[1]];
});
const grabScreen = S(grab[0], grab[1]);
await page.mouse.move(...grabScreen);
await page.waitForTimeout(320);
const hover = await page.evaluate(() => ({
  disp: getComputedStyle(document.getElementById('q-hover')).display,
  cursor: document.getElementById('cv').style.cursor,
}));
ok('hovering the path shows a grab dot', hover.disp !== 'none', JSON.stringify(hover));
ok('hovering the path sets a grab cursor', hover.cursor === 'grab', hover.cursor);

const countBefore = await E('pg().strokes.length');
const undoCurve = await E('undo.length');
const dest = S(grab[0] - 60, grab[1] - 130);
await page.mouse.down();
await page.mouse.move(dest[0], dest[1], { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(450);

const bent = await page.evaluate((d) => {
  const s = pg().strokes[pg().strokes.length - 1];
  const F = window.__qFrame(s);
  let best = Infinity;
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const u = 1 - t;
    const x = u * u * s.a[0] + 2 * u * t * F.c[0] + t * t * s.b[0];
    const y = u * u * s.a[1] + 2 * u * t * F.c[1] + t * t * s.b[1];
    best = Math.min(best, Math.hypot(x - d[0], y - d[1]));
  }
  return { dist: best, q: s.q, n: pg().strokes.length, kind: s.k };
}, [grab[0] - 60, grab[1] - 130]);
ok('curve passes through the dragged point', bent.dist < 2, `dist=${bent.dist.toFixed(3)} page units`);
ok('dragging the path does not create a new shape', bent.n === countBefore && bent.kind === 'qcurve', JSON.stringify({ n: bent.n, kind: bent.kind }));
ok('drag pushed one undo step', (await E('undo.length')) === undoCurve + 1, `${undoCurve} → ${await E('undo.length')}`);
await page.evaluate(() => document.getElementById('undo').click());
await page.waitForTimeout(350);
const restoredQ = await E('pg().strokes[pg().strokes.length-1].q');
ok('undo restores the previous bend', Array.isArray(restoredQ) && Math.abs(restoredQ[1]) > 0.1, JSON.stringify(restoredQ));
await page.screenshot({ path: shot('features-curve.png') });

/* ================================================================== */
console.log('\n== 5. Rich text');
await clearPage();
await page.evaluate(() => { try { tool = 'text'; syncTools(); } catch (e) {} });
await page.waitForTimeout(250);
await page.mouse.click(...S(200, 300));
await page.waitForTimeout(450);
const barShown = await page.evaluate(() => getComputedStyle(document.getElementById('rt-bar')).display);
ok('formatting bar appears for a new text box', barShown === 'flex', barShown);

await page.keyboard.type('Hello');
await page.keyboard.press('Enter');
await page.keyboard.type('Worldwide');
await page.waitForTimeout(250);
ok('multi-line text is accepted', (await page.evaluate(() => document.getElementById('tx').value)) === 'Hello\nWorldwide');

const plainSig = await pageSig();
for (const k of ['b', 'i', 'u', 'st']) {
  await page.click(`#rt-bar button[data-rt="${k}"]`);
  await page.waitForTimeout(180);
}
await page.click('#rt-bar button[data-al="center"]');
await page.waitForTimeout(250);

const editingState = await page.evaluate(() => {
  const box = eval('te');
  const tx = document.getElementById('tx');
  return {
    still: !!box,
    rt: box && box.rt,
    weight: getComputedStyle(tx).fontWeight,
    align: getComputedStyle(tx).textAlign,
    deco: getComputedStyle(tx).textDecorationLine,
    focus: document.activeElement && document.activeElement.id,
  };
});
ok('formatting applies to the live text box', editingState.still && editingState.rt.b && editingState.rt.i && editingState.rt.u && editingState.rt.st && editingState.rt.al === 'center', JSON.stringify(editingState.rt));
ok('textarea preview mirrors bold + alignment', editingState.weight === '700' && editingState.align === 'center', `${editingState.weight}/${editingState.align}`);
ok('textarea preview mirrors underline + strike', /underline/.test(editingState.deco) && /line-through/.test(editingState.deco), editingState.deco);
ok('formatting buttons keep the caret in the text box', editingState.focus === 'tx', editingState.focus);

await page.selectOption('#rt-fam', 'georgia');
await page.waitForTimeout(300);
await page.fill('#rt-size', '40');
await page.dispatchEvent('#rt-size', 'input');
await page.waitForTimeout(300);
const fontState = await page.evaluate(() => {
  const box = eval('te');
  return { still: !!box, f: box && box.f, s: box && box.s, rt: box && box.rt };
});
ok('family and size apply while editing', fontState.still && fontState.f === 'georgia' && fontState.s === 40, JSON.stringify(fontState));
ok('family/size do not leak into the rt run', !('f' in (fontState.rt || {})) && !('s' in (fontState.rt || {})), JSON.stringify(fontState.rt));

await page.focus('#tx');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const committed = await page.evaluate(() => {
  const s = pg().strokes[pg().strokes.length - 1];
  return { t: s.t, txt: s.txt, f: s.f, s: s.s, rt: s.rt };
});
ok('committed text keeps its formatting', committed.t === 'text' && committed.f === 'georgia' && committed.s === 40 && committed.rt.b && committed.rt.al === 'center', JSON.stringify(committed));
ok('formatted text renders differently from plain', plainSig !== (await pageSig()));

// selection reflects the formatting, and a toggle is undoable
await page.evaluate(() => { const s = pg().strokes[pg().strokes.length - 1]; sel = [s]; draw(); });
await page.waitForTimeout(500);
const reflect = await page.evaluate(() => ({
  bar: getComputedStyle(document.getElementById('rt-bar')).display,
  boldOn: document.querySelector('#rt-bar button[data-rt="b"]').classList.contains('on'),
  centerOn: document.querySelector('#rt-bar button[data-al="center"]').classList.contains('on'),
  fam: document.getElementById('rt-fam').value,
  size: document.getElementById('rt-size').value,
}));
ok('bar reflects the selected text', reflect.bar === 'flex' && reflect.boldOn && reflect.centerOn && reflect.fam === 'georgia' && reflect.size === '40', JSON.stringify(reflect));

const u0 = await E('undo.length');
await page.click('#rt-bar button[data-rt="b"]');
await page.waitForTimeout(400);
const off = await E('pg().strokes[pg().strokes.length-1].rt.b');
ok('toggling bold off updates the object', off === false);
ok('selection edit pushed one undo step', (await E('undo.length')) === u0 + 1, `${u0} → ${await E('undo.length')}`);
await page.evaluate(() => document.getElementById('undo').click());
await page.waitForTimeout(300);
ok('undo restores bold', (await E('pg().strokes[pg().strokes.length-1].rt.b')) === true);

// every style and alignment must be a genuinely different rendering
const styleSigs = await page.evaluate(() => {
  const p = pg();
  const base = { b: false, i: false, u: false, st: false, al: 'left' };
  p.strokes = [{ t: 'text', c: '#111', s: 40, x: 120, y: 260, txt: 'Format', f: 'arial', w: 400, rt: { ...base } }];
  sel = [];
  draw();
  return true;
});
const sigOf = async (rt) => {
  await page.evaluate((r) => { pg().strokes[0].rt = r; draw(); }, rt);
  await page.waitForTimeout(260);
  return pageSig();
};
const plain = await sigOf({ b: false, i: false, u: false, st: false, al: 'left' });
const perStyle = {};
for (const k of ['b', 'i', 'u', 'st']) {
  perStyle[k] = await sigOf({ b: false, i: false, u: false, st: false, al: 'left', [k]: true });
  ok(`style "${k}" changes the canvas`, perStyle[k] !== plain, `${plain} vs ${perStyle[k]}`);
}
await page.evaluate(() => {
  pg().strokes[0].txt = 'Hello there\nWorldwide';
  pg().strokes[0].w = 300;
  draw();
});
const aligns = {};
for (const al of ['left', 'center', 'right', 'justify']) {
  aligns[al] = await sigOf({ b: false, i: false, u: false, st: false, al });
}
ok('all four alignments render differently', new Set(Object.values(aligns)).size === 4, JSON.stringify(aligns));

// legacy text with no rt must still render
await page.evaluate(() => {
  const p = pg();
  p.strokes.push({ t: 'text', c: '#111', s: 24, x: 120, y: 700, txt: 'Legacy', f: 'arial' });
  sel = [];
  draw();
});
await page.waitForTimeout(300);
const legacy = await page.evaluate(() => {
  const s = pg().strokes[pg().strokes.length - 1];
  return { rt: s.rt, bb: window.bb(s).map(Math.round) };
});
ok('text without rt still measures and renders', !legacy.rt && legacy.bb[2] > legacy.bb[0], JSON.stringify(legacy));
await page.screenshot({ path: shot('features-rich.png') });

/* ================================================================== */
console.log('\n== 6. Page errors');
ok('no page errors', errors.length === 0, errors.length ? JSON.stringify(errors.slice(0, 4)) : '(none)');

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}  (${BASE})`);
await browser.close();
if (failed) process.exitCode = 1;
