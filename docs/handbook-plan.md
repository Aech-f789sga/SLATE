# Slate Handbook — build plan

A public guide site that documents **every** control in Slate, grouped, searchable,
with a real screenshot of each one, a one-line explanation, and a "More" drawer
for the detail.

The hard requirement is *all of it, no excuses* — so this plan is built around a
coverage gate that fails the build when a control exists in the app but not in
the handbook. Completeness is enforced, not promised.

---

## 0. What "done" means

| | |
|---|---|
| Chapters | 17 |
| Entries | 131 (each = one short line + a More drawer) |
| Figures | 99 real screenshots, all generated from the running app |
| Controls covered | 241 (measured, see §1) |
| Coverage | 100 %, asserted by `scripts/guide-coverage.mjs` |
| Budget | ≤ 400 KB to open a chapter, figures included |
| Motion | 8 named transitions, all ≤ 320 ms, all reduced-motion aware |
| Accessibility | keyboard-complete, AA contrast, focus visible everywhere |

---

## 1. The audit — what the app actually contains

I drove the running app with Playwright and dumped every visible interactive
element per surface. These are measured numbers, not estimates.

| Surface | Controls | Where it lives |
|---|---|---|
| Library rail | 8 | Documents · Favorites · Trash · Stylus & pen · Cloud backup · Sign in · Tour · Install |
| Library top bar + menu | 12 | Hide nav · Grid/List · Theme · New whiteboard · Study sets · + New · Import backup · folder chips · Sign in |
| Notebook card menu | 5 | Rename · Duplicate · Favourite · Move to folder · Delete/Restore (+ ☁️ per-card sync toggle) |
| Theme panel | 25 themes | 25 palettes, Load, Blur/HD, wallpaper opacity, soundtrack per theme |
| Notebook studio | 68 | 24 cover patterns · 6 covers · 6 paper colours · 7 sizes · 2 orientations · 2 page kinds · 5 paper styles × 4 colours · import |
| Editor tool row | 14 | Library · title · pen · highlighter · eraser · shapes · text · lasso · laser · bucket · undo · redo · accessories · more |
| Pen dock | 9 | 6 pen slots + move edge + add pen + set up |
| Ink pill | 16 | 6 nibs · 3 widths · 6 swatches · gear |
| Pen sheet | 12 | pressure curve (4) · taper · smoothing · exact width · haptics (4) + test · recalibrate |
| Shapes picker | 17 | 15 kinds in 3 groups (Shapes / Polygons / Curves) + Bend Line + Elbow Line |
| Accessories | 13 | Zoom Window · Time Keeper · Toolbar Customization · Smart ink · Hold to snap · Insert media · Stickers · Sticky note · Object snap · + 4 smart-ink rows |
| Page card | 24 | template · colour · resolution · clear · enlarge/shrink/delete selection · zoom ± · full screen · thumbnails · print/PDF · paper size · settings · margins 5–10 mm · paper previews · grain · single/long strip |
| Session pill | 8 | Pen only · Sound · guides/symmetry/perspective · layers · animate · video · symbols · figures |
| Page bar | 7 | back · page n · forward · add · duplicate · delete · fold |
| Study sets | 3 | list · edit · study |

**Totals:** 241 interactive controls across 15 surfaces — among them 25 themes,
309 bundled sticker SVGs, 6 nibs and 6 paper templates.

Two facts worth fixing while we are here (the tour copy is stale):

- the tour says "twenty-three themes"; there are **25**
- the tour calls the eraser two things in two steps ("Eraser" and
  "Whole-stroke eraser") — the handbook will present it once, with two modes

---

## 2. Information architecture

17 chapters, in the order someone actually learns the app. Each chapter is a
route; each entry is an anchor inside it.

