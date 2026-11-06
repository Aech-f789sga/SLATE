/* Regression probe: Conics removal, Curvable Line handle, Warp pixel transform.
 *
 *   node scripts/probe-curve-warp.mjs [baseURL] [tag]
 *
 * Defaults to the local dev server. Pass the deployed URL (+ a tag such as
 * "live") to exercise the exact same interactions against production; the tag
 * suffixes screenshots so a live run never overwrites the local baselines.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.argv[2] || process.env.SLATE_URL || 'http://127.0.0.1:3000/';
const TAG = process.argv[3] || '';
const shotsDir = fileURLToPath(new URL('../shots/', import.meta.url));
const shot = (name) => path.join(shotsDir, name.replace(/\.png$/, (TAG ? `-${TAG}` : '') + '.png'));
console.log(`target: ${BASE}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => {
  const u = r.url();
  // Deliberately blocked web fonts, plus Vercel's optional analytics beacon.
  if (/fonts\.googleapis|fonts\.gstatic|_vercel\/insights/.test(u)) return;
  errors.push('request failed: ' + u);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/net::ERR_FAILED/.test(t)) return; // the aborted web-font request
  errors.push(t);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
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
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

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
await page.screenshot({ path: shot('curve-warp-picker.png') });
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
await page.screenshot({ path: shot('curve-warp-line.png') });

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
ok('5 warp styles: Arc / Bulge / Flag / Wave / Manual', JSON.stringify(panel.styles) === JSON.stringify(['arc', 'bulge', 'flag', 'wave', 'manual']), JSON.stringify(panel.styles));
ok('live preview has real pixels', panel.preview[2] > 100, JSON.stringify(panel.preview));
ok('selection captured', panel.state.picked === 1 && !!panel.state.box, JSON.stringify(panel.state));
await page.screenshot({ path: shot('curve-warp-panel.png') });

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

/* Every style must produce a genuinely different pixel field, not four
 * differently-labelled versions of the same displacement. */
const sigs = await page.evaluate(() => {
  const W = window.__slateWarp;
  const items = window.eval('sel');
  const b = W.state().box;
  const out = {};
  for (const st of W.styles) {
    // rasterise() returns { raster, used, skipped, tainted } since the taint-safe
    // rewrite; the analytic styles still go through warpBuffer().
    const res = W.rasterise(items, b, 32, 0.6);
    const src = res && res.raster;
    const cnv = src ? W.warpBuffer(src, b, st, 0.8) : null;
    if (!cnv) {
      out[st] = null;
      continue;
    }
    const d = cnv.getContext('2d').getImageData(0, 0, cnv.width, cnv.height).data;
    let opaque = 0;
    let hash = 2166136261;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      if (a > 20) opaque++;
      hash = Math.imul(hash ^ a, 16777619) >>> 0;
    }
    out[st] = { opaque, hash };
  }
  return out;
});
for (const [k, v] of Object.entries(sigs)) ok(`style ${k} renders real pixels`, !!v && v.opaque > 100, JSON.stringify(v));
const distinct = new Set(Object.values(sigs).map((v) => v && v.hash)).size;
ok('all 5 styles produce distinct pixel fields', distinct === 5, `${distinct} distinct of 5`);

await page.click('.wp-style[data-style="wave"]');
await page.evaluate(() => window.__slateWarp.setAmount(85));
await page.waitForTimeout(300);
await page.click('.wp-apply');
await page.waitForTimeout(600);
const warped = await E('(()=>{const s=pg().strokes[pg().strokes.length-1];return {t:s.t,src:(s.src||"").slice(0,22),w:Math.round(s.w),h:Math.round(s.h),n:pg().strokes.length}})()');
ok('apply replaced selection with an image layer', warped.t === 'img' && warped.src.startsWith('data:image/png'), JSON.stringify(warped));
ok('warp layer has padded bounds', warped.w > 240 && warped.h > 120);
await page.screenshot({ path: shot('curve-warp-applied.png') });
await E('document.getElementById("undo").click()');
await page.waitForTimeout(250);
const restored = await E('(()=>{const s=pg().strokes[pg().strokes.length-1];return {t:s.t,k:s.k,n:pg().strokes.length}})()');
ok('undo restores the original shape', restored.t === 'shape' && restored.k === 'rect', JSON.stringify(restored));

/* ---------------- 5. Warp on TEXT (task #27 acceptance) ---------------- */
/* Text is not a path: the engine draws it with fillText via stroke(), and bb()
 * measures it with wrap()/measureText. Both must survive rasterisation. */
