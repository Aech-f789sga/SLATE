/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guided tours + install guide for Slate.
 *
 * - A spotlight tour for the Home / library screen.
 * - A tool-by-tool tour inside the editor. Each step dims everything but one
 *   control and says what it does in a sentence or two.
 * - A platform-aware "Add to Home Screen" guide for iOS/iPadOS and Android.
 *
 * There are no demos: no canvas animation, no video. The tour points at the
 * real control and describes it, which cannot drift out of date with the tool
 * the way a recording can, costs nothing to load, and is readable at a glance.
 */

/* ------------------------------------------------------------------ */
/* Tiny helpers                                                        */
/* ------------------------------------------------------------------ */

function el(tag: string, css = '', text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
}

/** Same as el(), but the third argument is parsed as HTML. */
function elHTML(tag: string, css = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  e.innerHTML = html;
  return e;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T | null;

function isVisible(e: Element | null): boolean {
  if (!e) return false;
  const r = e.getBoundingClientRect();
  return r.width > 1 && r.height > 1 && getComputedStyle(e as HTMLElement).visibility !== 'hidden';
}

function rectOf(e: Element | null): DOMRect | null {
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 || r.height > 0 ? r : null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function byText(sel: string, text: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) =>
      (e.textContent || '').toLowerCase().includes(text.toLowerCase())
    ) || null
  );
}

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;

/** True once the browser offers a one-tap PWA install. */
let canPromptInstall = false;
window.addEventListener('beforeinstallprompt', () => {
  canPromptInstall = true;
});


/* ------------------------------------------------------------------ */
/* Tour engine                                                         */
/* ------------------------------------------------------------------ */

interface Step {
  /** Element to spotlight. Omit for a centred "welcome" card. */
  target?: () => HTMLElement | null;
  title: string;
  body: string;
  /** Extra space around the spotlight, px. */
  pad?: number;
  /** Force the card to a docked position instead of floating near the target. */
  place?: 'dock';
  /** Runs before the step is shown (e.g. open the overflow menu). */
  before?: () => void;
  /** Runs when leaving the step. */
  after?: () => void;
}

// Bumped whenever the steps change: the flag is what stops the tour from
// replaying at someone who has already seen it, so a stale flag would hide a
// rewritten tour from every returning user.
const TOUR_VER = 'v5';
const HOME_FLAG = `inkpad-tour-home-${TOUR_VER}`;
const EDITOR_FLAG = `inkpad-tour-editor-${TOUR_VER}`;

let active: {
  id: string;
  steps: Step[];
  i: number;
  root: HTMLElement;
  hole: HTMLElement;
  ring: HTMLElement;
  dim: HTMLElement;
  card: HTMLElement;
  timer: number;
} | null = null;

