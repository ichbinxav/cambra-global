// AUDIT SEC-01 (2026-08-17) — an unauthenticated caller must not reach a hosted route's
// service-role authority.
//
// guardedScheduledServe is, by contract, `if (invocationKind(req) !== 'SCHEDULED') return
// handler(req)` — a non-scheduled request goes straight through, unauthenticated, because each
// hosted route is expected to gate itself. The command_run_sweep branch added in COMMAND-C7 did
// not, so an unauthenticated POST advanced up to five founder CommandRuns per call and spent
// CAMBRA's model keys through routeToolCall.
//
// R4: these drive the real gate and the real scheduler contract. The one text assertion is a
// STRUCTURAL claim about ordering inside a 200-column line, which cannot be driven — and it reads
// the gate's own verdict rather than grepping for a string.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const runGate = () => {
  try {
    return { ok: true, out: execFileSync("node", ["scripts/check-hosted-route-gates.mjs"], { encoding: "utf8" }) };
  } catch (error) {
    return { ok: false, out: `${error.stdout || ""}${error.stderr || ""}` };
  }
};

describe("SEC-01 — the gate that keeps an unauthenticated caller out of a hosted route", () => {
  it("passes on the current tree", () => {
    const result = runGate();
    expect(result.ok, result.out).toBe(true);
    expect(result.out).toContain("every branch that takes service-role authority gates itself first");
  });

  it("counts real host functions and real branches, so the pass is not vacuous", () => {
    const match = runGate().out.match(/(\d+) host function\(s\), (\d+) hosted route branch\(es\)/);
    expect(match).toBeTruthy();
    expect(Number(match[1])).toBeGreaterThan(10);
    // A pass over zero branches would mean nothing.
    expect(Number(match[2])).toBeGreaterThanOrEqual(4);
  });

  it("fails when the gate call is removed from the branch it protects", () => {
    // Drives the detector rather than trusting it. Restores the file whatever happens.
    const file = "base44/functions/maintenanceEngine/entry.ts";
    const original = fs.readFileSync(file, "utf8");
    const gateCall = original.match(/\n\s*const sweepGate=await requireAdminOrInternal\([^\n]*\n[^\n]*\n/);
    expect(gateCall, "the gate call must be present to remove").toBeTruthy();
    try {
      fs.writeFileSync(file, original.replace(gateCall[0], "\n"));
      const result = runGate();
      expect(result.ok).toBe(false);
      expect(result.out).toContain("command_run_sweep");
      expect(result.out).toContain("NO gate in its branch");
    } finally {
      fs.writeFileSync(file, original);
    }
    // And the tree is back as it was.
    expect(fs.readFileSync(file, "utf8")).toBe(original);
  });
});

describe("SEC-01 — the premise the gate rests on", () => {
  it("confirms guardedScheduledServe still passes non-scheduled requests through unauthenticated", () => {
    const scheduler = fs.readFileSync("base44/shared/schedulerRun.ts", "utf8");
    // If this ever changes, the gate is protecting something that no longer needs it and must be
    // re-derived rather than left claiming a protection it does not provide.
    expect(scheduler).toMatch(/invocationKind\(req\)\s*!==\s*'SCHEDULED'\)\s*return\s+handler\(req\)/);
  });

  it("gates the sweep branch before it takes service-role authority", () => {
    const source = fs.readFileSync("base44/functions/maintenanceEngine/entry.ts", "utf8");
    // Measured on code, not on the file: the explanatory comment above the fix mentions
    // asServiceRole, and measuring raw text made the gate fail on its own fix.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      .split("\n").map((line) => line.replace(/(^|[^:'"\\])\/\/.*$/, "$1")).join("\n");
    const branch = code.slice(code.indexOf("host_action==='command_run_sweep'"));
    const region = branch.slice(0, branch.indexOf("host_action==='cost_governance'"));
    expect(region.indexOf("requireAdminOrInternal")).toBeGreaterThan(-1);
    expect(region.indexOf("requireAdminOrInternal")).toBeLessThan(region.indexOf("asServiceRole"));
  });

  it("keeps the three sibling routes delegating to handlers that gate themselves", () => {
    for (const file of [
      "base44/shared/logical/costGovernanceWorker.ts",
      "base44/shared/logical/productionReadinessWorker.ts",
    ]) {
      expect(fs.readFileSync(file, "utf8"), file).toContain("requireAdminOrInternal");
    }
  });
});
