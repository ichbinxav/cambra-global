// ─── Stripe normalizer parity — behavior-parity + freshness guard
//
// WHY THIS TEST EXISTS
//
// The `stripeNormalizer` pair in __sync_check__.test.js is skipped because
// the two copies (src/lib/normalizers/stripe.js vs the arrow function inside
// the `normalizers` object of base44/functions/dataSyncAgent/entry.ts) are
// structurally different:
//
//   • src: `KNOWN_TYPES`, `toNum`, `mapType` are TOP-LEVEL declarations of
//     the module; `normalizeStripeBalanceTransactions` is a named export
//     that closes over them.
//   • Deno: the same 3 helpers live INSIDE the arrow function assigned to
//     `stripe_transactions:` inside the giant `normalizers` object literal.
//
// Extracting the helpers to top-level in Deno collides with 22 sibling
// normalizers that each redeclare their OWN local `toNum`. Anidar the
// helpers in src would break testability of `mapType` / `KNOWN_TYPES` from
// unit tests. Both realignments are net-negative → the pair stays skipped.
//
// WHAT THIS TEST DOES INSTEAD
//
// Behavior-parity, not structure-parity. We keep a VERBATIM COPY of the
// Deno arrow function inline (between PARITY-COPY-START/END markers) and:
//
//   1. Run BOTH normalizers over the 7 fixture files that already lock the
//      src copy's behavior. Outputs must be deep-equal.
//   2. Run a FRESHNESS GUARD: extract the actual Deno SYNC block from
//      dataSyncAgent/entry.ts, normalize both blocks by line (trim + collapse
//      whitespace — indentation-tolerant, since the Deno block lives nested
//      inside the `normalizers` object), and assert they match. If they
//      don't, the copy is stale and needs to be regenerated.
//
// REGENERATING THE PARITY COPY
//
// When the Deno arrow function changes:
//   1. Open base44/functions/dataSyncAgent/entry.ts
//   2. Find the block between `// SYNC-START: stripeNormalizer` and
//      `// SYNC-END: stripeNormalizer`. That block reads:
//        stripe_transactions: (raw) => {
//          <body>
//        },
//   3. Copy ONLY the `<body>` verbatim into the PARITY-COPY block below —
//      NOT the outer `stripe_transactions: (raw) => {` wrapper line and NOT
//      the closing `},`. The markers PARITY-COPY-START/END delimit exactly
//      what the freshness guard compares — that is the CONTRACT.
//   4. Run the suite. Freshness guard confirms the regeneration.
//
// WHY THE MARKERS EXCLUDE THE WRAPPER (2026-07-10 fix)
//
// The parity copy needs a JS wrapper (`const denoParityCopy = { ... };`) to
// be executable-and-importable at test load time. The Deno source has its
// own wrapper (`stripe_transactions: (raw) => { ... },`) because it lives
// nested inside a giant `normalizers` object literal. Neither wrapper is
// part of the BEHAVIOR to compare — they're module scaffolding. Previously
// the markers wrapped the entire executable block, and the guard failed
// (correctly, in the safe direction) because it was comparing wrapper
// syntax that could not match by construction. Now the markers delimit the
// arrow BODY only (from `(raw) => {` down to the closing `}` of the arrow,
// exclusive), and the guard strips the equivalent wrapper from the Deno
// block before comparing. Markers = contract of what's compared.
//
// NO EVAL, NO DYNAMIC IMPORT. The inline copy is real code the test file
// imports at load time — brittle behaviors in dynamic extraction (indent
// drift, transformer surprises, timing of module evaluation) are avoided.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeStripeBalanceTransactions } from "./stripe.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..", "..");
const DENO_FILE = path.join(REPO_ROOT, "base44/functions/dataSyncAgent/entry.ts");

const loadFixture = (name) =>
  JSON.parse(readFileSync(path.join(THIS_DIR, "__fixtures__", "stripe", name), "utf8"));

