# CAMBRA OPERATING BIBLE — v0.79.0

Canonical technical/operating reference for the implementation that exists in the repository. This document is not a product wish-list. When a section says PARTIALLY_IMPLEMENTED or MISSING, that status is intentional and must not be upgraded without source evidence.

## 1. Company operating model — IMPLEMENTED

CAMBRA currently operates a payments-first infrastructure intelligence and recovery system. Production product scope remains payments only. The autonomous company layer can discover/qualify prospects, onboard merchants, analyze payment data, identify savings, obtain Recover authority, negotiate, execute governed migration work, verify realized savings, bill, reconcile, collect, learn and aggregate demand. Long-term multi-vertical positioning does not make dormant verticals production features.

Operating loop:

DISCOVER → ACQUIRE → QUALIFY → ONBOARD → CONNECT/UPLOAD DATA → ANALYZE → IDENTIFY SAVINGS → RECOVER → AGGREGATE → NEGOTIATE → APPROVAL WHEN MATERIAL → MIGRATE → VERIFY → BILL → COLLECT → RETAIN/EXPAND → LEARN.

### Product surface — IMPLEMENTED, payments-only

The live merchant surface centers on onboarding/brand state, Connect Tools/uploads, Payments Analyzer, Payments Results, Dashboard, reports, account/billing records, invoices, vault/referrals and Recover acceptance/migration flows. Historical multi-vertical routes may remain dormant/redirected in source; they are not production-enabled product scope. Analyzer output is evidence/confidence bounded and must not be confused with verified realized savings.

### Acquisition and CRM — IMPLEMENTED with policy gates

Lead discovery/enrichment/scoring, CRM synchronization, outbound acquisition, reply handling, follow-up, meeting coordination and acquisition learning exist as separate functions/agents. Routine external communication is allowed only inside active policy/sending controls and deterministic suppression/quality/deliverability gates. Opt-out stops the thread; material commitments escalate. P18 SAFE MODE sits above the sending boundary and acquisition controls, so containment does not depend on an LLM obeying a prompt.

### Merchant operations — IMPLEMENTED

After Recover acceptance, routine provider contact, negotiation, documentation, payments-migration tasking, verification, billing/reconciliation and customer-success/expansion loops are designed to be operated by CAMBRA under explicit authority. The merchant/founder re-enter only for credentials, missing evidence, approvals, legal/material commitments, blocked exceptions or other authority-required states.

### Intelligence / Knowledge Graph / Moat — IMPLEMENTED with governed freshness

Provider pricing/evidence, temporal observations, knowledge claims/conflicts, snapshots, outcomes, gaps and moat metrics form the proprietary intelligence layer. Freshness/source/confidence are preserved where applicable. Stale or contradictory commercial truth is surfaced rather than silently used. Cross-tenant/retention/privacy policy remains subject to the explicit P12 manual/legal gates recorded by release closure.

## 2. Founder OS — IMPLEMENTED

`/admin` is the Founder OS. Deterministic domain systems provide metrics and records; AI Chief of Staff explains and prioritizes but cannot become financial truth. Ask CAMBRA exposes governed read, WHY, simulation and command paths. Natural language never bypasses domain policy or approval gates.

Founder Attention should contain authority-required/material items rather than routine operational work. Founder actions are expected to be observe, ask, decide, approve, intervene and strategize.

## 3. Merchant lifecycle / Recover — IMPLEMENTED

Recover acceptance freezes current evidence, contractual economics and canonical ECL provenance before material writes. CAMBRA then owns routine fulfilment and migration operations. Payment migrations use a versioned P9 plan and preserve task/audit history. Realized savings must be measured and verified before billable eligibility.

Important truth states remain distinct: estimated savings, accepted savings, implemented state, observed savings, verified savings, billable savings, invoiced amount and collected cash.

## 4. Aggregate — IMPLEMENTED

Aggregate pools merchant demand without exposing individual merchant economics. Observed volume, addressable volume and committed volume are separate concepts. Only explicit commitment evidence may populate committed volume. Aggregate procurement and negotiation can run automatically inside policy, but final/material commercial commitments require human approval. Dynamic agreement tiers may progress under their contractual activation semantics.

## 5. Providers and provider-side economics — IMPLEMENTED with legal activation gates

Provider Intelligence stores temporal pricing/evidence/conflicts/freshness. Provider-side CAMBRA compensation is modeled and accounted separately from merchant revenue. Merchant ranking cannot be improved because a provider pays CAMBRA. Provider compensation activation remains agreement-specific and legal/tax/disclosure gated.

Provider-side lifecycle is attribution → eligibility → accrual → invoicing/self-billing evidence → payment → reconciliation. Merchant invoices and provider revenue use separate ledgers.

## 6. Money — IMPLEMENTED

Authoritative money state is deterministic. LLM output may explain data but may not calculate authoritative balances, alter ledger state or decide that an invoice is paid.

Recover issuance requires an eligible verified report plus contract, tax, economic and ECL gates. Stripe reconciliation remains convergent/read-oriented and does not use a conversational AI as truth. P18 SAFE MODE can pause new invoice issuance; reconciliation and observation remain active.

## 7. AI Workforce — IMPLEMENTED

The source of truth for agent authority is `base44/shared/agentAuthority.ts`, plus deterministic gates in each domain. Agents may receive read/write/send/negotiate/execute capability where explicitly configured. No registered agent receives CAN_APPROVE, CAN_SIGN, CAN_SPEND or CAN_CHARGE.

