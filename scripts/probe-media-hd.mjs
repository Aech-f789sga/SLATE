/**
 * Walk every theme and report what the browser actually loaded for it: the
 * still, the video (and its true resolution), and every music layer.
 *
 * The theme choice is persisted (`inkpad-gx-theme`), so this sets it and
 * reloads — setting `data-gx-theme` alone only repaints, it does not re-apply.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const slugs = fs
  .readdirSync('public/themes')
  .map((f) => f.replace(/\.[^.]+$/, ''))
  .sort();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let bad = [];
let music = [];

for (const id of slugs) {
  bad = [];
  page.removeAllListeners('response');
  music = [];
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400) bad.push(`${r.status()} ${u.replace(/^https?:\/\/[^/]+/, '')}`);
    // `new Audio()` elements are never in the DOM, so the network is the only
    // honest way to see whether the soundtrack was actually fetched
    if (/\/music\//.test(u)) music.push(`${r.status()} ${u.split('/').pop()}`);
  });
  await page.addInitScript((theme) => {
    localStorage.setItem('inkpad-tour-home-v5', '1');
    localStorage.setItem('inkpad-tour-editor-v5', '1');
    localStorage.setItem('inkpad-install-dismissed', '1');
    localStorage.setItem('inkpad-gx-theme', JSON.stringify({ id: theme, mode: 'dark', wall: true }));
  }, id);
  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid');
  await page.waitForTimeout(1100);
  const info = await page.evaluate(() => {
    const wall = document.getElementById('gx-wall');
    const v = wall?.querySelector('video');
    const bg = wall ? getComputedStyle(wall).backgroundImage : '';
    return {
      on: wall?.dataset.on,
      bg: bg.replace(/^url\("?/, '').replace(/"?\)$/, '').split('/').pop(),
      video: v ? { w: v.videoWidth, h: v.videoHeight, ready: v.readyState } : null,
      audio: [...document.querySelectorAll('audio')].map((a) => ({
        src: (a.getAttribute('src') || '').split('/').pop(),
        dur: Math.round(a.duration || 0),
        ready: a.readyState,
      })),
    };
  });
  const flag = bad.length ? ` !! ${bad.length} failed` : '';
  console.log(
    id.padEnd(30),
    (info.video ? `${info.video.w}x${info.video.h}` : 'still').padEnd(11),
    (info.bg || '-').padEnd(34),
    music.length ? music.join(' ') : '(no music fetched)',
    flag
  );
  bad.slice(0, 3).forEach((b) => console.log('     ', b));
}
await browser.close();
