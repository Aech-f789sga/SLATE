/**
 * The soundtrack as a playlist: one track at a time, next on its own, and the
 * stepper in the player.
 *
 * The proof that only one file is playing is the network — the element is never
 * in the DOM, so `querySelectorAll('audio')` is always empty and proves nothing.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = process.env.PORT || '5199';
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

const musicHits = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/music/')) musicHits.push(u.split('/music/')[1]);
});

await page.addInitScript(() => {
  localStorage.setItem('inkpad-tour-editor-v5', '1');
  localStorage.setItem('inkpad-tour-home-v5', '1');
  // only on the first load: addInitScript runs again on reload, and the whole
  // point of the last check is to come back wearing a different theme
  if (!localStorage.getItem('__probe_seeded')) {
    localStorage.setItem('__probe_seeded', '1');
    localStorage.setItem(
      'inkpad-gx-theme',
      JSON.stringify({ id: 'anime', mode: 'dark', wall: true })
    );
    localStorage.removeItem('inkpad_mod_track');
  }
});

const out = (k, v) => console.log(`${k.padEnd(32)} ${v}`);

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 30000 });
await page.waitForTimeout(2600);
await page.evaluate(() => document.getElementById('tour-root')?.remove());

await page.mouse.click(700, 700); // the gesture the browser wants
await page.waitForTimeout(1500);

const st = () => page.evaluate(() => window.__inkpad_modaudio.state());

const a = await st();
out('anime tracks', `${a.count}`);
out('track 1', JSON.stringify(a));

/* ---- next / prev ---- */
await page.evaluate(() => window.__inkpad_modaudio.next());
await page.waitForTimeout(1200);
const b = await st();
out('after next', `${b.index} ${b.src.split('/').pop()}`);

await page.evaluate(() => window.__inkpad_modaudio.next());
await page.waitForTimeout(1200);
const c = await st();
out('after next again', `${c.index} ${c.src.split('/').pop()}`);

await page.evaluate(() => window.__inkpad_modaudio.prev());
await page.waitForTimeout(1200);
const d = await st();
out('after prev', `${d.index} ${d.src.split('/').pop()}`);

/* ---- wrap around ---- */
await page.evaluate(() => window.__inkpad_modaudio.select(3));
await page.waitForTimeout(900);
await page.evaluate(() => window.__inkpad_modaudio.next());
await page.waitForTimeout(1200);
const e = await st();
out('last -> next wraps', `${e.index} ${e.src.split('/').pop()}`);

/* ---- auto-advance: jump to the end and wait for `ended` ---- */
await page.evaluate(() => window.__inkpad_modaudio.select(0));
await page.waitForTimeout(1200);
const before = await st();
out('before the end', `${before.index} playing=${before.playing}`);
await page.evaluate(() => window.__inkpad_modaudio.seek(9999));
await page.waitForTimeout(2600);
const after = await st();
out('after the track ended', `${after.index} ${after.src.split('/').pop()} playing=${after.playing}`);
out('auto-advance worked', after.index !== before.index || !after.playing);

/* ---- the label and the panel row ---- */
await page.evaluate(() => {
  const fab = document.querySelector('#gxm .gxm-fab');
  fab?.click();
});
await page.waitForTimeout(700);
const panel = await page.evaluate(() => {
  const row = document.querySelector('.gxm-tracks');
  return {
    hidden: row ? row.hasAttribute('hidden') : 'no row',
    num: document.querySelector('.gxm-tnum')?.textContent || '',
    info: document.querySelector('.gxm-tinfo')?.textContent || '',
    track: document.querySelector('.gxm-track')?.textContent || '',
    prev: !!document.querySelector('[data-trk="-1"]'),
    next: !!document.querySelector('[data-trk="1"]'),
  };
});
out('player row', JSON.stringify(panel));
await page.screenshot({ path: 'shots/player-playlist.png' });

/* ---- one file at a time ---- */
const counts = musicHits.reduce((m, f) => ((m[f] = (m[f] || 0) + 1), m), {});
out('music files fetched', JSON.stringify(counts));

/* ---- and a single-track theme keeps the old shape ---- */
await page.evaluate(() => {
  localStorage.setItem('inkpad-gx-theme', JSON.stringify({ id: 'black-hole', mode: 'dark', wall: false }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid');
await page.waitForTimeout(2600);
await page.mouse.click(700, 700);
await page.waitForTimeout(1400);
const single = await st();
out('black-hole (1 track)', JSON.stringify(single));
const singleRow = await page.evaluate(() => {
  const row = document.querySelector('.gxm-tracks');
  return row ? row.hasAttribute('hidden') : 'no row';
});
out('stepper hidden for 1 track', singleRow);

await browser.close();
