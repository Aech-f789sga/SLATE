/**
 * Collapse the shelf's left navigation rail with a hamburger toggle.
 *
 * Provides a 3-horizontal-lines hamburger icon on both the navigation panel header
 * and the shelf top bar (#gn-top) so users can hide and show the panel from either location.
 * State is remembered across reloads.
 */

const KEY = 'slate_nav_hidden';

const HAMBURGER_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3.5" y1="6" x2="20.5" y2="6"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><line x1="3.5" y1="18" x2="20.5" y2="18"/></svg>`;

const CSS = `
#nav-hide, #nav-toggle-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; flex: 0 0 auto;
  border-radius: 8px; cursor: pointer; padding: 0;
  border: 1px solid var(--bd);
  background: color-mix(in srgb, var(--sf) 88%, transparent);
  color: var(--tx);
  transition: color .15s, border-color .15s, background .15s, transform .1s;
}
#nav-hide {
  margin-right: 6px;
}
#nav-hide:hover, #nav-toggle-btn:hover {
  color: var(--ac);
  border-color: var(--ac);
  background: color-mix(in srgb, var(--ac) 12%, var(--sf));
}
#nav-hide:active, #nav-toggle-btn:active {
  transform: scale(0.94);
}
#nav-hide svg, #nav-toggle-btn svg {
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

@media(max-width:760px) {
  html[data-nav="off"] #lib {
    flex-direction: column;
  }
}
`;

function mount() {
  const top = document.getElementById('gn-top');
  const nav = document.getElementById('nav');

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

  // Ensure button in #nav header exists
  let navBtn = document.getElementById('nav-toggle-btn') as HTMLButtonElement | null;
  if (!navBtn && nav) {
    const firstDiv = nav.querySelector('div:first-child');
    if (firstDiv) {
      navBtn = document.createElement('button');
      navBtn.id = 'nav-toggle-btn';
      navBtn.type = 'button';
      navBtn.innerHTML = HAMBURGER_SVG;
      navBtn.setAttribute('data-no-sfx', '');
      firstDiv.insertBefore(navBtn, firstDiv.firstChild);
    }
  } else if (navBtn) {
    navBtn.innerHTML = HAMBURGER_SVG;
  }

  let hidden = false;
  try {
    hidden = localStorage.getItem(KEY) === '1' || localStorage.getItem('inkpad_nav_hidden') === '1';
  } catch {}

  const apply = (isOff: boolean) => {
    document.documentElement.dataset.nav = isOff ? 'off' : 'on';
    const label = isOff ? 'Show navigation panel' : 'Hide navigation panel';
    if (b) {
      b.setAttribute('aria-pressed', String(isOff));
      b.setAttribute('aria-label', label);
      b.title = isOff ? 'Show sidebar' : 'Hide sidebar';
    }
    if (navBtn) {
      navBtn.setAttribute('aria-pressed', String(isOff));
      navBtn.setAttribute('aria-label', label);
      navBtn.title = isOff ? 'Show sidebar' : 'Hide sidebar';
    }
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
  if (navBtn) navBtn.onclick = toggle;

  apply(hidden);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
window.setTimeout(mount, 300);
window.setTimeout(mount, 800);
