import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import {
  reconcileCommittedAdaptiveLeadDecisionProjection,
  verifyCommittedAdaptiveLeadDecisionProjection,
} from "../../base44/shared/intelligenceFoundationContracts.ts";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const committedLead = (overrides = {}) => ({
  id: "lead-projection-1",
  canonical_company_key: "domain:merchant.example",
  company_domain: "merchant.example",
  stage: "scored",
  reservoir_state: "qualified",
  score: 82,
  score_breakdown_json: {
    scoring_version: "merchant-company-opportunity-v3",
    scoring_contract: "company-only",
    methodology_class: "DETERMINISTIC_COMPANY_ONLY_HEURISTIC",
    company_only: true,
    contact_features_used: false,
    adaptive_lead_v0: {
      decision_id: "adaptive-decision:lead-projection-1:2020-01-01T00:00:00.000Z",
      candidate_id: "lead-projection-1",
      canonical_company_key: "domain:merchant.example",
      decision_time: "2020-01-01T00:00:00.000Z",
      disposition: "DECLARE_OUTREACH_WORTHY",
      intelligence_state_before: "CHEAP_SCREENED",
      intelligence_state_after: "OUTREACH_WORTHY",
      reason_codes: ["COMPANY_ONLY_THRESHOLDS_AND_SUPPORT_PASS"],
      scores: { fit: { value: 80 }, opportunity: { value: 82 } },
      gaps: [],
      unknowns: [],
      evidence_refs: ["evidence:company:1"],
      policy_version: "adaptive-policy-v0",
      rule_or_model_version: "adaptive-lead-core.v0",
      company_only: true,
      contact_features_used: false,
    },
  },
  ...overrides,
});

function memoryService(options = {}) {
  const rows = [];
  let filterCalls = 0;
  let failCreateEventType = options.failCreateEventType || null;
  return {
    rows,
    entities: {
      Event: {
        filter: async ({ idempotency_key }) => {
          filterCalls += 1;
          if (options.throwFilterCall === filterCalls) {
            throw new Error("simulated_event_read_failure");
          }
          if (options.lookupUnavailable) {
            throw new Error("simulated_event_lookup_unavailable");
          }
          return rows.filter((row) =>
            row.idempotency_key === idempotency_key
          );
        },
        create: async (row) => {
          if (failCreateEventType === row.event_type) {
            failCreateEventType = null;
            throw new Error("simulated_projection_create_failure");
          }
          const created = { id: `event-${rows.length + 1}`, ...row };
          rows.push(created);
          return created;
        },
      },
    },
  };
}

