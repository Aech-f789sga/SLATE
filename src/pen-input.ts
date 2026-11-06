/**
 * Pen input — the one place that decides what a pointer event means.
 *
 * The engine used to answer three questions inline, in three different ways:
 * whether a touch was a palm, how hard the pen was pressing, and how far it was
 * tilted. Each answer had a failure mode that only shows up on real hardware,
 * and none of them could be fixed without editing the drawing loop.
 *
 * So they live here, behind four functions:
 *
 *   accept(e)    may this pointer draw at all?     (palm rejection)
 *   samples(e)   every coalesced sample, in order
 *   pressure(e)  0…1, normalised per device class
 *   tilt(e)      0…1, 0 = perpendicular, 1 = flat on the glass
 *
 * The engine keeps calling the same hooks it always did (`prOn`, `pw`,
 * `normP`); they now delegate here. Brush behaviour on a mouse is byte-for-byte
 * unchanged, and a pen gets a correct curve instead of an approximation.
 *
 * Why a separate module rather than more inline JS: the three questions share
 * state. A pen that has just lifted must block a palm *and* tell the pressure
 * model that a new stroke began, and the only way to keep those two from
 * drifting apart is to put them in one file.
 */

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type Kind = 'pen' | 'touch' | 'mouse';

/**
 * What we have learned about one class of input device.
 *
 * Kept per pointerType rather than globally. The old code had a single
 * `{min,max}` record shared between the pen and the mouse, so a mouse's
 * constant 0.5 dragged the pen's range down and every stroke came out flat.
 */
interface Profile {
  /** Lowest and highest raw pressure observed. */
  lo: number;
  hi: number;
  /** Samples folded into the range so far. */
  n: number;
  /** True once the device has shown a real range rather than a constant. */
  variable: boolean;
  /** The device has reported a non-zero tilt at least once. */
  tilt: boolean;
  /** The device has reported a non-zero twist at least once. */
  twist: boolean;
  /** The device reports altitudeAngle directly. */
  altitude: boolean;
}

/** Palm rejection modes. `auto` is the default and the only interesting one. */
type PalmMode = 'auto' | 'pen' | 'off';

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const HALF_PI = Math.PI / 2;

function blank(): Profile {
  return { lo: 1, hi: 0, n: 0, variable: false, tilt: false, twist: false, altitude: false };
}

function kindOf(e: PointerEvent): Kind {
  const t = (e as any).pointerType;
  // `eraser` is a pen whose far end is against the glass. Same sensor, same
  // pressure range, same palm problem — treating it separately would mean
  // calibrating the same pen twice.
  if (t === 'pen' || t === 'eraser') return 'pen';
  if (t === 'touch') return 'touch';
  return 'mouse';
}

/* ------------------------------------------------------------------ */
/* Pressure                                                           */
/* ------------------------------------------------------------------ */

const PRESSURE_KEY = 'inkpad-prs-v2';

const profiles: Record<Kind, Profile> = { pen: blank(), mouse: blank(), touch: blank() };

/**
 * Restore the learned ranges.
 *
 * Keyed per device class. A pen and a mouse on the same machine have nothing in
 * common, and a bucket they share is a bucket that is wrong for both.
 */
function loadProfiles() {
  try {
    const raw = localStorage.getItem(PRESSURE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const k of ['pen', 'mouse'] as const) {
      const p = parsed?.[k];
      if (!p || typeof p.lo !== 'number' || typeof p.hi !== 'number') continue;
      if (!(p.hi > p.lo)) continue;
      profiles[k] = {
        lo: p.lo,
        hi: p.hi,
        n: Number(p.n) || 0,
        variable: !!p.variable,
        tilt: !!p.tilt,
        twist: !!p.twist,
        altitude: !!p.altitude,
      };
    }
  } catch {
    /* a corrupt record is the same as no record */
  }
}

