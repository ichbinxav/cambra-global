// DEPRECATED 2026-08-04 (BILLING-FIX-1). Ver Decision_Log_BILLING_FIX1.md
//
// Ruta legacy de facturación desde un MonthlySavingsReport. Emitía numeración
// local max+1 (series/sequence) sin unicidad y sin comprobar si el informe ya
// estaba facturado. La ruta canónica es createEligibleRecoverInvoices
// (RECOVER-4): Stripe es la autoridad de numeración y la deduplicación se hace
// por (deal_activation_id, month).
Deno.serve(async () => {
  return Response.json(
    {
      error: 'deprecated',
      use: 'createEligibleRecoverInvoices',
      reason:
        'Stripe es la autoridad de numeración desde RECOVER-4. Esta ruta emitía numeración local max+1 sin unicidad.',
    },
    { status: 410 },
  );
});