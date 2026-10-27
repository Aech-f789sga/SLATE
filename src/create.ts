/**
 * Notebook studio — the GoodNotes-style "new notebook" flow.
 *
 * GoodNotes decides paper *before* you start writing: cover design, size and
 * orientation, then the paper (writing pages or planner pages). Inkpad used to
 * bury all of that in an editor drawer, so this module puts it back in front of
 * the create button:
 *
 *   • cover designs — pattern overlays on top of the engine's cover colour
 *   • size + orientation — maps onto the engine's per-page pw/ph
 *   • paper — writing (lined / grid / dotted / blank / Cornell) and planner
 *     (weekly / monthly / daily / to-do / music) plus the ready-made styles
 *
 * The engine's own `#md` sheet is kept and its inputs are reused, so `#ok`
 * still creates the notebook. We only record the extra choices and apply them
 * to the first page the moment the notebook opens.
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

/* ------------------------------------------------------------------ */
/* Paper patterns                                                      */
/* ------------------------------------------------------------------ */

interface Paper {
  k: string;
  bg?: string;
  ln?: string;
  gap?: number;
  lw?: number;
  mg?: string;
  mx?: number;
}

/**
 * Every paper the app can draw. The engine's own `bgPP` handles the classic
 * kinds; we take over the whole set so the preview in the sheet and the page
 * on screen are drawn by exactly the same code.
 */
