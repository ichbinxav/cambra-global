# Decision Log — RECOVER-3 (contractual PDF: generation, storage, delivery)

Date: 2026-08-03. Scope: produce, store and deliver the contractual copy of an
accepted Recover Margin mandate. RECOVER-1 (acceptance) and RECOVER-2 (billing)
are untouched.

## Load-bearing decisions

1. **The PDF is a representation, never the act of consent.** The acceptance is
   already legally complete when `Mandate.status = 'active'`. Therefore NO failure
   in this chunk may revoke, supersede or downgrade a mandate, and none of the
   `contract_pdf_*` / `contract_email_*` fields can invalidate an active mandate.
   `generateRecoverContractPdf` never writes `Mandate.status`.

2. **The document is built ONLY from `acceptance_snapshot_json`.** Never from
   current BillingRule / Terms / Baseline / Brand state. `acceptance_snapshot_hash`
   is re-verified immediately before rendering; a mismatch is `failed_permanent`
   (`source_snapshot_integrity_mismatch`) rather than a document that
   misrepresents the accepted terms. Verified live on 2026-08-03: tampering with
   the stored snapshot's `fee_pct` produced exactly that refusal.

3. **Language is frozen at acceptance** (`Mandate.language`, resolved from the
   stored `Brand.locale`), never from Accept-Language or the admin's current UI.
   The language actually rendered is recorded separately in
   `contract_pdf_language`, so a fallback to `en` is visible in evidence.

4. **Storage is private.** `contract_pdf_storage_key` holds a private file URI —
   the canonical reference. Never a public or signed URL (a persisted signed URL
   would be a dead link inside an evidence record). The pre-existing
   `signed_document_url` is deliberately left EMPTY for backward compatibility
   rather than repurposed. Access goes only through `downloadRecoverContract`,
   which proves ownership and then mints a short-lived signed URL.

5. **Integrity before "generated".** The uploaded bytes are re-read and their
   SHA-256 confirmed before `contract_pdf_status` becomes `generated`. A
   correction never overwrites `contract_pdf_sha256`.

6. **Durability without a queue.** Generation is invoked fire-and-forget from
   `acceptRecoverMandate`, but `contract_pdf_pending` is set BEFORE any attempt,
   so a lost invocation stays discoverable. The scheduled
   `retryPendingRecoverContracts` reconciler (every 15 minutes) is the actual
   guarantee; `generating` / `sending` carry a lease timestamp so a worker still
   legitimately running is never duplicated.

7. **Email never precedes the document.** `contract_email_status` starts at
   `not_ready` and moves to `pending` only once the PDF is stored and verified.
   Delivery uses a download link, not an attachment: the platform's send
   integration does not support attachments. `signed_by_email` — and only that —
   is the recipient.

8. **Idempotency.** `contract_delivery_idempotency_key` is derived server-side
   from (mandate, pdf hash, recipient, template version, language). Only an
   explicit, logged admin resend may produce a second copy.

9. **Error codes are normalized** (`storage_unavailable`, `pdf_build_failed`,
   `legal_identity_missing`, …) — never raw provider messages or stack traces, so
   they are safe to render in the admin panel.

## Configuration

`CAMBRA_LEGAL_IDENTITY_JSON` — CAMBRA's own contractual identity (legal name,
company number, registered address, VAT). No structured record for it existed
anywhere in the app, and inventing one in code would put an unverified legal
identity on a binding document; hence a secret. When it is absent or not valid
JSON, generation fails PERMANENTLY with `legal_identity_missing` instead of
emitting a contract with a placeholder party.

## Open

- `CAMBRA_LEGAL_IDENTITY_JSON` was rejected as `invalid_json` on first run
  (2026-08-03) — the positive end-to-end render is blocked until it holds real
  JSON.
- Mandate text remains English-only until legal review approves translations
  (the PDF template already carries the FR/ES structure).