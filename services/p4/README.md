# P4 service deployment boundary

P4 is Python/FastAPI and cannot execute inside CAMBRA's Deno functions. Deploy
the audited `cambra-p4==0.3.0` wheel as a private service behind TLS and an
authentication proxy. Configure its P4 `EvidenceStore` to read the private
`P4EvidenceProjection` feed/API; do not let it read browser payloads or write
into P3.

Set these CAMBRA backend secrets after deployment:

- `P4_SERVICE_URL` — private HTTPS base URL, without a trailing slash.
- `P4_SERVICE_TOKEN` — bearer token accepted by the P4 proxy.
- `P4_PSEUDONYMIZATION_KEY` — independent high-entropy HMAC key.
- `P4_MERCHANT_EFFECTIVE_RATE_TARGET_SPEC_ID` — deployed P4 TargetSpec ID for
  `effective_total_cost_rate` / `MERCHANT_OBSERVED` / the agreed fee perimeter.
- `P4_APPROVED_DEPLOYMENT_ID` and `P4_APPROVED_MODEL_VERSION_ID` — exact
  immutable advisory deployment/model identities expected in every response.
- `P4_APPROVED_DEPLOYMENT_STATUS=APPROVED_ADVISORY` — the only accepted local
  control-plane status; it does not grant business or execution authority.
- `P4_APPROVED_DEPLOYMENT_AVAILABLE_AT` and
  `P4_APPROVED_DEPLOYMENT_EXPIRES_AT` — registry-derived UTC bounds. A caller
  `known_at` value cannot replace them.
- `P4_APPROVED_FEE_PERIMETER`, `P4_APPROVED_SOURCE_POPULATION`,
  `P4_APPROVED_HORIZON` and `P4_APPROVED_TARGET_UNIT` — exact semantic target
  dimensions enforced before provider execution and again on response/cache.

The bridge defaults to unavailable when any secret or deployment gate is
absent, future, expired or mismatched. It must not be enabled by setting a
public URL or by reusing `INTERNAL_CALL_SECRET`.

Operational sequence:

1. Deploy the exact audited wheel (SHA-256 documented in `P4_ARTIFACT_AUDIT`).
2. Configure P4's private EvidenceStore adapter over `P4EvidenceProjection`.
3. Create projections in shadow mode from `PaymentsAnalysisVerified`.
4. Call `requestP4Estimate` with a Brand and, when multiple CURRENT projections
   exist, exactly one projection reference. The function rebuilds context from
   server records, checks an idempotent cache before any paid call and rejects
   arbitrary caller context.
5. Inspect stored `P4StatisticalEstimate` outputs. Provider-reported support/OOD
   remains lineage with canonical `UNKNOWN_SUPPORT` until a registered detector
   is independently resolved.
6. Only after real-data calibration/OOD review, expose the versioned record to
   P5's `adaptP4StatisticalEstimate` adapter.