| # | Chapter | Route | Entries | Figures |
|---|---|---|---|---|
| 1 | Start here | `/guide/start` | 6 | 4 |
| 2 | The library | `/guide/library` | 9 | 7 |
| 3 | Making a notebook | `/guide/notebook` | 8 | 6 |
| 4 | Paper & pages | `/guide/pages` | 11 | 8 |
| 5 | Pens & ink | `/guide/ink` | 12 | 10 |
| 6 | Selecting & arranging | `/guide/select` | 8 | 6 |
| 7 | Shapes & diagrams | `/guide/shapes` | 10 | 7 |
| 8 | Text & notes | `/guide/text` | 9 | 7 |
| 9 | Media & stickers | `/guide/media` | 6 | 5 |
| 10 | Smart ink | `/guide/smart` | 7 | 6 |
| 11 | Writing aids | `/guide/aids` | 10 | 7 |
| 12 | Export & share | `/guide/export` | 6 | 4 |
| 13 | Sync & backup | `/guide/sync` | 6 | 4 |
| 14 | Themes & sound | `/guide/themes` | 7 | 8 |
| 15 | Study sets | `/guide/study` | 4 | 3 |
| 16 | Whiteboard | `/guide/board` | 4 | 3 |
| 17 | Install, offline, fixes | `/guide/install` | 8 | 4 |

### Chapter contents

**1 · Start here** — What Slate is · The two screens · Your first page (5 min) ·
Install it as an app · Where your work is saved · Beta and contact

**2 · The library** — Shelves (Documents / Favorites / Trash) · Grid vs list ·
Search · Folders · The notebook card menu · New whiteboard · Study sets · Import
a backup · Tour

**3 · Making a notebook** — Covers · Paper colour · Size · Orientation · Writing
vs planner pages · Paper styles · Import a paper template · Naming

**4 · Paper & pages** — Templates (blank, lined, margin, grid, dotted, Cornell) ·
Paper colour · Page size & ready-made paper · Margins (5–10 mm) · Grain · Add,
duplicate, delete · Thumbnails · One page vs long strip · Fold the page bar ·
Clear a page · Print

**5 · Pens & ink** — The six nibs · Width (3 presets + 0.1–100 mm slider) ·
Colour · Pressure · Taper · Smoothing · The pen dock · Highlighter · Eraser (two
modes) · Stroke eraser · Haptics

**6 · Selecting & arranging** — Lasso · Tap to select · Move · Resize · Rotate ·
Delete · Restyle (weight + colour) · Warp · Layers

**7 · Shapes & diagrams** — The 15 kinds · Draw-and-hold recognition · Curvable
Line · Bend Line · Elbow Line · Fill & opacity · Dashed · Axes · Object snap ·
Hold to snap · Figure library · Engineering symbols

**8 · Text & notes** — Text tool · Box styles (plain, sticky, callout, tint,
outline, tag) · Bold/italic/underline/strike · Alignment · Fonts · Sticky notes ·
Auto-calculate · Ink → text · Ink → LaTeX

**9 · Media & stickers** — Insert image · Insert video · Move & resize ·
Stickers (309 built in) · Emoji sheet · GIPHY search

**10 · Smart ink** — What it is (and that it is off by default) · Scribble to
erase · Draw and hold to tidy · Straighten a line · Auto-calculate · Ink → text ·
Ink → LaTeX · The handwriting model

**11 · Writing aids** — Pen only (palm rejection) · Sound · Haptics · Zoom
Window · Time Keeper · Focus mode · Guides, symmetry, perspective · Toolbar
customization · Keyboard & gestures

**12 · Export & share** — PDF (all pages) · PNG · Resolution 100–1200 dpi ·
Print · What other apps can open · Sharing a link

**13 · Sync & backup** — Accounts · The per-notebook ☁️ toggle · What syncs (and
what does not: study sets) · Export a `.slate` backup · Restore on another
device · Signing out

**14 · Themes & sound** — 25 themes · Wallpaper (Blur / HD, opacity) · Live
wallpaper in the editor · Soundtracks and playlists · Interface sound packs ·
The music pill

**15 · Study sets** — Make a set · Cards · Study mode · Where sets are stored

**16 · Whiteboard** — An endless canvas · Zoom and pan · What it shares with a
notebook