let saveTimer = 0;
function saveProfilesSoon() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    try {
      localStorage.setItem(PRESSURE_KEY, JSON.stringify({ pen: profiles.pen, mouse: profiles.mouse }));
    } catch {
      /* private mode: the range just recalibrates next session */
    }
  }, 800);
}

/**
 * Fold one sample into a device's range.
 *
 * The range only ever grows. Shrinking it — which the old code did with a
 * `max * .9998` decay on every event — makes the span collapse *while you are
 * drawing*, so the stroke gets thinner and thicker for no reason the user can
 * see. Growing only is monotonic, stable, and converges after a few strokes.
 */
const lastLearned: Record<Kind, number> = { pen: -1, touch: -1, mouse: -1 };

function learn(kind: Kind, e: PointerEvent) {
  // The same event reaches us from the capture-phase tracker, from `accept` and
  // from `pressure()` in the brush loop. Counting it three times would inflate
  // the sample total and make the "enough evidence yet" test fire early.
  const ts = Number((e as any).timeStamp) || 0;
  if (ts && ts === lastLearned[kind]) return;
  if (ts) lastLearned[kind] = ts;

  const p = Number((e as any).pressure);
  if (!Number.isFinite(p) || p <= 0) return;
  const prof = profiles[kind];
  if (p < prof.lo) prof.lo = p;
  if (p > prof.hi) prof.hi = p;
  prof.n++;
  if (!prof.variable && prof.n > 6 && prof.hi - prof.lo > 0.06) prof.variable = true;

  const tiltX = Number((e as any).tiltX) || 0;
  const tiltY = Number((e as any).tiltY) || 0;
  if ((tiltX || tiltY) && !prof.tilt) prof.tilt = true;
  if (typeof (e as any).altitudeAngle === 'number' && !prof.altitude) prof.altitude = true;
  if (typeof (e as any).twist === 'number' && (e as any).twist !== 0 && !prof.twist) prof.twist = true;

  saveProfilesSoon();
}

/**
 * Raw pressure → 0…1 against a known range, with no side effects.
 *
 * Split out from `pressureOf` so tests — and any future calibration UI — can
 * ask "what would 0.6 read as?" without that question changing the answer.
 */
function normalise(kind: Kind, raw: number): number {
  const prof = profiles[kind];
  if (!prof.variable) return clamp01(raw);
  const span = prof.hi - prof.lo;
  if (span < 1e-6) return clamp01(raw);
  return clamp01((raw - prof.lo) / span);
}

/**
 * Raw pressure → 0…1 for this device, learning the range as it goes.
 *
 * When the device has not shown a real range the raw value is passed straight
 * through: a mouse's constant 0.5 then reads as 0.5, which the brush treats as
 * "no opinion" and blends with speed. Scaling it to the middle of an imaginary
 * range would invent a curve that is not there.
 */
function pressureOf(e: PointerEvent): number {
  const kind = kindOf(e);
  const raw = Number((e as any).pressure);
  if (!Number.isFinite(raw)) return 0.5;
  // Touch pressure is either absent or a hard-coded 1; learning it would let a
  // finger drag a pen's range around.
  if (kind !== 'touch') learn(kind, e);
  return normalise(kind, raw);
}

/**
 * Does this device actually report pressure worth using?
 *
 * The tricky case is the first stroke. Nothing has been learned yet, and
 * answering "no" would flatten the first thing the user draws. So an
 * uncalibrated pen is given the benefit of the doubt and only demoted once
 * there is enough evidence — 24 samples of a constant value.
 */
function hasPressure(e: PointerEvent): boolean {
  if (mode === 'off') return false;
  const kind = kindOf(e);
  if (kind === 'touch') return false;
  const prof = profiles[kind];
  if (kind === 'mouse') {
    // A plain mouse is constant 0.5 and must never drive width; a tablet that
    // presents as a mouse but reports a range is allowed through.
    return prof.variable;
  }
  if (prof.n < 24) return true;
  return prof.variable;
}

