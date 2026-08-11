# CAMBRA v0.95 — P7/P8 Autonomous Commercial Execution

## Release boundary

v0.95 completes the code path around the existing P1–P6 architecture. It does not redefine Analyzer truth, verified savings, regulatory/legal authority, billing, contracts or migration. Apollo remains a temporary replaceable intelligence source until 2026-09-07. Instantly is a replaceable API v2 outbound/inbound transport; it never becomes CAMBRA's canonical company identity, intelligence brain, policy engine or conversation memory.

The deployed runtime must remain fail-closed. Missing Instantly secrets, unproven authentication, inactive authenticated webhook, unready sender, native provider reply AI, missing cost limits, an active emergency stop, stale preflight, suppression or an ineligible lead all produce zero automatic sends.

## Canonical flow

```text
Apollo/public discovery (temporary, replaceable)
  -> canonical OutboundLead warehouse and provenance
  -> P5/P6 score, contact, compliance and READY_FOR_CONTACT gates
  -> versioned CommercialStrategy (P7)
  -> policy-governed CommunicationThread/action (P8)
  -> OutboundProvider adapter
  -> Instantly API v2 transport
  -> authenticated provider event ledger
  -> canonical CommunicationMessage/thread
  -> CAMBRA classification, next-best-action, approval or suppression
  -> governed Instantly reply transport
```

No daily CSV handoff is required. Provider IDs live only in external-reference fields. The strategy and conversation survive a future provider replacement.

## New canonical components

- `CommercialStrategy`: versioned P7 decision, evidence, uncertainty, contact, market, language, CTA, follow-ups and blockers.
- `CommercialProviderState`: secret-free operational status for intelligence/outbound adapters.
- `OutboundProviderEvent`: raw+normalized event ledger, attempts, retry schedule, DLQ and canonical thread/message mapping.
- `LeadIntelligenceProvider`, `OutboundProvider`, `InboundConversationProvider`: replaceable contracts. Apollo and Instantly are implementations, not domain authority.
- `commercialExecutionDryRun`: zero-send internal proof from canonical lead to reply payload, including an explicit `UNCERTAIN`/human-review outcome.

## Instantly transport contract

Supported API v2 operations are account/campaign/webhook diagnostics, DRAFT campaign creation, campaign activate/pause, lead queueing, email reply and bounded email-list reconciliation. The campaign uses CAMBRA-owned subject/body variables, a maximum 15/day canary cap, business-hours schedule, reply/auto-reply stop, no open/click tracking and unsubscribe header. CAMBRA provides the message; Instantly delivers it.

`instantlyProfileReady` requires an external campaign, exact sender accounts, an active authenticated webhook, real sender readiness/warm-up evidence and no provider-native AI conflict. Diagnostics and all normal metered calls reserve the central API/email budget. Emergency remote pause intentionally bypasses cost reservation so a financial stop cannot disable the stop mechanism itself.

## Inbound, replay and reconciliation

`instantlyWebhook` verifies `x-cambra-instantly-secret` before constructing the Base44 client or writing any entity. Event keys are SHA-256 based and deterministic. Duplicate rows elect one winner. Successful/ignored/dead-letter deliveries return terminal replay state; transient processing follows 1, 5, 15, 60 and 240 minute backoff, then opens a critical incident.

Replies enter the existing canonical `commercialReplyAgent`. Bounce, unsubscribe, not-interested and wrong-person events update suppression/thread state. OOO defers the thread. Meetings and terminal states cancel competing follow-ups. Immediately before every send the central sender re-reads thread/suppression/latest-reply/meeting state, closing the common webhook-vs-worker race.

The 15-minute reconciliation worker reads at most 100 recent provider emails plus bounded account/campaign/webhook lists, restores missed sent/reply events by exact thread/sender/campaign evidence and never overwrites P1–P7 intelligence.

### Base44 function-quota runtime mapping

The linked Base44 app is a grandfathered 276-function deployment whose current plan rejects any new function name with `Maximum of 50 functions per app reached`. No production function was deleted to work around that external quota. The logical v0.95 functions remain independently testable and deployable in source, while the active runtime safely hosts them inside three already-deployed entry points:

- `outboundControlAdmin`: prefixed Instantly Admin actions, controlled dry-run and on-demand P7 strategy;
- `resendInboundWebhook`: routes Instantly only when the dedicated authenticated header is present, otherwise preserves the existing Svix/Resend path;
- `processWebhookDeadLetters`: every-5-minute host for provider-event retry and a separately slot-guarded every-15-minute reconciliation cycle.

Each logical worker retains its own scheduler key, cadence and duplicate guard. This is a physical deployment mapping only; provider-neutral domain state and contracts are unchanged.

## Founder control and effective capacity

Admin can inspect blockers, run the controlled E2E dry-run, configure a paused profile, diagnose API v2, create only a DRAFT campaign, register the authenticated webhook, pause remote campaigns, run a fresh preflight, start an explicitly confirmed canary and execute a global emergency stop. Emergency stop disables outbound/negotiation/migration/billing effects while preserving safe Analyzer/read-only intelligence. Safe resume leaves outbound paused and requires a fresh preflight.

Effective Instantly capacity is exactly `0` unless acquisition and Instantly switches are both on, provider state is `ACTIVE`, the exact profile is active/ready, policy is valid and all GO evidence passes. Passing local tests never turns these switches on.

## Activation order

1. Configure `INSTANTLY_API_KEY` and a separately generated `INSTANTLY_WEBHOOK_SECRET` in Base44 runtime secrets.
2. Run read-only API v2 diagnostics; confirm account state, plan capabilities and that provider-native AI replies are off.
3. Configure exact sending domains/accounts as paused profiles with SPF, DKIM and DMARC evidence.
4. Create the CAMBRA campaign in DRAFT at 1–15/day; register the exact deployed HTTPS webhook.
5. Observe real warm-up score, account active/setup state, tracking domain and sender health. Do not infer readiness from elapsed time.
6. Run zero-send dry-run, webhook controlled test, reconciliation, scheduler duplicate proof, cost kill-switch and global stop/resume drill.
7. Backfill legacy thread profiles; unresolved rows stay `REVIEW_REQUIRED` and paused.
8. Activate a founder-approved CANARY policy for only P10/P11-ready markets, then run a fresh hash-bound preflight.
9. Start a small real pilot only through the separate explicit Founder action. Observe bounce/complaint/reply/cost/event-loop health before increasing caps.

## Current external blockers

- `INSTANTLY_API_KEY`: absent; real auth and API capability proof unavailable.
- `INSTANTLY_WEBHOOK_SECRET`: absent; real authenticated webhook registration/receipt unavailable.
- DFY domains/accounts and warm-up: no real readiness evidence supplied.
- Real remote campaign/webhook and reply transport: intentionally not created or exercised without credentials.
- Standalone Base44 names for the new v0.95 functions: blocked by the current app plan quota; the tested host mapping above is deployed instead, without deleting legacy production functions.
- GitHub final-SHA CI and immutable deployed-SHA evidence remain separate external gates.

Therefore source can be locally verified and safely deployed in zero-capacity mode, but the final release classification cannot be full `PASS` or `GO_READY_FOR_CANARY` until those real conditions are proven.