function tourRoot(): HTMLElement {
  let root = document.getElementById('tour-root');
  if (root) return root;

  root = el('div', '') as HTMLElement;
  root.id = 'tour-root';
  root.innerHTML = `
    <div id="tour-dim"></div>
    <div id="tour-hole"></div>
    <div id="tour-ring"></div>
    <div id="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div id="tour-top">
        <span id="tour-count"></span>
        <button id="tour-x" aria-label="Close tour">✕</button>
      </div>
      <h3 id="tour-title"></h3>
      <p id="tour-body"></p>
      <div id="tour-foot">
        <button id="tour-skip">Skip tour</button>
        <div id="tour-nav">
          <button id="tour-back">Back</button>
          <button id="tour-next" class="on">Next</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function stopTour(completed: boolean, id?: string) {
  if (!active) return;
  const { root, timer, steps, i } = active;
  clearInterval(timer);
  try {
    steps[i]?.after?.();
  } catch {
    /* ignore */
  }
  root.remove();
  document.documentElement.classList.remove('tour-on');
  if (completed && id) localStorage.setItem(`inkpad-tour-${id}-${TOUR_VER}`, '1');
  active = null;
}

type DockMode = 'float' | 'bottom' | 'top' | 'dock';

function placeCard(card: HTMLElement, hole: DOMRect | null, mode: DockMode) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const M = 12;

  if (mode === 'bottom' || mode === 'dock' || !hole) {
    card.style.width = mode === 'dock' ? 'min(420px, calc(100vw - 24px))' : 'auto';
    card.style.left = mode === 'dock' ? '50%' : '10px';
    card.style.right = mode === 'dock' ? 'auto' : '10px';
    card.style.transform = mode === 'dock' ? 'translateX(-50%)' : 'none';
    card.style.bottom = '10px';
    card.style.top = 'auto';
    return;
  }
  if (mode === 'top') {
    card.style.width = 'auto';
    card.style.left = '10px';
    card.style.right = '10px';
    card.style.transform = 'none';
    card.style.top = '10px';
    card.style.bottom = 'auto';
    return;
  }

  card.style.transform = 'none';
  card.style.width = Math.min(360, vw - 28) + 'px';
  card.style.right = 'auto';
  card.style.bottom = 'auto';
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  let x = clamp(hole.left + hole.width / 2 - cw / 2, M, vw - cw - M);
  let y: number;

  // Sidebar-style targets (left rail): sit beside them instead of on top.
  if (hole.left < vw * 0.34 && hole.right + M + cw <= vw - M) {
    card.style.left = hole.right + M + 'px';
    card.style.top = clamp(hole.top + hole.height / 2 - ch / 2, M, vh - ch - M) + 'px';
    return;
  }

  if (hole.bottom + M + ch <= vh - M) {
    y = hole.bottom + M;
  } else if (hole.top - M - ch >= M) {
    y = hole.top - M - ch;
  } else {
    y = clamp(vh - ch - M, M, vh - ch - M);
    x = hole.right + M + cw <= vw - M ? hole.right + M : clamp(hole.left - M - cw, M, vw - cw - M);
  }
  card.style.left = x + 'px';
  card.style.top = y + 'px';
}

function showStep(idx: number) {
  if (!active) return;
  const { steps, hole, ring, dim, card } = active;
  // stop the previous step's repaint loop, otherwise its stale closure keeps
  // moving the spotlight back to the old target
  if (active.timer) {
    clearInterval(active.timer);
    active.timer = 0;
  }
  active.i = idx;
  const step = steps[idx];
  if (!step) {
    stopTour(true, active.id);
    return;
  }

  // leaving the previous step may need cleanup (close a popover, ...)
  if (idx > 0) {
    try {
      steps[idx - 1]?.after?.();
    } catch {
      /* ignore */
    }
  }
  try {
    step.before?.();
  } catch {
    /* ignore */
  }

  const target = step.target ? step.target() : null;
  if (target) target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });

  const paint = () => {
    if (!active) return;
    const t = step.target ? step.target() : null;
    const r = t ? rectOf(t) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r && isVisible(t)) {
      const pad = step.pad ?? 8;
      const x = clamp(r.left - pad, 2, vw - 10);
      const y = clamp(r.top - pad, 2, vh - 10);
      const w = Math.min(r.width + pad * 2, vw - x - 2);
      const h = Math.min(r.height + pad * 2, vh - y - 2);
      hole.style.left = x + 'px';
      hole.style.top = y + 'px';
      hole.style.width = w + 'px';
      hole.style.height = h + 'px';
      hole.style.opacity = '1';
      dim.style.opacity = '0';
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      ring.style.width = w + 'px';
      ring.style.height = h + 'px';
      ring.style.opacity = '1';
      const narrow = window.innerWidth < 620;
      if (step.place === 'dock') {
        placeCard(card, null, 'dock');
      } else if (narrow) {
        // keep the card away from the thing being explained
        const targetLow = r.top + r.height / 2 > window.innerHeight * 0.45;
        placeCard(card, null, targetLow ? 'top' : 'bottom');
      } else {
        placeCard(card, new DOMRect(x, y, w, h), 'float');
      }
    } else {
      hole.style.opacity = '0';
      ring.style.opacity = '0';
      dim.style.opacity = '1';
      placeCard(card, null, 'dock');
    }
  };

  card.querySelector('#tour-count')!.textContent = `${idx + 1} / ${steps.length}`;
  card.querySelector('#tour-title')!.textContent = step.title;
  card.querySelector('#tour-body')!.innerHTML = step.body;
  const back = card.querySelector('#tour-back') as HTMLButtonElement;
  const next = card.querySelector('#tour-next') as HTMLButtonElement;
  back.style.visibility = idx === 0 ? 'hidden' : 'visible';
  next.textContent = idx === steps.length - 1 ? 'Finish' : 'Next';

  paint();
  // keep the spotlight glued to the target (scroll, layout shifts, popovers)
  setTimeout(paint, 60);
  setTimeout(paint, 340);
  if (active) active.timer = window.setInterval(paint, 220);
}

function runTour(id: string, allSteps: Step[]) {
  stopTour(false);
  const steps = allSteps.filter((s) => (s.target ? s.target() !== null : true));
  if (!steps.length) return;
  const root = tourRoot();
  document.documentElement.classList.add('tour-on');
  root.style.display = 'block';

  const hole = root.querySelector('#tour-hole') as HTMLElement;
  const ring = root.querySelector('#tour-ring') as HTMLElement;
  const dim = root.querySelector('#tour-dim') as HTMLElement;
  const card = root.querySelector('#tour-card') as HTMLElement;

  active = { id, steps, i: 0, root, hole, ring, dim, card, timer: 0 };

  (card.querySelector('#tour-next') as HTMLElement).onclick = () => {
    if (!active) return;
    if (active.i >= active.steps.length - 1) stopTour(true, active.id);
    else showStep(active.i + 1);
  };
  (card.querySelector('#tour-back') as HTMLElement).onclick = () => {
    if (active && active.i > 0) showStep(active.i - 1);
  };
  // Skipping still counts as "seen": the tour must not nag on every visit.
  const skip = () => stopTour(true, active ? active.id : undefined);
  (card.querySelector('#tour-skip') as HTMLElement).onclick = skip;
  (card.querySelector('#tour-x') as HTMLElement).onclick = skip;

  showStep(0);
}

/* keyboard + resize handling */
window.addEventListener(
  'keydown',
  (e) => {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stopTour(false);
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      const btn = active.card.querySelector('#tour-next') as HTMLButtonElement;
      btn?.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      (active.card.querySelector('#tour-back') as HTMLButtonElement)?.click();
    }
  },
  true
);
window.addEventListener('resize', () => {
  if (!active) return;
  showStep(active.i);
});

/* ------------------------------------------------------------------ */
/* Tour content                                                        */
/* ------------------------------------------------------------------ */

function navLink(filter: string): HTMLElement | null {
  return document.querySelector(`#nav a[data-f="${filter}"]`);
}

/**
 * The page controls live behind one pill now.
 *
 * This used to work by adding `#tb.more`, which turned `#bar2` into a dropdown.
 * `#bar2` is no longer a second row of controls: it is a single Page pill, and
 * `html[data-bar=full] #bar2:not(.open) > *:not(#pgm-head){display:none}`
 * hides everything else until the pill is clicked. So the old code still moved
 * the row around but revealed nothing, and every step aimed at a page control —
 * paper, zoom, full screen, export, layers, guides — dimmed the screen and
 * highlighted an empty space. Clicking the pill is the only thing that opens
 * the card.
 */
