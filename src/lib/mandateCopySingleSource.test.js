// mandateCopySingleSource.test.js — v61 Checkpoint H (2026-08-06).
//
// One wording, one place. base44/shared/recoverMandateCopy.ts is the single source
// of the mandate's user-facing contractual text; the acceptance popup receives it
// as `mandate_copy` and the PDF imports it directly.
//
// This freezes the property that was broken until Checkpoint H: the popup rendered
// its OWN English paragraph and its OWN English summary labels, so a FR/ES merchant
// accepted one wording on screen and received another in the contractual document.
// The regression is invisible in EN, which is why it survived — hence a test rather
// than a comment.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// The forbidden-phrase scan must look at CODE, not prose: these files document the
// drift they fix, so they legitimately quote the wording ("it hardcoded the
// 24-month duration"). Scanning comments made the test assert about explanations
// instead of rendered output — it failed on its own documentation.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MODAL = "src/components/recover/RecoverMandateModal.jsx";
const SUMMARY = "src/components/recover/MandateTermsSummary.jsx";
const LIMITS = "src/components/recover/MandateLimitsBlock.jsx";
const CONTEXT_FN = "base44/functions/getRecoverAcceptanceContext/entry.ts";

describe("mandate copy — the popup consumes the server copy", () => {
  it("the acceptance context still serves every copy branch the UI reads", () => {
    const src = read(CONTEXT_FN);
    for (const key of ["summary", "limits_body", "limits_bullets", "titles", "checkbox"]) {
      expect(src, `mandate_copy.${key} is no longer served`).toContain(`${key}:`);
    }
  });

  it("the summary renders the server labels, not its own", () => {
    const src = read(SUMMARY);
    expect(src).toMatch(/copy\b/);
    // Labels must be read off the copy object.
    for (const key of ["fee_label", "duration_label", "duration_value", "baseline_label", "projected_label"]) {
      expect(src).toContain(key);
    }
  });

  it("the limits block reads limits_body / limits_bullets and never invents a clause", () => {
    const src = read(LIMITS);
    expect(src).toContain("limits_body");
    expect(src).toContain("limits_bullets");
    // No copy at all → render nothing, rather than a client-side legal sentence.
    expect(src).toContain("return null");
  });

  it("the modal passes the server copy down to both blocks", () => {
    const src = read(MODAL);
    expect(src).toContain("copy={context.mandate_copy?.summary}");
    expect(src).toContain("<MandateLimitsBlock copy={context.mandate_copy} />");
  });
});

describe("mandate copy — no contractual wording restated in the frontend", () => {
  // Phrases that state the AGREEMENT (duration, fee mechanics, revocation).
  // The checkbox fallback is exempt: it is the verbatim v1 EN statement, keyed to
  // document_version 'recover-mandate-v1', and rewording it would falsify every
  // existing English acceptance.
  const FORBIDDEN = [
    /for 24 months/i,
    /24 months from go-live/i,
    /24 mois/i,
    /24 meses/i,
    /you owe nothing/i,
    /revoking does not cancel/i,
    /we charge \{?context/i,
  ];

  it.each([MODAL, LIMITS])("%s restates no contractual clause", (file) => {
    const src = stripComments(read(file));
    const hits = FORBIDDEN.filter((re) => re.test(src)).map(String);
    expect(hits, `Contractual wording belongs in recoverMandateCopy.ts:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it("the summary's EN strings are an explicit fallback, not inline copy", () => {
    const src = stripComments(read(SUMMARY));
    // The only place a duration literal may appear is the named fallback object.
    expect(src).toContain("EN_FALLBACK");
    const beforeFallback = src.slice(0, src.indexOf("EN_FALLBACK = {"));
    expect(beforeFallback).not.toMatch(/24 months/i);
  });

  it("the stale 'English-only, not translated' note is gone from the popup", () => {
    // FR/ES wording shipped in RECOVER-3-FIX; the note described a state that
    // stopped being true and justified the drift.
    expect(read(MODAL)).not.toMatch(/NOT machine-translated into FR\/ES yet/);
  });
});