/* ------------------------------------------------------------------ */
/* Geometry: tilt, altitude, azimuth, twist                           */
/* ------------------------------------------------------------------ */

/**
 * Angle between the pen and the glass, in radians. 0 = flat, π/2 = upright.
 *
 * `altitudeAngle` is the authoritative value and every engine that reports
 * tilt at all now reports it, but Windows Ink on older drivers only sends
 * `tiltX`/`tiltY`. Deriving altitude from those is exact, not an
 * approximation — the spec defines the three as the same vector in different
 * clothes:
 *
 *     altitude = π/2 − atan( hypot( tan(tiltX), tan(tiltY) ) )
 *
 * The `tan` is clamped away from ±π/2 because a pen held exactly edge-on
 * reports tiltX = ±90 and `tan` would run to infinity.
 */
function altitudeOf(e: PointerEvent): number | null {
  const a = (e as any).altitudeAngle;
  if (typeof a === 'number' && Number.isFinite(a)) return clamp(a, 0, HALF_PI);

  const tx = Number((e as any).tiltX);
  const ty = Number((e as any).tiltY);
  if (!Number.isFinite(tx) && !Number.isFinite(ty)) return null;
  if (!tx && !ty) return HALF_PI; // both zero means upright, not unknown

  const rx = clamp(((tx || 0) * Math.PI) / 180, -1.5, 1.5);
  const ry = clamp(((ty || 0) * Math.PI) / 180, -1.5, 1.5);
  const t = Math.hypot(Math.tan(rx), Math.tan(ry));
  return clamp(HALF_PI - Math.atan(t), 0, HALF_PI);
}

/**
 * Tilt as 0…1, where 0 is upright and 1 is lying flat.
 *
 * This is the number the brush wants, and it is not the same as tilt
 * magnitude. A pen at 45° in any direction reads 0.5 here; the old
 * `hypot(tiltX, tiltY) / 70` read 0.64 for the same pen and clipped to 1 well
 * before the pen was actually flat.
 */
function tiltOf(e: PointerEvent): number {
  const alt = altitudeOf(e);
  if (alt === null) return 0;
  return clamp01(1 - alt / HALF_PI);
}

/** Where the pen points, clockwise from "up the page", in radians. */
function azimuthOf(e: PointerEvent): number | null {
  const a = (e as any).azimuthAngle;
  if (typeof a === 'number' && Number.isFinite(a)) return a;
  const tx = Number((e as any).tiltX);
  const ty = Number((e as any).tiltY);
  if (!tx && !ty) return null;
  return Math.atan2(ty, tx);
}

/**
 * Rotation of the pen about its own axis, in radians, or null.
 *
 * Only Windows Ink pens with a rotation sensor report this. Apple Pencil and
 * every Android stylus I have tested return undefined, so nothing may depend
 * on it — a chisel brush can use it when present and fall back to azimuth
 * when it is not.
 */
function twistOf(e: PointerEvent): number | null {
  const t = (e as any).twist;
  if (typeof t !== 'number' || !Number.isFinite(t)) return null;
  // The spec says 0…359 clockwise; normalise so 0 and 359 agree.
  return (((t % 360) + 360) % 360) * (Math.PI / 180);
}

/* ------------------------------------------------------------------ */
/* Palm rejection                                                     */
/* ------------------------------------------------------------------ */

const PALM_KEY = 'inkpad-palm-mode';

/** A contact wider than this is a palm or a knuckle, not a fingertip. */
const PALM_SIZE = 44;

/** How long touch stays blocked after the pen lifts. */
const LIFT_GRACE = 700;

let mode: PalmMode = 'auto';

let penSeen = false;
let penDown = false;
let penNear = false;
let lastContact = 0;
let lastKind: Kind = 'mouse';
/** Why the last `accept` said no — surfaced in diagnostics, not in the UI. */
let lastReason = '';

