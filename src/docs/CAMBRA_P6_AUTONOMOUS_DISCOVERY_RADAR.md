# CAMBRA P6 — Autonomous Discovery Radar and Apollo Sunset Harvest

## Scope

P6 finds, resolves, deduplicates, pre-scores, selectively enriches and prioritizes merchant companies. It does not verify merchant savings and it does not send outreach. P7 determines commercial strategy; P8 may execute only through the independent `CommercialPolicy`, sending-profile, jurisdiction, suppression, cost and emergency gates.

## Canonical architecture

The existing `OutboundLead` warehouse remains canonical and provider-independent. `LeadDiscoveryCheckpoint` stores bounded search-space progress and provider health. Apollo IDs are stored only in `external_refs_json`; observed facts and estimation boundaries live in `source_evidence_json`.

The real loop is:

`alwaysOnLeadDiscoveryWorker` → P1 market capability filter → oldest eligible search partition → `leadOrchestrator` → `leadDiscoveryAgent` provider adapter → company deduplication → deterministic pre-score → selective `leadEnrichmentAgent` → `leadScoringAgent` → canonical warehouse → reservoir and commercial-intelligence snapshots.

`leadScoringAgent` is resilient to a missing, partial or malformed model response. It always retains the deterministic evidence path as canonical fallback, records the model state and weights in `score_breakdown_json`, caps a lead without a usable email at 59 and emits `lead_scoring_model_degraded` for operational visibility. The fallback never fabricates signals and never activates outbound. The shared Anthropic boundary consumes all response blocks of type `text` and excludes thinking/tool blocks.

The hourly worker uses `SchedulerRun` slot claims. Each source/country/vertical/employee-band partition remembers its page, counters, failures, backoff and circuit state. It does not restart at page one after every run.

## Apollo sunset adapter

Apollo is a temporary source adapter until `2026-09-07T23:59:59.999Z`. The adapter:

- verifies the key through `GET /api/v1/auth/health` without returning the key;
- attempts the zero-credit API-usage endpoint and surfaces missing scope honestly;
- uses Organization Search first, budgeted at Apollo's documented one credit per page, to establish canonical companies;
- follows with People API Search, documented by Apollo as zero credits, only to identify relevant decision-makers;
- deduplicates companies before any credit-consuming enrichment;
- enriches only candidates above the deterministic threshold and rolling daily/seven-day guardrails;
- never requests personal email, phone or waterfall enrichment;
- applies retry limits, exponential backoff, rate-limit handling and a durable circuit breaker;
- expires gracefully while retaining all canonical companies, intelligence and market-sizing data.

Primary provider documentation: [authentication](https://docs.apollo.io/reference/authentication), [Organization Search](https://docs.apollo.io/reference/organization-search), [People API Search](https://docs.apollo.io/reference/people-api-search), [People Enrichment](https://docs.apollo.io/reference/people-enrichment), [usage/rate limits](https://docs.apollo.io/reference/view-api-usage-stats), and [API pricing/credits](https://docs.apollo.io/docs/api-pricing).

## Cost and quality boundaries

`CostBudgetControl` and `CostUsageEvent` remain authoritative. Discovery and enrichment reserve cost before calling a provider. Enrichment has separate daily and seven-day limits, a freshness window and a high-value threshold. Generic, personal-provider, invalid and company-mismatched emails are not accepted as verified professional contacts.

The useful metric is high-fit, contactable opportunity per observed external cost, not raw lead count. Unknown TPV, opportunity, provider stack or credit balance remains unknown.

## Admin UX

`/admin/discovery` opens with the autonomous radar state, real counters, provider/scheduler health, market sizing, filters and prioritized merchants. Manual domain investigation is secondary and runs through the same canonical lead chain. No placeholder companies or fake counters are permitted.

## Activation and runtime proof

Discovery has its own explicit `icp_json.discovery_enabled` control on the existing merchant-acquisition policy record. Toggling it does not activate outbound and does not alter the policy's outbound status. A production claim additionally requires:

1. Apollo auth diagnostic PASS;
2. current scheduler heartbeat and duplicate-slot evidence;
3. a successful checkpointed discovery cycle;
4. persisted unique companies and reservoir snapshot;
5. observed selective enrichment/cost evidence when high-value candidates exist.

## Observed production proof — 2026-08-11

The real Base44 runtime passed Apollo authentication without exposing the secret. A bounded Organization Search partition scanned 10 companies, persisted five new canonical companies, surfaced seven decision-maker candidates and rejected five low-score candidates with explicit reasons. A later end-to-end worker cycle recorded one company scanned, zero stored, one quality rejection and zero invented contacts. Scheduled and manual worker claims completed; outbound remained `draft`, effective send capacity stayed zero and no record became outreach-ready. No candidate in these bounded proof runs crossed the selective enrichment threshold, so zero paid enrichment was attempted and that boundary remains visible rather than simulated.
