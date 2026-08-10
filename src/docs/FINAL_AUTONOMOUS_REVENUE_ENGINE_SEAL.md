# CAMBRA — Final Autonomous Revenue Engine Technical Seal

## Definition

This seal proves the **technical operating architecture and deterministic boundaries** required for CAMBRA to run an autonomous revenue loop under human governance. It does **not** claim that CAMBRA has already demonstrated autonomous economic performance with real merchants.

Technical loop:

Acquisition → onboarding/data → Analyzer → Recover acceptance → Aggregate/individual procurement → human-gated material contract → Migration → live verification → explicit billable approval → Stripe invoice/collection → reconciliation → retention/expansion → Intelligence/Moat → next decision.

## Financial truth

`RevenueLifecycle` is a projection only. Authoritative money state remains:

- `MonthlySavingsReport` for verified/billable savings,
- `Invoice` for legal invoice state and amounts,
- `PaymentEvent` + Stripe reconciliation for collection events.

Estimated savings ≠ verified savings ≠ billable savings ≠ invoiced revenue ≠ cash collected.

No LLM may create financial truth. `recoverAutopilotWorker` cannot approve a report for invoicing.

## Governance

`agentAuthority.ts` is default-deny and exposes CAN_READ / CAN_WRITE / CAN_SEND / CAN_NEGOTIATE / CAN_SCHEDULE / CAN_EXECUTE / CAN_APPROVE / CAN_SIGN / CAN_SPEND / CAN_CHARGE. No autonomous agent has APPROVE, SIGN, SPEND or CHARGE authority.

Existing domain-specific gates remain authoritative: ECL, Recover mandate, CommercialPolicy, Approval, contract comparison, billing eligibility and DeveloperMigrationEngine cutover approvals.

## Exception operations

`AutonomyIncident` retains backward-compatible open/resolved status and adds workflow state, owner, automation eligibility, financial/customer/legal impact, root cause, actions, recovery and prevention. P11 remains the cross-loop supervisor. Safe retries/reconciliation are automated; material/legal/low-confidence exceptions escalate.

## Sales / collections / customer success

- `salesPipelineWorker` projects a normalized sales stage and bounded priority without fabricating GMV/revenue.
- `collectionOperationsWorker` reconciles Stripe first, then reminders/escalation. It never manually creates/confirms a PaymentIntent retry.
- `customerSuccessWorker` creates retention and expansion signals from real integrations, incidents, invoices, routing and Aggregate eligibility.
- `unitEconomicsWorker` leaves missing CAC, human/API cost and LTV inputs null until measured.

## Founder operating model

Founder Control Center surfaces material approvals, critical exceptions, strategic meetings, financial summary and real-world gaps. Routine work remains in autonomous loops and digests.

## Pilot / real-world validation

`realWorldValidationWorker` admits only evidence explicitly classified `production` and `learning_eligible`. Internal founder tests, demo data and sandbox data cannot satisfy the pilot gate.

`revenueGoldenPathSelfTest` is a recurring **technical contract test only**. It explicitly performs no external money movement and never counts as real-merchant validation.

A full real-world autonomy claim requires multiple genuine merchants and end-to-end evidence, including acquisition, implementation, verified savings, invoicing, payment collection and gap reports. The first-10 ledger is `PilotMerchantValidation`.

## Forecast discipline

The Financial Control Tower reports current obligations and evidence-bounded 30/90-day cash expectations. A 12-month forecast remains null until sufficient real merchant history exists. Accounting revenue remains separate until a formal revenue-recognition policy is approved.

## Boundaries that remain intentionally closed

- P13 real payment routing remains prohibited.
- Material aggregate contracts remain L4 human-approved.
- Recover V2 legal release remains a legal gate.
- P12 derived-intelligence retention/aggregation remains a privacy/legal gate.
- Stripe live integration needs real live-account proof before claiming full external production validation.
- Real-world autonomous revenue validation requires genuine merchant pilots; code/tests cannot substitute for it.
