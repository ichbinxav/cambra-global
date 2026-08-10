// getMyBillingRecords — v61 Checkpoint D (2026-08-06).
//
// The merchant's OWN billing records (invoices, monthly savings reports, current
// baseline), read server-side.
//
// SECURITY INVARIANTS (same doctrine as getMyPaymentsHistory):
//   • The tenant is resolved from the AUTHENTICATED SESSION, never from the
//     request. There is deliberately NO brand_id parameter: accepting one would
//     make the browser the author of the tenant boundary.
//   • auth.me() fails → hard 401, never a silent empty list (an empty list is
//     indistinguishable from "you have no invoices" and would mask an auth bug).
//   • asServiceRole is used because these entities' RLS is inert for app users
//     (service-role writes — KNOWN_DEBT BUG-6). Isolation comes from the
//     explicit brand scope, re-verified in JS after the read.
//   • Everything returned goes through a projection ALLOWLIST — the merchant
//     gets their figures, not the internal tax/accounting evidence.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  normalizeEmail,
  pickOwnedBrand,
  keepRowsForBrand,
  projectInvoice,
  projectReport,
  projectBaseline,
} from '../../shared/merchantBillingScope.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    if (!user || !user.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const email = normalizeEmail(user.email);
    const svc = base44.asServiceRole;

    // ── Tenant resolution: server-side, from the session email only ─────────
    // Both owner pivots Brand's RLS recognizes are queried; ownership is then
    // re-asserted in JS (pickOwnedBrand) so a loose query can never widen scope.
    const [byContact, byCreator] = await Promise.all([
      svc.entities.Brand.filter({ contact_email: user.email }, '-created_date', 5).catch(() => []),
      svc.entities.Brand.filter({ created_by: user.email }, '-created_date', 5).catch(() => []),
    ]);
    const brand = pickOwnedBrand([...(byContact || []), ...(byCreator || [])], email);
    // No brand yet (pre-onboarding) is a legitimate state, not an error.
    if (!brand) {
      return Response.json({ ok: true, brand: null, invoices: [], reports: [], baseline: null });
    }

    const [invoices, reports, baselines] = await Promise.all([
      svc.entities.Invoice.filter({ brand_id: brand.id }, '-issued_at', 200).catch(() => []),
      svc.entities.MonthlySavingsReport.filter({ brand_id: brand.id }, '-month', 24).catch(() => []),
      svc.entities.Baseline.filter({ brand_id: brand.id, is_current: true }, '-locked_at', 1).catch(() => []),
    ]);

    return Response.json({
      ok: true,
      brand: { id: brand.id, name: brand.name || null, country: brand.country || null },
      invoices: keepRowsForBrand(invoices || [], brand.id).map(projectInvoice),
      reports: keepRowsForBrand(reports || [], brand.id).map(projectReport),
      baseline: (keepRowsForBrand(baselines || [], brand.id).map(projectBaseline))[0] || null,
    });
  } catch (error) {
    console.error('getMyBillingRecords failed', error);
    return Response.json({ error: 'billing_records_failed' }, { status: 500 });
  }
});