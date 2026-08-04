// checkVatVies — RECOVER-4 (2026-08-04).
//
// Validates a customer VAT number against the EU VIES REST service and stores
// the evidence on the Brand. Admin or internal only.
//
// STATE SEMANTICS (§14) — load-bearing:
//   valid        → reverse-charge eligible (other conditions still apply).
//   invalid      → BLOCKS billing. NEVER auto-converted to "apply French TVA":
//                  an invalid result can mean a not-yet-activated intracom
//                  registration, so the fix is correction/retry/manual review.
//   unavailable / timeout → BLOCKS billing with retry; NOT treated as invalid.
// Manual review states are set by a separate, documented admin action — never
// by this function.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { normalizeVat } from '../../shared/recoverTax.ts';

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';
const TIMEOUT_MS = 10000;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const { brand_id } = body || {};
    if (!brand_id) return Response.json({ error: 'brand_id required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const rows = await svc.entities.Brand.filter({ id: brand_id }, '-created_date', 1).catch(() => []);
    const brand = rows?.[0];
    if (!brand) return Response.json({ error: 'brand not found' }, { status: 404 });

    const vat = normalizeVat(body?.vat_number || brand.vat_number || '');
    if (!/^[A-Z]{2}[0-9A-Z]{2,12}$/.test(vat)) {
      return Response.json({ error: 'vat_number_malformed', vat_number: vat }, { status: 400 });
    }
    const countryCode = vat.slice(0, 2);
    const vatNumber = vat.slice(2);

    let status = 'unavailable';
    let snapshot: Record<string, unknown> = {};
    let requestIdentifier = '';
    let viesName = '';
    let viesAddress = '';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(VIES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode, vatNumber }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data?.valid === 'boolean') {
        status = data.valid ? 'valid' : 'invalid';
        requestIdentifier = String(data.requestIdentifier || data.consultationNumber || '');
        viesName = String(data.name || data.traderName || '').slice(0, 300);
        viesAddress = String(data.address || data.traderAddress || '').replace(/\n/g, ', ').slice(0, 500);
        snapshot = {
          valid: data.valid,
          request_date: data.requestDate || null,
          request_identifier: requestIdentifier || null,
          name: viesName || null,
          address: viesAddress || null,
          country_code: countryCode,
        };
      } else if (res.ok && typeof data?.isValid === 'boolean') {
        // Some VIES deployments answer isValid instead of valid.
        status = data.isValid ? 'valid' : 'invalid';
        requestIdentifier = String(data.requestIdentifier || '');
        viesName = String(data.name || '').slice(0, 300);
        viesAddress = String(data.address || '').replace(/\n/g, ', ').slice(0, 500);
        snapshot = { valid: data.isValid, request_date: data.requestDate || null, request_identifier: requestIdentifier || null, name: viesName || null, address: viesAddress || null, country_code: countryCode };
      } else {
        // MS_UNAVAILABLE / SERVICE_UNAVAILABLE / anything non-conclusive.
        status = 'unavailable';
        snapshot = { service_error: String(data?.errorWrappers?.[0]?.error || data?.userError || res.status).slice(0, 200), country_code: countryCode };
      }
    } catch (e) {
      status = (e as Error).name === 'AbortError' ? 'timeout' : 'unavailable';
      snapshot = { service_error: String((e as Error).message).slice(0, 200), country_code: countryCode };
    }

    const now = new Date().toISOString();
    await svc.entities.Brand.update(brand.id, {
      vat_number: brand.vat_number || vat,
      vat_number_normalized: vat,
      vat_country: countryCode,
      vies_status: status,
      vies_checked_at: now,
      vies_request_identifier: requestIdentifier,
      vies_response_snapshot: snapshot,
      vies_name: viesName,
      vies_address: viesAddress,
      ...(status === 'valid' ? { tax_evidence_status: 'vies_validated' } : {}),
    });

    await svc.entities.OperationalLog.create({
      brand_id: brand.id,
      event_type: 'status_changed',
      message: `recover_vies_${status}`,
      data_json: { vat_country: countryCode, vies_status: status, request_identifier: requestIdentifier || null },
      actor_email: gate.user?.email || 'internal',
      created_at: now,
    }).catch(() => null);

    return Response.json({ ok: true, brand_id: brand.id, vat_number_normalized: vat, vies_status: status, vies_checked_at: now, snapshot });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}