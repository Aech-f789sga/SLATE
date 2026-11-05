/**
 * Theme skins — what a mod does to the *material* of the interface.
 *
 * A palette and a corner radius take a theme a long way, and then stop: two
 * mods can share a hue and a radius and still be plainly different products,
 * because one is a lit room and the other is a screen. This module is the layer
 * that makes the difference — grain and warm light for LoFi, a chamfered neon
 * HUD for Cyberdeck, bevelled blocks and a text shadow for Minecraft.
 *
 * It is CSS only, keyed on `html[data-gx-theme]`, so nothing has to be threaded
 * through the components: every surface in this app already paints itself from
 * a handful of ids and variables, and a skin is just a more specific opinion
 * about what those surfaces are made of.
 *
 * Three themes are skinned so far. The rest still get their palette, their
 * shape language and their sound from `themes-data` — which is the honest
 * starting point, not a fallback that looks broken.
 */

const CSS = `
/* =================================================================
   LoFi Chill — a warm room at sunset
   -----------------------------------------------------------------
   The mod is an illustration, so the interface is made of light and
   paper rather than panels: a rose wash instead of a flat grey, film
   grain over the whole window, and corners soft enough to read as
   drawn rather than built.
   ================================================================= */
html[data-gx-theme="lofi-chill"]{
  --gx-bar:#3b2029;
  --lf-grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.86' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
}
/* grain over everything, including the page — it is what makes a photo of a
   room look like a photo rather than a render */
html[data-gx-theme="lofi-chill"] body::after{
  content:"";position:fixed;inset:0;z-index:9998;pointer-events:none;
  background-image:var(--lf-grain);background-size:140px 140px;
  opacity:.34;mix-blend-mode:soft-light;
}
/* a vignette, because the light in that room comes from one window */
html[data-gx-theme="lofi-chill"] body::before{
  content:"";position:fixed;inset:0;z-index:9997;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(58,26,34,.28) 100%);
}

html[data-gx-theme="lofi-chill"] #lib{
  background:
    radial-gradient(90% 60% at 84% -6%, color-mix(in srgb, var(--ac) 30%, transparent), transparent 62%),
    radial-gradient(70% 60% at 4% 104%, rgba(78,158,150,.22), transparent 60%),
    color-mix(in srgb, var(--bg) 52%, transparent)!important;
}
html[data-gx-theme="lofi-chill"] #nav{
  background:color-mix(in srgb, var(--bg) 72%, #2a1620)!important;
  border-right-color:color-mix(in srgb, var(--ac) 18%, transparent)!important;
}
html[data-gx-theme="lofi-chill"] #nav a.on{
  background:color-mix(in srgb, var(--ac) 22%, transparent)!important;
  color:color-mix(in srgb, var(--ac) 74%, #fff)!important;
}
html[data-gx-theme="lofi-chill"] #gn-top{background:transparent!important}
html[data-gx-theme="lofi-chill"] #gn-search,
html[data-gx-theme="lofi-chill"] #gn-board,
html[data-gx-theme="lofi-chill"] #gn-study,
html[data-gx-theme="lofi-chill"] .gn-head > button{
  background:color-mix(in srgb, var(--sf) 72%, transparent)!important;
  border-color:color-mix(in srgb, var(--ac) 16%, var(--bd))!important;
  box-shadow:0 2px 10px rgba(58,26,34,.10)!important;
  backdrop-filter:blur(6px);
}
html[data-gx-theme="lofi-chill"] #gn-new{
  box-shadow:0 8px 22px color-mix(in srgb, var(--ac) 38%, transparent)!important;
}
html[data-gx-theme="lofi-chill"] .card .cv{
  box-shadow:0 10px 26px -8px rgba(58,26,34,.45), 0 2px 6px rgba(58,26,34,.18)!important;
}
html[data-gx-theme="lofi-chill"] .card:hover .cv{
  box-shadow:0 18px 40px -12px rgba(58,26,34,.5), 0 2px 8px rgba(58,26,34,.2)!important;
}

/* the editor bar: plum, with the coral of the hoodie along its bottom edge */
html[data-gx-theme="lofi-chill"] #tb{
  background:linear-gradient(180deg,#4a2731,#3b2029 62%,#331b23)!important;
  box-shadow:0 2px 14px rgba(40,16,24,.42), inset 0 -2px 0 color-mix(in srgb, var(--ac) 55%, transparent)!important;
}
html[data-gx-theme="lofi-chill"] #gn-tabs{background:#2e1a22!important}
html[data-gx-theme="lofi-chill"] #tb #bar2{
  background:color-mix(in srgb, var(--sf) 90%, var(--ac))!important;
  border-color:color-mix(in srgb, var(--ac) 20%, transparent)!important;
  box-shadow:0 14px 34px -10px rgba(58,26,34,.45)!important;
}
html[data-gx-theme="lofi-chill"] #tb #bar2 button.on{box-shadow:0 4px 12px color-mix(in srgb, var(--ac) 40%, transparent)!important}

/* the desk and the page */
html[data-gx-theme="lofi-chill"] #stage{
  background:
    radial-gradient(110% 80% at 50% -10%, color-mix(in srgb, var(--ac) 22%, transparent), transparent 68%),
    radial-gradient(80% 60% at 50% 108%, rgba(78,158,150,.16), transparent 66%),
    color-mix(in srgb, var(--bg) 54%, transparent)!important;
}
html[data-gx-theme="lofi-chill"] #cv,
html[data-gx-theme="lofi-chill"] .ps-sheet{
  border-radius:7px!important;
  box-shadow:0 20px 44px -14px rgba(50,20,28,.55), 0 2px 8px rgba(50,20,28,.22)!important;
}
html[data-gx-theme="lofi-chill"] #pen-dock,
html[data-gx-theme="lofi-chill"] #acc-pop,
html[data-gx-theme="lofi-chill"] #ink-pen{
  box-shadow:0 14px 34px -12px rgba(50,20,28,.5)!important;
}

/* =================================================================
   Cyberdeck — a HUD over a neon city
   -----------------------------------------------------------------
   Every panel is a piece of glass in front of the skyline: near-black,
   chamfered, edged in one hairline of light. Selected things glow
   rather than fill, because a HUD draws light, not paint.
   ================================================================= */
html[data-gx-theme="cyberdeck"]{
  --gx-bar:#0d0714;
  --cd-cyan:hsl(186 100% 56%);
  /* the glass of every HUD panel; light mode swaps it for white glass */
  --cd-glass:#0b0610;--cd-glass2:#160b20;
  --cd-fg:color-mix(in srgb, var(--cd-cyan) 78%, #fff);
  --cd-chamfer:polygon(0 9px,9px 0,calc(100% - 9px) 0,100% 9px,100% calc(100% - 9px),calc(100% - 9px) 100%,9px 100%,0 calc(100% - 9px));
  --cd-chamfer-sm:polygon(0 5px,5px 0,calc(100% - 5px) 0,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0 calc(100% - 5px));
}
html[data-gx-theme="cyberdeck"] #lib{
  background:
    repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px),
    radial-gradient(90% 60% at 50% -8%, color-mix(in srgb, var(--ac) 26%, transparent), transparent 66%),
    radial-gradient(60% 50% at 88% 96%, color-mix(in srgb, var(--cd-cyan) 16%, transparent), transparent 64%),
    color-mix(in srgb, var(--bg) 58%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #nav{
  background:color-mix(in srgb, var(--bg) 84%, #000)!important;
  border-right:1px solid color-mix(in srgb, var(--cd-cyan) 26%, transparent)!important;
  box-shadow:inset -1px 0 0 color-mix(in srgb, var(--ac) 22%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #nav b,
html[data-gx-theme="cyberdeck"] #lh,
html[data-gx-theme="cyberdeck"] .gn-head #lh{
  text-transform:uppercase;letter-spacing:.14em;font-size:15px!important;
  color:color-mix(in srgb, var(--cd-cyan) 72%, #fff)!important;
  text-shadow:0 0 12px color-mix(in srgb, var(--cd-cyan) 55%, transparent);
}
html[data-gx-theme="cyberdeck"] #nav a.on{
  background:linear-gradient(90deg, color-mix(in srgb, var(--ac) 26%, transparent), transparent 88%)!important;
  color:#fff!important;
  box-shadow:inset 2px 0 0 var(--ac), 0 0 16px -4px color-mix(in srgb, var(--ac) 70%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #gn-top{background:transparent!important}
html[data-gx-theme="cyberdeck"] #gn-search,
html[data-gx-theme="cyberdeck"] #gn-board,
html[data-gx-theme="cyberdeck"] #gn-study,
html[data-gx-theme="cyberdeck"] .gn-head > button{
  background:color-mix(in srgb, var(--cd-glass) 76%, transparent)!important;
  border:1px solid color-mix(in srgb, var(--cd-cyan) 30%, transparent)!important;
  border-radius:0!important;
  clip-path:var(--cd-chamfer-sm);
  color:color-mix(in srgb, var(--cd-cyan) 80%, #fff)!important;
}
html[data-gx-theme="cyberdeck"] .gn-head > button:hover,
html[data-gx-theme="cyberdeck"] #gn-board:hover,
html[data-gx-theme="cyberdeck"] #gn-study:hover{
  border-color:var(--ac)!important;color:#fff!important;
  box-shadow:0 0 18px -2px color-mix(in srgb, var(--ac) 65%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #gn-new{
  border-radius:0!important;clip-path:var(--cd-chamfer-sm);
  background:linear-gradient(135deg, var(--ac), color-mix(in srgb, var(--ac) 45%, #4b0a2a))!important;
  color:#fff!important;
  box-shadow:0 0 22px -2px color-mix(in srgb, var(--ac) 70%, transparent)!important;
  letter-spacing:.12em;text-transform:uppercase;font-size:11.5px!important;
}
html[data-gx-theme="cyberdeck"] .card .cv{
  border-radius:0!important;
  box-shadow:0 0 0 1px color-mix(in srgb, var(--cd-cyan) 30%, transparent), 0 10px 30px -10px color-mix(in srgb, var(--ac) 55%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] .card:hover .cv{
  box-shadow:0 0 0 1px var(--ac), 0 0 26px -4px color-mix(in srgb, var(--ac) 75%, transparent)!important;
}

/* the editor bar is a readout: black glass, chamfered, one line of light */
/* The chamfer has to live on a layer of its own. Clipping #tb itself also
   clips the page card, which unfolds from #bar2 *inside* the bar — the card
   opened into nothing at all and the whole settings panel disappeared. */
html[data-gx-theme="cyberdeck"] #tb{
  background:transparent!important;
  border:0!important;border-radius:0!important;
  clip-path:none!important;box-shadow:none!important;
}
html[data-gx-theme="cyberdeck"] #tb::before{
  content:"";position:absolute;inset:0;z-index:-1;
  background:linear-gradient(180deg, var(--cd-glass2), var(--cd-glass) 72%);
  clip-path:var(--cd-chamfer);
  box-shadow:inset 0 -2px 0 color-mix(in srgb, var(--ac) 65%, transparent),
             inset 0 1px 0 color-mix(in srgb, var(--cd-cyan) 30%, transparent);
}
html[data-gx-theme="cyberdeck"] #tb button:not(.sw){
  border-radius:0!important;
  color:color-mix(in srgb, var(--cd-cyan) 76%, #fff)!important;
  text-transform:uppercase;letter-spacing:.08em;font-size:10.5px!important;
}
html[data-gx-theme="cyberdeck"] #tb button:not(.sw):hover{
  background:color-mix(in srgb, var(--cd-cyan) 12%, transparent)!important;
  box-shadow:0 0 12px -2px color-mix(in srgb, var(--cd-cyan) 60%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #tb button.on:not(.sw){
  background:color-mix(in srgb, var(--ac) 20%, transparent)!important;
  color:#fff!important;
  box-shadow:inset 0 0 0 1px var(--ac), 0 0 16px -2px color-mix(in srgb, var(--ac) 70%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #tb #title{
  background:color-mix(in srgb, var(--cd-cyan) 10%, transparent)!important;
  border-radius:0!important;clip-path:var(--cd-chamfer-sm);
  color:color-mix(in srgb, var(--cd-cyan) 86%, #fff)!important;
  letter-spacing:.06em;
}
html[data-gx-theme="cyberdeck"] #gn-tabs{background:var(--cd-glass)!important}
html[data-gx-theme="cyberdeck"] #tb #bar2{
  background:color-mix(in srgb, var(--cd-glass) 88%, var(--ac))!important;
  border:1px solid color-mix(in srgb, var(--cd-cyan) 28%, transparent)!important;
  border-radius:0!important;clip-path:var(--cd-chamfer);
  box-shadow:0 0 26px -6px color-mix(in srgb, var(--ac) 60%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #tb #bar2 button,
html[data-gx-theme="cyberdeck"] #tb #bar2 select,
html[data-gx-theme="cyberdeck"] #tb #bar2 label,
html[data-gx-theme="cyberdeck"] #tb #bar2 input{
  color:color-mix(in srgb, var(--cd-cyan) 78%, #fff)!important;
  border-radius:0!important;
  background:color-mix(in srgb, var(--cd-cyan) 8%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #tb #bar2 button.on{
  background:color-mix(in srgb, var(--ac) 26%, transparent)!important;
  color:#fff!important;
  box-shadow:inset 0 0 0 1px var(--ac)!important;
}

/* the desk is the city floor: a grid, with the page floating on it */
html[data-gx-theme="cyberdeck"] #stage{
  background:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--cd-cyan) 13%, transparent) 0 1px, transparent 1px 36px),
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--cd-cyan) 13%, transparent) 0 1px, transparent 1px 36px),
    radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--ac) 14%, transparent), color-mix(in srgb, var(--bg) 52%, transparent) 72%)!important;
}
html[data-gx-theme="cyberdeck"] #cv,
html[data-gx-theme="cyberdeck"] .ps-sheet{
  border-radius:0!important;
  box-shadow:0 0 0 1px color-mix(in srgb, var(--cd-cyan) 40%, transparent),
             0 0 40px -8px color-mix(in srgb, var(--ac) 55%, transparent),
             0 20px 50px -18px rgba(0,0,0,.9)!important;
}
html[data-gx-theme="cyberdeck"] #pen-dock,
html[data-gx-theme="cyberdeck"] #acc-pop,
html[data-gx-theme="cyberdeck"] #ink-pen{
  border-radius:0!important;
  box-shadow:0 0 0 1px color-mix(in srgb, var(--cd-cyan) 30%, transparent),
             0 0 24px -6px color-mix(in srgb, var(--ac) 60%, transparent)!important;
}

/* =================================================================
   Minecraft: Fireplace — a lit hearth, drawn in blocks
   -----------------------------------------------------------------
   The whole visual language is a bevel: a two-pixel edge with light on
   the top-left and dark on the bottom-right, a hard shadow with no
   blur, no rounded corner anywhere, and the drop shadow behind every
   letter that the game puts behind its own.
   ================================================================= */
html[data-gx-theme="minecraft-sound-fireplace"]{
  --gx-bar:#2c1509;
  --mc-edge:#1b0d05;
  --mc-hi:rgba(255,206,138,.32);
  --mc-lo:rgba(0,0,0,.55);
  --mc-text:#ffe9c4;
  /* Every plank, well and highlight in the block below reads from these, so
     the light variant further down can repaint the whole GUI by redeclaring
     a dozen values instead of forty rules. */
  --mc-ink2:#e8c9a0;
  --mc-nav:#2a1408;--mc-nav2:#1f0f06;
  --mc-panel:#4a2610;--mc-panel2:#331a0a;
  --mc-btn:#6d3c19;--mc-btn2:#4a2610;
  --mc-well:#221006;
  --mc-bar:#3a1e0c;--mc-bar2:#2a1408;
  --mc-sel:#f0a03a;--mc-sel2:#b8621a;
  --mc-selbg:#8a4a1c;--mc-selbg2:#5e2f10;
  --mc-ts:1.5px 1.5px 0 rgba(0,0,0,.6);
  --mc-ts-hard:1.5px 1.5px 0 rgba(0,0,0,.7);
}
html[data-gx-theme="minecraft-sound-fireplace"] #lib{
  background:
    radial-gradient(70% 50% at 50% 108%, rgba(255,138,30,.22), transparent 68%),
    repeating-linear-gradient(90deg, rgba(0,0,0,.20) 0 1px, transparent 1px 52px),
    color-mix(in srgb, var(--bg) 60%, transparent)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #nav{
  background:linear-gradient(180deg,var(--mc-nav),var(--mc-nav2))!important;
  border-right:2px solid var(--mc-edge)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #nav b,
html[data-gx-theme="minecraft-sound-fireplace"] #lh,
html[data-gx-theme="minecraft-sound-fireplace"] .gn-head #lh,
html[data-gx-theme="minecraft-sound-fireplace"] .card .nm{
  color:var(--mc-text)!important;
  text-shadow:var(--mc-ts)!important;
  letter-spacing:.02em;
}
html[data-gx-theme="minecraft-sound-fireplace"] #nav a,
html[data-gx-theme="minecraft-sound-fireplace"] #nav > button{
  border-radius:0!important;
  color:var(--mc-ink2)!important;
  text-shadow:var(--mc-ts)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #nav a:hover,
html[data-gx-theme="minecraft-sound-fireplace"] #nav > button:hover{
  background:rgba(255,180,90,.14)!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #nav a.on{
  background:linear-gradient(180deg,var(--mc-selbg),var(--mc-selbg2))!important;
  color:#fff3dd!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-top{background:transparent!important;border-bottom:2px solid var(--mc-edge)!important}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-search,
html[data-gx-theme="minecraft-sound-fireplace"] #gn-board,
html[data-gx-theme="minecraft-sound-fireplace"] #gn-study,
html[data-gx-theme="minecraft-sound-fireplace"] .gn-head > button,
html[data-gx-theme="minecraft-sound-fireplace"] #gn-view{
  border-radius:0!important;
  border:2px solid var(--mc-edge)!important;
  background:linear-gradient(180deg,var(--mc-panel),var(--mc-panel2))!important;
  color:var(--mc-text)!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-search input{color:var(--mc-text)!important}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-search input::placeholder{color:rgba(255,233,196,.45)!important}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-view button{border-radius:0!important;color:var(--mc-ink2)!important}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-view button.on{
  background:linear-gradient(180deg,var(--mc-selbg),var(--mc-selbg2))!important;color:#fff3dd!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-new{
  border-radius:0!important;border:2px solid var(--mc-edge)!important;
  background:linear-gradient(180deg,#e08a2a,#a85a12)!important;
  color:#2a1408!important;
  text-shadow:1.5px 1.5px 0 rgba(255,255,255,.25)!important;
  box-shadow:inset 2px 2px 0 rgba(255,225,170,.5), inset -2px -2px 0 rgba(90,40,0,.6), 4px 4px 0 rgba(0,0,0,.5)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] .card .cv{
  border-radius:0!important;
  box-shadow:0 0 0 2px var(--mc-edge), 4px 4px 0 rgba(0,0,0,.45)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] .card:hover .cv{
  box-shadow:0 0 0 2px #ff9a3c, 4px 4px 0 rgba(0,0,0,.5), 0 0 24px -4px rgba(255,138,30,.55)!important;
}

/* the editor bar is a wooden GUI panel */
html[data-gx-theme="minecraft-sound-fireplace"] #tb{
  background:linear-gradient(180deg,var(--mc-bar),var(--mc-nav))!important;
  border:0!important;border-radius:0!important;
  box-shadow:inset 0 2px 0 var(--mc-hi), inset 0 -2px 0 var(--mc-lo), 0 4px 0 rgba(0,0,0,.45)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb button:not(.sw){
  border-radius:0!important;
  border:2px solid var(--mc-edge)!important;
  background:linear-gradient(180deg,var(--mc-btn),var(--mc-btn2))!important;
  color:var(--mc-text)!important;
  text-shadow:var(--mc-ts-hard)!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb button:not(.sw):active{
  transform:translate(1px,1px);
  box-shadow:inset -2px -2px 0 var(--mc-hi), inset 2px 2px 0 var(--mc-lo)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb button.on:not(.sw){
  background:linear-gradient(180deg,var(--mc-sel),var(--mc-sel2))!important;
  color:#2a1408!important;
  text-shadow:1.5px 1.5px 0 rgba(255,235,200,.5)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb #title{
  border-radius:0!important;border:2px solid var(--mc-edge)!important;
  background:color-mix(in srgb, var(--mc-well) 64%, transparent)!important;color:var(--mc-text)!important;
  text-shadow:var(--mc-ts)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #gn-tabs{background:var(--mc-well)!important}
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2{
  border-radius:0!important;border:2px solid var(--mc-edge)!important;
  background:linear-gradient(180deg,var(--mc-bar),var(--mc-bar2))!important;
  box-shadow:4px 4px 0 rgba(0,0,0,.5)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2 button,
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2 select,
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2 label,
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2 input{
  color:var(--mc-text)!important;border-radius:0!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2 button{
  border:2px solid var(--mc-edge)!important;
  background:linear-gradient(180deg,var(--mc-btn),var(--mc-btn2))!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2 button.on{
  background:linear-gradient(180deg,var(--mc-sel),var(--mc-sel2))!important;color:#2a1408!important;
}

/* the desk is a stone floor with the hearth off to one side */
html[data-gx-theme="minecraft-sound-fireplace"] #stage{
  background:
    radial-gradient(75% 55% at 50% 112%, rgba(255,138,30,.40), transparent 70%),
    repeating-linear-gradient(0deg, rgba(0,0,0,.24) 0 1px, transparent 1px 44px),
    repeating-linear-gradient(90deg, rgba(0,0,0,.24) 0 1px, transparent 1px 44px),
    linear-gradient(180deg,
      color-mix(in srgb, #1a0e07 58%, transparent),
      color-mix(in srgb, #241207 64%, transparent))!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #cv,
html[data-gx-theme="minecraft-sound-fireplace"] .ps-sheet{
  border-radius:0!important;
  box-shadow:0 0 0 2px var(--mc-edge), 6px 6px 0 rgba(0,0,0,.5), 0 0 48px -8px rgba(255,138,30,.35)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #pen-dock,
html[data-gx-theme="minecraft-sound-fireplace"] #acc-pop,
html[data-gx-theme="minecraft-sound-fireplace"] #ink-pen{
  border-radius:0!important;
  box-shadow:0 0 0 2px var(--mc-edge), 4px 4px 0 rgba(0,0,0,.5)!important;
}
/* =================================================================
   The editor chrome the palette does not reach
   -----------------------------------------------------------------
   The pen pill and the page bar are the two surfaces in the editor
   that were painted white outright rather than from a variable, so
   every dark theme got a white slab floating over the page. Feeding
   them from the same six colours fixes that for all of them at once —
   and in light mode it changes nothing, because there --sf is white.
   ================================================================= */
html[data-gx] #ink-pen{
  background:var(--sf)!important;
  border-color:var(--bd)!important;
  box-shadow:0 12px 32px -12px rgba(8,20,38,.5), 0 1px 3px rgba(8,20,38,.16)!important;
}
html[data-gx] #ink-pen .div{background:var(--bd)!important}
html[data-gx] #ink-pen button:not(.sw){color:var(--tx)!important}
/* :not(.sw) — a colour swatch carries its paint inline, and a blanket
   background here would turn the colour you are holding into a pale chip */
html[data-gx] #ink-pen button.on:not(.sw){
  background:color-mix(in srgb, var(--ac) 16%, transparent)!important;
  color:var(--ac)!important;
}
html[data-gx] #pg{background:var(--sf)!important;border-top-color:var(--bd)!important}
html[data-gx] #pg button{color:var(--tx)!important}
html[data-gx] #gn-foot .pill{
  background:color-mix(in srgb, var(--sf) 86%, transparent)!important;
  border-color:var(--bd)!important;color:var(--mu)!important;
  backdrop-filter:blur(6px);
}

/* LoFi: the pill is a small wooden tray of colours, warm and soft */
html[data-gx-theme="lofi-chill"] #ink-pen{
  background:linear-gradient(180deg,#4a2731,#3b2029)!important;
  border:1px solid color-mix(in srgb, var(--ac) 32%, transparent)!important;
  border-radius:18px!important;
}
html[data-gx-theme="lofi-chill"] #ink-pen button:not(.sw){color:#f2d9d3!important}
html[data-gx-theme="lofi-chill"] #ink-pen .div{background:color-mix(in srgb, var(--ac) 26%, transparent)!important}
html[data-gx-theme="lofi-chill"] #ink-pen button.on:not(.sw){
  background:color-mix(in srgb, var(--ac) 30%, transparent)!important;
  color:#fff2ee!important;
  box-shadow:0 2px 8px color-mix(in srgb, var(--ac) 40%, transparent)!important;
}

/* Cyberdeck: a readout strip, chamfered, one cyan hairline */
html[data-gx-theme="cyberdeck"] #ink-pen{
  background:linear-gradient(180deg,var(--cd-glass2),var(--cd-glass))!important;
  border:1px solid color-mix(in srgb, var(--cd-cyan) 34%, transparent)!important;
  border-radius:0!important;
  clip-path:var(--cd-chamfer);
  box-shadow:0 0 22px -6px color-mix(in srgb, var(--cd-cyan) 55%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #ink-pen button:not(.sw){color:color-mix(in srgb, var(--cd-cyan) 78%, #fff)!important}
html[data-gx-theme="cyberdeck"] #ink-pen .div{background:color-mix(in srgb, var(--cd-cyan) 30%, transparent)!important}
html[data-gx-theme="cyberdeck"] #ink-pen button.on:not(.sw){
  background:color-mix(in srgb, var(--ac) 24%, transparent)!important;
  color:#fff!important;
  box-shadow:inset 0 0 0 1px var(--ac)!important;
}

/* Minecraft: the same bevelled plank as every other control */
html[data-gx-theme="minecraft-sound-fireplace"] #ink-pen{
  background:linear-gradient(180deg,var(--mc-bar),var(--mc-nav))!important;
  border:2px solid var(--mc-edge)!important;
  border-radius:0!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo), 4px 4px 0 rgba(0,0,0,.5)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #ink-pen button:not(.sw){
  color:var(--mc-text)!important;
  text-shadow:var(--mc-ts)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #ink-pen .div{background:var(--mc-edge)!important}
html[data-gx-theme="minecraft-sound-fireplace"] #ink-pen button.on:not(.sw){
  background:linear-gradient(180deg,var(--mc-sel),var(--mc-sel2))!important;
  color:#2a1408!important;
  text-shadow:1px 1px 0 rgba(255,235,200,.45)!important;
}

/* the page bar is the last strip of chrome, and it sits on the desk rather
   than in the toolbar, so each skin paints it like the furniture it is */
html[data-gx-theme="lofi-chill"] #pg{
  background:linear-gradient(180deg,#3b2029,#331b23)!important;
  border-top:1px solid color-mix(in srgb, var(--ac) 22%, transparent)!important;
}
html[data-gx-theme="lofi-chill"] #pg button{
  border-radius:12px!important;border:1px solid transparent!important;
  background:rgba(255,255,255,.05)!important;color:#f0d6d0!important;
}
html[data-gx-theme="lofi-chill"] #pg button:hover{
  background:color-mix(in srgb, var(--ac) 22%, transparent)!important;border-color:color-mix(in srgb, var(--ac) 34%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #pg{
  background:var(--cd-glass)!important;
  border-top:1px solid color-mix(in srgb, var(--ac) 55%, transparent)!important;
}
html[data-gx-theme="cyberdeck"] #pg button{
  border-radius:0!important;
  border:1px solid color-mix(in srgb, var(--cd-cyan) 26%, transparent)!important;
  background:color-mix(in srgb, var(--cd-cyan) 7%, transparent)!important;
  color:color-mix(in srgb, var(--cd-cyan) 78%, #fff)!important;
  text-transform:uppercase;letter-spacing:.08em;font-size:10.5px!important;
}
html[data-gx-theme="cyberdeck"] #pg button:hover{
  border-color:var(--ac)!important;color:#fff!important;
  box-shadow:0 0 12px -2px color-mix(in srgb, var(--ac) 60%, transparent)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #pg{
  background:linear-gradient(180deg,var(--mc-nav2),var(--mc-well))!important;
  border-top:2px solid var(--mc-edge)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #pg button{
  border-radius:0!important;border:2px solid var(--mc-edge)!important;
  background:linear-gradient(180deg,var(--mc-btn),var(--mc-btn2))!important;
  color:var(--mc-text)!important;
  text-shadow:var(--mc-ts)!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #pg button:active{
  transform:translate(1px,1px);
  box-shadow:inset -2px -2px 0 var(--mc-hi), inset 2px 2px 0 var(--mc-lo)!important;
}

/* =================================================================
   The page card
   -----------------------------------------------------------------
   page-menu paints every chip in the card a fixed pale blue, which is
   right on a white sheet and wrong the moment the sheet is black glass
   or a plank: the skin's own ink then lands light-on-light and the
   card reads as empty. Each skin gives the card its own chip here, in
   both modes, from the same variables as the rest of its furniture.
   ================================================================= */
/* a chip has to sit on the plum sheet, not sink into it: a little white in the
   mix lifts it in dark mode and changes nothing in light, where --sf is white */
html[data-gx-theme="lofi-chill"] #tb #bar2.open button:not(.pgm-x):not(#pgm),
html[data-gx-theme="lofi-chill"] #tb #bar2.open select,
html[data-gx-theme="lofi-chill"] #tb #bar2.open input{
  background:color-mix(in srgb, var(--sf) 84%, #fff)!important;
  border-color:color-mix(in srgb, var(--ac) 26%, var(--bd))!important;
  color:var(--tx)!important;
}
html[data-gx-theme="lofi-chill"] #tb #bar2.open button.on:not(#pgm){
  background:var(--ac)!important;color:#fff!important;box-shadow:none!important;
}

html[data-gx-theme="cyberdeck"] #tb #bar2.open button:not(.pgm-x):not(#pgm),
html[data-gx-theme="cyberdeck"] #tb #bar2.open select,
html[data-gx-theme="cyberdeck"] #tb #bar2.open input{
  background:color-mix(in srgb, var(--cd-glass) 86%, transparent)!important;
  border-color:color-mix(in srgb, var(--cd-cyan) 26%, transparent)!important;
  color:var(--cd-fg)!important;
}
html[data-gx-theme="cyberdeck"] #tb #bar2.open button.on:not(#pgm){
  background:color-mix(in srgb, var(--ac) 26%, transparent)!important;
  color:#fff!important;box-shadow:inset 0 0 0 1px var(--ac)!important;
}

html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2.open button:not(.pgm-x):not(#pgm),
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2.open select,
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2.open input{
  background:linear-gradient(180deg,var(--mc-btn),var(--mc-btn2))!important;
  border:2px solid var(--mc-edge)!important;
  color:var(--mc-text)!important;
  text-shadow:var(--mc-ts)!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #tb #bar2.open button.on:not(#pgm){
  background:linear-gradient(180deg,var(--mc-sel),var(--mc-sel2))!important;
  color:#2a1408!important;text-shadow:none!important;
}

/* the light cyberdeck card is white glass, so the chosen chip is ink, not white */
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #bar2.open button.on:not(#pgm){
  background:color-mix(in srgb, var(--ac) 14%, transparent)!important;
  color:var(--ac)!important;
}

/* =================================================================
   Light mode
   -----------------------------------------------------------------
   A skin is a material, not a brightness. "Light" is the same room at
   noon, the same deck with the sun up, the same hearth on a bright
   day — so the grain, the chamfer and the bevel all survive, and only
   the paint changes: dark wood becomes parchment, black glass becomes
   white glass, and every ink that was cream turns brown.

   The picture is still there, washed to a tint rather than painted
   over. A theme you cannot see is not a theme; the first attempt at
   this poured 90 % of the page colour over the wall and all three
   mods came out as the same white app.
   ================================================================= */
html[data-theme="light"][data-gx-theme="lofi-chill"] #gx-wall::after,
html[data-theme="light"][data-gx-theme="cyberdeck"] #gx-wall::after,
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #gx-wall::after{
  background:linear-gradient(
    color-mix(in srgb, var(--bg) 44%, transparent),
    color-mix(in srgb, var(--bg) 64%, transparent))!important;
}
/* the content column is frosted paper, tinted by the mod rather than white */
html[data-theme="light"][data-gx-theme="lofi-chill"] #libm{
  background:color-mix(in srgb, #fdf3ee 64%, transparent)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #libm{
  background:color-mix(in srgb, #f6f9ff 90%, transparent)!important}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #libm{
  background:color-mix(in srgb, #fdf6e8 84%, transparent)!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #nav,
html[data-theme="light"][data-gx-theme="cyberdeck"] #nav,
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #nav{
  backdrop-filter:blur(16px) saturate(1.1);
  -webkit-backdrop-filter:blur(16px) saturate(1.1);
}
/* The skin's own frost is the heaviest in the app — 16 px on a pale photo is
   exactly the smudge that made light mode read as blurry. HD is a user
   setting, so it has to outrank this rule rather than merely follow it: the
   repeated [data-gx-theme] buys the extra attribute the specificity needs. */
html[data-gx-wallfx="hd"][data-gx-theme] #nav,
html[data-gx-wallfx="hd"][data-gx-theme] #libm{
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;
}

/* ---------- LoFi Chill, at noon: pale rose, not plum ---------- */
html[data-theme="light"][data-gx-theme="lofi-chill"]{--gx-bar:#f6e0d8}
html[data-theme="light"][data-gx-theme="lofi-chill"] #lib{
  background:
    radial-gradient(90% 60% at 84% -6%, color-mix(in srgb, var(--ac) 20%, transparent), transparent 62%),
    radial-gradient(70% 60% at 4% 104%, rgba(78,158,150,.14), transparent 60%),
    color-mix(in srgb, #fdf4ef 20%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #nav{
  background:color-mix(in srgb, #fdf2ec 46%, transparent)!important;
  border-right-color:color-mix(in srgb, var(--ac) 22%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #nav a{color:#6b3a3f!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #nav a.on{
  background:color-mix(in srgb, var(--ac) 16%, transparent)!important;
  color:color-mix(in srgb, var(--ac) 84%, #3a1a22)!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #tb{
  background:linear-gradient(180deg,#fdf1eb,#f7e2da 62%,#f1d8ce)!important;
  box-shadow:0 2px 14px rgba(120,60,50,.14),
             inset 0 -2px 0 color-mix(in srgb, var(--ac) 45%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #tb button:not(.sw){color:#5d3038!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #tb #title{color:#5d3038!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #gn-tabs{background:#efd8cf!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #gn-tabs button:not(.on){color:#6b3a3f!important}
/* --gx-bar is written inline by themes.ts, so a light skin cannot restyle it
   from CSS; it overrides the two surfaces that read from it instead. */
html[data-theme="light"][data-gx-theme="lofi-chill"] #tb #more{
  background:#f1d8ce!important;box-shadow:-12px 0 10px #f1d8ce!important;color:#5d3038!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #gn-tabs .gn-tab.on{
  background:#fff!important;color:var(--ac)!important;
  box-shadow:inset 0 -2px 0 var(--ac)!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #ink-pen{
  background:linear-gradient(180deg,#fff7f3,#f8e5dd)!important;
  border:1px solid color-mix(in srgb, var(--ac) 30%, transparent)!important;
  box-shadow:0 14px 30px -14px rgba(120,60,50,.42)!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #ink-pen button:not(.sw){color:#5d3038!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #ink-pen .div{
  background:color-mix(in srgb, var(--ac) 22%, transparent)!important}
html[data-theme="light"][data-gx-theme="lofi-chill"] #ink-pen button.on:not(.sw){
  background:color-mix(in srgb, var(--ac) 18%, transparent)!important;
  color:color-mix(in srgb, var(--ac) 88%, #3a1a22)!important;
  box-shadow:none!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #pg{
  background:linear-gradient(180deg,#fdf2ec,#f3dbd1)!important;
  border-top:1px solid color-mix(in srgb, var(--ac) 20%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #pg button{
  background:rgba(120,60,50,.06)!important;color:#5d3038!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #pg button:hover{
  background:color-mix(in srgb, var(--ac) 16%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #stage{
  background:
    radial-gradient(110% 80% at 50% -10%, color-mix(in srgb, var(--ac) 18%, transparent), transparent 68%),
    radial-gradient(80% 60% at 50% 108%, rgba(78,158,150,.12), transparent 66%),
    linear-gradient(180deg,
      color-mix(in srgb, #fdf4ef 80%, transparent),
      color-mix(in srgb, #f6e3db 84%, transparent))!important;
}

/* ---------- Cyberdeck, daytime: white glass, magenta ink ---------- */
html[data-theme="light"][data-gx-theme="cyberdeck"]{
  --gx-bar:#e9eef9;
  --cd-glass:#ffffff;--cd-glass2:#f2f6ff;
  --cd-fg:color-mix(in srgb, var(--ac) 76%, #1b1030);
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #lib{
  background:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--ac) 7%, transparent) 0 1px, transparent 1px 3px),
    radial-gradient(90% 60% at 50% -8%, color-mix(in srgb, var(--ac) 14%, transparent), transparent 66%),
    radial-gradient(60% 50% at 88% 96%, color-mix(in srgb, var(--cd-cyan) 16%, transparent), transparent 64%),
    color-mix(in srgb, #f7faff 18%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #nav{
  background:color-mix(in srgb, #f4f7ff 64%, transparent)!important;
  border-right:1px solid color-mix(in srgb, var(--ac) 26%, transparent)!important;
  box-shadow:inset -1px 0 0 color-mix(in srgb, var(--cd-cyan) 34%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb{
  background:transparent!important;box-shadow:none!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb::before{
  background:linear-gradient(180deg,#fbfcff,var(--cd-glass) 72%);
  box-shadow:inset 0 -2px 0 color-mix(in srgb, var(--ac) 55%, transparent),
             inset 0 1px 0 color-mix(in srgb, var(--cd-cyan) 40%, transparent),
             0 2px 10px rgba(40,20,70,.10);
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb button:not(.sw),
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #title,
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #bar2 button,
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #bar2 select,
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #bar2 label,
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #bar2 input{
  color:var(--cd-fg)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb button:not(.sw):hover{
  background:color-mix(in srgb, var(--ac) 10%, transparent)!important;
  box-shadow:none!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb button.on:not(.sw),
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #bar2 button.on{
  background:color-mix(in srgb, var(--ac) 14%, transparent)!important;
  color:var(--ac)!important;
  box-shadow:inset 0 0 0 1px var(--ac)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #more{
  background:#fff!important;box-shadow:-12px 0 10px #fff!important;color:var(--cd-fg)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #gn-tabs .gn-tab.on{
  background:var(--cd-glass)!important;color:var(--ac)!important;
  box-shadow:inset 0 -2px 0 var(--ac)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #tb #bar2{
  box-shadow:0 10px 26px -14px rgba(40,20,70,.4)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #gn-search,
html[data-theme="light"][data-gx-theme="cyberdeck"] #gn-board,
html[data-theme="light"][data-gx-theme="cyberdeck"] #gn-study,
html[data-theme="light"][data-gx-theme="cyberdeck"] .gn-head > button{
  background:color-mix(in srgb, #fff 86%, transparent)!important;
  border-color:color-mix(in srgb, var(--ac) 40%, transparent)!important;
  color:color-mix(in srgb, var(--ac) 72%, #2a0b18)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #gn-search input{color:var(--tx)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #gn-search input::placeholder{color:var(--mu)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #nav a,
html[data-theme="light"][data-gx-theme="cyberdeck"] #nav > button,
html[data-theme="light"][data-gx-theme="cyberdeck"] #nav button{color:var(--tx)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #nav a.on{
  background:linear-gradient(90deg, color-mix(in srgb, var(--ac) 14%, transparent), transparent 88%)!important;
  color:color-mix(in srgb, var(--ac) 84%, #2a0b18)!important;
  box-shadow:inset 2px 0 0 var(--ac)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #nav b,
html[data-theme="light"][data-gx-theme="cyberdeck"] #lh,
html[data-theme="light"][data-gx-theme="cyberdeck"] .gn-head #lh{
  color:color-mix(in srgb, var(--ac) 78%, #2a0b18)!important;
  text-shadow:none!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #ink-pen{
  background:linear-gradient(180deg,#fff,var(--cd-glass2))!important;
  border:1px solid color-mix(in srgb, var(--ac) 45%, transparent)!important;
  box-shadow:0 0 0 1px color-mix(in srgb, var(--cd-cyan) 34%, transparent),
             0 12px 26px -14px rgba(40,20,70,.35)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #ink-pen button:not(.sw){color:var(--cd-fg)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #ink-pen .div{
  background:color-mix(in srgb, var(--ac) 26%, transparent)!important}
html[data-theme="light"][data-gx-theme="cyberdeck"] #ink-pen button.on:not(.sw){
  background:color-mix(in srgb, var(--ac) 14%, transparent)!important;
  color:var(--ac)!important;
  box-shadow:inset 0 0 0 1px var(--ac)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #pg{
  background:var(--cd-glass2)!important;
  border-top:1px solid color-mix(in srgb, var(--ac) 50%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #pg button{
  background:#fff!important;
  color:color-mix(in srgb, var(--ac) 80%, #1b1030)!important;
  border-color:color-mix(in srgb, var(--ac) 32%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #pg button:hover{
  color:var(--ac)!important;border-color:var(--ac)!important;
  box-shadow:0 0 10px -3px color-mix(in srgb, var(--ac) 40%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #stage{
  background:
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--ac) 14%, transparent) 0 1px, transparent 1px 36px),
    repeating-linear-gradient(90deg, color-mix(in srgb, var(--ac) 14%, transparent) 0 1px, transparent 1px 36px),
    color-mix(in srgb, var(--bg) 74%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="cyberdeck"] .card .cv{filter:saturate(.92)}
/* the night shadow is a black bloom; by day the page sits on a pale desk and
   only needs the neon hairline and a short magenta drop */
html[data-theme="light"][data-gx-theme="cyberdeck"] #cv,
html[data-theme="light"][data-gx-theme="cyberdeck"] .ps-sheet{
  box-shadow:0 0 0 1px color-mix(in srgb, var(--cd-cyan) 55%, transparent),
             0 10px 26px -12px rgba(40,20,70,.32)!important;
}

/* ---------- Minecraft, daylight: the same GUI in birch and parchment ----------
   The bevel is the whole identity here, so it stays: a white top-left edge and
   a brown bottom-right one. Only the planks change — dark oak at night, pale
   birch by day — and the cream lettering turns to ink, with the drop shadow
   flipped to a light one so the words read as pressed into the panel rather
   than painted on top of it. */
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"]{
  --gx-bar:#e2c9a0;
  --mc-hi:rgba(255,255,255,.92);
  --mc-lo:rgba(92,50,20,.34);
  --mc-text:#3a1e0c;
  --mc-ink2:#5c3512;
  --mc-nav:#e6cfa6;--mc-nav2:#d8bc90;
  --mc-panel:#f2e3c6;--mc-panel2:#e5d1ad;
  --mc-btn:#fbf0da;--mc-btn2:#e9d7b5;
  --mc-well:#fbf4e4;
  --mc-bar:#efdcbb;--mc-bar2:#e0c9a4;
  --mc-selbg:#e08a2a;--mc-selbg2:#c0701c;
  --mc-ts:1px 1px 0 rgba(255,255,255,.85);
  --mc-ts-hard:1px 1px 0 rgba(255,255,255,.9);
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #lib{
  background:
    radial-gradient(70% 50% at 50% 108%, rgba(255,138,30,.16), transparent 68%),
    repeating-linear-gradient(90deg, rgba(120,72,30,.10) 0 1px, transparent 1px 52px),
    color-mix(in srgb, #fdf6e8 20%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #nav{
  background:color-mix(in srgb, var(--mc-nav) 82%, transparent)!important;
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #nav a.on{
  color:#fff6e6!important;
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #tb #more{
  background:var(--mc-bar2)!important;box-shadow:-12px 0 10px var(--mc-bar2)!important;
  color:var(--mc-text)!important}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #gn-tabs .gn-tab.on{
  background:linear-gradient(180deg,var(--mc-sel),var(--mc-sel2))!important;
  color:#2a1408!important;
  text-shadow:1px 1px 0 rgba(255,240,215,.5)!important}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #gn-new{
  color:#2a1408!important;
  text-shadow:1px 1px 0 rgba(255,240,215,.6)!important;
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #stage{
  background:
    radial-gradient(75% 55% at 50% 112%, rgba(255,138,30,.24), transparent 70%),
    repeating-linear-gradient(0deg, rgba(120,72,30,.13) 0 1px, transparent 1px 44px),
    repeating-linear-gradient(90deg, rgba(120,72,30,.13) 0 1px, transparent 1px 44px),
    linear-gradient(180deg,
      color-mix(in srgb, #f6e9d0 78%, transparent),
      color-mix(in srgb, #ecd9b8 82%, transparent))!important;
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #cv,
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] .ps-sheet{
  box-shadow:0 0 0 2px var(--mc-edge), 6px 6px 0 rgba(120,72,30,.32)!important;
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #tb button.on:not(.sw),
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #tb #bar2 button.on{
  color:#2a1408!important;
  text-shadow:1px 1px 0 rgba(255,240,215,.55)!important;
}
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #tb button:not(.sw):active,
html[data-theme="light"][data-gx-theme="minecraft-sound-fireplace"] #pg button:active{
  box-shadow:inset -2px -2px 0 var(--mc-hi), inset 2px 2px 0 var(--mc-lo)!important;
}

/* =================================================================
   Shared: the picture, and the covers
   -----------------------------------------------------------------
   The wall is dimmed by the palette sheet so that a photograph never
   fights the text. These three mods *are* their picture, though — a
   sunset room behind a near-opaque wash is just a dark grey page — so
   each skin lets more of it through and leans on the frosted panels
   for legibility instead.

   The covers are a fixed six-colour palette that predates the themes.
   They are left alone in hue, because the cover you chose is yours,
   but a light filter drops the saturation far enough that a slab of
   #2f6df6 stops being the loudest thing in a warm room.
   ================================================================= */
html[data-gx-theme="lofi-chill"] #gx-wall[data-mode="dark"]::after{
  background:linear-gradient(
    color-mix(in srgb, var(--bg) 26%, transparent),
    color-mix(in srgb, var(--bg) 64%, transparent))!important;
}
html[data-gx-theme="cyberdeck"] #gx-wall[data-mode="dark"]::after{
  background:linear-gradient(
    color-mix(in srgb, var(--bg) 20%, transparent),
    color-mix(in srgb, var(--bg) 56%, transparent))!important;
}
html[data-gx-theme="minecraft-sound-fireplace"] #gx-wall[data-mode="dark"]::after{
  background:linear-gradient(
    color-mix(in srgb, var(--bg) 18%, transparent),
    color-mix(in srgb, var(--bg) 52%, transparent))!important;
}

/* A cover is the one colour on the shelf that belongs to the notebook rather
   than to the theme, so it keeps its hue — six covers have to stay six
   covers. Saturation is what makes a #2f6df6 slab shout in a warm room, and
   desaturating leaves the white page preview inside untouched, because white
   has nothing to desaturate. */
html[data-gx-theme="lofi-chill"] .card .cv{filter:saturate(.58)}
html[data-gx-theme="minecraft-sound-fireplace"] .card .cv{filter:saturate(.5)}
html[data-gx-theme="cyberdeck"] .card .cv{filter:saturate(1.1) contrast(1.04)}

/* the bottom of the shelf nav is a container of buttons rather than a row of
   them, so a child selector misses it */
html[data-gx-theme="cyberdeck"] #nav button,
html[data-gx-theme="minecraft-sound-fireplace"] #nav button{border-radius:0!important}
html[data-gx-theme="minecraft-sound-fireplace"] #nav button{
  border:2px solid var(--mc-edge)!important;
  background:linear-gradient(180deg,var(--mc-panel),var(--mc-panel2))!important;
  color:var(--mc-text)!important;
  text-shadow:var(--mc-ts)!important;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo)!important;
}

/* =================================================================
   The mod player
   -----------------------------------------------------------------
   The board in the corner is built by mod-panel out of variables, so a
   skin only has to answer one question: what is this board made of? A
   plum tray with soft corners in LoFi, a chamfered readout in Cyberdeck,
   a bevelled plank in Minecraft — the same board, three materials, and
   the accent each mod actually uses rather than the app's own.
   ================================================================= */
html[data-gx-theme="lofi-chill"] #gxm{
  --gxm-panel:linear-gradient(180deg,#4a2731,#3b2029);
  --gxm-fg:#f7e3dd;--gxm-mu:#c8a7a1;
  --gxm-ac:#f2735f;--gxm-acink:#3b1015;
  --gxm-bd:color-mix(in srgb, var(--ac) 28%, transparent);
  --gxm-r:16px;--gxm-r2:10px;
  --gxm-shadow:0 18px 40px -18px rgba(40,16,24,.75);
}
html[data-theme="light"][data-gx-theme="lofi-chill"] #gxm{
  --gxm-panel:linear-gradient(180deg,#fff8f4,#fbeae3);
  --gxm-fg:#5d3038;--gxm-mu:#a17a74;
  --gxm-ac:#c0453a;--gxm-acink:#fff8f4;
  --gxm-bd:color-mix(in srgb, #c0453a 26%, transparent);
  --gxm-shadow:0 16px 34px -18px rgba(120,60,50,.45);
}

html[data-gx-theme="cyberdeck"] #gxm{
  --gxm-panel:color-mix(in srgb, var(--cd-glass) 94%, transparent);
  --gxm-fg:#e9f6ff;--gxm-mu:#7f93a6;
  --gxm-ac:#ffd94a;--gxm-acink:#12060f;
  --gxm-bd:color-mix(in srgb, var(--cd-cyan) 36%, transparent);
  --gxm-r:0px;--gxm-r2:0px;
  --gxm-clip:polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px));
  --gxm-clip2:polygon(0 4px,4px 0,calc(100% - 4px) 0,100% 4px,100% calc(100% - 4px),calc(100% - 4px) 100%,4px 100%,0 calc(100% - 4px));
  --gxm-shadow:0 0 28px -10px color-mix(in srgb, var(--ac) 60%, transparent);
}
html[data-theme="light"][data-gx-theme="cyberdeck"] #gxm{
  --gxm-panel:color-mix(in srgb, #fff 96%, transparent);
  --gxm-fg:#1b1030;--gxm-mu:#7a6b86;
  --gxm-ac:#d81b60;--gxm-acink:#fff;
  --gxm-bd:color-mix(in srgb, var(--ac) 34%, transparent);
  --gxm-shadow:0 0 24px -12px color-mix(in srgb, var(--ac) 45%, transparent);
}

html[data-gx-theme="minecraft-sound-fireplace"] #gxm{
  --gxm-panel:linear-gradient(180deg,var(--mc-bar),var(--mc-bar2));
  --gxm-fg:var(--mc-text);--gxm-mu:color-mix(in srgb, var(--mc-text) 60%, transparent);
  --gxm-ac:var(--mc-sel);--gxm-acink:#2a1408;
  --gxm-bd:var(--mc-edge);--gxm-r:0px;--gxm-r2:0px;
  --gxm-shadow:4px 4px 0 rgba(0,0,0,.5);
}
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-board,
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-fab{
  border-width:2px;
  box-shadow:inset 2px 2px 0 var(--mc-hi), inset -2px -2px 0 var(--mc-lo), 4px 4px 0 rgba(0,0,0,.5);
}
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-sw,
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-sw i,
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-bars span{border-radius:0}
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-head,
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-note,
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-rule{
  border-color:var(--mc-edge);background-color:var(--mc-edge);
}
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-title,
html[data-gx-theme="minecraft-sound-fireplace"] #gxm .gxm-lbl{text-shadow:var(--mc-ts)}

/* the bokeh is light on a photograph, so it has to blend into it rather than
   be added on top of it; the matrix is the opposite and is drawn in screen */
html[data-gx-theme="lofi-chill"] #gx-wall .gx-wall-fx{mix-blend-mode:soft-light;opacity:.9}
html[data-gx-theme="cyberdeck"] #gx-wall .gx-wall-fx{mix-blend-mode:screen;opacity:.8}

/* In light mode the switches and the slider were painted for a dark board and
   disappear into it: the track needs ink, not white. */
html[data-theme="light"] #gxm .gxm-sw{background:rgba(0,0,0,.06)}
html[data-theme="light"] #gxm .gxm-sw i{background:rgba(0,0,0,.26)}
html[data-theme="light"] #gxm .gxm-vol{background:rgba(0,0,0,.14)}

/* ---------- HD backdrop ----------
   The frost on the shelf and the wash on the desk are the same idea: mute the
   picture so the app stays readable. HD says "I want to see the picture", so
   both come off — the panels keep their own tint, and the desk keeps enough
   colour to hold the page's shadow, but neither smears what is behind it.
   These live last on purpose: the light skins above carry two attributes, and
   an equal-specificity rule only wins by coming later in the sheet. */
html[data-gx-wallfx="hd"][data-gx-theme] #stage{
  background:linear-gradient(180deg,
    color-mix(in srgb, var(--bg) 44%, transparent),
    color-mix(in srgb, var(--bg) 58%, transparent))!important;
}
/* a dense list of small labels needs more surface than a heading does */
html[data-gx-wallfx="hd"][data-gx-theme] #nav{
  background:color-mix(in srgb, var(--sf) 78%, transparent)!important;
}
`;

function mount() {
  let style = document.getElementById('gx-skin-style') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'gx-skin-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  // skins are more specific opinions about the same surfaces, so they have to
  // be read after the palette sheet — and themes.ts appends its own sheet
  // whenever it boots, which may be after this module ran
  const base = document.getElementById('gx-theme-style');
  if (base && style.previousElementSibling !== base) base.after(style);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
// if themes.ts boots later and appends its sheet after ours, take the end back
window.setTimeout(mount, 0);
window.setTimeout(mount, 250);
