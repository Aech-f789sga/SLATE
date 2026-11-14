/**
 * Visitor analytics for the admin.
 *
 * The question this answers is narrow on purpose: **how many people used Slate
 * without signing up, and how much time did they spend**. "People" is really
 * "sessions", because that is what the collection can honestly support — see
 * the note at the bottom of the panel, which says so to the admin's face rather
 * than letting the number imply more than it knows.
 *
 * Everything here is derived from `/visitors`, which `usage.ts` writes for
 * signed-out sessions only, and only once they pass ten minutes of engaged
 * time. So:
 *
 *   - a bounce of two minutes is not in this data and cannot be;
 *   - a signed-in account is not in this data either, by design;
 *   - one tab is one visit, so a person who opens three tabs counts three times.
 *
 * Those are limits of the existing collection, not of this view. Rendering them
 * as a footnote is the difference between a dashboard and a guess.
 *
 * Firestore has no group-by, so the rows are read once and bucketed here.
 */
import { visitorRows, type VisitorRow } from './services/firebase';

const DAY = 86_400_000;
const WINDOW_DAYS = 14;

function el(tag: string, css = '', text = ''): HTMLElement {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  if (text) n.textContent = text;
  return n;
}

function fmtDur(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s + 's';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? h + 'h ' + rest + 'm' : h + 'h';
}

function relTime(ms: number): string {
  if (!ms) return '—';
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return Math.round(d / 60_000) + 'm ago';
  if (d < DAY) return Math.round(d / 3_600_000) + 'h ago';
  const days = Math.round(d / DAY);
  return days === 1 ? 'yesterday' : days + 'd ago';
}

/** Local midnight for a timestamp, so "today" means the admin's today. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function statCell(value: string, label: string, accent = false): HTMLElement {
  const cell = el(
    'div',
    'flex:1;min-width:0;border:1px solid var(--bd);border-radius:12px;padding:9px 11px;background:var(--sf)'
  );
  cell.appendChild(
    el(
      'div',
      'font-size:20px;font-weight:700;line-height:1.2;' + (accent ? 'color:var(--ac)' : ''),
      value
    )
  );
  cell.appendChild(el('div', 'font-size:10px;color:var(--mu);line-height:1.3;margin-top:1px', label));
  return cell;
}

function sectionTitle(text: string, hint?: string): HTMLElement {
  const row = el('div', 'display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;margin-top:2px');
  row.appendChild(el('span', 'font-size:12px;font-weight:600', text));
  if (hint) row.appendChild(el('span', 'font-size:10px;color:var(--mu)', hint));
  return row;
}

/* ------------------------------------------------------------------ */
/* Chart                                                               */
/* ------------------------------------------------------------------ */

interface DayBucket {
  start: number;
  count: number;
  seconds: number;
}

function bucketByDay(rows: VisitorRow[], days: number): DayBucket[] {
  const today = startOfDay(Date.now());
  const out: DayBucket[] = [];
  const index = new Map<number, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const start = today - i * DAY;
    const b = { start, count: 0, seconds: 0 };
    out.push(b);
    index.set(start, b);
  }
  for (const r of rows) {
    const b = index.get(startOfDay(r.first));
    if (b) {
      b.count++;
      b.seconds += r.seconds;
    }
  }
  return out;
}

function dayLabel(ms: number, span: number): string {
  const d = new Date(ms);
  // narrow screens cannot fit 14 labels, so only every other one is named
  if (span > 7 && (span - 1 - Math.round((startOfDay(Date.now()) - ms) / DAY)) % 2) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric' });
}

/**
 * A 14-day column chart. Columns rather than an SVG path: there is one value
 * per day, not a continuous series, and a bar that is 2 px tall reads as
 * "nothing that day" far better than a line dipping to zero.
 */
