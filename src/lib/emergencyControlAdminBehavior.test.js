// FCTRL-J (2026-08-16) — behavior tests for the emergencyControlAdmin handler.
//
// Unlike founderControlV2.test.js (mostly toContain checks over source text),
// every test here INVOKES handleEmergencyControlAction with an in-memory svc
// and asserts observable behavior: what the response says and what got written
// to the entities. The handler is the exact code Deno serves — entry.ts is a
// thin wrapper around base44/shared/emergencyControlAdminCore.ts.
//
// Injected deps replace only the three provider-facing effects
// (containCommunicationTransport, pauseAllInstantlyCampaigns,
// persistEmergencyTransportContainment) and the two preview evaluators.
// Everything the handler itself owns — token check, preview freshness, CAS,
// idempotent replay, containment aggregation, selective resume patch — runs
// for real against the mock store.
import { describe, expect, it } from "vitest";
import { handleEmergencyControlAction } from "../../base44/shared/emergencyControlAdminCore.ts";
import { RESUMABLE_CAPABILITIES } from "../../base44/shared/founderControlV2.ts";

const FOUNDER = { id: "founder-1", email: "founder@cambra.global", role: "admin" };
const FRESH_EXPIRY = () => new Date(Date.now() + 4 * 60 * 1000).toISOString();
const STALE_EXPIRY = () => new Date(Date.now() - 60 * 1000).toISOString();

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
    // filter/get return snapshots, like a real database read — the handler
    // must not observe later store mutations through previously read rows.
    async filter(query, _sort, limit) {
      calls.push({ op: "filter", query });
      const found = store.filter((row) => matches(row, query));
      return (typeof limit === "number" ? found.slice(0, limit) : found).map((row) => ({ ...row }));
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

function makeSvc(overrides = {}) {
  const entities = {
    EmergencyControl: makeEntity([
      {
        id: "ec-1",
        control_key: "global",
        safe_mode: false,
        communications_paused: false,
        negotiations_paused: false,
        migrations_paused: false,
        billing_issuance_paused: false,
        paid_discovery_paused: false,
        resume_check_required: false,
        control_revision: 3,
        reason: "steady state",
      },
    ]),
    OutboundControl: makeEntity([
      {
        id: "oc-1",
        control_key: "global",
        acquisition_enabled: true,
        premium_outlook_enabled: false,
        volume_resend_enabled: false,
        instantly_enabled: true,
        control_revision: 7,
      },
    ]),
    CommercialPolicy: makeEntity([{ id: "policy-1", status: "active" }]),
    DiscoveryExecutionRun: makeEntity([{ id: "run-1", status: "RUNNING" }]),
    FounderCommandAudit: makeEntity([]),
    OperationalLog: makeEntity([]),
    AutonomyIncident: makeEntity([]),
    ...overrides,
  };
  return { entities };
}

// Fake evidence persistence that mirrors the real contract's shape: it turns
// "a configured remote-pausable transport was not verified paused" plus any
// local blockers into CONTAINMENT_INCOMPLETE, and only a fully verified set
// into CONTAINED. The aggregation logic UNDER TEST is the handler's, which
// must honor whatever this authority reports.
function fakePersistTransportContainment() {
  return async (_svc, input) => {
    const blockers = [...(input.additional_blockers || [])];
    for (const observation of input.observations || []) {
      if (observation.configured && observation.remote_pause_supported && !observation.remote_verified_paused) {
        blockers.push(`${observation.transport}_remote_pause_unverified`);
      }
    }
    const contained = blockers.length === 0;
    return {
      ok: true,
      persisted: true,
      containment_status: contained ? "CONTAINED" : "CONTAINMENT_INCOMPLETE",
      blockers,
      transports: input.observations || [],
      control: null,
    };
  };
}

function happyDeps(extra = {}) {
  return {
    buildEmergencyStopPreview: async () => ({
      ok: true,
      preview: { state_fingerprint: "fp-live", expires_at: FRESH_EXPIRY() },
    }),
    evaluateSafeResume: async (_svc, selected) => ({
      allowed: true,
      preflight_hash: "resume-hash-live",
      expires_at: FRESH_EXPIRY(),
      selected_capabilities: Array.isArray(selected) ? selected : [],
    }),
    containCommunicationTransport: async (_svc, transport) => ({ ok: true, transport, profile_results: [] }),
    pauseAllInstantlyCampaigns: async () => ({ ok: true, campaigns: [{ id: "camp-1", paused: true }] }),
    persistEmergencyTransportContainment: fakePersistTransportContainment(),
    ...extra,
  };
}

function storedStopPreview(svc, { hash = "fp-1", expiresAt = FRESH_EXPIRY(), key = "founder-control:test-stop" } = {}) {
  svc.entities.FounderCommandAudit.store.push({
    id: "audit-preview-1",
    command_key: key,
    actor_email: FOUNDER.email,
    action: "safe_mode_on",
    status: "previewed",
    preview_json: { state_fingerprint: hash, expires_at: expiresAt },
  });
  return key;
}

function storedResumePreflight(svc, { hash = "resume-hash-live", expiresAt = FRESH_EXPIRY(), key = "founder-control:test-resume" } = {}) {
  svc.entities.FounderCommandAudit.store.push({
    id: "audit-preview-2",
    command_key: key,
    actor_email: FOUNDER.email,
    action: "resume_selected",
    status: "previewed",
    preview_json: { preflight_hash: hash, expires_at: expiresAt },
  });
  return key;
}

async function jsonOf(response) {
  return { status: response.status, body: await response.json() };
}

describe("emergencyControlAdmin — authentication boundary", () => {
  it("rejects a missing user with 401 before touching any entity", async () => {
    const svc = makeSvc();
    const { status, body } = await jsonOf(await handleEmergencyControlAction(null, { action: "status" }, svc, happyDeps()));
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(svc.entities.EmergencyControl.calls).toHaveLength(0);
  });

  it("rejects a non-admin with 403 before touching any entity", async () => {
    const svc = makeSvc();
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction({ id: "u1", email: "user@x.com", role: "user" }, { action: "status" }, svc, happyDeps()),
    );
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(svc.entities.EmergencyControl.calls).toHaveLength(0);
  });
});

