/**
 * The mod's own control panel: soundtrack, mix, wallpaper and the interface
 * sounds, in one place, in the corner.
 *
 * Same shape as the Cyberdeck panel in CELE — a collapsed pill that opens
 * into a small board — but the board takes its material from the skin it sits
 * in, so it is a plum tray in LoFi, a chamfered readout in Cyberdeck and a
 * bevelled plank in Minecraft. The structure lives here; the paint lives in
 * `themes-skin.ts`.
 *
 * It only exists while the current theme is one of the ported mods. A theme
 * with no soundtrack gets no player.
 */

import { modAudio, type ModAudioSettings } from './mod-audio';
import { currentMod, type ModMedia } from './mod-media';
import { modWall } from './mod-wall';

const CSS = `
#gxm{
  position:fixed;right:16px;bottom:34px;z-index:520;
  /* column-reverse: the board opens *upwards* out of the corner, so it can
     never run off the bottom edge behind the page bar */
  display:none;flex-direction:column-reverse;align-items:flex-end;gap:8px;
  font:500 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --gxm-panel:#14141c;--gxm-fg:#f2f3f7;--gxm-mu:#8a8f99;
  --gxm-ac:#eaea22;--gxm-acink:#101018;--gxm-bd:rgba(255,255,255,.14);
  --gxm-r:12px;--gxm-r2:8px;--gxm-clip:none;--gxm-clip2:none;--gxm-shadow:0 18px 44px -20px rgba(0,0,0,.8);
}
#gxm.on{display:flex}
#gxm.open .gxm-fab{display:none}
/* in the editor the page bar owns the bottom edge and the lock and tour
   buttons own the corner, so the player steps left of both */
#gxm.editor{right:64px;bottom:48px}

/* ---- collapsed pill ---- */
.gxm-fab{
  display:flex;align-items:center;gap:7px;padding:7px 11px;cursor:pointer;
  background:var(--gxm-panel);color:var(--gxm-fg);
  border:1px solid var(--gxm-bd);border-radius:var(--gxm-r);
  clip-path:var(--gxm-clip);box-shadow:var(--gxm-shadow);
  font:inherit;letter-spacing:.1em;text-transform:uppercase;font-size:10.5px;font-weight:700;
}
.gxm-fab:hover{border-color:var(--gxm-ac)}
.gxm-fab svg{width:13px;height:13px;color:var(--gxm-ac);flex:none}
.gxm-dot{width:6px;height:6px;border-radius:50%;background:var(--gxm-mu);flex:none}
#gxm[data-state=live] .gxm-dot{background:var(--gxm-ac);box-shadow:0 0 8px var(--gxm-ac)}
#gxm[data-state=blocked] .gxm-dot{background:#e5484d}

/* ---- board ---- */
.gxm-board{
  width:19rem;max-width:calc(100vw - 32px);
  max-height:calc(100vh - 96px);overflow:auto;
  background:var(--gxm-panel);color:var(--gxm-fg);
  border:1px solid var(--gxm-bd);border-radius:var(--gxm-r);
  clip-path:var(--gxm-clip);box-shadow:var(--gxm-shadow);
  overflow:hidden;
}
.gxm-head{
  display:flex;align-items:center;gap:8px;padding:9px 10px;
  border-bottom:1px solid var(--gxm-bd);
}
.gxm-head svg{width:13px;height:13px;color:var(--gxm-ac);flex:none}
.gxm-title{
  font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;
  color:var(--gxm-ac);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.gxm-badge{
  margin-left:auto;font:700 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.16em;padding:3px 4px;border:1px solid currentColor;flex:none;
  color:var(--gxm-mu);
}
#gxm[data-state=live] .gxm-badge{color:var(--gxm-ac)}
#gxm[data-state=blocked] .gxm-badge{color:#e5484d}
.gxm-x{
  background:none;border:0;padding:2px 3px;cursor:pointer;color:var(--gxm-mu);
  font-size:15px;line-height:1;flex:none;
}
.gxm-x:hover{color:var(--gxm-fg)}

.gxm-body{padding:2px 10px 6px}
.gxm-row{display:flex;align-items:center;gap:8px;padding:6px 0}
.gxm-row.dim{opacity:.4}
.gxm-ico{width:13px;height:13px;color:var(--gxm-ac);flex:none}
.gxm-lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.gxm-hint{font-size:9px;letter-spacing:.06em;color:var(--gxm-mu);text-transform:uppercase;margin-top:1px}
.gxm-grow{min-width:0;flex:1}

/* ---- switch ---- */
.gxm-sw{
  position:relative;width:38px;height:19px;flex:none;cursor:pointer;
  background:rgba(255,255,255,.07);border:1px solid var(--gxm-bd);
  border-radius:999px;clip-path:var(--gxm-clip2);padding:0;
}
.gxm-sw i{
  position:absolute;top:50%;left:3px;width:12px;height:12px;border-radius:50%;
  background:rgba(255,255,255,.4);transform:translateY(-50%);
  transition:left .15s ease,background .15s ease;
}
.gxm-sw[aria-checked=true]{background:var(--gxm-ac);border-color:var(--gxm-ac)}
.gxm-sw[aria-checked=true] i{left:calc(100% - 15px);background:var(--gxm-acink)}

/* ---- mix ---- */
.gxm-mix{display:flex;align-items:center;gap:8px;padding:0 0 7px}
.gxm-bars{display:flex;align-items:flex-end;gap:3px;height:15px;flex:none}
.gxm-bars span{width:3px;background:var(--gxm-mu);opacity:.45;border-radius:1px}
.gxm-bars span:nth-child(1){height:9px}
.gxm-bars span:nth-child(2){height:15px}
.gxm-bars span:nth-child(3){height:11px}
.gxm-bars span:nth-child(4){height:13px}
#gxm[data-state=live] .gxm-bars span{background:var(--gxm-ac);opacity:1;animation:gxm-bar .9s ease-in-out infinite alternate}
#gxm[data-state=live] .gxm-bars span:nth-child(2){animation-delay:.18s}
#gxm[data-state=live] .gxm-bars span:nth-child(3){animation-delay:.36s}
#gxm[data-state=live] .gxm-bars span:nth-child(4){animation-delay:.54s}
@keyframes gxm-bar{from{transform:scaleY(.45)}to{transform:scaleY(1)}}
.gxm-vol{
  -webkit-appearance:none;appearance:none;height:3px;flex:1;min-width:0;cursor:pointer;
  background:rgba(255,255,255,.16);border-radius:2px;outline:0;
}
.gxm-vol::-webkit-slider-thumb{
  -webkit-appearance:none;width:11px;height:11px;border-radius:50%;
  background:var(--gxm-ac);border:0;cursor:pointer;
}
.gxm-vol::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:var(--gxm-ac);border:0;cursor:pointer}
.gxm-pct{font:700 9px/1 ui-monospace,monospace;color:var(--gxm-mu);width:22px;text-align:right;flex:none}

/* ---- segmented ---- */
.gxm-seg{display:flex;flex:none}
.gxm-seg button{
  display:flex;align-items:center;gap:3px;padding:4px 6px;cursor:pointer;
  font:700 8.5px/1 inherit;letter-spacing:.1em;text-transform:uppercase;
  background:transparent;color:var(--gxm-mu);
  border:1px solid var(--gxm-bd);clip-path:var(--gxm-clip2);
}
.gxm-seg button + button{border-left:0}
.gxm-seg button[aria-pressed=true]{background:var(--gxm-ac);color:var(--gxm-acink);border-color:var(--gxm-ac)}
.gxm-seg svg{width:9px;height:9px}

.gxm-rule{height:1px;background:var(--gxm-bd);margin:4px 0}
.gxm-note{
  padding:7px 10px;border-top:1px solid var(--gxm-bd);
  font-size:9px;line-height:1.5;letter-spacing:.03em;color:var(--gxm-mu);
}

@media (max-width:700px){
  #gxm{right:10px;bottom:10px}
  .gxm-board{width:min(19rem,calc(100vw - 20px))}
}
@media (prefers-reduced-motion:reduce){
  #gxm[data-state=live] .gxm-bars span{animation:none}
}
`;

