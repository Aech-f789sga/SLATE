/**
 * Record the tour demos as real screen captures.
 *
 * One browser, one page, one continuous video. Each clip is a timestamped
 * window inside that video; `scripts/cut-demos.mjs` slices the windows out and
 * scales them to the 2.5:1 box the tour card reserves.
 *
 * Clips run in two stages: the library first, then the editor (the notebook is
 * opened between them). `pre` actions happen before the clock starts, so any
 * scaffolding a clip needs (a stroke to erase, a shape to fill) never shows up.
 *
 *   node scripts/record-demos.mjs [batch]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'shots/demos';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:4173/';

/* crops are [x, y, w, h] in the 1280x800 capture, always 2.5:1 */
const C = {
  canvas: [452, 280, 400, 160],
  toolbar: [340, 20, 700, 280],
  pill: [340, 60, 700, 280],
  dock: [0, 240, 500, 200],
  shapePop: [440, 180, 560, 224],
  accPop: [660, 170, 600, 240],
  paperCard: [330, 90, 700, 280],
  paperPanel: [560, 290, 700, 280],
  guides: [560, 330, 700, 280],
  layers: [580, 360, 700, 280],
  eng: [720, 330, 560, 224],
  sheet: [530, 290, 700, 280],
  pageCtl: [380, 560, 600, 240],
  thumbs: [0, 100, 600, 240],
  themePanel: [170, 50, 1000, 400],
  home: [200, 90, 1000, 400],
  homeNav: [0, 0, 500, 200],
  musicFab: [560, 500, 720, 288],
  search: [330, 18, 950, 380],
  penPanel: [300, 120, 800, 320],
  sticker: [0, 40, 800, 320],
};

/* ------------------------------------------------------------------ */
/* clip vocabulary                                                     */
/* ------------------------------------------------------------------ */

const CLIPS = [];
const clip = (stage, key, crop, actions, pre = []) => CLIPS.push({ stage, key, crop, actions, pre });

/** a freehand stroke in page coordinates */
const ink = (pts, gap = 12) => ({ ink: pts, gap });
/** a horizontal wave, y around `y` */
const wave = (y, from = 70, to = 720, n = 19, amp = 34) =>
  Array.from({ length: n }, (_, i) => {
    const x = from + ((to - from) * i) / (n - 1);
    return [x, y + Math.sin(i * 1.9) * amp];
  });

/* ------------------------------------------------------------------ */
/* stage 1 — the library                                               */
/* ------------------------------------------------------------------ */

clip('home', 'find', C.search, [
  ['click', '#gn-search'],
  ['wait', 260],
  ['type', 'phy', 110],
  ['wait', 1100],
]);

clip('home', 'theme', C.themePanel, [
  ['wait', 200],
  ['click', '#gx-theme-btn'],
  ['wait', 900],
  ['move', [700, 300]],
  ['wait', 500],
  ['click', '#gx-theme-panel .gxp-card[data-id="black-hole"]'],
  ['wait', 1800],
  ['click', '#gx-theme-panel .gxp-card[data-id="slate"]'],
  ['wait', 900],
  ['click', '#gx-theme-panel .gxp-x'],
  ['wait', 400],
  ['click', '#gx-theme-btn'],
  ['wait', 700],
  ['click', '#gx-theme-panel .gxp-card[data-id="slate"]'],
  ['wait', 900],
  ['click', '#gx-theme-panel .gxp-x'],
  ['wait', 400],
]);

clip('home', 'music', C.musicFab, [
  ['wait', 300],
  ['click', '.gxm-fab'],
  ['wait', 900],
  ['click', '.gxm-sw'],
  ['wait', 1600],
  ['click', '.gxm-sw'],
  ['wait', 500],
  ['click', '.gxm-x'],
  ['wait', 300],
], [
  ['click', '#gx-theme-btn'],
  ['wait', 700],
  ['click', '#gx-theme-panel .gxp-card[data-id="black-hole"]'],
  ['wait', 1600],
  ['click', '#gx-theme-panel .gxp-x'],
  ['wait', 400],
]);

