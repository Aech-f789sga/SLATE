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
  /** data URL painted edge to edge before the ruling goes on top */
  img?: string;
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

/** Decoded template images, keyed by data URL. */
const IMGS = new Map<string, HTMLImageElement>();

/**
 * Decode a template image once. Returns null the first time, and fires a repaint
 * when it lands so the page (and any open preview) picks it up.
 */
function imgOf(src: string): HTMLImageElement | null {
  const hit = IMGS.get(src);
  if (hit) return hit.complete && hit.naturalWidth ? hit : null;
  const im = new Image();
  im.onload = () => {
    window.dispatchEvent(new CustomEvent('inkpad-paper-loaded'));
  };
  im.src = src;
  IMGS.set(src, im);
  return null;
}

/** Paint a page background, margin rule included. */
function paintPaper(c: CanvasRenderingContext2D, p: Paper, W: number, H: number) {
  const im = p.img ? imgOf(p.img) : null;
  if (im) {
    c.drawImage(im, 0, 0, W, H);
  } else {
    c.fillStyle = p.bg || '#ffffff';
    c.fillRect(0, 0, W, H);
  }
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
  { id: 'custom', label: 'Custom…', w: 800, h: 1131 },
];

/**
 * Paper colour is a *pair*: the sheet tint and the ink of the ruling. GoodNotes
 * lets you name and reuse these; here the presets are fixed and the custom
 * background is free-form, which is what the studio can persist in `pp`.
 */
const TINTS: { id: string; label: string; bg: string; ln: string }[] = [
  { id: 'white', label: 'White', bg: '#ffffff', ln: 'rgba(120,150,190,.55)' },
  { id: 'cream', label: 'Cream', bg: '#fdf6e3', ln: 'rgba(150,120,70,.45)' },
  { id: 'mint', label: 'Mint', bg: '#eefaf3', ln: 'rgba(60,140,110,.45)' },
  { id: 'rose', label: 'Rose', bg: '#fdf0f4', ln: 'rgba(170,90,120,.42)' },
  { id: 'slate', label: 'Slate', bg: '#eef2f8', ln: 'rgba(80,105,145,.5)' },
  { id: 'night', label: 'Night', bg: '#1d2430', ln: 'rgba(255,255,255,.24)' },
];

const WRITING: { id: string; label: string; tpl: string; pp?: Paper }[] = [
  { id: 'lined', label: 'Lined', tpl: 'lined', pp: { k: 'lined', bg: '#ffffff', ln: 'rgba(120,150,190,.55)', gap: 32, lw: 1 } },
  { id: 'grid', label: 'Grid', tpl: 'grid', pp: { k: 'grid', bg: '#ffffff', ln: 'rgba(120,150,190,.4)', gap: 28, lw: 1 } },
  { id: 'dot', label: 'Dotted', tpl: 'dot', pp: { k: 'dot', bg: '#ffffff', ln: 'rgba(120,150,190,.75)', gap: 30, lw: 1 } },
  { id: 'blank', label: 'Blank', tpl: 'blank' },
  { id: 'cornell', label: 'Cornell', tpl: 'lined', pp: { k: 'cornell', bg: '#ffffff', ln: 'rgba(120,150,190,.55)', gap: 30, lw: 1 } },
];

/** A user-imported template, shown as one more writing paper. */
let imported: { id: string; label: string; tpl: string; pp: Paper } | null = null;

/** Writing papers, plus the imported one once it exists. */
function writingList() {
  return imported ? [...WRITING, imported] : WRITING;
}

let fileIn: HTMLInputElement | null = null;

function pickImport() {
  if (!fileIn) {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.style.display = 'none';
    i.onchange = () => {
      const f = i.files && i.files[0];
      if (f) importPaper(f);
      i.value = '';
    };
    document.body.append(i);
    fileIn = i;
  }
  fileIn.click();
}

function importPaper(file: File) {
  if (!/^image\//.test(file.type)) return;
  const reader = new FileReader();
  reader.onload = () => {
    const raw = String(reader.result || '');
    const im = new Image();
    im.onload = () => {
      // The data URL rides inside the page's `pp`, which the engine persists to
      // localStorage, so it has to be downscaled to stay inside that budget.
      const max = 1100;
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.width * k));
      cv.height = Math.max(1, Math.round(im.height * k));
      const g = cv.getContext('2d');
      if (!g) return;
      g.drawImage(im, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/jpeg', 0.7);

      imported = {
        id: 'imported',
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 12) || 'Imported',
        tpl: 'blank',
        pp: { k: 'blank', bg: '#ffffff', img: url },
      };
      IMGS.set(url, im);
      state.cat = 'writing';
      state.paper = 'imported';
      tintByPaper.imported = 'white';
      state.tint = 'white';
      (window as any).__inkpad_studio?.repaint?.();
    };
    im.src = raw;
  };
  reader.readAsDataURL(file);
}

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
  { id: 'spine', label: 'Spine' },
  { id: 'frame', label: 'Frame' },
  { id: 'foil', label: 'Foil' },
  { id: 'deco', label: 'Deco' },
  { id: 'sunburst', label: 'Sunburst' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'terrazzo', label: 'Terrazzo' },
  { id: 'ombre', label: 'Ombré' },
  { id: 'collage', label: 'Collage' },
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
  tint: 'white',
  customBg: '#ffffff',
  customW: 800,
  customH: 1131,
  /** edit mode only: which half of the sheet is showing */
  tab: 'cover' as 'cover' | 'paper',
  /** edit mode only: recolour the whole notebook or just its first page */
  scope: 'all' as 'all' | 'first',
};

