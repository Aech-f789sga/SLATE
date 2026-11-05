/**
 * Record a real screen capture of Slate for the showcase video.
 *
 * Playwright records the page itself, so this is the app, not a mock-up — real
 * ink, real themes, real wallpaper video. What it does not give us is a pointer:
 * `mouse.move` dispatches events but the browser draws no cursor, so the first
 * thing injected is a fake one that follows `pointermove` and ripples on press.
 * Without it the video is a series of things happening by themselves.
 *
 * The beats, in order:
 *
 *   1. the shelf, drifting                      ~4 s
 *   2. themes: pick, Load, then the playlist    ~20 s
 *   3. open a notebook                          ~4 s
 *   4. draw, change ink, highlight              ~14 s
 *   5. the page card, then the editor card      ~14 s
 *   6. settle                                   ~4 s
 *
 *   node scripts/capture-demo.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const PORT = process.env.PORT || process.argv[2] || '5199';
const OUT = '.demo/raw';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const W = 1920;
const H = 1080;

/* ------------------------------------------------------------------ */
/* the shelf, seeded so it is not an empty grid                         */
/* ------------------------------------------------------------------ */

const SEED = () => {
  // a fixed age per notebook, newest first, so the shelf is the same every take
  const mk = (name, cover, pages = 2, age = 0) => ({
    id: 'nb-' + name.toLowerCase().replace(/\W+/g, ''),
    name,
    cover,
    upd: Date.now() - age * 3.6e6,
    pages: Array.from({ length: pages }, () => ({
      tpl: 'lined',
      col: '',
      strokes: [],
      pw: 800,
      ph: 1100,
    })),
  });
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  // a returning user has already read the storage notice. Left alone it drops
  // over the shelf halfway through the theme beat and sits there, which is a
  // real part of the app but not a thing worth filming.
  localStorage.setItem('inkpad-guest-dismissed', '1');
  localStorage.setItem(
    'inkpad',
    JSON.stringify([
      mk('Algebra II', '#2f6df6', 6, 0),
      mk('Thermodynamics', '#e5383b', 4, 2),
      mk('Field Notes', '#2a9d4f', 3, 5),
      mk('Sketchbook', '#f4a300', 5, 8),
      mk('Chemistry', '#8e44ad', 2, 11),
      mk('Reading Log', '#16a2b8', 4, 14),
      mk('Linear Algebra', '#2f6df6', 7, 20),
      mk('Physics Lab', '#e5383b', 3, 26),
      mk('Ideas', '#f4a300', 2, 32),
      mk('Japanese', '#8e44ad', 5, 40),
      mk('Music Theory', '#2a9d4f', 4, 48),
      mk('Trip 2026', '#16a2b8', 6, 60),
    ])
  );
};

/* ------------------------------------------------------------------ */
/* a pointer the viewer can see                                        */
/* ------------------------------------------------------------------ */

