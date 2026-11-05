/**
 * Pull the mods' animated wallpapers into the app.
 *
 * Eighteen of the installed mods ship an animated wallpaper. The animation is
 * the mod's actual artwork, so it is encoded at the resolution the mod shipped
 * it in and used directly.
 *
 *   node scripts/extract-mod-media.mjs
 *
 * Stills and soundtracks have their own scripts now, because they need to make
 * different decisions: `extract-stills.mjs` copies the mod's own image file and
 * `extract-music.mjs` copies the mod's own audio — neither re-encodes, which
 * this script does by necessity for video (the sources are VP9 WebM, which not
 * every tablet plays).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE =
  'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';

const FFMPEG =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';

/**
 * Wallpapers, keyed by theme slug.
 *
 * The file is named explicitly rather than discovered, because several mods
 * ship two or three candidates and the one the mod actually uses is the `dark`
 * entry — Elden Ring has both ranni.webm and godfrey.webm, and only the former
 * is the dark wallpaper. Day One and Creamy Keyboard are the exception: they
 * put the animation on the *light* side and leave dark as a still, so the light
 * file is used because it is the only motion the mod has.
 */
const VIDEO_JOBS = [
  ['anime', 'Anime', 'wallpaper/animated_dark.webm'],
  ['black-hole', 'Black Hole', 'wallpaper/Blackhole.webm'],
  ['blockified', 'Blockified', 'wallpaper/animated_dark.webm'],
  ['creamy-keyboard', 'Creamy Keyboard', 'wallpaper/video.webm'],
  ['day-one', 'Day One', 'wallpaper/animated_light.webm'],
  ['elden-ring', 'Elden Ring', 'wallpaper/ranni.webm'],
  ['grand-theft-auto-san-andreas', 'Grand Theft Auto: San Andreas', 'wallpaper/video.webm'],
  ['hollow-knight', 'Hollow Knight', 'wallpaper/video.webm'],
  ['horror', 'Horror', 'wallpaper/animated.webm'],
  ['japanese-lofi-mix', 'Japanese lofi Mix', 'wallpaper/JapaneseDark.webm'],
  ['legendary-rift', 'Legendary Rift', 'wallpaper/animated_dark.webm'],
  ['medieval', 'Medieval', 'wallpaper/animated_dark.webm'],
  ['monkey-rizz', 'Monkey RIZZ', 'wallpaper/video.mp4'],
  ['naruto-itachi-uchiha', 'Naruto Itachi Uchiha', 'wallpaper/uchiha.webm'],
  ['the-traveller', 'The Traveller', 'wallpaper/animated_dark.webm'],
];


/** Newest installed copy of a mod, by payload name. */
function findMod(name) {
  let best = null;
  for (const hash of fs.readdirSync(BASE)) {
    const hashDir = path.join(BASE, hash);
    if (!fs.statSync(hashDir).isDirectory()) continue;
    for (const ver of fs.readdirSync(hashDir)) {
      const dir = path.join(hashDir, ver);
      const mf = path.join(dir, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      let j;
      try {
        j = JSON.parse(fs.readFileSync(mf, 'utf8'));
      } catch {
        continue;
      }
      const p = j?.mod?.payload;
      if (!p) continue;
      if ((p.name || j.name) !== name) continue;
      if (!best || ver > best.ver) best = { dir, ver, payload: p };
    }
  }
  return best;
}

const mb = (n) => (n / 1024 / 1024).toFixed(2);

function run(args) {
  execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/* ---------------------------------------------------------------- video */

let videoTotal = 0;

{
  console.log('--- wallpapers ---');
  for (const [slug, modName, rel] of VIDEO_JOBS) {
    const mod = findMod(modName);
    if (!mod) {
      console.log(`  ${slug.padEnd(30)} SKIP (mod not installed)`);
      continue;
    }
    const src = path.join(mod.dir, rel);
    if (!fs.existsSync(src)) {
      console.log(`  ${slug.padEnd(30)} SKIP (${rel} missing)`);
      continue;
    }
    const outDir = path.join('public', 'mods', slug, 'wall');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, 'live.mp4');

    try {
      run([
        '-y',
        '-i',
        src,
        // No audio, native resolution, CRF 16. The mods are not all 1080p —
        // several ship 1440p and four ship 4K — so anything that scales is
        // throwing away the picture. See scripts/upgrade-walls.mjs, which
        // re-encodes the clips already in the repo at these settings.
        '-an',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos',
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '16',
        '-preset',
        'slow',
        '-movflags',
        '+faststart',
        out,
      ]);
      const size = fs.statSync(out).size;
      videoTotal += size;
      console.log(`  ${slug.padEnd(30)} ${mb(size).padStart(6)} MB  <- ${rel}`);
    } catch (e) {
      const msg = String(e.stderr ?? e.message).split('\n').slice(-2).join(' ');
      console.log(`  ${slug.padEnd(30)} FAILED: ${msg.slice(0, 120)}`);
    }
  }
  console.log(`  wallpapers total: ${mb(videoTotal)} MB`);
}

/* ---------------------------------------------------------------- music */

// Soundtracks are not this script's job any more: `extract-music.mjs` reads
// `background_music` from each manifest and copies the bytes instead of
// transcoding them to mono 64 kb/s.

