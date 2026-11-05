/**
 * Find the marker frame each clip starts after.
 *
 * The recorder paints a full-viewport block of rgb(i*6, 255, 0) for ~160 ms
 * before every clip. Decoding the capture to 8x8 thumbnails makes those frames
 * unmissable, and gives an exact cut point that does not depend on the wall
 * clock (which drifts badly while a live wallpaper is decoding).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const FF =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';

export function detect(video, fps = 25) {
  return new Promise((resolve, reject) => {
    const p = spawn(FF, ['-v', 'error', '-i', video, '-vf', `fps=${fps},scale=8:8:flags=area,format=rgb24`, '-f', 'rawvideo', '-']);
    const chunks = [];
    p.stdout.on('data', (b) => chunks.push(b));
    p.stderr.on('data', (b) => process.stderr.write(b));
    p.on('error', reject);
    p.on('close', () => {
      const buf = Buffer.concat(chunks);
      const n = 8 * 8 * 3;
      const total = Math.floor(buf.length / n);
      const hits = [];
      for (let f = 0; f < total; f++) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < 64; i++) {
          r += buf[f * n + i * 3];
          g += buf[f * n + i * 3 + 1];
          b += buf[f * n + i * 3 + 2];
        }
        r /= 64; g /= 64; b /= 64;
        // saturated green-to-yellow with almost no blue; the red channel is the clip index
        if (g > 235 && b < 25) hits.push({ f, r: Math.round(r), idx: Math.round(r / 6) });
      }
      resolve({ total, hits, fps });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('detect-markers.mjs')) {
  const tl = JSON.parse(fs.readFileSync('shots/demos/timeline-all.json', 'utf8'));
  const res = await detect(tl.video);
  console.log('frames', res.total, 'marker frames', res.hits.length);
  // group consecutive frames, one group per marker
  const groups = [];
  for (const h of res.hits) {
    const last = groups[groups.length - 1];
    if (last && h.f - last.end <= 2 && h.idx === last.idx) last.end = h.f;
    else groups.push({ start: h.f, end: h.f, idx: h.idx });
  }
  const byIdx = new Map(groups.map((g) => [g.idx, g]));
  const out = tl.clips.map((c, i) => {
    const g = byIdx.get(i);
    const t = g ? (g.end + 1) / res.fps + 0.1 : null;
    console.log(c.key.padEnd(12), g ? `marker#${g.idx} ${g.start}-${g.end} -> cut at ${t.toFixed(3)}` : 'NO MARKER');
    return { ...c, cut: t };
  });
  fs.writeFileSync(path.join('shots/demos', 'timeline-all.json'), JSON.stringify({ ...tl, clips: out }, null, 2));
  const missing = out.filter((c) => c.cut == null).map((c) => c.key);
  if (missing.length) console.log('missing:', missing.join(' '));
}
