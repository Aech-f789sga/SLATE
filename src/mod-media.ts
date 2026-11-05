/**
 * What each mod actually ships.
 *
 * An Opera GX mod is not a colour scheme: it carries a soundtrack, a set of
 * UI sounds and a wallpaper, and every mod carries a *different* kind of
 * wallpaper — which is why this is a table rather than a convention.
 * Everything below is read straight from each mod's own `manifest.json`
 * (`mod.payload`), so the paths and the track count are the mod's, not ours.
 *
 * The soundtracks are all the same shape, which is the interesting part:
 *
 *   LoFi Chill   four stems mixed as one track, a still photograph, and a
 *                shader that draws drifting bokeh over it.
 *   Cyberdeck    three stems, an animated webm of the skyline, and a shader
 *                that adds glitch and a binary matrix.
 *   Minecraft    one 17-minute track, and a 17-minute video of a fireplace.
 *   Blockified   a single track — the one mod here that ships a whole song
 *                rather than layers of one.
 *
 * A mod ships *stems*, not a song: `layer1..5.mp3`, all exactly the same
 * length, which Opera plays at once so it can fade layers in and out without
 * ever cutting the music. The engine does the same, so `layers` is just the
 * count the mod uses.
 *
 * Audio is re-encoded to 64 kbps AAC and video to 720p; the originals are
 * untouched in the mod folder.
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

/** The mod cut one song into N equal-length layers; name them in order. */
const stems = (id: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${root(id)}/music/layer${i + 1}.m4a`);

/**
 * The interface sounds, laid down by `scripts/extract-sfx.mjs` under the same
 * six names for every mod — which is the whole reason the extractor exists:
 * each mod names its sounds after *moments in a browser* (`SWITCH_TOGGLE`,
 * `TAB_INSERT`), and that translation belongs in one script, not in fourteen
 * hand-written path blocks.
 */
const sfx = (id: string, keys: number): ModSfx => ({
  hover: `${root(id)}/sfx/hover.mp3`,
  click: `${root(id)}/sfx/click.mp3`,
  toggle: `${root(id)}/sfx/toggle.mp3`,
  tab: `${root(id)}/sfx/tab.mp3`,
  close: `${root(id)}/sfx/close.mp3`,
  keys: Array.from({ length: keys }, (_, i) => `${root(id)}/sfx/key${i + 1}.mp3`),
});

export const MODS: Record<string, ModMedia> = {
  anime: {
    id: 'anime',
    name: 'Anime',
    track: 'Anime',
    layers: stems('anime', 4),
    sfx: sfx('anime', 4),
    wall: {
      still: '/themes/anime.jpg',
      video: `${root('anime')}/wall/live.mp4`,
      fx: 'petals',
      label: 'Sakura, drifting',
    },
  },

  'lofi-chill': {
    id: 'lofi-chill',
    name: 'LoFi Chill',
    track: 'LoFi Chill',
    layers: stems('lofi-chill', 4),
    sfx: sfx('lofi-chill', 3),
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
    layers: stems('cyberdeck', 3),
    sfx: sfx('cyberdeck', 8),
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

  /* ---- the ten ported from the second wave of installed mods ---------- */

  cozy: {
    id: 'cozy',
    name: 'Cozy',
    track: 'Cozy',
    layers: stems('cozy', 4),
    sfx: sfx('cozy', 1),
    wall: {
      still: '/themes/cozy.jpg',
      fx: 'dust',
      label: 'Lamplight',
    },
  },

  horror: {
    id: 'horror',
    name: 'Horror',
    track: 'Horror',
    layers: stems('horror', 3),
    sfx: sfx('horror', 6),
    wall: {
      still: '/themes/horror.jpg',
      video: `${root('horror')}/wall/live.mp4`,
      fx: 'rain',
      label: 'Rain on the glass',
    },
  },

  'violet-nebula': {
    id: 'violet-nebula',
    name: 'Violet Nebula',
    track: 'Violet Nebula',
    layers: stems('violet-nebula', 3),
    sfx: sfx('violet-nebula', 5),
    wall: {
      still: '/themes/violet-nebula.jpg',
      fx: 'stars',
      label: 'The nebula, turning',
    },
  },

  medieval: {
    id: 'medieval',
    name: 'Medieval',
    track: 'Medieval',
    layers: stems('medieval', 4),
    sfx: sfx('medieval', 5),
    wall: {
      still: '/themes/medieval.jpg',
      video: `${root('medieval')}/wall/live.mp4`,
      fx: 'embers',
      label: 'Embers of the keep',
    },
  },

  'spaced-out': {
    id: 'spaced-out',
    name: 'Spaced Out',
    track: 'Spaced Out',
    layers: stems('spaced-out', 5),
    sfx: sfx('spaced-out', 1),
    wall: {
      still: '/themes/spaced-out.jpg',
      fx: 'stars',
      label: 'Deep field',
    },
  },

  'legendary-rift': {
    id: 'legendary-rift',
    name: 'Legendary Rift',
    track: 'Legendary Rift',
    layers: stems('legendary-rift', 5),
    sfx: sfx('legendary-rift', 4),
    wall: {
      still: '/themes/legendary-rift.jpg',
      video: `${root('legendary-rift')}/wall/live.mp4`,
      fx: 'embers',
      label: 'Riftlight',
    },
  },

  'the-traveller': {
    id: 'the-traveller',
    name: 'The Traveller',
    track: 'The Traveller',
    layers: stems('the-traveller', 4),
    sfx: sfx('the-traveller', 5),
    wall: {
      still: '/themes/the-traveller.jpg',
      video: `${root('the-traveller')}/wall/live.mp4`,
      fx: 'snow',
      label: 'Snow, and the road',
    },
  },

  'capybara-party': {
    id: 'capybara-party',
    name: 'Capybara Party',
    track: 'Capybara Party',
    layers: stems('capybara-party', 4),
    sfx: sfx('capybara-party', 5),
    wall: {
      still: '/themes/capybara-party.jpg',
      fx: 'petals',
      label: 'Petals and a hot spring',
    },
  },

  blockified: {
    id: 'blockified',
    name: 'Blockified',
    track: 'Blockified',
    // the one mod that ships a whole song instead of layers of one
    layers: [`${root('blockified')}/music/layer1.m4a`],
    sfx: sfx('blockified', 4),
    wall: {
      still: '/themes/blockified.jpg',
      video: `${root('blockified')}/wall/live.mp4`,
      fx: 'embers',
      label: 'Embers over the block world',
    },
  },

  'day-one': {
    id: 'day-one',
    name: 'Day One',
    track: 'Day One',
    layers: stems('day-one', 4),
    sfx: sfx('day-one', 5),
    wall: {
      still: '/themes/day-one.jpg',
      // Day One is the one mod that animates its *light* wallpaper and leaves
      // the dark side a still. There is no light mode here, so the light loop
      // is the only motion the mod has and it is what gets ported.
      video: `${root('day-one')}/wall/live.mp4`,
      fx: 'dust',
      label: 'Morning dust',
    },
  },

  /* ---- the third wave: every installed mod that still had nothing ------- */

  'black-hole': {
    id: 'black-hole',
    name: 'Black Hole',
    track: 'Black Hole',
    layers: stems('black-hole', 1),
    sfx: sfx('black-hole', 5),
    wall: {
      still: '/themes/black-hole.jpg',
      video: `${root('black-hole')}/wall/live.mp4`,
      label: 'The accretion disc',
    },
  },

  'creamy-keyboard': {
    id: 'creamy-keyboard',
    name: 'Creamy Keyboard',
    track: 'Creamy Keyboard',
    layers: stems('creamy-keyboard', 4),
    sfx: sfx('creamy-keyboard', 3),
    wall: {
      still: '/themes/creamy-keyboard.jpg',
      // like Day One, this mod animates the light side only
      video: `${root('creamy-keyboard')}/wall/live.mp4`,
      label: 'Cream, in motion',
    },
  },

  'elden-ring': {
    id: 'elden-ring',
    name: 'Elden Ring',
    track: 'Elden Ring',
    layers: stems('elden-ring', 1),
    sfx: sfx('elden-ring', 1),
    wall: {
      still: '/themes/elden-ring.jpg',
      video: `${root('elden-ring')}/wall/live.mp4`,
      label: 'Ranni, and the moon',
    },
  },

  'grand-theft-auto-san-andreas': {
    id: 'grand-theft-auto-san-andreas',
    name: 'Grand Theft Auto: San Andreas',
    track: 'San Andreas',
    layers: stems('grand-theft-auto-san-andreas', 1),
    sfx: sfx('grand-theft-auto-san-andreas', 1),
    wall: {
      still: '/themes/grand-theft-auto-san-andreas.jpg',
      video: `${root('grand-theft-auto-san-andreas')}/wall/live.mp4`,
      label: 'Grove Street',
    },
  },

  'hollow-knight': {
    id: 'hollow-knight',
    name: 'Hollow Knight',
    track: 'Hollow Knight',
    layers: stems('hollow-knight', 1),
    sfx: sfx('hollow-knight', 1),
    wall: {
      still: '/themes/hollow-knight.jpg',
      video: `${root('hollow-knight')}/wall/live.mp4`,
      label: 'Hallownest, below',
    },
  },

  'japanese-lofi-mix': {
    id: 'japanese-lofi-mix',
    name: 'Japanese lofi Mix',
    track: 'Japanese lofi Mix',
    layers: stems('japanese-lofi-mix', 1),
    // The one mod with no interface sounds at all: its payload is music and a
    // wallpaper and nothing else. Left out on purpose, so the panel's sound
    // switch stays off for it rather than offering a switch that plays silence.
    wall: {
      still: '/themes/japanese-lofi-mix.jpg',
      video: `${root('japanese-lofi-mix')}/wall/live.mp4`,
      label: 'The window at dusk',
    },
  },

  'josh-hutcherson': {
    id: 'josh-hutcherson',
    name: 'Josh Hutcherson',
    track: 'Josh Hutcherson',
    layers: stems('josh-hutcherson', 1),
    sfx: sfx('josh-hutcherson', 1),
    wall: {
      still: '/themes/josh-hutcherson.jpg',
      fx: 'stars',
      label: 'Whistle, and it turns',
    },
  },

  'monkey-rizz': {
    id: 'monkey-rizz',
    name: 'Monkey RIZZ',
    track: 'Monkey RIZZ',
    layers: stems('monkey-rizz', 1),
    sfx: sfx('monkey-rizz', 3),
    wall: {
      still: '/themes/monkey-rizz.jpg',
      video: `${root('monkey-rizz')}/wall/live.mp4`,
      label: 'The monkey, unbothered',
    },
  },

  'naruto-itachi-uchiha': {
    id: 'naruto-itachi-uchiha',
    name: 'Naruto Itachi Uchiha',
    track: 'Itachi',
    layers: stems('naruto-itachi-uchiha', 4),
    sfx: sfx('naruto-itachi-uchiha', 3),
    wall: {
      still: '/themes/naruto-itachi-uchiha.jpg',
      video: `${root('naruto-itachi-uchiha')}/wall/live.mp4`,
      label: 'Crows over the Uchiha',
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
