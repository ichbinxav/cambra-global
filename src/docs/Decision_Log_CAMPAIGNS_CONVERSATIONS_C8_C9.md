# Decision Log — Campaigns + Inbox & Conversations — C8 and C9

Date: 2026-08-16 · Opened on tree `3c16c7c6` (C6/C7) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4, chunks C8 (Discovery/Pipeline/Merchants/
Founder OS/Command integration) and C9 (legacy consolidation and UX polish).

Entities 257, physical functions 276, logical routes 29 — unchanged.
**No sends, no data deletion, no page removed.**

## C8 — integration surfaces

### Decisiones no triviales

- **No second control plane.** `campaignsIntegration.ts` is a pure projection
  layer: deep links point at the canonical pages, pipeline transitions reuse
  the existing `OutboundLead.stage` authority (the same one Discovery V2's
  frontier was documented against in `Decision_Log_Discovery_V2_Fix.md`), and
  Founder OS receives aggregates rather than a duplicated Campaigns UI.
- **A model classification alone can never reach `won`.** Each transition rule
  declares `model_alone_sufficient`. Send-observed and unsubscribe/complaint
  may fire from observation alone, because those are transport facts. Meeting,
  connection-completed, qualified and not-interested all require
  `human_confirmed` — the difference between "a classifier thought so" and "a
  human confirmed it" is exactly the difference between a pipeline you can
  trust and one you cannot.
- **A failed source never downgrades a stage.** `source_unavailable_no_downgrade`
  is returned instead of a transition: absence of evidence is not evidence of
  regression, and a lead silently falling out of `meeting` because a read
  failed would be worse than no update at all.
- **Discovery hand-off creates candidates, never effects.**
  `buildDiscoveryAudienceCandidates` carries the discovery score, fit band and
  evidence status with each candidate so the founder can see why a company is
  in the audience, and reports `creates: 'audience_candidates_only'` with
  `external_send_performed: false`. A result with no subject id is dropped
  rather than given an invented one.
- **Founder OS names unreadable sources.** An alert list built from a failed
  read reports `data_status: PARTIAL` and lists the unknown sources, so the
  founder sees "we could not check threads" rather than a reassuring empty
  list. Every alert carries a deep link (asserted in a test).
- **Command tools are DESCRIPTORS, not a gateway.** The Command tool gateway
  is a separate prompt and does not exist on this tree (C0). Publishing the
  typed contract here means Command can discover these tools when it lands
  WITHOUT this work having built a second gateway. `evaluateCommandToolInvocation`
  enforces the permission ladder, and the hard controls apply to every mode
  including ROOT: a material tool is blocked during an emergency, and a
  suppression bypass is refused in every mode. Reading is explicitly allowed
  during an emergency — reading is not a material effect.

## C9 — legacy consolidation: what was and was NOT done

The spec marks C9 as a founder check-in point precisely because real bookmarks
point at the legacy pages. **Nothing was removed, redirected or deprecated.**

### Estado actual (sin cambios)

- `/admin/commercial` (`AdminCommercialOS`) — live, untouched.
- `/admin/commercial-autonomy` (`AdminCommercialAutonomy`) — live, untouched.
- `/admin/inbox` (`AdminInbox`, the APPROVALS inbox) — live, untouched.
- `/admin/campaigns` and `/admin/conversations` are NEW routes added alongside
  them. Both appear in the nav; neither replaces anything.

### Por qué no se consolidó todavía

Parity has not been demonstrated. Concretely, the new workspaces cannot yet do
things the legacy pages do today:

1. Campaign approval is impossible on this tree (FounderPermit UNKNOWN), so a
   founder who needs to prepare a pilot still needs `AdminCommercialOS`'s
   existing `prepare_pilot` flow.
2. Execution is dry-run only, so no campaign can actually run from the new
   workspace.
3. `AdminInbox` serves approvals and agent questions — a different domain from
   the commercial inbox. Consolidating it belongs with Founder OS/Approvals,
   not with `/admin/conversations`.

Redirecting a bookmarked page to a workspace that cannot complete the user's
task would be a regression dressed as progress. The spec's own rule is
"redirect/deprecate only after parity" (§4.4, C9), and parity is not there.

### Qué haría falta para cerrar C9 (decisión del founder)

- FounderPermit authority (`PROMPT_CAMBRA_COMMAND_V1`) so approval can complete.
- A founder decision to authorize real sends, which unlocks the C4 engine
  against a real transport.
- An explicit call on where the approvals inbox lives (Founder OS vs a
  dedicated page), with redirects from `/admin/inbox`.

Until then the legacy pages stay exactly as they are. This is recorded as an
open decision, not as completed work.

## UX polish delivered in this chunk

- Both new workspaces state their own boundary permanently: "No sends from this
  workspace" (Campaigns) and "Draft only · no sends" (Conversations).
- Both render a fail-visible "Data unavailable" panel with blockers instead of
  an empty table.
- Nav entries, group assignment, documentation topic and EN/FR/ES labels are
  wired for both pages.
- Every KPI and metric surface declares formula, denominator, source and
  freshness, and reports UNKNOWN rather than zero when unmeasured.

## Tests (literales)

`src/lib/campaignsIntegrationC8.test.js` — 18 tests: deep links per entity with
encoding and null for unknown kinds · model-only transition allowed where
sufficient · connection-completed requires human confirmation before `won` ·
source failure never downgrades · already-in-target is a no-op · unknown rule
rejected and every rule declares evidence · Discovery candidates carry score
and evidence with no external effect · rows without a subject id dropped ·
Founder OS raises one alert per blocked campaign / escalated thread / unhealthy
sender with deep links · unreadable sources named as PARTIAL · nothing raised
when healthy · every PREPARE tool declares no external effect · insufficient
permission mode refused · material tools blocked during an emergency even in
ROOT · suppression bypass refused in every mode · unknown tool and invalid mode
rejected · reads allowed during an emergency.

## External effects

**Zero.**

## Blockers / runtime pending

- C9 consolidation remains OPEN pending the founder decisions listed above.
- Command gateway, FounderPermit and real sending all remain `RUNTIME_PENDING`.

## Chunk hash

Recorded as the C8/C9 commit hash.
