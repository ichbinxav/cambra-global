# Contract Policy Resolution (v60.1, 2026-08-05)

How the canonical product policy connects to the real economic flows of CAMBRA.
Full guide: `src/docs/PRODUCT_POLICY.md`. Status: `src/docs/OPERATIONS_STATUS.md`.

---

## Principle

The policy in force **today** creates new obligations only. Once a merchant
accepts Recover, their economic terms are **frozen** in a snapshot. Every later
operation reads from that snapshot, never from the live policy. A future policy
version cannot recalculate a historical obligation.

---

## Resolution diagram

```
NEW ACCEPTANCE
  ↓
config/product-policy.json
  → generated/productPolicy.ts  (backend)
  → generated/productPolicy.js  (frontend)
  ↓
buildContractPolicySnapshot({ currentPolicy, contractContext, authorisedOverride })
  ↓
acceptance_snapshot_json  (on Mandate, enriched with policy_version, standard_fee_pct,
                           merchant_share_pct, fee_duration_months, fee_base,
                           template_version, referral terms)
  ↓
hashSnapshot(snapshot) → acceptance_snapshot_hash  (deterministic SHA-256)
  ↓
Mandate.status: acceptance_started → active
  ↓
┌─────────────────────────────────────────────────┐
│  BillingRule  ← referralBilling (policy_version) │
│  MonthlySavingsReport  ← effective_fee_pct         │
│  Invoice  ← billing_snapshot_json                 │
│  PDF  ← acceptance_snapshot_json                  │
│  Email  ← acceptance_snapshot_json                │
│  Referral  ← referralProgram (generated ladder)    │
└─────────────────────────────────────────────────┘
```

```
LEGACY (pre-registry)
  ↓
Mandate.acceptance_snapshot_json  (old shape: fee_pct, baseline, no policy_version)
  ↓
resolveLegacyContractTerms(record)
  ↓
reads fee_pct OR node_share_percent OR effective_fee_pct
  ↓
marks policySource = "legacy_pre_policy_registry"
emits warning
does NOT invent policyVersion
does NOT change amounts
```

---

## Precedence (strict)

`resolveContractPolicy({ mandate, billingRule, report, invoice })`:

1. **Mandate snapshot** with `policy_version` → snapshot wins.
2. **BillingRule** (contractual fee, optionally with `policy_version`).
3. **MonthlySavingsReport** (`effective_fee_pct` already persisted).
4. **Legacy fallback** (explicit, marked, never silent).

The **live policy** is used ONLY for new acceptances that have not yet been
signed. It is never used to bill, invoice, or render a document for a contract
that has already been accepted.

---

## Snapshot schema

Defined in `base44/shared/contractPolicySnapshot.ts` (`ContractPolicySnapshot`):

```
snapshotSchemaVersion: 1
policyVersion, policyEffectiveDate, policySource, currency
economicTerms: { analyzerPriceEur, successFeeRate, successFeePct,
                merchantShareRate, merchantSharePct, feeDurationMonths,
                feeBase, recoveryOptional }
referralTerms: { startRate, stepRate, floorRate }
productScope: { payments }
integrationStatusAtAcceptance: { stripe }
contract: { templateVersion, documentVersion, country, mandateId, brandId }
overrides: { hasOverride, fields, reason, authorisedBy, authorisedAt }
```

- JSON-serializable, deterministic, validated, no secrets, no tokens, no card
  data, no Stripe payload. Tenant-safe (stored on Mandate, RLS-gated).
- Immutable after acceptance. Any correction follows the existing legal
  mechanism (void / credit note / corrective invoice), never a direct edit.
- Hash-compatible: `canonicalStringify` + SHA-256, same algorithm as
  `recoverAcceptance.hashSnapshot`.

---

## Overrides

An override is a backend-authorised deviation from the standard terms (e.g. a
negotiated rate). It is recorded INSIDE the snapshot under `overrides`, with
`reason`, `authorisedBy` and `authorisedAt`. The frontend may never supply or
modify it — `rejectClientTerms(payload)` guards the acceptance endpoints.

When an override exists, the resolver reports `hasOverride: true` and the
override's terms prevail over the policy standard.

---

## Idempotency

- `startRecoverAcceptance` claims `(activation, owner, terms hash)` before any
  write. Re-opening the popup returns the SAME mandate row.
- `acceptRecoverMandate` re-verifies the hash at signature. If the fee or
  baseline changed mid-popup, the acceptance is REFUSED (not silently rebound).
- Re-accepting an already-active mandate returns the existing snapshot — it is
  never reconstructed from the live policy.
- Retry after timeout produces the same hash (deterministic serialization).

---

## What the snapshot feeds

| Consumer | Field read | Source |
|---|---|---|
| PDF (`recoverContractPdf.ts`) | `snapshot.fee_pct`, `snapshot.standard_fee_pct` | `acceptance_snapshot_json` |
| Email (`sendRecoverContractEmail`) | `snapshot.fee_pct` | `acceptance_snapshot_json` |
| BillingRule | `node_share_percent` | referralBilling → generated ladder |
| MonthlySavingsReport | `effective_fee_pct` | billingFee → BillingRule |
| Invoice | `billing_snapshot_json` | report + tax engine |
| Referral | `feeForActivated(count)` | referralProgram → generated ladder |

---

## What never changes

- Success fee 25%, merchant share 75%, duration 24 months, Analyzer €0.
- Referral ladder 25/5/5.
- Rounding, basis, monthly math, eligible saving, tax, invoice timing,
  recognition, reconciliation.
- Historical mandates, invoices, PDFs, emails.
- RLS, tenant isolation, permissions, safeRedirect, SEO, Help Center.

---

## Owner

CAMBRA product + legal. Last review: 2026-08-05 (v60.1).