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

import {
  ALL_THEMES,
  FEEL_BY_THEME,
  FEEL_LABEL,
  SND_BY_THEME,
  SND_LABEL,
  feelOf,
  themeById,
  type GxTheme,
} from './themes-data';
import { play, setSfxOn, sfxOn } from './sfx';

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

/**
 * The shape language a mod imposes on the interface: corner radii, border
 * weight, typeface, tracking, and how an icon is drawn. These are exported as
 * variables rather than baked into rules so a single `apply()` moves the whole
 * chrome, the same way the palette does.
 */
function feelVars(t: GxTheme): Record<string, string> {
  const f = feelOf(t.id);
  // `square` is a legal line cap but not a legal line join, so the two are
  // mapped separately rather than sharing one value
  const join = f.cap === 'round' ? 'round' : f.cap === 'square' ? 'miter' : 'miter';
  return {
    '--gx-r': `${f.r}px`,
    '--gx-r2': `${f.r2}px`,
    '--gx-bd': `${f.bd}px`,
    '--gx-font': f.font,
    '--gx-ls': `${f.ls}em`,
    '--gx-iw': String(f.iw),
    '--gx-cap': f.cap,
    '--gx-join': join,
    // percentage form, so the CSS can do `calc(100% - var(--gx-tintp))`
    '--gx-tintp': `${Math.round(f.tint * 100)}%`,
  };
}

function apply() {
  const t = themeById(choice.id);
  const dark = wantsDark();
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.gx = '1';
  // read by sfx.ts, which must not import this module (it would be a cycle)
  root.dataset.gxTheme = t.id;

  for (const [k, v] of Object.entries(palette(t, dark))) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(shellVars(dark))) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(feelVars(t))) root.style.setProperty(k, v);
  root.dataset.gxCaps = feelOf(t.id).caps ? '1' : '0';

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
        <label class="gxp-wall"><input type="checkbox" id="gxp-snd-t" /> Interface sounds</label>
        <span class="gxp-tag" id="gxp-tag"></span>
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
  const sndT = panel.querySelector('#gxp-snd-t') as HTMLInputElement;
  sndT.onchange = () => {
    setSfxOn(sndT.checked);
    paintTag();
  };
}

function paintModes() {
  panel?.querySelectorAll<HTMLElement>('.gxp-modes button').forEach((b) => {
    b.classList.toggle('on', b.dataset.m === choice.mode);
  });
  const wallT = panel?.querySelector('#gxp-wall-t') as HTMLInputElement | null;
  if (wallT) wallT.checked = choice.wall;
  const sndT = panel?.querySelector('#gxp-snd-t') as HTMLInputElement | null;
  if (sndT) sndT.checked = sfxOn();
  paintTag();
}

/**
 * The footer line. Colours are obvious from the swatches; the two things a
 * swatch cannot show are the shape language and the sound pack, so they get
 * named. It doubles as the explanation for why the buttons just changed shape.
 */
function paintTag() {
  const tag = panel?.querySelector('#gxp-tag');
  if (!tag) return;
  const t = themeById(choice.id);
  const f = FEEL_LABEL[FEEL_BY_THEME[t.id] || 'paper'];
  const s = SND_LABEL[SND_BY_THEME[t.id] || 'tick'];
  tag.textContent = `${f} · ${s}`;
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
      // audition the pack you just picked, rather than the one you left
      play('toggle', true);
      paintGrid();
      paintModes();
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
html[data-gx] #tb{
  background:var(--gx-bar)!important;
  border-radius:var(--gx-r2)!important;
  border-width:var(--gx-bd)!important;
}
html[data-gx] #tb button.on:not(.sw){color:var(--gx-bar)!important}
/* the white cluster under the bar is the one surface in the editor with a
   shape of its own, so it is where a mod's corner language shows up */
html[data-gx] #tb #bar2{
  background:color-mix(in srgb, var(--sf) 94%, var(--ac))!important;
  border-color:var(--bd)!important;
  border-radius:var(--gx-r2)!important;
  border-width:var(--gx-bd)!important;
}
html[data-gx] #tb #bar2 button,
html[data-gx] #tb #bar2 select,
html[data-gx] #tb #bar2 label,
html[data-gx] #tb #bar2 input{color:var(--tx)!important}
html[data-gx] #tb #bar2 button{
  background:color-mix(in srgb, var(--bg) 62%, var(--sf))!important;
  border-radius:calc(var(--gx-r) - 2px)!important;
}
html[data-gx] #tb #bar2 button:hover{background:color-mix(in srgb, var(--ac) 15%, var(--sf))!important}
html[data-gx] #tb #bar2 button.on{background:var(--ac)!important;color:#fff!important}
html[data-gx] #tb button:not(.sw){border-radius:calc(var(--gx-r) - 2px)!important}

/* the tab strip and the overflow button are painted a fixed navy by the shell
   module; without this they stay blue under every theme */
