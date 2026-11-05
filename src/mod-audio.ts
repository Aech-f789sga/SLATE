/**
 * The mod's soundtrack and UI sounds, ported from the same idea as the
 * Cyberdeck audio engine in CELE.
 *
 * A mod that ships more than one file under `background_music` is shipping a
 * **playlist**, not stems. The files are all cut to the same length — which is
 * what made this look like Opera's layer trick at first — but they are
 * different pieces of music: measuring the loudness envelope of `layer1`
 * against `layer2` across four mods gives a correlation between −0.23 and
 * +0.20, i.e. no relationship at all. Stems of one performance track each other
 * closely by definition. Playing them together, as this engine used to, was
 * four songs at once.
 *
 * So: one `<audio>` at a time, `ended` moves to the next track, and the choice
 * is remembered per mod. A mod with a single track behaves exactly as before.
 *
 * Everything is opt-in and persisted. Nothing plays before the first gesture,
 * because browsers refuse to start audio without one — `unlock()` is wired to
 * the first pointer or key event anywhere in the app.
 */

import { currentMod, type ModMedia } from './mod-media';

export type ModAudioSettings = {
  music: boolean;
  sfx: boolean;
  hover: boolean;
  keys: boolean;
  /** 0..1, applied to music and effects alike */
  volume: number;
};

const STORAGE_KEY = 'inkpad_mod_audio';
/** which track of which mod was last playing, so a reload resumes the same one */
const TRACK_KEY = 'inkpad_mod_track';

/* Effects are off by default. This is a notebook: a blip on every control is
   charming for a minute and then it is a pen scratching over your thinking. */
export const DEFAULT_SETTINGS: ModAudioSettings = {
  music: true,
  sfx: false,
  hover: false,
  keys: false,
  volume: 0.45,
};

