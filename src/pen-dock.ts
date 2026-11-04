/**
 * Pen dock — four pens lying in a pocket down the left edge of the page.
 *
 * Only the first quarter of each pen is visible, the way pens sit in a case:
 * the bodies run off the edge of the screen and the tips point at the paper.
 * Hovering slides one out a little, clicking pulls it out all the way and makes
 * it the active tool.
 *
 * The slots are not fixed to "pen / highlighter / eraser / eraser". Each one is
 * a full tool preset — pen, brush, highlighter, eraser, laser — with its own
 * nib width in millimetres, its own colour, and its own brush engine. Slots can
 * be edited, removed, and added (up to eight) from the dock's own settings
 * sheet.
 *
 * The two erasers and the two laser pointers are both represented: an eraser
 * slot carries `erase` (whole stroke or pixel), a laser slot carries `laser`
 * (stays while pressed, or fades). They are the engine's own two tools and two
 * trail modes, exposed here rather than hidden behind the toolbar.
 *
 * The dock can lie on any edge. On the left it is a column with the nibs
 * pointing right, and each side is the same idea rotated. Dragging is only
 * offered in focus mode (the lock button), where the dock is the only chrome
 * left on screen; the grip at the end of the rail moves it, and the nearest
 * edge wins on release. Holding a pen for a second lifts it out of the rail so
 * the order can be rearranged by hand — the arrows that used to live in the
 * settings sheet are gone, because the pens are right there.
 *
 * Thickness is millimetres first: 0.1 mm to 100 mm, on a logarithmic slider
 * plus a typed value, so a mouse or a finger can pick a 0.3 mm fineliner just as
 * easily as a 40 mm marker. A stylus is a nicety here, not a requirement.
 *
 * The width is not the dock's private business: the floating pill's dots and the
 * brush popover's slider are the same nib, so all three go through
 * `./widths`. A slot's millimetres are the dock's view of that record, and the
 * record wins — change the thickness in the pill and this slot follows.
 */

import {
  HL_SCALE,
  PX_PER_MM,
  mmOf,
  onWidth,
  setWidth as setModelWidth,
  type InkTool,
} from './widths';

/* ------------------------------------------------------------------ */
/* Engine access                                                       */
/* ------------------------------------------------------------------ */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T | null;
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type Kind = 'pen' | 'highlighter' | 'eraser' | 'laser';
type Brush = 'ball' | 'fountain' | 'brush' | 'pencil' | 'crayon' | 'marker';
/** Which edge the rail lies against. */
type Side = 'left' | 'right' | 'top' | 'bottom';

interface Slot {
  id: string;
  kind: Kind;
  brush: Brush;
  /** Nib width in millimetres. */
  mm: number;
  color: string;
  /** Eraser behaviour: whole stroke or pixel-level. */
  erase?: 'stroke' | 'pixel';
  /** Laser trail: stays while pressed, or fades behind the pointer. */
  laser?: 'hold' | 'fade';
}

/** Page units per millimetre: an A4 page is 800 × 1131 units for 210 × 297 mm. */
const MIN_MM = 0.1;
const MAX_MM = 100;

/**
 * The stock dock: three pens, a highlighter, an eraser and a pointer.
 *
 * The eraser and the pointer are here because they are the two tools people
 * reach for mid-sentence, and because each has two behaviours worth choosing
 * between — the sheet offers both.
 */
const DEFAULT_SLOTS: Slot[] = [
  { id: 'p1', kind: 'pen', brush: 'ball', mm: 0.4, color: '#111111' },
  { id: 'p2', kind: 'pen', brush: 'fountain', mm: 0.8, color: '#2f6df6' },
  { id: 'p3', kind: 'pen', brush: 'brush', mm: 2.2, color: '#e5383b' },
  { id: 'p4', kind: 'highlighter', brush: 'marker', mm: 4, color: '#ffd93d' },
  { id: 'p5', kind: 'eraser', brush: 'ball', mm: 1.6, color: '#f2b6c2', erase: 'stroke' },
  { id: 'p6', kind: 'laser', brush: 'ball', mm: 0.4, color: '#ff3b30', laser: 'hold' },
];

const BRUSHES: { id: Brush; name: string }[] = [
  { id: 'ball', name: 'Ballpoint' },
  { id: 'fountain', name: 'Fountain' },
  { id: 'brush', name: 'Brush' },
  { id: 'pencil', name: 'Pencil' },
  { id: 'crayon', name: 'Crayon' },
  { id: 'marker', name: 'Marker' },
];

const KINDS: { id: Kind; name: string }[] = [
  { id: 'pen', name: 'Pen' },
  { id: 'highlighter', name: 'Highlighter' },
  { id: 'eraser', name: 'Eraser' },
  { id: 'laser', name: 'Laser' },
];

const PALETTE = ['#111111', '#2f6df6', '#e5383b', '#2a9d4f', '#f4a300', '#8e44ad', '#16a2b8', '#ff7ab8', '#ffffff'];

const KEY = 'inkpad-pen-dock';
const ACTIVE_KEY = 'inkpad-pen-active';
/** Where the dock sat last time focus mode was on. */
const SIDE_KEY = 'inkpad-dock-focus-side';
/** One-shot: docks saved before the eraser and pointer existed gain them. */
const MIGRATED_KEY = 'inkpad-pen-dock-v2';

let slots: Slot[] = DEFAULT_SLOTS.map((s) => ({ ...s }));
let activeId = slots[0].id;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        slots = parsed
          .filter((s: any) => s && typeof s.id === 'string')
          .map((s: any) => ({
            id: s.id,
            kind: KINDS.some((k) => k.id === s.kind) ? s.kind : 'pen',
            brush: BRUSHES.some((b) => b.id === s.brush) ? s.brush : 'ball',
            mm: Math.max(MIN_MM, Math.min(MAX_MM, Number(s.mm) || 0.5)),
            color: typeof s.color === 'string' ? s.color : '#111111',
            erase: (s.erase === 'pixel' ? 'pixel' : 'stroke') as Slot['erase'],
            laser: (s.laser === 'fade' ? 'fade' : 'hold') as Slot['laser'],
          }))
          .slice(0, 8);
      }
    }
    const a = localStorage.getItem(ACTIVE_KEY);
    if (a && slots.some((s) => s.id === a)) activeId = a;
  } catch {
    /* keep defaults */
  }
  if (!slots.length) slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
  if (!slots.some((s) => s.id === activeId)) activeId = slots[0].id;
  migrate();
}

/**
 * Give an older dock the eraser and the pointer it never had.
 *
 * A dock saved before those two existed is a pen case with no rubber in it, and
 * the only way to get one was the "+" button followed by a trip through the
 * sheet. This adds them once, at the end, and never again — a dock the user
 * later trims down stays trimmed.
 */
