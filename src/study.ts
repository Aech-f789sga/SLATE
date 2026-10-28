/**
 * Study Sets — flashcards.
 *
 * GoodNotes' study sets are a separate document type, so this is deliberately
 * *not* built on the notebook engine: a set is a name plus a list of
 * front/back cards, and the whole feature is three views — list, edit, study.
 * Nothing here touches `lib`, `nb` or the canvas.
 *
 * Sets live in localStorage. They are not part of the cloud-sync payload, so
 * the list view says so rather than pretending they travel.
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function el(tag: string, css?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(className: string, text?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  if (text !== undefined) b.textContent = text;
  return b;
}

function div(className: string, text?: string): HTMLElement {
  const d = document.createElement('div');
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

function icon(paths: string): string {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    paths +
    '</svg>'
  );
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

interface Card {
  id: string;
  front: string;
  back: string;
  known: boolean;
}

interface StudySet {
  id: string;
  name: string;
  created: number;
  cards: Card[];
}

const KEY = 'inkpad-study-sets';

let sets: StudySet[] = [];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (Array.isArray(v)) {
      sets = v
        .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.cards))
        .map((s) => ({
          id: s.id,
          name: typeof s.name === 'string' ? s.name : 'Untitled set',
          created: typeof s.created === 'number' ? s.created : Date.now(),
          cards: s.cards
            .filter((c: any) => c && typeof c.id === 'string')
            .map((c: any) => ({
              id: c.id,
              front: String(c.front ?? ''),
              back: String(c.back ?? ''),
              known: !!c.known,
            })),
        }));
    }
  } catch {
    sets = [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
  } catch {
    /* private mode */
  }
}

const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function newSet(): StudySet {
  const s: StudySet = { id: uid(), name: 'New set', created: Date.now(), cards: [] };
  sets.unshift(s);
  save();
  return s;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

let shell: HTMLElement | null = null;
let body: HTMLElement | null = null;
let titleEl: HTMLElement | null = null;
let backBtn: HTMLButtonElement | null = null;

type View = 'list' | 'edit' | 'study';

let current: StudySet | null = null;

function open(view: View = 'list', s?: StudySet) {
  if (!shell) return;
  if (s) current = s;
  shell.classList.add('on');
  render(view);
}

function close() {
  shell?.classList.remove('on');
  current = null;
  render('list');
}

function buildShell() {
  shell = div('st-overlay');
  shell.id = 'study';

  const panel = div('st-panel');
  const head = div('st-head');

  backBtn = btn('st-back');
  backBtn.innerHTML = icon('<path d="M14 6l-6 6 6 6"/>');
  backBtn.title = 'Back';
  backBtn.onclick = () => render('list');

  titleEl = div('st-title', 'Study Sets');

  const closeBtn = btn('st-close');
  closeBtn.innerHTML = icon('<path d="M6 6l12 12M18 6L6 18"/>');
  closeBtn.title = 'Close';
  closeBtn.onclick = () => close();

  head.append(backBtn, titleEl, closeBtn);

  body = div('st-body');
  panel.append(head, body);
  shell.append(panel);
  document.body.append(shell);

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!shell?.classList.contains('on')) return;
      if (e.target === shell) close();
    },
    true
  );
  window.addEventListener('keydown', (e) => {
    if (!shell?.classList.contains('on')) return;
    if (e.key === 'Escape') {
      if (shell.dataset.view === 'list') close();
      else render('list');
    }
  });
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function render(view: View) {
  if (!shell || !body) return;
  shell.dataset.view = view;
  body.innerHTML = '';

  if (backBtn) backBtn.style.visibility = view === 'list' ? 'hidden' : 'visible';
  if (titleEl) {
    titleEl.textContent =
      view === 'list' ? 'Study Sets' : view === 'edit' ? current?.name || 'Set' : 'Study';
  }

  if (view === 'list') viewList();
  else if (view === 'edit') viewEdit();
  else viewStudy();
}

function viewList() {
  if (!body) return;

  const bar = div('st-bar');
  const add = btn('st-primary', '+ New set');
  add.onclick = () => {
    const s = newSet();
    current = s;
    render('edit');
  };
  bar.append(add);
  body.append(bar);

  if (!sets.length) {
    const empty = div('st-empty');
    empty.append(
      div('st-empty-t', 'No study sets yet'),
      div('st-empty-s', 'A set is a deck of cards: a prompt on the front, the answer on the back.')
    );
    body.append(empty);
    return;
  }

  const list = div('st-list');
  for (const s of sets) {
    const row = div('st-row');

    const openBtn = btn('st-rowmain');
    const name = div('st-rowname', s.name || 'Untitled set');
    const known = s.cards.filter((c) => c.known).length;
    const meta = div(
      'st-rowmeta',
      `${s.cards.length} card${s.cards.length === 1 ? '' : 's'} · ${known} known`
    );
    openBtn.append(name, meta);
    openBtn.onclick = () => {
      current = s;
      render('edit');
    };

    const del = btn('st-icon st-del');
    del.innerHTML = icon('<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>');
    del.title = 'Delete set';
    del.onclick = () => {
      if (!window.confirm(`Delete "${s.name}"?`)) return;
      sets = sets.filter((x) => x.id !== s.id);
      save();
      render('list');
    };

    row.append(openBtn, del);
    list.append(row);
  }
  body.append(list);

  body.append(div('st-note', 'Study sets are stored on this device.'));
}

