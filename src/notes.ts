/**
 * Sticky notes — GoodNotes' coloured note cards.
 *
 * The body is one ordinary page image (`t:'img'`) painted from a canvas, so a
 * note can have a folded corner, a strip of tape, a torn edge or a label band
 * without the engine needing to know anything about it. The text on top is a
 * normal text object created through the engine's own `openText()`. Both are
 * plain page objects, so undo, the eraser, lasso, resize, layer order, export
 * and cloud sync all work with no new format.
 *
 * Notes stay editable: pick one with the lasso and the note editor opens, which
 * swaps the design or the colour and repaints the body in place.
 */

function ev<T = any>(expr: string): T | null {
  try {
    return (window as any).eval(expr) as T;
  } catch {
    return null;
  }
}

function el(tag: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ------------------------------------------------------------------ */
/* Palette and designs                                                 */
/* ------------------------------------------------------------------ */

interface NoteSkin {
  id: string;
  label: string;
  fill: string;
  edge: string;
  ink: string;
}

/** Paper-stock colours: a wash, a slightly deeper edge, and readable ink. */
const SKINS: NoteSkin[] = [
  { id: 'yellow', label: 'Yellow', fill: '#ffe9a8', edge: '#efd074', ink: '#4a3c12' },
  { id: 'pink', label: 'Pink', fill: '#ffd7e2', edge: '#f0a9bf', ink: '#5c2334' },
  { id: 'green', label: 'Green', fill: '#d5f2d3', edge: '#a4d5a0', ink: '#1f4423' },
  { id: 'blue', label: 'Blue', fill: '#d6e8ff', edge: '#a5c6ef', ink: '#173a63' },
  { id: 'purple', label: 'Purple', fill: '#e7dcff', edge: '#c0aef0', ink: '#33235c' },
  { id: 'orange', label: 'Orange', fill: '#ffe1c3', edge: '#f0b989', ink: '#5b3111' },
  { id: 'grey', label: 'Grey', fill: '#eceff3', edge: '#ccd4df', ink: '#2f3a47' },
];

interface NoteDesign {
  id: string;
  label: string;
  /** extra top padding the text needs, in page units */
  padTop: number;
}

const DESIGNS: NoteDesign[] = [
  { id: 'classic', label: 'Classic', padTop: 16 },
  { id: 'fold', label: 'Folded', padTop: 16 },
  { id: 'tape', label: 'Taped', padTop: 40 },
  { id: 'curl', label: 'Curled', padTop: 16 },
  { id: 'ruled', label: 'Ruled', padTop: 16 },
  { id: 'torn', label: 'Torn', padTop: 16 },
  { id: 'label', label: 'Label', padTop: 46 },
  { id: 'ticket', label: 'Ticket', padTop: 16 },
];

const SKIN_KEY = 'inkpad-note-skin';
const DESIGN_KEY = 'inkpad-note-design';
let skinId = 'yellow';
let designId = 'classic';

function currentSkin(): NoteSkin {
  return SKINS.find((s) => s.id === skinId) || SKINS[0];
}

function currentDesign(): NoteDesign {
  return DESIGNS.find((d) => d.id === designId) || DESIGNS[0];
}

function loadPrefs() {
  try {
    const s = localStorage.getItem(SKIN_KEY) || '';
    if (SKINS.some((x) => x.id === s)) skinId = s;
    const d = localStorage.getItem(DESIGN_KEY) || '';
    if (DESIGNS.some((x) => x.id === d)) designId = d;
  } catch {
    /* private mode */
  }
}

function savePrefs() {
  try {
    localStorage.setItem(SKIN_KEY, skinId);
    localStorage.setItem(DESIGN_KEY, designId);
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------------ */
/* Body painter                                                        */
/* ------------------------------------------------------------------ */

/** transparent margin around the card, in page units, for the drop shadow */
const PAD = 13;

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

function shade(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = [1, 2, 3].map((i) => {
    const v = parseInt(m[i], 16);
    const n = amount < 0 ? v * (1 + amount) : v + (255 - v) * amount;
    return Math.round(Math.max(0, Math.min(255, n)));
  });
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Paint one note body. Everything is drawn at 2x so the card stays sharp when
 * the page is zoomed or exported.
 */
const IMG_CACHE = new Map<string, string>();

function noteImage(design: string, skin: NoteSkin, w: number, h: number): string {
  const key = design + '|' + skin.id + '|' + w + 'x' + h;
  const hit = IMG_CACHE.get(key);
  if (hit) return hit;
  const S = 2;
  const c = document.createElement('canvas');
  c.width = Math.round((w + PAD * 2) * S);
  c.height = Math.round((h + PAD * 2) * S);
  const g = c.getContext('2d');
  if (!g) return '';
  g.scale(S, S);
  g.translate(PAD, PAD);

  const R = 13;
  const deep = shade(skin.fill, -0.13);
  const deeper = shade(skin.fill, -0.24);

  /** the card silhouette, per design */
  const bodyPath = () => {
    if (design === 'fold' || design === 'ticket') {
      const k = 26;
      g.beginPath();
      g.moveTo(R, 0);
      g.lineTo(w - R, 0);
      g.quadraticCurveTo(w, 0, w, R);
      g.lineTo(w, h - k);
      g.lineTo(w - k, h);
      g.lineTo(R, h);
      g.quadraticCurveTo(0, h, 0, h - R);
      g.lineTo(0, R);
      g.quadraticCurveTo(0, 0, R, 0);
      g.closePath();
      return;
    }
    if (design === 'curl') {
      // a shallow S along the foot, as if the corner lifted
      g.beginPath();
      g.moveTo(R, 0);
      g.lineTo(w - R, 0);
      g.quadraticCurveTo(w, 0, w, R);
      g.lineTo(w, h - 14);
      g.quadraticCurveTo(w * 0.72, h + 10, w * 0.44, h - 5);
      g.quadraticCurveTo(w * 0.2, h - 17, 0, h - 7);
      g.lineTo(0, R);
      g.quadraticCurveTo(0, 0, R, 0);
      g.closePath();
      return;
    }
    if (design === 'torn') {
      g.beginPath();
      g.moveTo(R, 0);
      g.lineTo(w - R, 0);
      g.quadraticCurveTo(w, 0, w, R);
      // ragged right edge
      const steps = 9;
      for (let i = 1; i <= steps; i++) {
        const y = R + ((h - R * 2) * i) / steps;
        const x = w - (i % 2 ? 0 : 7) - (i % 3 === 0 ? 4 : 0);
        g.lineTo(x, y);
      }
      g.lineTo(w - R, h);
      g.lineTo(R, h);
      g.quadraticCurveTo(0, h, 0, h - R);
      g.lineTo(0, R);
      g.quadraticCurveTo(0, 0, R, 0);
      g.closePath();
      return;
    }
    roundRect(g, 0, 0, w, h, R);
  };

  // --- drop shadow + card
  g.save();
  g.shadowColor = 'rgba(16,32,64,.26)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = skin.fill;
  bodyPath();
  g.fill();
  g.restore();

  // --- inner tint so the card is not dead flat
  g.save();
  bodyPath();
  g.clip();
  const grd = g.createLinearGradient(0, 0, w * 0.4, h);
  grd.addColorStop(0, 'rgba(255,255,255,.42)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.restore();

  // --- design furniture
  if (design === 'fold' || design === 'ticket') {
    const k = design === 'ticket' ? 20 : 26;
    g.save();
    g.beginPath();
    g.moveTo(w - k, h);
    g.lineTo(w, h - k);
    g.lineTo(w - k, h - k);
    g.closePath();
    g.fillStyle = deeper;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.10)';
    g.lineWidth = 0.8;
    g.stroke();
    g.restore();
  }

  if (design === 'tape') {
    // a strip of masking tape across the head, slightly askew
    g.save();
    g.translate(w * 0.5, 12);
    g.rotate(-0.055);
    const tw = w * 0.62;
    g.fillStyle = 'rgba(255,255,255,.62)';
    g.fillRect(-tw / 2, -13, tw, 26);
    g.strokeStyle = 'rgba(160,170,190,.45)';
    g.lineWidth = 0.8;
    g.strokeRect(-tw / 2, -13, tw, 26);
    // serrated ends
    g.fillStyle = skin.fill;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(-tw / 2, -13 + i * 6.5);
      g.lineTo(-tw / 2 - 4, -9.75 + i * 6.5);
      g.lineTo(-tw / 2, -6.5 + i * 6.5);
      g.fill();
      g.beginPath();
      g.moveTo(tw / 2, -13 + i * 6.5);
      g.lineTo(tw / 2 + 4, -9.75 + i * 6.5);
      g.lineTo(tw / 2, -6.5 + i * 6.5);
      g.fill();
    }
    g.restore();
  }

  if (design === 'curl') {
    // the lifted lip, drawn as a soft dark band under the wave
    g.save();
    bodyPath();
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,.13)';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, h - 7);
    g.quadraticCurveTo(w * 0.2, h - 17, w * 0.44, h - 5);
    g.quadraticCurveTo(w * 0.72, h + 10, w, h - 14);
    g.stroke();
    g.restore();
  }

  if (design === 'ruled') {
    g.save();
    bodyPath();
    g.clip();
    g.strokeStyle = 'rgba(70,90,120,.20)';
    g.lineWidth = 0.9;
    for (let y = 34; y < h - 10; y += 24) {
      g.beginPath();
      g.moveTo(14, y);
      g.lineTo(w - 14, y);
      g.stroke();
    }
    g.restore();
  }

  if (design === 'label') {
    // a printed header band, like a shipping label
    g.save();
    roundRect(g, 0, 0, w, h, R);
    g.clip();
    g.fillStyle = skin.edge;
    g.fillRect(0, 0, w, 34);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(0, 34, w, 1.5);
    g.restore();
  }

  // --- edge
  g.save();
  bodyPath();
  g.strokeStyle = skin.edge;
  g.lineWidth = 1.2;
  g.stroke();
  g.restore();

  const url = c.toDataURL('image/webp', 0.94);
  IMG_CACHE.set(key, url);
  return url;
}

/* ------------------------------------------------------------------ */
/* Insert                                                              */
/* ------------------------------------------------------------------ */

interface NoteMeta {
  id: string;
  design: string;
  skin: string;
}

let seq = 0;
function newId(): string {
  seq += 1;
  return 'n' + Date.now().toString(36) + seq.toString(36);
}

const NOTE_W = 300;
const NOTE_H = 232;

function textPad(): { left: number; top: number } {
  const d = currentDesign();
  return { left: 17, top: d.padTop };
}

/**
 * The note card and its text are two page objects, and the engine can finalise
 * the text through paths we cannot see (blur, tap outside the page). So rather
 * than wrap one function, watch for the caret leaving the note and link the
 * text object that landed *inside the card's bounds*.
 */
const LINK_BODY = `(function(){
  var id = window.__gnPendingNoteId || '';
  if (!id) return true;
  if (typeof te !== 'undefined' && te) return false;        // still typing
  try{
    var S = pg().strokes, i, body = null, hit = -1;
    for (i = 0; i < S.length; i++) {
      var s = S[i];
      if (!s) continue;
      if (s.t === 'text' && s.nbid === id) { window.__gnPendingNoteId = ''; return true; }
      if (s.t === 'img' && s.nb && s.nb.id === id) body = s;
    }
    if (!body) return false;                                // card not on the page yet
    for (i = 0; i < S.length; i++) {
      var t = S[i];
      if (!t || t.t !== 'text' || t.nbid) continue;
      if (t.x >= body.x - 4 && t.x <= body.x + body.w &&
          t.y >= body.y - 4 && t.y <= body.y + body.h) hit = i;
    }
    if (hit < 0) return false;                              // nothing typed yet
    S[hit].nbid = id;
    window.__gnPendingNoteId = '';
    save();
    return true;
  }catch(e){ return true; }
})()`;

let linkTimer = 0;

function startLink() {
  window.clearInterval(linkTimer);
  let ticks = 0;
  linkTimer = window.setInterval(() => {
    ticks += 1;
    if (ticks > 150) {
      window.clearInterval(linkTimer);
      return;
    }
    if (ev<boolean>(LINK_BODY)) window.clearInterval(linkTimer);
  }, 220);
}

function hookCommit() {
  // a note dropped before the engine is up still needs its link
  window.addEventListener('pointerup', () => {
    if (!ev<string>('window.__gnPendingNoteId || ""')) return;
    if (ev<boolean>(LINK_BODY)) window.clearInterval(linkTimer);
  });
}

function insertNote() {
  const skin = currentSkin();
  const design = currentDesign();
  const w = NOTE_W;
  const h = NOTE_H;
  const src = noteImage(design.id, skin, w, h);
  if (!src) return;

  const id = newId();
  const pad = textPad();

  ev(`(function(){
    try{
      if (typeof pg !== 'function' || !nb) return;
      // a half-typed note must not be lost when a second one is dropped
      try { if (typeof commitText === 'function') commitText(); } catch(e){}

      var W0 = (typeof W === 'number' && W) ? W : 800;
      var H0 = (typeof H === 'number' && H) ? H : 1100;
      var w = Math.min(${w}, W0 * 0.62), h = Math.min(${h}, H0 * 0.34);
      var x = Math.round((W0 - w) / 2) - ${PAD};
      var y = Math.round(H0 * 0.15) - ${PAD};

      var body = {
        t:'img', src:${JSON.stringify(src)},
        x: x, y: y, w: w + ${PAD * 2}, h: h + ${PAD * 2},
        nb: { id:${JSON.stringify(id)}, design:${JSON.stringify(design.id)}, skin:${JSON.stringify(skin.id)} }
      };
      try { snap(); } catch(e){}
      pg().strokes.push(body);

      window.__gnPendingNoteId = ${JSON.stringify(id)};
      openText(x + ${PAD} + ${pad.left}, y + ${PAD} + ${pad.top});
      if (te) {
        te.w = w - ${pad.left} * 2;
        te.s = 15;
        te.c = ${JSON.stringify(skin.ink)};
        try { te.f = $('#fnt').value || 'arial'; } catch(e){}
        Object.assign(tx.style, {
          width: te.w * sc() + 'px',
          color: te.c,
          fontFamily: (typeof FF === 'function') ? FF(te.f) : ''
        });
        tx.focus();
      }
      draw(); save(); thumbs();
    }catch(e){}
  })()`);

  hide();
  startGrab();
  startLink();
  toast('Sticky note added — drag the handle to place it');
}

/* ------------------------------------------------------------------ */
/* Drag handle (while the text cursor is still inside the note)        */
/* ------------------------------------------------------------------ */

let grab: HTMLElement | null = null;
let grabBody: any = null;
let grabTimer = 0;
let drag: { x: number; y: number; bx: number; by: number; tx0: number; ty0: number } | null = null;

function buildGrab(): HTMLElement {
  if (grab) return grab;
  grab = document.createElement('div');
  grab.id = 'gn-note-grab';
  grab.title = 'Drag to move this note';
  grab.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18"/>' +
    '<path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>' +
    '<span>Move</span>';
  document.body.append(grab);

  grab.addEventListener('pointerdown', (e) => {
    if (!grabBody) return;
    e.preventDefault();
    e.stopPropagation();
    grab?.setPointerCapture(e.pointerId);
    const te = ev<any>('te');
    drag = {
      x: e.clientX,
      y: e.clientY,
      bx: grabBody.x,
      by: grabBody.y,
      tx0: te ? te.x : 0,
      ty0: te ? te.y : 0,
    };
    grab?.classList.add('dragging');
  });

  grab.addEventListener('pointermove', (e) => {
    if (!drag || !grabBody) return;
    const cv = document.getElementById('cv');
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const W = ev<number>('W') || 800;
    const dx = ((e.clientX - drag.x) * W) / r.width;
    const dy = ((e.clientY - drag.y) * W) / r.width;
    grabBody.x = drag.bx + dx;
    grabBody.y = drag.by + dy;
    ev(`(function(){
      try{
        if (!te) return;
        te.x = ${drag.tx0} + ${dx};
        te.y = ${drag.ty0} + ${dy};
        tx.style.left = (te.x * sc()) + 'px';
        tx.style.top = (te.y * sc()) + 'px';
      }catch(e){}
    })()`);
    ev('try{ draw(); }catch(e){}');
    placeGrab();
  });

  const stop = () => {
    if (!drag) return;
    drag = null;
    grab?.classList.remove('dragging');
    ev('try{ save(); }catch(e){}');
  };
  grab.addEventListener('pointerup', stop);
  grab.addEventListener('pointercancel', stop);

  return grab;
}

function placeGrab() {
  if (!grab || !grabBody) return;
  const cv = document.getElementById('cv');
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  const W = ev<number>('W') || 800;
  const k = r.width / W;
  const x = r.left + grabBody.x * k;
  const y = r.top + grabBody.y * k;
  grab.style.left = Math.round(x + 10) + 'px';
  grab.style.top = Math.round(y - 13) + 'px';
}

function startGrab() {
  buildGrab();
  const strokes = ev<any[]>('pg() ? pg().strokes : []') || [];
  grabBody = strokes.length ? strokes[strokes.length - 1] : null;
  if (!grabBody) return;
  grab?.classList.add('on');
  placeGrab();
  window.clearInterval(grabTimer);
  grabTimer = window.setInterval(() => {
    // the handle lives only as long as the text cursor is inside the note
    const te = ev<any>('te');
    if (!te) {
      stopGrab();
      return;
    }
    placeGrab();
  }, 200);
}

function stopGrab() {
  window.clearInterval(grabTimer);
  grabTimer = 0;
  grabBody = null;
  grab?.classList.remove('on');
}

/* ------------------------------------------------------------------ */
/* Note editor (change design / colour of a placed note)               */
/* ------------------------------------------------------------------ */

let editor: HTMLElement | null = null;
let editing: any = null;

function linkedText(body: any): any {
  if (!body || !body.nb) return null;
  const all = ev<any[]>('pg() ? pg().strokes : []') || [];
  return all.find((s) => s && s.t === 'text' && s.nbid === body.nb.id) || null;
}

function repaintNote(body: any) {
  if (!body || !body.nb) return;
  const skin = SKINS.find((s) => s.id === body.nb.skin) || SKINS[0];
  const design = DESIGNS.find((d) => d.id === body.nb.design) || DESIGNS[0];
  const w = body.w - PAD * 2;
  const h = body.h - PAD * 2;
  const src = noteImage(design.id, skin, w, h);
  if (!src) return;
  body.src = src;

  // keep the text inside the card, and let it take the skin's ink colour
  const txt = linkedText(body);
  if (txt) {
    const pad = { left: 17, top: design.padTop };
    txt.x = body.x + PAD + pad.left;
    txt.y = body.y + PAD + pad.top;
    txt.c = skin.ink;
    txt.w = Math.max(40, w - pad.left * 2);
  }
  ev('try{ draw(); save(); thumbs(); }catch(e){}');
}

function buildEditor(): HTMLElement {
  if (editor) return editor;
  editor = document.createElement('div');
  editor.id = 'gn-note-edit';
  document.body.append(editor);

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest('#gn-note-edit')) return;
      hideEditor();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideEditor();
  });
  return editor;
}

