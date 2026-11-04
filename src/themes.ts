/**
 * Theme runtime — turns an Opera GX mod palette into the app's variables.
 *
 * A GX mod supplies exactly what a palette needs: an accent and a secondary
 * base, in both a dark and a light variant. Those two anchors derive the six
 * app variables (`--bg --sf --tx --mu --bd --ac`) *and* the older `--gn-*`
 * set the notebook shell was built on, so the whole surface follows a theme
 * without touching a single component.
 *
 * The wallpaper is a fixed layer behind everything, and the shelf turns to
 * frosted glass so the picture reads through it. It is deliberately scoped to
 * the shelf: inside a notebook you want paper, not somebody's key art.
 *
 * The picker lives on the shelf rather than inside a notebook — it is a
 * property of the app, not of a page, and reaching it should not cost you
 * your place.
 */

import { ALL_THEMES, themeById, type GxTheme } from './themes-data';

const KEY = 'inkpad-gx-theme';

type Mode = 'auto' | 'dark' | 'light';

interface Choice {
  id: string;
  mode: Mode;
  /** Some people want the palette without the picture. */
  wall: boolean;
}

const choice: Choice = { id: 'slate', mode: 'auto', wall: true };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(clamp(s, 0, 100))}% ${Math.round(clamp(l, 0, 100))}%)`;

/**
 * Six colours from two anchors.
 *
 * The lightness steps are hand-tuned rather than computed from a formula: a
 * surface has to sit about 7 points above the background or the cards vanish,
 * and an accent on white needs roughly half its dark-mode lightness to stay
 * readable.
 *
 * `--gx-bar` is the deep accent the editor's top bar wears. It is a separate
 * colour rather than a reuse of `--ac` because a bar has to carry white
 * lettering, which forces its lightness down to a narrow band.
 */
function palette(t: GxTheme, dark: boolean): Record<string, string> {
  const [ah, as, al] = dark ? t.dark.acc : t.light.acc;
  const [sh, ss, sl] = dark ? t.dark.sec : t.light.sec;
  const bar = hsl(ah, Math.min(as, 68), clamp(al * 0.46, 15, 33));

  if (dark) {
    const bgL = clamp(sl * 0.62, 5, 13);
    return {
      '--bg': hsl(sh, ss * 0.85, bgL),
      '--sf': hsl(sh, ss * 0.9, bgL + 7),
      '--tx': hsl(sh, 12, 96),
      '--mu': hsl(sh, 8, 64),
      '--bd': hsl(sh, ss, bgL + 14),
      '--ac': hsl(ah, as, al),
      '--gx-bar': bar,
    };
  }
  return {
    '--bg': hsl(ah, Math.min(as * 0.35, 26), 95),
    '--sf': '#ffffff',
    '--tx': hsl(sh, 18, 13),
    '--mu': hsl(sh, 8, 45),
    '--bd': hsl(ah, Math.min(as * 0.3, 22), 87),
    '--ac': hsl(ah, Math.min(as, 88), clamp(al * 0.52, 32, 48)),
    '--gx-bar': bar,
  };
}

/**
 * The notebook shell predates the six-variable system and paints itself from
 * `--gn-paper / --gn-side / --gn-line / --gn-mut / --gn-acc / --gn-navy`.
 * Feeding those from the same anchors is what makes dark mode reach the shelf:
 * they used to be hardcoded cream, so "dark" only ever recoloured the accent.
 */
function shellVars(dark: boolean): Record<string, string> {
  return {
    '--gn-paper': dark ? 'var(--sf)' : 'color-mix(in srgb, var(--bg) 42%, #fff)',
    '--gn-side': dark ? 'var(--bg)' : 'color-mix(in srgb, var(--bg) 78%, #fff)',
    '--gn-line': 'var(--bd)',
    '--gn-mut': 'var(--mu)',
    '--gn-acc': 'var(--ac)',
    '--gn-acc2': 'color-mix(in srgb, var(--ac) 78%, #000)',
    '--gn-navy': 'var(--gx-bar)',
    '--gn-navy2': 'color-mix(in srgb, var(--gx-bar) 78%, var(--ac))',
    '--gn-navyink': 'color-mix(in srgb, var(--gx-bar) 60%, #000)',
  };
}

function wantsDark(): boolean {
  if (choice.mode === 'dark') return true;
  if (choice.mode === 'light') return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    /* ignore */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    if (typeof p.id === 'string' && ALL_THEMES.some((t) => t.id === p.id)) choice.id = p.id;
    if (p.mode === 'auto' || p.mode === 'dark' || p.mode === 'light') choice.mode = p.mode;
    if (typeof p.wall === 'boolean') choice.wall = p.wall;
  } catch {
    /* defaults */
  }
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

let wallEl: HTMLElement | null = null;

function ensureWall(): HTMLElement {
  if (wallEl && wallEl.isConnected) return wallEl;
  const w = document.createElement('div');
  w.id = 'gx-wall';
  w.setAttribute('aria-hidden', 'true');
  document.body.prepend(w);
  wallEl = w;
  return w;
}

function apply() {
  const t = themeById(choice.id);
  const dark = wantsDark();
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.gx = '1';

  for (const [k, v] of Object.entries(palette(t, dark))) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(shellVars(dark))) root.style.setProperty(k, v);

  const wall = ensureWall();
  const on = choice.wall && !!t.wall;
  wall.style.backgroundImage = on ? `url("${t.wall}")` : '';
  wall.dataset.on = on ? '1' : '0';
  wall.dataset.mode = dark ? 'dark' : 'light';
  // the shelf drops its opaque paper only while a picture is behind it
  root.dataset.gxWall = on ? '1' : '0';

  paintButton();
  document.dispatchEvent(new CustomEvent('gx-theme-change'));
}

/* ------------------------------------------------------------------ */
/* Shelf button                                                        */
/* ------------------------------------------------------------------ */

function paintButton() {
  const b = document.getElementById('gx-theme-btn');
  if (!b) return;
  const t = themeById(choice.id);
  const dot = b.querySelector('.gxb-dot') as HTMLElement | null;
  if (dot) dot.style.background = `hsl(${t.dark.acc[0]} ${t.dark.acc[1]}% ${t.dark.acc[2]}%)`;
  const lb = b.querySelector('.gxb-lb') as HTMLElement | null;
  if (lb) lb.textContent = t.name;
  b.title = `Theme — ${t.name}${t.mod ? ` (${t.mod})` : ''}`;
}

function mountButton() {
  if (document.getElementById('gx-theme-btn')) return;
  const top = document.getElementById('gn-top');
  const find = document.getElementById('find');

  const b = document.createElement('button');
  b.id = 'gx-theme-btn';
  b.type = 'button';
  b.className = 'gn-theme';
  b.innerHTML = '<span class="gxb-dot"></span><span class="gxb-lb">Themes</span><span class="gxb-ic" aria-hidden="true">◐</span>';
  b.onclick = (e) => {
    e.stopPropagation();
    openPanel();
  };

  if (top) {
    const view = document.getElementById('gn-view');
    if (view && view.nextSibling) top.insertBefore(b, view.nextSibling);
    else top.append(b);
  } else if (find) {
    // pre-shell markup: keep it beside the search field
    const row = document.createElement('div');
    row.id = 'gx-theme-row';
    find.parentElement?.insertBefore(row, find);
    row.append(find, b);
  } else {
    return;
  }
  paintButton();
}

/* ------------------------------------------------------------------ */
/* Picker                                                              */
/* ------------------------------------------------------------------ */

let panel: HTMLElement | null = null;

function thumbStyle(t: GxTheme): string {
  // Single quotes inside: this string is interpolated into a style="…" attribute,
  // and a double quote here would end the attribute early.
  if (t.wall) return `background-image:url('${t.wall}')`;
  return `background:linear-gradient(135deg, hsl(${t.dark.acc[0]} ${t.dark.acc[1]}% ${t.dark.acc[2]}%), hsl(${t.dark.sec[0]} ${t.dark.sec[1]}% ${t.dark.sec[2]}%))`;
}

function buildPanel() {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'gx-theme-panel';
  panel.innerHTML = `
    <div class="gxp-box" role="dialog" aria-label="Theme">
      <div class="gxp-head">
        <b>Theme</b>
        <span class="gxp-note">Palettes and wallpapers from your Opera GX mods</span>
        <div class="gxp-modes">
          <button type="button" data-m="auto">Auto</button>
          <button type="button" data-m="dark">Dark</button>
          <button type="button" data-m="light">Light</button>
        </div>
        <button class="gxp-x" type="button" aria-label="Close">✕</button>
      </div>
      <div class="gxp-grid"></div>
      <div class="gxp-foot">
        <label class="gxp-wall"><input type="checkbox" id="gxp-wall-t" /> Wallpaper on the shelf</label>
      </div>
    </div>`;
  document.body.append(panel);

  (panel.querySelector('.gxp-x') as HTMLElement).onclick = closePanel;
  panel.onclick = (e) => {
    if (e.target === panel) closePanel();
  };
  panel.querySelectorAll<HTMLElement>('.gxp-modes button').forEach((b) => {
    b.onclick = () => {
      choice.mode = (b.dataset.m as Mode) || 'auto';
      save();
      apply();
      paintModes();
    };
  });
  const wallT = panel.querySelector('#gxp-wall-t') as HTMLInputElement;
  wallT.onchange = () => {
    choice.wall = wallT.checked;
    save();
    apply();
  };
}

function paintModes() {
  panel?.querySelectorAll<HTMLElement>('.gxp-modes button').forEach((b) => {
    b.classList.toggle('on', b.dataset.m === choice.mode);
  });
  const wallT = panel?.querySelector('#gxp-wall-t') as HTMLInputElement | null;
  if (wallT) wallT.checked = choice.wall;
}

function paintGrid() {
  const grid = panel?.querySelector('.gxp-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const t of ALL_THEMES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'gxp-card' + (t.id === choice.id ? ' on' : '');
    card.dataset.id = t.id;
    const sw = t.dark.acc;
    card.innerHTML = `
      <span class="gxp-thumb" style="${thumbStyle(t)}"></span>
      <span class="gxp-name"></span>
      <span class="gxp-sub">
        <i style="background:hsl(${sw[0]} ${sw[1]}% ${sw[2]}%)"></i>
        <span class="gxp-mod"></span>
      </span>`;
    (card.querySelector('.gxp-name') as HTMLElement).textContent = t.name;
    (card.querySelector('.gxp-mod') as HTMLElement).textContent = t.mod || 'Opera GX';
    card.onclick = () => {
      choice.id = t.id;
      save();
      apply();
      paintGrid();
    };
    grid.append(card);
  }
}

function openPanel() {
  buildPanel();
  if (!panel) return;
  paintGrid();
  paintModes();
  panel.classList.add('on');
}

function closePanel() {
  panel?.classList.remove('on');
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Every rule below is prefixed with `html[data-gx]`, which buys one attribute
 * selector of specificity over the shell's own `#id` rules. That matters
 * because those rules are `!important` and are injected by a different module
 * — matching specificity and relying on sheet order would be a coin toss.
 */
