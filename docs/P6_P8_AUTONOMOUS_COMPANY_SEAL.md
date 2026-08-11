# CAMBRA P6–P8 — Autonomous Company Technical Seal

Status: **repository implementation complete; production/runtime validation still required**.

This seal describes what the code now proves. It does not claim that CAMBRA has scanned every European merchant, achieved autonomous commercial performance, or validated document extraction against real tenant files in production.

## P6 — Lead Discovery & Market Intelligence

`alwaysOnLeadDiscoveryWorker` remains the hourly discovery/reservoir loop and now also writes an immutable `CommercialIntelligenceSnapshot` containing:

- company-first deduplication and suppression state;
- observed TAM/SAM/SOM lower bounds;
- country, vertical, provider and commerce-technology segments;
- Top 100 and Top 1000 evidence-weighted priorities;
- hot-market and hot-vertical projections;
- an admin-only lead graph connecting companies, contacts, providers and technologies;
- pipeline forecast grouped by country/provider, excluding unknown monetary values;
- won/lost learning cohorts with a minimum sample of 10 and no automatic policy mutation;
- explicit source coverage and data-quality unknowns.

The current live source adapters are narrower than the product vision: Apollo is the company/contact discovery source and Clay is the optional enrichment source. Shopify, WooCommerce, BigCommerce, PrestaShop, Magento, Wix, TikTok Shop, Amazon Brand Stores, commercial registers, marketplaces and social networks are signal categories, not independently implemented/licensed discovery adapters in this repository. Therefore CAMBRA reports `claimed_continuous_universe_coverage=false` and never promotes the observed lead reservoir into a fabricated total-European TAM.

## P7 — Commercial Intelligence & Autonomous Outreach

P7 consolidates the existing governed commercial stack:

- contact discovery through company-first Apollo ingestion and provider-contact resolution;
- evidence-bounded ICP scoring and the durable ready reservoir;
- policy/business-hour/warm-up/suppression/idempotency-gated email outreach;
- inbound reply classification, routine multi-turn email, follow-ups and real Outlook scheduling where configured;
- provider negotiation with explicit mandate/market/policy authority and L4 founder approval for final or material terms;
- Attio synchronization with a local OutboundLead fallback;
- deterministic revenue-stage projection and forecast that leaves missing economic value unknown;
- acquisition, outreach-experiment and negotiation-memory learning without widening authority.

Email is the only implemented autonomous outbound channel. LinkedIn and arbitrary website-form automation are not production channels in this repository; adding them requires official connectors/API terms, identity policy, opt-out/suppression parity, rate limits and a new channel-specific approval/security review. The system must not describe those channels as live.

## P8 — Autonomous European Infrastructure Company

`autonomousCompanyOrchestrator` is the coordination layer above existing P6/P7/P12/P16/P17/P18 systems. Every six hours it coordinates commercial discovery/intelligence, pipeline projection, outreach learning and the executive digest, then emits a durable company coordination event. Maintenance continues on its independent ten-minute schedule so a failed coordinator cannot disable recovery monitoring.

The orchestrator may create a reversible `FounderDecision` proposal when an observed market has enough sample. It never sends outreach directly, modifies CommercialPolicy, accepts a contract, starts a migration, spends, signs or charges. Existing domain gates remain authoritative.

Founder OS now exposes the latest commercial-intelligence snapshot, open founder decisions, a corrected lead-conversion projection based on `stage/revenue_stage`, and weighted pipeline with known/unknown monetary counts.

## Document and invoice extractor v2

`processUploadedFile` now uses the shared `documentExtraction.ts` contract:

1. authenticated owner/brand resolution;
2. allowlisted `https://media.base44.com` URL with redirects refused;
3. one fetch only, 15 MB hard limit, extension plus magic/signature validation and SHA-256 checksum;
4. independent Claude and OpenAI document reads (both environment gates must be enabled);
5. strict structured extraction with explicit document type, ISO currency, real dates, decimal-string major units and source evidence;
6. exact conversion to integer minor units and deterministic semantic checks;
7. normalized cross-model comparison with a 0.5%/one-minor-unit tolerance;
8. immutable StatementImport audit, duplicate replay by brand/checksum and no raw model-response persistence;
9. PaymentsProfile/AnalyzerInput projection only when both models agree, the document is an eligible EUR payments statement and all deterministic checks pass.

Supported active formats are PDF, PNG, JPEG, WebP, GIF, CSV and JSON. CSV/JSON must be valid text and the independent Claude path refuses text files above 1 MB. XLS/XLSX are deliberately rejected in v2: the former UI advertised XLSX even though no verified parser existed. Invoices, contracts, proposals, tax documents and bank statements may be classified/audited but do not become Analyzer inputs: an invoice total is not silently reinterpreted as a monthly run-rate. Vault uploads in extractable categories call the same v2 worker and link the resulting StatementImport audit back to the original Document.

The extractor does not turn an uploaded statement into `PaymentsAnalysisVerified`, does not average three invoices and does not authorize Recover billing. Those are separate economic-evidence steps. A successful extraction is parse evidence, not verified savings or financial truth.

## Repository proof

The dedicated suites cover file signatures, invalid JSON, exact minor-unit conversion, invalid dates/currency, 34% fee rejection, gross/fees/net consistency, independent-model absence/disagreement, EUR-only Analyzer projection, company deduplication, observed-only TAM/SAM/SOM, Top 100/1000, lead graph privacy, unknown-value forecast handling, learning sample gates, P8 coordination and authority boundaries.

## Production proof still required

- deploy/sync the new entities, shared modules, functions and schedules to Base44;
- configure both extraction gates and provider keys only after DPA/retention review;
- run a redacted golden corpus covering real Stripe, Adyen, Worldline, Nexi, PayPal, Mollie and carrier/SaaS documents across languages/layouts;
- record field-level precision/recall, false-accept rate and review rate before enabling merchant-facing “verified” language;
- verify fresh `CommercialIntelligenceSnapshot`, `LeadReservoirSnapshot`, `MaintenanceRun`, coordination AgentTask/Event and ExecutiveDigest rows at their configured cadence;
- license and implement additional discovery adapters before claiming broad European source coverage;
- validate real merchant acquisition/conversation/meeting/provider-negotiation outcomes; repository tests cannot prove commercial autonomy.