clip('home', 'sidebar', C.homeNav, [
  ['wait', 200],
  ['click', '#nav-toggle-btn'],
  ['wait', 1200],
  ['click', '#nav-hide'],
  ['wait', 700],
  ['click', '#nav-toggle-btn'],
  ['wait', 1400],
]);

clip('home', 'penmap', C.penPanel, [
  ['wait', 200],
  ['click', '#pen-btn'],
  ['wait', 1300],
  ['key', 'Escape'],
  ['wait', 400],
]);

clip('home', 'cloud', C.penPanel, [
  ['wait', 200],
  ['click', '#cloud-btn'],
  ['wait', 1300],
  ['key', 'Escape'],
  ['wait', 400],
]);

clip('home', 'signin', C.penPanel, [
  ['wait', 200],
  ['click', '#auth-login-btn'],
  ['wait', 1300],
  ['key', 'Escape'],
  ['wait', 400],
]);

clip('home', 'install', C.penPanel, [
  ['wait', 200],
  ['click', '#install-btn'],
  ['wait', 1300],
  ['key', 'Escape'],
  ['wait', 400],
]);

clip('home', 'create', C.home, [
  ['wait', 200],
  ['click', '#gn-new'],
  ['wait', 1100],
  ['click', '#nn'],
  ['wait', 300],
  ['type', 'Physics', 90],
  ['wait', 600],
  ['click', '#ok'],
  ['wait', 2200],
]);

/* ------------------------------------------------------------------ */
/* stage 2 — the editor                                                */
/* ------------------------------------------------------------------ */

/* the tool row: sweep the pointer across it so each tool answers in turn */
clip('ed', 'toolrow', C.toolbar, [
  ['wait', 200],
  ['move', [522, 59]],
  ['wait', 220],
  ['move', [560, 59]],
  ['wait', 220],
  ['move', [598, 59]],
  ['wait', 220],
  ['move', [651, 59]],
  ['wait', 220],
  ['move', [687, 59]],
  ['wait', 220],
  ['move', [740, 59]],
  ['wait', 220],
  ['move', [778, 59]],
  ['wait', 260],
]);

clip('ed', 'inkpill', C.pill, [
  ['wait', 200],
  ['wait', 600],
  ['click', '#ink-pen [title^="Fountain"]'],
  ['wait', 600],
  ['click', '#ink-pen [title="#f24d5c"]'],
  ['wait', 700],
]);

clip('ed', 'nibs', C.pill, [
  ['wait', 200],
  ['wait', 500],
  ['click', '#ink-pen [title^="Fountain"]'],
  ['wait', 520],
  ['click', '#ink-pen [title^="Brush —"]'],
  ['wait', 520],
  ['click', '#ink-pen [title^="Pencil"]'],
  ['wait', 520],
  ['click', '#ink-pen [title^="Crayon"]'],
  ['wait', 520],
  ['click', '#ink-pen [title^="Ball Pen"]'],
  ['wait', 600],
]);

clip('ed', 'width', C.pill, [
  ['wait', 200],
  ['wait', 500],
  ['click', '#ink-pen [title^="Thin"]'],
  ['wait', 520],
  ['click', '#ink-pen [title^="Medium"]'],
  ['wait', 520],
  ['click', '#ink-pen [title^="Thick"]'],
  ['wait', 600],
]);

clip('ed', 'colour', C.canvas, [
  ['wait', 200],
  ['wait', 420],
  ['click', '#ink-pen [title="#f24d5c"]'],
  ['wait', 400],
  ink(wave(380, 90, 700, 15, 30), 14),
  ['wait', 700],
]);

clip('ed', 'pen', C.canvas, [
  ['wait', 220],
  ink(wave(390, 70, 700, 19, 34), 12),
  ['wait', 850],
]);

