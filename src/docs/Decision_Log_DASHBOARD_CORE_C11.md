# DASHBOARD CORE — C11 decision log

**Date:** 2026-08-17
**Scope:** Intelligence UI — the tab shell, the pricing queue made reachable, the governed
Provider registry, and the correction of the Benchmarks claim.

---

## 1. The HIGHEST SEVERITY item, verified

The navigation registry said: *"AdminProviders.jsx:36-42 sets provider `revenue_share_pct`
from a browser form and writes it via generic CRUD. A governed handler must exist first."*

Verified, and the finding moves in both directions:

**It is not biasing anything today.** `Provider.revenue_share_pct` is read by **no
production code**. The only other references in the repo are three rows in `seedDemoData`.
The real provider compensation path is `ProviderRevenueLedger`, whose rate lives in
`rate_bps` bound to an `agreement_id` and an `agreement_terms_hash`. So the framing "this
biases merchant recommendations" overstates what is happening now, and saying otherwise
would be inventing a state.

**It is worse in a different way.** It is an *unbound duplicate* of a governed number — a
field literally labelled "Revenue Share %", editable by anyone with the admin page, with no
agreement, no hash and no history behind it. The danger is not what reads it today but what
reads it next: a shadow rate that diverges from the agreement-bound one, and whichever of
the two a future aggregator happens to pick becomes provider economics. That is precisely
what the section 4.11 firewall exists to prevent.

A second, smaller defect on the same line: `parseFloat(form.revenue_share_pct) || 0` stored
an empty field, and any unparseable text, as a confident 0% revenue share.

**Decisions:**

1. `revenue_share_pct` is not writable through the handler at all. It is in
   `PROVIDER_PROTECTED_FIELDS` with the reason **and** the governed alternative named, so
   the next person reads a decision rather than an oversight. `revenue_share_bps` is
   protected too — the unit must not be a loophole.
2. The page shows it read-only, **beside** the agreement-bound rate, and surfaces a
   divergence between the two rather than reconciling it silently.
3. `readProviderCompensation` distinguishes `NEVER_SET` from `RECORDED_AS_ZERO`, which is
   the distinction `|| 0` destroyed.
4. A create is previewed too. The old form created a provider on first click, so a mistyped
   name became a permanent row that Recover cases could reference.

---

## 2. Two mistakes of my own, both caught by checking against the authority

**`setForm(p)` copied the whole provider row into the form.** With the new handler that
patch would carry `id`, `created_date` and `revenue_share_pct`, so **every save would have
been refused**. The page now narrows the form to exactly the handler's editable fields, and
the gate fails if `setForm(p)` returns.

**`PROVIDER_CATEGORIES` was wrong twice.** I wrote it from memory: it invented `other` and
dropped `insurance` and `logistics`, both of which the page's own dropdown already offers.
A handler enum that disagrees with the entity enum refuses valid input. `Provider.jsonc` is
the authority; the gate now compares the two lists and I verified it catches a real
omission by breaking the list on purpose and watching it fail.

This is the same class as the C10 tab drift. Writing a list from the shape in my head and
then checking it against the declared source found a bug both times.

---

## 3. The Benchmarks claim, and a check that could not have cleared it

`AdminBenchmarks.jsx:27` said *"Control the ranges used to calculate savings and
infrastructure scores"*. The page has no write path of any kind: the only slider on it moves
a **sample revenue** to preview the computation, and the module that computes benchmarks is
frozen (`FROZEN-UNTIL-BENCHMARKS-MIGRATION`). Nobody can control a range from that page.

Corrected to say what it does, with a note recording the correction rather than quietly
rewording it.

**The gate could not have cleared it.** `check-legacy-routes.mjs` flagged the claim by
looking for the string `scoreEngine` — a *mention of where the logic lives*, which the page
correctly makes. So the marker was a pointer, not the claim, and correcting the copy would
have left the flag standing. The marker is now the claim itself.

**And my first replacement check was vacuous.** I added "the page must say `sample revenue`"
— which passed because the corrective *comment I had just written* contained the phrase, not
because the UI labelled anything. The control now carries a visible label and a
`data-testid`, and the check looks for the testid, which only exists if the JSX renders it.

That is the third time in this programme a check has been satisfiable by prose. The pattern
is worth naming: **a check that greps a file cannot tell a claim from a description of the
claim.** The fix is always to assert on something only the implementation can produce.

---

## 4. The pricing queue, made reachable

C10 built the adjudication backend; until C11 only an API caller could use it. The
`pricing-queue` tab is where a human finally acts on a `RateChangeCandidate`.

The display rule that carries the weight: **a candidate that cannot be promoted has no
promote control.** Not a disabled button, not one that fails on click — absent. Most
candidates are "the page changed and we extracted no numbers", and an operator who *can*
click promote on one of those will eventually click it. Dismissing is always available,
because otherwise the queue can never be cleared — which is the state C10 found it in.

The queue also renders `—` and "source unreadable — this is not zero" when `open_count` is
null, so a broken read is never displayed as an empty backlog.

---

## 5. Consolidation

`AdminIntelligenceWorkspace.jsx` mounts the six legacy pages unchanged plus the new
`pricing-queue` tab. Same shape as Finance: the pages C0 found already correct are mounted,
not rewritten. `/admin/intelligence` now serves the shell.

`AdminRoutingIntelligence` is mounted verbatim specifically so its SHADOW ONLY labelling is
carried over word for word — the registry called that out and rewriting the page is how such
a label goes missing.

All six intelligence redirects are now `blocker_cleared: true`, `ready: false`. They stay
live until C13.

---

## 6. Counters

- **No new logical route.** The provider actions live on the existing
  `intelligenceWorkspaceAdmin` route (`intelligence_` prefix), so the count stays at **37**
  and physical functions at **276**.
- Direct browser CRUD: 10 open → **8 open, 3 fixed**. Both remaining CRITICAL items are
  C12's: a browser-generated OAuth client secret and a browser hard-delete of webhook
  config.
- Unbacked UI claims: 1 → **0** outstanding.
- **No new entity.** No seal changed. `productionSealEligible` remains `false`.

---

## 7. Carried forward to C12

- **`OAuthAppsPanel.jsx`** — an OAuth client secret generated in the browser. CRITICAL.
- **`WebhooksTable.jsx`** — webhook endpoint config created and hard-deleted from the
  browser. CRITICAL, and a hard delete has no undo.
- The three remaining non-critical CRUD sites: `OrganizationsPanel`,
  `AdminApplicationDetail`, `AdminUserDetail`.
- Founder OS exceptions and Settings / Advanced System.
- `/admin/audits` is still `NOT_BUILT` (C5 carry-forward, now the only unbuilt workspace).
- The legacy `Provider.revenue_share_pct` values still exist in the data. C11 stops new
  ones and surfaces divergence; deciding whether to migrate or retire the column is a data
  decision, not a code one, and belongs with the founder.
