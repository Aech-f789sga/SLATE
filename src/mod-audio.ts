/**
 * The mod's soundtrack and UI sounds, ported from the same idea as the
 * Cyberdeck audio engine in CELE.
 *
 * The important detail is that these mods do not ship *a song*. They ship
 * three or four **stems** of the same song — `layer1..4.mp3` all exactly the
 * same length — which Opera plays at once so it can fade individual layers in
 * and out without ever cutting the music. So the engine here is N `<audio>`
 * elements started together and kept on one clock, mixed at equal gain so a
 * four-stem mod is not twice as loud as a one-stem mod.
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
  private stems: HTMLAudioElement[] = [];
  private stemGain = 1;
  private listeners = new Set<Listener>();
  private sfxPool = new Map<string, HTMLAudioElement[]>();
  private sfxTurn = new Map<string, number>();
  private lastHover = 0;
  private lastKey = 0;
  private timer = 0;
  private booted = false;

  // ---------------------------------------------------------------- setup

  boot() {
    if (this.booted) return;
    this.booted = true;
    this.settings = loadSettings();
    this.mod = currentMod();
    this.buildSfx();

    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true });

    // the theme can change at any time; follow it
    new MutationObserver(() => this.follow()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-gx-theme'],
    });
    this.follow();

    this.wireUiSounds();
    // one clock for the stems, cheap enough to leave running
    this.timer = window.setInterval(() => this.sync(), 900);
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
    this.buildSfx();
    // Resume on the *setting*, never on "was it playing a moment ago".
    // Switching to a theme with no music tears the stems down, so by the time
    // you switch back `isPlayingMusic` is already false and the soundtrack
    // stayed silent until you toggled it off and on again.
    if (this.settings.music && this.unlocked) this.playMusic();
    this.emit();
  }

  private teardown() {
    this.stems.forEach((el) => {
      el.pause();
      el.removeAttribute('src');
      el.load();
    });
    this.stems = [];
  }

  private ensureStems() {
    if (this.stems.length || !this.mod) return;
    const n = this.mod.layers.length;
    // equal gain so loudness does not swing with the stem count
    this.stemGain = 1 / Math.sqrt(Math.max(1, n));
    this.stems = this.mod.layers.map((src) => {
      const el = new Audio();
      el.src = src;
      el.loop = true;
      el.preload = 'auto';
      el.volume = this.musicVolume;
      return el;
    });
  }

  // ---------------------------------------------------------------- volume

  private get musicVolume() {
    return Math.min(1, this.settings.volume * 0.85 * this.stemGain);
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
    this.stems.forEach((el) => (el.volume = this.musicVolume));
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
    if (!this.mod) return;
    this.ensureStems();
    this.stems.forEach((el) => {
      el.volume = this.musicVolume;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          this.blocked = true;
          this.emit();
        });
      }
    });
    this.emit();
  }

  private pauseMusic() {
    this.stems.forEach((el) => el.pause());
    this.emit();
  }

  /** Keep the stems on one clock — they were cut to the same length, so a
   *  drift of more than a beat means the browser throttled one of them. */
  private sync() {
    if (this.stems.length < 2) return;
    const live = this.stems.filter((el) => !el.paused && !el.ended);
    if (live.length < 2) return;
    const t = live[0].currentTime;
    for (const el of live) {
      if (Math.abs(el.currentTime - t) > 0.18) {
        try {
          el.currentTime = t;
        } catch {
          /* seeking before metadata is ready — next tick will catch it */
        }
      }
    }
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
    return this.stems.some((el) => !el.paused && !el.ended);
  }

  get trackName() {
    return this.mod?.track ?? '';
  }

  get layerCount() {
    return this.mod?.layers.length ?? 0;
  }

  get hasSfx() {
    return !!this.mod?.sfx;
  }
}

export const modAudio = new ModAudio();
