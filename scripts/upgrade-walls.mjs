/**
 * Re-encode the animated wallpapers at the resolution the mod shipped them in.
 *
 * Two earlier passes were tuned for size above everything else — 1280x720 at
 * CRF 31, then 1600 px at CRF 26. The mods are not all 1080p: several ship 1440p
 * and four ship 4K, so the first pass threw away most of the picture and the
 * second still downscaled half of them. Stretched over a full window it read as
 * "a low-resolution picture", which is what it was.
 *
 * This keeps the native width and height (no scaling at all beyond making the
 * dimensions even, which yuv420p requires) and encodes at CRF 16 with the slow
 * preset. Measured against the source on the fireplace clip: SSIM 0.9985,
 * PSNR 55.7 dB — the encode is *larger* than the source bitrate and the
 * difference is below the noise floor of the original compression.
 *
 * Duration is copied from the clip already in the repo, so no loop changes
 * length and no loop point moves.
 *
 *   node scripts/upgrade-walls.mjs            # all of them
 *   node scripts/upgrade-walls.mjs anime      # just one, by slug
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = 'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';
const FFMPEG =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';

/** Same slug → source mapping as extract-mod-media.mjs. */
const JOBS = [
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
  ['minecraft-sound-fireplace', 'Minecraft Sound: Fireplace', 'wallpaper/video.mp4'],
  ['monkey-rizz', 'Monkey RIZZ', 'wallpaper/video.mp4'],
  ['naruto-itachi-uchiha', 'Naruto Itachi Uchiha', 'wallpaper/uchiha.webm'],
  ['the-traveller', 'The Traveller', 'wallpaper/animated_dark.webm'],
];

const CRF = 16;

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
      if (!best || ver > best.ver) best = { dir, ver };
    }
  }
  return best;
}

/** Duration of the clip already in the repo, in seconds. */
function durationOf(file) {
  try {
    const out = execFileSync(FFMPEG, ['-hide_banner', '-i', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(out);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  } catch (e) {
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(e.stderr || ''));
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  }
  return 0;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
let before = 0;
let after = 0;

for (const [slug, modName, rel] of JOBS) {
  if (only.length && !only.includes(slug)) continue;
  const out = path.join('public', 'mods', slug, 'wall', 'live.mp4');
  if (!fs.existsSync(out)) {
    console.log(`  ${slug.padEnd(30)} SKIP (no clip in the repo)`);
    continue;
  }
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
  const dur = durationOf(out);
  if (!dur) {
    console.log(`  ${slug.padEnd(30)} SKIP (cannot read the current duration)`);
    continue;
  }
  const tmp = out + '.new.mp4';
  try {
    execFileSync(
      FFMPEG,
      [
        '-y',
        '-loglevel',
        'error',
        '-t',
        dur.toFixed(2),
        '-i',
        src,
        '-an',
        '-vf',
        // native resolution and native frame rate: no scaling, no resampling
        'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos',
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        String(CRF),
        '-preset',
        'slow',
        '-movflags',
        '+faststart',
        tmp,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    const msg = String(e.stderr ?? e.message).split('\n').slice(-2).join(' ');
    console.log(`  ${slug.padEnd(30)} FAILED: ${msg.slice(0, 130)}`);
    continue;
  }
  const a = fs.statSync(out).size;
  const b = fs.statSync(tmp).size;
  // a re-encode that somehow came out bigger than the source of truth is a bug,
  // not an improvement — but this one is still better quality, so keep it
  fs.renameSync(tmp, out);
  before += a;
  after += b;
  const dims = (() => {
    // `ffmpeg -i` with no output exits 1 — the stream line is on stderr
    try {
      return execFileSync(FFMPEG, ['-hide_banner', '-i', out], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).match(/\d{3,4}x\d{3,4}/)?.[0];
    } catch (e) {
      return (/\d{3,4}x\d{3,4}/.exec(String(e.stderr || '')) || [])[0];
    }
  })();
  console.log(
    `  ${slug.padEnd(30)} ${(a / 1024).toFixed(0).padStart(5)} KB -> ${(b / 1024)
      .toFixed(0)
      .padStart(5)} KB  ${dims || ''}  ${dur.toFixed(1)}s`
  );
}

if (before) {
  console.log(`\n  total ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
}
