# Decision Log — DASHBOARD CORE C8 (Finance truth model)

Date: 2026-08-17
Scope: C8 — the five financial truth domains, the double-count guard, currency
handling, and the revenue-to-cost join C0 found missing.

External effects: **zero**. Barrier: tests + gates + `verify:chunk` green + clean tree.

## 1. The gap C0 found, closed

C0's verified finding: **no financial aggregator read the cost plane at all.**
`CostUsageEvent`, `CostBudgetControl`, `GrowthCostLedger` and `MerchantUnitEconomics`
were read by discovery, growth and cost-governance code — and by nothing financial. So
margin and unit economics were not computable server-side.

Checking the readers confirmed it exactly: `CostUsageEvent` was read by
`discoveryAdmin`, `discoveryV2Admin`, `costGovernance`, `commercialSendSafety` and
`contactLast`. Not one is a financial aggregator.

`financeCore.buildFinanceSnapshot` now reads it, and `computeMargin` crosses the two
planes.

## 2. The five domains, and what may never be added

```
MERCHANT_SAVINGS · MERCHANT_REVENUE · PROVIDER_REVENUE · COSTS · CASH
```

`FORBIDDEN_SUMS` declares each forbidden pair **with its reason**, and
`checkCombination` refuses the combination while returning that reason so a refusal is
legible rather than a bare boolean:

- savings + merchant revenue — *"savings are the merchant's benefit; revenue is CAMBRA's
  fee on it. Adding them counts the same euro twice"*
- merchant revenue + provider revenue — *"both are CAMBRA revenue but from different
  sides; a single total hides the concentration and the conflict"*
- costs + cash — an accrued cost is not cash paid

A test asserts no KPI carries the sum of verified savings and merchant revenue, which is
the specific double count that would look most plausible.

**The one legitimate combination** is merchant + provider revenue *against cost*, for
margin. `computeMargin` states in its claim boundary that neither is presented as a total
anywhere else.

## 3. Completeness demotes the truth class

Every figure sums through `nullableSum`, so it declares `COMPLETE`, `LOWER_BOUND` or
`UNKNOWN`. The demotion is the point: **a `LOWER_BOUND` can never be `VERIFIED`**,
because a sum that skipped rows has not verified a total. An `UNKNOWN` reports a null
amount and says *"this is not zero"*.

Margin is the conservative case. If **either** side is a lower bound the margin is
`MODELED`, and the claim boundary says why: *"a complete revenue figure against a
truncated cost figure looks better than the truth."* That is the direction that
misleads, so it is named.

## 4. Currency is never silently summed across

`consolidate` returns a total only for a single currency. A mixed set returns
`amount_minor: null` plus the per-currency breakdown, because summing across currencies
without a dated FX rate produces a figure that is not money. A row with no currency also
suppresses the total rather than being folded in.

## 5. FAILED cost attempts are included

Costs count `RESERVED`, `OBSERVED`, `RECONCILED` **and `FAILED`**, matching
`costGovernance`'s existing reasoning: a provider can charge for a request whose
transport or parser we reported as failed, and only an explicit reconciliation may void
one. The claim boundary states it, so the figure is not mistaken for successful spend.

## 6. Founder rules honoured

Nullable coercion imported from the shared module and the gate fails on a local
re-implementation — this is financial code, where the rule matters most. No new legacy
vocabulary writer. No seal altered.

## 7. Carried forward to C9

- The Finance page and the consolidation of `AdminRevenue`, `AdminRecoverBilling` and
  `AdminProviderEconomics` under tabs. The four already-correct aggregator pages are to
  be consolidated, not rewritten.
- `AdminRevenue.jsx:18-22` still sums five entity lists in the component. C8 makes the
  server-side computation available; C9 switches the page to it.
- Invoice/payment/reconciliation projections, unit economics and forecast/close.
- `FiscalIdentityCard.jsx:47` still writes Brand from the browser, which blocks the
  `/admin/recover-billing` redirect.

## 8. Files

```
base44/shared/financeCore.ts        (new)
scripts/check-finance.mjs           (new)
src/lib/financeCoreC8.test.js       (new, 24 tests)
package.json                        (finance:check registered and wired)
```