function migrate() {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    const add: Slot[] = [];
    if (!slots.some((s) => s.kind === 'eraser')) add.push(DEFAULT_SLOTS[4]);
    if (!slots.some((s) => s.kind === 'laser')) add.push(DEFAULT_SLOTS[5]);
    for (const s of add) {
      if (slots.length >= 8) break;
      slots.push({ ...s, id: s.id + '-' + Math.random().toString(36).slice(2, 5) });
    }
    if (add.length) save();
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    /* a locked-down storage just means no migration */
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(slots));
    localStorage.setItem(ACTIVE_KEY, activeId);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Applying a slot to the engine                                       */
/* ------------------------------------------------------------------ */

/** The engine's own stroke width for a given tool, in page units. */
function engineWidth(s: Slot): number {
  // the highlighter renderer multiplies by four, so divide to stay honest
  return s.kind === 'highlighter' ? (s.mm * PX_PER_MM) / HL_SCALE : s.mm * PX_PER_MM;
}

/** Which of the shared width records this slot speaks for. */
function slotTool(s: Slot): InkTool {
  if (s.kind === 'highlighter') return 'hl';
  if (s.kind === 'eraser') return s.erase === 'pixel' ? 'pe' : 'er';
  return 'pen';
}

function apply(s: Slot, opts: { keepSelection?: boolean } = {}) {
  activeId = s.id;
  save();

  const tool = s.kind === 'pen' ? 'pen' : s.kind === 'highlighter' ? 'hl' : s.kind === 'eraser' ? (s.erase === 'pixel' ? 'pe' : 'er') : 'laser';
  const width = Math.max(0.4, Math.min(240, engineWidth(s)));

  ev(`(function(){
    try{
      tool = ${JSON.stringify(tool)};
      ${opts.keepSelection ? '' : 'sel = [];'}
      ${s.kind === 'laser' ? `LM = ${JSON.stringify(s.laser ?? 'hold')}; try{ localStorage.setItem('inkpad-laser', LM); }catch(e){}` : ''}
      if (typeof setCol === 'function') setCol(${JSON.stringify(s.color)});
      else { color = ${JSON.stringify(s.color)}; const c = document.getElementById('col'); if (c) c.value = ${JSON.stringify(s.color)}; }
      if (typeof setBrush === 'function') setBrush(${width}, 1);
      else { size = ${width}; }
      const pt = document.getElementById('pt');
      if (pt) pt.value = ${JSON.stringify(s.brush)};
      syncTools(); draw();
    }catch(e){}
  })()`);

  // Record the nib *after* the engine has it. The record's listeners read the
  // engine to stay honest, so writing it first would let them see the old width
  // and adopt it straight back over the new one.
  if (s.kind !== 'laser') setModelWidth(slotTool(s), width, { apply: false });

  paint();
}

/** Restore the dock's active pen when the user comes back to a notebook. */
function reapply() {
  const s = slots.find((x) => x.id === activeId);
  if (s) apply(s);
}

/* ------------------------------------------------------------------ */
/* Pen drawing                                                         */
/* ------------------------------------------------------------------ */
/** Art width, in px. A quarter of this (55 px) is what stays on screen. */
const ART_W = 220;

function penSvg(s: Slot): string {
  const body = s.color;
  const dark = shade(body, -0.42);
  const light = shade(body, 0.34);
  const cap = shade(body, -0.2);
  const metal = '#cbd4e0';
  const metalDark = '#8f9bad';

  const open = `<svg viewBox="0 0 ${ART_W} 24" width="${ART_W}" height="24" aria-hidden="true">`;

  // The barrel runs off the left edge; the 55 px that stay on screen are the
  // cap end. Every part overlaps its neighbour — a 3 px seam at this size reads
  // as two separate objects, which is what makes an icon look like a block.
  if (s.kind === 'eraser') {
    return `${open}
      <rect x="-24" y="5" width="184" height="14" fill="#f2b6c2"/>
      <rect x="-24" y="6.2" width="184" height="4.6" fill="#ffd9e1" opacity=".85"/>
      <rect x="-24" y="15.6" width="184" height="3.4" fill="#c98c99" opacity=".45"/>
      <rect x="156" y="4.2" width="34" height="15.6" fill="#eef1f6"/>
      <rect x="156" y="4.2" width="34" height="4.6" fill="#ffffff" opacity=".9"/>
      <rect x="188" y="3.6" width="7" height="16.8" rx="1.4" fill="${metal}"/>
      <rect x="188" y="3.6" width="7" height="5" rx="1.4" fill="#ffffff" opacity=".6"/>
      <rect x="194" y="4.2" width="26" height="15.6" rx="5" fill="#dfe4ec"/>
      <rect x="195.5" y="5.6" width="23" height="4.6" rx="2.3" fill="#ffffff" opacity=".7"/>
      <rect x="194" y="15.6" width="26" height="4.2" rx="2.1" fill="#b9c1cd" opacity=".35"/>
    </svg>`;
  }
  if (s.kind === 'laser') {
    return `${open}
      <rect x="-24" y="5" width="196" height="14" fill="#2b3442"/>
      <rect x="-24" y="6.2" width="196" height="4.6" fill="#54637a" opacity=".9"/>
      <rect x="-24" y="15.6" width="196" height="3.4" fill="#0d1219" opacity=".55"/>
      <rect x="166" y="4" width="9" height="16" rx="1.5" fill="#9aa6b8"/>
      <rect x="166" y="4" width="9" height="5" rx="1.5" fill="#e6ebf2" opacity=".8"/>
      <rect x="174" y="4.4" width="34" height="15.2" rx="5" fill="#39424f"/>
      <rect x="175.5" y="5.8" width="31" height="4.4" rx="2.2" fill="#66748a" opacity=".85"/>
      <rect x="174" y="15.6" width="34" height="4" rx="2" fill="#141a22" opacity=".6"/>
      <rect x="205" y="5.4" width="15" height="13.2" rx="5" fill="#232a34"/>
      <circle cx="212" cy="12" r="3" fill="#ff3b30"/>
      <circle cx="212" cy="12" r="1.4" fill="#ffd6d2"/>
    </svg>`;
  }
  if (s.kind === 'highlighter') {
    return `${open}
      <rect x="-24" y="3.8" width="198" height="16.4" fill="${body}"/>
      <rect x="-24" y="5" width="198" height="5.2" fill="#ffffff" opacity=".42"/>
      <rect x="-24" y="16.4" width="198" height="3.8" fill="${dark}" opacity=".2"/>
      <rect x="108" y="9.4" width="36" height="5.4" rx="2.7" fill="${dark}" opacity=".28"/>
      <rect x="166" y="3.2" width="8" height="17.6" rx="1.6" fill="${metal}"/>
      <rect x="166" y="3.2" width="8" height="5.2" rx="1.6" fill="#ffffff" opacity=".55"/>
      <rect x="172" y="3.6" width="42" height="16.8" rx="5.4" fill="${light}"/>
      <rect x="173.5" y="5" width="39" height="5.2" rx="2.6" fill="#ffffff" opacity=".6"/>
      <rect x="172" y="16.2" width="42" height="4.2" rx="2.1" fill="${dark}" opacity=".18"/>
      <rect x="206" y="4.6" width="8" height="14.8" rx="4" fill="${dark}" opacity=".18"/>
    </svg>`;
  }

  return `${open}
    <rect x="-24" y="5" width="192" height="14" fill="${body}"/>
    <rect x="-24" y="6.2" width="192" height="4.6" fill="${light}" opacity=".5"/>
    <rect x="-24" y="15.6" width="192" height="3.4" fill="${dark}" opacity=".28"/>
    <rect x="156" y="5" width="12" height="14" fill="${dark}" opacity=".12"/>
    <rect x="164" y="4.2" width="8" height="15.6" rx="1.4" fill="${metal}"/>
    <rect x="164" y="4.2" width="8" height="4.6" rx="1.4" fill="#ffffff" opacity=".55"/>
    <rect x="169" y="4.2" width="43" height="15.6" rx="5" fill="${cap}"/>
    <rect x="170.5" y="5.6" width="40" height="4.6" rx="2.3" fill="${light}" opacity=".5"/>
    <rect x="169" y="15.4" width="43" height="4.4" rx="2.2" fill="${dark}" opacity=".26"/>
    <rect x="203" y="4.2" width="9" height="15.6" rx="4.5" fill="${dark}" opacity=".2"/>
    <rect x="178" y="2.6" width="32" height="4.6" rx="2.3" fill="${metal}"
          stroke="${metalDark}" stroke-width=".8" stroke-opacity=".8"/>
    <rect x="178" y="6.4" width="32" height=".9" fill="${metalDark}" opacity=".45"/>
  </svg>`;
}