function hideEditor() {
  editor?.classList.remove('on');
  editing = null;
}

function paintEditor() {
  if (!editor || !editing) return;
  editor.textContent = '';

  const hd = el('div', 'Note');
  hd.className = 'hd';
  editor.append(hd);

  const bd = el('div', '');
  bd.className = 'bd';

  // designs
  const ds = el('div', '');
  ds.className = 'gn-ne-sec';
  ds.textContent = 'Design';
  bd.append(ds);

  const dgrid = el('div', '');
  dgrid.className = 'gn-ne-designs';
  DESIGNS.forEach((d) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'gn-ne-d';
    b.title = d.label;
    b.classList.toggle('on', editing.nb.design === d.id);
    const skin = SKINS.find((s) => s.id === editing.nb.skin) || SKINS[0];
    const thumb = el('img') as HTMLImageElement;
    thumb.src = noteImage(d.id, skin, 74, 56);
    thumb.alt = d.label;
    const cap = el('span', d.label);
    b.append(thumb, cap);
    b.onclick = () => {
      editing.nb.design = d.id;
      repaintNote(editing);
      paintEditor();
    };
    dgrid.append(b);
  });
  bd.append(dgrid);

  // colours
  const cs = el('div', '');
  cs.className = 'gn-ne-sec';
  cs.textContent = 'Colour';
  bd.append(cs);

  const crow = el('div', '');
  crow.className = 'gn-ne-colours';
  SKINS.forEach((s) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'gn-ne-c';
    b.title = s.label;
    b.style.background = s.fill;
    b.style.borderColor = s.edge;
    b.classList.toggle('on', editing.nb.skin === s.id);
    b.onclick = () => {
      editing.nb.skin = s.id;
      repaintNote(editing);
      paintEditor();
    };
    crow.append(b);
  });
  bd.append(crow);

  const foot = el('div', '');
  foot.className = 'gn-ne-foot';
  const del = el('button', 'Delete note') as HTMLButtonElement;
  del.type = 'button';
  del.className = 'gn-ne-del';
  del.onclick = () => {
    const id = editing?.nb?.id;
    if (!id) return;
    ev(`(function(){
      try{
        snap();
        pg().strokes = pg().strokes.filter(function(s){ return !(s && s.nb && s.nb.id === ${JSON.stringify(
          id
        )}) && !(s && s.nbid === ${JSON.stringify(id)}); });
        sel = []; draw(); save(); thumbs();
      }catch(e){}
    })()`);
    hideEditor();
  };
  foot.append(del);
  bd.append(foot);

  editor.append(bd);
}

