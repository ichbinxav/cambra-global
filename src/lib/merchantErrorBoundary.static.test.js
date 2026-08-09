import { describe,it,expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const files=["getUploadCapability","stripeOAuthConnect","stripeConnectionDisconnect","getIntegrationStatus","getOnboardingStatus","getBrandSavings","downloadRecoverContract"];
describe("merchant-facing backend errors",()=>{
 for(const name of files) it(`${name} does not echo caught runtime messages`,()=>{
  const src=readFileSync(join(process.cwd(),`base44/functions/${name}/entry.ts`),"utf8");
  expect(src).not.toMatch(/error\s*:\s*\(?error as Error\)?\.message/);
  expect(src).not.toMatch(/error\s*:\s*error\.message/);
 });
});
