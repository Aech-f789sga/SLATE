/**
 * Pull the mods' real wallpapers and real soundtracks into the app.
 *
 *   node scripts/extract-mod-media.mjs            # everything
 *   node scripts/extract-mod-media.mjs --video    # wallpapers only
 *   node scripts/extract-mod-media.mjs --music    # soundtracks only
 *
 * Two things this fixes.
 *
 * Wallpapers: eighteen of the installed mods ship an animated wallpaper, and
 * until now the notebook used a still and drew procedural dust over it, which
 * reads as "someone put a photo here" rather than "this theme is alive". The
 * animation is the mod's actual artwork, so it is transcoded to a 720p mp4 and
 * used directly.
 *
 * Music: several mods ship a whole `music/` folder that `background_music`
 * never declares — Creamy Keyboard, Elden Ring, Hollow Knight, GTA, Black Hole,
 * Josh Hutcherson, Naruto, Japanese lofi Mix. Their soundtrack exists on disk;
 * the manifest just forgot to mention it. Those are read from the folder.
 *
 * Sources stay untouched; only the derived files are written.
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

/**
 * Soundtracks, keyed by theme slug.
 *
 * More than one file means the mod shipped stems of one song — equal-length
 * layers that are meant to play together — which the engine mixes at equal
 * gain. A single file is just the song.
 */
const MUSIC_JOBS = [
  ['black-hole', 'Black Hole', ['music/Track1.mp3']],
  [
    'creamy-keyboard',
    'Creamy Keyboard',
    ['music/track_1.mp3', 'music/track_2.mp3', 'music/track_3.mp3', 'music/track_4.mp3'],
  ],
  ['elden-ring', 'Elden Ring', ['music/elden.ring.mp3']],
  ['grand-theft-auto-san-andreas', 'Grand Theft Auto: San Andreas', ['music/track_1.mp3']],
  ['hollow-knight', 'Hollow Knight', ['music/track_1.mp3']],
  ['japanese-lofi-mix', 'Japanese lofi Mix', ['music/Japanese_Lofi-Mix.mp3']],
  ['josh-hutcherson', 'Josh Hutcherson', ['music/backround music.mp3']],
  [
    'naruto-itachi-uchiha',
    'Naruto Itachi Uchiha',
    ['music/track_1.mp3', 'music/track_2.mp3', 'music/track_3.mp3', 'music/track_4.mp3'],
  ],
  ['monkey-rizz', 'Monkey RIZZ', ['music/track1.mp3']],
];

const args = process.argv.slice(2);
const onlyVideo = args.includes('--video');
const onlyMusic = args.includes('--music');
const doVideo = !onlyMusic || onlyVideo;
const doMusic = !onlyVideo || onlyMusic;

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

if (doVideo) {
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
        // No audio. 1600 px wide at CRF 26 — the earlier 720p / CRF 31 pass was
        // tuned for size and showed it: these wallpapers are almost all flat
        // gradient, which is exactly what a high CRF bands and blocks. See
        // scripts/upgrade-walls.mjs, which re-encodes the clips already in the
        // repo from the same sources at these settings.
        '-an',
        '-vf',
        "scale='min(1600,iw)':-2:flags=lanczos,fps=30",
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '26',
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

let musicTotal = 0;

if (doMusic) {
  console.log('--- soundtracks ---');
  for (const [slug, modName, files] of MUSIC_JOBS) {
    const mod = findMod(modName);
    if (!mod) {
      console.log(`  ${slug.padEnd(30)} SKIP (mod not installed)`);
      continue;
    }
    const outDir = path.join('public', 'mods', slug, 'music');
    fs.mkdirSync(outDir, { recursive: true });
    let ok = 0;
    files.forEach((rel, i) => {
      const src = path.join(mod.dir, rel);
      if (!fs.existsSync(src)) {
        console.log(`  ${slug.padEnd(30)} SKIP ${rel}`);
        return;
      }
      const out = path.join(outDir, `layer${i + 1}.m4a`);
      try {
        run([
          '-y',
          '-i',
          src,
          // 90s is enough for a loop and keeps a 365 MB source honest.
          '-t',
          '90',
          '-vn',
          '-ac',
          '1',
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-movflags',
          '+faststart',
          out,
        ]);
        const size = fs.statSync(out).size;
        musicTotal += size;
        ok++;
      } catch (e) {
        const msg = String(e.stderr ?? e.message).split('\n').slice(-2).join(' ');
        console.log(`  ${slug.padEnd(30)} FAILED ${rel}: ${msg.slice(0, 100)}`);
      }
    });
    if (ok) console.log(`  ${slug.padEnd(30)} ${ok} layer${ok > 1 ? 's' : ''}`);
  }
  console.log(`  soundtracks total: ${mb(musicTotal)} MB`);
}
