import fs from 'node:fs';
import path from 'node:path';

const ROOT =
  'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';
const out = [];

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
    const name = m.name || '';
    const p = m.mod && m.mod.payload;
    if (!p) continue;
    const music = (p.background_music || []).flatMap((g) => (g.tracks || []).map((t) => t.name || ''));
    const wall = p.wallpaper;
    const wallList = Array.isArray(wall) ? wall : wall ? [wall] : [];
    const srcOf = (w) => {
      const v = w?.dark ?? w?.light;
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') return String(v.url || v.src || '');
      return '';
    };
    out.push({
      name,
      music: music.length,
      tracks: music.slice(0, 2),
      wall: wallList.length,
      hasVideo: wallList.some((w) => /\.(mp4|webm)$/i.test(srcOf(w).split('?')[0])),
      sfx: !!(p.browser_sounds || p.keyboard_sounds),
      dir: path.join(full, ver),
    });
  }
}

out.sort((a, b) => a.name.localeCompare(b.name));
for (const o of out) {
  console.log(
    [o.name.padEnd(34), 'music:' + o.music, o.hasVideo ? 'video' : 'image', o.sfx ? 'sfx' : '---'].join(' | '),
  );
}
console.log('total', out.length);
