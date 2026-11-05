/**
 * Materials for the mod themes that have not had a bespoke skin yet.
 *
 * The first three mods were hand-written: LoFi got plum paper and grain,
 * Cyberdeck got chamfered black glass, Minecraft got bevelled planks. That is
 * the right fidelity for three themes and the wrong approach for twenty — the
 * differences between them are a handful of decisions repeated with different
 * values, so they are expressed as data here and one block of CSS paints them.
 *
 * A material is a *family* plus optional overrides. The family decides the
 * shape of the thing (glass, scanlines, bevels, engraved stone); the palette
 * the theme already has decides the colour. Panels are mixed from `--sf` and
 * `--bg` rather than written as hex, which is what makes light mode work
 * without a second set of rules: those two variables are what the app flips.
 */

export type Family = 'glass' | 'scan' | 'voxel' | 'stone' | 'glow' | 'paper' | 'void';

interface Mat {
  fam: Family;
  /** Extra CSS emitted for this theme alone, after the family's rules. */
  extra?: string;
}

/**
 * Family recipes. Each returns the declarations that go on the theme's root;
 * the generic rules below read them.
 */
const FAMILY: Record<Family, string> = {
  /* Clear panels over the wallpaper, one hairline, a soft drop. */
  glass: `
    --mt-panel:color-mix(in srgb, var(--sf) 78%, transparent);
    --mt-veil:color-mix(in srgb, var(--sf) 46%, transparent);
    --mt-panel2:color-mix(in srgb, var(--bg) 62%, transparent);
    --mt-edge:color-mix(in srgb, var(--ac) 26%, var(--bd));
    --mt-r:14px;--mt-r2:9px;--mt-clip:none;
    --mt-shadow:0 10px 30px -18px rgba(0,0,0,.55);
    --mt-blur:blur(14px) saturate(1.25);
    --mt-hair:color-mix(in srgb, var(--ac) 55%, transparent);`,

  /* Cold, desaturated, and faintly banded — tape and CRT. */
  scan: `
    --mt-panel:linear-gradient(180deg,
      color-mix(in srgb, var(--bg) 76%, transparent),
      color-mix(in srgb, var(--bg) 84%, transparent));
    --mt-veil:linear-gradient(180deg,
      color-mix(in srgb, var(--bg) 46%, transparent),
      color-mix(in srgb, var(--bg) 54%, transparent));
    --mt-panel2:color-mix(in srgb, var(--bg) 88%, transparent);
    --mt-edge:color-mix(in srgb, var(--ac) 20%, rgba(255,255,255,.08));
    --mt-r:3px;--mt-r2:2px;--mt-clip:none;
    --mt-shadow:0 6px 26px -14px rgba(0,0,0,.85);
    --mt-blur:none;
    --mt-hair:color-mix(in srgb, var(--ac) 42%, transparent);
    --mt-tex:repeating-linear-gradient(0deg,
      rgba(255,255,255,.035) 0 1px, transparent 1px 3px);`,

  /* Voxel: square, thick edge, shadow with no blur. */
  voxel: `
    --mt-panel:color-mix(in srgb, var(--sf) 84%, transparent);
    --mt-veil:color-mix(in srgb, var(--sf) 52%, transparent);
    --mt-panel2:color-mix(in srgb, var(--bg) 90%, transparent);
    --mt-edge:color-mix(in srgb, var(--bg) 55%, #000);
    --mt-r:3px;--mt-r2:2px;--mt-clip:none;
    --mt-shadow:4px 4px 0 color-mix(in srgb, var(--bg) 70%, #000);
    --mt-blur:none;
    --mt-hair:color-mix(in srgb, var(--bg) 55%, #000);
    --mt-bw:2px;`,

  /**
   * Engraved stone and vellum: inset bevel, serif capitals.
   *
   * Kept at 82/74% rather than the near-opaque 96% it started at. At 96% the
   * wallpaper stopped existing behind the content area — the shelf was a flat
   * rectangle of --sf and the artwork only survived in the sidebar, which is
   * the exact thing the mod was ported for. The bevel is what makes it stone;
   * the opacity was only ever hiding the picture.
   */
  stone: `
    --mt-panel:linear-gradient(180deg,
      color-mix(in srgb, var(--sf) 84%, transparent),
      color-mix(in srgb, var(--sf) 74%, transparent));
    --mt-veil:linear-gradient(180deg,
      color-mix(in srgb, var(--sf) 54%, transparent),
      color-mix(in srgb, var(--sf) 44%, transparent));
    --mt-panel2:color-mix(in srgb, var(--bg) 78%, transparent);
    --mt-edge:color-mix(in srgb, var(--ac) 34%, var(--bd));
    --mt-r:4px;--mt-r2:3px;--mt-clip:none;
    --mt-shadow:inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent),
                0 8px 24px -16px rgba(0,0,0,.8);
    --mt-blur:none;
    --mt-hair:color-mix(in srgb, var(--ac) 48%, transparent);`,

  /* Dark panel, accent light bleeding out of the edge. */
  glow: `
    --mt-panel:linear-gradient(180deg,
      color-mix(in srgb, var(--bg) 70%, transparent),
      color-mix(in srgb, var(--bg) 80%, transparent));
    --mt-veil:linear-gradient(180deg,
      color-mix(in srgb, var(--bg) 44%, transparent),
      color-mix(in srgb, var(--bg) 52%, transparent));
    --mt-panel2:color-mix(in srgb, var(--bg) 84%, transparent);
    --mt-edge:color-mix(in srgb, var(--ac) 34%, var(--bd));
    --mt-r:11px;--mt-r2:8px;--mt-clip:none;
    --mt-shadow:0 0 26px -10px color-mix(in srgb, var(--ac) 55%, transparent);
    --mt-blur:blur(10px) saturate(1.15);
    --mt-hair:color-mix(in srgb, var(--ac) 60%, transparent);`,

  /**
   * Warm stock: cream panels, a rule under the bar, a little grain.
   *
   * 88/80% rather than the 93% it started at, for the same reason stone was
   * thinned: a panel opaque enough to be a sheet of paper is also opaque
   * enough to delete the wallpaper behind it. The grain and the warm white are
   * what make it paper; the last few percent of opacity were only hiding the
   * picture.
   */
  paper: `
    --mt-panel:color-mix(in srgb, var(--sf) 88%, #fff 4%);
    --mt-veil:color-mix(in srgb, var(--sf) 56%, #fff 3%);
    --mt-panel2:color-mix(in srgb, var(--bg) 80%, transparent);
    --mt-edge:color-mix(in srgb, var(--ac) 24%, var(--bd));
    --mt-r:9px;--mt-r2:6px;--mt-clip:none;
    --mt-shadow:0 10px 26px -20px rgba(40,26,12,.7);
    --mt-blur:none;
    --mt-hair:color-mix(in srgb, var(--ac) 38%, transparent);
    --mt-tex:repeating-linear-gradient(92deg,
      rgba(0,0,0,.018) 0 1px, transparent 1px 4px);`,

  /**
   * Absolute black, one accent line, nothing else.
   *
   * The solid panel stays near-black, because that is the look. The veil is
   * the version that goes over a picture, and it has to be much thinner: Black
   * Hole's artwork is a single bright ring in an otherwise absolute dark, so a
   * 92 % black shelf covers the one thing the mod was ported for and the home
   * screen reads as a broken display. Inside a note there is no shelf, which is
   * why the same theme looked correct there and black on the home screen.
   */
  void: `
    --mt-panel:color-mix(in srgb, #000 92%, var(--bg));
    --mt-veil:color-mix(in srgb, #000 38%, transparent);
    --mt-panel2:color-mix(in srgb, #000 97%, var(--bg));
    --mt-edge:color-mix(in srgb, var(--ac) 28%, #000);
    --mt-r:2px;--mt-r2:2px;--mt-clip:none;
    --mt-shadow:none;
    --mt-blur:none;
    --mt-hair:var(--ac);`,
};

