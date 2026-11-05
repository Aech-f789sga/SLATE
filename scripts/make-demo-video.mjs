/**
 * Turn the Playwright capture into a deliverable mp4.
 *
 * Two things happen here that the recorder cannot do:
 *
 *   - a soundtrack. Playwright records the page's pixels, not its audio, and
 *     the ink sounds are the one thing a silent screen recording loses. So the
 *     theme's own track is laid underneath — the mod's original file, the same
 *     one the app plays — looped and faded at both ends.
 *   - a fade in and out, so the video does not start and stop on a hard cut.
 *
 *   node scripts/make-demo-video.mjs [raw.webm] [out.mp4]
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FFMPEG =
  process.env.FFMPEG ||
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';

/** The theme the capture ends on, so the track matches what is on screen. */
const THEME = process.env.THEME || 'anime';
/**
 * Which of the theme's tracks. The playlist beat leaves the board reading
 * "2 / 4", so the bed is track two — a soundtrack that contradicts the frame it
 * is under is worse than no soundtrack.
 */
const TRACK = process.env.TRACK || 'layer2';
const MUSIC = `public/mods/${THEME}/music/${TRACK}.mp3`;

const rawArg = process.argv[2];
const raw =
  rawArg ||
  (() => {
    const dir = '.demo/raw';
    const f = readdirSync(dir).filter((n) => n.endsWith('.webm'));
    return f.length ? join(dir, f[f.length - 1]) : '';
  })();
const out = process.argv[3] || '.demo/slate-showcase.mp4';

if (!raw || !existsSync(raw)) {
  console.error('no recording found in .demo/raw — run scripts/capture-demo.mjs first');
  process.exit(1);
}

/** Duration in seconds, read off the container. `-i` with no output exits 1. */
function duration(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(r.stderr || ''));
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/**
 * How far to lift the bed, in linear gain.
 *
 * The mod tracks are ambient masters and their levels are all over the place:
 * anime's layer1 measures -32.9 dB mean and layer2, the same theme, -22.1 dB.
 * A fixed multiplier tuned on one of them is either inaudible on the other or
 * pinned against the limiter — which is exactly what happened when the
 * soundtrack moved from track one to track two. So the target is fixed and the
 * gain is measured: everything lands at the same bed level, and the limiter is
 * a safety net rather than a working part.
 */
const BED_DB = -19;

function gainTo(file, targetDb) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(r.stderr || ''));
  if (!m) return 2.8; // the old default, if the measurement ever fails
  const g = Math.pow(10, (targetDb - Number(m[1])) / 20);
  return Math.min(6, Math.max(1, g));
}

const dur = duration(raw);
if (!dur) {
  console.error('could not read the duration of', raw);
  process.exit(1);
}

const fadeOut = Math.max(0, dur - 1.1);
const gain = existsSync(MUSIC) ? gainTo(MUSIC, BED_DB) : 1;
if (existsSync(MUSIC)) console.log(`  bed gain ${gain.toFixed(2)}x (${(20 * Math.log10(gain)).toFixed(1)} dB)`);
const args = [
  '-hide_banner',
  '-y',
  '-i',
  raw,
];
if (existsSync(MUSIC)) args.push('-stream_loop', '-1', '-i', MUSIC);
args.push(
  '-filter_complex',
  existsSync(MUSIC)
    ? [
        `[0:v]fade=t=in:st=0:d=0.45,fade=t=out:st=${fadeOut.toFixed(2)}:d=1.0,format=yuv420p[v]`,
        `[1:a]atrim=0:${dur.toFixed(2)},asetpts=N/SR/TB,` +
          // the mod tracks are ambient and sit around -35 dB mean, which reads
          // as silence on a laptop speaker. Lift them and hold the peaks down.
          `volume=2.8,alimiter=limit=0.92,` +
          `afade=t=in:st=0:d=1.6,afade=t=out:st=${(dur - 2.6).toFixed(2)}:d=2.6[a]`,
      ].join(';')
    : `[0:v]fade=t=in:st=0:d=0.45,fade=t=out:st=${fadeOut.toFixed(2)}:d=1.0,format=yuv420p[v]`,
  '-map',
  '[v]'
);
if (existsSync(MUSIC)) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
args.push(
  '-c:v',
  'libx264',
  '-crf',
  '18',
  '-preset',
  'slow',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-r',
  '25',
  out
);

console.log(`${raw}\n  ${dur.toFixed(1)}s${existsSync(MUSIC) ? ` + ${MUSIC}` : ' (no soundtrack found)'}\n-> ${out}`);
const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(String(r.stderr || '').split('\n').slice(-14).join('\n'));
  process.exit(1);
}
console.log('done');
