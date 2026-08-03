// referralLink — REFERRAL-2 T5 (2026-08-03).
//
// ONE find-or-create for ReferralLink, shared by getMyReferralLink and
// getMyReferralStatus. Before this module both functions carried their own copy
// and two concurrent calls could create two rows for the same owner_email —
// with activated_count landing on one row while the reader returned the other.
//
// LIMITATION (documented in Decision_Log_REFERRAL2.md): Base44 entity schemas
// have no declarative unique index, so uniqueness is enforced HERE:
//   1. read ALL rows for the owner (ascending by created_date),
//   2. if more than one exists, the OLDEST wins (it may already carry counters);
//      the extras are deleted after their counters are folded into the winner,
//   3. after a create, re-read: if a concurrent caller won the race, delete our
//      younger row and return theirs.
// Counters are summed, never dropped — losing an activated_count means charging
// a merchant more than Terms §8 promises.

function newCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => (b % 36).toString(36)).join('');
}

function sum(rows: any[], field: string): number {
  return rows.reduce((acc, r) => acc + (Number(r?.[field]) || 0), 0);
}

async function readAll(svc: any, ownerEmail: string): Promise<any[]> {
  const rows = await svc.entities.ReferralLink
    .filter({ owner_email: ownerEmail }, 'created_date', 50)
    .catch(() => []);
  return (rows || []).filter((r: any) => r?.code);
}

// Collapse duplicates onto the oldest row, folding counters in. Returns the winner.
async function consolidate(svc: any, rows: any[]): Promise<any> {
  const [winner, ...extras] = rows;
  if (!extras.length) return winner;

  const times_used = sum(rows, 'times_used');
  const activated_count = sum(rows, 'activated_count');
  await svc.entities.ReferralLink.update(winner.id, { times_used, activated_count });
  for (const extra of extras) {
    await svc.entities.ReferralLink.delete(extra.id).catch(() => null);
  }
  return { ...winner, times_used, activated_count };
}

export async function findOrCreateReferralLink(svc: any, ownerEmail: string): Promise<any> {
  const email = String(ownerEmail || '').trim();
  if (!email) throw new Error('owner_email required');

  const existing = await readAll(svc, email);
  if (existing.length) return consolidate(svc, existing);

  const created = await svc.entities.ReferralLink.create({
    code: newCode(),
    owner_email: email,
    times_used: 0,
    activated_count: 0,
  });

  // Race check — a concurrent caller may have created a row microseconds ago.
  const after = await readAll(svc, email);
  if (after.length > 1) return consolidate(svc, after);
  return after[0] || created;
}