const MATERIALS: Record<string, Mat> = {
  /**
   * Horror. The mod is a cold, grainy found-footage look: near-black panels,
   * a sickly desaturated palette, and a vignette that eats the corners. The
   * cards are pushed toward grey so the wallpaper is the only thing with
   * colour left in it.
   */
  horror: {
    fam: 'scan',
    extra: `
html[data-gx-theme="horror"] #lib::after{
  content:"";position:fixed;inset:0;z-index:3;pointer-events:none;
  background:radial-gradient(115% 85% at 50% 42%,
    transparent 38%, rgba(0,0,0,.62) 100%);
}
html[data-gx-theme="horror"] .card{
  filter:saturate(.5) contrast(1.06);
  border-color:color-mix(in srgb, var(--ac) 18%, #000)!important;
}
html[data-gx-theme="horror"] #tb::after{opacity:.8}
html[data-gx-theme="horror"] #libm{
  background:
    var(--mt-tex),
    linear-gradient(180deg,
      color-mix(in srgb, var(--bg) 76%, transparent),
      color-mix(in srgb, var(--bg) 84%, transparent))!important;
}`,
  },

  /**
   * Black Hole. There is no chrome to speak of — the mod is a single bright
   * ring in an otherwise absolute dark. Panels go to true black with one
   * accent hairline, and the shelf keeps a faint pull of light toward the
   * middle so it does not read as a broken screen.
   */
  'black-hole': {
    fam: 'void',
    extra: `
html[data-gx-theme="black-hole"] #lib{
  background:
    radial-gradient(62% 58% at 50% 46%,
      color-mix(in srgb, var(--ac) 9%, transparent), transparent 72%)!important;
}
html[data-gx-theme="black-hole"] #tb::after{
  opacity:1;box-shadow:0 0 14px color-mix(in srgb, var(--ac) 55%, transparent);
}
html[data-gx-theme="black-hole"] .card{
  box-shadow:0 0 0 1px color-mix(in srgb, var(--ac) 26%, transparent),
             0 12px 34px -22px var(--ac)!important;
}
html[data-gx-theme="black-hole"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
}`,
  },

  /**
   * Blockified. Voxel building blocks: square corners, a doubled edge, a
   * shadow with no blur at all, and the accent used as a solid underline
   * rather than a glow. Chunky on purpose.
   */
  blockified: {
    fam: 'voxel',
    extra: `
html[data-gx-theme="blockified"] #tb{border-width:2px!important}
html[data-gx-theme="blockified"] .card{
  border:2px solid color-mix(in srgb, var(--bg) 55%, #000)!important;
  border-radius:3px!important;
}
html[data-gx-theme="blockified"] #gn-tabs button.on{
  box-shadow:inset 0 -3px 0 var(--ac);
}
html[data-gx-theme="blockified"] #bar2{
  border-width:2px!important;
  border-radius:3px!important;
}`,
  },

  /**
   * Anime. Airy glass with a warm glow bleeding out of it and generous
   * corners — the chrome should feel like the same soft light as the artwork,
   * not a frame around it.
   */
  anime: {
    fam: 'glow',
    extra: `
html[data-gx-theme="anime"] #tb{border-radius:20px!important}
html[data-gx-theme="anime"] .card{border-radius:18px!important}
html[data-gx-theme="anime"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
}
html[data-gx-theme="anime"] #libm{
  border-radius:20px!important;
}`,
  },

  /**
   * Violet Nebula. Light coming *through* something rather than off it: the
   * panels stay dark and the accent bleeds out of their edges, and the shelf
   * carries a wash of the nebula's own violet so the chrome and the artwork
   * are the same light.
   */
  'violet-nebula': {
    fam: 'glow',
    extra: `
html[data-gx-theme="violet-nebula"] #lib{
  background:
    radial-gradient(70% 55% at 50% 8%,
      color-mix(in srgb, var(--ac) 16%, transparent), transparent 70%)!important;
}
html[data-gx-theme="violet-nebula"] .card{
  box-shadow:0 0 0 1px color-mix(in srgb, var(--ac) 22%, transparent),
             0 14px 36px -24px var(--ac)!important;
}
html[data-gx-theme="violet-nebula"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac), 0 6px 18px -12px var(--ac);
}
html[data-gx-theme="violet-nebula"] #tb{
  border-radius:16px!important;
}`,
  },

  /**
   * Spaced Out. A cockpit over a nebula: the panels are glass you look
   * *through*, held by a single cold hairline and squared-off corner ticks,
   * so the instruments read as instruments and the sky stays the subject.
   */
  'spaced-out': {
    fam: 'glass',
    extra: `
html[data-gx-theme="spaced-out"] #tb,html[data-gx-theme="spaced-out"] #libm{
  border-radius:6px!important;
}
/* Four corner brackets, drawn as eight one-pixel gradients. A mask would be
   tidier but this has to survive whatever browser the notebook is opened in. */
html[data-gx-theme="spaced-out"] #libm{
  position:relative;
}
html[data-gx-theme="spaced-out"] #libm::before{
  content:"";position:absolute;inset:6px;pointer-events:none;
  opacity:.55;
  background:
    linear-gradient(var(--ac),var(--ac)) 0 0/14px 1px no-repeat,
    linear-gradient(var(--ac),var(--ac)) 0 0/1px 14px no-repeat,
    linear-gradient(var(--ac),var(--ac)) 100% 0/14px 1px no-repeat,
    linear-gradient(var(--ac),var(--ac)) 100% 0/1px 14px no-repeat,
    linear-gradient(var(--ac),var(--ac)) 0 100%/14px 1px no-repeat,
    linear-gradient(var(--ac),var(--ac)) 0 100%/1px 14px no-repeat,
    linear-gradient(var(--ac),var(--ac)) 100% 100%/14px 1px no-repeat,
    linear-gradient(var(--ac),var(--ac)) 100% 100%/1px 14px no-repeat;
}
html[data-gx-theme="spaced-out"] .card{
  border-radius:5px!important;
  border-color:color-mix(in srgb, var(--ac) 22%, transparent)!important;
}
html[data-gx-theme="spaced-out"] #gn-tabs button.on{
  box-shadow:inset 0 -1px 0 var(--ac);
  letter-spacing:.08em;
}`,
  },

  /**
   * Josh Hutcherson. The meme is a bright portrait and one purple light, so
   * the chrome is frosted violet held well back — the face has to stay legible
   * through it, which is the whole point of the joke. The accent is spent on
   * almost nothing: a hairline, a tab underline, the ring on a focused field.
   *
   * Not the `void` family, which was the obvious reach: void is 92% black and
   * is only right when the artwork is black too (Black Hole). Over a bright
   * photograph it is just a black rectangle.
   */
  'josh-hutcherson': {
    fam: 'glass',
    extra: `
/* One flat opacity cannot do both jobs: the toolbar and the heading need a
   dense surface to sit on, and the face has to survive below them. So the veil
   is a gradient — heaviest at the top, thinnest at the bottom, where the
   artwork is doing the talking. */
html[data-gx-theme="josh-hutcherson"]{
  --mt-panel:linear-gradient(180deg,
    color-mix(in srgb, var(--sf) 88%, transparent) 0%,
    color-mix(in srgb, var(--sf) 68%, transparent) 38%,
    color-mix(in srgb, var(--sf) 52%, transparent) 100%);
  --mt-panel2:color-mix(in srgb, var(--bg) 52%, transparent);
  --mt-blur:blur(6px) saturate(1.1);
}
html[data-gx-theme="josh-hutcherson"] #tb{
  background:color-mix(in srgb, var(--sf) 92%, transparent)!important;
}
html[data-gx-theme="josh-hutcherson"] #tb,
html[data-gx-theme="josh-hutcherson"] #libm{
  box-shadow:0 0 0 1px color-mix(in srgb, var(--ac) 22%, transparent)!important;
}
html[data-gx-theme="josh-hutcherson"] .card:hover{
  box-shadow:0 0 0 1px color-mix(in srgb, var(--ac) 45%, transparent),
             0 16px 40px -26px var(--ac)!important;
}
html[data-gx-theme="josh-hutcherson"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
  text-shadow:0 0 12px color-mix(in srgb, var(--ac) 65%, transparent);
}`,
  },

  /**
   * Monkey RIZZ. Loud on purpose: the mod is a shout, so the accent is used
   * as a solid bleed rather than a tint — a red wash under the shelf, a red
   * spine down the left of every card, and corners left alone because
   * rounding would soften it.
   */
  'monkey-rizz': {
    fam: 'glow',
    extra: `
html[data-gx-theme="monkey-rizz"] #lib{
  background:
    radial-gradient(80% 60% at 50% 100%,
      color-mix(in srgb, var(--ac) 18%, transparent), transparent 72%)!important;
}
html[data-gx-theme="monkey-rizz"] .card{
  border-left:3px solid color-mix(in srgb, var(--ac) 70%, transparent)!important;
  border-radius:2px!important;
}
html[data-gx-theme="monkey-rizz"] #tb,html[data-gx-theme="monkey-rizz"] #libm{
  border-radius:2px!important;
  border-color:color-mix(in srgb, var(--ac) 40%, transparent)!important;
}
html[data-gx-theme="monkey-rizz"] #gn-tabs button.on{
  box-shadow:inset 0 -3px 0 var(--ac);
  text-transform:uppercase;
}`,
  },

  /**
   * Medieval. Vellum and carved oak: warm stock, a double rule around the
   * content the way a manuscript page is ruled, and corners left square
   * because nothing in the period was rounded.
   */
  medieval: {
    fam: 'stone',
    extra: `
html[data-gx-theme="medieval"] #libm{
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ac) 30%, transparent),
    inset 0 0 0 6px transparent,
    inset 0 0 0 7px color-mix(in srgb, var(--ac) 14%, transparent),
    var(--mt-shadow)!important;
}
html[data-gx-theme="medieval"] #tb{
  border-radius:2px!important;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ac) 22%, transparent),
    var(--mt-shadow)!important;
}
html[data-gx-theme="medieval"] .card{
  border-radius:2px!important;
  border-color:color-mix(in srgb, var(--ac) 26%, var(--bd))!important;
}
html[data-gx-theme="medieval"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
}`,
  },

  /**
   * Legendary Rift. The artwork already *is* the rift — a magenta sky with a
   * column of light straight up the middle — so the chrome's job is to stay
   * out of its way rather than to add a second tear. My first pass drew a
   * glowing vertical seam down the centre, which was both redundant and
   * misaligned with the one in the picture. The panels are thinner here than
   * the rest of the stone family, and the only accent is a low glow that
   * reads as light coming up off the ground.
   */
  'legendary-rift': {
    fam: 'stone',
    extra: `
html[data-gx-theme="legendary-rift"]{
  --mt-panel:linear-gradient(180deg,
    color-mix(in srgb, var(--sf) 74%, transparent),
    color-mix(in srgb, var(--sf) 62%, transparent));
  --mt-panel2:color-mix(in srgb, var(--bg) 66%, transparent);
}
html[data-gx-theme="legendary-rift"] #lib{
  background:
    radial-gradient(48% 46% at 50% 84%,
      color-mix(in srgb, var(--ac) 15%, transparent), transparent 74%)!important;
}
html[data-gx-theme="legendary-rift"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac),
             0 4px 16px -10px var(--ac);
}`,
  },

  /**
   * Elden Ring. Cold steel on stone — the mod's accent is a pale desaturated
   * blue, not gold, so the hairline under the bar reads as gilding turned
   * grey, and cards are framed on the inside so the edge looks inset into the
   * page instead of stuck onto it.
   */
  'elden-ring': {
    fam: 'stone',
    extra: `
html[data-gx-theme="elden-ring"] #tb{
  box-shadow:
    var(--mt-shadow),
    inset 0 -1px 0 color-mix(in srgb, var(--ac) 55%, transparent)!important;
}
html[data-gx-theme="elden-ring"] #lib{
  background:
    radial-gradient(72% 42% at 50% 0%,
      color-mix(in srgb, var(--ac) 11%, transparent), transparent 72%)!important;
}
html[data-gx-theme="elden-ring"] .card{
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ac) 24%, transparent),
    0 10px 26px -20px rgba(0,0,0,.8)!important;
}
html[data-gx-theme="elden-ring"] #gn-tabs button.on{
  box-shadow:inset 0 -1px 0 var(--ac);
  letter-spacing:.06em;
}`,
  },

  /**
   * Hollow Knight. Drawn rather than lit: cold blue-black, one engraved
   * hairline, no glow anywhere, and the tightest radii of the stone family so
   * the panels read as etched plates rather than carved blocks.
   */
  'hollow-knight': {
    fam: 'stone',
    extra: `
html[data-gx-theme="hollow-knight"]{
  --mt-r:3px;--mt-r2:2px;
  --mt-shadow:inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent),
              0 6px 20px -16px rgba(0,0,0,.9);
}
html[data-gx-theme="hollow-knight"] #tb,
html[data-gx-theme="hollow-knight"] #libm{
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ac) 18%, transparent),
    var(--mt-shadow)!important;
}
html[data-gx-theme="hollow-knight"] .card{
  border-radius:2px!important;
  border-color:color-mix(in srgb, var(--ac) 22%, var(--bd))!important;
}
html[data-gx-theme="hollow-knight"] #gn-tabs button.on{
  box-shadow:inset 0 -1px 0 color-mix(in srgb, var(--ac) 70%, transparent);
}`,
  },

  /**
   * Cozy. A lamp on in the corner: warm stock, softer corners than the rest of
   * the paper family, and a wash of lamplight rising from the bottom of the
   * page rather than falling from the top like every other theme.
   */
  cozy: {
    fam: 'paper',
    extra: `
html[data-gx-theme="cozy"]{--mt-r:12px;--mt-r2:8px}
html[data-gx-theme="cozy"] #lib{
  background:
    radial-gradient(82% 58% at 50% 104%,
      color-mix(in srgb, var(--ac) 11%, transparent), transparent 76%)!important;
}
html[data-gx-theme="cozy"] .card{
  border-radius:12px!important;
  border-color:color-mix(in srgb, var(--ac) 22%, var(--bd))!important;
}
html[data-gx-theme="cozy"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
}`,
  },

  /**
   * Creamy Keyboard. The mod is a pastel keycap set, so cards get a keycap's
   * bottom edge — a short solid offset with no blur — and the corners are the
   * roundest in the family. Playful without becoming a cartoon.
   */
  'creamy-keyboard': {
    fam: 'paper',
    extra: `
html[data-gx-theme="creamy-keyboard"]{--mt-r:13px;--mt-r2:9px}
html[data-gx-theme="creamy-keyboard"] .card{
  border-radius:13px!important;
  box-shadow:0 3px 0 color-mix(in srgb, var(--bg) 72%, #000),
             0 12px 26px -22px rgba(0,0,0,.55)!important;
}
html[data-gx-theme="creamy-keyboard"] #tb,
html[data-gx-theme="creamy-keyboard"] #libm{
  border-radius:13px!important;
  box-shadow:0 3px 0 color-mix(in srgb, var(--bg) 76%, #000),
             var(--mt-shadow)!important;
}
html[data-gx-theme="creamy-keyboard"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
  border-radius:8px;
}`,
  },

  /**
   * Capybara Party. The softest theme in the set: the roundest corners of any
   * theme here, a pastel wash off the top of the page, and borders left
   * almost invisible so nothing interrupts the roundness.
   */
  'capybara-party': {
    fam: 'paper',
    extra: `
html[data-gx-theme="capybara-party"]{--mt-r:18px;--mt-r2:12px}
html[data-gx-theme="capybara-party"] #lib{
  background:
    radial-gradient(72% 50% at 50% 0%,
      color-mix(in srgb, var(--ac) 13%, transparent), transparent 74%)!important;
}
html[data-gx-theme="capybara-party"] .card{
  border-radius:18px!important;
  border-color:color-mix(in srgb, var(--ac) 18%, transparent)!important;
}
html[data-gx-theme="capybara-party"] #tb,
html[data-gx-theme="capybara-party"] #libm{
  border-radius:18px!important;
  border-color:color-mix(in srgb, var(--ac) 16%, transparent)!important;
}
html[data-gx-theme="capybara-party"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
  border-radius:10px;
}`,
  },

  /**
   * Japanese lofi Mix. Stationery rather than scenery: a bound edge down the
   * left of the content, a thin red rule under the bar, and the grain left
   * alone. The restraint is the point — this is the theme for working.
   */
  'japanese-lofi-mix': {
    fam: 'paper',
    extra: `
html[data-gx-theme="japanese-lofi-mix"] #libm{
  border-left:2px solid color-mix(in srgb, var(--ac) 34%, transparent)!important;
}
html[data-gx-theme="japanese-lofi-mix"] #tb{
  box-shadow:
    var(--mt-shadow),
    inset 0 -1px 0 color-mix(in srgb, var(--ac) 42%, transparent)!important;
}
html[data-gx-theme="japanese-lofi-mix"] .card{
  border-radius:6px!important;
}
html[data-gx-theme="japanese-lofi-mix"] #gn-tabs button.on{
  box-shadow:inset 0 -1px 0 var(--ac);
  letter-spacing:.04em;
}`,
  },

  /**
   * Day One. The journal app's own manners: nothing decorative, one hairline,
   * generous corners, and the accent saved for the thing you are looking at.
   * The quietest theme in the set on purpose — it is the one to write in.
   */
  'day-one': {
    fam: 'glass',
    extra: `
html[data-gx-theme="day-one"]{
  --mt-panel:color-mix(in srgb, var(--sf) 72%, transparent);
  --mt-panel2:color-mix(in srgb, var(--bg) 62%, transparent);
  --mt-blur:blur(12px) saturate(1.1);
}
html[data-gx-theme="day-one"] .card{
  border-radius:14px!important;
}
html[data-gx-theme="day-one"] .card:hover{
  box-shadow:0 0 0 1px color-mix(in srgb, var(--ac) 40%, transparent),
             0 14px 34px -24px var(--ac)!important;
}
html[data-gx-theme="day-one"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
}`,
  },

  /**
   * The Traveller. A horizon, not a frame: the panels are glass held by a
   * single pale hairline, and a wide soft glow sits low on the page where the
   * ground would be, so the shelf feels like it is standing on something.
   */
  'the-traveller': {
    fam: 'glass',
    extra: `
html[data-gx-theme="the-traveller"]{
  --mt-panel:color-mix(in srgb, var(--sf) 70%, transparent);
  --mt-panel2:color-mix(in srgb, var(--bg) 58%, transparent);
  --mt-blur:blur(12px) saturate(1.15);
  --mt-r:12px;--mt-r2:8px;
}
html[data-gx-theme="the-traveller"] #lib{
  background:
    radial-gradient(120% 46% at 50% 108%,
      color-mix(in srgb, var(--ac) 16%, transparent), transparent 72%)!important;
}
html[data-gx-theme="the-traveller"] .card{
  border-radius:12px!important;
  border-color:color-mix(in srgb, var(--ac) 20%, transparent)!important;
}
html[data-gx-theme="the-traveller"] #gn-tabs button.on{
  box-shadow:inset 0 -2px 0 var(--ac);
  letter-spacing:.06em;
}`,
  },

  /**
   * MSI. The one theme that is not rectangular: the panels are chamfered on
   * opposite corners, which is the whole visual language of a gaming chassis,
   * and the scanlines are left on. Every other theme here is either square or
   * rounded, so this is the only shape that could not be mistaken for another.
   */
  msi: {
    fam: 'scan',
    extra: `
html[data-gx-theme="msi"]{
  --mt-clip:polygon(0 0, calc(100% - 14px) 0, 100% 14px,
                    100% 100%, 14px 100%, 0 calc(100% - 14px));
  --mt-panel:linear-gradient(180deg,
    color-mix(in srgb, var(--bg) 78%, transparent),
    color-mix(in srgb, var(--bg) 86%, transparent));
  --mt-panel2:color-mix(in srgb, var(--bg) 90%, transparent);
}
html[data-gx-theme="msi"] .card{
  clip-path:polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
  border-radius:0!important;
}
html[data-gx-theme="msi"] #gn-tabs button.on{
  box-shadow:inset 0 -3px 0 var(--ac);
  text-transform:uppercase;
  letter-spacing:.1em;
}`,
  },

  /**
   * Naruto: Itachi Uchiha. Blood red on black, and the scanlines are the only
   * texture — the mod is already loud, so the chrome stays flat and lets one
   * red hairline do the work. Square, tight, no glow.
   */
  'naruto-itachi-uchiha': {
    fam: 'scan',
    extra: `
html[data-gx-theme="naruto-itachi-uchiha"]{
  --mt-panel:linear-gradient(180deg,
    color-mix(in srgb, var(--bg) 74%, transparent),
    color-mix(in srgb, var(--bg) 82%, transparent));
  --mt-panel2:color-mix(in srgb, var(--bg) 86%, transparent);
  --mt-r:2px;--mt-r2:2px;
}
html[data-gx-theme="naruto-itachi-uchiha"] #tb{
  box-shadow:
    var(--mt-shadow),
    inset 0 -2px 0 color-mix(in srgb, var(--ac) 65%, transparent)!important;
}
html[data-gx-theme="naruto-itachi-uchiha"] .card{
  border-radius:2px!important;
  border-color:color-mix(in srgb, var(--ac) 30%, #000)!important;
}
html[data-gx-theme="naruto-itachi-uchiha"] #gn-tabs button.on{
  box-shadow:inset 0 -3px 0 var(--ac);
  text-transform:uppercase;
}`,
  },

  /**
   * Grand Theft Auto: San Andreas. A 90s street HUD: thick edges, capitals, a
   * stripe across the top of the page, and square corners everywhere. The one
   * theme in the set where a heavier border reads as period-correct rather
   * than clumsy.
   */
  'grand-theft-auto-san-andreas': {
    fam: 'scan',
    extra: `
html[data-gx-theme="grand-theft-auto-san-andreas"]{
  --mt-r:1px;--mt-r2:1px;
  --mt-panel:linear-gradient(180deg,
    color-mix(in srgb, var(--bg) 80%, transparent),
    color-mix(in srgb, var(--bg) 86%, transparent));
  --mt-panel2:color-mix(in srgb, var(--bg) 90%, transparent);
}
html[data-gx-theme="grand-theft-auto-san-andreas"] #tb{
  border-width:2px!important;
  box-shadow:
    var(--mt-shadow),
    inset 0 3px 0 color-mix(in srgb, var(--ac) 70%, transparent)!important;
}
html[data-gx-theme="grand-theft-auto-san-andreas"] .card{
  border-width:2px!important;
  border-radius:1px!important;
  border-color:color-mix(in srgb, var(--ac) 34%, #000)!important;
}
html[data-gx-theme="grand-theft-auto-san-andreas"] #gn-tabs button.on{
  box-shadow:inset 0 -3px 0 var(--ac);
  text-transform:uppercase;
  letter-spacing:.09em;
}`,
  },
};

