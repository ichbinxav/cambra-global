# P4 v0.3.0 artifact audit

## Verdict

**Optional external estimator integrity verified; production activation is not
sealed.** The repository-native P4 benchmark layer is independently defined by
`p4BenchmarkIntelligence.ts`, `BenchmarkContribution`, `BenchmarkCohort` and
the retained `AnonymizedIntelligenceAggregate` boundary. The audited external
artefact is an optional, more advanced estimator and is not required for the
repository-level P4 statistical benchmark seal.

## Verified evidence

- The supplied desktop wheel SHA-256 is
  `8e9b3fdaa3bfc90456db9a88185e8be14111c3d4623cd3d10028e3f2be0d810b`.
  It matches the wheel embedded in the supplied ZIP byte-for-byte.
- Isolated P4 source compiled under Python 3.12.
- The complete isolated suite passed: **81 tests**; coverage exceeded the
  configured 90% threshold in this audit run.
- Ruff passed. The FastAPI OpenAPI contract exposes `/v1/p4/estimate`.
- A forbidden-output scan passed: P4 contains no P5 decision/savings/offer
  objects.

## Contract fit with P5

P4 supplies versioned statistical estimates, intervals, support, OOD,
calibration, training cutoff, expiry and lineage. This fits P5's benchmark
evidence boundary. P4's BPS targets map to P5 ppm only at the adapter edge.

P4 does **not** and must not supply a complete provider offer, candidate,
eligibility decision, merchant savings, BATNA or strategy. P5 retains those
responsibilities.

## Mandatory coupling rules for optional estimator activation

1. Adapt P3 factual observations into P4's private `EvidenceStore`; do not
   send raw observations through the scoring API.
2. Resolve `ModelVersion.created_at`/registry publication time into P5's
   required `knownAt`. Refuse historical evaluations if it is later than P5
   `asOf`.
3. Require matching `TargetSpec`, source population and fee perimeter.
4. Persist P4 model, lineage, interval/calibration, support/OOD and expiry in
   P5's version/evidence bundle.
5. Treat `NO_RELIABLE_ESTIMATE` or P4 OOD as P5 abstention/evidence gaps, not
   zero value or an average rate.
6. Run the P1–P5 repository regression suite once the actual storage/service
   adapters are introduced.
