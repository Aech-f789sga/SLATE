import fs from 'node:fs';
import path from 'node:path';
const BASE = 'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';
const want = process.argv.slice(2);
for (const hash of fs.readdirSync(BASE)) {
  const hd = path.join(BASE, hash);
  if (!fs.statSync(hd).isDirectory()) continue;
  for (const ver of fs.readdirSync(hd)) {
    const dir = path.join(hd, ver);
    const mf = path.join(dir, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    let j; try { j = JSON.parse(fs.readFileSync(mf,'utf8')); } catch { continue; }
    const p = j?.mod?.payload; if (!p) continue;
    const name = p.name || j.name;
    if (want.length && !want.includes(name)) continue;
    console.log('=== ' + name);
    console.log(JSON.stringify(p.wallpaper, null, 1).slice(0, 1400));
  }
}
