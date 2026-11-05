/**
 * Read every installed GX mod properly and say what it actually ships.
 *
 *   node scripts/scan-mods-deep.mjs            # summary table
 *   node scripts/scan-mods-deep.mjs --files    # plus every wallpaper file
 *
 * The first scan only counted music tracks and asked whether a wallpaper was a
 * "video/image", which was too coarse: several mods ship an animated wallpaper
 * whose *still* is the only thing the notebook currently uses, and the earlier
 * pass could not tell an mp4 from a jpg. This one resolves the actual file
 * behind each wallpaper and reports its extension, so "does this mod have a
 * live wallpaper" is a fact rather than a guess.
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE =
  'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';

const MOVING = new Set(['webm', 'mp4', 'gif', 'webp', 'apng', 'm4v']);
const still = new Set(['jpg', 'jpeg', 'png', 'webp']);

/** Every string that could be a file path inside a wallpaper node. */
function walkPaths(node, out = []) {
  if (!node) return out;
  if (typeof node === 'string') {
    if (/\.(webm|mp4|gif|webp|png|jpe?g|m4v)$/i.test(node)) out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) walkPaths(n, out);
    return out;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) walkPaths(v, out);
  }
  return out;
}

function collect() {
  const mods = [];
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

      const music = (p.background_music ?? []).flatMap((b) =>
        (b.tracks ?? []).map((t) => ({ set: b.name ?? '', file: t })),
      );

      const wallPaths = walkPaths(p.wallpaper ?? []);
      const moving = wallPaths.filter((f) => MOVING.has(ext(f)));
      const stills = wallPaths.filter((f) => still.has(ext(f)));

      mods.push({
        name: p.name || j.name,
        dir,
        ver,
        music,
        moving,
        stills,
        hasBrowser: !!p.browser_sounds,
        hasKeys: !!p.keyboard_sounds,
        wall: p.wallpaper,
      });
    }
  }
  return mods;
}

const ext = (f) => (f.split('.').pop() ?? '').toLowerCase();

const mods = collect().sort((a, b) => a.name.localeCompare(b.name));
const showFiles = process.argv.includes('--files');

console.log(
  `${'MOD'.padEnd(34)} ${'MUSIC'.padEnd(16)} ${'MOVING WALLPAPER'.padEnd(28)} SFX`,
);
console.log('-'.repeat(96));

for (const m of mods) {
  const layers = m.music.length;
  const stems = layers
    ? `${layers} × ${ext(m.music[0].file)}`
    : 'none';
  const mv = m.moving.length
    ? `${m.moving.length} × ${[...new Set(m.moving.map(ext))].join('/')}`
    : '—';
  const sfx = [m.hasBrowser ? 'browser' : '', m.hasKeys ? 'keys' : '']
    .filter(Boolean)
    .join('+') || '—';
  console.log(
    `${m.name.slice(0, 34).padEnd(34)} ${stems.padEnd(16)} ${mv.padEnd(28)} ${sfx}`,
  );
  if (showFiles && m.moving.length) {
    for (const f of m.moving) {
      const abs = path.join(m.dir, f);
      const kb = fs.existsSync(abs) ? (fs.statSync(abs).size / 1024).toFixed(0) : 'MISSING';
      console.log(`      ${f}  (${kb} KB)`);
    }
  }
}

const withVideo = mods.filter((m) => m.moving.length);
const withMusic = mods.filter((m) => m.music.length);
console.log(
  `\n${mods.length} mods · ${withVideo.length} with a moving wallpaper · ${withMusic.length} with music`,
);
console.log(`moving: ${withVideo.map((m) => m.name).join(', ')}`);
