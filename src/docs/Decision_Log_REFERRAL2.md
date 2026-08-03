# Decision Log — REFERRAL-2 (2026-08-03)

Closing the referral loop: activation → counter → BillingRule → report → invoice.
REFERRAL-1 shipped the promise (Terms §8); this chunk makes the billing system
honour it.

## The five open points, and how each was closed

| # | Gap | Fix |
|---|---|---|
| 1 | Nobody incremented `activated_count` | `base44/shared/referralActivation.ts` + function `applyReferralActivation` |
| 2 | Billing never saw the discount | `shared/referralBilling.ts` writes a dated `BillingRule`; `generateMonthlySavingsReport` now resolves the pct from the rule effective for the report month |
| 3 | `getMyReferralStatus` uncensused (suite red) | added to `PRODUCTION_FUNCTIONS.md` + `MANIFEST` (with `applyReferralActivation`) |
| 4 | No tests for the ladder | `referralProgram.test.js`, `referralProgram.sync.test.js`, `referralActivation.test.js` |
| 5 | Duplicated find-or-create, no uniqueness | `shared/referralLink.ts`, used by both functions |

## THE bug this chunk really fixed (T2.4)

`generateInvoiceFromReport` prefers `report.node_fee` and only falls back to
`BillingRule`. `report.node_fee` was computed in `generateMonthlySavingsReport`
from **`DealActivation.node_share_percent`** — a live field with **no date
window**. Consequences before the fix:

- a discounted `BillingRule` would have been **ignored entirely** (node_fee is
  almost always > 0), so invoices would keep charging 25% — the chunk would have
  been decorative;
- had we instead mutated `DealActivation.node_share_percent`, the discount would
  have applied **retroactively** to every not-yet-reported month, breaking Terms
  §8's "from the month following activation".

Fix: `shared/billingFee.ts#resolveFeePctForMonth` resolves the percentage for the
report's month from `BillingRule` (start/end window), with
`DealActivation.node_share_percent` as fallback for brands with no rule.
`report.supporting_snapshot_json` now carries `fee_pct`, `fee_source`,
`billing_rule_id`.

## Decisions

1. **Activation event — declared, not invented.** There is no single
   "savings verified and activated" event in the app today. The truthful
   candidates are a `MonthlySavingsReport` reaching `verification_status`
   `verified`/`realized` with `savings > 0`, or an explicit admin confirmation.
   `applyReferralActivation` is therefore **trigger-agnostic**: the caller
   asserts the activation, the module does the crediting. It is admin/internal
   gated and callable today; wiring an entity automation on
   `MonthlySavingsReport` is a one-line follow-up and deliberately NOT done
   blind in this chunk — an automated trigger on a status that is also set by
   estimates would hand out discounts for unverified savings.
2. **Idempotency by claim-before-increment.** `ReferralActivation` (new,
   admin-only) is created FIRST, keyed by `referred_key` (Brand id, else
   lowercased email). Then the counter moves. A replay finds the claim and
   returns `already_counted`. Test: three consecutive calls → `activated_count`
   = 1, one claim row.
3. **Non-retroactivity is structural.** The current rule is never rewritten: it
   is closed with `effective_end_date` = last day of the current month and a new
   rule is created with `effective_start_date` = 1st of the next month.
4. **Ratchet, never reverse.** `scheduleReferralFee` skips when an open rule is
   already ≤ the new fee, and no code path decrements `activated_count` or
   raises `node_share_percent`. Terms §8: an acquired reduction is never
   reversed, including when the referred business later terminates.
5. **`times_used` stays inert.** Only `activated_count` feeds the ladder; the
   activation module never reads `times_used` (test pins it).
6. **Self-referral rejected**, and unknown/absent codes credit nobody.
7. **Ladder mirrored, not reimplemented.** `src/lib/referralProgram.js` is the
   source of truth; `base44/shared/referralProgram.ts` copies the marked block
   verbatim; `referralProgram.sync.test.js` fails on drift (same pattern as
   `__benchmark_sync__.test.js`).
8. **Audit trail on the invoice.** `billing_snapshot_json` now records
   `fee_pct`, `fee_source`, `billing_rule_id`, `savings`, and the referrer's
   `activated_count` at issue time; `generateInvoicePdf` prints the applied
   percentage and the savings base, plus a line when a referral discount is
   included.
9. **Third-party data stays invisible to the referrer.** `ReferralActivation`
   holds the referred business's identifiers and is admin-only RLS;
   `getMyReferralStatus` still returns only the caller's code and two integers.
   The anonymous teaser (`getPaymentsGapTeaser`) gained **no** field — its
   allowlist was not touched.

## Known limitation — no declarative unique index

Base44 entity schemas cannot declare a unique index on `owner_email`, so
uniqueness for `ReferralLink` is enforced in `shared/referralLink.ts`:
read-all → if >1 rows, **oldest wins** and the extras' `times_used` /
`activated_count` are **summed into the winner** before deletion; after a create,
re-read and collapse if a concurrent caller won the race. Counters are never
discarded — dropping an `activated_count` would overcharge a merchant.
Production check on 2026-08-03: **1 `ReferralLink` row, 0 duplicates**, so no
consolidation backlog exists; the helper handles any future race.

## Out of scope (unchanged)

Programme mechanics (percentages, floor, step) · anonymous teaser · `/Referrals`
page · legal text (REFERRAL-1) · Agents programme · automating the activation
trigger (see decision 1).