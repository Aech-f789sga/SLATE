/**
 * Sticker library.
 *
 * Two kinds of sticker live here:
 *
 *   • built-in  — 309 SVG icons bundled under /stickers (OpenMoji, Phosphor,
 *                 Material Symbols) plus a sheet of emoji rendered with the
 *                 system font. These work with no network at all.
 *   • online    — GIPHY's sticker library, searched live. GIPHY requires an API
 *                 key, so this tab is inert until one is pasted in; the key is
 *                 kept in localStorage on this device only.
 *
 * Either way the sticker becomes a normal `t:'img'` page object, so it moves,
 * scales, exports and syncs exactly like any inserted picture — no new storage
 * format, nothing to teach the engine.
 *
 * Everything is rasterised to WebP at STICKER_PX before it is placed, because
 * notebooks live in localStorage (a ~5 MB budget) and are synced as documents.
 * A GIF therefore lands as its first frame; a 1 MB animation would eat a fifth
 * of the whole app's storage on its own.
 */

import { PACKS } from './stickerPacks';

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

/* ------------------------------------------------------------------ */
/* Built-in emoji sheet                                                */
/* ------------------------------------------------------------------ */

const EMOJI_GROUPS: { id: string; label: string; items: string[] }[] = [
  {
    id: 'stars',
    label: 'Stars',
    items: ['⭐', '🌟', '✨', '💫', '🔥', '💥', '⚡', '☄️', '🌈', '🎇', '🪐', '🌠'],
  },
  {
    id: 'study',
    label: 'Study',
    items: ['📌', '📎', '📖', '📚', '✏️', '🖊️', '📝', '📋', '🎯', '✅', '❌', '❓', '❗', '💡', '🔍', '📅', '⏰', '🧠'],
  },
  {
    id: 'office',
    label: 'Office',
    items: [
      '📌', '📎', '🖇️', '📁', '📂', '🗂️', '🗃️', '🗄️', '📇', '🗒️',
      '📋', '📄', '📑', '🔖', '🧾', '📊', '📈', '📉', '📆', '🗓️',
      '✂️', '📏', '📐', '🖊️', '🖋️', '✒️', '🧷', '🧰', '🔧', '🔨',
    ],
  },
  {
    id: 'school',
    label: 'School',
    items: [
      '🎓', '🏫', '📓', '📔', '📕', '📗', '📘', '📙', '📒', '📚',
      '🧮', '🔬', '🧪', '🧬', '🗺️', '🧭', '🌍', '🖍️', '🖌️', '📝',
      '✏️', '🎒', '📜', '⏳', '🔭', '🏷️',
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    items: ['🌿', '🌱', '🌸', '🌻', '🍀', '🌵', '🌊', '🏔️', '☀️', '🌙', '☁️', '❄️', '🍁', '🐝', '🦋', '🐢', '🐬', '🦉'],
  },
  {
    id: 'fun',
    label: 'Fun',
    items: ['😀', '😎', '🤩', '🥳', '😴', '🤔', '👍', '👏', '🎉', '🎁', '🏆', '🚀', '🎸', '🎨', '🧩', '🕹️', '🎬', '🛸'],
  },
  {
    id: 'marks',
    label: 'Marks',
    items: ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '🔁', '➰', '✔️', '✖️', '➕', '➖', '❤️', '💛', '💙', '💚', '💜', '🖤'],
  },
  {
    id: 'food',
    label: 'Food',
    items: ['☕', '🍕', '🍔', '🍎', '🍩', '🍰', '🍦', '🥑', '🌮', '🍇', '🍓', '🥐'],
  },
];

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type Item =
  | { kind: 'emoji'; ch: string; label: string }
  | { kind: 'svg'; url: string; label: string };

interface Section {
  label: string;
  items: Item[];
}

interface Source {
  id: string;
  label: string;
  sections: Section[];
  online?: boolean;
}

