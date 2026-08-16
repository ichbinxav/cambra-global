# Decision Log — Campaigns + Inbox & Conversations — C0 (baseline, inventory, gap map)

Date: 2026-08-16 · Tree: `445ab4c8` (post Discovery V2 fix) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4 (§0-§33, chunks C0-C10). No code was
edited in this chunk — inventory and gap map only.

## Baseline al abrir

- Toolchain: Node `v24.19.0`, npm `11.17.0` (exact match with the inherited rule).
- Tree hash: `445ab4c850c04d89ef6520542aae3894b6c680c8`, working tree clean.
- Test baseline: 263 test files, 3413 tests passing (full `npx vitest run` on
  this tree), 0 unexplained skips observed in the last run output.
- Physical Base44 functions: **276 canonical** (`base44:functions:check` —
  bundle PASS "276 physical functions, 28 logical routes, 2874 staged files").
  The naive `ls base44/functions | wc -l` gives 300; the delta is non-function
  directories — the canonical count is the script's, as the spec warned.
- Logical routes: **28** (`BASE44_LOGICAL_ROUTE_TARGET = 28`,
  `scripts/lib/base44Bundle.mjs:13`). The v0.98.0 manifest's "27" is stale.
- Entities: 253 files under `base44/entities/`.
- Markets: 33 canonical / 30 active / FR, BE, NL protected (unchanged).
- Outbound: PAUSED_ZERO posture unchanged; no production seal.

## Estado de CAMBRA Command (§17 dependency)

`PROMPT_CAMBRA_COMMAND_V1.md` has NOT been executed on this tree:
- No `FounderPermit` entity or field exists anywhere in `base44/entities` or
  `base44/shared` (verified by search).
- `AdminCommand.jsx` exists but is the existing founder chat/command surface
  (founderOSCommand), not the typed tool gateway the spec's §17 assumes.