function shade(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const to = (v: number) => {
    const n = amount < 0 ? v * (1 + amount) : v + (255 - v) * amount;
    return Math.max(0, Math.min(255, Math.round(n)));
  };
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].map(to);
  return `rgb(${r},${g},${b})`;
}

/* ------------------------------------------------------------------ */
/* Dock UI                                                             */
/* ------------------------------------------------------------------ */

let dock: HTMLElement | null = null;
let sheet: HTMLElement | null = null;
let editing = 0;
/** Which edge the rail is on, and whether focus mode is what put it there. */
let side: Side = 'left';
let focus = false;

/** Hold a pen this long and it comes out of the rail, ready to be reordered. */
const HOLD_REORDER = 1000;

function mmLabel(mm: number): string {
  return mm < 1 ? `${mm.toFixed(2)} mm` : `${mm.toFixed(mm < 10 ? 1 : 0)} mm`;
}

function kindName(s: Slot): string {
  if (s.kind === 'pen') return `${BRUSHES.find((b) => b.id === s.brush)?.name ?? 'Pen'} · ${mmLabel(s.mm)}`;
  if (s.kind === 'highlighter') return `Highlighter · ${mmLabel(s.mm)}`;
  if (s.kind === 'eraser') return `${s.erase === 'pixel' ? 'Pixel eraser' : 'Stroke eraser'} · ${mmLabel(s.mm)}`;
  return `Pointer · ${s.laser === 'fade' ? 'fades' : 'stays'}`;
}

/* ------------------------------------------------------------------ */
/* Where the dock lies                                                 */
/* ------------------------------------------------------------------ */

function readSide(): Side {
  try {
    const v = localStorage.getItem(SIDE_KEY);
    if (v === 'left' || v === 'right' || v === 'top' || v === 'bottom') return v;
  } catch {
    /* fall through */
  }
  // Focus mode puts the pens along the top: the page keeps its full height and
  // the hand does not have to travel to the edge of a wide screen to change pen.
  return 'top';
}

function saveSide() {
  try {
    localStorage.setItem(SIDE_KEY, side);
  } catch {
    /* ignore */
  }
}

function applySide() {
  if (!dock) return;
  dock.dataset.side = side;
  document.body.dataset.pd = side;
}

/** Focus mode owns the placement; the normal dock is always a left rail. */
function setFocus(on: boolean) {
  if (on === focus) return;
  focus = on;
  side = on ? readSide() : 'left';
  dock?.classList.toggle('pd-focus', on);
  applySide();
}

function buildDock() {
  if (dock) return;

  dock = el('div');
  dock.id = 'pen-dock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Pens');

  const rail = el('div', '');
  rail.className = 'pd-rail';
  dock.append(rail);

  const foot = el('div', '');
  foot.className = 'pd-foot';

  const grip = el('button', '') as HTMLButtonElement;
  grip.type = 'button';
  grip.className = 'pd-grip';
  grip.title = 'Drag to another edge';
  grip.setAttribute('aria-label', 'Move the pens to another edge');
  grip.innerHTML =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/></svg>';
  grip.onpointerdown = startDrag;

  const add = el('button', '') as HTMLButtonElement;
  add.type = 'button';
  add.className = 'pd-add';
  add.title = 'Add a pen';
  add.setAttribute('aria-label', 'Add a pen');
  add.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  add.onclick = (e) => {
    e.stopPropagation();
    if (slots.length >= 8) {
      toast('Eight pens is the limit');
      return;
    }
    const s: Slot = {
      id: 'p' + Math.random().toString(36).slice(2, 8),
      kind: 'pen',
      brush: 'ball',
      mm: 0.5,
      color: PALETTE[slots.length % PALETTE.length],
    };
    slots.push(s);
    save();
    paint();
    openSheet(slots.length - 1);
  };

  const gear = el('button', '') as HTMLButtonElement;
  gear.type = 'button';
  gear.className = 'pd-gear';
  gear.title = 'Set up the pens';
  gear.setAttribute('aria-label', 'Set up the pens');
  gear.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/></svg>';
  gear.onclick = (e) => {
    e.stopPropagation();
    openSheet(0);
  };

  foot.append(grip, add, gear);
  dock.append(foot);
  document.body.append(dock);

  applySide();
  paint();
}

function paint() {
  if (!dock) return;
  const rail = dock.querySelector('.pd-rail') as HTMLElement;
  rail.innerHTML = '';

  slots.forEach((s, i) => {
    const slot = el('div', '');
    slot.className = 'pd-slot' + (s.id === activeId ? ' on' : '');
    slot.dataset.i = String(i);
    slot.style.setProperty('--pen', s.color);
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-label', kindName(s));
    slot.title = `${kindName(s)} — hold to move it`;

    const art = el('div', '');
    art.className = 'pd-art';
    art.innerHTML = penSvg(s);

    const tag = el('span', '');
    tag.className = 'pd-tag';
    tag.textContent = `${i + 1}`;

    slot.append(art, tag);

    slot.onpointerdown = (e) => armPress(i, slot, e);
    slot.onclick = (e) => {
      e.stopPropagation();
      if (Date.now() < noClick) return;
      if (s.id === activeId && Date.now() - (lastTap.at ?? 0) < 420 && lastTap.i === i) {
        openSheet(i);
        return;
      }
      lastTap = { at: Date.now(), i };
      apply(s);
    };
    slot.oncontextmenu = (e) => {
      e.preventDefault();
      openSheet(i);
    };
    slot.onwheel = (e) => {
      if (s.id !== activeId) return;
      e.preventDefault();
      const step = e.deltaY < 0 ? 1 : -1;
      const next = clampMm(s.mm * (step > 0 ? 1.15 : 1 / 1.15));
      s.mm = next;
      save();
      apply(s);
    };
    rail.append(slot);
  });

  dock.classList.toggle('empty', !slots.length);
  const add = dock.querySelector('.pd-add') as HTMLElement;
  if (add) add.style.display = slots.length >= 8 ? 'none' : '';
  dock.dataset.active = String(slots.findIndex((s) => s.id === activeId));
}