**17 · Install, offline, fixes** — Install on iOS / Android / desktop · Offline ·
How updates work (60 s check, 5-minute snooze) · Pen draws nothing · No haptics
on iPad · Storage full · Contact

---

## 3. Content model

One file, `src/guide/content.ts`, is the only source of truth. The nav, the
search index, the coverage gate and the figure manifest all read from it.

```ts
export type Entry = {
  id: string;                 // stable, used by data-guide + deep links
  title: string;              // MUST equal the control's label in the app
  line: string;               // one sentence, ≤ 90 chars, no full stop waste
  more?: string[];            // paragraphs for the More drawer
  steps?: string[];           // optional 1-2-3, rendered as a list
  figure?: string;            // figure id → public/guide/<figure>.avif
  hotspots?: Hotspot[];       // % positions on the figure, animated on hover
  keys?: string[];            // rendered as <kbd> chips
  platform?: 'touch' | 'desktop' | 'pen';
  tags?: string[];            // search synonyms: "rubber, eraser, delete"
  see?: string[];             // "related" entry ids
};

export type Chapter = {
  id: string; title: string; lede: string; icon: string;
  sections: { title: string; entries: Entry[] }[];
};
```

### Writing rules

- **The line is the whole product.** If it needs two sentences, the second one
  belongs in More. Target 8–14 words.
- **Second person, present tense.** "Tap the page to type." Not "Text can be
  added by tapping."
- **Name the control exactly as the app names it.** Enforced by the coverage
  gate (§4), which compares the entry title to the control's label.
- **More is for the *why* and the edge cases.** What it is good for, what it
  does not do, the one thing people get wrong.
- No marketing adjectives. No "powerful", "seamless", "revolutionary".

### Example entry

```ts
{
  id: 'ink.pen-dock',
  title: 'The pen dock',
  line: 'Six pens in a pocket. Each slot is a whole preset — nib, width, colour.',
  figure: 'ink/pen-dock',
  hotspots: [{ x: 18, y: 42, r: 9, label: 'A slot' }, { x: 88, y: 20, r: 6, label: 'Add' }],
  more: [
    'Tap a slot to pick that pen up. The slot you are holding is pulled out all
     the way; the others stay in the pocket.',
    'Open a slot (long-press, or the ⚙ at the bottom) to swap what is in it —
     pen, brush, highlighter, eraser or laser — and to set its nib and width.
     Up to eight slots if six is not enough.',
    'The dock can move to any edge: the arrows at the bottom walk it around the
     page. It stays where you leave it.',
  ],
  see: ['ink.nibs', 'ink.width'],
}
```

---

## 4. The coverage gate — how "all of it" is enforced

Three parts, all cheap.

**a. Mark the controls.** A single map file, `src/guide/mark.ts`, assigns
`data-guide` to every control at boot:

```ts
const EXACT: [selector: string, id: string][] = [
  ['#pen-btn', 'library.stylus'],
  ['#acc-trigger', 'aids.accessories'],
  ['[data-acc="zoom"]', 'aids.zoom-window'],
  …
];
const PATTERNS: [selector: string, idOf: (el: Element) => string][] = [
  ['.gx-card', (el) => 'themes.' + el.dataset.theme],
  ['#sh-pop [data-shape]', (el) => 'shapes.' + el.dataset.shape],
];
```

Patterns exist so 25 themes and 15 shapes are 40 covered controls without 40
lines of bookkeeping.

**b. Dump and compare.** `scripts/guide-coverage.mjs` boots the app, walks every
visible interactive element on all 15 surfaces (the same dump that produced §1),
and asserts:

1. every control resolves to a `data-guide` id — no undocumented control
2. every id exists in `content.ts` — no dangling marker
3. every entry is referenced by at least one control — no invented docs
4. every entry title matches its control's label (case-insensitive, punctuation
   stripped) — no drift
5. every `figure` id has a file on disk at both widths

It prints a table — `241 controls · 241 marked · 131 entries · 0 orphans · 99/99
figures` — and exits non-zero on any gap. Wired into `npm run lint` (static part)
and `npm run probe:guide` (the live part).

