/**
 * Put the mods' own soundtracks in, untouched.
 *
 * The first pass through this was lossy in three ways at once: it took only the
 * files someone had hand-listed, it cut every one of them to 90 seconds, and it
 * transcoded the result to **mono 64 kb/s AAC**. Mono throws away the stereo
 * image the mods were mixed with, and 64 kb/s is below what a phone speaker
 * reproduces, let alone headphones.
 *
 * This reads `background_music` out of each mod's manifest — the field Opera GX
 * itself plays from — and copies the bytes. No transcode, no downmix, no
 * resample: the file that lands in `public/` is the file the mod ships, cut to
 * the loop length the app already uses. The one exception is the mod that
 * ships WAV stems, which go to FLAC — lossless, so still bit-for-bit the same
 * samples, just a third of the disk.
 *
 *   node scripts/extract-music.mjs
 *   node scripts/extract-music.mjs --dry     # say what it would do
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = 'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';
const FFMPEG =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';

/** Seconds of each song the app loops. Unchanged from the first pass. */
const LOOP = 90;

const dry = process.argv.includes('--dry');

/* ------------------------------------------------------------------ */

/**
 * Theme slug → mod name, read out of `src/mod-media.ts` rather than guessed
 * from the slug. The earlier ad-hoc matcher paired `the-traveller` with Grand
 * Theft Auto, because "the" appears in both.
 */
function themePairs() {
  const src = fs.readFileSync('src/mod-media.ts', 'utf8');
  const out = [];
  const re = /id:\s*'([^']+)',\s*\n\s*name:\s*'([^']+)',/g;
  let m;
  while ((m = re.exec(src))) out.push([m[1], m[2]]);
  return out;
}

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
      // the installed mod is "Minecraft Sound: Fireplace" and the theme calls
      // it "Minecraft: Fireplace"; an exact match silently skipped it
      const nm = (p.name || j.name || '').toLowerCase();
      const want = name.toLowerCase();
      if (nm !== want && !nm.includes(want.split(':')[0]) && !want.includes(nm.split(':')[0])) continue;
      if (!best || ver > best.ver) best = { dir, ver, payload: p };
    }
  }
  return best;
}

/**
 * `background_music` comes in three shapes across the installed mods: a list of
 * paths (stems of one song), a list of `{ id, name, tracks }` objects, or a
 * single object. Flatten them all to one ordered list of paths.
 */
function tracksOf(payload) {
  const b = payload?.background_music;
  if (!b) return [];
  const flat = (v) => {
    if (!v) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.flatMap(flat);
    if (typeof v === 'object') return flat(v.tracks ?? v.track ?? []);
    return [];
  };
  return flat(b);
}

/**
 * What is actually inside the file, not what it is called.
 *
 * One mod ships AAC audio under a `.mp3` name, and `-c copy` into an mp3
 * container fails outright — which is how this was found. The container is
 * chosen from the codec so the bytes can always be copied.
 */
function codecOf(file) {
  try {
    const out = execFileSync(FFMPEG, ['-hide_banner', '-i', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return /Audio: (\w+)/.exec(out)?.[1] ?? '';
  } catch (e) {
    return /Audio: (\w+)/.exec(String(e.stderr || ''))?.[1] ?? '';
  }
}

/** codec → [container extension, ffmpeg args] — copy where possible. */
function plan(codec) {
  if (codec === 'mp3') return ['mp3', ['-c', 'copy']];
  if (codec === 'aac') return ['m4a', ['-c', 'copy']];
  // wav / flac / anything else: FLAC is lossless, so the samples are identical
  return ['flac', ['-c:a', 'flac']];
}

const mb = (n) => (n / 1048576).toFixed(2);

let total = 0;
const summary = [];

for (const [slug, modName] of themePairs()) {
  const outDir = path.join('public', 'mods', slug, 'music');
  if (!fs.existsSync(path.join('public', 'mods', slug))) continue;

  const mod = findMod(modName);
  if (!mod) {
    console.log(`  ${slug.padEnd(30)} SKIP (${modName} not installed)`);
    continue;
  }
  const tracks = tracksOf(mod.payload);
  if (!tracks.length) {
    console.log(`  ${slug.padEnd(30)} -    (no background_music declared)`);
    continue;
  }

  // the old files are m4a; anything left behind is stale once we write ours
  const old = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
  const fresh = new Set();
  let written = 0;
  let ext = 'mp3';
  const sizes = [];

  tracks.forEach((rel, i) => {
    const src = path.join(mod.dir, rel);
    if (!fs.existsSync(src)) {
      console.log(`  ${slug.padEnd(30)} MISSING ${rel}`);
      return;
    }
    const [container, codecArgs] = plan(codecOf(src));
    ext = container;
    const dest = path.join(outDir, `layer${i + 1}.${ext}`);
    fresh.add(path.basename(dest));
    if (!dry) {
      fs.mkdirSync(outDir, { recursive: true });
      try {
        execFileSync(
          FFMPEG,
          [
            '-y',
            '-loglevel',
            'error',
            '-t',
            String(LOOP),
            '-i',
            src,
            '-vn',
            // no transcode: the container is chosen so the stream can be copied
            ...codecArgs,
            dest,
          ],
          { stdio: ['ignore', 'ignore', 'pipe'] }
        );
        written++;
        sizes.push(fs.statSync(dest).size);
      } catch (e) {
        const msg = String(e.stderr ?? e.message).split('\n').slice(-2).join(' ');
        console.log(`  ${slug.padEnd(30)} FAILED ${rel}: ${msg.slice(0, 110)}`);
      }
    } else {
      written++;
    }
  });

  // drop the mono m4a files this replaces
  if (!dry) {
    for (const f of old) {
      // never delete what this run just wrote — naruto's source is AAC, so its
      // output is also an m4a and the cleanup ate it
      if (/^layer\d+\.m4a$/.test(f) && !fresh.has(f)) fs.rmSync(path.join(outDir, f), { force: true });
    }
  }

  const bytes = sizes.reduce((a, b) => a + b, 0);
  total += bytes;
  summary.push([slug, written, ext]);
  console.log(
    `  ${slug.padEnd(30)} ${written} track${written === 1 ? '' : 's'}  .${ext}  ${mb(bytes)} MB`
  );
}

console.log(`\n  soundtrack total: ${mb(total)} MB`);
console.log('\n  mod-media.ts expects:');
for (const [slug, n, ext] of summary) console.log(`    ${slug.padEnd(30)} ${n}  ${ext}`);