/* ------------------------------------------------------------------ */

function block(id: string, mat: Mat) {
  const fam = FAMILY[mat.fam];
  const sel = `html[data-gx-theme="${id}"]`;
  return `${sel}{${fam}
  }
${sel} #tb,${sel} #bar2,${sel} #gn-foot .pill{
  background:var(--mt-panel)!important;
  border-color:var(--mt-edge)!important;
  border-radius:var(--mt-r)!important;
  box-shadow:var(--mt-shadow)!important;
  clip-path:var(--mt-clip)!important;
  backdrop-filter:var(--mt-blur,none);
  -webkit-backdrop-filter:var(--mt-blur,none);
}
/* The shelf is the one surface big enough to matter, so it is the one that
   answers to the wallpaper. Everywhere else the full material stands — a bar
   or a pill is a few hundred pixels of chrome and can afford to be solid. */
${sel} #libm{
  background:var(--mt-panel)!important;
  border-color:var(--mt-edge)!important;
  border-radius:var(--mt-r)!important;
  box-shadow:var(--mt-shadow)!important;
  clip-path:var(--mt-clip)!important;
  backdrop-filter:var(--mt-blur,none);
  -webkit-backdrop-filter:var(--mt-blur,none);
}
/* With a picture behind it the shelf takes the family's veil instead. The two
   attributes buy the specificity to outrank the rule above and the hand-written
   extra blocks, which are all one attribute and an id. */
html[data-gx-wall="1"][data-gx-theme="${id}"] #libm{
  background:var(--mt-veil,var(--mt-panel))!important;
}
${sel} #bar2{border-radius:var(--mt-r)!important}
${sel} #gn-tabs,${sel} #gn-foot{
  border-color:var(--mt-hair)!important;
}
${sel} #tb::after{
  content:"";position:absolute;left:0;right:0;bottom:0;height:1px;
  background:var(--mt-hair);opacity:.55;pointer-events:none;
}
${sel} .card{
  border-radius:var(--mt-r)!important;
  box-shadow:var(--mt-shadow)!important;
}
${mat.extra || ''}`;
}

export const MATERIAL_CSS = `
/* ------------------------------------------------------------------ */
/* Materials for the mod themes that have not had a bespoke skin       */
/* ------------------------------------------------------------------ */
${Object.entries(MATERIALS)
  .map(([id, m]) => block(id, m))
  .join('\n')}
`;

function mount() {
  let style = document.getElementById('gx-material-style') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'gx-material-style';
    style.textContent = MATERIAL_CSS;
    document.head.append(style);
  }
  const skin = document.getElementById('gx-skin-style');
  if (skin && style.previousElementSibling !== skin) skin.after(style);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
window.setTimeout(mount, 0);
window.setTimeout(mount, 250);
