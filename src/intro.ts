/**
 * The opening card.
 *
 * A notebook opens with a title page before it opens on a page you can write
 * on, and this is that: the wordmark over the Cozy room, the line that says
 * what the app is, and the address it lives at. Then it lifts and you are in
 * the library.
 *
 * The card itself is plain markup in `index.html`, not built here, and that is
 * deliberate. This is a module: the browser fetches it, parses it, and only
 * then does it run, which on a cold connection is long enough for the library
 * to flash up first. Markup in the document paints on the first frame, so the
 * card is up before anything else is — and its entrance is a CSS animation, so
 * it also survives this module failing to load (a `@keyframes` safety net hides
 * it after twelve seconds either way).
 *
 * What is left for JavaScript is the part CSS cannot do: when to leave, and
 * how to leave early.
 */

const HOLD_MS = 3350;
/** matches the exit transition on #intro in index.html */
const EXIT_MS = 820;

const root = document.getElementById('intro');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** `?nointro` is for screenshots, and for anyone who has seen it enough. */
const skipped = new URLSearchParams(location.search).has('nointro');

let done = false;
const waiters: Array<() => void> = [];

function settle() {
  if (done) return;
  done = true;
  api.done = true;
  waiters.splice(0).forEach((fn) => {
    try {
      fn();
    } catch {
      /* a listener that throws must not strand the others */
    }
  });
  window.dispatchEvent(new CustomEvent('slate:intro-done'));
}

/**
 * Everything that wants to happen *after* the opening — the first-run tour,
 * above all, which would otherwise start underneath the card and be sitting
 * there the moment it lifts, like two greetings at the same door.
 */
const api = {
  done: false,
  whenDone(fn: () => void) {
    if (done) queueMicrotask(fn);
    else waiters.push(fn);
  },
};
(window as any).__slateIntro = api;

let timer = 0;
/** a gesture and the timer can both ask; only the first one counts */
let leaving = false;

function leave() {
  if (!root || done || leaving) return;
  leaving = true;
  window.clearTimeout(timer);
  root.classList.add('in-gone');
  // the card is decorative and on its way out; nothing behind it should be
  // reachable through a fading layer
  root.style.pointerEvents = 'none';
  root.setAttribute('aria-hidden', 'true');

  const gone = () => {
    root.remove();
    settle();
  };
  if (reduced) gone();
  else window.setTimeout(gone, EXIT_MS);
}

function arm() {
  if (!root) {
    settle();
    return;
  }
  if (skipped) {
    root.remove();
    settle();
    return;
  }

  // Any deliberate gesture ends the wait. It is a title card, not a toll gate:
  // someone who came to write something should not have to sit through it.
  const skip = (e: Event) => {
    // a modifier press is someone reaching for a shortcut, not asking to enter
    if (e instanceof KeyboardEvent && (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta')) return;
    leave();
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
    window.addEventListener(type, skip, { capture: true, passive: true });
  }
  window.addEventListener('slate:intro-done', () => {
    for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
      window.removeEventListener(type, skip, { capture: true } as EventListenerOptions);
    }
  }, { once: true });

  // A reduced-motion visitor gets the card held still, and not for long.
  timer = window.setTimeout(leave, reduced ? 1400 : HOLD_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once: true });
else arm();
