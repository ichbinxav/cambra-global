import { describe,it,expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src=readFileSync(join(process.cwd(),"scripts/generate-release-manifest.mjs"),"utf8");
const check=readFileSync(join(process.cwd(),"scripts/check-release-manifest.mjs"),"utf8");
describe("release manual gates",()=>{
 it("blocks Recover V2 activation while legal approval is false",()=>expect(src).toContain("LEGAL REVIEW REQUIRED BEFORE RECOVER V2 ACTIVATION"));
 it("keeps full Stripe integration validation future-scoped until a merchant path exists",()=>{
  expect(src).toContain('integrationStatus?.stripe !== "live_verified"');
  expect(src).toContain("STRIPE FULL INTEGRATION VALIDATION");
 });
 it("keeps real-world autonomous revenue validation behind genuine merchant pilots",()=>expect(src).toContain("REAL-WORLD VALIDATION REQUIRED"));
 it("keeps provider monetization behind explicit legal tax and disclosure activation",()=>expect(src).toContain("P15 PROVIDER MONETIZATION ACTIVATION"));
 it("separates technical CI integrity from retained production activation gates",()=>{
  expect(src).toContain("blockingManualRequirements");
  expect(src).toContain("completedProductionRequirements");
  expect(src).toContain("pendingProductionRequirements");
  expect(src).toContain("futureActivationRequirements");
  expect(src).toContain("productionSealEligible: pilotReadyEligible");
  expect(check).toContain("blockingManualRequirements.length > 0");
  expect(check).toContain("productionSealEligible");
  expect(check).toContain("retained pilot production proof");
 });
 it("keeps a live merchant golden path out of pilot blockers but in real-world validation",()=>{
  expect(src).toContain("This blocks REAL_WORLD_VALIDATED, not PILOT_READY");
  expect(src).toContain("realWorldValidatedEligible");
 });
});
