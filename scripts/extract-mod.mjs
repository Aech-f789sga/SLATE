/**
 * Pull a mod's soundtrack out of the Opera GX extension folder and into
 * public/mods, as loopable excerpts.
 *
 * The mods ship full-length stems (three to five minutes, ~2 MB each). A
 * wallpaper soundtrack loops, so ninety seconds at 64 kbps mono is the useful
 * part of the file and a fifth of the weight. The stems keep their order, so
 * the layer engine still fades them individually.
 *
 *   node scripts/extract-mod.mjs "Anime" anime
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FFMPEG =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';
const ROOT =
  'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';
const SECONDS = process.argv[4] || '90';

const [wantName, slug] = process.argv.slice(2);
if (!wantName || !slug) {
  console.error('usage: node scripts/extract-mod.mjs "<Mod Name>" <slug> [seconds]');
  process.exit(1);
}

function findMod(name) {
  for (const dir of fs.readdirSync(ROOT)) {
    const full = path.join(ROOT, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const ver of fs.readdirSync(full)) {
      const mf = path.join(full, ver, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      let m;
      try {
        m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      } catch {
        continue;
      }
      if (m.name === name) return { base: path.join(full, ver), payload: m.mod?.payload || {} };
    }
  }
  return null;
}

const mod = findMod(wantName);
if (!mod) {
  console.error('mod not found:', wantName);
  process.exit(1);
}

const tracks = (mod.payload.background_music || []).flatMap((g) => g.tracks || []);
if (!tracks.length) {
  console.error('no background_music in', wantName);
  process.exit(1);
}

const outDir = path.join('public', 'mods', slug, 'music');
fs.mkdirSync(outDir, { recursive: true });

const rows = [];
tracks.forEach((rel, i) => {
  const src = path.join(mod.base, rel);
  if (!fs.existsSync(src)) {
    rows.push(`${rel}: MISSING`);
    return;
  }
  const out = path.join(outDir, `layer${i + 1}.m4a`);
  execFileSync(
    FFMPEG,
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', src,
      '-t', SECONDS,
      '-vn',
      '-ac', '1',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-movflags', '+faststart',
      out,
    ],
    { stdio: 'inherit' },
  );
  const kb = Math.round(fs.statSync(out).size / 1024);
  rows.push(`layer${i + 1}.m4a  ${kb} KB`);
});

console.log(`${wantName} -> ${outDir}`);
rows.forEach((r) => console.log('  ' + r));
