import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { boundedFounderControlSource, evaluateSafeResumeFromSnapshot } from "../../base44/shared/founderControlV2.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function safeSnapshot(overrides = {}) {
  return {
    emergency: {
      control_available: true,
      safe_mode: true,
      communications_paused: true,
      negotiations_paused: true,
      migrations_paused: true,
      billing_issuance_paused: true,
      paid_discovery_paused: true,
    },
    global_status: { critical_incident_count: 0 },
    freshness: { authority_unknown: false },
    dependency_summary: {
      scheduler: {
        no_duplicate_execution: true,
        missing_or_stale: [],
        duplicate_workers: [],
      },
      cost_budget_valid: true,
      suppression_pass: true,
      deliverability_pass: true,
      stripe_connected: true,
      blocked_migration_ids: [],
      critical_incident_ids: [],
    },
    cost_control: { version: "safe-v1", emergency_stop_active: false },
    ...overrides,
  };
}

describe("Founder Control V2 canonical authority projection", () => {
  it("bounds every canonical source so one stalled read cannot blank the control plane", async () => {
    expect(await boundedFounderControlSource(Promise.resolve([{ id:"ok" }]), 20)).toMatchObject({ ok:true, data:[{ id:"ok" }] });
    expect(await boundedFounderControlSource(new Promise(() => {}), 5)).toMatchObject({ ok:false, data:[], error:"FOUNDER_CONTROL_SOURCE_TIMEOUT" });
  });

  it("fails closed when EmergencyControl cannot be read", () => {
    const source = read("base44/shared/operationalControl.ts");
    expect(source).toContain("control_available:false");
    expect(source).toContain("safe_mode:true");
    expect(source).toContain("communications_paused:true");
    expect(source).toContain("paid_discovery_paused:true");
    expect(source).toContain("emergency_control_unavailable");
  });

  it("never turns legacy runtime PASS rows into Founder execution capacity", () => {
    const source = read("base44/shared/founderControlV2.ts");
    expect(source).toContain("verifyRuntimeGateEvidence");
    expect(source).toContain("gateVerification.get(key)?.ok===true");
  });

  it("allows only a fresh dependency-safe selective resume", async () => {
    const ready = await evaluateSafeResumeFromSnapshot(safeSnapshot(), [
      "communications",
    ]);
    expect(ready.allowed).toBe(true);
    expect(ready.selected_capabilities).toEqual(["communications"]);
    expect(ready.semantics.outbound_remains_off).toBe(true);
    expect(ready.semantics.commercial_policies_remain_paused).toBe(true);

    const unknown = await evaluateSafeResumeFromSnapshot(
      safeSnapshot({ freshness: { authority_unknown: true } }),
      ["communications"],
    );
    expect(unknown.allowed).toBe(false);
    expect(unknown.blockers).toContain("canonical_sources");

    const duplicate = await evaluateSafeResumeFromSnapshot(
      safeSnapshot({
        dependency_summary: {
          ...safeSnapshot().dependency_summary,
          scheduler: {
            no_duplicate_execution: false,
            missing_or_stale: [],
            duplicate_workers: ["commercialFollowUpWorker"],
          },
        },
      }),
      ["communications"],
    );
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.blockers).toContain("duplicate_execution");

    const empty = await evaluateSafeResumeFromSnapshot(safeSnapshot(), []);
    expect(empty.allowed).toBe(false);
    expect(empty.blockers).toContain("selection_required");
  });

  it("binds emergency changes to preview, reason, idempotency and audit without blind restart", () => {
    // FCTRL-J: the handler body lives in the shared core module; the entry is
    // a thin Deno.serve wrapper. Behavior is now invoked directly in
    // src/lib/emergencyControlAdminBehavior.test.js — this check only pins the
    // invariant strings.
    const source = read("base44/functions/emergencyControlAdmin/entry.ts") +
      read("base44/shared/emergencyControlAdminCore.ts");
    for (const requirement of [
      "safe_mode_preview",
      "resume_preflight",
      "fresh_stop_preview_required",
      "safe_resume_preflight_stale",
      "founder_reason_required",
      "idempotent_replay",
      "previous_state",
      "resulting_state",
      "emergency_control_changed_concurrently",
    ])
      expect(source).toContain(requirement);
    expect(source).toContain(
      "{id:row.id,control_revision:Number(row.control_revision||0)}",
    );
    expect(source).toContain("preview_bound_founder_control_action_required");
    expect(source).toContain("outbound_remains_off:true");
    expect(source).toContain("commercial_policies_remain_paused:true");
    expect(source).not.toContain("acquisition_enabled:true");
  });

  it("keeps approval confirmation bound, fresh and replay-safe", () => {
    const gateway = read("base44/functions/founderOSCommand/entry.ts");
    const resolver = read(
      "base44/functions/resolveCommercialApproval/entry.ts",
    );
    const schema = read("base44/entities/Approval.jsonc");
    const approvals = read("src/pages/admin/AdminApprovals.jsx");
    for (const requirement of [
      "preview_command_key_required",
      "idempotent_replay",
      "approval_preview_stale",
      "approval_preview_expired",
      "approval_expired",
      "unsupported_approval_action_type",
      "approval_resolution_race_lost",
    ])
      expect(gateway).toContain(requirement);
    expect(gateway).toMatch(
      /const claimFilter\s*:\s*any\s*=\s*\{\s*id:\s*approval\.id,\s*status:\s*["']pending["']/,
    );
    expect(gateway).toMatch(/status:\s*["']resolving["']/);
    expect(gateway).toMatch(/resolution_command_key:\s*commandKey/);
    expect(gateway).toContain("buildApprovalAuthoritySnapshot");
    expect(gateway).toMatch(/resolution_authority_hash:\s*authorityHash/);
    expect(gateway).toMatch(/approval\.status\s*===\s*["']resolving["']/);
    expect(gateway).toMatch(/resolution_content_hash:\s*contentHash/);
    expect(gateway).toMatch(/resolution_phase:\s*["']claimed["']/);
    expect(gateway).toMatch(/approval_revision:\s*workingRevision\s*\+\s*1/);
    expect(gateway).toMatch(/expected_authority_hash:\s*authorityHash/);
    expect(resolver).toContain("founder_command_resolution_claim_required");
    expect(resolver).toContain("approval_authority_changed_repreview_required");
    expect(resolver).toContain("approval_content_changed_repreview_required");
    expect(resolver).toContain("approval_resolution_binding_mismatch");
    expect(resolver).toContain("acquireResolutionAttempt");
    expect(resolver).toContain("markResolutionEffectsStarted");
    expect(resolver).toContain("renewResolutionLease");
    expect(resolver).toContain("releaseResolutionClaimIfNoEffects");
    expect(resolver).toContain("beginResolutionEffects");
    expect(resolver).toContain("threadApprovalBindingMatches");
    expect(resolver).toContain("message_thread_binding_mismatch");
    expect(resolver).toContain("existingForApproval");
    expect(resolver).toContain("upsertTierByKey");
    expect(resolver).toContain("duplicate_agreement_for_approval");
    expect(resolver).toContain("finalizeApproval");
    expect(resolver).not.toContain("Approval.update(ap.id");
    expect(schema).toContain('"resolving"');
    expect(schema).toContain('"resolution_command_key"');
    expect(schema).toContain('"resolution_authority_hash"');
    expect(schema).toContain('"approval_revision"');
    expect(schema).toContain('"resolution_phase"');
    expect(schema).toContain('"resolution_effects_started"');
    expect(approvals).toContain("founderOSCommand");
    expect(approvals).not.toContain("entities.Approval.update");
  });

  it("renders a compact authority UI and keeps developer/meeting/settings concerns elsewhere", () => {
    const ui = read("src/pages/admin/AdminFounderControl.jsx");
    expect(ui).toContain("getFounderControlCenter");
    expect(ui).toContain("safe_mode_preview");
    expect(ui).toContain("resume_preflight");
    expect(ui).toContain('context_scope:"FOUNDER_CONTROL"');
    expect(ui).not.toContain("founderControlContext");
    expect(ui).toContain("Confirm with fresh preview");
    expect(ui).toContain("const requireCanonical = useCallback");
    expect(ui).toContain("boundedFounderControlSnapshot");
    expect(ui).toContain("The canonical snapshot did not respond in time. No authority was inferred.");
    expect(ui).toContain('error:"canonical_preview_incomplete"');
    expect(ui).toContain('["preview.state_fingerprint", "command_key", "confirmation_required"]');
    expect(ui).toContain('["preflight.preflight_hash", "command_key", "confirmation_required"]');
    expect(ui).toContain('["preview.preview_hash", "command_key", "confirmation_required"]');
    expect(ui).toContain('requireCanonical(canaryPreflight, ["preflight_hash", "allowed"])');
    expect(ui).toContain("modal?.preview?.old_value");
    expect(ui).toContain("modal?.preview?.new_value");
    expect(ui).toContain("modal?.preview?.impact");
    expect(ui).not.toMatch(/modal\.preview\?\.(?:old_value|new_value|impact)/);
    expect(ui).not.toContain("VITE_CAMBRA_GIT_SHA");
    expect(ui).not.toContain("meetingPolicy");
    expect(ui).not.toContain("dkim_selectors");
  });

  it("localizes Founder Control in EN/FR/ES and keeps resolving approvals fail-closed", () => {
    const ui = read("src/pages/admin/AdminFounderControl.jsx");
    expect(ui).toContain("useTranslation");
    expect(ui).toContain("const LOCAL_COPY");
    expect(ui).toContain("fr: {");
    expect(ui).toContain("es: {");
    expect(ui).toContain('item.status === "pending"');
    expect(ui).toContain("disabled={!!busy || !pending}");
    expect(ui).toContain(
      "Resolution is already in progress. Material execution remains fail-closed until the canonical resolver completes.",
    );
    expect(ui).toContain('text={tr("{count} decisions requiring attention"');
    const dictionarySource = ui.slice(
      ui.indexOf("const LOCAL_COPY = ") + "const LOCAL_COPY = ".length,
      ui.indexOf("\n};\n\nconst SAFE_BUDGET") + 2,
    );
    const localCopy = Function(`return (${dictionarySource})`)();
    const usedKeys = [...ui.matchAll(/\btr\("((?:[^"\\]|\\.)*)"/g)].map(
      (match) => JSON.parse(`"${match[1]}"`),
    );
    for (const language of ["fr", "es"]) {
      expect([
        ...new Set(
          usedKeys.filter((key) => !Object.hasOwn(localCopy[language], key)),
        ),
      ]).toEqual([]);
    }
  });

  it("makes paid Discovery obey the global stop while preserving zero-cost manual intelligence", () => {
    const discovery = read("base44/shared/discoveryV2Admin.ts");
    const worker = read(
      "base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts",
    );
    expect(discovery).toContain("paid_discovery_paused");
    expect(discovery).toMatch(
      /error\s*:\s*["']emergency_control_paused:paid_discovery["'][\s\S]{0,400}zero_cost_manual_intelligence_still_available\s*:\s*true/,
    );
    expect(worker).toContain("paid_discovery_paused");
  });

  it("keeps Ask CAMBRA explanatory and non-authoritative", () => {
    const chat = read("base44/functions/copilotChat/entry.ts");
    expect(chat).toContain("FOUNDER CONTROL CONTEXT");
    expect(chat).toContain(
      "collectFounderControlSnapshot(base44.asServiceRole)",
    );
    expect(chat).not.toContain("payload?.founderControlContext");
    expect(chat).toContain("Plain chat is read-only");
    expect(chat).toContain("AI cannot change its own authority or hard limits");
  });

  it("never turns a tenant merchant Stripe connection into global billing authority", () => {
    const aggregate = read("base44/shared/founderControlV2.ts");
    const runtime = read("base44/shared/logical/goLiveControlAdmin.ts");
    expect(aggregate).not.toContain(
      "entities.Integration.filter({status:'connected'}",
    );
    expect(aggregate).toContain("gatePass('STRIPE_LIVE_ACCOUNT_HEALTH')");
    expect(aggregate).toContain("verifyRuntimeGateEvidence(row,{environment:'production'})");
    expect(aggregate).toContain("gateVerification.get(key)?.ok===true");
    expect(aggregate).toContain(
      "platform-scoped Stripe billing health proof required",
    );
    expect(runtime).toContain("assertBillingAccount('live')");
    expect(runtime).toContain("gate_key:'STRIPE_LIVE_ACCOUNT_HEALTH'");
  });

  it("uses optimistic concurrency for material emergency and outbound transitions", () => {
    const emergency = read("base44/functions/emergencyControlAdmin/entry.ts") +
      read("base44/shared/emergencyControlAdminCore.ts");
    const outbound = read("base44/functions/outboundControlAdmin/entry.ts");
    const emergencySchema = read("base44/entities/EmergencyControl.jsonc");
    const outboundSchema = read("base44/entities/OutboundControl.jsonc");
    expect(emergency).toContain("emergency_control_changed_concurrently");
    expect(outbound).toContain("outbound_control_changed_concurrently");
    expect(outbound).toContain("transition_key:transitionKey");
    expect(outbound).toContain("remote_effects_started:false");
    expect(outbound).toContain("emergency_control_changed_during_start");
    expect(outbound).toContain("pauseActivatedCampaigns");
    for (const source of [emergencySchema, outboundSchema])
      expect(source).toContain('"control_revision"');
  });
});
