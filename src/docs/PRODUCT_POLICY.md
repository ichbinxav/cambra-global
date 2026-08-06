# Product Policy Registry (v60)

The single source of truth for CAMBRA's economic terms, functional scope and
product-level parameters is **`config/product-policy.json`**. Frontend and
backend both derive from it through generated artifacts; no runtime code
hardcodes the values it governs.

## What this registry governs

- Analyzer price (free — €0).
- Standard success fee rate (25%) and merchant share (75%), and the invariant
  that they sum to 1.
- Economic duration (24 months).
- Fee base ("positive verified savings" — no positive verified saving, no fee).
- Recovery being optional (requires explicit authorization / mandate).
- Referral ladder: start 25%, step 5 points, floor 5% (floor never exceeds start).
- Product scope: `payments` is the only production-enabled, merchant-visible
  vertical; shipping, SaaS, insurance, telecom, energy, banking and financing
  are dormant (both flags false).
- Supported channels: online PSP and in-store TPV.
- Integration status (Stripe is `implemented_live_verification_pending`).

## What this registry does NOT govern

- Benchmarks, analysis results, provider rates.
- Variable tax rates / fiscal decisions (those live in the tax engine).
- Agent, partner or referral commissions that follow different logic.
- Financial scenarios, illustrative examples, negotiated per-account fees.
- Legal prose (Terms, mandates, contract templates). The registry feeds the
  **numbers** into versioned, localized templates; it does not generate the
  legal wording itself.

## Files

| File | Role |
|---|---|
| `config/product-policy.json` | **Canonical, human-edited.** The only file you change to evolve policy. |
| `src/lib/productPolicySchema.js` | Zod schema + `buildArtifacts()` (pure, deterministic). |
| `scripts/generate-product-policy.mjs` | Generator (`--check` for drift). |
| `src/lib/generated/productPolicy.js` | **Generated** frontend artifact (do not edit). |
| `base44/shared/generated/productPolicy.ts` | **Generated** backend artifact (do not edit, byte-identical to the frontend). |
| `src/lib/productPolicy.js` | Public helper facade imported by surfaces. |
| `src/lib/economicTerms.js` | Backward-compatible adapter (preserves the v59.1 API). |
| `src/lib/featureScope.js` | Backward-compatible adapter (preserves the v59.1 API). |

## Commands

```bash
npm run policy:generate   # validate + (re)write both artifacts
npm run policy:check      # validate + fail if artifacts drifted (no writes)
```

`policy:check` also runs inside `npm run verify` (before `typecheck`), and the
drift is additionally asserted by `src/lib/productPolicyDrift.test.js` inside the
normal `npm test` suite, so a CI run catches drift even without `verify`.

## How to change a policy

1. Edit **`config/product-policy.json`** only.
2. Bump `policyVersion` (e.g. `2026.09.01`) and set the new `effectiveDate`.
3. Run `npm run policy:check` to confirm the current drift, then
   `npm run policy:generate` to regenerate the artifacts.
4. Review the diff of the two generated files — it must reflect ONLY the
   intended policy change.
5. **Legal review** if the change touches fee, duration, merchant share, fee
   base or referral terms. The registry governs structured data; it does not
   replace legal review of the contractual prose.
6. Run `npm test` (the product-policy + drift tests enforce invariants).
7. Release. A `policyVersion` that is already effective must never be mutated
   in place — always move forward to a new version.

## Historical contracts are immutable

A new policy version governs **new acceptances** only. It must never recalculate
an already-accepted mandate, an issued invoice, or a generated contract PDF.

- The accepted terms live on the **Mandate** record:
  `acceptance_snapshot_json` (verbatim fee %, baseline, projected savings,
  document version), `acceptance_snapshot_hash`, `document_version`,
  `acceptance_started_at`.
- Invoices derive their fee from `MonthlySavingsReport.effective_fee_pct`,
  which is resolved from the BillingRule active for the measured month —
  itself created from the accepted Mandate snapshot. A future policy change
  does not flow backwards into historical reports/invoices.
- Contract PDFs and emails are built from `acceptance_snapshot_json`, not from
  the live registry.

## Legacy records

Mandates accepted before this registry existed carry no `policyVersion` inside
their snapshot. Their provenance is `legacy_pre_policy_registry`: the economic
terms are still recoverable from `acceptance_snapshot_json` (fee %, duration)
and `document_version`. No retroactive reconstruction is performed — we never
invent which version a historical merchant accepted.

## Backend consumption (v60.1 — wired)

The generated backend artifact `base44/shared/generated/productPolicy.ts` is
consumed by the economic backend:

- `billingFee.ts` imports `getSuccessFeePct()` for its fallback (no `25` literal).
- `referralProgram.ts` / `referralProgram.js` import `getReferralStartPct()` /
  `getReferralStepPct()` / `getReferralFloorPct()` (no `25/5/5` literals). The
  SYNC block remains verbatim between the two files; only the source of the
  constants changed (generated policy, not a literal).
- `recoverAcceptance.ts` enriches `acceptance_snapshot_json` with
  `policy_version`, `standard_fee_pct`, `merchant_share_pct`,
  `fee_duration_months`, `fee_base`, `template_version` from the generated
  policy.
- `recoverContractPdf.ts` derives the standard fee via `resolveContractPolicy`
  + `buildContractEconomicView` (v60.2/v61): a contractual fee of **0 is
  preserved** and an unresolvable contract **blocks** generation. There is no
  `|| getSuccessFeePct()` fallback in the document path — that pattern would
  silently replace an explicit 0% fee with the policy default.
- `startRecoverAcceptance` / `acceptRecoverMandate` import `getSuccessFeePct()`
  and `getFeeDurationMonths()` for fallbacks.
- `referralBilling.ts` stamps `policy_version` on new BillingRules.

The contract policy snapshot, resolver and legacy handler live in
`base44/shared/contractPolicySnapshot.ts`. See
`src/docs/CONTRACT_POLICY_RESOLUTION.md` for the full resolution diagram.

### What remains deferred

- `recoverBillingMath.ts` carries no standard-fee constant (it receives
  `effective_fee_pct` as a parameter), so no rewiring is needed there.
- ~~`generateMonthlySavingsReport` does not yet write `policy_version` /
  `snapshot_hash`~~ — RESOLVED in v60.2: the report generator persists the
  full contract-policy provenance (`policy_version`, `snapshot_hash`,
  `policy_source`, `mandate_id`, `billing_rule_id`, `applied_fee_pct`,
  `merchant_share_pct`, `fee_duration_months`, `resolution_warnings`,
  `generated_by`). See OPERATIONS_STATUS.md (current operating source).

## Rollback

To roll back a policy change, revert `config/product-policy.json` to the
previous version, run `npm run policy:generate`, and release. Historical
mandates/invoices are untouched because they never depended on the live JSON.

## Owner & last review

- Owner: CAMBRA product + legal.
- Last review: 2026-08-06 (v62.2 — corrected stale fee-fallback claim and the
  already-resolved report-provenance deferral; where this document contradicts
  `src/docs/OPERATIONS_STATUS.md`, OPERATIONS_STATUS wins).