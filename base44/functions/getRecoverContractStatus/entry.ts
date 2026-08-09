// getRecoverContractStatus — RECOVER-3 (2026-08-03).
//
// What the merchant's UI is allowed to know about their agreement document.
//
// The response is an EXPLICIT ALLOWLIST built field by field: no storage key, no
// signed URL, no raw provider error, no internal payload. Adding a field to the
// Mandate schema can therefore never leak it here by accident.
//
// It also acts as the SECOND, practical trigger for generation: the platform has
// no queue, so if the fire-and-forget call at acceptance was lost, the merchant
// simply opening their reports page re-queues the work (subject to the backoff
// window). Admins get the operational fields for the same mandate.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveOwnedActivation } from '../../shared/recoverAcceptance.ts';
import { leaseExpired, maskEmail, safeReference } from '../../shared/recoverContractState.ts';
import { fireAndForget } from '../../shared/invokeInternal.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    let mandate: any = null;
    if (body?.mandate_id) {
      const rows = await svc.entities.Mandate.filter({ id: String(body.mandate_id) }, '-created_date', 1).catch(() => []);
      mandate = rows?.[0] || null;
    } else {
      const owned = await resolveOwnedActivation(svc, user, body?.deal_activation_id);
      if (!owned.ok) return Response.json({ error: owned.error }, { status: owned.status });
      const rows = await svc.entities.Mandate
        .filter({ deal_activation_id: owned.activation.id }, '-created_date', 25)
        .catch(() => []);
      mandate = (rows || []).find((m: any) => m.status === 'active')
        || (rows || []).find((m: any) => ['superseded', 'revoked'].includes(m.status))
        || null;
    }
    if (!mandate) return Response.json({ ok: true, exists: false });

    // Ownership: the signer, the mandate owner, or an admin.
    const email = String(user.email || '').toLowerCase();
    const isAdmin = user.role === 'admin';
    const owns =
      isAdmin ||
      String(mandate.owner_email || '').toLowerCase() === email ||
      String(mandate.signed_by_email || '').toLowerCase() === email;
    if (!owns) return Response.json({ error: 'forbidden' }, { status: 403 });

    const pdfStatus = mandate.contract_pdf_status || 'pending';
    const emailStatus = mandate.contract_email_status || 'not_ready';

    // Opportunistic re-queue — bounded by the persisted backoff, and never for a
    // permanent failure (which needs a human, not another attempt).
    const stalled =
      mandate.status === 'active' &&
      (pdfStatus === 'pending' ||
        pdfStatus === 'failed_retryable' ||
        (pdfStatus === 'generating' && leaseExpired(mandate.contract_pdf_last_attempt_at)));
    const dueAt = mandate.contract_pdf_next_retry_at ? new Date(mandate.contract_pdf_next_retry_at).getTime() : 0;
    if (stalled && (!dueAt || dueAt <= Date.now())) {
      // RECOVER-4 audit fix (2026-08-04): this passed `req` instead of the SDK
      // client. fireAndForget reads base44.asServiceRole.functions, so on `req`
      // it threw immediately and was swallowed — meaning this "second trigger"
      // never actually re-queued anything since RECOVER-3. Same class of bug as
      // the 404 in invokeInternal, and equally silent.
      fireAndForget(base44, 'generateRecoverContractPdf', { mandate_id: mandate.id });
    }

    const payload: Record<string, unknown> = {
      ok: true,
      exists: true,
      mandate_status: mandate.status,
      reference: safeReference(mandate.id),
      status: pdfStatus,
      generated_at: mandate.contract_pdf_generated_at || null,
      language: mandate.contract_pdf_language || mandate.language || null,
      download_available: pdfStatus === 'generated',
      email_status: emailStatus,
      email_sent_at: mandate.contract_email_sent_at || null,
      email_recipient_masked: maskEmail(mandate.contract_email_recipient || mandate.signed_by_email),
    };

    if (isAdmin) {
      payload.admin = {
        mandate_id: mandate.id,
        deal_activation_id: mandate.deal_activation_id || '',
        pdf_attempt_count: Number(mandate.contract_pdf_attempt_count || 0),
        pdf_last_attempt_at: mandate.contract_pdf_last_attempt_at || null,
        pdf_next_retry_at: mandate.contract_pdf_next_retry_at || null,
        pdf_last_error_code: mandate.contract_pdf_last_error_code || '',
        pdf_sha256: mandate.contract_pdf_sha256 || '',
        pdf_size_bytes: Number(mandate.contract_pdf_size_bytes || 0),
        pdf_template_version: mandate.contract_pdf_template_version || '',
        email_attempt_count: Number(mandate.contract_email_attempt_count || 0),
        email_next_retry_at: mandate.contract_email_next_retry_at || null,
        email_last_error_code: mandate.contract_email_last_error_code || '',
      };
    }

    return Response.json(payload);
  } catch (error) {
    console.error('getRecoverContractStatus failed', error);
    return Response.json({ error: 'recover_contract_status_failed' }, { status: 500 });
  }
}