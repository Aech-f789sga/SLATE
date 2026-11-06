/* POST /api/report — deliver a bug report to the owner's inbox.
 *
 * Vercel runs this as a Node serverless function. Mail goes out through Resend,
 * which needs one environment variable on the project:
 *
 *   RESEND_API_KEY = re_...
 *
 * With Resend's default sender (onboarding@resend.dev) mail is only accepted
 * for the address that owns the account, which is exactly what this endpoint
 * needs — no domain has to be verified first. Set REPORT_FROM to a sender on a
 * verified domain when there is one.
 *
 * Without the key the function answers 503 and the client falls back to a
 * mailto: draft, so a report is never lost silently.
 */

const TO = process.env.REPORT_TO || 'aechmoose@gmail.com';
const FROM = process.env.REPORT_FROM || 'Slate <onboarding@resend.dev>';
const MAX_MESSAGE = 6000;
const MAX_CONTEXT = 2000;

/* Serverless instances are short-lived, so this only stops one client from
   hammering the endpoint. It is a speed bump, not a real rate limiter. */
const recent = new Map();

function throttled(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 500) recent.clear();
  return hits.length > 5;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) return res.status(429).json({ error: 'rate' });

  const body = parseBody(req.body);
  /* A field no human fills in. Bots that autofill every input trip it. */
  if (body.hp) return res.status(200).json({ ok: true });

  const message = String(body.message || '').trim().slice(0, MAX_MESSAGE);
  const email = String(body.email || '').trim().slice(0, 200);
  const context = String(body.context || '').trim().slice(0, MAX_CONTEXT);
  if (message.length < 3) return res.status(400).json({ error: 'empty' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ error: 'unconfigured' });

  const text = `${message}\n\n---\n${context}${email ? `\nreply-to: ${email}` : ''}`;
  const subject = `[Slate] Bug report — ${message.replace(/\s+/g, ' ').slice(0, 60)}`;

  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1c2430">
      <div style="border-bottom:2px solid #2f6df6;padding-bottom:12px;margin-bottom:16px">
        <h2 style="margin:0;color:#1f3a63;font-size:20px">🐞 Slate Bug Report</h2>
      </div>
      <div style="background:#f4f6fa;border:1px solid #d9e1ec;border-radius:10px;padding:16px;margin-bottom:16px;white-space:pre-wrap;font-size:15px;line-height:1.5">
        ${escapeHtml(message)}
      </div>
      ${email ? `<p style="margin:8px 0;font-size:14px"><strong>Reply-to:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>` : '<p style="margin:8px 0;font-size:13px;color:#6b7684"><em>User did not leave a reply email</em></p>'}
      <div style="margin-top:20px;border-top:1px solid #e3e7ee;padding-top:14px">
        <h4 style="margin:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7684;letter-spacing:.05em">Diagnostics</h4>
        <pre style="background:#1a202c;color:#edf2f7;padding:12px;border-radius:8px;font-size:12px;line-height:1.45;overflow-x:auto">${escapeHtml(context)}</pre>
      </div>
    </div>
  `;

  let upstream;
  try {
    upstream = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject,
        text,
        html,
        ...(email ? { reply_to: email } : {}),
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: 'network', detail: String(err).slice(0, 200) });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return res.status(502).json({ error: 'send', detail: detail.slice(0, 300) });
  }
  return res.status(200).json({ ok: true });
}