- DECISION (per the spec's own instruction): the Campaigns/Conversations tools
  of §17 will be built as typed action handlers on the canonical logical
  routes, ready to be discovered by Command when it lands. FounderPermit
  checks are represented as an explicit preflight dimension that reports
  `CONFIGURATION_REQUIRED` (fail-closed) until the permit authority exists —
  never silently skipped, never invented.

## Inventario existente (EXISTING → REUSE)

### Entities (verified field-by-field)
- `CommercialCampaign` — LEGACY SHAPE: `lead_ids` array is the only audience
  authority; `message_json`/`sequence_json` inline with `status:
  'NOT_PREPARED'` markers; statuses observed in code: `DRAFT`,
  `READY_FOR_PILOT`, `PAUSED` (+ `PILOT`/`ACTIVE` named in the legacy state
  adapter requirement). Has `audience_snapshot_json`, `capacity_preview_json`,
  `blockers`, `metrics_json`. → REUSE as the campaign authority, EVOLVE
  backward compatible (spec §6.1).
- `CommunicationThread` — rich: `classification`, `conversation_state`,
  `current_intent`, `automation_paused`/`pause_reason`, tenant resolution
  block, sending-profile resolution block, meeting block, `summary`,
  `experiment_key/variant`, `market_jurisdiction`. → REUSE as canonical
  thread; EVOLVE with campaign_id/enrollment_id + commercial/operational
  status split (adapter over existing `status` + `conversation_state`).
- `CommunicationMessage` — rich ledger: `idempotency_key`,
  `internet_message_id`, `provider_message_id`, `classification*`,
  `thread_context_snapshot_json`, `send_status`, `raw_event_json`,
  `quality_gate_json`, `approval_id`. → REUSE; evolve `send_status` semantics
  honestly (accepted ≠ delivered) with a legacy adapter.
- `OutboundSendingProfile` — operational status + caps + bounce/complaint
  windows + `webhook_status` + `provider_config_json` (non-secret). → REUSE;
  health projection (§6.10) is a read-model gap, not a schema gap.
- `ContactSuppression` — EMAIL-scope only (`email`, `reason`, `source`,
  `source_message_id`, `active`, `suppressed_at`, `expires_at`, `notes`).
  GAP: no `scope_type` (PERSON/COMPANY/DOMAIN/CAMPAIGN), no `company_key`,
  no `legal_basis_or_policy_ref`, no `created_by`. → EVOLVE backward
  compatible (absent scope_type ⇒ EMAIL).
- `OutboundProviderEvent` — provider/event_type/dedupe/retry/dead-letter
  fields, `related_thread_id`/`related_message_id`. GAP: no
  `signature_verified`, `normalized_event_type`, `related_campaign_id`,
  `related_enrollment_id`, `reconciliation_status`. → EVOLVE.
- Also present and reusable: `CommercialPolicy`, `OutboundControl`,
  `OutboundLead`, `PartnerProspect`, `Provider*`, `Approval`, `AgentTask`,
  `FounderCommandAudit`, `OperationalLog`, `AutonomyIncident`,
  `AcquisitionTouch`, `AcquisitionAttribution`, `OutreachExperimentStats`,
  `NegotiationCase`, `Brand`.

### Backend planes (verified call paths)
- Logical route `commercialCampaignAdmin` ALREADY EXISTS (host
  `adminSummaries`, `action_prefix: 'campaign_'`, source module
  `base44/shared/commercialCampaignAdmin.ts`, 53 lines): `list`,
  `create_draft` (explicit lead ids, blocked-lead refusal, audit-or-fail),
  `update_draft`, `prepare_pilot` (capacity preview + blockers +
  founder_pilot_authorization gate), `pause`. → This is the natural host for
  the §7 campaign actions; extend it rather than creating a parallel plane.
- Send plane: `commercialSendMessage` (canonical outbound primitive, effect
  fencing), `outboundVolumeWorker`, `commercialFollowUpWorker`,
  `followUpAgent`, `commercialReplyAgent`.
- Inbound plane: `instantlyWebhook`, `outlookInboundRouter`,
  `resendInboundWebhook`, `outboundProviderEventProcessing.ts`,
  `instantlyProviderEventRetryWorker`, `instantlyReconciliationWorker`,
  `processWebhookDeadLetters` + `webhookDeadLetterClaim.ts`.
- Governance: `materialEffectContract.ts`, `schedulerRun.ts`,
  `criticalExecution.ts`, `costGovernance.ts`, `approvalAuthority.ts`,
  `commercialPolicyAuthority.ts`, `commercialSendSafety.ts`,
  `operationalControl.ts` (Emergency epoch), `communicationTenant.ts`.
- Read plane: `adminSummaries` (hosts logical admin routes).

### Pages
48 admin pages exist. Directly affected: `AdminCommercialOS.jsx`,
`AdminCommercialAutonomy.jsx`, `AdminInbox.jsx` (approvals inbox — NOT the
commercial inbox), `AdminPipeline.jsx`, `AdminDiscovery.jsx`,
`AdminLayout.jsx`, `App.jsx` routing. None will be deleted before parity (C9).

## GAP → ACTION (authoritative list, mirrors the machine-readable gap map)

| # | Requirement (spec §) | Existing | Gap | Action (chunk) |
|---|---|---|---|---|
| 1 | Versioned audience (§6.2) | `audience_snapshot_json` (unversioned) | No immutable version, counts, hash | New entity `CampaignAudienceVersion` (C1) |
| 2 | Enrollment per recipient (§6.3) | none (lead_ids only) | Whole entity | New entity `CampaignEnrollment` (C1) |
| 3 | Immutable content versions (§6.4) | inline `message_json` | Whole entity | New entity `CampaignContentVersion` (C1) |
| 4 | Immutable sequence versions (§6.5) | inline `sequence_json` | Whole entity | New entity `CampaignSequenceVersion` (C1) |
| 5 | Campaign canonical states (§6.1) | DRAFT/READY_FOR_PILOT/PILOT/ACTIVE/PAUSED | Missing states + adapter | Shared state adapter, no destructive migration (C1/C2) |
| 6 | Suppression scopes (§6.11) | email-only | scope_type/company/domain/campaign fields | Backward-compatible schema evolution (C1) |
| 7 | Provider event evolution (§6.9) | retry/dead-letter core | signature_verified, normalized_event_type, campaign/enrollment refs, reconciliation_status | Backward-compatible schema evolution (C1) |
| 8 | Thread commercial vs operational status (§6.7) | `status`+`conversation_state`+`classification` | Split projection + campaign/enrollment refs + SLA/owner/ai_mode fields | Schema evolution + adapter (C1/C5) |
| 9 | `/admin/campaigns` workspace (§4.1, §7) | none | Whole page | `AdminCampaigns.jsx` (C2-C4) |
| 10 | `/admin/conversations` workspace (§4.2, §10) | AdminInbox = approvals only | Whole page | `AdminConversations.jsx` (C5-C7) |
| 11 | Audience build/dedupe/reconciliation (§7.3.2-4) | pieces (suppression check, dedupe keys) | Builder + reconciliation table | campaignAdmin actions (C3) |
| 12 | Content Studio + claims gate (§7.3.6) | claims discipline exists in send prompts | Variable schema, fallbacks, claims gate | C3 |
| 13 | Sequence builder + stop conditions (§7.3.7) | followUp workers | Versioned sequence + stop-condition preflight | C3 |
| 14 | Preflight PASS/BLOCKED/REVIEW_REQUIRED/UNKNOWN (§7.3.9) | prepare_pilot partial | Full dimensional preflight | C3 |
| 15 | Hash-bound approval (§7.3.10) | Approval + FounderCommandAudit patterns (Fase J) | Campaign-scoped approval binding | C3/C4 |
| 16 | Execution engine claims/settlement (§8) | schedulerRun + materialEffectContract + commercialSendMessage | Enrollment-level orchestration, dry-run adapters | C4 |
| 17 | Analytics/KPI read models (§9) | OutreachExperimentStats, AcquisitionAttribution | metric registry + snapshots + UNKNOWN semantics | C4 |
| 18 | Inbound resolution priority ladder (§10.10) | webhook routers resolve partially | Deterministic ladder + ambiguity REVIEW_REQUIRED | C5 |
| 19 | Classification taxonomy + human correction (§10.3) | classification fields exist | Canonical taxonomy + correction audit | C5 |
| 20 | AI/human takeover + follow-up queue + SLA (§10.5, §10.12) | automation_paused exists | Owner/takeover state machine + queue | C6 |
| 21 | Domains/mailboxes health + containment (§11) | profile fields + containCommunicationTransport | Health read model + auto-containment rules | C7 |
| 22 | Suppression UI + enforcement points (§12) | pre-send checks exist | Scoped UI + audit + removal authority | C7 |
| 23 | Provider events UI + replay (§13) | retry worker + dead letters | Admin surface + sanitized payloads | C7 |
| 24 | Pipeline/Discovery/Merchants/Founder OS links (§14-16, §18) | Discovery V2 fixed (445ab4c8) | Deep links + transitions | C8 |
| 25 | Command tools (§17) | NOT BUILT (no gateway) | Typed actions ready for discovery; FounderPermit = CONFIGURATION_REQUIRED | C8, dependency documented |
| 26 | Legacy consolidation (§4.4, C9) | legacy pages live | Redirects after parity | C9 |
| 27 | Migration dry-run + backfill (§24) | none | Dry-run report code, no live migration | C1/C10 |

## Riesgos de migración (declarados, no resueltos aquí)

- Row counts of live CommercialCampaign/Thread/Message/Suppression data are
  **UNVERIFIED offline** — the migration dry-run (C1) reports them at runtime;
  nothing is migrated live in this prompt.
- `CommercialCampaign.lead_ids` stays as a compatibility projection; large
  legacy campaigns backfill to `source: LEGACY_BACKFILL`,
  `status: REVIEW_REQUIRED` when incomplete (§24.2) — never guessed.
- `AdminInbox` (approvals) must NOT be cannibalized: `/admin/conversations` is
  a new route; the approvals inbox stays until C9 consolidation into Founder
  OS/Approvals with redirects.

## Quota y topología (decisión para C1+)

- Physical target stays **276**. All new backend surface ships as logical
  routes on existing hosts: extend `commercialCampaignAdmin` (campaign_*) and
  add `conversationAdmin`-family routes hosted on existing admin hosts
  following the `commercialCampaignAdmin` source_module pattern. Each new
  logical route deliberately bumps `BASE44_LOGICAL_ROUTE_TARGET` (28 → N) and
  both topology invariant tests — the deliberation gate from the house rules.
- New entities (4) require the `dr:catalog:generate` cascade and retention
  registration.

## External effects

Zero. No sends, no DNS, no provider mutations, no live migration in any chunk
of this Parte (§1.10). Everything live-facing lands as `RUNTIME_PENDING`.

## Chunk hash

Recorded at commit time as the C0 commit hash (this file + the two
machine-readable inventories under `config/commercial/`).