describe("emergencyControlAdmin — safe_mode_on confirmation and preview binding", () => {
  it("rejects safe_mode_on without the ACTIVATE_CAMBRA_SAFE_MODE token and applies nothing", async () => {
    const svc = makeSvc();
    const key = storedStopPreview(svc);
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: key, reason: "drill", preview_hash: "fp-1", confirmation: "WRONG_TOKEN" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("confirmation_required");
    expect(body.required).toBe("ACTIVATE_CAMBRA_SAFE_MODE");
    expect(svc.entities.EmergencyControl.store[0].safe_mode).toBe(false);
    expect(svc.entities.OutboundControl.store[0].instantly_enabled).toBe(true);
  });

  it("rejects an expired preview with stop_preview_stale and applies nothing", async () => {
    const svc = makeSvc();
    const key = storedStopPreview(svc, { expiresAt: STALE_EXPIRY() });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: key, reason: "drill", preview_hash: "fp-1", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("stop_preview_stale");
    expect(svc.entities.EmergencyControl.store[0].safe_mode).toBe(false);
  });

  it("rejects a preview_hash that does not match the stored state_fingerprint", async () => {
    const svc = makeSvc();
    const key = storedStopPreview(svc, { hash: "fp-real" });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: key, reason: "drill", preview_hash: "fp-forged", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("stop_preview_stale");
    expect(svc.entities.EmergencyControl.store[0].safe_mode).toBe(false);
  });

  it("rejects safe_mode_on without any stored preview for the command_key", async () => {
    const svc = makeSvc();
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: "founder-control:never-previewed", reason: "drill", preview_hash: "fp-1", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("fresh_stop_preview_required");
  });
});

