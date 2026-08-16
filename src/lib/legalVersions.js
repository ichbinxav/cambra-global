// legalVersions — frontend mirror of base44/shared/legalAcceptance.ts (DPA-1).
//
// The app bundle cannot import the Deno-side module, so these constants are
// duplicated here. That duplication is REAL RISK — two versions drifting apart
// would mean the UI shows one version and the record stores another — so
// src/lib/legalAcceptance.test.js asserts three things at once:
//   1. these constants equal the ones in base44/shared/legalAcceptance.ts;
//   2. they equal the versions actually published in the legal content;
//   3. the acceptance record produced from them is accepted by the validator.
// Change a version in one place and that test fails.

export const CURRENT_TERMS_VERSION = "2026-08-16";
export const CURRENT_DPA_VERSION = "1.0";

/** Mirrors coversCurrentVersions() in base44/shared/legalAcceptance.ts. */
export function coversCurrentVersions(row) {
  return String(row?.terms_version || "") === CURRENT_TERMS_VERSION
    && String(row?.dpa_version || "") === CURRENT_DPA_VERSION;
}
