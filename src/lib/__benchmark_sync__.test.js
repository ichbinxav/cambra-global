// ─── Financial benchmark sync enforcement ─────────────────────────────────
//
// The savings benchmarks (payment rates, shipping per-unit, SaaS %) live in
// FOUR files that must stay in lockstep:
//
//   1. src/lib/scoreEngine.js                             ← SOURCE OF TRUTH
//   2. base44/shared/spendIntelligenceRuntime.ts           ← B2 mirror (Deno)
//   3. base44/functions/recommendationEngineAgent/entry.ts ← mirror (Deno)
//   4. base44/functions/getBenchmarkForReport/entry.ts    ← mirror (Deno)
//
// Deno files cannot import from src/lib (verified — sandbox restriction), so
// the values are duplicated by necessity. If a value diverges in even one
// mirror, two parts of the system compute DIFFERENT savings for the same
// brand — and nothing surfaces the drift. For a product whose entire promise
// is "how much you save", that is the most expensive silent bug possible.
//
// This test extracts the benchmark values from all four files by parsing
// text (no Deno imports needed) and asserts every mirror equals the source
// of truth. If the assertion fails, the error message names the exact
// (vertical, tier, region, mirror) pair that drifted.
//
// Same enforcement strategy as src/lib/syncEngine/__sync_check__.test.js.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const FILES = {
  scoreEngine:  path.join(REPO_ROOT, "src/lib/scoreEngine.js"),
  spendIntel:   path.join(REPO_ROOT, "base44/shared/spendIntelligenceRuntime.ts"),
  recEngine:    path.join(REPO_ROOT, "base44/functions/recommendationEngineAgent/entry.ts"),
  gbfr:         path.join(REPO_ROOT, "base44/functions/getBenchmarkForReport/entry.ts"),
};

// ─── Extractors (one per file — each file has its own literal shape) ──────
//
// Each extractor returns a canonical object:
//   { payments: {micro:{eu, nonEu}, small:{...}, mid:{...}, large:{...}},
//     shipping: {micro:{eu, nonEu}, ...},
//     saas:     {micro, small, mid, large}   // saas is region-agnostic }
//
// Numbers are parseFloat'd. Missing values throw — an extractor that returns
// null for a required field means the mirror's shape changed and the test
// author needs to update the parser (which is the point: any structural
// change is caught here, not in production).

const TIERS = ["micro", "small", "mid", "large"];

function extractScoreEngine(content) {
  // Shape: `micro: { rate: eu ? 2.4 : 2.9, range: ... },`
  const parseRateLine = (tier, kind) => {
    const re = new RegExp(`${tier}:\\s*\\{\\s*${kind}:\\s*eu\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)`);
    const m = content.match(re);
    if (!m) throw new Error(`scoreEngine: could not extract ${tier}.${kind}`);
    return { eu: parseFloat(m[1]), nonEu: parseFloat(m[2]) };
  };
  const parseSaasLine = (tier) => {
    // Shape: `micro: { pct: 0.060, range: [...] },`
    const re = new RegExp(`${tier}:\\s*\\{\\s*pct:\\s*([\\d.]+)`);
    const m = content.match(re);
    if (!m) throw new Error(`scoreEngine: could not extract saas.${tier}.pct`);
    return parseFloat(m[1]);
  };
  // Isolate the paymentBenchmarks / shippingBenchmarks / saasBenchmarks blocks
  // to avoid picking up unrelated matches (tpe, banking, telecom also use `rate`).
  const paymentsBlock = content.match(/const paymentBenchmarks\s*=\s*\{[\s\S]*?\};/)?.[0] ?? "";
  const shippingBlock = content.match(/const shippingBenchmarks\s*=\s*\{[\s\S]*?\};/)?.[0] ?? "";
  const saasBlock     = content.match(/const saasBenchmarks\s*=\s*\{[\s\S]*?\};/)?.[0] ?? "";
  const out = { payments: {}, shipping: {}, saas: {} };
  for (const t of TIERS) {
    out.payments[t] = parseRateLine(t, "rate");
    out.shipping[t] = parseRateLine.call(null, t, "perUnit");
    // For shipping we need to run against shippingBlock — re-do explicitly:
    const shipRe = new RegExp(`${t}:\\s*\\{\\s*perUnit:\\s*eu\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)`);
    const shipMatch = shippingBlock.match(shipRe);
    if (!shipMatch) throw new Error(`scoreEngine: could not extract shipping.${t}`);
    out.shipping[t] = { eu: parseFloat(shipMatch[1]), nonEu: parseFloat(shipMatch[2]) };
    // Payments: extract from paymentsBlock to be safe from tpeBenchmarks.
    const payRe = new RegExp(`${t}:\\s*\\{\\s*rate:\\s*eu\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)`);
    const payMatch = paymentsBlock.match(payRe);
    if (!payMatch) throw new Error(`scoreEngine: could not extract payments.${t}`);
    out.payments[t] = { eu: parseFloat(payMatch[1]), nonEu: parseFloat(payMatch[2]) };
    // SaaS
    const saasRe = new RegExp(`${t}:\\s*\\{\\s*pct:\\s*([\\d.]+)`);
    const saasMatch = saasBlock.match(saasRe);
    if (!saasMatch) throw new Error(`scoreEngine: could not extract saas.${t}`);
    out.saas[t] = parseFloat(saasMatch[1]);
  }
  return out;
}

