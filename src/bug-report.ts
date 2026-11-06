/* "Report a bug" in the home menu.
 *
 * The message is POSTed to /api/report, which mails it to the owner. If that
 * endpoint has no mail key configured, or the network is down, the same text
 * opens as a mailto: draft instead — a bug report that vanishes without a trace
 * is worse than one the user has to press send on.
 */
declare const __SLATE_VERSION__: string;

const TO = 'aechmoose@gmail.com';
const MAX = 4000;

function el<T extends HTMLElement = HTMLElement>(tag: string, css = '', text?: string): T {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n as T;
}

function toast(msg: string) {
  const w = window as unknown as { toast?: (m: string) => void };
  if (typeof w.toast === 'function') w.toast(msg);
}

function version(): string {
  return typeof __SLATE_VERSION__ === 'string' ? __SLATE_VERSION__ : 'dev';
}

/** Everything that makes a report actionable without asking the user for it. */
function context(): string {
  const pn = document.getElementById('pn');
  const lines = [
    `version: ${version()}`,
    `url: ${location.origin}${location.pathname}`,
    `view: ${pn && pn.textContent ? pn.textContent : 'library'}`,
    `screen: ${screen.width}x${screen.height} @${devicePixelRatio || 1}x (${innerWidth}x${innerHeight})`,
    `device: ${navigator.userAgent}`,
    `when: ${new Date().toISOString()}`,
  ];
  return lines.join('\n');
}

let isOpen = false;

function mailto(message: string, email: string, ctx: string) {
  const body = `${message}\n\n---\n${ctx}${email ? `\nreply-to: ${email}` : ''}`;
  const href = `mailto:${TO}?subject=${encodeURIComponent('[Slate] Bug report')}&body=${encodeURIComponent(body)}`;
  location.href = href;
  toast('Opening your mail app — the report is ready to send.');
}

export function openBugReport() {
  if (isOpen) return;
  isOpen = true;

  const back = el(
    'div',
    'position:fixed;inset:0;z-index:120;background:rgba(8,12,20,.42);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px'
  );
  back.setAttribute('role', 'presentation');

  const card = el(
    'div',
    'width:min(470px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--sf);color:var(--tx);border:1px solid var(--bd);border-radius:16px;padding:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px;font:inherit'
  );
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Report a bug');

  const head = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px');
  const title = el('b', 'font-size:17px', 'Report a bug');
  const x = el<HTMLButtonElement>('button', 'border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--mu);padding:2px 6px', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  head.append(title, x);

  const hint = el(
    'div',
    'font-size:12.5px;color:var(--mu);line-height:1.45',
    'Goes straight to the developer. Say what you were doing, what happened, and what you expected.'
  );

  const ta = el(
    'textarea',
    'width:100%;min-height:120px;resize:vertical;background:var(--bg,#fff);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:10px;font:inherit;line-height:1.45'
  ) as HTMLTextAreaElement;
  ta.placeholder = 'e.g. Pinching to zoom on my phone deleted a stroke.';
  ta.maxLength = MAX;
  ta.setAttribute('aria-label', 'What went wrong');

  const mail = el(
    'input',
    'width:100%;background:var(--bg,#fff);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:9px 10px;font:inherit'
  ) as HTMLInputElement;
  mail.type = 'email';
  mail.placeholder = 'Your email (optional — so we can reply)';
  mail.autocomplete = 'email';
  mail.setAttribute('aria-label', 'Your email, optional');

  const status = el('div', 'font-size:12.5px;color:#c0392b;min-height:0', '');
  status.setAttribute('role', 'status');

  const foot = el('div', 'display:flex;align-items:center;justify-content:flex-end;gap:8px');
  const cancel = el<HTMLButtonElement>('button', 'padding:8px 14px;font:inherit;border-radius:9px;border:1px solid var(--bd);background:transparent;color:var(--tx);cursor:pointer', 'Cancel');
  cancel.type = 'button';
  const send = el<HTMLButtonElement>('button', 'padding:8px 16px;font:inherit;font-weight:600;border-radius:9px;border:1px solid var(--ac);background:var(--ac);color:#fff;cursor:pointer', 'Send report');
  send.type = 'button';
  foot.append(cancel, send);

  card.append(head, hint, ta, mail, status, foot);
  back.append(card);

  const close = () => {
    isOpen = false;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  x.onclick = close;
  cancel.onclick = close;
  back.onclick = (e) => {
    if (e.target === back) close();
  };
  document.addEventListener('keydown', onKey, true);

  send.onclick = async () => {
    const message = ta.value.trim();
    if (message.length < 3) {
      status.textContent = 'Tell us what happened first.';
      ta.focus();
      return;
    }
    const ctx = context();
    const email = mail.value.trim();
    send.disabled = true;
    send.textContent = 'Sending…';
    status.textContent = '';
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email, context: ctx }),
      });
      /* A dev server with no API answers the SPA fallback: 200 and HTML. Only a
         JSON `{ok:true}` means the mail actually left, so anything else falls
         through to the mailto: path rather than claiming a send that never
         happened. */
      const data = await r.json().catch(() => null);
      if (r.ok && data && (data as { ok?: boolean }).ok) {
        toast('Bug report sent — thank you.');
        close();
        return;
      }
      if (r.status === 503) {
        /* No mail key on this deployment: hand it to the user's mail app. */
        mailto(message, email, ctx);
        close();
        return;
      }
      if (r.status === 502 && data && (data as any).detail) {
        const detailStr = String((data as any).detail);
        if (detailStr.includes('testing emails')) {
          status.textContent = 'Resend requires sending to your registered Resend email. Opening draft…';
          setTimeout(() => {
            mailto(message, email, ctx);
            close();
          }, 2000);
          return;
        }
      }
      throw new Error(`status ${r.status}`);
    } catch {
      mailto(message, email, ctx);
      close();
    }
  };

  document.body.append(back);
  setTimeout(() => ta.focus(), 40);
}

/** Add the menu entry, matching the placement tour.ts uses for its own. */
function mount() {
  const nav = document.getElementById('nav');
  if (!nav || document.getElementById('bug-btn')) return;
  const b = el(
    'button',
    'text-align:left;background:transparent;border:0;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;color:inherit',
    '🐞 Report a bug'
  ) as HTMLButtonElement;
  b.id = 'bug-btn';
  b.type = 'button';
  b.onclick = openBugReport;
  const before = document.getElementById('auth-login-btn') || document.getElementById('user-info-box');
  if (before && before.parentNode === nav) nav.insertBefore(b, before);
  else nav.appendChild(b);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