// ─── PARITY-COPY: Deno stripe_transactions arrow BODY, verbatim ────────────
// Regenerate when the Deno block changes — see instructions above.
// Freshness guard test verifies this stays in sync with the Deno source.
// The markers delimit ONLY the arrow body (statements between `(raw) => {`
// and its closing `}`) — NOT the outer wrapper. See "WHY THE MARKERS EXCLUDE
// THE WRAPPER" note at the top of this file for rationale.
const denoNormalize = (raw) => {
  // PARITY-COPY-START: stripeNormalizer
  const KNOWN_TYPES = [
    "charge", "refund", "dispute", "payout", "transfer",
    "stripe_fee", "application_fee", "adjustment",
  ];
  const toNum = (v, fallback = 0) => {
    if (v === null || v === undefined || v === "") return fallback;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const mapType = (rawType) => {
    if (typeof rawType !== "string") return null;
    if (rawType === "application_fee_refund") return "application_fee";
    if (KNOWN_TYPES.includes(rawType)) return rawType;
    return null;
  };
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  const out = [];
  for (const tx of rows) {
    if (!tx || typeof tx !== "object") continue;
    const id = tx?.id;
    if (id === null || id === undefined || id === "") continue; // skip sin anchor
    const rawType = tx?.reporting_category ?? tx?.type ?? null;
    const type = mapType(rawType);
    const rawCurrency = tx?.currency;
    const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
      ? rawCurrency.toUpperCase()
      : "EUR";
    const createdSec = toNum(tx?.created, 0);
    const occurredAt = createdSec > 0 ? new Date(createdSec * 1000).toISOString() : null;
    out.push({
      vertical: "payments",
      external_id: String(id),
      amount: toNum(tx?.amount) / 100,
      fee: toNum(tx?.fee) / 100,
      net: toNum(tx?.net) / 100,
      currency,
      occurred_at: occurredAt,
      type,
    });
  }
  return out;
  // PARITY-COPY-END: stripeNormalizer
};

// Line-level normalizer for the freshness guard. Both copies are structurally
// identical modulo:
//   • outer indentation (the Deno block lives nested inside a giant object,
//     the parity copy lives inside our own smaller object). We reduce every
//     line to `trim()` before comparing.
//   • blank lines and pure-comment lines (we already have the copy verbatim
//     including inline comments, but the outer file may have edits that add
//     comments around it — comments are pruned).
// If the STATEMENTS of the two arrow function bodies diverge, the compare
// fails loudly. Cosmetic reindent alone will not cause a false positive.
function normalizeBlockForFreshness(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .join("\n");
}

function extractSyncBlock(fileContent, key) {
  const re = new RegExp(`//\\s*SYNC-START:\\s*${key}\\b([\\s\\S]*?)//\\s*SYNC-END:\\s*${key}\\b`);
  const m = fileContent.match(re);
  return m ? m[1] : null;
}

function extractParityCopyBlock(fileContent, key) {
  const re = new RegExp(`//\\s*PARITY-COPY-START:\\s*${key}\\b([\\s\\S]*?)//\\s*PARITY-COPY-END:\\s*${key}\\b`);
  const m = fileContent.match(re);
  return m ? m[1] : null;
}

// Strip the outer wrapper from the Deno SYNC block so the comparison lines
// up with what the PARITY-COPY markers delimit (arrow BODY only).
//
// The Deno block, after `normalizeBlockForFreshness()` has trimmed lines and
// dropped blanks/comments, reads:
//     stripe_transactions: (raw) => {
//     <body statements, one per line>
//     },
//
// The PARITY-COPY block, after the same normalization, is just:
//     <body statements, one per line>
//
// So we drop the FIRST line and the LAST line from the Deno-normalized text
// before comparing. Guards:
//   - If the Deno wrapper's opening line ever changes (e.g. `stripe_transactions`
//     gets renamed, or the arrow arity changes), the first line assertion below
//     fails with a clear message pointing to the wrapper contract, not to a
//     phantom body-drift.
//   - If the trailing `},` ever changes shape, the last line assertion catches
//     it the same way.
// Both assertions live in the guard test itself and produce a helpful message
// telling the developer that the wrapper — not the body — is what drifted.
function splitDenoBlockLines(denoNormalized) {
  const lines = denoNormalized.split("\n");
  return {
    all: lines,
    header: lines[0] ?? "",
    footer: lines[lines.length - 1] ?? "",
    body: lines.slice(1, -1).join("\n"),
  };
}
const EXPECTED_DENO_HEADER = "stripe_transactions: (raw) => {";
const EXPECTED_DENO_FOOTER = "},";

describe("Stripe normalizer — behavior parity across the 7 canonical fixtures", () => {
  const fixtures = [
    "charges.json",
    "refunds.json",
    "disputes.json",
    "payouts_and_transfers.json",
    "application_fees.json",
    "multi_currency.json",
    "edge_cases.json",
  ];

  for (const fx of fixtures) {
    it(`fixture ${fx} — src output === Deno parity-copy output`, () => {
      const raw = loadFixture(fx);
      const srcOut = normalizeStripeBalanceTransactions(raw);
      const denoOut = denoNormalize(raw);
      expect(denoOut).toEqual(srcOut);
    });
  }

  it("handles null / undefined / non-object raw identically", () => {
    for (const raw of [null, undefined, {}, { data: null }, { data: "nope" }]) {
      expect(denoNormalize(raw)).toEqual(normalizeStripeBalanceTransactions(raw));
    }
  });
});

describe("Stripe normalizer — freshness guard (parity copy vs Deno source)", () => {
  it("PARITY-COPY body matches the Deno SYNC block body (line-normalized, wrapper stripped)", () => {
    const denoContent = readFileSync(DENO_FILE, "utf8");
    const denoBlock = extractSyncBlock(denoContent, "stripeNormalizer");
    expect(denoBlock, "Deno SYNC-START/END: stripeNormalizer markers must exist").not.toBeNull();

    const thisFileContent = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const parityBlock = extractParityCopyBlock(thisFileContent, "stripeNormalizer");
    expect(parityBlock, "PARITY-COPY-START/END: stripeNormalizer markers must exist").not.toBeNull();

    // Normalize both blocks (trim + drop blank/comment lines).
    const denoNorm = normalizeBlockForFreshness(denoBlock);
    const parityNorm = normalizeBlockForFreshness(parityBlock);

    // Split the Deno block into header (`stripe_transactions: (raw) => {`),
    // body (statements), and footer (`},`) so we can strip the wrapper that
    // does not exist in the PARITY-COPY block by design.
    const { header, footer, body: denoBody, all: denoLines } = splitDenoBlockLines(denoNorm);

    // Wrapper contract assertions — surface a clear message when the Deno
    // WRAPPER changes shape (as opposed to the body). If either fails, the
    // developer knows to update EXPECTED_DENO_HEADER / EXPECTED_DENO_FOOTER
    // in this file and NOT to touch the PARITY-COPY block.
    expect(
      header,
      `Deno block header changed shape.\n` +
      `  Expected: ${EXPECTED_DENO_HEADER}\n` +
      `  Actual:   ${header}\n` +
      `  Fix: update EXPECTED_DENO_HEADER in stripe-parity.test.js — the PARITY-COPY body is fine.`
    ).toBe(EXPECTED_DENO_HEADER);
    expect(
      footer,
      `Deno block footer changed shape.\n` +
      `  Expected: ${EXPECTED_DENO_FOOTER}\n` +
      `  Actual:   ${footer}\n` +
      `  Fix: update EXPECTED_DENO_FOOTER in stripe-parity.test.js — the PARITY-COPY body is fine.`
    ).toBe(EXPECTED_DENO_FOOTER);

    // Defensive: after stripping header + footer, the Deno block must have
    // AT LEAST one body line. A zero-line body would trivially match an
    // empty PARITY-COPY, exactly the false-green class we're avoiding.
    expect(denoLines.length, "Deno block must have >= 3 lines after normalization (header + body + footer)")
      .toBeGreaterThanOrEqual(3);

    // Now compare bodies. This is the actual freshness assertion.
    if (denoBody !== parityNorm) {
      const denoBodyLines = denoBody.split("\n");
      const parityLines = parityNorm.split("\n");
      const maxLines = Math.max(denoBodyLines.length, parityLines.length);
      let firstDiff = -1;
      for (let i = 0; i < maxLines; i++) {
        if (denoBodyLines[i] !== parityLines[i]) { firstDiff = i; break; }
      }
      throw new Error(
        "PARITY-COPY body is stale — regenerate from base44/functions/dataSyncAgent/entry.ts\n" +
        `  Copy the BODY of the arrow between SYNC-START/END: stripeNormalizer\n` +
        `  (i.e. everything BETWEEN \`${EXPECTED_DENO_HEADER}\` and \`${EXPECTED_DENO_FOOTER}\`,\n` +
        `  NOT including those two lines) into the PARITY-COPY-START/END markers.\n` +
        `  Deno body lines: ${denoBodyLines.length}  Parity lines: ${parityLines.length}\n` +
        (firstDiff >= 0
          ? `  First divergence at normalized body line ${firstDiff}:\n` +
            `    Deno:   ${denoBodyLines[firstDiff] || "<end>"}\n` +
            `    Parity: ${parityLines[firstDiff] || "<end>"}\n`
          : `  Lengths differ but no cell divergence detected — check trailing lines.\n`)
      );
    }
    expect(denoBody).toBe(parityNorm);
  });
});