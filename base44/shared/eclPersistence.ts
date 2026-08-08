// base44/shared/eclPersistence.ts — v62.7 ECL P4 (2026-08-08).
//
// The ONE persistence primitive shared by every ECL I/O boundary
// (eclProcessEvidence, eclLifecycleScheduler, eclReviewWorkflow). Extracted so
// the idempotent-create contract can never drift between handlers.
//
// GUARANTEE, NAMED HONESTLY: createOnce is REPLAY-SAFE (a sequential retry
// always finds the persisted claim and returns the existing row) with
// best-effort concurrent collapse — it is NOT database-enforced exactly-once,
// because Base44 exposes no unique constraint and no atomic upsert. Two truly
// concurrent writers can both pass the pre-read; the post-create re-read then
// collapses deterministically to the OLDEST row and removes the loser (the same
// collapse-on-re-read pattern shared/referralLink.ts uses). A crash between
// create and collapse can leave a transient duplicate, which the next replay
// collapses. Do not describe this anywhere as transactional.

export const badRequest = (msg: string) => Response.json({ ok: false, error: msg }, { status: 400 });

export async function createOnce(svc, entityName: string, idempotencyKey: string, record) {
  const existing = await svc.entities[entityName].filter({ idempotency_key: idempotencyKey }, 'created_date', 1).catch(() => []);
  if (existing && existing.length > 0) return { created: false, id: existing[0].id };
  const row = await svc.entities[entityName].create(record);
  const all = await svc.entities[entityName].filter({ idempotency_key: idempotencyKey }, 'created_date', 5).catch(() => []);
  const winner = (all && all[0]) || row;
  if (winner.id !== row.id) {
    // Lost the race: keep the oldest claim, drop our duplicate.
    await svc.entities[entityName].delete(row.id).catch(() => null);
    return { created: false, id: winner.id };
  }
  return { created: true, id: row.id };
}

/** Persist a P3 lifecycle transition intent. A no-op transition writes nothing. */
export async function persistLifecycleEvent(svc, transition) {
  if (!transition || transition.changed !== true || !transition.record) return null;
  return await createOnce(svc, 'EvidenceLifecycleEvent', transition.idempotencyKey, transition.record);
}