/**
 * A note is a card plus a text object. Moving or resizing the card with the
 * select tool would leave the text behind, so re-seat every linked text at its
 * card's inset after the pointer lifts.
 */
function hookNoteSync() {
  const cv = document.getElementById('cv');
  if (!cv) {
    window.setTimeout(hookNoteSync, 400);
    return;
  }
  const padMap: Record<string, number> = {};
  DESIGNS.forEach((d) => (padMap[d.id] = d.padTop));
  const run = () => {
    ev(`(function(){
      try{
        if (typeof te !== 'undefined' && te) return;
        var PAD = ${PAD}, PADS = ${JSON.stringify(padMap)};
        var S = pg().strokes, i, j, changed = false;
        for (i = 0; i < S.length; i++) {
          var b = S[i];
          if (!b || b.t !== 'img' || !b.nb) continue;
          var top = PADS[b.nb.design];
          if (typeof top !== 'number') top = 16;
          var nx = b.x + PAD + 17, ny = b.y + PAD + top;
          for (j = 0; j < S.length; j++) {
            var t = S[j];
            if (!t || t.t !== 'text' || t.nbid !== b.nb.id) continue;
            if (Math.abs(t.x - nx) > 0.5 || Math.abs(t.y - ny) > 0.5) {
              t.x = nx; t.y = ny; changed = true;
            }
          }
        }
        if (changed) { draw(); save(); thumbs(); }
      }catch(e){}
    })()`);
  };
  cv.addEventListener('pointerup', () => window.setTimeout(run, 40));
  cv.addEventListener('pointercancel', () => window.setTimeout(run, 40));
}

