// generateRecoverContractPdf — RECOVER-3 (2026-08-03).
//
// Produces the contractual PDF for ONE mandate, stores it privately, verifies the
// stored bytes and only then declares it generated.
//
// Internal/admin only. Never called by a merchant's browser.
//
// ORDER, AND WHY: claim the lease -> verify the accepted snapshot -> build ->
// upload -> RE-READ the stored object and re-hash it -> mark generated -> queue
// the email. Marking 'generated' before the storage read-back would let a
// truncated upload be advertised to the merchant as their agreement.
//
// WHAT IT REFUSES TO DO: it never writes Mandate.status, never touches
// DealActivation, and never rebuilds the snapshot from current data. A failure
// here leaves an active mandate active — the acceptance already happened.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { normalizeLocale } from '../../shared/emailLocale.ts';
import { hashSnapshot } from '../../shared/recoverAcceptance.ts';
import { readLegalIdentity } from '../../shared/cambraLegalIdentity.ts';
import { buildRecoverContractPdf, sha256Hex } from '../../shared/recoverContractPdf.ts';
import { contractStringsForVersion, resolveContractTemplateVersion } from '../../shared/recoverContractTemplateRegistry.ts';
import {
  MAX_ATTEMPTS,
  PERMANENT_PDF_ERRORS,
  classifyError,
  deliveryIdempotencyKey,
  leaseExpired,
  logContractEvent,
  nextRetryAt,
  safeReference,
  storageFileName,
} from '../../shared/recoverContractState.ts';
import { fireAndForget } from '../../shared/invokeInternal.ts';

