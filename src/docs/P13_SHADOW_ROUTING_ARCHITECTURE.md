# CAMBRA P13 — Payment Routing Intelligence & Shadow Orchestration

## Product boundary

P13 is **shadow/simulation only**. `REAL_ROUTING_ALLOWED=false` is a hard code boundary in `base44/shared/shadowRoutingCore.ts`. No P13 function creates or confirms PaymentIntents, captures, refunds, retries authorizations, changes checkout configuration, deploys provider routing rules, or becomes system of record for payment authorization.

The operating loop is:

`OBSERVE → NORMALIZE/MINIMIZE → BUILD CANDIDATES → PRICE → ESTIMATE (only where evidenced) → SHADOW DECISION → RETROSPECTIVE SIMULATION → OPPORTUNITY → LEARNING → READINESS`

A routing failure is isolated from payment processing, Analyzer, Recover, migration and billing.

## Existing systems reused

P13 reuses `Integration` and `PaymentsAnalysisVerified` for read-only payment evidence; `ProviderPricingVersion` and P12 snapshots for pricing/provenance; `NegotiationCase` for merchant-specific negotiated economics; `Brand` for merchant country/cohort; `Event` for append-only routing events; P12 Knowledge/Moat infrastructure for future aggregated learning; existing Admin authentication and layout.

`PaymentsRateTable` is **not** queried by the routing engine. It remains a legacy producer into P12 Provider Intelligence. Routing consumes `ProviderPricingVersion`.

## Data model

- `PaymentRoutingObservation` — minimized observed payment metadata, either transaction-level or honest `aggregate_window` historical backfill. Explicitly excludes PAN/CVV/raw payloads.
- `RoutingProviderPerformance` — aggregated observed provider performance cohorts. No raw foreign-tenant records.
- `RoutingPolicy` — versioned policy model. P13 permits only simulation use; real execution states exist for forward compatibility but are not consumed by any P13 payment path.
- `ShadowRoutingDecision` — immutable counterfactual decision with actual route, preferred route, pricing provenance, confidence and IntelligenceSnapshot.
- `RoutingSimulation` — reproducible retrospective simulation, never realized savings.
- `RoutingOpportunity` — materially significant counterfactual opportunity with deployable vs migration-required distinction.
- `RoutingReadinessAssessment` — internal R0–R5 framework with `real_routing_allowed=false` in P13.

## Historical truth vs counterfactual truth

Observed actual outcomes and counterfactual estimates are separate fields. A hypothetical route is never labeled as an observed approval. Approval-aware routing is suppressed unless observed `RoutingProviderPerformance` has at least 50 samples; otherwise P13 runs `cost_only`.

Historical `PaymentsAnalysisVerified` can be backfilled only as `aggregate_window`. Missing network, issuer, 3DS and per-transaction outcomes remain missing. No values are fabricated.

## Candidate routes

The actual observed provider is always a candidate. Other providers require compatible P12 pricing. A connected merchant payment Integration marks a candidate `deployable`; otherwise it is `theoretical` and any material opportunity is classified as requiring provider onboarding/migration. This distinction prevents a market opportunity from being represented as a currently routable path.

P13 V1 deliberately does not pretend provider-capability coverage is complete. Country/currency/channel compatibility is enforced when present in Provider Intelligence; missing capability intelligence reduces what can be concluded rather than being invented.

## Pricing precedence

1. actual merchant observed cost for the actual route;
2. merchant-specific approved/closed negotiated economics when representable;
3. P12 `ProviderPricingVersion`, with verified official preferred over observed/inferred;
4. no price / no candidate when intelligence is insufficient.

Every decision stores pricing provenance and a P12 IntelligenceSnapshot.

## Approval intelligence

Only transaction-level observations with actual `approved`/`declined` outcomes enter `RoutingProviderPerformance`. Cohorts can include provider, merchant country/cohort, issuer country, network, method, currency, channel, amount bucket, 3DS and recurring type when observed. Exact/specific performance is preferred; insufficient samples suppress the counterfactual approval estimate.

This is predictive/observational intelligence, not a causal claim. Cross-merchant representativeness must be treated conservatively.

## Cost model

The deterministic V1 cost model supports percentage fee, fixed per-transaction fee and monthly fee amortization over the observation window. P12 pricing can carry richer conditions for future expansion. No LLM participates in numeric routing economics.

## Events

P13 extends the existing `Event` stream with dot-namespaced equivalents of:

- `payment.routing.observed`
- `shadow.route.evaluated`
- `routing.opportunity.created`
- `routing.simulation.completed`

No second event bus is introduced.

## Idempotency and reproducibility

Observations are deduplicated by a stable hash of minimized data. Historical backfill uses the canonical verified-analysis identity. Shadow decisions are unique per observation + routing model version. Simulations hash brand, mode, allowed providers, decision IDs and model version. Intelligence snapshots freeze the decision context so future intelligence does not rewrite history.

## PCI-conscious data minimization

P13 rejects feature payload keys for PAN/card number/CVV/CVC/track data. It is designed for PSP-derived metadata such as network, issuer country, funding type, wallet/payment method, 3DS status and tokenized/derived identifiers where lawfully available. Raw processor payloads are not a routing entity.

A dedicated PCI/privacy/retention assessment remains required before any future expansion of sensitive payment data or real routing.

## Readiness levels

- R0: no usable routing intelligence
- R1: historical shadow analysis
- R2: near-real-time shadow routing with durable transaction observations
- R3: validated routing recommendations
- R4: externally deployed managed routing
- R5: CAMBRA-native orchestration

P13 can compute R0–R3 evidence state, but **R4/R5 activation is intentionally impossible**. `real_routing_allowed` remains false.

## Future activation gate

Before real routing: explicit product decision, PCI DSS scope assessment, PSD2/SCA/regulatory assessment, provider/network contract review, merchant controls, real-time SLA/SLO, circuit breakers/kill switch, incident response, real payment idempotency/duplicate prevention, reconciliation proof, disaster recovery, operational resilience and financial-liability review.

The release manifest adds a permanent `ROUTING ACTIVATION PROHIBITED` manual requirement while this document exists.
