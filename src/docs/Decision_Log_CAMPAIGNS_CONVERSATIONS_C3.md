# Decision Log — Campaigns + Inbox & Conversations — C3 (audience, content, sequence, preflight)

Date: 2026-08-16 · Opened on tree `194f7c8d` (C2) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C3. **No external effects.**

## Baseline al abrir

Entities 257, physical functions 276, logical routes 28 — all unchanged. C3
adds four shared modules and six actions to the existing
`commercialCampaignAdmin` route; no new entity, no new route, no quota change.

## Qué se construyó

- `campaignAudienceBuilder.ts` — the exclusion ladder and reconciliation table.
- `campaignContentValidator.ts` — variable resolution + the claims gate.
- `campaignSequenceValidator.ts` — steps, delays and mandatory stop conditions.
- `campaignPreflight.ts` — the dimensional preflight and the hash-bound
  approval scope.
- Actions: `build_audience`, `freeze_audience`, `validate_content`,
  `validate_sequence`, `preflight`, `request_approval`.

## Decisiones no triviales

- **Fixed exclusion order, one bucket per candidate.** The ladder runs
  person dedupe → company dedupe → cooldown → suppression → invalid email →
  protected market → already merchant → policy block → company contact cap.
  A candidate lands in the FIRST bucket that fires, so the buckets sum exactly
  to `selected - final_eligible`. The builder returns `reconciles: true/false`
  and a test asserts it — a reconciliation table that does not add up is a bug,
  not a rounding detail.
- **Person and company dedupe stay separate** (spec §6.2). A second contact at
  an already-seen company is reported as a COMPANY duplicate, not hidden inside
  the person bucket.
- **An unreadable `last_contacted_at` excludes rather than passes.** Treating an
  unparseable timestamp as "never contacted" is precisely how double outreach
  happens; it is excluded as RECENTLY_CONTACTED with
  `detail: unreadable_last_contacted_at` so it is visibly reviewable.
- **An unreadable suppression ledger aborts the whole build.**
  `build_audience` uses `requireRuntimeSource` on `ContactSuppression`, so a
  failed read raises 503 and writes no audience version. "We could not read the
  do-not-contact list" must never become "nobody is suppressed".
- **Market gating reuses `evaluateMarketLaunchScope`.** FR/BE/NL are excluded
  because the primitive reports them not commercially eligible, and an unknown
  or empty country resolves to `UNKNOWN_BLOCKED` — also excluded. Tested for
  all five cases.
- **Email validation is a gate, not a parser.** Anything the checker is not
  sure about is INVALID_EMAIL. Sending to a malformed address costs sender
  reputation, so the conservative direction is the correct one.
- **Claims gate runs on the RENDERED body, not the template.** A claim
  assembled from `{{specific_observation}}` is caught after substitution — a
  test proves an innocent-looking template with a hostile variable value is
  blocked. Guarantees are blocked unconditionally; specific economic claims and
  audit assertions require evidence that is `OBSERVED`, has a source, AND
  belongs to that exact recipient. Another merchant's evidence never unlocks a
  claim, and INFERRED evidence never counts as observed.
- **An undeclared variable is treated as required.** An unknown `{{token}}`
  blocks rather than rendering empty, so a template typo cannot ship as a blank
  in a real email.
- **Sequence: the mandatory stop conditions are the safety core.** All 14 must
  be declared; a test removes each one individually and asserts the sequence is
  blocked. Out-of-office rescheduling must be bounded (`max_reschedules` 0–2)
  and must not count as a negative reply — an unbounded reschedule is how an
  infinite follow-up loop is created.
- **Preflight: the verdict is the WORST dimension, and UNKNOWN never passes.**
  Severity order is PASS < REVIEW_REQUIRED < UNKNOWN < BLOCKED. A source we
  could not read is UNKNOWN, which blocks approval — the alternative (treating
  an unreadable authority as fine) is exactly the failure this project keeps
  designing against.
- **FounderPermit is UNKNOWN, not skipped.** The authority does not exist on
  this tree (C0), so the dimension reports UNKNOWN with
  `configuration_required: true`. Consequence: **no campaign can be approved on
  this tree today**, and that is the honest outcome — approval would otherwise
  claim permit coverage that does not exist.
- **Only FROZEN audiences pass preflight.** Initially READY also passed; a test
  caught it. A READY audience can still be rebuilt into a new version, which
  would silently invalidate the approval hash bound to its `content_hash`.
  Implementation tightened rather than the test relaxed.
