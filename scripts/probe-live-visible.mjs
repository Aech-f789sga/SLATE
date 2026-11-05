/**
 * The probe above proves the video decodes and is not paused. It does not
 * prove you can see it: the shell frosts the wallpaper by default, which is
 * right for reading a page and wrong for judging whether the loop is there.
 * So this boots with the "HD" wallpaper look on — the setting that drops the
 * frost — and screenshots three of the newly ported themes.
 */
import { chromium } from 'playwright';

const SHOTS = [
  ['monkey-rizz', 'shots/live-monkey-rizz.png'],
  ['elden-ring', 'shots/live-elden-ring.png'],
  ['hollow-knight', 'shots/live-hollow-knight.png'],
  ['grand-theft-auto-san-andreas', 'shots/live-gta.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

// both preferences are read once at boot, so they have to exist before the app
await page.addInitScript(() => {
  localStorage.setItem('inkpad_mod_wall_live', 'live');
  localStorage.setItem('inkpad_wall_look', JSON.stringify({ hd: true, alpha: 1 }));
});

await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const n = {
    id: Date.now(), name: 'M', upd: Date.now(),
    pages: [{ tpl: 'lined', col: '', strokes: [], pw: 800, ph: 1100 }],
  };
  window.lib.push(n);
  window.openNotebook(n);
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
  document.getElementById('gx-wall').dataset.on = '1';
});

for (const [id, shot] of SHOTS) {
  await page.evaluate((t) => {
    document.documentElement.dataset.gxTheme = t;
    window.dispatchEvent(new Event('resize'));
  }, id);
  await page.waitForTimeout(1800);

  const geo = await page.evaluate(() => {
    const v = document.querySelector('#gx-wall .gx-wall-video');
    const wall = document.getElementById('gx-wall');
    return {
      hd: document.documentElement.dataset.gxWallfx || 'off',
      src: (v?.getAttribute('src') || '').replace('/mods/', ''),
      playing: v ? !v.paused && v.readyState >= 2 : false,
      frames: v?.webkitDecodedFrameCount ?? null,
      time: v ? Number(v.currentTime.toFixed(2)) : null,
      wallOn: wall?.dataset.on,
    };
  });
  console.log(id, JSON.stringify(geo));
  await page.screenshot({ path: shot });
}

await browser.close();