function openEditor(body: any) {
  if (!body || !body.nb) return;
  editing = body;
  buildEditor();
  paintEditor();
  const node = editor!;
  node.classList.add('on');

  // prefer the side of the card, so the restyle is visible while it happens
  const tb = document.getElementById('tb');
  const top0 = tb ? Math.round(tb.getBoundingClientRect().bottom) + 10 : 120;
  const r = body;
  const cv = document.getElementById('cv');
  const rect = cv?.getBoundingClientRect();
  const W = ev<number>('W') || 800;
  const k = rect ? rect.width / W : 1;
  const w = node.offsetWidth || 300;
  const h = node.offsetHeight || 380;
  const gap = 16;
  const cardL = rect ? rect.left + r.x * k : window.innerWidth / 2;
  const cardR = rect ? rect.left + (r.x + r.w) * k : cardL;
  let left = cardR + gap;
  if (left + w > window.innerWidth - 8) left = cardL - gap - w;
  if (left < 8) left = Math.min(window.innerWidth - w - 8, Math.max(8, (cardL + cardR) / 2 - w / 2));
  let top = rect ? rect.top + r.y * k : top0;
  top = Math.max(top0, Math.min(top, window.innerHeight - h - 8));
  node.style.left = Math.round(left) + 'px';
  node.style.top = Math.round(top) + 'px';
}

