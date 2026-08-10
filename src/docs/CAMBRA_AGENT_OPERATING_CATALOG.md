# CAMBRA AI WORKFORCE — SOURCE-DERIVED OPERATING CATALOG — v0.79.0

Derived from `src/lib/agentRegistry.js` and `base44/shared/agentAuthority.ts`. Backend deterministic/scheduled workers are catalogued separately in `src/docs/PRODUCTION_FUNCTIONS.md`. Missing authority mappings are never inferred.

## Declared AI agents

| Name | Function | Level | Mission | Input | Tool |
|---|---|---:|---|---|---|
| Founder Copilot | `founderCopilotAgent` | L1 | Resumen diario · briefing del estado de la máquina. | context/domain state | Claude |
| Investor Update | `investorUpdateAgent` | L1 | Borrador de updates mensuales para inversores (draft Approval L2). | context/domain state | Claude |
| QA | `qaAgent` | L1 | Auditoría puntual sobre una pregunta del founder. | context/domain state | Claude |
| Lead Discovery | `leadDiscoveryAgent` | L1 | Busca prospectos en Apollo (fallback: heurística). | context/domain state | Apollo |
| Lead Enrichment | `leadEnrichmentAgent` | L1 | Enriquece leads con Clay. | context/domain state | Clay |
| Lead Scoring | `leadScoringAgent` | L1 | Asigna fit score 0-100 con explicación. | context/domain state | Claude |
| CRM | `crmAgent` | L0 | Sincroniza leads con el CRM. | context/domain state | Attio |
| Acquisition Loop | `autonomousCommercialWorker` | L3 | Hourly policy-gated lead outreach; suppression, business-hours and daily caps are deterministic. | context/domain state | Claude + Resend |
| Reply Operator | `commercialReplyAgent` | L3 | Classifies inbound replies and continues routine threads; opt-out stops immediately and L4 escalates. | context/domain state | Claude + Resend |
| Provider Negotiation | `providerNegotiationAgent` | L3 | Persistent multi-round pricing negotiation inside a Recover mandate; never auto-accepts a final/material deal. | context/domain state | Claude + Resend |
| Outreach Legacy | `outreachAgent` | L3 | Legacy per-email approval path retained for controlled/manual outreach. | context/domain state | Resend |
| Follow Up Legacy | `followUpAgent` | L3 | Legacy approval-gated follow-up path; autonomous threads use Commercial Autonomy instead. | context/domain state | Instantly |
| Meeting | `meetingAgent` | L3 | Uses real Cal.com availability only; missing calendar data is a blocker, never fabricated slots. | context/domain state | Cal.com |
| Blog | `blogAgent` | L2 | Drafts de artículos largos. | context/domain state | Claude + SurferSEO |
| Newsletter | `newsletterAgent` | L2 | Draft del newsletter mensual. | context/domain state | Claude |
| LinkedIn | `linkedinAgent` | L2 | Drafts de posts de LinkedIn. | context/domain state | Taplio |
| X / Twitter | `xTwitterAgent` | L2 | Drafts de threads de X. | context/domain state | Typefully |
| SEO | `seoAgent` | L1 | Investigación de keywords. | context/domain state | SurferSEO |
| Competitor Monitor | `competitorMonitorAgent` | L1 | Detecta movimientos de competidores. | context/domain state | Perplexity |
| Provider Research | `providerResearchAgent` | L1 | Investiga proveedores antes de proponerlos. | context/domain state | Perplexity |
| Provider Monitor | `providerMonitorAgent` | L1 | Vigila cambios en proveedores activos. | context/domain state | Perplexity |
| GDPR | `gdprAgent` | L1 | Vigila manejo de datos personales (24h). | context/domain state | Claude |
| Compliance | `complianceAgent` | L1 | Audita controles operativos del sistema. | context/domain state | Claude |
| Legal Review | `legalReviewAgent` | L1 | Analiza contratos puntuales (input: texto). | context/domain state | Claude |
| Contract & IP | `contractIPAgent` | L1 | Checklist de acuerdos pendientes. | context/domain state | Claude |
| Discovery (Tech Stack) | `discoveryTechStackAgent` | L1 | Escanea web pública y detecta tools del stack. | url | Deterministic + Claude |
| Spend Intelligence | `spendIntelligenceAgent` | L1 | Estima gasto por tool con benchmarks tier+EU. | brand | scoreEngine + Claude |
| Recommendation Engine | `recommendationEngineAgent` | L1 | Detecta oportunidades vs benchmark (savings + confidence + effort + priority). | brand | scoreEngine + Claude |
| Code Review | `codeReviewAgent` | L1 | Bugs, code smells, Architecture Bible. | context/domain state | Claude |
| Security | `securityAgent` | L1 | Tenant isolation, secrets, GDPR. | context/domain state | Claude |
| QA Monitor | `qaMonitorAgent` | L1 | Vigila runtime (fallos, regresiones). | context/domain state | Claude |
| Engineering Report | `engineeringReportAgent` | L1 | Consolida 2x/día con prompts listos. | context/domain state | — |
| Fix Validator | `fixValidatorAgent` | L1 | Valida fixes aplicados (rescan + review). | context/domain state | Claude |
| System Health | `systemHealthAgent` | L1 | Meta-vigilante read-only: agentes fallando, tasks colgados, schedules, loop del Brain, events huérfanos. | context/domain state | Deterministic |