const ICON = {
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h2M8 6v12M13 3v18M18 8v8M22 12h-1"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/></svg>',
  still: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/></svg>',
  pointer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 3l7 17 2.5-6.5L20 11z"/></svg>',
  keys: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.5 7a8 8 0 1 0 11 0"/></svg>',
};

class ModPanel {
  private root: HTMLElement | null = null;
  private builtFor = '';
  private open = false;
  private editorOpen = false;
  private ticker = 0;

  boot() {
    if (this.root) return;
    const style = document.createElement('style');
    style.id = 'gxm-style';
    style.textContent = CSS;
    document.head.append(style);

    const root = document.createElement('div');
    root.id = 'gxm';
    document.body.append(root);
    this.root = root;

    modAudio.boot();
    modWall.boot();

    new MutationObserver(() => this.refresh()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-gx-theme'],
    });
    modAudio.subscribe(() => this.sync());
    modWall.subscribe(() => this.sync());

    // the page bar sits at the bottom of the editor, so the pill has to move
    const ed = document.getElementById('ed');
    if (ed) {
      new MutationObserver(() => this.watchEditor()).observe(ed, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
      this.watchEditor();
    }

    this.refresh();
    this.ticker = window.setInterval(() => this.sync(), 900);
  }

  private watchEditor() {
    const ed = document.getElementById('ed');
    const open = !!ed && getComputedStyle(ed).display !== 'none';
    if (open === this.editorOpen) return;
    this.editorOpen = open;
    this.root?.classList.toggle('editor', open);
  }

