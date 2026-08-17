// DASHBOARD-C3 (2026-08-17) — Pipeline portfolio projection and transitions.
//
// The projection is not an authority: it reads four existing ones. These tests
// drive the real functions against an in-memory store and assert what a founder
// would actually see, plus what a transition refuses to do.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyFilters,
  applyStageChange,
  buildPipelineKpis,
  buildPipelinePortfolio,
  previewStageChange,
  primaryColumn,
} from "../../base44/shared/pipelineCore.ts";
import { canonicalToLegacy } from "../../base44/shared/pipelineStageRegistry.ts";
import { buildSourceHealth } from "../../base44/shared/workspaceContract.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function makeSvc(rows = {}, broken = []) {
  const stores = {};
  const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((row) => ({ ...row }));
    if (built[name]) return built[name];
    built[name] = {
      get rows() { return stores[name]; },
      async list() { if (broken.includes(name)) throw new Error(`${name}_down`); return stores[name].map((r) => ({ ...r })); },
      async get(id) {
        if (broken.includes(name)) throw new Error(`${name}_down`);
        const row = stores[name].find((r) => String(r.id) === String(id));
        return row ? { ...row } : null;
      },
      async create(value) { const row = { id: `${name}-${stores[name].length + 1}`, ...value }; stores[name].push(row); return { ...row }; },
      async updateMany(query, patch) {
        const matched = stores[name].filter((row) =>
          Object.entries(query).every(([k, v]) => String(row[k]) === String(v)));
        for (const row of matched) Object.assign(row, patch);
        return { matched_count: matched.length, modified_count: matched.length };
      },
    };
    return built[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const LEADS = [
  { id: "l1", company_name: "Acme", country: "ES", stage: "contacted", revenue_stage: "contacted",
    sales_owner: "founder@cambra.global", next_action: "follow up", expected_revenue_value_minor: 500000, updated_date: NOW },
  { id: "l2", company_name: "Globex", country: "ES", stage: "contacted", reservoir_state: "converted", updated_date: NOW },
  { id: "l3", company_name: "Initech", country: "FR", stage: "lead", updated_date: NOW },
  { id: "l4", company_name: "Umbrella", country: "ES", stage: "brand_new_value", updated_date: NOW },
];

const args = (over = {}) => ({ now: NOW, contextId: "ctx-1", ...over });

describe("C3 — the portfolio projects four authorities without becoming one", () => {
  it("returns rows with a canonical stage resolved per lane", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const out = await buildPipelinePortfolio({ svc, lanes: ["MERCHANT_ACQUISITION"], ...args() });
    expect(out.ok).toBe(true);
    const byId = new Map(out.items.rows.map((row) => [row.canonical_id, row]));
    expect(byId.get("l1").stage).toBe("CONTACTED");
    expect(byId.get("l1").entity_type).toBe("OutboundLead");
    // Nothing was written.
    expect(svc.stores.PipelineStageEvent).toBeUndefined();
  });

  it("applies the conflict rule inside the projection", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const out = await buildPipelinePortfolio({ svc, lanes: ["MERCHANT_ACQUISITION"], ...args() });
    const globex = out.items.rows.find((row) => row.canonical_id === "l2");
    // stage says contacted, reservoir says converted -> least advanced wins.
    expect(globex.stage).toBe("CONTACTED");
    expect(globex.stage_conflicted).toBe(true);
    expect(globex.attention_reasons).toContain("stage_sources_disagree");
  });

  it("flags an unmapped value instead of dropping the row", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const out = await buildPipelinePortfolio({ svc, lanes: ["MERCHANT_ACQUISITION"], ...args() });
    const umbrella = out.items.rows.find((row) => row.canonical_id === "l4");
    expect(umbrella).toBeTruthy();
    expect(umbrella.stage).toBeNull();
    expect(umbrella.attention_reasons).toContain("unmapped_stage_value");
  });

  it("derives attention reasons rather than asserting them", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const out = await buildPipelinePortfolio({ svc, lanes: ["MERCHANT_ACQUISITION"], ...args() });
    const initech = out.items.rows.find((row) => row.canonical_id === "l3");
    expect(initech.attention_reasons).toContain("no_owner");
    expect(initech.attention_reasons).toContain("no_next_action");
    // l1 has both, so neither reason applies.
    const acme = out.items.rows.find((row) => row.canonical_id === "l1");
    expect(acme.attention_reasons).not.toContain("no_owner");
  });

  it("carries the truth boundary and declares nothing was sent", async () => {
    const out = await buildPipelinePortfolio({ svc: makeSvc({ OutboundLead: LEADS }), lanes: ["MERCHANT_ACQUISITION"], ...args() });
    expect(out.context.truth_boundary).toContain("Missing evidence remains unknown");
    expect(out.external_send_performed).toBe(false);
  });
});

