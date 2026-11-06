/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * In-app update check.
 *
 * Every build publishes `version.json` next to the app (see `emitVersion` in
 * vite.config.ts) and bakes its own id in as `__SLATE_VERSION__`. Comparing the
 * two tells a running client whether the deploy it is using has been replaced.
 *
 * The service worker precaches index.html, so a running client keeps executing
 * the build it booted with even after a newer one is deployed. That gap is what
 * makes an "update available" prompt meaningful: the new files are already on
 * the server, we just decide *when* to throw away the cached copy and reload.
 *
 * Deliberately quiet while the user is working: the card only appears on the
 * library screen, never over a note, and hides itself the moment a note opens.
 */

declare const __SLATE_VERSION__: string;

const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000; // how often to look for a new build
const SNOOZE_MS = 3 * 60 * 60 * 1000; // "Later" buys one more interval
const FIRST_CHECK_DELAY_MS = 8000; // let the app paint before touching the network
const HOME_POLL_MS = 1000; // how often to re-evaluate whether the card may show

const LS_LAST = 'slate.upd.last';
const LS_SNOOZE = 'slate.upd.snooze';

const LOCAL_VERSION =
  typeof __SLATE_VERSION__ === 'string' ? __SLATE_VERSION__ : 'dev';

interface BuildInfo {
  version: string;
  builtAt?: string;
}

let pending: BuildInfo | null = null;
let card: HTMLElement | null = null;

/* ------------------------------------------------------------------ helpers */

function readNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeNum(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode — the check still works, it just will not remember */
  }
}

/**
 * True on the library screen. The engine keeps a single-page app in one
 * document and swaps `#ed` (editor) for `#lib` (library).
 *
 * The hidden state comes from the stylesheet, not from an inline style, so this
 * has to ask the computed style — checking `style.display` alone reports "in a
 * note" forever and the card would never appear. Absent nodes count as home,
 * which covers the moment before the engine has built its DOM.
 */
function isHome(): boolean {
  const ed = document.getElementById('ed');
  if (!ed) return true;
  if (ed.style.display === 'none') return true;
  return getComputedStyle(ed).display === 'none';
}

/**
 * Full-screen overlays that own the screen while they are up: the onboarding
 * tour, the install guide, and the new-notebook dialog. Each defaults to
 * `display: none` and is shown on demand, so computed style is the honest test.
 *
 * Without this the card floats on top of a dimmed modal — it sits at z-index
 * 400, above the tour's dim layer, which looks broken rather than helpful.
 */
const OVERLAYS = ['tour-root', 'install-md', 'md'];

function overlayOpen(): boolean {
  for (const id of OVERLAYS) {
    const el = document.getElementById(id);
    if (el && getComputedStyle(el).display !== 'none') return true;
  }
  return false;
}

/* --------------------------------------------------------------- the request */

async function fetchLatest(): Promise<BuildInfo | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      // A redirect here would mean we are not looking at the deploy we think we
      // are, so treat it as "no answer" rather than comparing the wrong build.
      redirect: 'error',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BuildInfo;
    return data && typeof data.version === 'string' ? data : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- the UI */

const STYLE_ID = 'slate-upd-style';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.slate-upd {
  position: fixed;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%) translateY(10px);
  z-index: 400;
  width: min(420px, calc(100vw - 28px));
  box-sizing: border-box;
  padding: 14px 14px 12px;
  border-radius: 16px;
  border: 1px solid var(--bd, rgba(16, 24, 40, 0.12));
  background: var(--sf, #fff);
  color: var(--tx, #101828);
  box-shadow: 0 14px 36px rgba(16, 24, 40, 0.18);
  font-family: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}
.slate-upd.on {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}
.slate-upd h4 {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.slate-upd p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--mu, #667085);
}
.slate-upd .row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.slate-upd button {
  font: inherit;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--bd, rgba(16, 24, 40, 0.14));
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.slate-upd button:active {
  transform: scale(0.98);
}
.slate-upd button.now {
  background: var(--ac, #2f6df6);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .slate-upd { transition: none; }
}
`;
  document.head.appendChild(style);
}

function buildCard(): HTMLElement {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'slate-upd';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <h4>Update available</h4>
    <p class="msg"></p>
    <div class="row">
      <button type="button" class="later">Later</button>
      <button type="button" class="now">Update now</button>
    </div>`;
  el.querySelector('.later')!.addEventListener('click', onLater);
  el.querySelector('.now')!.addEventListener('click', onUpdateNow);
  document.body.appendChild(el);
  return el;
}

function show(): void {
  if (!pending) return;
  if (!card) card = buildCard();
  const msg = card.querySelector('.msg') as HTMLElement;
  msg.textContent = pending.version
    ? `Version ${pending.version} is ready. It takes a moment to apply.`
    : 'A newer version is ready.';
  card.classList.add('on');
}

function hide(): void {
  card?.classList.remove('on');
}

/** Shows or hides the card so it is never visible over a note or a modal. */
function sync(): void {
  if (!pending) return hide();
  if (!isHome() || overlayOpen()) return hide();
  if (Date.now() < readNum(LS_SNOOZE)) return hide();
  show();
}

/* ------------------------------------------------------------------ actions */

function onLater(): void {
  writeNum(LS_SNOOZE, Date.now() + SNOOZE_MS);
  hide();
}

async function onUpdateNow(): Promise<void> {
  const btn = card?.querySelector('.now') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating…';
  }
  hide();
  try {
    // Drop everything the old build left behind, then let the reload fetch a
    // fresh shell. Unregistering is heavier than update() but it is the only
    // way to be sure the precached index.html cannot answer the next request.
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* fall through to the reload — a stale shell is better than a dead button */
  }
  location.reload();
}

/* ----------------------------------------------------------------- the check */

async function check(): Promise<void> {
  if (!navigator.onLine) return;
  writeNum(LS_LAST, Date.now());

  const latest = await fetchLatest();
  if (!latest) return;

  if (latest.version === LOCAL_VERSION) {
    pending = null;
    hide();
    return;
  }

  pending = latest;

  // Backgrounded or in a note: a notification is the only way to reach the
  // user, and only the native shell can raise one.
  if (document.visibilityState === 'hidden') {
    const native = (window as any).SlateNative;
    if (native?.notifyUpdate) {
      try {
        native.notifyUpdate(latest.version);
      } catch {
        /* no notification support — the card will still be waiting */
      }
    }
    return;
  }

  sync();
}

/* --------------------------------------------------------------------- init */

export function initUpdateCheck(): void {
  if (typeof window === 'undefined') return;

  // A dev server has no version.json and no meaningful version, so stay out of
  // the way entirely rather than showing a card that can never resolve.
  if (import.meta.env.DEV) return;

  window.setTimeout(() => {
    void check();
  }, FIRST_CHECK_DELAY_MS);

  window.setInterval(() => {
    void check();
  }, CHECK_INTERVAL_MS);

  window.addEventListener('online', () => {
    void check();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Coming back to the app is the best moment to re-check: the build may have
    // been replaced while the user was away.
    if (Date.now() - readNum(LS_LAST) >= CHECK_INTERVAL_MS) {
      void check();
    } else {
      sync();
    }
  });

  // Cheap and reliable: the engine swaps screens by toggling #ed/#lib, and this
  // has to react to that without hooking every navigation path. Polling a single
  // computed style once a second costs nothing.
  window.setInterval(sync, HOME_POLL_MS);
}

/** Test seam: lets a probe force a check without waiting for the timer. */
export function __checkNow(): Promise<void> {
  return check();
}
