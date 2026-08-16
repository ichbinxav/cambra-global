# CAMBRA Campaigns + Inbox & Conversations — architecture and runtime status

Built by PROMPT_FIX_DISCOVERY_V2 Parte 4 (chunks C0–C10), 2026-08-16.
Per-chunk decisions live in `Decision_Log_CAMPAIGNS_CONVERSATIONS_C*.md`.

> **Nothing in this system can send an email today.** Approval is blocked by a
> missing authority, execution runs only through a dry-run adapter, and every
> action reports `external_send_performed: false`. See "Runtime pending".

## Canonical authorities (one per concept)

| Concept | Authority | Notes |
|---|---|---|
| Campaign | `CommercialCampaign` | Legacy statuses kept valid; canonical set added |
| Audience | `CampaignAudienceVersion` | Immutable, versioned, hash-bound |
| Recipient | `CampaignEnrollment` | One row per recipient, carries effect identity |
| Content | `CampaignContentVersion` | Immutable per language/variant |
| Sequence | `CampaignSequenceVersion` | Immutable, stop conditions bound |
| Thread | `CommunicationThread` | Commercial and operational status split |
| Message | `CommunicationMessage` | Unchanged ledger |
| Provider event | `OutboundProviderEvent` | Signature, normalization, reconciliation added |
| Sending profile | `OutboundSendingProfile` | Health is a projection, not a stored verdict |
| Suppression | `ContactSuppression` | Scopes added; legacy reason enum preserved |
| Pipeline stage | `OutboundLead.stage` | Reused; frontier documented in the Discovery V2 log |
| Emergency | `EmergencyControl` | Checked around every gate |

## Topology

- Physical Base44 functions: **276** — unchanged across the entire Parte.
- Logical routes: **29** (`conversationAdmin` added in C5; campaign actions ride
  the pre-existing `commercialCampaignAdmin` route).
- Entities: 253 → **257** (four campaign authorities).

## Lifecycle

```
Discovery run ─┐
Explicit leads ─┼─► build_audience ─► reconciliation ─► freeze_audience
CSV / segment ─┘        │
                        ▼
        validate_content ──► validate_sequence
                        │
                        ▼
                    preflight  (PASS | BLOCKED | REVIEW_REQUIRED | UNKNOWN)
                        │  worst dimension wins; UNKNOWN never passes
                        ▼
                 request_approval  → hash-bound approval scope
                        │  (blocked today: FounderPermit UNKNOWN)
                        ▼
        [C4 engine]  claim → pre-effect gates → transport → settle
                        │  transport is ALWAYS the dry-run adapter today
                        ▼
     provider events ─► enrollment state ─► metrics ─► pipeline transition
```

## Non-negotiable properties (each covered by a test)

1. **Provider acceptance is not delivery.** `PROVIDER_ACCEPTED` and
   `DELIVERED_OBSERVED` are distinct states; only an observed delivery event
   promotes.
2. **UNKNOWN never passes.** An unreadable source blocks a preflight, a send
   gate and a Founder OS alert list; it is never treated as permission.
3. **A zero denominator is UNKNOWN, not 0%.**
4. **Ambiguity never guesses.** Two equally-matching threads yield
   `REVIEW_REQUIRED` with no mutation; a cross-tenant match is refused.
5. **Post-effect ambiguity never retries.** It converges to `REVIEW_REQUIRED`.
6. **A reply stops the follow-up**, before the effect starts and after it.
7. **Claims need own-recipient observed evidence.** Guarantees are never
   permitted; another merchant's evidence unlocks nothing.
8. **Suppression cannot be bypassed** — not by any Command permission mode,
   and an unreadable suppression ledger blocks rather than passes.
9. **A wrong contact does not blacklist the company.**
10. **Health is evidence plus freshness.** A stale green reading is UNKNOWN.
11. **Escalation is decided from content**, not classifier confidence, in
    EN/ES/FR.
12. **Containment pauses, never destroys.** Campaigns and enrollments survive.

## Metric definitions

Every metric declares numerator, denominator, unit, scope, unique key,
attribution rule and freshness. `reply_rate_delivered` and
`reply_rate_accepted` are separate metrics and are never merged. Company-level
rates use `unique_key: company_key` and are never summed with contact-level
counts.

## Runtime pending (literal — nothing here is claimed as done)

```
final Base44 deploy parity
live mailbox auth
real SPF/DKIM/DMARC/MX observation
real Instantly webhook auth/events
real Outlook inbound/outbound reconciliation
real Resend events if used
real send idempotency/reconciliation
controlled campaign canary
real unsubscribe propagation
real complaint propagation
real hard bounce propagation
real stop-on-reply race
real human takeover race
mailbox degradation containment
sender pool reassignment
actual business-hours behavior
real meeting attribution
real connection attribution
real revenue attribution
SLO windows
backup/restore for commercial ledgers
retention execution receipts
legal review by market/lane
protected-market runtime proof
FounderPermit live proof
Emergency stop live drill
```

## Open decisions for the founder

1. **FounderPermit authority does not exist** (`PROMPT_CAMBRA_COMMAND_V1`).
   Until it lands, no campaign can be approved and CAMBRA can never reply
   autonomously. Both are reported as UNKNOWN/blocked, never skipped.
2. **Legacy consolidation (C9) is deliberately NOT done.**
   `/admin/commercial`, `/admin/commercial-autonomy` and `/admin/inbox` are
   untouched and still live. Redirecting them before the new workspaces reach
   parity would be a regression. See `Decision_Log_CAMPAIGNS_CONVERSATIONS_C8_C9.md`.
3. **Real sending requires an explicit founder authorization** plus wiring the
   canonical outbound primitive into the C4 engine's `transport` parameter.
4. **Retention TTLs** for the two new categories require legal approval; both
   are registered as `LEGAL_REVIEW_REQUIRED`, not as automated deletion.
