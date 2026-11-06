/**
 * Focus mode — one button that takes the app away and leaves the pens.
 *
 * A notebook is a page and a pen. Everything else in the editor — the toolbar,
 * the page strip, the thumbnails, the floating pills, the tour button — is
 * scaffolding for getting the right pen in your hand, and once it is in your
 * hand it is only in the way. This hides all of it and keeps exactly one thing:
 * the pen dock, which moves to the top edge and can be dragged to any edge
 * afterwards.
 *
 * The button that turns it on stays on screen while it is on. That is not a
 * contradiction — it is the way out. It sits directly above the tour button,
 * reads as an open padlock while the app is unlocked and a closed one while it
 * is locked, and the first lock says where it is in words, once.
 *
 * The state is deliberately not remembered across a reload: a mode whose whole
 * job is to remove the controls should never be the mode you wake up in.
 */

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

/* Closed shackle — the app is locked down to the page and the pens. */
const ICON_LOCK =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/><path d="M8 10.5V7.8a4 4 0 018 0v2.7"/><circle cx="12" cy="15.2" r="1.15" fill="currentColor" stroke="none"/></svg>';

/* Shackle swung out of the body — the app is unlocked, nothing is hidden. */
const ICON_OPEN =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/><path d="M8 10.5V7.8a4 4 0 017.4-2.1"/><circle cx="12" cy="15.2" r="1.15" fill="currentColor" stroke="none"/></svg>';

let btn: HTMLButtonElement | null = null;
let on = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}