describe("emergencyControlAdmin — CAS against concurrent writers", () => {
  it("returns emergency_control_changed_concurrently (409) when the revision moved between preview and confirm", async () => {
    const svc = makeSvc();
    const key = storedStopPreview(svc);
    // Simulate a concurrent writer winning the CAS: the guarded updateMany
    // matches zero rows because control_revision already advanced.
    const emergency = svc.entities.EmergencyControl;
    const originalUpdateMany = emergency.updateMany.bind(emergency);
    emergency.updateMany = async (query, update) => {
      emergency.store[0].control_revision = 4;
      return originalUpdateMany(query, update);
    };
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: key, reason: "drill", preview_hash: "fp-1", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("emergency_control_changed_concurrently");
    // The concurrent writer's revision stands and safe mode was NOT applied by us.
    expect(emergency.store[0].safe_mode).toBe(false);
    expect(svc.entities.OutboundControl.store[0].instantly_enabled).toBe(true);
  });
});

describe("emergencyControlAdmin — idempotent replay", () => {
  it("replays a stored CONTAINED execution without running containment again", async () => {
    const svc = makeSvc();
    svc.entities.FounderCommandAudit.store.push({
      id: "audit-exec-1",
      command_key: "founder-control:done",
      actor_email: FOUNDER.email,
      action: "safe_mode_on",
      status: "executed",
      result_json: { containment_status: "CONTAINED", control: { safe_mode: true } },
    });
    let instantlyCalls = 0;
    const deps = happyDeps({
      pauseAllInstantlyCampaigns: async () => {
        instantlyCalls += 1;
        return { ok: true, campaigns: [] };
      },
    });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: "founder-control:done", reason: "drill", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        deps,
      ),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.idempotent_replay).toBe(true);
    expect(body.result.containment_status).toBe("CONTAINED");
    expect(instantlyCalls).toBe(0);
    const outboundWrites = svc.entities.OutboundControl.calls.filter((call) => call.op !== "filter");
    expect(outboundWrites).toHaveLength(0);
  });

  it("replays a stored INCOMPLETE stop as a 503 failure, never as a false CONTAINED", async () => {
    const svc = makeSvc();
    svc.entities.FounderCommandAudit.store.push({
      id: "audit-exec-2",
      command_key: "founder-control:half-done",
      actor_email: FOUNDER.email,
      action: "safe_mode_on",
      status: "executed",
      result_json: { containment_status: "CONTAINMENT_INCOMPLETE", containment_blockers: ["instantly_remote_pause_unverified"] },
    });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: "founder-control:half-done", reason: "drill", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.idempotent_replay).toBe(true);
    expect(body.containment_status).toBe("CONTAINMENT_INCOMPLETE");
  });

  it("does not replay an execution recorded by a different actor", async () => {
    const svc = makeSvc();
    svc.entities.FounderCommandAudit.store.push({
      id: "audit-exec-3",
      command_key: "founder-control:other-actor",
      actor_email: "someone-else@cambra.global",
      action: "safe_mode_on",
      status: "executed",
      result_json: { containment_status: "CONTAINED" },
    });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: "founder-control:other-actor", reason: "drill", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    // Falls through to the normal path, which requires a fresh preview.
    expect(status).toBe(409);
    expect(body.idempotent_replay).toBeUndefined();
    expect(body.error).toBe("fresh_stop_preview_required");
  });
});

