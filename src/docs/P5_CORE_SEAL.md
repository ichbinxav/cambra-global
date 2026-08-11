# P5 Core Seal — 2026-08-11

## Verdict

**P5 CORE: PASS.** The authoritative repository-level declaration and final
validation evidence live in `docs/P1_P5_INTELLIGENCE_FOUNDATION_SEAL.md`.

This component audit applies to the repository-native pure decision domain in
`src/lib/p5OpportunityEngine.js` and its canonical storage schema
`base44/entities/MerchantOpportunity.jsonc`. It does not claim Base44 runtime,
user-facing or real-merchant production activation.

## Sealed surface

- Merchant economic snapshot validation, explicit completeness and semantic
  fingerprints.
- Integer minor-unit / ppm financial evaluation, fixed fees, monthly fees,
  minimum commitments, cost breakdown and unresolved inputs.
- P3 rate-term mapping without assigning rate truth or achievable terms to P3.
- Typed candidate generation, deterministic deduplication and P2 eligibility
  where unavailable and unknown states cannot become eligible silently.
- Counterfactual economics with strict modelled-value naming and explicit
  unknown transition cost.
- P4 achievability boundary, OOD abstention and no automatic conversion from
  benchmark to offer.
- Probability, uncertainty, friction, time-to-value and decision-critical
  information gaps.
- BATNA, negotiation boundary inputs, economic indifference threshold,
  conservative Pareto filtering and graph cycle rejection.
- Incremental combined value rather than naive opportunity summation.
- Deterministic strategy conditions, scoring breakdown, temporal leakage check,
  dependency-aware freshness, evidence pack and outcome validation.

## Adversarial audit

| Question | Result |
| --- | --- |
| Can missing data become zero or average? | No. It is unresolved, unknown or an explicit policy assumption. |
| Can money use binary floating-point arithmetic? | No for money/rates: calculations use integer minor units and ppm with `BigInt`. |
| Can an unavailable/unknown provider be recommended? | No. Unavailable is ineligible; unknown is not eligible. |
| Can P4 benchmark data become a promised price? | No. An explicit proposed terms package and model/OOD contract are required. |
| Can overlapping opportunities be summed? | No. Combined value derives from one combined counterfactual. |
| Can CAMBRA revenue bias a decision? | No such input exists in candidate ranking. |
| Can future truth enter historical evaluation? | `validateTemporalContext` fails the evaluation. |
| Can an impossible strategy loop pass? | No. Sequencing edges are cycle checked. |
| Can identical context produce an uncontrolled new semantic result? | No. Snapshot/evaluation fingerprints are deterministic. |

## Evidence

- Focused P5 unit/adversarial tests cover canonical records, deterministic
  economics, evidence gaps, P2 eligibility, P4 sufficiency/OOD, overlap and
  historical replay.
- Exact final test/build counts are recorded only in the release manifest and
  the repository-level P1–P5 seal document generated from the final tree.

## Coupling gate (not part of this seal)

Before an authoritative production decision, runtime adapters must load and
validate the documented P1–P4 version, provenance and `asOf` contracts. P4
must provide model/derivation version, sample size, sufficiency/OOD and a
stable reference. Runtime persistence must use the deterministic evaluation
fingerprint for idempotency and dependency references for invalidation.

These are integration prerequisites, not known correctness defects in the
sealed core. No P6–P8 discovery, outreach, negotiation execution, contract or
migration workflow is included.
