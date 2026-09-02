import { ENTRY_FEE_PCT, STEP_POINTS } from './referralProgram.ts';
import { PRODUCT_POLICY } from './generated/productPolicy.ts';
import { readRuntimeRows, requireRuntimeSource } from './runtimeSourceRead.ts';

function lower(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function firstOfCurrentMonth(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export async function resolveReferralEntryAttribution(
  svc: any,
  recipientEmail: string,
  sessionHint: any = null,
): Promise<any> {
  const email = lower(recipientEmail);
  if (!email) return { eligible: false, reason: 'recipient_identity_missing' };

  let session = sessionHint;
  if (!session?.referred_by_code) {
    const sessions = requireRuntimeSource(await readRuntimeRows({
      source: 'referral_entry_analysis_sessions',
      limit: 25,
      read: () => svc.entities.PaymentsAnalysisSession.filter({ contact_email: email }, '-created_date', 25),
    }));
    session = sessions.find((row: any) => row?.referred_by_code) || null;
  }
  if (!session?.referred_by_code) return { eligible: false, reason: 'no_referral' };

  const code = String(session.referred_by_code);
  const links = requireRuntimeSource(await readRuntimeRows({
    source: 'referral_entry_link_authority',
    limit: 2,
    read: () => svc.entities.ReferralLink.filter({ code }, 'created_date', 2),
  }));
  if (links.length > 1) {
    throw Object.assign(new Error('referral_entry_link_authority_ambiguous'), { status: 503 });
  }
  const link = links[0] || null;
  if (!link) return { eligible: false, reason: 'unknown_code' };
  if (lower(link.owner_email) === email) return { eligible: false, reason: 'self_referral' };

  return {
    eligible: true,
    code,
    link,
    session,
    entry_discount_points: STEP_POINTS,
    entry_fee_pct: ENTRY_FEE_PCT,
  };
}

export async function ensureReferralEntryDiscount(
  svc: any,
  { brand, recipientEmail, session, now = new Date() }: any,
): Promise<any> {
  const attribution = await resolveReferralEntryAttribution(svc, recipientEmail, session);
  if (!attribution.eligible) return { ok: true, applied: false, ...attribution };
  if (!brand?.id) throw new Error('referral_entry_brand_missing');

  const mandates = requireRuntimeSource(await readRuntimeRows({
    source: 'referral_entry_mandates',
    limit: 25,
    read: () => svc.entities.Mandate.filter({ brand_id: brand.id }, '-created_date', 25),
  }));
  if (mandates.some((row: any) => ['acceptance_started', 'active'].includes(String(row?.status)))) {
    return { ok: true, applied: false, reason: 'existing_recovery_commitment', ...attribution };
  }

  const rules = requireRuntimeSource(await readRuntimeRows({
    source: 'referral_entry_billing_rules',
    limit: 25,
    read: () => svc.entities.BillingRule.filter({ brand_id: brand.id }, '-effective_start_date', 25),
  }));
  if (rules.length >= 25) throw Object.assign(new Error('referral_entry_billing_rule_read_truncated'), { status: 503 });

  const active = rules.filter((row: any) => row?.status === 'active' && !row?.effective_end_date);
  const existingEntry = active.find((row: any) => String(row?.notes || '').startsWith('referral entry discount'));
  if (existingEntry) {
    return { ok: true, applied: false, reused: true, billing_rule_id: existingEntry.id, ...attribution };
  }
  const cheaper = active.find((row: any) => Number(row?.node_share_percent) <= ENTRY_FEE_PCT);
  if (cheaper) {
    return { ok: true, applied: false, reason: 'already_lower_or_equal', billing_rule_id: cheaper.id, ...attribution };
  }

  const startDate = firstOfCurrentMonth(new Date(now));
  for (const current of active) {
    const currentStart = String(current?.effective_start_date || '');
    if (currentStart && currentStart >= startDate) {
      // A provisional same-month/future rule has no elapsed billing period to
      // preserve. Retire it instead of creating an end date before its start.
      await svc.entities.BillingRule.update(current.id, { status: 'inactive' });
    } else {
      await svc.entities.BillingRule.update(current.id, { effective_end_date: previousDay(startDate) });
    }
  }

  const created = await svc.entities.BillingRule.create({
    brand_id: brand.id,
    deal_activation_id: '',
    provider_id: '',
    billing_model: 'monthly_success_fee',
    node_share_percent: ENTRY_FEE_PCT,
    currency: active[0]?.currency || 'EUR',
    effective_start_date: startDate,
    status: 'active',
    policy_version: PRODUCT_POLICY.policyVersion,
    notes: `referral entry discount, source_session=${String(session?.anon_session_id || attribution.session?.anon_session_id || '')}`,
  });

  return {
    ok: true,
    applied: true,
    billing_rule_id: created?.id || null,
    effective_start_date: startDate,
    ...attribution,
  };
}
