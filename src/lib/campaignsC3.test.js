// CAMP-C3 (2026-08-16) — behavior tests for audience building, content
// validation, the claims gate, sequence validation and preflight
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C3).
//
// These invoke the real functions with real data. Per spec §26 no assertion
// here is a source-text grep: "suppression blocks the send" means the
// candidate actually lands in the SUPPRESSED bucket and not in `eligible`.
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_EXCLUSION_REASONS,
  audienceContentHash,
  buildAudienceReconciliation,
  normalizeEmail,
} from "../../base44/shared/campaignAudienceBuilder.ts";
import {
  evaluateClaimsGate,
  extractVariables,
  resolveContentVariables,
  validateCampaignContent,
} from "../../base44/shared/campaignContentValidator.ts";
import {
  MANDATORY_STOP_CONDITIONS,
  validateCampaignSequence,
} from "../../base44/shared/campaignSequenceValidator.ts";
import {
  buildApprovalBinding,
  buildCampaignPreflight,
} from "../../base44/shared/campaignPreflight.ts";

const NOW = "2026-08-16T12:00:00.000Z";

function candidate(overrides = {}) {
  return {
    subject_id: `s-${Math.random().toString(36).slice(2, 8)}`,
    email: "cfo@acme.example",
    company_key: "acme",
    country: "ES",
    ...overrides,
  };
}

describe("C3 — email normalization is a gate, not a parser", () => {
  it("accepts a normal address and lowercases it", () => {
    expect(normalizeEmail("  CFO@Acme.Example  ")).toBe("cfo@acme.example");
  });

  it("rejects everything it cannot vouch for", () => {
    for (
      const bad of [
        "", "   ", "no-at-sign", "@nolocal.com", "local@", "two@@at.com",
        "spaced address@x.com", "dotdot@x..com", "trailing@dot.", "nodot@localhost",
        null, undefined, 42,
      ]
    ) expect(normalizeEmail(bad), String(bad)).toBeNull();
  });
});

