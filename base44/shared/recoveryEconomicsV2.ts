// Recover Economics V2 — deterministic, contract-snapshot driven pricing.
// New acceptances only. Legacy mandates without recovery_economics.version keep V1 behavior.
export const RECOVERY_ECONOMICS_V2 = 'recover-economics-v2';
export const YEAR1_FEE_PCT = 25;
export const YEAR2_FEE_PCT = 15;
export const REFERRAL_STEP_PCT = 5;
export const ABSOLUTE_FLOOR_PCT = 5;
export const TERM_MONTHS = 24;

function dateOnly(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error('invalid_recovery_date');
  return d.toISOString().slice(0, 10);
}

function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const targetIndex = y * 12 + (m - 1) + months;
  const ty = Math.floor(targetIndex / 12);
  const tm = targetIndex % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2,'0')}-${String(Math.min(d, last)).padStart(2,'0')}`;
}

export function recoveryTermFromActivation(activationIso: string) {
  const start = dateOnly(activationIso);
  const year2Start = addMonthsClamped(start, 12);
  const endExclusive = addMonthsClamped(start, TERM_MONTHS);
  return { start, year2Start, endExclusive, months: TERM_MONTHS };
}

export function standardFeeForDate(day: string, term: { start:string; year2Start:string; endExclusive:string }) {
  if (day < term.start || day >= term.endExclusive) return 0;
  return day < term.year2Start ? YEAR1_FEE_PCT : YEAR2_FEE_PCT;
}

export function effectiveFee(standardPct: number, activatedReferrals: number) {
  if (!(standardPct > 0)) return 0;
  const discount = Math.max(0, Math.floor(Number(activatedReferrals) || 0)) * REFERRAL_STEP_PCT;
  return Math.max(ABSOLUTE_FLOOR_PCT, standardPct - discount);
}

function eachDay(start: string, endExclusive: string) {
  const out:string[] = [];
  let d = new Date(`${start}T00:00:00Z`);
  const end = new Date(`${endExclusive}T00:00:00Z`);
  while (d < end) { out.push(d.toISOString().slice(0,10)); d = new Date(d.getTime() + 86400000); }
  return out;
}

export function periodEconomicsV2(input: {
  activationIso: string;
  periodStart: string;
  periodEndExclusive: string;
  activatedReferrals?: number;
}) {
  const term = recoveryTermFromActivation(input.activationIso);
  const days = eachDay(input.periodStart, input.periodEndExclusive);
  if (!days.length) throw new Error('empty_billing_period');
  let weighted = 0;
  let standardWeighted = 0;
  const segments:any[] = [];
  let current:any = null;
  for (const day of days) {
    const standard = standardFeeForDate(day, term);
    const effective = effectiveFee(standard, input.activatedReferrals || 0);
    weighted += effective;
    standardWeighted += standard;
    if (!current || current.standard_fee_pct !== standard || current.effective_fee_pct !== effective) {
      if (current) segments.push(current);
      current = { start: day, end_exclusive: '', days: 0, standard_fee_pct: standard, effective_fee_pct: effective };
    }
    current.days += 1;
    const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
    current.end_exclusive = next.toISOString().slice(0,10);
  }
  if (current) segments.push(current);
  return {
    version: RECOVERY_ECONOMICS_V2,
    term,
    period_days: days.length,
    standard_fee_pct: standardWeighted / days.length,
    effective_fee_pct: weighted / days.length,
    merchant_share_pct: 100 - weighted / days.length,
    referral_discount_points: Math.max(0, Math.floor(Number(input.activatedReferrals)||0))*REFERRAL_STEP_PCT,
    segments,
  };
}

export function recoveryEconomicsSnapshot() {
  return {
    version: RECOVERY_ECONOMICS_V2,
    term_months: TERM_MONTHS,
    fee_base: 'positive_verified_savings',
    year_1: { months: '1-12', standard_fee_pct: YEAR1_FEE_PCT, merchant_share_pct: 75 },
    year_2: { months: '13-24', standard_fee_pct: YEAR2_FEE_PCT, merchant_share_pct: 85 },
    after_term: { standard_fee_pct: 0, merchant_share_pct: 100 },
    referrals: { discount_points_each: REFERRAL_STEP_PCT, floor_pct: ABSOLUTE_FLOOR_PCT, permanent_once_earned: true, non_retroactive: true },
    cancellation_survival: 'service_termination_does_not_by_itself_terminate_activated_recovery_term',
    verification_after_disconnection: 'verified_evidence_required_no_estimated_billing',
    legal_review_required: ['survival_after_termination','data_provision_obligations','verification_after_disconnection','billing_authorization_survival','dispute_process','savings_attribution','governing_law','france_spain_enforceability'],
  };
}
