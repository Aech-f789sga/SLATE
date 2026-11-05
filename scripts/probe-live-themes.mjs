/**
 * Every theme that ships media, checked one at a time.
 *
 * The point is not "does it look right" — it is whether the wallpaper the mod
 * actually animates is playing, and whether every byte the theme asks for
 * arrives. So for each theme this switches the attribute the media layer keys
 * on, waits for the 350 ms poll to notice, and then reads the `<video>` that
 * the wall engine built: whether it has a source, whether it decoded a frame,
 * and whether it is running. Music is counted from the requests the audio
 * engine makes, since the stems are what prove a soundtrack exists.
 */
import { chromium } from 'playwright';

const THEMES = [
  'anime', 'black-hole', 'blockified', 'capybara-party', 'cozy',
  'creamy-keyboard', 'cyberdeck', 'day-one', 'elden-ring',
  'grand-theft-auto-san-andreas', 'hollow-knight', 'horror',
  'japanese-lofi-mix', 'josh-hutcherson', 'legendary-rift', 'lofi-chill',
  'medieval', 'minecraft-sound-fireplace', 'monkey-rizz',
  'naruto-itachi-uchiha', 'spaced-out', 'the-traveller', 'violet-nebula',
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

const seen = new Set();
const failed = [];
page.on('response', (res) => {
  const u = new URL(res.url()).pathname;
  if (u.startsWith('/mods/')) {
    seen.add(u);
    if (res.status() >= 400) failed.push(`${res.status()} ${u}`);
  }
});
page.on('requestfailed', (req) => {
  const u = new URL(req.url()).pathname;
  if (!u.startsWith('/mods/')) return;
  // Switching theme tears down the previous theme's <audio> elements while
  // their stems are still in flight, so `net::ERR_ABORTED` here is the probe
  // working, not a missing file. Anything else is a real problem.
  const why = req.failure()?.errorText || 'unknown';
  if (/ERR_ABORTED/.test(why)) return;
  failed.push(`${why} ${u}`);
});

await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1000);

// a notebook, so the editor's wall layer exists and the audio engine is live
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
  // the wallpaper switch has to be on, or the layer hides everything on purpose
  const wall = document.getElementById('gx-wall');
  if (wall) wall.dataset.on = '1';
  localStorage.setItem('inkpad_mod_wall_live', 'live');
});
await page.waitForTimeout(400);

const rows = [];
for (const id of THEMES) {
  const before = new Set(seen);
  await page.evaluate((t) => {
    document.documentElement.dataset.gxTheme = t;
    window.dispatchEvent(new Event('resize'));
  }, id);
  // the wall polls every 350 ms, the audio engine every 900 ms
  await page.waitForTimeout(1500);

  const r = await page.evaluate(() => {
    const v = document.querySelector('#gx-wall .gx-wall-video');
    const c = document.querySelector('#gx-wall .gx-wall-fx');
    const wall = document.getElementById('gx-wall');
    return {
      src: v?.getAttribute('src') || '',
      ready: v?.readyState ?? -1,
      w: v?.videoWidth ?? 0,
      paused: v ? v.paused : true,
      err: v?.error ? v.error.code : 0,
      fx: c ? getComputedStyle(c).display : 'none',
      live: wall?.dataset.live ?? '?',
      audio: document.querySelectorAll('audio').length,
    };
  });

  const fresh = [...seen].filter((u) => !before.has(u));
  const music = fresh.filter((u) => u.includes('/music/')).length;
  const sfx = fresh.filter((u) => u.includes('/sfx/')).length;

  const live = r.src ? (r.ready >= 2 && !r.paused ? 'LIVE' : `STUCK r${r.ready}`) : 'still';
  rows.push({
    theme: id,
    wall: live,
    dim: r.w ? `${r.w}px` : '-',
    music,
    sfx,
    fx: r.fx,
    layer: r.live,
  });
}

console.table(rows);

const moving = rows.filter((r) => r.wall === 'LIVE').length;
const broken = rows.filter((r) => r.wall.startsWith('STUCK'));
const noMusic = rows.filter((r) => r.music === 0).map((r) => r.theme);

console.log(`\nthemes with a playing video: ${moving}/${rows.length}`);
console.log(`stuck videos: ${broken.length ? broken.map((b) => b.theme).join(', ') : 'none'}`);
console.log(`themes that pulled no music this pass: ${noMusic.length ? noMusic.join(', ') : 'none'}`);
console.log(`/mods/ requests: ${seen.size}   failures: ${failed.length}`);
if (failed.length) console.log(failed.slice(0, 10).join('\n'));

await browser.close();
