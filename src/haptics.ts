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
 *   1. It runs only while the nib is MOVING. Rest the pen on the glass and it
 *      goes quiet within ~160 ms, so pausing to think produces nothing and the
 *      texture tracks the hand instead of the clock.
 *
 *   2. Each call hands the motor a whole PATTERN, not a single pulse. This is
 *      the part that decides whether a real phone feels anything at all.
 *      Calling `vibrate(7)` thirty times a second looks fine in a test but is
 *      an IPC round trip to the system vibration service every 34 ms, and
 *      Android drops or coalesces a good share of those — worse, a 7 ms pulse
 *      is below what many OEM motors resolve, so the result is silence rather
 *      than a weak tick. One `vibrate([on, off, on, off, …])` covering half a
 *      second is a single request the platform handles natively, and it lets
 *      the pulse be long enough (12–26 ms) to actually move the mass.
 *
 * The cost of a pattern is that it keeps playing on its own, so the watchdog
 * below is what stops it when the pen stops: nothing else would.
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
 * It is OFF by default. The panel has a Test button and a live readout of
 * whether the last call was accepted, because "did the browser take it" is the
 * one question a phone can answer and a desktop cannot.
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
  /** Silence between ticks, in ms. */
  gap: number;
  /** Screen px the nib must travel to restart after a pause. */
  step: number;
}

/**
 * The three strengths.
 *
 * Pulse lengths are deliberately in the teens rather than single digits: below
 * roughly 10 ms a lot of Android motors either ignore the request or spin up
 * too little to feel, which reads as "no haptics" rather than "gentle haptics".
 * The quiet end is reached through the GAP instead — a 12 ms pulse with 46 ms
 * of silence is a light, papery grain, where 12 ms with 10 ms of silence would
 * be a buzz.
 */
const PRESETS: Record<Exclude<Level, 'off'>, Preset> = {
  light: { pulse: 12, gap: 46, step: 12 },
  medium: { pulse: 18, gap: 32, step: 10 },
  firm: { pulse: 26, gap: 26, step: 8 },
};

const LEVELS: Level[] = ['off', 'light', 'medium', 'firm'];

/** Bumped from v1: the first version shipped on by default and felt like
    nothing on hardware, so nobody should inherit that stored choice. */
const KEY = 'slate-haptics-v2';

/** Pulses per pattern call. 10 × ~50 ms ≈ half a second of texture. */
const BURST = 10;

/** Re-issue once this fraction of the pattern has played. */
const REFRESH = 0.65;

/** Silence after the nib stops moving, in ms. */
const IDLE_MS = 160;

const MAX_PULSE = 34;
const MIN_PULSE = 8;
const LAND_GAIN = 1.15;

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

let level: Level = 'off';

/** True only between begin() and end() — i.e. a freehand stroke is in flight. */
let active = false;

/** True while a pattern we handed the motor is still meant to be playing. */
let playing = false;

let patternStart = 0;
let patternMs = 0;

/** Distance accumulated since the last restart, in screen px. */
let travelled = 0;
let lastX = 0;
let lastY = 0;
let lastMove = 0;

/** What the browser said about the most recent call, and how many we made. */
let lastOk: boolean | null = null;
let issued = 0;
let watchdog = 0;

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

/** Hand the motor one pattern. Returns whether the browser accepted it. */
function issue(gain: number): void {
  if (!supported() || level === 'off') return;

  const p = PRESETS[level];
  const on = Math.round(clamp(MIN_PULSE, MAX_PULSE, p.pulse * gain));
  const off = Math.round(p.gap);

  const arr: number[] = [];
  for (let i = 0; i < BURST; i++) {
    arr.push(on);
    arr.push(off);
  }

  patternMs = BURST * (on + off);
  patternStart = performance.now();
  playing = true;
  issued++;

  try {
    // `false` means the browser declined — no user activation, page hidden, or
    // the platform refuses. Surfaced in the panel rather than swallowed.
    lastOk = navigator.vibrate(arr);
  } catch {
    lastOk = false;
  }
}

/** Cut the pattern short. Needed because a pattern outlives the stroke. */
function stop(): void {
  if (!playing) return;
  playing = false;
  if (!supported()) return;
  try {
    navigator.vibrate(0);
  } catch {
    /* ignore */
  }
}

/** Stops the texture when the nib stops moving. Nothing else would. */
function startWatchdog(): void {
  if (watchdog) return;
  watchdog = window.setInterval(() => {
    if (!active) return;
    if (playing && performance.now() - lastMove > IDLE_MS) stop();
  }, 90);
}

function stopWatchdog(): void {
  if (!watchdog) return;
  window.clearInterval(watchdog);
  watchdog = 0;
}

/** Strength nudge from how fast and how hard the nib is moving. */
function gainOf(speed: number, pressure: number): number {
  const fast = clamp01((speed - 0.35) / 1.4);
  const press = clamp01(pressure);
  return 0.92 + fast * 0.22 + press * 0.16;
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
  lastMove = performance.now();

  startWatchdog();
  issue(LAND_GAIN);
}

