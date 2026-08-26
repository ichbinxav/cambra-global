// Keep tests outside src/pages: Base44 registers every file there as a page.
// analyzerResultsHandoff.test.js — CONTRACT TEST for the session handoff.
//
// This test exists BECAUSE of a real bug that shipped in the Chunk 6 cutover:
// PaymentsAnalyzer was navigating to `/PaymentsResults?session=…`, which the
// cutover App.jsx redirected to `/Results` via <Navigate replace>. That
// redirect STRIPS the query string, breaking the form→results handoff and
// dropping every user into "This link isn't valid" — despite the session
// existing in the DB and the endpoint returning it correctly.
//
// Every prior test suite was green (motor, sync-check, benchmarks, normalizers)
// because none of them covered the CONTRACT between:
//   1. the shape of the submit response          (anon_session_id field name)
//   2. the URL the analyzer navigates to         (canonical route, not alias)
//   3. the query-param key the results page reads (`session`)
//   4. the App.jsx route table                   (canonicals vs. redirects)
//
// If any of the four drifts from the others, the funnel breaks silently.
// This test file locks all four together so nobody breaks it in silence again.
//
// Style note: this is a REGEX + STRING assertion test, not a DOM test. We are
// asserting on the source-of-truth strings that shape the contract. That is
// cheap, fast, and catches the exact failure mode that shipped.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM-safe __dirname replacement — the vitest runner treats test files as ESM
// and `__dirname` is not defined there. `import.meta.url` gives us the file
// URL; fileURLToPath converts it to a filesystem path.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('CONTRACT — Analyzer → Results session handoff', () => {
  const analyzer = read('src/pages/PaymentsAnalyzer.jsx');
  const results  = read('src/pages/PaymentsResults.jsx');
  const submit   = read('base44/functions/submitPaymentsAnalysis/entry.ts');
  const teaser   = read('base44/functions/getPaymentsGapTeaser/entry.ts');
  const app      = read('src/App.jsx');

  // 1. Backend returns `anon_session_id` — exact field name the analyzer reads.
  it('submitPaymentsAnalysis returns { anon_session_id } in the success response', () => {
    // The endpoint is wrapped by the durable SLO observer. Lock the product
    // response contract inside that callback instead of requiring Response.json
    // to be the outer return expression (which would make instrumentation look
    // like an API-contract regression).
    expect(submit).toMatch(/return await observeServiceLevelRequest\(/);
    const observedCallback = submit.slice(submit.indexOf('return await observeServiceLevelRequest('));
    expect(observedCallback).toContain('async () => {');
    expect(observedCallback).toMatch(
      /return serviceLevelResult\(\s*Response\.json\(\{[\s\S]{0,160}?ok:\s*true,[\s\S]{0,160}?anon_session_id,/,
    );
  });

  // 2. Analyzer reads body.anon_session_id — same field name, no typos.
  it('PaymentsAnalyzer reads body.anon_session_id from the submit response', () => {
    expect(analyzer).toMatch(/body\.anon_session_id/);
    // And guards the redirect on that field being present.
    expect(analyzer).toMatch(/!body\.anon_session_id/);
  });

  // 3. Analyzer navigates to the CANONICAL route with the session in the query.
  //    This is the bug that shipped: it was navigating to /PaymentsResults
  //    (an alias that <Navigate replace> strips the query string on).
  it('PaymentsAnalyzer navigates to the canonical /Results route (NOT the alias /PaymentsResults)', () => {
    expect(analyzer).toMatch(/navigate\(`\/Results\?session=/);
    expect(analyzer).not.toMatch(/navigate\(`\/PaymentsResults\?session=/);
  });

  // 4. Results page reads the `session` query param — matches the analyzer.
  it('PaymentsResults reads the "session" query param (accepts anon_session_id as alias)', () => {
    // The exact line accepts both keys — canonical first, alias second.
    expect(results).toMatch(/params\.get\("session"\)\s*\|\|\s*params\.get\("anon_session_id"\)/);
  });

  // 5. Teaser endpoint accepts anon_session_id in the POST body — same key
  //    the SDK invoke() call in PaymentsResults sends.
  it('getPaymentsGapTeaser accepts anon_session_id in the POST body', () => {
    expect(teaser).toMatch(/body\?\.anon_session_id/);
    // And validates it against the same UUID v4 pattern the client uses.
    expect(teaser).toMatch(/UUID_V4/);
  });

  it('PaymentsResults sends anon_session_id (not session_id) to the teaser', () => {
    expect(results).toMatch(/invoke\("getPaymentsGapTeaser",\s*\{\s*anon_session_id:\s*sessionId\s*\}\)/);
  });

  // 6. UUID v4 regex is identical on both sides — a divergence here would
  //    silently reject valid sessions on either the client or server.
  it('UUID v4 regex is identical between PaymentsResults and getPaymentsGapTeaser', () => {
    const pat = /const UUID_V4 = \/([^/]+)\/i;/;
    const clientMatch = results.match(pat);
    const serverMatch = teaser.match(pat);
    expect(clientMatch, 'client UUID_V4 regex not found').toBeTruthy();
    expect(serverMatch, 'server UUID_V4 regex not found').toBeTruthy();
    expect(clientMatch[1]).toBe(serverMatch[1]);
  });

  // 7. App.jsx route table: /Results is the CANONICAL route (element mounted
  //    directly, not a redirect). /PaymentsResults is the alias (redirect).
  //    This is the invariant the bug violated: analyzer aimed at the alias,
  //    which <Navigate replace> stripped the query string on.
  it('App.jsx makes /Results the canonical route (element mounts PaymentsResults)', () => {
    // The canonical route mounts the component with a boundary wrapper.
    expect(app).toMatch(/path="\/Results"\s+element=\{withBoundary\(<PaymentsResults \/>\)\}/);
  });

  it('App.jsx makes /Analyzer the canonical route (element mounts PaymentsAnalyzer)', () => {
    expect(app).toMatch(/path="\/Analyzer"\s+element=\{withBoundary\(<PaymentsAnalyzer \/>\)\}/);
  });

  it('App.jsx registers /PaymentsResults as an alias redirecting to /Results', () => {
    expect(app).toMatch(/path="\/PaymentsResults"\s+element=\{<Navigate to="\/Results" replace \/>\}/);
  });

  // 8. Cross-file navigation targets — every navigate() in the payments funnel
  //    must aim at a CANONICAL route (/Analyzer or /Results), never at an alias
  //    (/PaymentsAnalyzer or /PaymentsResults). Aliases exist for external
  //    inbound links; internal code paths must never round-trip through them
  //    because <Navigate replace> silently drops the query string.
  it('No internal navigate() call in the payments funnel targets an alias route', () => {
    // Extended in M3-Chunk 6 to include StripeConnectCard, which post-Chunk 6
    // owns the second navigate() into /Results (verified path). Any drift
    // there would break the same way the analyzer bug did.
    const stripeCard = read('src/components/connect/StripeConnectCard.jsx');
    const files = { analyzer, results, stripeCard };
    for (const [name, src] of Object.entries(files)) {
      // Match navigate("/PaymentsAnalyzer…") or navigate("/PaymentsResults…"),
      // in either single-quote, double-quote, or backtick form.
      const aliasNav = src.match(/navigate\(\s*[`'"]\/(PaymentsAnalyzer|PaymentsResults)/);
      expect(aliasNav, `${name}: navigate() targets alias route ${aliasNav?.[0]}`).toBeNull();
    }
  });
});

// ── M3-Chunk 6+7 · Verified path handoff ─────────────────────────────────────
//
// Locks the SECOND funnel: Stripe connect → computeStripeVerifiedGap →
// /Results?verified=<id>. Same failure surface as the estimated path (drift
// between the produced URL and the consumed query key, alias vs canonical
// navigation), so it gets the same style of contract lockdown.
describe('CONTRACT — Verified analysis handoff (M3-Chunk 6+7)', () => {
  const stripeCard = fs.readFileSync(path.join(ROOT, 'src/components/connect/StripeConnectCard.jsx'), 'utf-8');
  const results    = fs.readFileSync(path.join(ROOT, 'src/pages/PaymentsResults.jsx'), 'utf-8');
  const reader     = fs.readFileSync(path.join(ROOT, 'base44/functions/getPaymentsAnalysisVerified/entry.ts'), 'utf-8');
  const bridge     = fs.readFileSync(path.join(ROOT, 'base44/functions/computeStripeVerifiedGap/entry.ts'), 'utf-8');
  const gapCard    = fs.readFileSync(path.join(ROOT, 'src/components/paymentsResults/PaymentsGapCard.jsx'), 'utf-8');

  // 1. StripeConnectCard invokes computeStripeVerifiedGap with brand_id.
  it('StripeConnectCard invokes computeStripeVerifiedGap with { brand_id }', () => {
    expect(stripeCard).toMatch(/invoke\("computeStripeVerifiedGap",\s*\{\s*brand_id:/);
  });

  // 2. StripeConnectCard navigates to /Results?verified=<id> — canonical, never alias.
  it('StripeConnectCard navigates to canonical /Results?verified=<id>', () => {
    expect(stripeCard).toMatch(/navigate\(`\/Results\?verified=/);
    expect(stripeCard).not.toMatch(/navigate\(`\/PaymentsResults\?verified=/);
  });

  // 3. Results page reads the `verified` query param.
  it('PaymentsResults reads the "verified" query param', () => {
    expect(results).toMatch(/params\.get\("verified"\)/);
  });

  // 4. Results page invokes getPaymentsAnalysisVerified with { verified_id }.
  it('PaymentsResults sends verified_id (not id) to getPaymentsAnalysisVerified', () => {
    expect(results).toMatch(/invoke\("getPaymentsAnalysisVerified",\s*\{\s*verified_id:\s*verifiedId\s*\}\)/);
  });

  // 5. Reader accepts verified_id in the POST body.
  it('getPaymentsAnalysisVerified accepts { verified_id } in the POST body', () => {
    expect(reader).toMatch(/body\?\.verified_id/);
  });

  // 6. Bridge returns `verified_id` — the exact key the client reads.
  //    The bridge response shape is: { ok, reused, verified_id, engine_result, ... }
  it('computeStripeVerifiedGap returns verified_id in the success response', () => {
    // Bridge uses Response.json with a variable holding the row id — assert
    // the key appears in a response payload construction.
    expect(bridge).toMatch(/verified_id/);
  });

  // 7. The VERIFIED badge is gated on engine_result.mode === "verified".
  //    Vocabulary Rule: the word "verified" (as a user-facing badge) is
  //    reserved for the measured path. This test locks the gate so nobody
  //    can flip it back to cohort.verified by accident — a rate-table row
  //    being verified does NOT make the merchant's analysis verified.
  it('PaymentsGapCard gates the "Verified" badge on engine_result.mode === "verified"', () => {
    expect(gapCard).toMatch(/engineResult\?\.mode === "verified"/);
  });

  // 8. The two paths NEVER cross — session and verified are mutually exclusive.
  //    Reading them into two separate variables (not one) is the invariant
  //    that keeps the reader from silently reusing session logic on a
  //    verified id (or vice versa).
  it('PaymentsResults reads verifiedId and sessionId into DISTINCT variables', () => {
    expect(results).toMatch(/const verifiedId = params\.get\("verified"\)/);
    expect(results).toMatch(/const sessionId\s+= params\.get\("session"\)/);
  });
});

// ── Brand-block metadata (brand_name / website / sector) ─────────────────────
//
// Independent describe() so failures here point straight at the brand block
// without noise from the routing block above.
//
// Contract: the "About your brand" block adds THREE metadata fields to the
// anonymous session — brand_name (OPTIONAL), website (optional), sector
// (optional). These are lead-intelligence metadata, NOT engine inputs. The
// motor must not read them; downstream aggregators must be able to join on
// them without the client being able to inject nonsense.
//
// brand_name is OPTIONAL since SWEEP-1 T2 (2026-07-24) — product decision:
// asking for the brand name before showing the gap added conversion friction
// to the anonymous funnel. The name is now requested in the CLAIM flow,
// once the merchant has already seen their gap. When present, the 2-80 char
// range still applies (strict conditional validation, no silent clamping).
// When absent, the results surface must NEVER render an empty string or
// "undefined" — the i18n fallback key `brand_fallback` ("Your brand" /
// "Votre marque" / "Tu marca") is the sanctioned placeholder.
describe('CONTRACT — Brand-block metadata (name / website / sector)', () => {
  const analyzer   = fs.readFileSync(path.join(ROOT, 'src/pages/PaymentsAnalyzer.jsx'), 'utf-8');
  const brandBlock = fs.readFileSync(path.join(ROOT, 'src/components/paymentsAnalyzer/BrandBlock.jsx'), 'utf-8');
  const submit     = fs.readFileSync(path.join(ROOT, 'base44/functions/submitPaymentsAnalysis/entry.ts'), 'utf-8');

  // 1. Client → server field names match verbatim. Since SWEEP-1 T2 the
  //    client sends brand_name ONLY when the user typed one — same
  //    "left blank → send nothing" convention as website/sector.
  it('Client sends brand_name only when the user filled it (conditional spread)', () => {
    expect(analyzer).toMatch(/\.\.\.\(brandName\.trim\(\)\s*!==\s*""\s*\?\s*\{\s*brand_name:\s*brandName\.trim\(\)\s*\}\s*:\s*\{\}\)/);
  });

  it('Client sends website and sector only when the user filled them', () => {
    // Both must be guarded by a non-empty check — this is the difference
    // between "user left blank" (send nothing) vs. "user typed garbage"
    // (send empty string, server rejects as invalid_type). We want the
    // former, always.
    expect(analyzer).toMatch(/website\.trim\(\)\s*!==\s*""/);
    expect(analyzer).toMatch(/sector\s*!==\s*""/);
  });

  // 2. Server treats brand_name as OPTIONAL (SWEEP-1 T2, 2026-07-24).
  //    Strict inverse of the pre-T2 contract: a missing/empty brand_name is
  //    ACCEPTED — there must be NO 'missing' rejection branch for it, and the
  //    normalizer must coerce absence to '' (never undefined) on BOTH paths
  //    (single-channel and combined).
  it('submitPaymentsAnalysis accepts a missing brand_name (no invalid_input for absence)', () => {
    // No validation branch may reject brand_name for being absent.
    expect(submit).not.toMatch(/field:\s*'brand_name',\s*reason:\s*'missing'/);
    // Absence is normalized to '' via the presence-safe trim — single path…
    expect(submit).toMatch(/const brand_name_raw = typeof raw\.brand_name === 'string' \? raw\.brand_name\.trim\(\) : '';/);
    // …and combined path.
    expect(submit).toMatch(/const brandName = typeof raw\.brand_name === 'string' \? raw\.brand_name\.trim\(\) : '';/);
  });

  // 3. When brand_name IS present, the 2-80 range still applies — the
  //    validation is CONDITIONAL on presence (truthy guard before the range
  //    check), not dropped.
  it('submitPaymentsAnalysis enforces the 2-80 range on brand_name ONLY when present', () => {
    // The constant is still declared…
    expect(submit).toMatch(/brand_name:\s*\{\s*minLen:\s*2,\s*maxLen:\s*80\s*\}/);
    // …and applied behind a presence guard on the single path…
    expect(submit).toMatch(/if \(brand_name_raw && \(brand_name_raw\.length < VALIDATION\.brand_name\.minLen/);
    // …and on the combined path.
    expect(submit).toMatch(/if \(brandName && \(brandName\.length < VALIDATION\.brand_name\.minLen/);
  });

  // 4. Fallback seal — when brand_name is absent, the results surface never
  //    shows an empty string or "undefined":
  //    (a) the i18n fallback key exists in ALL three locales with the exact
  //        sanctioned copy, and
  //    (b) the results surface performs NO raw interpolation of brand_name
  //        anywhere (PaymentsResults + every paymentsResults component), so
  //        there is no code path that could render ''/undefined for it.
  it('brand_name fallback: i18n key sealed and no raw interpolation on the results surface', () => {
    const en = fs.readFileSync(path.join(ROOT, 'src/lib/locales/en.js'), 'utf-8');
    const fr = fs.readFileSync(path.join(ROOT, 'src/lib/locales/fr.js'), 'utf-8');
    const es = fs.readFileSync(path.join(ROOT, 'src/lib/locales/es.js'), 'utf-8');
    expect(en).toMatch(/brand_fallback:\s*"Your brand"/);
    expect(fr).toMatch(/brand_fallback:\s*"Votre marque"/);
    expect(es).toMatch(/brand_fallback:\s*"Tu marca"/);

    const resultsPage = fs.readFileSync(path.join(ROOT, 'src/pages/PaymentsResults.jsx'), 'utf-8');
    expect(resultsPage).not.toMatch(/brand_name/);
    const resultsDir = path.join(ROOT, 'src/components/paymentsResults');
    for (const f of fs.readdirSync(resultsDir)) {
      const src = fs.readFileSync(path.join(resultsDir, f), 'utf-8');
      expect(src, `${f} interpolates brand_name directly`).not.toMatch(/brand_name/);
    }
  });

  // 5. Sector enum is IDENTICAL between client (BrandBlock) and server. This
  //    is the same drift risk the provider enum has — we lock it the same way.
  it('Sector enum matches verbatim between BrandBlock and submitPaymentsAnalysis', () => {
    // Extract each list independently and compare as sorted sets. We match
    // 'value' pairs to be robust to formatting changes inside BrandBlock.
    const clientMatches = [...brandBlock.matchAll(/value:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    // ALLOWED_SECTOR_SLUGS on the server is a TS `as const` tuple of strings.
    const serverBlock = submit.match(/ALLOWED_SECTOR_SLUGS = \[([\s\S]*?)\]/);
    expect(serverBlock, 'server sector enum block not found').toBeTruthy();
    const serverMatches = [...serverBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(clientMatches.length).toBeGreaterThan(0);
    expect(serverMatches.length).toBeGreaterThan(0);
    expect([...clientMatches].sort()).toEqual([...serverMatches].sort());
  });

  // 6. Website normalization exists server-side and produces bare hostnames.
  //    We assert the function name — the unit-level behavior would belong in
  //    a dedicated normalizer test if this ever grew beyond 5 lines.
  it('submitPaymentsAnalysis normalizes website to a bare hostname', () => {
    expect(submit).toMatch(/function normalizeWebsite\(/);
    // And the validator actually calls it (not just declares it).
    expect(submit).toMatch(/normalizeWebsite\(raw\.website\)/);
  });

  // 7. Brand metadata is NOT fed to the engine — critical for sync-check
  //    stability. If a future refactor accidentally passes brand_name into
  //    engineInput, this test catches it before the sync-check does.
  it('engineInput does not include brand_name / website / sector', () => {
    // engineInput is built right before calculateGap(). Grab that literal
    // and assert it contains only the 5 engine fields.
    const engineInputBlock = submit.match(/const engineInput = \{([\s\S]*?)\};/);
    expect(engineInputBlock, 'engineInput block not found').toBeTruthy();
    const body = engineInputBlock[1];
    expect(body).not.toMatch(/brand_name/);
    expect(body).not.toMatch(/website/);
    expect(body).not.toMatch(/\bsector\b/);
  });
});