## Explicit authority matrix

| Agent key | Explicit capabilities | Material authority |
|---|---|---|
| `lead_discovery` | `CAN_READ`, `CAN_WRITE` | NONE |
| `lead_enrichment` | `CAN_READ`, `CAN_WRITE` | NONE |
| `lead_scoring` | `CAN_READ`, `CAN_WRITE` | NONE |
| `outbound_volume_worker` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_EXECUTE` | NONE |
| `commercial_reply` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_SCHEDULE`, `CAN_EXECUTE` | NONE |
| `provider_negotiation` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_NEGOTIATE`, `CAN_SCHEDULE`, `CAN_EXECUTE` | NONE |
| `collective_negotiation` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_NEGOTIATE`, `CAN_SCHEDULE`, `CAN_EXECUTE` | NONE |
| `provider_monetization` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_NEGOTIATE`, `CAN_SCHEDULE`, `CAN_EXECUTE` | NONE |
| `provider_revenue_recovery` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_NEGOTIATE`, `CAN_EXECUTE` | NONE |
| `aggregate_demand` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `aggregate_procurement` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_NEGOTIATE`, `CAN_EXECUTE` | NONE |
| `tier_progression` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_EXECUTE` | NONE |
| `provider_revenue_lifecycle` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `provider_revenue_reconciliation` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `provider_economics_intelligence` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `shadow_routing` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `routing_performance` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `onboarding_concierge` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_EXECUTE` | NONE |
| `recover_autopilot` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `collection_operations` | `CAN_READ`, `CAN_WRITE`, `CAN_SEND`, `CAN_EXECUTE` | NONE |
| `autonomous_operations_supervisor` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `maintenance_engine` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `documentation_maintenance` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `knowledge_integrity` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `moat_curator` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `developer_migration` | `CAN_READ`, `CAN_WRITE`, `CAN_EXECUTE` | NONE |
| `founder_copilot` | `CAN_READ` | NONE |

## Authority / escalation rules

- `assertNoMaterialAuthority()` is the executable invariant: declared agents may not receive approve/sign/spend/charge authority.
- L4 commercial/legal commitments, money movement and production-critical cutover remain human/domain governed.
- Prompts and UI labels never widen authority beyond deterministic policy/functions.
- If an agent has no exact authority row, its permissions are **UNVERIFIED from this matrix** and must be resolved from its backend/domain gates rather than guessed.
- P18 SAFE MODE blocks material external-effect boundaries; it is not a universal stop for every internal/read-only agent.
