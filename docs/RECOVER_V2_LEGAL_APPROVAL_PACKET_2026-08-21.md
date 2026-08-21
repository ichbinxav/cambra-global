# Recover Economics V2 — legal approval packet

Status: **BLOCKED — qualified external legal approval required**  
Prepared: 2026-08-21  
Policy candidate: `2026.08.09-recover-v2`

This packet makes the remaining decision auditable. It is not legal approval,
does not activate V2, and must not be used to set
`recoverEconomicsV2LegalApproved=true` without the completed evidence below.

## Frozen source identity

| Artifact | SHA-256 |
|---|---|
| `src/docs/RECOVER_ECONOMICS_V2_LEGAL_DRAFT.md` | `d1be4a6c9dc0905dc9637df081ef9cfb6787b5f719590a408a75341af3857e5a` |
| `config/product-policy.json` | `d02d9f86d24cd9adc621e874cea823c7097c533ebcd55ace0c6d020249631945` |
| `src/content/legal/en/terms.js` | `7957f24d4a176841d975dbcd0666473d161585a162c8315e43d6ba948a9c0024` |
| `src/content/legal/fr/terms.js` | `ac24d37b5f476a415e6e9b0c8d74e507d9d4a18c42285595e0c85f3fd852fbfc` |
| `src/content/legal/es/terms.js` | `5147a932a9d2e3c5fc81c8fa3e73b9a7003a24077b9814b5a5b618626d728987` |

Recompute these hashes immediately before review. Any content change invalidates
the approval packet and requires a new review of the changed artifact.

## Economics to review

- Recovery Term: 24 months per expressly accepted and activated Recover.
- Fee base: positive Verified Savings attributable to that Recover only.
- Months 1–12: 25%; months 13–24: 15%; after expiry: 0%.
- Estimates never create debt; zero or negative Verified Savings produce a
  zero CAMBRA fee.
- Each activated referral reduces the current phase by five percentage points,
  prospectively, with a 5% floor only while the Recovery Term is active.
- No saving may be billed twice; overlap requires attribution, supersession, or
  a new baseline.

## Required counsel determinations

The written opinion must address France and Spain separately and state any
conditions or mandatory wording for:

- survival after termination of the general service;
- post-disconnection evidence/data obligations and proportional remedies;
- survival and revocability of payment authorization;
- Verified Savings attribution, overlap, corrections, and disputes;
- incorporation and transparency of the general terms;
- governing law, jurisdiction, consumer/SME qualification boundaries, and
  enforceability/proportionality;
- termination, mandate revocation, insolvency, and material breach;
- VAT, invoicing, credit notes, and other tax consequences;
- final EN, FR, and ES wording, including which language prevails.

## Evidence required before activation

- Counsel/firm legal name and jurisdiction(s) of qualification.
- Signed opinion reference and immutable document hash.
- Review date and exact source hashes reviewed.
- Decision per market: `APPROVED`, `APPROVED_WITH_CONDITIONS`, or `REJECTED`.
- Complete conditions, exclusions, merchant-eligibility limits, and required
  wording changes.
- Final versioned EN/FR/ES terms and their hashes.
- Named CAMBRA founder/legal approver acknowledging the opinion and final
  wording; approval timestamp and record ID.
- Regression evidence for server acceptance, frontend disclosure, versioned
  consent, cancellation/revocation, billing, and corrective invoice flows.

## Activation procedure

1. Apply counsel-required wording and regenerate all hashes.
2. Obtain written confirmation that the final hashes—not an earlier draft—are
   approved.
3. Record the opinion and founder/legal decision in the authoritative legal
   evidence store; never place confidential advice or personal data in Git.
4. Update the policy flag only in the same reviewed change that versions the
   final legal content and tests.
5. Run the full release gate and a non-production acceptance/billing canary.
6. Publish only after the release manifest no longer reports the legal gate and
   all other production gates remain satisfied.

Until every item is complete, the current fail-closed value
`recoverEconomicsV2LegalApproved=false` is correct and must remain unchanged.