function extractSpendIntel(content) {
  // Shape (inline objects inside getBenchmarks):
  //   micro: { rate: eu ? 2.4 : 2.9 },
  //   micro: { perUnit: eu ? 5.80 : 7.20 },
  //   micro: { pct: 0.060 },
  //
  // Same shape as scoreEngine — reuse the extractor but on the whole file
  // (spendIntel has only one payment/shipping/saas block).
  const out = { payments: {}, shipping: {}, saas: {} };
  for (const t of TIERS) {
    const payRe = new RegExp(`${t}:\\s*\\{\\s*rate:\\s*eu\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)`);
    const payMatch = content.match(payRe);
    if (!payMatch) throw new Error(`spendIntel: could not extract payments.${t}`);
    out.payments[t] = { eu: parseFloat(payMatch[1]), nonEu: parseFloat(payMatch[2]) };

    const shipRe = new RegExp(`${t}:\\s*\\{\\s*perUnit:\\s*eu\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)`);
    const shipMatch = content.match(shipRe);
    if (!shipMatch) throw new Error(`spendIntel: could not extract shipping.${t}`);
    out.shipping[t] = { eu: parseFloat(shipMatch[1]), nonEu: parseFloat(shipMatch[2]) };

    const saasRe = new RegExp(`${t}:\\s*\\{\\s*pct:\\s*([\\d.]+)\\s*\\}`);
    const saasMatch = content.match(saasRe);
    if (!saasMatch) throw new Error(`spendIntel: could not extract saas.${t}`);
    out.saas[t] = parseFloat(saasMatch[1]);
  }
  return out;
}

function extractRecEngine(content) {
  // Shape (compact one-liner):
  //   payment:  ({ micro:{rate: eu?2.4:2.9}, small:{rate: eu?2.2:2.6}, ... })[tier],
  //   shipping: ({ micro:{perUnit: eu?5.80:7.20}, ... })[tier],
  //   saas:     ({ micro:{pct:0.060}, ... })[tier],
  const out = { payments: {}, shipping: {}, saas: {} };
  for (const t of TIERS) {
    // Payments — note `rate:` in recEngine has NO space after colon and no spaces around `?`
    const payRe = new RegExp(`${t}:\\s*\\{\\s*rate:\\s*eu\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)\\s*\\}`);
    const payMatch = content.match(payRe);
    if (!payMatch) throw new Error(`recEngine: could not extract payments.${t}`);
    out.payments[t] = { eu: parseFloat(payMatch[1]), nonEu: parseFloat(payMatch[2]) };

    const shipRe = new RegExp(`${t}:\\s*\\{\\s*perUnit:\\s*eu\\s*\\?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)\\s*\\}`);
    const shipMatch = content.match(shipRe);
    if (!shipMatch) throw new Error(`recEngine: could not extract shipping.${t}`);
    out.shipping[t] = { eu: parseFloat(shipMatch[1]), nonEu: parseFloat(shipMatch[2]) };

    const saasRe = new RegExp(`${t}:\\s*\\{\\s*pct:\\s*([\\d.]+)\\s*\\}`);
    const saasMatch = content.match(saasRe);
    if (!saasMatch) throw new Error(`recEngine: could not extract saas.${t}`);
    out.saas[t] = parseFloat(saasMatch[1]);
  }
  return out;
}