describe("C3 — audience reconciliation", () => {
  it("subtracts every candidate into exactly one bucket and reconciles", () => {
    const result = buildAudienceReconciliation([
      candidate({ subject_id: "ok-1", email: "a@acme.example", company_key: "acme" }),
      candidate({ subject_id: "dupe-person", contact_id: "c1", email: "b@globex.example", company_key: "globex" }),
      candidate({ subject_id: "dupe-person-2", contact_id: "c1", email: "b@globex.example", company_key: "globex" }),
      candidate({ subject_id: "dupe-company", email: "other@acme.example", company_key: "acme" }),
      candidate({ subject_id: "bad-email", email: "not-an-email", company_key: "initech" }),
      candidate({ subject_id: "protected", email: "c@fr.example", company_key: "frco", country: "FR" }),
      candidate({ subject_id: "merchant", email: "d@client.example", company_key: "client", is_merchant: true }),
      candidate({ subject_id: "policy", email: "e@blocked.example", company_key: "blocked", policy_blocked: true }),
    ], { exclude_existing_merchants: true, now: NOW });

    expect(result.reconciles).toBe(true);
    expect(result.reconciliation.selected_count).toBe(8);
    expect(result.reconciliation.deduplicated_person_count).toBe(1);
    expect(result.reconciliation.deduplicated_company_count).toBe(1);
    expect(result.reconciliation.invalid_email_count).toBe(1);
    expect(result.reconciliation.protected_market_count).toBe(1);
    expect(result.reconciliation.existing_merchant_excluded_count).toBe(1);
    expect(result.reconciliation.policy_blocked_count).toBe(1);
    expect(result.reconciliation.final_eligible_count).toBe(2);
  });

  it("excludes every protected market (FR, BE, NL) and any unknown market", () => {
    for (const country of ["FR", "BE", "NL", "ZZ", "", null]) {
      const result = buildAudienceReconciliation(
        [candidate({ country, email: "x@example.com" })],
        { now: NOW },
      );
      expect(result.reconciliation.final_eligible_count, String(country)).toBe(0);
      expect(result.excluded[0].reason, String(country)).toBe("PROTECTED_MARKET");
    }
  });

  it("blocks a suppressed recipient through every suppression scope", () => {
    const base = candidate({ contact_id: "c9", email: "cfo@acme.example", company_key: "acme" });
    const scopes = [
      { email: "cfo@acme.example", active: true, reason: "opt_out" },
      { scope_type: "PERSON", scope_value: "c9", active: true, reason: "manual" },
      { scope_type: "COMPANY", company_key: "acme", active: true, reason: "customer_exclusion" },
      { scope_type: "DOMAIN", domain: "acme.example", active: true, reason: "legal" },
    ];
    for (const suppression of scopes) {
      const result = buildAudienceReconciliation([base], { suppressions: [suppression], now: NOW });
      expect(result.reconciliation.suppressed_count, JSON.stringify(suppression)).toBe(1);
      expect(result.eligible).toHaveLength(0);
    }
  });

  it("honours the contact cooldown and treats an unreadable timestamp as a review-worthy exclusion", () => {
    const recent = buildAudienceReconciliation(
      [candidate({ last_contacted_at: "2026-08-14T12:00:00.000Z" })],
      { contact_cooldown_days: 45, now: NOW },
    );
    expect(recent.reconciliation.recently_contacted_excluded_count).toBe(1);

    const old = buildAudienceReconciliation(
      [candidate({ last_contacted_at: "2026-01-01T00:00:00.000Z" })],
      { contact_cooldown_days: 45, now: NOW },
    );
    expect(old.reconciliation.final_eligible_count).toBe(1);

    const unreadable = buildAudienceReconciliation(
      [candidate({ last_contacted_at: "not-a-date" })],
      { contact_cooldown_days: 45, now: NOW },
    );
    expect(unreadable.reconciliation.recently_contacted_excluded_count).toBe(1);
    expect(unreadable.excluded[0].detail).toBe("unreadable_last_contacted_at");
  });

  it("keeps up to max_contacts_per_company and excludes the rest as a company limit", () => {
    const rows = [
      candidate({ subject_id: "a", contact_id: "a", email: "a@acme.example", company_key: "acme" }),
      candidate({ subject_id: "b", contact_id: "b", email: "b@acme.example", company_key: "acme" }),
      candidate({ subject_id: "c", contact_id: "c", email: "c@acme.example", company_key: "acme" }),
    ];
    const result = buildAudienceReconciliation(rows, { max_contacts_per_company: 2, now: NOW });
    expect(result.reconciliation.final_eligible_count).toBe(2);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0].reason).toBe("COMPANY_CONTACT_LIMIT");
    expect(result.eligible.map((row) => row.company_contact_rank)).toEqual([1, 2]);
  });

  it("every exclusion carries an inspectable reason from the canonical list", () => {
    const result = buildAudienceReconciliation([
      candidate({ email: "bad" }),
      candidate({ email: "x@fr.example", country: "FR" }),
    ], { now: NOW });
    for (const row of result.excluded) {
      expect(AUDIENCE_EXCLUSION_REASONS).toContain(row.reason);
      expect(row.subject_id).toBeTruthy();
    }
  });

  it("hashes the same membership identically regardless of source order", async () => {
    const sha256 = async (value) => JSON.stringify(value);
    const a = await audienceContentHash(sha256, {
      campaign_id: "c1",
      eligible: [{ email_normalized: "b@x.com", company_key: "b" }, { email_normalized: "a@x.com", company_key: "a" }],
    });
    const b = await audienceContentHash(sha256, {
      campaign_id: "c1",
      eligible: [{ email_normalized: "a@x.com", company_key: "a" }, { email_normalized: "b@x.com", company_key: "b" }],
    });
    expect(a).toBe(b);
  });
});