UI labels or prompts cannot widen authority. Material commitments remain governed by Approval/domain functions. The source-derived catalog `src/docs/CAMBRA_AGENT_OPERATING_CATALOG.md` enumerates the 34 agents currently declared in `agentRegistry.js` and the explicit authority rows from `agentAuthority.ts`; missing exact authority mappings are labelled unverified rather than guessed. Deterministic/scheduled backend workers are separately censused in `PRODUCTION_FUNCTIONS.md`.

## 8. Autonomous Maintenance — IMPLEMENTED

P17 uses the loop MONITOR → DETECT → DIAGNOSE → SAFE FIX → VERIFY → LOG → LEARN. Allowlisted reversible remediation includes selected OAuth refresh, webhook retry, provider-intelligence refresh, deterministic billing reconciliation and conservative stale-task closure. A repair is not considered resolved until post-action verification succeeds.

Security, contracts, permissions, money movement and code cutover do not become automatic repair authority. Failed repairs escalate and are recorded in remediation knowledge.

## 9. CAMBRA Developer — IMPLEMENTED

Developer can inspect supported repositories, plan migrations/changes, prepare branch patches and PRs, inspect CI evidence, request cutover and execute guarded rollback. Investigation can be automatic. Patch application/cutover/rollback are governed by plan/CI/approval checks; production code is never silently merged by Maintenance.

## 10. Routing Intelligence — PARTIALLY_IMPLEMENTED

Routing is shadow-only. The system can record production-confirmed observations, simulate counterfactual routing and build readiness/performance intelligence. Real payment routing is explicitly disabled. PCI DSS, PSD2/SCA/regulatory review, provider/network contracts, real-time SLA/SLO, production kill switch, idempotency/reconciliation proof and liability review remain activation gates.

## 11. Security and privacy — PARTIALLY_IMPLEMENTED

Canonical admin/internal gates fail closed. Secret comparison/redaction and tenant/economic boundaries are enforced in code. Dependency security monitoring can consume GitHub Dependabot for registered workspaces. Release requirements continue to surface unresolved live-validation/legal/privacy conditions rather than hiding them.

Technical controls do not constitute legal/privacy approval. P12 retention/cross-tenant derived intelligence policy and production live validation remain explicit manual requirements where the release manifest says so.

## 12. Emergency controls — PARTIALLY_IMPLEMENTED

P18 introduces a real founder SAFE MODE persisted in `EmergencyControl`. SAFE MODE pauses new external communications, negotiations, new migration starts and new Recover invoice issuance. It also pauses the existing global acquisition sending control and active commercial policies. Monitoring, reconciliation, evidence, incident handling and already-earned obligations remain intact.

Individual pause controls also exist for acquisition/sending profiles and commercial policies. API keys/OAuth can be revoked through their canonical functions. There is not one universal switch that halts every internal/read-only agent; SAFE MODE instead blocks the material external-effect boundaries. Do not document a universal agent kill switch unless one is actually added and enforced.

## 13. Founder Handbook / contextual help — IMPLEMENTED

The practical manual is `CAMBRA_FOUNDER_HANDBOOK.md`. Admin screens expose contextual “How does this work?” access through the P18 documentation surface. Ask CAMBRA can query the documentation registry for system-behavior questions. Live-state questions must use Founder OS/domain tools instead.

## 14. Living Documentation Engine — IMPLEMENTED

`documentationRegistry.ts` is the structured runtime documentation source. `documentationMaintenanceWorker` versions it into DocumentationObject/DocumentationVersion and publishes Documentation Health. P17 Maintenance invokes the worker as part of its sweep, while the worker also declares its own maintenance cadence. The release documentation manifest hashes the implementation source paths and canonical docs. If a watched implementation source changes without documentation closure, `npm run documentation:check` fails.

Real resolved critical incidents and observed remediation outcomes create deduplicated `DocumentationChangeProposal` records instead of allowing an LLM to silently rewrite canonical operating truth. Those proposals point to troubleshooting/incident/Bible surfaces that may need updating. Source-controlled documentation must still be verified against implementation before the proposal is considered closed.

Material release closure therefore includes documentation drift validation. Historical documentation is retained through DocumentationVersion and repository history rather than overwritten as if behavior had never changed.

## 15. Incident learning — IMPLEMENTED

Operational incidents retain symptoms, root cause where known, actions, recovery and prevention. P17 remediation knowledge learns from both verified successes and failed attempts. P18 converts critical resolved incidents/remediation learning into Documentation Change Proposals; troubleshooting/incident playbooks are then updated through source-controlled documentation closure after verification against real behavior.

## 16. Production claims and unresolved gates

A local/Base44 release check is not the same as external GitHub Actions CI evidence. GitHub Actions CI proves technical source/evidence integrity; it may be green while `productionSealEligible=false`. Stripe/live integration claims, Recover Economics V2 legal wording, P12 privacy/retention, provider monetization legal/tax activation, real-world pilot validation and real routing activation remain retained in `manualRequirements` and continue to block the corresponding production-readiness claim or activation even when technical CI is green. `blockingManualRequirements` is reserved for technical release prerequisites that CI itself must fail on. P18 documentation must preserve these distinctions.


## Europe Market Context Foundation (P1)

CAMBRA's geographic expansion foundation is the versioned 33-market registry plus `MerchantMarketContext` and deterministic `JurisdictionCapabilityPolicy`. Legacy Brand country, billing/tax and locale fields remain backward compatible and are adapted in shadow before any production cutover. Market registry membership never implies provider/rate intelligence, commercial clearance or regulated authorization. See `P1_EUROPE_COUNTRY_INTELLIGENCE_FOUNDATION.md`.
