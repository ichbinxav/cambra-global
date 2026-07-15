import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * joinCollective
 *
 * Endpoint classification: PUBLIC_OK.
 * asServiceRole justification: joins can come from anonymous callers on the
 * public /Results teaser (before signup) as well as authenticated users. We
 * persist a CollectiveMember row (admin-only RLS) and notify the admin. The
 * response carries no data beyond an id + confirmation figures the caller
 * already supplied.
 *
 * Records a merchant joining the CAMBRA collective (clickwrap-lite acceptance).
 *
 * ⚠️ The Collective Terms text is a DRAFT pending legal review. This function
 * records the acceptance (accepted_at + terms_version='draft-v0') so we have an
 * audit trail, but the flow MUST NOT be treated as launch-ready until a lawyer
 * signs off the terms copy.
 *
 * Behavior:
 *   1. Rate limit by IP (public write + outbound email).
 *   2. Validate email + accepted flag (clickwrap must be accepted).
 *   3. Persist a CollectiveMember row (service role).
 *   4. Notify admin (best-effort, never blocks the response).
 */

const DEFAULT_LIMIT_PER_HOUR = 8;
const TERMS_VERSION = "draft-v0";
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
  const principalId = `joinCollective:${ip}`;

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

    // Clickwrap MUST be accepted — presence of the flag is the acceptance record.
    if (body?.accepted !== true) {
      return Response.json({ ok: false, error: "terms_not_accepted" }, { status: 400 });
    }

    // Prefer the authenticated user's email when present; fall back to the
    // typed email. Anonymous callers may have no session — that's fine.
    let email = String(body?.email || "").trim().toLowerCase();
    const me = await base44.auth.me().catch(() => null);
    if (me?.email) email = String(me.email).trim().toLowerCase();

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const ctx = body?.context || {};
    const rawSid = typeof ctx.session_id === "string" ? ctx.session_id.trim() : "";
    const sourceSession = UUID_V4.test(rawSid) ? rawSid : "";
    const gmv = Number(ctx.gmv_eur_monthly);
    const annual = Number(ctx.annual_savings_eur);
    const channel = ctx.channel === "in_store" ? "in_store" : (ctx.channel === "online" ? "online" : undefined);

    const member = await base44.asServiceRole.entities.CollectiveMember.create({
      email,
      accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
      status: "founding",
      ...(Number.isFinite(gmv) && gmv > 0 ? { gmv_eur_monthly: gmv } : {}),
      ...(Number.isFinite(annual) && annual > 0 ? { annual_savings_eur: annual } : {}),
      ...(typeof ctx.provider_slug === "string" && ctx.provider_slug ? { provider_slug: String(ctx.provider_slug).slice(0, 60) } : {}),
      ...(typeof ctx.country === "string" && ctx.country ? { country: String(ctx.country).slice(0, 8) } : {}),
      ...(channel ? { channel } : {}),
      ...(sourceSession ? { source_session: sourceSession } : {}),
    });

    const gmvFmt = Number.isFinite(gmv) && gmv > 0 ? Math.round(gmv).toLocaleString("en-US") : null;

    // ── Emails (best-effort — a failure NEVER breaks the persisted member).
    //    Uses Core.SendEmail (same integration as onBrandCreated), so it works
    //    with the app's configured sender — no raw Resend fetch to maintain.

    // 1) Confirmation to the user — welcome as founding member, honest next
    //    steps, NO concrete rate promised.
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        from_name: "CAMBRA",
        to: email,
        subject: "You're in — CAMBRA Collective (founding member)",
        body: [
          `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:40px 32px;color:#111;">`,
          `<p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#999;margin-bottom:24px;">CAMBRA COLLECTIVE</p>`,
          `<h1 style="font-size:28px;font-weight:900;letter-spacing:-0.03em;line-height:1.05;margin-bottom:12px;">You're in — founding member.</h1>`,
          `<p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:20px;">Welcome to the CAMBRA Collective. You've joined as a founding member — many brands negotiating as one to recover the margin each of us leaks on card payments.</p>`,
          gmvFmt ? `<p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:20px;"><strong>€${gmvFmt}/mo</strong> added to the collective's negotiating volume.</p>` : ``,
          `<p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:24px;">What happens next: we'll reach out as the collective grows and we're ready to negotiate on your behalf. We don't promise a specific rate up front — we only ever charge on savings that actually materialize.</p>`,
          `<p style="font-size:12px;color:#aaa;line-height:1.6;border-top:1px solid #eee;padding-top:16px;margin-top:32px;">The Collective Terms are a draft pending legal review. CAMBRA · Payments margin recovery.</p>`,
          `</div>`,
        ].filter(Boolean).join(""),
      });
    } catch (userEmailErr) {
      console.warn("Collective user confirmation email failed:", (userEmailErr as any)?.message);
    }

    // 2) Founder/admin lead alert — this is how CAMBRA hears about the join.
    const adminEmail = String(Deno.env.get("FOUNDER_EMAIL") || Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "").trim();
    if (adminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      try {
        const bodyText = [
          `New collective member (founding).`,
          ``,
          `Email: ${email}`,
          gmvFmt ? `Monthly GMV: €${gmvFmt}` : null,
          Number.isFinite(annual) && annual > 0 ? `Annual savings estimate: €${Math.round(annual).toLocaleString("en-US")}` : null,
          ctx.provider_slug ? `Provider: ${ctx.provider_slug}` : null,
          ctx.country ? `Country: ${ctx.country}` : null,
          sourceSession ? `Session: ${sourceSession}` : null,
          `Accepted at: ${member.accepted_at || new Date().toISOString()}`,
          ``,
          `Terms version accepted: ${TERMS_VERSION} (DRAFT — pending legal review)`,
          `Member ID: ${member.id}`,
        ].filter(Boolean).join("\n");
        await base44.asServiceRole.integrations.Core.SendEmail({
          from_name: "CAMBRA",
          to: adminEmail,
          subject: `New collective member: ${email}${gmvFmt ? ` · €${gmvFmt}/mo` : ""}`,
          body: `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;">${bodyText}</pre>`,
        });
      } catch (emailErr) {
        console.warn("Admin notification email failed:", (emailErr as any)?.message);
      }
    }

    return Response.json({ ok: true, member_id: member.id }, {
      headers: { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining), 'X-RateLimit-Reset': rl.reset },
    });
  } catch (error) {
    console.error("joinCollective error:", error);
    return Response.json({ ok: false, error: (error as any)?.message || "internal_error" }, { status: 500 });
  }
});