clip('ed', 'hl', C.canvas, [
  ['wait', 200],
  ['click', '[title="Highlighter"]'],
  ['wait', 140],
  ['eval', 'setCol("#a8c94a")'],
  ['wait', 220],
  ink([[80, 400], [700, 400]], 18),
  ['wait', 1300],
]);

clip('ed', 'er', C.canvas, [
  ['wait', 200],
  ['click', '[title="Erasers"]'],
  ['wait', 520],
  ink([[150, 390], [640, 390]], 18),
  ['wait', 800],
], [
  ['wait', 300],
  ink(wave(390, 80, 700, 19, 30), 12),
  ['wait', 300],
  ['key', 'Escape'],
]);

clip('ed', 'whole', C.canvas, [
  ['wait', 220],
  ['click', '#pen-dock [title^="Stroke eraser"]'],
  ['wait', 700],
  ['click', [400, 380]],
  ['wait', 900],
], [ink([[100, 380], [700, 380]], 20), ['wait', 400]]);

clip('ed', 'lasso', C.canvas, [
  ['wait', 200],
  ['click', '[title="Lasso"]'],
  ['wait', 500],
  ['drag', [[70, 300], [70, 470], [200, 520], [420, 520], [640, 470], [700, 300], [420, 262], [180, 262], [70, 300]]],
  ['wait', 800],
], [
  ink(wave(390, 80, 690, 15, 40), 12),
  ['wait', 400],
]);

clip('ed', 'selresize', C.canvas, [
  ['wait', 200],
  ['click', '[title="Lasso"]'],
  ['wait', 400],
  ['drag', [[70, 300], [70, 470], [200, 520], [420, 520], [640, 470], [700, 300], [420, 262], [180, 262], [70, 300]]],
  ['wait', 700],
  ['drag', [[700, 300], [740, 250]]],
  ['wait', 900],
], [
  ink(wave(390, 80, 690, 15, 40), 12),
  ['wait', 400],
]);

clip('ed', 'shapes', C.shapePop, [
  ['wait', 200],
  ['click', '#sh-trigger'],
  ['wait', 800],
  ['click', '#sh-pick .sh-pb[title="Rectangle"]'],
  ['wait', 600],
  ['drag', [[520, 330], [700, 330], [700, 430], [520, 430], [520, 330]]],
  ['wait', 900],
]);

clip('ed', 'fill', C.canvas, [
  ['wait', 200],
  ['click', '[title^="Paint bucket"]'],
  ['wait', 500],
  ['click', [600, 390]],
  ['wait', 900],
], [
  ['click', '#sh-trigger'],
  ['wait', 400],
  ['click', '#sh-pick .sh-pb[title="Circle"]'],
  ['wait', 400],
  ['drag', [[500, 320], [700, 320], [700, 460], [500, 460], [500, 320]]],
  ['wait', 600],
  ['key', 'Escape'],
]);

clip('ed', 'text', C.canvas, [
  ['wait', 200],
  ['click', '[title="Text"]'],
  ['wait', 500],
  ['click', [520, 380]],
  ['wait', 500],
  ['type', 'Slate', 110],
  ['wait', 900],
]);

clip('ed', 'stickers', C.sticker, [
  ['wait', 200],
  ['click', '#acc-trigger'],
  ['wait', 500],
  ['acc', 'Stickers'],
  ['wait', 900],
  ['click', '.gn-stk-grid > *:nth-child(3)'],
  ['wait', 1000],
  ['key', 'Escape'],
  ['wait', 300],
]);

clip('ed', 'snap', C.canvas, [
  ['wait', 200],
  ['wait', 400],
  ['key', 'Escape'],
  ink([[200, 380], [420, 380], [640, 380]], 60),
  ['wait', 900],
], [
  ['click', '#sh-trigger'],
  ['wait', 400],
  ['click', '#sh-pick .sh-pb[title="Rectangle"]'],
  ['wait', 400],
  ['drag', [[260, 320], [560, 320], [560, 440], [260, 440], [260, 320]]],
  ['wait', 600],
  ['key', 'Escape'],
]);

