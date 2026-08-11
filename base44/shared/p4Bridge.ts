// P3/P4/P5 transport boundary. This module never writes P4 estimates to P3.
// Environment configuration is intentionally required: missing configuration
// fails closed rather than pretending P4 is connected.

export const P4_BRIDGE_VERSION = 'p4-bridge-1.0.0';
const text = new TextEncoder();

function requiredString(value: unknown, code: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export function requireP4ServiceConfig() {
  const baseUrl = requiredString(Deno.env.get('P4_SERVICE_URL'), 'p4_service_url_not_configured').replace(/\/$/, '');
  const token = requiredString(Deno.env.get('P4_SERVICE_TOKEN'), 'p4_service_token_not_configured');
  return { baseUrl, token };
}

export async function p4Pseudonym(kind: 'merchant' | 'contract', sourceId: string): Promise<string> {
  const secret = requiredString(Deno.env.get('P4_PSEUDONYMIZATION_KEY'), 'p4_pseudonymization_key_not_configured');
  const key = await crypto.subtle.importKey('raw', text.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, text.encode(`${kind}:${sourceId}`));
  return `p4_${kind}_${Array.from(new Uint8Array(signature)).map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

export async function p4Fetch(path: string, init: RequestInit = {}) {
  const { baseUrl, token } = requireP4ServiceConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`p4_service_${response.status}`);
    return body;
  } finally { clearTimeout(timeout); }
}

export function p4ObservationFromVerifiedPayment(input: any) {
  const verified = input?.verified;
  const context = input?.context || {};
  const targetSpecId = requiredString(Deno.env.get('P4_MERCHANT_EFFECTIVE_RATE_TARGET_SPEC_ID'), 'p4_target_spec_not_configured');
  if (!Number.isFinite(verified?.measured_current_bps) || Number(verified.measured_current_bps) < 0) throw new Error('p4_verified_effective_rate_required');
  if (!verified?.measurement_window?.to || Number(verified?.sample_metrics?.gmv_eur) < 0 || Number(verified?.sample_metrics?.tx_count) < 0) throw new Error('p4_verified_measurement_window_or_metrics_required');
  for (const key of ['market', 'provider', 'product', 'channel', 'pricing_model', 'currency', 'fee_perimeter']) requiredString(context[key], `p4_context_${key}_required`);
  return {
    observation_id: requiredString(input.projectionKey, 'p4_projection_key_required'),
    tenant_id: requiredString(input.tenantPseudonym, 'p4_tenant_pseudonym_required'),
    merchant_group_key: requiredString(input.merchantPseudonym, 'p4_merchant_pseudonym_required'),
    contract_group_key: requiredString(input.contractPseudonym, 'p4_contract_pseudonym_required'),
    observed_at: verified.measurement_window.to,
    market: context.market, provider: context.provider, legal_entity: context.legal_entity || null,
    product: context.product, channel: context.channel, pricing_model: context.pricing_model,
    fee_perimeter: context.fee_perimeter, currency: context.currency,
    source_population: 'MERCHANT_OBSERVED', target_spec_id: targetSpecId,
    target_value: Number(verified.measured_current_bps),
    tpv: Number(verified.sample_metrics.gmv_eur) * 100,
    transaction_count: Number(verified.sample_metrics.tx_count),
    avg_ticket: Number.isFinite(verified.sample_metrics.avg_ticket_eur) ? Number(verified.sample_metrics.avg_ticket_eur) * 100 : null,
    merchant_segment: context.merchant_segment || null,
    card_mix: context.card_mix || {}, payment_method_mix: context.payment_method_mix || {},
    quality_weight: Number.isFinite(context.quality_weight) ? Number(context.quality_weight) : 1,
    training_eligibility: 'TRAINING_ELIGIBLE_CORE', is_synthetic: false,
  };
}

export function tenantSafeP4Estimate(value: any) {
  if (!value || typeof value !== 'object') throw new Error('invalid_p4_response');
  for (const key of ['estimate_id', 'target_spec_id', 'model_version_id', 'as_of', 'status', 'lineage_hash']) requiredString(value[key], `p4_response_${key}_required`);
  if (value.feature_snapshot?.values || value.raw_observations || value.observations) throw new Error('p4_private_evidence_response_forbidden');
  return value;
}
