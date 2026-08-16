# CAMBRA Founder/Admin Merchants V2 — canonical source matrix

This read model adds no merchant entity and no physical Base44 function. It is
hosted by `getFounderControlCenter` with `view: "merchants"` and reads existing
canonical resources through the service role only after the host has required
an authenticated `admin` user.

## Portfolio truth

| Product claim | Canonical source | Truth rule |
|---|---|---|
| Merchant membership | `Brand` | Excludes `is_demo=true` and any row whose `anon_session_id` is still populated. A discovery lead is never a merchant. |
| Global status | `Brand.service_status`, `Brand.created_date` | `Churned` requires `cancelled`; `New` is a disclosed date-derived presentation; `Active` requires active/default service state. `Inactive` remains unsupported until CAMBRA has an explicit state. |
| Payment volume | Production `DemandUnit.observed_annual_volume_minor` | Observed only; no inferred volume. |
| Payment cost | `PaymentsAnalysisVerified` | Volume-weighted measured bps and observed annualized cost. Missing evidence remains unknown. |
| Potential savings | latest `AnalyzerResult` | Modeled; never relabeled verified. |
| Verified / realized savings | `MonthlySavingsReport` | Requires `fully_verified` plus the appropriate verification state. The stages stay separate. |
| CAMBRA revenue | `Invoice` | Portfolio card is collected cash only. Drill-down separates earned, invoiced, collected and outstanding. |
| Recover | `DealActivation` | Only explicit workflow states qualify as active. |
| Attention | pending/resolving `Approval` plus directly scoped open `AutonomyIncident` | Approvals are read-only here and execute only through canonical Founder authority. Polymorphic incident coverage is disclosed as partial where applicable. |
| Data confidence | latest `AnalyzerResult` | Uses canonical completeness or the disclosed confidence-band adapter; unknown is retained. |

Every KPI includes `truth_class`, `status`, `dependencies`, `as_of` and a claim
boundary. Failed sources return `UNAVAILABLE`, not zero. A read hitting its
5,000-row bounded source limit is `TRUNCATED`; totals are not claimed complete.

## Query and performance contract

- Initial load reads bounded portfolio sources and returns merchant summaries
  only. Page size defaults to 25 and is capped at 100.
- Search, combined filters and sorting are deterministic and server-authoritative.
  Unknown values sort after known values and are not imputed.
- `FounderSavedView` stores configuration only under
  `view_type=merchant_portfolio_v2` and the exact Founder email.
- Merchant details are fetched by exact `merchant_id` and one of 12 allowlisted
  block keys. Each entity read includes an exact tenant predicate; the helper
  rejects cross-merchant rows.
- Compare is read-only and restricted to 2–5 exact merchants. CSV export is
  capped at 1,000 rows and neutralizes spreadsheet formula injection.
- No dangerous bulk mutation exists.

## Lazy block mapping

| Block | Canonical sources |
|---|---|
| Overview | Brand, DemandUnit, PaymentsAnalysisVerified, AnalyzerResult, DealActivation, MonthlySavingsReport, Invoice, RevenueLifecycle, Integration, Document, MerchantMarketContext |
| Payments & Infrastructure | Integration (credential-stripped), PaymentsProfile, DemandUnit, PaymentsAnalysisVerified |
| Analyzer & Opportunities | AnalyzerResult, RoutingOpportunity |
| Recover & Savings | DealActivation, MonthlySavingsReport, NegotiationCase, Mandate, MigrationTask |
| Data & Documents | Integration, Document, StatementImport, PaymentsAnalysisVerified, AnalyzerResult |
| CAMBRA Activity | AgentTask, Event |
| Attention & Approvals | Approval, directly scoped AutonomyIncident, CustomerSuccessSignal |
| Company & Contacts | Brand, MerchantMarketContext, exact owner User |
| Billing & CAMBRA Revenue | Invoice, MonthlySavingsReport, MerchantUnitEconomics, PaymentEvent |
| Contracts & Legal | Mandate, DealActivation-scoped Contract, Document |
| Communications | CommunicationThread reached only through Brand, DealActivation, NegotiationCase, MerchantInformationRequest or deterministic AcquisitionAttribution relationships; messages restricted to returned thread IDs |
| Technical & Audit | Event, AgentTask, direct-subject AutonomyIncident, credential-stripped Integration |

Legacy `Contract` rows with no exact `deal_activation_id` are deliberately
omitted and marked unresolved. Email equality is not a tenant relationship.
The same rule applies to conversations: CAMBRA never assigns a thread to a
merchant merely because an email address matches.

## Ask CAMBRA contract

The helper `buildMerchantAskContext` accepts only:

- `context_level`: KPI, SEGMENT or MERCHANT;
- an allowlisted `kpi_key` or `merchant_id` / block;
- deterministic filters;
- up to 50 exact selected `merchant_ids`.

It rebuilds the current context from canonical entities and rejects unknown IDs.
Client-supplied metrics or detail objects are never authoritative. The canonical
`copilotChat` host consumes this scope; this implementation does not create a
second agent or chat.

## Honest unsupported capabilities

- AI-created verified facts: unsupported.
- Dangerous mass mutations: unsupported by design.
- Explicit `Inactive` status: unsupported until a canonical Brand service state
  exists.
- Fully complete polymorphic incident traversal: not claimed; direct Brand
  incidents are returned and the coverage boundary is visible.
- Natural-language filters are interpreted only by canonical Ask CAMBRA. The
  deterministic query engine remains the source of list truth.