**c. Fail loudly.** A feature added next month without a content entry breaks
`npm run lint`. That is the whole point: the handbook cannot silently fall
behind the app.

---

## 5. Visual design

The handbook is a second page of the same product, so it inherits the app's
tokens (`--bg --sf --tx --mu --bd --ac`) and therefore all 25 themes. It does
**not** copy the app's density: the app is a tool, the handbook is a read.

### Tokens

| | Value |
|---|---|
| Surface | `--sf` at one step above `--bg`; 1 px `--bd`; radius 14 px (cards), 10 px (rows), 999 px (chips) |
| Shadow | none, except the figure frame: `0 1px 2px rgb(0 0 0 / .06), 0 12px 32px -12px rgb(0 0 0 / .18)` |
| Type | one family (`--slate-font`); 28/1.2 chapter title · 17/1.4 entry title · 15/1.55 body · 13/1.5 meta |
| Weights | 450 body, 650 titles. Nothing else. |
| Measure | 66 ch |
| Accent | active chapter, More chevron, `kbd`, focus ring. Nowhere else. |
| Space | 8 px base; 4/8/12/20/32/56 |

### Layout

```
┌────────────┬──────────────────────────────────────┬────────────┐
│ rail       │ content                              │ on this    │
│ (sticky)   │   chapter title + lede               │ page       │
│ 17 items   │   section                            │ (sticky)   │
│ + search   │     entry ▸ line          [figure]   │ 8 anchors  │
│            │     entry ▸ line          [figure]   │            │
└────────────┴──────────────────────────────────────┴────────────┘
  240 px         max 66ch, centred            180 px (≥ 1200 px only)
```

- Rail collapses to a 56 px icon strip under 1100 px, and to a top sheet under
  720 px.
- Entry layout: text left, figure right, alternating every section so the eye
  does not zig-zag. On mobile the figure sits under the line, full-bleed to the
  card edge.
- Figures are 16:10, `border-radius: 12px`, 1 px border, with the app's own
  chrome cropped in — never a mockup, never a redraw.

### Components

| Component | Used for |
|---|---|
| `ChapterHero` | title, lede, count of entries, "replay in app" |
| `Entry` | title · line · More toggle · figure · hotspots |
| `Figure` | lazy image, 2 widths, hotspot overlay, "expand" to full screen |
| `AnatomyMap` | interactive SVG of the editor screen (§7) |
| `ThemeStrip` | 25 dots that re-theme the handbook live on hover |
| `KeyCap` | `⌘K`, `Esc`, `Space` |
| `Callout` | one per chapter max: "the thing people get wrong" |
| `SearchPalette` | ⌘K overlay |
| `ChapterFooter` | prev / next |

---

## 6. Motion & interaction spec

Everything is transform/opacity only. Nothing animates a layout property except
the two `grid-template-rows` accordions, which are the cheapest way to animate
auto height.

| # | Interaction | Trigger | Motion | Duration | Easing |
|---|---|---|---|---|---|
| 1 | Entry expand | click title or chevron | `grid-template-rows: 0fr → 1fr`, body `opacity 0→1` + `translateY(-4px→0)` | 240 ms | `cubic-bezier(.2,.8,.2,1)` |
| 2 | Chevron | same | rotate 0→90°, `--ac` colour | 200 ms | same |
| 3 | Figure hover | pointer (fine only) | image `scale(1.012)`, hotspot ring `r` 0→9, label fades in | 320 ms | `ease-out` |
| 4 | Hotspot pulse | first view | ring scales 0.9→1.0→0.9, 2 loops, then rests | 1.6 s ×2 | `ease-in-out` |
| 5 | Chapter change | rail click | old `opacity 1→0` + `translateY(0→-6px)` 120 ms → new `0→1` + `6px→0` 180 ms | 300 ms | `ease-out` |
| 6 | Scroll reveal | IO at 15 % | `translateY(6px→0)` + `opacity` | 260 ms | `ease-out`, once |
| 7 | Search open | ⌘K / `/` | overlay `opacity`, panel `scale(.985→1)` | 160 ms | `ease-out` |
| 8 | Rail progress | scroll | 2 px accent bar height, rAF-throttled | 120 ms | linear |

