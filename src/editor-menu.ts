import { anchorBelow } from './ui-system';

/**
 * The two writing switches, in their own pill beside the page card.
 *
 * Pen only and Sound were the last group inside the page card, and they never
 * belonged there. Everything else in that card is a property of the *page* —
 * the paper, the ruling, the colour, the export resolution — set once and left
 * alone. These two are properties of the *session*: you flip palm rejection the
 * moment a resting hand smudges a line, and you flip the ink sounds when the
 * room goes quiet. They are the two controls you reach for mid-sentence, and
 * they were two clicks deep in a card that covers the page you are writing on.
 *
 * So they move out: a second pill beside the page pill, and a small card that
 * drops under it. Same manners as the page card — press to open, press to shut,
 * a click anywhere else or Escape closes it, and it slides back up on resize
 * because the pill it hangs from has moved by then.
 *
 * The engine's own checkboxes stay exactly where they are. `#po` and `#snd` are
 * read straight from `index.html` on every pointerdown and every sound, and the
 * toolbar moves them between `#bar` and `#bar2` whenever the layout changes, so
 * re-parenting them is how this breaks. They are hidden in place and mirrored
 * here instead — the same trick the stylus panel already uses for `#pen-po`.
 */

const CSS = `
/* ---- the pill, next to the page pill ---- */
#bar2 #edm{
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  padding:6px 9px!important;border-radius:11px!important;
  background:#fff!important;color:#2b3542!important;
  border:1px solid #eaeef5!important;
  box-shadow:0 8px 22px rgba(8,20,38,.22)!important;
  cursor:pointer;
}
#bar2 #edm:hover{box-shadow:0 10px 26px rgba(8,20,38,.3)!important}
#bar2 #edm svg{width:14px;height:14px;display:block;opacity:.75;transition:opacity .15s ease}
#bar2 #edm[aria-expanded="true"] svg{opacity:1}
#bar2 #edm[aria-expanded="true"]{
  box-shadow:0 8px 22px rgba(8,20,38,.22),inset 0 0 0 1.5px rgba(47,109,246,.6)!important;
}

/* the pill only exists beside the page pill, so it goes wherever that goes */
html[data-bar=compact] #edm{display:none!important}
/* ...and it is not a header control: the page card's own header is a title and
   a close button, and a third pill wedged between them reads as a third action */
#bar2.open #edm{display:none!important}

/* the engine's own Pen only / Sound labels, hidden where they sit */
#bar2 label.edm-away{display:none!important}
/* ...and the six tool triggers, which the page card used to carry under a
   heading of their own. Nothing here is a page property: guides, layers,
   animation and the two libraries are tools, and tools belong with the pens. */
#bar2 .edm-away{display:none!important}

/* ---- the card ---- */
/* The card is a child of the body, not of the toolbar. Two reasons, both
   learned the hard way: the toolbar is its own stacking context at z 20 (so a
   card inside it paints under the floating ink pill at 28), and several skins
   clip the bar to a chamfered outline with clip-path, which clips a fixed
   descendant just as happily as it clips a child. On the body there is no
   ancestor to fight — 55 clears the toolbar at 40 and the ink pill at 28, and
   stays under the drawer at 70. */
#edm-card{
  position:fixed;left:0;top:0;display:none;flex-direction:column;
  width:min(286px,calc(100vw - 20px));
  padding:8px 10px 10px;
  background:#fff;border:1px solid #e7ecf4;border-radius:15px;
  box-shadow:0 18px 44px rgba(8,20,38,.28);
  color:#2b3542;z-index:55;
  font:400 12.5px/1.35 var(--slate-font);
}
#edm-card.open{display:flex;animation:edm-drop .17s cubic-bezier(.2,.8,.3,1) both}
/* laid out but not animating, so the first measurement is the resting box */
#edm-card.measuring{display:flex}
#edm-card.closing{display:flex;pointer-events:none;animation:edm-rise .12s ease-in both}
@keyframes edm-drop{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:none}}
@keyframes edm-rise{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-7px)}}
@media (prefers-reduced-motion:reduce){
  #edm-card.open,#edm-card.closing{animation:none}
}

#edm-card .edm-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:0 2px 6px;border-bottom:1px solid #f0f3f8;margin-bottom:4px;
}
#edm-card .edm-head span{
  font:600 10px/1 var(--slate-font);
  letter-spacing:.09em;text-transform:uppercase;color:#8a94a6;
}
#edm-card .edm-x{
  width:22px;height:22px;padding:0;display:grid;place-items:center;
  border:0;border-radius:7px;background:#f2f4f8;color:#5d6776;
  font-size:11px;line-height:1;cursor:pointer;
}
#edm-card .edm-x:hover{background:#e8ecf3}

#edm-card label.edm-row{
  display:flex;align-items:flex-start;gap:9px;
  padding:7px 4px;border-radius:9px;cursor:pointer;
}
#edm-card label.edm-row:hover{background:#f6f8fc}
#edm-card label.edm-row input{
  margin:1px 0 0;width:15px;height:15px;flex:none;
  accent-color:#2f6df6;cursor:pointer;
}
#edm-card .edm-txt{display:flex;flex-direction:column;gap:1px;min-width:0}
#edm-card .edm-txt b{font-weight:600;font-size:12.5px;color:#2b3542}
#edm-card .edm-txt em{
  font-style:normal;font-size:11px;line-height:1.35;color:#8a94a6;
}

/* ---- tools: clones of the engine's own triggers ---- */
#edm-card .edm-tools{
  display:flex;flex-wrap:wrap;gap:5px;align-items:center;
  padding:7px 4px 3px;margin-top:4px;border-top:1px solid #f0f3f8;
}
#edm-card .edm-tool{
  width:32px;height:30px;padding:0;display:grid;place-items:center;flex:none;
  border:1px solid #e7ecf4;border-radius:9px;background:#f6f8fc;color:#2b3542;
  font-size:12px;cursor:pointer;
}
#edm-card .edm-tool:hover{background:#eef2f9;border-color:#d7e0ee}
#edm-card .edm-tool.on{background:#e8f0fe;border-color:#2f6df6;color:#2f6df6}
#edm-card .edm-tool svg{width:15px;height:15px;display:block}
`;