function loadMode() {
  try {
    const v = localStorage.getItem(PALM_KEY);
    if (v === 'auto' || v === 'pen' || v === 'off') mode = v;
  } catch {
    /* default stands */
  }
}

function setMode(next: PalmMode) {
  mode = next;
  try {
    localStorage.setItem(PALM_KEY, next);
  } catch {
    /* ignore */
  }
  syncLegacyToggle();
  document.dispatchEvent(new CustomEvent('inkpad-palm-mode', { detail: { mode } }));
}

/**
 * The toolbar's "Pen only" checkbox is the quick toggle; the pen panel's select
 * is the precise one. Keep them agreeing without either owning the other.
 *
 * The checkbox has a second job in the engine — it hands touch back to the
 * browser for scrolling — so that has to be mirrored here too, or choosing
 * "Pen only" from the panel would leave the page unscrollable by finger.
 */
function syncLegacyToggle() {
  const box = document.getElementById('po') as HTMLInputElement | null;
  if (box) box.checked = mode === 'pen';
  const sel = document.getElementById('pen-palm') as HTMLSelectElement | null;
  if (sel) sel.value = mode;
  const cv = document.getElementById('cv');
  if (cv) cv.style.touchAction = mode === 'pen' ? 'pan-x pan-y pinch-zoom' : 'none';
}

/**
 * Is this touch contact physically too large to be a finger?
 *
 * `width`/`height` are the contact ellipse in CSS px. The values are only
 * trustworthy on Chrome/Android — iOS reports tiny numbers and some Android
 * builds report 1 — so a small or missing value is treated as "unknown", never
 * as "definitely a fingertip". This is a veto, never a requirement.
 */
function palmSized(e: PointerEvent): boolean {
  const w = Number((e as any).width) || 0;
  const h = Number((e as any).height) || 0;
  if (w <= 2 || h <= 2) return false;
  return Math.max(w, h) >= PALM_SIZE;
}

/**
 * May this pointer draw?
 *
 * The pen is the authority whenever it is anywhere near the screen. A palm
 * resting on the glass produces a `touch` pointer that is indistinguishable
 * from a fingertip by type alone, so the decision is made from context:
 *
 *  1. the user has said "pen only"                    → always no
 *  2. the pen tip is down right now                   → no
 *  3. the pen lifted less than LIFT_GRACE ago         → no
 *  4. the pen is hovering above the canvas            → no
 *  5. the contact is palm-sized                       → no
 *
 * Two-finger pan and pinch are deliberately unaffected: they are handled by a
 * capture-phase listener that never consults this function, so a rejected
 * single touch cannot take the zoom gesture down with it.
 */
function accept(e: PointerEvent): boolean {
  const kind = kindOf(e);
  const now = performance.now();
  note(e);

  if (kind === 'pen') {
    penSeen = true;
    penNear = true;
    lastContact = now;
    lastKind = 'pen';
    if (e.type === 'pointerdown') penDown = true;
    if (e.type === 'pointerup' || e.type === 'pointercancel') penDown = false;
    lastReason = 'pen';
    return true;
  }

  if (kind === 'mouse') {
    lastKind = 'mouse';
    lastReason = 'mouse';
    return true;
  }

  // ---- touch ----
  if (mode === 'off') {
    lastReason = 'touch:mode off';
    return true;
  }
  if (mode === 'pen') {
    lastReason = 'touch:pen-only';
    return false;
  }
  if (penDown) {
    lastReason = 'touch:pen is down';
    return false;
  }
  if (penSeen && now - lastContact < LIFT_GRACE) {
    lastReason = 'touch:inside lift grace';
    return false;
  }
  if (penNear) {
    lastReason = 'touch:pen hovering';
    return false;
  }
  if (palmSized(e)) {
    lastReason = 'touch:palm-sized contact';
    return false;
  }
  lastKind = 'touch';
  lastReason = 'touch:accepted';
  return true;
}

/* ------------------------------------------------------------------ */
/* Coalesced sampling                                                 */
/* ------------------------------------------------------------------ */

