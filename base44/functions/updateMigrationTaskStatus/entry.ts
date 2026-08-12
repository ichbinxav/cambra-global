import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { quarantineProbe } from '../../shared/internalGate.ts';

// P10 (2026-08-09) — RETIRED.
// The legacy migration-task mutator allowed non-sequential task transitions and
// could promote an activation to live. P9 owns the only payments migration
// state machine via updatePaymentsMigrationTask.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  await quarantineProbe(base44, 'updateMigrationTaskStatus');
  const me = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'updateMigrationTaskStatus',fallback:null,severity:'critical'}));
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json({ error: 'legacy_migration_mutator_retired', use: 'updatePaymentsMigrationTask' }, { status: 410 });
});