const PAINT: Record<string, (c: CanvasRenderingContext2D, p: Paper, W: number, H: number) => void> = {
  blank() {
    /* the fill already happened */
  },

  lined(c, p, W, H) {
    const g = p.gap || 32;
    c.strokeStyle = c.fillStyle = p.ln || 'rgba(120,140,170,.4)';
    c.lineWidth = p.lw || 1;
    for (let y = Math.max(g * 2, 60); y < H; y += g) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
  },

  grid(c, p, W, H) {
    gridLike(c, p, W, H, false);
  },

  graph(c, p, W, H) {
    gridLike(c, p, W, H, true);
  },

  dot(c, p, W, H) {
    const g = p.gap || 32;
    const lw = p.lw || 1;
    c.fillStyle = p.ln || 'rgba(120,140,170,.4)';
    for (let x = g; x < W; x += g)
      for (let y = g; y < H; y += g) {
        c.beginPath();
        c.arc(x, y, 1.5 * lw, 0, 7);
        c.fill();
      }
  },

  iso(c, p, W, H) {
    const g = p.gap || 28;
    const h = g * 0.866;
    const lw = p.lw || 1;
    c.fillStyle = p.ln || 'rgba(120,140,170,.6)';
    for (let r = 0, y = g; y < H; y += h, r++)
      for (let x = g + (r % 2 ? g / 2 : 0); x < W; x += g) {
        c.beginPath();
        c.arc(x, y, 1.4 * lw, 0, 7);
        c.fill();
      }
  },

  music(c, p, W, H) {
    const g = p.gap || 32;
    const lw = p.lw || 1;
    c.strokeStyle = c.fillStyle = p.ln || 'rgba(120,140,170,.5)';
    c.lineWidth = lw;
    for (let y = 90; y < H - 60; y += g * 9)
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(40, y + i * g);
        c.lineTo(W - 40, y + i * g);
        c.stroke();
      }
  },

  /* ---- writing: Cornell notes ---------------------------------- */
  cornell(c, p, W, H) {
    const ink = p.ln || 'rgba(120,140,170,.45)';
    const g = p.gap || 32;
    const lw = p.lw || 1;
    c.strokeStyle = ink;
    c.lineWidth = lw;
    const cueX = Math.round(W * 0.3);
    const sumY = Math.round(H * 0.78);
    // cue column + summary band
    line(c, cueX, 0, cueX, H);
    line(c, 0, sumY, W, sumY);
    // ruled note area
    c.lineWidth = lw * 0.8;
    for (let y = 96; y < sumY - 8; y += g) line(c, cueX + 12, y, W - 16, y);
    // cue column headings
    c.save();
    c.fillStyle = ink;
    c.font = `600 ${Math.round(H * 0.016)}px system-ui,sans-serif`;
    c.fillText('CUE', 16, 44);
    c.fillText('NOTES', cueX + 16, 44);
    c.fillText('SUMMARY', 16, sumY + 26);
    c.restore();
  },

  /* ---- planner: week ------------------------------------------- */
  week(c, p, W, H) {
    const ink = p.ln || 'rgba(90,110,145,.5)';
    const g = p.gap || 32;
    const lw = p.lw || 1;
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const top = Math.round(H * 0.12);
    const left = Math.round(W * 0.055);
    const right = W - left;
    const colW = (right - left) / 7;

    c.save();
    c.fillStyle = ink;
    c.font = `700 ${Math.round(H * 0.026)}px system-ui,sans-serif`;
    c.fillText('WEEK', left, Math.round(H * 0.075));
    c.restore();

    c.strokeStyle = ink;
    c.lineWidth = lw;
    line(c, left, top, right, top);
    for (let i = 0; i <= 7; i++) {
      const x = left + colW * i;
      line(c, x, top, x, H - left);
    }
    // day labels
    c.save();
    c.fillStyle = ink;
    c.font = `700 ${Math.round(H * 0.016)}px system-ui,sans-serif`;
    days.forEach((d, i) => c.fillText(d, left + colW * i + 8, top + 24));
    c.restore();
    // ruled lines inside each column
    c.lineWidth = lw * 0.7;
    for (let y = top + 44; y < H - left; y += g) line(c, left, y, right, y);
  },

  /* ---- planner: month ------------------------------------------ */
  month(c, p, W, H) {
    const ink = p.ln || 'rgba(90,110,145,.5)';
    const g = p.gap || 32;
    const lw = p.lw || 1;
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const left = Math.round(W * 0.055);
    const right = W - left;
    const top = Math.round(H * 0.14);
    const bottom = H - Math.round(H * 0.08);
    const colW = (right - left) / 7;
    const rowH = (bottom - top) / 5;

    c.save();
    c.fillStyle = ink;
    c.font = `700 ${Math.round(H * 0.03)}px system-ui,sans-serif`;
    c.fillText('MONTH', left, Math.round(H * 0.08));
    c.font = `600 ${Math.round(H * 0.016)}px system-ui,sans-serif`;
    days.forEach((d, i) => c.fillText(d, left + colW * i + colW / 2 - 5, top - 10));
    c.restore();

    c.strokeStyle = ink;
    c.lineWidth = lw;
    for (let i = 0; i <= 7; i++) line(c, left + colW * i, top, left + colW * i, bottom);
    for (let r = 0; r <= 5; r++) line(c, left, top + rowH * r, right, top + rowH * r);
    // faint ruled lines inside cells
    c.lineWidth = lw * 0.6;
    for (let r = 0; r < 5; r++)
      for (let y = top + rowH * r + g; y < top + rowH * (r + 1) - 4; y += g) line(c, left, y, right, y);
  },

  /* ---- planner: daily ------------------------------------------ */
  daily(c, p, W, H) {
    const ink = p.ln || 'rgba(90,110,145,.5)';
    const g = p.gap || 32;
    const lw = p.lw || 1;
    const left = Math.round(W * 0.055);
    const right = W - left;
    const top = Math.round(H * 0.12);
    const hourX = left + Math.round(W * 0.1);

    c.save();
    c.fillStyle = ink;
    c.font = `700 ${Math.round(H * 0.026)}px system-ui,sans-serif`;
    c.fillText('DAY', left, Math.round(H * 0.075));
    c.restore();

    c.strokeStyle = ink;
    c.lineWidth = lw;
    line(c, hourX, top, hourX, H - left);
    c.font = `600 ${Math.round(H * 0.015)}px system-ui,sans-serif`;
    let hh = 7;
    for (let y = top; y < H - left; y += g * 2) {
      line(c, left, y, right, y);
      c.save();
      c.fillStyle = ink;
      const label = (hh % 12 === 0 ? 12 : hh % 12) + (hh < 12 ? 'am' : 'pm');
      c.fillText(label, left + 2, y + 4);
      c.restore();
      hh = hh === 22 ? 7 : hh + 1;
    }
  },

  /* ---- planner: to-do ------------------------------------------ */
  todo(c, p, W, H) {
    const ink = p.ln || 'rgba(90,110,145,.5)';
    const g = p.gap || 32;
    const lw = p.lw || 1;
    const left = Math.round(W * 0.055);
    const right = W - left;
    const top = Math.round(H * 0.12);
    const box = Math.round(g * 0.62);

    c.save();
    c.fillStyle = ink;
    c.font = `700 ${Math.round(H * 0.026)}px system-ui,sans-serif`;
    c.fillText('TO-DO', left, Math.round(H * 0.075));
    c.restore();

    c.strokeStyle = ink;
    c.lineWidth = lw;
    for (let y = top; y < H - left; y += g * 1.6) {
      c.strokeRect(left, y, box, box);
      line(c, left + box + 12, y + box, right, y + box);
    }
  },
};

