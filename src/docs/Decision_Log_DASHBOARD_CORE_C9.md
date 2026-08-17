# DASHBOARD CORE — C9 decision log

**Date:** 2026-08-17
**Scope:** Finance UI, the governed billing-identity write, and the consolidation of the
four legacy finance routes under one workspace.

---

## 1. What C9 was asked to close

Three blockers declared in `config/dashboard/navigation.v1.json`:

| Route | Declared blocker | Closed by |
| --- | --- | --- |
| `/admin/revenue` | AdminRevenue sums five entity lists in the component | `buildRevenueProjection` |
| `/admin/recover-billing` | `FiscalIdentityCard.jsx:47` writes Brand from the browser | `previewBillingIdentity` / `applyBillingIdentity` |
| `/admin/provider-economics` | awaiting the Finance tab shell | `AdminFinanceWorkspace.jsx` |

All three are now `blocker_cleared: true`, `ready: false`. They stay live until C13,
because prompt section 2.5 forbids retiring a legacy route before parity.

---

## 2. The finding that matters most in this chunk

It is not the direct write. `FiscalIdentityCard.jsx:50` also sent
`tax_customer_type: "business_taxable_person"` on **every address save**, and
`recoverTax.ts:224` reads exactly that field:

```ts
if (customer.tax_customer_type !== 'business_taxable_person') blockers.push('customer_not_confirmed_b2b');
```

So typing an address and pressing Save cleared the B2B gate on the tax determination —
the gate that exists to stop CAMBRA issuing a reverse-charge invoice to someone who is
not a taxable person. No evidence was involved at any point.

The Brand schema had already anticipated this. `tax_evidence_status` enumerates
`none | vat_id_provided | vies_validated | alternative_evidence_approved`, and
`tax_customer_type`'s own description says B2B status must be demonstrated. The form
bypassed a design that was already correct.

A second, compounding defect: the write spread the whole form object, so a blank input
erased a stored `vat_number` while `vies_status` stayed `valid`. That leaves a reverse
charge resting on a VIES validation of a number no longer on file.

**Decisions:**

1. An address save never writes `tax_customer_type`. It is in `BILLING_PROTECTED_FIELDS`
   with the reason, and the reason names `recoverTax.ts:224` so nobody re-adds it as a
   convenience.
2. `confirmB2bStatus` is a separate action that refuses unless evidence exists, and
   **writes nothing on refusal**. It records which evidence class was used, because
   `vat_id_provided` is weaker than `vies_validated` and the schema distinguishes them.
3. Changing the VAT number revokes the confirmation and resets the VIES result, because
   a validation attests to one specific number. This is a write we perform, not a stale
   state we leave behind.
4. The preview names every field that would be **cleared**, and every consequence,
   before the operator confirms it.

---

## 3. Three defects C9 found in its own C8

C8 passed its gate and its 24 tests and still shipped three real bugs. All three are
fixed here, and the fixes are what the new gate checks protect.

### 3.1 The currency guard was written and not wired

C8 exported `consolidate` — the function that refuses a cross-currency total — and then
`figure()` summed the field blind and reported the result as one confident number. All
four financial entities carry a `currency` field, so there was no excuse. Across the
thirty markets CAMBRA operates in this is not a rounding concern; it is a wrong total.

`figure()` now runs its rows through `consolidate`. A mixed set reports `null` plus the
per-currency breakdown, and drops to `UNKNOWN` — because knowing every component and
still being unable to add them is not knowing the total.

### 3.2 The snapshot read fields that do not exist

C8 read `savings_minor` from MonthlySavingsReport and `amount_paid_minor` from Invoice.
Neither field exists. Those two entities store **MAJOR** units as `number`;
`ProviderRevenueLedger` and `CostUsageEvent` store **MINOR** units. So both figures were
permanently `UNKNOWN`, and `computeMargin` silently excluded all merchant revenue while
still labelling itself `MODELED`.

Fail-closed, so nothing was confidently wrong — but the module claimed to compute
figures it could never compute, which is its own kind of dishonesty.

`toMinor(value, unit)` now makes the unit explicit at every call site, and the gate fails
on a MAJOR-unit read that does not declare its unit, and on any return of the three
non-existent `*_minor` names.

