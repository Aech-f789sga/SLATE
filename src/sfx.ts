/**
 * Interface sounds, one pack per theme.
 *
 * A GX mod ships a sound pack alongside its wallpaper — a click, a hover, a
 * keystroke. The original audio is not redistributable (and the mod files are
 * long gone), but a click is a *transient*: one oscillator with a pitch glide,
 * one filtered noise burst, and a decay envelope. Six numbers describe the
 * character of a pack well enough to tell a wooden knock from a terminal blip
 * from a struck bell, which is what the ear actually recognises.
 *
 * Every sound is therefore synthesised at call time from the numbers in
 * `themes-data.ts`. Nothing is downloaded, nothing is stored, and switching
 * themes switches the pack mid-sentence.
 *
 * Two rules keep it civil:
 *   - the context is created on the first real gesture, so nothing can play
 *     before the user has touched the page;
 *   - sounds are throttled, because a fast click can otherwise fire a dozen
 *     transients in a frame and the result is a buzz, not a click.
 */

import { sndOf, type GxSnd } from './themes-data';

const KEY = 'inkpad-gx-sfx';

/**
 * Which pack to use. Read from the document rather than from the theme module:
 * the sound has to follow what is *applied*, not what is stored, and it keeps
 * this module free of a circular import back into the theme runtime.
 */
function packId(): string {
  return document.documentElement.dataset.gxTheme || 'slate';
}

type Kind = 'click' | 'toggle' | 'open' | 'close' | 'done' | 'type';

/** Per-kind tweaks on top of the theme's base spec. */
const KINDS: Record<Kind, { mult: number; dur: number; gain: number }> = {
  click: { mult: 1, dur: 1, gain: 1 },
  toggle: { mult: 1.22, dur: 0.9, gain: 0.95 },
  open: { mult: 0.82, dur: 1.5, gain: 0.9 },
  close: { mult: 0.72, dur: 0.85, gain: 0.75 },
  done: { mult: 1.34, dur: 1.7, gain: 0.85 },
  type: { mult: 1.06, dur: 0.42, gain: 0.4 },
};

let enabled = true;
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let last = 0;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === '0' || raw === '1') enabled = raw === '1';
  } catch {
    /* default on */
  }
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    const n = Math.floor(ctx.sampleRate * 0.5);
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

function blip(spec: GxSnd, kind: Kind, mult = 1) {
  const c = ensure();
  if (!c) return;
  const k = KINDS[kind];
  const t = c.currentTime;
  const f = spec.f * k.mult * mult;
  const f2 = Math.max(24, spec.f2 * k.mult * mult);
  const dur = Math.max(0.03, spec.d * k.dur);

  // body — the pitched part that gives the pack its note
  const osc = c.createOscillator();
  osc.type = spec.w;
  osc.frequency.setValueAtTime(f, t);
  // a flat glide is a legitimate choice (chiptune), so skip the ramp when the
  // two ends are within a hair of each other — exponential ramps dislike that
  if (Math.abs(f - f2) > 1) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(spec.g * k.gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(g);
  g.connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);

  // transient — the part that makes it a *click* and not a beep
  if (spec.n > 0 && noise) {
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(c.sampleRate / 2.2, f * 1.8);
    bp.Q.value = spec.q;
    const ng = c.createGain();
    ng.gain.setValueAtTime(spec.g * spec.n * k.gain, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(c.destination);
    src.start(t, Math.random() * 0.4, dur * 0.8);
  }
}

export function play(kind: Kind = 'click', force = false) {
  if (!enabled) return;
  const now = performance.now();
  // 26 ms is below the ear's ability to resolve two separate clicks, so this
  // only ever removes genuine pile-ups
  if (!force && kind !== 'done' && now - last < 26) return;
  last = now;

  const spec = sndOf(packId());
  if (kind === 'done') {
    // a fifth above: two transients that read as one gesture
    blip(spec, kind, 1);
    blip(spec, kind, 1.5);
    return;
  }
  blip(spec, kind, 1);
}

export function sfxOn(): boolean {
  return enabled;
}

export function setSfxOn(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (v) play('toggle');
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

const HIT = 'button,a,[role="button"],.gxp-card,.lib-chip,label.gxp-wall,summary';
const SKIP = new Set([
  'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter',
]);

function typingIn(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || n.isContentEditable;
}

function hook() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (!t.closest(HIT)) return;
      // the theme cards already announce themselves when chosen
      play('click');
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'change',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t as HTMLInputElement).type === 'checkbox') play('toggle');
    },
    { capture: true },
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (SKIP.has(e.key) || e.key.length !== 1) return;
      if (!typingIn(e.target)) return;
      // only packs that ship keystrokes tick
      if (!sndOf(packId()).ty) return;
      play('type');
    },
    { capture: true },
  );
}

function boot() {
  load();
  hook();
  // the picker and the shelf button live in themes.ts; this is the handle the
  // probe (and the console) uses
  (window as any).__inkpadSfx = { play, on: sfxOn, setOn: setSfxOn };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