function ensureOverflow() {
  const bar2 = document.getElementById('bar2');
  const pgm = document.getElementById('pgm');
  if (!bar2 || !pgm) return;
  if (!bar2.classList.contains('open')) pgm.click();
}

function closeOverflow() {
  const bar2 = document.getElementById('bar2');
  const pgm = document.getElementById('pgm');
  if (bar2?.classList.contains('open')) pgm?.click();
  document.getElementById('tb')?.classList.remove('more');
}

/**
 * The Accessories menu, where the controls that left the toolbar went.
 * `#acc-pop` holds one `.acc-item` row per feature; opening it is a click on
 * `#acc-trigger`, and it closes itself when a row is used.
 */
function accPop(): HTMLElement | null {
  return document.getElementById('acc-pop');
}

function ensureAcc() {
  const pop = accPop();
  if (!pop) return;
  if (getComputedStyle(pop).display === 'none') {
    (document.getElementById('acc-trigger') as HTMLElement | null)?.click();
  }
}

function closeAcc() {
  const pop = accPop();
  if (pop && getComputedStyle(pop).display !== 'none') {
    (document.getElementById('acc-trigger') as HTMLElement | null)?.click();
  }
}

/** A row inside the Accessories menu, matched by its label. */
function accItem(label: string) {
  return () => {
    const pop = accPop();
    const row =
      pop &&
      Array.from(pop.querySelectorAll<HTMLElement>('.acc-item')).find((n) =>
        (n.textContent || '').toLowerCase().includes(label.toLowerCase()),
      );
    // The menu is built the first time it opens, so before that the row does
    // not exist. Returning null would drop the step from the tour silently —
    // the tour filters out any step whose target is missing — so fall back to
    // the button that opens the menu.
    return row || document.getElementById('acc-trigger');
  };
}

/**
 * Find a control by its tooltip. Many engine buttons carry no id, so the title
 * is the only stable handle; `prefix` copes with labels that change state
 * ("Animate next drawing: off" / "… on").
 */
function byTitle(title: string, prefix = false) {
  return () => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('#bar [title], #bar2 [title]'));
    return (
      all.find((n) => {
        const t = n.getAttribute('title') || '';
        return prefix ? t.startsWith(title) : t === title;
      }) || null
    );
  };
}

/** The floating ink pill: nibs, widths, swatches and the pen settings gear. */
function pill() {
  return document.getElementById('ink-pen');
}

function pillGroup(n: number) {
  return () => (pill()?.querySelectorAll<HTMLElement>('.grp')[n] ?? null);
}

function pillButton(title: string, prefix = false) {
  return () => {
    const all = Array.from(pill()?.querySelectorAll<HTMLElement>('button') ?? []);
    return (
      all.find((n) => {
        const t = n.getAttribute('title') || '';
        return prefix ? t.startsWith(title) : t === title;
      }) || null
    );
  };
}

/** A tool in the top row, by its engine name. */
function tool(name: string) {
  return () => document.querySelector<HTMLElement>(`#bar button[data-t="${name}"]`);
}

const HOME_STEPS: Step[] = [
  {
    title: 'Welcome to Slate',
    body: 'A one-minute tour of the library. <b>Skip tour</b> leaves at any point.',
  },
  {
    target: () => document.getElementById('nav'),
    title: 'Your shelves',
    body:
      '<b>Documents</b> holds every notebook. <b>Favorites</b> pins the ones you open daily. <b>Trash</b> keeps deleted ones until you empty it.',
  },
  {
    target: () => document.getElementById('nav-hide'),
    title: 'Hide the sidebar',
    body: 'Gives the page the full width. The button stays put, so press it again to bring the shelves back. Remembered.',
    pad: 8,
  },
  {
    target: () => document.querySelector('.new') as HTMLElement | null,
    title: 'New notebook',
    body: 'Tap <b>+</b>, name it, then pick a paper: lined, blank, grid, dotted or Cornell.',
    pad: 6,
  },
  {
    target: () => document.getElementById('gn-search'),
    title: 'Search',
    body: 'Filters your notebooks by title as you type. Works offline.',
  },
  {
    target: () => document.getElementById('gx-theme-btn'),
    title: 'Themes',
    body:
      'Twenty-three themes, most with a live wallpaper and a soundtrack. Pick one, press <b>Load</b>, and the picture and music arrive before it switches.',
    pad: 6,
  },
  {
    // only exists while a theme with media is applied, so the step filters out
    target: () => document.querySelector('.gxm-fab') as HTMLElement | null,
    title: 'The music pill',
    body:
      'Soundtrack, wallpaper and interface sounds for this theme. Themes with several tracks get <b>‹ ›</b> to change them, and the next one plays on its own.',
    pad: 8,
  },
  {
    target: () => byText('#libm button', 'Import backup'),
    title: 'Import a backup',
    body: 'Restores a <code>.slate</code> or <code>.inkpad</code> file exported from another device.',
    pad: 6,
  },
  {
    target: () => document.getElementById('pen-btn'),
    title: 'Stylus setup',
    body:
      'Pick your stylus, say what the <b>eraser end</b> and <b>barrel buttons</b> do, test pressure live, turn on palm rejection.',
  },
  {
    target: () => document.getElementById('cloud-btn'),
    title: 'Cloud backup',
    body:
      'Sign in to keep a copy of every notebook in the cloud. Each one syncs on its own — the <b>☁️</b> toggle on its card.',
  },
  {
    target: () =>
      (document.getElementById('auth-login-btn') as HTMLElement | null) ||
      (document.getElementById('user-info-box') as HTMLElement | null),
    title: 'Sign in (optional)',
    body:
      'Without an account notebooks still survive a refresh, but only on this device. An account protects them if the browser clears its storage.',
  },
  {
    target: () => document.getElementById('install-btn'),
    title: 'Install as an app',
    body: 'iPhone / iPad: <b>Share → Add to Home Screen</b>. Android: <b>⋮ → Install app</b>.',
  },
  {
    target: () => document.getElementById('beta-badge'),
    title: 'Beta',
    body: 'Slate is still in <b>BETA</b>. Anything broken: <b>aechmoose@gmail.com</b>.',
    pad: 6,
  },
  {
    title: 'That is the library',
    body:
      'Open a notebook and the editor tour starts on its own. Replay either one from <b>🎬 Tour</b> in the sidebar.',
  },
];