const CURSOR = () => {
  // An init script runs before the parser has built anything, so `body` and
  // even `documentElement` can still be null here. Listeners go on `window`
  // straight away; the elements are mounted once there is a body to mount them
  // into. Doing it the other way round throws on the first line and the whole
  // script dies silently — which is exactly what a missing cursor looks like.
  let cur = null;
  let ring = null;

  addEventListener(
    'pointermove',
    (e) => {
      if (!cur) return;
      cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      ring.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    },
    true
  );
  addEventListener(
    'pointerdown',
    () => {
      if (!ring) return;
      ring.classList.remove('go');
      void ring.offsetWidth;
      ring.classList.add('go');
    },
    true
  );

  const mount = () => {
    if (document.getElementById('demo-cur')) return;
    const css = document.createElement('style');
    css.textContent = `
      #demo-cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;
        width:22px;height:22px;margin:-2px 0 0 -2px;transition:transform .06s linear;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
      #demo-cur svg{width:22px;height:22px;display:block}
      #demo-ring{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;
        width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
        border:2px solid rgba(255,255,255,.9);opacity:0}
      #demo-ring.go{animation:demo-ring .42s ease-out}
      @keyframes demo-ring{
        0%{opacity:.9;transform:scale(.4)}
        100%{opacity:0;transform:scale(2.6)}
      }`;
    document.head.append(css);

    cur = document.createElement('div');
    cur.id = 'demo-cur';
    cur.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M5 2.5 L5 19.5 L9.4 15.3 L12.2 21.4 L15 20 L12.2 14 L18 13.6 Z" ' +
      'fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    ring = document.createElement('div');
    ring.id = 'demo-ring';
    document.body.append(cur, ring);
    cur.style.transform = `translate(${innerWidth / 2}px,${innerHeight * 0.62}px)`;
    ring.style.transform = cur.style.transform;
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
};

/* ------------------------------------------------------------------ */

const wait = (p, ms) => p.waitForTimeout(ms);

async function glide(p, x, y, steps = 26, ms = 0) {
  const from = await p.evaluate(() => {
    const t = document.getElementById('demo-cur')?.style.transform || '';
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(t);
    return m ? [Number(m[1]), Number(m[2])] : [innerWidth / 2, innerHeight / 2];
  });
  // ease in/out so the pointer does not teleport: a straight lerp with a
  // smoothstep on the parameter reads as a hand, a linear one reads as a robot
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t * t * (3 - 2 * t);
    await p.mouse.move(from[0] + (x - from[0]) * e, from[1] + (y - from[1]) * e);
    if (ms) await wait(p, ms / steps);
  }
}

async function centre(p, sel) {
  const r = await p.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const q = n.getBoundingClientRect();
    if (!q.width) return null;
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  }, sel);
  return r;
}

async function click(p, sel, settle = 420) {
  const c = await centre(p, sel);
  if (!c) throw new Error(`nothing to click: ${sel}`);
  await glide(p, c.x, c.y, 22, 260);
  await wait(p, 90);
  await p.mouse.down();
  await wait(p, 70);
  await p.mouse.up();
  await wait(p, settle);
}

/**
 * Click a point rather than a selector.
 *
 * Some of the things worth showing have no stable selector — the preset chips
 * inside the engine's drawer are a row of anonymous buttons whose only handle is
 * their label — so they are measured once and clicked by coordinate.
 */
async function clickAt(p, x, y, settle = 420) {
  await glide(p, x, y, 22, 260);
  await wait(p, 90);
  await p.mouse.down();
  await wait(p, 70);
  await p.mouse.up();
  await wait(p, settle);
}

/** Centre of the first button inside `container` whose text is exactly `label`. */
async function buttonByText(p, container, label) {
  return p.evaluate(
    ([sel, text]) => {
      const n = Array.from(document.querySelectorAll(`${sel} button`)).find(
        (b) => b.textContent.trim() === text
      );
      if (!n) return null;
      const q = n.getBoundingClientRect();
      if (!q.width) return null;
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    },
    [container, label]
  );
}

/**
 * Wait until a button is actually pressable.
 *
 * The coordinate click helpers do not know about `disabled` — they press a point,
 * and a disabled button swallows the press without a word. The Load button is
 * disabled for the moment between picking a card and the panel working out that
 * it has something to load, which is exactly when this script reaches for it.
 */
async function waitEnabled(p, sel, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await p.evaluate((s) => {
      const n = document.querySelector(s);
      return !!n && !n.disabled && n.getBoundingClientRect().width > 0;
    }, sel);
    if (ok) return true;
    await wait(p, 60);
  }
  return false;
}

/**
 * Click a theme card, scrolling it into view first.
 *
 * The grid is taller than the panel, and a rect below the fold is a rect
 * outside the window — clicking its centre would land on the shelf behind the
 * panel. So bring it up, then re-measure, then click.
 */
async function clickCard(p, sel, settle = 1500) {
  const inside = await p.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return false;
    n.scrollIntoView({ block: 'center', behavior: 'instant' });
    const q = n.getBoundingClientRect();
    return q.top > 8 && q.bottom < innerHeight - 8 && q.width > 0;
  }, sel);
  if (!inside) return false;
  await wait(p, 260);
  await click(p, sel, settle);
  return true;
}

