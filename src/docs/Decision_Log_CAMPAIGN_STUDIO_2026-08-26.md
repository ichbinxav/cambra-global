# Decision Log: Campaign Studio

Date: 2026-08-26

## Decision

`/admin/campaigns` now includes a complete draft studio for campaign setup,
lead selection, human-authored message content, explicit sender identities and
follow-up sequencing. The studio uses the existing canonical campaign actions;
it does not create a second campaign model or an alternate execution path.

## Canonical sources

- Leads come from `OutboundLead` and retain their observed contactability,
  outreach eligibility, compliance status and suppression state.
- Target profiles come from `CommercialPolicy` for `merchant_acquisition`.
- Sender choices come from `OutboundSendingProfile`; paused and incomplete
  identities remain visibly not ready.
- Capacity and global posture come from the singleton `OutboundControl`.
- An unreadable required source blocks the builder with `UNAVAILABLE`; it is
  never projected as an empty list.

## Save path

Saving uses the canonical actions in this order:

1. `campaign_create_draft`
2. `campaign_build_audience`
3. `campaign_freeze_audience` when the audience is ready
4. `campaign_validate_content`
5. `campaign_validate_sequence`
6. `campaign_update_draft` for the legacy projection
7. `campaign_preflight`

The audience, content and sequence are persisted as versioned evidence. If a
later step fails, the created draft remains visible and recoverable instead of
being hidden or reconstructed.

## Safety boundary

- The studio has no send, launch, schedule or provider-execution action.
- Saving a draft does not request approval.
- Invalid email, suppression, protected-market, merchant, policy, duplicate
  and cooldown checks remain authoritative in the audience builder.
- Content requires an unsubscribe line and passes variable and claims checks.
- Sequences carry the 14 mandatory stop conditions and recipient-local
  business hours.
- The current outbound posture remains `PAUSED_ZERO` with observed capacity
  zero. This change does not activate a sender, policy or regulated capability.

## Live-data effects

No live campaign, lead, policy or sender record was created or modified while
implementing or visually verifying this feature. Production verification opens
and interacts with the builder but does not press Save; the save path is covered
with mocked UI tests and backend contract tests.