function line(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

function gridLike(c: CanvasRenderingContext2D, p: Paper, W: number, H: number, heavy: boolean) {
  const g = p.gap || 32;
  const lw = p.lw || 1;
  c.strokeStyle = c.fillStyle = p.ln || 'rgba(120,140,170,.4)';
  for (let x = g; x < W; x += g) {
    c.lineWidth = heavy && (x / g) % 5 === 0 ? lw * 2 : lw;
    line(c, x, 0, x, H);
  }
  for (let y = g; y < H; y += g) {
    c.lineWidth = heavy && (y / g) % 5 === 0 ? lw * 2 : lw;
    line(c, 0, y, W, y);
  }
}

/** Paint a page background, margin rule included. */
function paintPaper(c: CanvasRenderingContext2D, p: Paper, W: number, H: number) {
  c.fillStyle = p.bg || '#ffffff';
  c.fillRect(0, 0, W, H);
  (PAINT[p.k] || PAINT.blank)(c, p, W, H);
  if (p.mg) {
    c.strokeStyle = p.mg;
    c.lineWidth = 1.5;
    line(c, p.mx || 90, 0, p.mx || 90, H);
  }
}

/**
 * Route the engine's page renderer through our painter so planner kinds work
 * on real pages, not just in the preview. Unknown kinds still fall through to
 * the engine's own implementation.
 */
function installPaperEngine() {
  (window as any).__gnPaper = {
    has: (k: string) => Object.prototype.hasOwnProperty.call(PAINT, k),
    paint: paintPaper,
  };
  ev(`(function(){
    if (window.__gnPaperHooked) return;
    window.__gnPaperHooked = true;
    var orig = bgPP;
    bgPP = function(c, p){
      if (p && window.__gnPaper && window.__gnPaper.has(p.k)) {
        window.__gnPaper.paint(c, p, W, H);
        return;
      }
      return orig.apply(this, arguments);
    };
  })()`);
}

/** Scale a paper's spacing so it reads correctly at preview size. */
function scaled(pp: Paper, k: number, minLw: number): Paper {
  return {
    ...pp,
    gap: Math.max(4, (pp.gap || 32) * k),
    lw: Math.max(minLw, (pp.lw || 1) * Math.max(k, 0.55)),
  };
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

const SIZES: { id: string; label: string; w: number; h: number }[] = [
  { id: 'a4', label: 'A4', w: 800, h: 1131 },
  { id: 'a5', label: 'A5', w: 566, h: 800 },
  { id: 'letter', label: 'Letter', w: 800, h: 1035 },
  { id: 'a3', label: 'A3', w: 1131, h: 1600 },
  { id: 'square', label: 'Square', w: 900, h: 900 },
  { id: 'wide', label: '16:9', w: 1280, h: 720 },
];

const WRITING: { id: string; label: string; tpl: string; pp?: Paper }[] = [
  { id: 'lined', label: 'Lined', tpl: 'lined', pp: { k: 'lined', bg: '#ffffff', ln: 'rgba(120,150,190,.55)', gap: 32, lw: 1 } },
  { id: 'grid', label: 'Grid', tpl: 'grid', pp: { k: 'grid', bg: '#ffffff', ln: 'rgba(120,150,190,.4)', gap: 28, lw: 1 } },
  { id: 'dot', label: 'Dotted', tpl: 'dot', pp: { k: 'dot', bg: '#ffffff', ln: 'rgba(120,150,190,.75)', gap: 30, lw: 1 } },
  { id: 'blank', label: 'Blank', tpl: 'blank' },
  { id: 'cornell', label: 'Cornell', tpl: 'lined', pp: { k: 'cornell', bg: '#ffffff', ln: 'rgba(120,150,190,.55)', gap: 30, lw: 1 } },
];

const PLANNER: { id: string; label: string; pp: Paper }[] = [
  { id: 'week', label: 'Weekly', pp: { k: 'week', bg: '#ffffff', ln: 'rgba(90,110,145,.55)', gap: 30, lw: 1 } },
  { id: 'month', label: 'Monthly', pp: { k: 'month', bg: '#ffffff', ln: 'rgba(90,110,145,.55)', gap: 30, lw: 1 } },
  { id: 'daily', label: 'Daily', pp: { k: 'daily', bg: '#ffffff', ln: 'rgba(90,110,145,.5)', gap: 28, lw: 1 } },
  { id: 'todo', label: 'To-do', pp: { k: 'todo', bg: '#ffffff', ln: 'rgba(90,110,145,.5)', gap: 34, lw: 1 } },
  { id: 'music', label: 'Music', pp: { k: 'music', bg: '#ffffff', ln: 'rgba(90,110,145,.5)', gap: 26, lw: 1 } },
];

const STYLES: { id: string; label: string; pp: Paper }[] = [
  { id: 'legal', label: 'Legal pad', pp: { bg: '#fff6a8', k: 'lined', ln: 'rgba(60,110,200,.45)', mg: 'rgba(220,60,60,.6)', mx: 100, gap: 32 } },
  { id: 'eng', label: 'Engineering', pp: { bg: '#f2faf1', k: 'graph', ln: 'rgba(60,150,90,.35)', gap: 16 } },
  { id: 'blue', label: 'Blueprint', pp: { bg: '#143d7a', k: 'grid', ln: 'rgba(255,255,255,.3)', gap: 32 } },
  { id: 'board', label: 'Blackboard', pp: { bg: '#22372c', k: 'grid', ln: 'rgba(255,255,255,.12)', gap: 40 } },
  { id: 'kraft', label: 'Kraft', pp: { bg: '#d9bd8f', k: 'dot', ln: 'rgba(90,60,20,.5)', gap: 32 } },
  { id: 'parch', label: 'Parchment', pp: { bg: '#f3e6c6', k: 'lined', ln: 'rgba(120,80,30,.3)', gap: 34 } },
  { id: 'iso', label: 'Isometric', pp: { bg: '#ffffff', k: 'iso', ln: 'rgba(120,140,170,.6)', gap: 28 } },
];

/** Cover designs are alpha overlays, so they tint with whatever colour is picked. */
const COVERS: { id: string; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'linen', label: 'Linen' },
  { id: 'dots', label: 'Dots' },
  { id: 'stripe', label: 'Stripe' },
  { id: 'grid', label: 'Grid' },
  { id: 'leather', label: 'Leather' },
  { id: 'marble', label: 'Marble' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'wave', label: 'Wave' },
];

/* ------------------------------------------------------------------ */
/* Sheet state                                                         */
/* ------------------------------------------------------------------ */

const state = {
  cover: 'plain',
  size: 'a4',
  ori: 'portrait' as 'portrait' | 'landscape',
  paper: 'lined',
  cat: 'writing' as 'writing' | 'planner' | 'styles',
};

function paperOf(): { tpl: string; pp?: Paper } {
  if (state.cat === 'planner') {
    const p = PLANNER.find((x) => x.id === state.paper) || PLANNER[0];
    return { tpl: 'blank', pp: p.pp };
  }
  if (state.cat === 'styles') {
    const p = STYLES.find((x) => x.id === state.paper) || STYLES[0];
    return { tpl: 'blank', pp: p.pp };
  }
  const p = WRITING.find((x) => x.id === state.paper) || WRITING[0];
  return { tpl: p.tpl, pp: p.pp };
}

function dims(): { w: number; h: number } {
  const s = SIZES.find((x) => x.id === state.size) || SIZES[0];
  return state.ori === 'landscape' ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

function paintPreview(cv: HTMLCanvasElement) {
  const { w, h } = dims();
  const maxH = 168;
  const maxW = 132;
  let pw = maxW;
  let ph = (pw * h) / w;
  if (ph > maxH) {
    ph = maxH;
    pw = (ph * w) / h;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(pw * dpr);
  cv.height = Math.round(ph * dpr);
  cv.style.width = Math.round(pw) + 'px';
  cv.style.height = Math.round(ph) + 'px';
  const g = cv.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, pw, ph);
  const { pp } = paperOf();
  if (pp) paintPaper(g, scaled(pp, ph / h, 0.45), pw, ph);
  else {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, pw, ph);
    g.strokeStyle = 'rgba(120,150,190,.5)';
    g.lineWidth = 0.6;
    const gap = Math.max(6, ph / 26);
    for (let y = gap * 2; y < ph; y += gap) line(g, 0, y, pw, y);
  }
  g.strokeStyle = 'rgba(16,32,64,.16)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, pw - 1, ph - 1);
}

/* ------------------------------------------------------------------ */
/* Sheet UI                                                            */
/* ------------------------------------------------------------------ */

let bound = false;

function buildSheet() {
  const box = document.querySelector('#md .box') as HTMLElement | null;
  if (!box || box.dataset.gnStudio) return;
  box.dataset.gnStudio = '1';

  const nn = document.getElementById('nn') as HTMLInputElement | null;
  const cvs = document.getElementById('cvs');
  const np = document.getElementById('np') as HTMLSelectElement | null;
  const nc = document.getElementById('nc') as HTMLButtonElement | null;
  const ok = document.getElementById('ok') as HTMLButtonElement | null;
  if (!nn || !cvs || !np || !nc || !ok) return;

  // re-bind as non-null: `refresh` is a hoisted declaration, so TS widens the
  // guarded originals back to nullable inside it
  const tplSel: HTMLSelectElement = np;
  const swatchRow: HTMLElement = cvs;
  const cancelBtn: HTMLButtonElement = nc;
  const createBtn: HTMLButtonElement = ok;
  const nameInput: HTMLInputElement = nn;

  box.innerHTML = '';
  box.classList.add('gn-studio');

  /* header */
  const head = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px');
  const title = el('div', '', 'New notebook');
  title.style.cssText = 'font-size:20px;font-weight:800;letter-spacing:-.02em;color:#141c26';
  const close = el('button', '', '✕') as HTMLButtonElement;
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.style.cssText =
    'border:0;background:transparent;font-size:17px;color:#8b95a3;cursor:pointer;padding:2px 6px;border-radius:8px';
  close.onclick = () => cancelBtn.click();
  head.append(title, close);

  /* body: preview on the left, fields on the right */
  const body = el('div', '');
  body.className = 'gn-st-body';

  const prevWrap = el('div', '');
  prevWrap.className = 'gn-prevwrap';
  const prevCover = el('div', '');
  prevCover.className = 'gn-prevcover';
  prevCover.dataset.cov = state.cover;
  const prevCv = document.createElement('canvas');
  prevWrap.append(prevCover);
  prevCover.append(prevCv);
  const prevCap = el('div', '', '');
  prevCap.className = 'gn-prevcap';
  prevWrap.append(prevCap);

  const fields = el('div', '');
  fields.className = 'gn-fields';

  const field = (label: string) => {
    const w = el('div', '');
    w.className = 'gn-field';
    const l = el('div', '', label);
    l.className = 'gn-label';
    w.append(l);
    fields.append(w);
    return w;
  };

  /* title */
  const fTitle = field('Title');
  nameInput.classList.add('gn-name');
  nameInput.placeholder = 'Untitled notebook';
  fTitle.append(nameInput);

  /* cover designs */
  const fCover = field('Cover design');
  const covRow = el('div', '');
  covRow.id = 'gn-covrow';
  COVERS.forEach((c) => {
    const b = el('button', '') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'gn-cov';
    b.dataset.cov = c.id;
    b.title = c.label;
    if (c.id === state.cover) b.classList.add('on');
    b.onclick = () => {
      state.cover = c.id;
      covRow.querySelectorAll('.gn-cov').forEach((n) => n.classList.remove('on'));
      b.classList.add('on');
      refresh();
    };
    covRow.append(b);
  });
  fCover.append(covRow);

  /* colour — the engine's own swatch row, reused */
  const fCol = field('Colour');
  const colRow = el('div', '');
  colRow.id = 'gn-colrow';
  colRow.append(swatchRow);
  fCol.append(colRow);

  /* size + orientation */
  const fSize = field('Page size');
  const sizeRow = el('div', '');
  sizeRow.className = 'gn-row';
  const sizeSel = document.createElement('select');
  sizeSel.id = 'gn-size';
  SIZES.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    sizeSel.append(o);
  });
  sizeSel.value = state.size;
  sizeSel.onchange = () => {
    state.size = sizeSel.value;
    refresh();
  };
  const oriWrap = el('div', '');
  oriWrap.className = 'gn-seg';
  (['portrait', 'landscape'] as const).forEach((o) => {
    const b = el('button', '', o === 'portrait' ? '▯ Portrait' : '▭ Landscape') as HTMLButtonElement;
    b.type = 'button';
    b.dataset.ori = o;
    if (o === state.ori) b.classList.add('on');
    b.onclick = () => {
      state.ori = o;
      oriWrap.querySelectorAll('button').forEach((n) => n.classList.remove('on'));
      b.classList.add('on');
      refresh();
    };
    oriWrap.append(b);
  });
  sizeRow.append(sizeSel, oriWrap);
  fSize.append(sizeRow);

  /* paper */
  const fPaper = field('Paper');
  const tabs = el('div', '');
  tabs.className = 'gn-tabs2';
  (
    [
      ['writing', 'Writing pages'],
      ['planner', 'Planner pages'],
      ['styles', 'Paper styles'],
    ] as const
  ).forEach(([k, label]) => {
    const b = el('button', '', label) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.cat = k;
    if (k === state.cat) b.classList.add('on');
    b.onclick = () => {
      state.cat = k;
      state.paper = (k === 'planner' ? PLANNER : k === 'styles' ? STYLES : WRITING)[0].id;
      tabs.querySelectorAll('button').forEach((n) => n.classList.remove('on'));
      b.classList.add('on');
      renderPapers();
      refresh();
    };
    tabs.append(b);
  });
  const paperRow = el('div', '');
  paperRow.id = 'gn-paperrow';
  fPaper.append(tabs, paperRow);

  /* keep the engine's template select in sync, hidden */
  tplSel.style.display = 'none';
  fields.append(tplSel);

  body.append(prevWrap, fields);
  box.append(head, body);

  /* footer */
  const foot = el('div', '');
  foot.className = 'gn-st-foot';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.classList.add('gn-cancel');
  createBtn.textContent = 'Create';
  createBtn.classList.add('gn-create');
  foot.append(cancelBtn, createBtn);
  box.append(foot);

  function renderPapers() {
    const list = state.cat === 'planner' ? PLANNER : state.cat === 'styles' ? STYLES : WRITING;
    paperRow.innerHTML = '';
    list.forEach((p) => {
      const b = el('button', '') as HTMLButtonElement;
      b.type = 'button';
      b.className = 'gn-paper';
      b.dataset.paper = p.id;
      if (p.id === state.paper) b.classList.add('on');
      const sw = document.createElement('canvas');
      sw.width = 54;
      sw.height = 42;
      const g = sw.getContext('2d');
      if (g) {
        const pp = (p as any).pp as Paper | undefined;
        if (pp) {
          paintPaper(g, scaled(pp, 0.3, 1.2), 54, 42);
        } else {
          g.fillStyle = '#fff';
          g.fillRect(0, 0, 54, 42);
        }
      }
      const t = el('span', '', p.label);
      b.append(sw, t);
      b.onclick = () => {
        state.paper = p.id;
        paperRow.querySelectorAll('.gn-paper').forEach((n) => n.classList.remove('on'));
        b.classList.add('on');
        refresh();
      };
      paperRow.append(b);
    });
  }

  function refresh() {
    const { pp, tpl } = paperOf();
    tplSel.value = tpl;
    paintPreview(prevCv);
    prevCover.dataset.cov = state.cover;
    // the preview frame takes the currently selected cover colour
    const on = swatchRow.querySelector('.sw.on') as HTMLElement | null;
    const col = on ? getComputedStyle(on).backgroundColor : '#2f6df6';
    prevCover.style.setProperty('--c', col);
    const { w, h } = dims();
    prevCap.textContent = `${SIZES.find((s) => s.id === state.size)?.label} · ${
      state.ori === 'portrait' ? 'Portrait' : 'Landscape'
    } · ${w}×${h}`;
    if (pp) prevCap.textContent += ` · ${pp.k}`;
  }

  renderPapers();
  refresh();
  (window as any).__inkpad_studio = { state, refresh, dims, paperOf };
  return true;
}

