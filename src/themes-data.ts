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
  { id: 'cyberdeck', name: 'Cyberdeck', mod: 'Cyberdeck', wall: '/themes/cyberdeck.jpg', dark: { acc: [346, 95, 54], sec: [360, 100, 16] }, light: { acc: [346, 94, 53], sec: [0, 100, 88] } },
  { id: 'minecraft-sound-fireplace', name: 'Minecraft Sound: Fireplace', mod: 'Minecraft Sound: Fireplace', wall: '/themes/minecraft-sound-fireplace.jpg', dark: { acc: [24, 100, 50], sec: [41, 76, 8] }, light: { acc: [35, 100, 50], sec: [22, 97, 31] } },
  { id: 'lofi-chill', name: 'LoFi Chill', mod: 'LoFi Chill', wall: '/themes/lofi-chill.jpg', dark: { acc: [0, 100, 72], sec: [21, 40, 16] }, light: { acc: [0, 100, 60], sec: [18, 27, 85] } },
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