let lastTap: { at: number; i: number } = { at: 0, i: -1 };

function clampMm(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Math.max(MIN_MM, Math.min(MAX_MM, r));
}

/* ------------------------------------------------------------------ */
/* Hold a pen to rearrange the rail                                    */
/* ------------------------------------------------------------------ */

/**
 * A press that lasts a second lifts the pen out of the rail.
 *
 * The pens are the reorder control now, so the arrows that used to sit in the
 * settings sheet are gone. The press is armed on pointerdown and dropped the
 * moment the pointer travels more than a few pixels — otherwise every click
 * would have to survive a second of standing still before it counted.
 */
let press: { x: number; y: number; i: number; node: HTMLElement; timer: number } | null = null;
let reorder: { from: number; to: number; node: HTMLElement; grab: { x: number; y: number } } | null = null;
let line: HTMLElement | null = null;
/** Clicks that land inside this window are the tail of a reorder, not a pick. */
let noClick = 0;

function armPress(i: number, node: HTMLElement, e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  cancelPress();
  const p = { x: e.clientX, y: e.clientY, i, node, timer: 0 };
  p.timer = window.setTimeout(() => {
    if (press !== p) return;
    beginReorder(p.i, p.node, p.x, p.y);
  }, HOLD_REORDER);
  press = p;
}

function cancelPress() {
  if (!press) return;
  window.clearTimeout(press.timer);
  press = null;
}

function beginReorder(i: number, node: HTMLElement, x: number, y: number) {
  cancelPress();
  if (!dock || !slots[i]) return;
  const box = node.getBoundingClientRect();
  reorder = { from: i, to: i, node, grab: { x: x - box.left, y: y - box.top } };
  dock.classList.add('pd-sorting');
  node.classList.add('pd-lift');
  // a short tick so the lift is felt, not only seen
  try {
    (window as any).__inkpad_sfx?.play?.('tap');
  } catch {
    /* sound is optional */
  }
}

/** Carry the lifted pen with the pointer, so the gap it will fill is obvious. */
function dragLifted(x: number, y: number) {
  if (!reorder) return;
  const node = reorder.node;
  const rail = node.parentElement as HTMLElement;
  // the rail is the offset parent, so this is the slot's home, not its carried
  // position — measuring the live rect would feed the translation back in
  const railBox = rail.getBoundingClientRect();
  const dx = x - reorder.grab.x - (railBox.left + node.offsetLeft);
  const dy = y - reorder.grab.y - (railBox.top + node.offsetTop);
  node.style.transform = `translate(${dx}px,${dy}px) scale(1.06)`;
}

/** Where the lifted pen would land, counted against the slots still in place. */
function dropIndex(x: number, y: number): number {
  const rail = dock?.querySelector('.pd-rail') as HTMLElement | null;
  if (!rail) return 0;
  const horiz = side === 'top' || side === 'bottom';
  let n = 0;
  rail.querySelectorAll<HTMLElement>('.pd-slot').forEach((node, idx) => {
    if (reorder && idx === reorder.from) return;
    const r = node.getBoundingClientRect();
    const mid = horiz ? r.left + r.width / 2 : r.top + r.height / 2;
    if ((horiz ? x : y) > mid) n++;
  });
  return n;
}

function paintLine() {
  const rail = dock?.querySelector('.pd-rail') as HTMLElement | null;
  if (!rail || !reorder) return;
  if (!line) {
    line = el('div', '');
    line.className = 'pd-line';
    rail.append(line);
  }
  const horiz = side === 'top' || side === 'bottom';
  const nodes = [...rail.querySelectorAll<HTMLElement>('.pd-slot')].filter((_, i) => i !== reorder!.from);
  const railBox = rail.getBoundingClientRect();
  const at = reorder.to;

  if (!nodes.length) {
    line.style.left = horiz ? '50%' : '0';
    line.style.top = horiz ? '0' : '50%';
    return;
  }
  if (at < nodes.length) {
    const r = nodes[at].getBoundingClientRect();
    if (horiz) {
      line.style.left = `${r.left - railBox.left - 4}px`;
      line.style.top = `${r.top - railBox.top}px`;
      line.style.width = '2px';
      line.style.height = `${r.height}px`;
    } else {
      line.style.left = `${r.left - railBox.left}px`;
      line.style.top = `${r.top - railBox.top - 4}px`;
      line.style.width = `${r.width}px`;
      line.style.height = '2px';
    }
  } else {
    const r = nodes[nodes.length - 1].getBoundingClientRect();
    if (horiz) {
      line.style.left = `${r.right - railBox.left + 2}px`;
      line.style.top = `${r.top - railBox.top}px`;
      line.style.width = '2px';
      line.style.height = `${r.height}px`;
    } else {
      line.style.left = `${r.left - railBox.left}px`;
      line.style.top = `${r.bottom - railBox.top + 2}px`;
      line.style.width = `${r.width}px`;
      line.style.height = '2px';
    }
  }
}

function endReorder(commit: boolean) {
  if (!reorder) return;
  const { from, to, node } = reorder;
  node.classList.remove('pd-lift');
  node.style.transform = '';
  line?.remove();
  line = null;
  dock?.classList.remove('pd-sorting');
  reorder = null;
  noClick = Date.now() + 400;
  if (!commit) return;
  const [s] = slots.splice(from, 1);
  slots.splice(Math.max(0, Math.min(slots.length, to)), 0, s);
  save();
  paint();
}