function viewEdit() {
  if (!body || !current) return;
  const s = current;

  const nameRow = div('st-field');
  const nameLabel = div('st-label', 'Name');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'st-input';
  nameInput.value = s.name;
  nameInput.maxLength = 80;
  nameInput.oninput = () => {
    s.name = nameInput.value;
    if (titleEl) titleEl.textContent = s.name || 'Set';
    save();
  };
  nameRow.append(nameLabel, nameInput);
  body.append(nameRow);

  const cols = div('st-cols');
  cols.append(div('st-label', 'Front'), div('st-label', 'Back'));
  body.append(cols);

  const cards = div('st-cards');
  const repaint = () => {
    cards.innerHTML = '';
    s.cards.forEach((c, i) => {
      const row = div('st-card');

      const front = document.createElement('textarea');
      front.className = 'st-ta';
      front.rows = 2;
      front.placeholder = 'Prompt';
      front.value = c.front;
      front.oninput = () => {
        c.front = front.value;
        save();
      };

      const back = document.createElement('textarea');
      back.className = 'st-ta';
      back.rows = 2;
      back.placeholder = 'Answer';
      back.value = c.back;
      back.oninput = () => {
        c.back = back.value;
        save();
      };

      const del = btn('st-icon st-del');
      del.innerHTML = icon('<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>');
      del.title = 'Remove card';
      del.onclick = () => {
        s.cards.splice(i, 1);
        save();
        repaint();
        paintStudyBtn();
      };

      row.append(front, back, del);
      cards.append(row);
    });
    paintStudyBtn();
  };

  const addCard = btn('st-ghost', '+ Add card');
  addCard.onclick = () => {
    s.cards.push({ id: uid(), front: '', back: '', known: false });
    save();
    repaint();
    const tas = cards.querySelectorAll('textarea');
    (tas[tas.length - 2] as HTMLTextAreaElement | null)?.focus();
  };

  body.append(cards, addCard);

  const actions = div('st-actions');
  const study = btn('st-primary', 'Study');
  actions.append(study);
  body.append(actions);

  function paintStudyBtn() {
    study.disabled = s.cards.length === 0;
    study.textContent = s.cards.length ? `Study ${s.cards.length} cards` : 'Study';
  }
  study.onclick = () => {
    if (!s.cards.length) return;
    order = [];
    pos = 0;
    flipped = false;
    again = [];
    render('study');
  };

  repaint();
}

/* ------------------------------------------------------------------ */
/* Study session                                                       */
/* ------------------------------------------------------------------ */

let order: number[] = [];
let pos = 0;
let flipped = false;
let again: number[] = [];

function shuffle<T>(a: T[]): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function startSession(s: StudySet) {
  order = shuffle(s.cards.map((_, i) => i));
  pos = 0;
  flipped = false;
  again = [];
}