describe("Adaptive Lead append-only projection contact gate", () => {
  it("reconciles and replays the exact committed decision idempotently", async () => {
    const service = memoryService();
    const lead = committedLead();
    const before = structuredClone(lead);
    const first = await reconcileCommittedAdaptiveLeadDecisionProjection(
      service,
      lead,
      "reconcile-1",
    );
    const replay = await reconcileCommittedAdaptiveLeadDecisionProjection(
      service,
      lead,
      "different-retry-task",
    );

    expect(first).toMatchObject({
      allowed: true,
      state: "VERIFIED",
      append: { ok: true, created: 2, duplicate: 0 },
      rescore_performed: false,
      source_mutated: false,
      learning_eligible: false,
    });
    expect(replay).toMatchObject({
      allowed: true,
      state: "VERIFIED",
      append: { ok: true, created: 0, duplicate: 2 },
    });
    expect(service.rows).toHaveLength(2);
    expect(new Set(service.rows.map((row) => row.idempotency_key)).size).toBe(2);
    expect(service.rows.every((row) =>
      row.context_snapshot_id ===
        lead.score_breakdown_json.adaptive_lead_v0.decision_id &&
      row.source_json.content_hash === first.source_snapshot_hash &&
      row.learning_json.eligibility === "QUARANTINED" &&
      row.privacy_json.training_allowed === false
    )).toBe(true);
    expect(lead).toEqual(before);
  });

  it("fails closed for missing, unavailable, duplicate and mismatched events", async () => {
    const lead = committedLead();
    const missing = await verifyCommittedAdaptiveLeadDecisionProjection(
      memoryService(),
      lead,
    );
    expect(missing).toMatchObject({ allowed: false, state: "MISSING" });
    expect(missing.blockers).toEqual(expect.arrayContaining([
      "adaptive_experience_projection_missing:candidate.score_calculated",
      "adaptive_experience_projection_missing:candidate.outreach_worthiness_decided",
    ]));

    const unavailable = await verifyCommittedAdaptiveLeadDecisionProjection(
      memoryService({ lookupUnavailable: true }),
      lead,
    );
    expect(unavailable).toMatchObject({
      allowed: false,
      state: "LOOKUP_UNAVAILABLE",
      blockers: ["adaptive_experience_projection_lookup_unavailable"],
    });

    const duplicateService = memoryService();
    await reconcileCommittedAdaptiveLeadDecisionProjection(
      duplicateService,
      lead,
      "seed",
    );
    duplicateService.rows.push({ ...duplicateService.rows[0], id: "duplicate" });
    const duplicate = await verifyCommittedAdaptiveLeadDecisionProjection(
      duplicateService,
      lead,
    );
    expect(duplicate).toMatchObject({ allowed: false, state: "AMBIGUOUS" });

    const invalidService = memoryService();
    await reconcileCommittedAdaptiveLeadDecisionProjection(
      invalidService,
      lead,
      "seed-invalid",
    );
    invalidService.rows[0].source_json = {
      ...invalidService.rows[0].source_json,
      content_hash: `sha256:${"0".repeat(64)}`,
    };
    const invalid = await verifyCommittedAdaptiveLeadDecisionProjection(
      invalidService,
      lead,
    );
    expect(invalid).toMatchObject({ allowed: false, state: "INVALID" });
  });

  it("recovers a create-then-ack crash by exact read-back without rescoring", async () => {
    // Call 2 is the post-create read of the first event. The row exists, but
    // the writer observes an error exactly as it would after a lost ACK.
    const service = memoryService({ throwFilterCall: 2 });
    const result = await reconcileCommittedAdaptiveLeadDecisionProjection(
      service,
      committedLead(),
      "crashed-writer",
    );
    expect(result).toMatchObject({
      allowed: true,
      state: "VERIFIED",
      recovered_after_append_error: true,
      append: { ok: false },
      rescore_performed: false,
      source_mutated: false,
      learning_eligible: false,
    });
    expect(service.rows).toHaveLength(2);
  });

  it("leaves a partial projection blocked, then completes it on retry", async () => {
    const service = memoryService({
      failCreateEventType: "candidate.outreach_worthiness_decided",
    });
    const first = await reconcileCommittedAdaptiveLeadDecisionProjection(
      service,
      committedLead(),
      "partial-1",
    );
    expect(first).toMatchObject({ allowed: false, state: "MISSING" });
    expect(service.rows).toHaveLength(1);

    const retry = await reconcileCommittedAdaptiveLeadDecisionProjection(
      service,
      committedLead(),
      "partial-2",
    );
    expect(retry).toMatchObject({
      allowed: true,
      state: "VERIFIED",
      append: { ok: true, created: 1, duplicate: 1 },
      rescore_performed: false,
      source_mutated: false,
      learning_eligible: false,
    });
    expect(service.rows).toHaveLength(2);
  });

  it("gates both person endpoints on the exact committed Event projection", () => {
    const enrichment = read("base44/functions/leadEnrichmentAgent/entry.ts");
    const loop = enrichment.slice(enrichment.indexOf("for (const queuedLead"));
    const reconcile = loop.indexOf(
      "reconcileCommittedAdaptiveLeadDecisionProjection",
    );
    const firstPersonEndpoint = loop.indexOf("searchApolloContacts");
    const secondProjectionGate = loop.indexOf(
      '"IMMEDIATELY_BEFORE_PERSON_MATCH"',
    );
    const secondPersonEndpoint = loop.indexOf("matchApolloContact");
    expect(reconcile).toBeGreaterThanOrEqual(0);
    expect(reconcile).toBeLessThan(firstPersonEndpoint);
    expect(secondProjectionGate).toBeGreaterThan(firstPersonEndpoint);
    expect(secondProjectionGate).toBeLessThan(secondPersonEndpoint);
    expect(enrichment).toContain(
      "verifyCommittedAdaptiveLeadDecisionProjection(service, lead)",
    );
  });

  it("offers recovery through the existing scoring entry point before any model call", () => {
    const scoring = read("base44/functions/leadScoringAgent/entry.ts");
    const branch = scoring.indexOf("if (reconciliationOnly)");
    const modelCall = scoring.indexOf("text = await callClaude");
    expect(branch).toBeGreaterThanOrEqual(0);
    expect(branch).toBeLessThan(modelCall);
    const recoveryBlock = scoring.slice(branch, scoring.indexOf("let leads = []"));
    expect(recoveryBlock).toContain(
      "reconcileCommittedAdaptiveLeadDecisionProjection",
    );
    expect(recoveryBlock).toContain("rescore_performed: false");
    expect(recoveryBlock).toContain("source_mutated: false");
    expect(recoveryBlock).toContain("learning_eligible: false");
    expect(recoveryBlock).not.toContain("OutboundLead.update");
    expect(recoveryBlock).not.toContain("OutboundLead.bulkUpdate");
  });
});