const SOURCES: Source[] = [
  {
    id: 'emoji',
    label: 'Emoji',
    sections: EMOJI_GROUPS.map((g) => ({
      label: g.label,
      items: g.items.map((ch) => ({ kind: 'emoji', ch, label: ch } as Item)),
    })),
  },
  ...PACKS.map((p) => ({
    id: p.id,
    label: p.label,
    sections: p.sections.map((s) => ({
      label: s.label,
      items: s.items.map((i) => ({ kind: 'svg', url: `/stickers/${p.id}/${i.file}`, label: i.label } as Item)),
    })),
  })),
  { id: 'online', label: 'Online', sections: [], online: true },
];

const CREDIT: Record<string, string> = {
  emoji: 'Your device’s own emoji font — no download, no licence.',
  openmoji: 'OpenMoji — CC BY-SA 4.0 — openmoji.org',
  phosphor: 'Phosphor Icons — MIT — phosphoricons.com',
  material: 'Material Symbols — Apache 2.0 — fonts.google.com/icons',
  online: 'Powered by GIPHY. Stickers are added as a still frame.',
};

const cache = new Map<string, string>();

/**
 * Stickers are ordinary page images, so their sharpness is decided by the size
 * we rasterise them at: the engine scales the bitmap, it does not re-render it.
 * 640 px gives roughly 3x headroom over the default drop size. WebP keeps that
 * affordable — ~20 KB instead of ~290 KB as PNG — which matters because
 * stickers live inside the notebook document.
 */
const STICKER_PX = 640;

/** Render an emoji to a transparent bitmap so it behaves like any other image. */
function emojiPng(ch: string, size = STICKER_PX): string {
  const key = ch + '|' + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return '';
  g.clearRect(0, 0, size, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.round(size * 0.82)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",system-ui,sans-serif`;
  g.fillText(ch, size / 2, size / 2 + size * 0.04);

  let url = c.toDataURL('image/webp', 0.92);
  if (url.startsWith('data:image/png') && size > 384) {
    // no WebP encoder in this browser — drop to a size whose PNG stays small
    return emojiPng(ch, 384);
  }
  cache.set(key, url);
  return url;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/** Read an SVG's aspect ratio without trusting width/height attributes. */
function svgAspect(svg: string): number {
  const vb = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svg);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p[2] > 0 && p[3] > 0) return p[2] / p[3];
  }
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(svg);
  if (w && h && Number(h[1]) > 0) return Number(w[1]) / Number(h[1]);
  return 1;
}

/**
 * Fetch a remote or bundled image and bake it into a WebP data URL.
 *
 * It has to be a data URL: the engine draws page images with a plain `new
 * Image()` and never sets `crossOrigin`, so a remote src would taint the canvas
 * and break thumbnail and PDF export. Fetching the bytes ourselves sidesteps
 * that entirely — a blob URL is same-origin.
 */
async function rasterise(url: string, max = STICKER_PX): Promise<{ src: string; ar: number }> {
  const key = 'u|' + url + '|' + max;
  const hit = cache.get(key);
  if (hit) {
    const [src, ar] = hit.split('#');
    return { src, ar: Number(ar) || 1 };
  }

  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`sticker ${res.status}`);
  const blob = await res.blob();
  const isSvg = /svg/i.test(blob.type) || /\.svg(\?|$)/i.test(url);

  let obj: string;
  let upscale = 1;
  if (isSvg) {
    // give the SVG an explicit box so the bitmap is drawn at full size rather
    // than the 300x150 default a viewBox-only document would get
    let txt = await blob.text();
    const ar = svgAspect(txt);
    const w = ar >= 1 ? 1000 : Math.round(1000 * ar);
    const h = ar >= 1 ? Math.round(1000 / ar) : 1000;
    txt = txt.replace(/<svg\b[^>]*>/, (tag) =>
      tag
        .replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '')
        .replace('<svg', `<svg width="${w}" height="${h}"`),
    );
    obj = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
    upscale = 2;
  } else {
    obj = URL.createObjectURL(blob);
  }

  try {
    const img = await loadImage(obj);
    const nw = img.naturalWidth || 300;
    const nh = img.naturalHeight || 300;
    const s = Math.min((max * upscale) / Math.max(nw, nh), upscale);
    const cw = Math.max(1, Math.round(nw * s));
    const ch = Math.max(1, Math.round(nh * s));
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d');
    if (!g) throw new Error('no canvas');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cw, ch);
    let src = c.toDataURL('image/webp', 0.9);
    if (src.startsWith('data:image/png') && cw > 384) {
      // no WebP encoder here — halve it so the PNG stays affordable
      const c2 = document.createElement('canvas');
      c2.width = Math.round(cw / 2);
      c2.height = Math.round(ch / 2);
      c2.getContext('2d')?.drawImage(c, 0, 0, c2.width, c2.height);
      src = c2.toDataURL('image/png');
    }
    const ar = cw / ch;
    cache.set(key, `${src}#${ar}`);
    return { src, ar };
  } finally {
    URL.revokeObjectURL(obj);
  }
}

