/**
 * Pen input — browser integration layer over src/pen-logic.ts.
 *
 * Keeps `PENAPI` (consumed by index.html's canvas engine) and
 * `window.__slatePen` (consumed by the Stylus & pen panel and probes) wired to
 * a single `PenEngine` instance, plus window-level capture tracking and OS
 * gesture guards (`touch-action` / `overscroll-behavior`).
 */

import {
  BarrelController,
  LIFT_GRACE,
  PALM_SIZE,
  PenEngine,
  activeSlotOf,
  altitudeOf,
  azimuthOf,
  filterCoalescedSamples,
  kindOf,
  palmSized,
  slotOf,
  tiltOf,
  twistOf,
  type PalmMode,
  type Profile,
  type Slot,
} from './pen-logic';

const PRESSURE_KEY = 'inkpad-prs-v2';
const PALM_KEY = 'inkpad-palm-mode';

const engine = new PenEngine();
const barrel = new BarrelController();

function loadProfiles() {
  try {
    const raw = localStorage.getItem(PRESSURE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const k of ['pen', 'mouse'] as const) {
      const p = parsed?.[k];
      if (!p || typeof p.lo !== 'number' || typeof p.hi !== 'number') continue;
      if (!(p.hi > p.lo)) continue;
      engine.profiles[k] = {
        lo: p.lo,
        hi: p.hi,
        n: Number(p.n) || 0,
        zeroN: 0,
        variable: !!p.variable,
        strokeLo: 1,
        strokeHi: 0,
        strokeN: 0,
        risen: 0,
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
      const keep = (p: Profile) => ({
        lo: p.lo,
        hi: p.hi,
        n: p.n,
        variable: p.variable,
        tilt: p.tilt,
        twist: p.twist,
        altitude: p.altitude,
      });
      localStorage.setItem(
        PRESSURE_KEY,
        JSON.stringify({ pen: keep(engine.profiles.pen), mouse: keep(engine.profiles.mouse) })
      );
    } catch {
      /* private mode: the range just recalibrates next session */
    }
  }, 800);
}

engine.onProfileDirty = saveProfilesSoon;

function loadMode() {
  try {
    const v = localStorage.getItem(PALM_KEY);
    if (v === 'auto' || v === 'pen' || v === 'off') engine.mode = v;
  } catch {
    /* default stands */
  }
}

function setMode(next: PalmMode) {
  engine.mode = next;
  try {
    localStorage.setItem(PALM_KEY, next);
  } catch {
    /* ignore */
  }
  syncLegacyToggle();
  document.dispatchEvent(new CustomEvent('inkpad-palm-mode', { detail: { mode: next } }));
}

function syncLegacyToggle() {
  const box = document.getElementById('po') as HTMLInputElement | null;
  if (box) box.checked = engine.mode === 'pen';
  const sel = document.getElementById('pen-palm') as HTMLSelectElement | null;
  if (sel) sel.value = engine.mode;
  const cv = document.getElementById('cv');
  if (cv) cv.style.touchAction = engine.mode === 'pen' ? 'pan-x pan-y pinch-zoom' : 'none';
}

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
  return filterCoalescedSamples(e, list);
}

let lastPenOnlyToastAt = 0;
const accept = (e: PointerEvent): boolean => {
  const ok = engine.accept(e, performance.now());
  if (
    !ok &&
    engine.lastReason === 'touch:pen-only' &&
    e.type === 'pointerdown' &&
    performance.now() - lastPenOnlyToastAt > 4000
  ) {
    lastPenOnlyToastAt = performance.now();
    try {
      const fn = (window as any).eval('typeof toast==="function"?toast:null');
      if (typeof fn === 'function') {
        fn('Pen only mode is blocking touch — uncheck "Pen only" or switch Palm rejection to Automatic');
      }
    } catch {
      /* ignore */
    }
  }
  return ok;
};
const pressureOf = (e: PointerEvent): number => engine.pressureOf(e);
const hasPressure = (e: PointerEvent): boolean => engine.hasPressure(e);
const note = (e: PointerEvent) => engine.note(e, performance.now());

const CSS = `
#wrap,#cv{touch-action:none;overscroll-behavior:none}
#stage{overscroll-behavior:none}
html,body{overscroll-behavior:none}
#cv{-webkit-tap-highlight-color:transparent}
`;

