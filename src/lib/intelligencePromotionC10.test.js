// DASHBOARD-C10 (2026-08-17) — the missing middle of the pricing intelligence chain.
//
// The invariant these tests exist to hold: a detected source change is NOT a price.
// `rateIntelligenceWatchWorker` observes that a provider's pricing page changed. Nothing
// in that observation contains a number. If any path can turn one into a
// ProviderPricingVersion, CAMBRA starts quoting prices it invented.
//
// The second invariant: promotion is additive. A corrected price never erases the price
// that was true last month, because decisions were made on it.
import { describe, expect, it } from "vitest";
import {
  applyPromotion, buildPromotionQueue, classifyCandidate, CLOSED_CANDIDATE_STATES,
  economicFingerprint, previewPromotion, rejectCandidate, UNPROMOTABLE_EXTRACTION,
} from "../../base44/shared/intelligencePromotionCore.ts";
import { semanticFingerprint } from "./p3RateIntelligence.js";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => `h:${JSON.stringify(value).length}`;

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {}; const writes = [];
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async list() { if (broken.includes(name)) throw new Error("down"); return stores[name].map((r) => ({ ...r })); },
      async filter(where) {
        if (broken.includes(name)) throw new Error("down");
        return stores[name].filter((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)).map((r) => ({ ...r }));
      },
      async create(row) {
        if (broken.includes(`${name}:create`)) throw new Error("write refused");
        const created = { id: `${name.toLowerCase()}-${stores[name].length + 1}`, ...row };
        stores[name].push(created); writes.push({ op: "create", entity: name, row: created });
        return created;
      },
      async update(id, patch) {
        if (broken.includes(`${name}:update`)) throw new Error("write refused");
        const row = stores[name].find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        writes.push({ op: "update", entity: name, id, patch });
        return row;
      },
    };
    return built[name];
  };
  return { stores, writes, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

// What the watcher actually writes, taken from rateIntelligenceWatchWorker/entry.ts.
const unstructuredCandidate = (extra = {}) => ({
  id: "cand-1", candidate_key: "p3-change:w1:abc", provider_id: "prov-1", market: "FR",
  source_snapshot_id: "snap-2", current_observation_id: null,
  candidate_observation_json: {
    source_url: "https://example.test/pricing", previous_snapshot_id: "snap-1",
    new_snapshot_id: "snap-2", semantic_extraction_status: UNPROMOTABLE_EXTRACTION,
  },
  semantic_fingerprint: "abc", state: "REVIEW_REQUIRED",
  reason_codes: ["SOURCE_CONTENT_CHANGED", "NO_DETERMINISTIC_RATE_EXTRACTION_PROMOTION"],
  detected_at: "2026-08-01T00:00:00.000Z", ...extra,
});

const observation = (extra = {}) => ({
  provider_slug: "sumup", provider_id: "prov-1", market: "FR", vertical: "payments",
  pricing_dimension: "card_present", pricing_model: "FLAT", pricing_visibility: "PUBLIC_COMPLETE",
  observation_type: "PUBLIC_PUBLISHED", scope_type: "MARKET", currency: "EUR",
  variable_rate_bps: 175, fixed_fee_minor: 0, truth_level: "observed",
  knowledge_state: "observed", observed_at: NOW, version: 1,
  verification_status: "RESEARCHED", effective_date_certainty: "EXACT",
  effective_from: "2026-08-01", ...extra,
});

const extractedCandidate = (obs, signals = {}) => ({
  id: "cand-2", candidate_key: "p3-change:w2:def", provider_id: "prov-1", market: "FR",
  current_observation_id: null, state: "EXTRACTED",
  candidate_observation_json: {
    observation: obs, components: [],
    source_authority: "PRIMARY", market_unambiguous: true, product_unambiguous: true,
    channel_unambiguous: true, currency_valid: true, temporal_valid: true,
    parser_confidence: 0.99, no_conflict: true, invariants_ok: true, ...signals,
  },
  reason_codes: [], detected_at: "2026-08-10T00:00:00.000Z",
});

describe("C10 — a changed page can never become a price", () => {
  it("refuses to promote an unstructured change, whatever else is true", async () => {
    const out = await classifyCandidate({ candidate: unstructuredCandidate() });
    expect(out.promotable).toBe(false);
    expect(out.state).toBe("REVIEW_REQUIRED");
    expect(out.reason_codes).toContain("no_deterministic_extraction");
    expect(out.decision_note).toContain("would invent a price");
  });

  it("refuses even when every promotion signal is set to true", async () => {
    // The signals are attacker-shaped here on purpose: perfect signals with no numbers.
    const candidate = unstructuredCandidate();
    candidate.candidate_observation_json = {
      ...candidate.candidate_observation_json,
      source_authority: "PRIMARY", market_unambiguous: true, product_unambiguous: true,
      channel_unambiguous: true, currency_valid: true, temporal_valid: true,
      parser_confidence: 1, no_conflict: true, invariants_ok: true,
    };
    const out = await classifyCandidate({ candidate });
    expect(out.promotable).toBe(false);
  });

  it("refuses a candidate carrying no observation at all", async () => {
    const out = await classifyCandidate({
      candidate: { id: "c", state: "DETECTED", candidate_observation_json: {} },
    });
    expect(out.promotable).toBe(false);
    expect(out.reason_codes).toContain("no_deterministic_extraction");
  });

  it("previewPromotion refuses it, so apply cannot be reached with a hand-made hash", async () => {
    const svc = makeSvc({ RateChangeCandidate: [unstructuredCandidate()] });
    const out = await previewPromotion({ svc, candidate_id: "cand-1", sha256 });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("candidate_not_promotable");

    const applied = await applyPromotion({
      svc, actor: "founder", candidate_id: "cand-1", reason: "looks fine",
      expected_preview_hash: "anything", now: NOW, sha256,
    });
    expect(applied.ok).toBe(false);
    expect(svc.writes.filter((w) => w.entity === "ProviderPricingVersion")).toHaveLength(0);
  });
});

describe("C10 — the copy-only rule needs an economic fingerprint", () => {
  it("gives identical economics from different snapshots the SAME economic fingerprint", async () => {
    const a = await economicFingerprint({ observation: { ...observation(), source_snapshot_id: "snap-1" } });
    const b = await economicFingerprint({ observation: { ...observation(), source_snapshot_id: "snap-999" } });
    expect(a).toBe(b);
  });

  it("gives them DIFFERENT semanticFingerprints, which is the defect it works around", async () => {
    // semanticFingerprint includes source_snapshot_id in the hashed payload, so it can
    // never answer "are these the same economics?" — the property the P12 doc claims.
    const a = await semanticFingerprint({ observation: observation(), source_snapshot_id: "snap-1" });
    const b = await semanticFingerprint({ observation: observation(), source_snapshot_id: "snap-999" });
    expect(a).not.toBe(b);
  });

  it("changes the economic fingerprint when a rate changes", async () => {
    const a = await economicFingerprint({ observation: observation({ variable_rate_bps: 175 }) });
    const b = await economicFingerprint({ observation: observation({ variable_rate_bps: 195 }) });
    expect(a).not.toBe(b);
  });

  it("is order-stable across component ordering", async () => {
    const one = [{ component_type: "PERCENT", percentage_ppm: 17500 }, { component_type: "FIXED", amount_minor: 10 }];
    const a = await economicFingerprint({ observation: observation(), components: one });
    const b = await economicFingerprint({ observation: observation(), components: [...one].reverse() });
    expect(a).toBe(b);
  });

  it("rejects a candidate whose economics match the current version", async () => {
    const current = observation();
    const out = await classifyCandidate({
      candidate: extractedCandidate(observation()), currentVersion: current,
    });
    expect(out.copy_only).toBe(true);
    expect(out.state).toBe("REJECTED");
    expect(out.reason_codes).toContain("copy_only_change");
    expect(out.promotable).toBe(false);
  });
});

describe("C10 — an extracted candidate is judged on its own merits", () => {
  it("marks a clean primary observation auto-promotable", async () => {
    const out = await classifyCandidate({ candidate: extractedCandidate(observation()) });
    expect(out.state).toBe("AUTO_PROMOTABLE");
    expect(out.promotable).toBe(true);
  });

  it("falls back to review when a promotion signal is missing", async () => {
    const out = await classifyCandidate({
      candidate: extractedCandidate(observation(), { source_authority: "SECONDARY" }),
    });
    expect(out.state).toBe("REVIEW_REQUIRED");
    expect(out.reason_codes).toContain("signals_insufficient_for_automatic_promotion");
    // Still promotable BY AN OPERATOR — it has real numbers. Nothing promotes on its own.
    expect(out.promotable).toBe(true);
    expect(out.decision_note).toContain("nothing promotes on its own");
  });

  it("refuses an observation that does not validate", async () => {
    const out = await classifyCandidate({
      candidate: extractedCandidate(observation({ market: "ZZ", country: "ZZ" })),
    });
    expect(out.state).toBe("REVIEW_REQUIRED");
    expect(out.promotable).toBe(false);
    expect(out.reason_codes.some((code) => code.startsWith("invalid:"))).toBe(true);
  });

  it("treats a change to VERIFIED pricing as a conflict, not an automatic write", async () => {
    const out = await classifyCandidate({
      candidate: extractedCandidate(observation({ variable_rate_bps: 195 })),
      currentVersion: observation({ verification_status: "VERIFIED_PRIMARY" }),
    });
    expect(out.state).toBe("CONFLICT");
    expect(out.current_is_verified).toBe(true);
    expect(out.reason_codes).toContain("supersedes_verified_pricing");
  });

  it("will not re-adjudicate a closed candidate", async () => {
    for (const state of CLOSED_CANDIDATE_STATES) {
      const out = await classifyCandidate({ candidate: extractedCandidate(observation(), {}), });
      expect(out.state).not.toBe("CLOSED");
      const closed = await classifyCandidate({
        candidate: { ...extractedCandidate(observation()), state },
      });
      expect(closed.state).toBe("CLOSED");
      expect(closed.promotable).toBe(false);
    }
  });
});

describe("C10 — promotion is additive and never rewrites a price that was true", () => {
  const setup = (currentExtra = {}) => {
    const current = { id: "ppv-1", ...observation({ status: "CURRENT", ...currentExtra }) };
    const candidate = {
      ...extractedCandidate(observation({ variable_rate_bps: 195 })),
      current_observation_id: "ppv-1",
    };
    return makeSvc({ ProviderPricingVersion: [current], RateChangeCandidate: [candidate] });
  };

  it("creates a new version and marks the old one superseded, leaving its rate intact", async () => {
    const svc = setup();
    const preview = await previewPromotion({ svc, candidate_id: "cand-2", sha256 });
    expect(preview.ok).toBe(true);

    const out = await applyPromotion({
      svc, actor: "founder@cambra", candidate_id: "cand-2", reason: "provider published a new rate card",
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.history_mutated).toBe(false);

    const old = svc.stores.ProviderPricingVersion.find((r) => r.id === "ppv-1");
    const created = svc.stores.ProviderPricingVersion.find((r) => r.id === out.version_id);
    // The old row is retired, but its economics are untouched: 175 was true, and a
    // decision was made on it.
    expect(old.variable_rate_bps).toBe(175);
    expect(old.status).toBe("SUPERSEDED");
    expect(old.superseded_by_observation_id).toBe(out.version_id);
    expect(created.variable_rate_bps).toBe(195);
    expect(created.supersedes_observation_id).toBe("ppv-1");
    expect(created.version).toBe(2);
  });

  it("never creates a promoted version as VERIFIED", async () => {
    const svc = setup();
    const preview = await previewPromotion({ svc, candidate_id: "cand-2", sha256 });
    const out = await applyPromotion({
      svc, actor: "a", candidate_id: "cand-2", reason: "r",
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    const created = svc.stores.ProviderPricingVersion.find((r) => r.id === out.version_id);
    // Verification is a separate act with its own evidence.
    expect(created.verification_status).toBe("RESEARCHED");
    expect(created.truth_level).toBe("observed");
  });

  it("raises a KnowledgeConflict when it supersedes verified pricing", async () => {
    const svc = setup({ verification_status: "VERIFIED_PRIMARY" });
    const preview = await previewPromotion({ svc, candidate_id: "cand-2", sha256 });
    expect(preview.preview.raises_conflict).toBe(true);
    const out = await applyPromotion({
      svc, actor: "a", candidate_id: "cand-2", reason: "r",
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(out.conflict_required).toBe(true);
    expect(out.conflict_id).toBeTruthy();
    expect(svc.stores.KnowledgeConflict[0].affects_active_operation).toBe(true);
  });

  it("closes the candidate so the queue does not re-offer it", async () => {
    const svc = setup();
    const preview = await previewPromotion({ svc, candidate_id: "cand-2", sha256 });
    await applyPromotion({
      svc, actor: "a", candidate_id: "cand-2", reason: "r",
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(svc.stores.RateChangeCandidate[0].state).toBe("PROMOTED");
  });

  it("reports when the previous version could not be retired instead of hiding it", async () => {
    const current = { id: "ppv-1", ...observation({ status: "CURRENT" }) };
    const candidate = {
      ...extractedCandidate(observation({ variable_rate_bps: 195 })),
      current_observation_id: "ppv-1",
    };
    const svc = makeSvc(
      { ProviderPricingVersion: [current], RateChangeCandidate: [candidate] },
      ["ProviderPricingVersion:update"],
    );
    const preview = await previewPromotion({ svc, candidate_id: "cand-2", sha256 });
    const out = await applyPromotion({
      svc, actor: "a", candidate_id: "cand-2", reason: "r",
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    // Two rows claiming CURRENT is a real state and must be visible, not silent.
    expect(out.superseded_previous).toBe(false);
    expect(out.two_rows_claim_current).toBe(true);
  });

  it("refuses a promotion with no stated reason", async () => {
    const svc = setup();
    const out = await applyPromotion({
      svc, actor: "a", candidate_id: "cand-2", reason: "",
      expected_preview_hash: "x", now: NOW, sha256,
    });
    expect(out.error).toBe("reason_required");
    expect(svc.writes).toHaveLength(0);
  });

  it("refuses to apply a promotion the operator did not see", async () => {
    const svc = setup();
    const out = await applyPromotion({
      svc, actor: "a", candidate_id: "cand-2", reason: "r",
      expected_preview_hash: "stale", now: NOW, sha256,
    });
    expect(out.error).toBe("preview_hash_mismatch");
    expect(svc.stores.ProviderPricingVersion).toHaveLength(1);
  });
});

describe("C10 — the queue is the exit that did not exist", () => {
  it("classifies the open candidates the watcher has been accumulating", async () => {
    const svc = makeSvc({
      RateChangeCandidate: [
        unstructuredCandidate(),
        { ...unstructuredCandidate({ id: "cand-3", state: "PROMOTED" }) },
        extractedCandidate(observation()),
      ],
    });
    const out = await buildPromotionQueue({ svc });
    // The PROMOTED one is closed and not re-offered.
    expect(out.rows).toHaveLength(2);
    expect(out.open_count).toBe(2);
    expect(out.promotable_count).toBe(1);
    expect(out.unpromotable_reason_summary.no_deterministic_extraction).toBe(1);
  });

  it("reports null counts when the candidate source is unreadable", async () => {
    const svc = makeSvc({ RateChangeCandidate: [unstructuredCandidate()] }, ["RateChangeCandidate"]);
    const out = await buildPromotionQueue({ svc });
    // An unreadable queue is not an empty queue.
    expect(out.candidates_read).toBeNull();
    expect(out.open_count).toBeNull();
    expect(out.source_status).toBe("UNAVAILABLE");
  });

  it("does not treat an unreadable current version as a first observation", async () => {
    const svc = makeSvc(
      {
        RateChangeCandidate: [{ ...extractedCandidate(observation()), current_observation_id: "ppv-1" }],
        ProviderPricingVersion: [{ id: "ppv-1", ...observation() }],
      },
      ["ProviderPricingVersion"],
    );
    const out = await buildPromotionQueue({ svc });
    expect(out.rows[0].reason_codes).toContain("current_version_unreadable");
    expect(out.rows[0].promotable).toBe(false);
  });
});

describe("C10 — a candidate that can never be promoted can still be closed", () => {
  it("rejects with a reason, and changes no pricing", async () => {
    const svc = makeSvc({ RateChangeCandidate: [unstructuredCandidate()] });
    const out = await rejectCandidate({
      svc, actor: "founder", candidate_id: "cand-1",
      reason: "wording change on the pricing page, rates unchanged", now: NOW,
    });
    expect(out.ok).toBe(true);
    expect(out.pricing_changed).toBe(false);
    expect(svc.stores.RateChangeCandidate[0].state).toBe("REJECTED");
    expect(svc.writes.filter((w) => w.entity === "ProviderPricingVersion")).toHaveLength(0);
  });

  it("refuses a dismissal with no reason", async () => {
    const svc = makeSvc({ RateChangeCandidate: [unstructuredCandidate()] });
    const out = await rejectCandidate({ svc, actor: "a", candidate_id: "cand-1", reason: "", now: NOW });
    expect(out.error).toBe("reason_required");
    expect(svc.writes).toHaveLength(0);
  });

  it("refuses to re-close an already closed candidate", async () => {
    const svc = makeSvc({ RateChangeCandidate: [unstructuredCandidate({ state: "REJECTED" })] });
    const out = await rejectCandidate({ svc, actor: "a", candidate_id: "cand-1", reason: "r", now: NOW });
    expect(out.error).toBe("candidate_already_closed");
  });
});
