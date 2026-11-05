/**
 * Put the mods' own still wallpapers in, unmodified.
 *
 * `public/themes/*.jpg` were re-encoded: a 1.3 MB PNG became a 136 KB JPEG, and
 * the picture looked it — JPEG rings around every hard edge, and these wallpapers
 * are flat art with a lot of hard edges.
 *
 * This copies the file the mod ships. No resample, no re-encode, no quality
 * setting: if the mod ships a PNG it stays a PNG, and the extension in
 * `mod-media.ts` follows the file.
 *
 * The mods ship more than one candidate (a dark and a light wallpaper, a mobile
 * crop, a first frame). Picking by name is guesswork — the light one is a
 * different picture, and a first frame can be a frame of the video. So the
 * picker scores every candidate against the JPEG already in the repo: that file
 * is known to be the right picture, and the candidate that resembles it most is
 * the one it was made from.
 *
 *   node scripts/extract-stills.mjs
 *   node scripts/extract-stills.mjs --dry
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const BASE = 'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';
const FFMPEG =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';

const dry = process.argv.includes('--dry');

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
      const nm = (p.name || j.name || '').toLowerCase();
      // the installed mod is "Minecraft Sound: Fireplace" while the theme calls
      // it "Minecraft: Fireplace" — accept a containment match either way
      const want = name.toLowerCase();
      if (nm !== want && !nm.includes(want.split(':')[0]) && !want.includes(nm.split(':')[0])) continue;
      if (!best || ver > best.ver) best = { dir, ver };
    }
  }
  return best;
}

/**
 * Mean PSNR between two images, both squashed to 320x180 first.
 *
 * PSNR is printed on **stderr**, not stdout, so this cannot use execFileSync's
 * return value — that is why the first run scored every candidate at 0.0 dB and
 * decided nothing matched.
 */
function similarity(a, b) {
  const r = spawnSync(
    FFMPEG,
    [
      '-hide_banner',
      '-i',
      a,
      '-i',
      b,
      '-filter_complex',
      '[0:v]scale=320:180:flags=area,format=rgb24[x];[1:v]scale=320:180:flags=area,format=rgb24[y];[x][y]psnr',
      '-frames:v',
      '1',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' }
  );
  const v = /average:([0-9.]+)/.exec(String(r.stderr || ''));
  return v ? Number(v[1]) : 0;
}

function dims(file) {
  try {
    const out = execFileSync(FFMPEG, ['-hide_banner', '-i', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return /\d{3,5}x\d{3,5}/.exec(out)?.[0] ?? '';
  } catch (e) {
    return /\d{3,5}x\d{3,5}/.exec(String(e.stderr || ''))?.[0] ?? '';
  }
}

const mb = (n) => (n / 1048576).toFixed(2);
let total = 0;
const summary = [];

for (const [slug, modName] of themePairs()) {
  const current = ['jpg', 'jpeg', 'png', 'webp']
    .map((e) => `public/themes/${slug}.${e}`)
    .find((p) => fs.existsSync(p));
  if (!current) {
    console.log(`  ${slug.padEnd(30)} SKIP (no theme image in the repo)`);
    continue;
  }
  const mod = findMod(modName);
  if (!mod) {
    console.log(`  ${slug.padEnd(30)} keep .jpg (${modName} not installed)`);
    continue;
  }
  const wp = path.join(mod.dir, 'wallpaper');
  if (!fs.existsSync(wp)) {
    console.log(`  ${slug.padEnd(30)} keep .jpg (no wallpaper folder)`);
    continue;
  }
  const cands = fs
    .readdirSync(wp)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => path.join(wp, f));
  if (!cands.length) {
    console.log(`  ${slug.padEnd(30)} keep .jpg (no stills)`);
    continue;
  }

  let best = null;
  for (const c of cands) {
    const score = similarity(c, current);
    if (!best || score > best.score) best = { file: c, score };
  }
  // A candidate that does not resemble the picture already there is a
  // different picture (the light variant, a mobile crop) — not a source. And a
  // candidate that is smaller than a postage stamp is a thumbnail: Legendary
  // Rift ships a 192x108 first frame, which scores 33 dB against the real
  // wallpaper and would have replaced a 1920x1080 image with a smear.
  if (best && Number(dims(best.file).split('x')[0]) < 1200) {
    console.log(`  ${slug.padEnd(30)} keep .jpg (source is only ${dims(best.file)})`);
    continue;
  }
  if (!best || best.score < 22) {
    console.log(
      `  ${slug.padEnd(30)} keep .jpg (best match ${best ? best.score.toFixed(1) : '-'} dB)`
    );
    continue;
  }

  const ext = path.extname(best.file).slice(1).toLowerCase().replace('jpeg', 'jpg');
  const dest = `public/themes/${slug}.${ext}`;
  const size = fs.statSync(best.file).size;
  if (!dry) {
    fs.copyFileSync(best.file, dest);
    if (current !== dest) fs.rmSync(current, { force: true });
  }
  total += size;
  summary.push([slug, ext]);
  console.log(
    `  ${slug.padEnd(30)} ${path.basename(best.file).padEnd(26)} ${best.score
      .toFixed(1)
      .padStart(5)} dB  ${dims(best.file).padEnd(10)} ${mb(size)} MB`
  );
}

console.log(`\n  stills copied: ${mb(total)} MB`);
console.log('\n  mod-media.ts still paths:');
for (const [slug, ext] of summary) console.log(`    ${slug.padEnd(30)} .${ext}`);
