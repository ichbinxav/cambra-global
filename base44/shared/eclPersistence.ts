// base44/shared/eclPersistence.ts — v62.7 ECL P4 (2026-08-08).
//
// The ONE persistence primitive shared by every ECL I/O boundary
// (eclProcessEvidence, eclLifecycleScheduler, eclReviewWorkflow). Extracted so
// the idempotent-create contract can never drift between handlers.
//
// GUARANTEE, NAMED HONESTLY: createOnce is replay-safe (a sequential retry
// always finds the persisted claim and returns the existing row) with
// best-effort concurrent collapse — it is NOT database-enforced exactly-once,
// because Base44 exposes no unique constraint and no atomic upsert. Two truly
// concurrent writers can both pass the pre-read; the post-create re-read then
// collapses deterministically to the OLDEST row and removes the loser (the same
// collapse-on-re-read pattern shared/referralLink.ts uses). A crash between
// create and collapse can leave a transient duplicate, which the next replay
// collapses. Do not describe this anywhere as transactional.

export const badRequest = (msg: string) => Response.json({ ok: false, error: msg }, { status: 400 });

async function collapseClaims(svc, entityName: string, rows) {
  const claims = Array.isArray(rows) ? rows.filter((r) => r && r.id) : [];
  if (claims.length === 0) return null;
  // filter(..., 'created_date', ...) is oldest-first. The first durable claim is
  // the semantic winner; every later duplicate is healed on replay.
  const winner = claims[0];
  for (const duplicate of claims.slice(1)) {
    if (duplicate.id !== winner.id) await svc.entities[entityName].delete(duplicate.id);
  }
  return winner;
}

export async function createOnce(svc, entityName: string, idempotencyKey: string, record) {
  // Idempotency reads are authoritative. A read outage is never interpreted as
  // "no claim" because that would manufacture duplicates during persistence
  // incidents. Replays also heal duplicates left by a crash after create.
  const existing = await svc.entities[entityName].filter({ idempotency_key: idempotencyKey }, 'created_date', 5);
  const existingWinner = await collapseClaims(svc, entityName, existing);
  if (existingWinner) return { created: false, id: existingWinner.id };

  const row = await svc.entities[entityName].create(record);
  const all = await svc.entities[entityName].filter({ idempotency_key: idempotencyKey }, 'created_date', 5);
  const winner = await collapseClaims(svc, entityName, all);
  if (!winner) throw new Error(`idempotency claim unreadable after create: ${entityName}`);
  return { created: winner.id === row.id, id: winner.id };
}

/** Persist a P3 lifecycle transition intent. A no-op transition writes nothing. */
export async function persistLifecycleEvent(svc, transition) {
  if (!transition || transition.changed !== true || !transition.record) return null;
  return await createOnce(svc, 'EvidenceLifecycleEvent', transition.idempotencyKey, transition.record);
}