- **Approving a configuration is not authorizing a send** (spec §7.3.10, §32.10).
  `request_approval` produces a hash-bound scope and sets
  `READY_FOR_APPROVAL`; the response states explicitly that external sends need
  a separate authorization and the C4 engine. A test asserts every mutation of
  any bound dimension changes the hash.
- **A REVIEW_REQUIRED content/sequence version is stored but never promoted.**
  The evidence is kept (so the founder can see what was rejected and why) while
  `content_current_version_id` / `sequence_current_version_id` stay on the last
  clean version.

## Defecto real encontrado y corregido durante el chunk

`dimension()` spread its caller-supplied extras LAST, so an extra named
`status` silently overwrote the dimension's own verdict. The first instance
(`audience_status`) was caught by a failing test; a regression guard added
immediately afterwards found a **second, previously unnoticed instance** in the
`commercial_policy` dimension, where a paused policy reported
`status: 'paused'` instead of `BLOCKED` — meaning it would not have appeared in
`blocked_dimensions` and the verdict aggregation would have skipped it. Fixed
structurally: `dimension()` now writes `key`/`status`/`detail` after the
spread, so no extra can ever clobber a verdict again. The guard test asserts
every dimension carries a valid verdict and that the aggregate matches the
dimension list, across eight input shapes.

## Invariante de sello respetada, no debilitada

An existing seal test (`v096CommercialOS.test.js`) asserts the campaign admin
surface does not so much as *mention* the canonical outbound send primitive —
a cheap, strong guarantee that this route cannot send. A C3 comment named that
primitive while explaining that C4 would use it, which tripped the check. The
comment was reworded rather than the invariant relaxed: the seal keeps its full
strength, and the "no send" property is additionally proven by behavior tests
asserting `external_send_performed: false` on every action.

## Tests (literales)

`src/lib/campaignsC3.test.js` — 43 tests: email gate accept/reject table ·
reconciliation adds up with one bucket per candidate · all protected and
unknown markets excluded · suppression blocks through all four scopes ·
cooldown honoured incl. unreadable timestamp · company contact cap with ranks ·
every exclusion carries a canonical reason · membership hash order-independent ·
variable extraction/blocking/fallback/undeclared/unsupported · claims gate
(guarantee always blocked, economic claim needs own-recipient OBSERVED
evidence, other merchant's evidence rejected, inferred rejected, audit claim
blocked, honest statements allowed) · full content validation incl. unsubscribe
requirement and post-render claim detection · sequence validation incl. each
mandatory stop condition removed individually, zero-delay follow-up, unbounded
OOO, OOO-as-negative, business hours/timezone, duplicate keys/ordinals, empty
sequence · preflight PASS only when all pass, UNKNOWN blocks approval,
FounderPermit UNKNOWN, BLOCKED beats UNKNOWN, SAFE MODE / paused outbound /
empty audience / claims blocked, frozen requirement, no external effect ·
verdict-integrity guard across eight shapes · approval hash stable and
invalidated by each of twelve bound dimensions.

`src/lib/campaignsAdminC3.test.js` — 15 tests over the real handler:
build_audience writes a versioned audience with a reconciliation that adds up
and excludes FR · unreadable suppression ledger ⇒ 503 and no version written ·
zero-eligible ⇒ REVIEW_REQUIRED · versions increment without touching the prior
frozen one · freeze is idempotent and refuses a REVIEW_REQUIRED audience ·
content/sequence promotion only when VALIDATED · blocked-claims version stored
but not promoted · validate without persist writes nothing · preflight blocks on
paused outbound and SAFE MODE, requires a frozen audience, reports
FounderPermit UNKNOWN and therefore refuses approval leaving the campaign in
DRAFT · no external effect reported.

## External effects

**Zero.** No provider is contacted by any action in this chunk.

## Blockers / runtime pending

- **No campaign can reach APPROVED on this tree** until the FounderPermit
  authority exists (`PROMPT_CAMBRA_COMMAND_V1`). This is intended and visible,
  not a silent block.
- Discovery Saved Search and dynamic-segment audience sources are wired in C8;
  C3 builds from the campaign's explicit lead selection. The exclusion ladder
  is source-independent, so adding a source does not change the safety
  properties.
- Real send capacity, provider health freshness and budget reservation become
  meaningful only with the C4 execution engine.

## Chunk hash

Recorded as the C3 commit hash.
