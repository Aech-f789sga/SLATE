/**
 * Which of the "smart ink" features are switched on.
 *
 * All three default to off, and that is deliberate. They are the loudest things
 * this app can do — an equals sign opening a calculator over your work, a lasso
 * quietly turning handwriting into a text box — and a notebook should not start
 * by surprising you. Nothing here runs unless it was asked for.
 *
 * The flags live in their own module rather than in the paper prefs so that the
 * feature code (lasso, auto-calc) can ask "am I allowed to run?" without
 * importing the whole paper renderer.
 */

export type SmartKey = 'calc' | 'toText' | 'toLatex';

const KEY = 'inkpad-smart';

const state: Record<SmartKey, boolean> = {
  calc: false,
  toText: false,
  toLatex: false,
};

let loaded = false;

export function loadSmart() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    for (const k of ['calc', 'toText', 'toLatex'] as SmartKey[]) {
      if (typeof p[k] === 'boolean') state[k] = p[k];
    }
  } catch {
    /* defaults */
  }
}

export function smartOn(k: SmartKey): boolean {
  loadSmart();
  return state[k];
}

export function setSmart(k: SmartKey, v: boolean) {
  state[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  notify();
}

/** True when anything ink-to-something is enabled. */
export function anySmart(): boolean {
  loadSmart();
  return state.calc || state.toText || state.toLatex;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onSmartChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener must not break the toggle */
    }
  }
}
