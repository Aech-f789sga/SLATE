/**
 * Opera GX themes.
 *
 * The palettes and wallpapers here are lifted from the mods installed in the
 * user's own Opera GX profile. A GX mod describes its colours as two HSL
 * anchors — `gx_accent` (the highlight) and `gx_secondary_base` (the surface
 * tint) — one pair for the dark UI and one for the light UI, plus a wallpaper.
 * That is exactly enough to re-skin a notebook: every surface in this app is
 * already painted from six CSS variables.
 *
 * The wallpaper lives on the shelf, not on the page: paper is the content and a
 * picture behind it would be in the way. The palette, on the other hand, is
 * applied everywhere.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface GxTheme {
  id: string;
  name: string;
  /** The mod this came from. */
  mod: string;
  /** Wallpaper under /public, or null for a flat gradient. */
  wall: string | null;
  dark: { acc: [number, number, number]; sec: [number, number, number] };
  light: { acc: [number, number, number]; sec: [number, number, number] };
}

/* ------------------------------------------------------------------ */
/* Feel — what a mod does to the shape of the interface                */
/* ------------------------------------------------------------------ */

/**
 * A GX mod is more than a wallpaper: it also decides whether buttons are
 * rounded or squared off, how heavy a border is, whether labels shout in
 * capitals, and how thick an icon's stroke runs. Those are the choices that
 * make two mods with the same colours feel like different products.
 *
 * They are expressed as a preset rather than per-theme numbers because most
 * mods in a family agree on the shape language, and a preset is the thing you
 * can actually tune without touching twenty-four objects.
 */
export interface GxFeel {
  /** Corner radius for controls — buttons, fields, chips. */
  r: number;
  /** Corner radius for containers — cards, dialogs. */
  r2: number;
  /** Border thickness in px. */
  bd: number;
  /** Chrome font stack. Paper keeps its own. */
  font: string;
  /** Letter spacing on chrome labels, in em. */
  ls: number;
  /** Do small labels sit in capitals? */
  caps: boolean;
  /** SVG stroke width, in viewBox units (icons are drawn on a 24 grid). */
  iw: number;
  /** SVG stroke cap and join. */
  cap: 'round' | 'square' | 'butt';
  /** 0–1: how far idle icons drift toward the accent instead of the text colour. */
  tint: number;
}

const FEEL: Record<string, GxFeel> = {
  /** The app's own voice: neutral, quiet, nothing to notice. */
  paper: {
    r: 10, r2: 16, bd: 1,
    // spelled out rather than `inherit`: a custom property set to a CSS-wide
    // keyword resolves to nothing, and the rule that consumes it then dies
    font: '-apple-system,"Segoe UI",Roboto,sans-serif', ls: 0, caps: false,
    iw: 1.7, cap: 'round', tint: 0,
  },
  /** Big radii, soft faces — the plush end of the mod catalogue. */
  soft: {
    r: 15, r2: 22, bd: 1,
    font: '"Nunito","Quicksand",ui-rounded,system-ui,sans-serif',
    ls: 0, caps: false, iw: 1.9, cap: 'round', tint: 0.2,
  },
  /** Voxel mods: nearly square, doubled borders, chunky strokes. */
  block: {
    r: 3, r2: 6, bd: 2,
    font: '"Lucida Console",ui-monospace,monospace',
    ls: 0.04, caps: true, iw: 2.4, cap: 'square', tint: 0,
  },
  /** Terminal mods: tight radii, mono type, hairline strokes. */
  mono: {
    r: 4, r2: 8, bd: 1,
    font: 'ui-monospace,"JetBrains Mono","SF Mono",monospace',
    ls: 0.05, caps: true, iw: 1.55, cap: 'butt', tint: 0.3,
  },
  /** Fantasy mods: square corners, serif capitals, engraved weight. */
  serif: {
    r: 2, r2: 5, bd: 1,
    font: '"Iowan Old Style",Palatino,"Book Antiqua",Georgia,serif',
    ls: 0.06, caps: true, iw: 1.5, cap: 'round', tint: 0.15,
  },
  /** Anime mods: round, airy, slightly wider tracking. */
  anime: {
    r: 14, r2: 20, bd: 1,
    font: '"Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif',
    ls: 0.02, caps: false, iw: 1.8, cap: 'round', tint: 0.28,
  },
  /** Film and game mods: flat panels, condensed tracking, no softness. */
  cinema: {
    r: 5, r2: 9, bd: 1,
    font: '"Helvetica Neue",Arial,system-ui,sans-serif',
    ls: 0.07, caps: true, iw: 1.6, cap: 'butt', tint: 0.12,
  },
};

export type FeelKey = keyof typeof FEEL;

