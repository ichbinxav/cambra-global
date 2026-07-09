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
    // The response builder is the last Response.json in the handler.
    // Assert both the key name AND that it's included alongside ok:true.
    expect(submit).toMatch(/return Response\.json\(\{\s*ok:\s*true,\s*anon_session_id,/);
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
    const files = { analyzer, results };
    for (const [name, src] of Object.entries(files)) {
      // Match navigate("/PaymentsAnalyzer…") or navigate("/PaymentsResults…"),
      // in either single-quote, double-quote, or backtick form.
      const aliasNav = src.match(/navigate\(\s*[`'"]\/(PaymentsAnalyzer|PaymentsResults)/);
      expect(aliasNav, `${name}: navigate() targets alias route ${aliasNav?.[0]}`).toBeNull();
    }
  });
});