Reduced motion (`prefers-reduced-motion: reduce`): all eight collapse to an
instant state change, no transforms. The hotspot ring appears at rest, no pulse.

### The three "engaging" pieces

**AnatomyMap** (chapter 1) — an SVG of the editor screen, drawn in the app's own
colours: tool row, pen dock, ink pill, page card, session pill, page bar, canvas.
Hovering a region lifts it 2 px and dims the rest to 40 %; clicking jumps to the
chapter that explains it. This is the answer to "where is everything" in one
screen, and it is the one thing a list of chapters cannot do.

**ThemeStrip** (chapter 14) — 25 dots. Hovering one swaps the handbook's own CSS
variables to that theme for as long as the pointer is there, and the page
re-renders around it. It is simultaneously the documentation of the feature and a
demonstration of it.

**Ink hero** (chapter 1 top) — the word "Slate" drawn stroke by stroke with the
same renderer the app uses, once, in 1.2 s, then still. Not a video, not a GIF:
about 3 KB of code and no network.

---

## 7. "Open in app" — one bridge, big payoff

Every entry can carry a deep link: `/?guide=<entry-id>`.

`tour.ts` already runs an arbitrary `Step[]` and dims everything but one target.
So the bridge is ~30 lines: read the param, build a one-step tour whose `target`
is the control marked with that `data-guide` id, run it. The user lands in the
real app with a spotlight on the exact control they were reading about.

This makes the handbook a *launcher*, not a brochure — and it cannot drift,
because it points at the live control.

---

## 8. Screenshot pipeline

`scripts/guide-shots.mjs` + `src/guide/figures.ts` (the manifest). One entry per
figure:

```ts
{
  id: 'ink/pen-dock',
  surface: 'editor',
  theme: 'slate',            // pinned: one neutral theme for all figures
  viewport: { w: 1280, h: 800, dpr: 2 },
  setup: ['openNotebook', 'tool:pen', 'draw:seed-strokes', 'open:pen-dock'],
  clip: '#pen-dock',         // or a rect, or 'full'
  mask: ['#title'],          // anything personal
}
```

Rules that make it deterministic:

- a **seeded notebook** — 3 strokes, 1 shape, 1 text, 1 sticker — so every figure
  has the same content and nothing personal ever appears
- `document.fonts.ready` before capture; the intro card removed; tours flagged off
- Playwright `animations: 'disabled'`, `caret: 'hide'`
- one pinned theme (`slate`) for all figures except chapter 14, which shoots six
  on purpose
- output: `public/guide/<id>@2x.avif` (1440 px wide, q≈72) + `@1x.avif`, plus a
  `guide-figures.json` with intrinsic sizes so the page reserves space and CLS
  stays at 0
- `--only <id>` to re-shoot one figure; `--check` to re-shoot into memory and
  compare bytes, which is how drift is caught in CI

Expected size: 99 figures × ~35 KB (AVIF) ≈ 3.4 MB on disk, and the same on the wire if
someone opens every chapter — but only the current chapter loads, so a first
visit is ~180 KB of images.

---

## 9. Technical shape

Second Vite entry, same repo, same tokens, same service worker:

```
guide.html                  ← new entry (vite multi-page)
src/guide/
  main.ts                   ← boot, router, theme sync
  content.ts                ← the whole handbook, as data (§3)
  mark.ts                   ← data-guide map (§4)
  figures.ts                ← shot manifest (§8)
  render.ts                 ← chapter → DOM
  components/
    entry.ts  figure.ts  anatomy.ts  themes.ts  search.ts  rail.ts
  guide.css                 ← tokens + layout + motion
public/guide/*.avif         ← figures
scripts/guide-shots.mjs     ← capture
scripts/guide-coverage.mjs  ← the gate
scripts/probe-guide.mjs     ← runtime checks
```

