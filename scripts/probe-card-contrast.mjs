/**
 * The page card's icons disappear on some themes. They are white pills with
 * white glyphs, so measure it: for every button in the open card, compare the
 * computed `color` (which is what the SVG strokes inherit) against the computed
 * background, and report the contrast ratio.
 */
import { chromium } from 'playwright';

const THEMES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['black-hole', 'anime', 'cozy', 'medieval', 'hollow-knight', 'lofi-chill',
     'cyberdeck', 'minecraft-sound-fireplace', 'creature-keyboard'];

const lum = (r, g, b) => {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const parse = (s) => {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  const n = {
    id: Date.now(), name: 'T', upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(2200);
await page.evaluate(() => {
  document.getElementById('tour-skip')?.click();
  document.getElementById('tour-x')?.click();
});

const rows = [];
for (const id of THEMES) {
  // apply through the real picker, on the library screen where it lives
  await page.evaluate(() => document.getElementById('back')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('gx-theme-btn')?.click());
  await page.waitForTimeout(400);
  await page.evaluate((t) => {
    document.querySelector(`#gx-theme-panel .gxp-card[data-id="${t}"]`)?.click();
  }, id);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('gx-theme-panel')?.classList.remove('on'));
  await page.waitForTimeout(600);
  // back into a note, open the page card
  await page.evaluate(() => {
    const n = window.lib[window.lib.length - 1];
    window.openNotebook(n);
  });
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    document.getElementById('tour-skip')?.click();
    document.getElementById('tour-x')?.click();
  });
  // the pill toggles, so a stray click from the previous theme can leave it
  // open; make the state explicit and retry once if it did not take
  for (let attempt = 0; attempt < 2; attempt++) {
    const open = await page.evaluate(() => document.getElementById('bar2')?.classList.contains('open'));
    if (open) break;
    await page.evaluate(() => document.getElementById('pgm')?.click());
    await page.waitForTimeout(800);
  }

  const found = await page.evaluate(() => {
    const card = document.getElementById('bar2');
    if (!card?.classList.contains('open')) return { error: 'card did not open' };
    const btns = [...card.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    return {
      cardBg: getComputedStyle(card).backgroundColor,
      btns: btns.slice(0, 12).map((b) => {
        const cs = getComputedStyle(b);
        const svg = b.querySelector('svg');
        return {
          title: (b.getAttribute('title') || '').slice(0, 18),
          color: cs.color,
          bg: cs.backgroundColor,
          border: cs.borderColor,
          svg: !!svg,
          svgFill: svg ? getComputedStyle(svg).fill : '',
          svgStroke: svg ? getComputedStyle(svg).stroke : '',
        };
      }),
    };
  });

  if (found.error) {
    rows.push({ theme: id, note: found.error });
    continue;
  }

  let worst = 99;
  let sample = null;
  for (const b of found.btns) {
    const fg = parse(b.color);
    const bg = parse(b.bg);
    if (!fg || !bg) continue;
    // the glyph paints over the button's own background
    const l1 = lum(fg.r, fg.g, fg.b);
    const l2 = lum(bg.r, bg.g, bg.b);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < worst) {
      worst = ratio;
      sample = { title: b.title, color: b.color, bg: b.bg, svg: b.svg };
    }
  }
  rows.push({
    theme: id,
    card: found.cardBg,
    worst: Number(worst.toFixed(2)),
    sample: sample ? `${sample.title} fg=${sample.color} bg=${sample.bg} svg=${sample.svg}` : '-',
  });
  await page.screenshot({ path: `shots/card-${id}.png`, clip: { x: 0, y: 0, width: 640, height: 300 } });
}

console.table(rows);
const bad = rows.filter((r) => r.worst < 2.5);
console.log(`\nunreadable (contrast < 2.5): ${bad.length ? bad.map((b) => b.theme).join(', ') : 'none'}`);
await browser.close();