function boot() {
  loadProfiles();
  loadMode();

  if (!document.getElementById('pen-input-style')) {
    const style = document.createElement('style');
    style.id = 'pen-input-style';
    style.textContent = CSS;
    document.head.append(style);
  }

  const track = (e: PointerEvent) => {
    const kind = kindOf(e);
    if (kind !== 'pen') {
      if (kind === 'mouse') {
        const b = Number(e.button) || 0;
        const bits = Number((e as any).buttons) || 0;
        if (e.type === 'pointerdown') {
          engine.mousePressed = true;
        } else if (e.type === 'pointerup' || e.type === 'pointercancel') {
          engine.mousePressed = false;
        } else if (bits !== 0 && !engine.mousePressed) {
          engine.hoverButtons = true;
        }
        if (engine.mouseIsPen() || b >= 1 || (bits & ~1) !== 0) note(e);
      }
      return;
    }
    engine.penSeen = true;
    note(e);
    if (e.type === 'pointerdown') {
      engine.penDown = true;
      engine.penNear = true;
      engine.lastContact = performance.now();
      engine.lastKind = 'pen';
      engine.begin('pen');
    } else if (e.type === 'pointerup' || e.type === 'pointercancel') {
      engine.penDown = false;
      engine.lastContact = performance.now();
      engine.lastKind = 'pen';
      engine.settle('pen');
    } else {
      const p = Number(e.pressure);
      const touching = e.buttons !== 0 || (Number.isFinite(p) && p > 0 && p !== 0.5);
      engine.penNear = !engine.penDown && !touching;
      if (engine.penDown || touching) engine.lastContact = performance.now();
    }
  };

  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
    window.addEventListener(t, track, true);
  }
  window.addEventListener('blur', () => {
    if (engine.penDown) engine.settle('pen');
    engine.penDown = false;
    engine.penNear = false;
    engine.mousePressed = false;
  });

  const cv = document.getElementById('cv');
  if (cv) {
    cv.addEventListener('lostpointercapture', () => {
      if (engine.penDown) {
        engine.penDown = false;
        engine.settle('pen');
      }
    });
    cv.addEventListener('pointerenter', (e) => {
      if (kindOf(e as PointerEvent) === 'pen') engine.penNear = true;
    });
    cv.addEventListener('pointerleave', (e) => {
      if (kindOf(e as PointerEvent) === 'pen') engine.penNear = false;
    });
    cv.addEventListener(
      'contextmenu',
      (e) => {
        if (
          performance.now() - engine.lastContact < 400 &&
          (engine.lastKind === 'pen' || engine.lastKind === 'touch')
        ) {
          e.preventDefault();
        }
      },
      true
    );
  }

  document.addEventListener(
    'change',
    (e) => {
      const t = e.target as HTMLElement;
      if (t && t.id === 'po') setMode((t as HTMLInputElement).checked ? 'pen' : 'auto');
    },
    true
  );
  document.addEventListener('inkpad-palm-mode', () => syncLegacyToggle());

  const api = (window as any).PENAPI;
  if (api) {
    api.accept = accept;
    api.samples = samples;
    api.pressure = pressureOf;
    api.pressureRaw = (p: number) => engine.normalise('pen', Number(p) || 0);
    api.tilt = tiltOf;
    api.hasPressure = hasPressure;
    api.twist = twistOf;
    api.altitude = altitudeOf;
    api.azimuth = azimuthOf;
    api.note = note;
    api.palmSized = palmSized;
    api.slot = slotOf;
    api.activeSlot = activeSlotOf;
    api.stylusLike = () => engine.stylusLike();
    api.mousePen = () => engine.mouseIsPen();
  }

  (window as any).__slatePen = {
    accept,
    samples,
    pressure: pressureOf,
    normalise: (kind: 'pen' | 'touch' | 'mouse', raw: number) => engine.normalise(kind, raw),
    tilt: tiltOf,
    altitude: altitudeOf,
    azimuth: azimuthOf,
    twist: twistOf,
    hasPressure,
    isZeroPressureFallback: () => engine.isZeroPressureFallback(),
    palmSized,
    note,
    slot: slotOf,
    activeSlot: activeSlotOf,
    barrel: {
      onHover: (slot: Slot, mapped: string, currentTool: string, strokeActive: boolean) =>
        barrel.onHover(slot, mapped, currentTool, performance.now(), strokeActive),
      onStrokeDown: (
        e: PointerEvent,
        slot: Slot,
        mapped: string,
        currentTool: string,
        clientX: number,
        clientY: number
      ) => barrel.onStrokeDown(e, slot, mapped, currentTool, clientX, clientY, performance.now()),
      onStrokeMove: (clientX: number, clientY: number) => barrel.onStrokeMove(clientX, clientY),
      onStrokeUp: (remainingHeldSlot: Slot, currentTool: string) =>
        barrel.onStrokeUp(remainingHeldSlot, currentTool, performance.now()),
      releaseTemporary: (currentTool: string, clearToggle = false) =>
        barrel.releaseTemporary(currentTool, clearToggle),
      isPending: () => barrel.isPending(),
      reset: () => barrel.reset(),
      state: () => ({
        heldSlot: barrel.heldSlot,
        heldTool: barrel.heldTool,
        prevTool: barrel.prevTool,
        used: barrel.used,
        toggled: barrel.toggled ? { ...barrel.toggled } : null,
        pending: barrel.pending ? { ...barrel.pending } : null,
      }),
    },
    stylusLike: () => engine.stylusLike(),
    mousePen: () => engine.mouseIsPen(),
    range: () => engine.range(),
    settle: () => engine.settle('pen'),
    state: () => ({
      mode: engine.mode,
      penSeen: engine.penSeen,
      penDown: engine.penDown,
      penNear: engine.penNear,
      lastContact: engine.lastContact,
      sinceContact: performance.now() - engine.lastContact,
      lastKind: engine.lastKind,
      lastReason: engine.lastReason,
      hoverButtons: engine.hoverButtons,
    }),
    profile: () => ({
      pen: { ...engine.profiles.pen },
      mouse: { ...engine.profiles.mouse },
    }),
    last: () => engine.last,
    palmMode: () => engine.mode,
    setPalmMode: setMode,
    firstPen: () => {
      try {
        if (!localStorage.getItem(PALM_KEY)) setMode('auto');
      } catch {
        setMode('auto');
      }
    },
    reset: () => {
      engine.resetProfiles();
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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
