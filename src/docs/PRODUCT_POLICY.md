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

## Backend consumption (deferred, gated)

The generated backend artifact `base44/shared/generated/productPolicy.ts` is in
place so the backend can import it with a one-line change. The existing backend
billing modules (`billingFee.ts`, `referralBilling.ts`, `recoverBillingMath.ts`)
currently carry their own `25` / `5` constants; the product-policy test suite
asserts **characterization parity** (their constants equal the registry) so
the two can never silently diverge. Rewiring those modules to import the
generated artifact is deferred until Recover billing has dedicated parity tests
(see STOP RULE in the v60 brief): the values are identical today, so the
wiring is a constant-source change, not a calculation change, and is safe to
land in a follow-up gated on billing tests.

## Rollback

To roll back a policy change, revert `config/product-policy.json` to the
previous version, run `npm run policy:generate`, and release. Historical
mandates/invoices are untouched because they never depended on the live JSON.

## Owner & last review

- Owner: CAMBRA product + legal.
- Last review: 2026-08-05 (v60 introduction).