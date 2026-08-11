import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const load = (p) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const configs = [
  ["base44/functions/processWebhookDeadLetters/function.jsonc", "processWebhookDeadLetters", 5],
  ["base44/functions/eclProductionHealth/function.jsonc", "eclProductionHealth", 10],
  ["base44/functions/eclLifecycleScheduler/function.jsonc", "eclLifecycleScheduler", 15],
  ["base44/functions/reconcileRecoverBilling/function.jsonc", "reconcileRecoverBilling", 15],
];
describe("critical automation registration", () => {
  for (const [path, fn, cadence] of configs) it(`${fn} is explicitly registered`, () => {
    const a = load(path).automations?.[0];
    expect(a).toMatchObject({ is_active: true, schedule_mode: "recurring", repeat_unit: "minutes", repeat_interval: cadence, function_name: fn });
    expect(new Date(a.starts_at).toString()).not.toBe("Invalid Date");
  });

  it("billApiUsage has a valid monthly cadence and duplicate-run protection", () => {
    const automation = load("base44/functions/billApiUsage/function.jsonc").automations?.[0];
    const source = readFileSync(join(process.cwd(), "base44/functions/billApiUsage/entry.ts"), "utf8");
    expect(automation).toMatchObject({
      is_active: true,
      schedule_mode: "recurring",
      repeat_unit: "months",
      repeat_interval: 1,
      repeat_on_day_of_month: 1,
      function_name: "billApiUsage",
    });
    expect(source).toContain("billing_run_id");
    expect(source).toContain("assertOperationAllowed(svc, 'billing_issuance')");
  });
});
