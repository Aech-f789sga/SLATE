/**
 * What a mod actually has, per theme we can use.
 *
 *   node scripts/mod-assets.mjs            # table
 *   node scripts/mod-assets.mjs --json     # machine-readable
 *
 * Two things the manifest does not tell you, both of which cost real work:
 *
 *  1. A wallpaper node is `{dark, light}` and each side may be a string or an
 *     object with `image` and `first_frame`. The notebook is dark-only now, so
 *     only the dark side matters, and it is usually the animated file.
 *  2. Several mods ship a whole `music/` folder that `background_music` never
 *     declares — Creamy Keyboard, Elden Ring, Hollow Knight, GTA, Black Hole,
 *     Josh Hutcherson, Naruto, Japanese lofi Mix. The soundtrack exists; the
 *     manifest just forgot to mention it. Those are found by reading the folder.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE =
  'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';

const FFMPEG =
  'C:/Users/gamao/AppData/Local/Programs/Python/Python311/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe';

const MOVING = new Set(['webm', 'mp4', 'gif', 'm4v']);
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus']);

const ext = (f) => (f.split('.').pop() ?? '').toLowerCase();
const mb = (n) => +(n / 1024 / 1024).toFixed(1);

/** Duration in seconds, or 0 when ffmpeg cannot say. */
function duration(file) {
  try {
    const out = execFileSync(FFMPEG, ['-i', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return parse(out);
  } catch (e) {
    // ffmpeg exits non-zero when given no output file, but still prints the header
    return parse(String(e.stderr ?? ''));
  }
  function parse(text) {
    const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(text);
    if (!m) return 0;
    return +m[1] * 3600 + +m[2] * 60 + +m[3];
  }
}

function walkAudio(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAudio(p, out);
    else if (AUDIO.has(ext(e.name))) out.push(p);
  }
  return out;
}

/** The dark side of the wallpaper, resolved to a real file. */
function darkVideo(payload, dir) {
  const raw = payload.wallpaper ?? [];
  // `wallpaper` is usually an array of {id, dark, light} but a few mods store a
  // single object instead, so normalise before iterating.
  const list = Array.isArray(raw) ? raw : [raw];
  for (const w of list) {
    const d = w?.dark;
    if (!d) continue;
    const cands =
      typeof d === 'string'
        ? [d]
        : [d.image, d.first_frame, d.video, d.src].filter(Boolean);
    for (const c of cands) {
      if (MOVING.has(ext(c))) {
        const abs = path.join(dir, c);
        if (fs.existsSync(abs)) return { rel: c, abs, size: fs.statSync(abs).size };
      }
    }
  }
  return null;
}

const mods = [];
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

    const declared = new Set(
      (p.background_music ?? []).flatMap((b) => b.tracks ?? []).map((t) => path.normalize(t)),
    );
    const onDisk = walkAudio(dir)
      .filter((f) => {
        const rel = path.normalize(path.relative(dir, f));
        if (/\/(sounds?|sfx|keyboard|sound_html)\//i.test(rel)) return false;
        return fs.statSync(f).size > 300 * 1024;
      })
      .map((f) => ({
        rel: path.relative(dir, f),
        abs: f,
        size: fs.statSync(f).size,
        declared: declared.has(path.normalize(path.relative(dir, f))),
      }));

    mods.push({
      name: p.name || j.name,
      dir,
      video: darkVideo(p, dir),
      music: onDisk,
    });
  }
}

mods.sort((a, b) => a.name.localeCompare(b.name));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(mods, null, 1));
} else {
  for (const m of mods) {
    if (!m.video && !m.music.length) continue;
    console.log(`\n${m.name}`);
    if (m.video) console.log(`  video  ${m.video.rel}  ${mb(m.video.size)} MB`);
    for (const a of m.music) {
      const d = duration(a.abs);
      console.log(
        `  music  ${a.rel.padEnd(34)} ${mb(a.size).toString().padStart(5)} MB  ${d.toFixed(0)}s${a.declared ? '' : '  (undeclared)'}`,
      );
    }
  }
}
