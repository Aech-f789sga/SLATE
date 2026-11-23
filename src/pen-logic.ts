/**
 * Pure stylus / pointer input logic — zero DOM dependencies so it can be
 * imported directly and unit-tested under Node (`npx tsx --test`).
 */

export type Kind = 'pen' | 'touch' | 'mouse';
export type Slot = '' | 'eraser' | 'barrel1' | 'barrel2';
export type PalmMode = 'auto' | 'pen' | 'off';

export interface PointerLike {
  pointerType?: string;
  pointerId?: number;
  type?: string;
  button?: number;
  buttons?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  twist?: number;
  width?: number;
  height?: number;
  clientX?: number;
  clientY?: number;
  timeStamp?: number;
  getCoalescedEvents?: () => PointerLike[];
}

export interface Profile {
  /** Lowest and highest raw positive pressure observed. */
  lo: number;
  hi: number;
  /** Positive pressure samples folded into the range so far. */
  n: number;
  /** Consecutive contact samples reporting pressure === 0 while n === 0. */
  zeroN: number;
  /** True once the device has shown a real range rather than a constant. */
  variable: boolean;
  /** The stroke in flight: never persisted. */
  strokeLo: number;
  strokeHi: number;
  strokeN: number;
  risen: number;
  /** The device has reported a non-zero tilt at least once. */
  tilt: boolean;
  /** The device has reported a non-zero twist at least once. */
  twist: boolean;
  /** The device reports altitudeAngle directly. */
  altitude: boolean;
}

export interface LastSample {
  kind: Kind;
  pointerType: string;
  pressure: number;
  normalised: number;
  tilt: number;
  tiltX: number;
  tiltY: number;
  altitude: number | null;
  azimuth: number | null;
  twist: number | null;
  buttons: number;
  button: number;
  slot: Slot;
  palm: boolean;
  at: number;
}

export const HALF_PI = Math.PI / 2;
export const FLAT = 1e-4;
export const SETTLE = 24;
export const ZERO_PRESSURE_SAMPLES = 12;
export const FLOOR_RISE = 0.15;
export const PALM_SIZE = 44;
export const LIFT_GRACE = 700;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export function blankProfile(): Profile {
  return {
    lo: 1,
    hi: 0,
    n: 0,
    zeroN: 0,
    variable: false,
    strokeLo: 1,
    strokeHi: 0,
    strokeN: 0,
    risen: 0,
    tilt: false,
    twist: false,
    altitude: false,
  };
}

export function kindOf(e?: PointerLike | null): Kind {
  if (!e) return 'mouse';
  const t = e.pointerType;
  if (t === 'pen' || t === 'eraser') return 'pen';
  if (t === 'touch') return 'touch';
  return 'mouse';
}

export function slotOf(e?: PointerLike | null): Slot {
  if (!e) return '';
  const type = e.pointerType;
  const b = Number(e.button) || 0;
  const bits = Number(e.buttons) || 0;

  if (type === 'pen' || type === 'eraser') {
    if (type === 'eraser' || bits & 32 || b === 5) return 'eraser';
    if (bits & 2 || b === 1) return 'barrel1';
    if (bits & 4 || b === 2) return 'barrel2';
    return '';
  }

  // Mouse numbering: right click (button 2, bit 2) is first barrel,
  // middle click (button 1, bit 4) is second barrel.
  if (bits & 2 || b === 2) return 'barrel1';
  if (bits & 4 || b === 1) return 'barrel2';
  return '';
}

export function isContactSample(e?: PointerLike | null): boolean {
  if (!e) return false;
  const bits = Number(e.buttons) || 0;
  return e.type === 'pointerdown' || (bits & 1) !== 0 || (bits & 32) !== 0;
}

export function altitudeOf(e?: PointerLike | null): number | null {
  if (!e) return null;
  const a = e.altitudeAngle;
  if (typeof a === 'number' && Number.isFinite(a)) return clamp(a, 0, HALF_PI);

  const tx = Number(e.tiltX);
  const ty = Number(e.tiltY);
  if (!Number.isFinite(tx) && !Number.isFinite(ty)) return null;
  if (!tx && !ty) return HALF_PI;

  const rx = clamp(((tx || 0) * Math.PI) / 180, -1.5, 1.5);
  const ry = clamp(((ty || 0) * Math.PI) / 180, -1.5, 1.5);
  const t = Math.hypot(Math.tan(rx), Math.tan(ry));
  return clamp(HALF_PI - Math.atan(t), 0, HALF_PI);
}

export function tiltOf(e?: PointerLike | null): number {
  const alt = altitudeOf(e);
  if (alt === null) return 0;
  return clamp01(1 - alt / HALF_PI);
}

