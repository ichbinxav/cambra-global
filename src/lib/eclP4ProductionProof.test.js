import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  allowlistForStage,
  P4_ALLOWLIST,
  P4_PROOF_ALLOWLIST,
  P6_ALLOWLIST,
  resolveStage,
  STAGE_ECL_P4,
  STAGE_ECL_P4_PROOF,
  STAGE_ECL_P5,
  STAGE_ECL_P6,
  STAGE_TRANSITIONS,
} from "../../scripts/lib/preEclFreeze.mjs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const APP_SRC = read("src/App.jsx");
const NAV_SRC = read("src/pages/admin/AdminLayout.jsx");
const QUEUE_SRC = read("src/pages/admin/ReviewQueue.jsx");
const SCHED_SRC = read("base44/functions/eclLifecycleScheduler/entry.ts");
const SCHED_CONFIG = JSON.parse(read("base44/functions/eclLifecycleScheduler/function.jsonc"));
const REVIEW_SRC = read("base44/functions/eclReviewWorkflow/entry.ts");

describe("ECL P4 Production Proof closure", () => {
  it("is a reversible stage after P4, never a shortcut", () => {
    expect(STAGE_TRANSITIONS[STAGE_ECL_P4]).toContain(STAGE_ECL_P4_PROOF);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P4_PROOF]).toEqual([STAGE_ECL_P4, STAGE_ECL_P5]);
    expect(allowlistForStage(STAGE_ECL_P4_PROOF)).toEqual(P4_PROOF_ALLOWLIST);
  });

  it("widens P4 by exactly three ECL artifacts and every allowlisted path exists", () => {
    expect(P4_PROOF_ALLOWLIST.slice(0, P4_ALLOWLIST.length)).toEqual(P4_ALLOWLIST);
    expect(P4_PROOF_ALLOWLIST.slice(P4_ALLOWLIST.length)).toEqual([
      "src/pages/admin/ReviewQueue.jsx",
      "src/lib/eclP4ProductionProof.test.js",
      "base44/functions/eclLifecycleScheduler/function.jsonc",
    ]);
    expect(P4_PROOF_ALLOWLIST).toHaveLength(39);
    for (const path of P4_PROOF_ALLOWLIST) {
      expect(fs.existsSync(new URL(`../../${path}`, import.meta.url)), `missing allowlisted path: ${path}`).toBe(true);
    }
  });

  it("keeps the Production Proof contract exact while the live repo advances through P5 to P6", () => {
    expect(allowlistForStage(STAGE_ECL_P4_PROOF)).toEqual(P4_PROOF_ALLOWLIST);
    const freeze = JSON.parse(read("config/pre-ecl-freeze.json"));
    expect(resolveStage(freeze)).toBe(STAGE_ECL_P6);
    expect([...freeze.allowlist].sort()).toEqual([...P6_ALLOWLIST].sort());
    expect(STAGE_TRANSITIONS[STAGE_ECL_P5]).toContain(STAGE_ECL_P6);
    expect(freeze.entries).toHaveLength(8);
  });

  it("mounts Evidence Review only inside the existing admin shell", () => {
    expect(APP_SRC).toMatch(/const ReviewQueue = lazy\(\(\) => import\('@\/pages\/admin\/ReviewQueue'\)\)/);
    const adminShell = APP_SRC.indexOf('<Route element={<AdminRoute><AdminLayout /></AdminRoute>}>');
    const route = APP_SRC.indexOf('path="/admin/evidence-review"');
    expect(adminShell).toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(adminShell);
    expect(NAV_SRC).toMatch(/path: "\/admin\/evidence-review", label: "Evidence Review"/);
  });

  it("keeps ReviewCase and scheduler-runtime reads behind the admin-only workflow", () => {
    expect(QUEUE_SRC).toMatch(/functions\.invoke\("eclReviewWorkflow"/);
    expect(QUEUE_SRC).toMatch(/action: "runtime"/);
    expect(QUEUE_SRC).toMatch(/action: "list"/);
    expect(QUEUE_SRC).toMatch(/action: "get"/);
    expect(QUEUE_SRC).toMatch(/action: "resolve"/);
    expect(QUEUE_SRC).not.toMatch(/base44\.entities\.(ReviewCase|AgentTask)/);
    expect(REVIEW_SRC).toMatch(/payload\.action === 'runtime'/);
    expect(REVIEW_SRC).toMatch(/AgentTask\.filter\(\{ agent_name: SCHEDULER_AGENT_NAME \}/);
  });

  it("binds resolution to the server-returned evidence checksum when available", () => {
    expect(QUEUE_SRC).toMatch(/detail\?\.evidence\?\.checksum/);
    expect(QUEUE_SRC).toMatch(/payload\.expectedChecksum = detail\.evidence\.checksum/);
  });

  it("exposes all four sanctioned human decisions without a direct verified override", () => {
    for (const decision of ["approve", "reject", "request_more_evidence", "dismiss"]) {
      expect(QUEUE_SRC).toContain(`resolve("${decision}")`);
    }
    expect(QUEUE_SRC).not.toMatch(/evidence_status\s*[:=]\s*["']verified["']/);
    expect(QUEUE_SRC).not.toMatch(/entities\.(StatementImport|SavingsEvidence)\.(update|updateMany)/);
  });

  it("records scheduler runtime proof in AgentTask without making telemetry a lifecycle dependency", () => {
    expect(SCHED_SRC).toMatch(/SCHEDULER_AGENT_NAME = 'ecl_lifecycle_scheduler'/);
    expect(SCHED_SRC).toMatch(/entities\.AgentTask\.create\(/);
    expect(SCHED_SRC).toMatch(/status: 'completed'/);
    expect(SCHED_SRC).toMatch(/status: 'failed'/);
    expect(SCHED_SRC).toMatch(/observabilityGuarantee: observabilityRecorded \? 'agent_task_recorded' : 'best_effort_unavailable'/);
    expect(SCHED_SRC).toMatch(/AgentTask\.create\([\s\S]*?\.catch\(\(\) => null\)/);
  });

  it("allows an admin to run the lifecycle scheduler once for deployment proof", () => {
    expect(QUEUE_SRC).toMatch(/functions\.invoke\("eclLifecycleScheduler", \{ limit: 25 \}\)/);
    expect(QUEUE_SRC).toContain("Run once now");
    expect(REVIEW_SRC).toContain("SCHEDULER_AGENT_NAME = 'ecl_lifecycle_scheduler'");
  });

  it("versions the recurring Base44 scheduler at 15 minutes with the same bounded batch", () => {
    expect(SCHED_CONFIG.name).toBe("eclLifecycleScheduler");
    expect(SCHED_CONFIG.entry).toBe("entry.ts");
    expect(SCHED_CONFIG.automations).toHaveLength(1);
    expect(SCHED_CONFIG.automations[0]).toMatchObject({
      type: "scheduled",
      name: "ECL Lifecycle Sweep",
      is_active: true,
      schedule_mode: "recurring",
      schedule_type: "simple",
      repeat_unit: "minutes",
      repeat_interval: 15,
      function_args: { limit: 25 },
      ends_type: "never",
    });
    expect(SCHED_SRC).toMatch(/body\?\.args\?\.limit \?\? body\?\.limit/);
  });

  it("keeps reminder delivery and all monetary side effects outside Production Proof", () => {
    expect(SCHED_SRC).toContain("reminderGuarantee: 'intent_only'");
    expect(SCHED_SRC).not.toMatch(/SendEmail|sendEmail|Resend|postmark/);
    expect(QUEUE_SRC).not.toMatch(/base44\.entities\.Invoice|createEligibleRecoverInvoices|recordPayment|stripeBilling|createPaymentLink/);
  });
});
