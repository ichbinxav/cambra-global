// DSCV2-H (2026-08-16) — REAL behavior tests for the Discovery V2 stage
// functions. Until this round, stageDiscovery/stagePrefit/stageEnrich/
// stageScore/resultAction/advanceRun appeared in tests only as toContain
// greps over source text — which is exactly why the COMPANY_ENRICHMENT no-op
// shipped unnoticed. Every test here INVOKES the exported stage functions (or
// the shared company-enrichment operation) against an in-memory entity store
// and asserts what actually got written.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  resolveDiscoveryLeadProvider,
  resultAction,
  stageDiscovery,
  stageEnrich,
} from "../../base44/shared/discoveryV2Admin.ts";
import {
  APOLLO_CONTRACT_EXPIRES_AT,
  APOLLO_PROVIDER_KEY,
  INSTANTLY_SUPERSEARCH_PROVIDER_KEY,
  InstantlySuperSearchLeadProvider,
  selectLeadIntelligenceProvider,
} from "../../base44/shared/leadIntelligenceProvider.ts";
import {
  mapApolloOrganizationToFirmography,
  runCompanyEnrichmentOperation,
} from "../../base44/shared/companyEnrichment.ts";

const BEFORE_CUTOVER = new Date("2026-09-01T00:00:00.000Z");
const AFTER_CUTOVER = new Date("2026-09-08T00:00:00.000Z");

let envMap = {};
const realDeno = globalThis.Deno;
beforeEach(() => {
  envMap = {};
  globalThis.Deno = { env: { get: (key) => envMap[key] || "" } };
});
afterEach(() => {
  globalThis.Deno = realDeno;
});

function matches(row, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (expected && typeof expected === "object" && Array.isArray(expected.$in)) {
      return expected.$in.includes(row[key]);
    }
    return String(row[key]) === String(expected);
  });
}

function makeEntity(rows = []) {
  const store = rows.map((row) => ({ ...row }));
  const calls = [];
  return {
    store,
    calls,
    async filter(query, _sort, limit) {
      calls.push({ op: "filter", query });
      const found = store.filter((row) => matches(row, query));
      return (typeof limit === "number" ? found.slice(0, limit) : found).map((row) => ({ ...row }));
    },
    async list(_sort, limit) {
      calls.push({ op: "list" });
      return store.slice(0, typeof limit === "number" ? limit : store.length).map((row) => ({ ...row }));
    },
    async get(id) {
      calls.push({ op: "get", id });
      const row = store.find((candidate) => String(candidate.id) === String(id));
      return row ? { ...row } : null;
    },
    async create(value) {
      calls.push({ op: "create", value });
      const row = { id: `${calls.length}-${store.length + 1}`, ...value };
      store.push(row);
      return row;
    },
    async update(id, patch) {
      calls.push({ op: "update", id, patch });
      const row = store.find((candidate) => String(candidate.id) === String(id));
      if (!row) throw new Error("row_not_found");
      Object.assign(row, patch);
      return { ...row };
    },
    async updateMany(query, update) {
      calls.push({ op: "updateMany", query, update });
      const matched = store.filter((row) => matches(row, query));
      for (const row of matched) Object.assign(row, update.$set || {});
      return { updated: matched.length };
    },
  };
}

function makeSvc(entityRows = {}, invokeHandler = null) {
  const entities = {};
  const entityProxy = new Proxy(entities, {
    get(target, name) {
      const key = String(name);
      if (!target[key]) target[key] = makeEntity(entityRows[key] || []);
      return target[key];
    },
  });
  for (const key of Object.keys(entityRows)) void entityProxy[key];
  const invocations = [];
  return {
    entities: entityProxy,
    invocations,
    functions: {
      async invoke(name, body) {
        invocations.push({ name, body });
        if (invokeHandler) return invokeHandler(name, body, entityProxy);
        return { ok: true };
      },
    },
  };
}