const EDITOR_STEPS: Step[] = [
  {
    title: 'The tool tour',
    body: 'Each step points at the thing it describes. <b>Next</b> moves on, <b>Esc</b> leaves.',
  },

  /* ---- the two surfaces that run the whole editor ------------------ */
  {
    target: () => document.getElementById('bar'),
    title: 'The tool row',
    body:
      'One row: <b>pen</b>, <b>highlighter</b>, <b>eraser</b>, <b>text</b>, <b>lasso</b>, <b>laser</b>, <b>bucket</b>, then <b>shapes</b>, <b>accessories</b> and the page pill. What did not fit lives in those last two.',
  },
  {
    target: () => document.getElementById('pen-dock'),
    title: 'The pen dock',
    body:
      'Six pens in a pocket on the left, like a case. Each slot is a whole preset — nib, width, colour. Tap to pick one up; open a slot to swap it or add up to eight.',
    pad: 10,
  },
  {
    target: () => pill(),
    title: 'The ink pill',
    body:
      'Everything about the line in your hand: <b>nib</b>, <b>width</b>, <b>colour</b> and a settings gear. It follows the tool.',
    pad: 8,
  },
  {
    target: pillGroup(0),
    title: 'Six nibs',
    body: 'Ballpoint, fountain, brush, pencil, crayon, marker. Each tapers and textures differently.',
    pad: 8,
  },
  {
    target: pillGroup(1),
    title: 'Thickness',
    body:
      'Three quick widths — 0.53, 1.1 and 1.8 mm — and the gear opens a slider from 0.1 mm to 100 mm.',
    pad: 8,
  },
  {
    target: pillGroup(2),
    title: 'Colour',
    body: 'Six swatches, plus the round picker for any shade. Applies to pens, highlighter, shapes and text.',
    pad: 8,
  },
  {
    target: pillButton('Pen settings'),
    title: 'Pressure, taper, smoothing',
    body:
      'The gear opens the pen sheet: pressure response, smoothing, taper and the exact width. Down for a flat technical line, up for calligraphy.',
    pad: 10,
  },

  /* ---- writing ---------------------------------------------------- */
  {
    target: tool('pen'),
    title: '✎ Pen',
    body:
      'The main writing tool. <b>Pressure sets the line width</b> — light for hairlines, hard for bold. A mouse or finger works too.',
  },
  {
    target: tool('hl'),
    title: '🖍 Highlighter',
    body: 'A wide translucent band, so the writing underneath still shows.',
  },
  {
    target: tool('er'),
    title: 'Eraser',
    body:
      'Wipes ink back to paper. If your stylus has an <b>eraser end</b>, flipping the pen switches to it — set that up in <b>Stylus setup</b>.',
  },
  {
    target: tool('er'),
    title: 'Whole-stroke eraser',
    body:
      'The eraser has two modes: rub through a stroke, or remove the <b>whole stroke</b> with one touch. The second is faster when a line has to go completely.',
  },
  {
    title: 'Scribble to erase',
    body:
      'Scratch back and forth over a word or a shape and it disappears. Only a dense scratch counts, so writing is never touched. Off under <b>Accessories → Smart ink</b>.',
  },

  /* ---- selecting -------------------------------------------------- */
  {
    target: tool('sel'),
    title: 'Lasso select',
    body:
      'Circle anything to select it, then <b>drag to move</b>. With a selection the page card grows enlarge ⤢, shrink ⤡ and delete.',
  },
  {
    // No target: `#sg` only exists once something is selected, and nothing is
    // selected during a tour. Aiming at it dimmed the screen and highlighted
    // an empty corner, so this reads as the follow-up card it is.
    title: 'Resize a selection',
    body:
      'With something selected, the page card grows ⤢ enlarge, ⤡ shrink and a bin. Scaling works on handwriting, shapes and images alike.',
  },

  /* ---- shapes ----------------------------------------------------- */
  {
    target: () => document.getElementById('sh-trigger'),
    title: 'Shapes',
    body:
      'Line, <b>arrow</b>, dashed <b>hidden line</b>, <b>rectangle</b>, <b>oval</b>, and 2D / 3D <b>axes</b> for graphs. Pick one, then drag to size.',
    pad: 8,
  },
  {
    target: tool('bk'),
    title: 'Paint bucket',
    body: 'Tap inside a closed shape to fill it, or tap a line to recolour it. A hand-drawn circle works like a real shape.',
  },

  /* ---- text ------------------------------------------------------- */
  {
    target: tool('text'),
    title: 'Text',
    body:
      'Tap anywhere to type. Text stays editable and can be moved or restyled later — presets, plain / sticky / callout / tint / outline / tag, plus the typeface.',
  },

  /* ---- accessories ------------------------------------------------ */
  {
    target: () => document.getElementById('acc-trigger'),
    title: 'Accessories',
    body:
      'Everything that is not a drawing tool: <b>Zoom Window</b>, <b>Time Keeper</b>, <b>Toolbar Customization</b>, <b>Smart ink</b>, <b>Hold to snap</b>, <b>Insert media</b>, <b>Stickers</b>, <b>Sticky note</b>, <b>Object snap</b>.',
    pad: 8,
  },
  {
    target: accItem('Insert media'),
    title: 'Images and video',
    body:
      'Drop a photo, a diagram or a clip on the page. Move and resize it, draw over it, and a video plays in place.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Stickers'),
    title: 'Stickers',
    body:
      'Stars, arrows, ticks, leaves. Tap to drop one, then drag or resize it like a picture. They export and sync with the page.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Sticky note'),
    title: 'Sticky notes',
    body: 'A coloured note that sits on the page without joining the ink. Move it, resize it, edit the text inside.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Object snap'),
    title: '🧲 Object snap',
    body:
      'The pen <b>magnetises</b> to an existing tip, corner or crossing, with a marker showing the target before you commit.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Hold to snap'),
    title: 'Hold to snap',
    body: 'Snap only while you <b>hold</b> — one deliberate join, then it lets go. No switch left flipped.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Smart ink'),
    title: 'Smart ink',
    body: 'The recognition layer: scribble to erase, hold a stroke still to straighten it or tidy it into a shape. All optional, all undoable.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Zoom Window'),
    title: 'Zoom Window',
    body:
      'A magnified inset that follows the pen, so you can see the exact pixel while the page stays at reading size.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Time Keeper'),
    title: 'Time Keeper',
    body: 'A session timer on the page. Start it when you begin writing and see how long the piece actually took. Drag it anywhere.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: accItem('Toolbar Customization'),
    title: 'Toolbar Customization',
    body: 'Choose which tools the row carries, and in what order.',
    before: ensureAcc,
    after: closeAcc,
    pad: 6,
  },
  {
    target: tool('laser'),
    title: 'Laser pointer',
    body: 'A glowing dot that fades as you move — for teaching or presenting. Nothing is saved to the page.',
  },

  /* ---- the page card ---------------------------------------------- */
  {
    target: () => document.getElementById('pgm'),
    title: 'The page card',
    body:
      'Every page control behind one pill, so the canvas keeps the height: paper, colour, resolution, zoom, full screen, thumbnails, export, clear. Press it again — or <b>Esc</b> — to close.',
    pad: 6,
  },
  {
    target: () => document.getElementById('tpl'),
    title: 'Paper template',
    body: 'Blank, lined, grid, dotted or Cornell. Change it per page at any time; the ink stays put.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: () => document.getElementById('pc'),
    title: 'Paper colour',
    body: 'White, cream, and darker shades for low light.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: byTitle('Page resolution'),
    title: 'Export resolution',
    body: 'Dots per inch when the page is exported. Higher is sharper and heavier — 300 dpi for print.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: () => document.getElementById('zi'),
    title: 'Zoom',
    body: '50 % to 800 %. Pinch on a touchscreen, or hold <b>Space</b> and drag to pan.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: () => document.getElementById('side-t'),
    title: 'Page thumbnails',
    body: 'A strip of live page previews down the left. Tap any page to jump to it.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: () => document.getElementById('fs'),
    title: 'Full screen',
    body: 'Hides every panel so only paper is left. Tap again, or <b>Esc</b>, to bring the tools back.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: () => document.getElementById('share'),
    title: 'Export and share',
    body: 'Out as <b>PDF</b> (all pages) or <b>PNG</b> — good for GoodNotes, Notability, OneNote, Samsung Notes, Apple Notes.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: () => document.getElementById('clr'),
    title: 'Clear page',
    body: 'Empties this page only. <b>Undo</b> still brings the ink back.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },

  /* ---- the two session switches, in their own pill ------------------- */
  {
    target: () => document.getElementById('edm'),
    title: 'Pen only and sound',
    body:
      'The two you flip while writing, so they sit outside the page card. <b>Pen only</b> makes a resting hand scroll instead of smudging; <b>Sound</b> is the paper under the nib.',
    pad: 6,
  },
  {
    target: byTitle('Guides, symmetry and perspective'),
    title: 'Guides and symmetry',
    body: 'Ruled guides, mirroring across an axis, a perspective grid.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: byTitle('Layers (per page)'),
    title: 'Layers',
    body: 'Several layers per page. Annotations on one, artwork on another — hide or reorder them without touching the ink.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: byTitle('Animate next drawing', true),
    title: 'Animate a drawing',
    body: 'Turn it on, draw, and the strokes are recorded. Press ▶ to play the drawing back.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: byTitle('Figure library'),
    title: 'Figure library',
    body: 'Ready-made science and maths shapes — circuits, arrows, containers — to assemble a diagram without drawing every part.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },
  {
    target: byTitle('Engineering symbols'),
    title: 'Engineering symbols',
    body: 'Stamp straight onto the page: resistors, capacitors, valves, flow arrows and the rest of the notation.',
    before: ensureOverflow,
    after: closeOverflow,
    pad: 6,
  },

  /* ---- history, pages, output ------------------------------------- */
  {
    target: () => document.getElementById('undo'),
    title: 'Undo and redo',
    body: 'Every stroke is undoable — ↶ back, ↷ forward.',
  },
  {
    target: () => document.getElementById('gn-foot'),
    title: 'Pages',
    body: 'Add, duplicate and delete pages, step through with ‹ ›. Each page keeps its own paper and colour.',
  },
  {
    target: () => document.getElementById('pg-fold'),
    title: 'Fold the page bar',
    body:
      'The chevron hides the page bar and gives the canvas the height back; the page and zoom pills stay. Remembered.',
    pad: 8,
  },
  {
    target: () => document.getElementById('back'),
    title: 'Back to the library',
    body: 'Everything saves as you write. ‹ <b>Library</b> returns to your shelves, the notebook right where you left it.',
  },
  {
    title: 'You are ready to write ✍️',
    body:
      'Replay this tour with the <b>?</b> button at the bottom-right of the canvas. Themes, wallpapers and soundtracks are on the library screen, behind the <b>◐</b> button.',
  },
];

/* ------------------------------------------------------------------ */
/* Install guide                                                       */
/* ------------------------------------------------------------------ */

const SHARE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;
const PLUS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const DOTS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;
const HOME_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/></svg>`;

function installRow(icon: string, text: string, accent = false): HTMLElement {
  const row = el(
    'div',
    'display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.45' +
      (accent ? ';background:rgba(47,109,246,.09);border-radius:10px;padding:8px 10px' : '')
  );
  const ic = el('span', 'flex:none;color:' + (accent ? 'var(--ac)' : 'var(--mu)') + ';margin-top:1px');
  ic.innerHTML = icon;
  row.appendChild(ic);
  const tx = el('span', accent ? 'font-weight:600' : 'color:var(--tx)');
  tx.innerHTML = text;
  row.appendChild(tx);
  return row;
}

function buildInstallPanel(): HTMLElement {
  let md = document.getElementById('install-md');
  if (md) return md;
  md = el('div', '') as HTMLElement;
  md.id = 'install-md';
  md.innerHTML =
    '<div class="box">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
    '<b style="font-size:17px">📲 Install Slate</b>' +
    '<button class="ic" id="install-close" style="font-size:16px;padding:2px 6px" aria-label="Close">✕</button>' +
    '</div>' +
    '<div id="install-tabs" role="tablist"></div>' +
    '<div id="install-body"></div>' +
    '<div id="install-note" style="font-size:11.5px;color:var(--mu);line-height:1.5"></div>' +
    '</div>';
  document.body.appendChild(md);

  const close = () => md!.classList.remove('on');
  md.querySelector('#install-close')!.addEventListener('click', close);
  md.addEventListener('pointerdown', (e) => {
    if (e.target === md) close();
  });
  return md;
}

function renderInstallTab(md: HTMLElement, tab: 'ios' | 'android' | 'desktop') {
  const tabs = md.querySelector('#install-tabs') as HTMLElement;
  const body = md.querySelector('#install-body') as HTMLElement;
  const note = md.querySelector('#install-note') as HTMLElement;

  const defs: [string, string][] = [
    ['ios', 'iPhone / iPad'],
    ['android', 'Android'],
    ['desktop', 'Computer'],
  ];
  tabs.innerHTML = '';
  tabs.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  defs.forEach(([k, label]) => {
    const b = el('button', 'font-size:12px;padding:6px 11px;border-radius:999px', label) as HTMLButtonElement;
    const on = k === tab;
    b.style.borderColor = on ? 'var(--ac)' : 'var(--bd)';
    b.style.color = on ? 'var(--ac)' : 'var(--mu)';
    b.style.background = on ? 'rgba(47,109,246,.1)' : 'transparent';
    b.style.fontWeight = on ? '600' : '400';
    b.onclick = () => renderInstallTab(md, k as any);
    tabs.appendChild(b);
  });

  body.innerHTML = '';
  body.style.cssText = 'display:flex;flex-direction:column;gap:9px;margin-top:4px';

  // Browsers that support one-tap install (Chrome / Edge / Samsung) get a
  // primary button; everyone else follows the manual steps below.
  if (canPromptInstall) {
    const go = el(
      'button',
      'font-weight:600;padding:10px;font-size:13.5px;background:var(--ac);color:#fff;border:0;border-radius:11px;cursor:pointer',
      '⚡ Install Slate now'
    ) as HTMLButtonElement;
    go.onclick = async () => {
      await (window as any).__inkpad_cloud?.promptInstall?.();
      md.classList.remove('on');
    };
    body.appendChild(go);
  }

  if (tab === 'ios') {
    body.appendChild(
      elHTML(
        'div',
        'font-size:12.5px;color:var(--mu);line-height:1.5',
        'Open Slate in <b style="color:var(--tx)">Safari</b>. (On iPadOS 13+ any browser works, but the Share sheet is most reliable in Safari.)'
      )
    );
    body.appendChild(installRow(SHARE_ICON, 'Tap the <b>Share</b> button in the browser toolbar — the square with an arrow pointing up.'));
    body.appendChild(installRow(PLUS_ICON, 'Scroll down the share sheet and tap <b>Add to Home Screen</b>.', true));
    body.appendChild(installRow(HOME_ICON, 'Keep the name as <b>Slate</b>, then tap <b>Add</b>. The icon appears on your home screen.'));
    note.innerHTML =
      'The icon and name come from Slate itself, so it will appear as <b style="color:var(--tx)">Slate</b>. Installed, it opens full screen without browser bars and your notebooks stay available offline.';
  } else if (tab === 'android') {
    body.appendChild(
      elHTML(
        'div',
        'font-size:12.5px;color:var(--mu);line-height:1.5',
        'Open Slate in <b style="color:var(--tx)">Chrome</b> (or Edge / Samsung Internet).'
      )
    );
    body.appendChild(installRow(DOTS_ICON, 'Tap the <b>⋮</b> menu in the top-right corner.'));
    body.appendChild(installRow(PLUS_ICON, 'Choose <b>Install app</b> (older versions say <b>Add to Home screen</b>).', true));
    body.appendChild(installRow(HOME_ICON, 'Confirm — Slate is added to your home screen and app drawer.'));
    note.innerHTML =
      'Installed as a PWA, Slate gets its own window, works offline, and Android keeps its storage instead of clearing it.';
  } else {
    body.appendChild(
      elHTML(
        'div',
        'font-size:12.5px;color:var(--mu);line-height:1.5',
        'Slate installs as a desktop app from Chrome or Edge.'
      )
    );
    body.appendChild(installRow(PLUS_ICON, 'Click the <b>install icon</b> at the right end of the address bar.', true));
    body.appendChild(installRow(HOME_ICON, 'Or open <b>⋮ → Install Slate</b> and confirm.'));
    note.innerHTML =
      'Firefox and Safari on macOS do not install PWAs — use Chrome or Edge for the desktop app.';
  }
}

function openInstall() {
  const md = buildInstallPanel();
  const tab: 'ios' | 'android' | 'desktop' = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  renderInstallTab(md, tab);
  md.classList.add('on');
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function navButton(id: string, label: string, onclick: () => void) {
  if (document.getElementById(id)) return;
  const nav = document.getElementById('nav');
  if (!nav) return;
  const b = el(
    'button',
    'text-align:left;background:transparent;border:0;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;color:inherit',
    label
  ) as HTMLButtonElement;
  b.id = id;
  b.type = 'button';
  b.onclick = onclick;
  const before = document.getElementById('auth-login-btn') || document.getElementById('user-info-box');
  if (before && before.parentNode === nav) nav.insertBefore(b, before);
  else nav.appendChild(b);
}

function ensureNavButtons() {
  navButton('tour-btn', '🎬 Tour', () => runTour('home', HOME_STEPS));
  navButton('install-btn', '📲 Install app', openInstall);
}

/** Small "?" launcher inside the editor. */
function ensureFab() {
  if (document.getElementById('tour-fab')) return;
  const b = el('button', '', '?') as HTMLButtonElement;
  b.id = 'tour-fab';
  b.type = 'button';
  b.title = 'Replay the tool tour';
  b.setAttribute('aria-label', 'Replay the tool tour');
  b.onclick = () => runTour('editor', EDITOR_STEPS);
  document.body.appendChild(b);
}

/**
 * The animation frame bar sits across the bottom of the page whenever animation
 * is on, right under the "?" button. Lift the button clear of it rather than
 * parking it at a fixed height — the bar's own height changes with the filmstrip.
 */
function placeFab() {
  const fab = document.getElementById('tour-fab');
  if (!fab) return;
  let bottom = 74;
  const frb = document.getElementById('frb');
  if (frb && getComputedStyle(frb).display !== 'none') {
    const r = frb.getBoundingClientRect();
    if (r.height > 0) bottom = Math.max(bottom, Math.round(window.innerHeight - r.top) + 10);
  }
  fab.style.bottom = bottom + 'px';
  // the focus-mode padlock sits on top of this button, so it has to move too
  (window as any).__inkpad_focus?.place?.();
}

function edVisible(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

/* ------------------------------------------------------------------ */
/* Auto-start                                                          */
/* ------------------------------------------------------------------ */

let autoEditorTimer = 0;

function maybeAutoStartHome() {
  if (localStorage.getItem(HOME_FLAG)) return;
  if (edVisible()) return;
  if (document.getElementById('auth-md')?.classList.contains('on')) return;
  if (active) return;
  runTour('home', HOME_STEPS);
}

function watchEditor() {
  let wasOpen = edVisible();
  const tick = () => {
    const open = edVisible();
    const fab = document.getElementById('tour-fab');
    if (fab) fab.style.display = open ? 'flex' : 'none';
    if (open) placeFab();
    if (open && !wasOpen) {
      // The home tour describes the library; its spotlight has no business
      // following the user into the editor, where its steps point at controls
      // that no longer exist. Retire it before the editor's own tour is
      // offered so the two never fight over the screen.
      if (active && active.id === 'home') stopTour(false);
      // first time in the editor: offer the tool tour
      clearTimeout(autoEditorTimer);
      if (!localStorage.getItem(EDITOR_FLAG) && !active) {
        autoEditorTimer = window.setTimeout(() => {
          if (!active && edVisible()) runTour('editor', EDITOR_STEPS);
        }, 900);
      }
    }
    if (!open && wasOpen) stopTour(false);
    wasOpen = open;
  };
  tick();
  new MutationObserver(tick).observe(document.getElementById('ed') || document.body, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  setInterval(tick, 700);
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
/* The spotlight is decoration, not a modal trap. It used to blanket the whole
   viewport with pointer-events:auto at z-index 300, so while any tour was up
   every button underneath (the colour palette, pen settings, the toolbar)
   silently stopped responding. Let presses fall through to the app; only the
   card itself is interactive. */
#tour-root{position:fixed;inset:0;z-index:300;display:none;pointer-events:none;font:inherit}
#tour-dim{position:absolute;inset:0;background:rgba(9,12,20,.62);opacity:0;transition:opacity .2s;pointer-events:none}
#tour-hole{position:absolute;border-radius:12px;box-shadow:0 0 0 9999px rgba(9,12,20,.62);transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1),width .26s cubic-bezier(.22,.61,.36,1),height .26s cubic-bezier(.22,.61,.36,1),opacity .2s;pointer-events:none;opacity:0}
#tour-ring{position:absolute;border:2px solid var(--ac);border-radius:14px;pointer-events:none;opacity:0;transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1),width .26s cubic-bezier(.22,.61,.36,1),height .26s cubic-bezier(.22,.61,.36,1),opacity .2s;animation:tourPulse 1.8s ease-out infinite}
@keyframes tourPulse{0%{box-shadow:0 0 0 0 rgba(47,109,246,.45)}70%{box-shadow:0 0 0 10px rgba(47,109,246,0)}100%{box-shadow:0 0 0 0 rgba(47,109,246,0)}}
#tour-card{position:absolute;background:var(--sf);color:var(--tx);border:1px solid var(--bd);border-radius:16px;padding:14px 15px 12px;box-shadow:0 18px 44px rgba(6,12,28,.34);display:flex;flex-direction:column;gap:9px;max-height:min(78vh,560px);overflow:auto;pointer-events:auto;transition:left .26s cubic-bezier(.22,.61,.36,1),top .26s cubic-bezier(.22,.61,.36,1)}
#tour-top{display:flex;justify-content:space-between;align-items:center}
#tour-count{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--ac);background:rgba(47,109,246,.12);padding:2px 8px;border-radius:999px}
#tour-x{border:0;background:transparent;color:var(--mu);font-size:15px;cursor:pointer;padding:2px 4px;line-height:1}
#tour-title{margin:0;font-size:16.5px;line-height:1.25}
#tour-body{margin:0;font-size:13px;line-height:1.55;color:var(--mu)}
#tour-body b{color:var(--tx)}
#tour-body code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:4px;font-size:12px}
#tour-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:2px}
#tour-skip{border:0;background:transparent;color:var(--mu);font-size:12px;cursor:pointer;padding:6px 2px;text-decoration:underline}
#tour-nav{display:flex;gap:8px}
#tour-nav button{font-size:13px;padding:8px 15px;border-radius:10px;cursor:pointer}
#tour-nav #tour-next{font-weight:600}
#tour-fab{position:fixed;right:14px;bottom:74px;z-index:60;width:40px;height:40px;border-radius:50%;border:1px solid var(--bd);background:var(--sf);color:var(--ac);font:600 17px/1 var(--slate-font);cursor:pointer;box-shadow:0 6px 18px rgba(6,12,28,.18);display:none;align-items:center;justify-content:center}
#tour-fab:hover{background:color-mix(in srgb,var(--ac) 12%,var(--sf))}
/* the engine's own install button is replaced by the guide entry point */
#nav #pwa-btn{display:none!important}
#install-md{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;z-index:250;padding:16px}
#install-md.on{display:flex}
#install-md .box{background:var(--sf);color:var(--tx);border-radius:18px;padding:18px;width:min(94vw,420px);max-height:88vh;overflow:auto;display:flex;flex-direction:column;gap:11px;border:1px solid var(--bd);box-shadow:0 18px 44px rgba(6,12,28,.3)}
html.tour-on #tour-fab{display:none!important}
@media (max-width:620px){

  #tour-card{padding:12px 13px 10px;border-radius:14px 14px 0 0}
  #tour-nav button{padding:9px 16px}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

/**
 * Hold a first-run step until the opening card has lifted.
 *
 * `src/intro.ts` publishes `__slateIntro` and it is the first module on the
 * page, so it is there by the time this file runs. Without the wait, the home
 * tour would start under the card and be waiting at the door the instant it
 * opened — two greetings for the same arrival.
 */
function afterIntro(fn: () => void) {
  const intro = (window as any).__slateIntro;
  if (intro && typeof intro.whenDone === 'function') intro.whenDone(fn);
  else fn();
}

function boot() {
  const style = document.createElement('style');
  style.id = 'tour-styles';
  style.textContent = CSS;
  document.head.appendChild(style);

  ensureNavButtons();
  ensureFab();
  watchEditor();

  // Home tour on first visit (give the library a moment to paint).
  afterIntro(() => setTimeout(maybeAutoStartHome, 500));

  // Offer the install guide once on iOS, where the flow is least obvious.
  if (isIOS && !isStandalone && !localStorage.getItem('inkpad-install-dismissed')) {
    afterIntro(() => setTimeout(() => {
      if (active || document.getElementById('install-md')?.classList.contains('on')) return;
      const md = buildInstallPanel();
      const body = md.querySelector('#install-body') as HTMLElement;
      const note = md.querySelector('#install-note') as HTMLElement;
      renderInstallTab(md, 'ios');
      const dismiss = el('button', 'font-size:12px;padding:6px 10px;align-self:flex-start;margin-top:2px', 'Don’t show this again') as HTMLButtonElement;
      dismiss.onclick = () => {
        localStorage.setItem('inkpad-install-dismissed', '1');
        md.classList.remove('on');
      };
      body.appendChild(dismiss);
      note.textContent = 'You can reopen this any time from “📲 Install app” in the sidebar.';
      md.classList.add('on');
    }, 2200));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/* Test / debug bridge */
(window as any).__inkpad_tour = {
  home: () => runTour('home', HOME_STEPS),
  editor: () => runTour('editor', EDITOR_STEPS),
  install: openInstall,
  stop: () => stopTour(false),
  reset() {
    localStorage.removeItem(HOME_FLAG);
    localStorage.removeItem(EDITOR_FLAG);
    localStorage.removeItem('inkpad-install-dismissed');
  },
  get running() {
    return !!active;
  },
  steps: () => (active ? active.steps.map((s) => s.title) : []),
};