export function azimuthOf(e?: PointerLike | null): number | null {
  if (!e) return null;
  const a = e.azimuthAngle;
  if (typeof a === 'number' && Number.isFinite(a)) return a;
  const tx = Number(e.tiltX);
  const ty = Number(e.tiltY);
  if (!tx && !ty) return null;
  return Math.atan2(ty, tx);
}

export function twistOf(e?: PointerLike | null): number | null {
  if (!e) return null;
  const t = e.twist;
  if (typeof t !== 'number' || !Number.isFinite(t)) return null;
  return (((t % 360) + 360) % 360) * (Math.PI / 180);
}

export function palmSized(e?: PointerLike | null): boolean {
  if (!e) return false;
  const w = Number(e.width) || 0;
  const h = Number(e.height) || 0;
  if (w <= 2 || h <= 2) return false;
  return Math.max(w, h) >= PALM_SIZE;
}

export function filterCoalescedSamples<T extends PointerLike>(
  e: T,
  rawList: T[] | null | undefined
): T[] {
  const list = rawList || [];
  if (!list.length) return [e];

  const parentDist = Math.hypot(Number(e.clientX) || 0, Number(e.clientY) || 0);
  const hasParentCoords =
    typeof e.clientX === 'number' &&
    typeof e.clientY === 'number' &&
    Number.isFinite(e.clientX) &&
    Number.isFinite(e.clientY);

  const out: T[] = [];
  let lastT = -Infinity;
  for (const q of list) {
    if (!q || q.pointerId !== e.pointerId) continue;
    const ts = Number(q.timeStamp);
    if (Number.isFinite(ts) && ts < lastT) continue;
    if (
      typeof q.clientX === 'number' &&
      typeof q.clientY === 'number' &&
      (!Number.isFinite(q.clientX) ||
        !Number.isFinite(q.clientY) ||
        (hasParentCoords && q.clientX === 0 && q.clientY === 0 && parentDist > 32))
    ) {
      continue;
    }
    if (Number.isFinite(ts)) lastT = ts;
    out.push(q);
  }
  if (!out.length) return [e];

  const tail = out[out.length - 1];
  if ((Number(e.timeStamp) || 0) > (Number(tail.timeStamp) || 0)) out.push(e);
  return out;
}

export class PenEngine {
  profiles: Record<Kind, Profile> = {
    pen: blankProfile(),
    mouse: blankProfile(),
    touch: blankProfile(),
  };

  lastLearnedEvent: Record<Kind, PointerLike | null> = { pen: null, touch: null, mouse: null };
  mode: PalmMode = 'auto';
  penSeen = false;
  penDown = false;
  penNear = false;
  lastContact = 0;
  lastKind: Kind = 'mouse';
  lastReason = '';
  hoverButtons = false;
  mousePressed = false;
  last: LastSample | null = null;
  onProfileDirty?: () => void;

  mouseIsPen(): boolean {
    const m = this.profiles.mouse;
    return m.hi - m.lo > FLAT || m.tilt || this.hoverButtons;
  }

  stylusLike(): boolean {
    return this.penSeen || this.mouseIsPen();
  }

  learn(kind: Kind, e: PointerLike): void {
    if (e === this.lastLearnedEvent[kind]) return;
    this.lastLearnedEvent[kind] = e;

    const prof = this.profiles[kind];
    const p = Number(e.pressure);

    // Some styluses (e.g. Deco 640 on Android OTG / Linux / Wintab fallback)
    // report pointerType: 'pen' with pressure: 0 on every contact sample.
    // Ignore hover (buttons === 0); only count active nib/eraser contacts.
    if (Number.isFinite(p) && p === 0 && kind === 'pen' && prof.n === 0 && isContactSample(e)) {
      prof.zeroN++;
    }

    const tiltX = Number(e.tiltX) || 0;
    const tiltY = Number(e.tiltY) || 0;
    if ((tiltX || tiltY) && !prof.tilt) prof.tilt = true;
    if (typeof e.altitudeAngle === 'number' && !prof.altitude) prof.altitude = true;
    if (typeof e.twist === 'number' && e.twist !== 0 && !prof.twist) prof.twist = true;

    if (!Number.isFinite(p) || p <= 0) return;

    prof.zeroN = 0;
    if (p < prof.lo) prof.lo = p;
    if (p > prof.hi) prof.hi = p;
    prof.n++;
    if (p < prof.strokeLo) prof.strokeLo = p;
    if (p > prof.strokeHi) prof.strokeHi = p;
    prof.strokeN++;
    if (!prof.variable && prof.hi - prof.lo > FLAT) prof.variable = true;

    this.onProfileDirty?.();
  }

  begin(kind: Kind): void {
    const prof = this.profiles[kind];
    prof.strokeLo = 1;
    prof.strokeHi = 0;
    prof.strokeN = 0;
  }

