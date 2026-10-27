/**
 * GoodNotes-inspired shell.
 *
 * The engine's markup stays untouched; this module re-skins it and adds the
 * chrome GoodNotes has that Inkpad was missing:
 *
 *   • dark navy editor bar, white icon buttons, active tool as a white pill
 *   • a floating white sub-toolbar under the bar (nibs / thickness / colours)
 *   • document tabs — "All Notebooks" plus every open notebook
 *   • library: sidebar shelves, top bar with search + New + grid/list
 *   • New Notebook as a sheet: Cancel / Create, cover grid, template chips
 *   • page counter and zoom badge in the bottom-left, like GoodNotes
 */

const CSS = `
:root{
  --gn-navy:#1f3a63; --gn-navy2:#2b4d7d; --gn-navyink:#12233d;
  --gn-paper:#fbfaf8; --gn-side:#f6f4f1; --gn-line:#e6e2dc;
  --gn-mut:#6b7684; --gn-shadow:0 8px 26px rgba(16,32,64,.14);
  --gn-acc:#2f6df6; --gn-acc2:#1f4fbf;
}

/* ---------------- editor: navy bar ---------------- */
/* The engine drives #tb's direction from html[data-bar]:
     full    → one row, #bar flattened into it
     compact → #bar is a horizontally scrolling row, #bar2 is a dropdown
   We only paint, never re-parent: touching #bar's display collapses the whole
   bar into a vertical column on tablets. */
#tb{
  background:#2a4d80!important;
  border:0!important;border-radius:0!important;margin:0!important;max-width:100%!important;
  box-shadow:0 2px 12px rgba(8,20,38,.28);padding:6px 10px 8px!important;
  gap:4px!important;z-index:20;position:relative;
}
html[data-bar=compact] #tb{margin:0!important;border-radius:0!important;max-width:100%!important;padding:5px 6px 7px!important}
/* :not(.sw) matters — the colour dots carry their paint in an inline style, so
   a blanket background:transparent!important would erase every swatch. */
#tb button:not(.sw),#tb select,#tb label,#tb input{
  background:transparent!important;border:0!important;color:#e9f0fb!important;
  border-radius:9px!important;font-size:13.5px!important;padding:7px 8px!important;
  box-shadow:none!important;cursor:pointer;
}
#tb button:not(.sw):hover{background:rgba(255,255,255,.16)!important}
#tb button.on:not(.sw){background:#fff!important;color:var(--gn-navy)!important;box-shadow:0 2px 8px rgba(0,0,0,.22)!important}
#tb select{background:rgba(255,255,255,.13)!important;padding:6px 8px!important}
#tb select option{color:#12233d;background:#fff}
#tb #title{
  background:rgba(255,255,255,.14)!important;color:#fff!important;border-radius:9px!important;
  padding:6px 12px!important;font-weight:600;min-width:120px;
}
#tb #back{font-weight:600;opacity:.95}
#tb .sep{width:1px;height:20px;background:rgba(255,255,255,.22);margin:0 4px}
#tb input[type=range]{accent-color:#8fb4ff;height:18px}
#tb input[type=color]{border-radius:7px!important;overflow:hidden;padding:0!important}
#tb #bar{background:transparent!important;border:0!important;box-shadow:none!important;margin:0!important}

/* GoodNotes' five colour dots + a custom picker */
#tb #sws{display:flex;align-items:center;gap:7px;padding:0 5px}
#tb #sws .sw{
  width:22px;height:22px;min-width:22px;border-radius:50%!important;padding:0!important;
  border:0!important;cursor:pointer;box-shadow:0 0 0 1.5px rgba(255,255,255,.32);
  transition:transform .12s ease,box-shadow .12s ease;
}
#tb #sws .sw:hover{transform:scale(1.12)}
#tb #sws .sw.on{box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(255,255,255,.3)}
#tb #col{
  width:24px!important;height:24px!important;min-width:24px;border-radius:50%!important;
  padding:0!important;border:1.5px solid rgba(255,255,255,.55)!important;overflow:hidden;
}

/* the sub-toolbar is a floating white pill, like GoodNotes' tool panel */
#tb #bar2{
  background:#fff!important;border:1px solid #eaeef5!important;border-radius:13px!important;
  box-shadow:0 12px 30px rgba(8,20,38,.24)!important;padding:6px 12px!important;gap:8px!important;
  align-items:center;
}
#tb #bar2 button,#tb #bar2 select,#tb #bar2 label,#tb #bar2 input{color:#2b3542!important}
#tb #bar2 button{background:#f2f4f8!important;border-radius:8px!important}
#tb #bar2 button:hover{background:#e8ecf3!important}
#tb #bar2 button.on{background:var(--gn-acc)!important;color:#fff!important}
#tb #bar2 .sep{background:#e3e7ee}

/* desktop: tools on row one, the white pill centred underneath */
html[data-bar=full] #tb{flex-direction:column;align-items:stretch}
html[data-bar=full] #tb #bar{display:flex;flex-wrap:wrap;justify-content:center}
html[data-bar=full] #tb #bar2{
  display:flex;position:static;transform:none;margin:6px auto 0!important;
  width:max-content;max-width:calc(100% - 12px);max-height:none;overflow:visible;
  justify-content:center;flex-wrap:wrap;
}

/* compact: #bar2 stays a dropdown, but centred and white */
#tb.more #bar2{
  left:50%;right:auto;transform:translateX(-50%);top:calc(100% + 6px);margin-top:0;
  max-height:56vh;
}

/* ---------------- editor: tabs ---------------- */
#gn-tabs{
  display:flex;align-items:stretch;gap:2px;padding:0 8px;background:#1a3153;
  overflow-x:auto;scrollbar-width:none;flex:none;
}
#gn-tabs::-webkit-scrollbar{display:none}
#gn-tab-home,#gn-tabs .gn-tab{
  display:flex;align-items:center;gap:7px;padding:7px 14px 8px;font-size:12.5px;
  color:rgba(233,240,251,.68);background:transparent;border:0;border-radius:9px 9px 0 0;
  cursor:pointer;white-space:nowrap;max-width:190px;
}
#gn-tabs .gn-tab span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:132px}
#gn-tabs .gn-tab.on{background:#2a4d80;color:#fff;font-weight:600}
#gn-tabs .gn-tab .x{opacity:.55;font-size:13px;padding:0 2px;border-radius:4px}
#gn-tabs .gn-tab .x:hover{opacity:1;background:rgba(255,255,255,.16)}
#gn-tab-home{color:rgba(233,240,251,.8)}

/* ---------------- editor: page thumbnails ---------------- */
/* The engine already renders real page miniatures into #side; it only needs
   the GoodNotes paper-card treatment. */
#side{
  width:140px!important;background:#f2f0ec!important;border-right:1px solid var(--gn-line)!important;
  padding:12px 11px 20px!important;box-shadow:6px 0 20px rgba(16,32,64,.1)!important;
}
#side::before{
  content:"Pages";display:block;font-size:11px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:#8b95a3;margin:0 0 9px 2px;
}
#side canvas{
  border-radius:8px!important;border:2px solid transparent!important;
  box-shadow:0 2px 9px rgba(16,32,64,.16);background:#fff;
  margin-bottom:11px!important;transition:transform .14s ease,box-shadow .14s ease;
}
#side canvas:hover{transform:translateY(-1px);box-shadow:0 5px 15px rgba(16,32,64,.22)}
#side canvas.on{
  border-color:var(--gn-acc)!important;box-shadow:0 0 0 3px rgba(47,109,246,.2),0 3px 10px rgba(16,32,64,.16);
}

/* ---------------- editor: page footer ---------------- */
#gn-foot{
  position:fixed;left:14px;bottom:12px;display:flex;gap:8px;align-items:center;z-index:6;
  font-size:12px;color:var(--gn-mut);pointer-events:none;
}
#gn-foot > *{pointer-events:auto}
#gn-foot .pill{
  background:rgba(255,255,255,.92);border:1px solid #e3e7ee;border-radius:999px;
  padding:4px 11px;box-shadow:0 2px 8px rgba(16,32,64,.08);font-weight:600;
}

/* ---------------- library ---------------- */
#lib{background:var(--gn-side)}
#nav{
  width:248px!important;background:var(--gn-side)!important;border-right:1px solid var(--gn-line)!important;
  padding:18px 12px!important;gap:2px!important;
}
#nav b{font-size:25px!important;font-weight:800!important;letter-spacing:-.025em;color:#141c26!important;margin:0!important;padding:0 10px!important}
#nav > div:first-child{margin-bottom:16px!important;padding:0 8px!important}
#nav a,#nav > button{
  display:flex!important;align-items:center;gap:10px;padding:9px 12px!important;
  border-radius:10px!important;font-size:14px!important;color:#3b4654!important;
  background:transparent!important;border:0!important;text-align:left;cursor:pointer;
}
#nav a:hover,#nav > button:hover{background:#ecebe7!important}
#nav a.on{background:#dfe8f6!important;color:#1f3a63!important;font-weight:700!important}
#nav #cloud-status{font-size:11px!important;padding:3px 8px;border-radius:999px;background:#eceae6}
#libm{background:var(--gn-paper)!important;padding:0!important;display:flex;flex-direction:column}
#find{display:none!important}
#lh{font-size:27px!important;font-weight:800!important;letter-spacing:-.025em;margin:0!important;color:#141c26}

/* shelf header: name on the left, import on the right */
.gn-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px}
.gn-head #lh{font-size:22px!important;letter-spacing:-.02em}
.gn-head > button{
  border:1px solid var(--gn-line)!important;background:#fff!important;color:#3b4654!important;
  border-radius:9px!important;padding:7px 13px!important;font-size:12.5px!important;
  font-weight:600;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(16,32,64,.05);
}
.gn-head > button:hover{border-color:#cfd6e0!important;background:#fafbfc!important}

/* library top bar */
#gn-top{
  display:flex;align-items:center;gap:12px;padding:18px 26px 14px;flex:none;
  background:var(--gn-paper);border-bottom:1px solid #efece7;position:sticky;top:0;z-index:4;
}
#gn-top .grow{flex:1;display:flex;align-items:center;gap:10px}
#gn-search{
  display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--gn-line);
  border-radius:999px;padding:7px 13px;min-width:220px;max-width:360px;flex:1;
  box-shadow:0 1px 3px rgba(16,32,64,.05);
}
#gn-search input{border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;width:100%;color:#1c2430}
#gn-new{
  background:var(--gn-acc)!important;color:#fff!important;border:0!important;border-radius:999px!important;
  padding:9px 18px!important;font-weight:700!important;font-size:13.5px!important;
  box-shadow:0 4px 12px rgba(47,109,246,.32);cursor:pointer;white-space:nowrap;
}
#gn-view{display:flex;background:#eceae6;border-radius:9px;padding:2px;gap:2px}
#gn-view button{border:0;background:transparent;border-radius:7px;padding:5px 9px;cursor:pointer;color:#5b6673;font-size:13px}
#gn-view button.on{background:#fff;color:#1f3a63;box-shadow:0 1px 3px rgba(16,32,64,.14)}

#libm > .gn-body{padding:18px 26px 40px;overflow:auto;flex:1}
#guest-banner{margin:0 0 14px!important}
#grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(148px,1fr))!important;gap:20px 18px!important}
#grid.list{grid-template-columns:1fr!important;gap:8px!important}
.card{background:transparent!important;border:0!important;padding:0!important;display:flex;flex-direction:column;cursor:pointer;position:relative}
.card .cv{border-radius:11px!important;overflow:hidden;box-shadow:0 5px 16px rgba(16,32,64,.16);transition:transform .16s ease,box-shadow .16s ease}
.card:hover .cv{transform:translateY(-2px);box-shadow:0 10px 26px rgba(16,32,64,.2)}
.card .nm{font-size:13px!important;font-weight:600!important;margin-top:9px!important;color:#1c2430!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .sub{font-size:11px!important;color:var(--gn-mut)!important;opacity:1!important;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:3px}
#grid.list .card{flex-direction:row;align-items:center;gap:14px;background:#fff;border:1px solid var(--gn-line);border-radius:12px;padding:10px 14px}
#grid.list .card .cv{width:52px;height:70px;flex:none}
#grid.list .card .nm{margin:0!important}
#grid.list > .new{aspect-ratio:auto!important;height:54px;min-height:0;font-size:24px!important}
/* per-card actions stay out of the way until you reach for them */
@media(hover:hover) and (pointer:fine){
  .card .sub button{opacity:0;transition:opacity .14s ease}
  .card:hover .sub button,.card:focus-within .sub button{opacity:1}
}
#grid .new{
  border-radius:11px!important;border:1.5px dashed #cfd6e0!important;background:#fff!important;
  color:#8b95a3!important;font-size:30px!important;font-weight:300!important;
  display:flex;align-items:center;justify-content:center;min-height:0;aspect-ratio:240/330;
}
#grid .new:hover{border-color:var(--gn-acc)!important;color:var(--gn-acc)!important;background:#f7faff!important}

/* ---------------- sheets ---------------- */
#md,#auth-md{backdrop-filter:blur(6px);background:rgba(16,26,42,.42)!important}
#md .box,#auth-md .box{
  border-radius:18px!important;box-shadow:0 24px 70px rgba(10,20,36,.34)!important;
  padding:22px!important;gap:14px!important;border:0!important;
}
#md .box b,#auth-md .box b{font-size:18px!important;letter-spacing:-.01em}
#md input[type=text],#auth-md input{
  border-radius:11px!important;padding:11px 13px!important;border:1px solid var(--gn-line)!important;
  background:#f7f8fa!important;font-size:14px!important;
}
#cvs{display:flex!important;gap:9px!important;flex-wrap:wrap}
#cvs .sw{
  width:42px!important;height:54px!important;border-radius:8px!important;border:0!important;
  box-shadow:0 2px 7px rgba(16,32,64,.18);position:relative;cursor:pointer;
}
#cvs .sw.on{outline:2.5px solid var(--gn-acc);outline-offset:2px}
#cvs .sw.on::after{content:"✓";position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:15px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.4)}
#np{display:none!important}
#gn-tpl{display:flex;gap:6px;flex-wrap:wrap}
#gn-tpl button{
  border:1px solid var(--gn-line)!important;background:#fff!important;border-radius:9px!important;
  padding:7px 12px!important;font-size:12.5px!important;cursor:pointer;color:#3b4654;
}
#gn-tpl button.on{background:#e8f0ff!important;border-color:var(--gn-acc)!important;color:#1f4fbf!important;font-weight:600}
#nc,#ok,#auth-submit-btn{border-radius:10px!important;padding:9px 18px!important;font-weight:600!important}
#ok,#auth-submit-btn{background:var(--gn-acc)!important;border-color:var(--gn-acc)!important}

/* ---------------- sign in, GoodNotes style ---------------- */
#auth-md .box{width:min(92vw,392px)!important;border-radius:20px!important;padding:26px!important;gap:13px!important}
#auth-title{font-size:21px!important;font-weight:800!important;letter-spacing:-.02em;color:#141c26}
#auth-google-btn{
  border:1px solid var(--gn-line)!important;background:#fff!important;color:#1c2430!important;
  border-radius:12px!important;padding:11px!important;font-size:14px!important;font-weight:600!important;
  box-shadow:0 1px 2px rgba(16,32,64,.06);
}
#auth-google-btn:hover{background:#f8f9fb!important;border-color:#cfd6e0!important}
#auth-divider{color:#98a2b0!important;font-size:11.5px!important}
#auth-divider span{background:#e6e2dc!important}
#auth-submit-btn{
  border-radius:11px!important;padding:11px 24px!important;font-size:14px!important;
  background:var(--gn-acc)!important;color:#fff!important;border:0!important;
  box-shadow:0 4px 12px rgba(47,109,246,.3);
}
#auth-md .box > div:last-child button{color:#6b7684!important;font-size:12px!important}
#auth-login-btn{
  border:1px solid var(--gn-line)!important;background:#fff!important;border-radius:10px!important;
  padding:9px 10px!important;font-weight:600!important;color:#2b3542!important;
  box-shadow:0 1px 2px rgba(16,32,64,.05);
}
#auth-login-btn:hover{background:#fafbfc!important;border-color:#cfd6e0!important}

@media(max-width:760px){
  #gn-tabs{padding:0 4px}
  #gn-tab-home span{display:none}
  #libm{padding:0!important}
  #gn-top{padding:12px 14px;flex-wrap:wrap}
  #gn-search{min-width:0}
  #libm > .gn-body{padding:14px}
  #grid{grid-template-columns:repeat(auto-fill,minmax(118px,1fr))!important;gap:14px 12px!important}
  #nav{width:auto!important;border-right:0!important;border-bottom:1px solid var(--gn-line)!important}
  /* on a phone the New control becomes a floating action button, GoodNotes style */
  #gn-top{flex-wrap:nowrap;gap:8px}
  #gn-new{
    position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom,0px));
    width:56px;height:56px;min-width:56px;border-radius:50%!important;
    padding:0!important;font-size:0!important;display:grid;place-items:center;
    z-index:7;box-shadow:0 8px 22px rgba(47,109,246,.45);
  }
  #gn-new::before{content:"+";font-size:31px;font-weight:300;line-height:1;margin-top:-3px}
  /* the FAB now owns the bottom-right corner */
  #beta-badge{left:12px;right:auto!important;bottom:8px!important}
  /* the engine's own page bar already owns the bottom edge down here */
  #gn-foot{bottom:calc(52px + env(safe-area-inset-bottom,0px));left:10px}
  #gn-foot .pill{padding:3px 9px;font-size:11px}
}
`;

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

