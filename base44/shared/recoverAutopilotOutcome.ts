import { unwrapCommandFunctionResponse } from './commandFunctionResult.ts';

const REVIEW_CODES = new Set([
  'confirmation_required',
  'emergency_control_paused:billing_issuance',
  'french_einvoicing_blocked_not_ready',
  'legal_identity_missing',
  'report_authority_ambiguous',
  'report_not_eligible_for_invoice_execution',
  'tax_config_missing',
]);

const PRE_EFFECT_ROW_PREFIXES = [
  'calculation_mismatch_reapprove',
  'calendar:',
  'context_missing',
  'contract_policy_unresolvable',
  'cross_tenant_',
  'currency_',
  'ecl_create_invoice_denied',
  'effective_fee_missing_reapprove',
  'fee_rounds_to_zero',
  'idempotency_conflict_',
  'legal_execution_not_authorized',
  'mandate_not_active',
  'market_capability_denied:',
  'payment_method_not_ready',
  'policy_version_mismatch',
  'product_scope_blocked:',
  'relation_',
  'report_',
  'snapshot_hash_mismatch',
  'standard_fee_missing_reapprove',
  'stripe_customer_missing_or_mode_mismatch',
  'tax_blocked:',
];

function record(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function errorCode(value: any) {
  return String(record(value).error || '').trim();
}

function isKnownPreEffectRow(value: any) {
  const code = errorCode(value);
  return Boolean(code) && PRE_EFFECT_ROW_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function decodeRecoverInvocationError(error: any) {
  const decoded = unwrapCommandFunctionResponse(
    error?.response?.data ?? error?.data ?? null,
  );
  const body = record(decoded);
  const message = String(
    body.error || error?.message || error || 'recover_child_invoke_failed',
  ).slice(0, 500);
  return {
    ...body,
    ok: false,
    error: message,
    http_status: Number(error?.response?.status || body.http_status || 0) || null,
  };
}

export function classifyRecoverChildOutcome(raw: any, httpStatus = 0) {
  const decoded = unwrapCommandFunctionResponse(raw);
  const data = record(decoded);
  const status = Number(httpStatus || data.http_status || 0) || null;
  if (data.ok === true) {
    return { state: 'COMPLETED', ok: true, review_required: false, data };
  }

  const code = errorCode(data);
  const failedRows = Array.isArray(data.results)
    ? data.results.filter((row: any) => row?.ok !== true)
    : [];
  const rowsProvePreEffect = failedRows.length > 0 &&
    failedRows.every(isKnownPreEffectRow);
  const explicitReview = data.requires_confirmation === true ||
    data.review_required === true || REVIEW_CODES.has(code) ||
    (status === 409 && rowsProvePreEffect);
  if (explicitReview) {
    return {
      state: 'WAITING_INPUT',
      ok: false,
      review_required: true,
      error: code || 'recover_child_review_required',
      data,
    };
  }
  return {
    state: 'FAILED',
    ok: false,
    review_required: false,
    error: code || 'recover_child_failed',
    data,
  };
}