const CLAIM_STAGE = "NATIVE_DISCOVERY";
function runRow(overrides = {}) {
  const leaseExpiry = new Date(Date.now() + 60_000).toISOString();
  return {
    id: "run-1",
    discovery_type: "MERCHANT",
    status: "RUNNING",
    current_stage: CLAIM_STAGE,
    run_revision: 3,
    lease_owner: "test-owner",
    lease_expires_at: leaseExpiry,
    stage_attempt_token: "tok-1",
    stop_requested: false,
    selected_sources: ["APOLLO"],
    target_count: 10,
    hard_cap_minor: 500,
    configuration_json: { high_fit_threshold: 70, enrichment_policy: "SELECTIVE" },
    execution_plan_json: { source_partitions: [{ key: "p1", filters: { country: "ES" } }] },
    checkpoint_json: {},
    funnel_json: {},
    actual_stages_json: [],
    errors_json: [],
    result_ids: [],
    ...overrides,
  };
}

function claimFor(run) {
  return {
    run: { id: run.id },
    revision: run.run_revision,
    owner: run.lease_owner,
    token: run.stage_attempt_token,
    stage: run.current_stage,
  };
}

const VERIFIED_INSTANTLY_STATE = {
  id: "cps-1",
  provider_key: "instantly_supersearch",
  role: "lead_intelligence",
  metrics_json: { supersearch_permission_verified: true },
};

describe("Fase B.1 — Apollo → Instantly contract cutover (no deploy on the cutover date)", () => {
  it("selects Apollo before 7 September 2026 while its contract is alive", () => {
    const selection = selectLeadIntelligenceProvider({
      apolloConfigured: true,
      instantlyConfigured: true,
      instantlySuperSearchPermission: true,
      now: BEFORE_CUTOVER,
    });
    expect(selection.selected).toBe(APOLLO_PROVIDER_KEY);
    expect(selection.reason).toBe("apollo_active_until_contract_expiry");
  });

  it("switches to Instantly automatically from 7 September 2026 when configured and founder-verified", () => {
    const selection = selectLeadIntelligenceProvider({
      apolloConfigured: true,
      instantlyConfigured: true,
      instantlySuperSearchPermission: true,
      now: AFTER_CUTOVER,
    });
    expect(selection.selected).toBe(INSTANTLY_SUPERSEARCH_PROVIDER_KEY);
    expect(selection.apollo.status).toBe("EXPIRED");
  });

  it("fails visibly (no silent Apollo) when Apollo expired and Instantly is not verified", () => {
    const selection = selectLeadIntelligenceProvider({
      apolloConfigured: true,
      instantlyConfigured: true,
      instantlySuperSearchPermission: false,
      now: AFTER_CUTOVER,
    });
    expect(selection.selected).toBeNull();
    expect(selection.reason).toBe("apollo_expired_and_instantly_unavailable");
  });

  it("keeps the manual SuperSearch permission lock: configured but unverified Instantly is never available", () => {
    const status = new InstantlySuperSearchLeadProvider(async () => ({}), true, false).status();
    expect(status.available).toBe(false);
    expect(status.reason).toBe("supersearch_permission_not_verified");
  });

  it("reports Instantly available when configured AND permission-verified (was hardcoded BLOCKED)", () => {
    const status = new InstantlySuperSearchLeadProvider(async () => ({}), true, true).status();
    expect(status.available).toBe(true);
    expect(status.status).toBe("ACTIVE");
  });

  it("searchCompanies calls the real SuperSearch preview endpoint instead of throwing", async () => {
    const requests = [];
    const provider = new InstantlySuperSearchLeadProvider(async (path, options) => {
      requests.push({ path, options });
      return { leads: [] };
    }, true, true);
    await provider.searchCompanies({ countries: ["FR"], limit: 10 });
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/supersearch-enrichment/preview-leads-from-supersearch");
    expect(requests[0].options.body.search_filters).toBeTruthy();
  });

  it("pins the real contract expiry date", () => {
    expect(APOLLO_CONTRACT_EXPIRES_AT).toBe("2026-09-07T23:59:59.999Z");
  });
});