function el(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ------------------------------------------------------------------ */
/* Library top bar                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Library: section header + banner placement                          */
/* ------------------------------------------------------------------ */

/**
 * The engine drops #lh ("Documents"), an Import button and #guest-banner as
 * loose children of #libm, so they read as clutter. Fold the title and the
 * import control into one header row and pull the banner inside the padded
 * body, the way GoodNotes stacks a shelf header over its grid.
 */
function ensureHead() {
  const body = document.querySelector('#libm > .gn-body') as HTMLElement | null;
  if (!body) return;

  const banner = document.getElementById('guest-banner');
  if (banner && banner.parentElement !== body) body.insertBefore(banner, body.firstChild);

  const lh = document.getElementById('lh');
  if (!lh) return;

  let head = body.querySelector('.gn-head') as HTMLElement | null;
  if (!head) {
    head = el('div', '');
    head.className = 'gn-head';
    body.insertBefore(head, body.firstChild);
  }
  if (lh.parentElement !== head) head.appendChild(lh);

  const imp = Array.from(body.querySelectorAll(':scope > button')).find((n) =>
    (n.textContent || '').includes('Import')
  ) as HTMLElement | undefined;
  if (imp && imp.parentElement !== head) head.appendChild(imp);
}

function ensureTopBar() {
  const main = document.getElementById('libm');
  if (!main || document.getElementById('gn-top')) return;

  const top = el('div', '');
  top.id = 'gn-top';

  const grow = el('div', 'grow');
  const search = el('div', '');
  search.id = 'gn-search';
  search.innerHTML =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#8b95a3" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search notebooks';
  input.setAttribute('aria-label', 'Search notebooks');
  input.oninput = () => {
    const f = document.getElementById('find') as HTMLInputElement | null;
    if (f) {
      f.value = input.value;
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ev('typeof showLib === "function" && showLib()');
  };
  search.appendChild(input);
  grow.appendChild(search);
  top.appendChild(grow);

  const view = el('div', '');
  view.id = 'gn-view';
  const gridBtn = el('button', '', '▦') as HTMLButtonElement;
  const listBtn = el('button', '', '☰') as HTMLButtonElement;
  gridBtn.title = 'Grid view';
  listBtn.title = 'List view';
  gridBtn.classList.add('on');
  const setView = (list: boolean) => {
    document.getElementById('grid')?.classList.toggle('list', list);
    gridBtn.classList.toggle('on', !list);
    listBtn.classList.toggle('on', list);
    try {
      localStorage.setItem('inkpad-view', list ? 'list' : 'grid');
    } catch {}
  };
  gridBtn.onclick = () => setView(false);
  listBtn.onclick = () => setView(true);
  view.appendChild(gridBtn);
  view.appendChild(listBtn);
  top.appendChild(view);

  const nb = el('button', '', '+ New') as HTMLButtonElement;
  nb.id = 'gn-new';
  nb.onclick = () => {
    document.getElementById('md')?.classList.add('on');
    (document.getElementById('nn') as HTMLInputElement | null)?.focus();
  };
  top.appendChild(nb);

  main.insertBefore(top, main.firstChild);

  // everything the engine already had (h1, empty-trash, import) moves into a
  // scrollable body under the bar
  const body = el('div', '');
  body.className = 'gn-body';
  main.appendChild(body);
  ['lh', 'et'].forEach((id) => {
    const n = document.getElementById(id);
    if (n) body.appendChild(n);
  });
  Array.from(main.children).forEach((c) => {
    if (c === top || c === body) return;
    if ((c as HTMLElement).tagName === 'INPUT') return;
    if (c.tagName === 'BUTTON' && (c.textContent || '').includes('Import')) body.appendChild(c);
    if (c.id === 'grid') body.appendChild(c);
  });
  const grid = document.getElementById('grid');
  if (grid && grid.parentElement !== body) body.appendChild(grid);

  ensureHead();

  try {
    if (localStorage.getItem('inkpad-view') === 'list') setView(true);
  } catch {}

  // the h1 duplicates the current shelf — keep it in sync with the nav
  const lh = document.getElementById('lh');
  if (lh) {
    const sync = () => {
      const on = document.querySelector('#nav a.on');
      if (on) lh.textContent = (on.getAttribute('data-n') || on.textContent || 'Documents').trim();
    };
    document.getElementById('nav')?.addEventListener('click', () => setTimeout(sync, 30));
    sync();
  }
}

/* ------------------------------------------------------------------ */
/* Document tabs                                                       */
/* ------------------------------------------------------------------ */

const TAB_KEY = 'inkpad-tabs';
let tabs: string[] = [];
try {
  tabs = JSON.parse(localStorage.getItem(TAB_KEY) || '[]');
  if (!Array.isArray(tabs)) tabs = [];
} catch {
  tabs = [];
}
let activeId = '';

function saveTabs() {
  try {
    localStorage.setItem(TAB_KEY, JSON.stringify(tabs.slice(0, 8)));
  } catch {}
}

function notebookName(id: string): string {
  const lib = ev<any[]>('lib');
  const n = (lib || []).find((x) => x.id === id);
  return n ? n.name || 'Untitled' : 'Notebook';
}

function renderTabs() {
  const host = document.getElementById('gn-tabs');
  if (!host) return;
  host.innerHTML = '';

  const home = el('button', '', '▤ All Notebooks') as HTMLButtonElement;
  home.id = 'gn-tab-home';
  home.onclick = () => document.getElementById('back')?.click();
  host.appendChild(home);

  tabs.forEach((id) => {
    const b = el('button', '') as HTMLButtonElement;
    b.className = 'gn-tab' + (id === activeId ? ' on' : '');
    const label = el('span', '', notebookName(id));
    b.appendChild(label);
    const x = el('i', '', '✕');
    x.className = 'x';
    x.onclick = (e) => {
      e.stopPropagation();
      tabs = tabs.filter((t) => t !== id);
      saveTabs();
      if (id === activeId) {
        const next = tabs[tabs.length - 1];
        if (next) openById(next);
        else document.getElementById('back')?.click();
      }
      renderTabs();
    };
    b.appendChild(x);
    b.onclick = () => openById(id);
    host.appendChild(b);
  });
}

function openById(id: string) {
  const lib = ev<any[]>('lib');
  const n = (lib || []).find((x) => x.id === id);
  if (!n) return;
  activeId = id;
  const open = ev<(nb: any) => void>('typeof openNotebook === "function" ? openNotebook : null');
  if (open) open(n);
  renderTabs();
}

function ensureTabs() {
  const ed = document.getElementById('ed');
  if (!ed || document.getElementById('gn-tabs')) return;
  const host = el('div', '');
  host.id = 'gn-tabs';
  ed.insertBefore(host, ed.firstChild);
  renderTabs();

  // track which notebook is open
  window.setInterval(() => {
    const nb = ev<any>('nb');
    if (nb && nb.id && document.getElementById('ed')?.style.display !== 'none') {
      if (!tabs.includes(nb.id)) {
        tabs.push(nb.id);
        if (tabs.length > 8) tabs.shift();
        saveTabs();
      }
      if (activeId !== nb.id) {
        activeId = nb.id;
        renderTabs();
      }
    }
  }, 600);
}

/* ------------------------------------------------------------------ */
/* New-notebook sheet: template chips + cover grid                     */
/* ------------------------------------------------------------------ */

const TPLS: [string, string][] = [
  ['lined', 'Lined'],
  ['grid', 'Grid'],
  ['dot', 'Dotted'],
  ['blank', 'Blank'],
  ['cornell', 'Cornell'],
];

function ensureSheet() {
  const box = document.querySelector('#md .box') as HTMLElement | null;
  if (!box || document.getElementById('gn-tpl')) return;
  const sel = document.getElementById('np') as HTMLSelectElement | null;
  if (!sel) return;

  const wrap = el('div', '');
  wrap.id = 'gn-tpl';
  TPLS.forEach(([v, label]) => {
    const b = el('button', '', label) as HTMLButtonElement;
    b.type = 'button';
    if (sel.value === v) b.classList.add('on');
    b.onclick = () => {
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      wrap.querySelectorAll('button').forEach((n) => n.classList.remove('on'));
      b.classList.add('on');
    };
    wrap.appendChild(b);
  });
  sel.parentElement?.insertBefore(wrap, sel);

  // label the cover row like GoodNotes' "Cover"
  const cvs = document.getElementById('cvs');
  if (cvs && !document.getElementById('gn-cover-label')) {
    const l = el('div', 'font-size:12px;font-weight:600;color:#6b7684;margin-top:2px', 'Cover');
    l.id = 'gn-cover-label';
    cvs.parentElement?.insertBefore(l, cvs);
  }
}

/* ------------------------------------------------------------------ */
/* Footer: page counter + zoom                                         */
/* ------------------------------------------------------------------ */

function ensureFooter() {
  if (document.getElementById('gn-foot')) return;
  const f = el('div', '');
  f.id = 'gn-foot';
  const page = el('span', '', '1 / 1');
  page.className = 'pill';
  page.id = 'gn-page';
  const zoom = el('span', '', '100%');
  zoom.className = 'pill';
  zoom.id = 'gn-zoom';
  f.appendChild(page);
  f.appendChild(zoom);
  document.body.appendChild(f);

  window.setInterval(() => {
    const nb = ev<any>('nb');
    const pi = ev<number>('typeof pi === "number" ? pi : 0') || 0;
    const total = nb && nb.pages ? nb.pages.length : 1;
    const p = document.getElementById('gn-page');
    if (p) p.textContent = pi + 1 + ' / ' + total;
    const z = ev<number>('typeof z === "number" ? z : 1') || 1;
    const zz = document.getElementById('gn-zoom');
    if (zz) zz.textContent = Math.round(z * 100) + '%';
    const ed = document.getElementById('ed');
    const inEditor = !!ed && getComputedStyle(ed).display !== 'none';
    f.style.display = inEditor ? 'flex' : 'none';
  }, 500);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  const style = document.createElement('style');
  style.id = 'gn-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  ensureTopBar();
  ensureTabs();
  ensureSheet();
  ensureFooter();

  // the grid is rebuilt on every shelf change — re-attach the body wrapper
  const main = document.getElementById('libm');
  if (main && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      const body = main.querySelector('.gn-body');
      const grid = document.getElementById('grid');
      if (body && grid && grid.parentElement !== body) body.appendChild(grid);
      const et = document.getElementById('et');
      if (body && et && et.parentElement !== body) body.appendChild(et);
      ensureHead();
    }).observe(main, { childList: true, subtree: false });
  }

  // re-skin the sheet whenever it opens (the engine rewrites #cvs on edit)
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.new') || t.closest('#gn-new')) setTimeout(ensureSheet, 40);
    },
    true
  );

  (window as any).__inkpad_theme = {
    tabs: () => tabs,
    open: openById,
    refresh: () => {
      ensureTopBar();
      ensureTabs();
      ensureSheet();
      ensureHead();
      renderTabs();
    },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