  settle(kind: Kind): void {
    const prof = this.profiles[kind];
    if (prof.strokeN < SETTLE) {
      prof.risen = 0;
      return;
    }
    const ss = prof.strokeHi - prof.strokeLo;
    const cs = prof.hi - prof.lo;

    if (cs <= FLAT) {
      if (ss > FLAT) {
        prof.lo = prof.strokeLo;
        prof.hi = prof.strokeHi;
        prof.variable = true;
        this.onProfileDirty?.();
      }
      prof.risen = 0;
      return;
    }

    if (ss <= FLAT || prof.strokeLo <= prof.lo + FLOOR_RISE) {
      prof.risen = 0;
      return;
    }

    prof.risen++;
    if (prof.risen < 2) return;

    prof.lo = prof.strokeLo;
    prof.hi = prof.strokeHi;
    prof.risen = 0;
    this.onProfileDirty?.();
  }

  normalise(kind: Kind, raw: number): number {
    const prof = this.profiles[kind];
    const span = prof.hi - prof.lo;
    if (span <= FLAT) return clamp01(raw);
    return clamp01((raw - prof.lo) / span);
  }

  pressureOf(e: PointerLike): number {
    const kind = kindOf(e);
    const raw = Number(e.pressure);
    if (!Number.isFinite(raw)) return 0.5;
    if (kind !== 'touch') this.learn(kind, e);
    return this.normalise(kind, raw);
  }

  hasPressure(e: PointerLike): boolean {
    const kind = kindOf(e);
    if (kind === 'touch') return false;
    const prof = this.profiles[kind];
    const span = Math.max(prof.hi - prof.lo, prof.strokeHi - prof.strokeLo);
    if (kind === 'mouse') {
      return span > FLAT;
    }
    if (prof.n === 0 && prof.zeroN >= ZERO_PRESSURE_SAMPLES) return false;
    if (prof.n < SETTLE) return true;
    return span > FLAT;
  }

  isZeroPressureFallback(): boolean {
    const p = this.profiles.pen;
    return p.n === 0 && p.zeroN >= ZERO_PRESSURE_SAMPLES;
  }

  note(e: PointerLike, now: number): LastSample {
    const sample: LastSample = {
      kind: kindOf(e),
      pointerType: String(e.pointerType || ''),
      pressure: Number(e.pressure) || 0,
      normalised: this.pressureOf(e),
      tilt: tiltOf(e),
      tiltX: Number(e.tiltX) || 0,
      tiltY: Number(e.tiltY) || 0,
      altitude: altitudeOf(e),
      azimuth: azimuthOf(e),
      twist: twistOf(e),
      buttons: Number(e.buttons) || 0,
      button: Number(e.button) || 0,
      slot: slotOf(e),
      palm: palmSized(e),
      at: now,
    };
    this.last = sample;
    return sample;
  }

  accept(e: PointerLike, now: number): boolean {
    const kind = kindOf(e);
    this.note(e, now);

    if (kind === 'pen') {
      this.penSeen = true;
      this.penNear = true;
      this.lastContact = now;
      this.lastKind = 'pen';
      if (e.type === 'pointerdown') this.penDown = true;
      if (e.type === 'pointerup' || e.type === 'pointercancel') this.penDown = false;
      this.lastReason = 'pen';
      return true;
    }

    if (kind === 'mouse') {
      this.lastKind = 'mouse';
      this.lastReason = 'mouse';
      return true;
    }

    if (this.mode === 'off') {
      this.lastReason = 'touch:mode off';
      return true;
    }
    if (this.mode === 'pen') {
      this.lastReason = 'touch:pen-only';
      return false;
    }
    if (this.penDown) {
      this.lastReason = 'touch:pen is down';
      return false;
    }
    if (this.penSeen && now - this.lastContact < LIFT_GRACE) {
      this.lastReason = 'touch:inside lift grace';
      return false;
    }
    if (this.penNear) {
      this.lastReason = 'touch:pen hovering';
      return false;
    }
    if (palmSized(e)) {
      this.lastReason = 'touch:palm-sized contact';
      return false;
    }
    this.lastKind = 'touch';
    this.lastReason = 'touch:accepted';
    return true;
  }

  range(): { lo: number; hi: number } | null {
    const pick = (p: Profile) => {
      if (p.hi - p.lo > FLAT) return { lo: p.lo, hi: p.hi };
      if (p.strokeHi - p.strokeLo > FLAT) return { lo: p.strokeLo, hi: p.strokeHi };
      return null;
    };
    return pick(this.profiles.pen) || (this.mouseIsPen() ? pick(this.profiles.mouse) : null);
  }

  resetProfiles(): void {
    this.profiles.pen = blankProfile();
    this.profiles.mouse = blankProfile();
    this.lastLearnedEvent.pen = null;
    this.lastLearnedEvent.mouse = null;
  }
}
