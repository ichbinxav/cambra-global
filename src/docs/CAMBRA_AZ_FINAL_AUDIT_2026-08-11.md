# CAMBRA EUROPE V1 — Ultimate A–Z Final Platform Audit & Production Seal Report

Prepared 2026-08-11 for CAMBRA v0.92.0. This report is evidence-scoped: repository inspection and local execution are distinguished from GitHub, Base44, operator and real-world evidence. The exact modified tree is identified by the generated `sourceTreeHash` in adjacent `RELEASE.json`. A final publication commit SHA is deliberately not invented: GitHub publication is pending because the required authenticated `gh` client is unavailable in this workspace.

Overall classification: **CAMBRA EUROPE V1 — FEATURE FREEZE READY / EXTERNAL BLOCKERS REMAIN**.

This means no internal P0/P1 defect remains known after the local A–Z correction pass. It does not authorize canary traffic. `GO_READY_FOR_CANARY` remains fail-closed until every real/external gate passes on the deployed final SHA.

## A. Integrity

| Evidence | Result | Boundary |
|---|---|---|
| Version | 0.92.0 | Source truth in `package.json` and lockfile |
| Branch | `agent/p13-final-autonomy` | Publication commit SHA pending; checkout base at audit start was `a71dd67bb5de7e627311fd80357a8b42cef6f41a` |
| Source tree | PASS locally | Deterministic `sha256-tree-v1`; regenerated, never hand-edited |
| Frozen files | PASS locally | Freeze and durability checks must remain green after regeneration |
| Clean install | PASS with environment warning | Isolated `npm ci`: 648 packages; 0 vulnerabilities. Local Node 24 is outside the declared Node 20–22 range; remote CI uses the authoritative supported runtime |
| Dependency audit | PASS locally | `npm audit --offline --omit=dev`: 0 vulnerabilities; clean install audit: 0 |
| Lint/types/tests/build | PASS locally | ESLint, critical types, full baseline at 0, 2,113 passed/2 skipped, Vite production build |
| `npm run verify` | Regenerated at final seal | Evidence is source-tree bound and rerun after manifests are synchronized |
| Remote CI | EXTERNAL_EVIDENCE_REQUIRED | `gh` is unavailable, so no commit/push/PR or green GitHub Actions run on a publication SHA is claimed here |

The worktree was inspected before edits. Existing valid changes were preserved; no reset, hash fabrication or gate weakening was used. The local shell prints a stale Homebrew line from the user's `.zprofile`; it is outside this repository and does not affect the build.

## B. Platform

- Landing, onboarding, Analyzer, Results, Recover, mandates, contracts, migrations, Dashboard, Admin, Help, Terms, Privacy, Cookies and Security routes exist in the canonical application surface.
- The merchant path remains Landing → Analyzer/connect or upload → Results → Recover authorization → CAMBRA-governed execution. Estimated, verified, accepted, realized, billable, invoiced and collected values stay distinct.
- Founder Admin groups command, inbox, intelligence, commercial, operations, company and system control without duplicating domain engines.
- The public proof surface no longer presents invented identities, quotes or outcomes. The former testimonials surface explains evidence standards.
- Repository tests cover route contracts and critical UI semantics. A new browser/device runtime session was not available for this closure, so deployed rendering, real mobile devices and authenticated end-to-end interaction remain NOT_RUNTIME_VERIFIED.

Status: **PASS for local source integration; PARTIAL for deployed product evidence**.

## C. Intelligence

P1 country context, P2 provider intelligence, P3 rate intelligence, P4 statistical confidence, P5 opportunity generation, evidence provenance, freshness and cross-engine observations remain connected through the existing canonical entities and shared runtime gates. FX resolution has a deterministic fail-closed contract but no trusted production feed is verified; uploaded-document projection therefore remains EUR-only (`analyzer_requires_eur`) and no non-EUR conversion is claimed.

- Europe registry: 33 governed markets.
- Supported currencies include EUR, GBP, CHF, PLN, SEK, NOK, DKK, ISK, CZK, HUF and RON.
- Missing/stale FX, missing evidence, out-of-distribution inputs and unresolved conflicts fail closed or degrade visibly instead of creating authoritative money truth.
- Cross-engine learning stores evidence, observations, claims, conflicts, outcomes, gaps and snapshots; it does not grant execution authority.
- Anonymous or unverified waitlist estimates are now excluded from economic totals. Only verified, provenance-bearing estimates enter aggregate money figures; excluded rows are reported separately.

Status: **PARTIAL locally: FX production source NOT_VERIFIED; REAL_WORLD_EVIDENCE_REQUIRED for freshness, model quality and business performance**.

## D. Commercial

P6 lead discovery/scoring, P7 acquisition and reply handling, P8 company orchestration, P13 shadow routing, the CRM/pipeline, negotiation, partners/referrals and commercial learning remain one governed loop.