clip('ed', 'zoomwin', C.canvas, [
  ['wait', 200],
  ['click', '#acc-trigger'],
  ['wait', 500],
  ['acc', 'Zoom Window'],
  ['wait', 800],
  ['move', [700, 360]],
  ['wait', 300],
  ['move', [560, 420]],
  ['wait', 300],
  ['move', [640, 470]],
  ['wait', 700],
], [
  ink(wave(390, 80, 690, 15, 34), 12),
  ['wait', 400],
]);

clip('ed', 'laser', C.canvas, [
  ['wait', 200],
  ['click', '[title="Laser pointer"]'],
  ['wait', 500],
  ink(wave(390, 90, 690, 15, 40), 26),
  ['wait', 600],
]);

clip('ed', 'pagecard', C.paperCard, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 900],
  ['move', [520, 300]],
  ['wait', 500],
  ['click', '.pgm-x'],
  ['wait', 400],
]);

clip('ed', 'template', C.paperPanel, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '[title^="Paper:"]'],
  ['wait', 800],
  ['btn', 'Engineering graph'],
  ['wait', 1200],
  ['key', 'Escape'],
  ['wait', 300],
]);

clip('ed', 'papercolour', C.paperCard, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 700],
  ['select', '#pc', 'Cream'],
  ['wait', 1200],
  ['click', '.pgm-x'],
  ['wait', 1000],
], [
  ['click', '#pgm'],
  ['wait', 500],
  ['select', '#pc', 'White paper'],
  ['wait', 400],
  ['click', '.pgm-x'],
  ['wait', 300],
]);

clip('ed', 'zoom', C.paperCard, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 700],
  ['click', '#zi'],
  ['wait', 500],
  ['click', '#zi'],
  ['wait', 500],
  ['click', '#zi'],
  ['wait', 500],
  ['click', '#zi'],
  ['wait', 800],
  ['click', '#zo'],
  ['wait', 500],
  ['click', '.pgm-x'],
  ['wait', 300],
]);

clip('ed', 'thumbs', C.thumbs, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '#side-t'],
  ['wait', 1200],
  ['key', 'Escape'],
  ['wait', 300],
]);

clip('ed', 'fullscreen', C.pageCtl, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '#fs'],
  ['wait', 2000],
]);

clip('ed', 'export', C.sheet, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '#share'],
  ['wait', 900],
  ['move', [700, 420]],
  ['wait', 700],
  ['key', 'Escape'],
  ['wait', 300],
]);

clip('ed', 'clear', C.paperCard, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 700],
  ['click', '#clr'],
  ['wait', 900],
  ['click', '.gn-cf-yes'],
  ['wait', 1200],
], [ink(wave(390, 80, 690, 15, 34), 12), ['wait', 400]]);

clip('ed', 'guides', C.guides, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '[title^="Guides"]'],
  ['wait', 800],
  ['btn', 'Straight ruler'],
  ['wait', 900],
  ['btn', 'Square grid'],
  ['wait', 900],
  ['key', 'Escape'],
  ['wait', 300],
]);

clip('ed', 'layers', C.layers, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '[title^="Layers"]'],
  ['wait', 800],
  ['btn', '+ Add layer'],
  ['wait', 1000],
  ['key', 'Escape'],
  ['wait', 300],
]);

clip('ed', 'animate', C.canvas, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '[title^="Animate next"]'],
  ['wait', 600],
  ['click', '.pgm-x'],
  ['wait', 500],
  ink([[120, 400], [240, 330], [360, 400], [480, 330], [600, 400]], 26),
  ['wait', 900],
], [
  ['wait', 300],
  ink([[120, 430], [600, 430]], 20),
  ['wait', 300],
  ['key', 'Escape'],
]);

clip('ed', 'engineering', C.eng, [
  ['wait', 200],
  ['click', '#pgm'],
  ['wait', 600],
  ['click', '[title^="Engineering"]'],
  ['wait', 800],
  ['btn', 'Δ'],
  ['wait', 900],
  ['btn', 'Σ'],
  ['wait', 900],
  ['key', 'Escape'],
  ['wait', 300],
]);