describe("emergencyControlAdmin — containment is honest", () => {
  it("activates safe mode end-to-end and reports CONTAINED when every step verifies", async () => {
    const svc = makeSvc();
    const key = storedStopPreview(svc);
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: key, reason: "real emergency", preview_hash: "fp-1", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.containment_status).toBe("CONTAINED");
    // Observable writes, not just the response:
    const control = svc.entities.EmergencyControl.store[0];
    expect(control.safe_mode).toBe(true);
    expect(control.communications_paused).toBe(true);
    expect(control.paid_discovery_paused).toBe(true);
    expect(control.control_revision).toBe(4);
    expect(svc.entities.OutboundControl.store[0].instantly_enabled).toBe(false);
    expect(svc.entities.OutboundControl.store[0].acquisition_enabled).toBe(false);
    expect(svc.entities.CommercialPolicy.store[0].status).toBe("paused");
    expect(svc.entities.DiscoveryExecutionRun.store[0].stop_requested).toBe(true);
    expect(svc.entities.DiscoveryExecutionRun.store[0].stop_reason).toBe("GLOBAL_EMERGENCY_STOP");
    expect(svc.entities.AutonomyIncident.store).toHaveLength(0);
    // Audit + operational log written:
    expect(svc.entities.FounderCommandAudit.store.some((row) => row.status === "executed" && row.command_key === key)).toBe(true);
    expect(svc.entities.OperationalLog.store.some((row) => row.event_type === "emergency_control_changed")).toBe(true);
  });

  it("reports CONTAINMENT_INCOMPLETE (503, ok:false) and opens an AutonomyIncident when the Instantly remote pause fails", async () => {
    const svc = makeSvc();
    const key = storedStopPreview(svc);
    const deps = happyDeps({
      pauseAllInstantlyCampaigns: async () => {
        throw new Error("instantly_api_unreachable");
      },
    });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: key, reason: "real emergency", preview_hash: "fp-1", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        deps,
      ),
    );
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.containment_status).toBe("CONTAINMENT_INCOMPLETE");
    // Local containment still happened — fail-visible, not fail-open:
    expect(svc.entities.EmergencyControl.store[0].safe_mode).toBe(true);
    expect(svc.entities.OutboundControl.store[0].instantly_enabled).toBe(false);
    // A critical incident for human review exists and the response points at it:
    expect(svc.entities.AutonomyIncident.store).toHaveLength(1);
    expect(svc.entities.AutonomyIncident.store[0].severity).toBe("critical");
    expect(svc.entities.AutonomyIncident.store[0].workflow_state).toBe("human_review");
    expect(body.containment_incident_id).toBe(svc.entities.AutonomyIncident.store[0].id);
  });

  it("reports CONTAINMENT_INCOMPLETE when a local subsystem pause fails, even with the remote pause healthy", async () => {
    const svc = makeSvc();
    const key = storedStopPreview(svc);
    svc.entities.CommercialPolicy.update = async () => {
      throw new Error("policy_write_denied");
    };
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        { action: "safe_mode_on", command_key: key, reason: "real emergency", preview_hash: "fp-1", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.containment_status).toBe("CONTAINMENT_INCOMPLETE");
    expect(body.containment_blockers).toContain("commercial_policy_containment_incomplete");
    expect(svc.entities.AutonomyIncident.store).toHaveLength(1);
  });
});