describe("C3 — a lane that could not be read contributes nothing, not zero", () => {
  it("omits the lane, names it in source health, and refuses a total", async () => {
    const svc = makeSvc({ OutboundLead: LEADS, PartnerProspect: [{ id: "p1", stage: "replied" }] }, ["PartnerProspect"]);
    const out = await buildPipelinePortfolio({
      svc, lanes: ["MERCHANT_ACQUISITION", "PARTNER_ACQUISITION"], ...args(),
    });
    expect(out.items.rows.some((row) => row.lane === "PARTNER_ACQUISITION")).toBe(false);
    expect(out.context.data_complete).toBe(false);
    expect(out.context.degraded_sources).toContain("PartnerProspect");
    // A total over a degraded read would be a lower bound presented as a total.
    expect(out.items.total).toBeNull();
    const partner = out.source_health.find((row) => row.source === "PartnerProspect");
    expect(partner.state).toBe("UNAVAILABLE");
    expect(partner.records_read).toBeNull();
  });

  it("reports a total when every lane loaded", async () => {
    const out = await buildPipelinePortfolio({
      svc: makeSvc({ OutboundLead: LEADS }), lanes: ["MERCHANT_ACQUISITION"], ...args(),
    });
    expect(out.context.data_complete).toBe(true);
    expect(out.items.total).toBe(4);
  });
});

describe("C3 — KPIs never turn a failed read into a number", () => {
  it("reports null and UNKNOWN for a KPI whose source failed", () => {
    const health = buildSourceHealth({
      OutboundLead: { status: "UNAVAILABLE", records_read: null, truncated: false, blockers: [] },
      PartnerProspect: { status: "COMPLETE", records_read: 1, truncated: false, blockers: [] },
      Provider: { status: "COMPLETE", records_read: 1, truncated: false, blockers: [] },
      DealActivation: { status: "COMPLETE", records_read: 1, truncated: false, blockers: [] },
    });
    const kpis = buildPipelineKpis([], health);
    const active = kpis.find((row) => row.metric_key === "active_relationships");
    expect(active.value).toBeNull();
    expect(active.truth_class).toBe("UNKNOWN");
    expect(active.unavailable_sources).toContain("OutboundLead");
  });

  it("labels expected value a lower bound when rows carry no value", async () => {
    const health = buildSourceHealth({
      OutboundLead: { status: "COMPLETE", records_read: 4, truncated: false, blockers: [] },
      PartnerProspect: { status: "COMPLETE", records_read: 0, truncated: false, blockers: [] },
      Provider: { status: "COMPLETE", records_read: 0, truncated: false, blockers: [] },
      DealActivation: { status: "COMPLETE", records_read: 0, truncated: false, blockers: [] },
    });
    const out = await buildPipelinePortfolio({ svc: makeSvc({ OutboundLead: LEADS }), lanes: ["MERCHANT_ACQUISITION"], ...args() });
    const value = buildPipelineKpis(out.items.rows, health).find((row) => row.metric_key === "weighted_pipeline");
    // Three of four rows have no expected value.
    expect(value.truth_class).toBe("MODELED");
    expect(value.claim_boundary).toContain("lower bound, not a forecast");
    expect(value.numerator).toBe(1);
    expect(value.denominator).toBe(4);
  });
});