clip('ed', 'undo', [440, 20, 840, 336], [
  ['wait', 200],
  ink(wave(300, 80, 690, 15, 30), 14),
  ['wait', 400],
  ['click', '#undo'],
  ['wait', 800],
  ['click', '#undo'],
  ['wait', 700],
  ['click', '#redo'],
  ['wait', 900],
]);

clip('ed', 'pages', C.pageCtl, [
  ['wait', 200],
  ['click', '#add'],
  ['wait', 1100],
  ['click', '#prev'],
  ['wait', 900],
  ['click', '#next'],
  ['wait', 900],
]);

/* ------------------------------------------------------------------ */

const batch = process.argv[2] || 'all';
const list = CLIPS.filter((c) => batch === 'all' || c.key === batch || c.stage === batch);
if (!list.length) throw new Error('no clips for ' + batch);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT + '/raw', size: { width: 1280, height: 800 } },
});
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-home-v3', '1');
  localStorage.setItem('inkpad-tour-editor-v3', '1');
  localStorage.setItem('inkpad-tour-home-v4', '1');
  localStorage.setItem('inkpad-tour-editor-v4', '1');
  localStorage.setItem('inkpad-install-dismissed', '1');
});

const videoT0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1400);

let stage = 'home';
let box = null;

async function measure() {
  box = await page.evaluate(() => {
    const r = document.getElementById('cv').getBoundingClientRect();
    const p = eval('pg()');
    return { x: r.x, y: r.y, k: r.width / (p.pw || 800) };
  });
}
const S = (x, y) => [box.x + x * box.k, box.y + y * box.k];

async function runActions(actions) {
  for (const a of actions) {
    if (Array.isArray(a)) {
      const [kind, arg, arg2] = a;
      if (kind === 'wait') await page.waitForTimeout(arg);
      else if (kind === 'click') {
        const sel = Array.isArray(arg) ? null : arg;
        if (sel) await page.click(sel, { timeout: 4000 }).catch((e) => console.log('    ! click', sel, e.message.split('\n')[0]));
        else await page.mouse.click(...S(arg[0], arg[1]));
        // picking a tool pops a settings sheet over the page; it lands a frame
        // later, so settle first and only then take it away
        await page.waitForTimeout(240);
        const closed = await page.evaluate(() => {
          const open = document.querySelectorAll('.ink-sheet.on, #ink-pop.on');
          open.forEach((n) => n.classList.remove('on'));
          return open.length;
        });
        if (closed) await page.waitForTimeout(240);
      } else if (kind === 'move') await page.mouse.move(arg[0], arg[1], { steps: 6 });
      else if (kind === 'key') await page.keyboard.press(arg);
      else if (kind === 'type') await page.keyboard.type(arg, { delay: arg2 || 60 });
      else if (kind === 'select') await page.selectOption(arg, { label: arg2 }).catch(() => console.log('    ! select', arg, arg2));
      else if (kind === 'acc') {
        await page.evaluate((label) => {
          const row = Array.from(document.querySelectorAll('.acc-item')).find((n) => (n.textContent || '').includes(label));
          row?.click();
        }, arg);
      } else if (kind === 'eval') {
        await page.evaluate((code) => eval(code), arg);
      } else if (kind === 'btn') {
        await page.evaluate((label) => {
          const vis = (n) => { const r = n.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
          const cands = Array.from(document.querySelectorAll('button,.sh-pick,.pgm-chip,[role=button]'))
            .filter((n) => vis(n) && !n.closest('#tour-root') && (n.textContent || '').trim().includes(label));
          const exact = cands.find((n) => (n.textContent || '').trim() === label);
          (exact || cands[0])?.click();
        }, arg);
      } else if (kind === 'drag') {
        const [p0, ...rest] = arg;
        await page.mouse.move(...S(p0[0], p0[1]));
        await page.mouse.down();
        for (const p of rest) await page.mouse.move(...S(p[0], p[1]), { steps: 5 });
        await page.waitForTimeout(150);
        await page.mouse.up();
      }
    } else if (a.ink) {
      const [f, ...rest] = a.ink;
      await page.mouse.move(...S(f[0], f[1]));
      await page.mouse.down();
      for (const p of rest) {
        await page.mouse.move(...S(p[0], p[1]), { steps: 2 });
        await page.waitForTimeout(a.gap || 12);
      }
      await page.waitForTimeout(90);
      await page.mouse.up();
    }
  }
}

async function reset() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    try {
      // the chrome toggle (#fs) hides the whole toolbar; put it back
      const tb = document.getElementById('tb');
      if (tb && getComputedStyle(tb).display === 'none') document.getElementById('fx')?.click();
      // the sidebar toggle hides the library nav; put it back
      if (document.documentElement.dataset.nav === 'off') document.documentElement.dataset.nav = 'on';
      document.querySelectorAll('.acc-pop.open, .sh-pop.open, .gn-drw.on, .gn-stk-box.on').forEach((n) => n.classList.remove('open', 'on'));
      document.getElementById('pgm')?.classList.remove('on');
      // every full-screen sheet in the app is a #…-md element toggled by .on
      document.querySelectorAll('[id$="-md"], #md, #gx-theme-panel').forEach((n) => n.classList.remove('on'));
      document.getElementById('ink-pop')?.classList.remove('on');
      document.querySelectorAll('.ink-sheet').forEach((n) => n.classList.remove('on'));
      document.getElementById('gn-confirm')?.classList.remove('on');
      // nb/pg/tool live in the page's script scope, not on window, so go through eval
      try {
        if (document.getElementById('ed')?.style.display !== 'none') {
          eval('pg().strokes.length = 0; tool="pen"; setCol("#111111"); setBrush(4); draw();');
        }
      } catch { /* library stage */ }
    } catch { /* ignore */ }
  });
  await page.waitForTimeout(280);
}