window.addEventListener(
  'pointermove',
  (e) => {
    if (press && !reorder && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
    if (reorder) {
      reorder.to = dropIndex(e.clientX, e.clientY);
      dragLifted(e.clientX, e.clientY);
      paintLine();
    }
  },
  true
);

window.addEventListener(
  'pointerup',
  () => {
    cancelPress();
    if (reorder) endReorder(true);
  },
  true
);

window.addEventListener('pointercancel', () => {
  cancelPress();
  if (reorder) endReorder(false);
});

/* ------------------------------------------------------------------ */
/* Drag the whole rail to another edge (focus mode only)               */
/* ------------------------------------------------------------------ */

function startDrag(e: PointerEvent) {
  if (!focus || !dock) return;
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  const box = dock.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  dock.classList.add('pd-dragging');

  const move = (m: PointerEvent) => {
    dock!.style.setProperty('--dx', `${m.clientX - startX}px`);
    dock!.style.setProperty('--dy', `${m.clientY - startY}px`);
  };
  const up = (u: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    dock?.classList.remove('pd-dragging');
    const x = cx + (u.clientX - startX);
    const y = cy + (u.clientY - startY);
    const gap = { left: x, right: window.innerWidth - x, top: y, bottom: window.innerHeight - y };
    side = (Object.keys(gap) as Side[]).sort((a, b) => gap[a] - gap[b])[0];
    saveSide();
    applySide();
    dock?.style.removeProperty('--dx');
    dock?.style.removeProperty('--dy');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/* ------------------------------------------------------------------ */
/* Settings sheet                                                      */
/* ------------------------------------------------------------------ */

function buildSheet() {
  if (sheet) return;
  sheet = el('div');
  sheet.id = 'pen-sheet';
  sheet.innerHTML = '<div class="ps-head"><b>Pens in the dock</b><button class="ps-x" aria-label="Close">✕</button></div><div class="ps-body"></div>';
  document.body.append(sheet);
  (sheet.querySelector('.ps-x') as HTMLElement).onclick = closeSheet;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!sheet || !sheet.classList.contains('on')) return;
      const t = e.target as HTMLElement;
      if (sheet.contains(t) || t.closest('#pen-dock')) return;
      closeSheet();
    },
    true
  );
}

function closeSheet() {
  sheet?.classList.remove('on');
}

function openSheet(index: number) {
  buildSheet();
  if (!sheet) return;
  editing = Math.max(0, Math.min(slots.length - 1, index));
  renderSheet();
  sheet.classList.add('on');
}

function renderSheet() {
  if (!sheet) return;
  const body = sheet.querySelector('.ps-body') as HTMLElement;
  body.innerHTML = '';

  slots.forEach((s, i) => {
    const row = el('div', '');
    row.className = 'ps-row' + (i === editing ? ' on' : '');
    row.dataset.id = s.id;

    const head = el('div', '');
    head.className = 'ps-rowhead';

    const chip = el('span', '');
    chip.className = 'ps-chip';
    chip.style.background = s.color;
    chip.textContent = String(i + 1);

    const name = el('b', '', kindName(s));
    name.className = 'ps-name';

    const pick = el('button', '', 'Use') as HTMLButtonElement;
    pick.className = 'ps-mini';
    pick.onclick = () => {
      apply(s);
      closeSheet();
    };

    const del = el('button', '', '✕') as HTMLButtonElement;
    del.className = 'ps-mini ps-del';
    del.title = 'Remove this pen';
    del.onclick = () => {
      if (slots.length <= 1) {
        toast('Keep at least one pen');
        return;
      }
      slots = slots.filter((x) => x.id !== s.id);
      if (activeId === s.id) activeId = slots[0].id;
      save();
      paint();
      editing = Math.min(editing, slots.length - 1);
      renderSheet();
      reapply();
    };

    head.append(chip, name, pick, del);
    row.append(head);

    // which tool
    const kinds = el('div', '');
    kinds.className = 'ps-kinds';
    KINDS.forEach((k) => {
      const b = el('button', '', k.name) as HTMLButtonElement;
      b.className = 'ps-k' + (s.kind === k.id ? ' on' : '');
      b.onclick = () => {
        s.kind = k.id;
        if (k.id === 'highlighter' && s.mm < 1) s.mm = 4;
        save();
        paint();
        renderSheet();
      };
      kinds.append(b);
    });
    row.append(kinds);

    // brush engine (pens only)
    if (s.kind === 'pen') {
      const brushes = el('div', '');
      brushes.className = 'ps-brushes';
      BRUSHES.forEach((b) => {
        const btn = el('button', '', b.name) as HTMLButtonElement;
        btn.className = 'ps-b' + (s.brush === b.id ? ' on' : '');
        btn.onclick = () => {
          s.brush = b.id;
          save();
          paint();
          renderSheet();
        };
        brushes.append(btn);
      });
      row.append(brushes);
    }

    // thickness: log slider + typed millimetres. A pointer has no nib, so the
    // whole block is left out for it rather than shown and ignored.
    const hasNib = s.kind !== 'laser';
    const th = el('div', '');
    th.className = 'ps-thick';
    const lab = el('label', '', 'Thickness');
    const slider = el('input') as HTMLInputElement;
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1000';
    slider.step = '1';
    slider.value = String(mmToSlider(s.mm));
    slider.setAttribute('aria-label', 'Thickness in millimetres');
    const num = el('input') as HTMLInputElement;
    num.type = 'number';
    num.min = String(MIN_MM);
    num.max = String(MAX_MM);
    num.step = '0.1';
    num.value = s.mm.toFixed(2).replace(/0$/, '');
    num.setAttribute('aria-label', 'Thickness');

    const setMm = (v: number, fromNum = false) => {
      s.mm = clampMm(v);
      if (!fromNum) num.value = s.mm.toFixed(2).replace(/0$/, '');
      slider.value = String(mmToSlider(s.mm));
      save();
      paint();
      if (s.id === activeId) apply(s, { keepSelection: true });
      name.textContent = kindName(s);
    };
    slider.oninput = () => setMm(sliderToMm(Number(slider.value)));
    num.oninput = () => setMm(Number(num.value) || MIN_MM, true);
    num.onblur = () => {
      num.value = s.mm.toFixed(2).replace(/0$/, '');
    };

    const unit = el('span', '', 'mm');
    unit.className = 'ps-unit';
    th.append(lab, slider, num, unit);
    if (hasNib) row.append(th);

    // presets
    const presets = el('div', '');
    presets.className = 'ps-presets';
    [0.1, 0.3, 0.5, 1, 2, 4, 8, 15, 40, 100].forEach((mm) => {
      const b = el('button', '', String(mm)) as HTMLButtonElement;
      b.title = `${mm} mm`;
      b.onclick = () => setMm(mm);
      presets.append(b);
    });
    if (hasNib) row.append(presets);

    // colour
    const colors = el('div', '');
    colors.className = 'ps-colors';
    PALETTE.forEach((c) => {
      const b = el('button', '') as HTMLButtonElement;
      b.className = 'ps-c' + (s.color.toLowerCase() === c.toLowerCase() ? ' on' : '');
      b.style.background = c;
      b.setAttribute('aria-label', 'Colour ' + c);
      b.onclick = () => {
        s.color = c;
        save();
        paint();
        renderSheet();
        if (s.id === activeId) apply(s, { keepSelection: true });
      };
      colors.append(b);
    });
    const custom = el('input') as HTMLInputElement;
    custom.type = 'color';
    custom.value = s.color.startsWith('#') ? s.color : '#111111';
    custom.className = 'ps-custom';
    custom.setAttribute('aria-label', 'Custom colour');
    custom.oninput = () => {
      s.color = custom.value;
      save();
      paint();
      if (s.id === activeId) apply(s, { keepSelection: true });
    };
    colors.append(custom);
    row.append(colors);

    if (s.kind === 'eraser') {
      const er = el('div', '');
      er.className = 'ps-erase';
      (['stroke', 'pixel'] as const).forEach((mode) => {
        const b = el('button', '', mode === 'stroke' ? 'Whole stroke' : 'Pixel eraser') as HTMLButtonElement;
        b.title =
          mode === 'stroke'
            ? 'Removes the whole stroke you touch'
            : 'Wipes only the ink under the nib, like a real eraser';
        b.className = 'ps-b' + ((s.erase ?? 'stroke') === mode ? ' on' : '');
        b.onclick = () => {
          s.erase = mode;
          save();
          paint();
          renderSheet();
          if (s.id === activeId) apply(s);
        };
        er.append(b);
      });
      row.append(er);
    }

    if (s.kind === 'laser') {
      const ls = el('div', '');
      ls.className = 'ps-erase';
      (['hold', 'fade'] as const).forEach((mode) => {
        const b = el('button', '', mode === 'hold' ? 'Stays while pressed' : 'Fades as you draw') as HTMLButtonElement;
        b.title = mode === 'hold' ? 'The trail stays put until you lift' : 'The trail chases the pointer and disappears';
        b.className = 'ps-b' + ((s.laser ?? 'hold') === mode ? ' on' : '');
        b.onclick = () => {
          s.laser = mode;
          save();
          paint();
          renderSheet();
          if (s.id === activeId) apply(s);
        };
        ls.append(b);
      });
      row.append(ls);
    }

    body.append(row);
  });
}

