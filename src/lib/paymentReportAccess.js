// Frontend mirror of base44/shared/paymentReportAccess.ts. The contract test
// locks these values together so cached UI can never accept stale documents.
export const COLLECTIVE_TERMS_VERSION = "draft-v0";
export const PUBLIC_TERMS_VERSION = "2026-09-10";
export const PRIVACY_VERSION = "2026-07-24";

export const PAYMENT_REPORT_VERSIONS = Object.freeze({
  collective: COLLECTIVE_TERMS_VERSION,
  public_terms: PUBLIC_TERMS_VERSION,
  privacy: PRIVACY_VERSION,
});