/**
 * Picking a note opens its editor. The engine selects on pointerup, so watch
 * for exactly one note in the selection after a press on the page — and only
 * when the press was a tap, or moving a note would pop the editor up behind it.
 */
function hookNotePick() {
  const cv = document.getElementById('cv');
  if (!cv) {
    window.setTimeout(hookNotePick, 400);
    return;
  }
  let dx = 0;
  let dy = 0;
  cv.addEventListener(
    'pointerdown',
    (e) => {
      dx = e.clientX;
      dy = e.clientY;
    },
    true
  );
  cv.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - dx, e.clientY - dy);
    window.setTimeout(() => {
      if (moved > 7) return;
      const tool = ev<string>('tool') || '';
      if (tool !== 'sel') return;
      const sel = ev<any[]>('sel') || [];
      if (sel.length !== 1) return;
      const s = sel[0];
      if (s && s.t === 'img' && s.nb) openEditor(s);
    }, 30);
  });
}

/* ------------------------------------------------------------------ */
/* Picker                                                              */
/* ------------------------------------------------------------------ */

let pop: HTMLElement | null = null;

function build(): HTMLElement {
  if (pop) return pop;
  pop = el('div');
  pop.id = 'gn-note';
  pop.innerHTML =
    '<div class="gn-note-head"><b>Sticky note</b><i>Pick a design, then a colour</i></div>' +
    '<div class="gn-note-designs"></div>' +
    '<div class="gn-note-grid"></div>' +
    '<div class="gn-note-foot">Drop it, drag the handle to place it, and pick it later to restyle.</div>';
  document.body.append(pop);

  const dgrid = pop.querySelector('.gn-note-designs') as HTMLElement;
  DESIGNS.forEach((d) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'gn-note-d';
    b.dataset.design = d.id;
    b.title = d.label;
    b.onclick = () => {
      designId = d.id;
      savePrefs();
      paint();
    };
    dgrid.append(b);
  });

  const grid = pop.querySelector('.gn-note-grid') as HTMLElement;
  SKINS.forEach((s) => {
    const b = el('button') as HTMLButtonElement;
    b.type = 'button';
    b.className = 'gn-note-sw';
    b.dataset.skin = s.id;
    b.title = s.label + ' note';
    b.setAttribute('aria-label', s.label + ' sticky note');
    b.style.background = s.fill;
    b.style.borderColor = s.edge;
    b.onclick = () => {
      skinId = s.id;
      savePrefs();
      paint();
      insertNote();
    };
    grid.append(b);
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest('#gn-note') || t.closest('#gn-note-btn')) return;
      hide();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  return pop;
}

