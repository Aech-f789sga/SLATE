/** Score every clip by how much the picture changes from start to end. */
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const FF =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';
const tl = JSON.parse(fs.readFileSync('shots/demos/timeline-all.json', 'utf8'));
fs.mkdirSync('shots/demos/cmp', { recursive: true });

for (const c of tl.clips) {
  const src = `public/demos/${c.key}.mp4`;
  const dur = c.dur + 0.45;
  const a = `shots/demos/cmp/${c.key}-a.png`;
  const b = `shots/demos/cmp/${c.key}-b.png`;
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', src, '-ss', '0.12', '-frames:v', '1', a]);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', src, '-ss', String(Math.max(0.3, dur - 0.25)), '-frames:v', '1', b]);
  let psnr = 0;
  const r = spawnSync(FF, ['-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = String(r.stderr || '');
  const m = txt.match(/average:([\d.]+|inf)/);
  psnr = m ? (m[1] === 'inf' ? 99 : Number(m[1])) : 0;
  const flag = psnr > 40 ? 'STATIC' : psnr > 30 ? 'weak  ' : 'ok    ';
  console.log(`${flag} ${c.key.padEnd(12)} psnr ${String(psnr).padStart(6)}`);
}
