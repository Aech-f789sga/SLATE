/**
 * Collapse the shelf's left navigation rail with a hamburger toggle.
 *
 * There used to be two of these — one in the navigation panel header and one in
 * the shelf top bar — wired to the same `toggle`. With the rail open both were
 * on screen doing the same thing, which reads as a duplicate rather than a
 * convenience, so only the top-bar one survives. It is also the one that has to
 * exist: `html[data-nav="off"]` hides `#nav` outright, so a button living
 * inside the rail disappears along with the thing it is meant to bring back.
 *
 * State is remembered across reloads.
 */

const KEY = 'slate_nav_hidden';

const HAMBURGER_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3.5" y1="6" x2="20.5" y2="6"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><line x1="3.5" y1="18" x2="20.5" y2="18"/></svg>`;

const CSS = `
#nav-hide {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; flex: 0 0 auto;
  border-radius: 8px; cursor: pointer; padding: 0;
  border: 1px solid var(--bd);
  background: color-mix(in srgb, var(--sf) 88%, transparent);
  color: var(--tx);
  transition: color .15s, border-color .15s, background .15s, transform .1s;
}
#nav-hide:hover {
  color: var(--ac);
  border-color: var(--ac);
  background: color-mix(in srgb, var(--ac) 12%, var(--sf));
}
#nav-hide:active {
  transform: scale(0.94);
}
#nav-hide svg {
  width: 18px; height: 18px; display: block;
}

html[data-nav="off"] #nav-hide {
  color: var(--ac);
  border-color: color-mix(in srgb, var(--ac) 45%, var(--bd));
  background: color-mix(in srgb, var(--ac) 15%, var(--sf));
}

/* The rail collapses completely when data-nav="off" */
html[data-nav="off"] #nav {
  display: none !important;
}

@media(max-width:640px) {
  html[data-nav="off"] #lib {
    flex-direction: column;
  }
}
`;

function mount() {
  const top = document.getElementById('gn-top');

  if (!document.getElementById('nav-hide-style')) {
    const style = document.createElement('style');
    style.id = 'nav-hide-style';
    style.textContent = CSS;
    document.head.append(style);
  }

  // Ensure button in top bar (#gn-top) exists
  let b = document.getElementById('nav-hide') as HTMLButtonElement | null;
  if (!b && top) {
    b = document.createElement('button');
    b.id = 'nav-hide';
    b.type = 'button';
    b.innerHTML = HAMBURGER_SVG;
    b.setAttribute('data-no-sfx', '');
    top.insertBefore(b, top.firstChild);
  } else if (b) {
    b.innerHTML = HAMBURGER_SVG;
  }

  // The old duplicate in the rail header. It is gone from the markup, but a
  // stale one can survive a hot reload, so remove it on the way through.
  document.getElementById('nav-toggle-btn')?.remove();

  let hidden = false;
  try {
    hidden = localStorage.getItem(KEY) === '1' || localStorage.getItem('inkpad_nav_hidden') === '1';
  } catch {}

  const apply = (isOff: boolean) => {
    document.documentElement.dataset.nav = isOff ? 'off' : 'on';
    if (!b) return;
    b.setAttribute('aria-pressed', String(isOff));
    b.setAttribute('aria-label', isOff ? 'Show navigation panel' : 'Hide navigation panel');
    b.title = isOff ? 'Show sidebar' : 'Hide sidebar';
  };

  const toggle = (e?: Event) => {
    if (e) e.stopPropagation();
    hidden = !hidden;
    apply(hidden);
    try {
      localStorage.setItem(KEY, hidden ? '1' : '0');
    } catch {}
    window.dispatchEvent(new Event('resize'));
  };

  if (b) b.onclick = toggle;

  apply(hidden);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
window.setTimeout(mount, 300);
window.setTimeout(mount, 800);