console.log('\n== 5. Warp on text');
await E(`(()=>{
  const p=pg();p.strokes.length=0;
  const t={t:'text',c:'#123456',s:46,x:140,y:300,txt:'WARP ME',f:'arial'};
  p.strokes.push(t);sel=[t];draw();return p.strokes.length;
})()`);
await page.waitForTimeout(300);
await page.click('#warp-btn');
await page.waitForTimeout(450);
const textPanel = await page.evaluate(() => {
  const p = document.getElementById('warp-panel');
  const c = document.getElementById('warp-prev');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) opaque++;
  return {
    display: getComputedStyle(p).display,
    preview: [c.width, c.height, opaque],
    state: window.__slateWarp.state(),
  };
});
ok('text selection captured', textPanel.state.picked === 1 && !!textPanel.state.box, JSON.stringify(textPanel.state));
ok('text bounding box has real width', !!textPanel.state.box && textPanel.state.box.w > 80, JSON.stringify(textPanel.state.box));
ok('text rasterises into the live preview', textPanel.preview[2] > 100, JSON.stringify(textPanel.preview));
await page.screenshot({ path: shot('curve-warp-text.png') });

await page.click('.wp-style[data-style="flag"]');
await page.evaluate(() => window.__slateWarp.setAmount(70));
await page.waitForTimeout(300);
await page.click('.wp-apply');
await page.waitForTimeout(600);
const textWarped = await E(`(()=>{const a=pg().strokes,s=a[a.length-1];return {n:a.length,t:s.t,src:(s.src||'').slice(0,22),w:Math.round(s.w||0)}})()`);
ok('text warps into a transparent PNG layer', textWarped.t === 'img' && textWarped.src.startsWith('data:image/png'), JSON.stringify(textWarped));
await page.screenshot({ path: shot('curve-warp-text-applied.png') });
await E('document.getElementById("undo").click()');
await page.waitForTimeout(250);
const textRestored = await E(`(()=>{const a=pg().strokes,s=a[a.length-1];return {t:s.t,txt:s.txt,n:a.length}})()`);
ok('undo restores editable text', textRestored.t === 'text' && textRestored.txt === 'WARP ME', JSON.stringify(textRestored));

/* ---------------- 6. Multi-object warp ---------------- */
console.log('\n== 6. Multi-object warp');
await E(`(()=>{
  const p=pg();p.strokes.length=0;
  const t={t:'text',c:'#123456',s:40,x:130,y:280,txt:'TWO OBJECTS',f:'arial'};
  const r={t:'shape',k:'rect',c:'#2f6df6',w:4,a:[130,420],b:[430,540]};
  p.strokes.push(t,r);sel=[t,r];draw();return p.strokes.length;
})()`);
await page.waitForTimeout(300);
await page.click('#warp-btn');
await page.waitForTimeout(450);
const multi = await page.evaluate(() => {
  const c = document.getElementById('warp-prev');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) opaque++;
  return { opaque, state: window.__slateWarp.state() };
});
ok('both objects captured', multi.state.picked === 2 && !!multi.state.box, JSON.stringify(multi.state));
ok('combined bbox spans both objects', !!multi.state.box && multi.state.box.h > 200, JSON.stringify(multi.state.box));
ok('combined preview has real pixels', multi.opaque > 100, String(multi.opaque));
await page.click('.wp-style[data-style="bulge"]');
await page.waitForTimeout(250);
await page.click('.wp-apply');
await page.waitForTimeout(600);
const merged = await E(`(()=>{const a=pg().strokes,s=a[a.length-1];return {n:a.length,t:s.t}})()`);
ok('two objects collapse into one layer', merged.n === 1 && merged.t === 'img', JSON.stringify(merged));
await E('document.getElementById("undo").click()');
await page.waitForTimeout(250);
const unmerged = await E('pg().strokes.map(s=>s.t)');
ok('undo restores both original objects', JSON.stringify(unmerged) === JSON.stringify(['text', 'shape']), JSON.stringify(unmerged));

console.log('\n== page errors');
console.log(errors.length ? errors.slice(0, 8).join('\n') : '(none)');
ok('no page errors', errors.length === 0, `${errors.length} error(s)`);
console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : 'ALL CHECKS PASSED'}  (${BASE})`);
if (failed) process.exitCode = 1;
await browser.close();
