import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src=readFileSync(join(process.cwd(),"base44/functions/stripeConnectionDisconnect/entry.ts"),"utf8");
const lifecycle=readFileSync(join(process.cwd(),"base44/shared/stripeConnectedAccountLifecycle.ts"),"utf8");
const legacyTransition=lifecycle.slice(lifecycle.indexOf("export async function disconnectLegacyStripeConnectionOnly"));
describe("Stripe disconnect → active Recover verification boundary",()=>{
  it("defines service role and timestamp before all disconnect/recovery writes",()=>{
    const svc=src.indexOf("const svc = base44.asServiceRole");
    const now=legacyTransition.indexOf("const now = new Date().toISOString()");
    const recovery=legacyTransition.indexOf("economic_right_status: 'active'");
    expect(svc).toBeGreaterThan(-1);
    expect(src).toContain("disconnectLegacyStripeConnectionOnly(svc, {");
    expect(now).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(now);
  });
  it("marks active Recover verification missing and never estimates billing",()=>{
    expect(legacyTransition).toContain("verification_access_status: 'missing'");
    expect(legacyTransition).toContain("verification_required_no_estimated_billing");
    expect(legacyTransition).toContain("'stripe_legacy_only_recover_verification_missing'");
    expect(legacyTransition).toContain('await updateAndVerify(');
  });
  it("does not leak runtime error details",()=>{
    expect(src).toContain("stripe_disconnect_failed");
    expect(src).not.toContain("error: error.message");
  });
});