html[data-gx] #gn-tabs{background:var(--gx-bar)!important}
html[data-gx] #gn-tab-home,
html[data-gx] #gn-tabs .gn-tab{border-radius:var(--gx-r) var(--gx-r) 0 0!important}
html[data-gx] #gn-tabs .gn-tab.on{
  background:color-mix(in srgb, var(--gx-bar) 58%, var(--ac))!important;
}
html[data-gx] #tb #more{
  background:var(--gx-bar)!important;
  box-shadow:-12px 0 10px var(--gx-bar)!important;
}
html[data-gx] input[type=checkbox],
html[data-gx] input[type=radio]{accent-color:var(--ac)}

/* ---------------- feel: shape, type, icons ---------------- */
/* A mod is not only a palette. The same six colours feel like a different
   product depending on whether a button is a pill or a brick, whether the
   labels shout, and whether an icon is a hairline or a marker stroke. All of
   that is driven from the preset the theme declares. */

html[data-gx] #lib,
html[data-gx] #gx-theme-panel{font-family:var(--gx-font)!important}

html[data-gx] #gn-search,
html[data-gx] #gn-board,
html[data-gx] #gn-study,
html[data-gx] .gn-head > button,
html[data-gx] #gn-new,
html[data-gx] #gn-view,
html[data-gx] #gx-theme-btn,
html[data-gx] .lib-chip,
html[data-gx] .lib-chip-add,
html[data-gx] .card .sub button{
  border-radius:var(--gx-r)!important;
  border-width:var(--gx-bd)!important;
}
html[data-gx] #gn-view button{border-radius:calc(var(--gx-r) - 3px)!important}
html[data-gx] #gn-view{border-radius:calc(var(--gx-r) + 2px)!important}

html[data-gx] .card .cv{
  /* the shelf draws a book spine: tight on the left, open on the right, and
     both ends scale off the control radius */
  border-radius:calc(var(--gx-r) * .4) var(--gx-r) var(--gx-r) calc(var(--gx-r) * .4)!important;
}
html[data-gx] .cv canvas{border-radius:calc(var(--gx-r) * .22)!important}
html[data-gx] #grid .new{border-radius:var(--gx-r2)!important;border-width:calc(var(--gx-bd) + 1px)!important}
html[data-gx] #md .box,
html[data-gx] #auth-md .box,
html[data-gx] #pwa-md .box,
html[data-gx] #gx-theme-panel .gxp-box{
  border-radius:calc(var(--gx-r2) + 2px)!important;
  border-width:var(--gx-bd)!important;
}
html[data-gx] .box input[type=text],
html[data-gx] .box input[type=email],
html[data-gx] .box input[type=password],
html[data-gx] #gn-search input{
  border-radius:calc(var(--gx-r) - 2px)!important;
}

/* tracking and capitals */
html[data-gx] #nav a,
html[data-gx] .gn-head b,
html[data-gx] .lib-chip,
html[data-gx] #gn-view button,
html[data-gx] #gx-theme-btn,
html[data-gx] #gx-theme-panel .gxp-modes button,
html[data-gx] #gx-theme-panel .gxp-name{letter-spacing:var(--gx-ls)}
html[data-gx-caps="1"] #nav a,
html[data-gx-caps="1"] .gn-head b,
html[data-gx-caps="1"] .lib-chip,
html[data-gx-caps="1"] #gn-view button,
html[data-gx-caps="1"] #gx-theme-panel .gxp-modes button,
html[data-gx-caps="1"] #gx-theme-panel .gxp-name{text-transform:uppercase}

/* icons: one stroke weight for the whole app, plus a wash of accent */
html[data-gx] svg{
  stroke-width:var(--gx-iw);
  stroke-linecap:var(--gx-cap);
  stroke-linejoin:var(--gx-join);
}
html[data-gx] #nav a svg,
html[data-gx] .gn-head > button svg,
html[data-gx] #gn-view button svg,
html[data-gx] .lib-chip svg,
html[data-gx] #gx-theme-panel .gxp-x svg{
  color:color-mix(in srgb, currentColor calc(100% - var(--gx-tintp)), var(--ac));
}

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
  display:block;height:72px;min-height:72px;flex:0 0 auto;
  background-size:cover;background-position:center;
}
#gx-theme-panel .gxp-name{display:block;font-size:12.5px;line-height:1.25;padding:7px 9px 1px;font-weight:600;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gx-theme-panel .gxp-sub{display:flex;align-items:center;gap:5px;padding:0 9px 8px;font-size:10.5px;line-height:1.3;color:var(--mu)}
#gx-theme-panel .gxp-sub i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
#gx-theme-panel .gxp-mod{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gx-theme-panel .gxp-foot{
  padding:11px 18px;border-top:1px solid var(--bd);display:flex;align-items:center;gap:14px;
  flex-wrap:wrap;
}
#gx-theme-panel .gxp-wall{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--mu);cursor:pointer}
#gx-theme-panel .gxp-tag{
  margin-left:auto;font-size:11px;color:var(--mu);letter-spacing:.02em;
  padding:3px 9px;border-radius:999px;border:1px solid var(--bd);
  background:var(--bg);white-space:nowrap;
}
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
