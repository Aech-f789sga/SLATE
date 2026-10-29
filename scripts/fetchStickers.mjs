/**
 * Download a curated slice of three open-licence icon sets into public/stickers
 * and write the manifest the picker reads.
 *
 *   node scripts/fetchStickers.mjs
 *
 * This runs once, at authoring time. The SVGs land in the repo, so the app never
 * touches the network to show its built-in stickers, and the PWA works offline.
 * Re-running is safe: existing files are skipped unless --force is passed.
 *
 * Licences:
 *   OpenMoji          CC BY-SA 4.0   https://openmoji.org
 *   Phosphor Icons    MIT            https://phosphoricons.com
 *   Material Symbols  Apache 2.0     https://fonts.google.com/icons
 */

import { mkdir, writeFile, access, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'stickers');
const FORCE = process.argv.includes('--force');

const OPENMOJI_BASE = 'https://cdn.jsdelivr.net/npm/openmoji@15.1.0/color/svg';
const OPENMOJI_INDEX = 'https://cdn.jsdelivr.net/npm/openmoji@15.1.0/data/openmoji.json';
const PHOSPHOR_BASE = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular';
const MATERIAL_BASE = 'https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.28.0/outlined';

/* ---------------------------------------------------------------- */
/* Curation                                                          */
/* ---------------------------------------------------------------- */

/**
 * OpenMoji is picked by keyword against its own index, so we never guess a
 * codepoint. Order matters — the first match for a keyword wins.
 */
const OPENMOJI_SECTIONS = [
  {
    label: 'Office',
    words: [
      'briefcase', 'paperclip', 'pushpin', 'spiral calendar', 'calendar',
      'bar chart', 'chart increasing', 'file folder', 'open file folder',
      'memo', 'clipboard', 'printer', 'envelope', 'telephone receiver',
      'card index', 'card index dividers', 'straight ruler', 'scissors',
      'ledger', 'spiral notepad', 'bookmark tabs', 'label',
    ],
    cap: 14,
  },
  {
    label: 'Study',
    words: [
      'books', 'open book', 'blue book', 'notebook', 'pencil', 'graduation cap',
      'school', 'microscope', 'test tube', 'dna', 'globe', 'abacus',
      'blackboard', 'backpack', 'compass', 'triangular ruler', 'scroll',
    ],
    cap: 14,
  },
  {
    label: 'Music',
    words: [
      'musical note', 'musical notes', 'guitar', 'headphone', 'microphone',
      'musical keyboard', 'drum', 'violin', 'saxophone', 'trumpet', 'radio',
      'optical disc', 'musical score', 'banjo', 'studio microphone',
    ],
    cap: 12,
  },
  {
    label: 'Tech',
    words: [
      'gear', 'wrench', 'hammer', 'screwdriver', 'nut and bolt', 'toolbox',
      'battery', 'electric plug', 'robot', 'satellite', 'chip', 'computer disk',
      'floppy disk', 'laptop', 'keyboard', 'computer mouse', 'clamp', 'ladder',
      'magnet', 'light bulb', 'flashlight', 'electric cable', 'control knobs',
      'joystick',
    ],
    cap: 14,
  },
  {
    label: 'Cute',
    words: [
      'sparkles', 'red heart', 'cherry blossom', 'cat face', 'bear face',
      'panda', 'rabbit face', 'rainbow', 'cloud', 'glowing star', 'butterfly',
      'sun', 'crescent moon', 'four leaf clover', 'mushroom', 'water wave',
    ],
    cap: 14,
  },
  {
    label: 'Fun',
    words: [
      'party popper', 'trophy', 'rocket', 'game die', 'alien', 'ghost',
      'pizza', 'hot beverage', 'birthday cake', 'cookie', 'ice cream',
      'doughnut', 'balloon', 'wrapped gift', 'crown', 'magic wand',
      'crystal ball', 'video game',
    ],
    cap: 14,
  },
];

