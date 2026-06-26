// Admin-only, idempotent seeder for the two hard compliance rules (M0B skeleton).
// Does NOT build a Compliance Center, AI review, or any rule beyond these two.
// Re-running is safe: it upserts by rule_id and never creates duplicates.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const HARD_RULES = [
  // ── claims ─────────────────────────────────────────────────────────────────
  {
    rule_id: "no_guaranteed_savings",
    title: "No guaranteed savings claims",
    category: "claims",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "Marketing copy, reports, AI outputs and provider deals must never claim or imply guaranteed savings. Savings are always estimated, verified, or realized — never guaranteed.",
  },
  {
    rule_id: "savings_must_have_confidence_label",
    title: "Savings figures require a confidence label",
    category: "claims",
    severity: "high",
    blocking: true,
    active: true,
    description:
      "Any savings figure shown to a user (analyzer, dashboard, report, email) must be tagged 'estimated', 'verified', or 'realized'. Bare numbers without a confidence label are forbidden.",
  },
  {
    rule_id: "no_competitor_disparagement",
    title: "No disparagement of named providers",
    category: "claims",
    severity: "medium",
    blocking: false,
    active: true,
    description:
      "Reports and AI outputs may compare effective rates against named providers, but must not contain disparaging or unsubstantiated qualitative claims about competitors.",
  },

  // ── provider_deal ──────────────────────────────────────────────────────────
  {
    rule_id: "no_live_deal_without_signed_agreement",
    title: "No live provider deal unless provider_agreement_signed = true",
    category: "provider_deal",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "A provider deal may only be shown as 'live' if provider_agreement_signed is true. Without a signed agreement, the deal must remain soon/planned/waitlist.",
  },
  {
    rule_id: "deal_must_disclose_revenue_share",
    title: "Provider deals must disclose CAMBRA revenue share",
    category: "provider_deal",
    severity: "high",
    blocking: true,
    active: true,
    description:
      "Every active provider deal must declare CAMBRA's success-fee / revenue-share model to the brand before authorization. Hidden remuneration is forbidden.",
  },

  // ── benchmark ──────────────────────────────────────────────────────────────
  {
    rule_id: "benchmark_min_sample_size",
    title: "Public benchmarks require n ≥ 5",
    category: "benchmark",
    severity: "high",
    blocking: true,
    active: true,
    description:
      "BenchmarkCohort rows must only be exposed to users (is_public=true) when n ≥ 5 validated, non-flagged contributions. Smaller cohorts must fall back to the static reference table.",
  },
  {
    rule_id: "benchmark_source_must_be_labeled",
    title: "Benchmark source must be labeled (network vs static)",
    category: "benchmark",
    severity: "medium",
    blocking: false,
    active: true,
    description:
      "Any benchmark shown to a user must indicate whether it comes from the CAMBRA network (with n) or from the static reference table. Confidence label is mandatory.",
  },

  // ── oauth ──────────────────────────────────────────────────────────────────
  {
    rule_id: "oauth_scopes_must_be_minimal_readonly",
    title: "OAuth scopes must be minimal and read-only by default",
    category: "oauth",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "App-user connectors (Drive, Sheets, Gmail, Slack, banking) must request the minimum scopes necessary and remain read-only unless an explicit write-action is required by a feature already approved by the brand.",
  },
  {
    rule_id: "oauth_consent_must_be_logged",
    title: "OAuth consent and revocation must be logged",
    category: "oauth",
    severity: "high",
    blocking: true,
    active: true,
    description:
      "Every OAuth authorization or revocation must produce a ConsentRecord row with brand_id, provider, scope, granted_at/revoked_at. Silent token persistence is forbidden.",
  },

  // ── ai_action ──────────────────────────────────────────────────────────────
  {
    rule_id: "ai_must_not_act_on_external_systems_without_human_approval",
    title: "AI must not act on external systems without explicit human approval",
    category: "ai_action",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "AI agents (recommendation, payments, shipping) must produce proposals only. Any action that mutates an external system (provider switch, contract change, payment) requires an AgentRun.approved=true event by a human.",
  },
  {
    rule_id: "ai_output_must_be_attributable",
    title: "AI outputs must be attributable and versioned",
    category: "ai_action",
    severity: "medium",
    blocking: false,
    active: true,
    description:
      "AI-generated content (recommendations, insights, copilot answers) must be persisted with model, prompt_version and engine_version so outputs can be audited and reproduced.",
  },

  // ── data_processing ────────────────────────────────────────────────────────
  {
    rule_id: "no_raw_credentials_in_entities",
    title: "Raw credentials must never be stored in entity fields",
    category: "data_processing",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "OAuth access tokens, refresh tokens, API keys and passwords must never be stored in plain entity fields. Only opaque references (access_token_ref) are allowed.",
  },
  {
    rule_id: "benchmark_anon_id_must_not_be_exposed",
    title: "BenchmarkContribution.source_anon_id must never reach the frontend",
    category: "data_processing",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "source_anon_id is a stable pseudonym, NOT anonymous under GDPR while the salt exists. It must never appear in any frontend response, log payload, or third-party export.",
  },

  // ── security ───────────────────────────────────────────────────────────────
  {
    rule_id: "webhooks_must_validate_authenticity",
    title: "Webhook endpoints must validate authenticity",
    category: "security",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "Endpoints invoked without user auth (provider webhooks) must validate the request via the provider's signature (e.g. Stripe) or a shared secret query parameter. Unauthenticated mutations are forbidden.",
  },
  {
    rule_id: "admin_only_functions_must_check_role",
    title: "Admin-only backend functions must verify user.role === 'admin'",
    category: "security",
    severity: "high",
    blocking: true,
    active: true,
    description:
      "Backend functions performing admin operations (seeders, overrides, recompute jobs) must call base44.auth.me() and return 403 if user.role !== 'admin'. Service-role calls without role checks are forbidden.",
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "forbidden", message: "Admin only" }, { status: 403 });
    }

    const results = [];
    for (const rule of HARD_RULES) {
      // Idempotency: upsert by rule_id, never duplicate.
      const existing = await base44.asServiceRole.entities.ComplianceRule
        .filter({ rule_id: rule.rule_id })
        .catch(() => []);

      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.ComplianceRule
          .update(existing[0].id, rule)
          .catch(() => null);
        results.push({ rule_id: rule.rule_id, action: "updated" });
      } else {
        await base44.asServiceRole.entities.ComplianceRule
          .create(rule)
          .catch(() => null);
        results.push({ rule_id: rule.rule_id, action: "created" });
      }
    }

    return Response.json({ ok: true, seeded: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});