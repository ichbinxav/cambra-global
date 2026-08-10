# P1 — Europe Country Intelligence Foundation

P1 introduces CAMBRA's deterministic geographic/jurisdictional context layer without replacing the existing payments product, tax engine, Provider Intelligence, Knowledge Graph, ECL, commercial policy or audit systems.

## Canonical market registry

Source of truth: `config/europe-markets.json`, generated into frontend/backend artifacts and drift-checked in `npm run verify`.

Initial registry: AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE, NO, IS, LI, CH, GB, AD.

The registry contains stable identity/institution/currency metadata. It does not contain provider rates, benchmarks, merchant facts, invoice VAT decisions or legal-clearance claims.

## Domain separation

`MerchantMarketContext` keeps legal entity country, tax jurisdictions, home market, operating markets, transaction geography, website markets, billing country, PSP contracting country, provider establishments, settlement currencies and language separate. `Brand.country`, `Brand.billing_country` and `Brand.locale` remain backward-compatible legacy inputs and are not destructively migrated.

Resolution is evidence-first. Strong verified legal/human evidence outranks weaker billing/PSP/transaction/declaration/website/geolocation/locale signals. Ambiguity and conflicting evidence are valid output states. IP/geolocation and language do not become legal jurisdiction.

## Multi-currency and FX

P1 provides integer-minor-unit money observations for EUR, CZK, DKK, HUF, PLN, RON, SEK, NOK, ISK, CHF and GBP. Original amount/currency are preserved. Cross-currency normalization requires an explicit FX rate, source and effective timestamp. P1 contains no current FX feed and never invents a conversion.

Existing Analyzer/Recover/billing currency behavior is not globally rewritten in P1. The new contract is additive and rollout-gated for later migrations.

## Regulatory capability policy

`JurisdictionCapabilityPolicy` independently gates research, discovery, analysis, recommendation, outreach, provider contact, negotiation, mandate, contract, migration, verification, billing and regulated financial activities.

Sensitive missing policy fails closed. Critical stale policy requires review. Policies are effective-dated and versioned. `MarketCapabilityControl` supplies a jurisdiction+capability kill switch. `MarketPolicyOverride` is explicit, scoped, attributed and expiring. Temporary overrides cannot enable the regulated capabilities that P1 keeps blocked.

AI agents cannot override the deterministic policy layer. Production-rollout external communication, Recover mandate/contract, provider negotiation, migration and billing boundaries call the shared market policy runtime. Denied or attempted-bypass decisions are audited through the existing `Event` system.

## Initial policy seed

The seed is deliberately conservative, not a legal opinion:

- research/provider discovery/lead discovery/enrichment: enabled as non-execution intelligence;
- FR/ES Analyzer/Recommend: existing product scope preserved;
- other markets Analyze/Recommend: limited pending provider/rate intelligence;
- Outreach/Provider Contact/Negotiate/Mandate/Contract/Migrate/Verify/Bill: review required;
- Access Bank Account Data/Initiate Payment/Hold Funds/Act as PSP/Act as PSP Agent: blocked.

P8 remains responsible for deep jurisdictional regulatory review. Tax remains the responsibility of the existing Recover tax/VIES/billing system.

## Evidence and temporal truth

The existing immutable `IntelligenceEvidence` ledger is extended rather than duplicated. Market evidence can carry jurisdiction/domain/fact/value/unit/currency, source quality, retrieval/publication/effective dates, verification state, confidence/freshness and supersession links. Historical evidence is retained for reconstruction.

## P2/P3/P4/P5 boundary

`MarketIntelligenceProfile` is seeded only with explicit `NOT_RESEARCHED`, `PENDING_PROVIDER_DISCOVERY`, `PENDING_RATE_INTELLIGENCE`, `PENDING_P4` and `PENDING_P5` states. P1 does not seed provider availability, payment-method statistics, rates, benchmarks, opportunity scores or legal clearance.

The current Analyzer country surface is intentionally not expanded to all 33 markets by P1. Registration in the Europe registry does not imply Analyzer/rate/commercial readiness.

## Rollout and migration

`Brand.market_context_rollout` supports `legacy`, `shadow`, `partial`, `production`. Backfill creates/updates an idempotent `MerchantMarketContext`, preserves legacy fields, records migration provenance, and defaults legacy records to shadow. Sensitive P1 gates are enforced only after explicit production rollout; shadow mode permits legacy behavior while recording the new decision boundary.

## Admin and audit

Admin `/admin/markets` exposes the 33-market registry, currencies, intelligence/launch/regulatory readiness and capability counts. Market policy mutation remains admin-only. Structured events include context resolution/conflict/divergence, policy checks/allows/denials/changes, AI bypass denials, overrides, seed updates and migration backfill.

## P1 truth boundary

P1 is infrastructure. A registered country is not a researched country; a researched country is not Analyzer-ready; Analyzer-ready is not commercial clearance; commercial clearance is not authorization for regulated financial activity.
