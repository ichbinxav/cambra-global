// COMMAND-C1 (2026-08-17) — hash-chained receipt ledger behaviour.
//
// The ledger's job is to make tampering detectable and to stop Command from
// claiming an external effect on its own word. Both are tested here against a
// real (if simple) hash function, not a stub that always agrees.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildNextReceipt,
  canonicalReceiptPayload,
  RECEIPT_KINDS,
  RECEIPT_STATES,
  validateStateTransition,
  validateSupersession,
  verifyReceiptChain,
} from "../../base44/shared/commandReceiptLedger.ts";

// A real digest, so a mutated payload genuinely produces a different hash.
const sha256 = async (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const NOW = "2026-08-17T12:00:00.000Z";

async function chainOf(count, overrides = () => ({})) {
  const rows = [];
  let previous = null;
  for (let index = 0; index < count; index += 1) {
    const built = await buildNextReceipt(sha256, {
      previous, chain_key: "conv-1", now: NOW,
      receipt: { kind: "READ", state: "OBSERVED", tool_id: `tool-${index}`, ...overrides(index) },
    });
    expect(built.ok).toBe(true);
    rows.push(built.receipt);
    previous = built.receipt;
  }
  return rows;
}

describe("C1 — the chain is append-only and ordered", () => {
  it("numbers receipts from 1 and links each to the previous hash", async () => {
    const rows = await chainOf(3);
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3]);
    expect(rows[0].previous_receipt_hash).toBe("");
    expect(rows[1].previous_receipt_hash).toBe(rows[0].receipt_hash);
    expect(rows[2].previous_receipt_hash).toBe(rows[1].receipt_hash);
  });

  it("verifies a well-formed chain", async () => {
    const result = await verifyReceiptChain(sha256, await chainOf(5));
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(5);
  });

  it("verifies an empty chain without claiming anything", async () => {
    const result = await verifyReceiptChain(sha256, []);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(0);
  });

  it("refuses to append onto a previous row from a different chain", async () => {
    const [first] = await chainOf(1);
    const built = await buildNextReceipt(sha256, {
      previous: { ...first, chain_key: "conv-OTHER" }, chain_key: "conv-1", now: NOW,
      receipt: { kind: "READ", state: "OBSERVED" },
    });
    expect(built.ok).toBe(false);
    expect(built.error).toBe("previous_receipt_belongs_to_another_chain");
  });
});

describe("C1 — tampering is detected, and the break is located", () => {
  it("detects an edited field in the middle of the chain", async () => {
    const rows = await chainOf(4);
    // Someone rewrites what a step claimed, keeping the stored hash.
    rows[1] = { ...rows[1], state: "OBSERVED", tool_id: "tool-EDITED" };
    const result = await verifyReceiptChain(sha256, rows);
    expect(result.ok).toBe(false);
    expect(result.break_at).toBe(2);
    expect(result.reason).toBe("receipt_hash_mismatch");
  });

  it("detects a receipt removed from the middle", async () => {
    const rows = await chainOf(4);
    const withHole = [rows[0], rows[2], rows[3]];
    const result = await verifyReceiptChain(sha256, withHole);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("sequence_gap");
  });

  it("detects a duplicated sequence number", async () => {
    const rows = await chainOf(3);
    const duplicated = [rows[0], { ...rows[1], sequence: 1 }, rows[2]];
    const result = await verifyReceiptChain(sha256, duplicated);
    expect(result.ok).toBe(false);
    expect(["duplicate_sequence", "sequence_gap"]).toContain(result.reason);
  });

  it("detects a relinked previous hash", async () => {
    const rows = await chainOf(3);
    rows[2] = { ...rows[2], previous_receipt_hash: rows[0].receipt_hash };
    const result = await verifyReceiptChain(sha256, rows);
    expect(result.ok).toBe(false);
    expect(result.break_at).toBe(3);
    expect(result.reason).toBe("previous_hash_mismatch");
  });

  it("hashes every field that carries authority meaning", async () => {
    // If a field is not in the canonical payload, it can be changed without
    // breaking the chain — so the authority-bearing ones must be in there.
    const [row] = await chainOf(1);
    const payload = canonicalReceiptPayload(row);
    for (const field of [
      "sequence", "chain_key", "kind", "state", "tool_id", "input_hash", "output_hash",
      "permit_id", "permit_hash", "approval_id", "emergency_control_revision",
      "tenant_scope", "market_scope", "external_effect_performed", "domain_receipt_refs",
    ]) expect(payload, field).toHaveProperty(field);
  });

  it("is order-independent for reference lists so a reordering is not a false alarm", async () => {
    const a = canonicalReceiptPayload({ domain_receipt_refs: ["b", "a"], source_refs: ["y", "x"] });
    const b = canonicalReceiptPayload({ domain_receipt_refs: ["a", "b"], source_refs: ["x", "y"] });
    expect(a.domain_receipt_refs).toEqual(b.domain_receipt_refs);
    expect(a.source_refs).toEqual(b.source_refs);
  });
});

