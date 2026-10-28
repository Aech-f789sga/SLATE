/**
 * Library — folders, card metadata and a per-notebook menu.
 *
 * The engine's shelf is a flat `lib` array rendered by `showLib()` into `#grid`,
 * and it already has search, favourites and a trash filter. What it has no
 * concept of is *where* a notebook lives, so this module adds:
 *
 *   • folders        a chip row above the grid, stored on the notebook as
 *                    `n.folder` so it travels with cloud sync
 *   • card metadata  a relative timestamp, and a "local" chip for guests
 *   • a ⋯ menu       rename, duplicate, favourite, move and delete
 *
 * Nothing here replaces `showLib`. The engine still renders every notebook and
 * this module hides the ones outside the active folder afterwards, which keeps
 * the engine's own search, sort and trash behaviour intact.
 */

/* ------------------------------------------------------------------ */
/* Engine access                                                       */
/* ------------------------------------------------------------------ */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

function el(tag: string, css?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(className: string, text?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  if (text !== undefined) b.textContent = text;
  return b;
}

function div(className: string, text?: string): HTMLElement {
  const d = document.createElement('div');
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

function lsGet(k: string, fallback: string): string {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
}

function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

function save() {
  ev('try{ save(); }catch(e){}');
}

function refresh() {
  ev('try{ showLib(); }catch(e){}');
}

/* ------------------------------------------------------------------ */
/* Folders                                                             */
/* ------------------------------------------------------------------ */

interface Folder {
  id: string;
  name: string;
  color: string;
}

const FOLDER_KEY = 'inkpad-folders';
const ACTIVE_KEY = 'inkpad-folder-active';

const FOLDER_COLORS = ['#2f6df6', '#e5383b', '#2a9d4f', '#f2a33c', '#8b5cf6', '#0ea5b7'];

let folders: Folder[] = [];
let active = 'all';

function loadFolders() {
  try {
    const v = JSON.parse(lsGet(FOLDER_KEY, '[]'));
    if (Array.isArray(v)) {
      folders = v.filter(
        (f) => f && typeof f.id === 'string' && typeof f.name === 'string'
      ) as Folder[];
    }
  } catch {
    folders = [];
  }
  active = lsGet(ACTIVE_KEY, 'all');
  if (active !== 'all' && !folders.some((f) => f.id === active)) active = 'all';
}

function saveFolders() {
  lsSet(FOLDER_KEY, JSON.stringify(folders));
  lsSet(ACTIVE_KEY, active);
}

function newFolder(name: string): Folder {
  const f: Folder = {
    id: 'f' + Date.now().toString(36),
    name: name.trim() || 'Folder',
    color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length],
  };
  folders.push(f);
  saveFolders();
  return f;
}

function folderOf(n: any): string {
  return typeof n.folder === 'string' ? n.folder : '';
}

/* ------------------------------------------------------------------ */
/* Shelf                                                               */
/* ------------------------------------------------------------------ */

/** Mirrors showLib's filter + sort so cards can be paired with notebooks. */
function shelf(): any[] {
  const lib = ev<any[]>('lib') || [];
  const flt = ev<string>('flt') || 'all';
  const q = ((document.getElementById('find') as HTMLInputElement | null)?.value || '').toLowerCase();
  return lib
    .filter(
      (n) =>
        (n.name || '').toLowerCase().includes(q) &&
        (flt === 'trash' ? n.del : !n.del && (flt !== 'fav' || n.fav))
    )
    .sort((a, b) => (b.upd || 0) - (a.upd || 0));
}

function relTime(ts: number): string {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 45_000) return 'just now';
  const m = Math.round(d / 60_000);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  const days = Math.round(h / 24);
  if (days < 7) return days + 'd ago';
  if (days < 30) return Math.round(days / 7) + 'w ago';
  const mo = Math.round(days / 30);
  if (mo < 12) return mo + 'mo ago';
  return Math.round(mo / 12) + 'y ago';
}

/* ------------------------------------------------------------------ */
/* Card decorations                                                    */
/* ------------------------------------------------------------------ */

