export const PAYMENT_REPORT_ACCESS_VERSION = 'payment-report-access-1.0.0';
export const COLLECTIVE_TERMS_VERSION = 'draft-v0';
export const PUBLIC_TERMS_VERSION = '2026-08-16';
export const PRIVACY_VERSION = '2026-07-24';

export const PAYMENT_REPORT_ACTION_LIMITS = Object.freeze([
  'CAMBRA may aggregate anonymised payment demand for benchmarking and negotiation preparation.',
  'CAMBRA may not move funds, sign a contract, switch a provider or accept an offer for the merchant.',
  'Any binding commercial action requires a separate, explicit merchant approval.',
]);

export function normalizeReportAccessState(row: any) {
  const value = String(row?.report_access_state || '').toUpperCase();
  return ['LOCKED', 'ACCEPTING', 'UNLOCKED'].includes(value) ? value : 'LOCKED';
}

export function normalizePoolMembershipStatus(row: any) {
  const value = String(row?.pool_membership_status || '').toUpperCase();
  return ['INACTIVE', 'ACTIVE', 'REVOKED'].includes(value) ? value : 'INACTIVE';
}

export function paymentReportAccessView(row: any) {
  const state = normalizeReportAccessState(row);
  const membershipStatus = normalizePoolMembershipStatus(row);
  return {
    version: PAYMENT_REPORT_ACCESS_VERSION,
    unlocked: state === 'UNLOCKED',
    state,
    membership_status: membershipStatus,
    accepted_at: row?.pool_accepted_at || null,
    revoked_at: row?.pool_revoked_at || null,
    collective_member_id: row?.pool_collective_member_id || null,
    terms: {
      collective: COLLECTIVE_TERMS_VERSION,
      public_terms: PUBLIC_TERMS_VERSION,
      privacy: PRIVACY_VERSION,
    },
  };
}

export function validatePaymentReportAcceptance(body: any) {
  if (body?.accepted !== true) return { ok: false, error: 'acceptance_required' };
  const versions = body?.versions || {};
  const expected = {
    collective: COLLECTIVE_TERMS_VERSION,
    public_terms: PUBLIC_TERMS_VERSION,
    privacy: PRIVACY_VERSION,
  };
  for (const key of Object.keys(expected)) {
    if (String(versions[key] || '') !== expected[key]) {
      return { ok: false, error: 'acceptance_version_stale', expected };
    }
  }
  return { ok: true, versions: expected };
}

export function buildPaymentReportAcceptanceSnapshot(input: {
  session: any;
  user_email: string;
  accepted_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
}) {
  return {
    schema_version: PAYMENT_REPORT_ACCESS_VERSION,
    accepted_at: input.accepted_at,
    user_email: String(input.user_email || '').trim().toLowerCase(),
    anon_session_id: String(input.session?.anon_session_id || ''),
    analyzer_result_id: input.session?.claim_analyzer_result_id || null,
    brand_id: input.session?.claim_brand_id || null,
    versions: {
      collective: COLLECTIVE_TERMS_VERSION,
      public_terms: PUBLIC_TERMS_VERSION,
      privacy: PRIVACY_VERSION,
    },
    action_limits: PAYMENT_REPORT_ACTION_LIMITS,
    acceptance_method: 'in_app_informed_single_click',
    withdrawal_preserves_report_access: true,
    ip_address: input.ip_address || null,
    user_agent: input.user_agent ? String(input.user_agent).slice(0, 500) : null,
  };
}

export function buildPaymentReportCollectiveMember(input: {
  session: any;
  user_email: string;
  accepted_at: string;
  acceptance_snapshot_hash: string;
}) {
  const snapshot = input.session?.input_snapshot || {};
  const engine = input.session?.engine_result || {};
  const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
  const monthlyGmv = channels.length
    ? channels.reduce((sum: number, channel: any) => sum + (Number(channel?.monthly_gmv_eur) || 0), 0)
    : Number(snapshot.monthly_gmv_eur) || 0;
  const annualSavings = Number(
    engine?.annual_savings_eur?.point ?? engine?.total_annual_savings_eur?.point,
  ) || 0;
  const singleChannel = snapshot.channel === 'in_store' ? 'in_store'
    : snapshot.channel === 'online' ? 'online'
    : undefined;
  return {
    email: String(input.user_email || '').trim().toLowerCase(),
    accepted_at: input.accepted_at,
    terms_version: COLLECTIVE_TERMS_VERSION,
    public_terms_version: PUBLIC_TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    acceptance_method: 'in_app_informed_single_click',
    acceptance_snapshot_hash: input.acceptance_snapshot_hash,
    status: 'founding',
    locale: ['en', 'fr', 'es'].includes(String(input.session?.locale)) ? input.session.locale : 'en',
    source_session: String(input.session?.anon_session_id || ''),
    ...(monthlyGmv > 0 ? { gmv_eur_monthly: monthlyGmv } : {}),
    ...(annualSavings > 0 ? { annual_savings_eur: annualSavings } : {}),
    ...(snapshot.provider_slug ? { provider_slug: String(snapshot.provider_slug).slice(0, 60) } : {}),
    ...(snapshot.country ? { country: String(snapshot.country).slice(0, 8) } : {}),
    ...(singleChannel ? { channel: singleChannel } : {}),
  };
}

export function sanitizeUnlockedPaymentReport(session: any) {
  const inputSnapshot = { ...(session?.input_snapshot || {}) };
  delete inputSnapshot.email;
  return {
    ok: true,
    owned: true,
    engine_result: session?.engine_result || null,
    engine_version: session?.engine_version || session?.engine_result?.engine_version || null,
    input_snapshot: inputSnapshot,
    report_access: paymentReportAccessView(session),
  };
}