describe("C3 — filters are deterministic and never drop unknown", () => {
  const rows = [
    { canonical_id: "a", lane: "MERCHANT_ACQUISITION", display_name: "Acme", canonical_company_key: "acme", country: "ES", stage: "CONTACTED", stage_order: 40, stage_confidence: "OBSERVED", stage_conflicted: false, terminal: false, semantics: "open", owner: "x", next_action: "y", next_action_at: null, expected_value_minor: 100, last_activity_at: null, attention_reasons: [], readings: [] },
    { canonical_id: "b", lane: "MERCHANT_ACQUISITION", display_name: "Globex", canonical_company_key: "globex", country: "FR", stage: null, stage_order: null, stage_confidence: "UNKNOWN", stage_conflicted: false, terminal: false, semantics: null, owner: null, next_action: null, next_action_at: null, expected_value_minor: null, last_activity_at: null, attention_reasons: ["no_owner"], readings: [] },
  ];

  it("a minimum value keeps rows whose value is unknown", () => {
    // Unknown is not "less than". Excluding it would hide the row entirely.
    const out = applyFilters(rows, { min_expected_value_minor: 1000 });
    expect(out.map((r) => r.canonical_id)).toEqual(["b"]);
  });

  it("a stage filter excludes rows with no readable stage", () => {
    expect(applyFilters(rows, { stage: "CONTACTED" }).map((r) => r.canonical_id)).toEqual(["a"]);
  });

  it("filters by attention, ownership and text", () => {
    expect(applyFilters(rows, { needs_attention: true }).map((r) => r.canonical_id)).toEqual(["b"]);
    expect(applyFilters(rows, { unassigned: true }).map((r) => r.canonical_id)).toEqual(["b"]);
    expect(applyFilters(rows, { q: "acme" }).map((r) => r.canonical_id)).toEqual(["a"]);
  });

  it("returns everything when no filter is set", () => {
    expect(applyFilters(rows, {})).toHaveLength(2);
  });
});

describe("C3 — a transition preview changes nothing and binds what it showed", () => {
  it("previews and produces a hash", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const out = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "MEETING_BOOKED", now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.preview.from_stage).toBe("CONTACTED");
    expect(out.preview.direction).toBe("FORWARD");
    expect(out.preview_hash).toMatch(/^[a-f0-9]{64}$/);
    // Nothing moved.
    expect(svc.stores.OutboundLead.find((r) => r.id === "l1").stage).toBe("contacted");
  });

  it("names which column moves and which are left alone", async () => {
    const out = await previewStageChange({
      svc: makeSvc({ OutboundLead: LEADS }), lane: "MERCHANT_ACQUISITION",
      subject_id: "l1", to_stage: "MEETING_BOOKED", now: NOW, sha256,
    });
    expect(out.preview.writes_column).toBe("stage");
    expect(out.preview.other_columns_untouched).toEqual(["revenue_stage", "reservoir_state"]);
    expect(primaryColumn("MERCHANT_ACQUISITION")).toBe("stage");
  });

  it("reports an unreadable subject rather than assuming it is absent", async () => {
    const out = await previewStageChange({
      svc: makeSvc({ OutboundLead: LEADS }, ["OutboundLead"]), lane: "MERCHANT_ACQUISITION",
      subject_id: "l1", to_stage: "LOST", now: NOW, sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("subject_unreadable");
  });

  it("carries the blockers rather than hiding them", async () => {
    const out = await previewStageChange({
      svc: makeSvc({ OutboundLead: LEADS }), lane: "MERCHANT_ACQUISITION",
      subject_id: "l1", to_stage: "LOST", now: NOW, sha256,
    });
    expect(out.preview.allowed).toBe(false);
    expect(out.preview.blockers).toContain("reason_code_required");
  });
});

