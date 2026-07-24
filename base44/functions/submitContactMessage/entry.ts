// submitContactMessage — public contact-form intake (SECURITY-2 Fase 3.1).
//
// Endpoint classification: PUBLIC_OK (anonymous funnel — the contact form on
// /Contact is usable without an account BY DESIGN).
//
// Why it exists: Contact.jsx used to write Lead directly from the browser,
// but Lead's RLS is admin-write — every submission failed silently for
// anonymous visitors (the form was broken). This function persists via
// service role and only reports success AFTER the row exists.
//
// Protections (same funnel patterns as submitWaitlistSignup / the OAuth
// endpoints):
//   · body size limit BEFORE parsing (16KB)
//   · per-IP hourly rate limit via RateLimitCounter
//   · strict validation: name (1-120), email (format), message (1-4000)
// asServiceRole justification: anonymous callers can't write the admin-only
// Lead entity; the response leaks no data (ok + lead_id only).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DEFAULT_LIMIT_PER_HOUR = 5;
const MAX_BODY_BYTES = 16 * 1024;

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

async function checkRateLimit(base44: any, ip: string) {
  const limit = DEFAULT_LIMIT_PER_HOUR;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();
  const principalId = `submitContactMessage:${ip}`;

  const matches = await base44.asServiceRole.entities.RateLimitCounter.filter({
    principal_id: principalId,
    window_start: windowStart,
  }).catch(() => []);

  const counter = matches?.[0];
  if (!counter) {
    await base44.asServiceRole.entities.RateLimitCounter.create({
      principal_id: principalId,
      principal_type: 'ip',
      window_start: windowStart,
      count: 1,
      limit_per_minute: limit,
    }).catch(() => null);
    return { ok: true };
  }
  if ((counter.count || 0) >= limit) return { ok: false };
  await base44.asServiceRole.entities.RateLimitCounter.update(counter.id, {
    count: (counter.count || 0) + 1,
  }).catch(() => null);
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
    }

    // Body size limit BEFORE parsing (mirrors the OAuth endpoints).
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
    }

    const base44 = createClientFromRequest(req);

    const rl = await checkRateLimit(base44, getClientIp(req));
    if (!rl.ok) return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 });

    let body: any = {};
    try { body = JSON.parse(raw); } catch { body = {}; }

    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const message = String(body?.message || '').trim();

    if (!name || name.length > 120) {
      return Response.json({ ok: false, error: 'invalid_name' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return Response.json({ ok: false, error: 'invalid_email' }, { status: 400 });
    }
    if (!message || message.length > 4000) {
      return Response.json({ ok: false, error: 'invalid_message' }, { status: 400 });
    }

    // Persist FIRST — success is only reported after the row exists.
    const lead = await base44.asServiceRole.entities.Lead.create({
      email,
      consent: true, // explicit form submission
      source_page: '/Contact',
      notes: `Contact form · Name: ${name}\n\n${message}`,
    });

    // Notify admin — best-effort, never blocks the response.
    const adminEmail = String(Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || '').trim();
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (adminEmail && resendKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: Deno.env.get('RESEND_FROM') || 'CAMBRA <hello@contact.cambra.global>',
            to: adminEmail,
            reply_to: email,
            subject: `Contact form — ${name}`,
            text: `From: ${name} <${email}>\n\n${message}\n\nLead ID: ${lead.id}`,
          }),
        });
      } catch (e) {
        console.warn('Contact admin notification failed:', (e as any)?.message);
      }
    }

    return Response.json({ ok: true, lead_id: lead.id });
  } catch (error) {
    console.error('submitContactMessage error:', error);
    return Response.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
});