/**
 * Keyword matching on the OpenMoji index is deliberately loose (it searches tags
 * too, which is how "drum" finds a drumstick), so anything that lands in the
 * wrong section is excluded by name here.
 */
const OPENMOJI_DENY = new Set([
  'poultry leg',
  'chipmunk',
  'face in clouds',
  'saluting face',
  'speech balloon',
  'heart on fire',
  'thought balloon',
  'drumstick',
  'chipmunk',
]);

const PHOSPHOR_SECTIONS = [
  {
    label: 'Office',
    names: [
      'briefcase', 'folder', 'folder-open', 'files', 'file-text', 'file-pdf',
      'paperclip', 'push-pin', 'calendar', 'calendar-check', 'chart-bar',
      'chart-line', 'chart-pie', 'presentation-chart', 'clipboard-text',
      'printer', 'envelope-simple', 'tray', 'archive', 'tag',
    ],
  },
  {
    label: 'Study',
    names: [
      'book', 'book-open', 'books', 'notebook', 'graduation-cap', 'backpack',
      'flask', 'test-tube', 'microscope', 'dna', 'atom', 'planet', 'globe',
      'compass', 'map-trifold', 'calculator', 'math-operations', 'sigma',
      'pencil-simple', 'highlighter-circle', 'ruler', 'scissors',
    ],
  },
  {
    label: 'Tech',
    names: [
      'gear', 'gear-six', 'wrench', 'hammer', 'screwdriver', 'nut', 'pliers',
      'desktop', 'laptop', 'device-mobile', 'keyboard', 'mouse', 'cpu',
      'robot', 'wifi-high', 'plug', 'battery-full', 'code', 'terminal', 'bug',
      'git-branch', 'database', 'cloud-arrow-up', 'lightbulb', 'stack',
    ],
  },
  {
    label: 'Music',
    names: [
      'music-notes', 'music-note', 'headphones', 'microphone', 'guitar',
      'piano-keys', 'speaker-high', 'metronome', 'vinyl-record', 'radio',
      'film-strip', 'video-camera', 'camera',
    ],
  },
  {
    label: 'Fun',
    names: [
      'trophy', 'medal', 'rocket', 'rocket-launch', 'game-controller',
      'dice-five', 'sparkle', 'star', 'heart', 'flower-lotus', 'plant', 'leaf',
      'sun', 'moon', 'cloud', 'lightning', 'fire', 'coffee', 'pizza', 'cookie',
      'cake', 'crown', 'gift', 'magic-wand',
    ],
  },
  {
    label: 'Marks',
    names: [
      'check-circle', 'x-circle', 'arrow-right', 'arrow-up-right',
      'bookmark-simple', 'ticket', 'clock', 'timer', 'hourglass', 'flag',
      'target', 'crosshair', 'magnifying-glass', 'funnel', 'list-checks',
      'note-pencil',
    ],
  },
];