/** Press and drag through a list of points, for ink. */
async function ink(p, pts, stepDelay = 12) {
  await p.mouse.move(pts[0][0], pts[0][1]);
  await wait(p, 40);
  await p.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let s = 1; s <= 4; s++) {
      await p.mouse.move(ax + ((bx - ax) * s) / 4, ay + ((by - ay) * s) / 4);
      await wait(p, stepDelay / 4);
    }
  }
  await wait(p, 60);
  await p.mouse.up();
  await wait(p, 120);
}

/** Sample a cubic bezier into points. */
function bez(p0, p1, p2, p3, n = 26) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/* ------------------------------------------------------------------ */

const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
});
const page = await ctx.newPage();
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(SEED);
await page.addInitScript(CURSOR);

console.log('loading');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 30000 });
await wait(page, 2600);
await page.evaluate(() => document.getElementById('tour-root')?.remove());
await page.evaluate(() => {
  const c = document.getElementById('demo-cur');
  if (c) c.style.transform = `translate(${innerWidth * 0.5}px,${innerHeight * 0.62}px)`;
});
await wait(page, 500);

/* ---- 1. the shelf ---- */
console.log('shelf');
const card = await centre(page, '#grid > .card');
if (card) {
  await glide(page, card.x - 200, card.y + 260, 26, 1100);
  await wait(page, 400);
  await glide(page, card.x + 30, card.y + 10, 26, 900);
  await wait(page, 450);
}

/* ---- 2. themes ---- */
console.log('themes');
await click(page, '#gx-theme-btn', 700);
// the wallpaper first: without it a theme is a palette, with it the shelf itself
// changes, which is the thing worth showing
const wallOn = await page.evaluate(() => {
  const t = document.getElementById('gxp-wall-t');
  return !!t?.checked;
});
if (!wallOn) await click(page, '#gxp-wall-t', 1200);

/*
 * A card no longer applies on click — it is *picked*, and the Load button under
 * the grid fetches the wallpaper and the first track before anything switches.
 * So each theme here is two presses, and the second one is the one that waits.
 * The last theme stays: it is the one the playlist beat needs.
 */
for (const id of ['cyberdeck', 'grand-theft-auto-san-andreas', 'anime']) {
  const ok = await clickCard(page, `.gxp-card[data-id="${id}"]`, 520);
  if (!ok) {
    console.log('  skipped', id);
    continue;
  }
  const ready = await waitEnabled(page, '.gxp-go');
  if (!ready) {
    console.log('  Load never became pressable for', id);
    continue;
  }
  await click(page, '.gxp-go', 1700);
}
await click(page, '.gxp-x', 1100);

/* ---- 2b. the playlist ---- */
console.log('playlist');
// anime is a four-track mod; the corner board gets ‹ › once there is more than
// one track, and the next one starts on its own when a track ends
await click(page, '#gxm .gxm-fab', 1500);
const trackBefore = await page.textContent('#gxm .gxm-tnum').catch(() => null);
const nextTrack = await centre(page, '#gxm [data-trk="1"]');
if (nextTrack) {
  await glide(page, nextTrack.x, nextTrack.y, 18, 320);
  await wait(page, 200);
  await clickAt(page, nextTrack.x, nextTrack.y, 900);
  // hold on the new number: it is four characters in the corner of a 1080p
  // frame, and a beat that lasts a second and a half may as well not be there
  await glide(page, nextTrack.x - 40, nextTrack.y + 30, 14, 500);
  await wait(page, 2400);
}
const trackAfter = await page.textContent('#gxm .gxm-tnum').catch(() => null);
console.log(`  track ${trackBefore} -> ${trackAfter}`);
await click(page, '#gxm .gxm-x', 700);

/* ---- 3. open a notebook ---- */
console.log('open');
const first = await page.evaluate(() => {
  const n = document.querySelector('#grid > .card');
  if (!n) return null;
  const q = n.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
});
if (first) {
  await glide(page, first.x, first.y, 24, 500);
  await wait(page, 220);
  await page.mouse.down();
  await wait(page, 70);
  await page.mouse.up();
}
await wait(page, 2200);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

