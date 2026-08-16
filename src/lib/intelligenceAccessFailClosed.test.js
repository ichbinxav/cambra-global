import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

describe("Intelligence canonical gateway fail-closed reads", () => {
  const source = read("base44/functions/intelligenceAccess/entry.ts");

  it("never treats a failed dedupe or peer read as an empty result", () => {
    for (const operation of [
      "evidence_deduplication_read",
      "observation_deduplication_read",
      "claim_peer_read",
      "outcome_deduplication_read",
    ]) {
      expect(source).toContain(`'${operation}'`);
    }
    expect(source).not.toMatch(/deduplication[^\n]*fallback:\s*\[\]/);
    expect(source).not.toMatch(/claim_peer[^\n]*fallback:\s*\[\]/);
  });

  it("rejects capped reads instead of presenting partial history as complete", () => {
    for (const operation of [
      "claim_peer_read",
      "pricing_read",
      "benchmark_read",
    ]) {
      expect(source).toContain(`assertCompletePage(`);
      expect(source).toContain(`'${operation}'`);
    }
    expect(source).toContain("_coverage_incomplete");
    expect(source).toContain("readCompleteEntityPages");
    expect(source).toContain("privacy_safe_outcome_coverage_incomplete");
    expect(source).toContain("buildPrivacySafeOutcomeCalibration");
    const comparable = source.slice(
      source.indexOf("if(a==='get_comparable_outcomes')"),
      source.indexOf("if(a==='create_snapshot')"),
    );
    expect(comparable).toContain("AnonymizedIntelligenceAggregate");
    expect(comparable).not.toContain("IntelligenceOutcome");
  });

  it("uses a stable public operation-error boundary", () => {
    expect(source).toContain("operationErrorResponse(e, 'intelligenceAccess'");
    expect(source).not.toContain("error: 'intelligence_access_failed' }, { status: 500 }");
  });

  it("verifies every append after commit and makes snapshots idempotent", () => {
    expect(source).toContain("assertSingleCommittedRecord");
    for (const operation of [
      "evidence_deduplication",
      "observation_deduplication",
      "claim_version",
      "snapshot_deduplication",
      "outcome_deduplication",
    ]) {
      expect(source).toContain(`'${operation}'`);
    }
    expect(source).toContain("snapshot_key_content_conflict");
    expect(source).toContain("deduplicated: true");
  });
});
