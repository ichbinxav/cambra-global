# Decision Log — DASHBOARD CORE C7 (Recover surface, governed Contract handler)

Date: 2026-08-17
Scope: C7 — the `/admin/recover` workspace and the governed Contract handler that
replaces the highest-severity page defect C0 found.

External effects: **zero**. Barrier: tests + gates + `verify:chunk` green + clean tree.

## 1. The defect this chunk actually closes

`AdminContracts.jsx` used a generic entity update on Contract taking the **entire
browser form object**. No validation, no tenant check, no field allowlist, no receipt.
Whatever the form held became the contract.

`recoverContractCore.ts` replaces it with four protections:

- **A field allowlist.** Five correctable metadata fields, and nothing else.
- **Named protections with reasons.** `user_email` re-parties the agreement.
  `deal_activation_id` rebinds the Recover case. `node_revenue_pct` is what CAMBRA
  charges. `estimated_savings_annual` must come from the audit and verification chain,
  not a form. `status` is a governed lifecycle transition. `activity_log` is written by
  the handler, never supplied.
- **A mixed patch is refused ENTIRELY.** Silently dropping the forbidden keys and
  writing the rest would let a caller believe the whole change landed. A test asserts
  neither field moved.
- **CAS on every changed field, a required reason, and an append to the contract's own
  `activity_log`.**

The page now sends only allowlisted fields, and a test asserts the page's field list
**equals** the handler's allowlist — a form offering a field the handler refuses would
fail at apply time with nothing the operator could act on.

Ratchet: **12 → 11** direct-CRUD writes, 1 fixed. The entry stays in the known list so a
regression is detected as a re-opened known site rather than as a new one.

## 2. Two things I got wrong and corrected

**A comment defeated the detector.** My first version of the fix documented the old code
by quoting the literal call pattern. The gate greps for that pattern, so the comment made
a fixed file look unfixed. Reworded to describe it instead.

**"Ready" overstated the redirect.** I marked `/admin/contracts` redirect `ready: true`
because its blocker was gone. But the route still serves its own page — the redirect is
not wired. The registry now separates `blocker_cleared` from `ready`, with `ready` meaning
the redirect is **live in App.jsx**, and the gate fails if a cleared blocker does not name
the remaining step. Conflating them would have let the registry claim a redirect that does
not exist.

## 3. The Recover page

Projects `DealActivation`. One server call, action discriminator, zero
`base44.entities`.

The money rules are the display rules: projected and verified savings render in
**separate columns with separate labels**, so no reading of a card can merge them. A case
with a projection and no verified figure says *"Nothing verified yet. The projected figure
is not a saving and nothing here is billable."* Billing eligibility shows as eligibility
with its blockers, never as an amount.

## 4. Founder rules honoured

Barrier applied before commit. No new legacy-vocabulary writer. Nullable coercion shared.
No seal altered — `productionSealEligible` stays **false**.

## 5. Carried forward

- The phase-transition actions (mandate request, negotiation, offer recording, merchant
  decision, migration, go-live, verification). C6 delivered the root and phases, C7 the
  surface and the contract handler; the transitions are the next Recover increment.
- `/admin/contracts` redirect wiring, in C13 with the other retirements.
- Ten remaining direct-CRUD writes, two CRITICAL (OAuth client secret generated in the
  browser; webhook configuration created and hard-deleted from the browser). Both are
  Advanced System surfaces and belong to C12.

## 6. Files

```
base44/shared/recoverContractCore.ts   (new)
src/pages/admin/AdminRecover.jsx       (new)
src/lib/recoverContractC7.test.js      (new, 17 tests)
src/pages/admin/AdminContracts.jsx     (governed handler; direct write removed)
base44/shared/recoverAdminCore.ts      (contract actions)
config/dashboard/navigation.v1.json    (/admin/recover LIVE; redirect semantics separated)
scripts/check-recover.mjs              (allowlist + page regression)
scripts/check-dashboard-navigation.mjs (cleared vs live)
scripts/check-legacy-routes.mjs        (fix recorded)
src/App.jsx                            (route)
```
