import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (p) =>
  fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("P9 Recover Fulfilment & Payments Migration invariants", () => {
  const start = read("base44/functions/startPaymentsMigration/entry.ts");
  const update = read("base44/functions/updatePaymentsMigrationTask/entry.ts");
  const projection = read("base44/functions/getMyPaymentsMigration/entry.ts");
  const accept = read("base44/functions/acceptRecoverMandate/entry.ts");
  const admin = read("src/components/admin/PaymentsMigrationOperations.jsx");
  const card = read("src/components/recover/PaymentsMigrationCard.jsx");
  const page = read("src/pages/PaymentsMigration.jsx");

  it("starts only after an active mandate and owns the migration", () => {
    expect(start).toMatch(/status:\s*["']active["']/);
    expect(start).toMatch(/status:\s*["']migrating["']/);
    expect(start).toContain("requires_brand_input: false");
    expect(start).toContain("requireUserOrInternal");
    expect(accept).toMatch(/fireAndForget\(base44,\s*["']startPaymentsMigration["']/);
  });

  it("has the complete operational path and SLA metadata", () => {
    for (
      const step of [
        "provider_coordination",
        "provider_ready",
        "technical_configuration",
        "migration_testing",
        "cutover_ready",
        "go_live",
        "verify_savings",
      ]
    ) {
      expect(start).toMatch(new RegExp(`["']${step}["']`));
    }
    expect(start).toContain("sla_days");
    expect(start).toContain("due_date");
  });

  it("prevents unsafe completion and preserves retry/blocker evidence", () => {
    expect(update).toContain("earlier_tasks_incomplete");
    expect(update).toContain("invalid_task_transition");
    expect(update).toContain("completion_evidence_note_required");
    expect(update).toContain("go_live_requires_migrating");
    expect(update).toContain("conditions_activation_evidence_required");
    expect(update).toContain("verified_real_savings_report_required");
    expect(update).toMatch(/measurement_mode\s*===\s*["']fully_verified["']/);
    expect(update).toContain("Number(r.savings) > 0");
    expect(update).toContain("task_changed_concurrently");
    expect(update).toContain("migration_activation_not_operational");
    expect(update).toMatch(
      /terminal_phase:\s*ambiguous\s*\?\s*["']RECONCILING["']\s*:\s*["']BLOCKED["']/,
    );
    expect(update).toContain(
      "activation_go_live_outcome_requires_reconciliation",
    );
    expect(update).toContain("payments_migration_task_authority_read");
    expect(update).toContain('ambiguous: "migration_task_authority_ambiguous"');
    expect(update).toContain(
      'unavailable: "migration_task_authority_unavailable"',
    );
    expect(update).toContain(
      'ambiguous: "payments_activation_authority_ambiguous"',
    );
    expect(update).toContain('ambiguous: "active_mandate_authority_ambiguous"');
    expect(update).toMatch(
      /entity\.filter\(filter,\s*["']-created_date["'],\s*2\)/,
    );
    expect(update).toContain(
      "paymentsMigrationActivationCasFilter(activationAuthoritySnapshot)",
    );
    expect(update).toContain("paymentsMigrationActivationReadbackMatches");
    expect(update).toContain(
      "payments_activation_revision_authority_unavailable",
    );
    expect(update).toContain("task_authority_snapshot: taskAuthoritySnapshot");
    expect(update).toContain(
      "activation_authority_snapshot: activationAuthoritySnapshot",
    );
    expect(update).toContain(
      "mandate_authority_snapshot: mandateAuthoritySnapshot",
    );
    expect(update).toContain(
      "next_migration_task_start_requires_reconciliation",
    );
    expect(update).toContain("finishPaymentsMigrationSagaStep");
    expect(update).toContain("receipt_hash: goLiveReceiptHash");
    expect(start).toContain("activation_changed_concurrently");
    expect(update).toContain("retry_count");
    expect(update).toContain("merchant_required");
    expect(update).toContain("merchant_blocker_requires_en_fr_es");
    expect(update).toMatch(/\[["']en["'],\s*["']fr["'],\s*["']es["']\]/);
    expect(update).toContain("merchant_blocker_i18n");
  });

  it("keeps internal migration mechanics out of the merchant projection", () => {
    expect(projection).toContain("merchant_blockers");
    expect(projection).toContain("t.requires_brand_input === true");
    expect(projection).toContain("reason_i18n");
    expect(projection).not.toContain("reason: t.blocked_reason");
    expect(projection).not.toContain("label: t.description");
    expect(projection).not.toContain("last_note:");
    expect(projection).not.toContain("last_actor:");
  });

  it("keeps P9 merchant and admin surfaces explicitly trilingual", () => {
    for (const source of [admin, card, page]) {
      expect(source).toContain("en:");
      expect(source).toContain("fr:");
      expect(source).toContain("es:");
    }
    expect(admin).toContain("STEP_COPY");
    expect(admin).toContain("merchant_message_i18n");
    expect(card).toContain("reason_i18n");
    expect(page).toContain("reason_i18n");
  });

  it("never renders raw backend errors or internal blocker notes to merchants", () => {
    expect(card).not.toContain("blocked_reason");
    expect(page).not.toContain("blocked_reason");
    expect(page).not.toContain("e?.message");
    expect(projection).toMatch(/error:\s*["']migration_projection_failed["']/);
    expect(projection).not.toMatch(
      /error\?\.message\s*\|\|\s*["']migration_projection_failed["']/,
    );
  });
});