export const FEEL_LABEL: Record<FeelKey, string> = {
  paper: 'Neutral',
  soft: 'Soft',
  block: 'Voxel',
  mono: 'Terminal',
  serif: 'Fantasy',
  anime: 'Anime',
  cinema: 'Cinematic',
};

export function feelOf(id: string): GxFeel {
  return FEEL[FEEL_BY_THEME[id]] || FEEL.paper;
}

/* ------------------------------------------------------------------ */
/* Sound — what a mod does to your ears                                */
/* ------------------------------------------------------------------ */

/**
 * GX mods ship sound packs: a click, a hover, a keystroke. We cannot copy the
 * audio (the mod files are gone), but a click is a short transient — a body
 * oscillator plus a filtered noise burst — and those six numbers are enough to
 * rebuild the *character* of each pack rather than its exact waveform.
 *
 * `f`→`f2` is the pitch glide, `d` the decay, `g` the peak gain, `n` how much
 * noise is mixed in, `q` the noise band. `ty` enables keystroke ticks, which
 * only some mods have.
 */
export interface GxSnd {
  w: OscillatorType;
  f: number;
  f2: number;
  d: number;
  g: number;
  n: number;
  q: number;
  ty: boolean;
}

const SND: Record<string, GxSnd> = {
  /** Neutral plastic click. */
  tick: { w: 'sine', f: 900, f2: 700, d: 0.07, g: 0.1, n: 0.12, q: 1.2, ty: false },
  /** Wooden knock with a paper tail — the Minecraft end of the catalogue. */
  wood: { w: 'triangle', f: 340, f2: 185, d: 0.11, g: 0.17, n: 0.5, q: 1.1, ty: true },
  /** A struck bell that rings on after you let go. */
  bell: { w: 'sine', f: 640, f2: 615, d: 0.52, g: 0.1, n: 0.06, q: 0.8, ty: false },
  /** Plucked string — lutes, kotos, and ninja mods. */
  pluck: { w: 'triangle', f: 700, f2: 300, d: 0.18, g: 0.13, n: 0.1, q: 1.4, ty: false },
  /** Terminal blip: square, short, no tail. */
  digital: { w: 'square', f: 1400, f2: 980, d: 0.05, g: 0.06, n: 0.05, q: 2, ty: true },
  /** Sub-bass thump for the void-dwellers. */
  sub: { w: 'sine', f: 110, f2: 52, d: 0.3, g: 0.2, n: 0.3, q: 0.7, ty: false },
  /** Bright two-tone chirp. */
  chime: { w: 'triangle', f: 1100, f2: 1620, d: 0.1, g: 0.075, n: 0.03, q: 1, ty: false },
  /** Muted tape hiss under a soft tone. */
  lofi: { w: 'triangle', f: 480, f2: 330, d: 0.17, g: 0.1, n: 0.24, q: 0.9, ty: true },
  /** Brassy stab with a little grit. */
  brass: { w: 'sawtooth', f: 300, f2: 240, d: 0.13, g: 0.075, n: 0.16, q: 1.6, ty: false },
  /** Chiptune square, held flat — 8-bit, no glide. */
  chip: { w: 'square', f: 440, f2: 440, d: 0.06, g: 0.065, n: 0.02, q: 1, ty: true },
  /** Barely there. */
  soft: { w: 'sine', f: 620, f2: 600, d: 0.09, g: 0.07, n: 0.08, q: 1, ty: false },
};

export type SndKey = keyof typeof SND;

export const SND_LABEL: Record<SndKey, string> = {
  tick: 'plastic click',
  wood: 'wood knock',
  bell: 'struck bell',
  pluck: 'plucked string',
  digital: 'terminal blip',
  sub: 'sub thump',
  chime: 'bright chirp',
  lofi: 'tape hiss',
  brass: 'brass stab',
  chip: '8-bit blip',
  soft: 'soft tick',
};

export function sndOf(id: string): GxSnd {
  return SND[SND_BY_THEME[id]] || SND.tick;
}

/** Per-theme shape language, keyed by theme id. */
export const FEEL_BY_THEME: Record<string, FeelKey> = {
  slate: 'paper',
  'day-one': 'paper',
  msi: 'mono',
  cyberdeck: 'mono',
  'minecraft-sound-fireplace': 'block',
  // LoFi is a soft room, not a film title card: rounded controls, no capitals.
  'lofi-chill': 'soft',
  'grand-theft-auto-san-andreas': 'cinema',
  blockified: 'block',
  'violet-nebula': 'soft',
  anime: 'anime',
  'monkey-rizz': 'block',
  'the-traveller': 'soft',
  cozy: 'soft',
  'creamy-keyboard': 'soft',
  'hollow-knight': 'serif',
  'elden-ring': 'serif',
  'japanese-lofi-mix': 'cinema',
  horror: 'cinema',
  'black-hole': 'mono',
  'josh-hutcherson': 'soft',
  'spaced-out': 'mono',
  medieval: 'serif',
  'legendary-rift': 'serif',
  'naruto-itachi-uchiha': 'anime',
  'capybara-party': 'soft',
};

