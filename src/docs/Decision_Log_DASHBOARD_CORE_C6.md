# Decision Log — DASHBOARD CORE C6 (Recover root and the open-case path)

Date: 2026-08-17
Scope: C6 — Recover root confirmation, canonical phases, the production creator
DealActivation never had, and `recover:check`.

External effects: **zero**. Barrier: tests + gates + `verify:chunk` green + clean tree
before commit.

## 1. No new entity, and the root was already well guarded

C0 and its adversarial pass both concluded `DealActivation` **is** the canonical root
for the merchant-scoped Recover lifecycle. Reading it confirmed why: its direct mutator
returns HTTP 410, `guardDealActivationStatus` reverts an authorization taken without a
mandate, and every real move uses CAS.

`RecoverCase`, `RecoverAggregate` and `RecoverStageEvent` are named and forbidden, and
the gate fails if any appears as an entity.

## 2. The real gap was a creator, not an authority

`DealActivation.create` existed only in `seedDemoData` and `runFlowSelfTests`. Nothing in
production opened a case. That is what C6 built.

Three properties, each tested:

- **Created in the WEAKEST phase.** `status: 'proposed'` → `ELIGIBILITY_REVIEW`, with no
  mandate, no payment method and no savings figure. Creating a case already authorized
  would assert authority nobody granted.
- **Idempotent on the opportunity.** A second attempt returns the existing case rather
  than a second root. Two roots for one opportunity is precisely the second source of
  truth C0 forbade.
- **An unreadable existing-case check REFUSES.** Assuming no case exists would let a
  second root be created, so `existing_case_unreadable` blocks rather than proceeding.

The handoff moves the opportunity to `IN_RECOVER` with CAS. If the case was created but
the opportunity did not move, the call returns `ok: true` with
`ambiguity_state: REVIEW_REQUIRED` — deleting a real case would be worse than flagging
the divergence.

## 3. Recover reports eligibility, never money

`billingEligibility` returns a boolean and its reasons. There is **no billable amount
anywhere** in `recoverCore`, and the gate fails on `billable_savings_minor`,
`Invoice.create` or `issueInvoice`. Invoices remain Finance's authority (§10.21).

Every condition must hold and the default is ineligible. The one worth stating: **a case
with no verified figure is not eligible**, because it has not proven anything to bill for.

Projected and verified figures stay separate columns, and when verified is below the
projection the claim boundary says the verified figure governs — a projection is not
evidence.

## 4. Phase mapping is conservative

`revoked` → `BLOCKED`, not `COMPLETED`. `monetizing` → `BILLING_ELIGIBLE`. An unmappable
status returns `null` and raises `phase_unmappable` rather than being guessed into a phase.

## 5. Founder rules honoured

- Nullable coercion imported from the shared module; the gate fails on a local
  re-implementation.
- `recoverEligibility` is **reused from `auditsCore`**, not copied, so C5's decision path
  and C6's open path cannot disagree.
- No new writer of any OutboundLead legacy vocabulary — Recover does not touch them.
- No seal altered.

## 6. Carried forward to C7

The `/admin/recover` page, and the phase-transition actions (mandate request,
negotiation, offer recording, merchant decision, contract review, migration, go-live,
verification). C6 delivers the root, the phases, the eligibility rules and the opening;
C7 is the operating surface. The registry still marks `/admin/recover` `NOT_BUILT`.

Note for C7: `/admin/contracts` cannot redirect until a governed Contract handler exists,
because `AdminContracts.jsx:49` still writes the whole form object from the browser.

## 7. Files

```
base44/shared/recoverCore.ts          (new)
base44/shared/recoverAdminCore.ts     (new)
scripts/check-recover.mjs             (new)
src/lib/recoverCoreC6.test.js         (new, 28 tests)
+ route, topology, 3 counter sites, package.json
```