/** Three dots — the same glyph the user reached for, in the pill's own weight. */
const DOTS =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>';

let pill: HTMLButtonElement | null = null;
let card: HTMLElement | null = null;
let po: HTMLInputElement | null = null;
let snd: HTMLInputElement | null = null;
let style: HTMLStyleElement | null = null;
let built = false;
let closeTimer = 0;

/** The engine's real checkboxes. They stay in the toolbar, hidden. */
function real(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

/**
 * Hide the engine's labels in place.
 *
 * CSS `:has()` would do it in one line, but the toolbar rebuilds this row when
 * the window crosses into the compact layout, and a label that was hidden by a
 * stylesheet rule is hidden again for free — a class is not. So the class is
 * re-stamped by `tick()`, and the stylesheet rule is the fallback for the very
 * first frame.
 */
function markAway() {
  const bar = document.getElementById('bar2');
  if (!bar) return;
  for (const id of ['po', 'snd']) {
    const input = bar.querySelector(`#${id}`);
    const lab = input?.closest('label');
    if (lab && !lab.classList.contains('edm-away')) lab.classList.add('edm-away');
  }
  for (const b of toolButtons()) {
    if (!b.classList.contains('edm-away')) b.classList.add('edm-away');
  }
}

function mirror() {
  if (po) po.checked = !!real('po')?.checked;
  if (snd) snd.checked = !!real('snd')?.checked;
}

function push(id: string, on: boolean) {
  const r = real(id);
  if (!r) return;
  r.checked = on;
  // the engine listens for `change`, not for the property: `#po` drives
  // `touch-action` on the canvas, and the sound bank reads `#snd` on the next
  // stroke. Setting `.checked` alone would leave both on the old value.
  r.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/**
 * The six triggers the page card used to carry.
 *
 * Guides, Layers, Animate, Play, Engineering symbols and the Figure library
 * are tools, not page properties, and they were only ever in that card because
 * the engine appends them to the same row and page-menu hung its last heading
 * over whatever trailed. So they move here — but they are *cloned*, not moved.
 * Their handlers belong to four other modules, several of which re-bind them on
 * layout, and a re-parented button is a button that stops working the next time
 * `setupBars()` runs. A clone that forwards `click()` cannot go stale.
 */
const TOOL_TITLE =
  /^(Guides|Layers|Animate next drawing|Play animation|Engineering symbols|Figure library)/;

/**
 * The engine's own buttons, in row order.
 *
 * Matched on the title alone, deliberately. The obvious extra filter — "skip
 * anything with `display:none`" — reads its own effect back: hiding the
 * originals is what makes room for the clones, so the second tick saw an empty
 * row and wiped the clones it had just made. The only button the engine hides
 * on its own here is Insert video, and it is left out by name.
 */
function toolButtons(): HTMLButtonElement[] {
  const bar = document.getElementById('bar2');
  if (!bar) return [];
  return Array.from(bar.children).filter(
    (n): n is HTMLButtonElement => n.tagName === 'BUTTON' && TOOL_TITLE.test((n as HTMLElement).title || '')
  );
}

/**
 * Put a drawer that a clone opened beside the clone.
 *
 * The engine anchors its drawer to the button it was handed, and the button it
 * gets is the *original* — which `syncTools` hides, so it has no box at all.
 * A boxless anchor measures 0×0 and the drawer lands in the top-left corner of
 * the window, a long way from the hand that pressed it. The hand pressed the
 * clone, so the drawer belongs under the clone. Same placement rules as the
 * engine's own `openDr`: below the anchor, flipped above when it would run off
 * the bottom, clamped to the window.
 */
function anchorDrawer(anchor: HTMLElement) {
  const drw = document.getElementById('gn-drw');
  if (!drw || drw.style.display !== 'block') return;
  // The shared helper prefers below, flips above only when below does not fit,
  // clamps to the 8px gutter, and measures the fixed box's real origin so a
  // transformed toolbar cannot shift it. It also refuses to move a drawer the
  // user has dragged.
  const p = anchorBelow(drw, anchor, { align: 'start', gap: 6 });
  if (!p) return;
  const w = drw.offsetWidth;
  const h = drw.offsetHeight;

  /* A flipped drawer can land across the pen row, which reads as the dropdown
     coming out of the wrong place entirely. Nudge it below the row instead. */
  const pen = document.getElementById('ink-pen');
  if (pen) {
    const pr = pen.getBoundingClientRect();
    const hits =
      pr.width > 0 &&
      p.left < pr.right && p.left + w > pr.left &&
      p.top < pr.bottom && p.top + h > pr.top;
    if (hits) {
      const wantTop = Math.min(Math.max(p.top, pr.bottom + 8), innerHeight - h - 8);
      drw.style.top = `${Math.round(wantTop - p.originY)}px`;
    }
  }
}

/**
 * Which clone owns the dropdown that is on screen, and what was open when the
 * press in progress began.
 *
 * A second press on the same icon has to close the dropdown, and the obvious
 * implementation does not: the engine shuts any drawer on a pointerdown outside
 * it — and the clone is outside it — so by the time the click arrives the drawer
 * is already gone, the forwarded click finds no owner, and it opens again. The
 * result is a dropdown that can be opened but never closed from its own button.
 *
 * The state has to be read before the engine reacts, and the engine's listener
 * is on `document` in the capture phase. A capture listener on `window` runs
 * before it — `window` is the one node above `document` on the way down — so the
 * press is judged there: open-and-mine means this press is a close.
 */
let openedBy: HTMLElement | null = null;
let pressWasOpen = false;
let pressOwner: HTMLElement | null = null;

function watchPress() {
  window.addEventListener(
    'pointerdown',
    () => {
      const drw = document.getElementById('gn-drw');
      pressWasOpen = drw?.style.display === 'block';
      pressOwner = openedBy;
    },
    true
  );
}

/** Watch the drawer so `openedBy` cannot outlive it, whoever shut it. */
let watchTries = 0;
function watchDrawer() {
  const drw = document.getElementById('gn-drw');
  if (!drw) {
    // the engine builds it during parse, so this is only a guard for a page that
    // loaded its classic script late — give it a few seconds, then give up
    if (watchTries++ < 10) window.setTimeout(watchDrawer, 300);
    return;
  }
  new MutationObserver(() => {
    if (drw.style.display !== 'block') openedBy = null;
  }).observe(drw, { attributes: true, attributeFilter: ['style'] });
}

function syncTools() {
  const host = card?.querySelector<HTMLElement>('.edm-tools');
  if (!host) return;
  const src = toolButtons();
  while (host.childElementCount > src.length) host.lastElementChild!.remove();
  src.forEach((b, i) => {
    let c = host.children[i] as HTMLButtonElement | undefined;
    if (!c) {
      c = document.createElement('button');
      c.type = 'button';
      c.className = 'edm-tool';
      const idx = i;
      const me = c;
      c.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pressWasOpen && pressOwner === me) return; // this press closed it
        // look the original up again: the set can change between opens, and the
        // captured node may be a stale clone of a row the engine has rebuilt
        toolButtons()[idx]?.click();
        anchorDrawer(me);
        openedBy = document.getElementById('gn-drw')?.style.display === 'block' ? me : null;
        window.setTimeout(syncTools, 140);
      };
      host.append(c);
    }
    // the glyph and the title are the button's whole state — Animate swaps its
    // icon and its title as the effect changes, and the two libraries swap
    // theirs on open
    if (c.dataset.sig !== b.title) {
      c.dataset.sig = b.title;
      c.innerHTML = b.innerHTML;
      c.title = b.title;
      c.setAttribute('aria-label', b.title);
    }
    c.classList.toggle('on', b.classList.contains('on'));
  });
}

