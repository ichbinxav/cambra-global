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

    // HYGIENE-1 T3 — body size cap BEFORE parsing (same pattern as oauthToken).
    const MAX_BODY_BYTES = 16 * 1024;
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_BYTES) return Response.json({ error: "request_too_large" }, { status: 413 });
    const bodyText = await req.text();
    if (bodyText.length > MAX_BODY_BYTES) return Response.json({ error: "request_too_large" }, { status: 413 });
    let body: any = {};
    try { body = JSON.parse(bodyText); } catch { body = {}; }
    const email = String(body?.email || "").trim().toLowerCase();
    const source = String(body?.source || "waitlist").trim();
    const context = body?.context || {};

    // Basic email validation
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    // Persist as Lead (service-role — anonymous public users).
    //
    // The session_id is written to BOTH:
    //   - `notes` (human-readable, unchanged for backward compat with old
    //     tooling that grepped the string)
    //   - `anon_session_id` (structured field — the source of truth for
    //     joining this Lead back to its AnalyzerResult in aggregates).
    // Downstream readers MUST prefer `anon_session_id` and only fall back to
    // parsing `notes` for leads created before this field existed.
    const notes = [
      `Waitlist signup: ${source}`,
      context.brand_name ? `Brand: ${context.brand_name}` : null,
      context.total_savings ? `Savings estimate: €${Number(context.total_savings).toLocaleString("fr-FR")}` : null,
      context.session_id ? `Session: ${context.session_id}` : null,
    ].filter(Boolean).join(" · ");

    // Validate the session_id before storing it structurally — refuse to
    // persist garbage into a field that other code will trust.
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const rawSid = typeof context.session_id === "string" ? context.session_id.trim() : "";
    const anonSessionId = UUID_V4.test(rawSid) ? rawSid : "";

    const lead = await base44.asServiceRole.entities.Lead.create({
      email,
      consent: true, // user explicitly opted in by submitting the form
      source_page: source,
      notes,
      ...(anonSessionId ? { anon_session_id: anonSessionId } : {}),
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

        // Send via Resend directly so the notification inherits the verified
        // RESEND_FROM sender (contact.cambra.global) and carries a Reply-To to
        // the monitored root-domain inbox. Falls back silently on any error —
        // the Lead is already persisted and visible in the admin dashboard.
        const resendKey = Deno.env.get("RESEND_API_KEY");
        const fromAddress = Deno.env.get("RESEND_FROM") || "CAMBRA <hello@contact.cambra.global>";
        if (resendKey) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: fromAddress,
              to: adminEmail,
              reply_to: adminEmail,
              subject,
              text: bodyText,
            }),
          });
        }
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