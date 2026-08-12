// ─── Sync-check test — enforcement automático de copias duplicadas ─────────
//
// PROBLEMA QUE RESUELVE:
//   7+ piezas de lógica viven duplicadas hoy porque Deno (en
//   base44/functions/*) no puede importar de src/. Cada pieza tiene una
//   copia testeable en src/lib/ y una copia verbatim dentro de
//   base44/functions/dataSyncAgent/entry.ts. La única garantía actual de
//   que coinciden es la memoria humana. Esto es el mismo tipo de riesgo
//   que causó el drift de registry de bigcommerce hace varios turnos,
//   pero aplicado a lógica de negocio en vez de a config declarativa.
//
// QUÉ HACE ESTE TEST:
//   1. Lee ambos archivos como TEXTO PLANO (cero dependencias nuevas — no
//      hace falta AST parser).
//   2. Extrae el bloque entre marcadores `// SYNC-START: <key>` y
//      `// SYNC-END: <key>` en cada archivo.
//   3. NORMALIZA los dos bloques: quita comentarios, colapsa whitespace,
//      e iguala las diferencias mecánicas conocidas entre Deno y src
//      (prefijos `_engineSync` / `_paginator` que existen solo en Deno
//      para evitar colisiones de nombres en el archivo gigante; keywords
//      `export` que existen solo en src).
//   4. Compara los dos bloques normalizados. Si difieren → falla con un
//      mensaje claro indicando qué clave divergió y un snippet de la
//      primera diferencia.
//
// LIMITACIÓN ACEPTADA HONESTAMENTE:
//   El test detecta drift, NO lo previene. Si alguien edita una copia y
//   no la otra, esto falla en CI/local en la siguiente pasada. Esa es la
//   garantía que el entorno (Deno sin imports) permite.
//
// PARA AÑADIR UNA OCTAVA PIEZA DUPLICADA:
//   - Envolver el bloque correspondiente en ambos archivos con
//     `// SYNC-START: <newKey>` / `// SYNC-END: <newKey>`.
//   - Añadir una entrada al array PAIRS de abajo.
//   - Nada más.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo root: this file lives at src/lib/syncEngine/__sync_check__.test.js,
// so 3 levels up gets us to the repo root deterministically (no glob, no cwd).
// ESM-safe: derive the directory directly from import.meta.url without
// shadowing the CJS globals __filename / __dirname (which the linter flags).
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..", "..");
const DENO_FILE = path.join(REPO_ROOT, "base44/functions/dataSyncAgent/entry.ts");
// Additional Deno targets (submitPaymentsAnalysis for paymentsGap) are
// declared per-pair via the `deno` override on their PAIRS entry.

