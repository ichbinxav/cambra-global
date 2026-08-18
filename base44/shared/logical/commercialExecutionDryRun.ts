// AUDIT 2026-08-18 — moved out of base44/functions/commercialExecutionDryRun/entry.ts so hosts of this
// logical route can import it without a relative import escaping their bundle.
import { safeBestEffort } from '../bestEffort.ts';
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../internalGate.ts";
import { commercialExecutionDryRun } from "../commercialDryRun.ts";
import { internalErrorResponse } from '../publicErrors.ts';

export async function handleCommercialExecutionDryRun(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;
    const now = new Date().toISOString();
    const controlled = body.controlled_fixture === true;
    const fixtureLead = controlled
      ? {
          id: "DRY_RUN_LEAD",
          company_name: "CAMBRA Controlled Fixture",
          company_domain: "fixture.example",
          contact_full_name: "Controlled Recipient",
          contact_email: "controlled-recipient@fixture.example",
          contact_title: "Payments Director",
          country: "ES",
          industry: "ecommerce",
          source: "non_delivering_fixture",
          canonical_company_key: "domain:fixture.example",
          score: 88,
          score_breakdown_json: {
            evidence_confidence: 0.91,
            opportunity_score: 82,
            signals: { commerce_platform: "fixture" },
          },
          reservoir_state: "ready",
          revenue_stage: "outreach_ready",
          outreach_eligibility: "ELIGIBLE",
          compliance_status: "CLEARED",
          contactability: "PROFESSIONAL_VERIFIED",
          estimation_status: "PRE_ANALYSIS_ESTIMATE",
        }
      : null;
    const fixturePolicy = controlled
      ? {
          policy_key: "dry-run-policy",
          version: "controlled-v1",
          engine: "merchant_acquisition",
          status: "active",
          mode: "CANARY",
          daily_send_limit: 1,
          min_lead_score: 70,
          min_opportunity_score: 70,
          min_confidence: 0.8,
          countries: ["ES"],
          languages: ["es", "en"],
          max_followups: 1,
          followup_intervals_hours: [72],
          allowed_routine_actions: ["routine_reply", "request_referral"],
          prohibited_actions: ["final_pricing_acceptance"],
          autonomous_replies_enabled: true,
          meeting_proposals_enabled: false,
          approved_at: now,
          approved_by: "controlled_fixture",
          effective_at: now,
        }
      : null;
    const fixtureProfile = controlled
      ? {
          provider: "instantly",
          profile_key: "instantly:dry-run",
          external_campaign_id: "DRY_RUN_CAMPAIGN",
          from_address: "dry-run@cambra.invalid",
          status: "paused",
        }
      : null;
    const lead = controlled
      ? fixtureLead
      : body.lead_id
      ? await svc.entities.OutboundLead.get(String(body.lead_id)).catch(
          () => null,
        )
      : body.lead || null;
    const policy = controlled
      ? fixturePolicy
      : body.policy_id
      ? await svc.entities.CommercialPolicy.get(String(body.policy_id)).catch(
          () => null,
        )
      : body.policy || null;
    const profile = controlled
      ? fixtureProfile
      : body.profile_key
      ? (
          await svc.entities.OutboundSendingProfile.filter(
            { profile_key: String(body.profile_key) },
            "-created_date",
            1,
          ).catch((error:any)=>safeBestEffort(error,{operation:'commercialExecutionDryRun',fallback:[],severity:'critical'}))
        )[0]
      : body.profile || null;
    if (!lead || !policy || !profile)
      return Response.json(
        {
          ok: false,
          dry_run: true,
          error: "lead_policy_profile_required",
          real_provider_call: false,
          unsolicited_send_count: 0,
        },
        { status: 400 },
      );
    const suppression = controlled
      ? null
      :
      (
        await svc.entities.ContactSuppression.filter(
          {
            email: String(lead.contact_email || "").toLowerCase(),
            active: true,
          },
          "-created_date",
          1,
        ).catch((error:any)=>safeBestEffort(error,{operation:'commercialExecutionDryRun',fallback:[],severity:'critical'}))
      )[0] || null;
    const result = commercialExecutionDryRun({
      lead,
      policy,
      profile,
      suppressed: Boolean(suppression),
      language_override: body.language_override,
      simulated_reply: body.simulated_reply,
      subject: body.subject,
      body: body.message_body,
    });
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (error: any) {
    return internalErrorResponse(error, 'commercialExecutionDryRun');
  }
}