  private refresh() {
    const mod = currentMod();
    if (!mod) {
      this.root?.classList.remove('on');
      this.builtFor = '';
      return;
    }
    this.root!.classList.add('on');
    if (this.builtFor !== mod.id) {
      this.builtFor = mod.id;
      this.build(mod);
    }
    this.sync();
  }

  // ---------------------------------------------------------------- build

  private build(mod: ModMedia) {
    const root = this.root!;
    const sfx = mod.sfx;
    root.dataset.state = 'idle';
    root.innerHTML = `
      <button class="gxm-fab" data-no-sfx type="button" aria-expanded="${this.open}">
        ${ICON.wave}
        <span class="gxm-fab-name"></span>
        <span class="gxm-dot"></span>
      </button>
      <div class="gxm-board" ${this.open ? '' : 'hidden'}>
        <div class="gxm-head">
          ${ICON.wave}
          <span class="gxm-title">${mod.name}</span>
          <span class="gxm-badge">IDLE</span>
          <button class="gxm-x" data-no-sfx type="button" aria-label="Close">&#215;</button>
        </div>
        <div class="gxm-body">
          <div class="gxm-row">
            <span class="gxm-ico">${ICON.music}</span>
            <div class="gxm-grow">
              <div class="gxm-lbl">Soundtrack</div>
              <div class="gxm-hint gxm-track"></div>
            </div>
            <button class="gxm-sw" data-no-sfx role="switch" type="button" aria-label="Soundtrack"><i></i></button>
          </div>
          <div class="gxm-mix">
            <div class="gxm-bars" aria-hidden="true">
              ${'<span></span>'.repeat(Math.min(4, Math.max(2, mod.layers.length)))}
            </div>
            <input class="gxm-vol" data-no-sfx type="range" min="0" max="1" step="0.01" aria-label="Volume">
            <span class="gxm-pct"></span>
          </div>
          <div class="gxm-rule"></div>
          <div class="gxm-row">
            <span class="gxm-ico">${ICON.film}</span>
            <div class="gxm-grow">
              <div class="gxm-lbl">Wallpaper</div>
              <div class="gxm-hint gxm-wall-label"></div>
            </div>
            <div class="gxm-seg">
              <button data-wall="live" data-no-sfx type="button" aria-pressed="true">${ICON.film}Live</button>
              <button data-wall="still" data-no-sfx type="button" aria-pressed="false">${ICON.still}Still</button>
            </div>
          </div>
          ${
            sfx
              ? `<div class="gxm-rule"></div>
          <div class="gxm-row gxm-sfx-row">
            <span class="gxm-ico">${ICON.power}</span>
            <div class="gxm-grow">
              <div class="gxm-lbl">Sound effects</div>
              <div class="gxm-hint">Off by default</div>
            </div>
            <button class="gxm-sw" data-no-sfx data-set="sfx" role="switch" type="button" aria-label="Sound effects"><i></i></button>
          </div>
          <div class="gxm-row gxm-sub">
            <span class="gxm-ico">${ICON.pointer}</span>
            <div class="gxm-grow"><div class="gxm-lbl">Hover blips</div></div>
            <button class="gxm-sw" data-no-sfx data-set="hover" role="switch" type="button" aria-label="Hover sounds"><i></i></button>
          </div>
          <div class="gxm-row gxm-sub">
            <span class="gxm-ico">${ICON.keys}</span>
            <div class="gxm-grow"><div class="gxm-lbl">Keystrokes</div></div>
            <button class="gxm-sw" data-no-sfx data-set="keys" role="switch" type="button" aria-label="Keystroke sounds"><i></i></button>
          </div>`
              : ''
          }
        </div>
        <div class="gxm-note"></div>
      </div>`;

    root.querySelector('.gxm-fab-name')!.textContent = mod.name;
    (root.querySelector('.gxm-track') as HTMLElement).textContent =
      mod.layers.length > 1 ? `${mod.layers.length} layers · synced` : `${mod.track} · one track`;
    (root.querySelector('.gxm-wall-label') as HTMLElement).textContent = mod.wall.label;
    root.querySelector('.gxm-fab')!.addEventListener('click', () => this.setOpen(!this.open));
    root.querySelector('.gxm-x')!.addEventListener('click', () => this.setOpen(false));

    const sw = (el: Element, set: (v: boolean) => void) =>
      el.addEventListener('click', () => {
        const on = el.getAttribute('aria-checked') !== 'true';
        el.setAttribute('aria-checked', String(on));
        set(on);
      });
    const musicSw = root.querySelector('.gxm-body .gxm-sw')!;
    sw(musicSw, (v) => modAudio.setMusic(v));
    root.querySelectorAll('[data-set]').forEach((el) => {
      const k = (el as HTMLElement).dataset.set as 'sfx' | 'hover' | 'keys';
      sw(el, (v) => {
        if (k === 'sfx') modAudio.setSfx(v);
        else if (k === 'hover') modAudio.setHover(v);
        else modAudio.setKeys(v);
      });
    });
    root.querySelectorAll('[data-wall]').forEach((el) =>
      el.addEventListener('click', () => {
        modWall.setLive((el as HTMLElement).dataset.wall === 'live');
        this.sync();
      }),
    );
    const vol = root.querySelector('.gxm-vol') as HTMLInputElement;
    vol.addEventListener('input', () => modAudio.setVolume(parseFloat(vol.value)));
    // the slider is the one control whose own drag must not be interrupted
    vol.addEventListener('pointerdown', () => vol.focus());
    this.sync();
  }