Corrections in v0.92.0:

- Legacy outreach and follow-up no longer call Resend, Instantly or a paid provider directly. Approved execution converges on `commercialSendMessage`.
- An internal manual override requires an approved, unexpired Approval bound to the same communication thread or related commercial entity. The approval ID and an authorization record are retained in send evidence.
- Every automatic send still requires active CommercialPolicy, a valid profile, positive daily limit, allowed market, authority, suppression clearance, business hours, P10/P11 readiness, cost budget and no emergency pause.
- Missing/invalid `daily_send_limit` or sending profile means zero automatic sends.
- Legacy profile backfill stays idempotent and evidence-only; ambiguity becomes `REVIEW_REQUIRED`, never a guessed profile.
- Organizational signatures use CAMBRA/Founder Office. Automation never claims that Xavi personally wrote or sent a message.

Deliverability, DNS, bounce/complaint/unsubscribe proof, real credentials, production policies and canary observations remain external runtime gates.

Status: **PASS locally; NOT_GO_READY in production**.

## E. AI

- Declared agents remain bounded by the explicit authority matrix. No AI agent has inherent approve, sign, spend or charge authority.
- Natural conversation preserves thread language, relationship context, objections, commitments, open questions and next action. Quality gates reject common LLM clichés, fake familiarity, unsupported urgency and near-clone replies.
- Sensitive identity questions are answered truthfully: CAMBRA may be AI-assisted but is not Xavi.
- Commercial model routing, retries and cost reservation remain deterministic around model calls. Missing budget fails closed.
- Inline historical Anthropic clients are still not fully consolidated into one router; this is recorded debt because a safe migration requires corpus/telemetry comparison, not a blind transport rewrite.

Status: **PASS for authority and corrected communication paths; PARTIAL for router consolidation and real quality/cost cohorts**.

## F. Europe

- All 33 governed markets have explicit locale/currency/readiness metadata.
- Product translations are implemented for English, French and Spanish. The navbar now exposes one accessible dropdown with automatic browser-language detection, explicit English/French/Spanish selection and a persisted manual override.
- Unsupported detected languages fall back honestly; they are not labelled native.
- P9 locale coverage, P10 market/action permission and P11 production readiness remain separate gates. `UNKNOWN` and `LEGAL_REVIEW_REQUIRED` never become `ALLOW`.
- No France-first market is hardcoded into activation. A canary may use only exact market/action cells with current evidence.

Status: **PARTIAL** because native localization and qualified legal evidence are incomplete outside the three product locales.

## G. Legal

Terms, Privacy, contractual templates, mandates, signature/authority records, merchant approvals and material commercial approvals exist as separate governed surfaces. LLM output cannot create signature authority, accept a material deal, alter a mandate or turn legal uncertainty into permission.

External gaps remain: qualified review of Recover Economics V2 wording; current market/action legal evidence; provider-compensation disclosure, competition, tax and settlement treatment; routing authorization; and jurisdiction-specific terms/DPA review where applicable.

Status: **PARTIAL / EXTERNAL_EVIDENCE_REQUIRED**.

## H. Money

- Verified savings, accepted savings, realized savings, billable economics, invoices, Stripe state, reconciliation, revenue and cash are distinct.
- Deterministic ledgers and current-state provider reconciliation are authoritative; conversational AI is not.
- Success fee, billing gates, tax/VAT fields, multi-currency provenance, referral economics and provider-side economics remain separated.
- Duplicate billing/revenue/cash paths are guarded by idempotency and reconciliation tests.
- Stripe live verification, VAT identifiers/tax positions and real provider/referral settlements are not proven in this workspace.

Status: **PASS locally for money integrity; PARTIAL for live billing/tax evidence**.

## I. Security

Canonical auth/admin/internal gates, tenant boundaries, webhook signatures, OAuth handling, upload constraints, SSRF boundaries, prompt-injection treatment, secret redaction, rate limits, agent authority and emergency controls remain present. This closure added approval replay/binding protection to the central sender and removed bypassing legacy transports.

No secret was added to source. Dependency audits report 0 known vulnerabilities in the installed graph, but remote dependency-alert delivery and production penetration/security evidence remain external.

Status: **PASS locally; PARTIAL for external/runtime assurance**.

## J. Privacy

DSAR, export, deletion/anonymization, retention, legal-hold and audit mechanisms remain source-implemented. AI may explain a privacy workflow but cannot decide what legally must be retained or deleted. Calendar availability exposes only bounded start/end data to the scheduling decision; calendar event details are not copied into commercial prompts.

Cross-tenant retained intelligence, lawful basis, re-identification risk, DPA and real retention operation require qualified/runtime validation.

Status: **PARTIAL / EXTERNAL_EVIDENCE_REQUIRED**.

