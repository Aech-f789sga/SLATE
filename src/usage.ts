/**
 * How long somebody has actually been using Slate.
 *
 * Two different questions live in this file and they must not be confused:
 *
 *   "How much time did this person spend here?"  → `activeSeconds()`
 *   "Is this person here right now?"             → `isIdle()`
 *
 * Both run off one clock, `lastInput`, which any real interaction bumps. The
 * two answers use different cutoffs on purpose:
 *
 *   - time keeps accruing for `ENGAGED_GRACE_MS` (3 min) after the last input,
 *     so a paragraph of reading is not punished, but a tab left open overnight
 *     does not collect eight hours of "usage";
 *   - presence stays online until `IDLE_MS` (15 min) of silence, which is the
 *     rule the admin panel is built around.
 *
 * Wall-clock would have been a one-liner and would have lied: a browser tab is
 * not a person. Nothing here counts while the page is hidden either — a
 * background tab is not usage, and phones fire that constantly.
 *
 * The second job is anonymous visits. A signed-out session is timed the same
 * way and, once it passes ten minutes, is written to `/visitors` exactly once
 * per few minutes. Below ten minutes nothing is written at all, so bounce
 * traffic costs zero writes and the collection *is* the list of engaged
 * visitors the admin panel counts.
 */
import { upsertVisitor } from './services/firebase';

/** Silence after which a session is no longer "online". */
export const IDLE_MS = 15 * 60 * 1000;

/** How long time keeps counting after the last interaction. */
const ENGAGED_GRACE_MS = 3 * 60 * 1000;

/** An anonymous session has to last this long to be recorded at all. */
export const VISIT_QUALIFY_S = 10 * 60;

const SAMPLE_MS = 15_000;
const VISIT_TICK_MS = 30_000;
const VISIT_WRITE_S = 300;
const VISIT_KEY = 'slate-visit';

/* ------------------------------------------------------------------ */
/* Activity clock                                                      */
/* ------------------------------------------------------------------ */

let lastInput = Date.now();
let lastSample = Date.now();
let hiddenSince = document.visibilityState === 'hidden' ? Date.now() : 0;
let activeMs = 0;
let idle = false;

const idleSubs = new Set<(idle: boolean) => void>();

function emitIdle() {
  for (const fn of idleSubs) {
    try {
      fn(idle);
    } catch {
      /* a subscriber must never break the clock */
    }
  }
}

function note() {
  lastInput = Date.now();
  if (idle) {
    idle = false;
    emitIdle();
  }
}

for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
  // capture, because `scroll` does not bubble out of a scrolling element and
  // the canvas is the thing people scroll.
  window.addEventListener(ev, note, { passive: true, capture: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenSince = Date.now();
    return;
  }
  hiddenSince = 0;
  note();
});

function sample() {
  const now = Date.now();
  let end = Math.min(now, lastInput + ENGAGED_GRACE_MS);
  if (hiddenSince) end = Math.min(end, hiddenSince);
  if (end > lastSample) activeMs += end - lastSample;
  lastSample = now;

  const next = now - lastInput >= IDLE_MS;
  if (next !== idle) {
    idle = next;
    emitIdle();
  }
}

window.setInterval(sample, SAMPLE_MS);

/** Total engaged time this page has seen, in whole seconds. */
export function activeSeconds(): number {
  return Math.floor(activeMs / 1000);
}

/** True once the user has been silent for `IDLE_MS`. */
export function isIdle(): boolean {
  return idle;
}

/** Fires when the idle flag flips, not on every input. */
export function onIdleChange(fn: (idle: boolean) => void): () => void {
  idleSubs.add(fn);
  return () => idleSubs.delete(fn);
}

/* ------------------------------------------------------------------ */
/* Anonymous visit                                                     */
/* ------------------------------------------------------------------ */

interface Visit {
  id: string;
  /** First time this session was seen, in ms. */
  f: number;
  /** Seconds already banked by earlier page loads in this session. */
  s: number;
}

let visit: Visit | null = null;
let visitBaseMs = 0;
let visitSaved = 0;
let visitTimer: number | null = null;

function newVisitId(): string {
  return 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function readVisit(): Visit | null {
  try {
    const raw = sessionStorage.getItem(VISIT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.id !== 'string' || typeof v.f !== 'number' || typeof v.s !== 'number') return null;
    if (!/^v_[a-z0-9]{4,36}$/.test(v.id)) return null;
    return { id: v.id, f: v.f, s: Math.max(0, Math.floor(v.s)) };
  } catch {
    return null;
  }
}

function visitSeconds(): number {
  if (!visit) return 0;
  return Math.max(0, Math.round(visit.s + (activeMs - visitBaseMs) / 1000));
}

function persistVisit() {
  if (!visit) return;
  try {
    sessionStorage.setItem(VISIT_KEY, JSON.stringify({ id: visit.id, f: visit.f, s: visitSeconds() }));
  } catch {
    /* private mode, quota — the in-memory count still works */
  }
}

function writeVisit(force = false) {
  if (!visit) return;
  const seconds = visitSeconds();
  if (seconds < VISIT_QUALIFY_S) return;
  if (!force && visitSaved > 0 && seconds - visitSaved < VISIT_WRITE_S) return;
  visitSaved = seconds;
  void upsertVisitor({ id: visit.id, first: visit.f, last: Date.now(), seconds }).catch(() => {});
}

function visitTick() {
  if (!visit) return;
  persistVisit();
  writeVisit();
}

/**
 * Begin timing an anonymous session. Called when auth resolves to "nobody",
 * which includes the ordinary signed-out visit and a later sign-out.
 *
 * The id lives in `sessionStorage`, so a reload continues the same visit
 * instead of inventing a new one; a new tab is a new visit.
 */
export function startVisitor() {
  if (visitTimer !== null) return;
  const prev = readVisit();
  visit = prev || { id: newVisitId(), f: Date.now(), s: 0 };
  visitBaseMs = activeMs;
  visitSaved = 0;
  persistVisit();
  visitTimer = window.setInterval(visitTick, VISIT_TICK_MS);
  window.addEventListener('pagehide', persistVisit);
}

/** Stop timing the anonymous session — the person signed in. */
export function stopVisitor() {
  if (visitTimer === null) return;
  window.clearInterval(visitTimer);
  visitTimer = null;
  writeVisit(true);
  persistVisit();
  window.removeEventListener('pagehide', persistVisit);
  visit = null;
}

/* Debug bridge, same shape as `__inkpad_admin`: enough to answer "why does the
   panel say I used two minutes" from a console, and nothing that is not
   already visible in the panel. */
(window as any).__slate_usage = {
  get active() {
    return activeSeconds();
  },
  get idle() {
    return isIdle();
  },
  get visit() {
    return visit ? { id: visit.id, seconds: visitSeconds() } : null;
  },
};

