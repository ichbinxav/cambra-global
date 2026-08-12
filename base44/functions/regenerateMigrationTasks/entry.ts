import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { quarantineProbe } from '../../shared/internalGate.ts';

// P10 (2026-08-09) — RETIRED.
// This generator creates the pre-P9 multi-vertical task plan. Production is
// payments-only and P9 plans are bootstrapped idempotently by
// startPaymentsMigration. Do not recreate legacy merchant-owned task plans.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  await quarantineProbe(base44, 'regenerateMigrationTasks');
  const me = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'regenerateMigrationTasks',fallback:null,severity:'critical'}));
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (me.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });
  return Response.json({ error: 'legacy_migration_generator_retired', use: 'startPaymentsMigration' }, { status: 410 });
});
