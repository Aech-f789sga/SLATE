/**
 * How loud the app is allowed to be, second by second.
 *
 * A page that opens at full volume is startling: the first click of a fresh
 * visit lands like a door slamming in an empty room. So the app has an opening
 * gain, and every sound it makes — the soundtrack, the sample packs, the
 * synthesised clicks — is multiplied by it.
 *
 *   intro    0 → mid      the card is up; the room is filling in
 *   home     mid, held    the card has lifted; you are looking at the shelf
 *   settle   mid → full   slowly, over the next twenty seconds
 *
 * The envelope is deliberately not a setting. `settings.volume` is the level
 * you chose; this is the app *arriving* at it instead of starting there. Moving
 * the volume slider while the ramp is still running moves the ceiling, not the
 * ramp — the envelope is a multiplier, so the two compose.
 *
 * Two details worth knowing:
 *
 *  - It starts at zero, not at "low". Music that begins at a whisper and grows
 *    reads as an entrance; music that begins at 30 % reads as a fade-in effect.
 *    The ramp is eased so the first audible moment lands around the middle of
 *    the intro, which is where the title card wants it.
 *  - It follows the intro through `slate:intro-done`, but it does not depend on
 *    the intro module: if that module never loads, the card still leaves on its
 *    own (the CSS safety net in index.html) and a DOM poll here notices. A
 *    failed title card must not leave the app permanently muted.
 */

type Listener = (gain: number) => void;

/** The level the app sits at once the card has lifted. */
const MID = 0.62;
/** How long the intro takes to lift the gain from silence to MID. */
const INTRO_MS = 3200;
/** The home page holds at MID for a beat before the slow climb starts. */
const HOLD_MS = 1100;
/** MID → the user's own volume. Deliberately long: it should be unnoticed. */
const SETTLE_MS = 20000;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Ease in and out: quiet at the edges, where the ear is most sensitive. */
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

let gain = 1;
let ramp: { from: number; to: number; start: number; dur: number } | null = null;
let frame = 0;
let booted = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(gain);
    } catch {
      /* one bad listener must not stall the ramp */
    }
  });
}

function set(next: number) {
  const v = clamp01(next);
  // a sub-percent step is inaudible and would only churn every subscriber
  if (Math.abs(v - gain) < 0.002) return;
  gain = v;
  emit();
}

function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  ramp = null;
}

function tick(now: number) {
  frame = 0;
  if (!ramp) return;
  const t = ramp.dur <= 0 ? 1 : Math.min(1, (now - ramp.start) / ramp.dur);
  set(ramp.from + (ramp.to - ramp.from) * ease(t));
  if (t < 1) frame = requestAnimationFrame(tick);
  else ramp = null;
}

function rampTo(to: number, dur: number) {
  stop();
  if (dur <= 0) {
    set(to);
    return;
  }
  ramp = { from: gain, to: clamp01(to), start: performance.now(), dur };
  frame = requestAnimationFrame(tick);
}

/** Has the opening card gone? True also when it was never there. */
function cardGone(): boolean {
  const api = (window as any).__slateIntro;
  if (api && api.done) return true;
  return !document.getElementById('intro');
}

function boot() {
  if (booted) return;
  booted = true;

  // `?nointro`, a reduced-motion skip that already happened, or a page whose
  // card was removed before this module ran: no entrance to accompany.
  const skipped = new URLSearchParams(location.search).has('nointro');
  if (skipped || cardGone()) {
    set(1);
    return;
  }

  set(0);
  rampTo(MID, INTRO_MS);

  let handled = false;
  let poll = 0;
  const onDone = () => {
    if (handled) return;
    handled = true;
    window.clearInterval(poll);

    const settle = () => window.setTimeout(() => rampTo(1, SETTLE_MS), HOLD_MS);
    // Someone who skips the card at the two-second mark is still owed the rest
    // of the fade: let the climb to MID finish, then hold, then settle. Cutting
    // to the long ramp here would turn a skipped intro into a twenty-second
    // fade-in, which is not what skipping asks for.
    const running = ramp;
    if (running) {
      const left = Math.max(0, running.start + running.dur - performance.now());
      window.setTimeout(settle, left);
    } else {
      settle();
    }
  };

  window.addEventListener('slate:intro-done', onDone, { once: true });

  // The intro module is the normal path. This is the one where it never
  // arrives: the card still disappears, so the sound must still come up.
  poll = window.setInterval(() => {
    if (cardGone()) onDone();
  }, 400);
  window.setTimeout(() => window.clearInterval(poll), 15000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

export const envelope = {
  /** 0..1 — multiply every volume by this. */
  get gain() {
    return gain;
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** The tour and the probes use this; nothing in the app calls it. */
  jump(to: number) {
    stop();
    set(to);
  },
};

(window as any).__slateEnvelope = {
  gain: () => gain,
  jump: (v: number) => envelope.jump(v),
};
