/**
 * One nib, three places to change it.
 *
 * The floating pill's three dots, the brush popover's slider and the dock's
 * millimetre control all describe the same nib. They used to be three private
 * copies of the number: the pill wrote the engine's `size`, the dock wrote
 * `size` from its own `mm`, and the highlighter tab wrote `size` for whichever
 * tool happened to be active — so adjusting the highlighter while a pen was
 * selected changed the pen and left the highlighter alone. This module is the
 * single record they all read and write.
 *
 * Two units, one of them real:
 *
 *   • **engine units** — the number the engine's `size` variable holds, and the
 *     number a stroke is painted with. That is what is stored here.
 *   • **millimetres** — how a nib is described to a person. A page is 800 units
 *     wide for 210 mm of paper, so 1 mm is `PX_PER_MM` units. The highlighter
 *     renderer multiplies its width by four, so 1 mm of highlighter is a
 *     quarter of 1 mm of pen in engine units; that is what `HL_SCALE` undoes.
 *
 * The engine's tool is the authority on *which* width is in play. `adopt()` is
 * how the engine's own size control is absorbed back into the record, and
 * `apply()` is how a change is pushed out to it.
 */

/** The four tools whose width the pill and the dock both care about. */
export type InkTool = 'pen' | 'hl' | 'er' | 'pe';

/** Page units per millimetre: an A4 page is 800 × 1131 units for 210 × 297 mm. */
export const PX_PER_MM = 800 / 210;

/** The highlighter renderer multiplies its width by four. */
export const HL_SCALE = 4;

/** The engine refuses anything outside this, so the record does too. */
const MIN_W = 0.4;
const MAX_W = 240;

const KEY = 'inkpad-widths';

interface ToolWidth {
  /** Engine units — what the engine paints with. */
  w: number;
  /** The three dots, in engine units. */
  s: number[];
}

const DEFAULTS: Record<InkTool, ToolWidth> = {
  pen: { w: 4, s: [2, 4, 7] },
  pe: { w: 4, s: [2, 4, 7] },
  hl: { w: 14, s: [8, 14, 22] },
  er: { w: 20, s: [10, 20, 34] },
};

const TOOLS: InkTool[] = ['pen', 'hl', 'er', 'pe'];

function clone(src: Record<InkTool, ToolWidth>): Record<InkTool, ToolWidth> {
  const out = {} as Record<InkTool, ToolWidth>;
  for (const t of TOOLS) out[t] = { w: src[t].w, s: src[t].s.slice() };
  return out;
}

let table = clone(DEFAULTS);

/* ------------------------------------------------------------------ */
/* Engine access                                                       */
/* ------------------------------------------------------------------ */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T | null;
  } catch {
    return null;
  }
}

function clampW(v: number): number {
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(v * 1000) / 1000));
}

/** The engine's tool, verbatim — `''` when there is no engine yet. */
export function engineTool(): string {
  return ev<string>('tool') || '';
}

export function isInkTool(t: string): t is InkTool {
  return t === 'pen' || t === 'hl' || t === 'er' || t === 'pe';
}

/** The engine's tool as one of the four, defaulting to the pen. */
export function activeTool(): InkTool {
  const t = engineTool();
  return isInkTool(t) ? t : 'pen';
}

/* ------------------------------------------------------------------ */
/* Millimetres                                                         */
/* ------------------------------------------------------------------ */

/** Engine units → millimetres of nib. */
export function mmOf(t: InkTool, units = table[t].w): number {
  const px = t === 'hl' ? units * HL_SCALE : units;
  return px / PX_PER_MM;
}

/** Millimetres of nib → engine units. */
export function unitsOf(t: InkTool, mm: number): number {
  const px = mm * PX_PER_MM;
  return clampW(t === 'hl' ? px / HL_SCALE : px);
}

/** A label that does not pretend to a precision the nib does not have. */
export function mmLabel(mm: number): string {
  if (!Number.isFinite(mm)) return '—';
  if (mm < 1) return mm.toFixed(2) + ' mm';
  return mm.toFixed(mm < 10 ? 1 : 0) + ' mm';
}

