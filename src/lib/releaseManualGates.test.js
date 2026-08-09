import { describe,it,expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src=readFileSync(join(process.cwd(),"scripts/generate-release-manifest.mjs"),"utf8");
describe("release manual gates",()=>{
 it("blocks launch seal while Recover V2 legal approval is false",()=>expect(src).toContain("LEGAL REVIEW REQUIRED: Recover Economics V2"));
 it("blocks full production seal until Stripe live verification is explicit",()=>{
  expect(src).toContain('integrationStatus?.stripe !== "live_verified"');
  expect(src).toContain("PRODUCTION VALIDATION REQUIRED: Stripe live integration status");
 });
});
