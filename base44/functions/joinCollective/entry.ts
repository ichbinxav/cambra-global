import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { normalizeLocale } from "../../shared/emailLocale.ts";
import { collectiveJoinEmail } from "../../shared/emails/collectiveJoin.ts";
import {
  captureEmergencyEpoch,
  emergencyState,
} from "../../shared/operationalControl.ts";
import { sendCostGovernedEmail } from "../../shared/costGovernance.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import { consumePublicRequestRateLimit } from "../../shared/rateLimit.ts";

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
 * Terms acceptance is recorded as accepted_at + terms_version so we have an
 * audit trail and can re-consent members if the terms text ever changes.
 * TERMS_VERSION is an opaque IDENTIFIER of the text that was accepted — its
 * historical value ('draft-v0') is kept verbatim so existing acceptance
 * records stay comparable; it is not a statement about the document's status
 * (LEGAL-2 / EMAIL-1 removed that labelling from the UI and the email).
 *
 * Behavior:
 *   1. Rate limit by versioned HMAC network fingerprint (public write + outbound email).
 *   2. Validate email + accepted flag (clickwrap must be accepted).
 *   3. Persist a CollectiveMember row (service role).
 *   4. Notify admin (best-effort, never blocks the response).
 */

const DEFAULT_LIMIT_PER_HOUR = 8;
const TERMS_VERSION = "draft-v0";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "method_not_allowed" }, {
        status: 405,
      });
    }

    const base44 = createClientFromRequest(req);

    const rl = await consumePublicRequestRateLimit(base44.asServiceRole, req, {
      namespace: "join-collective",
      limit: DEFAULT_LIMIT_PER_HOUR,
      window_seconds: 3600,
    });
    if (!rl.ok) {
      return Response.json({
        ok: false,
        error: rl.status === 429 ? "rate_limited" : "rate_limit_unavailable",
      }, {
        status: rl.status || 503,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rl.reset,
        },
      });
    }

    const body = await req.json().catch(() => ({}));

    // Clickwrap MUST be accepted — presence of the flag is the acceptance record.
    if (body?.accepted !== true) {
      return Response.json({ ok: false, error: "terms_not_accepted" }, {
        status: 400,
      });
    }

    // Prefer the authenticated user's email when present; fall back to the
    // typed email. Anonymous callers may have no session — that's fine.
    let email = String(body?.email || "").trim().toLowerCase();
    const me = await base44.auth.me().catch((error: any) =>
      safeBestEffort(error, {
        operation: "joinCollective",
        fallback: null,
        severity: "secondary",
      })
    );
    if (me?.email) email = String(me.email).trim().toLowerCase();

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return Response.json({ ok: false, error: "invalid_email" }, {
        status: 400,
      });
    }

    const ctx = body?.context || {};
    const rawSid = typeof ctx.session_id === "string"
      ? ctx.session_id.trim()
      : "";
    const sourceSession = UUID_V4.test(rawSid) ? rawSid : "";
    const gmv = Number(ctx.gmv_eur_monthly);
    const annual = Number(ctx.annual_savings_eur);
    const channel = ctx.channel === "in_store"
      ? "in_store"
      : (ctx.channel === "online" ? "online" : undefined);
    // EMAIL-1 T2 — the UI language active when the member joined. Normalized
    // (unknown/absent → 'en') so the record always carries a usable value.
    const locale = normalizeLocale(body?.locale);

    const member = await base44.asServiceRole.entities.CollectiveMember.create({
      email,
      accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
      status: "founding",
      locale,
      ...(Number.isFinite(gmv) && gmv > 0 ? { gmv_eur_monthly: gmv } : {}),
      ...(Number.isFinite(annual) && annual > 0
        ? { annual_savings_eur: annual }
        : {}),
      ...(typeof ctx.provider_slug === "string" && ctx.provider_slug
        ? { provider_slug: String(ctx.provider_slug).slice(0, 60) }
        : {}),
      ...(typeof ctx.country === "string" && ctx.country
        ? { country: String(ctx.country).slice(0, 8) }
        : {}),
      ...(channel ? { channel } : {}),
      ...(sourceSession ? { source_session: sourceSession } : {}),
    });

    const gmvFmt = Number.isFinite(gmv) && gmv > 0
      ? Math.round(gmv).toLocaleString("en-US")
      : null;
    // Joining remains an inbound-safe operation. One epoch fences only the
    // notification phase and is retained across both recipients.
    const emergency = await emergencyState(base44.asServiceRole);
    const communicationEpoch =
      !emergency.safe_mode && !emergency.communications_paused
        ? await captureEmergencyEpoch(base44.asServiceRole, "communications")
          .catch((error: any) =>
            safeBestEffort(error, {
              operation: "joinCollective.capture_communications_epoch",
              fallback: null,
              severity: "critical",
            })
          )
        : null;
    let communicationsReviewRequired = false;

    // ── Emails (best-effort — a failure NEVER breaks the persisted member).
    //    Uses Core.SendEmail (same integration as onBrandCreated), so it works
    //    with the app's configured sender — no raw Resend fetch to maintain.

    // 1) Confirmation to the user — welcome as founding member, honest next
    //    steps, NO concrete rate promised. EMAIL-1: template + language live in
    //    base44/shared/emails/collectiveJoin.ts, routed by the member's locale.
    try {
      if (communicationEpoch) {
        const mail = collectiveJoinEmail(locale, { gmvEurMonthly: gmv });
        await sendCostGovernedEmail(base44.asServiceRole, {
          event_key: `email:collective-confirmation:${member.id}`,
          stable_event_key: true,
          source: "joinCollective",
          related_entity_type: "CollectiveMember",
          related_entity_id: member.id,
          emergency_epoch_claim: communicationEpoch,
        }, {
          from_name: "CAMBRA",
          to: email,
          subject: mail.subject,
          body: mail.html,
        });
      }
    } catch (userEmailErr) {
      communicationsReviewRequired ||=
        (userEmailErr as any)?.code === "EMERGENCY_EFFECT_AMBIGUOUS";
      console.warn(
        "Collective user confirmation email failed:",
        (userEmailErr as any)?.message,
      );
    }

    // 2) Founder/admin lead alert — this is how CAMBRA hears about the join.
    const adminEmail = String(
      Deno.env.get("FOUNDER_EMAIL") ||
        Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "",
    ).trim();
    if (adminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      try {
        const bodyText = [
          `New collective member (founding).`,
          ``,
          `Email: ${email}`,
          gmvFmt ? `Monthly GMV: €${gmvFmt}` : null,
          Number.isFinite(annual) && annual > 0
            ? `Annual savings estimate: €${
              Math.round(annual).toLocaleString("en-US")
            }`
            : null,
          ctx.provider_slug ? `Provider: ${ctx.provider_slug}` : null,
          ctx.country ? `Country: ${ctx.country}` : null,
          sourceSession ? `Session: ${sourceSession}` : null,
          `Accepted at: ${member.accepted_at || new Date().toISOString()}`,
          ``,
          `Terms version accepted: ${TERMS_VERSION}`,
          `Locale: ${locale}`,
          `Member ID: ${member.id}`,
        ].filter(Boolean).join("\n");
        if (!communicationEpoch) {
          throw new Error("emergency_control_paused:communications");
        }
        await sendCostGovernedEmail(base44.asServiceRole, {
          event_key: `email:collective-admin:${member.id}`,
          stable_event_key: true,
          source: "joinCollective",
          related_entity_type: "CollectiveMember",
          related_entity_id: member.id,
          emergency_epoch_claim: communicationEpoch,
        }, {
          from_name: "CAMBRA",
          to: adminEmail,
          subject: `New collective member: ${email}${
            gmvFmt ? ` · €${gmvFmt}/mo` : ""
          }`,
          body:
            `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;">${bodyText}</pre>`,
        });
      } catch (emailErr) {
        communicationsReviewRequired ||=
          (emailErr as any)?.code === "EMERGENCY_EFFECT_AMBIGUOUS";
        console.warn(
          "Admin notification email failed:",
          (emailErr as any)?.message,
        );
      }
    }

    return Response.json({
      ok: true,
      member_id: member.id,
      communications_review_required: communicationsReviewRequired,
    }, {
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": rl.reset,
      },
    });
  } catch (error) {
    console.error("joinCollective error:", error);
    return internalErrorResponse(error, "joinCollective");
  }
});