const MATERIAL_SECTIONS = [
  {
    label: 'Office',
    names: [
      'work', 'business_center', 'folder', 'folder_open', 'description',
      'article', 'note', 'sticky_note_2', 'push_pin', 'attach_file',
      'calendar_month', 'event', 'schedule', 'task', 'checklist', 'bar_chart',
      'show_chart', 'pie_chart', 'table_chart', 'insights', 'calculate',
      'functions', 'print', 'mail', 'label', 'bookmark',
    ],
  },
  {
    label: 'Study',
    names: [
      'menu_book', 'auto_stories', 'school', 'workspace_premium', 'backpack',
      'science', 'biotech', 'microscope', 'architecture', 'straighten',
      'square_foot', 'edit', 'edit_note', 'draw', 'brush', 'palette',
      'format_paint', 'colorize', 'percent', 'timeline',
    ],
  },
  {
    label: 'Tech',
    names: [
      'engineering', 'construction', 'handyman', 'build', 'settings',
      'precision_manufacturing', 'memory', 'computer', 'laptop_mac',
      'keyboard', 'mouse', 'wifi', 'battery_full', 'power', 'bolt',
      'lightbulb', 'smart_toy', 'router', 'code', 'terminal', 'bug_report',
      'database', 'cloud_upload', 'package_2', 'inventory_2', 'grid_view',
      'dashboard',
    ],
  },
  {
    label: 'Music',
    names: [
      'music_note', 'library_music', 'headphones', 'mic', 'piano',
      'graphic_eq', 'movie', 'photo_camera', 'videocam',
    ],
  },
  {
    label: 'Fun',
    names: [
      'celebration', 'emoji_events', 'rocket_launch', 'sports_esports',
      'casino', 'favorite', 'star', 'auto_awesome', 'local_cafe',
      'local_pizza', 'cake', 'cookie', 'park', 'eco', 'pets',
    ],
  },
  {
    label: 'Marks',
    names: [
      'check_circle', 'cancel', 'arrow_forward', 'north_east',
      'confirmation_number', 'timer', 'hourglass_bottom', 'flag',
      'flag_circle', 'target', 'search', 'filter_alt', 'fact_check',
      'upload_file', 'notification_important', 'priority_high',
    ],
  },
];

/* ---------------------------------------------------------------- */
/* Plumbing                                                          */
/* ---------------------------------------------------------------- */

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const title = (s) =>
  s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bGps\b/g, 'GPS')
    .replace(/\bDna\b/g, 'DNA')
    .replace(/\bPdf\b/g, 'PDF')
    .replace(/\bCpu\b/g, 'CPU');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.text();
}

async function save(dir, file, svg) {
  const p = join(dir, file);
  if (!FORCE && (await exists(p))) return true;
  await mkdir(dir, { recursive: true });
  await writeFile(p, svg, 'utf8');
  return true;
}

/** Fetch with a small concurrency window so we do not hammer the CDN. */
async function pool(jobs, width = 8) {
  let i = 0;
  const out = new Array(jobs.length);
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (i < jobs.length) {
        const at = i++;
        out[at] = await jobs[at]();
      }
    }),
  );
  return out;
}

/* ---------------------------------------------------------------- */
/* Packs                                                             */
/* ---------------------------------------------------------------- */

async function buildOpenMoji() {
  console.log('OpenMoji: reading index…');
  const raw = await get(OPENMOJI_INDEX);
  if (!raw) throw new Error('cannot reach the OpenMoji index');
  const all = JSON.parse(raw);
  const hay = (e) => `${e.annotation} ${e.tags}`.toLowerCase();

  const used = new Set();
  const sections = [];
  const jobs = [];

  for (const sec of OPENMOJI_SECTIONS) {
    const picked = [];
    for (const w of sec.words) {
      if (picked.length >= sec.cap) break;
      const hits = all
        .filter(
          (e) => !used.has(e.hexcode) && !OPENMOJI_DENY.has(e.annotation) && hay(e).includes(w),
        )
        .sort((a, b) => Number(b.annotation.startsWith(w)) - Number(a.annotation.startsWith(w)));
      const hit = hits[0];
      if (!hit) continue;
      used.add(hit.hexcode);
      picked.push(hit);
      jobs.push(async () => {
        const svg = await get(`${OPENMOJI_BASE}/${hit.hexcode}.svg`);
        if (!svg) return null;
        await save(join(OUT, 'openmoji'), `${hit.hexcode}.svg`, svg);
        return { file: `${hit.hexcode}.svg`, label: title(hit.annotation) };
      });
    }
    sections.push({ label: sec.label, items: picked.length });
  }

  const items = await pool(jobs);
  let at = 0;
  const built = sections.map((s) => {
    const mine = items.slice(at, at + s.items).filter(Boolean);
    at += s.items;
    return { label: s.label, items: mine };
  });

  return { id: 'openmoji', label: 'OpenMoji', sections: built };
}