// Each pair declares: a logical key (must match the SYNC-START/END markers
// in BOTH files), the src/lib/ file holding the testable copy, an optional
// `deno` override (defaults to DENO_FILE = dataSyncAgent) so a new engine
// can plug in without touching the surrounding test, and the description
// shown if the assertion fails.
// Each pair declares: a logical key (must match the SYNC-START/END markers
// in BOTH files), the src/lib/ file holding the testable copy, and an
// All pairs are mandatory. Known wrapper names and Deno-only helper prefixes
// are normalized below; control-flow and statement bodies must match exactly.
const PAIRS = [
  { key: "mergeStaticHeaders",     src: "src/lib/syncEngine/mergeStaticHeaders.js" },
  { key: "dateRange",              src: "src/lib/syncEngine/dateRange.js" },
  { key: "cursorAdvance",          src: "src/lib/syncEngine/cursorAdvance.js" },
  { key: "paginators",            src: "src/lib/syncEngine/paginators.js" },
  { key: "rateLimit",    src: "src/lib/syncEngine/rateLimit.js" },
  { key: "refreshOn401", src: "src/lib/syncEngine/refreshOn401.js" },
  { key: "stripeNormalizer",      src: "src/lib/normalizers/stripe.js" },
  { key: "bigcommerceNormalizer", src: "src/lib/normalizers/bigcommerce.js" },
  // paymentsGap: pure ES6 engine (src/lib/paymentsGap.js) mirrored verbatim
  // inside TWO Deno consumers (as of M3-Chunk 4):
  //   1. base44/functions/submitPaymentsAnalysis/entry.ts (anonymous public
  //      path — added Chunk 3).
  //   2. base44/functions/computeStripeVerifiedGap/entry.ts (verified path,
  //      the Stripe→PaymentsGap bridge — added Chunk 4).
  // Both copies live between the same SYNC-START/SYNC-END: paymentsGap
  // markers. The former HTTP endpoint calculatePaymentsGap was DELETED on
  // 2026-07-09 — with no cross-function service token available in Base44,
  // shared engine logic is inlined + guarded by this sync-check instead of
  // fetched over HTTP. See src/docs/Decision_Log.md 2026-07-09 (rule) and
  // 2026-07-10 M3-Chunk 4 (second consumer).
  //
  // `extraDenos` extends the assertion transitively: for each pair with
  // extraDenos, we normalize the src block once and compare against each
  // Deno target. Transitivity guarantees all N copies stay identical
  // without an N² fanout.
  {
    key: "paymentsGap",
    src: "src/lib/paymentsGap.js",
    deno: "base44/functions/submitPaymentsAnalysis/entry.ts",
    extraDenos: [
      "base44/functions/computeStripeVerifiedGap/entry.ts",
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function readFileSafe(absPath) {
  try { return fs.readFileSync(absPath, "utf8"); }
  catch (e) { throw new Error(`Cannot read ${absPath}: ${e.message}`); }
}

function extractBlock(content, key) {
  // Marker pattern: literal lines `// SYNC-START: key` and `// SYNC-END: key`.
  // We match the SHORTEST block between matching markers (single occurrence
  // assumed; if a future block reuses the same key it's a bug).
  const startRe = new RegExp(`//\\s*SYNC-START:\\s*${key}\\b`);
  const endRe   = new RegExp(`//\\s*SYNC-END:\\s*${key}\\b`);
  const startMatch = content.match(startRe);
  const endMatch = content.match(endRe);
  if (!startMatch) return { found: false, reason: `SYNC-START marker for "${key}" not found` };
  if (!endMatch) return { found: false, reason: `SYNC-END marker for "${key}" not found` };
  const startIdx = startMatch.index + startMatch[0].length;
  const endIdx = endMatch.index;
  if (endIdx <= startIdx) return { found: false, reason: `SYNC-END appears before SYNC-START for "${key}"` };
  return { found: true, body: content.slice(startIdx, endIdx) };
}

// Normalize the extracted body so syntactic-but-not-semantic differences
// between Deno and src don't cause false positives. Order matters.
//
// What this normalizer IGNORES (intentionally — these are cosmetic, not drift):
//   - All comments (// and /* */)
//   - All whitespace (collapsed to single spaces)
//   - `export` keyword (src has it; Deno doesn't because it's one big file)
//   - Mechanical name prefixes Deno uses to avoid in-file collisions (see RENAMES)
//   - Parameter names (each function's parameter LIST is reduced to its arity:
//     `(rawResponse, _headers, currentUrl, _cfg)` and `(raw, _h, currentUrl)`
//     become `(P1,P2,P3,P4)` and `(P1,P2,P3)` respectively — so a real arity
//     mismatch still trips the test, but a rename does not).
//   - Top-level declaration ORDER for const/function statements (sorted before compare)
//   - Trailing commas in argument/destructuring lists
//   - Wrapper shape `name: (args) => { body }` (object-method-shorthand used inside
//     the Deno normalizers object) vs `function NAME(args) { body }` (src module
//     export). Both reduce to `FN (args) { body }`.
//
// What this normalizer DOES NOT IGNORE (real drift, will fail the test):
//   - Different statement bodies
//   - Different control flow / branches / conditions
//   - Different return shapes
//   - Different operator usage or constants
//   - Different number of top-level statements
function normalize(body) {
  let s = body;

  // 1. Strip block comments /* ... */ (non-greedy, multi-line).
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");

  // 2. Strip line comments. We need to keep "://" inside string URLs (the
  //    bodies do contain endpoint URLs as constants). Use a tokenizer that
  //    walks the source and skips strings.
  s = stripLineComments(s);

  // 3. Remove `export ` keyword.
  s = s.replace(/\bexport\s+(async\s+)?function\b/g, "$1function");
  s = s.replace(/\bexport\s+const\b/g, "const");
  s = s.replace(/\bexport\s+let\b/g, "let");
  s = s.replace(/\bexport\s+default\s+/g, "");

  // 4. Equalize Deno's mechanical name prefixes — intentional renames to
  //    avoid collisions in the giant entry.ts. "Same function, different
  //    cosmetic prefix" — the comparator must collapse them.
  const RENAMES = [
    // paginators
    ["_paginatorCursorStripe", "cursorStripe"],
    ["_paginatorCursorHalBody", "cursorHalBody"],
    ["_paginatorPageNumber", "pageNumber"],
    ["_paginatorLinkHeader", "linkHeader"],
    ["_paginatorOffsetLimit", "offsetLimit"],
    ["_paginatorNull", "nullPaginator"],
    ["_engineSyncWithQueryParam", "withQueryParam"],
    ["_engineSyncWithQueryParams", "withQueryParams"],
    // dateRange
    ["_formatDateValue", "formatDateValue"],
    // rateLimit
    ["_BASE_BACKOFF_MS", "BASE_BACKOFF_MS"],
    ["_DEFAULT_MAX_RETRIES", "DEFAULT_MAX_RETRIES"],
    ["_sleep", "sleep"],
    ["_parseRetryAfter", "parseRetryAfter"],
    ["_minDelayMs", "minDelayMs"],
    // refreshOn401
    ["_createRefreshState", "createRefreshState"],
    ["_isEligibleForRefresh", "isEligibleForRefresh"],
    ["_fetchPageWithMaybeRefresh", "fetchPageWithMaybeRefresh"],
    // normalizer wrapper-shape unifier: collapse the object-method-shorthand
    // shape `stripe_transactions: (raw) => {` and the named export
    // `function normalizeStripeBalanceTransactions(raw) {` BOTH to the same
    // canonical token `__FN__`. The bodies after this prefix are what we
    // really care about — these names are pure wrappers.
    ["stripe_transactions", "__FN__"],
    ["normalizeStripeBalanceTransactions", "__FN__"],
    ["bigcommerce_orders", "__FN__"],
    ["normalizeBigCommerceOrders", "__FN__"],
  ];
  // Apply renames long-first — blindaje contra futuros pares donde un nombre
  // sea prefijo estricto de otro (p.ej. si en el futuro alguien añade
  // `_paginatorFoo` y `_paginatorFooBar` a la tabla). Con \b los boundaries
  // ya evitan la mayoría de las colisiones plausibles (verificado 2026-07-10:
  // `\b_engineSyncWithQueryParam\b` NO matchea dentro de `_engineSyncWithQueryParams`
  // porque `\b` no aplica entre dos caracteres de palabra), pero ordenar
  // largo-primero elimina toda una CLASE de bugs futuros por 0 coste. Sort
  // estable (Array.sort) sobre la copia local — no mutamos el RENAMES original.
  const orderedRenames = [...RENAMES].sort((a, b) => b[0].length - a[0].length);
  for (const [denoName, srcName] of orderedRenames) {
    s = s.replace(new RegExp(`\\b${denoName}\\b`, "g"), srcName);
  }

  // 5. Unify wrapper-shape for the normalizer pair specifically:
  //      `__FN__: (raw) => {`  →  `function __FN__(raw) {`
  //    Now Deno's object-method-shorthand and src's named-export look
  //    identical from this point on.
  s = s.replace(/\b__FN__\s*:\s*\(([^)]*)\)\s*=>\s*\{/g, "function __FN__($1) {");

  // 6. Reduce each function's parameter list to its arity. Both
  //    `function foo(raw, _h, currentUrl)` and
  //    `function foo(rawResponse, _headers, currentUrl, _cfg)` become
  //    distinguishable by length only — a real arity mismatch still trips
  //    the test, but a parameter rename does not.
  s = s.replace(/\bfunction\s+(\w+)\s*\(([^)]*)\)/g, (_m, name, params) => {
    const arity = params.trim() === "" ? 0 : params.split(",").length;
    return `function ${name}(${"P".repeat(arity).split("").map((_, i) => `P${i + 1}`).join(",")})`;
  });
  // Same for arrow functions assigned to const: `const foo = (a, b) => {`
  s = s.replace(/\bconst\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>/g, (_m, name, asy, params) => {
    const arity = params.trim() === "" ? 0 : params.split(",").length;
    const paramList = "P".repeat(arity).split("").map((_, i) => `P${i + 1}`).join(",");
    return `const ${name} = ${asy || ""}(${paramList}) =>`;
  });

  // 7. Remove trailing commas before `)`, `}`, `]` — cosmetic only.
  s = s.replace(/,(\s*[\)\}\]])/g, "$1");
  //    Also strip a trailing `,` at the very end of the block (used by the
  //    Deno normalizer entries because they live as properties of a giant
  //    object literal — the src named-export form has no trailing comma).
  //    Both pattern shapes collapse to identical text after this pass.
  s = s.replace(/,\s*$/g, "");

  // 7b. Single-param arrow function shorthand: `(x) => ...` vs `x => ...`.
  //     Already covered by the const-arrow rewrite at step 6, but inline
  //     arrows (e.g. `Promise(r => …)`) need a separate pass. Replace any
  //     `<ident> => ` with `(<ident>) => ` so both shapes match.
  s = s.replace(/\b([a-zA-Z_$][\w$]*)\s*=>\s*/g, "($1) => ");
  //     And then collapse single-param identifier names — `(resolve) => `
  //     and `(r) => ` should be the same. Use canonical `__P__`.
  s = s.replace(/\(([a-zA-Z_$][\w$]*)\)\s*=>/g, "(__P__) =>");

  // 8. Collapse all whitespace to a single space; trim ends.
  s = s.replace(/\s+/g, " ").trim();

  // 9. Order-insensitive comparison of TOP-LEVEL declarations. Some pairs
  //    (rateLimit) declare constants in different orders across the two
  //    copies — that's cosmetic. Split on `;` at depth 0 for top-level
  //    statements, sort, rejoin. Only applied at top level — function
  //    bodies stay ordered (real semantic content).
  s = sortTopLevelStatements(s);

  return s;
}