describe("C3 — content variables", () => {
  it("extracts variables from subject and body", () => {
    expect(extractVariables("Hi {{first_name}}", "About {{company_name}} in {{city}}"))
      .toEqual(["city", "company_name", "first_name"]);
  });

  it("blocks when a required variable has no value and no fallback", () => {
    const result = resolveContentVariables({
      variables: ["first_name"],
      schema: { first_name: { required: true } },
      values: {},
    });
    expect(result.blocked).toBe(true);
    expect(result.unresolved).toEqual(["first_name"]);
  });

  it("uses an explicit fallback and reports that it was used", () => {
    const result = resolveContentVariables({
      variables: ["first_name"],
      schema: { first_name: { required: true, fallback: "there" } },
      values: {},
    });
    expect(result.blocked).toBe(false);
    expect(result.resolved.first_name).toBe("there");
    expect(result.used_fallback).toEqual(["first_name"]);
  });

  it("treats an undeclared variable as required so it never renders empty", () => {
    const result = resolveContentVariables({ variables: ["company_name"], values: {} });
    expect(result.blocked).toBe(true);
    expect(result.unresolved).toEqual(["company_name"]);
  });

  it("flags a variable outside the supported set", () => {
    const result = resolveContentVariables({ variables: ["their_secret_revenue"], values: { their_secret_revenue: "x" } });
    expect(result.unknown_variables).toEqual(["their_secret_revenue"]);
    expect(result.blocked).toBe(true);
  });
});

describe("C3 — claims gate", () => {
  const OBSERVED = [{
    claim_key: "SPECIFIC_ECONOMIC_CLAIM", subject_id: "m1",
    truth_state: "OBSERVED", source: "AnalyzerResult", observed_at: NOW,
  }];

  it("blocks a guarantee no matter what evidence exists", () => {
    const gate = evaluateClaimsGate({ body: "We guarantee savings of 20%.", subject_id: "m1", evidence: OBSERVED });
    expect(gate.passed).toBe(false);
    expect(gate.blocked_claims.map((row) => row.claim_key)).toContain("GUARANTEED_SAVINGS");
    expect(gate.blocked_claims[0].reason).toBe("claim_never_permitted");
  });

  it("blocks a specific economic claim without merchant-specific evidence", () => {
    const gate = evaluateClaimsGate({ body: "You are overpaying €80,000 every year.", subject_id: "m1" });
    expect(gate.passed).toBe(false);
    expect(gate.blocked_claims[0].claim_key).toBe("SPECIFIC_ECONOMIC_CLAIM");
    expect(gate.blocked_claims[0].reason).toBe("merchant_specific_evidence_required");
  });

  it("allows the same claim when evidence exists for THAT recipient", () => {
    const gate = evaluateClaimsGate({ body: "You are overpaying €80,000 every year.", subject_id: "m1", evidence: OBSERVED });
    expect(gate.passed).toBe(true);
    expect(gate.allowed_claims[0].claim_key).toBe("SPECIFIC_ECONOMIC_CLAIM");
  });

  it("does not let another merchant's evidence unlock the claim", () => {
    const gate = evaluateClaimsGate({
      body: "You are overpaying €80,000 every year.",
      subject_id: "m2",
      evidence: OBSERVED,
    });
    expect(gate.passed).toBe(false);
  });

  it("does not accept inferred evidence as observed", () => {
    const gate = evaluateClaimsGate({
      body: "You are overpaying €80,000 every year.",
      subject_id: "m1",
      evidence: [{ ...OBSERVED[0], truth_state: "INFERRED" }],
    });
    expect(gate.passed).toBe(false);
  });

  it("blocks an audit assertion we did not perform", () => {
    const gate = evaluateClaimsGate({ body: "We have audited your payments and found issues.", subject_id: "m1" });
    expect(gate.blocked_claims[0].claim_key).toBe("AUDIT_PERFORMED_CLAIM");
  });

  it("allows honest capability statements and provenance-backed observations", () => {
    const gate = evaluateClaimsGate({
      body: "We help European brands understand card-payment costs. Your checkout appears to use Stripe.",
      subject_id: "m1",
    });
    expect(gate.passed).toBe(true);
    expect(gate.blocked_claims).toEqual([]);
  });
});