function viewStudy() {
  if (!body || !current) return;
  const s = current;
  if (!order.length) startSession(s);
  body.innerHTML = '';

  if (pos >= order.length) {
    // round complete
    if (again.length) {
      const done = order.length;
      const box = div('st-done');
      box.append(
        div('st-done-t', 'Round complete'),
        div('st-done-s', `${done} card${done === 1 ? '' : 's'} reviewed · ${again.length} to revisit`)
      );
      const retry = btn('st-primary', `Study ${again.length} again`);
      retry.onclick = () => {
        order = shuffle(again);
        again = [];
        pos = 0;
        flipped = false;
        viewStudy();
      };
      const back = btn('st-ghost', 'Back to set');
      back.onclick = () => render('edit');
      box.append(retry, back);
      body.append(box);
      return;
    }

    const box = div('st-done');
    box.append(
      div('st-done-t', 'All done'),
      div('st-done-s', `You marked all ${order.length} card${order.length === 1 ? '' : 's'} known.`)
    );
    const back = btn('st-primary', 'Back to set');
    back.onclick = () => render('edit');
    box.append(back);
    body.append(box);
    return;
  }

  const card = s.cards[order[pos]];

  const progress = div('st-progress');
  const fill = div('st-progress-fill');
  fill.style.width = Math.round((pos / order.length) * 100) + '%';
  progress.append(fill);
  const count = div('st-count', `${pos + 1} of ${order.length}`);
  body.append(progress, count);

  const face = div('st-face');
  const label = div('st-face-label', flipped ? 'Answer' : 'Prompt');
  const text = div('st-face-text', flipped ? card.back : card.front || '(empty)');
  face.append(label, text);
  face.onclick = () => {
    flipped = !flipped;
    viewStudy();
  };
  body.append(face);

  if (!flipped) {
    const hint = div('st-hint', 'Tap the card to flip');
    body.append(hint);
    const flip = btn('st-primary', 'Show answer');
    flip.onclick = () => {
      flipped = true;
      viewStudy();
    };
    body.append(flip);
    return;
  }

  const actions = div('st-actions');
  const againBtn = btn('st-ghost', 'Again');
  againBtn.onclick = () => {
    again.push(order[pos]);
    card.known = false;
    save();
    pos++;
    flipped = false;
    viewStudy();
  };
  const got = btn('st-primary', 'Got it');
  got.onclick = () => {
    card.known = true;
    save();
    pos++;
    flipped = false;
    viewStudy();
  };
  actions.append(againBtn, got);
  body.append(actions);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

function hookButton() {
  const top = document.getElementById('gn-top');
  if (!top || document.getElementById('gn-study-btn')) return;
  const b = btn('gn-study', '▤ Study');
  b.id = 'gn-study-btn';
  b.title = 'Study sets';
  b.onclick = () => open('list');
  const newBtn = document.getElementById('gn-new');
  if (newBtn) top.insertBefore(b, newBtn);
  else top.append(b);
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS = `
#gn-study{
  border:1px solid var(--gn-line,#e6e2dc)!important;background:#fff!important;
  border-radius:10px;padding:8px 13px!important;cursor:pointer;
  font:600 12.5px/1 inherit;color:#3c4654;white-space:nowrap;
}
#gn-study:hover{background:#f6f8fb!important;border-color:#d6dce6!important;color:#1f4fbf}

#study{
  position:fixed;inset:0;z-index:70;display:none;place-items:center;
  background:rgba(16,24,38,.42);backdrop-filter:blur(3px);
  font-family:inherit;padding:20px;
}
#study.on{display:grid}
.st-panel{
  width:min(660px,100%);max-height:min(86vh,760px);display:flex;flex-direction:column;
  background:#fff;border-radius:18px;overflow:hidden;
  box-shadow:0 30px 80px rgba(8,20,38,.34),0 2px 8px rgba(8,20,38,.10);
}
.st-head{
  display:flex;align-items:center;gap:8px;padding:14px 14px 12px;
  border-bottom:1px solid #eef1f6;flex:none;
}
.st-title{
  flex:1;font:700 15px/1.2 inherit;color:#16202e;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.st-back,.st-close{
  width:30px;height:30px;border-radius:9px;border:0!important;background:transparent!important;
  color:#5b6675;cursor:pointer;display:grid;place-items:center;padding:0!important;flex:none;
}
.st-back:hover,.st-close:hover{background:#f2f5fa;color:#1f2a3a}
.st-back svg,.st-close svg{width:17px;height:17px}
.st-body{padding:16px;overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}

.st-bar{display:flex;justify-content:flex-end}
.st-primary{
  border:0!important;background:#2f6df6!important;color:#fff!important;border-radius:11px;
  padding:10px 18px!important;font:700 13px/1 inherit;cursor:pointer;align-self:flex-start;
}
.st-primary:hover{background:#1f4fbf!important}
.st-primary:disabled{background:#c8d3e4!important;cursor:default}
.st-ghost{
  border:1px solid #dbe2ec!important;background:#fff!important;color:#3c4654!important;
  border-radius:11px;padding:10px 16px!important;font:600 13px/1 inherit;cursor:pointer;
  align-self:flex-start;
}
.st-ghost:hover{background:#f6f8fb!important;border-color:#c4cfdd!important}

.st-list{display:flex;flex-direction:column;gap:8px}
.st-row{
  display:flex;align-items:center;gap:6px;border:1px solid #eef1f6;border-radius:13px;
  padding:4px 6px 4px 4px;background:#fcfdff;
}
.st-row:hover{border-color:#dbe4f2;background:#f8fbff}
.st-rowmain{
  flex:1;text-align:left;border:0!important;background:transparent!important;cursor:pointer;
  padding:9px 10px!important;border-radius:10px;min-width:0;
}
.st-rowname{
  font:700 13.5px/1.3 inherit;color:#1c2430;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.st-rowmeta{font:500 11px/1.4 inherit;color:#8b95a3;margin-top:2px}
.st-icon{
  width:30px;height:30px;border-radius:9px;border:0!important;background:transparent!important;
  color:#98a2b0;cursor:pointer;display:grid;place-items:center;padding:0!important;flex:none;
}
.st-icon svg{width:16px;height:16px}
.st-del:hover{background:#fdf1f1;color:#d9484d}

.st-empty{
  padding:34px 18px;text-align:center;border:1px dashed #dfe5ee;border-radius:14px;
}
.st-empty-t{font:700 14px/1.3 inherit;color:#3c4654}
.st-empty-s{font:500 12px/1.5 inherit;color:#8b95a3;margin-top:6px;max-width:340px;margin-inline:auto}

.st-note{font:500 11px/1.4 inherit;color:#a3acb8;text-align:center;margin-top:2px}

.st-field{display:flex;flex-direction:column;gap:6px}
.st-label{
  font:700 9.5px/1 inherit;letter-spacing:.08em;text-transform:uppercase;color:#8b95a3;
}
.st-input{
  width:100%;box-sizing:border-box;border:1px solid #dbe2ec!important;border-radius:11px;
  padding:11px 13px!important;font:600 14px/1.2 inherit;color:#16202e;outline:none;
}
.st-input:focus{border-color:#2f6df6!important;box-shadow:0 0 0 3px rgba(47,109,246,.14)}

.st-cols{display:grid;grid-template-columns:1fr 1fr 34px;gap:8px;margin-bottom:-4px}
.st-cards{display:flex;flex-direction:column;gap:8px}
.st-card{display:grid;grid-template-columns:1fr 1fr 34px;gap:8px;align-items:start}
.st-ta{
  width:100%;box-sizing:border-box;border:1px solid #dbe2ec!important;border-radius:11px;
  padding:9px 11px!important;font:500 13px/1.45 inherit;color:#1c2430;outline:none;
  resize:vertical;min-height:52px;background:#fcfdff;
}
.st-ta:focus{border-color:#2f6df6!important;background:#fff;box-shadow:0 0 0 3px rgba(47,109,246,.12)}
.st-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:2px}
.st-actions .st-primary,.st-actions .st-ghost{flex:1;text-align:center}
/* the standalone flip button is a primary tap target, so give it the full width */
.st-body>.st-primary{align-self:stretch!important;text-align:center}

.st-progress{height:5px;border-radius:999px;background:#eef1f6;overflow:hidden;flex:none}
.st-progress-fill{height:100%;background:#2f6df6;border-radius:999px;transition:width .25s ease}
.st-count{font:600 11.5px/1 inherit;color:#8b95a3;text-align:center}

.st-face{
  min-height:200px;border-radius:16px;border:1px solid #e4eaf3;background:#fbfcfe;
  padding:24px 22px;display:flex;flex-direction:column;gap:12px;cursor:pointer;
  transition:border-color .15s ease,background .15s ease;
}
.st-face:hover{border-color:#cdd9ea;background:#fff}
.st-face-label{
  font:700 9.5px/1 inherit;letter-spacing:.09em;text-transform:uppercase;color:#9aa4b2;
}
.st-face-text{
  font:600 20px/1.45 inherit;color:#16202e;white-space:pre-wrap;overflow-wrap:anywhere;
  flex:1;display:flex;align-items:center;
}
.st-hint{font:500 11.5px/1 inherit;color:#a3acb8;text-align:center}

.st-done{
  padding:30px 20px;text-align:center;border:1px solid #e4eaf3;border-radius:16px;background:#fbfcfe;
  display:flex;flex-direction:column;gap:10px;align-items:center;
}
.st-done-t{font:700 17px/1.3 inherit;color:#16202e}
.st-done-s{font:500 12.5px/1.5 inherit;color:#77828f;margin-bottom:6px}
.st-done .st-primary,.st-done .st-ghost{align-self:center;min-width:180px;text-align:center}

@media(max-width:560px){
  #study{padding:0}
  .st-panel{width:100%;max-height:100vh;height:100%;border-radius:0}
  .st-card,.st-cols{grid-template-columns:1fr 34px}
  .st-card .st-ta:nth-child(2){grid-column:1/2}
  .st-face-text{font-size:17px}
}
`;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!document.getElementById('libm')) return;

  const style = document.createElement('style');
  style.id = 'gn-study-style';
  style.textContent = CSS;
  document.head.append(style);

  load();
  buildShell();
  hookButton();

  window.setInterval(hookButton, 500);

  (window as any).__inkpad_study = {
    open,
    close,
    sets: () => sets,
    add: (name: string, cards: { front: string; back: string }[]) => {
      const s: StudySet = {
        id: uid(),
        name,
        created: Date.now(),
        cards: cards.map((c) => ({ id: uid(), front: c.front, back: c.back, known: false })),
      };
      sets.unshift(s);
      save();
      return s;
    },
    reset: () => {
      sets = [];
      save();
    },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