describe("C1 — Command cannot claim an external effect on its own word", () => {
  it("refuses an EFFECT receipt asserting an external effect with no domain receipt", async () => {
    const built = await buildNextReceipt(sha256, {
      previous: null, chain_key: "conv-1", now: NOW,
      receipt: { kind: "EFFECT", state: "OBSERVED", external_effect_performed: true, domain_receipt_refs: [] },
    });
    expect(built.ok).toBe(false);
    expect(built.error).toBe("external_effect_requires_domain_receipt_ref");
  });

  it("accepts it once a canonical domain receipt is referenced", async () => {
    const built = await buildNextReceipt(sha256, {
      previous: null, chain_key: "conv-1", now: NOW,
      receipt: {
        kind: "EFFECT", state: "OBSERVED", external_effect_performed: true,
        domain_receipt_refs: ["CostUsageEvent:cost-1"],
      },
    });
    expect(built.ok).toBe(true);
    expect(built.receipt.domain_receipt_refs).toEqual(["CostUsageEvent:cost-1"]);
  });

  it("does not require a domain receipt for a read", async () => {
    const built = await buildNextReceipt(sha256, {
      previous: null, chain_key: "conv-1", now: NOW,
      receipt: { kind: "READ", state: "OBSERVED" },
    });
    expect(built.ok).toBe(true);
  });
});

describe("C1 — epistemic states are enforced", () => {
  it("rejects an unsupported kind or state", async () => {
    expect((await buildNextReceipt(sha256, { previous: null, chain_key: "c", now: NOW, receipt: { kind: "WHATEVER", state: "OBSERVED" } })).error)
      .toBe("unsupported_receipt_kind");
    expect((await buildNextReceipt(sha256, { previous: null, chain_key: "c", now: NOW, receipt: { kind: "READ", state: "TRUE_ISH" } })).error)
      .toBe("unsupported_receipt_state");
  });

  it("never promotes weak evidence to OBSERVED or DERIVED", () => {
    for (const from of ["INFERRED", "UNVERIFIED", "CONFLICTED", "UNKNOWN"]) {
      for (const to of ["OBSERVED", "DERIVED"]) {
        const result = validateStateTransition({ from, to });
        expect(result.allowed, `${from}->${to}`).toBe(false);
        expect(result.reason).toBe("weak_evidence_cannot_be_promoted_to_observed");
      }
    }
  });

  it("allows weakening and allows a fresh observation as a new receipt", () => {
    expect(validateStateTransition({ from: "OBSERVED", to: "CONFLICTED" }).allowed).toBe(true);
    expect(validateStateTransition({ from: "UNKNOWN", to: "UNVERIFIED" }).allowed).toBe(true);
  });

  it("exposes the canonical vocabularies", () => {
    expect(RECEIPT_KINDS).toContain("SUPERSESSION");
    expect(RECEIPT_STATES).toContain("REVIEW_REQUIRED");
    expect(RECEIPT_STATES).toContain("UNKNOWN");
  });
});

describe("C1 — corrections are appended, never edited in place", () => {
  it("requires a SUPERSESSION naming what it replaces and why", () => {
    const target = { receipt_id: "r1", chain_key: "conv-1" };
    expect(validateSupersession({ receipt: { kind: "READ", chain_key: "conv-1" }, target }).blockers)
      .toContain("supersession_kind_required");
    expect(validateSupersession({ receipt: { kind: "SUPERSESSION", chain_key: "conv-1" }, target }).blockers)
      .toEqual(expect.arrayContaining(["supersedes_receipt_id_required", "superseded_reason_required"]));
  });

  it("refuses to supersede a receipt that does not exist or lives in another chain", () => {
    const receipt = { kind: "SUPERSESSION", chain_key: "conv-1", supersedes_receipt_id: "r1", superseded_reason: "founder corrected it" };
    expect(validateSupersession({ receipt, target: null }).blockers).toContain("superseded_receipt_not_found");
    expect(validateSupersession({ receipt, target: { receipt_id: "r1", chain_key: "conv-OTHER" } }).blockers)
      .toContain("cannot_supersede_across_chains");
  });

  it("allows a well-formed correction", () => {
    const result = validateSupersession({
      receipt: { kind: "SUPERSESSION", chain_key: "conv-1", supersedes_receipt_id: "r1", superseded_reason: "founder corrected the classification" },
      target: { receipt_id: "r1", chain_key: "conv-1" },
    });
    expect(result.allowed).toBe(true);
  });

  it("keeps the superseded receipt in the chain — history is not deleted", async () => {
    const rows = await chainOf(2);
    const correction = await buildNextReceipt(sha256, {
      previous: rows[1], chain_key: "conv-1", now: NOW,
      receipt: { kind: "SUPERSESSION", state: "OBSERVED", supersedes_receipt_id: rows[0].receipt_id, superseded_reason: "corrected" },
    });
    const full = [...rows, correction.receipt];
    const verified = await verifyReceiptChain(sha256, full);
    expect(verified.ok).toBe(true);
    // The original is still there and still verifiable.
    expect(full[0].receipt_id).toBe(rows[0].receipt_id);
    expect(full).toHaveLength(3);
  });
});