describe("stageDiscovery — provider selection is consulted, not assumed", () => {
  it("resolveDiscoveryLeadProvider reads the same CommercialProviderState lock the runtime enforces", async () => {
    envMap = { INSTANTLY_API_KEY: "key" };
    const svc = makeSvc({ CommercialProviderState: [VERIFIED_INSTANTLY_STATE] });
    const selection = await resolveDiscoveryLeadProvider(svc, "APOLLO");
    // No Apollo key: AUTO falls through to verified Instantly.
    expect(selection.selected).toBe(INSTANTLY_SUPERSEARCH_PROVIDER_KEY);
  });

  it("dispatches to Instantly when Apollo is unconfigured and Instantly is verified", async () => {
    envMap = { INSTANTLY_API_KEY: "key", INTERNAL_CALL_SECRET: "s" };
    const run = runRow();
    const svc = makeSvc(
      { DiscoveryExecutionRun: [run], CommercialProviderState: [VERIFIED_INSTANTLY_STATE] },
      (name) => {
        expect(name).toBe("leadDiscoveryAgent");
        return { ok: true, created_ids: ["lead-1"], scanned: 1 };
      },
    );
    const updated = await stageDiscovery(svc, run, claimFor(run));
    expect(svc.invocations).toHaveLength(1);
    expect(svc.invocations[0].body.provider).toBe("instantly_supersearch");
    expect(updated.current_stage).toBe("LOCAL_PREFIT");
    expect(updated.result_ids).toEqual(["lead-1"]);
    const stageEntry = updated.actual_stages_json.at(-1);
    expect(stageEntry.provider_selection.selected).toBe(INSTANTLY_SUPERSEARCH_PROVIDER_KEY);
  });

  it("fails over Apollo → Instantly on a pre-expiry auth failure and logs it for the founder", async () => {
    envMap = { APOLLO_API_KEY: "ak", INSTANTLY_API_KEY: "ik", INTERNAL_CALL_SECRET: "s" };
    const run = runRow();
    let call = 0;
    const svc = makeSvc(
      { DiscoveryExecutionRun: [run], CommercialProviderState: [VERIFIED_INSTANTLY_STATE] },
      (_name, body) => {
        call += 1;
        if (call === 1) {
          expect(body.provider).toBe("apollo");
          return { ok: false, error: "Apollo HTTP 401 unauthorized" };
        }
        expect(body.provider).toBe("instantly_supersearch");
        return { ok: true, created_ids: ["lead-2"], scanned: 1 };
      },
    );
    const updated = await stageDiscovery(svc, run, claimFor(run));
    expect(call).toBe(2);
    expect(updated.result_ids).toEqual(["lead-2"]);
    const log = svc.entities.OperationalLog.store;
    expect(log).toHaveLength(1);
    expect(log[0].event_type).toBe("lead_provider_failover");
    expect(log[0].data_json.apollo_error).toContain("401");
    const stageEntry = updated.actual_stages_json.at(-1);
    expect(stageEntry.provider_selection.failover_occurred).toBe(true);
  });

  it("fails loudly with no available provider instead of silently calling Apollo", async () => {
    envMap = {};
    const run = runRow();
    const svc = makeSvc({ DiscoveryExecutionRun: [run], CommercialProviderState: [] });
    await expect(stageDiscovery(svc, run, claimFor(run))).rejects.toMatchObject({
      code: "NO_AVAILABLE_LEAD_PROVIDER",
    });
    expect(svc.invocations).toHaveLength(0);
  });
});

