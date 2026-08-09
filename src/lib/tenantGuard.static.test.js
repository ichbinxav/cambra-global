// tenantGuard.static.test.js — TRUTH-1 Fase 5 (2026-07-24).
//
// WHY THIS TEST EXISTS (KNOWN_DEBT BUG-6):
//   The `created_by == {{user.email}}` RLS rule is INERT on the 10 tenant
//   entities whose writes go through service role — service-role writes set a
//   created_by that no app user ever matches, so the rule fails CLOSED (nobody
//   reads directly — no exposure today). The consequence: tenant isolation for
//   these entities depends 100% on each backend function doing its own
//   check (auth gate + explicit created_by / brand ownership / org scoping).
//   A future function can forget that check and NOTHING warns — until now.
//
// WHAT IT DOES:
//   Scans every base44/functions/*/entry.ts. If a function touches a TENANT
//   entity via `asServiceRole.entities.X`, it must show evidence of at least
//   one APPROVED MECHANISM (below) — or be listed in the ALLOWLIST with a
//   written justification. Otherwise the test FAILS and the build breaks.
//
// WHAT IT IS NOT:
//   A proof of correctness. It's a tripwire: it verifies the MECHANISM is
//   present in the file, not that it is applied to every code path. Deep
//   verification stays manual (Decision_Log_SECURITY2.md audited all 141
//   functions on 2026-07-24). The real fix — migrating these entities off
//   service-role writes so RLS becomes active — is a separate milestone.
//
// MAINTENANCE:
//   • New tenant entity → add to TENANT_ENTITIES.
//   • New guard helper → add to MECHANISMS with a description.
//   • Legitimately global function (seed, admin job, anonymous aggregate)
//     → allowlist entry WITH ITS REASON. Never allowlist to silence a real
//     hole — an unguarded function is a finding, not noise.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const FUNCTIONS_DIR = path.join(REPO_ROOT, "base44", "functions");

// ── Tenant/economic entities whose service-role access must never bypass a trust boundary.
// P10 expands the original BUG-6 perimeter beyond the ten 2026-07-24 entities
// so Recover, P9 and billing cannot silently fall outside this tripwire.
const TENANT_ENTITIES = [
  "Integration",
  "AnalyzerInput",
  "AnalyzerResult",
  "StatementImport",
  "ChatMessage",
  "AgentQuestion",
  "Approval",
  "Event",
  "AgentTask",
  "Brand",
  "DealActivation",
  "Mandate",
  "MigrationTask",
  "MonthlySavingsReport",
  "Invoice",
  "StripeConnection",
  "Baseline",
  "SavingsEvidence",
  "PaymentsAnalysisVerified",
];

// ── Approved isolation mechanisms ────────────────────────────────────────────
// A function passes if ANY of these patterns appears in its source. Each entry
// documents what the pattern proves. Ordered strongest → weakest.
const MECHANISMS = [
  {
    name: "internalGate (canonical trust gate — SECURITY-2)",
    // requireAdminOrInternal / requireAuthenticatedOrInternal imported from
    // base44/shared/internalGate.ts — deny-by-default admin/internal gating.
    pattern: /internalGate/,
  },
  {
    name: "internal secret gate (x-internal-secret header)",
    pattern: /INTERNAL_CALL_SECRET|x-internal-secret/i,
  },
  {
    name: "dedicated tenant guard helpers",
    pattern: /_tenantGuard|assertBrandOwnedByUser|authzScope|requireTenant/,
  },
  {
    name: "explicit admin role check",
    pattern: /\brole\b\s*[!=]==?\s*["']admin["']/,
  },
  {
    name: "authenticated-user gate (auth.me + 401)",
    // Weakest approved mechanism: proves the function refuses anonymous
    // callers and identifies the tenant. Per-row scoping (created_by /
    // brand ownership) must accompany it — verified manually in
    // Decision_Log_SECURITY2.md; this tripwire only proves the gate exists.
    test: (src) =>
      /await\s+base44\.auth\.me\(\)/.test(src) &&
      /(Unauthorized|status:\s*401)/.test(src),
  },
  {
    name: "API principal auth (hashed API key / OAuth bearer + org scoping)",
    // apiV1 / mcpServer: bearer-token principal resolution with per-request
    // organization scoping (see the tenant-isolation banner in apiV1).
    pattern: /access_token_hash|key_hash/,
  },
];

// ── Allowlist — functions that touch tenant entities with NO mechanism ──────
// Every entry MUST carry its reason. Empty today: the 2026-07-24 census found
// all 59 tenant-touching functions carry at least one approved mechanism.
// (Format: { fn: "functionName", reason: "…" })
const ALLOWLIST = [
  {
    fn: "stripeBillingWebhook",
    reason: "Public Stripe webhook: trust is established by Stripe signature verification before any service-role side effect; user auth is intentionally not applicable.",
  },
  {
    fn: "recoverBillingDigest",
    reason: "Read-only scheduler sentinel returns aggregate counts only and can send solely to a fixed server-configured admin recipient; no tenant data is returned or mutated.",
  },
];

function listFunctionDirs() {
  return fs
    .readdirSync(FUNCTIONS_DIR)
    .filter((d) => fs.existsSync(path.join(FUNCTIONS_DIR, d, "entry.ts")))
    .sort();
}

function usedTenantEntities(src) {
  return TENANT_ENTITIES.filter((e) =>
    new RegExp(`(?:asServiceRole|svc)\\.entities\\.${e}\\b`).test(src)
  );
}

function hasApprovedMechanism(src) {
  return MECHANISMS.find((m) =>
    m.pattern ? m.pattern.test(src) : m.test(src)
  );
}

describe("tenant isolation static tripwire (KNOWN_DEBT BUG-6)", () => {
  const dirs = listFunctionDirs();

  it("finds the backend functions directory (sanity)", () => {
    expect(dirs.length).toBeGreaterThan(50);
  });

  it("every function touching a tenant entity via service role carries an approved mechanism", () => {
    const violations = [];
    for (const dir of dirs) {
      const src = fs.readFileSync(
        path.join(FUNCTIONS_DIR, dir, "entry.ts"),
        "utf8"
      );
      const entities = usedTenantEntities(src);
      if (entities.length === 0) continue;
      if (ALLOWLIST.some((a) => a.fn === dir)) continue;
      if (!hasApprovedMechanism(src)) {
        violations.push(`${dir} → ${entities.join(", ")}`);
      }
    }
    expect(
      violations,
      `Functions using asServiceRole on tenant entities WITHOUT an approved ` +
        `isolation mechanism (auth gate / tenant guard / admin check / ` +
        `internal secret). Do NOT allowlist to silence — add the mechanism ` +
        `or justify the exception:\n  ${violations.join("\n  ")}`
    ).toEqual([]);
  });

  it("allowlist entries are real functions with a written reason (no stale/blank entries)", () => {
    for (const a of ALLOWLIST) {
      expect(dirs, `allowlisted "${a.fn}" no longer exists`).toContain(a.fn);
      expect(
        (a.reason || "").length,
        `allowlist entry "${a.fn}" has no reason`
      ).toBeGreaterThan(20);
    }
  });
});