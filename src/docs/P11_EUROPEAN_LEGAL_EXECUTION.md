# P11 — European Legal Execution, Contracts and Mandates

## Status

The deterministic P11 control plane is implemented locally for the canonical
Europe-33. It is intentionally fail-closed. Technical implementation is not a
legal opinion and does not make any market/action cell launch-ready.

Qualified counsel and current primary-authority evidence must approve each
jurisdiction × action policy before it can grant execution authority.

## Canonical decision chain

`RegulatoryPolicyVersion (P10)` → `LegalExecutionPolicy (P11)` → immutable
contract evidence → active mandate → least-authority grant/restriction → exact
merchant approval where required → signature/capacity evidence → deterministic
agent authority → execution → `AuthoritySnapshot` + `LegalExecutionDecision`.

`BLOCK`, `LEGAL_REVIEW_REQUIRED`, a legal kill switch, missing evidence, stale
policy, audit-storage failure or conflicting policy always stops execution.
Neither an LLM nor `manual_override` can replace P10/P11 authority.

## Runtime surfaces

- `base44/shared/legalExecution.ts`: pure deterministic decision engine.
- `base44/shared/legalExecutionRuntime.ts`: server-side evidence resolution and
  immutable decision snapshots.
- `base44/functions/canExecuteLegalAction`: governed evaluation endpoint.
- `base44/functions/manageLegalExecution`: strict-admin policy supersession,
  kill-switch and least-authority grant/restriction management.
- `base44/functions/seedP11LegalExecution`: idempotent conservative seed. It
  creates review-required rows and grants zero permission.
- `base44/functions/commercialSendMessage`: P10/P11 enforcement before all
  automatic or manually overridden commercial transport.
- `base44/functions/acceptRecoverMandate`: P11 market/action permission before
  a mandate can become active.
- `base44/functions/startProviderNegotiation`: exact mandate, contract,
  authority and policy evaluation before opening negotiation execution.
- `base44/functions/startPaymentsMigration` and
  `base44/functions/updatePaymentsMigrationTask`: distinct coordination and
  go-live authorization gates before migration state changes.
- `base44/functions/createEligibleRecoverInvoices`: P11 billing authority and
  immutable snapshot before the first Stripe write; the snapshot is retained
  in invoice provenance.

Signer role captured during acceptance is only a declaration. Qualified
capacity evidence must be recorded through the strict-admin management surface
before it is treated as verified. Authority grants likewise require a signed
mandate and explicit evidence references; an admin role alone is not authority.

## Commercial hardening integration

First-touch messages retain the honest `initial_outreach` or
`partner_outreach` classification. Every automatic sender must pass the central
sending-profile and `CommercialPolicy.daily_send_limit` governor. Unknown
future agents have no send authority. Admin override requires a real admin,
P10/P11 permission and a durable `AuthorizationLog` record.

The follow-up sweep defaults to 25 successful sends, allows an admin-only bound
up to 50 and stops before more message history or LLM work once the budget is
closed. Remaining threads keep their due state for a later pass.

## External closure requirements

- qualified market/action legal review;
- approved primary-source evidence and review dates;
- counsel-approved contract, mandate, signature and signer-capacity variants;
- Base44 entity/function sync and runtime verification;
- final-SHA remote CI.

Until those exist, the safe operating mode remains research/analysis-only for
affected actions. No local test result is evidence that legal clearance exists.