// Walk the source removing line comments (//... to EOL) WITHOUT eating "://"
// inside string literals. Tolerates single/double/backtick strings.
function stripLineComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    // Enter string?
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        const ch = src[i];
        out += ch;
        if (ch === "\\" && i + 1 < n) { out += src[i + 1]; i += 2; continue; }
        i++;
        if (ch === quote) break;
      }
      continue;
    }
    // Line comment?
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Split the body into top-level statements (depth 0 of {}, (), [], strings).
// Used to normalize order-insensitive top-level declarations (constants and
// function declarations) without disturbing the contents of any single
// function body.
function sortTopLevelStatements(src) {
  const stmts = [];
  let depth = 0;
  let buf = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      buf += c; i++;
      while (i < n) {
        const ch = src[i]; buf += ch;
        if (ch === "\\" && i + 1 < n) { buf += src[i + 1]; i += 2; continue; }
        i++;
        if (ch === quote) break;
      }
      continue;
    }
    if (c === "{" || c === "(" || c === "[") { depth++; buf += c; i++; continue; }
    if (c === "}" || c === ")" || c === "]") { depth--; buf += c; i++; continue; }
    if (c === ";" && depth === 0) {
      stmts.push(buf.trim() + ";");
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf.trim().length > 0) stmts.push(buf.trim());
  // Only sort when there are MULTIPLE top-level statements — single function
  // bodies (the typical normalizer pair) stay untouched.
  if (stmts.length < 2) return src.trim();
  return stmts.map(s => s.trim()).filter(Boolean).sort().join(" ");
}