  private setOpen(open: boolean) {
    this.open = open;
    this.root?.classList.toggle('open', open);
    const board = this.root?.querySelector('.gxm-board') as HTMLElement | null;
    const fab = this.root?.querySelector('.gxm-fab');
    if (board) board.hidden = !open;
    fab?.setAttribute('aria-expanded', String(open));
    if (open) this.sync();
  }

  // ---------------------------------------------------------------- sync

  private sync() {
    const root = this.root;
    if (!root || !root.classList.contains('on')) return;
    const mod = currentMod();
    if (!mod) return;

    const playing = modAudio.isPlayingMusic;
    const state = modAudio.blocked ? 'blocked' : playing ? 'live' : 'idle';
    if (root.dataset.state !== state) root.dataset.state = state;
    const badge = root.querySelector('.gxm-badge');
    if (badge) badge.textContent = modAudio.blocked ? 'BLOCKED' : playing ? 'LIVE' : 'IDLE';

    const s: ModAudioSettings = modAudio.settings;
    const music = root.querySelector('.gxm-body .gxm-sw');
    music?.setAttribute('aria-checked', String(s.music));
    root.querySelectorAll('[data-set]').forEach((el) => {
      const k = (el as HTMLElement).dataset.set!;
      el.setAttribute('aria-checked', String(!!s[k as 'sfx' | 'hover' | 'keys']));
    });
    root.querySelectorAll('.gxm-sub').forEach((el) => el.classList.toggle('dim', !s.sfx));

    const vol = root.querySelector('.gxm-vol') as HTMLInputElement | null;
    if (vol && document.activeElement !== vol) vol.value = String(s.volume);
    const pct = root.querySelector('.gxm-pct');
    if (pct) pct.textContent = String(Math.round(s.volume * 100));

    const live = modWall.isLive;
    root.querySelectorAll('[data-wall]').forEach((el) =>
      el.setAttribute('aria-pressed', String(((el as HTMLElement).dataset.wall === 'live') === live)),
    );

    const note = root.querySelector('.gxm-note');
    if (note) {
      note.textContent = modAudio.blocked
        ? 'The browser blocked autoplay — press anywhere in the app to start the soundtrack.'
        : `${mod.name} mod audio · the soundtrack loops while this theme is active.`;
    }
  }
}

export const modPanel = new ModPanel();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => modPanel.boot());
else modPanel.boot();
