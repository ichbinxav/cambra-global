// AUDIT-TOTAL (2026-08-17) — the sweep instrument itself.
//
// R4: these drive the sweep over fixtures with a KNOWN answer rather than asserting on its
// source. An audit instrument nobody has tested is a source of confident wrong findings, and this
// one has already produced three false positives worth documenting.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Run ONCE. The sweep walks ~1300 files; calling it per test blew the 5s per-test budget and the
// failures read as sweep failures rather than as a harness problem.
const SWEEP_OUTPUT = execFileSync("node", ["scripts/audit-sweep.mjs"], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});
const run = () => SWEEP_OUTPUT;

describe("AUDIT — the sweep runs and reports every pattern", () => {
  const output = run();

  it("reports all seven patterns with a count", () => {
    for (const key of ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]) {
      expect(output, key).toMatch(new RegExp(`${key} — .+: \\d+`));
    }
  });

  it("counts real source files and real test files separately", () => {
    // The first run reported "0 test files" because the skip pattern excluded them from both
    // walks. A sweep that silently scans nothing is worse than no sweep.
    const match = output.match(/audit-sweep — (\d+) source files, (\d+) test files/);
    expect(match).toBeTruthy();
    expect(Number(match[1])).toBeGreaterThan(500);
    expect(Number(match[2])).toBeGreaterThan(100);
  });

  it("states that its findings are candidates, not verdicts", () => {
    expect(output).toContain("CANDIDATES");
  });

  it("exits zero, because a heuristic that fails the build gets deleted", () => {
    // execFileSync throws on a non-zero exit, so the fact that SWEEP_OUTPUT exists is the proof.
    expect(SWEEP_OUTPUT.length).toBeGreaterThan(0);
  });
});

describe("AUDIT — every declared spend category maps to an emergency capability", () => {
  it("reports zero unmapped categories", () => {
    const output = run();
    const match = output.match(/P7 — spend category with no emergency capability mapping: (\d+)/);
    expect(match).toBeTruthy();
    // The `ai` gap was an instance of a class. The class is empty, and that is the finding.
    expect(Number(match[1])).toBe(0);
  });

  it("has real categories and real pause flags, so the zero is not vacuous", () => {
    // THE FIRST VERSION OF THIS CHECK WAS VACUOUS and this assertion is why it was caught: it
    // read EmergencyControl's enums, which hold two values, instead of the spend categories and
    // the boolean pause flags that are the actual mechanism.
    const cost = JSON.parse(fs.readFileSync("base44/entities/CostUsageEvent.jsonc", "utf8"));
    const categories = cost.properties.category.enum;
    expect(categories.length).toBeGreaterThanOrEqual(4);
    expect(categories).toContain("ai");

    const emergency = JSON.parse(fs.readFileSync("base44/entities/EmergencyControl.jsonc", "utf8"));
    const pauseFlags = Object.keys(emergency.properties).filter((key) => /_paused$|^safe_mode$/.test(key));
    expect(pauseFlags.length).toBeGreaterThanOrEqual(5);
  });

  it("proves each category is mapped by reading the mapping, not the entity", () => {
    const governance = fs.readFileSync("base44/shared/costGovernance.ts", "utf8");
    const region = governance.slice(governance.indexOf("EmergencyControl capabilities"));
    for (const category of ["ai", "api", "enrichment", "email"]) {
      expect(new RegExp(`category === ["']${category}["']`).test(region), category).toBe(true);
    }
  });
});

describe("AUDIT — the six disconnected modules stay documented until they are wired or deleted", () => {
  const DEAD = [
    "campaignMetrics", "campaignsIntegration", "conversationFollowUp",
    "evidenceReviewCore", "commandLegacyChatMigration", "senderHealthAndSuppressions",
  ];

  it("names every one of them in the audit decision log", () => {
    const log = fs.readFileSync("src/docs/Decision_Log_AUDIT_H_CONSISTENCY.md", "utf8");
    for (const name of DEAD) expect(log, name).toContain(name);
  });

  it("records that a wired module is a scope decision, not a bug fix", () => {
    const log = fs.readFileSync("src/docs/Decision_Log_AUDIT_H_CONSISTENCY.md", "utf8");
    expect(log).toContain("scope decision");
    expect(log).toContain("either wire it or delete it");
  });

  it("confirms each one still has no production importer", () => {
    // Drives the real question rather than trusting the log: if someone wires one, this fails and
    // the log has to be corrected — which is the point.
    const roots = ["base44/shared", "base44/functions", "src"];
    const walk = (dir, out = []) => {
      if (!fs.existsSync(dir)) return out;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (/node_modules|\.deploy|generated|\.test\./.test(full)) continue;
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(ts|jsx?|tsx)$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    const files = roots.flatMap((root) => walk(root));
    const stillDead = [];
    for (const name of DEAD) {
      const importers = files.filter((file) => !file.endsWith(`${name}.ts`)
        && new RegExp(`from ['"][^'"]*${name}['"]`).test(fs.readFileSync(file, "utf8")));
      if (importers.length === 0) stillDead.push(name);
    }
    expect(stillDead.sort()).toEqual([...DEAD].sort());
  });
});

describe("AUDIT — the false positives are documented so the list is not read as a verdict", () => {
  const log = fs.readFileSync("src/docs/Decision_Log_AUDIT_H_CONSISTENCY.md", "utf8");

  it("names the three modules the P6 detector wrongly flagged", () => {
    for (const name of ["p3SeedData", "commandCitationGuard", "maintenanceCore"]) {
      expect(log, name).toContain(name);
    }
  });

  it("records that recoverBillingMath is exact integer math despite being flagged", () => {
    expect(log).toContain("recoverBillingMath");
    expect(log).toContain("over-flagged");
  });

  it("proves the claim about recoverBillingMath by driving it", async () => {
    const { eurToMinor, feeNetMinor, taxMinor } = await import("../../base44/shared/recoverBillingMath.ts");
    // The IEEE-754 case the module's own comment names: 19.995 * 100 = 1999.4999… in floats.
    expect(eurToMinor(19.995)).toBe(2000);
    // Fee and tax are integer cents, and tax is computed on the ALREADY-ROUNDED fee.
    const fee = feeNetMinor(400000, 25);
    expect(fee).toBe(100000);
    expect(Number.isInteger(fee)).toBe(true);
    const tax = taxMinor(fee, 2000);
    expect(tax).toBe(20000);
    expect(Number.isInteger(tax)).toBe(true);
    // No float dust anywhere in the chain.
    expect(Number.isInteger(eurToMinor(0.07) * 3)).toBe(true);
  });
});