export function loadSettings(): ModAudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw);
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    return {
      music: bool(p.music, DEFAULT_SETTINGS.music),
      sfx: bool(p.sfx, DEFAULT_SETTINGS.sfx),
      hover: bool(p.hover, DEFAULT_SETTINGS.hover),
      keys: bool(p.keys, DEFAULT_SETTINGS.keys),
      volume:
        typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

type Listener = (s: ModAudioSettings) => void;

class ModAudio {
  settings: ModAudioSettings = { ...DEFAULT_SETTINGS };

  /** true once a gesture has allowed playback */
  unlocked = false;
  /** true when the browser refused to start the music */
  blocked = false;

  private mod: ModMedia | null = null;
  /** one element, one track — see the note at the top of this file */
  private player: HTMLAudioElement | null = null;
  /** which of the mod's tracks that element is holding */
  private index = 0;
  private listeners = new Set<Listener>();
  private sfxPool = new Map<string, HTMLAudioElement[]>();
  private sfxTurn = new Map<string, number>();
  private lastHover = 0;
  private lastKey = 0;
  private booted = false;

  // ---------------------------------------------------------------- setup

  boot() {
    if (this.booted) return;
    this.booted = true;
    this.settings = loadSettings();
    this.mod = currentMod();
    this.index = this.mod ? this.storedIndex(this.mod.id, this.mod.layers.length) : 0;
    this.buildSfx();

    // Any gesture may release the audio lock, not only a pointer press: a
    // returning visitor who reloads and immediately types into the search box
    // should get their soundtrack back just as fast as one who clicks.
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    }

    // the theme can change at any time; follow it
    new MutationObserver(() => this.follow()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-gx-theme'],
    });
    this.follow();

    // Start the soundtrack now, without waiting for a gesture.
    //
    // A refresh used to leave the music silent until something was clicked,
    // because playback was only ever begun from the unlock handler — and the
    // panel the user happened to click was simply the first gesture, which made
    // it look as though the panel were the cause. Chrome lets a returning
    // visitor autoplay (its media engagement score remembers that this origin
    // plays audio), so the common case is that this call succeeds outright. A
    // first-time visitor is refused, playMusic records that, and the listeners
    // above take over on their first tap.
    if (this.settings.music) this.playMusic();

    this.wireUiSounds();
  }

  private buildSfx() {
    this.sfxPool.clear();
    const mod = this.mod;
    if (!mod?.sfx) return;
    const add = (name: string, src: string, copies = 2) => {
      const pool: HTMLAudioElement[] = [];
      for (let i = 0; i < copies; i++) {
        const el = new Audio(src);
        el.preload = 'auto';
        pool.push(el);
      }
      this.sfxPool.set(name, pool);
    };
    add('hover', mod.sfx.hover, 2);
    add('click', mod.sfx.click, 3);
    add('toggle', mod.sfx.toggle, 2);
    add('tab', mod.sfx.tab, 2);
    add('close', mod.sfx.close, 2);
    // a handful of the mod's keystroke samples, picked at random so a run of
    // letters does not sound like one key being held down
    this.sfxPool.set(
      'keys',
      mod.sfx.keys.slice(0, 4).map((src) => {
        const el = new Audio(src);
        el.preload = 'auto';
        return el;
      }),
    );
  }

  // ---------------------------------------------------------------- theme

  /** Swap the soundtrack when the page changes mods. */
  private follow() {
    const next = currentMod();
    if (next?.id === this.mod?.id) return;
    this.teardown();
    this.mod = next;
    this.index = next ? this.storedIndex(next.id, next.layers.length) : 0;
    this.buildSfx();
    // Resume on the *setting*, never on "was it playing a moment ago".
    // Switching to a theme with no music tears the player down, so by the time
    // you switch back `isPlayingMusic` is already false and the soundtrack
    // stayed silent until you toggled it off and on again.
    //
    // Not gated on `unlocked` either: the theme is usually applied a tick after
    // boot, so at the moment this first runs the page has had no gesture at
    // all. Attempting it here is what makes a reload audible; if the browser
    // refuses, playMusic records that and the gesture listeners retry.
    if (this.settings.music) this.playMusic();
    this.emit();
  }

  private teardown() {
    if (!this.player) return;
    this.player.pause();
    this.player.removeAttribute('src');
    this.player.load();
    this.player = null;
  }

  /** Where this mod was left last time, clamped to the tracks it actually has. */
  private storedIndex(id: string, count: number): number {
    try {
      const raw = JSON.parse(localStorage.getItem(TRACK_KEY) || '{}');
      const v = raw?.[id];
      return typeof v === 'number' && v >= 0 && v < count ? v : 0;
    } catch {
      return 0;
    }
  }

  private storeIndex() {
    if (!this.mod) return;
    try {
      const raw = JSON.parse(localStorage.getItem(TRACK_KEY) || '{}');
      raw[this.mod.id] = this.index;
      localStorage.setItem(TRACK_KEY, JSON.stringify(raw));
    } catch {
      /* private mode: the track just restarts from the first one */
    }
  }

  /**
   * The single element, pointed at `this.index`.
   *
   * Built once per mod and then re-pointed, rather than one element per track:
   * an `<audio>` that is created on every skip leaks a decoder, and Safari
   * refuses to start the second one without another gesture.
   */
  private ensurePlayer() {
    if (!this.mod?.layers.length) return;
    if (!this.player) {
      const el = new Audio();
      el.preload = 'auto';
      el.loop = false;
      el.volume = this.musicVolume;
      // The next track starts on its own. This is the whole feature: a theme
      // with four songs should not stop dead after the first one.
      el.addEventListener('ended', () => {
        if (!this.settings.music) return;
        this.next();
      });
      el.addEventListener('error', () => {
        this.blocked = true;
        this.emit();
      });
      this.player = el;
    }
    const src = this.mod.layers[this.index];
    if (this.player.getAttribute('src') !== src) {
      this.player.src = src;
      this.player.load();
    }
    this.player.volume = this.musicVolume;
  }

  // ---------------------------------------------------------------- volume

  private get musicVolume() {
    return Math.min(1, this.settings.volume * 0.85);
  }

  private get sfxVolume() {
    return Math.min(1, this.settings.volume * 0.9);
  }

  // ---------------------------------------------------------------- public

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn({ ...this.settings }));
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage may be unavailable */
    }
  }

  private update(patch: Partial<ModAudioSettings>) {
    this.settings = { ...this.settings, ...patch };
    if (this.player) this.player.volume = this.musicVolume;
    this.sfxPool.forEach((pool) => pool.forEach((el) => (el.volume = this.sfxVolume)));
    this.persist();
    this.emit();
  }

  setMusic(on: boolean) {
    this.update({ music: on });
    if (on) {
      this.unlock();
      this.playMusic();
      this.play('toggle');
    } else {
      this.pauseMusic();
    }
  }

  setSfx(on: boolean) {
    this.update({ sfx: on });
    if (on) {
      this.unlock();
      this.play('toggle', true);
    }
  }

  setHover(on: boolean) {
    this.update({ hover: on });
    if (on) this.play('toggle', true);
  }

  setKeys(on: boolean) {
    this.update({ keys: on });
    if (on) this.play('toggle', true);
  }

  setVolume(v: number) {
    this.update({ volume: Math.max(0, Math.min(1, v)) });
  }

  /** Called from the first gesture: browsers block audio before one. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.blocked = false;
    if (this.settings.music) this.playMusic();
  }

  private playMusic() {
    if (!this.mod?.layers.length) return;
    this.ensurePlayer();
    const p = this.player?.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        this.blocked = true;
        this.emit();
      });
    }
    this.emit();
  }

  private pauseMusic() {
    this.player?.pause();
    this.emit();
  }

  // ---------------------------------------------------------------- tracks

  /** Step through the mod's playlist, wrapping. */
  next() {
    this.step(1);
  }

  prev() {
    this.step(-1);
  }

  private step(dir: number) {
    const n = this.mod?.layers.length ?? 0;
    if (n < 2) return;
    this.index = (this.index + dir + n) % n;
    this.storeIndex();
    // no interface sound here, on purpose. A manual skip already gets the
    // button's own click; an automatic one is signalled by the music changing,
    // and a blip every few minutes while you are writing is not a feature.
    this.playMusic();
  }

  select(i: number) {
    const n = this.mod?.layers.length ?? 0;
    if (n < 2) return;
    this.index = Math.max(0, Math.min(n - 1, i));
    this.storeIndex();
    this.playMusic();
  }

  play(name: string, force = false) {
    if (!this.settings.sfx && !force) return;
    const pool = this.sfxPool.get(name);
    if (!pool?.length) return;
    const turn = this.sfxTurn.get(name) ?? 0;
    this.sfxTurn.set(name, turn + 1);
    const el = pool[turn % pool.length];
    el.volume = this.sfxVolume;
    try {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  hover() {
    if (!this.settings.sfx || !this.settings.hover) return;
    const now = performance.now();
    if (now - this.lastHover < 90) return;
    this.lastHover = now;
    this.play('hover');
  }

  click() {
    this.play('click');
  }

  /** Keystrokes, at a rate no keyboard could exceed. */
  key(key: string) {
    if (!this.settings.sfx || !this.settings.keys) return;
    const now = performance.now();
    if (now - this.lastKey < 28) return;
    this.lastKey = now;
    const pool = this.sfxPool.get('keys');
    if (!pool?.length) return;
    const el = pool[Math.floor(Math.random() * pool.length)];
    el.volume = this.sfxVolume;
    try {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /** The interface sounds, hung off the app once and never again. */
  private wireUiSounds() {
    const isControl = (el: Element | null) =>
      !!el?.closest('button, a, [role="button"], [role="switch"], select, .card');

    document.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Element | null;
        if (!isControl(t)) return;
        if (t?.closest('[data-no-sfx]')) return;
        this.click();
      },
      { capture: true, passive: true },
    );

    document.addEventListener(
      'pointerover',
      (e) => {
        const t = e.target as Element | null;
        if (!isControl(t)) return;
        if (t?.closest('[data-no-sfx]')) return;
        this.hover();
      },
      { capture: true, passive: true },
    );

    document.addEventListener(
      'keydown',
      (e) => {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        if (!t.closest('input, textarea, [contenteditable="true"], #tx')) return;
        this.key(e.key);
      },
      { capture: true },
    );
  }

  // ---------------------------------------------------------------- state

  get isPlayingMusic() {
    const el = this.player;
    return !!el && !el.paused && !el.ended && !!el.currentSrc;
  }

  /** "Anime · 2/4" for a playlist, the plain name for a single track. */
  get trackName() {
    const name = this.mod?.track ?? '';
    const n = this.trackCount;
    return n > 1 ? `${name} · ${this.index + 1}/${n}` : name;
  }

  get trackIndex() {
    return this.index;
  }

  get trackCount() {
    return this.mod?.layers.length ?? 0;
  }

  /** The file the element is holding — the only honest proof of which track plays. */
  get currentSrc() {
    return this.player?.currentSrc || '';
  }

  /** Jump to a point in the current track. Used by the auto-advance probe. */
  seek(t: number) {
    if (!this.player) return;
    try {
      this.player.currentTime = t;
    } catch {
      /* not loaded yet */
    }
  }

  get hasSfx() {
    return !!this.mod?.sfx;
  }
}

export const modAudio = new ModAudio();

/** Small surface for the tour and for probes. */
(window as any).__inkpad_modaudio = {
  state: () => ({
    index: modAudio.trackIndex,
    count: modAudio.trackCount,
    name: modAudio.trackName,
    src: modAudio.currentSrc,
    playing: modAudio.isPlayingMusic,
    blocked: modAudio.blocked,
    music: modAudio.settings.music,
  }),
  next: () => modAudio.next(),
  prev: () => modAudio.prev(),
  select: (i: number) => modAudio.select(i),
  setMusic: (v: boolean) => modAudio.setMusic(v),
  setVolume: (v: number) => modAudio.setVolume(v),
  seek: (t: number) => modAudio.seek(t),
};