function paint() {
  if (!pop) return;
  const skin = currentSkin();
  pop.querySelectorAll<HTMLElement>('.gn-note-d').forEach((n) => {
    const id = n.dataset.design || '';
    n.classList.toggle('on', id === designId);
    const img = noteImage(id, skin, 66, 50);
    n.style.backgroundImage = img ? `url("${img}")` : '';
    const d = DESIGNS.find((x) => x.id === id);
    n.title = d ? d.label : id;
  });
  pop.querySelectorAll<HTMLElement>('.gn-note-sw').forEach((n) => {
    n.classList.toggle('on', n.dataset.skin === skinId);
  });
}

function hide() {
  pop?.classList.remove('on');
}

function toggle(anchor: HTMLElement) {
  const node = build();
  if (node.classList.contains('on')) {
    hide();
    return;
  }
  paint();
  node.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const tb = document.getElementById('tb');
  const floor = tb ? Math.round(tb.getBoundingClientRect().bottom) : r.bottom;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  let top = Math.max(r.bottom, floor) + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  node.style.left = Math.round(left) + 'px';
  node.style.top = Math.round(top) + 'px';
}

function toast(msg: string) {
  const t = el('div', msg);
  t.className = 'gn-toast';
  document.body.append(t);
  window.setTimeout(() => t.classList.add('out'), 1200);
  window.setTimeout(() => t.remove(), 1800);
}