async function buildNamed(id, label, base, sections) {
  const jobs = [];
  const shape = [];
  for (const sec of sections) {
    const mine = [];
    for (const name of sec.names) {
      jobs.push(async () => {
        const svg = await get(`${base}/${name}.svg`);
        if (!svg) return null;
        await save(join(OUT, id), `${name}.svg`, svg);
        return { file: `${name}.svg`, label: title(name) };
      });
      mine.push(name);
    }
    shape.push({ label: sec.label, count: mine.length });
  }
  const items = await pool(jobs);
  let at = 0;
  const built = shape.map((s) => {
    const mine = items.slice(at, at + s.count).filter(Boolean);
    at += s.count;
    return { label: s.label, items: mine };
  });
  return { id, label, sections: built };
}

/* ---------------------------------------------------------------- */
/* Main                                                              */
/* ---------------------------------------------------------------- */

const packs = [];
packs.push(await buildOpenMoji());
packs.push(await buildNamed('phosphor', 'Phosphor', PHOSPHOR_BASE, PHOSPHOR_SECTIONS));
packs.push(await buildNamed('material', 'Material', MATERIAL_BASE, MATERIAL_SECTIONS));

for (const p of packs) {
  const n = p.sections.reduce((a, s) => a + s.items.length, 0);
  console.log(`${p.label.padEnd(10)} ${String(n).padStart(4)} icons in ${p.sections.length} sections`);
  for (const s of p.sections) console.log(`   ${s.label.padEnd(10)} ${s.items.length}`);
}

/* Drop artwork that no longer appears in the manifest, so changing the curation
 * does not silently leave dead files in the bundle. */
let pruned = 0;
for (const p of packs) {
  const keep = new Set(p.sections.flatMap((s) => s.items.map((i) => i.file)));
  let names = [];
  try {
    names = await readdir(join(OUT, p.id));
  } catch {
    continue;
  }
  for (const n of names) {
    if (n.endsWith('.svg') && !keep.has(n)) {
      await unlink(join(OUT, p.id, n));
      pruned++;
    }
  }
}
if (pruned) console.log(`pruned ${pruned} unused file(s)`);

const ts = `/**
 * GENERATED by scripts/fetchStickers.mjs — do not edit by hand.
 *
 * Built-in sticker packs. The SVGs live in public/stickers/<pack>/<file> and are
 * served as static assets, so the picker works with no network at all.
 *
 *   OpenMoji          CC BY-SA 4.0  https://openmoji.org
 *   Phosphor Icons    MIT           https://phosphoricons.com
 *   Material Symbols  Apache 2.0    https://fonts.google.com/icons
 */

export interface PackItem {
  file: string;
  label: string;
}

export interface PackSection {
  label: string;
  items: PackItem[];
}

export interface StickerPack {
  id: string;
  label: string;
  sections: PackSection[];
}

export const PACKS: StickerPack[] = ${JSON.stringify(packs, null, 2)};
`;

await writeFile(join(ROOT, 'src', 'stickerPacks.ts'), ts, 'utf8');

const credits = `Sticker artwork bundled with Inkpad
===================================

OpenMoji — https://openmoji.org
  Licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)
  Copyright the OpenMoji authors. Colour SVG set, version 15.1.0.

Phosphor Icons — https://phosphoricons.com
  Licensed under the MIT License.
  Copyright (c) 2020 Phosphor Icons.

Material Symbols — https://fonts.google.com/icons
  Licensed under the Apache License, Version 2.0.
  Copyright Google LLC.

These files are redistributed unmodified. The Inkpad sticker picker loads them
from /stickers/ and rasterises them client-side onto the page.
`;
await writeFile(join(OUT, 'LICENSES.txt'), credits, 'utf8');

console.log('\nwrote src/stickerPacks.ts and public/stickers/LICENSES.txt');
