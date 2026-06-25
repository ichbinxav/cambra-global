// Admin-only, idempotent seeder for the two hard compliance rules (M0B skeleton).
// Does NOT build a Compliance Center, AI review, or any rule beyond these two.
// Re-running is safe: it upserts by rule_id and never creates duplicates.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const HARD_RULES = [
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
    rule_id: "no_live_deal_without_signed_agreement",
    title: "No live provider deal unless provider_agreement_signed = true",
    category: "provider_deal",
    severity: "critical",
    blocking: true,
    active: true,
    description:
      "A provider deal may only be shown as 'live' if provider_agreement_signed is true. Without a signed agreement, the deal must remain soon/planned/waitlist.",
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