function toast(msg: string) {
  try {
    (window as any).eval(`toast(${JSON.stringify(msg)})`);
  } catch {
    /* the engine's toast is a nicety, not the mechanism */
  }
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function apply(next: boolean, quiet = false) {
  if (next === on) return;
  on = next;
  document.documentElement.dataset.focus = on ? '1' : '0';
  if (btn) {
    // unlocked shows the open padlock, locked shows the closed one
    btn.innerHTML = on ? ICON_LOCK : ICON_OPEN;
    btn.title = on ? 'Unlock — bring the toolbars back' : 'Lock — leave only the pens';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    // visibility is tick()'s job; toggling it here would blink the button out
    // for one interval every time it is used to unlock
  }
  // the dock listens for this and moves itself to the top edge
  document.dispatchEvent(new CustomEvent('inkpad-focus', { detail: { on } }));
  if (on && !quiet) toast('Locked. Only the pens stay — the padlock brings the rest back.');
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

function edOpen(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

/**
 * Sit directly above the tour button.
 *
 * That button moves itself up whenever the animation strip is showing, so its
 * `bottom` is read rather than assumed; if it has not been placed yet, 74 px is
 * where it starts.
 */
function place() {
  if (!btn) return;
  const fab = document.getElementById('tour-fab');
  let bottom = 74;
  if (fab) {
    const v = parseFloat(fab.style.bottom || '');
    if (Number.isFinite(v)) bottom = v;
  }
  btn.style.bottom = `${bottom + 48}px`;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#ink-lock{
  position:fixed;right:14px;bottom:122px;z-index:61;width:40px;height:40px;border-radius:50%;
  border:1px solid var(--bd,#d9d9de);background:var(--sf,#fff);color:var(--mu,#6e6e73);
  display:none;align-items:center;justify-content:center;padding:0;cursor:pointer;
  box-shadow:0 6px 18px rgba(6,12,28,.18);
  transition:color .15s ease,background .15s ease,opacity .18s ease,transform .18s ease;
}
#ink-lock.on{display:flex}
#ink-lock:hover{color:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6)}
#ink-lock[aria-pressed="true"]{color:var(--ac,#2f6df6);background:color-mix(in srgb,var(--ac,#2f6df6) 12%,var(--sf,#fff))}

/* Everything that is not the page, the pen rail, or this button. */
html[data-focus="1"] #tb,
html[data-focus="1"] #gn-tabs,
html[data-focus="1"] #gn-foot,
html[data-focus="1"] #side,
html[data-focus="1"] #frb,
html[data-focus="1"] #tour-fab,
html[data-focus="1"] #ink-brush,
html[data-focus="1"] #ink-penset,
html[data-focus="1"] #ink-erset,
html[data-focus="1"] #ink-shape,
html[data-focus="1"] #ink-shape-hint,
html[data-focus="1"] #acc-trigger,
html[data-focus="1"] #acc-pop,
html[data-focus="1"] #acc-onnx,
html[data-focus="1"] #acc-snap,
html[data-focus="1"] #acc-smart,
html[data-focus="1"] #acc-tools,
html[data-focus="1"] #sh-trigger,
html[data-focus="1"] #sh-pick,
html[data-focus="1"] #snap-btn,
html[data-focus="1"] #cloud-btn,
html[data-focus="1"] #guest-banner,
html[data-focus="1"] #beta-badge,
html[data-focus="1"] #admin-chip,
html[data-focus="1"] #gn-zoomwin,
html[data-focus="1"] #gn-timekeeper,
html[data-focus="1"] #gn-note-btn,
html[data-focus="1"] #lasso-pill,
html[data-focus="1"] #calc-pop{display:none!important}

/* A locked page should feel like a page: no margin theatre, no scrollbar seam. */
html[data-focus="1"] #stage{padding:10px}
html[data-focus="1"] #ed{background:var(--bg,#eef1f5)}

/* The page bar survives the lock, but only the part that is writing: turn the
   page, see which one you are on, add another. Duplicating and deleting a page
   are editing decisions and stay with the toolbars. It floats as a pill so it
   does not become a second toolbar across the bottom of the screen. */
html[data-focus="1"] #pg{
  position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60;
  flex:none;padding:4px 8px;gap:4px;border:1px solid var(--bd);
  border-radius:999px;background:color-mix(in srgb,var(--sf) 92%,transparent);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  box-shadow:0 8px 24px rgba(6,12,28,.18);
}
html[data-focus="1"] #pg #dup,
html[data-focus="1"] #pg #del{display:none!important}
/* Lift it clear of a pen rail parked along the bottom edge. */
html[data-focus="1"] body.pd-open[data-pd=bottom] #pg{bottom:78px}
/* One long strip has no "next page" to turn to — scrolling is the page turn,
   so the arrows would be a second, disagreeing way to do the same thing. */
html[data-focus="1"][data-flow="strip"] #pg #prev,
html[data-focus="1"][data-flow="strip"] #pg #next,
html[data-focus="1"][data-flow="strip"] #pg #pn{display:none!important}
@media(max-width:640px){
  html[data-focus="1"] #pg{bottom:10px;padding:3px 6px}
  html[data-focus="1"] body.pd-open[data-pd=bottom] #pg{bottom:70px}
}

/* The pen pill is part of the toolbar, so it goes with it — except when the
   rail asks for it. Picking a pen in focus mode puts the peek class on the
   pill for a few seconds: width and colour are what you reach for next, and
   with the toolbar gone there was no way to reach them at all. */
html[data-focus="1"] #ink-pen:not(.peek){display:none!important}
html[data-focus="1"] #ink-pen.peek{z-index:36}

/* The rail's grip sits below a top-mounted rail, so leave room for it. */
html[data-focus="1"] body.pd-open[data-pd=top] #stage{padding-top:96px}
html[data-focus="1"] body.pd-open[data-pd=bottom] #stage{padding-bottom:96px}

@media(max-width:640px){
  #ink-lock{width:36px;height:36px;right:10px}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function build() {
  if (document.getElementById('ink-lock')) return;
  btn = el('button') as HTMLButtonElement;
  btn.id = 'ink-lock';
  btn.type = 'button';
  btn.innerHTML = ICON_OPEN;
  btn.title = 'Lock — leave only the pens';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', 'false');
  btn.onclick = (e) => {
    e.stopPropagation();
    apply(!on);
  };
  document.body.append(btn);

  const style = el('style');
  style.id = 'ink-lock-style';
  style.textContent = CSS;
  document.head.append(style);

  tick();
  window.setInterval(tick, 300);
  window.addEventListener('resize', place);
}

function tick() {
  if (!btn) return;
  const open = edOpen();
  btn.classList.toggle('on', open);
  if (!open) {
    // never leave someone locked out of a screen that has no padlock on it
    if (on) apply(false, true);
    return;
  }
  place();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
else build();

/** Small surface for probes and for the tour, which may want to step out of it. */
(window as any).__inkpad_focus = {
  on: () => on,
  set: (v: boolean, quiet = false) => apply(v, quiet),
  place,
};
