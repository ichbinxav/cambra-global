// ─── Paginators dispatcher parity — semantic parity of the pagination style set
//
// WHY THIS TEST EXISTS
//
// __sync_check__.test.js now enforces the complete structural pair. This
// additional semantic guard makes the supported style set explicit.
//
// SEMANTIC CONTRACT
//
// The one thing that must stay in sync is the SET OF SUPPORTED PAGINATION
// STYLES. If a style exists in one copy but not the other, providers
// referencing it in REGISTRY entries would work in one path (frontend
// engine tests) and fail in the other (real Deno sync). This test locks
// that set by grepping both files for the style-slug literals.
//
// EXTRACTION STRATEGY (deliberately dumb — no eval, no import)
//
// Parse both `getPaginator` bodies for the string literals in
// `if (style === "X")` branches.
// Both extractions are pure string operations — no runtime evaluation, no
// dependency on either module actually loading. If either file's dispatcher
// gets rewritten (e.g. Deno adopts a lookup table), the extraction pattern
// changes and this test fails with a clear message pointing to the parser,
// not to a phantom drift.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..", "..");
const SRC_FILE = path.join(REPO_ROOT, "src/lib/syncEngine/paginators.js");
const DENO_FILE = path.join(REPO_ROOT, "base44/functions/dataSyncAgent/entry.ts");

function extractSrcStyles(srcContent) {
  const block = srcContent.match(/\/\/\s*SYNC-START:\s*paginators([\s\S]*?)\/\/\s*SYNC-END:\s*paginators/);
  if (!block) return { ok: false, reason: "src paginators SYNC block not found" };
  const styleRe = /style\s*===\s*"([a-z_][a-z0-9_]*)"/g;
  const styles = [];
  let m;
  while ((m = styleRe.exec(block[1])) !== null) styles.push(m[1]);
  return { ok: true, styles };
}

// Extract the style literals from Deno's `getPaginator` if-chain.
// Matches the function body then pulls every `style === "X"` string literal.
// Uses the SYNC-END marker to bound the search — the getPaginator function
// lives just before it in the current file layout, and this bound stays
// robust even if unrelated helpers are added elsewhere.
function extractDenoStyles(denoContent) {
  // Isolate the paginators SYNC block first.
  const block = denoContent.match(/\/\/\s*SYNC-START:\s*paginators([\s\S]*?)\/\/\s*SYNC-END:\s*paginators/);
  if (!block) return { ok: false, reason: "Deno paginators SYNC block not found" };
  const styleRe = /style\s*===\s*"([a-z_][a-z0-9_]*)"/g;
  const styles = [];
  let m;
  while ((m = styleRe.exec(block[1])) !== null) styles.push(m[1]);
  return { ok: true, styles };
}

describe("Paginators dispatcher parity — supported style set stays in sync", () => {
  it("both copies exist and are readable", () => {
    expect(fs.existsSync(SRC_FILE)).toBe(true);
    expect(fs.existsSync(DENO_FILE)).toBe(true);
  });

  it("supported style SET is identical in src and Deno", () => {
    const srcContent = fs.readFileSync(SRC_FILE, "utf8");
    const denoContent = fs.readFileSync(DENO_FILE, "utf8");

    const src = extractSrcStyles(srcContent);
    expect(src.ok, src.reason || "ok").toBe(true);
    const deno = extractDenoStyles(denoContent);
    expect(deno.ok, deno.reason || "ok").toBe(true);

    // Compare as sorted arrays; prefixes on function names are irrelevant.
    const srcSorted = [...src.styles].sort();
    const denoSorted = [...deno.styles].sort();
    expect(denoSorted).toEqual(srcSorted);
  });

  it("the set is non-empty (guards against a parser that silently matches nothing)", () => {
    // Defensive: if either regex above silently stops matching (e.g. the
    // dispatcher shape was rewritten in one copy), the test above passes
    // trivially with two empty arrays. This guard ensures a real set is
    // being compared.
    const srcContent = fs.readFileSync(SRC_FILE, "utf8");
    const src = extractSrcStyles(srcContent);
    expect(src.ok).toBe(true);
    expect(src.styles.length).toBeGreaterThan(0);
  });
});
