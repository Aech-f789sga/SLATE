/**
 * Surface haptics — the faint grain under the nib while you draw.
 *
 * Writing on paper is tactile because the nib drags across a rough surface, so
 * the feedback has to be *continuous and small*, not one bump per stroke. That
 * is the whole design problem, because the Vibration API gives us a duration
 * and nothing else: no amplitude, no waveform, no frequency. The only levers
 * are how long each pulse lasts and how often they repeat.
 *
 * Two rules are what make this feel like a surface rather than a buzz:
 *
 *   1. Pulses are gated by TRAVEL, not by a timer. A pen resting on the glass
 *      stays silent; only movement earns a tick. That is what ties the texture
 *      to the nib instead of to the clock, and it is why lifting the pen or
 *      pausing to think produces no feedback at all.
 *
 *   2. A minimum gap between pulses caps the rate. `navigator.vibrate()`
 *      cancels whatever is already playing, so two ticks arriving in the same
 *      frame would truncate each other into two near-invisible clicks instead
 *      of one tick. The gap is what gives the pulse width any meaning, and it
 *      is also what stops a fast stroke from turning into a solid buzz.
 *
 * Platform reality, because it shapes what this file can promise:
 *
 *   - Android browsers implement the API, and phones/tablets have a motor.
 *   - Chromium on the desktop exposes the API but the hardware has no motor,
 *     so nothing happens. Windows tablets with a pen are in this bucket.
 *   - iOS and iPadOS Safari do not implement it at all. An Apple Pencil gets
 *     no feedback from here, and no amount of tuning changes that — the Pencil
 *     has no motor of its own either.
 *
 * The engine keeps calling `HA.begin` / `HA.tick` / `HA.end`; this module
 * replaces those no-ops at boot. If the module never loads, drawing is exactly
 * as it was.
 */

/* ------------------------------------------------------------------ */
/* Tuning                                                             */
/* ------------------------------------------------------------------ */

type Level = 'off' | 'light' | 'medium' | 'firm';

interface Preset {
  /** How long the motor runs for each tick, in ms. */
  pulse: number;
  /** Minimum ms between the start of two ticks. */
  gap: number;
  /** Screen px the nib must travel to earn the next tick. */
  step: number;
}

/**
 * The three strengths.
 *
 * These are deliberately on the quiet side. A phone's linear resonant actuator
 * turns anything above roughly a quarter duty cycle into an obvious buzz, which
 * is the "too strong" failure — it stops reading as paper and starts reading as
 * a notification. Medium is the default and sits just under that line: about
 * one fifth of the time vibrating, roughly thirty ticks a second.
 *
 * `step` shrinks as the level rises so a firmer setting also feels denser, not
 * just louder — the two together are what separate "light pencil" from "ball
 * point pressed hard".
 */
const PRESETS: Record<Exclude<Level, 'off'>, Preset> = {
  light: { pulse: 4, gap: 52, step: 14 },
  medium: { pulse: 7, gap: 34, step: 11 },
  firm: { pulse: 11, gap: 24, step: 8 },
};

const LEVELS: Level[] = ['off', 'light', 'medium', 'firm'];
const KEY = 'slate-haptics';

/** No single tick may run longer than this, whatever the maths says. */
const MAX_PULSE = 20;
/** Below this a pulse is not felt at all on most motors — better to skip it. */
const MIN_PULSE = 3;
/** The nib landing gets a touch more than a passing tick. */
const LAND_GAIN = 1.3;

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

let level: Level = 'medium';

/** True only between begin() and end() — i.e. a freehand stroke is in flight. */
let active = false;

/** Distance accumulated since the last tick, in screen px. */
let travelled = 0;
let lastX = 0;
let lastY = 0;
let lastPulse = 0;

/** Ring buffer of recent ticks, for the diagnostics surface and the probe. */
const recent: { ms: number; at: number }[] = [];

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (lo: number, hi: number, n: number): number => (n < lo ? lo : n > hi ? hi : n);

/**
 * Is there any point trying?
 *
 * This cannot tell us whether a motor exists — the API is present on desktop
 * Chromium too — so it only rules out the platforms where the call is a
 * guaranteed no-op. The panel says as much rather than pretending.
 */
function supported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** One pulse. Duration only: the API has no amplitude to give us. */
function send(ms: number): void {
  const d = Math.round(clamp(MIN_PULSE, MAX_PULSE, ms));
  recent.push({ ms: d, at: performance.now() });
  if (recent.length > 64) recent.shift();
  try {
    navigator.vibrate(d);
  } catch {
    /* Some browsers throw outside a secure context; the stroke is unaffected. */
  }
}

