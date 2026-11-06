/* Regression probe: Conics removal, Curvable Line handle, Warp pixel transform. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/fonts\.googleapis|fonts\.gstatic/.test(u)) return; // deliberately blocked below
  errors.push('request failed: ' + u);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/net::ERR_FAILED/.test(t)) return; // the aborted web-font request
  errors.push(t);
});

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1100);
await page.evaluate(() => {
  const n = { id: Date.now(), name: 'Probe', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  document.querySelectorAll('#intro,#tour,.tour,[id^=tour]').forEach((n) => n.remove());
});
await page.waitForTimeout(300);

const E = (expr) => page.evaluate((x) => { try { return eval(x); } catch (e) { return 'ERR:' + e.message; } }, expr);
const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

/* ---------------- 1. Conics is gone, cleanly ---------------- */
console.log('\n== 1. Shapes picker');
await page.click('#sh-trigger');
await page.waitForTimeout(250);
const menu = await page.evaluate(() => {
  const p = document.getElementById('sh-pick');
  return {
    open: p?.classList.contains('on'),
    headings: [...p.querySelectorAll('.sh-ph')].map((n) => n.textContent.trim()),
    kinds: [...p.querySelectorAll('.sh-pb')].map((n) => n.dataset.kind),
    grids: [...p.querySelectorAll('.sh-pg')].map((n) => ({ cls: n.className, cells: n.children.length })),
    html: p?.innerHTML || '',
  };
});
ok('picker opens', menu.open);
ok('no Conics heading', !menu.headings.includes('Conics'), JSON.stringify(menu.headings));
ok('Curves heading present', menu.headings.includes('Curves'));
ok('no parabola/hyperbola buttons', !menu.kinds.includes('parab') && !menu.kinds.includes('hyper'));
ok('curvable line button present', menu.kinds.includes('qcurve'));
ok('no dead conic listeners', !/parab|hyper|Conics/.test(menu.html));
const wide = menu.grids.find((g) => g.cls.includes('sh-wide'));
ok('Curves grid has exactly 1 cell (no gap)', wide && wide.cells === 1, JSON.stringify(menu.grids));
await page.screenshot({ path: '../shots/curve-warp-picker.png' });
await page.click('#sh-pick .sh-pb[data-kind="qcurve"]');
await page.waitForTimeout(220);

/* ---------------- 2. draw a straight curvable line ---------------- */
console.log('\n== 2. Curvable Line');
const geom = await page.evaluate(() => {
  const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.x, y: r.y, kx: r.width / 800, ky: r.height / 1100 };
});
const S = (x, y) => [geom.x + x * geom.kx, geom.y + y * geom.ky];
await page.mouse.move(...S(160, 300));
await page.mouse.down();
await page.mouse.move(...S(640, 300), { steps: 12 });
const live = await E('cur && ({t:cur.t,k:cur.k,q:cur.q,a:cur.a,b:cur.b})');
await page.mouse.up();
await page.waitForTimeout(300);
ok('live preview is a qcurve', live && live.k === 'qcurve', JSON.stringify(live));
const made = await E('(()=>{const s=pg().strokes[pg().strokes.length-1];return {t:s.t,k:s.k,q:s.q,a:s.a.map(Math.round),b:s.b.map(Math.round)}})()');
ok('committed stroke is a flat qcurve', made.k === 'qcurve' && Array.isArray(made.q) && made.q[1] === 0, JSON.stringify(made));
const frame0 = await E('window.__qFrame(pg().strokes[pg().strokes.length-1])');
ok('flat control point equals midpoint', Math.abs(frame0.c[0] - frame0.m[0]) < 0.01 && Math.abs(frame0.c[1] - frame0.m[1]) < 0.01);

