// referralProgram.sync.test.js — REFERRAL-2 (2026-08-03).
//
// The fee ladder exists twice by necessity (Deno cannot import from src/):
//   src/lib/referralProgram.js        ← SOURCE OF TRUTH (drives the UI)
//   base44/shared/referralProgram.ts  ← mirror (drives BillingRule / invoices)
//
// If they drift, /Referrals shows one percentage and the invoice charges
// another — the single most expensive silent bug this feature can produce.
// This test compares the text between the SYNC markers, so ANY change to the
// arithmetic must be made in both files. Same strategy as
// src/lib/__benchmark_sync__.test.js.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");

const SOURCE = path.join(REPO_ROOT, "src/lib/referralProgram.js");
const MIRROR = path.join(REPO_ROOT, "base44/shared/referralProgram.ts");

const START = "// SYNC-START referral-fee-ladder";
const END = "// SYNC-END referral-fee-ladder";

function extractBlock(file) {
  const content = fs.readFileSync(file, "utf8");
  const from = content.indexOf(START);
  const to = content.indexOf(END);
  if (from === -1 || to === -1) {
    throw new Error(`${file}: SYNC markers missing — the mirror check cannot run`);
  }
  return content
    .slice(from + START.length, to)
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

describe("referral fee ladder sync (src/lib is source of truth)", () => {
  const source = extractBlock(SOURCE);
  const mirror = extractBlock(MIRROR);

  it("extracts a non-trivial block from both files (sanity)", () => {
    expect(source).toContain("FLOOR_FEE_PCT");
    expect(source).toContain("feeForActivated");
    expect(source.split("\n").length).toBeGreaterThan(5);
  });

  it("Deno mirror matches the source of truth verbatim", () => {
    expect(
      mirror,
      "base44/shared/referralProgram.ts diverged from src/lib/referralProgram.js. " +
        "The UI and the invoice would disagree on the fee — copy the SYNC block verbatim."
    ).toBe(source);
  });
});