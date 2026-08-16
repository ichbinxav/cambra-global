import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

describe("Recover billing digest production closure", () => {
  it("is gated admin/internal and never anonymous-by-design", () => {
    const src = read("base44/functions/recoverBillingDigest/entry.ts");
    expect(src).toContain("requireAdminOrInternal");
    expect(src).toMatch(
      /if\s*\(\s*!gate\.ok\s*\)\s*\{\s*return\s+gate\.response\s*\|\|\s*Response\.json\([\s\S]*?status:\s*403[\s\S]*?\);\s*\}/,
    );
  });
  it("has one active versioned weekly automation", () => {
    const cfg = JSON.parse(read("base44/functions/recoverBillingDigest/function.jsonc"));
    expect(cfg.automations).toHaveLength(1);
    expect(cfg.automations[0]).toMatchObject({ is_active: true, schedule_mode: "recurring", repeat_unit: "days", repeat_interval: 7, function_name: "recoverBillingDigest" });
  });
  it("surfaces bounded-query truncation and hides internal error details", () => {
    const src = read("base44/functions/recoverBillingDigest/entry.ts");
    expect(src).toContain("coverage_truncated");
    expect(src).toContain("recover_billing_digest_failed");
    expect(src).not.toContain("Response.json({ error: (error as Error).message }");
  });
});
