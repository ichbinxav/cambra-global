import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * submitCallRequest
 *
 * Endpoint classification: PUBLIC_OK.
 * asServiceRole justification: high-value merchants may request a call from the
 * public /Results teaser before signup. We persist the request as a Lead
 * (source_page='book_a_call') and notify the admin. No data returned.
 *
 * Records a "book a call" request from a high-GMV / high-savings merchant.
 * This is the fallback destination when a merchant's opportunity is large
 * enough to warrant a human conversation instead of the self-serve collective.
 *
 * Behavior:
 *   1. Rate limit by IP.
 *   2. Validate email + name.
 *   3. Persist as a Lead (source_page = 'book_a_call').
 *   4. Notify admin (best-effort).
 */

const DEFAULT_LIMIT_PER_HOUR = 5;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

async function checkRateLimit(base44: any, ip: string) {
  const limit = DEFAULT_LIMIT_PER_HOUR;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();
  const reset = new Date(new Date(windowStart).getTime() + 3600000).toISOString();
  const principalId = `submitCallRequest:${ip}`;

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
    return { ok: true, remaining: limit - 1, limit, reset };
  }
  if ((counter.count || 0) >= limit) {
    return { ok: false, remaining: 0, limit, reset };
  }
  await base44.asServiceRole.entities.RateLimitCounter.update(counter.id, {
    count: (counter.count || 0) + 1,
  }).catch(() => null);
  return { ok: true, remaining: limit - (counter.count || 0) - 1, limit, reset };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);

    const ip = getClientIp(req);
    const rl = await checkRateLimit(base44, ip);
    if (!rl.ok) {
      return Response.json({ ok: false, error: 'rate_limited' }, {
        status: 429,
        headers: { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': rl.reset },
      });
    }

    const body = await req.json().catch(() => ({}));

    let email = String(body?.email || "").trim().toLowerCase();
    const me = await base44.auth.me().catch(() => null);
    if (me?.email) email = String(me.email).trim().toLowerCase();

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const name = String(body?.name || "").trim().slice(0, 120);
    const message = String(body?.message || "").trim().slice(0, 2000);
    const ctx = body?.context || {};
    const rawSid = typeof ctx.session_id === "string" ? ctx.session_id.trim() : "";
    const sourceSession = UUID_V4.test(rawSid) ? rawSid : "";
    const annual = Number(ctx.annual_savings_eur);
    const gmv = Number(ctx.gmv_eur_monthly);

    const notes = [
      `Book-a-call request`,
      name ? `Name: ${name}` : null,
      Number.isFinite(annual) && annual > 0 ? `Annual savings estimate: €${Math.round(annual).toLocaleString("fr-FR")}` : null,
      Number.isFinite(gmv) && gmv > 0 ? `Monthly GMV: €${Math.round(gmv).toLocaleString("fr-FR")}` : null,
      message ? `Message: ${message}` : null,
      sourceSession ? `Session: ${sourceSession}` : null,
    ].filter(Boolean).join(" · ");

    const lead = await base44.asServiceRole.entities.Lead.create({
      email,
      consent: true,
      source_page: "book_a_call",
      notes,
      ...(sourceSession ? { anon_session_id: sourceSession } : {}),
    });

    const adminEmail = String(Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "").trim();
    if (adminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      try {
        const resendKey = Deno.env.get("RESEND_API_KEY");
        const fromAddress = Deno.env.get("RESEND_FROM") || "CAMBRA <hello@contact.cambra.global>";
        if (resendKey) {
          const bodyText = [
            `A high-value merchant requested a call.`,
            ``,
            `Email: ${email}`,
            name ? `Name: ${name}` : null,
            Number.isFinite(annual) && annual > 0 ? `Annual savings estimate: €${Math.round(annual).toLocaleString("fr-FR")}` : null,
            Number.isFinite(gmv) && gmv > 0 ? `Monthly GMV: €${Math.round(gmv).toLocaleString("fr-FR")}` : null,
            message ? `Message:\n${message}` : null,
            sourceSession ? `Session: ${sourceSession}` : null,
            ``,
            `Lead ID: ${lead.id}`,
          ].filter(Boolean).join("\n");
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
            body: JSON.stringify({ from: fromAddress, to: adminEmail, reply_to: email, subject: `Call request — ${email}`, text: bodyText }),
          });
        }
      } catch (emailErr) {
        console.warn("Admin notification email failed:", (emailErr as any)?.message);
      }
    }

    return Response.json({ ok: true, lead_id: lead.id }, {
      headers: { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining), 'X-RateLimit-Reset': rl.reset },
    });
  } catch (error) {
    console.error("submitCallRequest error:", error);
    return Response.json({ ok: false, error: (error as any)?.message || "internal_error" }, { status: 500 });
  }
});