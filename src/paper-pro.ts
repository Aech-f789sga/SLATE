/**
 * Paper & ink — millimetre-true paper, and a highlighter that behaves.
 *
 * The engine draws paper as a handful of 32-pixel loops. That is fine on a
 * default page and wrong everywhere else: change the page size, zoom, or export
 * at 600 dpi and the ruling stops being 8 mm. This module replaces the paper
 * layer with one built from millimetres, drawn on an offscreen canvas at device
 * resolution so every hairline lands on a whole pixel.
 *
 *   • Ruling, grid, dot and Cornell layouts are specified in mm (5–10 mm
 *     ruling, 4–10 mm grid, major lines every 5th), not in "32".
 *   • The paper is cached per size/template/colour/DPR, so re-drawing on every
 *     pointer move costs one blit instead of several hundred strokes.
 *   • A very light grain keeps large white areas from looking like flat vector.
 *
 * The highlighter is re-drawn rather than tinted: a chisel-flat nib at the true
 * nib width, multiply blending on light paper (so overlapping passes do not
 * turn into a dark smear and the ink underneath stays legible), soft edges, and
 * a screen blend on dark paper where multiply would go black.
 */

/* ------------------------------------------------------------------ */
/* Engine access                                                       */
/* ------------------------------------------------------------------ */

import { loadSmart, setSmart, smartOn, type SmartKey } from './smart';

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T | null;
  } catch {
    return null;
  }
}

/** 96 dpi: the page presets are sized for it (A4 ≈ 800 × 1131). */
export const PX_PER_MM = 96 / 25.4;

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

interface Prefs {
  ruling: number; // mm between ruled lines
  grid: number; // mm between minor grid lines
  margin: boolean;
  marginMm: number;
  grain: boolean;
  hlOpacity: number; // 0.05 – 0.9
  hlBlend: 'auto' | 'multiply' | 'normal';
  hlUnder: boolean; // highlighters paint beneath ink
}

const PREFS_KEY = 'inkpad-paper-prefs';

const prefs: Prefs = {
  ruling: 8,
  grid: 5,
  margin: true,
  marginMm: 20,
  grain: true,
  hlOpacity: 0.34,
  hlBlend: 'auto',
  hlUnder: true,
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    if (Number(p.ruling) >= 4 && Number(p.ruling) <= 14) prefs.ruling = Number(p.ruling);
    if (Number(p.grid) >= 3 && Number(p.grid) <= 20) prefs.grid = Number(p.grid);
    if (typeof p.margin === 'boolean') prefs.margin = p.margin;
    if (Number(p.marginMm) > 0 && Number(p.marginMm) < 60) prefs.marginMm = Number(p.marginMm);
    if (typeof p.grain === 'boolean') prefs.grain = p.grain;
    if (Number(p.hlOpacity) > 0.04 && Number(p.hlOpacity) <= 0.95) prefs.hlOpacity = Number(p.hlOpacity);
    if (p.hlBlend === 'auto' || p.hlBlend === 'multiply' || p.hlBlend === 'normal') prefs.hlBlend = p.hlBlend;
    if (typeof p.hlUnder === 'boolean') prefs.hlUnder = p.hlUnder;
  } catch {
    /* defaults */
  }
}

/**
 * Drop a page's ready-made paper so the template below it applies again.
 *
 * The drawer's "Ready-made papers" and "Custom paper" store a whole paper on
 * the page itself, and the engine draws that instead of the template:
 * `render0` calls `bgPP` when the page has one and `bg` — this module — when it
 * does not. So on any page carrying one, every control in the Page card wrote a
 * value that was never read: pick Grid and nothing happened, because the
 * template was not what was being drawn.
 *
 * Touching the paper here is a statement about which paper you want, so the
 * override goes. Returns whether there was one to remove.
 */
function dropOverride(): boolean {
  const p = ev<any>('pg && pg()');
  if (!p || !p.pp) return false;
  delete p.pp;
  ev('try{ save() }catch(e){}');
  return true;
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  dropOverride();
  invalidate();
  repaint();
}

function repaint() {
  ev('try{ draw(); save(); thumbs(); }catch(e){}');
  // in a long strip only the page you are on is the engine's canvas; the pages
  // above and below are cached renders and the paper under them just changed
  (window as any).__inkpad_pagestrip?.repaint?.();
}

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

/** Ink-blue rules, the colour a printed notebook actually uses. */
const RULE = 'rgba(74,108,152,0.55)';
const RULE_MAJOR = 'rgba(74,108,152,0.7)';
const MARGIN = 'rgba(206,80,80,0.6)';
const DOT = 'rgba(74,108,152,0.62)';

