import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";

const root = process.cwd();
const load = (name) => JSON.parse(readFileSync(join(root, `base44/entities/${name}.jsonc`), "utf8"));
const ADMIN_ONLY = { user_condition: { role: "admin" } };

describe("financial/contractual entity RLS hardening", () => {
  for (const name of ["DealActivation", "Mandate", "SavingsEvidence", "MigrationTask", "Invoice", "Baseline", "BillingRule"]) {
    it(`${name} cannot be written directly by a merchant entity client`, () => {
      expect(load(name).rls.write).toEqual(ADMIN_ONLY);
    });
  }
});
