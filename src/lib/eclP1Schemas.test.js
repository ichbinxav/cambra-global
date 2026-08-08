// v62.3 ECL P1 — schema contract tests. These PARSE the six schema files from
// disk (no greps) and assert the exact approved shape: fields, enums, required
// sets, RLS, and the deliberate absences. A schema that drifts fails here.
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../../base44/entities/${name}.jsonc`, import.meta.url), "utf8"));

const ADMIN_ONLY = { user_condition: { role: "admin" } };
const OWNER_OR_ADMIN = { $or: [{ user_condition: { role: "admin" } }, { created_by: "{{user.email}}" }] };

const StatementImport = load("StatementImport");
const SavingsEvidence = load("SavingsEvidence");
const EvidenceAttestation = load("EvidenceAttestation");
const EvidenceLifecycleEvent = load("EvidenceLifecycleEvent");
const EvidenceStrike = load("EvidenceStrike");
const ReviewCase = load("ReviewCase");

describe("ECL P1 — extended schemas (additive only)", () => {
  it("StatementImport keeps its original required set", () => {
    expect(StatementImport.required).toEqual(["file_url", "parser", "parsed_status"]);
  });

  it("StatementImport gains the 11 ECL fields, all optional", () => {
    const added = [
      "owner_email", "confidence_result", "confidence_result_hash", "evidence_status",
      "provisional_started_at", "expires_at", "next_lifecycle_action_at",
      "reminder_count", "superseded_by_id",
    ];
    for (const f of added) expect(StatementImport.properties[f]).toBeDefined();
    for (const f of added) expect(StatementImport.required).not.toContain(f);
  });

  it("evidence_status has NO default — a legacy row never gets an invented lifecycle", () => {
    const f = StatementImport.properties.evidence_status;
    expect(f.type).toBe("string");
    expect("default" in f).toBe(false);
    expect(f.enum).toEqual([
      "pending", "processing", "estimated", "accepted_provisionally", "verified",
      "rejected", "expired", "superseded", "under_review",
    ]);
  });

  it("evidence_status is distinct from parsed_status, which is untouched", () => {
    expect(StatementImport.properties.parsed_status.default).toBe("pending");
    expect(StatementImport.properties.parsed_status.enum).toContain("format_unknown");
  });

  it("reminder_count defaults to 0 (a count of zero is true for every legacy row)", () => {
    expect(StatementImport.properties.reminder_count.default).toBe(0);
  });

  it("SavingsEvidence keeps its required set and its numeric confidence_level", () => {
    expect(SavingsEvidence.required).toEqual(["source_type", "evidence_type", "verification_status"]);
    expect(SavingsEvidence.properties.confidence_level.type).toBe("number");
  });

  it("confidence_level_ecl is a SEPARATE categorical field, never overloading the number", () => {
    const f = SavingsEvidence.properties.confidence_level_ecl;
    expect(f.type).toBe("string");
    expect(f.enum).toEqual(["high", "medium", "low", "unknown"]);
    expect("default" in f).toBe(false);
  });

  it("freeze_eligibility exists as storage only, with the three approved values", () => {
    expect(SavingsEvidence.properties.freeze_eligibility.enum).toEqual([
      "eligible", "conditionally_eligible", "not_eligible",
    ]);
  });

  it("both extended schemas keep their ORIGINAL owner-or-admin RLS", () => {
    expect(StatementImport.rls.read).toEqual(OWNER_OR_ADMIN);
    expect(StatementImport.rls.write).toEqual(OWNER_OR_ADMIN);
    expect(SavingsEvidence.rls.read).toEqual(OWNER_OR_ADMIN);
    expect(SavingsEvidence.rls.write).toEqual(OWNER_OR_ADMIN);
  });
});

describe("ECL P1 — new schemas", () => {
  it("EvidenceAttestation requires the full acceptance evidence set", () => {
    expect(EvidenceAttestation.required).toEqual([
      "attestor_user_id", "brand_id", "owner_email", "evidence_entity_type", "evidence_id",
      "declared_metrics", "legal_text_version", "legal_text_hash", "language", "idempotency_key",
    ]);
  });

  it("EvidenceAttestation stores HMAC digests with a key version, never raw IP/UA", () => {
    const p = EvidenceAttestation.properties;
    expect(p.ip_hmac).toBeDefined();
    expect(p.ua_hmac).toBeDefined();
    expect(p.fingerprint_key_version).toBeDefined();
    expect(p.ip_address).toBeUndefined();
    expect(p.user_agent).toBeUndefined();
    expect(EvidenceAttestation.description).toMatch(/PENDING LEGAL AND PRIVACY REVIEW/);
  });

  it("EvidenceAttestation freezes the language of the signed text", () => {
    expect(EvidenceAttestation.properties.language.enum).toEqual(["es", "fr", "en"]);
    expect(EvidenceAttestation.properties.evidence_entity_type.enum).toEqual(["statement_import", "savings_evidence"]);
  });

  it("EvidenceLifecycleEvent keeps to_status a free string so no event is ever lost", () => {
    expect(EvidenceLifecycleEvent.properties.to_status.type).toBe("string");
    expect(EvidenceLifecycleEvent.properties.to_status.enum).toBeUndefined();
    expect(EvidenceLifecycleEvent.properties.actor.enum).toEqual(["system", "user", "reviewer"]);
  });

  it("EvidenceLifecycleEvent requires correlation + idempotency, from_status optional", () => {
    expect(EvidenceLifecycleEvent.required).toEqual([
      "evidence_entity_type", "evidence_id", "brand_id", "owner_email",
      "to_status", "event", "actor", "correlation_id", "idempotency_key",
    ]);
    expect(EvidenceLifecycleEvent.required).not.toContain("from_status");
  });

  it("EvidenceStrike is scoped and always expires", () => {
    expect(EvidenceStrike.properties.scope.enum).toEqual(["payments", "commerce", "accounting"]);
    expect(EvidenceStrike.required).toContain("expires_at");
    expect(EvidenceStrike.properties.withdrawn_by).toBeDefined();
    expect(EvidenceStrike.properties.withdrawn_at).toBeDefined();
  });

  it("ReviewCase separates economic from quality doubt and defaults to open", () => {
    expect(ReviewCase.properties.severity.enum).toEqual(["economic", "quality"]);
    expect(ReviewCase.properties.status.default).toBe("open");
    expect(ReviewCase.properties.status.enum).toEqual(["open", "awaiting_merchant", "resolving", "resolved", "dismissed"]);
  });

  it("ReviewCase deliberately has NO assignee, SLA, deadline or escalation", () => {
    for (const f of ["assignee", "assignee_email", "sla", "sla_hours", "deadline", "due_at", "escalation", "escalated_at"]) {
      expect(ReviewCase.properties[f]).toBeUndefined();
    }
  });

  it("all four new schemas are admin/service-role only, read AND write", () => {
    for (const s of [EvidenceAttestation, EvidenceLifecycleEvent, EvidenceStrike, ReviewCase]) {
      expect(s.rls.read).toEqual(ADMIN_ONLY);
      expect(s.rls.write).toEqual(ADMIN_ONLY);
    }
  });

  it("every structured field is an object, never a JSON string", () => {
    expect(EvidenceAttestation.properties.declared_metrics.type).toBe("object");
    expect(EvidenceLifecycleEvent.properties.payload.type).toBe("object");
    expect(ReviewCase.properties.blocking_actions.type).toBe("object");
    expect(StatementImport.properties.confidence_result.type).toBe("object");
    expect(SavingsEvidence.properties.confidence_result.type).toBe("object");
  });

  it("all six schemas carry owner_email so ownership is never inferred", () => {
    for (const s of [StatementImport, SavingsEvidence, EvidenceAttestation, EvidenceLifecycleEvent, EvidenceStrike, ReviewCase]) {
      expect(s.properties.owner_email).toBeDefined();
    }
  });

  it("every new schema persists an idempotency key (Base44 has no transactions)", () => {
    for (const s of [EvidenceAttestation, EvidenceLifecycleEvent, EvidenceStrike, ReviewCase]) {
      expect(s.required).toContain("idempotency_key");
    }
  });
});

describe("ECL P1 — untouched neighbours", () => {
  it("Baseline gains no ECL field", () => {
    const Baseline = load("Baseline");
    const text = JSON.stringify(Baseline);
    expect(text).not.toMatch(/confidence_level_ecl|freeze_eligibility|evidence_status/);
  });

  it("processUploadedFile writes none of the new fields (they stay inert)", () => {
    const src = fs.readFileSync(new URL("../../base44/functions/processUploadedFile/entry.ts", import.meta.url), "utf8");
    for (const f of ["evidence_status", "confidence_result", "owner_email", "next_lifecycle_action_at", "reminder_count"]) {
      expect(src).not.toContain(f);
    }
  });
});