function lum(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
  if (!m) return 1;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function paperColor(page: any): string {
  if (page && page.pp && page.pp.bg) return page.pp.bg;
  return (page && page.col) || '#ffffff';
}

/* ------------------------------------------------------------------ */
/* Paper renderer                                                      */
/* ------------------------------------------------------------------ */

interface Cache {
  key: string;
  canvas: HTMLCanvasElement | null;
  dpr: number;
}

const cache: Cache = { key: '', canvas: null, dpr: 1 };

export function invalidate() {
  cache.key = '';
}

function grainTile(dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const s = 96;
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = 120 + Math.random() * 60;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 7 + Math.random() * 6;
  }
  g.putImageData(img, 0, 0);
  return c;
}

let grain: HTMLCanvasElement | null = null;

function buildPaper(tpl: string, col: string, W: number, H: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(W * dpr));
  cv.height = Math.max(1, Math.round(H * dpr));
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);

  // one device pixel, in page units
  const px = 1 / dpr;
  const mm = PX_PER_MM;
  const bg = col || '#ffffff';

  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  const dark = lum(bg) < 0.45;
  const rule = dark ? 'rgba(180,200,225,0.26)' : RULE;
  const ruleMajor = dark ? 'rgba(190,210,235,0.4)' : RULE_MAJOR;
  const marginCol = dark ? 'rgba(230,120,120,0.42)' : MARGIN;
  const dotCol = dark ? 'rgba(180,200,225,0.42)' : DOT;

  // A hairline that survives being displayed smaller than 100 %: 0.18 mm is
  // what a printed rule actually measures, with one device pixel as the floor.
  const hair = (color: string, w = 1) => {
    c.strokeStyle = color;
    c.lineWidth = Math.max(0.18 * mm * w, px * 1.15);
    c.lineCap = 'butt';
  };

  const line = (x0: number, y0: number, x1: number, y1: number) => {
    // half-pixel offsets keep a hairline from straddling two pixels
    const ox = Math.abs(x0 - x1) < 0.01 ? px / 2 : 0;
    const oy = Math.abs(y0 - y1) < 0.01 ? px / 2 : 0;
    c.beginPath();
    c.moveTo(x0 + ox, y0 + oy);
    c.lineTo(x1 + ox, y1 + oy);
    c.stroke();
  };

  const top = 18 * mm;

  /**
   * The margin rule, drawn on any page that has a surface.
   *
   * It used to be painted inside the lined and Cornell branches only, so on a
   * dotted or grid page the Margin chips changed a preference and nothing else
   * — the control looked broken. A margin is a guide to where the text stops,
   * which every page can use, so it is drawn once here and called from every
   * branch.
   */
  const marginLine = (force = false) => {
    if (!force && !prefs.margin) return;
    hair(marginCol, 1);
    line(prefs.marginMm * mm, 0, prefs.marginMm * mm, H);
  };

  if (tpl === 'lined') {
    hair(rule, 1);
    for (let y = top; y < H - 2 * px; y += prefs.ruling * mm) line(0, y, W, y);
    marginLine();
  } else if (tpl === 'margin') {
    // The exercise-book page: ruled, with the red rule down the margin. The
    // rule is the whole point of this paper, so it is drawn whether or not the
    // Margin chips are on — those are for the other papers.
    hair(rule, 1);
    for (let y = top; y < H - 2 * px; y += prefs.ruling * mm) line(0, y, W, y);
    marginLine(true);
  } else if (tpl === 'grid') {
    const step = prefs.grid * mm;
    for (let x = 0; x < W; x += step) {
      const major = Math.round(x / step) % 5 === 0;
      hair(major ? ruleMajor : rule, major ? 1.35 : 1);
      line(x, 0, x, H);
    }
    for (let y = 0; y < H; y += step) {
      const major = Math.round(y / step) % 5 === 0;
      hair(major ? ruleMajor : rule, major ? 1.35 : 1);
      line(0, y, W, y);
    }
    marginLine();
  } else if (tpl === 'dot') {
    const step = prefs.grid * mm;
    c.fillStyle = dotCol;
    const r = 0.32 * mm;
    for (let y = step; y < H; y += step) {
      for (let x = step; x < W; x += step) {
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    marginLine();
  } else if (tpl === 'cornell') {
    const cue = Math.min(W * 0.32, 62 * mm);
    const head = 42 * mm;
    const sum = H - 58 * mm;
    hair(rule, 1);
    for (let y = head; y < sum - 2 * px; y += prefs.ruling * mm) line(cue + 4 * mm, y, W, y);
    hair(ruleMajor, 1.5);
    line(cue, head, cue, sum);
    line(0, sum, W, sum);
    line(0, head, W, head);
    marginLine();
  } else {
    // blank: nothing but the grain, a whisper of a header rule, and the margin
    if (prefs.margin) {
      hair('rgba(84,116,158,0.14)', 1);
      line(0, top, W, top);
    }
    marginLine();
  }

  // paper grain — cached tile, drawn once into the layer
  if (prefs.grain) {
    if (!grain) grain = grainTile(dpr);
    const pat = c.createPattern(grain, 'repeat');
    if (pat) {
      c.save();
      c.globalAlpha = dark ? 0.5 : 1;
      c.fillStyle = pat;
      c.fillRect(0, 0, W, H);
      c.restore();
    }
  }

  // a barely-there vignette, so the page has an edge like real paper
  if (prefs.grain) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, dark ? 'rgba(255,255,255,0.03)' : 'rgba(60,50,30,0.035)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  return cv;
}

/** Replacement for the engine's `bg`. */
function drawPaper(c: CanvasRenderingContext2D, tpl: string, col: string) {
  const W = ev<number>('W') || c.canvas.width;
  const H = ev<number>('H') || c.canvas.height;
  const dpr = Math.max(0.5, c.getTransform().a || 1);
  const key = [tpl, col, W, H, dpr, prefs.ruling, prefs.grid, prefs.margin, prefs.marginMm, prefs.grain].join('|');

  if (cache.key !== key || !cache.canvas || cache.canvas.width !== Math.round(W * dpr)) {
    cache.canvas = buildPaper(tpl, col, W, H, dpr);
    cache.key = key;
  }

  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(cache.canvas, 0, 0);
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Highlighter                                                         */
/* ------------------------------------------------------------------ */

/**
 * How a highlighter stroke composites on the page in front of you.
 *
 * Multiply on light paper is what makes a highlight look like ink soaked into
 * the sheet instead of paint sitting on top of it; on dark paper the same blend
 * would vanish, so it lightens instead. Exposed because a *snapped* highlighter
 * is a shape rather than a stroke, and the shape renderer has to agree with this
 * one or the same pen would look like two different pens.
 */
function hlMode(): GlobalCompositeOperation {
  const page = ev<any>('pg && pg()');
  const light = lum(paperColor(page)) > 0.45;
  return (prefs.hlBlend === 'auto' ? (light ? 'multiply' : 'lighten') : prefs.hlBlend === 'multiply' ? 'multiply' : 'source-over') as GlobalCompositeOperation;
}

/** The density a highlighter is painted at — per stroke, else the user's choice. */
function hlAlpha(s?: any): number {
  const v = s && s.ho != null ? s.ho : prefs.hlOpacity;
  return Math.min(0.95, Math.max(0.05, Number(v) || 0.34));
}

/**
 * A highlighter is a chisel nib: flat across, square at the ends, and it lets
 * whatever is underneath show through. Two passes — a soft shoulder and a
 * slightly stronger core — read as ink soaked into paper rather than a
 * translucent rectangle.
 */
function drawHighlighter(c: CanvasRenderingContext2D, s: any) {
  const p: number[][] = s.p;
  if (!p || !p.length) return;

  const mode = hlMode();
  const w = Math.max(1, s.w * 4);
  const alpha = hlAlpha(s);

  c.save();
  c.globalCompositeOperation = mode;
  c.strokeStyle = s.c;
  c.lineCap = 'butt';
  c.lineJoin = 'round';

  const trace = (width: number) => {
    c.lineWidth = width;
    c.beginPath();
    if (p.length === 1) {
      c.moveTo(p[0][0] - width / 2, p[0][1]);
      c.lineTo(p[0][0] + width / 2, p[0][1]);
      c.stroke();
      return;
    }
    c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2;
      const my = (p[i][1] + p[i + 1][1]) / 2;
      c.quadraticCurveTo(p[i][0], p[i][1], mx, my);
    }
    c.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
    c.stroke();
  };

  // shoulder: 6 % wider, a third of the density
  c.globalAlpha = alpha * 0.34;
  trace(w * 1.07);

  // core
  c.globalAlpha = alpha;
  trace(w);

  // a second core pass at a third of the density evens out the ends where the
  // butt cap leaves a corner of paper unpainted
  c.globalAlpha = alpha * 0.32;
  trace(w * 0.94);

  c.restore();
}

/* ------------------------------------------------------------------ */
/* Layering: highlighters under the ink                                */
/* ------------------------------------------------------------------ */

/**
 * Real highlighters go on first and the pen goes on top, which is also what
 * keeps black ink readable through yellow. The engine paints in insertion
 * order, so re-order the array at draw time rather than mutating the document.
 */
function installLayerOrder() {
  ev(`(function(){
    if (window.__paperLayerHooked) return;
    window.__paperLayerHooked = true;
    var orig = render1;
    render1 = function(c, S, L){
      if (!S || !S.length) return orig.apply(this, arguments);
      var hasHl = false, hasInk = false;
      for (var i=0;i<S.length;i++){ if(S[i].t==='hl') hasHl = true; else if(S[i].t!=='ers') hasInk = true; }
      if (!hasHl || !hasInk || window.__paperHlUnder === false) return orig.apply(this, arguments);
      var hl = [], rest = [];
      for (var j=0;j<S.length;j++) (S[j].t==='hl' ? hl : rest).push(S[j]);
      return orig.call(this, c, hl.concat(rest), L);
    };
  })()`);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function el(tag: string, css?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function group(d: HTMLElement, title: string, note?: string) {
  d.append(el('div', 'font-weight:600;margin:10px 0 4px;font-size:12px;color:var(--mu)', title));
  const g = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center');
  if (note) {
    const n = el(
      'div',
      'font-size:11px;color:var(--mu);opacity:.85;margin:-2px 0 4px',
      note,
    );
    d.append(n);
  }
  d.append(g);
  return g;
}

function chip(g: HTMLElement, label: string, on: boolean, fn: () => void, off?: string) {
  const b = el('button', '', label) as HTMLButtonElement;
  // the card flattens every engine button to one pale fill; these opt out so
  // the chosen one is visible (see the .pgm-chip rules in page-menu). A row
  // that cannot apply here is dashed and never looks chosen.
  b.className = 'pgm-chip' + (on && !off ? ' on' : '');
  b.style.cssText =
    'font-size:12px;padding:4px 9px;border-radius:9px;border:1px solid ' +
    (on ? 'var(--ac)' : 'var(--bd)') +
    ';background:' +
    (on ? 'color-mix(in srgb,var(--ac) 14%,transparent)' : 'transparent') +
    ';color:' +
    (on ? 'var(--ac)' : 'var(--tx)') +
    ';cursor:pointer';
  if (off) {
    // a control that cannot do anything on this page says so instead of
    // swallowing the click and looking broken
    b.disabled = true;
    b.title = off;
    b.style.cssText +=
      ';opacity:.38;cursor:default;border-style:dashed;background:transparent;color:var(--mu)';
  } else {
    b.onclick = fn;
  }
  g.append(b);
  return b;
}

/** The template of the page on screen, as the paper renderer names it. */
function currentTpl(): string {
  const sel = document.getElementById('tpl') as HTMLSelectElement | null;
  if (sel && sel.value) return sel.value;
  try {
    const p = ev<any>('pg && pg()');
    if (p && p.tpl) return String(p.tpl);
  } catch {
    /* fall through */
  }
  return 'lined';
}

/**
 * The paper rows, hosted by the Page menu.
 *
 * They used to be appended to the engine's Settings drawer, next to the
 * highlighter and the smart-ink switches — three blocks that all had a better
 * home. The smart switches are in Accessories, the highlighter's opacity and
 * blend are on its own tab, and paper detail belongs with the paper.
 */
function paperDetail(d: HTMLElement) {
  const tpl = currentTpl();
  // which rows of a page a setting can actually reach — the same split the
  // renderer makes, so nothing here is a control that paints nothing
  const ruled = tpl === 'lined' || tpl === 'cornell' || tpl === 'margin';
  const gridded = tpl === 'grid' || tpl === 'dot';

  // A page can still be carrying a ready-made paper from the drawer, which the
  // engine draws instead of the template. Say so, and offer the way out —
  // otherwise every control below is a switch that does nothing.
  if (ev<any>('pg && pg().pp')) {
    const g = group(
      d,
      'Ready-made paper',
      'This page has a paper of its own, which replaces the template. Changing anything below switches back to it.',
    );
    chip(g, 'Use the template', false, () => {
      dropOverride();
      invalidate();
      repaint();
      rerenderDrawer(d);
    });
  }

  const ruleG = group(
    d,
    'Paper ruling (mm)',
    ruled ? undefined : 'Rules are drawn on lined, lined + margin and Cornell pages.',
  );
  [5, 6, 7, 8, 9, 10].forEach((mm) => {
    chip(
      ruleG,
      String(mm),
      prefs.ruling === mm,
      () => {
        prefs.ruling = mm;
        savePrefs();
        rerenderDrawer(d);
      },
      ruled ? undefined : 'Not drawn on this paper',
    );
  });

  const gridG = group(
    d,
    'Grid & dots (mm)',
    gridded ? undefined : 'Spacing applies to grid and dotted pages.',
  );
  [4, 5, 6, 8, 10].forEach((mm) => {
    chip(
      gridG,
      String(mm),
      prefs.grid === mm,
      () => {
        prefs.grid = mm;
        savePrefs();
        rerenderDrawer(d);
      },
      gridded ? undefined : 'Not drawn on this paper',
    );
  });

  // The red rule is the point of the Lined + margin paper, so "Off" cannot
  // apply to it — but where it sits still can, which is why only one chip goes.
  const forced = tpl === 'margin';
  const marginG = group(
    d,
    'Margin',
    forced ? 'This paper always draws its rule; these set where it sits.' : undefined,
  );
  chip(
    marginG,
    'Off',
    !prefs.margin && !forced,
    () => {
      prefs.margin = false;
      savePrefs();
      rerenderDrawer(d);
    },
    forced ? 'Lined + margin always has a rule' : undefined,
  );
  chip(marginG, '20 mm', (prefs.margin || forced) && prefs.marginMm === 20, () => {
    prefs.margin = true;
    prefs.marginMm = 20;
    savePrefs();
    rerenderDrawer(d);
  });
  chip(marginG, '25 mm', (prefs.margin || forced) && prefs.marginMm === 25, () => {
    prefs.margin = true;
    prefs.marginMm = 25;
    savePrefs();
    rerenderDrawer(d);
  });

  const grainG = group(d, 'Paper texture');
  chip(grainG, 'Grain on', prefs.grain, () => {
    prefs.grain = !prefs.grain;
    savePrefs();
    rerenderDrawer(d);
  });
}

/** Rebuild the host in place so a chip reflects its new state immediately. */
function rerenderDrawer(d: HTMLElement) {
  const scroll = d.scrollTop;
  d.innerHTML = '';
  paperDetail(d);
  d.scrollTop = scroll;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  loadPrefs();
  ev(`try{ window.__paperHlUnder = ${prefs.hlUnder}; }catch(e){}`);

  // the functions stay in this module's scope; only the reference crosses over
  (window as any).__paperDraw = drawPaper;
  (window as any).__hlDraw = drawHighlighter;
  // The paper rows live in the Page menu now: the settings drawer is for
  // things with no other home, and the paper has a whole menu of its own.
  (window as any).__paperDetail = paperDetail;

  // paper: replace the engine's page background
  ev(`(function(){
    if (window.__paperBgHooked) return;
    window.__paperBgHooked = true;
    var orig = bg;
    bg = function(c, tpl, col){
      try { window.__paperDraw(c, tpl || 'blank', col || '#ffffff'); }
      catch(e) { return orig.apply(this, arguments); }
    };
  })()`);

  // Choosing a template or a paper colour in the Page card is choosing a paper,
  // so a ready-made paper from the drawer steps aside first — otherwise the
  // select changes a value that is never read and the page does not move.
  ev(`(function(){
    if (window.__paperSelHooked) return;
    window.__paperSelHooked = true;
    ['#tpl','#pc'].forEach(function(sel){
      var el = document.querySelector(sel);
      if (!el || el.__paperWrapped) return;
      el.__paperWrapped = 1;
      var orig = el.onchange;
      el.onchange = function(e){
        try { if (pg() && pg().pp) { delete pg().pp; save(); } } catch(err) {}
        var r = orig ? orig.call(this, e) : null;
        try { if (window.__inkpad_pagestrip) window.__inkpad_pagestrip.repaint(); } catch(err) {}
        return r;
      };
    });
  })()`);

  // highlighter: replace the flat translucent line
  ev(`(function(){
    if (window.__paperHlHooked) return;
    window.__paperHlHooked = true;
    var orig = stroke;
    stroke = function(c, s){
      if (s && s.t === 'hl' && !s.r && !(s.er && s.er.length) && s.p && s.p.length) {
        try { window.__hlDraw(c, s); return; } catch(e) {}
      }
      return orig.apply(this, arguments);
    };
  })()`);

  installLayerOrder();

  (window as any).__inkpad_paper = {
    prefs,
    invalidate,
    save: savePrefs,
    PX_PER_MM,
    /** For the shape renderer: a snapped highlighter must paint like a stroke. */
    hlMode,
    hlAlpha,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