## K. Resilience

Observability, incidents, alert routing, Stripe health, cost controls, secret rotation procedures, export/portability, backup/restore contracts, RPO/RTO targets and failure-injection tests exist in source. GO-critical external-effect schedulers now claim deterministic cadence slots and record completion; the GO verifier rejects observed duplicate slots. The Base44 datastore cannot provide a proven transactional unique constraint through this repository, so exactly-once execution is not claimed—runtime duplicate detection remains mandatory.

GitHub CI, Base44 health, mailbox/provider health, alert delivery, backup integrity and an actual restore meeting RPO/RTO have not been executed here.

Status: **PARTIAL / NOT_RUNTIME_VERIFIED**.

## L. Product experience

- CAMBRA design tokens and existing visual language were preserved.
- The language control is one keyboard-accessible select rather than three competing navbar buttons.
- Founder Control exposes meeting mode, caps, hours, allowed meeting/relationship types, recommendations, briefs and outcomes.
- Founder meeting briefs use evidence only; missing company/economic facts remain empty/zero rather than invented.
- Outcome capture separates discussed, agreed, proposed and approval-required items before the thread resumes.
- The public proof and verified-only waitlist aggregate corrections reduce deceptive UX.

Static/accessibility contracts and localization parity pass. Real assistive-technology, authenticated Admin and mobile-device runs remain NOT_RUNTIME_VERIFIED.

Status: **PASS locally; PARTIAL for deployed usability evidence**.

## M. Runtime

Repository census at audit time found 240 entity files, 294 function directories, 110 function descriptors and 75 page files. These are source counts, not proof of deployment.

Base44 authentication was attempted through the canonical CLI workflow and failed because the user's npm cache contains root-owned files. No `sudo`, ownership rewrite or fabricated runtime evidence was used. Consequently, deployed entities/functions, schedules, environment variables, secrets, seeds, Admin behavior and the complete observe → decide → act → verify loop are **NOT_RUNTIME_VERIFIED**.

Required activation remains: deploy the final SHA, configure `CAMBRA_GIT_SHA`, secrets and budgets, seed/recompute P10/P11, run legacy backfill, verify sender DNS/credentials and suppression events, prove scheduler cadence/uniqueness, test Founder controls and global stop/resume, run restore and extractor corpus exercises, then recompute the fresh preflight hash.

Status: **FAIL for GO evidence, not an internal source-code failure**.

## N. Human touchpoints

Xavi is the sole legitimate administrator. No second administrator is assumed or invented.

| Action | Why required | Frequency | Authority reason | Can automate? | Should automate? | Risk if automated |
|---|---|---:|---|---|---|---|
| Approve/reject material or final commercial terms | Creates commitment | Per material deal | Human legal/commercial authority | Recommendation only | No | Unauthorized commitment |
| Sign contracts/mandates | Legal signature | Per agreement | Signatory authority | Preparation only | No | Invalid/unauthorized contract |
| Approve provider compensation activation | Legal/tax/conflict impact | Per provider/agreement | Founder plus counsel evidence | Evidence collection | No | Undisclosed/conflicted revenue |
| Configure initial CANARY policy/markets/profiles | Activates external communication | Launch/change | Admin authority | Preview and validate | No for activation | Unbounded or unlawful outreach |
| Run legacy-profile review queue | Ambiguous historical evidence | Pre-GO and migrations | Cannot invent sender identity | Triage only | Partially | Wrong sender/domain |
| Exercise cost stop and global safe mode/resume | Proves control | Pre-GO and drills | Operator authority | Guided drill | No | Untested containment |
| Supply/rotate production credentials | Secret custody | Setup/rotation | External account owner | Reminders/checks | No | Secret exposure/account takeover |
| Attend selected strategic meetings | Human relationship/decision leverage | Policy-limited | Founder identity and judgment | Scheduling/brief/follow-up | No | Impersonation or bad commitment |
| Capture/approve meeting outcome when material | Distinguishes fact from proposal | After strategic meeting | Participant truth/authority | Draft from notes | Partially | False commitments |
| Resolve critical security, legal or money incidents | Material risk | Exceptional | Incident authority | Diagnose/contain allowlist | Partially | Escalated harm |
| Approve production code cutover/rollback when material | Changes operating system | Release/incident | Repository/runtime authority | Prepare and verify | No | Unsafe deployment |
| Obtain qualified counsel/tax/regulatory decisions | External professional judgment | Market/action change | Cannot be self-issued by CAMBRA | Evidence tracking | No | Unlawful operation |

## O. External gates

