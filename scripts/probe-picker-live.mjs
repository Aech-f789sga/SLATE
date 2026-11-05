/**
 * The probe above drives the theme by setting `data-gx-theme` itself, which
 * proves the media layer reacts but not that a *person* gets the same result.
 * This walks the real path instead: open the picker, click the card, and see
 * whether the wallpaper and the soundtrack follow.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());

const audio = new Set();
page.on('response', (res) => {
  const u = new URL(res.url()).pathname;
  if (u.includes('/music/') || u.includes('/sfx/')) audio.add(u);
});

await page.addInitScript(() => {
  localStorage.setItem('inkpad_mod_wall_live', 'live');
  localStorage.setItem('inkpad_wall_look', JSON.stringify({ hd: true, alpha: 1 }));
});

await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#grid', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const s = [...document.querySelectorAll('button')].find((b) => /skip tour/i.test(b.textContent || ''));
  s?.click();
  document.getElementById('tour-root')?.remove();
});

const pick = async (id) => {
  await page.evaluate(() => document.getElementById('gx-theme-btn')?.click());
  await page.waitForTimeout(500);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('#gx-theme-panel .gxp-card')].map((c) => c.dataset.id),
  );
  await page.evaluate((t) => {
    document.querySelector(`#gx-theme-panel .gxp-card[data-id="${t}"]`)?.click();
  }, id);
  await page.waitForTimeout(1800);
  const state = await page.evaluate(() => {
    const v = document.querySelector('#gx-wall .gx-wall-video');
    return {
      theme: document.documentElement.dataset.gxTheme,
      src: (v?.getAttribute('src') || '').replace('/mods/', '') || 'none',
      playing: v ? !v.paused && v.readyState >= 2 : false,
      time: v ? Number(v.currentTime.toFixed(2)) : null,
      wallOn: document.getElementById('gx-wall')?.dataset.on,
    };
  });
  return { ...state, cards: cards.length, cardIds: cards };
};

const first = await pick('elden-ring');
console.log('picker cards:', first.cards);
console.log('elden-ring  ->', JSON.stringify({ ...first, cardIds: undefined }));
const second = await pick('monkey-rizz');
console.log('monkey-rizz ->', JSON.stringify({ ...second, cardIds: undefined }));
const third = await pick('cozy');
console.log('cozy        ->', JSON.stringify({ ...third, cardIds: undefined }));
const fourth = await pick('naruto-itachi-uchiha');
console.log('naruto      ->', JSON.stringify({ ...fourth, cardIds: undefined }));

console.log('media files requested:', audio.size);
const missing = ['elden-ring', 'monkey-rizz', 'cozy', 'naruto-itachi-uchiha'].filter(
  (t) => ![...audio].some((u) => u.includes(`/mods/${t}/`)),
);
console.log('themes that requested nothing:', missing.length ? missing.join(', ') : 'none');

await browser.close();
