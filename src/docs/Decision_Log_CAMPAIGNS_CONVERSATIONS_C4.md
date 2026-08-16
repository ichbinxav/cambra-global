# Decision Log — Campaigns + Inbox & Conversations — C4 (execution engine and analytics)

Date: 2026-08-16 · Opened on tree `56e1467e` (C3) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C4. **Dry-run only — no real sends.**

## Baseline al abrir

Entities 257, physical functions 276, logical routes 28 — unchanged. C4 adds
two pure shared modules and no route, no entity, no page.

## Qué se construyó

- `campaignExecutionEngine.ts` — effect identity, enrollment construction,
  the immediate pre-effect gates, conservative settlement, the dry-run
  transport and provider-event projection.
- `campaignMetrics.ts` — the metric registry with explicit numerators,
  denominators, scopes, unique keys and attribution rules.

## Decisiones no triviales

- **This engine never names or calls a provider.** It takes a `transport`
  result and, throughout this Parte, that is always `dryRunTransport()`, which
  performs no network call and reports `effect_started: false`. A real
  transport can only ever be the canonical outbound primitive, wired later.
- **One effect identity for manual, scheduled and Command execution** (spec
  §3.4). `buildEffectIdentity` is a pure function of campaign + enrollment +
  step, so a second attempt is recognised as the same operation rather than as
  a new send. Step 2 deliberately hashes differently from step 1 so a
  follow-up can never replay the initial send's key.
- **Enrollments can only be built from a FROZEN audience.** A READY audience
  is refused with `audience_version_must_be_frozen`, consistent with the C3
  preflight decision: the approval hash binds to the frozen membership.
- **The pre-effect gates re-read mutable state, and anything unreadable
  blocks.** An unreadable suppression ledger, an unreadable emergency
  authority and an unreadable budget are all blockers. The emergency epoch
  captured at claim time is compared again immediately before the effect, so
  an emergency that fired during the claim invalidates the authorization.
- **`Number(null)` is `0`, so an absent budget was misreported as
  "exhausted".** A test caught it. Both outcomes block the send, so this was
  not a safety hole — but it is a real diagnosis bug: "top up the budget" is
  the wrong instruction when the truth is "we could not read the budget". The
  absent case is now detected before the numeric comparison and reports
  `budget_unknown`.
- **Settlement is conservative by construction.** `settleSendAttempt` routes
  through `projectMaterialEffectState`, which already vetoes promoting an
  ACCEPTED/OBSERVED provider response to EXECUTED. Acceptance settles to
  `PROVIDER_ACCEPTED` with `delivered: false` and
  `delivery_evidence_required: true`. Ambiguity after the effect started, and
  any post-effect failure, converge to `REVIEW_REQUIRED` with
  `retry_safe: false`. Only a pre-effect failure is retryable.
- **Provider events promote only what they actually observe.** `DEFERRED`,
  `SOFT_BOUNCE`, `ACCOUNT_ERROR`, `AUTH_ERROR`, `WEBHOOK_ERROR`, `UNKNOWN` and
  `SEND_REQUESTED` are recorded but change no enrollment state — none of them
  is evidence of delivery. A terminal commercial state (a booked meeting, a
  qualified lead) is never downgraded by a late open/click event, but an
  unsubscribe, complaint or hard bounce still applies on top of it, because
  those are safety facts rather than engagement noise.
- **The follow-up race is covered in both directions** (spec §8.7). A reply
  observed before `EFFECT_STARTED` makes the gate refuse, so zero follow-ups
  are sent; a reply arriving after the provider effect keeps both facts (the
  send settles as accepted, the enrollment moves to REPLIED) and the next
  step's gate refuses because REPLIED is terminal.
- **Metrics: the two reply rates are separate metrics, never merged.**
  `reply_rate_delivered` and `reply_rate_accepted` have different denominators
  and are reported side by side; a test asserts they differ by exactly the
  delivery-observation gap on the same data.
- **A zero denominator is UNKNOWN, not 0%.** Reporting `0%` when nothing was
  delivered claims a measured failure where nothing was measured. A real `0`
  is only reported when the denominator is genuinely non-zero — both cases are
  tested.
- **Company level never merges with contact level** (spec §9.8). A company
  with two replying contacts counts as one company; the company metrics carry
  `unique_key: company_key` and a company-scoped label so they cannot be
  summed with contact-level counts by accident.
- **Out-of-office is counted separately and is not a reply of any sentiment**,
  consistent with the C3 sequence rule.

## Tests (literales)

`src/lib/campaignExecutionC4.test.js` — 27 tests: shared effect identity across
manual/scheduled/Command and distinct per step · enrollment creation refused
for every non-FROZEN audience status · one canonical enrollment per member with
unique keys · gates allow only when all satisfied · reply before effect stops
the follow-up · suppression landing during the claim stops it · unreadable
suppression ledger blocks · SAFE MODE and communications pause block ·
emergency epoch change during the claim blocks · unreadable emergency authority
blocks · inactive policy / ineligible market / degraded profile block ·
unreadable budget reports `budget_unknown` and zero budget reports
`budget_exhausted` · every terminal enrollment state refuses · every
non-sending campaign status refuses · acceptance settles as PROVIDER_ACCEPTED
and never delivered · ambiguity ⇒ REVIEW_REQUIRED and not retry-safe ·
pre-effect failure is retry-safe, post-effect is not · dry-run performs no
external effect · provider events: delivery promotes, seven non-delivery events
change nothing, replies/bounces/complaints/unsubscribes map canonically,
terminal state preserved against a late open, unsubscribe/complaint still apply
· the follow-up race in both directions.

`src/lib/campaignMetricsC4.test.js` — 11 tests: every metric declares its full
contract · unavailable source ⇒ every metric UNKNOWN · accepted counted without
delivered · the two reply rates stay separate with different denominators ·
zero denominator ⇒ UNKNOWN with `denominator_is_zero`, real zero reported when
the denominator exists · OOO counted separately and excluded from the reply
denominator · a company with two replying contacts counts once · company
metrics carry a company-level scope and unique key · funnel monotonicity ·
EXCLUDED enrollments leave the eligible base.

## External effects

**Zero.** The only transport used is the dry-run adapter.

## Blockers / runtime pending

- Real send execution, real provider idempotency and real reconciliation remain
  `RUNTIME_PENDING`; nothing in this chunk can be promoted to a live send
  without wiring the canonical outbound primitive and a founder authorization.
- Approval still cannot be granted on this tree (FounderPermit UNKNOWN, C3), so
  no campaign can reach a state where this engine would run against a real
  transport.
- Attribution beyond the campaign funnel (meetings, connections, revenue) is
  wired to the existing acquisition attribution surfaces in C8.

## Chunk hash

Recorded as the C4 commit hash.
