# Decision Log — DASHBOARD CORE C2 (Pipeline canonical model)

Date: 2026-08-17
Scope: C2 — the versioned lane/stage registry, the one new durable entity, and
canonical stage resolution.

External effects: **zero**.

## 1. What was NOT done, and why that is the decision

**The entity columns were not migrated.** The prompt's §8.2 stage vocabularies differ
from every vocabulary actually stored in the tree. Rewriting those columns would be a
live data migration across roughly fifteen writers, on entities that carry real rows.
Out of scope for C2 and dangerous.

So the registry declares the **canonical reading** of stage, and the per-lane entity
columns remain the authority. Frontend and backend both consume the registry, so they
cannot drift — which is what §8.3 actually asks for.

## 2. The conflict rule

`OutboundLead` carries **three** overlapping mutable progression vocabularies —
`stage`, `revenue_stage`, `reservoir_state` — each written by different code paths that
map between them ad hoc. This is not an edge case; it is the normal shape of a lead row.

> When several source columns disagree about the same subject, take the
> **least-advanced** canonical stage and record the disagreement.

Claiming progress that cannot be proven is the error class. The test that matters:
a lead whose `stage` says `contacted` while `reservoir_state` says `converted` resolves
to **CONTACTED**, not WON, is marked `CONFLICTED`, and keeps the discarded `WON` reading
visible for inspection.

Related decisions inside the mapping:

- **`enriched` → DISCOVERED.** Enrichment adds data; it is not commercial qualification.
- **`waiting_window` / `waiting_capacity` → CONTACT_READY.** Waiting is an operational
  gate, not a stage.
- **`analyzed` → AUDIT_IN_PROGRESS**, not OPPORTUNITY_IDENTIFIED. Analysis being complete
  does not prove an opportunity exists.
- **`revoked` → BLOCKED**, not COMPLETED. A revoked mandate is not a completion.
- **`unknown` → IDENTIFIED**, the weakest provider stage, never a later one.
- **PartnerProspect `won` → APPROVED.** ACTIVATED, FIRST_REFERRAL and PRODUCTIVE require
  evidence that column does not carry, so they are never inferred from it.

An unmapped value returns `null` rather than being guessed into the nearest-looking stage,
and a row with nothing readable resolves to a **null stage with UNKNOWN** — never a default
of the first stage, which would make an unread row indistinguishable from a genuinely new one.

## 3. The one new entity

`PipelineStageEvent` — append-only, and the only new durable entity this whole programme
creates. It exists because nothing recorded a transition as a fact.

The proof, from C0: `AdminPipeline.jsx:16` computed days-in-stage from the row's
**creation date**, because no stage-entry timestamp existed anywhere. The "stuck > 7d"
badge was days-since-creation.

Fields worth noting:

- `from_stage` is empty on a subject's first observed event. Absence of history is not a
  transition from nothing.
- `stage_registry_version` is stored, so a later remapping cannot silently rewrite what an
  old row meant.
- `direction` is **derived from stage order**, not asserted. A BACKWARD move is legitimate
  but must be visible.
- `conflicted_sources_json` records what each column said and what was discarded.
- `confidence` caps at `OBSERVED` only for real observations. A model classification alone
  is never OBSERVED.
- Append-only is stated as a **domain intent**, with the honest note that the schema alone
  does not enforce it and later services plus tests must.

## 4. Transition rules the registry enforces

- A stage that declares `allowed_source_events` may **not** be reached automatically
  without one of them. A model saying a lead sounds interested is not an observed reply.
- A terminal loss or disqualification **requires a reason code**. "We lost it" with no why
  teaches nothing and is not auditable.
- `MERCHANT_LIFECYCLE` is **projection-only** and refuses every write. `DealActivation`
  already has a guarded transition authority — retired direct mutator, a guard that reverts
  illegal moves, CAS on every real change. Writing stages there would create a second one.
- Reaching `WON` **does not create a merchant**. Brand/Organization onboarding is the sole
  authority for that, and the registry note says so.

## 5. A test caught an over-generalisation of mine

I asserted every lane must have a win and a loss stage. `MERCHANT_LIFECYCLE` failed —
correctly. A merchant lifecycle does not "lose"; it blocks or churns. The prompt's own
§8.2 lifecycle list has no LOST stage, and inventing one would imply a funnel this lane is
not. The assertion was wrong, not the registry: it now checks win+loss on the three
commercial funnels and win+blocked on the lifecycle projection, with `BLOCKED` and
`CHURN_RISK` pinned.

## 6. `DealApplication` is refused by name

`RETIRED_AUTHORITY` names it with state `ZERO_PRODUCERS`, and `isRetiredAuthority()` lets
callers refuse it explicitly. No mapping is provided because there is nothing to map: zero
rows, no `.create()` anywhere, and `submitDealApplication` deleted in FASE 1.2. A test
asserts it appears in no lane authority.

Note also that `DEAL_STATUSES` in `src/lib/adminStatusConstants.js`, which the current
kanban renders its columns from, was a **frontend constant** — never the entity enum.

## 7. Carried forward to C3

- The portfolio/KPI/item APIs and the `pipeline:check` gate.
- No production writer for `PipelineStageEvent` yet. The registry validates transitions;
  the handler that appends them lands with the backend in C3.
- `OutboundLead`'s three vocabularies remain three. Converging them is a data migration and
  belongs to its own decision, not to a dashboard chunk.

## 8. Files

```
config/dashboard/pipeline-stage-registry.v1.json  (new — 4 lanes, 62 canonical stages, 64 legacy mappings)
base44/entities/PipelineStageEvent.jsonc          (new — the only new entity)
base44/shared/pipelineStageRegistry.ts            (new)
src/lib/pipelineStageRegistryC2.test.js           (new, 35 tests)
```

`verify:chunk` EXIT 0 — 4019 tests, 292 files. Entities 263 → 264.
