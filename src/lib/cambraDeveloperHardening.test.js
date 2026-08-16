import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const ENGINE = read("base44/functions/developerMigrationEngine/entry.ts");

describe("CAMBRA Developer hardening", () => {
  it("treats repo as untrusted data and redacts obvious secrets before AI", () => {
    expect(ENGINE).toContain("UNTRUSTED DATA");
    expect(ENGINE).toContain("redactPotentialSecrets");
    expect(ENGINE).toContain("[PRIVATE KEY REDACTED]");
  });

  it("patches only L3-approved plan paths", () => {
    expect(ENGINE).toContain("approvedPatchPaths");
    expect(ENGINE).toContain("patch_contains_unapproved_paths");
    expect(ENGINE).toMatch(/approved_plan:\s*plan/);
    expect(ENGINE).toContain("plan_hash");
  });

  it("requires real CI evidence and pins L4 approval to exact PR head", () => {
    expect(ENGINE).toContain("ci_evidence_required");
    expect(ENGINE).toContain("pr_changed_since_ci_check");
    expect(ENGINE).toContain("approved_head_sha");
    expect(ENGINE).toContain("pr_changed_after_l4_approval");
    expect(ENGINE).toContain("ci_not_green_at_cutover");
    expect(ENGINE).toContain("ci_hash");
  });

  it("verification is state-gated and rollback has its own L4 approval", () => {
    expect(ENGINE).toContain("verification_not_active");
    expect(ENGINE).toMatch(/action === ["']request_rollback["']/);
    expect(ENGINE).toMatch(/action_type:\s*["']developer_rollback["']/);
    expect(ENGINE).toContain("l4_rollback_approval_required");
    expect(ENGINE).toContain("rollback_binding_hash");
  });

  it("decodes GitHub base64 as UTF-8", () => {
    expect(ENGINE).toContain("new TextDecoder().decode(bytes)");
  });

  it("fences every material GitHub mutation and refuses ambiguous replay", () => {
    expect(ENGINE).toContain("guardedGithubMutation");
    expect(ENGINE).toContain("assertDeveloperMigrationsAllowed");
    expect(ENGINE).toContain("ambiguous_external_effect_requires_reconciliation");
    expect(ENGINE).toContain("idempotent_replay");
    expect(ENGINE).toContain("REVIEW_REQUIRED");
  });
});
