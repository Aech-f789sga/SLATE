/**
 * Collapse the shelf's left rail.
 *
 * The navigation is 248px of permanent furniture — Documents, Favorites,
 * Trash, Stylus & pen, Cloud backup, account, Tour, Install — and on a laptop
 * it is a third of the window before a single notebook is on screen. This adds
 * one control that hides it and gives the shelf the full width.
 *
 * The toggle lives in the top bar rather than on the rail itself, because a
 * control that lives on the thing it hides is unreachable the moment it works.
 * State is remembered, so someone who works full-width stays full-width across
 * reloads.
 */

const KEY = 'inkpad_nav_hidden';

const CSS = `
#nav-hide{
  display:inline-flex;align-items:center;justify-content:center;
  width:34px;height:34px;flex:0 0 auto;margin-right:2px;
  border-radius:9px;cursor:pointer;padding:0;
  border:1px solid var(--bd);
  background:color-mix(in srgb, var(--sf) 86%, transparent);
  color:var(--mu);transition:color .15s,border-color .15s,background .15s;
}
#nav-hide:hover{color:var(--ac);border-color:var(--ac)}
#nav-hide svg{width:17px;height:17px;display:block}
#nav-hide .nav-hide-on{display:none}
html[data-nav="off"] #nav-hide{color:var(--ac);border-color:color-mix(in srgb, var(--ac) 45%, var(--bd))}
html[data-nav="off"] #nav-hide .nav-hide-on{display:block}
html[data-nav="off"] #nav-hide .nav-hide-off{display:none}

/* The rail goes entirely: no width reserved, no border, nothing to tab into. */
html[data-nav="off"] #nav{display:none!important}

/* On a phone the rail is a horizontal strip, and hiding it should free that
   space rather than leave a gap. */
@media(max-width:760px){
  html[data-nav="off"] #lib{flex-direction:column}
}
`;

const ICON_OPEN = `<svg class="nav-hide-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M6 10l1.5 2L6 14"/></svg>`;
const ICON_CLOSED = `<svg class="nav-hide-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M12 10l-1.5 2L12 14"/></svg>`;

function mount() {
  if (document.getElementById('nav-hide')) return;
  const top = document.getElementById('gn-top');
  if (!top) return;

  const style = document.createElement('style');
  style.id = 'nav-hide-style';
  style.textContent = CSS;
  document.head.append(style);

  const b = document.createElement('button');
  b.id = 'nav-hide';
  b.type = 'button';
  b.innerHTML = ICON_OPEN + ICON_CLOSED;
  b.setAttribute('data-no-sfx', '');

  const apply = (hidden: boolean) => {
    document.documentElement.dataset.nav = hidden ? 'off' : 'on';
    b.setAttribute('aria-pressed', String(hidden));
    b.setAttribute(
      'aria-label',
      hidden ? 'Show the navigation rail' : 'Hide the navigation rail',
    );
    b.title = hidden ? 'Show sidebar' : 'Hide sidebar';
  };

  let hidden = false;
  try {
    hidden = localStorage.getItem(KEY) === '1';
  } catch {
    /* storage may be unavailable */
  }
  apply(hidden);

  b.onclick = () => {
    hidden = !hidden;
    apply(hidden);
    try {
      localStorage.setItem(KEY, hidden ? '1' : '0');
    } catch {
      /* ignore */
    }
    // The shelf lays out from its own width, so tell it the box changed.
    window.dispatchEvent(new Event('resize'));
  };

  top.insertBefore(b, top.firstChild);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
// the top bar is rebuilt by a couple of modules on boot; be idempotent
window.setTimeout(mount, 300);