/* ------------------------------------------------------------------ */
/* Apply the choices once the engine has created the notebook          */
/* ------------------------------------------------------------------ */

let pending: { cover: string; w: number; h: number; pp?: Paper; tpl: string } | null = null;

function hookCreate() {
  if (bound) return;
  bound = true;

  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest || !t.closest('#ok')) return;
      if (!document.querySelector('#md.on')) return;
      const { w, h } = dims();
      const { pp, tpl } = paperOf();
      pending = { cover: state.cover, w, h, pp: pp ? { ...pp } : undefined, tpl };
    },
    true
  );

  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest || !t.closest('#ok')) return;
      if (!pending) return;
      // let the engine's own handler create + open the notebook first
      window.setTimeout(applyPending, 0);
    },
    false
  );
}

function applyPending() {
  const p = pending;
  pending = null;
  if (!p) return;
  const nb = ev<any>('nb');
  if (!nb || !nb.pages || !nb.pages.length) return;

  nb.cov = p.cover;
  const page = nb.pages[0];
  page.pw = p.w;
  page.ph = p.h;
  page.tpl = p.tpl;
  if (p.pp) page.pp = { ...p.pp };
  else delete page.pp;

  ev(`(function(){ if (typeof W !== 'undefined') { W = ${p.w}; H = ${p.h}; } })()`);
  ev('try{ fit(); load(); save(); thumbs(); }catch(e){}');
  paintCoverCards();
}

