import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { quarantineProbe } from '../../shared/internalGate.ts';

// P10 (2026-08-09) — RETIRED.
// This pre-P9 endpoint used to let an owner/admin advance DealActivation.status
// directly. Economic/fulfilment state is now server-managed through Recover,
// P9 and ECL gates. Keeping the deployed name fail-closed preserves a clear
// response for stale clients without leaving a second state machine alive.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  await quarantineProbe(base44, 'updateDealActivationStatus');
  const me = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'updateDealActivationStatus',fallback:null,severity:'secondary'}));
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json({ error: 'legacy_activation_mutator_retired', use: 'Recover/P9 canonical operations' }, { status: 410 });
});
