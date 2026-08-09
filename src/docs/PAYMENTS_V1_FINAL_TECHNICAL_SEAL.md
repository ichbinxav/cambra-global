# CAMBRA Payments V1 — Final Technical Seal

**Release:** v0.70.0  
**Date:** 2026-08-09  
**ECL stage:** `ECL_P8_PRODUCTION_ADMIN_AUTOMATION_AI_OPERATIONS` (unchanged)  
**Scope:** Payments V1 only. No Utilities / Logistics / Software / Benefits expansion.

## Purpose

This release is a closure/hardening release, not a feature expansion. It preserves the versioned Recover V2 economics and existing contractual snapshots while reducing launch risk at trust boundaries, runtime operations and public product claims.

## Closure changes

- Sensitive contractual/economic/derived entities are server/admin-write only: DealActivation, Mandate, SavingsEvidence, MigrationTask, ReferralLink, Invoice, Baseline and BillingRule. Merchant read access needed by product UX remains scoped by RLS.
- Recover context and commitments derive their fallback fee from generated Product Policy; there is no hardcoded `fallbackPct: 25` on those paths.
- `processUploadedFile` accepts only HTTPS `media.base44.com` storage URLs, refuses redirects and returns generic runtime errors. This closes the documented client-controlled `file_url` SSRF boundary.
- The Stripe disconnect path now has a valid service-role/timestamp scope and marks active Recoveries `verification_access_status=missing`; disconnection never creates estimated billing authority.
- `recoverBillingDigest` is admin/internal gated, has a versioned weekly Base44 automation, surfaces bounded-query truncation, and does not expose internal runtime errors.
- Admin Command Center reports degraded source reads instead of turning read failures into false zero/healthy states.
- Public illustrative testimonials and invented savings claims are removed from the live landing/nav/SEO surface. Historical placeholder components remain dormant only.
- Critical scheduled-worker configs explicitly bind `function_name` and `starts_at`. Runtime proof exists for the Webhook DLQ and ECL lifecycle workers. As of seal preparation, no `AgentTask` runtime proof has yet been observed for `ecl_production_health` or `recover_billing_reconciler`; this is a deployment/runtime condition, not claimed as verified.
- Release generation fails closed with manual requirements while Recover V2 legal wording is unapproved and while Stripe live verification is not explicitly `live_verified`.

## Money and jurisdiction invariants

- Recover V2: 25% months 1–12; 15% months 13–24; 0% after month 24; referrals reduce the applicable fee by 5 percentage points with a 5% floor during the Recovery Term only.
- Positive Verified Savings only. Estimates do not create debt.
- Existing accepted Recoveries preserve their original contractual snapshot.
- Invoicing is EUR-only. A non-EUR report blocks with currency mismatch rather than being converted or guessed.
- Recover billing supports FR/ES only; unsupported billing jurisdictions fail closed in the tax decision.
- Cancellation of CAMBRA service is separated from an activated Recover economic term, subject to its valid contract, attributable savings and verification.

## Production migration/order

1. Deploy schema/RLS and backend/frontend source together through the normal Base44 app deployment path.
2. Do not rewrite or backfill historical Mandate acceptance snapshots.
3. Existing rows are preserved; this release performs no destructive data migration.
4. Confirm the four critical Base44 automations are materially registered after deployment; verify recent `AgentTask` proof for each.
5. Complete a real Stripe live-account connect → sync → verified analysis proof before changing integration status to `live_verified`.
6. Obtain external legal approval of Recover V2 wording before setting `recoverEconomicsV2LegalApproved=true`.
7. Re-run the complete release evidence/CI chain after either manual gate is cleared.

## Deliberate non-automation

Human economic approval remains deliberate where the existing architecture requires it. CAMBRA does not let AI approve evidence, alter accepted economics or create unsupported financial truth. Admin workflows exist for review/exception handling.

## Backups / retention

Base44 platform backup/restore guarantees are infrastructure capabilities outside this repo and are therefore not claimed here. Application records required for contracts, billing, evidence and active Recovery Terms are not deleted by service cancellation. Destructive financial history changes remain constrained by the existing canonical correction/credit/audit paths.