/**
 * Every sample the OS captured between two animation frames, in order.
 *
 * A 240 Hz digitiser produces roughly four samples per 60 Hz frame. Reading
 * only `pointermove` throws three of them away and turns a smooth curve into a
 * polyline; `getCoalescedEvents` gives them back with their own pressure and
 * tilt, which is the difference between a stroke that tapers and one that
 * steps.
 *
 * The list is filtered and de-duplicated because it is not contractually
 * clean: a stale list from a previous pointer id, or two samples sharing a
 * timestamp, would otherwise fold a point from the last stroke into this one.
 */
function samples(e: PointerEvent): PointerEvent[] {
  let list: PointerEvent[] = [];
  const get = (e as any).getCoalescedEvents;
  if (typeof get === 'function') {
    try {
      list = get.call(e) || [];
    } catch {
      list = [];
    }
  }
  if (!list.length) return [e];

  const out: PointerEvent[] = [];
  let lastT = -Infinity;
  for (const q of list) {
    if (!q || q.pointerId !== e.pointerId) continue;
    if (q.timeStamp < lastT) continue; // out of order: a frame boundary artefact
    lastT = q.timeStamp;
    out.push(q);
  }
  if (!out.length) return [e];

  // The spec says the list ends with the current event. If a platform disagrees
  // the stroke would run one frame behind the nib, so append it when it is
  // genuinely newer rather than assuming.
  const tail = out[out.length - 1];
  if (e.timeStamp > tail.timeStamp) out.push(e);
  return out;
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                        */
/* ------------------------------------------------------------------ */

interface LastSample {
  kind: Kind;
  pressure: number;
  normalised: number;
  tilt: number;
  altitude: number | null;
  azimuth: number | null;
  twist: number | null;
  palm: boolean;
  at: number;
}

let last: LastSample | null = null;

function note(e: PointerEvent) {
  last = {
    kind: kindOf(e),
    pressure: Number((e as any).pressure) || 0,
    normalised: pressureOf(e),
    tilt: tiltOf(e),
    altitude: altitudeOf(e),
    azimuth: azimuthOf(e),
    twist: twistOf(e),
    palm: palmSized(e),
    at: performance.now(),
  };
}

/* ------------------------------------------------------------------ */
/* CSS                                                                */
/* ------------------------------------------------------------------ */

/**
 * The page has to own the gesture, not the browser.
 *
 * `touch-action: none` on the canvas stops scroll and double-tap zoom on the
 * stroke surface. `overscroll-behavior: none` on the scroll container stops
 * the two gestures `touch-action` cannot: pull-to-refresh on Android, and the
 * iOS rubber-band, which otherwise steals a stroke that starts while the page
 * is already scrolled to the top.
 */
const CSS = `
#wrap,#cv{touch-action:none;overscroll-behavior:none}
#stage{overscroll-behavior:none}
html,body{overscroll-behavior:none}
#cv{-webkit-tap-highlight-color:transparent}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

function boot() {
  loadProfiles();
  loadMode();

  const style = document.createElement('style');
  style.id = 'pen-input-style';
  style.textContent = CSS;
  document.head.append(style);

  /**
   * Track pen presence from the window, in capture phase.
   *
   * Capture matters: the canvas may stop propagation on a press it claims, and
   * a palm decision that depends on "did a pen move recently" has to see every
   * pen event even when the canvas is not the one consuming it.
   *
   * Hover is separated from contact on purpose. A hovering S Pen should block
   * a palm, but it must not start the lift timer — otherwise merely holding the
   * pen above the glass would lock out touch drawing indefinitely.
   */
  const track = (e: PointerEvent) => {
    const kind = kindOf(e);
    if (kind !== 'pen') return;
    penSeen = true;
    note(e);
    if (e.type === 'pointerdown') {
      penDown = true;
      penNear = true;
      lastContact = performance.now();
      lastKind = 'pen';
    } else if (e.type === 'pointerup' || e.type === 'pointercancel') {
      penDown = false;
      lastContact = performance.now();
      lastKind = 'pen';
    } else {
      // move without a button is hover
      penNear = e.buttons === 0;
      if (!penNear) lastContact = performance.now();
    }
  };

  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
    window.addEventListener(t, track, true);
  }

  const cv = document.getElementById('cv');
  if (cv) {
    cv.addEventListener('pointerenter', (e) => {
      if (kindOf(e as PointerEvent) === 'pen') penNear = true;
    });
    cv.addEventListener('pointerleave', (e) => {
      if (kindOf(e as PointerEvent) === 'pen') penNear = false;
    });
    // A long press on the canvas raises the text-selection menu on Android even
    // with `touch-action: none`. Suppress it only in the tail of a real stroke,
    // so a deliberate long-press elsewhere still behaves.
    cv.addEventListener(
      'contextmenu',
      (e) => {
        if (performance.now() - lastContact < 400 && (lastKind === 'pen' || lastKind === 'touch')) {
          e.preventDefault();
        }
      },
      true
    );
  }

  // The toolbar checkbox and the panel select are the same setting.
  //
  // Capture phase, because a `change` event synthesised with `new Event(...)`
  // does not bubble — and the app dispatches one itself when it syncs the
  // checkbox from elsewhere. Capture still visits every ancestor, so both a
  // real click and a programmatic nudge land here.
  document.addEventListener(
    'change',
    (e) => {
      const t = e.target as HTMLElement;
      if (t && t.id === 'po') setMode((t as HTMLInputElement).checked ? 'pen' : 'auto');
    },
    true
  );
  document.addEventListener('inkpad-palm-mode', () => syncLegacyToggle());

  /**
   * Hand the engine the real implementations.
   *
   * The inline script installs fallbacks that reproduce the old behaviour, so a
   * failed module load degrades to "pen only is a checkbox" rather than a dead
   * canvas. Replacing the methods in place keeps every existing call site
   * working without touching them.
   */
  const api = (window as any).PENAPI;
  if (api) {
    api.accept = accept;
    api.samples = samples;
    api.pressure = pressureOf;
    api.pressureRaw = (p: number) => pressureOf({ pressure: p, pointerType: 'pen' } as any);
    api.tilt = tiltOf;
    api.hasPressure = hasPressure;
    api.twist = twistOf;
    api.altitude = altitudeOf;
    api.azimuth = azimuthOf;
    api.note = note;
    api.palmSized = palmSized;
  }

  (window as any).__slatePen = {
    accept,
    samples,
    pressure: pressureOf,
    /** Pure: no learning, no side effects. Used by tests and calibration UI. */
    normalise,
    tilt: tiltOf,
    altitude: altitudeOf,
    azimuth: azimuthOf,
    twist: twistOf,
    hasPressure,
    palmSized,
    note,
    /** Current palm state, for probes and for the pen test panel. */
    state: () => ({
      mode,
      penSeen,
      penDown,
      penNear,
      lastContact,
      sinceContact: performance.now() - lastContact,
      lastKind,
      lastReason,
    }),
    /** What has been learned about each device class. */
    profile: () => ({
      pen: { ...profiles.pen },
      mouse: { ...profiles.mouse },
    }),
    last: () => last,
    palmMode: () => mode,
    setPalmMode: setMode,
    /**
     * Called the first time a pen is seen. Adopts `auto` only when the user has
     * never expressed a preference — silently overriding a deliberate "off"
     * would be the app deciding it knows better.
     */
    firstPen: () => {
      if (!localStorage.getItem(PALM_KEY)) setMode('auto');
    },
    reset: () => {
      profiles.pen = blank();
      profiles.mouse = blank();
      try {
        localStorage.removeItem(PRESSURE_KEY);
      } catch {
        /* ignore */
      }
    },
    LIFT_GRACE,
    PALM_SIZE,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
