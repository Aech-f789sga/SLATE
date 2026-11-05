/**
 * How much of the wallpaper actually reaches the eye on the home screen.
 *
 * The complaint was "black on home" for Black Hole and "not clear enough" in
 * general, and both are questions about pixels, not about CSS. So this
 * screenshots a band of the shelf that has no cards on it, decodes it, and
 * reports the spread of luminance in that band. A flat sheet — an opaque
 * panel — has a standard deviation near zero however bright it is. A picture
 * behind a thin veil does not.
 *
 * It also prints the computed shelf background, which is the thing the fix
 * changed, so a regression names itself.
 */
import { chromium } from 'playwright';

const THEMES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['black-hole', 'anime', 'cozy', 'hollow-knight', 'medieval', 'lofi-chill'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
await page.addInitScript(() => localStorage.setItem('inkpad_mod_wall_live', 'live'));
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
});

/** Decode a PNG buffer in a scratch page and return luminance stats. */
const stats = async (buf) => {
  const p2 = await browser.newPage();
  await p2.setContent(`<img id="i" src="data:image/png;base64,${buf.toString('base64')}">`);
  await p2.waitForFunction(() => document.getElementById('i').complete);
  const out = await p2.evaluate(() => {
    const img = document.getElementById('i');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sum = 0, sum2 = 0;
    const hist = new Array(16).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l;
      sum2 += l * l;
      n++;
      hist[Math.min(15, Math.floor(l / 16))]++;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    // how many distinct 16-level buckets the band actually uses
    const spread = hist.filter((h) => h > n * 0.002).length;
    return { mean: Number(mean.toFixed(1)), sd: Number(sd.toFixed(2)), buckets: spread };
  });
  await p2.close();
  return out;
};

const rows = [];
for (const id of THEMES) {
  await page.evaluate(() => document.getElementById('gx-theme-btn')?.click());
  await page.waitForTimeout(400);
  await page.evaluate((t) => {
    document.querySelector(`#gx-theme-panel .gxp-card[data-id="${t}"]`)?.click();
  }, id);
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('gx-theme-panel')?.classList.remove('on'));
  await page.waitForTimeout(1100);

  const css = await page.evaluate(() => {
    const libm = document.getElementById('libm');
    const nav = document.getElementById('nav');
    return {
      libm: getComputedStyle(libm).backgroundColor,
      libmBg: getComputedStyle(libm).background.slice(0, 60),
      nav: getComputedStyle(nav).backgroundColor,
      wall: document.getElementById('gx-wall').dataset.on,
    };
  });

  // a band of shelf with no cards in it: right margin, under the card grid
  const band = { x: 1120, y: 300, width: 130, height: 420 };
  const s = await stats(await page.screenshot({ clip: band }));
  await page.screenshot({ path: `shots/home-${id}.png` });
  rows.push({ theme: id, wall: css.wall, mean: s.mean, sd: s.sd, tones: s.buckets, libm: css.libm.slice(0, 34) });
}

console.table(rows);
const flat = rows.filter((r) => r.sd < 1.5);
console.log(`\nflat shelf (sd < 1.5, i.e. a sheet rather than a picture): ${flat.length ? flat.map((f) => f.theme).join(', ') : 'none'}`);
await browser.close();
