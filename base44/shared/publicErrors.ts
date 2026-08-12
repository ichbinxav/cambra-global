export const PUBLIC_ERROR_CONTRACT_VERSION = 'public-error-contract-1.0.0';

function privateError(error:any) {
  return {
    name:String(error?.name || 'Error').slice(0,120),
    message:String(error?.message || error || 'unknown').slice(0,1000),
    stack:typeof error?.stack === 'string' ? error.stack.slice(0,8000) : undefined,
  };
}

/**
 * Canonical unexpected-error boundary. Internal diagnostics stay in Base44
 * logs; callers receive only a stable code plus an opaque correlation id.
 */
export function internalErrorResponse(error:any, operation='backend_function') {
  const requestId=crypto.randomUUID();
  console.error(JSON.stringify({
    level:'error', event:'internal_error', operation:String(operation).slice(0,160),
    request_id:requestId, error:privateError(error),
  }));
  return Response.json({ ok:false, error:'internal_error', request_id:requestId }, { status:500 });
}

export function operationErrorResponse(error:any, operation='backend_function', fallback='operation_failed') {
  const status=Number(error?.status || 500);
  if(!Number.isInteger(status)||status>=500||status<400)return internalErrorResponse(error,operation);
  const requestId=crypto.randomUUID();
  const candidate=String(error?.code || fallback).toLowerCase();
  const code=/^[a-z][a-z0-9_:-]{1,80}$/.test(candidate)?candidate:fallback;
  console.warn(JSON.stringify({level:'warning',event:'handled_operation_error',operation,request_id:requestId,status,code}));
  return Response.json({ok:false,error:code,request_id:requestId},{status});
}
