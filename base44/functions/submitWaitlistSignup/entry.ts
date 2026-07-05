import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * submitWaitlistSignup
 *
 * Endpoint classification: PUBLIC_OK.
 * asServiceRole justification: anonymous callers on the landing/teaser have no
 * user identity — we still need to write a Lead row and notify the admin.
 * The row is written with service role and the response contains no data.
 *
 * Captures a "Join to recover" waitlist signup from public surfaces
 * (landing hero, HowItWorks step 04, Analyzer teaser).
 *
 * Behavior:
 *   1. Rate limit by IP (public write endpoint — see below).
 *   2. Validate email.
 *   3. Persist as a Lead record (source_page marks WHERE it came from).
 *   4. Notify admin (best-effort, never blocks the response on email failure).
 */

// ─── Rate limiting (per IP, hourly) ─────────────────────────────────────────
//
// Public write endpoint that also triggers an outbound email. Without a cap,
// a bot could spam the Leads table AND drain email quota. Same RateLimitCounter
// pattern as submitAnonymousAnalysis / copilotChat / apiV1.
const DEFAULT_LIMIT_PER_HOUR = 5;

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

async function checkRateLimit(base44: any, ip: string) {
  const envRaw = Deno.env.get('WAITLIST_RATE_LIMIT_PER_HOUR');
  const parsed = envRaw ? parseInt(envRaw, 10) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_PER_HOUR;

  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();
  const reset = new Date(new Date(windowStart).getTime() + 3600000).toISOString();
  const principalId = `submitWaitlistSignup:${ip}`;

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

    // Rate limit BEFORE parsing/writing/emailing.
    const ip = getClientIp(req);
    const rl = await checkRateLimit(base44, ip);
    if (!rl.ok) {
      return Response.json(
        { ok: false, error: 'rate_limited' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rl.reset,
          },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const source = String(body?.source || "waitlist").trim();
    const context = body?.context || {};

    // Basic email validation
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    // Persist as Lead (service-role — anonymous public users)
    const notes = [
      `Waitlist signup: ${source}`,
      context.brand_name ? `Brand: ${context.brand_name}` : null,
      context.total_savings ? `Savings estimate: €${Number(context.total_savings).toLocaleString("fr-FR")}` : null,
      context.session_id ? `Session: ${context.session_id}` : null,
    ].filter(Boolean).join(" · ");

    const lead = await base44.asServiceRole.entities.Lead.create({
      email,
      consent: true, // user explicitly opted in by submitting the form
      source_page: source,
      notes,
    });

    // Notify admin — best-effort, never block the signup on email failure.
    // Admin email is configured via env var so we don't hard-code a personal
    // address in source. Empty/missing env → skip the notification silently
    // (the Lead is still persisted and the admin dashboard shows it).
    const adminEmail = String(Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "").trim();
    if (adminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      try {
        const subject = `New waitlist signup — ${email}`;
        const bodyText = [
          `A new brand joined the CAMBRA waitlist.`,
          ``,
          `Email: ${email}`,
          `Source: ${source}`,
          context.brand_name ? `Brand: ${context.brand_name}` : null,
          context.total_savings ? `Estimated savings: €${Number(context.total_savings).toLocaleString("fr-FR")} / year` : null,
          context.session_id ? `Analyzer session: ${context.session_id}` : null,
          ``,
          `Lead ID: ${lead.id}`,
        ].filter(Boolean).join("\n");

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: adminEmail,
          subject,
          body: bodyText,
          from_name: "CAMBRA Waitlist",
        });
      } catch (emailErr) {
        console.warn("Admin notification email failed:", (emailErr as any)?.message);
      }
    }

    return Response.json(
      { ok: true, lead_id: lead.id },
      {
        headers: {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': rl.reset,
        },
      },
    );
  } catch (error) {
    console.error("submitWaitlistSignup error:", error);
    return Response.json({ ok: false, error: (error as any)?.message || "internal_error" }, { status: 500 });
  }
});