/** Per-theme sound pack, keyed by theme id. */
export const SND_BY_THEME: Record<string, SndKey> = {
  slate: 'tick',
  'day-one': 'chime',
  msi: 'digital',
  cyberdeck: 'digital',
  'minecraft-sound-fireplace': 'wood',
  'lofi-chill': 'lofi',
  'grand-theft-auto-san-andreas': 'brass',
  blockified: 'chip',
  'violet-nebula': 'soft',
  anime: 'chime',
  'monkey-rizz': 'chip',
  'the-traveller': 'soft',
  cozy: 'chime',
  'creamy-keyboard': 'wood',
  'hollow-knight': 'bell',
  'elden-ring': 'bell',
  'japanese-lofi-mix': 'lofi',
  horror: 'sub',
  'black-hole': 'sub',
  'josh-hutcherson': 'soft',
  'spaced-out': 'digital',
  medieval: 'pluck',
  'legendary-rift': 'brass',
  'naruto-itachi-uchiha': 'pluck',
  'capybara-party': 'chime',
};

/** The app's own palette, kept as a first-class choice. */
export const SLATE_THEME: GxTheme = {
  id: 'slate',
  name: 'Slate',
  mod: 'Built in',
  wall: null,
  dark: { acc: [222, 100, 68], sec: [228, 10, 10] },
  light: { acc: [222, 88, 55], sec: [220, 14, 94] },
};

