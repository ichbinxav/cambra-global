# CAMBRA Discovery V2 — Existing Capability Matrix

Audit baseline: CAMBRA v0.97.0, source SHA `a52b65949d30635a794d6823564b5c54a89688a7` before the Discovery V2 delta.

Quota preflight: 276 deployed physical Base44 functions and 27 consolidated logical routes in the current tree (the previous 25 plus Discovery V2 and Disaster Recovery). Discovery V2 uses one strict-admin logical route family behind `adminSummaries` and adds **zero physical function names**. Stripe, billing and public webhook trust boundaries remain separate.

| Requirement | Classification | Canonical implementation reused / extension |
|---|---|---|
| Founder Discovery route and Admin navigation | EXISTS_NEEDS_EXTENSION | `src/pages/admin/AdminDiscovery.jsx`, `/admin/discovery` in `src/App.jsx` and `AdminLayout.jsx`; replace only this page's composition. |
| Aggregate Admin backend host | EXISTS_NEEDS_EXTENSION | `base44/functions/adminSummaries/entry.ts`; add `discovery_v2_*` logical actions through a shared module. |
| Company-first merchant discovery | EXISTS_AND_REUSE | `leadDiscoveryAgent`, `leadIntelligenceProvider.ts`, `OutboundLead`. |
| Company deduplication / canonical identity | EXISTS_AND_REUSE | `canonical_company_key` and pre-enrichment dedupe in `leadDiscoveryAgent` / `alwaysOnLeadDiscoveryWorker`. |
| Apollo / Instantly / Auto source abstraction | EXISTS_NEEDS_EXTENSION | `leadIntelligenceProvider.ts`; surface capability and availability in the planner. Apollo sunset remains 2026-09-07. |
| Query capability registry and planner | MISSING | Add versioned shared config/planner; no function or parallel provider abstraction. |
| Progressive merchant enrichment | EXISTS_NEEDS_EXTENSION | `leadEnrichmentAgent`, `leadScoringAgent`; invoke only after local pre-fit and attribute reservations to the Discovery run. |
| Partner canonical data | EXISTS_AND_REUSE | `PartnerProspect`; do not create a second partner entity. Existing autonomous partner worker is **not** reused for Discovery execution because it can send. |
| Safe partner external organization-only adapter | EXTERNAL_PROVIDER_LIMITATION | Current partner worker combines discovery and outreach. Discovery V2 uses existing canonical/cache results and declares source limitations instead of triggering sends. |
| Provider identity, evidence, pricing and authorization | EXISTS_AND_REUSE | `Provider`, `ProviderCandidate`, `ProviderLegalEntity`, `ProviderAuthorization`, `ProviderPricingVersion`, Provider Intelligence P2–P4. |
| Provider open-ended external discovery | PARTIAL | Existing `providerResearchAgent` researches a named provider and is paid. V2 is gap-first; it never invents open-web coverage. |
| Rate/benchmark contribution | EXISTS_NEEDS_EXTENSION | Existing pricing/evidence and `BenchmarkContribution`; V2 adds eligibility/impact preview only, with no blind bulk promotion. |
| Cost budgets and atomic reservation | EXISTS_NEEDS_EXTENSION | `CostBudgetControl`, `CostUsageEvent`, `costGovernance.ts`; add run/stage/reason metadata and per-run CAS hard-cap claim. |
| Immutable Discovery execution evidence | MISSING | Add one justified domain entity, `DiscoveryExecutionRun`. `AgentRun` has incompatible agent/approval enums; `SchedulerRun` is an operational lease; `ContinuousDiscoveryRun` is per-brand infrastructure discovery. |
| Saved searches / schedules | EXISTS_NEEDS_EXTENSION | Reuse generic, versioned `FounderSavedView` with `view_type=discovery_saved_search`; existing hourly discovery worker is the only scheduler host. |
| Discovery overview snapshots / reservoir | EXISTS_AND_REUSE | `LeadReservoirSnapshot`, `CommercialIntelligenceSnapshot`, existing discovery admin aggregation. |
| Suppression / do-not-contact | EXISTS_AND_REUSE | `ContactSuppression`, reservoir suppression and outbound eligibility. Discovery itself never sends. |
| Ask CAMBRA | EXISTS_NEEDS_EXTENSION | Reuse `copilotChat`; pass structured Discovery scope and capability/cost context. No new chat function. |
| Founder approvals / emergency stop | EXISTS_AND_REUSE | Existing Founder approval and global cost/outbound controls; hard caps override every action. |
| Scheduling dedupe and observability | EXISTS_AND_REUSE | `claimSchedulerRun`, `SchedulerRun`, `AgentTask`, `OperationalLog`, cost ledger. |
| Actual merchant rates / verified savings before onboarding | MERCHANT_DATA_REQUIRED | Must remain unavailable/locked until merchant evidence exists. Never a Discovery-source claim. |
| Shipping/SaaS and non-payments commercial discovery | FUTURE_ONLY | Outside current Payments V1 product scope. |

Implementation decision: one new entity is the minimum truthful delta. Everything else is frontend composition, shared modules, extensions to existing agents and one route family hosted by an already deployed strict-admin function.

## Implemented delta

- Query planner, capability registry, source health and deterministic natural-language interpretation now live in `base44/shared/discoveryV2Planner.ts`.
- Founder actions, the twelve-KPI overview, progressive runs, Saved Searches, schedules, comparison, safe pipeline actions and benchmark preview now share the existing strict-admin `adminSummaries` host through `base44/shared/discoveryV2Admin.ts`.
- `DiscoveryExecutionRun` is the single new domain entity. Completed execution evidence is never rewritten; its retention period remains explicitly `LEGAL_REVIEW_REQUIRED` in the central retention matrix.
- Provider `NEW`, `REFRESH` and `NEW_AND_EXISTING` modes use `ProviderCandidate` and `Provider` respectively. Candidate rows are visibly unverified and never promoted to canonical truth by the Discovery workspace.
- Scheduled searches reuse `alwaysOnLeadDiscoveryWorker`, rebuild the plan at execution time and re-check both the per-run hard cap and the global monthly budget.
- No physical function name, outreach action or parallel provider abstraction was added. External partner organization-only discovery and open-ended provider discovery remain truthful provider limitations, not simulated coverage.
