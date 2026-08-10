import { describe,it,expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src=readFileSync(join(process.cwd(),"scripts/generate-release-manifest.mjs"),"utf8");
const check=readFileSync(join(process.cwd(),"scripts/check-release-manifest.mjs"),"utf8");
describe("release manual gates",()=>{
 it("blocks launch seal while Recover V2 legal approval is false",()=>expect(src).toContain("LEGAL REVIEW REQUIRED: Recover Economics V2"));
 it("blocks full production seal until Stripe live verification is explicit",()=>{
  expect(src).toContain('integrationStatus?.stripe !== "live_verified"');
  expect(src).toContain("PRODUCTION VALIDATION REQUIRED: Stripe live integration status");
 });
 it("keeps real-world autonomous revenue validation behind genuine merchant pilots",()=>expect(src).toContain("REAL-WORLD PILOT VALIDATION REQUIRED"));
 it("keeps provider monetization behind explicit legal tax and disclosure activation",()=>expect(src).toContain("P15 PROVIDER MONETIZATION LEGAL/TAX ACTIVATION GATE"));
 it("separates technical CI integrity from retained production activation gates",()=>{
  expect(src).toContain("blockingManualRequirements");
  expect(src).toContain("productionSealEligible: manualRequirements.length === 0");
  expect(check).toContain("blockingManualRequirements.length > 0");
  expect(check).toContain("productionSealEligible");
  expect(check).toContain("retained production/runtime activation gate");
 });
});