/* ------------------------------------------------------------------ */
/* GIPHY                                                               */
/* ------------------------------------------------------------------ */

const GKEY = 'inkpad-giphy-key';

interface Gif {
  id: string;
  label: string;
  thumb: string;
  full: string;
}

const giphyKey = () => (localStorage.getItem(GKEY) || '').trim();

async function giphySearch(q: string): Promise<{ items?: Gif[]; error?: string }> {
  const key = giphyKey();
  if (!key) return { error: 'nokey' };
  if (!q.trim()) return { items: [] };
  const url =
    'https://api.giphy.com/v1/stickers/search?api_key=' +
    encodeURIComponent(key) +
    '&q=' +
    encodeURIComponent(q.trim()) +
    '&limit=24&rating=pg-13&lang=en';
  try {
    const r = await fetch(url);
    const j = await r.json().catch(() => null);
    if (!j || j.meta?.status !== 200) {
      const msg = String(j?.meta?.msg || r.status);
      return { error: /invalid|forbidden|401/i.test(msg) ? 'badkey' : msg };
    }
    const items: Gif[] = (j.data || []).map((g: any) => ({
      id: g.id,
      label: g.title || q,
      thumb: g.images?.fixed_width?.url || g.images?.original?.url || '',
      full: g.images?.original?.url || g.images?.fixed_width?.url || '',
    }));
    return { items: items.filter((i) => i.thumb && i.full) };
  } catch {
    return { error: 'offline' };
  }
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

let activeSrc = SOURCES[0].id;
let query = '';
let gifResults: Gif[] = [];
let gifError = '';
let gifQuery = '';

function panel(): HTMLElement {
  let md = document.getElementById('gn-stk');
  if (md) return md;

  md = el('div', '');
  md.id = 'gn-stk';
  md.innerHTML = `
    <div class="gn-stk-box">
      <div class="gn-stk-head">
        <b>Stickers</b>
        <button class="gn-stk-x" type="button" aria-label="Close">✕</button>
      </div>
      <div class="gn-stk-src" role="tablist"></div>
      <div class="gn-stk-srch">
        <input id="gn-stk-q" type="search" autocomplete="off" spellcheck="false" placeholder="Search stickers…" />
        <button id="gn-stk-go" type="button">Search</button>
      </div>
      <div class="gn-stk-body"></div>
      <div class="gn-stk-foot"></div>
    </div>`;
  document.body.append(md);

  const close = () => md!.classList.remove('on');
  (md.querySelector('.gn-stk-x') as HTMLElement).onclick = close;
  md.addEventListener('pointerdown', (e) => {
    if (e.target === md) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  const q = md.querySelector('#gn-stk-q') as HTMLInputElement;
  q.addEventListener('input', () => {
    query = q.value;
    if (activeSrc === 'online') return; // online needs an explicit search
    renderBody(md!);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && activeSrc === 'online') runSearch(md!);
  });
  (md.querySelector('#gn-stk-go') as HTMLElement).onclick = () => {
    if (activeSrc === 'online') runSearch(md!);
    else renderBody(md!);
  };

  return md;
}

function render(md: HTMLElement) {
  const srcBox = md.querySelector('.gn-stk-src') as HTMLElement;
  srcBox.innerHTML = '';
  SOURCES.forEach((s) => {
    const b = el('button', '', s.label) as HTMLButtonElement;
    b.type = 'button';
    if (s.id === activeSrc) b.classList.add('on');
    b.onclick = () => {
      activeSrc = s.id;
      query = '';
      const q = md.querySelector('#gn-stk-q') as HTMLInputElement;
      if (q) q.value = activeSrc === 'online' ? gifQuery : '';
      render(md);
    };
    srcBox.append(b);
  });

  const srch = md.querySelector('.gn-stk-srch') as HTMLElement;
  srch.style.display = activeSrc === 'online' && !giphyKey() ? 'none' : 'flex';
  // the built-in packs filter as you type, so the button only earns its place
  // on the online tab
  const go = md.querySelector('#gn-stk-go') as HTMLElement;
  if (go) go.style.display = activeSrc === 'online' ? '' : 'none';
  const q = md.querySelector('#gn-stk-q') as HTMLInputElement;
  if (q) q.placeholder = activeSrc === 'online' ? 'Search GIPHY stickers…' : 'Search stickers…';

  renderBody(md);
}

function renderBody(md: HTMLElement) {
  const body = md.querySelector('.gn-stk-body') as HTMLElement;
  const foot = md.querySelector('.gn-stk-foot') as HTMLElement;
  body.innerHTML = '';
  foot.textContent = CREDIT[activeSrc] || '';

  const src = SOURCES.find((s) => s.id === activeSrc) || SOURCES[0];
  if (src.online) {
    renderOnline(body, foot, md);
    return;
  }

  const needle = query.trim().toLowerCase();
  let shown = 0;

  src.sections.forEach((sec) => {
    const items = needle ? sec.items.filter((i) => i.label.toLowerCase().includes(needle)) : sec.items;
    if (!items.length) return;

    const h = el('div', '', sec.label);
    h.className = 'gn-stk-sec';
    body.append(h);

    const grid = el('div', '');
    grid.className = 'gn-stk-grid';
    items.forEach((it) => grid.append(tile(it)));
    body.append(grid);
    shown += items.length;
  });

  if (!shown) {
    const none = el('div', '', needle ? `No stickers match “${query}”.` : 'Nothing here.');
    none.className = 'gn-stk-empty';
    body.append(none);
  }
}

function tile(it: Item): HTMLElement {
  const b = el('button', '') as HTMLButtonElement;
  b.type = 'button';
  b.title = it.label;
  if (it.kind === 'emoji') {
    b.textContent = it.ch;
  } else {
    const img = document.createElement('img');
    img.src = it.url;
    img.alt = it.label;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    b.append(img);
  }
  b.onclick = async () => {
    if (b.dataset.busy) return;
    b.dataset.busy = '1';
    b.classList.add('busy');
    try {
      await place(it);
    } catch {
      toast('Could not add that sticker');
    } finally {
      delete b.dataset.busy;
      b.classList.remove('busy');
    }
  };
  return b;
}

function renderOnline(body: HTMLElement, foot: HTMLElement, md: HTMLElement) {
  const key = giphyKey();

  if (!key) {
    const box = el('div', '');
    box.className = 'gn-stk-key';
    box.innerHTML = `
      <b>Online search needs a free GIPHY key</b>
      <p>GIPHY's sticker API will not answer without one. Getting a key takes a
      minute, costs nothing, and it is stored on this device only.</p>
      <div class="gn-stk-keyrow">
        <input id="gn-stk-keyin" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your GIPHY API key" />
        <button id="gn-stk-keysave" type="button">Save</button>
      </div>
      <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer noopener">Create a key at developers.giphy.com ↗</a>`;
    body.append(box);

    const input = box.querySelector('#gn-stk-keyin') as HTMLInputElement;
    const save = box.querySelector('#gn-stk-keysave') as HTMLElement;
    save.onclick = () => {
      const v = input.value.trim();
      if (!v) return;
      localStorage.setItem(GKEY, v);
      render(md);
      toast('Key saved');
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save.click();
    });

    foot.textContent = 'The built-in packs above need no key and work offline.';
    return;
  }

  if (gifError === 'nokey') gifError = '';
  if (gifError) {
    const box = el('div', '');
    box.className = 'gn-stk-key';
    const why =
      gifError === 'badkey'
        ? 'GIPHY rejected that key. Check it in your GIPHY dashboard, or paste a different one.'
        : gifError === 'offline'
          ? 'Could not reach GIPHY. Check your connection and try again.'
          : `GIPHY said: ${gifError}`;
    box.innerHTML = `<b>Search unavailable</b><p>${why}</p>`;
    const row = el('div', '');
    row.className = 'gn-stk-keyrow';
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Replace your GIPHY API key';
    const save = el('button', '', 'Save') as HTMLButtonElement;
    save.type = 'button';
    save.onclick = () => {
      const v = input.value.trim();
      if (!v) return;
      localStorage.setItem(GKEY, v);
      gifError = '';
      runSearch(md);
    };
    row.append(input, save);
    box.append(row);
    body.append(box);
    foot.textContent = CREDIT.online;
    return;
  }

  if (!gifResults.length) {
    const hint = el('div', '', gifQuery ? `No stickers found for “${gifQuery}”.` : 'Search GIPHY for memes, anime, reaction stickers and GIFs.');
    hint.className = 'gn-stk-empty';
    body.append(hint);
    foot.textContent = CREDIT.online;
    return;
  }

  const grid = el('div', '');
  grid.className = 'gn-stk-grid gn-stk-gifs';
  gifResults.forEach((g) => {
    const b = el('button', '') as HTMLButtonElement;
    b.type = 'button';
    b.title = g.label;
    const img = document.createElement('img');
    img.src = g.thumb;
    img.alt = g.label;
    img.loading = 'lazy';
    img.draggable = false;
    b.append(img);
    b.onclick = async () => {
      if (b.dataset.busy) return;
      b.dataset.busy = '1';
      b.classList.add('busy');
      try {
        await place({ kind: 'svg', url: g.full, label: g.label });
      } catch {
        toast('Could not add that sticker');
      } finally {
        delete b.dataset.busy;
        b.classList.remove('busy');
      }
    };
    grid.append(b);
  });
  body.append(grid);
  foot.textContent = CREDIT.online;
}

async function runSearch(md: HTMLElement) {
  const q = md.querySelector('#gn-stk-q') as HTMLInputElement;
  gifQuery = q ? q.value : '';
  if (!gifQuery.trim()) return;
  gifError = '';
  gifResults = [];
  const body = md.querySelector('.gn-stk-body') as HTMLElement;
  const foot = md.querySelector('.gn-stk-foot') as HTMLElement;
  body.innerHTML = '<div class="gn-stk-empty">Searching…</div>';
  foot.textContent = CREDIT.online;

  const out = await giphySearch(gifQuery);
  if (out.error) gifError = out.error;
  gifResults = out.items || [];
  renderBody(md);
}

/* ------------------------------------------------------------------ */
/* Placing                                                             */
/* ------------------------------------------------------------------ */

/** Push the sticker onto the current page as an image object. */
async function place(it: Item) {
  const baked = it.kind === 'emoji' ? { src: emojiPng(it.ch), ar: 1 } : await rasterise(it.url);
  if (!baked.src) return;

  const size = ev<number>('typeof W === "number" ? W : 800') || 800;
  const base = Math.round(Math.min(240, size * 0.3));
  const w = baked.ar >= 1 ? base : Math.round(base * baked.ar);
  const h = baked.ar >= 1 ? Math.round(base / baked.ar) : base;
  (window as any).__gnSticker = { src: baked.src, w, h };

  ev(`(function(){
    if (typeof pg !== 'function' || !nb) return;
    var s = window.__gnSticker;
    var o = { t:'img', src:s.src, x:(W-s.w)/2, y:H*0.34, w:s.w, h:s.h };
    try { snap(); } catch(e) {}
    pg().strokes.push(o);
    sel = [o];
    tool = 'sel';
    try { syncTools(); } catch(e) {}
    draw(); save(); thumbs();
  })()`);

  document.getElementById('gn-stk')?.classList.remove('on');
  toast(it.label);
}

function toast(text: string) {
  const t = el('div', '', `${text} added`);
  t.className = 'gn-toast';
  document.body.append(t);
  window.setTimeout(() => t.classList.add('out'), 900);
  window.setTimeout(() => t.remove(), 1500);
}

/* ------------------------------------------------------------------ */
/* Toolbar button                                                      */
/* ------------------------------------------------------------------ */

function togglePanel() {
  const md = panel();
  if (md.classList.contains('on')) {
    md.classList.remove('on');
    return;
  }
  render(md);
  md.classList.add('on');
}

function ensureButton() {
  const bar2 = document.getElementById('bar2');
  if (!bar2 || document.getElementById('gn-stk-btn')) return;
  const b = el('button', '') as HTMLButtonElement;
  b.id = 'gn-stk-btn';
  b.type = 'button';
  b.title = 'Stickers — drop decorations onto the page';
  b.textContent = '🧩 Stickers';
  b.onclick = () => togglePanel();
  const snap = document.getElementById('snap-btn');
  if (snap && snap.parentElement === bar2) bar2.insertBefore(b, snap);
  else bar2.append(b);
}

const CSS = `
#gn-stk{
  position:fixed;inset:0;background:rgba(16,26,42,.42);backdrop-filter:blur(5px);
  display:none;align-items:center;justify-content:center;z-index:120;
}
#gn-stk.on{display:flex}
.gn-stk-box{
  width:min(94vw,620px);height:min(84vh,760px);background:#fff;border-radius:20px;
  box-shadow:0 26px 70px rgba(10,20,36,.34);display:flex;flex-direction:column;overflow:hidden;
}
.gn-stk-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 10px}
.gn-stk-head b{font-size:18px;font-weight:800;letter-spacing:-.02em;color:#141c26}
.gn-stk-x{border:0;background:transparent;font-size:16px;color:#8b95a3;cursor:pointer;padding:2px 6px;border-radius:8px}
.gn-stk-src{display:flex;gap:5px;flex-wrap:wrap;padding:0 20px 10px}
.gn-stk-src button{
  border:1px solid #e6e2dc;background:#fff;border-radius:999px;padding:6px 13px;
  font-size:12px;font-weight:600;color:#4a5568;cursor:pointer;
}
.gn-stk-src button.on{background:#e8f0ff;border-color:#2f6df6;color:#1f4fbf}
.gn-stk-srch{display:flex;gap:7px;padding:0 20px 12px}
.gn-stk-srch input{
  flex:1;min-width:0;border:1px solid #e6e2dc;border-radius:10px;padding:8px 11px;
  font-size:13px;color:#141c26;background:#fbfaf8;outline:none;
}
.gn-stk-srch input:focus{border-color:#2f6df6;background:#fff;box-shadow:0 0 0 3px rgba(47,109,246,.12)}
.gn-stk-srch button{
  border:1px solid #2f6df6;background:#2f6df6;color:#fff;border-radius:10px;
  padding:8px 15px;font-size:12.5px;font-weight:700;cursor:pointer;
}
.gn-stk-body{flex:1;overflow:auto;padding:0 20px 14px}
.gn-stk-sec{
  font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
  color:#9aa4b2;margin:10px 0 6px;
}
.gn-stk-sec:first-child{margin-top:0}
.gn-stk-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:7px;
}
.gn-stk-gifs{grid-template-columns:repeat(auto-fill,minmax(84px,1fr))}
.gn-stk-grid button{
  aspect-ratio:1;border:1px solid #eee9e2;background:#fafafa;border-radius:12px;
  font-size:24px;line-height:1;cursor:pointer;display:grid;place-items:center;
  overflow:hidden;padding:5px;position:relative;
  transition:transform .12s ease,background .12s ease,border-color .12s ease;
}
.gn-stk-grid button:hover{transform:translateY(-2px);background:#fff;border-color:#cfd6e0}
.gn-stk-grid button.busy{opacity:.45;pointer-events:none}
.gn-stk-grid button.busy::after{
  content:"";position:absolute;inset:0;margin:auto;width:16px;height:16px;
  border:2px solid rgba(47,109,246,.25);border-top-color:#2f6df6;border-radius:50%;
  animation:gn-spin .7s linear infinite;
}
@keyframes gn-spin{to{transform:rotate(360deg)}}
.gn-stk-grid img{width:100%;height:100%;object-fit:contain;display:block;pointer-events:none}
.gn-stk-empty{
  padding:26px 6px;text-align:center;font-size:13px;color:#8b95a3;line-height:1.5;
}
.gn-stk-key{
  border:1px solid #e6e2dc;border-radius:14px;padding:16px 16px 14px;background:#fbfaf8;
}
.gn-stk-key b{display:block;font-size:14px;color:#141c26;margin-bottom:6px}
.gn-stk-key p{margin:0 0 12px;font-size:12.5px;line-height:1.55;color:#6b7684}
.gn-stk-keyrow{display:flex;gap:7px;margin-bottom:10px}
.gn-stk-keyrow input{
  flex:1;min-width:0;border:1px solid #e6e2dc;border-radius:10px;padding:8px 11px;
  font-size:13px;background:#fff;outline:none;color:#141c26;
}
.gn-stk-keyrow input:focus{border-color:#2f6df6;box-shadow:0 0 0 3px rgba(47,109,246,.12)}
.gn-stk-keyrow button{
  border:1px solid #2f6df6;background:#2f6df6;color:#fff;border-radius:10px;
  padding:8px 15px;font-size:12.5px;font-weight:700;cursor:pointer;
}
.gn-stk-key a{font-size:12px;color:#2f6df6;text-decoration:none;font-weight:600}
.gn-stk-key a:hover{text-decoration:underline}
.gn-stk-foot{padding:9px 20px 14px;font-size:11px;color:#8b95a3;border-top:1px solid #f0ede8}
.gn-toast{
  position:fixed;left:50%;bottom:74px;transform:translateX(-50%);
  background:rgba(22,34,54,.94);color:#fff;font-size:12.5px;font-weight:600;
  padding:9px 16px;border-radius:999px;z-index:130;pointer-events:none;
  box-shadow:0 8px 22px rgba(8,20,38,.3);transition:opacity .4s ease,transform .4s ease;
}
.gn-toast.out{opacity:0;transform:translateX(-50%) translateY(6px)}
#bar2 #gn-stk-btn{font-size:12.5px!important;font-weight:600}
`;

function boot() {
  const style = document.createElement('style');
  style.id = 'gn-stk-style';
  style.textContent = CSS;
  document.head.append(style);

  ensureButton();
  window.setInterval(ensureButton, 900);

  (window as any).__inkpad_stickers = {
    open: () => togglePanel(),
    add: (ch: string) => place({ kind: 'emoji', ch, label: ch }),
    addUrl: (url: string) => place({ kind: 'svg', url, label: 'sticker' }),
    png: (ch: string) => emojiPng(ch),
    packs: () => SOURCES.map((s) => ({ id: s.id, label: s.label, count: s.sections.reduce((a, x) => a + x.items.length, 0) })),
    clearKey: () => localStorage.removeItem(GKEY),
    px: STICKER_PX,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