/* ------------------------------------------------------------------ */
/* Library: paint the chosen cover design on each card                 */
/* ------------------------------------------------------------------ */

function paintCoverCards() {
  const lib = ev<any[]>('lib') || [];
  document.querySelectorAll('#grid .card[data-id]').forEach((card) => {
    const id = Number(card.getAttribute('data-id'));
    const n = lib.find((x) => Number(x.id) === id);
    const cv = card.querySelector('.cv') as HTMLElement | null;
    if (!cv) return;
    cv.dataset.cov = (n && n.cov) || 'plain';
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  installPaperEngine();
  hookCreate();

  const style = document.createElement('style');
  style.id = 'gn-studio-style';
  style.textContent = CSS;
  document.head.append(style);

  buildSheet();

  // the sheet is rebuilt whenever the engine redraws it
  const md = document.getElementById('md');
  if (md) new MutationObserver(() => buildSheet()).observe(md, { childList: true, subtree: false });

  // cards are rebuilt on every shelf change
  const libm = document.getElementById('libm');
  if (libm) new MutationObserver(() => paintCoverCards()).observe(libm, { childList: true, subtree: true });

  paintCoverCards();

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.new') || t.closest('#gn-new')) window.setTimeout(buildSheet, 30);
  });
}

const CSS = `
#md .box.gn-studio{width:min(94vw,720px)!important;padding:0!important;gap:0!important;overflow:hidden}
.gn-studio > div:first-child{padding:18px 22px 12px}
.gn-st-body{display:flex;gap:22px;padding:0 22px 8px;align-items:flex-start}
.gn-prevwrap{flex:none;width:150px;display:flex;flex-direction:column;gap:8px;align-items:center}
.gn-prevcover{
  width:150px;height:200px;border-radius:6px 14px 14px 6px;position:relative;overflow:hidden;
  background:linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 65%,#000));
  box-shadow:0 10px 24px rgba(16,32,64,.22),inset 7px 0 9px -5px rgba(0,0,0,.4);
  display:flex;align-items:center;justify-content:center;
}
.gn-prevcover canvas{border-radius:2px;box-shadow:0 3px 10px rgba(0,0,0,.25);background:#fff}
.gn-prevcap{font-size:10.5px;color:#8b95a3;text-align:center;line-height:1.4}
.gn-fields{flex:1;min-width:0;display:flex;flex-direction:column;gap:11px;max-height:min(62vh,470px);overflow:auto;padding-right:4px}
.gn-field{display:flex;flex-direction:column;gap:6px}
.gn-label{font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#8b95a3}
.gn-name{width:100%}
#gn-covrow{display:flex;gap:7px;flex-wrap:wrap}
.gn-cov{
  width:38px;height:50px;border-radius:4px 8px 8px 4px;border:2px solid transparent;
  padding:0;cursor:pointer;
  background-color:#3a63a8;
  background-image:linear-gradient(135deg,var(--c,#4b78c4),color-mix(in srgb,var(--c,#4b78c4) 65%,#000));
  box-shadow:0 2px 6px rgba(16,32,64,.18);position:relative;transition:transform .12s ease;
}
.gn-cov:hover{transform:translateY(-2px)}
.gn-cov.on{border-color:var(--gn-acc);box-shadow:0 0 0 2px rgba(47,109,246,.25),0 3px 8px rgba(16,32,64,.2)}
.gn-cov.on::after{content:"✓";position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:14px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.45)}
#gn-colrow{display:flex;gap:8px;flex-wrap:wrap}
#gn-colrow #cvs{gap:7px!important}
#gn-colrow #cvs .sw{width:30px!important;height:38px!important;border-radius:6px!important}
#gn-colrow #cvs .sw.on::after{font-size:12px}
.gn-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#gn-size{
  border:1px solid var(--gn-line)!important;border-radius:10px!important;background:#f7f8fa!important;
  padding:9px 11px!important;font-size:13.5px!important;color:#1c2430!important;min-width:130px;cursor:pointer;
}
.gn-seg{display:flex;background:#eceae6;border-radius:10px;padding:2px;gap:2px}
.gn-seg button{
  border:0!important;background:transparent!important;border-radius:8px!important;
  padding:8px 12px!important;font-size:12.5px!important;color:#5b6673!important;cursor:pointer;font-weight:600;
}
.gn-seg button.on{background:#fff!important;color:#1f3a63!important;box-shadow:0 1px 3px rgba(16,32,64,.16)}
.gn-tabs2{display:flex;gap:5px;flex-wrap:wrap}
.gn-tabs2 button{
  border:1px solid var(--gn-line)!important;background:#fff!important;border-radius:999px!important;
  padding:6px 12px!important;font-size:12px!important;color:#4a5568!important;cursor:pointer;font-weight:600;
}
.gn-tabs2 button.on{background:#e8f0ff!important;border-color:var(--gn-acc)!important;color:#1f4fbf!important}
#gn-paperrow{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
.gn-paper{
  border:2px solid transparent!important;background:#fff!important;border-radius:10px!important;
  padding:5px!important;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;
  box-shadow:0 1px 3px rgba(16,32,64,.12);width:62px;
}
.gn-paper canvas{border-radius:5px;display:block;border:1px solid #e6e2dc}
.gn-paper span{font-size:10px;color:#5b6673;font-weight:600;white-space:nowrap}
.gn-paper.on{border-color:var(--gn-acc)!important;box-shadow:0 0 0 2px rgba(47,109,246,.18)}
.gn-st-foot{
  display:flex;justify-content:flex-end;gap:9px;padding:14px 22px 18px;
  border-top:1px solid #efece7;background:#fafafa;margin-top:6px;
}
.gn-cancel{
  border:1px solid var(--gn-line)!important;background:#fff!important;color:#3b4654!important;
  border-radius:11px!important;padding:10px 20px!important;font-weight:600!important;font-size:13.5px!important;cursor:pointer;
}
.gn-create{
  border:0!important;background:var(--gn-acc)!important;color:#fff!important;
  border-radius:11px!important;padding:10px 24px!important;font-weight:700!important;font-size:13.5px!important;
  cursor:pointer;box-shadow:0 4px 12px rgba(47,109,246,.32);
}
@media(max-width:620px){
  .gn-st-body{flex-direction:column;align-items:stretch;gap:12px}
  .gn-prevwrap{width:auto;flex-direction:row;align-items:center;gap:12px}
  .gn-prevcover{width:84px;height:112px;flex:none}
  .gn-fields{max-height:none}
}

/* ---- cover designs: alpha overlays so they tint with the cover colour ---- */
.card .cv[data-cov=linen],.gn-prevcover[data-cov=linen],.gn-cov[data-cov=linen]{background-image:
  repeating-linear-gradient(45deg,rgba(255,255,255,.10) 0 1px,transparent 1px 4px),
  repeating-linear-gradient(-45deg,rgba(0,0,0,.07) 0 1px,transparent 1px 4px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 65%,#000))}
.card .cv[data-cov=dots],.gn-prevcover[data-cov=dots],.gn-cov[data-cov=dots]{background-image:
  radial-gradient(rgba(255,255,255,.22) 1.4px,transparent 1.5px),
  radial-gradient(rgba(0,0,0,.10) 1.2px,transparent 1.3px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 65%,#000));
  background-size:12px 12px,12px 12px,100% 100%;background-position:0 0,6px 6px,0 0}
.card .cv[data-cov=stripe],.gn-prevcover[data-cov=stripe],.gn-cov[data-cov=stripe]{background-image:
  repeating-linear-gradient(115deg,rgba(255,255,255,.14) 0 6px,transparent 6px 18px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 62%,#000))}
.card .cv[data-cov=grid],.gn-prevcover[data-cov=grid],.gn-cov[data-cov=grid]{background-image:
  repeating-linear-gradient(0deg,rgba(255,255,255,.12) 0 1px,transparent 1px 9px),
  repeating-linear-gradient(90deg,rgba(255,255,255,.12) 0 1px,transparent 1px 9px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 65%,#000))}
.card .cv[data-cov=leather],.gn-prevcover[data-cov=leather],.gn-cov[data-cov=leather]{background-image:
  radial-gradient(circle at 18% 22%,rgba(255,255,255,.16) 0 18%,transparent 40%),
  radial-gradient(circle at 78% 68%,rgba(0,0,0,.18) 0 22%,transparent 46%),
  radial-gradient(circle at 52% 88%,rgba(255,255,255,.10) 0 14%,transparent 34%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 58%,#000))}
.card .cv[data-cov=marble],.gn-prevcover[data-cov=marble],.gn-cov[data-cov=marble]{background-image:
  linear-gradient(115deg,transparent 38%,rgba(255,255,255,.26) 44%,transparent 50%),
  linear-gradient(70deg,transparent 58%,rgba(0,0,0,.14) 64%,transparent 72%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 55%,#fff 12%))}
.card .cv[data-cov=confetti],.gn-prevcover[data-cov=confetti],.gn-cov[data-cov=confetti]{background-image:
  radial-gradient(rgba(255,236,150,.85) 1.6px,transparent 1.8px),
  radial-gradient(rgba(255,255,255,.75) 1.3px,transparent 1.5px),
  radial-gradient(rgba(160,230,255,.7) 1.4px,transparent 1.6px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 62%,#000));
  background-size:26px 22px,17px 19px,31px 27px,100% 100%;
  background-position:0 0,8px 11px,14px 4px,0 0}
.card .cv[data-cov=wave],.gn-prevcover[data-cov=wave],.gn-cov[data-cov=wave]{background-image:
  repeating-radial-gradient(circle at 50% 120%,rgba(255,255,255,.10) 0 8px,transparent 8px 18px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 60%,#000))}
`;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