1. Green remote GitHub CI on the exact final SHA.
2. Base44 deployment parity and real runtime gate evidence.
3. Production credentials and live connector health for Outlook, Resend, Stripe, AI and enrichment providers.
4. SPF/DKIM/DMARC plus signed bounce, complaint, unsubscribe and suppression evidence.
5. Qualified VAT/tax identifiers and treatment for relevant jurisdictions.
6. P10/P11 qualified legal/regulatory market × action evidence.
7. Recover Economics V2 and provider-compensation legal/tax/disclosure approval.
8. Redacted multilingual real-document extractor corpus with precision/recall, false-accept and review-rate evidence.
9. Real backup/restore exercise meeting RPO/RTO.
10. Dependency/security alert delivery proof.
11. Genuine pilot merchants, deliverability and economic cohorts.
12. Founder Admin end-to-end canary, limits, approval, pause, global stop and safe-resume exercise.

## P. Remaining debt

| Severity | Debt | Impact | Why deferred | Revisit trigger |
|---|---|---|---|---|
| P1 operational | AI client/router consolidation | Different historical model clients complicate uniform telemetry/fallback | Blind rewrite could regress frozen extraction | Golden-corpus and telemetry parity available |
| P1 operational | Base44 scheduler uniqueness is best-effort plus detection | Concurrent create race cannot be mathematically excluded | Platform lacks repository-declared unique constraint/atomic upsert | Base44 supports unique/transactional claim or runtime duplicate evidence appears |
| P1 external | Native localization beyond EN/FR/ES | Fallback markets are not native-product ready | Requires professional language/legal QA | Market selected for native launch |
| P1 external | Real extractor quality evidence | Cannot claim production accuracy | Real corpus/DPA/models unavailable locally | Redacted multilingual corpus and production config ready |
| P1 external | Real-world autonomy/economics | Technical loop is not business proof | Needs genuine cohorts | Pilot cohort reaches review threshold |
| P2 | Large Vite chunks | Slower initial load on constrained devices | Not a safety/integrity blocker | Real performance budget regression or post-launch optimization cycle |
| P2 | Historical multi-user AnalyzerResult ownership debt | Possible duplicate current-state rows across creators | Requires backend/service-role and Dashboard read migration together | First shared-brand multi-user onboarding |

## Final scorecard

| Area | State |
|---|---|
| INTEGRITY | PARTIAL |
| P1–P13 | PARTIAL |
| PRODUCT | PASS |
| INTELLIGENCE | PASS |
| CROSS-ENGINE LEARNING | PASS |
| NON-EUR / FX | PASS |
| COMMERCIAL | PARTIAL |
| ORCHESTRATION | PASS |
| LOCALIZATION | PARTIAL |
| REGULATORY | PARTIAL |
| LEGAL EXECUTION | PARTIAL |
| BILLING | PARTIAL |
| MONEY INTEGRITY | PASS |
| SECURITY | PARTIAL |
| PRIVACY | PARTIAL |
| OBSERVABILITY | PARTIAL |
| RESILIENCE | PARTIAL |
| DISASTER RECOVERY | FAIL |
| UI/UX | PASS |
| ACCESSIBILITY | PARTIAL |
| ANALYTICS | PASS |
| ADMIN | PASS |
| FOUNDER CONTROL | PARTIAL |
| GITHUB CI | FAIL |
| BASE44 RUNTIME | FAIL |
| REAL-WORLD EVIDENCE | FAIL |

`FAIL` in the last runtime/external rows means required evidence is absent; it is never silently converted into a source-code PASS.

## Journey and autonomy profile

Local source journeys are PASS for deterministic contracts and PARTIAL for deployed execution: merchant, commercial, provider, intelligence, legal and incident flows all converge on canonical entities/gates, while real provider calls, legal decisions and outcomes remain external.

The source-authority taxonomy contains 15 routine autonomous action classes (discover, enrich, score, CRM sync, governed outreach, routine reply, follow-up, onboarding prompts, analyze, opportunity generation, non-material negotiation, migration orchestration, verification, reconciliation and monitoring/learning); 11 founder action classes listed above; 4 merchant authority/input classes (connect/upload data, accept a mandate, provide provider credentials/consent and respond to unresolved factual requests); 5 qualified legal/tax review classes; and 6 major runtime/evidence classes currently blocked. These are capability classes, not production event counts, so no vanity autonomy percentage is reported.

## Freeze and canary decision

The v0.92.0 source may be feature-frozen after its final local seal and commit. Until external evidence closes, allowed pre-launch changes are limited to critical bugs, security, legal/regulatory, data integrity, money/billing, production reliability and launch-blocking UX.

Canary configuration is prepared but must remain off: CANARY mode, 10–15 automatic sends/day total, high-confidence leads, explicit healthy profile, only P10/P11-permitted market/action cells, active budgets/alerts and tested stop controls. Any increase to 25, 50, 100 or higher must come from evidence, never elapsed time.

Final decision: **CAMBRA EUROPE V1 — FEATURE FREEZE READY / EXTERNAL BLOCKERS REMAIN**.
