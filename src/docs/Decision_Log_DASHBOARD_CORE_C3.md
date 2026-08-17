# Decision Log — DASHBOARD CORE C3 (Pipeline backend, transitions, gate)

Date: 2026-08-17
Scope: C3 — the Pipeline portfolio projection, transition preview/apply, the logical
route, and `pipeline:check`. The backend was carried forward from C2 and lands here.

External effects: **zero**.

## 1. The projection never becomes an authority

`pipelineCore.ts` reads the four existing lane authorities and resolves stage through
the C2 registry. It stores no stage. `pipeline:check` enforces this by failing if
`PipelineItem`, `PipelineCase` or `CommercialPipelineCase` ever appears as an entity.

The one thing it writes is `PipelineStageEvent` — which gives the C2 entity its
production writer.

## 2. A lane that could not be read contributes nothing, not zero

A failed lane read is skipped, named in `source_health` with `records_read: null`, and
**suppresses the total** (`items.total` becomes null). "No leads" and "could not read
leads" are different answers, and a total over a degraded read is a lower bound presented
as a total.

## 3. A defect I introduced and caught before it shipped

My first version of `canonicalToLegacy` was dead code that always returned an empty map,
with a fallback that wrote the **canonical stage key** into the legacy column. That would
have written `MEETING_BOOKED` into `OutboundLead.stage`, violating the entity enum and
corrupting the authority the projection is supposed to protect.

Fixed by moving the reverse mapping into `pipelineStageRegistry.ts`, where the JSON
already lives, and by making the write **refuse** rather than fall back:

```
canonical_stage_not_expressible_in_authority_column
```

`ENGAGED` exists in `revenue_stage` but not in `stage`, so a transition to ENGAGED on the
merchant lane is refused rather than written invalidly. There is a test for exactly that.

## 4. Only the primary column moves

`OutboundLead` has three progression columns. A transition writes **the first only**, and
the preview names both the column that moves and the ones left alone. Writing all three
would assert values the caller never supplied. A test asserts `revenue_stage` is untouched
after a transition.

## 5. Preview binds what it showed

`apply_stage_change` requires the `preview_hash`. If the subject moved between preview and
execute, the hash mismatches and the change is refused — so the founder cannot approve one
thing and have another happen.

## 6. A real move with unwritable history reports the truth

The authority is moved with CAS **first**, then the event is appended. If the event write
fails, the call returns `ok: true` with `history_recorded: false`. The move happened;
claiming failure would be a worse lie than an incomplete history.

## 7. Filters keep unknown

A minimum-value filter **keeps** rows whose value is unknown, because unknown is not "less
than". Excluding them would hide the rows that most need attention.

## 8. Topology

`pipelineWorkspaceAdmin` is a logical route on `adminSummaries`.
`BASE44_LOGICAL_ROUTE_TARGET` 32 → 33, all three counter sites updated. **Physical stays
276.**

## 9. Carried forward to a later chunk

- **The UI.** `pipelineCore` and the route exist and are tested; `AdminPipeline.jsx` still
  renders the old kanban over the dead entity. Replacing it is the remaining C3 scope and is
  stated rather than implied.
- Analytics beyond the seven KPIs (cohort conversion, velocity percentiles, forecast
  accuracy) need historical `PipelineStageEvent` rows, which do not exist yet.
- Campaigns/Conversations handoff wiring: the registry declares the allowed source events
  (`message_delivered_observed`, `inbound_reply_observed`, `meeting_booking_receipt`,
  `connection_completed_readback`); nothing emits them into the pipeline yet.

## 10. Files

```
base44/shared/pipelineCore.ts            (new)
base44/shared/pipelineAdminCore.ts       (new)
scripts/check-pipeline.mjs               (new)
src/lib/pipelineCoreC3.test.js           (new, 26 tests)
base44/shared/pipelineStageRegistry.ts   (canonicalToLegacy added)
base44/functions/adminSummaries/entry.ts (logical route)
base44/deployment-topology.json          (route registered)
+ 3 counter sites, package.json
```

`verify:chunk` EXIT 0 — 4045 tests, 293 files.