describe("C3 — applying a transition writes the authority and the history", () => {
  const apply = (svc, over = {}) => applyStageChange({
    svc, actor: "founder@cambra.global", actor_kind: "FOUNDER",
    lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "MEETING_BOOKED",
    now: NOW, sha256, ...over,
  });

  it("moves the primary column and appends an event", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const previewed = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "MEETING_BOOKED", now: NOW, sha256,
    });
    const out = await apply(svc, { expected_preview_hash: previewed.preview_hash });
    expect(out.ok).toBe(true);
    // The LEGACY value was written, not the canonical key.
    expect(svc.stores.OutboundLead.find((r) => r.id === "l1").stage).toBe("meeting");
    expect(out.history_recorded).toBe(true);
    const event = svc.stores.PipelineStageEvent[0];
    expect(event.from_stage).toBe("CONTACTED");
    expect(event.to_stage).toBe("MEETING_BOOKED");
    expect(event.actor).toBe("founder@cambra.global");
    expect(event.direction).toBe("FORWARD");
    expect(event.stage_registry_version).toBeTruthy();
  });

  it("leaves the other two progression columns untouched", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const previewed = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "MEETING_BOOKED", now: NOW, sha256,
    });
    await apply(svc, { expected_preview_hash: previewed.preview_hash });
    const row = svc.stores.OutboundLead.find((r) => r.id === "l1");
    // Writing all three would assert values the caller never supplied.
    expect(row.revenue_stage).toBe("contacted");
  });

  it("refuses when the preview hash does not match", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const out = await apply(svc, { expected_preview_hash: "not-the-hash" });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("preview_hash_mismatch");
    expect(svc.stores.OutboundLead.find((r) => r.id === "l1").stage).toBe("contacted");
  });

  it("refuses a loss with no reason code", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const previewed = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "LOST", now: NOW, sha256,
    });
    const out = await apply(svc, { to_stage: "LOST", expected_preview_hash: previewed.preview_hash });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("transition_not_allowed");
    expect(out.blockers).toContain("reason_code_required");
  });

  it("refuses every write to the projection-only lifecycle lane", async () => {
    const svc = makeSvc({ DealActivation: [{ id: "d1", status: "live" }] });
    const previewed = await previewStageChange({
      svc, lane: "MERCHANT_LIFECYCLE", subject_id: "d1", to_stage: "COMPLETED", now: NOW, sha256,
    });
    expect(previewed.preview.blockers).toContain("lane_is_projection_only");
    const out = await applyStageChange({
      svc, actor: "f", actor_kind: "FOUNDER", lane: "MERCHANT_LIFECYCLE", subject_id: "d1",
      to_stage: "COMPLETED", now: NOW, sha256, expected_preview_hash: previewed.preview_hash,
    });
    expect(out.ok).toBe(false);
    expect(svc.stores.DealActivation[0].status).toBe("live");
  });

  it("reports a real move whose history could not be written, rather than claiming failure", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const previewed = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "MEETING_BOOKED", now: NOW, sha256,
    });
    svc.entities.PipelineStageEvent.create = async () => { throw new Error("ledger down"); };
    const out = await apply(svc, { expected_preview_hash: previewed.preview_hash });
    // The move happened. Saying otherwise would be worse than an incomplete history.
    expect(out.ok).toBe(true);
    expect(out.history_recorded).toBe(false);
    expect(svc.stores.OutboundLead.find((r) => r.id === "l1").stage).toBe("meeting");
  });
});

describe("C3 — the reverse mapping refuses to corrupt the authority enum", () => {
  it("maps a canonical stage back to a real legacy value", () => {
    expect(canonicalToLegacy("MERCHANT_ACQUISITION", "stage", "MEETING_BOOKED")).toBe("meeting");
    expect(canonicalToLegacy("MERCHANT_ACQUISITION", "stage", "CONTACTED")).toBe("contacted");
  });

  it("returns null for a canonical stage no legacy value expresses", () => {
    // ENGAGED exists in revenue_stage but not in stage. Writing "ENGAGED" into
    // the stage column would violate the entity enum.
    expect(canonicalToLegacy("MERCHANT_ACQUISITION", "stage", "ENGAGED")).toBeNull();
  });

  it("refuses the transition rather than writing an invalid value", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const previewed = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "ENGAGED", now: NOW, sha256,
    });
    const out = await applyStageChange({
      svc, actor: "f", actor_kind: "FOUNDER", lane: "MERCHANT_ACQUISITION", subject_id: "l1",
      to_stage: "ENGAGED", now: NOW, sha256, expected_preview_hash: previewed.preview_hash,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("canonical_stage_not_expressible_in_authority_column");
    // The enum was not corrupted.
    expect(svc.stores.OutboundLead.find((r) => r.id === "l1").stage).toBe("contacted");
  });
});
