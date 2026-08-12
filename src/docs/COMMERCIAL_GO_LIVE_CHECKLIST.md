# Commercial outbound — pre-GO CANARY checklist

Outbound is off by default. Passing local tests, creating a policy or running this checklist does not send a message. `outboundControlAdmin` is the only activation boundary and requires a fresh, matching preflight hash plus explicit admin confirmation.

## Required order

1. **Legacy backfill (dry-run).** Run `backfillLegacySendingProfiles` with no `apply`. Inspect every `REVIEW_REQUIRED` row and any coverage truncation.
2. **Legacy backfill (apply).** Re-run with `apply: true` and `confirmation: BACKFILL_LEGACY_SENDING_PROFILES`. Resolution may use only an existing valid profile, unambiguous historical message/transport evidence or one explicit valid profile in the thread's policy.
3. **Resolve review queue.** A thread with ambiguous or absent evidence stays paused with `sending_profile_resolution_status: REVIEW_REQUIRED`. Assign a verified profile through an audited admin correction and re-run the migration. Never infer one from engine, country or a convenient default.
4. **Create the production acquisition policy.** Initial mode is `CANARY`, `daily_send_limit` is 10 (permitted range 1–15), `min_lead_score` is at least 70, and `sending_profile_keys` is explicit.
5. **Choose markets from evidence.** `countries` contains only markets whose exact acquisition action is READY under current P10 and P11 evidence. There is no France-first default and registry membership is not clearance.
6. **Configure sending profiles paused.** Every allowlisted profile uses Outlook or Resend, has an exact sender/domain, explicit DKIM selectors and a 1–15/day canary cap. Admin deliberately saves it `paused`.
7. **Verify DNS and credentials.** Run the real-runtime verifier. Every configured profile must pass SPF, every explicit DKIM selector and DMARC. Resend requires a valid `RESEND_API_KEY` and a webhook created on the canonical `resendInboundWebhook` URL; `resend_register_webhook` requires `REGISTER_CAMBRA_RESEND_WEBHOOK`, returns the provider signing secret once to the authenticated Founder for immediate storage as `RESEND_WEBHOOK_SECRET`, and becomes non-disclosing once the vault value exists. Instantly requires its DRAFT campaign plus an ACTIVE authenticated webhook; rotation and provider delivery testing remain explicit admin actions. Outlook requires a live connector token.
8. **Enable warm-up explicitly.** Use `enable_sending_profile_warmup` with the exact profile key, final SHA and confirmation `ENABLE_SENDING_PROFILE_WARMUP`. Fresh matching deliverability evidence is mandatory. This does not start outbound.
9. **Close all GO hard gates.** Founder Control must show 15/15 using acceptable, fresh real/external/operator evidence on the deployed final SHA where required.
10. **Run the dry-run preflight.** Invoke `commercialGoLiveReadiness` for the active policy and exact provider scope while `OutboundControl.acquisition_enabled` is false. It recomputes P10/P11 per market and emits immutable decision evidence.
11. **Review PASS evidence.** PASS requires no eligible automatic follow-up without a valid profile, no truncated legacy scan, no invalid policy/profile/credentials and every selected market allowed by P10/P11. `REVIEW_REQUIRED` threads remain visible and paused.
12. **Start the CANARY.** Invoke `outboundControlAdmin` with the same provider scope, `confirmation: START_CANARY_OUTBOUND` and the unexpired `preflight_hash`. The function recomputes readiness and rejects any state change or hash mismatch.
13. **Observe at 10–15/day.** Review delivery, bounce, complaint, reply, suppression, legal, cost and incident evidence before changing policy. Missing or invalid `daily_send_limit` produces zero automatic sends.
14. **Scale through a new approved policy.** Do not mutate evidence or bypass CANARY gates. Scaling requires a separately reviewed policy and real cohort evidence.

## Final invariant

No legacy thread eligible for automatic follow-up may lack a valid `sending_profile_key`. Unresolved legacy threads must be explicitly surfaced and paused as `REVIEW_REQUIRED`; they may never be silently stranded or assigned an invented profile.

## Fail-closed outcomes

- Missing automatic profile: `sending_profile_required` (HTTP 409).
- Invalid or paused profile/cap: zero automatic sends.
- Missing, zero or invalid policy `daily_send_limit`: zero automatic sends.
- Market outside the active policy: zero automatic sends.
- P10/P11 not READY: preflight and send both block.
- Missing credential, stale preflight, changed hash or coverage truncation: activation blocks.

This checklist is an activation procedure, not proof that production deployment, legal review, deliverability or commercial performance has been completed.

Provider scope is structural: `resend` validates the active merchant-acquisition policy, `outlook` validates the active partner-acquisition policy, and `all` validates both policies in one hash. Each worker resolves its actual profile from its own policy allowlist.