describe("emergencyControlAdmin — selective safe resume", () => {
  function safeModeSvc() {
    const svc = makeSvc();
    Object.assign(svc.entities.EmergencyControl.store[0], {
      safe_mode: true,
      communications_paused: true,
      negotiations_paused: true,
      migrations_paused: true,
      billing_issuance_paused: true,
      paid_discovery_paused: true,
      resume_check_required: true,
    });
    return svc;
  }

  it("rejects resume_selected when the preflight_hash does not match a fresh evaluation", async () => {
    const svc = safeModeSvc();
    const key = storedResumePreflight(svc, { hash: "resume-hash-old" });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        {
          action: "resume_selected",
          command_key: key,
          reason: "resuming comms",
          confirmation: "RESUME_SELECTED_CAPABILITIES",
          selected_capabilities: ["communications"],
          preflight_hash: "resume-hash-old",
        },
        svc,
        happyDeps(), // fresh evaluation yields "resume-hash-live" ≠ stored/old
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("safe_resume_preflight_stale");
    expect(svc.entities.EmergencyControl.store[0].safe_mode).toBe(true);
    expect(svc.entities.EmergencyControl.store[0].communications_paused).toBe(true);
  });

  it("rejects resume_selected when the fresh preflight is not allowed", async () => {
    const svc = safeModeSvc();
    const key = storedResumePreflight(svc);
    const deps = happyDeps({
      evaluateSafeResume: async () => ({ allowed: false, blockers: ["scheduler_evidence_stale"], preflight_hash: "x", selected_capabilities: [] }),
    });
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        {
          action: "resume_selected",
          command_key: key,
          reason: "resuming comms",
          confirmation: "RESUME_SELECTED_CAPABILITIES",
          selected_capabilities: ["communications"],
          preflight_hash: "resume-hash-live",
        },
        svc,
        deps,
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("safe_resume_blocked");
    expect(svc.entities.EmergencyControl.store[0].safe_mode).toBe(true);
  });

  it("resumes ONLY the selected capability; the other four stay paused and resume_check_required stays true", async () => {
    const svc = safeModeSvc();
    const key = storedResumePreflight(svc);
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        {
          action: "resume_selected",
          command_key: key,
          reason: "resuming comms",
          confirmation: "RESUME_SELECTED_CAPABILITIES",
          selected_capabilities: ["communications"],
          preflight_hash: "resume-hash-live",
        },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.resumed_capabilities).toEqual(["communications"]);
    expect(body.outbound_remains_off).toBe(true);
    const control = svc.entities.EmergencyControl.store[0];
    expect(control.safe_mode).toBe(false);
    expect(control.communications_paused).toBe(false);
    expect(control.negotiations_paused).toBe(true);
    expect(control.migrations_paused).toBe(true);
    expect(control.billing_issuance_paused).toBe(true);
    expect(control.paid_discovery_paused).toBe(true);
    expect(control.resume_check_required).toBe(true);
    // Sanity: the enum this test relies on is the canonical one.
    expect(RESUMABLE_CAPABILITIES).toEqual(
      expect.arrayContaining(["communications", "negotiations", "migrations", "billing_issuance", "paid_discovery"]),
    );
  });

  it("ignores unknown capability names instead of resuming them", async () => {
    const svc = safeModeSvc();
    const key = storedResumePreflight(svc);
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(
        FOUNDER,
        {
          action: "resume_selected",
          command_key: key,
          reason: "resuming comms",
          confirmation: "RESUME_SELECTED_CAPABILITIES",
          selected_capabilities: ["communications", "outbound_everything", "drop_all_guards"],
          preflight_hash: "resume-hash-live",
        },
        svc,
        happyDeps(),
      ),
    );
    expect(status).toBe(200);
    expect(body.resumed_capabilities).toEqual(["communications"]);
    expect(svc.entities.EmergencyControl.store[0].negotiations_paused).toBe(true);
  });
});

describe("emergencyControlAdmin — no unguarded shortcut actions", () => {
  it("rejects direct pause_* actions in favor of the preview-bound flow", async () => {
    const svc = makeSvc();
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(FOUNDER, { action: "pause_communications", reason: "just pause it" }, svc, happyDeps()),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("preview_bound_founder_control_action_required");
  });

  it("rejects legacy resume_* shortcuts and points at the preflight flow", async () => {
    const svc = makeSvc();
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(FOUNDER, { action: "resume_everything", reason: "turn it back on" }, svc, happyDeps()),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("selective_safe_resume_preflight_required");
  });

  it("requires a founder reason of at least 3 characters for any material action", async () => {
    const svc = makeSvc();
    const { status, body } = await jsonOf(
      await handleEmergencyControlAction(FOUNDER, { action: "safe_mode_on", command_key: "k", reason: "x", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE" }, svc, happyDeps()),
    );
    expect(status).toBe(400);
    expect(body.error).toBe("founder_reason_required");
  });
});