**Why the tests did not catch it:** the C8 fixtures invented the field names. A test that
constructs its own input can agree with a bug about what the data looks like. The C9
fixtures use the real field names and units, and carry a currency on every row.

### 3.3 Margin crossed currencies

`computeMargin` added merchant and provider revenue and subtracted cost with no currency
check. Subtracting a GBP cost from EUR revenue produces a number with no unit, and it
would have been printed as a margin. It now refuses, names both currencies, and reports
`currency: null` whenever no margin is reportable.

---

## 4. The empty-set decision

`nullableSum([])` returns `UNKNOWN`, which made an empty row set unknown even when the
source read perfectly. On a healthy system with no invoices yet, every figure would show
an em dash.

That is over-conservative in a way that backfires: an operator who sees unknowns
everywhere learns to ignore them, and then the real ones stop being read. `figure()` now
takes `rows_source_complete`; an empty set from a **complete** read is a real zero and
says so. The default is unchanged, so the conservative behaviour is what you get unless a
caller can vouch for the read.

---

## 5. Consolidation: mounted, not rewritten

C0 verified that four finance pages already read through governed aggregators and were
already correct. `AdminFinanceWorkspace.jsx` mounts them unchanged as tab bodies.
Rewriting a correct page is how a correct page stops being correct.

The shell adds the two things none of them had: a single entry point, and a statement of
which figures must never be added. The tab list comes from the server, so the page cannot
offer a tab the handler does not serve.

`AdminRevenue.jsx` is the exception — it was rewritten, because its arithmetic was the
blocker. Four defects went with it, fixed on the server rather than moved:

- `(i.total_amount || 0)` and `(r.savings || 0)` — an absent amount became a confident
  zero, so an invoice with no total counted as free.
- amounts added across currencies with no check.
- `.list()` with no limit and `.list('-month', 500)` — lower bounds displayed under the
  word "Cumulative".
- one KPI labelled "Cumulative monetized" summed `issued/sent/due/overdue/paid`. That is
  **billed**, not received. They are now two figures, because the difference between them
  is CAMBRA's collection risk and it deserves a number of its own.

A fifth, smaller one: the monthly chart bucketed `paid_at` by **local** month, so a
payment at 23:30 UTC on the last day of a month landed in the next one for any operator
east of London. The series is UTC-keyed, and a month whose invoices span currencies is
reported as unplottable rather than drawn as a zero bar.

---

## 6. The gate now reads code, not text

Three checks failed on comments that *described* the fix by quoting the forbidden
pattern — the same thing that happened in C4. The fix was not to reword the prose but to
strip comments before the structural checks, because the dangerous direction is the other
one: a comment mentioning a **required** pattern could make a check pass with nothing
implemented behind it. Checks that deliberately assert an explanation is present run
against the full text and say so.

---

## 7. Counters

- Logical routes 35 → **36** (`financeWorkspaceAdmin`, hosted on `adminSummaries` behind
  the `finance_` prefix). Physical functions stay **276**.
- Direct browser CRUD: 11 open → **10 open, 2 fixed**. The two CRITICAL ones (a browser-
  generated OAuth client secret and a browser hard-delete of webhook config) belong to
  C12.
- Entities: **no new entity**. `readBillingIdentity` exposes only the fiscal fields, so a
  billing form no longer receives the whole Brand including `stripe_customer_id`.
- No seal changed. `productionSealEligible` remains `false`.

---

## 8. Carried forward

- **C10–C11** — Intelligence consolidation: six aggregators, and `ProviderPricingVersion`
  still has no live creator.
- **C12** — the two CRITICAL browser writes, Founder OS exceptions, Settings/Advanced
  System.
- **C13** — retire the four legacy finance routes, wire the redirects, cut the sidebar to
  twelve entries after parity.
- `/admin/audits` is still `NOT_BUILT` (C5 carry-forward).
- The `billing_country` dropdown offers FR and ES only. That matches the entity contract
  (`Brand.billing_country`: "Only FR and ES are billable"), so it is a **correct**
  limitation, not a gap — but it is worth stating that the 30-market tax matrix in
  `recoverTax.ts` is ahead of what billing accepts.
- The invoice `billable_savings_amount` field is documented as "in EUR" while `currency`
  may differ. That is a pre-existing tension in the fee base, untouched by C9.