export const GX_THEMES: GxTheme[] = [
  { id: 'day-one', name: 'Day One', mod: 'Day One', wall: '/themes/day-one.jpg', dark: { acc: [76, 100, 75], sec: [230, 13, 16] }, light: { acc: [92, 90, 39], sec: [62, 19, 67] } },
  { id: 'msi', name: 'MSI', mod: 'MSI', wall: '/themes/msi.jpg', dark: { acc: [356, 94, 45], sec: [0, 0, 16] }, light: { acc: [356, 96, 45], sec: [0, 0, 88] } },
  // Cyberdeck is a neon skyline: magenta signage, cyan glass, violet haze.
  { id: 'cyberdeck', name: 'Cyberdeck', mod: 'Cyberdeck', wall: '/themes/cyberdeck.jpg', dark: { acc: [326, 100, 62], sec: [264, 42, 10] }, light: { acc: [326, 88, 46], sec: [264, 26, 92] } },
  // Minecraft: Fireplace is a lit hearth — ember orange on dark oak.
  { id: 'minecraft-sound-fireplace', name: 'Minecraft Sound: Fireplace', mod: 'Minecraft Sound: Fireplace', wall: '/themes/minecraft-sound-fireplace.jpg', dark: { acc: [28, 100, 55], sec: [22, 42, 9] }, light: { acc: [22, 92, 40], sec: [34, 40, 86] } },
  // LoFi Chill is a sunset room: dusty rose walls, coral light, teal plants.
  // The accent is the coral, the surface tint is the warm plum the shadows are.
  { id: 'lofi-chill', name: 'LoFi Chill', mod: 'LoFi Chill', wall: '/themes/lofi-chill.jpg', dark: { acc: [6, 76, 65], sec: [20, 30, 12] }, light: { acc: [6, 70, 52], sec: [22, 38, 93] } },
  { id: 'grand-theft-auto-san-andreas', name: 'Grand Theft Auto: San Andreas', mod: 'Grand Theft Auto: San Andreas', wall: '/themes/grand-theft-auto-san-andreas.jpg', dark: { acc: [110, 24, 45], sec: [87, 11, 16] }, light: { acc: [110, 24, 45], sec: [87, 24, 78] } },
  { id: 'blockified', name: 'Blockified', mod: 'Blockified', wall: '/themes/blockified.jpg', dark: { acc: [277, 56, 56], sec: [292, 18, 16] }, light: { acc: [101, 100, 29], sec: [49, 13, 24] } },
  { id: 'violet-nebula', name: 'Violet Nebula', mod: 'Violet Nebula', wall: '/themes/violet-nebula.jpg', dark: { acc: [289, 71, 56], sec: [251, 60, 16] }, light: { acc: [322, 52, 31], sec: [237, 39, 88] } },
  { id: 'anime', name: 'Anime', mod: 'Anime', wall: '/themes/anime.jpg', dark: { acc: [4, 83, 72], sec: [20, 27, 32] }, light: { acc: [327, 80, 57], sec: [6, 15, 25] } },
  { id: 'monkey-rizz', name: 'Monkey RIZZ', mod: 'Monkey RIZZ', wall: '/themes/monkey-rizz.jpg', dark: { acc: [360, 100, 32], sec: [360, 0, 16] }, light: { acc: [360, 100, 27], sec: [360, 67, 16] } },
  { id: 'the-traveller', name: 'The Traveller', mod: 'The Traveller', wall: '/themes/the-traveller.jpg', dark: { acc: [0, 0, 80], sec: [0, 0, 16] }, light: { acc: [23, 100, 56], sec: [45, 46, 88] } },
  { id: 'cozy', name: 'Cozy', mod: 'Cozy', wall: '/themes/cozy.jpg', dark: { acc: [348, 100, 72], sec: [336, 40, 16] }, light: { acc: [14, 100, 48], sec: [35, 22, 88] } },
  { id: 'creamy-keyboard', name: 'Creamy Keyboard', mod: 'Creamy Keyboard', wall: '/themes/creamy-keyboard.jpg', dark: { acc: [85, 100, 72], sec: [272, 64, 16] }, light: { acc: [112, 80, 44], sec: [272, 32, 16] } },
  { id: 'hollow-knight', name: 'Hollow Knight', mod: 'Hollow Knight', wall: '/themes/hollow-knight.jpg', dark: { acc: [224, 100, 64], sec: [217, 45, 16] }, light: { acc: [224, 99, 56], sec: [217, 45, 88] } },
  { id: 'elden-ring', name: 'Elden Ring', mod: 'Elden Ring', wall: '/themes/elden-ring.jpg', dark: { acc: [188, 29, 62], sec: [204, 37, 62] }, light: { acc: [120, 34, 17], sec: [45, 70, 59] } },
  { id: 'japanese-lofi-mix', name: 'Japanese lofi Mix', mod: 'Japanese lofi Mix', wall: '/themes/japanese-lofi-mix.jpg', dark: { acc: [346, 95, 60], sec: [221, 33, 16] }, light: { acc: [346, 95, 60], sec: [360, 45, 88] } },
  { id: 'horror', name: 'Horror', mod: 'Horror', wall: '/themes/horror.jpg', dark: { acc: [182, 12, 56], sec: [206, 34, 16] }, light: { acc: [206, 35, 25], sec: [300, 14, 88] } },
  { id: 'black-hole', name: 'Black Hole', mod: 'Black Hole', wall: '/themes/black-hole.jpg', dark: { acc: [32, 100, 34], sec: [0, 0, 0] }, light: { acc: [40, 100, 40], sec: [0, 0, 16] } },
  { id: 'josh-hutcherson', name: 'Josh Hutcherson', mod: 'Josh Hutcherson', wall: '/themes/josh-hutcherson.jpg', dark: { acc: [285, 100, 63], sec: [272, 64, 16] }, light: { acc: [298, 95, 67], sec: [272, 69, 27] } },
  { id: 'spaced-out', name: 'Spaced Out', mod: 'Spaced Out', wall: '/themes/spaced-out.jpg', dark: { acc: [211, 100, 54], sec: [234, 35, 16] }, light: { acc: [224, 100, 66], sec: [210, 47, 88] } },
  { id: 'medieval', name: 'Medieval', mod: 'Medieval', wall: '/themes/medieval.jpg', dark: { acc: [29, 49, 52], sec: [16, 43, 16] }, light: { acc: [203, 75, 34], sec: [213, 37, 26] } },
  { id: 'legendary-rift', name: 'Legendary Rift', mod: 'Legendary Rift', wall: '/themes/legendary-rift.jpg', dark: { acc: [181, 80, 47], sec: [297, 24, 12] }, light: { acc: [181, 83, 31], sec: [224, 19, 88] } },
  { id: 'naruto-itachi-uchiha', name: 'Naruto Itachi Uchiha', mod: 'Naruto Itachi Uchiha', wall: '/themes/naruto-itachi-uchiha.jpg', dark: { acc: [0, 100, 23], sec: [0, 100, 0] }, light: { acc: [0, 100, 23], sec: [0, 100, 0] } },
  { id: 'capybara-party', name: 'Capybara Party', mod: 'Capybara Party', wall: '/themes/capybara-party.jpg', dark: { acc: [35, 87, 78], sec: [245, 40, 16] }, light: { acc: [212, 77, 40], sec: [22, 70, 88] } },
];

export const ALL_THEMES: GxTheme[] = [SLATE_THEME, ...GX_THEMES];

export function themeById(id: string): GxTheme {
  return ALL_THEMES.find((t) => t.id === id) || SLATE_THEME;
}
