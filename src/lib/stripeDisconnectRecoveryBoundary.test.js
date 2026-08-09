import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src=readFileSync(join(process.cwd(),"base44/functions/stripeConnectionDisconnect/entry.ts"),"utf8");
describe("Stripe disconnect → active Recover verification boundary",()=>{
  it("defines service role and timestamp before all disconnect/recovery writes",()=>{
    const svc=src.indexOf("const svc = base44.asServiceRole");
    const now=src.indexOf("const now = new Date().toISOString()");
    const recovery=src.indexOf("economic_right_status: 'active'");
    expect(svc).toBeGreaterThan(-1); expect(now).toBeGreaterThan(svc); expect(recovery).toBeGreaterThan(now);
  });
  it("marks active Recover verification missing and never estimates billing",()=>{
    expect(src).toContain("verification_access_status: 'missing'");
    expect(src).toContain("verification_required_no_estimated_billing");
  });
  it("does not leak runtime error details",()=>{
    expect(src).toContain("stripe_disconnect_failed");
    expect(src).not.toContain("error: error.message");
  });
});
