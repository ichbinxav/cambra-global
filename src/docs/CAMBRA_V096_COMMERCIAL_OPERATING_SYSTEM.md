# CAMBRA v0.96.0 — Commercial Operating System

## Outcome

v0.96 turns the existing P1–P8 commercial architecture into one founder-operable control surface at `/admin/commercial`. It composes existing canonical leads, P7 strategies, policies, sending profiles, conversations, agents and runtime controls. It does not introduce a second lead store, conversation store, policy engine or sender.

The one new durable business artifact is `CommercialCampaign`. CAMBRA owns its audience, strategy references, message, sequence, sender allocation, readiness and metrics. Apollo and Instantly campaign/list identifiers remain replaceable references under `external_refs_json`.

## Founder workflow

1. Define and save multiple target profiles in `CommercialPolicy.icp_json`.
2. Select `AUTO`, `APOLLO` or `INSTANTLY` as discovery policy.
3. Run discovery without enabling outbound.
4. Inspect, filter, select and export canonical `OutboundLead` rows.
5. Create a CAMBRA campaign draft with a governed message and sequence.
6. Inspect real domains, mailboxes, warm-up, webhook, health and capacity evidence.
7. Prepare the campaign for a pilot.
8. Authorize real outbound only through the existing Founder Control preflight.
9. Pause globally from Founder Control, Commercial OS or Ask CAMBRA.

## Apollo sunset and Instantly handoff

`AUTO` prefers Apollo while its contract is valid through 2026-09-07. After expiry it selects Instantly SuperSearch only when both `INSTANTLY_API_KEY` exists and the official preview capability has authenticated with the required scope. Otherwise discovery stops visibly and safely. The canonical ICP, lead ID, score, campaign and conversation do not change during handoff.

Instantly uses its official API v2 preview, count and enrichment endpoints behind `LeadIntelligenceProvider`. The automated discovery path begins with preview and provider-independent ingestion. Paid enrichment is not silently activated. Transport remains separately controlled by `OutboundControl.instantly_enabled`, sender readiness, webhook state, suppression, cost and emergency gates.

## Safety invariants

- Campaign creation and preparation perform zero sends.
- `OutboundControl.acquisition_enabled !== true` means effective send capacity is zero.
- A campaign can become `READY_FOR_PILOT` while still listing `founder_pilot_authorization_required`.
- Missing daily policy limit, eligible leads or ready sender blocks capacity.
- Provider IDs never become CAMBRA identity.
- CSV exports escape spreadsheet formulas.
- The fixed safe-agent batch cannot invoke arbitrary functions.
- Ask CAMBRA can inspect Commercial OS, run governed discovery, verify SuperSearch and pause outbound, but cannot bypass approval or pilot gates.

## Real-runtime activation still required

The repository cannot prove a secret, mailbox, DNS record, provider plan, webhook delivery or live scheduler by static tests. Before any pilot, the founder must load the Instantly secrets in Base44, authenticate both transport and SuperSearch capabilities, map and warm senders, verify SPF/DKIM/DMARC, register the authenticated webhook, run zero-send dry-run and emergency-stop drills, confirm the cost budget, reconcile legacy thread sending profiles and obtain a fresh passing GO decision. Until that evidence exists, outbound remains off.