function chart(buckets: DayBucket[]): HTMLElement {
  const wrap = el('div', 'display:flex;flex-direction:column;gap:4px');
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const today = startOfDay(Date.now());

  const plot = el('div', 'display:flex;align-items:flex-end;gap:3px;height:112px');
  buckets.forEach((b, i) => {
    const col = el('div', 'flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end');
    const isToday = b.start === today;
    const h = b.count ? Math.max(4, Math.round((b.count / peak) * 100)) : 2;
    const bar = el(
      'div',
      'width:100%;border-radius:3px 3px 0 0;height:' +
        h +
        '%;background:' +
        (b.count ? (isToday ? 'var(--ac)' : 'color-mix(in srgb, var(--ac) 62%, transparent)') : 'var(--bd)')
    );
    const d = new Date(b.start);
    col.title =
      d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' · ' +
      b.count +
      (b.count === 1 ? ' visit' : ' visits') +
      (b.seconds ? ' · ' + fmtDur(b.seconds) + ' total' : '');
    col.appendChild(bar);
    plot.appendChild(col);
  });
  wrap.appendChild(plot);

  const labels = el('div', 'display:flex;gap:3px');
  buckets.forEach((b, i) => {
    const lab = el(
      'div',
      'flex:1;min-width:0;text-align:center;font-size:9px;color:var(--mu);height:12px',
      dayLabel(b.start, buckets.length)
    );
    labels.appendChild(lab);
  });
  wrap.appendChild(labels);
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Duration spread                                                     */
/* ------------------------------------------------------------------ */

const BUCKETS: { label: string; min: number }[] = [
  { label: '10–20m', min: 600 },
  { label: '20–40m', min: 1200 },
  { label: '40–60m', min: 2400 },
  { label: '60m+', min: 3600 },
];

function durationSpread(rows: VisitorRow[]): HTMLElement {
  const wrap = el('div', 'display:flex;flex-direction:column;gap:5px');
  const counts = BUCKETS.map((b, i) => {
    const hi = i + 1 < BUCKETS.length ? BUCKETS[i + 1].min : Infinity;
    return rows.filter((r) => r.seconds >= b.min && r.seconds < hi).length;
  });
  const peak = Math.max(1, ...counts);
  BUCKETS.forEach((b, i) => {
    const row = el('div', 'display:flex;align-items:center;gap:8px;font-size:11px');
    row.appendChild(el('span', 'width:46px;color:var(--mu);flex:none', b.label));
    const track = el('div', 'flex:1;height:9px;background:var(--bd);border-radius:5px;overflow:hidden');
    const fill = el(
      'div',
      'height:100%;width:' + Math.round((counts[i] / peak) * 100) + '%;background:var(--ac);border-radius:5px'
    );
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'width:26px;text-align:right;font-weight:600;flex:none', String(counts[i])));
    wrap.appendChild(row);
  });
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function renderBody(host: HTMLElement, rows: VisitorRow[]) {
  host.innerHTML = '';

  const now = Date.now();
  const today = startOfDay(now);
  const week = today - 6 * DAY;
  const total = rows.length;
  const weekN = rows.filter((r) => r.first >= week).length;
  const todayN = rows.filter((r) => r.first >= today).length;
  const seconds = rows.reduce((a, r) => a + r.seconds, 0);
  const avg = total ? seconds / total : 0;
  const longest = rows.reduce((a, r) => Math.max(a, r.seconds), 0);

  const kpis = el('div', 'display:flex;gap:7px;flex-wrap:wrap');
  kpis.appendChild(statCell(total.toLocaleString(), 'visits all time', true));
  kpis.appendChild(statCell(weekN.toLocaleString(), 'last 7 days'));
  kpis.appendChild(statCell(todayN.toLocaleString(), 'today'));
  kpis.appendChild(statCell(total ? fmtDur(avg) : '—', 'average visit'));
  host.appendChild(kpis);

  const buckets = bucketByDay(rows, WINDOW_DAYS);
  host.appendChild(sectionTitle('Visits per day', 'last ' + WINDOW_DAYS + ' days'));
  host.appendChild(chart(buckets));

  const busiest = buckets.reduce((a, b) => (b.count > a.count ? b : a), buckets[0]);
  const activeDays = buckets.filter((b) => b.count > 0).length;
  host.appendChild(
    el(
      'div',
      'font-size:10px;color:var(--mu);line-height:1.5',
      busiest.count
        ? 'Busiest day: ' +
            new Date(busiest.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
            ' with ' +
            busiest.count +
            ' · ' +
            activeDays +
            ' of ' +
            WINDOW_DAYS +
            ' days had a visit · ' +
            fmtDur(seconds) +
            ' recorded in total'
        : 'No visits recorded in this window yet.'
    )
  );

  host.appendChild(sectionTitle('How long they stayed', 'per visit'));
  host.appendChild(durationSpread(rows));

  if (rows.length) {
    host.appendChild(sectionTitle('Recent visits', 'newest first'));
    const list = el('div', 'display:flex;flex-direction:column;border:1px solid var(--bd);border-radius:10px;overflow:hidden');
    rows.slice(0, 10).forEach((r, i) => {
      const line = el(
        'div',
        'display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:11px' +
          (i ? ';border-top:1px solid var(--bd)' : '')
      );
      line.appendChild(el('span', 'font-weight:600;width:52px;flex:none', fmtDur(r.seconds)));
      // the document id is an opaque session token; the start time is what an
      // admin can actually use to line a visit up against a deploy or a post
      const d = new Date(r.first);
      const when =
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      line.appendChild(el('span', 'color:var(--mu);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', when));
      line.appendChild(el('span', 'color:var(--mu);flex:none', relTime(r.last)));
      list.appendChild(line);
    });
    host.appendChild(list);
  }
}

function buildPanel(): HTMLElement {
  let md = document.getElementById('analytics-md');
  if (md) return md;

  md = el(
    'div',
    'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100;padding:16px'
  );
  md.id = 'analytics-md';

  const box = el(
    'div',
    'background:var(--sf);border-radius:18px;padding:16px;width:min(96vw,760px);max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:9px;border:1px solid var(--bd);color:var(--tx)'
  );
  box.id = 'analytics-box';

  const head = el('div', 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px');
  const titles = el('div', 'display:flex;flex-direction:column;gap:2px');
  titles.appendChild(el('b', 'font-size:17px', '📊 Visitor analytics'));
  titles.appendChild(
    el(
      'div',
      'font-size:11px;color:var(--mu);line-height:1.45',
      'People who used Slate without signing up. Signed-out sessions only, ten minutes or longer.'
    )
  );
  head.appendChild(titles);
  const close = el('button', 'font-size:16px;padding:2px 7px;cursor:pointer', '✕');
  close.className = 'ic';
  close.setAttribute('aria-label', 'Close');
  head.appendChild(close);
  box.appendChild(head);

  const body = el('div', 'display:flex;flex-direction:column;gap:9px');
  body.id = 'analytics-body';
  box.appendChild(body);

  box.appendChild(
    el(
      'div',
      'font-size:10px;color:var(--mu);line-height:1.55;border-top:1px solid var(--bd);padding-top:8px',
      'What this counts: one visit is one browser tab, timed while it is on screen. Visits under ten minutes are never written down, so the totals here are a floor, not a headcount — and a person who opens three tabs is three visits. Signed-in accounts are not included; they are listed in the admin user panel.'
    )
  );

  md.appendChild(box);
  document.body.appendChild(md);

  const hide = () => {
    md!.style.display = 'none';
  };
  close.onclick = hide;
  md.addEventListener('pointerdown', (e) => {
    if (e.target === md) hide();
  });
  return md;
}

/** Open the analytics panel and load the visitor rows. Admin-only by rules. */
export function openVisitorAnalytics(): void {
  const md = buildPanel();
  const body = document.getElementById('analytics-body');
  md.style.display = 'flex';
  if (!body) return;

  body.innerHTML = '';
  body.appendChild(el('div', 'font-size:12px;color:var(--mu)', 'Reading visits…'));

  void visitorRows()
    .then((rows) => renderBody(body, rows))
    .catch((e: unknown) => {
      const code = (e as { code?: string })?.code || (e as Error)?.message || 'permission-denied';
      body.innerHTML = '';
      body.appendChild(el('div', 'font-size:12px;color:#e5383b;line-height:1.5', 'Could not read visits — ' + code));
      // The likely cause is not the account: this project has a *named*
      // database, and the Firebase console's Rules tab edits `(default)`, which
      // does not exist here. So the rules have to go out from this repo, where
      // firebase.json names the right database.
      const cmd = el(
        'code',
        'display:block;font-size:10px;line-height:1.5;color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:6px 8px;white-space:pre-wrap;word-break:break-all',
        'npx firebase-tools deploy --only firestore:rules --project project-d6c1fcd0-76ec-4d52-b97'
      );
      body.appendChild(
        el(
          'div',
          'font-size:11px;color:var(--mu);line-height:1.55',
          'Visits live in /visitors and only the admin may read them. If this says permission-denied while you are signed in as the admin over Google, the rules are not on the database yet — run this from the repo:'
        )
      );
      body.appendChild(cmd);
      body.appendChild(
        el(
          'div',
          'font-size:11px;color:var(--mu);line-height:1.55',
          'The Firebase console edits the (default) database; this project uses a named one, so the console will not fix it.'
        )
      );
    });
}

/**
 * Render with made-up rows, for checking the layout without a live project.
 * Reachable from the console as `__inkpad_analytics.demo()`.
 */
export function openVisitorAnalyticsDemo(): void {
  const md = buildPanel();
  md.style.display = 'flex';
  const body = document.getElementById('analytics-body');
  if (!body) return;
  const now = Date.now();
  const rows: VisitorRow[] = [];
  for (let i = 0; i < 64; i++) {
    const dayAgo = Math.floor(Math.random() * 14);
    const first = startOfDay(now) - dayAgo * DAY + Math.floor(Math.random() * 8) * 3_600_000;
    const seconds = Math.round(600 + Math.random() * 4200);
    rows.push({ id: 'v_demo' + i, first, last: first + seconds * 1000, seconds });
  }
  rows.sort((a, b) => b.first - a.first);
  renderBody(body, rows);
}

(window as unknown as Record<string, unknown>).__inkpad_analytics = {
  open: openVisitorAnalytics,
  demo: openVisitorAnalyticsDemo,
};