/* ------------------------------------------------------------------ */
/* The record                                                          */
/* ------------------------------------------------------------------ */

export function width(t: InkTool): number {
  return table[t].w;
}

export function steps(t: InkTool): number[] {
  return table[t].s.slice();
}

export function setSteps(t: InkTool, list: number[]) {
  const clean = list
    .map((v) => clampW(Number(v)))
    .filter((v) => Number.isFinite(v))
    .slice(0, 3);
  if (clean.length !== 3) return;
  table[t].s = clean;
  save();
  emit(t);
}

export function resetSteps(t: InkTool) {
  table[t].s = DEFAULTS[t].s.slice();
  save();
  emit(t);
}

export function resetAll() {
  table = clone(DEFAULTS);
  save();
  for (const t of TOOLS) emit(t);
}

/**
 * Record a width and push it to the engine when that tool is the one in hand.
 *
 * `apply: false` is for callers that are already writing `setBrush` themselves
 * inside a single engine call — the dock does, because it sets the tool, the
 * colour and the width together and a second trip into the engine would only
 * give the repaint a chance to see a half-applied state.
 */
export function setWidth(t: InkTool, v: number, opts: { apply?: boolean } = {}) {
  const next = clampW(v);
  const moved = Math.abs(next - table[t].w) > 1e-6;
  if (moved) {
    table[t].w = next;
    save();
  }
  if (opts.apply !== false) apply(t);
  if (moved) emit(t);
}

/**
 * Absorb a width the engine arrived at by itself.
 *
 * The engine still owns a size control of its own; when that moves, the record
 * follows it rather than arguing with it. Silent on purpose: no repaint loop.
 */
export function adopt(t: InkTool, v: number) {
  const next = clampW(v);
  if (Math.abs(next - table[t].w) < 1e-6) return;
  table[t].w = next;
  save();
}

/** Push the recorded width for `t` into the engine, if `t` is in hand. */
export function apply(t: InkTool = activeTool()) {
  if (engineTool() !== t) return;
  ev(`(function(){ try { setBrush(${table[t].w}, 1); } catch(e){} })()`);
}

/** Push the recorded width for whatever tool is active. */
export function applyActive() {
  apply(activeTool());
}

/* ------------------------------------------------------------------ */
/* Listeners                                                           */
/* ------------------------------------------------------------------ */

const listeners: ((t: InkTool) => void)[] = [];
let firing = false;

/**
 * Called whenever a width or a step list changes. Re-entrant calls are dropped:
 * a listener that writes back through `setWidth` (the dock does, to keep its
 * slot in step) must not bounce forever.
 */
export function onWidth(f: (t: InkTool) => void): () => void {
  listeners.push(f);
  return () => {
    const i = listeners.indexOf(f);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function emit(t: InkTool) {
  if (firing) return;
  firing = true;
  try {
    for (const f of listeners) {
      try {
        f(t);
      } catch {
        /* a bad listener must not stop the rest */
      }
    }
  } finally {
    firing = false;
  }
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(table));
  } catch {
    /* private mode: the session keeps its widths, the next one starts over */
  }
}

(function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const t of TOOLS) {
      const row = parsed && parsed[t];
      if (!row) continue;
      if (Number.isFinite(Number(row.w))) table[t].w = clampW(Number(row.w));
      if (Array.isArray(row.s) && row.s.length === 3) {
        const s = row.s.map((v: any) => clampW(Number(v)));
        if (s.every((v: number) => Number.isFinite(v))) table[t].s = s;
      }
    }
  } catch {
    /* defaults */
  }
})();

/* ------------------------------------------------------------------ */
/* Bridge                                                              */
/* ------------------------------------------------------------------ */

(window as any).__inkpad_widths = {
  width,
  steps,
  setWidth,
  setSteps,
  resetSteps,
  mmOf,
  unitsOf,
  active: activeTool,
  PX_PER_MM,
  HL_SCALE,
};