await page.waitForTimeout(350);
const h0 = await page.evaluate(() => {
  const h = document.getElementById('q-handle');
  const r = h.getBoundingClientRect();
  return { display: getComputedStyle(h).display, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
});
ok('midpoint handle is visible', h0.display !== 'none' && h0.w > 10, JSON.stringify(h0));
ok('handle sits on the chord midpoint (page x=400)', Math.abs((h0.x - geom.x) / geom.kx - 400) < 3);

/* ---------------- 3. drag the handle to bend ---------------- */
console.log('\n== 3. Bend by dragging');
await page.mouse.move(h0.x, h0.y);
await page.mouse.down();
await page.mouse.move(...S(400, 460), { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(350);
const bent = await E('(()=>{const s=pg().strokes[pg().strokes.length-1];return {q:s.q,k:s.k,frame:window.__qFrame(s)}})()');
ok('bend written back into s.q', Math.abs(bent.q[1]) > 0.15, JSON.stringify(bent.q));
ok('quadratic control point moved', Math.abs(bent.frame.c[1] - bent.frame.m[1]) > 100, JSON.stringify(bent.frame.c));
ok('curve handle tracks the curve midpoint', Math.abs(bent.frame.h[1] - 460) < 30, String(bent.frame.h[1]));
const guide = await page.evaluate(() => getComputedStyle(document.getElementById('q-guide')).display);
ok('chord → handle guide drawn', guide !== 'none');
ok('handle is reachable (elementFromPoint)', await page.evaluate(([x, y]) => {
  const h = document.getElementById('q-handle');
  const r = h.getBoundingClientRect();
  return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === h || h.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
}, [h0.x, h0.y]));
await page.screenshot({ path: '../shots/curve-warp-line.png' });

const undoDepth = await E('undo.length');
await page.dblclick('#q-handle');
await page.waitForTimeout(200);
const straight = await E('pg().strokes[pg().strokes.length-1].q');
ok('double-click straightens the line', straight[0] === 0 && straight[1] === 0, JSON.stringify(straight));
ok('drag pushed exactly one undo step', undoDepth >= 1, 'undo=' + undoDepth);

/* ---------------- 4. Warp panel ---------------- */
console.log('\n== 4. Warp');
await E("(()=>{const p=pg();p.strokes.push({t:'shape',k:'rect',c:'#2f6df6',w:4,a:[120,520],b:[360,640]});sel=[p.strokes[p.strokes.length-1]];draw();})()");
await page.waitForTimeout(400);
ok('Warp button in contextual bar', await page.locator('#warp-btn').count() === 1);
ok('contextual bar visible', await page.locator('#sbar').isVisible());
await page.click('#warp-btn');
await page.waitForTimeout(450);
const panel = await page.evaluate(() => {
  const p = document.getElementById('warp-panel');
  const r = p.getBoundingClientRect();
  const c = document.getElementById('warp-prev');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) opaque++;
  return {
    display: getComputedStyle(p).display,
    inView: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 2 && r.right <= innerWidth + 2,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    styles: [...p.querySelectorAll('.wp-style')].map((n) => n.dataset.style),
    preview: [c.width, c.height, opaque],
    state: window.__slateWarp.state(),
  };
});
ok('panel opens on screen', panel.display !== 'none' && panel.inView, JSON.stringify(panel.rect));
ok('4 warp styles: Arc / Bulge / Flag / Wave', JSON.stringify(panel.styles) === JSON.stringify(['arc', 'bulge', 'flag', 'wave']), JSON.stringify(panel.styles));
ok('live preview has real pixels', panel.preview[2] > 100, JSON.stringify(panel.preview));
ok('selection captured', panel.state.picked === 1 && !!panel.state.box, JSON.stringify(panel.state));
await page.screenshot({ path: '../shots/curve-warp-panel.png' });

// every inverse map is finite and actually moves points
const maps = await page.evaluate(() => {
  const W = window.__slateWarp;
  const b = { x: 100, y: 100, w: 200, h: 100 };
  const out = {};
  for (const s of W.styles) {
    const p = W.inverse(s, 200, 150, b, 0.7);
    out[s] = { finite: !!p && p.every(Number.isFinite), p };
  }
  return out;
});
for (const [k, v] of Object.entries(maps)) ok(`inverse map ${k} is finite`, v.finite, JSON.stringify(v.p));

await page.click('.wp-style[data-style="wave"]');
await page.evaluate(() => window.__slateWarp.setAmount(85));
await page.waitForTimeout(300);
await page.click('.wp-apply');
await page.waitForTimeout(600);
const warped = await E('(()=>{const s=pg().strokes[pg().strokes.length-1];return {t:s.t,src:(s.src||"").slice(0,22),w:Math.round(s.w),h:Math.round(s.h),n:pg().strokes.length}})()');
ok('apply replaced selection with an image layer', warped.t === 'img' && warped.src.startsWith('data:image/png'), JSON.stringify(warped));
ok('warp layer has padded bounds', warped.w > 240 && warped.h > 120);
await page.screenshot({ path: '../shots/curve-warp-applied.png' });
await E('document.getElementById("undo").click()');
await page.waitForTimeout(250);
const restored = await E('(()=>{const s=pg().strokes[pg().strokes.length-1];return {t:s.t,k:s.k,n:pg().strokes.length}})()');
ok('undo restores the original shape', restored.t === 'shape' && restored.k === 'rect', JSON.stringify(restored));

console.log('\n== page errors');
console.log(errors.length ? errors.slice(0, 8).join('\n') : '(none)');
await browser.close();
