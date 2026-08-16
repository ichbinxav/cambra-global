# Decision Log — Campaigns + Inbox & Conversations — C2 (Campaigns read and draft foundation)

Date: 2026-08-16 · Opened on tree `c5757f7f` (C1) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C2. **No sends, no external effects.**

## Baseline al abrir

Entities 257 (unchanged — C2 adds none). Physical Base44 functions **276**
(unchanged). Logical routes **28** (unchanged): the campaign actions are hosted
by the ALREADY EXISTING `commercialCampaignAdmin` logical route
(`adminSummaries`, `action_prefix: 'campaign_'`), so no route was added and no
quota gate was touched.

## EXISTING / REUSE / GAP

- **REUSE**: `commercialCampaignAdmin` logical route and its dispatch in
  `adminSummaries/entry.ts` (already routes `campaign_*`), `runtimeSourceRead`
  helpers, `CommercialCampaign`, `OutboundControl`, `EmergencyControl`, the C1
  adapters in `campaignsCore.ts`.
- **NEW**: `base44/shared/campaignAdminCore.ts` (handler, SDK-free),
  `base44/shared/campaignsReadModel.ts` (pure projections),
  `src/pages/admin/AdminCampaigns.jsx`, route `/admin/campaigns`, nav entry.
- **GAP deliberately left open**: audience/content/sequence editing and
  preflight (C3), execution and real analytics (C4).

## Decisiones no triviales

- **Handler extracted from the SDK boundary, again.** `commercialCampaignAdmin.ts`
  imports `npm:@base44/sdk@0.8.41`, a Deno-only specifier vitest cannot
  resolve — the first attempt at behavior tests failed on import. The handler
  now lives in `campaignAdminCore.ts` (no SDK import) and
  `commercialCampaignAdmin.ts` is a thin wrapper that resolves the client, the
  user and the body and delegates. Same pattern as
  `emergencyControlAdminCore.ts` (Fase J) and `founderControlCenterCore.ts`
  (Fase K); it is now the house pattern for testable Base44 handlers.
- **`update_draft` guards on the STORED status, not the canonical one.** The
  legacy whitelist (`DRAFT|READY_FOR_PILOT|PAUSED`) is preserved verbatim so a
  legacy `READY_FOR_PILOT` campaign stays editable exactly as before this
  refactor. The canonical status is only added to the *error response* so the
  founder sees `RUNNING` rather than the raw `ACTIVE`.
- **Delivery KPIs are UNKNOWN, not zero.** `provider_accepted_today`,
  `delivered_observed_today` and `replies_today` report `status: UNKNOWN` with
  `blocker: execution_engine_pending_c4`. Rendering `0` would claim "nothing
  was delivered today" when the honest statement is "not measured yet" — the
  §3.8 rule. A UI test asserts the card shows "Unknown" and contains no bare
  `0`.
- **A duplicated singleton authority is UNKNOWN, never "first row wins".** The
  overview reads `OutboundControl` and `EmergencyControl` with limit 2; if two
  rows come back, outbound posture reports `UNKNOWN` instead of silently
  picking one. Tested.
- **List degrades to 503 with an explicit blocker.** An unreadable
  `CommercialCampaign` source returns `data_status: UNAVAILABLE` + `blockers`
  and the UI renders a "Data unavailable" panel — never an empty table that
  reads as "you have no campaigns" (§23.2). Tested both server- and UI-side.
- **Detail declares canonical-model gaps instead of synthesising versions.**
  A legacy campaign with only `lead_ids` + inline `message_json` reports
  `canonical_model_gaps: [no_versioned_audience, no_versioned_content,
  no_versioned_sequence]` and shows its legacy evidence under an explicit
  "Legacy projection" heading. The inline `message_json` is NOT presented as a
  content version, and `{status: 'NOT_PREPARED'}` is correctly read as *not*
  prepared.
- **`lane` is validated against the canonical enum on write.** An unsupported
  lane is rejected (400) before any row is created, so the field can never
  drift from `CAMPAIGN_LANES`.
- **The page states its own boundary.** A permanent "No sends from this
  workspace" chip is rendered in the tab bar, and the detail view names which
  chunk owns the unbuilt parts (C3/C4) instead of showing a dead shell.
- **i18n**: `nav.Campaigns` added in EN/FR/ES (§23.6), matching the existing
  `ADMIN_LAYOUT_COPY` structure.

## Archivos

Created: `base44/shared/campaignAdminCore.ts`,
`base44/shared/campaignsReadModel.ts`, `src/pages/admin/AdminCampaigns.jsx`,
`src/pages/admin/AdminCampaigns.test.jsx`, `src/lib/campaignsAdminC2.test.js`,
this decision log.
Modified: `base44/shared/commercialCampaignAdmin.ts` (now a thin wrapper),
`src/App.jsx` (lazy import + `/admin/campaigns` route),
`src/pages/admin/AdminLayout.jsx` (nav entry, Commercial group,
documentation topic, EN/FR/ES labels), plus regenerated artifacts.

## Tests (literales)

`src/lib/campaignsAdminC2.test.js` — 25 behavior tests invoking
`handleCampaignAdminAction`: non-admin/missing user refused before any read ·
legacy status projected to canonical without rewriting storage · filters by
status/lane/market/owner/needs_attention/search · unavailable source ⇒ 503 +
blocker, never an empty list · overview KPIs UNKNOWN when the source failed ·
every KPI carries formula/denominator/source/scope · delivery KPIs blocked on
C4 · outbound posture UNKNOWN when the singleton authority is duplicated ·
create_draft writes a DRAFT with lane and no external effect · unsupported
lane rejected before any write · suppressed lead refuses the campaign · audit
failure ⇒ 503 + campaign flagged · detail gap detection and real versions ·
404/409 authority handling · update_draft on a legacy row · update_draft
refused on a running campaign with the canonical status reported ·
prepare_pilot still token-bound · pause records the founder pause ·
unsupported action rejected · pure projections (absent metric ≠ zero,
NOT_PREPARED ≠ prepared, unknown filter matches nothing, unavailable overview
leaks no rows).

`src/pages/admin/AdminCampaigns.test.jsx` — 11 UI tests (jsdom): UNKNOWN KPI
renders "Unknown" with its blocker and no bare zero · every KPI shows its
formula/denominator/source/freshness · outbound posture and SAFE MODE visible ·
the "no sends" boundary is always on screen · canonical status shown with the
stored legacy value · absent metric renders as a dash · unavailable source
renders the fail-visible panel and no rows · blocked campaign flagged ·
detail declares canonical-model gaps · detail names C3 as the owner of the
unbuilt editors · detail is fetched through the canonical `campaign_detail`
action.

## Comandos y resultados

- `npx vitest run src/lib/campaignsAdminC2.test.js` → 25/25.
- `npx vitest run src/pages/admin/AdminCampaigns.test.jsx` → 11/11.
- Full cascade then `npm run verify:chunk` → EXIT 0.

## Seguridad / tenant

Every action requires `user.role === 'admin'` before any entity read. No
secret is serialized. The page never writes an entity directly — it only calls
the canonical logical route. Every response carries
`external_send_performed: false`.

## External effects

**Zero.**

## Blockers / runtime pending

Unchanged from C1, plus: campaign delivery/engagement analytics remain
UNKNOWN until the C4 execution engine produces enrollment-level observations.

## Chunk hash

Recorded as the C2 commit hash.
