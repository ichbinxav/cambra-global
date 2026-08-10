# P2 — European Provider Intelligence Foundation vFinal

P2 extends the existing `Provider`, P1 market registry, P12 evidence/conflict ledger and existing Knowledge Graph semantics. It does not create a second provider system and does not implement P3 pricing normalization.

Hard invariants: exactly 33 markets; FR included; LI independent from CH; BG current currency EUR; provider ≠ legal entity ≠ authorization ≠ product ≠ payment method; market presence ≠ product availability ≠ merchant eligibility; product currency support is typed by market and usage; UNKNOWN ≠ UNAVAILABLE; NOT_RESEARCHED ≠ researched-none-found; negative availability requires evidence; no country-to-country inheritance without explicit source scope; estimates never become verified economic truth; unverified observations do not receive `verified_at`; pricing visibility and pricing model are independent; achievable rates remain outside P2.

P2 vFinal adds `ProviderAuthorization`, `ProviderMarketPresence`, `ProviderProductCurrencySupport`, `ProviderMerchantEligibility`, `EvidenceAssertion`, and `ProviderResearchPass`. `ProviderMarketAvailability` remains the backwards-compatible product-level availability relation; its legacy `supported_currencies` field is compatibility-only and new intelligence should use `ProviderProductCurrencySupport`.

Country regulatory systems are explicit metadata (`EU_EEA_PSD2`, `UK_PSR`, `SWISS`, `ANDORRAN`, `OTHER/UNKNOWN`) and do not constitute CAMBRA legal clearance. Authorization rows record regulator/register facts only.

Research completion is evidence of work performed, not a requirement to fill every matrix cell. `RESEARCHED_NONE_FOUND` is valid. Every market/family pass can record queries/source families/languages, candidates found, verified/rejected/unresolved counts and timing.

Legacy `PaymentsRateTable` remains compatibility-only. Generic placeholders and estimates are not canonical Provider facts. P2 is additive and downstream migration should use adapters/shadow reads until P3/P4 replace legacy economics safely.