/**
 * Take a thickness that was set somewhere else — the pill's dots, the popover's
 * slider, the engine's own size control — and show it on the slot it belongs to.
 *
 * Only the active slot can be the one in hand, so only that one moves. The
 * inputs are rewritten in place rather than by re-rendering the sheet: a full
 * render would drop the node under the user's finger.
 */
function syncFromRecord(t: InkTool) {
  const s = slots.find((x) => x.id === activeId);
  if (!s || slotTool(s) !== t) return;
  const mm = Math.round(mmOf(t) * 100) / 100;
  if (Math.abs(mm - s.mm) < 0.005) return;
  s.mm = clampMm(mm);
  save();
  paint();

  const row = sheet?.querySelector<HTMLElement>(`.ps-row[data-id="${s.id}"]`);
  if (!row) return;
  const range = row.querySelector<HTMLInputElement>('.ps-thick input[type=range]');
  const num = row.querySelector<HTMLInputElement>('.ps-thick input[type=number]');
  const name = row.querySelector<HTMLElement>('.ps-name');
  if (range) range.value = String(mmToSlider(s.mm));
  if (num) num.value = s.mm.toFixed(2).replace(/0$/, '');
  if (name) name.textContent = kindName(s);
}

function mmToSlider(mm: number): number {
  // log scale from 0.1 to 100
  const t = (Math.log(mm) - Math.log(MIN_MM)) / (Math.log(MAX_MM) - Math.log(MIN_MM));
  return Math.round(Math.max(0, Math.min(1, t)) * 1000);
}

function sliderToMm(v: number): number {
  const t = v / 1000;
  return Math.exp(Math.log(MIN_MM) + t * (Math.log(MAX_MM) - Math.log(MIN_MM)));
}

function toast(msg: string) {
  ev(`try{ toast(${JSON.stringify(msg)}) }catch(e){}`);
}

/* ------------------------------------------------------------------ */
/* Visibility + keyboard                                               */
/* ------------------------------------------------------------------ */

function editorOpen(): boolean {
  const ed = document.getElementById('ed');
  return !!ed && getComputedStyle(ed).display !== 'none';
}

function tick() {
  if (!dock) return;
  const open = editorOpen();
  dock.classList.toggle('on', open);
  document.body.classList.toggle('pd-open', open);
  if (!open) closeSheet();
  // focus mode is a document-level fact, so read it rather than being told:
  // whichever module loads first, the rail ends up on the right edge.
  const want = document.documentElement.dataset.focus === '1';
  if (want !== focus) setFocus(want);
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
/* The rail is one object that lies against an edge. Each side is the same
   idea rotated: the nib points at the page, the barrel runs off screen. */
#pen-dock{
  --slot-w:55px;--slot-h:30px;--pull:8px;--dx:0px;--dy:0px;
  position:fixed;z-index:34;display:none;gap:6px;
  padding:8px 0;pointer-events:none;
  transition:transform .18s cubic-bezier(.22,.8,.3,1);
}
#pen-dock.on{display:flex;pointer-events:auto}
#pen-dock[data-side=left]{left:0;top:50%;transform:translateY(-50%) translateX(-8px) translate(var(--dx),var(--dy))}
#pen-dock[data-side=left].on{transform:translateY(-50%) translateX(0) translate(var(--dx),var(--dy))}
#pen-dock[data-side=right]{right:0;top:50%;transform:translateY(-50%) translateX(8px) translate(var(--dx),var(--dy))}
#pen-dock[data-side=right].on{transform:translateY(-50%) translateX(0) translate(var(--dx),var(--dy))}
#pen-dock[data-side=top]{top:0;left:50%;transform:translateX(-50%) translateY(-8px) translate(var(--dx),var(--dy))}
#pen-dock[data-side=top].on{transform:translateX(-50%) translateY(0) translate(var(--dx),var(--dy))}
#pen-dock[data-side=bottom]{bottom:0;left:50%;transform:translateX(-50%) translateY(8px) translate(var(--dx),var(--dy))}
#pen-dock[data-side=bottom].on{transform:translateX(-50%) translateY(0) translate(var(--dx),var(--dy))}
#pen-dock[data-side=top],#pen-dock[data-side=bottom]{--slot-w:30px;--slot-h:55px;flex-direction:column;padding:0 8px}
#pen-dock[data-side=left],#pen-dock[data-side=right]{flex-direction:column}
#pen-dock.pd-dragging{transition:none;z-index:70;cursor:grabbing}
#pen-dock.pd-dragging .pd-art{transition:none}

