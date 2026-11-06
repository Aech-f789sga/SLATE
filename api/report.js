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
