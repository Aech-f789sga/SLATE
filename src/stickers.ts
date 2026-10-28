/**
 * Sticker library.
 *
 * GoodNotes lets you drop decorative elements onto a page from a picker. We
 * rasterise an emoji glyph to a transparent PNG on first use and push it into
 * the page as a normal image object, so stickers move, scale, export and sync
 * exactly like any inserted picture — no new storage format.
 */

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

const GROUPS: { id: string; label: string; items: string[] }[] = [
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

const cache = new Map<string, string>();

/**
 * Stickers are ordinary page images, so their sharpness is decided by the size
 * we rasterise them at: the engine scales the bitmap, it does not re-render it.
 * 112 px looked fine in the picker and fell apart the moment you resized one.
 *
 * 640 px gives roughly 3x headroom over the default drop size. WebP keeps that
 * affordable — the same glyph is ~19 KB instead of ~290 KB as PNG, which
 * matters because stickers live inside the notebook document that syncs.
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

let activeGroup = GROUPS[0].id;

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
      <div class="gn-stk-tabs" role="tablist"></div>
      <div class="gn-stk-grid"></div>
      <div class="gn-stk-foot">Tap a sticker to drop it on the page — then drag or resize it like any picture.</div>
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

  return md;
}

function render(md: HTMLElement) {
  const tabs = md.querySelector('.gn-stk-tabs') as HTMLElement;
  const grid = md.querySelector('.gn-stk-grid') as HTMLElement;

  tabs.innerHTML = '';
  GROUPS.forEach((g) => {
    const b = el('button', '', g.label) as HTMLButtonElement;
    b.type = 'button';
    if (g.id === activeGroup) b.classList.add('on');
    b.onclick = () => {
      activeGroup = g.id;
      render(md);
    };
    tabs.append(b);
  });

  grid.innerHTML = '';
  const group = GROUPS.find((g) => g.id === activeGroup) || GROUPS[0];
  group.items.forEach((ch) => {
    const b = el('button', '', ch) as HTMLButtonElement;
    b.type = 'button';
    b.title = 'Add sticker';
    b.onclick = () => place(ch);
    grid.append(b);
  });
}

/** Push the sticker onto the current page as an image object. */
function place(ch: string) {
  const src = emojiPng(ch);
  if (!src) return;

  const size = ev<number>('typeof W === "number" ? W : 800') || 800;
  const w = Math.round(Math.min(240, size * 0.3));
  (window as any).__gnSticker = { src, w, h: w };

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
  toast(ch);
}

function toast(ch: string) {
  const t = el('div', '', `${ch} added`);
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
  width:min(94vw,520px);max-height:80vh;background:#fff;border-radius:20px;
  box-shadow:0 26px 70px rgba(10,20,36,.34);display:flex;flex-direction:column;overflow:hidden;
}
.gn-stk-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 10px}
.gn-stk-head b{font-size:18px;font-weight:800;letter-spacing:-.02em;color:#141c26}
.gn-stk-x{border:0;background:transparent;font-size:16px;color:#8b95a3;cursor:pointer;padding:2px 6px;border-radius:8px}
.gn-stk-tabs{display:flex;gap:5px;flex-wrap:wrap;padding:0 20px 12px}
.gn-stk-tabs button{
  border:1px solid #e6e2dc;background:#fff;border-radius:999px;padding:6px 13px;
  font-size:12px;font-weight:600;color:#4a5568;cursor:pointer;
}
.gn-stk-tabs button.on{background:#e8f0ff;border-color:#2f6df6;color:#1f4fbf}
.gn-stk-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:8px;
  padding:0 20px 14px;overflow:auto;flex:1;
}
.gn-stk-grid button{
  aspect-ratio:1;border:1px solid #eee9e2;background:#fafafa;border-radius:12px;
  font-size:26px;line-height:1;cursor:pointer;display:grid;place-items:center;
  transition:transform .12s ease,background .12s ease,border-color .12s ease;
}
.gn-stk-grid button:hover{transform:translateY(-2px);background:#fff;border-color:#cfd6e0}
.gn-stk-foot{padding:10px 20px 16px;font-size:11.5px;color:#8b95a3;border-top:1px solid #f0ede8}
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
    add: (ch: string) => place(ch),
    png: (ch: string) => emojiPng(ch),
    px: STICKER_PX,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
