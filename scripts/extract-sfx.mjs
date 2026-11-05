/**
 * Pull a GX mod's interface sounds out of the installed mod and lay them down
 * under `public/mods/<slug>/sfx/` in the shape the audio engine expects.
 *
 *   node scripts/extract-sfx.mjs "<Mod Name>" <slug>
 *
 * A mod does not describe its sounds as "hover" and "click". It describes them
 * as *moments in the browser*: `HOVER`, `CLICK`, `SWITCH_TOGGLE`, `TAB_INSERT`,
 * `TAB_CLOSE`, `TYPING_LETTER`, and about eight more this notebook has no
 * equivalent for. So the mapping from their vocabulary to ours is written down
 * once, here, instead of being guessed ten times in the media table.
 *
 * The files are already small mp3s, so they are copied rather than re-encoded;
 * only the ones we actually use are copied, which keeps a mod's payload from
 * landing in the repo wholesale.
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE =
  'C:/Users/gamao/AppData/Roaming/Opera Software/Opera GX Stable/Default/Extensions';

/**
 * Our slot -> the mod's keys, most preferred first.
 *
 * The first entry is the mod's *own* sound for that moment. Anything after it
 * is a stand-in for mods that do not ship the moment at all — Capybara Party,
 * for one, has no click and no toggle, only hover and tab open/close. A
 * substitute is better than a hole: the panel offers "interface sounds" as one
 * switch, so a mod missing two of five slots would feel broken rather than
 * minimal. The extractor prints which ones were substituted.
 */
const SLOTS = {
  hover: ['HOVER'],
  click: ['CLICK', 'IMPORTANT_CLICK', 'TAB_INSERT', 'HOVER'],
  toggle: ['SWITCH_TOGGLE', 'FEATURE_SWITCH_ON', 'LIMITER_ON', 'CLICK', 'TAB_INSERT'],
  tab: ['TAB_INSERT', 'LEVEL_UPGRADE'],
  close: ['TAB_CLOSE', 'TAB_SLASH'],
};

/** Find the newest installed copy of a mod by its payload name. */
function findMod(name) {
  let best = null;
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
      if ((p.name || j.name) !== name) continue;
      if (!best || ver > best.ver) best = { dir, ver, payload: p };
    }
  }
  return best;
}

/** The mod stores `sounds` inside a one-element array of sound sets. */
function soundMap(list) {
  if (!Array.isArray(list) || !list.length) return {};
  return list[0]?.sounds ?? {};
}

const [name, slug] = process.argv.slice(2);
if (!name || !slug) {
  console.error('usage: node scripts/extract-sfx.mjs "<Mod Name>" <slug>');
  process.exit(1);
}

const mod = findMod(name);
if (!mod) {
  console.error(`no installed mod named "${name}"`);
  process.exit(1);
}

const browser = soundMap(mod.payload.browser_sounds);
const keyboard = soundMap(mod.payload.keyboard_sounds);

const outDir = path.join('public', 'mods', slug, 'sfx');
fs.mkdirSync(outDir, { recursive: true });

/** Copy the first key that exists; returns true when a slot was filled. */
function take(slot, keys) {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const rel = browser[key]?.[0];
    if (!rel) continue;
    const src = path.join(mod.dir, rel);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(outDir, `${slot}.mp3`));
    const kb = (fs.statSync(src).size / 1024).toFixed(0);
    const note = i === 0 ? '' : '  (stand-in)';
    console.log(`  ${slot.padEnd(7)} <- ${rel} (${kb} KB)${note}`);
    return true;
  }
  return false;
}

let filled = 0;
for (const [slot, keys] of Object.entries(SLOTS)) {
  if (take(slot, keys)) filled++;
}

// The keystroke pool: every letter sample the mod ships, so a run of typing
// does not sound like one key held down.
const letters = (keyboard.TYPING_LETTER ?? []).filter((rel) =>
  fs.existsSync(path.join(mod.dir, rel)),
);
letters.forEach((rel, i) => {
  fs.copyFileSync(path.join(mod.dir, rel), path.join(outDir, `key${i + 1}.mp3`));
});
if (letters.length) console.log(`  keys    <- ${letters.length} letter samples`);

console.log(`${name} -> ${outDir}: ${filled}/5 slots, ${letters.length} keys`);
