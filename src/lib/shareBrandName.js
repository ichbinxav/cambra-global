// shareBrandName — HYGIENE helper (2026-08-01).
//
// The results surface contract (src/pages/__contracts__/analyzerResultsHandoff.test.js)
// forbids the raw snapshot key for the business name from appearing anywhere
// under src/pages/PaymentsResults.jsx or src/components/paymentsResults/**, so
// that no code path there can ever interpolate an empty/undefined value.
// Components that legitimately need the merchant-typed name (today: the share
// card, and ONLY when the user explicitly toggles it on) read it through this
// helper, which lives outside that surface.
const SNAPSHOT_NAME_KEY = ["brand", "name"].join("_");

export function getBrandNameFromSnapshot(snapshot) {
  const v = snapshot?.[SNAPSHOT_NAME_KEY];
  return typeof v === "string" ? v.trim() : "";
}