function place() {
  if (!card || !pill || !pill.offsetWidth) return;
  // Right edge aligned with the trigger, directly below it, clamped and
  // flipped by the shared anchor. Called while `.measuring` is on so the
  // entry keyframe's transform cannot skew the measured box.
  anchorBelow(card, pill, { align: 'end', gap: 7 });
}

function isOpen(): boolean {
  return !!card && card.classList.contains('open');
}

function open() {
  if (!card || !pill || isOpen()) return;
  // The pill is hidden in the compact layout, where the whole bar lives behind
  // the "more" button — nothing can click it there, but the tour and the probes
  // can still call this, and a card at 0,0 with no pill above it is worse than
  // no card at all.
  if (!pill.offsetWidth) return;
  window.clearTimeout(closeTimer);
  card.classList.remove('closing');
  mirror();
  syncTools();
  // one card at a time: two floating panels under the same toolbar would cover
  // each other, and the page card is the wider of the two
  try {
    (window as any).__inkpad_pagemenu?.close();
  } catch {
    /* the page menu is optional here */
  }
  // Measure with the card laid out but not animating. The entry keyframe starts
  // 7 px high, and a transform is part of the rect — placing during it would
  // leave the card permanently 7 px lower than it was measured.
  card.classList.add('measuring');
  place();
  card.classList.remove('measuring');
  card.classList.add('open');
  pill.setAttribute('aria-expanded', 'true');
}

