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

The bridge defaults to unavailable when any secret is absent. It must not be
enabled by setting a public URL or by reusing `INTERNAL_CALL_SECRET`.

Operational sequence:

1. Deploy the exact audited wheel (SHA-256 documented in `P4_ARTIFACT_AUDIT`).
2. Configure P4's private EvidenceStore adapter over `P4EvidenceProjection`.
3. Create projections in shadow mode from `PaymentsAnalysisVerified`.
4. Call `requestP4Estimate`; inspect stored `P4StatisticalEstimate` outputs.
5. Only after real-data calibration/OOD review, expose the versioned record to
   P5's `adaptP4StatisticalEstimate` adapter.
