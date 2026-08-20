import { describe, expect, it, vi } from "vitest";
import { resolveFeePctForMonth } from "../../base44/shared/billingFee.ts";
import { consumeRateLimit } from "../../base44/shared/rateLimit.ts";
import { requireAdminOrInternal } from "../../base44/shared/internalGate.ts";
import { evaluateRegulatoryActivityRuntime } from "../../base44/shared/regulatoryRuntime.ts";
import { collectGoLiveRuntime } from "../../base44/shared/goLiveRuntime.ts";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

describe("critical shared execution dependencies fail closed", () => {
  it("keeps raw silent fallbacks out of the critical shared execution inventory", () => {
    const root = path.resolve(process.cwd(), "base44/shared");
    const names = [
      "costGovernance", "commercialSendSafety", "externalApprovalExecution",
      "communicationTenant", "marketPolicyRuntime", "legalExecutionRuntime",
      "goLiveRuntime", "internalGate", "instantlyRuntime", "regulatoryRuntime",
      "recoverAcceptance", "recoverEconomicMandate", "recoverContractState",
      "rateLimit", "operationalControl", "billingFee", "invokeInternal",
      "eclRecoverEvidence", "p4Bridge",
    ];
    for (const name of names) {
      const source = fs.readFileSync(path.join(root, `${name}.ts`), "utf8");
      expect(source, name).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*(?:null|\[\])/u);
    }
  });

  it("does not use fallback billing economics when BillingRule authority is unavailable", async () => {
    const svc = { entities:{ BillingRule:{ filter:vi.fn().mockRejectedValue(new Error("down")) } } };
    await expect(resolveFeePctForMonth(svc, { brand_id:"b", fallbackPct:20 }, "2026-08"))
      .rejects.toMatchObject({ code:"CRITICAL_EXECUTION_DEPENDENCY_UNAVAILABLE", operation:"billing_rule_authority_read" });
  });

  it("never invents live pricing when a caller omits frozen billing economics", async () => {
    const svc = { entities:{ BillingRule:{ filter:vi.fn().mockResolvedValue([]) } } };
    const resolved = await resolveFeePctForMonth(
      svc,
      { brand_id:"b" },
      "2026-08",
    );
    expect(Number.isNaN(resolved.pct)).toBe(true);
    expect(resolved.source).toBe("caller_supplied_fallback");
  });

  it("fails closed when an applicable BillingRule lacks a finite fee", async () => {
    const svc = { entities:{ BillingRule:{ filter:vi.fn().mockResolvedValue([
      { id:"rule-bad", effective_start_date:"2026-01-01", node_share_percent:null },
    ]) } } } };
    await expect(resolveFeePctForMonth(
      svc,
      { brand_id:"b", fallbackPct:20 },
      "2026-08",
    )).rejects.toMatchObject({
      code:"billing_rule_fee_unresolvable",
      rule_id:"rule-bad",
    });
  });

  it("does not authorize a rate-limit request when its counter store is unavailable", async () => {
    const svc = { entities:{ RateLimitCounter:{ filter:vi.fn().mockRejectedValue(new Error("down")) } } };
    await expect(consumeRateLimit(svc, { principal_id:"p", principal_type:"api_key", limit:10, window_seconds:60 }))
      .resolves.toMatchObject({ ok:false, reason:"rate_limit_store_unavailable" });
  });

  it("distinguishes authentication authority outage from anonymous denial", async () => {
    vi.stubGlobal("Deno", { env:{ get:vi.fn().mockReturnValue("") } });
    const gate = await requireAdminOrInternal(
      new Request("https://example.test"),
      { auth:{ me:vi.fn().mockRejectedValue(new Error("down")) } },
    );
    expect(gate.ok).toBe(false);
    expect(gate.response.status).toBe(503);
    await expect(gate.response.json()).resolves.toEqual({ error:"auth_authority_unavailable" });
  });

  it("does not treat missing regulatory rows as an empty policy set on read failure", async () => {
    const svc = { entities:{ RegulatoryPolicyVersion:{ filter:vi.fn().mockRejectedValue(new Error("down")) } } };
    await expect(evaluateRegulatoryActivityRuntime(svc, { jurisdiction:"FR", activity:"B2B_OUTREACH" }))
      .rejects.toMatchObject({ operation:"regulatory_policy_authority_read" });
  });

  it("surfaces a go-live evidence outage as a hard blocker", async () => {
    const rows = [];
    const entities = new Proxy({}, { get:(_target, name) => ({
      list: name === "RuntimeGateEvidence" ? vi.fn().mockRejectedValue(new Error("down")) : vi.fn().mockResolvedValue(rows),
      filter:vi.fn().mockResolvedValue(rows),
    }) });
    const svc = { entities };
    await expect(collectGoLiveRuntime(svc, {})).resolves.toMatchObject({
      allowed:false,
      classification:"NOT_GO_READY",
      blockers:expect.arrayContaining(["runtime_evidence_authority_unavailable"]),
    });
  });
});