# Decision Log — Campaigns + Inbox & Conversations — C6 and C7

Date: 2026-08-16 · Opened on tree `ae63b45a` (C5) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4, chunks C6 (AI handling, takeover,
follow-ups, SLA) and C7 (domains, mailboxes, suppressions, provider events).
**Dry-run only — no sends, no DNS mutation, no live suppression writes.**

C6 and C7 are logged together because both are pure decision layers over
authorities that already exist: neither adds an entity, a route or a page.
Entities 257, physical functions 276, logical routes 29 — all unchanged.

## C6 — SLA, follow-up queue, escalation, reply drafts

### Decisiones no triviales

- **An SLA that cannot be computed is UNKNOWN, never ON_TIME.** A thread with
  no recorded deadline, an unparseable deadline, or an invalid reference time
  reports `UNKNOWN` with the specific reason. Rendering "on time" for a
  commitment we never recorded is a false compliance claim, and it is exactly
  the number a founder would trust when deciding not to intervene.
- **`NOT_APPLICABLE` is reserved for when the ball genuinely is not with us** —
  closed, completed, or waiting on the counterparty. It is not a fallback for
  "we could not tell".
- **A thread appears in exactly one follow-up bucket.** The ladder is ordered
  (REVIEW_REQUIRED → OVERDUE → DUE_TODAY → UNCLASSIFIED_REPLY → UNOWNED_REPLY
  → WAITING_ON_US → STALE/WAITING_ON_THEM), so bucket counts sum to the queue
  total with no double counting. Tested.
- **Escalation is decided from message CONTENT, not from classifier
  confidence.** A request for a savings guarantee escalates even when the
  classification is a routine `MORE_INFORMATION`. The trigger list covers
  guarantees, pricing/discounts, contracts and mandates, exclusivity, legal
  action, security incidents, privacy/deletion, complaints, billing disputes,
  migrations and media — in EN, ES and FR, because CAMBRA operates in all
  three and a Spanish "¿podéis garantizar el ahorro?" is the same commitment
  as its English form.
- **"We do not know" is an escalation reason.** `ANSWER_UNKNOWN` and
  `SOURCE_CONFLICT` are triggers in their own right: the alternative is
  improvising an answer, which is how unproven claims reach a merchant.
- **The recommended safe response commits to nothing.** When escalating, the
  suggested reply acknowledges and promises a follow-up while explicitly
  making no commercial, legal or economic commitment.
- **A reply draft is only ever a draft.** `buildReplyDraftEnvelope` always
  reports `send_performed: false` and `external_send_performed: false`, and it
  requires human review whenever autonomy is not granted OR escalation fired.
  It carries the source facts, assumptions and unanswered questions so the
  reviewer can see what the draft is standing on (spec §19.3).

## C7 — sender health, containment, suppressions, provider events

### Decisiones no triviales

- **Health is evidence PLUS freshness.** An observation older than its TTL
  (24h default), or absent entirely, yields `UNKNOWN` with `can_send: false` —
  never "still healthy". Treating a stale green light as green is precisely
  how a degraded mailbox keeps sending. Both cases are tested.
- **Hard operational states beat metrics.** A blocked, quarantined or paused
  profile reports that state even with perfect bounce/complaint numbers.
- **A non-active webhook degrades the profile.** Without inbound events we
  cannot observe delivery outcomes, so we must not treat the sender as
  healthy — the absence of bad news is not good news here.
- **Containment pauses; it never destroys.** `evaluateSenderContainment`
  returns `campaigns_preserved: true` and `enrollments_preserved: true` by
  construction (spec §11.4). It also contains on an emergency pause and on an
  unreadable emergency authority.
- **Suppression scope is decided by the reason, not by the caller.** A caller
  cannot widen an unsubscribe into a company block. Most reasons scope to the
  address; only `COMPANY_BLOCK`/`CUSTOMER_EXCLUSION` scope to a company and
  `DOMAIN_BLOCK` to a domain.
- **A wrong contact does NOT blacklist the company.** `WRONG_PERSON` scopes to
  the individual address and carries an explicit, visible policy note: the
  person may be redirecting us to a colleague, and suppressing the whole
  company would destroy a legitimate referral. This is the conservative,
  documented policy the spec asked for (§12.2).
- **Only a temporary soft bounce expires.** Everything else persists until an
  authorized removal.
- **The legacy `reason` enum is preserved alongside the canonical one**, so
  every existing pre-send suppression check keeps working unchanged while the
  canonical taxonomy becomes available.
- **Suppression removal is never automatic** (spec §12.4): it needs an actor,
  an explicit reason of at least ten characters, a confirmation token and an
  audit — and a COMPLAINT or LEGAL_REQUEST can never be lifted through this
  path at all, regardless of authority.
- **An unverified provider-event signature is never processed.** Signature
  verification is checked before the event type is even considered, and an
  unrecognised event type stays `UNKNOWN` and unprocessable rather than being
  guessed into a delivery.

## Tests (literales)

`src/lib/conversationFollowUpC6.test.js` — 19 tests: ON_TIME/DUE_SOON/BREACHED
against a real deadline · UNKNOWN with no deadline, with an unparseable
deadline and with an invalid reference time · NOT_APPLICABLE only when not
waiting on us · fallback to next_action_due_at · each thread in exactly one
bucket with the bucket sum equal to the total · only canonical buckets · the
SLA reason surfaced on the row · UNAVAILABLE leaks no rows · guarantee request
escalates despite a routine classification · contracts/exclusivity/legal/
security/privacy/complaint/billing/discount escalate · Spanish and French
escalate · unknown answer and source conflict escalate · the five human-only
classifications escalate · an ordinary informational reply does not · the safe
response commits to nothing · drafts never send and carry their review reasons.

`src/lib/senderHealthC7.test.js` — 25 tests: HEALTHY only with a fresh clean
observation · stale ⇒ UNKNOWN · absent ⇒ UNKNOWN · hard states beat metrics ·
AUTH_EXPIRED from status or elapsed expiry · non-active webhook degrades ·
bounce/complaint thresholds degrade and throttle · WARMING and no-capacity
THROTTLED · only canonical states returned · containment for every unhealthy
state with campaigns and enrollments preserved · no containment when healthy ·
containment on emergency and on an unreadable authority · incident severity ·
unsubscribe scoped to the address and permanent with the legacy enum kept ·
wrong person does not blacklist the company · soft bounce expires, hard bounce
does not · company/domain scopes · unsupported reason and missing scope value
refused · every canonical reason supported · removal requires actor, reason and
confirmation · removal allowed only with everything supplied · complaint and
legal request never removable · unverified signature never processed · shared
provider vocabulary normalized · unknown event stays UNKNOWN.

## External effects

**Zero.** No DNS is read or mutated, no live suppression is written, no
provider is contacted.

## Blockers / runtime pending

- Real SPF/DKIM/DMARC/MX observation, real webhook signature verification
  against live provider secrets, and real mailbox auth remain `RUNTIME_PENDING`.
- The Domains/Mailboxes, Suppressions and Provider Events UI tabs consume these
  projections in C8/C9; the decision layers land here first so the UI cannot
  invent a health verdict of its own.
- Autonomous replying stays impossible on this tree (FounderPermit absent).

## Chunk hash

Recorded as the C6/C7 commit hash.
