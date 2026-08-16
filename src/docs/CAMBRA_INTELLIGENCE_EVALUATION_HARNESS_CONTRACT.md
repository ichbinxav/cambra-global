# CAMBRA Intelligence — single Evaluation Harness contract

Status: **contract implemented locally; evidence and runtime unverified**  
Scope: Intelligence v2 §17 and Orchestration §§13–14 prerequisite only.

This slice defines the one future evaluation philosophy shared by CPIC,
Adaptive Lead, Analyzer, Negotiation and later CAMBRA-trained models. It does
not train or evaluate a model, create a dataset, register an artifact, promote a
candidate, serve a prediction or grant authority.

## Canonical artifacts

- `config/intelligence/evaluation-harness.v1.json` is the machine-readable
  schema authority for problems, metrics, candidates, frozen holdouts,
  segments, calibration, safety, cost/latency, reproducibility, promotion
  packets and the complete evaluation packet.
- `base44/shared/intelligenceEvaluationContract.ts` is the pure fail-closed
  validator. It performs no I/O and creates no Base44 entity or function.
- `scripts/check-intelligence-evaluation-contract.mjs` checks schema coverage,
  empty registries and absence of runtime/promotion claims.
- `src/lib/intelligenceEvaluationContract.test.js` exercises the contract and
  the hard rejection paths.

The existing Feature, Label, Dataset, Model and Prediction registries remain the
single shared registry family and still contain zero records and zero runtime
evidence.

## Fail-closed boundary

The validator rejects at least:

- empty evidence references;
- a problem without an actionable decision, owner, label, authority, fallback
  and the four mandatory baselines;
- a global-only metric without population, window, uncertainty, materiality,
  source and segment cuts;
- a non-frozen, mutable or training-overlapping holdout;
- post-treatment, post-outcome, future-information or identity-split leakage;
- a missing mandatory segment or a material/unknown segment regression;
- a missing or failed calibration report;
- an incomplete adversarial suite, tenant leakage, authority regression or
  unsupported claims above threshold;
- cost above hard cap, non-positive net utility or latency above SLO;
- missing immutable lineage, hash mismatch or rerun outside tolerance;
- an incomplete promotion packet or missing scoped approval evidence.

A complete hypothetical packet receives only:

`CONTRACT_VALID_EVIDENCE_UNVERIFIED_HUMAN_REVIEW_REQUIRED`

It always returns `evidence_verified: false`, `registration_allowed: false`,
`promotion_allowed: false`, `serving_allowed: false` and
`authority_granted: false`. Referenced evidence still requires independent
verification against one immutable source/runtime identity.

## Verification

```bash
node scripts/check-intelligence-evaluation-contract.mjs
npx vitest run src/lib/intelligenceEvaluationContract.test.js
deno check base44/shared/intelligenceEvaluationContract.ts
```

## Still blocked

- approved problem and labels;
- sealed dataset and real frozen holdout;
- training run and immutable model artifact;
- executed evaluation, signed evidence and independent review;
- shadow/canary/outcome/rollback evidence;
- runtime cost attribution and parity;
- any model-readiness, proprietary-model or production seal.
