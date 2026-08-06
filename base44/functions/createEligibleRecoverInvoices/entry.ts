// createEligibleRecoverInvoices — RECOVER-4 (2026-08-04), restructured v61
// (2026-08-06, audit P0 #1/#2/#3).
//
// Turns an admin-approved, eligible MonthlySavingsReport into ONE Stripe
// invoice (variable amount, charge_automatically — NEVER a Subscription, §20)
// and its local mirror. Admin or internal (monthly scheduler).
//
// v61 FLOW GUARANTEE: every economic validation — contract policy resolution
// INCLUDED — happens inside the pure core prepareEligibleRecoverInvoice
// BEFORE any Stripe call or local economic write. Stripe only ever receives
// the validated output of that function. An unresolvable contract, a fee
// mismatch, a missing standard fee (never defaulted to 25) or an idempotency
// conflict produce ZERO Stripe side effects.
//
// IDEMPOTENCY (§28, v61): canonical identity = monthly_savings_report_id,
// validated against (deal_activation_id, month, brand_id, mandate_id,
// currency). Same report + retry → the same invoice is resumed with the same
// Stripe idempotency keys (`r4:inv:*:${report.id}`). Same activation+month
// with a DIFFERENT report → typed conflict, no reuse, no pointer repair.
// Stripe's finalized `number` is THE legal number (§19).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { resolveBillingMode, stripeRequest } from '../../shared/stripeBilling.ts';
import { readLegalIdentity } from '../../shared/cambraLegalIdentity.ts';
import { determineTaxTreatment, normalizeVat, readTaxConfig, stripeTaxRateIdFor, type TaxDecision } from '../../shared/recoverTax.ts';
import { hashCalculation } from '../../shared/recoverBillingMath.ts';
import { monthBounds } from '../../shared/billingFee.ts';
import { prepareEligibleRecoverInvoice } from '../../shared/prepareEligibleRecoverInvoice.ts';