/** Each template remembers the colour variant last picked for it. */
const tintByPaper: Record<string, string> = {};

/** Relative luminance of a hex colour, 0 (black) … 1 (white). */
function lum(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
  if (!m) return 1;
  const ch = [1, 2, 3].map((i) => {
    const v = parseInt(m[i], 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Ruling ink that stays legible on whatever background it lands on. */
function inkFor(bg: string): string {
  return lum(bg) < 0.35 ? 'rgba(255,255,255,.26)' : 'rgba(110,135,175,.5)';
}

function tintOf(): { bg: string; ln: string } {
  if (state.tint === 'custom') return { bg: state.customBg, ln: inkFor(state.customBg) };
  const t = TINTS.find((x) => x.id === state.tint);
  return t ? { bg: t.bg, ln: t.ln } : { bg: '#ffffff', ln: 'rgba(120,150,190,.55)' };
}

/** The tint a given template should use — its own last choice, else the sheet's. */
function tintFor(paperId: string): string {
  return tintByPaper[paperId] || state.tint;
}

function paperOf(): { tpl: string; pp?: Paper } {
  let base: { tpl: string; pp?: Paper };
  if (state.cat === 'planner') {
    const p = PLANNER.find((x) => x.id === state.paper) || PLANNER[0];
    base = { tpl: 'blank', pp: p.pp };
  } else if (state.cat === 'styles') {
    const p = STYLES.find((x) => x.id === state.paper) || STYLES[0];
    base = { tpl: 'blank', pp: p.pp };
  } else {
    const p = writingList().find((x) => x.id === state.paper) || WRITING[0];
    base = { tpl: p.tpl, pp: p.pp };
  }
  // Paper styles carry their own colours on purpose; everything else takes the
  // chosen tint so one control recolours every writing and planner page.
  if (state.cat !== 'styles' && base.pp) {
    const id = tintFor(state.paper);
    const t =
      id === 'custom'
        ? { bg: state.customBg, ln: inkFor(state.customBg) }
        : TINTS.find((x) => x.id === id) || TINTS[0];
    base = { ...base, pp: { ...base.pp, bg: t.bg, ln: t.ln } };
  }
  return base;
}

function dims(): { w: number; h: number } {
  let w: number;
  let h: number;
  if (state.size === 'custom') {
    w = Math.max(240, Math.min(4000, state.customW));
    h = Math.max(240, Math.min(4000, state.customH));
  } else {
    const s = SIZES.find((x) => x.id === state.size) || SIZES[0];
    w = s.w;
    h = s.h;
  }
  return state.ori === 'landscape' ? { w: h, h: w } : { w, h };
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

/** Non-null while the sheet is editing an existing notebook instead of creating one. */
let editing: any = null;

/** Templates whose colour row has been expanded past the first three dots. */
const expanded: Record<string, boolean> = {};

/** Colour pair for one template, honouring its remembered variant. */
function tintOfFor(paperId: string): { bg: string; ln: string } {
  const id = tintFor(paperId);
  if (id === 'custom') return { bg: state.customBg, ln: inkFor(state.customBg) };
  const t = TINTS.find((x) => x.id === id) || TINTS[0];
  return { bg: t.bg, ln: t.ln };
}

function paperLabel(): string {
  const list = state.cat === 'planner' ? PLANNER : state.cat === 'styles' ? STYLES : writingList();
  return (list.find((x) => x.id === state.paper) || list[0]).label;
}

function closeSheet() {
  editing = null;
  document.getElementById('md')?.classList.remove('on');
  const box = document.querySelector('#md .box') as HTMLElement | null;
  if (box) delete box.dataset.gnStudio;
}

function buildSheet(force = false) {
  const box = document.querySelector('#md .box') as HTMLElement | null;
  if (!box) return;
  const mode: 'new' | 'edit' = editing ? 'edit' : 'new';
  if (!force && box.dataset.gnStudio === mode) return;
  box.dataset.gnStudio = mode;

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
  const title = el('div', '', mode === 'edit' ? 'Notebook settings' : 'New notebook');
  title.style.cssText = 'font-size:20px;font-weight:800;letter-spacing:-.02em;color:#141c26';
  const close = el('button', '', '✕') as HTMLButtonElement;
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.style.cssText =
    'border:0;background:transparent;font-size:17px;color:#8b95a3;cursor:pointer;padding:2px 6px;border-radius:8px';
  close.onclick = () => cancelBtn.click();
  head.append(title, close);

  /* cover / paper tabs — only useful when editing an existing notebook */
  let tabbar: HTMLElement | null = null;
  if (mode === 'edit') {
    tabbar = el('div', '');
    tabbar.className = 'gn-tabbar';
    (
      [
        ['cover', 'Cover'],
        ['paper', 'Paper'],
      ] as const
    ).forEach(([k, label]) => {
      const b = el('button', '', label) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.tab = k;
      if (k === state.tab) b.classList.add('on');
      b.onclick = () => {
        state.tab = k;
        refresh();
      };
      tabbar!.append(b);
    });
  }

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
  if (mode === 'edit' && editing) nameInput.value = editing.name || '';
  fTitle.append(nameInput);

  /* ---- cover group ---------------------------------------------- */
  const coverGroup: HTMLElement[] = [];

  const fCover = field('Cover design');
  coverGroup.push(fCover);
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

  const fCol = field('Cover colour');
  coverGroup.push(fCol);
  const colRow = el('div', '');
  colRow.id = 'gn-colrow';
  colRow.append(swatchRow);
  fCol.append(colRow);

  /* ---- paper group ---------------------------------------------- */
  const paperGroup: HTMLElement[] = [];

  /* paper colour — the sheet tint, independent of the cover colour */
  const fTint = field('Paper colour');
  paperGroup.push(fTint);
  const tintRow = el('div', '');
  tintRow.id = 'gn-tintrow';
  TINTS.forEach((t) => {
    const b = el('button', '') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'gn-tint';
    b.dataset.tint = t.id;
    b.title = t.label;
    b.style.setProperty('--swc', t.bg);
    b.style.setProperty('--swc-ink', lum(t.bg) < 0.4 ? '#ffffff' : '#1c2430');
    b.onclick = () => pickTint(t.id);
    tintRow.append(b);
  });
  const customWrap = el('label', '');
  customWrap.className = 'gn-customwrap';
  customWrap.title = 'Custom paper colour';
  const customChip = el('input', '') as HTMLInputElement;
  customChip.type = 'color';
  customChip.className = 'gn-custombg';
  customChip.value = state.customBg;
  customChip.oninput = () => {
    state.customBg = customChip.value;
    pickTint('custom');
  };
  customWrap.append(customChip);
  tintRow.append(customWrap);
  fTint.append(tintRow);

  /* size + orientation */
  const fSize = field('Page size');
  paperGroup.push(fSize);
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

  /* custom size entry — only when "Custom…" is chosen */
  const fCustom = field('Custom size');
  paperGroup.push(fCustom);
  const customRow = el('div', '');
  customRow.className = 'gn-row';
  customRow.id = 'gn-customsize';
  const mkNum = (val: number, label: string) => {
    const i = el('input', '') as HTMLInputElement;
    i.type = 'number';
    i.className = 'gn-num';
    i.min = '240';
    i.max = '4000';
    i.step = '10';
    i.value = String(val);
    i.setAttribute('aria-label', label);
    return i;
  };
  const wIn = mkNum(state.customW, 'Custom width');
  const hIn = mkNum(state.customH, 'Custom height');
  wIn.oninput = () => {
    const v = Number(wIn.value);
    if (v >= 240 && v <= 4000) {
      state.customW = v;
      refresh();
    }
  };
  hIn.oninput = () => {
    const v = Number(hIn.value);
    if (v >= 240 && v <= 4000) {
      state.customH = v;
      refresh();
    }
  };
  const times = el('span', '', '×');
  times.className = 'gn-num-lbl';
  const px = el('span', '', 'px');
  px.className = 'gn-num-lbl';
  customRow.append(wIn, times, hIn, px);
  fCustom.append(customRow);

  /* paper catalogue */
  const fPaper = field('Paper');
  paperGroup.push(fPaper);
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
      state.paper = (k === 'planner' ? PLANNER : k === 'styles' ? STYLES : writingList())[0].id;
      state.tint = tintFor(state.paper);
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

  /* scope — edit mode can recolour one page or the whole notebook */
  if (mode === 'edit') {
    const fScope = field('Apply to');
    paperGroup.push(fScope);
    const scopeWrap = el('div', '');
    scopeWrap.className = 'gn-seg';
    (
      [
        ['all', 'All pages'],
        ['first', 'First page'],
      ] as const
    ).forEach(([k, label]) => {
      const b = el('button', '', label) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.scope = k;
      if (k === state.scope) b.classList.add('on');
      b.onclick = () => {
        state.scope = k;
        scopeWrap.querySelectorAll('button').forEach((n) => n.classList.remove('on'));
        b.classList.add('on');
      };
      scopeWrap.append(b);
    });
    fScope.append(scopeWrap);
  }

  /* keep the engine's template select in sync, hidden */
  tplSel.style.display = 'none';
  fields.append(tplSel);

  body.append(prevWrap, fields);
  if (tabbar) box.append(head, tabbar, body);
  else box.append(head, body);

  /* footer */
  const foot = el('div', '');
  foot.className = 'gn-st-foot';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.classList.add('gn-cancel');
  createBtn.textContent = 'Create';
  createBtn.classList.add('gn-create');
  const applyBtn = el('button', '', 'Apply') as HTMLButtonElement;
  applyBtn.type = 'button';
  applyBtn.className = 'gn-create gn-apply';
  applyBtn.onclick = () => applySettings();
  foot.append(cancelBtn, createBtn, applyBtn);
  box.append(foot);

  cancelBtn.style.display = '';
  createBtn.style.display = mode === 'edit' ? 'none' : '';
  applyBtn.style.display = mode === 'edit' ? '' : 'none';

  function pickTint(id: string) {
    state.tint = id;
    tintByPaper[state.paper] = id;
    renderPapers();
    refresh();
  }

  function pickPaper(id: string) {
    state.paper = id;
    state.tint = tintFor(id);
    renderPapers();
    refresh();
  }

  function renderPapers() {
    const list = state.cat === 'planner' ? PLANNER : state.cat === 'styles' ? STYLES : writingList();
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
        const base = (p as any).pp as Paper | undefined;
        if (base) {
          const pp = state.cat === 'styles' ? base : { ...base, ...tintOfFor(p.id) };
          paintPaper(g, scaled(pp, 0.3, 1.2), 54, 42);
        } else {
          g.fillStyle = '#fff';
          g.fillRect(0, 0, 54, 42);
          g.strokeStyle = 'rgba(120,150,190,.6)';
          g.lineWidth = 1;
          for (let y = 8; y < 42; y += 8) line(g, 0, y, 54, y);
        }
      }
      const t = el('span', '', p.label);
      b.append(sw, t);

      // colour variants — only templates that take a tint have them
      if (state.cat !== 'styles') {
        const dots = el('div', '');
        dots.className = 'gn-dots';
        const cur = tintFor(p.id);
        const shown = expanded[p.id] ? TINTS.length : 3;
        TINTS.slice(0, shown).forEach((tt) => {
          const d = el('button', '') as HTMLButtonElement;
          d.type = 'button';
          d.className = 'gn-dot' + (cur === tt.id ? ' on' : '');
          d.title = tt.label;
          d.style.setProperty('--swc', tt.bg);
          d.onclick = (e) => {
            e.stopPropagation();
            tintByPaper[p.id] = tt.id;
            state.paper = p.id;
            state.tint = tt.id;
            renderPapers();
            refresh();
          };
          dots.append(d);
        });
        if (TINTS.length > shown) {
          const more = el('button', '', `+${TINTS.length - shown}`) as HTMLButtonElement;
          more.type = 'button';
          more.className = 'gn-more';
          more.title = 'More colours';
          more.onclick = (e) => {
            e.stopPropagation();
            expanded[p.id] = true;
            renderPapers();
          };
          dots.append(more);
        }
        b.append(dots);
      }

      b.onclick = () => pickPaper(p.id);
      paperRow.append(b);
    });

    // dashed import tile — GoodNotes ends every template grid with one
    if (state.cat !== 'planner') {
      const imp = el('button', '') as HTMLButtonElement;
      imp.type = 'button';
      imp.className = 'gn-paper gn-import';
      imp.title = 'Import a paper template';
      const plus = el('span', '', '+');
      plus.className = 'gn-plus';
      imp.append(plus, el('span', '', 'Import'));
      imp.onclick = () => pickImport();
      paperRow.append(imp);
    }
  }

  function refresh() {
    const { pp, tpl } = paperOf();
    tplSel.value = tpl;
    paintPreview(prevCv);
    prevCover.dataset.cov = state.cover;

    // the preview frame and the design tiles take the selected cover colour
    const on = swatchRow.querySelector('.sw.on') as HTMLElement | null;
    const col = on ? getComputedStyle(on).backgroundColor : '#2f6df6';
    prevCover.style.setProperty('--c', col);
    covRow.style.setProperty('--c', col);

    // paper colour row
    tintRow.querySelectorAll('.gn-tint').forEach((n) => {
      n.classList.toggle('on', (n as HTMLElement).dataset.tint === state.tint);
    });
    customWrap.classList.toggle('on', state.tint === 'custom');

    // custom size inputs
    if (document.activeElement !== wIn) wIn.value = String(state.customW);
    if (document.activeElement !== hIn) hIn.value = String(state.customH);

    // cover / paper tabs
    if (tabbar) {
      tabbar.querySelectorAll('button').forEach((n) => {
        n.classList.toggle('on', (n as HTMLElement).dataset.tab === state.tab);
      });
      coverGroup.forEach((n) => (n.style.display = state.tab === 'cover' ? 'flex' : 'none'));
      paperGroup.forEach((n) => (n.style.display = state.tab === 'paper' ? 'flex' : 'none'));
    }

    // the custom-size field is only meaningful for the Custom page size, and
    // only inside the paper group — it has to be settled after the tab pass,
    // which owns the whole group
    const paperVisible = !tabbar || state.tab === 'paper';
    fCustom.style.display = paperVisible && state.size === 'custom' ? 'flex' : 'none';

    const { w, h } = dims();
    const sizeLabel = state.size === 'custom' ? 'Custom' : SIZES.find((s) => s.id === state.size)?.label || '';
    prevCap.textContent = `${sizeLabel} · ${state.ori === 'portrait' ? 'Portrait' : 'Landscape'} · ${w}×${h}`;
    if (pp) prevCap.textContent += ` · ${paperLabel()}`;
  }

  renderPapers();
  refresh();
  (window as any).__inkpad_studio = {
    state,
    refresh,
    dims,
    paperOf,
    openSettings,
    applySettings,
    repaint: () => {
      renderPapers();
      refresh();
    },
  };
  return true;
}

/* ------------------------------------------------------------------ */
/* Edit an existing notebook                                           */
/* ------------------------------------------------------------------ */

/** Read a notebook's first page back into the sheet's state. */
function syncFrom(n: any) {
  state.cover = n.cov || 'plain';
  const p = (n.pages && n.pages[0]) || {};
  const w = p.pw || 800;
  const h = p.ph || 1100;

  const hit = SIZES.find((s) => s.id !== 'custom' && ((s.w === w && s.h === h) || (s.w === h && s.h === w)));
  if (hit) {
    state.size = hit.id;
    state.ori = hit.w !== hit.h && hit.w === h ? 'landscape' : 'portrait';
  } else {
    state.size = 'custom';
    state.ori = w > h ? 'landscape' : 'portrait';
    state.customW = w;
    state.customH = h;
  }

  readPaper(p.pp, p.tpl || 'lined');
  state.tab = 'cover';
  state.scope = 'all';
}

function readPaper(pp: any, tpl: string) {
  if (!pp) {
    state.cat = 'writing';
    state.paper = writingList().some((x) => x.id === tpl) ? tpl : tpl === 'blank' ? 'blank' : 'lined';
    state.tint = 'white';
    return;
  }
  const k = String(pp.k || '');
  const bg = String(pp.bg || '#ffffff');

  const st = STYLES.find((x) => x.pp.k === k && String(x.pp.bg || '').toLowerCase() === bg.toLowerCase());
  if (st) {
    state.cat = 'styles';
    state.paper = st.id;
    return;
  }

  const pl = PLANNER.find((x) => x.pp.k === k);
  if (pl) {
    state.cat = 'planner';
    state.paper = pl.id;
  } else {
    const wr = writingList().find((x) => x.pp?.k === k);
    state.cat = 'writing';
    state.paper = wr ? wr.id : 'blank';
  }

  const t = TINTS.find((x) => x.bg.toLowerCase() === bg.toLowerCase());
  if (t) {
    state.tint = t.id;
    tintByPaper[state.paper] = t.id;
  } else {
    state.tint = 'custom';
    state.customBg = bg;
    tintByPaper[state.paper] = 'custom';
  }
}

/** Open the studio bound to an existing notebook. */
function openSettings(id: number | string) {
  const lib = ev<any[]>('lib') || [];
  const n = lib.find((x) => String(x.id) === String(id));
  if (!n) return;
  editing = n;
  syncFrom(n);

  const md = document.getElementById('md');
  const box = md?.querySelector('.box') as HTMLElement | null;
  if (box) delete box.dataset.gnStudio;
  md?.classList.add('on');

  // preselect the swatch that matches the notebook's current cover colour
  const cvs = document.getElementById('cvs');
  if (cvs && n.cover) {
    const want = toRgb(String(n.cover));
    cvs.querySelectorAll('.sw').forEach((sw) => {
      const hit = getComputedStyle(sw).backgroundColor === want;
      sw.classList.toggle('on', hit);
    });
  }

  buildSheet(true);
}

function toRgb(c: string): string {
  const d = document.createElement('div');
  d.style.color = c;
  document.body.append(d);
  const v = getComputedStyle(d).color;
  d.remove();
  return v;
}

/** Commit the sheet's choices back onto the notebook being edited. */
function applySettings() {
  const n = editing;
  if (!n) return;
  const { w, h } = dims();
  const { pp, tpl } = paperOf();

  n.cov = state.cover;
  const on = document.querySelector('#cvs .sw.on') as HTMLElement | null;
  if (on) n.cover = getComputedStyle(on).backgroundColor;

  const nm = (document.getElementById('nn') as HTMLInputElement | null)?.value.trim();
  if (nm) n.name = nm;

  const pages = state.scope === 'all' ? n.pages : n.pages.slice(0, 1);
  pages.forEach((p: any) => {
    p.pw = w;
    p.ph = h;
    p.tpl = tpl;
    if (pp) p.pp = { ...pp };
    else delete p.pp;
  });
  n.upd = Date.now();

  ev('try{ save(); }catch(e){}');

  const live = ev<any>('nb');
  if (live && String(live.id) === String(n.id)) {
    ev(`(function(){ W = ${w}; H = ${h}; })()`);
    ev('try{ fit(); load(); }catch(e){}');
  }

  closeSheet();
  ev('try{ showLib(); }catch(e){}');
  paintCoverCards();
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
      if (editing) return;
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

  // closing the sheet by any route drops the edit target
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest || !t.closest('#nc')) return;
      editing = null;
      const box = document.querySelector('#md .box') as HTMLElement | null;
      if (box) delete box.dataset.gnStudio;
    },
    true
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

/**
 * The shelf the engine actually rendered, in DOM order. `showLib` filters by the
 * search box and the active tab, then sorts by last-updated, so replaying the
 * same pipeline is the only reliable way to line cards up with notebooks —
 * the engine never stamps an id on the card itself.
 */
function shelfList(): any[] {
  const lib = ev<any[]>('lib') || [];
  const flt = ev<string>('flt') || 'all';
  const q = ((document.getElementById('find') as HTMLInputElement | null)?.value || '').toLowerCase();
  return lib
    .filter(
      (n) =>
        (n.name || '').toLowerCase().includes(q) &&
        (flt === 'trash' ? n.del : !n.del && (flt !== 'fav' || n.fav))
    )
    .sort((a, b) => (b.upd || 0) - (a.upd || 0));
}

function paintCoverCards() {
  const list = shelfList();
  const cards = Array.from(document.querySelectorAll('#grid .card'));
  cards.forEach((card, i) => {
    const n = list[i];
    if (!n) return;
    card.setAttribute('data-id', String(n.id));

    const cv = card.querySelector('.cv') as HTMLElement | null;
    if (cv) {
      cv.dataset.cov = n.cov || 'plain';
      if (n.cover) cv.style.setProperty('--c', n.cover);
    }

    // per-notebook settings entry point, next to the favourite / delete buttons
    const sub = card.querySelector('.sub span:last-child') as HTMLElement | null;
    if (sub && !sub.querySelector('.gn-cfg')) {
      const b = el('button', '', '⚙') as HTMLButtonElement;
      b.type = 'button';
      b.className = 'gn-cfg';
      b.title = 'Cover & paper';
      b.setAttribute('aria-label', 'Cover and paper settings');
      b.onclick = (e) => {
        e.stopPropagation();
        openSettings(n.id);
      };
      sub.prepend(b);
    }
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

  // a freshly decoded template image needs the open page repainted
  window.addEventListener('inkpad-paper-loaded', () => {
    ev('try{ if (nb) { draw(); thumbs(); } }catch(e){}');
  });

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest || !(t.closest('.new') || t.closest('#gn-new'))) return;
    // a fresh notebook always starts from the create flow, never a stale edit
    editing = null;
    const box = document.querySelector('#md .box') as HTMLElement | null;
    if (box) delete box.dataset.gnStudio;
    window.setTimeout(() => buildSheet(true), 30);
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
.gn-fields{flex:1;min-width:0;display:flex;flex-direction:column;gap:9px;max-height:min(64vh,520px);overflow:auto;padding-right:4px}
.gn-field{display:flex;flex-direction:column;gap:5px}
.gn-label{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#8b95a3;line-height:1.25}
.gn-name{width:100%}
.gn-studio input:focus,.gn-studio select:focus,.gn-studio textarea:focus,
.gn-studio input:focus-visible,.gn-studio select:focus-visible,.gn-studio textarea:focus-visible{
  outline:2px solid var(--gn-acc)!important;outline-offset:1px;border-color:var(--gn-acc)!important
}
#gn-covrow{display:grid;grid-template-columns:repeat(9,36px);gap:6px;justify-content:start}
.gn-cov{
  width:36px;height:47px;border-radius:4px 8px 8px 4px;border:2px solid transparent;
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

/* ---- cover / paper tabs (edit mode) ---- */
.gn-tabbar{display:flex;gap:4px;background:#eceae6;border-radius:11px;padding:3px;margin:0 22px 10px}
.gn-tabbar button{
  flex:1;border:0!important;background:transparent!important;border-radius:9px!important;
  padding:7px 10px!important;font-size:12.5px!important;font-weight:600;color:#5b6673!important;cursor:pointer;
}
.gn-tabbar button.on{background:#fff!important;color:#1f3a63!important;box-shadow:0 1px 3px rgba(16,32,64,.16)}

/* ---- paper colour ---- */
#gn-tintrow{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.gn-tint{
  width:30px;height:30px;border-radius:9px;border:2px solid transparent;padding:0;cursor:pointer;
  background:var(--swc,#fff)!important;box-shadow:inset 0 0 0 1px rgba(16,32,64,.16);position:relative;
  transition:transform .12s ease;
}
.gn-tint:hover{transform:translateY(-1px)}
.gn-tint.on{
  border-color:var(--gn-acc);
  box-shadow:inset 0 0 0 1px rgba(16,32,64,.16),0 0 0 2px rgba(47,109,246,.24);
}
.gn-tint.on::after{
  content:"✓";position:absolute;inset:0;display:grid;place-items:center;
  font-size:12px;font-weight:800;color:var(--swc-ink,#1c2430);
}
.gn-customwrap{
  width:30px;height:30px;border-radius:9px;flex:none;cursor:pointer;position:relative;
  display:grid;place-items:center;
  background:conic-gradient(from 210deg,#ff6b6b,#ffd166,#8ce99a,#66d9e8,#748ffc,#e599f7,#ff6b6b);
  box-shadow:inset 0 0 0 1px rgba(16,32,64,.16);
}
.gn-customwrap.on{box-shadow:inset 0 0 0 1px rgba(16,32,64,.16),0 0 0 2px rgba(47,109,246,.24)}
.gn-custombg{
  width:20px;height:20px;padding:0;border:2px solid #fff;border-radius:6px;
  background:#fff;cursor:pointer;
}
.gn-custombg::-webkit-color-swatch-wrapper{padding:0}
.gn-custombg::-webkit-color-swatch{border:0;border-radius:3px}

/* ---- custom size ---- */
.gn-num{
  width:78px;border:1px solid var(--gn-line)!important;border-radius:9px!important;background:#f7f8fa!important;
  padding:8px 9px!important;font-size:13px!important;color:#1c2430!important;
}
.gn-num-lbl{font-size:12px;color:#8b95a3;font-weight:600}

/* ---- per-template colour variants ---- */
.gn-dots{display:flex;gap:2px;align-items:center;justify-content:center;margin-top:1px;min-height:8px}
.gn-dot{
  width:7px;height:7px;border-radius:50%;padding:0;cursor:pointer;flex:none;
  border:1px solid rgba(16,32,64,.2);background:var(--swc,#fff)!important;
}
.gn-dot.on{box-shadow:0 0 0 1.5px #fff,0 0 0 3px var(--gn-acc)}
.gn-more{
  border:0!important;background:transparent!important;padding:0 1px 0 2px!important;
  font-size:9.5px!important;font-weight:800;color:#9aa4b0!important;cursor:pointer;line-height:1;
  letter-spacing:-.02em;
}
.gn-more:hover{color:var(--gn-acc)!important}

/* ---- library card settings button ---- */
.gn-cfg{
  border:0!important;background:transparent!important;padding:0 3px!important;
  font-size:12px!important;color:#a3adb9!important;cursor:pointer;line-height:1;vertical-align:middle;
}
.gn-cfg:hover{color:var(--gn-acc)!important}
.gn-tabs2{display:flex;gap:5px;flex-wrap:wrap}
.gn-tabs2 button{
  border:1px solid var(--gn-line)!important;background:#fff!important;border-radius:999px!important;
  padding:6px 12px!important;font-size:12px!important;color:#4a5568!important;cursor:pointer;font-weight:600;
}
.gn-tabs2 button.on{background:#e8f0ff!important;border-color:var(--gn-acc)!important;color:#1f4fbf!important}
#gn-paperrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.gn-paper{
  border:2px solid transparent!important;background:#fff!important;border-radius:10px!important;
  padding:4px 3px 3px!important;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;
  box-shadow:0 1px 3px rgba(16,32,64,.12);width:64px;
}
.gn-paper canvas{border-radius:5px;display:block;border:1px solid #e6e2dc}
.gn-paper span{font-size:10px;color:#5b6673;font-weight:600;white-space:nowrap}
.gn-paper.on{border-color:var(--gn-acc)!important;box-shadow:0 0 0 2px rgba(47,109,246,.18)}
/* import tile — dashed, at the end of the writing / styles grids */
.gn-paper.gn-import{
  border:2px dashed #d5dbe3!important;background:transparent!important;
  justify-content:center;min-height:76px;color:#8b95a3!important;
}
.gn-paper.gn-import:hover{border-color:var(--gn-acc)!important;color:var(--gn-acc)!important}
.gn-paper.gn-import .gn-plus{font-size:17px;font-weight:400;line-height:1;display:block;margin-bottom:1px}
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
  #md .box.gn-studio{max-height:92vh;display:flex;flex-direction:column}
  .gn-st-body{flex-direction:column;align-items:stretch;gap:12px;overflow:auto;min-height:0;flex:1}
  .gn-prevwrap{width:auto;flex-direction:row;align-items:center;gap:12px}
  .gn-prevcover{width:84px;height:112px;flex:none}
  .gn-fields{max-height:none;overflow:visible}
  .gn-tabbar{margin:0 16px 10px}
  #gn-covrow{grid-template-columns:repeat(auto-fill,minmax(32px,1fr))}
  .gn-cov{width:100%;height:auto;aspect-ratio:36/47}
  #gn-paperrow{gap:5px}
  .gn-paper{width:62px}
  .gn-st-foot{flex:none;margin-top:0}
}

/* ---- cover designs: alpha overlays so they tint with the cover colour ---- */
.card .cv[data-cov=linen],.gn-prevcover[data-cov=linen],.gn-cov[data-cov=linen]{background-image:
  repeating-linear-gradient(45deg,rgba(255,255,255,.22) 0 1px,transparent 1px 4px),
  repeating-linear-gradient(-45deg,rgba(0,0,0,.16) 0 1px,transparent 1px 4px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 65%,#000))}
.card .cv[data-cov=dots],.gn-prevcover[data-cov=dots],.gn-cov[data-cov=dots]{background-image:
  radial-gradient(rgba(255,255,255,.30) 1.8px,transparent 1.9px),
  radial-gradient(rgba(0,0,0,.14) 1.5px,transparent 1.6px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 65%,#000));
  background-size:11px 11px,11px 11px,100% 100%;background-position:0 0,5.5px 5.5px,0 0}
.card .cv[data-cov=stripe],.gn-prevcover[data-cov=stripe],.gn-cov[data-cov=stripe]{background-image:
  repeating-linear-gradient(115deg,rgba(255,255,255,.26) 0 7px,transparent 7px 20px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 62%,#000))}
.card .cv[data-cov=grid],.gn-prevcover[data-cov=grid],.gn-cov[data-cov=grid]{background-image:
  repeating-linear-gradient(0deg,rgba(255,255,255,.26) 0 1px,transparent 1px 9px),
  repeating-linear-gradient(90deg,rgba(255,255,255,.26) 0 1px,transparent 1px 9px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 65%,#000))}
.card .cv[data-cov=leather],.gn-prevcover[data-cov=leather],.gn-cov[data-cov=leather]{background-image:
  radial-gradient(circle at 18% 22%,rgba(255,255,255,.18) 0 18%,transparent 40%),
  radial-gradient(circle at 78% 68%,rgba(0,0,0,.22) 0 22%,transparent 46%),
  radial-gradient(circle at 52% 88%,rgba(255,255,255,.12) 0 14%,transparent 34%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 58%,#000))}
.card .cv[data-cov=marble],.gn-prevcover[data-cov=marble],.gn-cov[data-cov=marble]{background-image:
  linear-gradient(115deg,transparent 36%,rgba(255,255,255,.34) 43%,transparent 50%),
  linear-gradient(70deg,transparent 56%,rgba(0,0,0,.18) 63%,transparent 72%),
  linear-gradient(150deg,transparent 20%,rgba(255,255,255,.16) 26%,transparent 33%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 55%,#fff 12%))}
.card .cv[data-cov=confetti],.gn-prevcover[data-cov=confetti],.gn-cov[data-cov=confetti]{background-image:
  radial-gradient(rgba(255,236,150,.9) 1.8px,transparent 2px),
  radial-gradient(rgba(255,255,255,.8) 1.4px,transparent 1.6px),
  radial-gradient(rgba(160,230,255,.75) 1.6px,transparent 1.8px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 62%,#000));
  background-size:26px 22px,17px 19px,31px 27px,100% 100%;
  background-position:0 0,8px 11px,14px 4px,0 0}
.card .cv[data-cov=wave],.gn-prevcover[data-cov=wave],.gn-cov[data-cov=wave]{background-image:
  repeating-radial-gradient(circle at 50% 120%,rgba(255,255,255,.22) 0 9px,transparent 9px 19px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 60%,#000))}
/* spine: dark bound edge with a gilt rule and a title plate */
.card .cv[data-cov=spine],.gn-prevcover[data-cov=spine],.gn-cov[data-cov=spine]{background-image:
  linear-gradient(90deg,transparent 12.5%,rgba(255,255,255,.6) 12.5%,rgba(255,255,255,.6) 14%,transparent 14%),
  linear-gradient(rgba(255,255,255,.20),rgba(255,255,255,.20)),
  linear-gradient(90deg,rgba(0,0,0,.34) 0 12.5%,transparent 12.5%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 62%,#000));
  background-size:100% 100%,52% 11%,100% 100%,100% 100%;
  background-position:0 0,58% 44%,0 0,0 0;background-repeat:no-repeat}
/* frame: inset double rule */
.card .cv[data-cov=frame],.gn-prevcover[data-cov=frame],.gn-cov[data-cov=frame]{background-image:
  linear-gradient(rgba(255,255,255,.75),rgba(255,255,255,.75)),
  linear-gradient(rgba(255,255,255,.75),rgba(255,255,255,.75)),
  linear-gradient(rgba(255,255,255,.75),rgba(255,255,255,.75)),
  linear-gradient(rgba(255,255,255,.75),rgba(255,255,255,.75)),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 68%,#000));
  background-size:calc(100% - 14px) 1.5px,calc(100% - 14px) 1.5px,1.5px calc(100% - 14px),1.5px calc(100% - 14px),100% 100%;
  background-position:7px 7px,7px calc(100% - 7px),7px 7px,calc(100% - 7px) 7px,0 0;
  background-repeat:no-repeat}
/* foil: gold corner wedges */
.card .cv[data-cov=foil],.gn-prevcover[data-cov=foil],.gn-cov[data-cov=foil]{background-image:
  linear-gradient(135deg,rgba(255,214,122,.92) 0 15%,transparent 15.4%),
  linear-gradient(135deg,rgba(255,214,122,.42) 0 10%,transparent 10.4%),
  linear-gradient(315deg,rgba(255,214,122,.75) 0 13%,transparent 13.4%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 60%,#000))}
/* deco: chevron bands along the foot */
.card .cv[data-cov=deco],.gn-prevcover[data-cov=deco],.gn-cov[data-cov=deco]{background-image:
  linear-gradient(160deg,rgba(255,255,255,.24) 0 50%,transparent 50.3%),
  linear-gradient(20deg,rgba(255,255,255,.12) 0 50%,transparent 50.3%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 62%,#000));
  background-size:100% 30%,100% 22%,100% 100%;
  background-position:0 100%,0 100%,0 0;background-repeat:no-repeat}
/* sunburst: rays fanning from the foot */
.card .cv[data-cov=sunburst],.gn-prevcover[data-cov=sunburst],.gn-cov[data-cov=sunburst]{background-image:
  repeating-conic-gradient(from 200deg at 50% 104%,rgba(255,255,255,.15) 0 6deg,transparent 6deg 16deg),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 60%,#000))}

/* ---- illustrated covers ---------------------------------------- */
/* aurora: ribboned light drifting across a deep field */
.card .cv[data-cov=aurora],.gn-prevcover[data-cov=aurora],.gn-cov[data-cov=aurora]{background-image:
  radial-gradient(ellipse at 18% 12%,rgba(120,255,220,.58),transparent 52%),
  radial-gradient(ellipse at 88% 28%,rgba(178,148,255,.52),transparent 54%),
  radial-gradient(ellipse at 54% 92%,rgba(255,186,120,.44),transparent 58%),
  linear-gradient(165deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 42%,#050a14))}
/* terrazzo: scattered stone chips over a flat ground */
.card .cv[data-cov=terrazzo],.gn-prevcover[data-cov=terrazzo],.gn-cov[data-cov=terrazzo]{background-image:
  radial-gradient(circle at 14% 16%,rgba(255,255,255,.88) 0 3px,transparent 3.6px),
  radial-gradient(circle at 40% 11%,rgba(255,214,150,.82) 0 2.4px,transparent 3px),
  radial-gradient(circle at 74% 20%,rgba(150,220,255,.82) 0 3px,transparent 3.6px),
  radial-gradient(circle at 22% 48%,rgba(255,170,200,.78) 0 2px,transparent 2.6px),
  radial-gradient(circle at 60% 58%,rgba(255,255,255,.72) 0 3.4px,transparent 4px),
  radial-gradient(circle at 88% 74%,rgba(198,255,200,.74) 0 2.4px,transparent 3px),
  radial-gradient(circle at 36% 86%,rgba(255,240,170,.78) 0 2px,transparent 2.6px),
  radial-gradient(circle at 8% 72%,rgba(200,230,255,.7) 0 2.2px,transparent 2.8px),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 72%,#000))}
/* ombré: one long value ramp, light at the head to deep at the foot */
.card .cv[data-cov=ombre],.gn-prevcover[data-cov=ombre],.gn-cov[data-cov=ombre]{background-image:
  linear-gradient(178deg,
    color-mix(in srgb,var(--c,#2f6df6) 34%,#fff) 0%,
    var(--c,#2f6df6) 44%,
    color-mix(in srgb,var(--c,#2f6df6) 52%,#000) 100%)}
/* collage: overlapping torn-paper planes */
.card .cv[data-cov=collage],.gn-prevcover[data-cov=collage],.gn-cov[data-cov=collage]{background-image:
  linear-gradient(114deg,rgba(255,255,255,.24) 0 34%,transparent 34.4%),
  linear-gradient(64deg,rgba(0,0,0,.20) 0 24%,transparent 24.4%),
  linear-gradient(-18deg,rgba(255,255,255,.13) 0 16%,transparent 16.4%),
  linear-gradient(135deg,var(--c,#2f6df6),color-mix(in srgb,var(--c,#2f6df6) 58%,#000))}
`;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
