import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("ROOT-OTR-002/003 source boundary inventory", () => {
  it("keeps the binary OTR seal honest until a real concurrent provider drill exists", () => {
    const ledger = JSON.parse(
      read("config/intelligence/orchestration-p0-remediation.v2.json"),
    );
    for (const id of ["ROOT-OTR-002", "ROOT-OTR-003"]) {
      const item = ledger.items.find((entry) => entry.otr_id === id);
      expect(item).toBeTruthy();
      expect(item.binary_closure_status).toBe("NOT_MET");
      expect(item.runtime_evidence_refs).toEqual([]);
    }
    const evidence = read("src/docs/EMERGENCY_EPOCH_BOUNDARY.md");
    expect(evidence).toContain("ROOT-OTR-002: **NOT_MET**");
    expect(evidence).toContain("ROOT-OTR-003: **NOT_MET**");
    expect(evidence).toContain("CONTAINMENT_INCOMPLETE");
  });

  it("fences every physical commercial transport immediately before and after provider effect", () => {
    const source = read("base44/functions/commercialSendMessage/entry.ts");
    for (
      const phase of [
        "before_instantly_queue",
        "after_instantly_queue",
        "before_instantly_reply",
        "after_instantly_reply",
        "before_resend_send",
        "after_resend_send",
      ]
    ) expect(source).toContain(phase);
    const outlookAdapter = read("base44/shared/commercialSendSafety.ts");
    for (
      const phase of [
        "before_outlook_draft",
        "after_outlook_draft",
        "before_outlook_send",
        "after_outlook_send",
      ]
    ) expect(outlookAdapter).toContain(phase);
    expect(source).toContain("executeOutlookAcceptedTransport");
    expect(source).toContain("checkpoint: async (name) =>");
    expect(outlookAdapter).toContain("dependencies.on_effect_start?.()");
    expect(source).toContain("inheritEmergencyEpoch");
    expect(source).toContain("containCommunicationTransport");
    expect(source).toContain("pauseAllInstantlyCampaigns");
    expect(source).toContain("send_effect_ambiguous_review_required");
    const emergencyAdmin = read(
      "base44/functions/emergencyControlAdmin/entry.ts",
    );
    expect(emergencyAdmin).toContain("containCommunicationTransport");
    expect(emergencyAdmin).toContain(
      "containment_status:containmentComplete?'CONTAINED':'CONTAINMENT_INCOMPLETE'",
    );
    expect(emergencyAdmin).toContain("AutonomyIncident.create");
    const readiness = read("base44/shared/goLiveRuntime.ts");
    expect(readiness).toContain("emergency_containment_incomplete");
    expect(readiness).toContain("open_incident_authority_unavailable");
  });

  it("routes every Core email effect through the guarded, durably contained adapter", () => {
    const files = [];
    const visit = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === ".deploy") continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (
          entry.name.endsWith(".ts") &&
          read(path.relative(root, absolute)).includes(
            "integrations.Core.SendEmail(",
          )
        ) files.push(path.relative(root, absolute));
      }
    };
    visit(path.join(root, "base44"));
    expect(files).toEqual(["base44/shared/costGovernance.ts"]);
    const source = read(files[0]);
    expect(source).toContain("guardedEmergencyEffect");
    expect(source).toContain("inheritEmergencyEpoch");
    expect(source).toContain("emergency_epoch_changed_during_base44_email");
    expect(source).toContain("containCommunicationTransport");
  });

  it("retains one epoch across batch email and provider-negotiation child calls", () => {
    for (
      const file of [
        "base44/functions/newsletterAgent/entry.ts",
        "base44/functions/sendMonthlySavingsSummary/entry.ts",
        "base44/functions/submitCallRequest/entry.ts",
        "base44/functions/joinCollective/entry.ts",
        "base44/functions/startProviderNegotiation/entry.ts",
        "base44/functions/aggregateProcurementWorker/entry.ts",
        "base44/functions/providerNegotiationAgent/entry.ts",
        "base44/functions/collectiveNegotiationAgent/entry.ts",
        "base44/functions/providerMonetizationAgent/entry.ts",
        "base44/functions/resolveCommercialApproval/entry.ts",
      ]
    ) expect(read(file)).toContain("emergency_epoch_claim");
    for (
      const file of [
        "base44/functions/commercialSendMessage/entry.ts",
        "base44/functions/providerContactResolver/entry.ts",
        "base44/functions/providerNegotiationAgent/entry.ts",
        "base44/functions/collectiveNegotiationAgent/entry.ts",
        "base44/functions/providerMonetizationAgent/entry.ts",
      ]
    ) expect(read(file)).toContain("inheritEmergencyEpoch");
  });

  it("fences billing issuance, payment setup, provider revenue and migrations", () => {
    const guardedStripe = [
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
      "base44/functions/createPaymentLink/entry.ts",
      "base44/functions/startPaymentMethodSetup/entry.ts",
    ];
    for (const file of guardedStripe) {
      const source = read(file);
      expect(source).toContain("captureEmergencyEpoch");
      if (file.endsWith("createEligibleRecoverInvoices/entry.ts")) {
        expect(source).toContain("executeRecoverBillingProviderRequest");
        expect(source).toContain("emergency_epoch_claim: billingEpoch");
        expect(read("base44/shared/economicExecution.ts")).toContain(
          "guardedEmergencyEffect",
        );
      } else expect(source).toContain("guardedEmergencyEffect");
      expect(source).toContain("assertEmergencyEpochUnchanged");
    }
    for (
      const file of [
        "base44/functions/billApiUsage/entry.ts",
        "base44/functions/providerRevenueBillingWorker/entry.ts",
        "base44/functions/recordProviderRevenueInvoiceIssued/entry.ts",
        "base44/functions/recordProviderRevenuePayment/entry.ts",
      ]
    ) {
      const source = read(file);
      expect(source).toContain("captureEmergencyEpoch");
      expect(source).toContain("assertEmergencyEpochUnchanged");
    }
    const migration = read(
      "base44/functions/developerMigrationEngine/entry.ts",
    );
    expect(migration).toContain("preEffectGuard");
    expect(migration).toContain("postEffectGuard");
    expect(migration).toContain("fence_hash");
    expect(migration).toContain(
      "emergency_control_changed_during_external_effect",
    );
    for (
      const file of [
        "base44/functions/startPaymentsMigration/entry.ts",
        "base44/functions/updatePaymentsMigrationTask/entry.ts",
      ]
    ) {
      const source = read(file);
      expect(source).toContain("captureEmergencyEpoch");
      expect(source).toContain("assertEmergencyEpochUnchanged");
      expect(source).toContain("REVIEW_REQUIRED");
    }
    const webhook = read("base44/functions/dispatchWebhook/entry.ts");
    expect(webhook).toContain("captureEmergencyEpoch");
    expect(webhook).toContain("guardedEmergencyEffect");
    expect(webhook).toContain('claim_state: "REVIEW_REQUIRED"');
    expect(webhook).toContain("automatic_retry_blocked:ambiguity!==null");
  });

  it("never aliases non-invoice Stripe race checkpoints into stripe_invoice_id", () => {
    const source = read(
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
    );
    expect(source).toMatch(
      /type StripeBillingEffectKind\s*=\s*[\s\S]*["']invoice["'][\s\S]*["']invoice_item["'][\s\S]*["']customer["'][\s\S]*["']tax_id["']/,
    );
    expect(source).toMatch(/invoice_item:\s*["']ii_["']/);
    expect(source).toMatch(/customer:\s*["']cus_["']/);
    expect(source).toMatch(/tax_id:\s*["']txi_["']/);
    expect(source).toMatch(
      /providerCheckpoint\.invoice_id\s*\?\s*\{\s*stripe_invoice_id:\s*providerCheckpoint\.invoice_id\s*\}/,
    );
    expect(source).not.toContain(
      "stripe_invoice_id: outcome.provider_object_id",
    );
  });

  it("does not claim remote containment for configured one-shot transports", () => {
    const admin = read("base44/functions/emergencyControlAdmin/entry.ts");
    const authority = read("base44/shared/operationalControl.ts");
    for (
      const status of [
        "NOT_CONFIGURED",
        "LOCALLY_BLOCKED",
        "REMOTELY_VERIFIED_PAUSED",
        "UNVERIFIED",
        "ERROR",
      ]
    ) expect(authority).toContain(status);
    expect(admin).toContain("persistEmergencyTransportContainment");
    expect(admin).toContain("remoteContainmentComplete");
    expect(admin).toContain(
      "remote_transport_containment:transportEvidence.transports",
    );
    expect(admin).toContain(
      "containment_status:containmentComplete?'CONTAINED':'CONTAINMENT_INCOMPLETE'",
    );
    expect(admin).not.toContain("REMOTE_PAUSE_UNSUPPORTED");
  });

  it("inventories every direct api/enrichment reservation behind epoch fencing or an explicit read-only reconciliation exception", () => {
    const files = [];
    const visit = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === ".deploy") continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.name.endsWith(".ts")) {
          const relative = path.relative(root, absolute),
            source = read(relative);
          if (
            source.includes("reservePaidOperation(") &&
            /category:\s*["'](?:api|enrichment)["']/u.test(source)
          ) files.push(relative);
        }
      }
    };
    visit(path.join(root, "base44"));
    expect(files.sort()).toEqual([
      "base44/functions/goLiveControlAdmin/entry.ts",
      "base44/functions/instantlyProviderAdmin/entry.ts",
      "base44/functions/instantlyReconciliationWorker/entry.ts",
      "base44/functions/leadDiscoveryAgent/entry.ts",
      "base44/functions/leadEnrichmentAgent/entry.ts",
      "base44/functions/outboundControlAdmin/entry.ts",
      "base44/functions/requestP4Estimate/entry.ts",
    ]);
    for (const file of files) {
      const source = read(file);
      expect(
        source.includes("guardReservedPaidProviderEffect") ||
          source.includes("emergency_effect_mode:'read_only_reconciliation'") ||
          source.includes(
            'emergency_effect_mode: "read_only_reconciliation"',
          ) ||
          (source.includes("sameEmergencyAuthority") &&
            source.includes("emergencyAfterActivation")) ||
          (source.includes("inheritEmergencyEpoch") &&
            source.includes("after_instantly_")),
        `${file} has an unfenced paid provider reservation`,
      ).toBe(true);
    }
    for (
      const file of [
        "base44/functions/leadDiscoveryAgent/entry.ts",
        "base44/functions/leadEnrichmentAgent/entry.ts",
      ]
    ) {
      const source = read(file);
      expect(source).toContain("EMERGENCY_EFFECT_AMBIGUOUS");
      expect(source).toContain("throw error");
    }
  });

  it("binds only the negotiation model effects to their inherited epoch and blocks fallback after ambiguity", () => {
    const router = read("base44/shared/commercialModelRouter.ts");
    expect(router).toContain("emergencyEpochClaim?");
    expect(router).toContain("guardedEmergencyEffect");
    expect(router).toContain(
      "ambiguity_state:reviewRequired?'REVIEW_REQUIRED':null",
    );
    expect(router).toContain("automatic_retry_blocked:reviewRequired");
    for (
      const file of [
        "base44/functions/providerNegotiationAgent/entry.ts",
        "base44/functions/collectiveNegotiationAgent/entry.ts",
        "base44/functions/providerMonetizationAgent/entry.ts",
      ]
    ) {
      const source = read(file);
      expect(source).toContain("emergencyEpochClaim: negotiationEpoch");
      expect(source).toContain("EMERGENCY_EFFECT_AMBIGUOUS");
      expect(source).toContain("REVIEW_REQUIRED");
    }
  });
});
