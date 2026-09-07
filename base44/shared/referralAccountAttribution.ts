import { ENTRY_FEE_PCT, STEP_POINTS } from './referralProgram.ts';
import { readRuntimeRows, requireRuntimeSource } from './runtimeSourceRead.ts';

const REFERRAL_CODE = /^[A-Za-z0-9_-]{4,24}$/;

function lower(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function normalizedCode(value: any): string {
  return String(value || '').trim();
}

function isExpired(value: any, now: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

async function readClaims(svc: any, recipientEmail: string): Promise<any[]> {
  return requireRuntimeSource(await readRuntimeRows({
    source: 'referral_account_attribution',
    limit: 25,
    read: () => svc.entities.ReferralAccountAttribution.filter(
      { recipient_email: lower(recipientEmail) },
      'created_date',
      25,
    ),
  }));
}

export async function validateReferralLink(
  svc: any,
  { code: rawCode, recipientEmail = '', now = new Date() }: any,
): Promise<any> {
  const code = normalizedCode(rawCode);
  const recipient = lower(recipientEmail);
  if (!REFERRAL_CODE.test(code)) return { eligible: false, reason: 'invalid_code' };

  const links = requireRuntimeSource(await readRuntimeRows({
    source: 'referral_account_link_authority',
    limit: 2,
    read: () => svc.entities.ReferralLink.filter({ code }, 'created_date', 2),
  }));
  if (links.length > 1) {
    throw Object.assign(new Error('referral_link_authority_ambiguous'), { status: 503 });
  }

  const link = links[0] || null;
  if (!link) return { eligible: false, reason: 'unknown_code' };
  if (String(link.status || 'active') !== 'active') return { eligible: false, reason: 'inactive_code' };
  if (isExpired(link.expires_at, new Date(now))) return { eligible: false, reason: 'expired_code' };
  if (recipient && lower(link.owner_email) === recipient) return { eligible: false, reason: 'self_referral' };

  return {
    eligible: true,
    code,
    link,
    entry_discount_points: STEP_POINTS,
    entry_fee_pct: ENTRY_FEE_PCT,
  };
}

export async function getReferralAccountAttribution(svc: any, recipientEmail: string): Promise<any | null> {
  const claims = await readClaims(svc, recipientEmail);
  const active = claims.filter((row: any) => String(row?.status || 'active') === 'active');
  if (!active.length) return null;

  // Base44 schemas do not expose a unique index. The oldest successful claim
  // wins deterministically, including the unlikely case of two different
  // codes racing after OAuth. Every younger row is revoked before we return.
  const [winner, ...duplicates] = active;
  for (const duplicate of duplicates) {
    await svc.entities.ReferralAccountAttribution.update(duplicate.id, { status: 'revoked' });
  }
  return winner;
}

export async function claimReferralAccountAttribution(
  svc: any,
  { recipientEmail, code: rawCode, source = 'registration', now = new Date() }: any,
): Promise<any> {
  const recipient = lower(recipientEmail);
  if (!recipient) return { ok: false, claimed: false, reason: 'recipient_identity_missing' };

  const existing = await getReferralAccountAttribution(svc, recipient);
  if (existing) {
    const same = normalizedCode(existing.referral_code) === normalizedCode(rawCode);
    return {
      ok: same,
      claimed: false,
      reused: same,
      reason: same ? 'already_linked' : 'different_referral_already_linked',
      code: same ? existing.referral_code : null,
      entry_discount_points: Number(existing.entry_discount_points) || STEP_POINTS,
      entry_fee_pct: Number(existing.entry_fee_pct) || ENTRY_FEE_PCT,
    };
  }

  const validated = await validateReferralLink(svc, {
    code: rawCode,
    recipientEmail: recipient,
    now,
  });
  if (!validated.eligible) return { ok: false, claimed: false, ...validated };

  const created = await svc.entities.ReferralAccountAttribution.create({
    recipient_email: recipient,
    referral_code: validated.code,
    referrer_email: lower(validated.link.owner_email),
    entry_discount_points: validated.entry_discount_points,
    entry_fee_pct: validated.entry_fee_pct,
    status: 'active',
    source: ['invite', 'registration', 'analyzer'].includes(source) ? source : 'registration',
    claimed_at: new Date(now).toISOString(),
  });

  // Base44 schemas do not expose a unique index. Re-read and consolidate so
  // concurrent post-OAuth mounts still leave one immutable attribution.
  const winner = await getReferralAccountAttribution(svc, recipient);
  const won = winner?.id === created?.id;
  const sameCodeWon = normalizedCode(winner?.referral_code) === validated.code;
  return {
    ok: sameCodeWon,
    claimed: won && sameCodeWon,
    reused: !won && sameCodeWon,
    reason: sameCodeWon
      ? (won ? 'linked' : 'linked_by_concurrent_request')
      : 'different_referral_already_linked',
    code: sameCodeWon ? winner?.referral_code || validated.code : null,
    entry_discount_points: Number(winner?.entry_discount_points) || validated.entry_discount_points,
    entry_fee_pct: Number(winner?.entry_fee_pct) || validated.entry_fee_pct,
  };
}
