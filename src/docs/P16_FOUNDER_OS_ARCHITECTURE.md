# P16 — CAMBRA Founder OS & Autonomous Company Command Center

## Objective

Founder OS sits above CAMBRA's autonomous operating loops. It does not replace domain engines or create a second source of truth. The operating model is:

`AUTONOMOUS COMPANY ENGINE → EVENTS / DOMAIN TRUTH → FOUNDER OS → HUMAN GOVERNANCE`

The founder experience is organized around `SEE → WHY → RECOMMEND → DO → AUDIT`.

## Canonical company intelligence

`base44/shared/founderOSData.ts` builds a governed cross-domain snapshot from the existing Finance, RevenueLifecycle, Aggregate, Provider Economics, CRM, migration, incident, approval and AI workforce records. `base44/shared/founderOSCore.ts` owns the canonical Founder OS metric definitions.

Money is not inferred by the LLM. Collected revenue is merchant-side evidenced collected cash plus provider-side evidenced paid revenue. Verified savings, Aggregate addressable/committed volume and provider accrual preserve their existing truth boundaries.

`founderOSQuery` is the read/query layer for:

- company summary and recommended actions;
- metric definitions and `WHY?` explanations;
- universal bounded exact/substring company search;
- Merchant 360 and Provider 360;
- governed relationship graph projection;
- negotiation war room;
- approval/decision evidence.

The first search implementation is deliberately labeled `semantic_search=false`; P16 does not claim embeddings that do not exist.

## Why?

`founderOSQuery(mode=why_metric)` traverses deterministic records and returns evidenced contributors plus a clear boundary: direct relationships are facts; broader causal explanations are operational hypotheses unless directly evidenced. AI is allowed to explain this output but cannot mutate the underlying metrics.

## Do it

`founderOSCommand` is the single P16 action gateway. Commands are classified, previewed and audited. Material approvals require an explicit confirmation turn. Existing domain resolvers remain authoritative: commercial/aggregate L4 decisions are sent to `resolveCommercialApproval`, not raw-updated by chat.

Every command writes `FounderCommandAudit` and a best-effort `OperationalLog` event. Strategy directives are explicit records and cannot override billing, security, legal or contract authority.

The existing `AdminApprovals` path is also hardened: aggregate contract proposal/execution approvals use the canonical commercial resolver, and an unknown L4 action is fail-closed rather than directly setting `Approval.status=approved`.

## Simulations

`founderOSSimulation` records scenario assumptions and outputs in `FounderSimulation`. Every record and response is structurally `production_effect=false`. Unknown ARPA/LTV/capacity inputs remain null/unknown rather than being invented.

## Chief of Staff

`founderChiefOfStaff` receives a deterministic evidence snapshot and active explicit strategy directives. The model prompt forbids invented metrics, trends, targets, forecasts and causal claims. Its narrative is never financial truth; the returned evidence snapshot remains inspectable.

## Chat

`chatChiefOrchestrator` is upgraded into `Ask CAMBRA` and exposes Founder OS as first-class tools:

- `founder_os_query`;
- `founder_chief_of_staff`;
- `founder_simulation`;
- `founder_command`.

For company questions it should prefer the governed query layer over raw entity reading. For action requests, the command gateway returns an action preview and confirmation token; confirmation replays the same command key with `confirmed=true`.

`ChatMessage.tool_result_json` stores a structured rendering payload for the Admin chat. It is an explanation/evidence projection, not an authoritative copy of domain truth.

## Founder OS Home

`/admin` now acts as the P16 home cockpit with:

- canonical company KPI strip and confidence labels;
- evidence-bounded Chief of Staff brief;
- `What needs you` founder-attention queue;
- recommended actions, risks and operational/AI/provider-economics summaries;
- direct `Why?` links into Ask CAMBRA;
- prominent Ask CAMBRA entry.

The global Admin top bar includes a search/ask command entry on desktop and an Ask CAMBRA control on mobile. Existing specialized dashboards remain drill-down surfaces and sources of truth.

## Information hierarchy

P16 uses three levels:

1. Executive — Founder OS Home / What needs you.
2. Diagnostic — Why, 360 pages/projections, war room, risks/opportunities.
3. Raw/audit — existing domain records, Activity Log, Approval history, evidence and command audit.

## Security and authority

All new P16 data entities are admin-only. `agentAuthority.assertNoMaterialAuthority()` remains a release invariant: no AI agent receives `CAN_APPROVE`, `CAN_SIGN`, `CAN_SPEND` or `CAN_CHARGE`.

Founder OS chat is an interface over authority, not a new source of authority. Production-critical Developer operations, money movement, legal decisions and material commercial commitments continue to use their existing domain gates.

## Truthful P16 limitations

This technical seal establishes the operating primitives, not every future visualization in the long-term Founder OS vision. In particular:

- universal search is bounded exact/substring today, not vector-semantic search;
- simulations currently cover acquisition scaling, conversion and Aggregate growth primitives and explicitly expose missing variables;
- the relationship graph is a governed data projection, not a raw-data graph database;
- long-horizon forecasting remains unavailable where P15 correctly lacks real merchant/provider history;
- Board/Investor report generation continues to reuse existing governed agents rather than creating a second financial model;
- real-world founder usability and autonomy still require genuine merchant operations/pilot evidence.

These are boundaries, not silent TODOs hidden behind fabricated UI.
