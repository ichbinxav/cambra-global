import { describe,it,expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src=readFileSync(join(process.cwd(),"scripts/generate-release-manifest.mjs"),"utf8");
const check=readFileSync(join(process.cwd(),"scripts/check-release-manifest.mjs"),"utf8");
const markets=JSON.parse(readFileSync(join(process.cwd(),"config/europe-markets.json"),"utf8"));
const orchestration=JSON.parse(readFileSync(join(process.cwd(),"config/intelligence/orchestration-p0-remediation.v2.json"),"utf8"));
const rootSeals=JSON.parse(readFileSync(join(process.cwd(),"config/intelligence/root-seals.v2.json"),"utf8"));
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
  expect(src).toContain("const productionSealEligible = realWorldValidatedEligible");
  expect(src).toContain("productionSealEligible,");
  expect(check).toContain("blockingManualRequirements.length > 0");
  expect(check).toContain("productionSealEligible");
  expect(check).toContain("productionSealEligible is inconsistent with real-world validation requirements");
 expect(check).toContain("retained pilot production proof");
  expect(src).not.toContain("Stripe LIVE account credentials and account health were verified");
  expect(src).not.toContain("Required production schedulers, duplicate-execution guards, cost budgets, anomaly kill switch, global emergency stop and safe resume have recorded runtime evidence");
  expect(src).toContain("IMMUTABLE RUNTIME IDENTITY + SLO PROOF REQUIRED");
  expect(src).toContain("CAMBRA INTELLIGENCE SEALS NOT YET ISSUED");
 });
 it("keeps a live merchant golden path out of pilot blockers but in real-world validation",()=>{
  expect(src).toContain("This blocks REAL_WORLD_VALIDATED, not PILOT_READY");
  expect(src).toContain("realWorldValidatedEligible");
 });
 it("hash-binds the exact founder 30/33 market decision",()=>{
  expect(markets.launchScope).toMatchObject({
   decisionStatus:"FOUNDER_DECIDED",
   canonical_market_count:33,
   active_launch_count:30,
   protected_market_count:3,
   protectedMode:"RESEARCH_ONLY",
   outboundMode:"PAUSED_ZERO",
   regulatedCapabilitiesMode:"SPECIFIC_POLICY_REQUIRED",
  });
  expect(markets.launchScope.active).toContain("ES");
  expect(new Set(markets.launchScope.protected)).toEqual(new Set(["FR","BE","NL"]));
  expect(src).toContain("const marketLaunchScope = {");
  expect(src).toContain("FOUNDER 30/33 MARKET SCOPE SOURCE-BOUND:");
  expect(src).toContain("marketLaunchScope,");
  expect(check).toContain("checkMarketLaunchScopeBoundary");
  expect(check).toContain("protected markets must remain exactly FR, BE and NL");
 });
 it("hash-binds 20 open ROOT-OTR and eight unissued root seals",()=>{
  expect(orchestration.items).toHaveLength(20);
  expect(orchestration.items.every((row)=>row.binary_closure_status==="NOT_MET")).toBe(true);
  expect(rootSeals.seals).toHaveLength(8);
  expect(rootSeals.seals.every((row)=>row.status==="NOT_SEALED")).toBe(true);
  expect(src).toContain("const intelligenceClosure = {");
  expect(src).toContain("intelligenceClosure,");
  expect(check).toContain("checkIntelligenceClosureBoundary");
  expect(check).toContain("all 20 ROOT-OTR entries must remain NOT_MET");
  expect(check).toContain("all eight canonical root seals must remain NOT_SEALED");
 });
 it("binds the exact founder corpus without promoting research to production truth",()=>{
  expect(src).toContain("FOUNDER RESEARCH CORPUS REPOSITORY INTAKE COMPLETE:");
  expect(src).toContain("RESEARCH EXTERNAL REVERIFICATION REQUIRED:");
  expect(src).toContain("R9 / COUNTRY ECONOMICS PACKAGE REQUIRED:");
  expect(src).toContain("physical_files: 11");
  expect(src).toContain("unique_sha256: 9");
  expect(src).toContain("exact_duplicates: 2");
  expect(src).toContain('trustLevel: "UNVERIFIED_EXTERNAL_RESEARCH"');
  expect(src).toContain('externalSourceReverification: "NOT_RUN"');
  expect(src).toContain('productionSealEligible: false');
  expect(check).toContain("checkResearchCorpusBoundary");
  expect(check).toContain("productionSealEligible must remain false while the research reverification and R9 blockers are open");
 });
});