- **No framework.** The app is vanilla TS modules; a handbook that ships React
  for 17 static pages would be the heaviest thing in the repo. (React and
  Tailwind are installed for the unused scaffold in `src/main.tsx` — the guide
  will not pull them in, because `guide.html` loads one plain module.)
- **Build wiring.** `vite.config.ts` gets a second `build.rollupOptions.input`
  entry for `guide.html`; the PWA precache list is scoped so the guide is not
  pushed into the app's install payload. `vercel.json` needs a `rewrites` rule
  (`/guide/(.*)` → `/guide.html`) — it currently has none, and without it a
  deep link 404s.
- **One route per chapter**, `history.pushState`, real `<a href>` for every nav
  item so links are shareable and crawlable.
- **Search** is a 40-line scorer over `content.ts` (title, tags, line), rendered
  in the ⌘K palette. No index file, no service.
- **Theme sync**: reads the same `localStorage` key the app uses, so the handbook
  matches whatever theme the reader already chose.

---

## 10. Accessibility & performance budgets

**Accessibility**
- every entry is a `<button aria-expanded aria-controls>`; the More panel is a
  region, not a div with a click handler
- focus ring: 2 px `--ac` at 2 px offset, never removed
- hotspots are decorative; the same information is in the caption text
- contrast: body ≥ 7:1, meta ≥ 4.5:1, checked against all 25 themes by
  `scripts/probe-guide.mjs` (it walks the theme strip and samples computed
  colours)
- `prefers-reduced-motion` and `prefers-contrast` honoured

**Performance**

| | Budget |
|---|---|
| Guide page JS | ≤ 45 KB gzip (content included) |
| Guide CSS | ≤ 14 KB gzip |
| First chapter images | ≤ 6 figures, lazy below the fold |
| LCP | < 1.8 s on a 4G profile |
| CLS | 0 (every figure has intrinsic dimensions) |
| Lighthouse a11y | 100 |

---

## 11. Phases

| Phase | Work | Done when |
|---|---|---|
| **P0 · Shell** | `guide.html`, tokens, rail, router, `render.ts`, empty chapters | 17 routes resolve, theme sync works, reduced-motion respected |
| **P1 · Content** | all 17 chapters, 131 entries, lines + More, no figures | coverage gate passes for text (241/241 marked, 0 orphans) |
| **P2 · Figures** | manifest, capture script, 99 shots, drift check | every entry with a figure has both widths; `--check` is clean |
| **P3 · Motion** | the 8 transitions, AnatomyMap, ThemeStrip, ink hero, ⌘K | 60 fps on a mid-range laptop; reduced-motion pass |
| **P4 · Gate & ship** | coverage + probe wired into lint/CI, a11y + perf pass, deploy | `npm run lint` fails if a control is undocumented; live on `/guide` |

Each phase is independently shippable. P1 alone is already a useful handbook.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Screenshots drift from the UI | figures are generated, never hand-cropped; `--check` in CI re-shoots and compares |
| 25 themes × 99 figures explodes | all figures pinned to one neutral theme; chapter 14 shows six deliberately |
| Text drifts from control labels | coverage gate compares entry title to the control's label |
| The handbook becomes a second product to maintain | one content file, generated nav/search/figures, no CMS |
| Personal notebook names in shots | seeded notebook, `#title` masked, tours flagged off |
| Mobile readers get a desktop-only layout | rail → sheet under 720 px; figures full-bleed; entry text first |
| Motion feels gimmicky | 8 named transitions, all ≤ 320 ms, no bounce, all disabled under reduced-motion |

---

## 13. Decisions I need from you

Defaults are what I would pick; say "go" and I start at P0 with these.

1. **Where it lives** — `slate.app/guide` as a second page of the app
   *(default)*, or a separate site?
2. **Chapters** — the 17 above *(default)*, or fold 15/16 (study sets,
   whiteboard) into a single "Other document types"?
3. **Figures** — one neutral theme for all *(default)*, or shot in whatever theme
   is on screen at the time?
4. **Language** — English only *(default)*, or English + one more from day one
   (the content model already supports it; it doubles P1)?