const BATCH = 5;

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  const intl = { en: 'en-IE', fr: 'fr-FR', es: 'es-ES' }[locale] || 'en-IE';
  const label = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function lineDescription(month: string, locale: string): string {
  const label = monthLabel(month, locale);
  if (locale === 'fr') return `Commission de succès Recover Margin — économies vérifiées de ${label}`;
  if (locale === 'es') return `Comisión de éxito Recover Margin — ahorro verificado de ${label}`;
  return `Recover Margin success fee — verified savings for ${label}`;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const svc = base44.asServiceRole;
    const mode = resolveBillingMode();
    const now = () => new Date().toISOString();

    // Global preconditions — fail loudly BEFORE touching any report.
    const identity = readLegalIdentity();
    // `=== false`, not `!`: tsconfig.critical.json runs strict:false, where
    // truthiness narrowing does NOT discriminate the union. Same runtime branch.
    if (identity.ok === false) {
      // Destructured INSIDE the guard so the union narrows to its false arm.
      const { missing } = identity;
      return Response.json({ ok: false, error: 'legal_identity_missing', missing }, { status: 409 });
    }
    const cfg = readTaxConfig();
    // `=== false` (not `!`): strict:false does not narrow on truthiness.
    if (cfg.ok === false) {
      const { missing } = cfg;
      return Response.json({ ok: false, error: 'tax_config_missing', missing }, { status: 409 });
    }
    // French e-invoicing control (§17): when the mandatory date arrives without
    // a compliant platform integration, automatic issuance STOPS.
    if (cfg.config.einvoicing_mode === 'blocked_not_ready') {
      return Response.json({ ok: false, error: 'french_einvoicing_blocked_not_ready' }, { status: 409 });
    }

    // Select work: one explicit report, or a bounded scan of eligible ones.
    let candidates: any[] = [];
    if (body?.report_id) {
      candidates = await svc.entities.MonthlySavingsReport.filter({ id: body.report_id }, '-created_date', 1).catch(() => []);
    } else {
      candidates = await svc.entities.MonthlySavingsReport.filter({ billing_eligibility_status: 'eligible' }, '-created_date', 50).catch(() => []);
    }
    candidates = (candidates || []).filter(r => r.billing_eligibility_status === 'eligible' && !r.invoice_id).slice(0, BATCH);

    const results: any[] = [];

    for (const report of candidates) {
      const outcome: any = { report_id: report.id, month: report.month };
      results.push(outcome);
      try {
        // ── PHASE 1 — load context (reads only) ─────────────────────────
        const activation = (await svc.entities.DealActivation.filter({ id: report.deal_activation_id }, '-created_date', 1).catch(() => []))?.[0];
        const brand = activation ? (await svc.entities.Brand.filter({ id: activation.brand_id }, '-created_date', 1).catch(() => []))?.[0] : null;
        const mandate = activation ? (await svc.entities.Mandate.filter({ deal_activation_id: activation.id, status: 'active' }, '-created_date', 1).catch(() => []))?.[0] : null;
        const existing = activation ? (await svc.entities.Invoice
          .filter({ deal_activation_id: activation.id, month: report.month }, '-created_date', 10).catch(() => [])) : [];

        // Fresh tax determination at issuance (§15) — approval preview may be stale.
        // v62.2.2 — the fallback literal IS a valid TaxTreatment; annotating the
        // binding stops TS widening 'TAX_REVIEW_REQUIRED' to `string`. Same value,
        // same branches, no cast.
        const tax: TaxDecision = brand ? determineTaxTreatment({
          billing_country: String(brand.billing_country || '').toUpperCase(),
          legal_name: brand.billing_legal_name || '',
          billing_address_line1: brand.billing_address_line1 || '',
          billing_postal_code: brand.billing_postal_code || '',
          billing_city: brand.billing_city || '',
          vat_number: normalizeVat(brand.vat_number_normalized || brand.vat_number || ''),
          tax_customer_type: brand.tax_customer_type || '',
          vies_status: brand.vies_status || 'not_checked',
        }, cfg.config) : { treatment: 'TAX_REVIEW_REQUIRED', tax_rate_bps: 0, blockers: ['context_missing'], mentions: [] };

        // ── PHASE 2 — PURE validation core. Policy resolved HERE, before
        // any Stripe call or economic write. ─────────────────────────────
        const prep = prepareEligibleRecoverInvoice({
          report,
          activation,
          mandate,
          brand,
          taxContext: { treatment: tax.treatment, tax_rate_bps: tax.tax_rate_bps, blockers: tax.blockers },
          billingMode: mode,
          existingInvoices: existing || [],
        });

        if (prep.conflict) {
          // Typed idempotency conflict — same month, different report. No
          // Stripe call, no reuse, no pointer repair.
          outcome.error = prep.conflict.code;
          outcome.conflict = prep.conflict;
          continue;
        }

        if (prep.resume?.fully_issued) {
          // Same report already fully issued — repair the report pointer only.
          await svc.entities.MonthlySavingsReport.update(report.id, { billing_eligibility_status: 'invoiced', invoice_id: prep.resume.invoice_id, status: 'invoiced', verification_status: 'invoiced' }).catch(() => null);
          outcome.resumed = true; outcome.invoice_id = prep.resume.invoice_id; outcome.invoice_number = prep.resume.invoice_number;
          continue;
        }

        if (!prep.eligible) {
          const blocker = prep.blockers[0] || 'blocked';
          // Bookkeeping writes for specific blockers (pre-existing behavior) —
          // these mark the report blocked; they create no economic obligation.
          if (blocker.startsWith('tax_blocked:')) {
            await svc.entities.MonthlySavingsReport.update(report.id, { billing_eligibility_status: 'blocked_tax', billing_block_reason: blocker.slice('tax_blocked:'.length) }).catch(() => null);
          } else if (blocker === 'calculation_mismatch_reapprove' || blocker === 'standard_fee_missing_reapprove' || blocker === 'effective_fee_missing_reapprove') {
            await svc.entities.MonthlySavingsReport.update(report.id, { billing_eligibility_status: 'blocked_contract', billing_block_reason: blocker }).catch(() => null);
          } else if (blocker === 'contract_policy_unresolvable' || blocker === 'policy_version_mismatch' || blocker === 'snapshot_hash_mismatch') {
            await svc.entities.MonthlySavingsReport.update(report.id, { billing_eligibility_status: 'blocked_contract', billing_block_reason: blocker }).catch(() => null);
          }
          outcome.error = blocker;
          outcome.blockers = prep.blockers;
          continue;
        }

        // Eligible — frozen values from the pure core only.
        const amounts = prep.amounts!;
        const view = prep.economicView!;
        const taxRateRef = stripeTaxRateIdFor(tax, cfg.config, mode);
        // `=== false` (not `!`): strict:false does not narrow on truthiness.
        if (taxRateRef.ok === false) {
          const { blocker } = taxRateRef;
          outcome.error = blocker;
          continue;
        }

        const locale = ['en', 'fr', 'es'].includes(brand.locale) ? brand.locale : 'en';
        const bounds = monthBounds(report.month);
        const customerVat = normalizeVat(brand.vat_number_normalized || brand.vat_number || '');

        // ── PHASE 3 — local draft (durable state before any Stripe call) ─
        let inv = prep.resume ? (existing || []).find((i: any) => String(i.id) === prep.resume!.invoice_id) : null;
        if (!inv) {
          inv = await svc.entities.Invoice.create({
            deal_activation_id: activation.id,
            brand_id: activation.brand_id,
            provider_id: activation.provider_id || '',
            organization_id: activation.brand_id,
            mandate_id: mandate.id,
            baseline_id: report.baseline_id || '',
            monthly_savings_report_id: report.id,
            month: report.month,
            currency: 'EUR',
            status: 'draft',
            payment_provider: 'stripe',
            processor_customer_id: brand.stripe_customer_id,
            tax_treatment: tax.treatment,
            tax_rate: tax.tax_rate_bps / 100,
            supplier_legal_name: identity.identity.legal_name,
            supplier_address: identity.identity.registered_address,
            supplier_vat_number: identity.identity.vat_id,
            customer_legal_name: brand.billing_legal_name || '',
            customer_address: [brand.billing_address_line1, brand.billing_address_line2, `${brand.billing_postal_code || ''} ${brand.billing_city || ''}`.trim()].filter(Boolean).join(', '),
            customer_country: String(brand.billing_country || '').toUpperCase(),
            customer_vat_number: customerVat,
            vies_status: brand.vies_status || 'not_checked',
            vies_checked_at: brand.vies_checked_at || null,
            vies_evidence_json: brand.vies_response_snapshot || {},
            service_period_start: bounds.start,
            service_period_end: bounds.end,
            subtotal_amount: amounts.fee_net_eur,
            fee_net_amount: amounts.fee_net_eur,
            tax_amount: amounts.tax_eur,
            total_amount: amounts.total_eur,
            balance_due: amounts.total_eur,
            discount_type: amounts.discount_pct > 0 ? 'referral_commercial_discount' : '',
            discount_amount: amounts.discount_pct > 0 ? Math.round((amounts.billable_savings_minor * amounts.discount_pct) / 100) / 100 : 0,
            prenotification_status: 'provider_managed',
            // v61 — provenance frozen at draft creation, from the pure core.
            policy_version: prep.policyVersion || undefined,
            policy_source: prep.policySource || undefined,
            snapshot_hash: prep.snapshotHash || undefined,
          });
        }

        // ── PHASE 4 — Stripe (idempotent per step, keys from report id) ──
        let stripeInvoiceId = inv.stripe_invoice_id || '';
        if (!stripeInvoiceId) {
          const footer = tax.treatment === 'ES_EU_REVERSE_CHARGE'
            ? `${tax.mentions.join(' — ')} — Supplier VAT: ${identity.identity.vat_id} — Customer VAT: ${customerVat}`
            : `Supplier VAT: ${identity.identity.vat_id}`;
          const created = await stripeRequest(mode, 'POST', 'invoices', {
            customer: brand.stripe_customer_id,
            collection_method: 'charge_automatically',
            default_payment_method: activation.stripe_payment_method_id,
            currency: 'eur',
            auto_advance: 'false',
            footer: footer.slice(0, 500),
            // String()-coerced on purpose: URLSearchParams would otherwise send
            // the literal "undefined" to Stripe for a missing id.
            'metadata[organization_id]': String(activation.brand_id || ''),
            'metadata[brand_id]': String(activation.brand_id || ''),
            'metadata[deal_activation_id]': String(activation.id),
            'metadata[mandate_id]': String(mandate.id),
            'metadata[monthly_savings_report_id]': String(report.id),
            'metadata[local_invoice_id]': String(inv.id),
            'metadata[billing_month]': String(report.month),
          }, `r4:inv:create:${report.id}`);
          if (!created.ok) { outcome.error = `stripe_invoice_create_failed:${created.data?.error?.code || created.status}`; continue; }
          stripeInvoiceId = created.data.id;
          await svc.entities.Invoice.update(inv.id, { stripe_invoice_id: stripeInvoiceId, stripe_invoice_status: created.data.status || 'draft' });
        }

        // Line item (skipped if already present — resume-safe via Stripe idempotency).
        const itemParams: Record<string, string> = {
          customer: brand.stripe_customer_id,
          invoice: stripeInvoiceId,
          amount: String(amounts.fee_net_minor),
          currency: 'eur',
          description: lineDescription(report.month, locale),
        };
        if (taxRateRef.tax_rate_id) itemParams['tax_rates[0]'] = taxRateRef.tax_rate_id;
        const item = await stripeRequest(mode, 'POST', 'invoiceitems', itemParams, `r4:inv:item:${report.id}`);
        if (!item.ok) { outcome.error = `stripe_item_failed:${item.data?.error?.code || item.status}`; continue; }

        // Reverse charge: mark the Stripe Customer exempt='reverse' so the
        // hosted invoice/PDF prints the reverse-charge treatment, and attach
        // the customer's VAT id (best-effort — the mention also lives in footer).
        if (tax.treatment === 'ES_EU_REVERSE_CHARGE') {
          await stripeRequest(mode, 'POST', `customers/${brand.stripe_customer_id}`, { tax_exempt: 'reverse' }).catch(() => null);
          await stripeRequest(mode, 'POST', `customers/${brand.stripe_customer_id}/tax_ids`, { type: 'eu_vat', value: customerVat }, `r4:taxid:${brand.id}`).catch(() => null);
        }

        // Finalize — Stripe assigns THE legal number here. This is the LAST
        // Stripe side effect; every validation already happened in PHASE 2.
        const fin = await stripeRequest(mode, 'POST', `invoices/${stripeInvoiceId}/finalize`, { auto_advance: 'true' }, `r4:inv:fin:${report.id}`);
        if (!fin.ok) { outcome.error = `stripe_finalize_failed:${fin.data?.error?.code || fin.status}`; continue; }
        const finalized = fin.data;

        // ── PHASE 5 — persist result + provenance (frozen in PHASE 2) ───
        const snapshot = {
          report: { id: report.id, month: report.month, savings: report.savings, billable_savings: amounts.billable_savings_eur, calculation_hash: report.calculation_hash || null, calculation_version: report.calculation_version || null },
          baseline_id: report.baseline_id || null,
          mandate: { id: mandate.id, document_version: mandate.document_version, acceptance_snapshot_hash: mandate.acceptance_snapshot_hash },
          fee: { standard_pct: amounts.standard_fee_pct, discount_pct: amounts.discount_pct, effective_pct: amounts.effective_fee_pct },
          // v61 — contract policy provenance, resolved BEFORE Stripe (PHASE 2).
          policy: {
            policy_version: prep.policyVersion,
            policy_source: prep.policySource,
            snapshot_hash: prep.snapshotHash,
            mandate_id: mandate.id,
            report_id: report.id,
            billing_rule_id: report.billing_rule_id || null,
            merchant_share_pct: view.merchantSharePct,
            fee_duration_months: view.feeDurationMonths,
            resolvable: true,
          },
          idempotency: prep.idempotencyIdentity,
          tax: { treatment: tax.treatment, rate_bps: tax.tax_rate_bps, mentions: tax.mentions, vies_status: brand.vies_status || 'not_checked', vies_checked_at: brand.vies_checked_at || null },
          supplier: { legal_name: identity.identity.legal_name, vat_id: identity.identity.vat_id, address: identity.identity.registered_address },
          customer: { legal_name: brand.billing_legal_name, country: brand.billing_country, vat: customerVat },
          period: bounds,
          amounts_minor: { fee_net: amounts.fee_net_minor, tax: amounts.tax_minor, total: amounts.total_minor },
          rounding_policy: 'half_up_integer_cents_v1',
          stripe: { mode, invoice_id: stripeInvoiceId, number: finalized.number || '' },
        };
        const snapshotHash = await hashCalculation(snapshot);

        await svc.entities.Invoice.update(inv.id, {
          status: 'issued',
          invoice_number: finalized.number || '',
          issued_at: now(),
          invoice_finalized_at: now(),
          due_at: finalized.due_date ? new Date(finalized.due_date * 1000).toISOString() : null,
          hosted_invoice_url: finalized.hosted_invoice_url || '',
          pdf_url: finalized.invoice_pdf || '',
          stripe_invoice_status: finalized.status || 'open',
          processor_payment_intent_id: typeof finalized.payment_intent === 'string' ? finalized.payment_intent : '',
          collection_scheduled_at: now(),
          billing_snapshot_json: snapshot,
          invoice_snapshot_hash: snapshotHash,
          policy_version: prep.policyVersion || undefined,
          snapshot_hash: prep.snapshotHash || undefined,
          policy_source: prep.policySource || undefined,
        });
        await svc.entities.MonthlySavingsReport.update(report.id, {
          billing_eligibility_status: 'invoiced',
          invoice_id: inv.id,
          status: 'invoiced',
          verification_status: 'invoiced',
        });
        if (!activation.first_invoice_issued_at) {
          await svc.entities.DealActivation.update(activation.id, { first_invoice_issued_at: now() }).catch(() => null);
        }
        await svc.entities.PaymentEvent.create({
          invoice_id: inv.id,
          brand_id: activation.brand_id,
          amount: amounts.total_eur,
          currency: 'EUR',
          event_type: 'invoice_issued',
          processor: 'stripe',
          processor_ref: stripeInvoiceId,
          metadata_json: { month: report.month, number: finalized.number || '', mode },
          occurred_at: now(),
        }).catch(() => null);
        await svc.entities.OperationalLog.create({
          deal_activation_id: activation.id,
          brand_id: activation.brand_id,
          event_type: 'status_changed',
          message: 'recover_invoice_finalized',
          data_json: { invoice_id: inv.id, stripe_invoice_id: stripeInvoiceId, number: finalized.number || '', total_eur: amounts.total_eur, tax_treatment: tax.treatment, mode, policy_version: prep.policyVersion, policy_source: prep.policySource },
          actor_email: gate.user?.email || 'internal',
          created_at: now(),
        }).catch(() => null);

        outcome.ok = true;
        outcome.invoice_id = inv.id;
        outcome.stripe_invoice_id = stripeInvoiceId;
        outcome.invoice_number = finalized.number || '';
        outcome.total_eur = amounts.total_eur;
        outcome.tax_treatment = tax.treatment;
      } catch (e) {
        outcome.error = (e as Error).message;
      }
    }

    return Response.json({ ok: true, mode, scanned: candidates.length, results });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}