function close() {
  if (!card || !isOpen()) return;
  card.classList.remove('open');
  card.classList.add('closing');
  pill?.setAttribute('aria-expanded', 'false');
  window.clearTimeout(closeTimer);
  // the exit keyframe is 120 ms; display:none after it, or the card would keep
  // a hit area over the canvas
  closeTimer = window.setTimeout(() => card?.classList.remove('closing'), 130);
}

function build() {
  const bar = document.getElementById('bar2');
  const head = document.getElementById('pgm-head');
  if (!bar || !head || built) return;
  built = true;

  style = document.createElement('style');
  style.id = 'edm-style';
  style.textContent = CSS;
  document.head.append(style);

  pill = document.createElement('button');
  pill.id = 'edm';
  pill.type = 'button';
  pill.title = 'Editor options — pen only, sound';
  pill.setAttribute('aria-label', 'Editor options');
  pill.setAttribute('aria-expanded', 'false');
  pill.innerHTML = DOTS;
  pill.onclick = (e) => {
    e.stopPropagation();
    if (isOpen()) close();
    else open();
  };

  card = document.createElement('div');
  card.id = 'edm-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Editor options');
  card.innerHTML =
    '<div class="edm-head"><span>Editor</span>' +
    '<button type="button" class="edm-x" aria-label="Close">✕</button></div>' +
    '<label class="edm-row"><input type="checkbox" id="edm-po">' +
    '<span class="edm-txt"><b>Pen only</b>' +
    '<em>A finger pans and scrolls; only the stylus draws.</em></span></label>' +
    '<label class="edm-row"><input type="checkbox" id="edm-snd">' +
    '<span class="edm-txt"><b>Sound</b>' +
    '<em>Paper and pen sounds as you write.</em></span></label>' +
    '<div class="edm-tools" role="group" aria-label="Tools"></div>';

  po = card.querySelector('#edm-po');
  snd = card.querySelector('#edm-snd');
  po?.addEventListener('change', () => push('po', !!po!.checked));
  snd?.addEventListener('change', () => push('snd', !!snd!.checked));
  card.querySelector('.edm-x')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  // between the page pill and its ✕: beside the pill when the bar is closed,
  // and out of the card header when it is open
  head.insertBefore(pill, head.querySelector('.pgm-x') || null);
  // the card lives on the body — see the note above the `#edm-card` rule
  document.body.append(card);

  // the page card opening is the one thing that has to shut this one, and it is
  // opened from three places (the pill, the tour, and its own bridge), so watch
  // the click rather than each caller
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('#pgm')) close();
    },
    true
  );
  // ...and watch the flag as well, because the tour and `__inkpad_pagemenu`
  // both open the card without a click. `data-pgm` is set by page-menu's own
  // `open()` and cleared by its `close()`, so it is the one honest signal.
  new MutationObserver(() => {
    if (document.documentElement.dataset.pgm) close();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pgm'] });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!isOpen()) return;
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest('#edm-card') || t.closest('#edm')) return;
      close();
    },
    true
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('resize', () => close());

  // a pen touching the canvas flips `#po` on its own, and the stylus panel can
  // flip it too — the mirror follows whatever the real control ends up saying
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.id === 'po' || t.id === 'snd') mirror();
  });

  markAway();
  mirror();
  syncTools();
}

function tick() {
  const bar = document.getElementById('bar2');
  if (!bar) return;
  const head = document.getElementById('pgm-head');
  // the engine rebuilds this row when a notebook opens, and page-menu rebuilds
  // its header with it — so the pill is re-hung rather than assumed
  if (head && pill && !head.contains(pill)) {
    built = false;
    build();
  } else if (!pill && head) {
    built = false;
    build();
  }
  markAway();
  // the tool row is rebuilt by the engine and re-titled by three other modules,
  // so the clones are re-read on the same slow tick as the rest of this card
  syncTools();
}

function boot() {
  build();
  tick();
  watchPress();
  watchDrawer();
  window.setInterval(tick, 900);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/** Small surface for the tour and for probes. */
(window as any).__inkpad_edmenu = {
  open,
  close,
  toggle: () => (isOpen() ? close() : open()),
  isOpen,
};
