# P14 — CAMBRA Aggregate

## Purpose

CAMBRA Aggregate converts **production-eligible, lawfully usable merchant demand** into a continuously refreshed procurement layer. It reuses Provider Intelligence, Routing Intelligence, Recover, Negotiation, Migration, Communication, Approval, Intelligence Snapshot, Moat and P11 supervision.

It is not a static buying club and it does not create authority that CAMBRA does not possess.

## Truth model

The entire layer maintains three separate quantities:

- **Observed volume** — demand actually observed in eligible merchant data.
- **Addressable volume** — demand that can plausibly be migrated or repriced under current technical/commercial evidence.
- **Committed volume** — demand explicitly authorized/committed through `AggregateCommitment` and still effective.

Observed/addressable volume is never represented to providers as guaranteed or committed. `AggregateCommitment` is the sole P14 primitive that can increase committed volume.

## Core graph

Production merchant evidence → `DemandUnit` → `AggregatePoolMember` → `AggregatePool` → APS/readiness → `AggregateRFP` → canonical `NegotiationCase`/`NegotiationOffer` + `AggregateBid` → L4 proposal approval → `DynamicAgreement`/`AgreementTier` → exact contract comparison → separate L4 contract execution approval → `PrivateRateCard` → `MerchantRateEligibility` → Recover / Shadow Routing / Migration / Moat.

## Authority

Routine RFP and counter-negotiation require an active `aggregate_procurement` `CommercialPolicy` and use the canonical `commercialSendMessage` stack. Material terms remain L4: exclusivity, volume guarantees, minimum volume/spend, financial liability, material brand rights, regulatory exposure, strategic long-term commitments and exact contract execution.

Proposal approval never executes a contract. Agreement activation requires exact contract match, the same contract document, unchanged terms hash and a second L4 approval.

## Dynamic tiering

`AgreementTier` stores machine-readable threshold metric, threshold value, pricing, rebate, secondary conditions, activation mode, provider-validation status, qualification status and progression. Automatic tiers activate only where the executed agreement says they are automatic. Provider-confirmation/manual tiers remain pending until evidence arrives.

## Private rate intelligence

`PrivateRateCard` is confidential and distinct from public/observed `ProviderPricingVersion`. Shadow Routing may consume an active CAMBRA private rate only when that merchant has `MerchantRateEligibility.status = eligible`. Potential eligibility is never treated as routable or guaranteed pricing.

## Data isolation

P14 entities are admin-only. Provider-facing RFPs use anonymized aggregate snapshots. Individual merchant identity and raw merchant pricing are not disclosed as aggregate leverage. Test/demo/internal routing evidence is excluded from demand learning by the existing P13 production-classification gate.

## Operations

Scheduled loops:

- aggregate demand refresh — 6h
- procurement/RFP readiness — 6h
- dynamic agreement/tier progression — 6h
- merchant eligibility — 6h

P11 Supervisor watches stale pools, stale RFPs and qualified tiers awaiting confirmation. P14 also feeds the existing Moat Engine and Knowledge Gap model.