function extractGbfr(content) {
  // Shape:
  //   payments: {
  //     micro: { eu: 2.4, nonEu: 2.9 },
  //     ...
  //   },
  //   shipping: { micro: { eu: 5.80, nonEu: 7.20 }, ... },
  //   saas: { micro: 0.060, small: 0.040, ... }  (region-agnostic)
  const out = { payments: {}, shipping: {}, saas: {} };
  for (const t of TIERS) {
    const payRe = new RegExp(`${t}:\\s*\\{\\s*eu:\\s*([\\d.]+),\\s*nonEu:\\s*([\\d.]+)\\s*\\}`);
    const matches = [...content.matchAll(new RegExp(payRe.source, "g"))];
    // First match under payments block = payments; second under shipping = shipping.
    // Guard: the file has exactly 2 blocks with this exact shape (payments, shipping).
    if (matches.length < 2) throw new Error(`gbfr: expected 2 EU/nonEu blocks for ${t}, found ${matches.length}`);
    out.payments[t] = { eu: parseFloat(matches[0][1]), nonEu: parseFloat(matches[0][2]) };
    out.shipping[t] = { eu: parseFloat(matches[1][1]), nonEu: parseFloat(matches[1][2]) };

    // SaaS in gbfr is a bare number: `micro: 0.060,`
    const saasRe = new RegExp(`${t}:\\s*([\\d.]+)\\s*,`);
    // Isolate to the saas block to avoid false matches.
    const saasBlock = content.match(/saas:\s*\{[\s\S]*?\}/)?.[0] ?? "";
    const saasMatch = saasBlock.match(saasRe);
    if (!saasMatch) throw new Error(`gbfr: could not extract saas.${t}`);
    out.saas[t] = parseFloat(saasMatch[1]);
  }
  return out;
}

// ─── Test ─────────────────────────────────────────────────────────────────

describe("financial benchmark sync (scoreEngine.js is source of truth)", () => {
  const contents = {};
  for (const [k, p] of Object.entries(FILES)) {
    contents[k] = fs.readFileSync(p, "utf8");
  }

  const extracted = {
    scoreEngine: extractScoreEngine(contents.scoreEngine),
    spendIntel:  extractSpendIntel(contents.spendIntel),
    recEngine:   extractRecEngine(contents.recEngine),
    gbfr:        extractGbfr(contents.gbfr),
  };

  const source = extracted.scoreEngine;
  const mirrors = { spendIntel: extracted.spendIntel, recEngine: extracted.recEngine, gbfr: extracted.gbfr };

  it("extracts non-empty benchmarks from all four files (sanity)", () => {
    // If a mirror ever loses its benchmark block entirely, the extractor throws
    // above — but a defensive sanity check catches accidental empty blocks too.
    for (const [name, data] of Object.entries(extracted)) {
      for (const t of TIERS) {
        expect(data.payments[t].eu, `${name}.payments.${t}.eu missing`).toBeGreaterThan(0);
        expect(data.payments[t].nonEu, `${name}.payments.${t}.nonEu missing`).toBeGreaterThan(0);
        expect(data.shipping[t].eu, `${name}.shipping.${t}.eu missing`).toBeGreaterThan(0);
        expect(data.shipping[t].nonEu, `${name}.shipping.${t}.nonEu missing`).toBeGreaterThan(0);
        expect(data.saas[t], `${name}.saas.${t} missing`).toBeGreaterThan(0);
      }
    }
  });

  for (const [mirrorName, mirror] of Object.entries(mirrors)) {
    describe(`${mirrorName} vs scoreEngine (source of truth)`, () => {
      for (const t of TIERS) {
        it(`payments.${t}`, () => {
          expect(mirror.payments[t].eu,    `${mirrorName}: payments.${t}.eu diverges from scoreEngine`).toBe(source.payments[t].eu);
          expect(mirror.payments[t].nonEu, `${mirrorName}: payments.${t}.nonEu diverges from scoreEngine`).toBe(source.payments[t].nonEu);
        });
        it(`shipping.${t}`, () => {
          expect(mirror.shipping[t].eu,    `${mirrorName}: shipping.${t}.eu diverges from scoreEngine`).toBe(source.shipping[t].eu);
          expect(mirror.shipping[t].nonEu, `${mirrorName}: shipping.${t}.nonEu diverges from scoreEngine`).toBe(source.shipping[t].nonEu);
        });
        it(`saas.${t}`, () => {
          expect(mirror.saas[t], `${mirrorName}: saas.${t} diverges from scoreEngine`).toBe(source.saas[t]);
        });
      }
    });
  }
});