/* ------------------------------------------------------------------ */
/* Toolbar button                                                      */
/* ------------------------------------------------------------------ */

function ensureButton() {
  const bar = document.getElementById('bar') || document.getElementById('bar2');
  if (!bar || document.getElementById('gn-note-btn')) return;
  const b = el('button') as HTMLButtonElement;
  b.id = 'gn-note-btn';
  b.type = 'button';
  b.title = 'Sticky note — drop a coloured note card on the page';
  b.setAttribute('aria-label', 'Sticky note');
  b.textContent = '🗒️ Note';
  b.onclick = () => toggle(b);
  const stk = document.getElementById('gn-stk-btn');
  if (stk && stk.parentElement === bar) bar.insertBefore(b, stk.nextSibling);
  else bar.append(b);
}

const CSS = `
#gn-note{
  position:fixed;z-index:46;display:none;width:min(292px,calc(100vw - 16px));
  background:#fff;border:1px solid #eef1f6;border-radius:16px;padding:12px;
  box-shadow:0 18px 44px rgba(8,20,38,.22),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;box-sizing:border-box;
}
#gn-note.on{display:block}
.gn-note-head{display:flex;flex-direction:column;gap:2px;margin:0 2px 10px}
.gn-note-head b{font:800 13px/1 inherit;color:#1c2430;letter-spacing:-.01em}
.gn-note-head i{font:500 10.5px/1.2 inherit;color:#9aa5b4;font-style:normal}
.gn-note-designs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-bottom:11px}
.gn-note-d{
  aspect-ratio:66/50;border:1.5px solid #e3e8ef;border-radius:9px;cursor:pointer;padding:0;
  background:#f7f9fc center/contain no-repeat;transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease;
}
.gn-note-d:hover{transform:translateY(-2px);border-color:#cfd9e8}
/* the engine ships a global button.on rule; restate the
   tile surface at higher specificity so the selected swatch keeps its art */
.gn-note-d.on{background-color:#f7f9fc;background-size:contain;color:inherit;border-color:#2f6df6;box-shadow:0 0 0 2px rgba(47,109,246,.18)}
#gn-note-edit .gn-ne-d.on{background-color:#f7f9fc;color:inherit}
.gn-note-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.gn-note-sw{
  aspect-ratio:1;border-radius:9px;border:1.5px solid #e3e8ef;cursor:pointer;padding:0;
  box-shadow:inset 0 -5px 0 rgba(0,0,0,.035);transition:transform .12s ease;
}
.gn-note-sw:hover{transform:translateY(-2px)}
.gn-note-sw.on{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #2f6df6}
.gn-note-foot{margin:10px 2px 0;font:500 10.5px/1.45 inherit;color:#9aa5b4}
#bar #gn-note-btn{font-size:12px!important;font-weight:600;white-space:nowrap}

/* drag handle, alive only while the text cursor is inside a fresh note */
#gn-note-grab{
  position:fixed;z-index:47;display:none;align-items:center;gap:4px;
  padding:3px 8px 3px 5px;border-radius:999px;cursor:grab;
  background:#1f2c3f;color:#fff;font:700 10px/1 inherit;
  box-shadow:0 6px 16px rgba(8,20,38,.32);touch-action:none;user-select:none;
}
#gn-note-grab.on{display:flex}
#gn-note-grab.dragging{cursor:grabbing}
#gn-note-grab svg{width:12px;height:12px;display:block;opacity:.85}

/* note editor */
#gn-note-edit{
  position:fixed;z-index:46;display:none;width:min(320px,calc(100vw - 16px));
  background:#fff;border:1px solid #eef1f6;border-radius:16px;
  box-shadow:0 18px 44px rgba(8,20,38,.22),0 2px 6px rgba(8,20,38,.08);
  font-family:inherit;box-sizing:border-box;overflow:hidden;
}
#gn-note-edit.on{display:block}
#gn-note-edit .hd{padding:12px 16px 9px;font:700 13px/1 inherit;text-align:center;border-bottom:1px solid #f1f3f7;color:#1c2430}
#gn-note-edit .bd{padding:8px 14px 12px;max-height:min(64vh,420px);overflow:auto}
.gn-ne-sec{padding:6px 0 6px;font:700 10px/1 inherit;letter-spacing:.07em;text-transform:uppercase;color:#9aa3b0}
.gn-ne-designs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
.gn-ne-d{
  display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 2px 5px;
  border:1.5px solid #e6eaf1;background:#fafbfd;border-radius:10px;cursor:pointer;
}
.gn-ne-d img{width:100%;height:auto;display:block;border-radius:6px}
.gn-ne-d span{font:600 9px/1 inherit;color:#6b7684}
.gn-ne-d.on{border-color:#2f6df6;background:#eef4ff}
.gn-ne-d.on span{color:#1f4fbf}
.gn-ne-colours{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.gn-ne-c{aspect-ratio:1;border-radius:9px;border:1.5px solid #e3e8ef;cursor:pointer;padding:0}
.gn-ne-c.on{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #2f6df6}
.gn-ne-foot{padding-top:12px}
.gn-ne-del{
  width:100%;border:0;background:#fdecec;color:#c62b2b;border-radius:10px;
  padding:9px 12px;font:700 12px/1 inherit;cursor:pointer;
}
.gn-ne-del:hover{background:#fbdede}

@media(max-width:620px){
  #bar #gn-note-btn{font-size:0!important;width:34px;padding:0!important}
  #bar #gn-note-btn::before{content:'🗒️';font-size:15px}
  #gn-note-designs{grid-template-columns:repeat(4,minmax(0,1fr))}
}
`;

function boot() {
  if (document.getElementById('gn-note-style')) return;
  const style = document.createElement('style');
  style.id = 'gn-note-style';
  style.textContent = CSS;
  document.head.append(style);

  loadPrefs();
  ensureButton();
  hookCommit();
  hookNotePick();
  hookNoteSync();
  window.setInterval(ensureButton, 900);

  (window as any).__inkpad_notes = {
    add: () => insertNote(),
    skins: SKINS,
    designs: DESIGNS,
    image: (d: string, s: string, w = 300, h = 232) =>
      noteImage(d, SKINS.find((x) => x.id === s) || SKINS[0], w, h),
    setSkin: (id: string) => {
      if (!SKINS.some((s) => s.id === id)) return;
      skinId = id;
      savePrefs();
      paint();
    },
    setDesign: (id: string) => {
      if (!DESIGNS.some((s) => s.id === id)) return;
      designId = id;
      savePrefs();
      paint();
    },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