/**
 * The nib moved. `speed` is page units per ms, as the engine already computes
 * for the brush — reused here rather than recomputed so the texture and the
 * stroke width respond to the same number.
 */
function tick(e: PointerEvent, speed: number): void {
  if (!active || level === 'off') return;

  const now = performance.now();
  const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
  if (d <= 0) return;

  travelled += d;
  lastX = e.clientX;
  lastY = e.clientY;
  lastMove = now;

  const gain = gainOf(speed, typeof e.pressure === 'number' ? e.pressure : 0.5);

  if (!playing) {
    // The watchdog stopped us while the pen was still. Only start again once
    // the nib has actually covered some ground, so a jittery hold stays quiet.
    if (travelled < PRESETS[level].step) return;
    travelled = 0;
    issue(gain);
    return;
  }

  if (now - patternStart >= patternMs * REFRESH) issue(gain);
}

/** The stroke ended: silence immediately rather than let the pattern run out. */
function end(): void {
  if (!active) return;
  active = false;
  travelled = 0;
  stop();
  stopWatchdog();
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
  // Off until asked for. This is a physical side effect on someone's phone;
  // it is not something to switch on for them.
  return 'off';
}

function store(): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* ignore */
  }
}

/** Three taps so the choice can be felt the moment it is made. */
function preview(): void {
  if (!supported() || level === 'off') return;
  const p = PRESETS[level];
  const one = Math.round(clamp(MIN_PULSE, MAX_PULSE, p.pulse));
  try {
    lastOk = navigator.vibrate([one, 70, one, 70, one]);
    issued++;
  } catch {
    lastOk = false;
  }
  syncStatus();
}

function setLevel(v: string): void {
  if ((LEVELS as string[]).indexOf(v) === -1) return;
  const changed = v !== level;
  level = v as Level;
  store();
  syncSelect();
  if (level === 'off') {
    stop();
  } else if (changed) {
    preview();
  }
}

/** Human-readable account of what the browser is doing, for the panel. */
function statusText(): string {
  if (!supported()) return 'This browser has no vibration API — nothing can be sent.';
  if (level === 'off') return 'Ready. Choose a level above to feel a sample.';
  if (lastOk === false) return 'The browser refused the last vibration request.';
  if (lastOk === null) return 'Vibration API available. Press Test to try it.';
  return `Sending patterns of ${PRESETS[level].pulse} ms pulses. Last request accepted.`;
}

function syncStatus(): void {
  const el = document.getElementById('pen-hap-status');
  if (el) el.textContent = statusText();
}

/** Mirror the current level into the stylus panel, and explain a dead API. */
function syncSelect(): void {
  const sel = document.getElementById('pen-hap') as HTMLSelectElement | null;
  const test = document.getElementById('pen-hap-test') as HTMLButtonElement | null;
  const ok = supported();

  if (sel) {
    sel.value = level;
    sel.disabled = !ok;
    sel.title = ok ? 'Vibration under the nib while drawing' : 'This browser has no vibration API';
    const row = sel.closest('.row');
    if (row) row.classList.toggle('pen-hap-off', !ok);
  }
  if (test) {
    test.disabled = !ok || level === 'off';
    test.title = level === 'off' ? 'Choose a level first' : 'Feel the current level';
  }
  syncStatus();
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

function hookPanel(): void {
  const sel = document.getElementById('pen-hap') as HTMLSelectElement | null;
  if (sel && !sel.dataset.hooked) {
    sel.dataset.hooked = '1';
    sel.addEventListener('change', () => setLevel(sel.value));
  }
  const test = document.getElementById('pen-hap-test') as HTMLButtonElement | null;
  if (test && !test.dataset.hooked) {
    test.dataset.hooked = '1';
    test.addEventListener('click', () => {
      preview();
    });
  }
  syncSelect();
}

function install(): void {
  level = readStored();

  const api = { begin, tick, end, setLevel, level: (): Level => level, supported };
  (window as any).HA = api;
  (window as any).__slateHaptics = {
    ...api,
    syncSelect,
    hookPanel,
    test: preview,
    levels: LEVELS.slice(),
    preset: () => PRESETS[level === 'off' ? 'medium' : level],
    status: statusText,
    state: () => ({ level, active, playing, issued, lastOk, patternMs }),
    reset: () => {
      issued = 0;
      lastOk = null;
      active = false;
      playing = false;
      travelled = 0;
      stopWatchdog();
    },
  };

  hookPanel();

  // The engine owns the stroke lifecycle, but a stroke can also be cancelled
  // out from under it — a second finger starting a pinch sets `cur` to null
  // without ever reaching end(). Clearing here keeps the state machine honest.
  const halt = (): void => end();
  window.addEventListener('pointerup', halt, true);
  window.addEventListener('pointercancel', halt, true);

  // A pattern must not outlive the tab, and a backgrounded page must not buzz.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      end();
      stop();
    }
  });
  window.addEventListener('pagehide', () => {
    end();
    stop();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}

// The stylus panel is built on demand, so the controls may not exist yet.
document.addEventListener('pointerdown', hookPanel, true);