const timeline = [];
for (const c of list) {
  if (c.stage === 'ed' && stage !== 'ed') {
    const already = await page.evaluate(() => {
      const ed = document.getElementById('ed');
      return !!ed && getComputedStyle(ed).display !== 'none' && !!window.nb;
    });
    if (already) {
      await page.waitForTimeout(600);
      await measure();
      stage = 'ed';
      continue;
    }
    await page.evaluate(() => {
      const nb = { id: Date.now(), name: 'Demo', upd: Date.now(), pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }] };
      window.lib.push(nb); window.openNotebook(nb);
    });
    await page.waitForTimeout(2400);
    await measure();
    stage = 'ed';
  }
  await reset();
  await runActions(c.pre);
  await page.waitForTimeout(200);
  // burn a marker frame so the cut can be aligned by scanning, not by wall clock
  const mi = timeline.length;
  await page.evaluate((i) => {
    const d = document.createElement('div');
    d.id = '__mk';
    d.style.cssText = `position:fixed;inset:0;z-index:2147483647;background:rgb(${i * 6},255,0)`;
    document.body.appendChild(d);
  }, mi);
  await page.waitForTimeout(160);
  await page.evaluate(() => document.getElementById('__mk')?.remove());
  await page.waitForTimeout(200);
  const start = Date.now();
  await runActions(c.actions);
  const end = Date.now();
  timeline.push({ key: c.key, crop: c.crop, idx: mi, start: (start - videoT0) / 1000, end: (end - videoT0) / 1000, dur: (end - start) / 1000 });
  console.log('  recorded', c.key.padEnd(12), ((end - start) / 1000).toFixed(2) + 's');
  await page.waitForTimeout(380);
}

const vid = page.video();
await ctx.close();
await browser.close();
const vpath = await vid.path();
fs.writeFileSync(path.join(OUT, batch === 'all' ? 'timeline-all.json' : `timeline-${batch}.json`), JSON.stringify({ video: vpath, clips: timeline }, null, 2));
console.log('\nvideo:', vpath);
