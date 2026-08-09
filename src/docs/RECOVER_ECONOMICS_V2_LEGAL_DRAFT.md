# Recover Economics V2 — contractual draft

**Status: LEGAL REVIEW REQUIRED — NOT EFFECTIVE / NOT FOR ACCEPTANCE**

Policy version: `2026.08.09-recover-v2`. This draft is not wired into the live Terms surface and `recoverEconomicsV2LegalApproved=false` blocks new V2 acceptance server-side.

## Core economics
Each Recover that is expressly accepted and subsequently reaches evidenced conditions activation carries an independent Recovery Term of exactly 24 months from that activation date. CAMBRA's variable fee applies only to positive Verified Savings attributable to that Recover: 25% during months 1–12; 15% during months 13–24; 0% on and after expiry. Estimates do not create debt. If Verified Savings are zero or negative, CAMBRA's fee is zero.

Activated referrals reduce the fee applicable to the current phase by 5 percentage points each, effective prospectively under the existing referral rules, with an absolute floor of 5% while the Recovery Term is active. The floor does not apply after expiry, when the fee is 0%.

## Service termination / survival
Proposed clause: termination of the general CAMBRA platform or managed-service relationship does not, by itself, terminate an already activated Recovery Term. The surviving right is not a cancellation charge or fixed debt: it is only a right to the applicable percentage of positive Verified Savings that arise, are attributable to the Recover, and can be verified during the remaining Recovery Term.

## Verification after disconnection
Proposed clause: during an active Recovery Term, the Client must provide information reasonably necessary to verify savings, which may include continued read-only provider access, statements, PSP exports, invoices, accounting evidence or equivalent records. CAMBRA must not treat estimates as Verified Savings solely because evidence is unavailable. Alternative/manual evidence must be auditable and subject to the same verification controls.

## Attribution / overlap
The same saving may not be billed twice. A later Recover affecting the same provider/cost line requires explicit attribution, supersession or a new baseline before a second economic right can become active. Credits, refunds and corrections must be reconciled through corrective records rather than rewriting finalized invoices.

## Mandatory external legal review
Review and approve for France and Spain before enabling V2 acceptance: survival after termination; data-provision obligations and remedies for failure to provide data; payment authorization survival; attribution methodology; dispute process; governing law/jurisdiction; general-terms incorporation/transparency; enforceability and proportionality; treatment of termination/revocation; tax and invoicing consequences. Live wording must be finalized in EN/FR/ES and versioned before `recoverEconomicsV2LegalApproved` can become `true`.
