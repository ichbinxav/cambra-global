import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";

const root = process.cwd();
const load = (name) => JSON.parse(readFileSync(join(root, `base44/entities/${name}.jsonc`), "utf8"));
const ADMIN_ONLY = { user_condition: { role: "admin" } };
const SERVICE_ROLE_ONLY = { user_condition: { role: "__service_role_only__" } };

const WRITE_POLICY_BY_ENTITY = {
  DealActivation: ADMIN_ONLY,
  Mandate: ADMIN_ONLY,
  SavingsEvidence: ADMIN_ONLY,
  MigrationTask: ADMIN_ONLY,
  Invoice: SERVICE_ROLE_ONLY,
  Baseline: ADMIN_ONLY,
  BillingRule: ADMIN_ONLY,
  ReferralLink: ADMIN_ONLY,
};

describe("financial/contractual entity RLS hardening", () => {
  for (const [name, expectedPolicy] of Object.entries(WRITE_POLICY_BY_ENTITY)) {
    it(`${name} cannot be written directly by a merchant entity client`, () => {
      expect(load(name).rls.write).toEqual(expectedPolicy);
    });
  }
});
