// Base44 function invocations can wrap JSON in one or more `data`/string layers.
// Command must classify the decoded payload, never the transport wrapper.

const text = (value: unknown) => String(value ?? '').trim();

export const COMMAND_FUNCTION_RESULT_VERSION = 'command-function-result-1.0.0';

function hasOwn(value: unknown, key: string) {
  return Boolean(value && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, key));
}

export function unwrapCommandFunctionResponse(response: any) {
  let current = response;
  for (let layer = 0; layer < 6; layer += 1) {
    if (
      current && typeof current === 'object' && !Array.isArray(current)
      && hasOwn(current, 'data')
      && !hasOwn(current, 'ok')
      && !hasOwn(current, 'error')
      && !hasOwn(current, 'requires_confirmation')
    ) {
      current = current.data;
      continue;
    }
    if (typeof current !== 'string') break;
    const trimmed = current.trim();
    if (!trimmed || !['{', '[', '"'].includes(trimmed[0])) break;
    try {
      current = JSON.parse(trimmed);
    } catch {
      break;
    }
  }
  return current;
}

function healthSummary(data: any) {
  const health = data?.health || {};
  const metrics = data?.metrics || {};
  const scheduler = data?.scheduler_health || {};
  const missing = Array.isArray(scheduler.missing_or_stale) ? scheduler.missing_or_stale : [];
  const duplicates = Array.isArray(scheduler.duplicate_workers) ? scheduler.duplicate_workers : [];
  return [
    `health=${text(health.status) || 'unknown'}`,
    `score=${health.score ?? 'unknown'}`,
    `active_issues=${metrics.active_issues ?? 'unknown'}`,
    `critical_incidents=${metrics.critical_incidents ?? 'unknown'}`,
    `agent_failures_7d=${metrics.agent_failures_7d ?? 'unknown'}`,
    `scheduler_active=${scheduler.active === true}`,
    `scheduler_missing_or_stale=${missing.length ? missing.join(',') : 'none'}`,
    `scheduler_duplicates=${duplicates.length ? duplicates.join(',') : 'none'}`,
    'source=getMaintenanceCenter',
  ].join('; ');
}

function commercialSummary(data: any) {
  const summary = data?.summary || {};
  const attention = Array.isArray(data?.attention) ? data.attention : [];
  const attentionCodes = attention.map((item: any) => text(item?.code)).filter(Boolean);
  const observed = (value: any) => value === null || value === undefined ? 'unknown' : value;
  return [
    `total_leads=${observed(summary.total_leads)}`,
    `high_fit=${observed(summary.high_fit)}`,
    `verified_contacts=${observed(summary.verified_contacts)}`,
    `outreach_ready=${observed(summary.outreach_ready)}`,
    `configured_senders=${observed(summary.configured_senders)}`,
    `prepared_senders=${observed(summary.prepared_senders)}`,
    `paused_senders=${observed(summary.paused_senders)}`,
    `send_ready_senders=${observed(summary.ready_senders)}`,
    `configured_daily_cap=${observed(summary.configured_daily_cap)}`,
    `ready_daily_capacity=${observed(summary.ready_daily_capacity)}`,
    `outbound_locked=${data?.safety?.outbound_locked !== false}`,
    `attention=${attentionCodes.length ? attentionCodes.join(',') : 'none'}`,
    'source=commercialOperatingSystem',
  ].join('; ');
}

export function summarizeCommandFunctionPayload(data: any, toolName = '') {
  if (toolName === 'system_health_check') return healthSummary(data).slice(0, 600);
  if (toolName === 'commercial_os_status') return commercialSummary(data).slice(0, 600);
  if (typeof data === 'string') return data.slice(0, 600);
  if (Array.isArray(data)) return `${data.length} rows`;
  const candidates = [data?.summary, data?.status, data?.execution_status, data?.error];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 600);
    if (candidate && typeof candidate === 'object') {
      try { return JSON.stringify(candidate).slice(0, 600); } catch { /* continue */ }
    }
  }
  try { return JSON.stringify(data ?? null).slice(0, 600); } catch { return 'unserializable_function_response'; }
}

export function inspectCommandFunctionResponse(response: any, toolName = '') {
  const data = unwrapCommandFunctionResponse(response);
  const error = text(data?.error);
  const empty = data === null || data === undefined;
  const failed = empty || data?.ok === false || Boolean(error && data?.ok !== true);
  return {
    data,
    ok: !failed,
    ambiguous: data?.requires_confirmation === true,
    error: empty ? 'empty_function_response' : (failed ? (error || 'tool_reported_failure') : null),
    summary: summarizeCommandFunctionPayload(data, toolName),
  };
}