/** Stop anything in flight, without queueing a new one. */
function silence(): void {
  if (!supported()) return;
  try {
    navigator.vibrate(0);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Stroke lifecycle                                                   */
/* ------------------------------------------------------------------ */

/**
 * A freehand stroke started. `e` is the pointerdown that the engine already
 * accepted, so a palm the pen layer rejected never reaches this.
 */
function begin(e: PointerEvent): void {
  if (!supported() || level === 'off') return;
  // A mouse never has a motor behind it, and on a desktop the call would be a
  // no-op anyway. Skipping it keeps the "did it fire" surface honest.
  if (e.pointerType === 'mouse') return;

  active = true;
  travelled = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  lastPulse = performance.now();

  send(PRESETS[level].pulse * LAND_GAIN);
}

/**
 * The nib moved. `speed` is page units per ms, as the engine already computes
 * for the brush — reused here rather than recomputed so the texture and the
 * stroke width respond to the same number.
 */
function tick(e: PointerEvent, speed: number): void {
  if (!active || level === 'off') return;

  const p = PRESETS[level];

  // Wall clock, not `e.timeStamp`. A burst of coalesced samples carries
  // timestamps spread across the frame but arrives in one synchronous loop, so
  // gating on event time would let several pulses be issued back to back — and
  // the motor, which lives in real time, would truncate all but the last.
  const now = performance.now();

  const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
  if (d > 0) {
    travelled += d;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  // Not far enough, or too soon: either way the accumulated distance is kept,
  // so a slow drag still ticks the moment the gap expires.
  if (travelled < p.step) return;
  if (now - lastPulse < p.gap) return;

  travelled = 0;
  lastPulse = now;

  // Speed and pressure nudge the strength but never dominate it. A constant
  // texture that tracks the hand feels like a surface; one that swings with
  // every sample feels like a fault.
  const fast = clamp01((speed - 0.35) / 1.4);
  const press = clamp01(typeof e.pressure === 'number' ? e.pressure : 0.5);
  const gain = 0.92 + fast * 0.22 + press * 0.16;

  send(p.pulse * gain);
}

/**
 * The stroke ended.
 *
 * Anything in flight is left to finish: a tick is at most 20 ms, so letting it
 * play out is imperceptible, while cancelling would clip the last tick of every
 * stroke — the one you feel as the pen leaves the paper.
 */
function end(): void {
  if (!active) return;
  active = false;
  travelled = 0;
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

function readStored(): Level {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (LEVELS as string[]).indexOf(v) !== -1) return v as Level;
  } catch {
    /* private mode */
  }
  return 'medium';
}

function store(): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* ignore */
  }
}

/** Three quick taps so the choice can be felt the moment it is made. */
function preview(): void {
  if (!supported() || level === 'off') return;
  const p = PRESETS[level];
  const one = Math.round(p.pulse * 1.15);
  try {
    navigator.vibrate([one, 70, one, 70, one]);
  } catch {
    /* ignore */
  }
}

function setLevel(v: string): void {
  if ((LEVELS as string[]).indexOf(v) === -1) return;
  level = v as Level;
  store();
  syncSelect();
  if (level === 'off') silence();
  else preview();
}

/** Mirror the current level into the stylus panel, and explain a dead API. */
function syncSelect(): void {
  const sel = document.getElementById('pen-hap') as HTMLSelectElement | null;
  if (!sel) return;
  sel.value = level;
  const ok = supported();
  sel.disabled = !ok;
  sel.title = ok ? 'Vibration under the nib while drawing' : 'This browser has no vibration API';
  const row = sel.closest('.row');
  if (row) row.classList.toggle('pen-hap-off', !ok);
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

function install(): void {
  level = readStored();

  const api = { begin, tick, end, setLevel, level: (): Level => level, supported };
  (window as any).HA = api;
  (window as any).__slateHaptics = {
    ...api,
    syncSelect,
    levels: LEVELS.slice(),
    preset: () => PRESETS[level === 'off' ? 'medium' : level],
    recent: () => recent.slice(),
    count: () => recent.length,
    reset: () => {
      recent.length = 0;
      active = false;
      travelled = 0;
    },
    state: () => ({ level, active, travelled, lastPulse }),
  };

  // The panel may already exist (the engine builds it lazily, but this module
  // can load after it if the user opened the sheet first).
  syncSelect();

  const sel = document.getElementById('pen-hap') as HTMLSelectElement | null;
  if (sel && !sel.dataset.hooked) {
    sel.dataset.hooked = '1';
    sel.addEventListener('change', () => setLevel(sel.value));
  }

  // The engine owns the stroke lifecycle, but a stroke can also be cancelled
  // out from under it — a second finger starting a pinch sets `cur` to null
  // without ever reaching end(). Clearing here keeps the state machine honest.
  const stop = (): void => end();
  window.addEventListener('pointerup', stop, true);
  window.addEventListener('pointercancel', stop, true);

  // A pulse must not outlive the tab, and a backgrounded page must not buzz.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      end();
      silence();
    }
  });
  window.addEventListener('pagehide', () => {
    end();
    silence();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}

// The pen panel is created on demand; re-sync whenever it is opened so the
// select shows the stored level rather than whatever the markup defaults to.
document.addEventListener('pointerdown', () => {
  const sel = document.getElementById('pen-hap') as HTMLSelectElement | null;
  if (sel && !sel.dataset.hooked) {
    sel.dataset.hooked = '1';
    sel.addEventListener('change', () => setLevel(sel.value));
    syncSelect();
  }
}, true);
