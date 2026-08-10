# P15 — Provider Revenue Share & Dual-Sided Economics

## Objective

CAMBRA may monetize value on both sides only where legally and contractually permitted. Merchant economics and CAMBRA provider economics are separate throughout negotiation, recommendation, contracting, attribution, accrual, settlement and learning.

## Recommendation firewall

`Merchant Outcome Score` determines merchant suitability/ranking. `Provider Economics Score` never rewrites that ranking. `ProviderEconomicAssessment.compensation_effect_on_ranking` is false by construction. Material/critical conflicts are emitted as `COMMERCIAL_CONFLICT_DETECTED` and surfaced for human governance.

Negotiation order is merchant-first. `collectiveNegotiationAgent` establishes merchant terms, then `providerMonetizationAgent` requests CAMBRA partnership economics separately. A provider compensation proposal is stored in `NegotiationOffer.provider_economics_json` / `AggregateBid.provider_economics_json`; it is not merged into merchant pricing.

## Contract and legal activation

`DynamicAgreement.provider_compensation_terms_json` is independent of `commercial_terms_json`. Provider-compensation tiers use `ProviderCompensationTier`, not `AgreementTier`.

Commercial proposal approval does not activate compensation. Exact contract comparison checks both economic layers. Provider compensation remains `legal_review_required` and `provider_compensation_activation_allowed=false` until `approveProviderMonetizationLegalReview` receives explicit legal-opinion, jurisdiction, disclosure, tax-treatment and settlement-mode references. No legal conclusion is inferred by AI.

## Attribution and revenue lifecycle

`ProviderRevenueAttribution` requires a matching Aggregate membership and DealActivation for the provider; only live/monetizing activations become active attribution.

Provider-side state machine is represented in `ProviderRevenueLedger`:

EXPECTED → ELIGIBLE → ACCRUED → VALIDATION_PENDING → INVOICED/PAYMENT_PENDING → PAID / PARTIALLY_PAID / DISPUTED / CLAWBACK / FAILED / WRITTEN_OFF.

The merchant ledger remains `Invoice` + `PaymentEvent`. Provider revenue uses `ProviderRevenueLedger` + `ProviderRevenueInvoice`. They are never the same revenue event.

## Settlement modes

P15 supports contract-configured `cambra_invoice`, `provider_self_billing`, or `other_contractual_settlement`. CAMBRA never invents a legal invoice number. CAMBRA-issued provider invoices remain validation-pending until an externally valid number/document is supplied. Self-billing advances only from reconciled provider evidence.

## Dynamic tiers

Provider-side tiers may use activated/processed volume, transaction count, activated merchants, provider net revenue, product adoption, retention or growth. Automatic contractual activation still requires the agreement-level legal/disclosure gate; provider-confirmation/manual tiers never self-activate.

## Moat and forecasting

Provider compensation outcomes feed confidential MoatMetric/KnowledgeGap intelligence. Financial Control Tower reports merchant-side revenue, provider-side revenue and total CAMBRA revenue separately. 12/36-month forecasts remain null until real retention, tier and provider-payment history is sufficient.