describe("C3 — full content validation", () => {
  const BODY_OK = "Hi {{first_name}}, we help European brands understand card-payment costs. Reply to unsubscribe.";

  it("validates a clean content version", () => {
    const result = validateCampaignContent({
      content: {
        subject: "Card-payment costs at {{company_name}}",
        text_body: BODY_OK,
        language: "en",
        variable_schema_json: {
          first_name: { required: true, fallback: "there" },
          company_name: { required: true, source: "OutboundLead.company_name" },
        },
      },
      sample: [{ subject_id: "m1", values: { company_name: "Acme" } }],
    });
    expect(result.status).toBe("VALIDATED");
    expect(result.blockers).toEqual([]);
  });

  it("requires an unsubscribe path", () => {
    const result = validateCampaignContent({
      content: { subject: "Hi", text_body: "No opt-out line here.", language: "en" },
      sample: [{}],
    });
    expect(result.blockers).toContain("unsubscribe_line_required");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("catches a claim that only appears after a variable is rendered", () => {
    const result = validateCampaignContent({
      content: {
        subject: "Hi",
        text_body: "Hi, {{specific_observation}} Reply to unsubscribe.",
        language: "en",
        variable_schema_json: { specific_observation: { required: true } },
      },
      sample: [{ subject_id: "m1", values: { specific_observation: "You are overpaying €80,000." } }],
    });
    expect(result.blockers).toContain("claims_blocked");
    expect(result.blocked_claims[0].claim_key).toBe("SPECIFIC_ECONOMIC_CLAIM");
  });

  it("reports missing subject, body and language explicitly", () => {
    const result = validateCampaignContent({ content: {}, sample: [{}] });
    for (const blocker of ["subject_required", "text_body_required", "language_required"]) {
      expect(result.blockers).toContain(blocker);
    }
  });
});

describe("C3 — sequence validation", () => {
  const STEPS = [
    { step_key: "s1", ordinal: 1, delay_amount: 0, delay_unit: "HOURS", max_attempts: 1 },
    { step_key: "s2", ordinal: 2, delay_amount: 3, delay_unit: "BUSINESS_DAYS", max_attempts: 1 },
  ];
  const VALID = {
    steps: STEPS,
    stop_conditions: [...MANDATORY_STOP_CONDITIONS],
    business_hours_policy_json: { start: "09:00", end: "18:00" },
    timezone_policy: "RECIPIENT_LOCAL",
    out_of_office_policy_json: { max_reschedules: 1, counts_as_negative_reply: false },
    max_followups: 3,
  };

  it("validates a well-formed sequence", () => {
    const result = validateCampaignSequence(VALID);
    expect(result.status).toBe("VALIDATED");
    expect(result.blockers).toEqual([]);
    expect(result.follow_up_count).toBe(1);
  });

  it("blocks when ANY mandatory stop condition is missing", () => {
    for (const missing of MANDATORY_STOP_CONDITIONS) {
      const result = validateCampaignSequence({
        ...VALID,
        stop_conditions: MANDATORY_STOP_CONDITIONS.filter((value) => value !== missing),
      });
      expect(result.blockers, missing).toContain("mandatory_stop_conditions_missing");
      expect(result.missing_stop_conditions, missing).toEqual([missing]);
    }
  });

  it("blocks a follow-up with no positive delay — that would be an instant double send", () => {
    const result = validateCampaignSequence({
      ...VALID,
      steps: [STEPS[0], { ...STEPS[1], delay_amount: 0 }],
    });
    expect(result.blockers).toContain("sequence_steps_invalid");
    expect(result.step_issues[0].issues).toContain("followup_requires_positive_delay");
  });

  it("blocks an unbounded out-of-office reschedule and an OOO counted as negative", () => {
    const unbounded = validateCampaignSequence({ ...VALID, out_of_office_policy_json: { max_reschedules: 99 } });
    expect(unbounded.blockers).toContain("out_of_office_reschedule_must_be_bounded");
    const negative = validateCampaignSequence({
      ...VALID,
      out_of_office_policy_json: { max_reschedules: 1, counts_as_negative_reply: true },
    });
    expect(negative.blockers).toContain("out_of_office_must_not_count_as_negative_reply");
  });

  it("requires business hours and timezone once a follow-up exists", () => {
    const result = validateCampaignSequence({ ...VALID, business_hours_policy_json: null, timezone_policy: "" });
    expect(result.blockers).toContain("business_hours_policy_required");
    expect(result.blockers).toContain("timezone_policy_required");
  });

  it("rejects duplicate step keys and ordinals", () => {
    const result = validateCampaignSequence({
      ...VALID,
      steps: [STEPS[0], { ...STEPS[0] }],
    });
    expect(result.step_issues[0].issues).toEqual(
      expect.arrayContaining(["duplicate_step_key", "duplicate_ordinal"]),
    );
  });

  it("rejects an empty sequence", () => {
    expect(validateCampaignSequence({ steps: [] }).blockers).toContain("sequence_requires_at_least_one_step");
  });
});

describe("C3 — preflight has no silent partial PASS", () => {
  const CLEAN = {
    campaign: { id: "c1", market_scope: ["ES"] },
    audienceAvailable: true,
    audienceVersion: { status: "FROZEN", final_eligible_count: 120 },
    contentValidation: { status: "VALIDATED", blockers: [] },
    sequenceValidation: { status: "VALIDATED", blockers: [] },
    sendingProfilesAvailable: true,
    sendingProfiles: [{ status: "active", current_daily_cap: 50, webhook_status: "ACTIVE" }],
    policyAvailable: true,
    policy: { status: "active", policy_key: "merchant-acq", version: "3" },
    outboundControlAvailable: true,
    outboundControl: { acquisition_enabled: true },
    emergencyAvailable: true,
    emergency: { safe_mode: false, communications_paused: false, control_revision: 7 },
    budget: { available: true, remaining_minor: 50_000 },
    founderPermit: { authority_available: true, present: true },
  };

  it("passes only when every dimension passes", () => {
    const result = buildCampaignPreflight(CLEAN);
    expect(result.verdict).toBe("PASS");
    expect(result.approvable).toBe(true);
    expect(result.blocked_dimensions).toEqual([]);
    expect(result.unknown_dimensions).toEqual([]);
  });

  it("an UNKNOWN dimension is never a pass — it blocks approval", () => {
    const result = buildCampaignPreflight({ ...CLEAN, budget: { available: false } });
    expect(result.verdict).toBe("UNKNOWN");
    expect(result.approvable).toBe(false);
    expect(result.unknown_dimensions).toContain("budget");
  });

  it("reports the FounderPermit dimension as UNKNOWN on a tree without that authority", () => {
    const result = buildCampaignPreflight({ ...CLEAN, founderPermit: null });
    expect(result.unknown_dimensions).toContain("founder_permit");
    expect(result.approvable).toBe(false);
    const permit = result.dimensions.find((row) => row.key === "founder_permit");
    expect(permit.configuration_required).toBe(true);
  });

  it("BLOCKED beats UNKNOWN in the aggregate verdict", () => {
    const result = buildCampaignPreflight({
      ...CLEAN,
      budget: { available: false },
      outboundControl: { acquisition_enabled: false },
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.blocked_dimensions).toContain("outbound_control");
    expect(result.unknown_dimensions).toContain("budget");
  });

  it("blocks on SAFE MODE, on a paused outbound master and on an empty audience", () => {
    expect(buildCampaignPreflight({ ...CLEAN, emergency: { safe_mode: true } }).blocked_dimensions).toContain("emergency");
    expect(buildCampaignPreflight({ ...CLEAN, outboundControl: { acquisition_enabled: false } }).blocked_dimensions).toContain("outbound_control");
    expect(buildCampaignPreflight({
      ...CLEAN, audienceVersion: { status: "FROZEN", final_eligible_count: 0 },
    }).blocked_dimensions).toContain("audience");
  });

  it("blocks separately on a claims failure so the founder sees WHY", () => {
    const result = buildCampaignPreflight({
      ...CLEAN,
      contentValidation: { status: "REVIEW_REQUIRED", blockers: ["claims_blocked"], blocked_claims: [{ claim_key: "SPECIFIC_ECONOMIC_CLAIM" }] },
    });
    expect(result.blocked_dimensions).toContain("claims_policy");
    expect(result.verdict).toBe("BLOCKED");
  });

  it("requires the audience to be frozen before it can pass", () => {
    const result = buildCampaignPreflight({
      ...CLEAN, audienceVersion: { status: "BUILDING", final_eligible_count: 10 },
    });
    expect(result.review_dimensions).toContain("audience");
    expect(result.approvable).toBe(false);
  });

  it("never reports an external effect", () => {
    expect(buildCampaignPreflight(CLEAN).external_effect_performed).toBe(false);
  });

  it("every dimension keeps a valid verdict — no extra field may clobber it", () => {
    // Regression guard: dimension() spreads its extras last, so an extra named
    // `status` silently overwrote the verdict and made a REVIEW_REQUIRED
    // dimension look like a pass. Assert the invariant across many shapes.
    const shapes = [
      CLEAN,
      { ...CLEAN, audienceVersion: { status: "BUILDING", final_eligible_count: 10 } },
      { ...CLEAN, audienceVersion: { status: "READY", final_eligible_count: 10 } },
      { ...CLEAN, budget: { available: false } },
      { ...CLEAN, policy: { status: "paused" } },
      { ...CLEAN, sendingProfiles: [] },
      { ...CLEAN, founderPermit: null },
      {},
    ];
    for (const shape of shapes) {
      const result = buildCampaignPreflight(shape);
      for (const row of result.dimensions) {
        expect(["PASS", "BLOCKED", "REVIEW_REQUIRED", "UNKNOWN"], `${row.key}`).toContain(row.status);
      }
      // The aggregate must be consistent with the dimension list.
      const statuses = new Set(result.dimensions.map((row) => row.status));
      if (statuses.has("BLOCKED")) expect(result.verdict).toBe("BLOCKED");
      else if (statuses.has("UNKNOWN")) expect(result.verdict).toBe("UNKNOWN");
      else if (statuses.has("REVIEW_REQUIRED")) expect(result.verdict).toBe("REVIEW_REQUIRED");
      else expect(result.verdict).toBe("PASS");
      expect(result.approvable).toBe(result.verdict === "PASS");
    }
  });
});

describe("C3 — approval binding invalidates on any change", () => {
  const sha256 = async (value) => JSON.stringify(value);
  const BASE = {
    campaign_id: "c1",
    audience_content_hash: "a1",
    content_hash: "c1h",
    sequence_hash: "s1h",
    policy_version: "3",
    market_scope: ["ES"],
    sending_profile_keys: ["p1"],
    limits: { daily: 50 },
    budget_limit_minor: 10_000,
    emergency_control_revision: 7,
    actor: "founder@cambra.global",
    nonce: "n1",
    expires_at: "2026-08-17T12:00:00.000Z",
  };

  it("produces a stable hash for an unchanged scope", async () => {
    const a = await buildApprovalBinding(sha256, BASE);
    const b = await buildApprovalBinding(sha256, { ...BASE, market_scope: ["ES"] });
    expect(a.approval_hash).toBe(b.approval_hash);
  });

  it("changes the hash when ANY bound dimension changes", async () => {
    const base = await buildApprovalBinding(sha256, BASE);
    const mutations = [
      { audience_content_hash: "a2" },
      { content_hash: "c2h" },
      { sequence_hash: "s2h" },
      { policy_version: "4" },
      { market_scope: ["ES", "IT"] },
      { sending_profile_keys: ["p2"] },
      { limits: { daily: 100 } },
      { budget_limit_minor: 20_000 },
      { emergency_control_revision: 8 },
      { actor: "someone@else.com" },
      { nonce: "n2" },
      { expires_at: "2026-08-18T12:00:00.000Z" },
    ];
    for (const mutation of mutations) {
      const changed = await buildApprovalBinding(sha256, { ...BASE, ...mutation });
      expect(changed.approval_hash, JSON.stringify(mutation)).not.toBe(base.approval_hash);
    }
  });
});
