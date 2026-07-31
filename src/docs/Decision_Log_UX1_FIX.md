# Decision Log — MICRO-CHUNK UX-1-FIX (2026-07-31)

## T1 — Draft legal notice in the Collective modal: **KEPT (case b)**

The task offered two cases: (a) text legally approved → remove the draft
notice; (b) no completed legal review → keep the notice, never hide a real
legal warning for UX.

**Decision: case (b).** There is no evidence anywhere in the repo (decision
logs, LEGAL-1, TRUTH-1) that `coll_terms_body` received legal sign-off. The
project's own standing rule is to mark unverified clauses explicitly
([REVISIÓN JURÍDICA] convention). Therefore:

- `coll_terms_body` keeps its final DRAFT / BORRADOR / BROUILLON sentence in
  all three languages.
- The "Join the Collective" flow stays ENABLED **with the warning visible**
  (the notice itself is the safeguard: it states the text is not a binding
  contract until the reviewed final version).
- Removal is a one-line locale edit ×3 the day the lawyer signs off — track
  it as UX-1-FIX-T1-PENDING-LEGAL.

## T2 — Dedicated `contact_email` on PaymentsAnalysisSession: **DONE**

- New top-level `contact_email` field on the entity, documented as PII with
  its own retention policy (separable from engine inputs, as DATA-1 needs).
- `submitPaymentsAnalysis`: email removed from the `clean` object (single
  path) and from the combined `input_snapshot`; persisted as `contact_email`
  in both create calls.
- Readers audited: `getPaymentsGapTeaser` (allowlist never touched email —
  unchanged, still does NOT expose `contact_email`), `claimAnonPaymentsResult`
  (never read the email), `purgePaymentsAnalysisSessions` (row-level delete,
  field-agnostic). Zero references to `input_snapshot.email` remain in code.
- Historical rows (< 2026-07-31) carry the legacy `input_snapshot.email`;
  the 90-day TTL purge retires them naturally — no migration needed.

## T3 — Visible consent + privacy link next to the mandatory email: **DONE**

- New locale keys ×3 (`analyzer_email_privacy_note`,
  `analyzer_email_privacy_link`) rendered under the email input in
  PaymentsAnalyzer with a real link to `/Privacy`.
- **Marketing usage confirmation: NO.** Exhaustive check of every function
  that reads `PaymentsAnalysisSession` (teaser, claim, purge) and of the
  outreach/newsletter agents (Apollo/OutboundLead pipeline — a separate lead
  source): none consumes the analyzer email today. This is now a documented
  decision, not an absence of evidence: **the analyzer email is used for
  report delivery and internal lead context only; any marketing use requires
  a separate explicit opt-in checkbox with its own legal review.**
- No marketing consent checkbox added (out of scope by design).