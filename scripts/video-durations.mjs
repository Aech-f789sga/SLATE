/**
 * Duration and size of every animated wallpaper, so the encoder settings can be
 * chosen from facts rather than guesses.
 *
 *   node scripts/video-durations.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE =
  'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';
const FF =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';
const MOVING = /\.(webm|mp4|m4v)$/i;

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (MOVING.test(e.name)) out.push(p);
  }
  return out;
}

function probe(file) {
  let txt = '';
  try {
    execFileSync(FF, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    txt = String(e.stderr ?? '');
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(txt);
  const dur = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  const dim = /(\d{2,5})x(\d{2,5})/.exec(txt);
  return { dur, dim: dim ? `${dim[1]}x${dim[2]}` : '?' };
}

for (const hash of fs.readdirSync(BASE)) {
  const hd = path.join(BASE, hash);
  if (!fs.statSync(hd).isDirectory()) continue;
  for (const ver of fs.readdirSync(hd)) {
    const dir = path.join(hd, ver);
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
    const name = p.name || j.name;
    for (const f of walk(dir)) {
      const rel = path.relative(dir, f);
      if (/mobile|first_frame/i.test(rel)) continue;
      const { dur, dim } = probe(f);
      const mb = fs.statSync(f).size / 1024 / 1024;
      console.log(
        `${name.padEnd(30)} ${rel.padEnd(32)} ${dur.toFixed(1).padStart(6)}s ${dim.padEnd(10)} ${mb.toFixed(1).padStart(6)} MB`,
      );
    }
  }
}