/** Timing-safe comparison of two hex digests of equal expected length. */
function hashesMatch(a: string, b: string): boolean {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const gate = await requireAdminOrInternal(req, base44, body);
  if (!gate.ok) return gate.response;

  const svc = base44.asServiceRole;
  const mandate_id = String(body?.mandate_id || '');
  if (!mandate_id) return Response.json({ error: 'mandate_id required' }, { status: 400 });

  const rows = await svc.entities.Mandate.filter({ id: mandate_id }, '-created_date', 1).catch(() => []);
  const mandate = rows?.[0];
  if (!mandate) return Response.json({ error: 'mandate not found' }, { status: 404 });

  // A mandate that is active, or was active and has since been superseded or
  // revoked, still owes its holder a copy. An 'acceptance_started' row does not:
  // there is no acceptance to document yet.
  if (!['active', 'superseded', 'revoked'].includes(mandate.status)) {
    await svc.entities.Mandate.update(mandate_id, {
      contract_pdf_status: 'failed_permanent',
      contract_pdf_pending: false,
      contract_pdf_last_error_code: 'mandate_not_acceptable',
    }).catch(() => null);
    return Response.json({ error: 'mandate_not_acceptable', status: mandate.status }, { status: 409 });
  }

  if (mandate.contract_pdf_status === 'generated' && mandate.contract_pdf_storage_key) {
    return Response.json({ ok: true, already_generated: true, mandate_id });
  }
  // Concurrency: a live lease means another worker owns this job.
  if (mandate.contract_pdf_status === 'generating' && !leaseExpired(mandate.contract_pdf_last_attempt_at)) {
    return Response.json({ ok: true, skipped: 'generation_in_progress', mandate_id });
  }

  const attempt = Number(mandate.contract_pdf_attempt_count || 0) + 1;
  const startedAt = new Date().toISOString();
  await svc.entities.Mandate.update(mandate_id, {
    contract_pdf_status: 'generating',
    contract_pdf_pending: true,
    contract_pdf_attempt_count: attempt,
    contract_pdf_last_attempt_at: startedAt,
  });
  await logContractEvent(svc, 'recover_contract_pdf_generation_started', mandate, { attempt });

  try {
    // ── 1. The accepted snapshot is the ONLY source ────────────────────────
    const snapshot = mandate.acceptance_snapshot_json;
    if (!snapshot || typeof snapshot !== 'object') throw new Error('acceptance_snapshot_missing');

    const recomputed = await hashSnapshot(snapshot);
    if (!hashesMatch(recomputed, mandate.acceptance_snapshot_hash)) {
      await logContractEvent(svc, 'recover_contract_pdf_integrity_failed', mandate, {
        stored_hash_prefix: String(mandate.acceptance_snapshot_hash || '').slice(0, 12),
        recomputed_hash_prefix: recomputed.slice(0, 12),
      });
      throw new Error('source_snapshot_integrity_mismatch');
    }

    // ── 2. CAMBRA's own legal identity must exist ──────────────────────────
    const legal = readLegalIdentity();
    if (!legal.ok) {
      // Destructured INSIDE the guard so the union narrows to its false arm.
      const { missing } = legal;
      await logContractEvent(svc, 'recover_contract_pdf_generation_failed', mandate, {
        reason: 'legal_identity_missing',
        missing,
      });
      throw new Error('legal_identity_missing');
    }

    // ── 3. Language: frozen at acceptance, fallback logged not written back ─
    const requested = mandate.language || '';
    const locale = normalizeLocale(requested);
    if (requested && requested !== locale) {
      await logContractEvent(svc, 'recover_contract_pdf_generation_started', mandate, {
        language_fallback_from: String(requested).slice(0, 8),
        language_used: locale,
      });
    }

    // v61 (Checkpoint C) — annex labels come from the template version in force
    // at acceptance, resolved via the immutable registry (unknown = blocked).
    const tplVersion = resolveContractTemplateVersion(snapshot, mandate);
    const t = contractStringsForVersion(tplVersion, locale);
    const reference = safeReference(mandate_id);
    const documentHashes = [
      { label: t.annex_document_version, value: mandate.document_version || '' },
      { label: t.annex_snapshot_hash, value: mandate.acceptance_snapshot_hash || '' },
    ];

    // ── 4. Build ──────────────────────────────────────────────────────────
    const pdf = await buildRecoverContractPdf({
      locale,
      identity: legal.identity,
      mandate,
      snapshot,
      reference,
      documentHashes,
    });

    // ── 5. Store privately (opaque filename, no merchant identifiers) ─────
    const filename = storageFileName(mandate_id);
    // TS ≥5.7: Uint8Array<ArrayBufferLike> includes SharedArrayBuffer, which
    // BlobPart rejects. Re-wrapping yields a plain Uint8Array<ArrayBuffer>.
    // Same bytes, same PDF — no change to content or flow.
    const pdfBlobBytes = new Uint8Array(pdf.bytes);
    const file = new File([pdfBlobBytes], filename, { type: 'application/pdf' });
    const upload = await svc.integrations.Core.UploadPrivateFile({ file }).catch((e: any) => {
      throw new Error(`storage_unavailable: ${e?.message || 'upload failed'}`);
    });
    const file_uri = upload?.file_uri;
    if (!file_uri) throw new Error('storage_unavailable: no file_uri returned');

    // ── 6. Read the stored object back and re-hash it ─────────────────────
    const { signed_url } = await svc.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 120 }).catch(
      (e: any) => { throw new Error(`storage_unavailable: ${e?.message || 'signing failed'}`); },
    );
    const verifyRes = await fetch(signed_url).catch(() => null);
    if (!verifyRes?.ok) throw new Error('storage_verification_failed');
    const storedBytes = new Uint8Array(await verifyRes.arrayBuffer());
    const storedHash = await sha256Hex(storedBytes);
    if (!hashesMatch(storedHash, pdf.sha256)) throw new Error('storage_verification_mismatch');

    // ── 7. Only now is it a document ───────────────────────────────────────
    const generatedAt = new Date().toISOString();
    await svc.entities.Mandate.update(mandate_id, {
      contract_pdf_status: 'generated',
      contract_pdf_pending: false,
      contract_pdf_generated_at: generatedAt,
      contract_pdf_storage_key: file_uri,
      contract_pdf_sha256: pdf.sha256,
      contract_pdf_size_bytes: pdf.bytes.length,
      contract_pdf_template_version: pdf.templateVersion,
      contract_pdf_language: locale,
      contract_pdf_source_snapshot_hash: mandate.acceptance_snapshot_hash,
      contract_pdf_last_error_code: '',
      contract_pdf_next_retry_at: '',
      contract_email_status: mandate.contract_email_status === 'sent' ? 'sent' : 'pending',
      contract_delivery_idempotency_key: deliveryIdempotencyKey({
        mandateId: mandate_id,
        snapshotHash: mandate.acceptance_snapshot_hash || '',
        templateVersion: pdf.templateVersion,
        language: locale,
      }),
    });

    await logContractEvent(svc, 'recover_contract_pdf_generated', mandate, {
      attempt,
      language: locale,
      template_version: pdf.templateVersion,
      size_bytes: pdf.bytes.length,
      hash_prefix: pdf.sha256.slice(0, 12),
    });
    await logContractEvent(svc, 'recover_contract_email_queued', mandate, { language: locale });

    fireAndForget(base44, 'sendRecoverContractEmail', { mandate_id });

    return Response.json({
      ok: true,
      mandate_id,
      language: locale,
      size_bytes: pdf.bytes.length,
      sha256: pdf.sha256,
      generated_at: generatedAt,
    });
  } catch (error) {
    const { code, retryable } = classifyError(error, PERMANENT_PDF_ERRORS);
    const exhausted = attempt >= MAX_ATTEMPTS;
    const permanent = !retryable || exhausted;
    await svc.entities.Mandate.update(mandate_id, {
      contract_pdf_status: permanent ? 'failed_permanent' : 'failed_retryable',
      contract_pdf_pending: !permanent,
      contract_pdf_last_error_code: code,
      contract_pdf_next_retry_at: permanent ? '' : nextRetryAt(attempt),
    }).catch(() => null);

    await logContractEvent(svc, 'recover_contract_pdf_generation_failed', mandate, {
      attempt,
      error_code: code,
      permanent,
      exhausted,
    });

    // Permanent failures need a human: the merchant accepted and is owed a copy.
    if (permanent) {
      await svc.entities.AuthorizationLog.create({
        brand_id: mandate.brand_id || '',
        provider_id: mandate.provider_id || '',
        deal_activation_id: mandate.deal_activation_id || '',
        action_type: 'recover_contract_pdf_blocked',
        description: `Contract PDF permanently failed for mandate ${mandate_id}: ${code}`,
        approved_by: 'system',
        approved_at: new Date().toISOString(),
        source: 'generateRecoverContractPdf',
        document_version: mandate.document_version || '',
      }).catch(() => null);
    }

    return Response.json({ error: code, permanent, mandate_id }, { status: permanent ? 422 : 503 });
  }
}