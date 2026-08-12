# CAMBRA v0.97.0 — Final Production Remediation

## Scope

v0.97.0 is a remediation and production-proof release. It does not widen the
Payments V1 product or create a second architecture. It closes repository debt,
makes the public promise easier to understand and preserves a strict separation
between verified source code and evidence that can only come from the live
runtime.

## Repository remediation

- The release toolchain is pinned to Node 24.19.0 and npm 11.17.0. A release
  generated with another version fails `toolchain:check` and `release:check`.
- The legacy always-true commercial-worker branch has been replaced with the
  existing Founder-controlled acquisition and premium-Outlook switches. Missing
  or disabled control state produces zero sends.
- Stripe Analyzer inputs are converted to EUR only from current, attributable
  reference FX snapshots. Original amount, currency, effective date and source
  provenance are retained. One missing, stale or conflicting required rate
  blocks the complete analysis; CAMBRA never assumes a 1:1 conversion.
- Retention actions use one versioned policy engine. Automated deletion or
  anonymization requires identifier-free execution evidence, while failures
  remain explicit for review.
- Verified outcomes can adjust lead scoring only through identifier-free,
  privacy-safe aggregates with both contributing sample sizes at or above 10.
  The bounded adjustment cannot bypass the existing lead-quality, email-quality
  or sending gates.
- The historical structural-parity skips are removed. Frontend and Base44
  paginator/Stripe-normalizer copies are checked directly.

## Public surface

The Landing, Analyzer, Results, How It Works and Pricing copy now uses native
English, French and Spanish customer language. The main journey is three steps:
show CAMBRA what you pay, see where margin goes and recover it only when the
figures support a change. A mid-page report preview is explicitly illustrative,
has a textual equivalent and cannot be mistaken for a customer result or a
promise.

Public pricing follows `config/product-policy.json`. While Recover Economics V2
is not legally approved, the website shows the approved standard model: CAMBRA
receives 25% of positive verified savings during the 24-month Recovery Term and
the merchant keeps 75%. The tiered 25%/15% wording is displayed only if its
legal-approval flag becomes true. The analysis does not commit a merchant to
Recover, and the site no longer promises cancellation terms that contradict the
Recovery Term.

## Stripe SDK decision

The release review found newer major Stripe packages, but v0.97.0 retains the
currently pinned Stripe 17.7.0 webhook integration and the aliased Stripe 14.25.0
payment-link integration. A major update is not accepted on package age alone:
it must pass the complete live connect, webhook, invoice and reconciliation
regression with the configured API versions. The current dependency graph has
zero known `npm audit` vulnerabilities; this decision must be revisited after
the live regression, not silently bypassed.

## Production-proof boundary

Repository tests, build output, hashes and a green remote workflow can prove the
source artifact. They cannot prove DNS, a secret, a live Stripe account, a real
worker cadence, a backup restore or a merchant outcome. `RELEASE.json` therefore
keeps `productionSealEligible=false` until all live requirements are closed.

Before the words **PRODUCTION SEALED / PASS** may be used, the exact final Git
SHA and source-tree identity must be deployed to Base44 and the following must be
observed in that runtime:

1. release version, Git SHA, source-tree hash and file count match the archive;
2. Stripe LIVE connect → sync → Analyzer → Recover → billing/reconciliation;
3. required workers execute at the configured cadence without duplicate runs;
4. Instantly/SuperSearch, sending profiles, DNS and suppression lifecycle pass;
5. Founder controls and GLOBAL EMERGENCY STOP pass stop and safe-resume drills;
6. backup/restore meets the stated RPO/RTO;
7. real redacted multilingual documents pass the extractor evaluation; and
8. one controlled merchant completes the Payments V1 golden path end to end.

If any item remains absent, the correct release classification is a reproducible
candidate with external production validation pending, never Production Sealed.
