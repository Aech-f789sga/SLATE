/**
 * What each mod actually ships.
 *
 * An Opera GX mod is not a colour scheme: it carries a soundtrack, a set of
 * UI sounds and a wallpaper, and the three mods ported so far each carry a
 * *different* kind of wallpaper — which is why this is a table rather than a
 * convention. Everything below is read straight from each mod's own
 * `manifest.json` (`mod.payload`), so the paths and the track count are the
 * mod's, not ours.
 *
 *   LoFi Chill   four stems mixed as one track, a still photograph, and a
 *                shader that draws drifting bokeh over it.
 *   Cyberdeck    three stems, an animated webm of the skyline, and a shader
 *                that adds glitch and a binary matrix.
 *   Minecraft    one 17-minute track, and a 17-minute video of a fireplace.
 *
 * Audio is re-encoded to 64 kbps AAC and video to 720p so the whole set is
 * ~21 MB instead of ~250 MB; the originals are untouched in the mod folder.
 */

/**
 * The live-layer effects. `bokeh` and `matrix` are the two the ported mods
 * ship as shaders; the rest are the procedural weathers the other themes use.
 * Declared here because a mod's wallpaper names one, and the wall engine
 * imports this file rather than the other way round.
 */
export type Fx =
  | 'bokeh'
  | 'matrix'
  | 'petals'
  | 'snow'
  | 'stars'
  | 'embers'
  | 'rain'
  | 'dust';

export type ModWall = {
  /** the still the mod ships — always present, used as poster and as "Still" */
  still: string;
  /** a looping video, when the mod ships one */
  video?: string;
  /** what stands in for the mod's own shader */
  fx?: Fx | null;
  /** shown in the panel under "Wallpaper" */
  label: string;
};

export type ModSfx = {
  hover: string;
  click: string;
  toggle: string;
  tab: string;
  close: string;
  /** the mod's keystroke samples, played at random */
  keys: string[];
};

export type ModMedia = {
  id: string;
  name: string;
  /** the name the mod gives its own soundtrack */
  track: string;
  /** stems that must play in sync — one <audio> each */
  layers: string[];
  sfx?: ModSfx;
  wall: ModWall;
};

const root = (id: string) => `/mods/${id}`;

export const MODS: Record<string, ModMedia> = {
  anime: {
    id: 'anime',
    name: 'Anime',
    track: 'Anime',
    layers: [1, 2, 3, 4].map((n) => `${root('anime')}/music/layer${n}.m4a`),
    wall: {
      still: '/themes/anime.jpg',
      fx: 'petals',
      label: 'Sakura, drifting',
    },
  },

  'lofi-chill': {
    id: 'lofi-chill',
    name: 'LoFi Chill',
    track: 'LoFi Chill',
    layers: [1, 2, 3, 4].map((n) => `${root('lofi-chill')}/music/layer${n}.m4a`),
    sfx: {
      hover: `${root('lofi-chill')}/sfx/hover.mp3`,
      click: `${root('lofi-chill')}/sfx/click.mp3`,
      toggle: `${root('lofi-chill')}/sfx/toggle.mp3`,
      tab: `${root('lofi-chill')}/sfx/tab.mp3`,
      close: `${root('lofi-chill')}/sfx/close.mp3`,
      keys: [1, 2, 3].map((n) => `${root('lofi-chill')}/sfx/key${n}.mp3`),
    },
    wall: {
      still: '/themes/lofi-chill.jpg',
      fx: 'bokeh',
      label: 'The room, with bokeh',
    },
  },

  cyberdeck: {
    id: 'cyberdeck',
    name: 'Cyberdeck',
    track: 'Cyberdeck',
    layers: [1, 2, 3].map((n) => `${root('cyberdeck')}/music/layer${n}.m4a`),
    sfx: {
      hover: `${root('cyberdeck')}/sfx/hover.mp3`,
      click: `${root('cyberdeck')}/sfx/click.mp3`,
      toggle: `${root('cyberdeck')}/sfx/toggle.mp3`,
      tab: `${root('cyberdeck')}/sfx/tab.mp3`,
      close: `${root('cyberdeck')}/sfx/close.mp3`,
      keys: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${root('cyberdeck')}/sfx/key${n}.mp3`),
    },
    wall: {
      still: '/themes/cyberdeck.jpg',
      video: `${root('cyberdeck')}/wall/live.mp4`,
      fx: 'matrix',
      label: 'Night City skyline',
    },
  },

  'minecraft-sound-fireplace': {
    id: 'minecraft-sound-fireplace',
    name: 'Minecraft: Fireplace',
    track: 'Fireplace',
    layers: [`${root('minecraft-sound-fireplace')}/music/music.m4a`],
    wall: {
      still: '/themes/minecraft-sound-fireplace.jpg',
      video: `${root('minecraft-sound-fireplace')}/wall/live.mp4`,
      fx: null,
      label: 'The hearth',
    },
  },
};

/** The mod behind a theme id, or null when the theme ships no media. */
export function modFor(themeId: string | null | undefined): ModMedia | null {
  if (!themeId) return null;
  return MODS[themeId] ?? null;
}

/** The theme the page is currently wearing, read from the same attribute the
 *  skins key on — so the media layer and the CSS can never disagree. */
export function currentMod(): ModMedia | null {
  return modFor(document.documentElement.dataset.gxTheme);
}