// First-divergence snippet: shows ~80 chars of context around the position
// where the two normalized strings first differ. Helps the human reading the
// failure see immediately WHAT diverged, not just THAT something did.
function diffSnippet(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  if (i === n && a.length === b.length) return "<no divergence>";
  const start = Math.max(0, i - 30);
  return {
    position: i,
    a_excerpt: a.slice(start, i + 50),
    b_excerpt: b.slice(start, i + 50),
    a_total_length: a.length,
    b_total_length: b.length,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Sync-check — duplicated copies (src/lib/ vs base44/functions/dataSyncAgent)", () => {
  // Sanity: the Deno file exists and is readable. If this fails, ALL pair
  // tests would also fail; surface it once with a clear message.
  it("Deno source file is readable", () => {
    expect(fs.existsSync(DENO_FILE)).toBe(true);
    expect(readFileSafe(DENO_FILE).length).toBeGreaterThan(1000);
  });

  // One test per pair. Each fails INDEPENDENTLY so a single drift doesn't
  // mask the others. Easy to extend: add an entry to PAIRS at the top.
  //
  for (const pair of PAIRS) {
    const displayKey = pair.label || pair.key;
    const label = `pair "${displayKey}" — Deno copy matches ${path.basename(pair.src)}`;
    it(label, () => {
      // Each pair may override the primary Deno file target. Defaults to
      // dataSyncAgent (the historical target). Pairs may also declare
      // `extraDenos: [...]` for additional Deno consumers that must ALL
      // stay identical to the src block (transitive comparison).
      const primaryDeno = pair.deno ? path.join(REPO_ROOT, pair.deno) : DENO_FILE;
      const extraDenos = Array.isArray(pair.extraDenos)
        ? pair.extraDenos.map(p => path.join(REPO_ROOT, p))
        : [];
      const allDenoTargets = [primaryDeno, ...extraDenos];

      const srcContent = readFileSafe(path.join(REPO_ROOT, pair.src));
      const srcBlock   = extractBlock(srcContent, pair.key);
      expect(srcBlock.found, `src:  ${srcBlock.reason || "ok"}`).toBe(true);
      const srcNorm = normalize(srcBlock.body);

      // Compare src against EACH Deno target. First divergence throws.
      for (const denoTarget of allDenoTargets) {
        const denoContent = readFileSafe(denoTarget);
        const denoBlock   = extractBlock(denoContent, pair.key);
        expect(denoBlock.found, `Deno (${denoTarget}): ${denoBlock.reason || "ok"}`).toBe(true);
        const denoNorm = normalize(denoBlock.body);
        if (denoNorm !== srcNorm) {
          const snippet = diffSnippet(denoNorm, srcNorm);
          throw new Error(
            `DRIFT DETECTED on "${pair.key}":\n` +
            `  Deno file: ${path.relative(REPO_ROOT, denoTarget)}\n` +
            `  src file:  ${pair.src}\n` +
            `  Divergence at normalized position ${snippet.position}:\n` +
            `    Deno: …${snippet.a_excerpt}…\n` +
            `    src:  …${snippet.b_excerpt}…\n` +
            `  Total normalized length: Deno=${snippet.a_total_length}, src=${snippet.b_total_length}\n` +
            `  Fix: realign the diverged copy by hand. If the difference is a\n` +
            `  legitimate mechanical rename (e.g. new helper prefixed in Deno\n` +
            `  to avoid collision), add it to the RENAMES array in this test.`
          );
        }
      }
    });
  }
});
