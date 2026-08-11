# P5 Opportunity Engine

## Status

`p5-opportunity-engine-1.0.0` is the canonical repository-native P5 decision
domain. `buildCanonicalOpportunity` produces the versioned
`MerchantOpportunity` record in shadow or authoritative mode without changing
P1–P4 truth or granting downstream execution authority.

## Repository integration map

| P5 need | Canonical source | P5 boundary |
| --- | --- | --- |
| Country, currency and historical FX truth | P1 `MerchantMarketContext`, `marketContext.ts`, `marketMoney.ts` | Caller supplies the resolved market/currency snapshot. P5 never resolves a country or FX rate. |
| Provider/product availability and eligibility | P2 `ProviderMarketAvailability`, `ProviderProductCurrencySupport`, `ProviderMerchantEligibility`, `ProviderAuthorization` | `assessEligibility` consumes a compact fact object and preserves `UNKNOWN`. |
| Rate facts and fee components | P3 `ProviderPricingVersion`, `RateComponent`, `p3RateIntelligence` | `adaptP3Terms` maps P3 components into a `CommercialTermsPackage`; P5 does not write rate truth. |
| Benchmark distributions | P4 `BenchmarkCohort`, optional `P4StatisticalEstimate` | `estimateAchievableTerms` requires explicit derivation/model version, sample sufficiency and OOD state. A benchmark remains evidence, never an automatic offer. |
| Current merchant measurement | `PaymentsAnalysisVerified` / `AnalyzerResult` | A future mapper builds `MerchantEconomicSnapshot`; missing fields remain missing rather than becoming zero. |

## Core guarantees

- Currency is integer minor units and rates are integer ppm. There is no float
  money arithmetic in P5 calculations.
- `MerchantEconomicSnapshot` validates explicit completeness and has a stable
  semantic fingerprint.
- `MerchantCostEngine` is `evaluateMerchantCost(snapshot, terms)`. It returns
  a cost breakdown, unresolved components, assumptions and confidence.
- `STRICT`, `BOUNDED`, and `MODELLED` are explicit mix policies. Strict mode
  refuses material mix-dependent fees when the mix is absent.
- Candidate eligibility runs before recommendation. `UNKNOWN` is not eligible.
- Counterfactual values are named `grossModeledSavingsMinor` and
  `netModeledSavingsMinor`; unknown transition cost is `null`, never zero.
- P4 evidence is not treated as an automatically attainable offer. OOD causes
  insufficient-evidence abstention.
- Probability components remain decomposed; the engine documents that their
  arithmetic summary is not an independence-based joint probability.
- Friction and time-to-value preserve unknown dimensions. Data gaps become
  material when plausible values change the recommended action.
- BATNA excludes ineligible, non-achievable and low-confidence alternatives.
  Economic indifference is a reproducible ppm threshold with explicit horizon.
- Graph sequencing cycles are rejected, Pareto filtering is conservative, and
  complementary value is attributed from the combined counterfactual rather
  than a naive sum of standalone opportunities.
- Decisions can be `MIGRATE`, `NEGOTIATE`, `COLLECT_DATA`, `DO_NOTHING`, or
  `ABSTAIN`; CAMBRA revenue is not an input to selection.
- Evidence packs, version bundles, temporal leakage validation, freshness and
  outcome validation are defined without any execution or outbound capability.

## Deferred integration contract

P4 must supply, through an adapter, `modelVersion`, `sampleSize`, `oodState`,
`uncertaintyPpm`, and a stable `reference`. Until then P5 does not produce an
achievable offer from existing aggregate cohorts alone.

### P4 v0.3.0 adapter

The audited P4 artefact has these fields under different names. The pure
`adaptP4StatisticalEstimate` adapter maps its `StatisticalRateEstimate`,
`PredictionInterval`, `TargetSpec` and immutable `ModelVersion` manifest into
P5 benchmark evidence. It requires an explicit `knownAt` supplied by the
registry adapter; P4's public estimate response alone does not say when a
model version became knowable, which is required for P5 historical replay.

The adapter accepts only P4 `VALID` or `FALLBACK` BPS targets with matching
population/perimeter and model manifest. It maps `BORDERLINE` to
`EDGE_OF_DISTRIBUTION`, converts interval width from BPS to ppm, and labels the
result `P4_STATISTICAL_INFERENCE_NOT_P3_RATE_TRUTH`. A P4 estimate still cannot
make a complete commercial terms package or a recommendation without P3 terms
and P5 policy.

The canonical persistence contract now exists as `MerchantOpportunity.jsonc`.
Base44 runtime materialization, atomic write orchestration, outcome feedback
and a user-facing feature flag remain production-activation work and are not
simulated by the pure engine.