function decorate() {
  const list = shelf();
  const cards = Array.from(document.querySelectorAll('#grid .card')) as HTMLElement[];

  cards.forEach((card, i) => {
    const n = list[i];
    if (!n) return;

    // folder filtering: the engine has no idea, so hide after the fact
    const f = folderOf(n);
    const visible = active === 'all' || (active === 'none' ? !f : f === active);
    card.style.display = visible ? '' : 'none';

    const sub = card.querySelector('.sub') as HTMLElement | null;
    if (!sub) return;
    const first = sub.querySelector('span') as HTMLElement | null;
    if (first) {
      const pages = `${n.pages.length} page${n.pages.length > 1 ? 's' : ''}`;
      const when = relTime(n.upd || 0);
      first.textContent = when ? `${pages} · ${when}` : pages;
    }

    if (!card.querySelector('.lib-more')) {
      const more = btn('lib-more', '⋯');
      more.title = 'More';
      more.setAttribute('aria-label', 'Notebook options');
      more.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        openMenu(n, more);
      };
      card.append(more);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Card menu                                                           */
/* ------------------------------------------------------------------ */

let menu: HTMLElement | null = null;
let menuFor: any = null;

function closeMenu() {
  menu?.classList.remove('on');
  menuFor = null;
}

function openMenu(n: any, anchor: HTMLElement) {
  if (!menu) return;
  menuFor = n;
  menu.innerHTML = '';
  menu.classList.add('on');

  const head = div('lm-head', n.name || 'Untitled');
  menu.append(head);

  const add = (label: string, icon: string, fn: () => void, danger = false) => {
    const b = btn('lm-item' + (danger ? ' lm-danger' : ''));
    b.innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
      `stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span>${label}</span>`;
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
    };
    menu!.append(b);
    return b;
  };

  add(
    'Rename',
    '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    () => renamePane(n)
  );
  add(
    'Duplicate',
    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>',
    () => duplicate(n)
  );
  add(
    n.fav ? 'Remove favourite' : 'Add favourite',
    '<path d="M12 4.5l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/>',
    () => {
      n.fav = !n.fav;
      save();
      refresh();
      closeMenu();
    }
  );
  add(
    'Move to folder',
    '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h7A1.5 1.5 0 0 1 19 9.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    () => movePane(n)
  );
  add(
    n.del ? 'Restore' : 'Delete',
    n.del
      ? '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'
      : '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
    () => {
      n.del = n.del ? 0 : 1;
      save();
      refresh();
      closeMenu();
    },
    !n.del
  );

  place(menu, anchor);
}

function place(node: HTMLElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const left = Math.min(window.innerWidth - w - 10, Math.max(10, r.right - w));
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
  node.style.left = Math.round(left) + 'px';
  node.style.top = Math.round(top) + 'px';
}

function paneBack(fn: () => void) {
  const b = btn('lm-back');
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg><span>Back</span>';
  b.onclick = (e) => {
    e.stopPropagation();
    fn();
  };
  return b;
}

function renamePane(n: any) {
  if (!menu) return;
  menu.innerHTML = '';
  menu.append(paneBack(() => openMenu(n, menuAnchor(n))));
  menu.append(div('lm-head', 'Rename'));

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'lm-input';
  input.value = n.name || '';
  input.maxLength = 80;
  menu.append(input);

  const ok = btn('lm-apply', 'Save');
  ok.onclick = (e) => {
    e.stopPropagation();
    n.name = input.value.trim() || 'Untitled';
    n.upd = Date.now();
    save();
    refresh();
    closeMenu();
  };
  menu.append(ok);

  window.setTimeout(() => {
    input.focus();
    input.select();
  }, 30);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') ok.click();
    if (e.key === 'Escape') closeMenu();
  };
}

function movePane(n: any) {
  if (!menu) return;
  menu.innerHTML = '';
  menu.append(paneBack(() => openMenu(n, menuAnchor(n))));
  menu.append(div('lm-head', 'Move to'));

  const cur = folderOf(n);
  const pick = (id: string, label: string, color?: string) => {
    const b = btn('lm-item' + (cur === id ? ' on' : ''));
    const dot = div('lm-dot');
    if (color) dot.style.background = color;
    else dot.classList.add('lm-none');
    b.append(dot, div('lm-label', label));
    b.onclick = (e) => {
      e.stopPropagation();
      if (id) n.folder = id;
      else delete n.folder;
      n.upd = n.upd || Date.now();
      save();
      renderChips();
      refresh();
      closeMenu();
    };
    menu!.append(b);
  };

  pick('', 'No folder');
  for (const f of folders) pick(f.id, f.name, f.color);

  const add = btn('lm-item lm-new', '+ New folder');
  add.onclick = (e) => {
    e.stopPropagation();
    const f = newFolder('New folder');
    n.folder = f.id;
    save();
    renderChips();
    refresh();
    closeMenu();
  };
  menu.append(add);
}

function menuAnchor(n: any): HTMLElement {
  const cards = Array.from(document.querySelectorAll('#grid .card')) as HTMLElement[];
  const list = shelf();
  const i = list.indexOf(n);
  const card = i >= 0 ? cards[i] : null;
  return (card?.querySelector('.lib-more') as HTMLElement) || (menu as HTMLElement);
}

function duplicate(n: any) {
  const lib = ev<any[]>('lib');
  if (!lib) return;
  const copy = JSON.parse(JSON.stringify(n));
  copy.id = Date.now();
  copy.name = (n.name || 'Untitled') + ' copy';
  copy.upd = Date.now();
  copy.fav = 0;
  copy.del = 0;
  lib.push(copy);
  save();
  refresh();
  closeMenu();
}

/* ------------------------------------------------------------------ */
/* Folder chips                                                        */
/* ------------------------------------------------------------------ */

let chipRow: HTMLElement | null = null;

function renderChips() {
  if (!chipRow) return;
  chipRow.innerHTML = '';

  const all = btn('lib-chip' + (active === 'all' ? ' on' : ''), 'All');
  all.onclick = () => {
    active = 'all';
    saveFolders();
    renderChips();
    refresh();
  };
  chipRow.append(all);

  for (const f of folders) {
    const chip = btn('lib-chip' + (active === f.id ? ' on' : ''));
    const dot = div('lib-dot');
    dot.style.background = f.color;
    chip.append(dot, div('lib-chip-t', f.name));
    chip.onclick = () => {
      active = f.id;
      saveFolders();
      renderChips();
      refresh();
    };
    // double-click renames, matching the shelf metaphor
    chip.ondblclick = (e) => {
      e.preventDefault();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'lib-chip-in';
      input.value = f.name;
      chip.replaceWith(input);
      input.focus();
      input.select();
      const done = () => {
        f.name = input.value.trim() || f.name;
        saveFolders();
        renderChips();
        refresh();
      };
      input.onblur = done;
      input.onkeydown = (e2) => {
        if (e2.key === 'Enter') input.blur();
        if (e2.key === 'Escape') {
          input.onblur = null;
          renderChips();
        }
      };
    };
    chipRow.append(chip);
  }

  const add = btn('lib-chip lib-chip-add', '+');
  add.title = 'New folder';
  add.onclick = () => {
    const f = newFolder('New folder');
    active = f.id;
    saveFolders();
    renderChips();
    refresh();
  };
  chipRow.append(add);
}

function mountChips() {
  const body = document.querySelector('#libm > .gn-body') as HTMLElement | null;
  if (!body) return false;
  if (chipRow && chipRow.isConnected) return true;

  chipRow = div('lib-chips');
  chipRow.id = 'lib-chips';

  const head = body.querySelector('.gn-head');
  const grid = document.getElementById('grid');
  if (head && head.nextSibling) body.insertBefore(chipRow, head.nextSibling);
  else if (grid) body.insertBefore(chipRow, grid);
  else body.append(chipRow);

  renderChips();
  return true;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#lib-chips{
  display:flex;align-items:center;gap:6px;flex-wrap:wrap;
  padding:2px 2px 14px;font-family:inherit;
}
.lib-chip{
  display:inline-flex;align-items:center;gap:6px;border:1px solid var(--gn-line,#e6e2dc)!important;
  background:#fff!important;border-radius:999px;padding:5px 12px!important;cursor:pointer;
  font:600 12px/1 inherit;color:#4a5563;white-space:nowrap;
  transition:background .13s ease,border-color .13s ease,color .13s ease;
}
.lib-chip:hover{background:#f6f8fb!important;border-color:#d6dce6!important}
.lib-chip.on{background:#eef4ff!important;border-color:#b9d0ff!important;color:#1f4fbf}
.lib-chip .lib-dot{width:8px;height:8px;border-radius:50%;flex:none}
.lib-chip-add{
  width:28px;height:26px;justify-content:center;padding:0!important;
  font-size:15px!important;color:#8b95a3!important;
}
.lib-chip-in{
  border:1px solid #b9d0ff!important;background:#fff;border-radius:999px;
  padding:5px 12px!important;font:600 12px/1 inherit;color:#1f4fbf;
  outline:none;min-width:96px;
}

.card{position:relative}
.lib-more{
  position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:8px;
  border:0!important;background:rgba(255,255,255,.92)!important;color:#4a5563!important;
  font:700 14px/1 inherit!important;cursor:pointer;display:grid;place-items:center;
  padding:0!important;opacity:.72;transition:opacity .14s ease,background .14s ease;
  box-shadow:0 1px 3px rgba(16,32,64,.16);
}
.card:hover .lib-more,.card:focus-within .lib-more{opacity:1}
.lib-more:hover{background:#fff!important;color:#1f4fbf!important}
#grid.list .lib-more{position:static;opacity:1;flex:none}
/* one metadata line: the star and delete buttons now live in the ⋯ menu */
.card .sub{flex-wrap:nowrap!important;align-items:center;gap:5px!important}
.card .sub .fv,.card .sub .dl{display:none!important}
.card .sub>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .sub>span:last-child{display:flex;align-items:center;gap:4px;flex:none}

#lib-menu{
  position:fixed;z-index:60;display:none;width:214px;padding:6px;
  background:#fff;border:1px solid #eef1f6;border-radius:13px;
  box-shadow:0 18px 44px rgba(8,20,38,.22),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;
}
#lib-menu.on{display:block}
.lm-head{
  font:700 10px/1.3 inherit;letter-spacing:.07em;text-transform:uppercase;
  color:#8b95a3;padding:5px 8px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.lm-item{
  width:100%;display:flex;align-items:center;gap:9px;border:0!important;
  background:transparent!important;border-radius:8px;padding:7px 8px!important;
  cursor:pointer;color:#3c4654;font:600 12.5px/1 inherit;text-align:left;
}
.lm-item:hover{background:#f4f7fb}
.lm-item.on{background:#eef4ff!important;color:#1f4fbf}
.lm-item.lm-danger{color:#d9484d}
.lm-item.lm-danger:hover{background:#fdf1f1}
.lm-item.lm-new{color:#2f6df6}
.lm-item svg{width:17px;height:17px;flex:none;opacity:.9}
.lm-item .lm-label{flex:1}
.lm-dot{width:9px;height:9px;border-radius:50%;flex:none}
.lm-dot.lm-none{background:transparent;box-shadow:inset 0 0 0 1.5px #c8d0da}
.lm-back{
  display:flex;align-items:center;gap:3px;border:0!important;background:transparent!important;
  color:#77828f;font:600 11.5px/1 inherit;cursor:pointer;padding:5px 6px!important;
  border-radius:7px;margin-bottom:2px;
}
.lm-back:hover{background:#f4f7fb;color:#3c4654}
.lm-back svg{width:14px;height:14px}
.lm-input{
  width:100%;box-sizing:border-box;border:1px solid #d6dce6!important;border-radius:9px;
  padding:8px 10px!important;font:600 13px/1.2 inherit;color:#1c2430;outline:none;
  margin:2px 0 8px;
}
.lm-input:focus{border-color:#2f6df6!important;box-shadow:0 0 0 3px rgba(47,109,246,.14)}
.lm-apply{
  width:100%;border:0!important;background:#2f6df6!important;color:#fff!important;
  border-radius:9px;padding:9px 0!important;font:700 12.5px/1 inherit;cursor:pointer;
}
.lm-apply:hover{background:#1f4fbf!important}
@media(max-width:620px){
  #lib-chips{padding-bottom:10px}
  .lib-chip{font-size:11px;padding:4px 10px!important}
  .lib-more{opacity:1}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!document.getElementById('libm')) return;

  const style = document.createElement('style');
  style.id = 'gn-library-style';
  style.textContent = CSS;
  document.head.append(style);

  loadFolders();

  menu = div('lib-menu');
  menu.id = 'lib-menu';
  document.body.append(menu);

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest) return;
      if (t.closest('#lib-menu') || t.closest('.lib-more')) return;
      closeMenu();
    },
    true
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  // showLib() rebuilds #grid from scratch on every change, so watch it
  const grid = document.getElementById('grid');
  if (grid) {
    new MutationObserver(() => {
      mountChips();
      window.requestAnimationFrame(decorate);
    }).observe(grid, { childList: true });
  }

  // the shelf is rebuilt when the library is opened, not just when it changes
  let wasHome = false;
  window.setInterval(() => {
    const home = !!document.getElementById('nav') && getComputedStyle(document.getElementById('nav')!).display !== 'none';
    if (home) {
      mountChips();
      decorate();
    }
    if (home !== wasHome) {
      wasHome = home;
      if (home) {
        renderChips();
        decorate();
      }
    }
  }, 400);

  mountChips();
  decorate();

  (window as any).__inkpad_lib = {
    folders: () => folders,
    active: () => active,
    setActive: (id: string) => {
      active = id;
      saveFolders();
      renderChips();
      refresh();
    },
    create: (name: string) => {
      const f = newFolder(name);
      renderChips();
      return f;
    },
    shelf,
    decorate,
    menu: () => menu,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
