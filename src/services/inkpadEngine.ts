/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TIPD } from './brushTips';
import { BRD, BRX, FONTS, FF, COLORS, COVERS, SYM } from './brushData';
import { drawShape, drawPath, drawVarStroke } from './inkpadCore';
import { auth, saveNotebookToCloud, deleteNotebookFromCloud } from './firebase';

export function initInkpadEngine() {
  let W = 800;
  let H = 1100;
  let lib: any[] = [];
  let nb: any = null;
  let pi = 0;
  let tool = 'pen';
  let color = COLORS[0];
  let size = 3;
  let cur: any = null;
  let undo: string[] = [];
  let redo: string[] = [];
  let tmr: any;
  let flt = 'all';
  let trail: any[] = [];
  let lp = 0;
  let ncov = COVERS[0];
  let LM = 'hold';
  try {
    LM = localStorage.getItem('inkpad-laser') === 'fade' ? 'fade' : 'hold';
  } catch {}

  const $ = (s: string) => document.querySelector(s) as any;
  const cv = $('#cv') as HTMLCanvasElement;
  if (!cv) return;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;

  try {
    lib = JSON.parse(localStorage.getItem('inkpad') || '[]');
  } catch {
    lib = [];
  }

  // Allow external updates (e.g. from cloud auth sync)
  (window as any).__inkpad_setLib = (newLib: any[]) => {
    lib = newLib;
    showLib();
  };

  function save() {
    if (nb) nb.upd = Date.now();
    clearTimeout(tmr);
    tmr = setTimeout(async () => {
      try {
        localStorage.setItem('inkpad', JSON.stringify(lib));
        if (auth.currentUser && nb) {
          await saveNotebookToCloud(auth.currentUser.uid, nb);
        }
      } catch {}
    }, 300);
  }

  const pg = () => nb.pages[pi];

  function bg(c: CanvasRenderingContext2D, tpl: string, col?: string | null) {
    c.fillStyle = col || '#fff';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(120,140,170,.35)';
    c.lineWidth = 1;
    c.fillStyle = 'rgba(120,140,170,.55)';
    if (tpl === 'cornell') {
      for (let y = 120; y < 900; y += 32) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
      }
      c.strokeStyle = 'rgba(120,140,170,.8)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(220, 70);
      c.lineTo(220, 900);
      c.moveTo(0, 900);
      c.lineTo(W, 900);
      c.stroke();
      c.lineWidth = 1;
    }
    if (tpl === 'lined') {
      for (let y = 120; y < H; y += 32) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
      }
      c.strokeStyle = '#f0a0a0';
      c.beginPath();
      c.moveTo(90, 0);
      c.lineTo(90, H);
      c.stroke();
    }
    if (tpl === 'grid') {
      for (let x = 0; x < W; x += 32) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, H);
        c.stroke();
      }
      for (let y = 0; y < H; y += 32) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
      }
    }
    if (tpl === 'dot') {
      for (let x = 32; x < W; x += 32) {
        for (let y = 32; y < H; y += 32) {
          c.beginPath();
          c.arc(x, y, 1.5, 0, 7);
          c.fill();
        }
      }
    }
  }

  const IM: Record<string, HTMLImageElement> = {};
  function img(s: any) {
    let i = IM[s.src];
    if (!i) {
      i = IM[s.src] = new Image();
      i.onload = () => {
        draw();
        thumbs();
      };
      i.src = s.src;
    }
    return i;
  }

  function fnt(c: CanvasRenderingContext2D, s: any) {
    c.font = `${s.s}px ${FF(s.f)}`;
    c.textBaseline = 'top';
  }

  function wrap(c: CanvasRenderingContext2D, s: any): string[] {
    fnt(c, s);
    const out: string[] = [];
    s.txt.split('\n').forEach((p: string) => {
      if (!s.w) {
        out.push(p);
        return;
      }
      let line = '';
      p.split(' ').forEach((w: string) => {
        const t = line ? line + ' ' + w : w;
        if (line && c.measureText(t).width > s.w) {
          out.push(line);
          line = w;
        } else line = t;
      });
      out.push(line);
    });
    return out;
  }

  function bb0(s: any, c: CanvasRenderingContext2D = ctx): number[] {
    if (s.t === 'text') {
      const L = wrap(c, s);
      return [s.x, s.y, s.x + Math.max(12, ...L.map((l) => c.measureText(l).width)), s.y + L.length * s.s * 1.3];
    }
    if (s.t === 'img' || s.t === 'vid') return [s.x, s.y, s.x + s.w, s.y + s.h];
    if (s.t === 'shape') {
      return [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])];
    }
    const xs = s.p.map((q: any) => q[0]);
    const ys = s.p.map((q: any) => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  function bb(s: any): number[] {
    return bb0(s);
  }

  function stroke(c: CanvasRenderingContext2D, s: any) {
    if (s.t === 'img') {
      const i = img(s);
      if (i.complete && i.naturalWidth) c.drawImage(i, s.x, s.y, s.w, s.h);
      return;
    }
    if (s.t === 'text') {
      fnt(c, s);
      c.fillStyle = s.c;
      wrap(c, s).forEach((l: string, i: number) => c.fillText(l, s.x, s.y + i * s.s * 1.3));
      return;
    }
    if (s.t === 'shape') {
      drawShape(c, s);
      return;
    }
    const p = s.p;
    if (!p || !p.length) return;
    if (s.t === 'pen' && s.pr && p.length > 1) {
      const v = s.v || 'ball';
      const m: Record<string, number> = { ball: 1, fountain: 1.6, brush: 2.4, pencil: 1, crayon: 2, marker: 2.4 };
      const al: Record<string, number> = { pencil: 0.6, crayon: 0.8, marker: 0.7 };
      c.save();
      c.fillStyle = c.strokeStyle = s.c;
      c.globalAlpha = al[v] || 1;
      drawVarStroke(c, p, s.w * (m[v] || 1), v === 'pencil' || v === 'crayon');
      c.restore();
      return;
    }
    c.save();
    c.lineCap = s.t === 'hl' ? 'butt' : 'round';
    c.lineJoin = 'round';
    c.strokeStyle = s.c;
    c.globalAlpha = s.t === 'hl' ? 0.35 : 1;
    c.lineWidth = s.t === 'hl' ? s.w * 4 : s.w;
    drawPath(c, p);
    c.stroke();
    c.restore();
  }

  function render(c: CanvasRenderingContext2D, page: any, live?: any) {
    bg(c, page.tpl, page.col);
    if (page.strokes) {
      page.strokes.forEach((s: any) => stroke(c, s));
    }
    if (live) stroke(c, live);
  }

  let sel: any[] = [];
  function selBox(): number[] {
    const B = sel.map((s) => bb(s));
    return [Math.min(...B.map((b) => b[0])), Math.min(...B.map((b) => b[1])), Math.max(...B.map((b) => b[2])), Math.max(...B.map((b) => b[3]))];
  }

  function draw() {
    if (!nb || !pg()) return;
    const live = cur && ['pen', 'hl', 'shape'].includes(cur.t) ? cur : null;
    render(ctx, pg(), live);
    if (sel.length) {
      const b = selBox();
      ctx.save();
      ctx.strokeStyle = '#2f6df6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(b[0] - 6, b[1] - 6, b[2] - b[0] + 12, b[3] - b[1] + 12);
      ctx.restore();
    }
  }

  function fit() {
    cv.style.aspectRatio = `${W}/${H}`;
    const d = window.devicePixelRatio || 2;
    cv.width = W * d;
    cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    draw();
  }

  function pos(e: PointerEvent): [number, number] {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
  }

  function snap() {
    undo.push(JSON.stringify(pg().strokes));
    if (undo.length > 60) undo.shift();
    redo = [];
  }

  function eraseAt(x: number, y: number): boolean {
    const s = pg().strokes;
    const n = s.length;
    const r = 12 + size;
    pg().strokes = s.filter((k: any) => {
      if (!k.p) {
        const b = bb(k);
        return !(x > b[0] - r && x < b[2] + r && y > b[1] - r && y < b[3] + r);
      }
      return !k.p.some((q: any) => Math.hypot(q[0] - x, q[1] - y) < r + (k.t === 'hl' ? k.w * 2 : k.w / 2));
    });
    return pg().strokes.length !== n;
  }

  // Pointer event handlers
  cv.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);

    if (tool === 'sel') {
      snap();
      cur = null;
      if (sel.length) {
        const b = selBox();
        if (x > b[0] - 6 && x < b[2] + 6 && y > b[1] - 6 && y < b[3] + 6) {
          cur = { t: 'sel', mv: 1, l: [x, y] };
          return;
        }
      }
      sel = [];
      const hit = pg().strokes.find((s: any) => {
        const b = bb(s);
        return x >= b[0] - 4 && x <= b[2] + 4 && y >= b[1] - 4 && y <= b[3] + 4;
      });
      if (hit) sel = [hit];
      draw();
      return;
    }

    snap();
    if (tool === 'er' || tool === 'pe') {
      cur = { t: 'er' };
      if (eraseAt(x, y)) draw();
    } else if (['line', 'rect', 'ell'].includes(tool)) {
      cur = { t: 'shape', k: tool, c: color, w: size, a: [x, y], b: [x, y] };
      draw();
    } else {
      cur = {
        t: tool,
        c: color,
        w: size,
        v: $('#pt') ? $('#pt').value : 'ball',
        pr: e.pointerType === 'pen' ? 1 : 0,
        p: [[x, y, e.pressure || 1]],
      };
      draw();
    }
  });

  cv.addEventListener('pointermove', (e: PointerEvent) => {
    if (!cur) return;
    const [x, y] = pos(e);
    if (cur.t === 'er') {
      if (eraseAt(x, y)) draw();
    } else if (cur.t === 'shape') {
      cur.b = [x, y];
      draw();
    } else if (cur.t === 'sel' && cur.mv) {
      const dx = x - cur.l[0];
      const dy = y - cur.l[1];
      sel.forEach((s) => {
        if (s.p) s.p = s.p.map((q: any) => [q[0] + dx, q[1] + dy, q[2]]);
        if (s.a) {
          s.a = [s.a[0] + dx, s.a[1] + dy];
          s.b = [s.b[0] + dx, s.b[1] + dy];
        }
        if (s.x !== undefined) {
          s.x += dx;
          s.y += dy;
        }
      });
      cur.l = [x, y];
      draw();
    } else if (cur.p) {
      cur.p.push([x, y, e.pressure || 1]);
      draw();
    }
  });

  const end = () => {
    if (!cur) return;
    if (cur.t === 'shape') {
      if (Math.hypot(cur.b[0] - cur.a[0], cur.b[1] - cur.a[1]) > 3) {
        pg().strokes.push(cur);
      }
    } else if (cur.t !== 'er' && cur.t !== 'sel') {
      pg().strokes.push(cur);
    }
    cur = null;
    draw();
    save();
    thumbs();
  };

  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  function load() {
    if ((pg().pw || 800) !== W || (pg().ph || 1100) !== H) {
      W = pg().pw || 800;
      H = pg().ph || 1100;
      fit();
    }
    if ($('#title')) $('#title').value = nb.name;
    if ($('#tpl')) $('#tpl').value = pg().tpl;
    if ($('#pc')) $('#pc').value = pg().col || '';
    if ($('#pn')) $('#pn').textContent = `Page ${pi + 1} of ${nb.pages.length}`;
    undo = [];
    redo = [];
    sel = [];
    draw();
    thumbs();
  }

  function thumbs() {
    const s = $('#side');
    if (!s || s.style.display !== 'block' || !nb) return;
    s.innerHTML = '';
    nb.pages.forEach((p: any, i: number) => {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = Math.round((160 * (p.ph || 1100)) / (p.pw || 800));
      c.className = i === pi ? 'on' : '';
      const x = c.getContext('2d') as CanvasRenderingContext2D;
      x.scale(160 / (p.pw || 800), 160 / (p.pw || 800));
      render(x, p);
      c.onclick = () => {
        pi = i;
        load();
      };
      s.append(c);
    });
  }

  function open(n: any) {
    nb = n;
    pi = 0;
    if ($('#lib')) $('#lib').style.display = 'none';
    if ($('#ed')) $('#ed').style.display = 'flex';
    fit();
    load();
  }

  function showLib() {
    const g = $('#grid');
    if (!g) return;
    g.innerHTML = '';
    const nw = document.createElement('div');
    nw.className = 'new';
    nw.textContent = '+';
    nw.title = 'New notebook';
    nw.onclick = () => {
      $('#md').classList.add('on');
      $('#nn').focus();
    };
    if (flt !== 'trash') g.append(nw);

    lib
      .filter((n: any) => (n.name || '').toLowerCase().includes(($('#find').value || '').toLowerCase()) && (flt === 'trash' ? n.del : !n.del && (flt !== 'fav' || n.fav)))
      .sort((a: any, b: any) => (b.upd || 0) - (a.upd || 0))
      .forEach((n: any) => {
        const d = document.createElement('div');
        d.className = 'card';
        d.innerHTML = `<div class="cv" style="--c:${n.cover}"><canvas width="240" height="330"></canvas></div><div class="nm"></div><div class="sub"><span>${n.pages.length} page${n.pages.length > 1 ? 's' : ''}</span><span><button class="fv"></button> <button class="dl"></button></span></div>`;
        d.querySelector('.nm')!.textContent = n.name || 'Untitled';
        const c = d.querySelector('canvas')!.getContext('2d') as CanvasRenderingContext2D;
        const p0 = n.pages[0];
        const k = Math.min(240 / (p0.pw || 800), 330 / (p0.ph || 1100));
        c.scale(k, k);
        render(c, p0);
        const fv = d.querySelector('.fv') as HTMLButtonElement;
        const bt = d.querySelector('.dl') as HTMLButtonElement;
        fv.textContent = n.fav ? '★' : '☆';
        bt.textContent = n.del ? 'Restore' : 'Delete';
        fv.onclick = (e) => {
          e.stopPropagation();
          n.fav = !n.fav;
          save();
          showLib();
        };
        bt.onclick = async (e) => {
          e.stopPropagation();
          n.del = n.del ? 0 : 1;
          save();
          showLib();
          if (n.del && auth.currentUser) {
            await deleteNotebookFromCloud(auth.currentUser.uid, n.id);
          }
        };
        d.onclick = () => {
          if (!n.del) open(n);
        };
        g.append(d);
      });
  }

  // Connect toolbar actions
  $('#undo').onclick = () => {
    if (!undo.length) return;
    redo.push(JSON.stringify(pg().strokes));
    pg().strokes = JSON.parse(undo.pop()!);
    sel = [];
    draw();
    save();
    thumbs();
  };

  $('#redo').onclick = () => {
    if (!redo.length) return;
    undo.push(JSON.stringify(pg().strokes));
    pg().strokes = JSON.parse(redo.pop()!);
    sel = [];
    draw();
    save();
    thumbs();
  };

  $('#clr').onclick = () => {
    if (pg().strokes.length) {
      snap();
      pg().strokes = [];
      draw();
      save();
    }
  };

  $('#back').onclick = () => {
    $('#ed').style.display = 'none';
    $('#lib').style.display = 'flex';
    showLib();
  };

  $('#prev').onclick = () => {
    if (pi > 0) {
      pi--;
      load();
    }
  };

  $('#next').onclick = () => {
    if (pi < nb.pages.length - 1) {
      pi++;
      load();
    }
  };

  $('#add').onclick = () => {
    nb.pages.splice(pi + 1, 0, { tpl: pg().tpl, col: pg().col, pw: pg().pw, ph: pg().ph, strokes: [] });
    pi++;
    load();
    save();
  };

  $('#dup').onclick = () => {
    nb.pages.splice(pi + 1, 0, JSON.parse(JSON.stringify(pg())));
    pi++;
    load();
    save();
  };

  $('#del').onclick = () => {
    if (nb.pages.length < 2) {
      snap();
      pg().strokes = [];
      draw();
      save();
      return;
    }
    nb.pages.splice(pi, 1);
    pi = Math.max(0, pi - 1);
    load();
    save();
  };

  $('#side-t').onclick = () => {
    const s = $('#side');
    s.style.display = s.style.display === 'block' ? 'none' : 'block';
    thumbs();
  };

  // Color swatches
  const sws = $('#sws');
  if (sws) {
    sws.innerHTML = '';
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'sw' + (c === color ? ' on' : '');
      b.style.background = c;
      b.setAttribute('aria-label', 'Color ' + c);
      b.onclick = () => {
        color = c;
        $('#col').value = c;
        document.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b));
      };
      sws.append(b);
    });
  }

  // Cover choices for new notebook
  const cvs = $('#cvs');
  if (cvs) {
    cvs.innerHTML = '';
    COVERS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'sw' + (i ? '' : ' on');
      b.style.background = c;
      b.onclick = () => {
        ncov = c;
        document.querySelectorAll('#cvs .sw').forEach((x) => x.classList.toggle('on', x === b));
      };
      cvs.append(b);
    });
  }

  $('#nc').onclick = () => $('#md').classList.remove('on');
  $('#ok').onclick = () => {
    const n = {
      id: Date.now(),
      name: $('#nn').value.trim() || 'Untitled',
      cover: ncov,
      upd: Date.now(),
      pages: [{ tpl: $('#np').value, strokes: [] }],
    };
    lib.unshift(n);
    $('#md').classList.remove('on');
    $('#nn').value = '';
    save();
    open(n);
  };

  document.querySelectorAll('[data-t]').forEach((b: any) => {
    b.onclick = () => {
      tool = b.dataset.t;
      document.querySelectorAll('[data-t]').forEach((x: any) => x.classList.toggle('on', x.dataset.t === tool));
    };
  });

  // Nav filter
  document.querySelectorAll('#nav a').forEach((a: any) => {
    a.onclick = () => {
      flt = a.dataset.f;
      document.querySelectorAll('#nav a').forEach((x: any) => x.classList.toggle('on', x === a));
      $('#lh').textContent = a.dataset.n;
      $('#et').style.display = flt === 'trash' ? 'inline-block' : 'none';
      showLib();
    };
  });

  $('#find').oninput = showLib;
  window.addEventListener('resize', () => {
    if (nb && $('#ed').style.display === 'flex') fit();
  });

  // Initialize library view or create first notebook if empty
  if (lib.length === 0) {
    lib = [
      {
        id: Date.now(),
        name: 'Welcome to Inkpad',
        cover: '#2f6df6',
        upd: Date.now(),
        fav: true,
        pages: [
          {
            tpl: 'lined',
            col: null,
            pw: 800,
            ph: 1100,
            strokes: [
              {
                t: 'text',
                c: '#111111',
                s: 28,
                x: 120,
                y: 160,
                txt: 'Welcome to Inkpad 📓',
                f: 'caveat',
              },
              {
                t: 'text',
                c: '#6e6e73',
                s: 16,
                x: 120,
                y: 220,
                txt: 'Handwritten notes, sketches, offline PWA & Firebase Cloud Storage.',
                f: 'arial',
              },
            ],
          },
        ],
      },
    ];
    save();
  }
  showLib();
}