/* ---- 4. ink ---- */
console.log('draw');
const box = await page.evaluate(() => {
  const c = document.getElementById('cv');
  const q = c.getBoundingClientRect();
  return { x: q.x, y: q.y, w: q.width, h: q.height };
});
const P = (u, v) => [box.x + box.w * u, box.y + box.h * v];

// a nib worth watching: the ballpoint at 3 px is a hairline on a 1080p frame
await click(page, '#ink-pen button[title^="Fountain"]', 600);
await click(page, '#ink-pen button[title^="Thick"]', 500);

// a signature-ish flourish: two crossing curves and a tail
await ink(page, bez(P(0.12, 0.16), P(0.28, 0.05), P(0.44, 0.3), P(0.56, 0.18)));
await ink(page, bez(P(0.54, 0.18), P(0.66, 0.06), P(0.8, 0.28), P(0.9, 0.14)));
await ink(page, bez(P(0.14, 0.3), P(0.34, 0.22), P(0.62, 0.34), P(0.88, 0.26)));

// a second colour, from the floating pen row — the swatches in `#sws` are
// hidden once that row is on screen, so the row is what a hand would reach for
await click(page, '#ink-pen button[title="#f24d5c"]', 600);
await ink(page, bez(P(0.18, 0.44), P(0.4, 0.38), P(0.66, 0.5), P(0.84, 0.42)));
await ink(page, bez(P(0.2, 0.52), P(0.44, 0.58), P(0.62, 0.44), P(0.82, 0.54)));
await ink(page, bez(P(0.24, 0.6), P(0.42, 0.66), P(0.6, 0.54), P(0.78, 0.62)));

// highlighter across a line of the paper
await click(page, 'button[data-t="hl"]', 500);
await ink(page, bez(P(0.16, 0.72), P(0.4, 0.72), P(0.66, 0.72), P(0.86, 0.725)));
await wait(page, 400);
await click(page, 'button[data-t="pen"]', 400);

/* ---- 5. the two cards ---- */
console.log('cards');
await click(page, '#pgm', 1100);
// a native select cannot be captured open, so the cursor rests on it and the
// value is set directly — the card repaints the paper, which is the point
const tpl = await centre(page, '#tpl');
if (tpl) {
  await glide(page, tpl.x, tpl.y, 18, 300);
  await wait(page, 260);
}
await page.selectOption('#tpl', 'grid').catch(() => {});
await wait(page, 1000);
await click(page, '.pgm-x', 1000);

await click(page, '#edm', 1500);
await click(page, '#edm-snd', 1200);

/*
 * The six tools now live in this card instead of the page card. Pressing one
 * forwards the click to the engine's own button, so the drawer that opens is the
 * real one — and the grid preset inside it lands on the paper behind.
 *
 * Pressing the preset is also what closes the card: a press outside the card is
 * an outside press, and that is the card's own rule. So the drawer is dismissed
 * separately, on the grey surround beside the page, where a press cannot ink.
 */
const tool = await centre(page, '#edm-card .edm-tools button');
if (tool) await clickAt(page, tool.x, tool.y, 900);

const gridChip = await buttonByText(page, '#gn-drw', 'Square grid');
if (gridChip) await clickAt(page, gridChip.x, gridChip.y, 1200);

const pageBox = await page.evaluate(() => {
  const c = document.getElementById('cv');
  const q = c.getBoundingClientRect();
  return { x: q.x, y: q.y, h: q.height };
});
await clickAt(page, Math.max(6, pageBox.x - 26), pageBox.y + pageBox.h / 2, 900);

/* ---- 6. settle ---- */
console.log('settle');
await glide(page, box.x + box.w * 0.5, box.y + box.h * 0.86, 30, 1600);
await wait(page, 1800);

const video = page.video();
await ctx.close();
await browser.close();
console.log('video ->', await video.path());
