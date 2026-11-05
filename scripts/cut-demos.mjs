/** Cut every clip, then tile one frame from each into a review sheet. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FF =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';
const OUT = 'shots/demos';
const DEST = 'public/demos';
fs.mkdirSync(DEST, { recursive: true });
fs.mkdirSync(OUT + '/f', { recursive: true });

const tl = JSON.parse(fs.readFileSync(path.join(OUT, 'timeline-all.json'), 'utf8'));
const even = (n) => Math.round(n / 2) * 2;

const cut = () => {
  for (const c of tl.clips) {
    const [x, y, w, h] = c.crop.map(even);
    if (c.cut == null) { console.log('  SKIP (no marker)', c.key); continue; }
    const lead = c.cut;
    const dur = c.dur + 0.45;
    const dest = path.join(DEST, `${c.key}.mp4`);
    const vf = `crop=${w}:${h}:${x}:${y},scale=660:264:flags=lanczos,fps=24,format=yuv420p`;
    execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', lead.toFixed(3), '-t', dur.toFixed(3), '-i', tl.video,
      '-vf', vf, '-c:v', 'libx264', '-crf', '31', '-preset', 'slow', '-movflags', '+faststart', '-an', dest], { stdio: 'pipe' });
    const kb = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`  ${c.key.padEnd(12)} ${dur.toFixed(2)}s ${kb.padStart(4)} KB`);
  }
};

const sheet = () => {
  const keys = tl.clips.map((c) => c.key);
  for (const c of tl.clips) {
    const src = path.join(DEST, `${c.key}.mp4`);
    const at = Math.max(0.2, c.dur * 0.72).toFixed(2);
    execFileSync(FF, ['-y', '-loglevel', 'error', '-i', src, '-ss', at, '-frames:v', '1', path.join(OUT, 'f', `${c.key}.png`)], { stdio: 'pipe' });
  }
  // 3 x 3, built with hstack/vstack so the tile grid is exact
  const per = 9;
  for (let i = 0; i < keys.length; i += per) {
    const group = keys.slice(i, i + per);
    const args = ['-y', '-loglevel', 'error'];
    for (const k of group) args.push('-i', path.join(OUT, 'f', `${k}.png`));
    while (group.length % 3) { args.push('-i', path.join(OUT, 'f', `${keys[0]}.png`)); group.push(keys[0]); }
    const pre = group.map((_, k) => `[${k}:v]scale=440:176,setsar=1[s${k}]`).join(';');
    const rows = [];
    for (let r = 0; r < group.length / 3; r++) {
      rows.push(`[s${r * 3}][s${r * 3 + 1}][s${r * 3 + 2}]hstack=inputs=3[r${r}]`);
    }
    const stack = rows.join(';') + ';' + rows.map((_, r) => `[r${r}]`).join('') + `vstack=inputs=${rows.length}`;
    execFileSync(FF, [...args, '-filter_complex', `${pre};${stack}`, path.join(OUT, `sheet-${i / per}.png`)], { stdio: 'pipe' });
    console.log('sheet', i / per, keys.slice(i, i + per).join(' '));
  }
};

if (!process.argv.includes('--sheet-only')) cut();
sheet();