#pen-dock .pd-rail{position:relative;display:flex;flex-direction:column;gap:6px}
#pen-dock[data-side=top] .pd-rail,#pen-dock[data-side=bottom] .pd-rail{flex-direction:row}
#pen-dock .pd-slot{
  position:relative;height:var(--slot-h);width:var(--slot-w);display:flex;align-items:center;
  cursor:pointer;overflow:hidden;border-radius:0 10px 10px 0;
  transition:background .14s ease,opacity .14s ease,transform .14s ease;
  /* a held pen is dragged, so the browser must not claim the gesture for a
     scroll or a text selection halfway through it */
  touch-action:none;user-select:none;-webkit-user-select:none;
}
#pen-dock[data-side=right] .pd-slot{border-radius:10px 0 0 10px}
#pen-dock[data-side=top] .pd-slot{border-radius:0 0 10px 10px}
#pen-dock[data-side=bottom] .pd-slot{border-radius:10px 10px 0 0}
#pen-dock .pd-slot:hover{background:color-mix(in srgb,var(--ac,#2f6df6) 8%,transparent)}
#pen-dock .pd-art{
  position:absolute;left:0;top:50%;width:220px;height:24px;
  transform-origin:220px 12px;
  transition:transform .2s cubic-bezier(.22,.8,.3,1);
  filter:drop-shadow(0 2px 3px rgba(10,20,40,.26));
  will-change:transform;
}
/* left: tip at the right, barrel off to the left */
#pen-dock[data-side=left] .pd-art{transform:translate(-165px,-50%)}
#pen-dock[data-side=left] .pd-slot:hover .pd-art{transform:translate(calc(-165px + var(--pull)),-50%)}
#pen-dock[data-side=left] .pd-slot.on .pd-art{transform:translate(calc(-165px + var(--pull) * 2),-50%)}
/* right: mirrored about the tip, so the nib points left into the page */
#pen-dock[data-side=right] .pd-art{transform:translate(-220px,-50%) scaleX(-1)}
#pen-dock[data-side=right] .pd-slot:hover .pd-art{transform:translate(calc(-220px - var(--pull)),-50%) scaleX(-1)}
#pen-dock[data-side=right] .pd-slot.on .pd-art{transform:translate(calc(-220px - var(--pull) * 2),-50%) scaleX(-1)}
/* top: tip at the bottom edge, barrel standing up out of the page */
#pen-dock[data-side=top] .pd-art{
  top:0;transform:translate(calc(var(--slot-w) / 2 - 220px),calc(var(--slot-h) - 12px)) rotate(90deg);
}
#pen-dock[data-side=top] .pd-slot:hover .pd-art{
  transform:translate(calc(var(--slot-w) / 2 - 220px),calc(var(--slot-h) - 12px + var(--pull))) rotate(90deg);
}
#pen-dock[data-side=top] .pd-slot.on .pd-art{
  transform:translate(calc(var(--slot-w) / 2 - 220px),calc(var(--slot-h) - 12px + var(--pull) * 2)) rotate(90deg);
}
/* bottom: the same, upside down */
#pen-dock[data-side=bottom] .pd-art{
  top:0;transform:translate(calc(var(--slot-w) / 2 - 220px),calc(-12px)) rotate(-90deg);
}
#pen-dock[data-side=bottom] .pd-slot:hover .pd-art{
  transform:translate(calc(var(--slot-w) / 2 - 220px),calc(-12px - var(--pull))) rotate(-90deg);
}
#pen-dock[data-side=bottom] .pd-slot.on .pd-art{
  transform:translate(calc(var(--slot-w) / 2 - 220px),calc(-12px - var(--pull) * 2)) rotate(-90deg);
}
#pen-dock .pd-slot.on{background:color-mix(in srgb,var(--ac,#2f6df6) 13%,transparent)}
#pen-dock .pd-slot.on::after{
  content:"";position:absolute;left:0;top:6px;bottom:6px;width:2px;border-radius:2px;
  background:var(--pen,#111);
}
#pen-dock[data-side=right] .pd-slot.on::after{left:auto;right:0}
#pen-dock[data-side=top] .pd-slot.on::after,#pen-dock[data-side=bottom] .pd-slot.on::after{
  left:6px;right:6px;top:auto;bottom:auto;width:auto;height:2px;
}
#pen-dock[data-side=top] .pd-slot.on::after{top:0}
#pen-dock[data-side=bottom] .pd-slot.on::after{bottom:0}

