// SYNC MASTER — no se importa en runtime por diseño. Borrarlo desarma __sync_check__.test.js.
// BUG-4 FIX (2026-07-09) — write-side of the sync cursor.
//
// The corresponding block inside base44/functions/dataSyncAgent/entry.ts is
// tagged with SYNC-START: cursorAdvance / SYNC-END: cursorAdvance so
// __sync_check__.test.js detects any future drift.
//
// Pure function. No I/O. Given the endpoint's records for THIS sync run
// and the previously-persisted cursor, returns the new cursor value.
//
// Contract:
//   • Success path (no cap hit): cursor advances to max(occurred_at) of the
//     records processed BY THIS ENDPOINT.
//   • Monotonicity guard: if the batch's max is older than the previous
//     cursor (backfill, upstream reordering, clock skew), the cursor stays
//     put. It NEVER regresses.
//   • No valid timestamps in the batch (empty batch, all rows missing
//     occurred_at): cursor unchanged. Never drifts to Date.now().
//   • Partial sync (cap hit): cursor unchanged. Caller must set
//     `partial=true`; the record content is ignored.

// SYNC-START: cursorAdvance
export function computeNewCursor({ endpointRecords, previousCursor, partial }) {
  const prevIso = previousCursor || null;
  if (partial) return prevIso;
  if (!Array.isArray(endpointRecords) || endpointRecords.length === 0) return prevIso;

  let maxOccurredMs = 0;
  for (const r of endpointRecords) {
    if (!r?.occurred_at) continue;
    const t = new Date(r.occurred_at).getTime();
    if (Number.isFinite(t) && t > maxOccurredMs) maxOccurredMs = t;
  }
  if (maxOccurredMs === 0) return prevIso;

  const prevMs = prevIso ? new Date(prevIso).getTime() : 0;
  const prevMsSafe = Number.isFinite(prevMs) ? prevMs : 0;
  return maxOccurredMs >= prevMsSafe ? new Date(maxOccurredMs).toISOString() : prevIso;
}
// SYNC-END: cursorAdvance