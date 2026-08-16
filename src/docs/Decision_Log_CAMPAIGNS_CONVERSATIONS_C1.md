# Decision Log — Campaigns + Inbox & Conversations — C1 (canonical schemas and compatibility)

Date: 2026-08-16 · Opened on tree `14f9dcb5` (C0) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C1. **No live migration, no
external effects.**

## Baseline al abrir

Entities 253 → **257**. Retention categories 18 → **20**. Physical Base44
functions **276** (unchanged — C1 adds zero functions). Logical routes **28**
(unchanged — C1 adds no route; the campaign actions land in C2/C3 on the
existing `commercialCampaignAdmin` host).

## EXISTING / REUSE / GAP / RUNTIME-ONLY

- **REUSE unchanged**: `CommercialPolicy`, `OutboundControl`,
  `OutboundSendingProfile`, `CommunicationMessage`, `Approval`,
  `OperationalLog`, `AutonomyIncident`, `AcquisitionTouch`,
  `AcquisitionAttribution`, `OutreachExperimentStats`, and every governance
  primitive (`materialEffectContract`, `schedulerRun`, `costGovernance`,
  `commercialSendMessage`).
- **NEW (4 entities)**: `CampaignAudienceVersion`, `CampaignEnrollment`,
  `CampaignContentVersion`, `CampaignSequenceVersion`.
- **EVOLVED (4 entities, all additive)**: `CommercialCampaign`,
  `CommunicationThread`, `ContactSuppression`, `OutboundProviderEvent`.
- **NEW shared module**: `base44/shared/campaignsCore.ts` — pure adapters +
  read-only migration dry-run.
- **RUNTIME-ONLY**: real row counts, real backfill execution, provider
  reconciliation. All remain `RUNTIME_PENDING`.

## Decisiones no triviales

- **Legacy statuses stay valid in the enum.** `CommercialCampaign.status` now
  carries the 16 canonical states AND the three legacy ones
  (`READY_FOR_PILOT`, `PILOT`, `ACTIVE`). Rewriting stored rows to canonical
  values would destroy historical meaning and break `commercialCampaignAdmin`'s
  `update_draft` guard (which whitelists `DRAFT|READY_FOR_PILOT|PAUSED`).
  Instead `canonicalCampaignState()` projects legacy → canonical at read time:
  `READY_FOR_PILOT → READY_FOR_APPROVAL`, `PILOT|ACTIVE → RUNNING`. An
  unrecognized status projects to `REVIEW_REQUIRED`, never to a runnable state.
- **`lead_ids` stays required.** It remains the compatibility projection
  (spec §6.1). The versioned authority is `CampaignAudienceVersion`; the
  campaign points at it through `audience_current_version_id`. No existing
  reader breaks.
- **No new field is required anywhere.** Every evolution is optional, so all
  existing rows validate unchanged. Verified by test against the exact
  `required` arrays of the four evolved entities.
- **Suppression scope defaults to EMAIL.** A legacy row (no `scope_type`)
  normalizes to EMAIL scope over `email` — exactly what every existing
  pre-send check already enforces, so enforcement semantics do not change on
  the day the field lands. `suppressionMatches()` implements the five scopes
  and is the single evaluator the later chunks reuse.
- **Suppression reasons: map, don't rewrite.** `SUPPRESSION_REASON_MAP`
  projects the legacy enum (`opt_out`, `bounce`, …) onto the canonical
  taxonomy (§12.2) at read time. The stored enum is untouched, so no
  migration is needed to keep the ledger enforceable.
- **Thread status split is a projection, not a rewrite.**
  `projectThreadStatuses()` prefers explicit `commercial_status` /
  `operational_status` when present and otherwise derives from
  `classification` / `conversation_state` / `status` / `automation_paused`.
  A founder-paused thread projects to `PAUSED_BY_FOUNDER`; anything
  unmappable projects to `REVIEW_REQUIRED` — never to a healthy-looking
  `AI_HANDLING`.
- **Enrollment carries `operation_key` + `effect_key` from day one**, so the
  C4 execution engine can give manual, scheduled and Command execution the
  same durable identity (spec §3.4) without another schema change.
- **`founder_permit_id` is declared but unused.** CAMBRA Command's
  FounderPermit authority does not exist on this tree (C0 finding). The field
  exists so C3's preflight can report a `CONFIGURATION_REQUIRED` permit
  dimension fail-closed instead of silently skipping it. It is never treated
  as satisfied by absence.