#pen-dock .pd-tag{
  position:absolute;right:3px;bottom:2px;font:600 8px/1 ui-monospace,Menlo,monospace;
  color:var(--mu,#6e6e73);opacity:0;transition:opacity .16s ease;pointer-events:none;
}
#pen-dock:hover .pd-tag{opacity:.5}
#pen-dock .pd-foot{display:flex;flex-direction:column;gap:6px;align-items:flex-start;padding-left:6px;margin-top:6px}
#pen-dock[data-side=top] .pd-foot,#pen-dock[data-side=bottom] .pd-foot{
  flex-direction:row;align-items:center;padding-left:0;margin-top:0;margin-left:6px;justify-content:center;
}
#pen-dock[data-side=top] .pd-foot{margin:6px 0 0}
#pen-dock[data-side=bottom] .pd-foot{margin:0 0 6px}
#pen-dock .pd-add,#pen-dock .pd-gear,#pen-dock .pd-grip{
  width:24px;height:24px;border-radius:8px;border:1px solid var(--bd,#d9d9de);
  background:var(--sf,#fff);color:var(--mu,#6e6e73);display:grid;place-items:center;
  cursor:pointer;padding:0;
}
#pen-dock .pd-add:hover,#pen-dock .pd-gear:hover{color:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6)}
/* the grip only exists in focus mode, where moving the rail is a thing you do */
#pen-dock .pd-grip{display:none;cursor:grab;touch-action:none}
#pen-dock.pd-focus .pd-grip{display:grid}
#pen-dock.pd-focus .pd-add,#pen-dock.pd-focus .pd-gear{display:none}

/* holding a pen: it lifts out of the rail and follows the finger */
#pen-dock.pd-sorting .pd-slot{opacity:.72}
#pen-dock.pd-sorting .pd-slot.pd-lift{
  opacity:1;z-index:3;transition:none;
  background:color-mix(in srgb,var(--ac,#2f6df6) 16%,transparent);
  box-shadow:0 6px 14px rgba(10,20,40,.22);
}
#pen-dock .pd-line{
  position:absolute;background:var(--ac,#2f6df6);border-radius:2px;pointer-events:none;
  box-shadow:0 0 0 2px color-mix(in srgb,var(--ac,#2f6df6) 22%,transparent);
}

body.pd-open[data-pd=left] #stage{padding-left:66px}
body.pd-open[data-pd=right] #stage{padding-right:66px}
body.pd-open[data-pd=top] #stage{padding-top:72px}
body.pd-open[data-pd=bottom] #stage{padding-bottom:72px}

#pen-sheet{
  position:fixed;left:64px;top:50%;transform:translateY(-50%) scale(.97);
  width:min(340px,calc(100vw - 60px));max-height:min(74vh,640px);overflow:auto;
  background:var(--sf,#fff);color:var(--tx,#1c1c1e);border:1px solid var(--bd,#d9d9de);
  border-radius:16px;box-shadow:0 20px 50px rgba(8,20,38,.24);
  z-index:60;display:none;opacity:0;transition:opacity .16s ease,transform .16s ease;
  padding:12px;font:13px/1.4 inherit;
}
#pen-sheet.on{display:block;opacity:1;transform:translateY(-50%) scale(1)}
/* the sheet opens beside the rail, whichever edge that is */
body[data-pd=right] #pen-sheet{left:auto;right:64px}
#pen-sheet .ps-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
#pen-sheet .ps-head b{font-size:13px;letter-spacing:.01em}
#pen-sheet .ps-x{border:0;background:transparent;cursor:pointer;font-size:14px;color:var(--mu,#6e6e73);padding:2px 4px}
#pen-sheet .ps-row{
  border:1px solid var(--bd,#e3e7ee);border-radius:12px;padding:8px 9px;margin-bottom:8px;
  display:flex;flex-direction:column;gap:7px;background:color-mix(in srgb,var(--sf,#fff) 92%,#000 0%);
}
#pen-sheet .ps-row.on{border-color:var(--ac,#2f6df6);box-shadow:0 0 0 2px color-mix(in srgb,var(--ac,#2f6df6) 16%,transparent)}
#pen-sheet .ps-rowhead{display:flex;align-items:center;gap:7px}
#pen-sheet .ps-chip{
  width:18px;height:18px;border-radius:6px;color:#fff;font:700 10px/18px ui-monospace,monospace;
  text-align:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14);flex:none;
}
#pen-sheet .ps-name{font-size:12.5px;font-weight:650;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pen-sheet .ps-mini{
  border:1px solid var(--bd,#d9d9de);background:transparent;border-radius:7px;
  font-size:11px;padding:2px 7px;cursor:pointer;color:var(--mu,#6e6e73);
}
#pen-sheet .ps-mini:hover{color:var(--ac,#2f6df6);border-color:var(--ac,#2f6df6)}
#pen-sheet .ps-del:hover{color:#e5383b;border-color:#e5383b}
#pen-sheet .ps-kinds,#pen-sheet .ps-brushes,#pen-sheet .ps-erase{display:flex;gap:4px;flex-wrap:wrap}
#pen-sheet .ps-k,#pen-sheet .ps-b{
  border:1px solid var(--bd,#e3e7ee);background:transparent;border-radius:7px;
  font-size:11px;padding:3px 8px;cursor:pointer;color:var(--mu,#6e6e73);
}
#pen-sheet .ps-k.on,#pen-sheet .ps-b.on{background:color-mix(in srgb,var(--ac,#2f6df6) 12%,transparent);border-color:var(--ac,#2f6df6);color:var(--ac,#2f6df6);font-weight:600}
#pen-sheet .ps-thick{display:flex;align-items:center;gap:7px}
#pen-sheet .ps-thick label{font-size:11px;color:var(--mu,#6e6e73);flex:none;width:56px}
#pen-sheet .ps-thick input[type=range]{
  -webkit-appearance:none;appearance:none;flex:1;height:4px;border-radius:2px;background:#dfe4ec;outline:none;cursor:pointer;
}
#pen-sheet .ps-thick input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:var(--ac,#2f6df6);
  box-shadow:0 1px 3px rgba(16,32,64,.3);cursor:pointer;
}
#pen-sheet .ps-thick input[type=number]{
  width:56px;font:inherit;font-size:11.5px;padding:3px 5px;border-radius:7px;
  border:1px solid var(--bd,#d9d9de);background:var(--bg,#e6e9ef);color:var(--tx,#1c1c1e);
}
#pen-sheet .ps-unit{font-size:10.5px;color:var(--mu,#6e6e73)}
#pen-sheet .ps-presets{display:flex;gap:3px;flex-wrap:wrap}
#pen-sheet .ps-presets button{
  border:0;background:color-mix(in srgb,var(--tx,#1c1c1e) 6%,transparent);border-radius:6px;
  font:10.5px/1 ui-monospace,monospace;padding:4px 6px;cursor:pointer;color:var(--mu,#6e6e73);
}
#pen-sheet .ps-presets button:hover{background:color-mix(in srgb,var(--ac,#2f6df6) 14%,transparent);color:var(--ac,#2f6df6)}
#pen-sheet .ps-colors{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
#pen-sheet .ps-c{
  width:19px;height:19px;border-radius:6px;border:2px solid transparent;cursor:pointer;padding:0;
  box-shadow:inset 0 0 0 1px rgba(16,32,64,.16);
}
#pen-sheet .ps-c.on{border-color:var(--ac,#2f6df6)}
#pen-sheet .ps-custom{width:22px;height:22px;border:0;background:none;padding:0;cursor:pointer}

@media(max-width:640px){
  #pen-dock{--slot-w:44px;--slot-h:28px}
  #pen-dock[data-side=top],#pen-dock[data-side=bottom]{--slot-w:28px;--slot-h:44px}
  #pen-sheet{left:8px;right:8px;width:auto;top:auto;bottom:8px;transform:translateY(6px);max-height:64vh}
  #pen-sheet.on{transform:translateY(0)}
  body.pd-open[data-pd=left] #stage{padding-left:38px}
  body.pd-open[data-pd=right] #stage{padding-right:38px}
  body.pd-open[data-pd=top] #stage{padding-top:58px}
  body.pd-open[data-pd=bottom] #stage{padding-bottom:58px}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  load();
  buildDock();
  const style = document.createElement('style');
  style.id = 'pen-dock-style';
  style.textContent = CSS;
  document.head.append(style);

  tick();
  window.setInterval(tick, 300);

  // focus mode is announced as well as observed, so the rail moves on the same
  // frame as the toolbars rather than up to a tick later
  document.addEventListener('inkpad-focus', (e) => {
    const detail = (e as CustomEvent).detail;
    setFocus(!!detail?.on);
  });

  // the width record is shared, so a change made in the pill lands here too
  onWidth(syncFromRecord);

  // apply the remembered pen the first time a notebook is opened
  const ed = document.getElementById('ed');
  if (ed) {
    let wasOpen = editorOpen();
    new MutationObserver(() => {
      const open = editorOpen();
      if (open && !wasOpen) window.setTimeout(reapply, 60);
      wasOpen = open;
      tick();
    }).observe(ed, { attributes: true, attributeFilter: ['style'] });
  }

  (window as any).__inkpad_pen_dock = {
    slots: () => slots.map((s) => ({ ...s })),
    apply: (i: number) => slots[i] && apply(slots[i]),
    open: openSheet,
    /** Set the active slot's nib from engine units — the pill calls this. */
    setWidth: (units: number) => {
      const s = slots.find((x) => x.id === activeId);
      if (!s) return;
      s.mm = clampMm(mmOf(slotTool(s), units));
      save();
      paint();
      syncFromRecord(slotTool(s));
    },
    side: () => side,
    setSide: (v: Side) => {
      side = v;
      saveSide();
      applySide();
    },
    /** Reorder by index — the same splice a held-and-dragged pen performs. */
    move: (from: number, to: number) => {
      if (from === to || !slots[from]) return;
      const [s] = slots.splice(from, 1);
      slots.splice(Math.max(0, Math.min(slots.length, to)), 0, s);
      save();
      paint();
    },
    PX_PER_MM,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