const CSS = `
/* ---------------- wallpaper ---------------- */
#gx-wall{
  position:fixed;inset:0;z-index:0;pointer-events:none;
  background-size:cover;background-position:center;
  opacity:0;transition:opacity .45s ease;
}
#gx-wall[data-on="1"]{opacity:1}
#gx-wall::after{
  content:"";position:absolute;inset:0;
  background:color-mix(in srgb, var(--bg) 42%, transparent);
}
#gx-wall[data-on="1"][data-mode="dark"]::after{
  background:linear-gradient(
    color-mix(in srgb, var(--bg) 62%, transparent),
    color-mix(in srgb, var(--bg) 84%, transparent));
}

/* ---------------- shell takes the palette ---------------- */
/* The shelf must be a stacking context above the wall, or the wallpaper would
   paint over the whole app instead of behind it. */
html[data-gx] #lib{position:relative;z-index:1;background:transparent!important}
html[data-gx] #libm{background:var(--gn-paper)!important}
html[data-gx-wall="1"] #libm{
  background:color-mix(in srgb, var(--gn-paper) 44%, transparent)!important;
  backdrop-filter:blur(7px) saturate(1.1);
  -webkit-backdrop-filter:blur(7px) saturate(1.1);
}
html[data-gx-wall="1"] #gn-top{
  background:transparent!important;border-bottom-color:transparent!important;
}
html[data-gx] #gn-top{border-bottom-color:var(--bd)!important}

html[data-gx] #nav{
  background:var(--gn-side)!important;
  border-right-color:var(--bd)!important;
}
html[data-gx-wall="1"] #nav{
  background:color-mix(in srgb, var(--sf) 62%, transparent)!important;
  border-right-color:color-mix(in srgb, var(--bd) 55%, transparent)!important;
  backdrop-filter:blur(14px) saturate(1.3);
  -webkit-backdrop-filter:blur(14px) saturate(1.3);
}

html[data-gx] #nav b,
html[data-gx] #lh,
html[data-gx] .gn-head #lh,
html[data-gx] .card .nm{color:var(--tx)!important}
html[data-gx] #nav a,
html[data-gx] #nav > button{color:var(--mu)!important}
html[data-gx] #nav a:hover,
html[data-gx] #nav > button:hover{background:color-mix(in srgb, var(--ac) 11%, transparent)!important}
html[data-gx] #nav a.on{
  background:color-mix(in srgb, var(--ac) 17%, transparent)!important;
  color:var(--ac)!important;
}
html[data-gx] #nav #cloud-status{
  background:color-mix(in srgb, var(--ac) 12%, transparent)!important;color:var(--mu)!important;
}

html[data-gx] #gn-search,
html[data-gx] #gn-board,
html[data-gx] #gn-study,
html[data-gx] .gn-head > button,
html[data-gx] #grid .new,
html[data-gx] #grid.list .card{
  background:color-mix(in srgb, var(--sf) 86%, transparent)!important;
  border-color:var(--bd)!important;color:var(--tx)!important;
}
html[data-gx] #gn-search input{color:var(--tx)!important}
html[data-gx] #gn-search input::placeholder{color:var(--mu)!important}
html[data-gx] #gn-board:hover,
html[data-gx] #gn-study:hover,
html[data-gx] .gn-head > button:hover{
  background:color-mix(in srgb, var(--ac) 12%, var(--sf))!important;
  border-color:var(--ac)!important;color:var(--ac)!important;
}
html[data-gx] #gn-view{background:color-mix(in srgb, var(--bd) 62%, transparent)!important}
html[data-gx] #gn-view button{color:var(--mu)!important}
html[data-gx] #gn-view button.on{background:var(--sf)!important;color:var(--ac)!important}
html[data-gx] #gn-new{
  background:var(--ac)!important;
  box-shadow:0 4px 14px color-mix(in srgb, var(--ac) 42%, transparent)!important;
}
html[data-gx] #grid .new{border-style:dashed!important;color:var(--mu)!important}
/* on a picture the ghost card needs an edge of its own, or it disappears */
html[data-gx-wall="1"] #grid .new{
  background:color-mix(in srgb, var(--sf) 62%, transparent)!important;
  border-color:color-mix(in srgb, var(--tx) 28%, transparent)!important;
}
html[data-gx] .card .sub{color:var(--mu)!important}

/* filter chips and the account pill carry their own hardcoded paint */
html[data-gx] .lib-chip,
html[data-gx] .lib-chip-add{
  background:color-mix(in srgb, var(--sf) 84%, transparent)!important;
  border-color:var(--bd)!important;color:var(--tx)!important;
}
html[data-gx] .lib-chip:hover{
  background:color-mix(in srgb, var(--ac) 12%, var(--sf))!important;
  border-color:var(--ac)!important;color:var(--ac)!important;
}
html[data-gx] .lib-chip.on{
  background:color-mix(in srgb, var(--ac) 17%, transparent)!important;
  border-color:color-mix(in srgb, var(--ac) 48%, transparent)!important;
  color:var(--ac)!important;
}
html[data-gx] .lib-chip-in{background:transparent!important;color:var(--tx)!important}

/* dark mode: the shell was written light-only, so the few surfaces that still
   paint themselves white need a nudge or they glow out of the page */
html[data-theme="dark"][data-gx] #auth-login-btn,
html[data-theme="dark"][data-gx] #install-btn,
html[data-theme="dark"][data-gx] #nav > button{
  background:color-mix(in srgb, var(--sf) 82%, transparent)!important;
  border-color:var(--bd)!important;color:var(--tx)!important;
}
html[data-theme="dark"][data-gx] #auth-login-btn:hover,
html[data-theme="dark"][data-gx] #install-btn:hover,
html[data-theme="dark"][data-gx] #nav > button:hover{
  background:color-mix(in srgb, var(--ac) 18%, var(--sf))!important;
  border-color:var(--ac)!important;color:var(--ac)!important;
}

/* ---------------- editor bar ---------------- */
html[data-gx] #tb{background:var(--gx-bar)!important}
html[data-gx] #tb button.on:not(.sw){color:var(--gx-bar)!important}

/* ---------------- theme button ---------------- */
#gx-theme-row{display:flex;align-items:center;gap:10px;margin-bottom:16px;width:100%;max-width:520px}
#gx-theme-row #find{margin-bottom:0!important;flex:1 1 auto;max-width:none!important}

#gx-theme-btn{
  display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;max-width:170px;
  font:600 12.5px/1 inherit;padding:8px 13px;border-radius:10px;cursor:pointer;
  border:1px solid var(--bd);background:color-mix(in srgb, var(--sf) 86%, transparent);
  color:var(--tx);white-space:nowrap;overflow:hidden;
}
#gx-theme-btn:hover{border-color:var(--ac);color:var(--ac)}
#gx-theme-btn .gxb-dot{
  width:11px;height:11px;border-radius:50%;flex:0 0 auto;
  box-shadow:0 0 0 2px color-mix(in srgb, var(--ac) 22%, transparent);
}
#gx-theme-btn .gxb-lb{overflow:hidden;text-overflow:ellipsis}
#gx-theme-btn .gxb-ic{display:none;font-size:15px;line-height:1}
/* narrow bars keep the control but drop the name; a lone colour dot reads as a
   status light, so swap in the half-moon that means "appearance" */
@media(max-width:980px){
  #gx-theme-btn{padding:8px 11px}
  #gx-theme-btn .gxb-lb,#gx-theme-btn .gxb-dot{display:none}
  #gx-theme-btn .gxb-ic{display:inline}
}

/* ---------------- picker ---------------- */
#gx-theme-panel{
  position:fixed;inset:0;z-index:9000;display:none;
  background:color-mix(in srgb, var(--bg) 45%, rgba(0,0,0,.5));
  backdrop-filter:blur(7px);
  -webkit-backdrop-filter:blur(7px);
  padding:24px;
}
#gx-theme-panel.on{display:flex;align-items:center;justify-content:center}
#gx-theme-panel .gxp-box{
  width:min(940px,100%);max-height:min(86vh,820px);display:flex;flex-direction:column;
  background:var(--sf);color:var(--tx);border:1px solid var(--bd);border-radius:18px;
  box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden;
}
#gx-theme-panel .gxp-head{
  display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--bd);
  flex-wrap:wrap;
}
#gx-theme-panel .gxp-head b{font-size:15px}
#gx-theme-panel .gxp-note{font-size:12px;color:var(--mu);flex:1 1 200px}
#gx-theme-panel .gxp-modes{display:flex;gap:2px;background:var(--bg);border-radius:9px;padding:2px}
#gx-theme-panel .gxp-modes button{
  font:inherit;font-size:12px;padding:5px 11px;border:0;border-radius:7px;cursor:pointer;
  background:transparent;color:var(--mu);
}
#gx-theme-panel .gxp-modes button.on{background:var(--sf);color:var(--ac);box-shadow:0 1px 3px rgba(0,0,0,.12)}
#gx-theme-panel .gxp-x{
  border:0;background:transparent;cursor:pointer;color:var(--mu);font-size:15px;padding:4px 8px;border-radius:8px;
}
#gx-theme-panel .gxp-x:hover{background:var(--bg);color:var(--tx)}

#gx-theme-panel .gxp-grid{
  display:grid;gap:12px;padding:16px 18px;overflow:auto;
  grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
  /* without this the rows are stretched to fit the panel and the thumbnails
     collapse to nothing on a narrow screen */
  grid-auto-rows:min-content;
}
#gx-theme-panel .gxp-card{
  display:flex;flex-direction:column;gap:0;padding:0;cursor:pointer;text-align:left;
  border:1px solid var(--bd);border-radius:13px;overflow:hidden;background:var(--bg);
  color:var(--tx);font:inherit;transition:border-color .15s, transform .15s;
}
#gx-theme-panel .gxp-card:hover{transform:translateY(-2px);border-color:var(--ac)}
#gx-theme-panel .gxp-card.on{border-color:var(--ac);box-shadow:0 0 0 2px color-mix(in srgb, var(--ac) 30%, transparent)}
#gx-theme-panel .gxp-thumb{
  display:block;height:76px;min-height:76px;flex:0 0 auto;
  background-size:cover;background-position:center;
}
#gx-theme-panel .gxp-name{display:block;font-size:12.5px;padding:8px 9px 2px;font-weight:600;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gx-theme-panel .gxp-sub{display:flex;align-items:center;gap:5px;padding:0 9px 9px;font-size:10.5px;color:var(--mu)}
#gx-theme-panel .gxp-sub i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
#gx-theme-panel .gxp-mod{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gx-theme-panel .gxp-foot{
  padding:11px 18px;border-top:1px solid var(--bd);display:flex;align-items:center;gap:10px;
}
#gx-theme-panel .gxp-wall{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--mu);cursor:pointer}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  load();
  const style = document.createElement('style');
  style.id = 'gx-theme-style';
  style.textContent = CSS;
  document.head.append(style);

  apply();

  // the search box and the top bar are re-rendered by the engine, so re-attach
  mountButton();
  window.setInterval(() => {
    mountButton();
    const w = document.getElementById('gx-wall');
    if (w) {
      const home = document.getElementById('lib');
      const visible = !!home && getComputedStyle(home).display !== 'none';
      w.style.visibility = visible ? 'visible' : 'hidden';
    }
  }, 400);

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (choice.mode === 'auto') apply();
    });
  } catch {
    /* older browsers */
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  (window as any).__inkpadTheme = { apply, open: openPanel, close: closePanel, choice };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
