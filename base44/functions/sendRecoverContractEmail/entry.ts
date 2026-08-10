// sendRecoverContractEmail — RECOVER-3 (2026-08-03).
//
// Sends the merchant their copy of the agreement. Internal/admin only.
//
// ATTACHMENT vs LINK: the platform's send integration accepts `to/subject/body`
// and NOTHING else — there is no attachment channel. So this uses the §18 FALLBACK
// by necessity, not by preference: a link to an authenticated route where
// downloadRecoverContract re-checks permissions. The email says "download",
// never "attached", and no long-lived signed URL is ever put in an email.
//
// RECIPIENT: Mandate.signed_by_email, full stop. Not the current session, not a
// Brand contact, not created_by — the copy goes to the person who accepted.
//
// A failure here never touches Mandate.status and never blocks the payment-method
// setup; the document stays downloadable regardless.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { normalizeLocale } from '../../shared/emailLocale.ts';
import { recoverContractEmail } from '../../shared/emails/recoverContract.ts';
import { resolveContractPolicy, buildContractEconomicView } from '../../shared/contractPolicySnapshot.ts';
import { emergencyState } from '../../shared/operationalControl.ts';
import {
  MAX_ATTEMPTS,
  PERMANENT_EMAIL_ERRORS,
  classifyError,
  deliveryIdempotencyKey,
  leaseExpired,
  logContractEvent,
  maskEmail,
  nextRetryAt,
  safeReference,
} from '../../shared/recoverContractState.ts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const gate = await requireAdminOrInternal(req, base44, body);
  if (!gate.ok) return gate.response;

  const svc = base44.asServiceRole;
  const emergency = await emergencyState(svc);
  if (emergency.safe_mode || emergency.communications_paused) return Response.json({ ok:false, error:'emergency_control_paused:communications', safe_mode:emergency.safe_mode, reason:emergency.reason || null }, { status:409 });
  const mandate_id = String(body?.mandate_id || '');
  // An admin resend is the ONLY way a second copy is ever sent, and it is logged
  // as a distinct event.
  const isResend = body?.resend === true && gate.isAdmin;
  if (!mandate_id) return Response.json({ error: 'mandate_id required' }, { status: 400 });

  const rows = await svc.entities.Mandate.filter({ id: mandate_id }, '-created_date', 1).catch(() => []);
  const mandate = rows?.[0];
  if (!mandate) return Response.json({ error: 'mandate not found' }, { status: 404 });

  // The email may not exist before the document does.
  if (mandate.contract_pdf_status !== 'generated' || !mandate.contract_pdf_storage_key || !mandate.contract_pdf_sha256) {
    return Response.json({ error: 'pdf_not_ready', pdf_status: mandate.contract_pdf_status || 'pending' }, { status: 409 });
  }

  if (!isResend) {
    if (mandate.contract_email_status === 'sent' || mandate.contract_email_sent_at || mandate.contract_email_provider_message_id) {
      return Response.json({ ok: true, already_sent: true, mandate_id });
    }
    if (['failed_permanent', 'suppressed'].includes(mandate.contract_email_status)) {
      return Response.json({ ok: true, skipped: mandate.contract_email_status, mandate_id });
    }
    if (mandate.contract_email_status === 'sending' && !leaseExpired(mandate.contract_email_last_attempt_at)) {
      return Response.json({ ok: true, skipped: 'send_in_progress', mandate_id });
    }
  }

  // v61 (Checkpoint C) — the email's contractual figures come from the resolved
  // contract economic view (same source as the PDF), never a hardcoded 24. An
  // unresolvable contract blocks the send — it never falls back to the live
  // policy. (Mandate.status is never touched; the document stays downloadable.)
  const _resolved = resolveContractPolicy({ mandate });
  if (!_resolved.resolvable) {
    return Response.json({ error: 'contract_unresolvable', mandate_id }, { status: 422 });
  }
  const econ = buildContractEconomicView({ resolvedContractPolicy: _resolved, mandate });

  const recipient = String(mandate.signed_by_email || '').trim();
  const locale = normalizeLocale(mandate.contract_pdf_language || mandate.language);
  const attempt = Number(mandate.contract_email_attempt_count || 0) + 1;
  const startedAt = new Date().toISOString();

  await svc.entities.Mandate.update(mandate_id, {
    contract_email_status: 'sending',
    contract_email_attempt_count: attempt,
    contract_email_last_attempt_at: startedAt,
    contract_delivery_idempotency_key: deliveryIdempotencyKey({
      mandateId: mandate_id,
      snapshotHash: mandate.contract_pdf_sha256,
      templateVersion: mandate.contract_pdf_template_version || '',
      language: locale,
    }),
  });

  try {
    if (!EMAIL_RE.test(recipient)) throw new Error('recipient_invalid');

    const appDomain = Deno.env.get('APP_DOMAIN') || 'cambra.global';
    const mail = recoverContractEmail(locale, {
      firstName: (mandate.signed_by_name || recipient.split('@')[0]).split(' ')[0],
      acceptanceDate: new Date(mandate.signed_at || Date.now()).toLocaleDateString(
        { en: 'en-IE', fr: 'fr-FR', es: 'es-ES' }[locale],
        { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
      ),
      reference: safeReference(mandate_id),
      // Authenticated app route — NOT a signed storage URL.
      downloadUrl: `https://${appDomain}/Reports`,
      attached: false,
      durationMonths: econ.feeDurationMonths,
    });

    const sent = await svc.integrations.Core.SendEmail({
      from_name: 'CAMBRA',
      to: recipient,
      subject: mail.subject,
      body: mail.html,
    }).catch((e: any) => { throw new Error(`send_failed: ${e?.message || 'provider error'}`); });

    const sentAt = new Date().toISOString();
    await svc.entities.Mandate.update(mandate_id, {
      contract_email_status: 'sent',
      contract_email_sent_at: sentAt,
      contract_email_recipient: recipient,
      contract_email_provider_message_id: String(sent?.id || sent?.message_id || ''),
      contract_email_last_error_code: '',
      contract_email_next_retry_at: '',
    });

    await logContractEvent(
      svc,
      isResend ? 'recover_contract_email_resent_by_admin' : 'recover_contract_email_sent',
      mandate,
      { attempt, language: locale, recipient_masked: maskEmail(recipient) },
      gate.isAdmin ? String(gate.user?.email || 'admin') : 'internal',
    );

    return Response.json({ ok: true, mandate_id, recipient_masked: maskEmail(recipient), sent_at: sentAt });
  } catch (error) {
    const { code, retryable } = classifyError(error, PERMANENT_EMAIL_ERRORS);
    const exhausted = attempt >= MAX_ATTEMPTS;
    const permanent = !retryable || exhausted;
    const status = code === 'recipient_invalid' ? 'suppressed' : permanent ? 'failed_permanent' : 'failed_retryable';

    await svc.entities.Mandate.update(mandate_id, {
      contract_email_status: status,
      contract_email_last_error_code: code,
      contract_email_next_retry_at: permanent ? '' : nextRetryAt(attempt),
    }).catch(() => null);

    await logContractEvent(
      svc,
      status === 'suppressed' ? 'recover_contract_email_suppressed' : 'recover_contract_email_failed',
      mandate,
      { attempt, error_code: code, permanent, recipient_masked: maskEmail(recipient) },
    );

    return Response.json({ error: code, permanent, mandate_id }, { status: permanent ? 422 : 503 });
  }
}