describe("Fase C — selective company enrichment is real", () => {
  const APOLLO_ORG = {
    id: "org-1",
    estimated_num_employees: 120,
    annual_revenue_printed: "$10M-$50M",
    current_technologies: [
      { name: "Shopify" },
      { name: "Stripe" },
      { name: "Klaviyo" },
    ],
  };

  it("maps only what Apollo returned and never invents TPV", () => {
    const mapped = mapApolloOrganizationToFirmography(APOLLO_ORG);
    expect(mapped.fields.employee_range).toBe("51-200");
    expect(mapped.fields.revenue_range).toBe("$10M-$50M");
    expect(mapped.fields.detected_technologies).toContain("Shopify");
    expect(mapped.fields.ecommerce_platform).toBe("shopify");
    expect(mapped.fields.probable_payment_stack).toEqual(["stripe"]);
    expect(mapped.fields.estimated_tpv_min_eur).toBeUndefined();
    expect(mapped.fields.estimated_tpv_max_eur).toBeUndefined();
    expect(mapped.snapshot.tpv_not_provided_by_provider).toBe(true);
    // Sparse payload → sparse fields, no filler:
    const sparse = mapApolloOrganizationToFirmography({ id: "org-2" });
    expect(Object.keys(sparse.fields)).toHaveLength(0);
  });

  it("would have caught this round's bug: an enrichment_worthy lead ends with firmography actually written", async () => {
    const svc = makeSvc({
      OutboundLead: [{
        id: "lead-1",
        stage: "lead",
        company_domain: "shop.example",
        enrichment_worthy: true,
        pre_score: 80,
      }],
    });
    const result = await runCompanyEnrichmentOperation(svc, {
      leads: svc.entities.OutboundLead.store.map((row) => ({ ...row })),
      discovery_run_id: "run-1",
      max_related_spend_minor: 500,
      request: async () => ({ organization: APOLLO_ORG }),
      reserve: async () => ({ duplicate: false, event: { event_key: "e1" } }),
      settle: async () => ({ ok: true }),
    });
    expect(result.enriched).toBe(1);
    const lead = svc.entities.OutboundLead.store[0];
    expect(lead.employee_range).toBe("51-200");
    expect(lead.stage).toBe("enriched");
    expect(lead.enrichment_json.company_enrichment.provider).toBe("apollo");
    expect(lead.enrichment_json.company_enrichment.enriched_at).toBeTruthy();
    expect(lead.external_refs_json.apollo_organization_id).toBe("org-1");
  });

  it("a lead without a company domain never spends provider budget", async () => {
    let providerCalls = 0;
    let reservations = 0;
    const svc = makeSvc({ OutboundLead: [{ id: "lead-1", stage: "lead" }] });
    const result = await runCompanyEnrichmentOperation(svc, {
      leads: [{ id: "lead-1", stage: "lead" }],
      request: async () => {
        providerCalls += 1;
        return {};
      },
      reserve: async () => {
        reservations += 1;
        return { duplicate: false };
      },
      settle: async () => ({ ok: true }),
    });
    expect(result.skipped).toBe(1);
    expect(providerCalls).toBe(0);
    expect(reservations).toBe(0);
  });

  it("stageEnrich only sends enrichment_worthy / above-threshold leads to the agent", async () => {
    const run = runRow({
      current_stage: "SELECTIVE_COMPANY_ENRICHMENT",
      result_ids: ["lead-worthy", "lead-unworthy"],
    });
    const svc = makeSvc(
      {
        DiscoveryExecutionRun: [run],
        OutboundLead: [
          { id: "lead-worthy", stage: "lead", pre_score: 85, enrichment_worthy: true, company_domain: "a.example" },
          { id: "lead-unworthy", stage: "lead", pre_score: 10, enrichment_worthy: false, company_domain: "b.example" },
        ],
      },
      (name, body) => {
        expect(name).toBe("leadEnrichmentAgent");
        expect(body.operation).toBe("COMPANY_ENRICHMENT");
        expect(body.lead_ids).toEqual(["lead-worthy"]);
        return { ok: true, enriched: 1, skipped: 0, failed: 0, provider_calls: 1 };
      },
    );
    const updated = await stageEnrich(svc, run, claimFor(run));
    expect(svc.invocations).toHaveLength(1);
    expect(updated.current_stage).toBe("SCORING");
    const stageEntry = updated.actual_stages_json.at(-1);
    expect(stageEntry.stage).toBe("SELECTIVE_COMPANY_ENRICHMENT");
    expect(stageEntry.requested).toBe(1);
  });

  it("stageEnrich with zero eligible candidates skips without any paid call (protects selectivity)", async () => {
    const run = runRow({
      current_stage: "SELECTIVE_COMPANY_ENRICHMENT",
      result_ids: ["lead-unworthy"],
    });
    const svc = makeSvc({
      DiscoveryExecutionRun: [run],
      OutboundLead: [{ id: "lead-unworthy", stage: "lead", pre_score: 10, enrichment_worthy: false }],
    });
    const updated = await stageEnrich(svc, run, claimFor(run));
    expect(svc.invocations).toHaveLength(0);
    expect(updated.current_stage).toBe("SCORING");
    expect(updated.actual_stages_json.at(-1).status).toBe("SKIPPED_NO_ELIGIBLE_CANDIDATES");
  });

  it("the agent entry actually wires the real operation (no unconditional adapter-missing stub)", () => {
    const source = fs.readFileSync("base44/functions/leadEnrichmentAgent/entry.ts", "utf8");
    expect(source).toContain("runCompanyEnrichmentOperation");
    expect(source).not.toContain('status: "NO_COMPANY_ENRICHMENT_ADAPTER_CONFIGURED",\n      });');
  });
});