- **Retention (§21.3).** Two new categories:
  `campaign_audience_and_enrollment_records` (personal data: normalized
  emails/names/roles → `LEGAL_REVIEW_REQUIRED`, exceptions include
  unsubscribe evidence and legal hold) and
  `campaign_content_and_sequence_versions` (no counterparty personal data by
  design → `LEGAL_REVIEW_REQUIRED`, immutable version archive). Neither is
  marked AUTOMATED, because no automated job exists — declaring one would be
  a false claim of implemented deletion.
- **Entity files are strict JSON despite the `.jsonc` extension.** Found the
  hard way: the first C1 pass added `//` comments to the edited entities and
  broke two unrelated suites (`commercialOS.test.js`,
  `finalRevenueEngineSeal.test.js`) that parse `base44/entities/*.jsonc` with a
  raw `JSON.parse`. Verified against `HEAD`: **no** entity file in the repo has
  ever carried a `//` comment. Decision: follow the existing convention —
  rationale lives in `description` fields and in this log, not in comments —
  and add a guard test that raw-parses every entity file, so the next person
  hits a clear failure in the C1 suite instead of a confusing one two suites
  away.
- **Migration is a dry-run function, not a job.**
  `buildCommercialMigrationDryRunReport()` only reads; it reports what a
  backfill *would* create and flags every ambiguity as `REVIEW_REQUIRED`
  (spec §24). An unreadable source is reported `ok: false` with its error —
  never as zero rows. A test asserts the dry-run cannot write by giving it a
  service whose `create`/`update` throw.

## Archivos

Created: `base44/entities/CampaignAudienceVersion.jsonc`,
`base44/entities/CampaignEnrollment.jsonc`,
`base44/entities/CampaignContentVersion.jsonc`,
`base44/entities/CampaignSequenceVersion.jsonc`,
`base44/shared/campaignsCore.ts`, `src/lib/campaignsSchemaC1.test.js`,
this decision log.
Modified: `base44/entities/CommercialCampaign.jsonc`,
`base44/entities/CommunicationThread.jsonc`,
`base44/entities/ContactSuppression.jsonc`,
`base44/entities/OutboundProviderEvent.jsonc`,
`config/data-retention-matrix.json`, plus regenerated artifacts
(`disasterRecoveryEntityCatalog.ts`, r0/r4/r5, documentation, durability).

## Tests (literales)

`src/lib/campaignsSchemaC1.test.js` — 25 tests:
strict-JSON guard over every entity file · RLS shape of the 4 new entities ·
audience reconciliation fields incl. the
person/company dedupe split · enrollment effect identity + accepted≠delivered
states · content/sequence blocked-claim and stop-condition fields · legacy
campaign statuses still valid · `lead_ids` still required · suppression and
provider-event evolutions add no required field · thread status split keeps
legacy fields · legacy state adapter incl. unknown → REVIEW_REQUIRED · lane →
engine mapping · thread projection (explicit wins, legacy derivation,
founder-paused, unmappable) · suppression normalization, reason mapping,
matching through all five scopes, inactive/empty-scope safety · migration
dry-run: never writes, READY vs REVIEW_REQUIRED, risk flags, unreadable
source reported not-ok · retention registration · DR catalog coverage.

## Comandos y resultados

- `npm run dr:catalog:generate` → 257 entities.
- `npm run retention:check` → PASS, 20 categories.
- `npx vitest run src/lib/campaignsSchemaC1.test.js` → 24/24 passed.
- Full cascade (agenttask → scheduler → workforce → operational-planes →
  r0/r4/r5 → documentation → durability) then `npm run verify:chunk` → EXIT 0.

## Seguridad / tenant

New entities are admin-read, service-role-write only. `CampaignEnrollment`
carries `brand_id` so merchant-lifecycle enrollments resolve an exact tenant;
platform acquisition keeps the existing `_platform` contract. No secret is
serialized in any new field (`provider_refs_json` holds replaceable transport
references only).

## External effects

**Zero.** No sends, no DNS, no provider mutation, no live migration, no
production data touched.

## Blockers / runtime pending

- FounderPermit authority absent (blocks a true permit preflight until
  `PROMPT_CAMBRA_COMMAND_V1` lands) — represented fail-closed, not skipped.
- Real legacy row counts and backfill execution remain `RUNTIME_PENDING`.
- Exact retention TTLs for both new categories require legal approval.

## Chunk hash

Recorded as the C1 commit hash.
