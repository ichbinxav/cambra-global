# CAMBRA Final Launch-Blocker Audit — 2026-08-10

This register is deliberately separate from historical decision logs. It classifies current launch readiness from the actual repository/runtime evidence available during the final autonomy pass.

## CLOSED / VERIFIED IN REPOSITORY

- Full-repo TypeScript baseline: 0 errors; critical perimeter: 0 errors.
- Dependency audit: 0 production vulnerabilities at moderate+ severity. Historical PostCSS / React Router / nanoid / socket.io-parser / DOMPurify advisories no longer reproduce in the installed dependency graph.
- Commercial sending: daily acquisition caps remain separate from reply volume; all-message burst ceilings now exist per sending profile (Outlook 12/min, Resend 30/min in current production data).
- Communication quality: central quality gate + regeneration; additional anti-generic language patterns; merchant acquisition now naturally prefers the free Analyzer as the evidence-first next step without claiming savings before analysis.
- Outlook connector: connected/active for xavi@cambra.global with Mail.ReadWrite, Mail.Send and Calendars.ReadWrite. During this audit there were 0 `outlook_inbound_unroutable` OperationalLog rows; maintenance now detects future orphan spikes.
- Provider contact resolution: merchant evidence → provider CRM/directory → Apollo → public research. If exhausted, CAMBRA creates a localized merchant information task rather than dead-ending or escalating directly to founder.
- Merchant fallback: durable state, owner/next-action/retry/escalation fields, multiple response semantics including “I don’t know”, provenance, provider-contact confidence, and allowlisted automatic workflow resume.
- Merchant/provider language: provider negotiation now inherits the merchant Brand locale (EN/FR/ES) instead of forcing English.
- Commercial activation: canonical cold-merchant path is `alwaysOnLeadDiscoveryWorker` + `outboundVolumeWorker`; legacy `autonomousCommercialWorker` is intentionally disabled to avoid duplicate Outlook/Resend merchant outreach. OutboundControl master/premium/volume switches are currently enabled and merchant/provider/partner policies are active.
- CI definition exists and executes npm ci → policy/clean → lint → critical/full TS → tests → build → release manifest → CI release check.

## INTENTIONAL / NON-LAUNCH-BLOCKING DEBT

- Two sync-check tests remain intentionally skipped for structural mirror drift only. Their semantics are independently covered by `paginators-dispatcher-parity.test.js` and `stripe-parity.test.js`; these skips must not be treated as untested behavior.
- A2 multi-user materialization debt remains low-risk under the current one-owner-per-brand operating model. Canonical merchant reads are brand-scoped; tenant access tripwires remain mandatory. Revisit before multi-user merchant workspaces become a product capability.
- Historical RLS `created_by` semantics on service-role-written entities remain a documented architecture limitation. Current production isolation relies on explicit backend ownership/brand filters plus tenant-guard static enforcement. This is not permission to add new direct frontend reads against those entities.
- Low-priority historical cleanup (old self-test/anonymous rows, old milestone git tag, dormant/deprecated candidates) is not a production money/security blocker and remains subject to retention/FK checks before deletion.
- Zettle FR public-price evidence can remain `verified:false`; the engine already exposes the wider uncertainty band rather than pretending verification.

## EXTERNAL / HUMAN LAUNCH CONDITIONS — NOT CLOSED BY CODE

1. Recover Economics V2 legal wording: `economicTerms.recoverEconomicsV2LegalApproved` is still false and the release manifest correctly blocks an unconditional launch seal.
2. P12 legal/privacy governance: retention/deletion, lawful basis, anonymized/cross-tenant derived intelligence policy requires explicit legal/privacy approval before relying on broadened derived-intelligence retention/use.
3. CAMBRA fiscal configuration: production must have a valid `CAMBRA_LEGAL_IDENTITY_JSON` including CAMBRA VAT ID and a tax-advisor-approved `RECOVER_TAX_CONFIG_JSON` (FR VAT regime/rate, ES reverse-charge approval, e-invoicing status and live Stripe tax-rate id where needed). The code fails closed when absent.
4. Stripe live proof: repository supports separate pinned live/test accounts and server-side verification, but product policy remains `implemented_live_verification_pending`. A real live-account connect/sync/verified-analysis proof is required before changing this status.
5. Real-world pilot proof: technical automation is not equivalent to proven commercial/economic autonomy. The first genuine merchants must complete the end-to-end path and populate the pilot-validation ledger.
6. Provider compensation: legal/tax/disclosure/competition review remains required per agreement before provider-side compensation can become production-active.
7. Real payment routing remains prohibited. P13 is shadow/simulation only until the separate PCI/PSD2/provider-contract/reliability/liability program is completed.
8. GitHub Actions remote-run evidence could not be retrieved from this environment: the local sandbox has no `gh` binary and the available remote token lacks Actions API permission (403). The workflow file is present and local equivalent verification can be run, but the final launch packet should include one real green GitHub Actions run on the final SHA.
9. Newly added hourly missing-information and always-on discovery schedules must be observed after deployment. At audit time the production `LeadReservoirSnapshot` table had no rows, so always-on discovery is code/configured but runtime execution is not yet evidenced.

## FINAL SEAL RULE

Do not state `CAMBRA GLOBAL — FINAL AUTONOMY SEAL: PASSED` while any external/human launch condition above that applies to the intended production scope remains open. Use `CONDITIONAL` and name the exact conditions.
