export const BEST_EFFORT_OBSERVABILITY_VERSION='best-effort-observability-1.0.0';

/** Preserve an explicitly chosen fail-closed fallback while making the failure
 * observable. This helper is for secondary/recoverable work only; callers must
 * not use it to authorize financial, legal or outbound effects. */
export function safeBestEffort(error:any, input:{operation:string;fallback:any;severity?:'secondary'|'critical'}) {
  const requestId=crypto.randomUUID();
  const severity=input.severity || 'secondary';
  const event={
    level:severity==='critical'?'error':'warning', event:'best_effort_failure',
    metric:'best_effort_failure_total', operation:String(input.operation).slice(0,180),
    severity, request_id:requestId,
    error:{name:String(error?.name||'Error').slice(0,120),message:String(error?.message||error||'unknown').slice(0,1000)},
  };
  (severity==='critical'?console.error:console.warn)(JSON.stringify(event));
  return input.fallback;
}