describe("Fase E — resultAction moves the real pipeline stage with durable evidence", () => {
  function terminalRun(overrides = {}) {
    return runRow({
      status: "COMPLETED",
      current_stage: "COMPLETE",
      result_ids: ["lead-1"],
      ...overrides,
    });
  }

  async function jsonOf(response) {
    return { status: response.status, body: await response.json() };
  }

  it("ADD_TO_GROWTH transitions OutboundLead.stage to outreach_ready and records the transition on the run", async () => {
    const run = terminalRun();
    const svc = makeSvc({
      DiscoveryExecutionRun: [run],
      OutboundLead: [{ id: "lead-1", stage: "scored" }],
    });
    const { status, body } = await jsonOf(
      await resultAction(svc, { discovery_type: "MERCHANT", id: "lead-1", run_id: "run-1", result_action: "ADD_TO_GROWTH" }),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage_transition).toEqual({ from: "scored", to: "outreach_ready" });
    const lead = svc.entities.OutboundLead.store[0];
    expect(lead.stage).toBe("outreach_ready");
    expect(lead.revenue_stage).toBe("qualified");
    const storedRun = svc.entities.DiscoveryExecutionRun.store[0];
    expect(storedRun.pipeline_transition_json.transitions).toHaveLength(1);
    expect(storedRun.pipeline_transition_json.transitions[0]).toMatchObject({
      action: "ADD_TO_GROWTH",
      subject_id: "lead-1",
      from_stage: "scored",
      to_stage: "outreach_ready",
    });
  });

  it("REJECT transitions to disqualified and appends to the same evidence ledger", async () => {
    const run = terminalRun({
      pipeline_transition_json: {
        transitions: [{ at: "2026-08-15T00:00:00.000Z", action: "ADD_TO_GROWTH", subject_id: "x" }],
      },
    });
    const svc = makeSvc({
      DiscoveryExecutionRun: [run],
      OutboundLead: [{ id: "lead-1", stage: "scored" }],
    });
    const { body } = await jsonOf(
      await resultAction(svc, { discovery_type: "MERCHANT", id: "lead-1", run_id: "run-1", result_action: "REJECT" }),
    );
    expect(body.ok).toBe(true);
    expect(svc.entities.OutboundLead.store[0].stage).toBe("disqualified");
    const transitions = svc.entities.DiscoveryExecutionRun.store[0].pipeline_transition_json.transitions;
    expect(transitions).toHaveLength(2);
    expect(transitions[1].to_stage).toBe("disqualified");
  });

  it("refuses to act on a non-terminal run or an unattributed result", async () => {
    const svc = makeSvc({
      DiscoveryExecutionRun: [terminalRun({ status: "RUNNING" })],
      OutboundLead: [{ id: "lead-1", stage: "scored" }],
    });
    const { status } = await jsonOf(
      await resultAction(svc, { discovery_type: "MERCHANT", id: "lead-1", run_id: "run-1", result_action: "ADD_TO_GROWTH" }),
    );
    expect(status).toBe(409);
    const svc2 = makeSvc({
      DiscoveryExecutionRun: [terminalRun({ result_ids: ["someone-else"] })],
      OutboundLead: [{ id: "lead-1", stage: "scored" }],
    });
    const denied = await jsonOf(
      await resultAction(svc2, { discovery_type: "MERCHANT", id: "lead-1", run_id: "run-1", result_action: "ADD_TO_GROWTH" }),
    );
    expect(denied.status).toBe(409);
    expect(denied.body.error).toBe("result_not_attributed_to_discovery_run");
  });

  it("the legacy outreach worker still picks up founder-accepted leads (frontier reconciliation)", () => {
    const source = fs.readFileSync("base44/functions/autonomousCommercialWorker/entry.ts", "utf8");
    expect(source).toContain("{stage:{$in:['scored','outreach_ready']}}");
  });
});
