import { safeBestEffort } from '../../shared/bestEffort.ts';
// downloadRecoverContract — RECOVER-3 (2026-08-03).
//
// Authorized access to the stored contractual PDF.
//
// It returns a SHORT-LIVED signed URL (120 s) minted only AFTER ownership is
// proven, plus the safe filename the browser should use. The canonical reference
// stays contract_pdf_storage_key: the signed URL is never persisted, never
// logged, never emailed, and expires by itself.
//
// A revoked or superseded mandate is still downloadable — it is evidence of what
// was agreed — and the response says so explicitly so no UI can present a revoked
// agreement as being in force.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveOwnedActivation } from '../../shared/recoverAcceptance.ts';
import { logContractEvent, safeReference } from '../../shared/recoverContractState.ts';

const EXPIRES_IN = 120;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'downloadRecoverContract',fallback:null,severity:'critical'}));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    // Accepts either an explicit mandate id (admin surfaces) or the activation the
    // merchant is looking at — the merchant UI never has to be told a mandate id
    // just to download their own document.
    let mandate: any = null;
    if (body?.mandate_id) {
      const rows = await svc.entities.Mandate.filter({ id: String(body.mandate_id) }, '-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'downloadRecoverContract',fallback:[],severity:'critical'}));
      mandate = rows?.[0] || null;
    } else {
      const owned = await resolveOwnedActivation(svc, user, body?.deal_activation_id);
      if (!owned.ok) return Response.json({ error: 'not found' }, { status: 404 });
      const rows = await svc.entities.Mandate
        .filter({ deal_activation_id: owned.activation.id }, '-created_date', 25)
        .catch((error:any)=>safeBestEffort(error,{operation:'downloadRecoverContract',fallback:[],severity:'critical'}));
      mandate = (rows || []).find((m: any) => m.contract_pdf_status === 'generated' && m.status === 'active')
        || (rows || []).find((m: any) => m.contract_pdf_status === 'generated')
        || null;
    }
    if (!mandate) return Response.json({ error: 'not found' }, { status: 404 });
    const mandate_id = mandate.id;

    const email = String(user.email || '').toLowerCase();
    const owns =
      user.role === 'admin' ||
      String(mandate.owner_email || '').toLowerCase() === email ||
      String(mandate.signed_by_email || '').toLowerCase() === email;
    // 404, not 403: a cross-tenant probe learns nothing about which ids exist.
    if (!owns) return Response.json({ error: 'not found' }, { status: 404 });

    if (mandate.contract_pdf_status !== 'generated' || !mandate.contract_pdf_storage_key) {
      return Response.json({ error: 'not_ready', status: mandate.contract_pdf_status || 'pending' }, { status: 409 });
    }

    const { signed_url } = await svc.integrations.Core.CreateFileSignedUrl({
      file_uri: mandate.contract_pdf_storage_key,
      expires_in: EXPIRES_IN,
    });

    await logContractEvent(svc, 'recover_contract_pdf_downloaded', mandate, {
      mandate_status: mandate.status,
      hash_prefix: String(mandate.contract_pdf_sha256 || '').slice(0, 12),
    }, email);

    return Response.json({
      ok: true,
      download_url: signed_url,
      expires_in: EXPIRES_IN,
      filename: `CAMBRA-Recover-Margin-${safeReference(mandate_id)}.pdf`,
      mandate_status: mandate.status,
      sha256: mandate.contract_pdf_sha256,
    });
  } catch (error) {
    console.error('downloadRecoverContract failed', error);
    return Response.json({ error: 'recover_contract_download_failed' }, { status: 500 });
  }
}