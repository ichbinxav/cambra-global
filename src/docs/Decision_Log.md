# CAMBRA — Decision Log

Append-only log of strategic product & code decisions.
Order: most recent on top.

---

## 2026-07-09 — Fase 1.3 · Purga multi-vertical (payments-only)

Purged multi-vertical (shipping / SaaS / banking / insurance / telecom / HR) branches from all conserved files. Two large files (`scoreEngine.js`, `Results.jsx`) intentionally left untouched — marked FROZEN-UNTIL-CUTOVER, they will die whole when `/PaymentsAnalyzer` + `calculatePaymentsGap` + new results view ship.

**Files modified:**
- `src/pages/Testimonials.jsx` — 2 non-payments testimonials rewritten as payments/benchmarking (Marco Blanc, Luca Moretti). Header comment added: PLACEHOLDER testimonials.
- `src/pages/Pricing.jsx` — "SaaS savings 100% yours" column replaced by "Already at benchmark / You pay €0 / No gap, no fee — ever".
- `src/pages/HowItWorks.jsx` — 4-step narrative rewritten to reflect real funnel (anonymous first, Stripe after). Subtitle now "structured payments audit".
- `src/components/copilot/CopilotObservations.jsx` — 3 shipping/saas observations replaced by payments-tone.
- `src/components/results/IntelligencePanel.jsx` — shipping/saas metric reads + Row + action_key `view_deals_shipping` removed.
- `src/lib/copilotEngine.js` — shipping/saas removed from `JOURNEY_ORDER`, `JOURNEY_META`, `buildJourney`, `getMissingData`, `buildGuidance`, `getCopilotState` (Promise.all `-2` entities), `summary`.
- `src/pages/Onboarding.jsx` + `src/components/onboarding/OnboardingLayout.jsx` — Logistics + Commerce SaaS tabs removed; hero copy retuned to payments-only.
- `src/components/onboarding/SaasModule.jsx` **deleted**.
- `src/components/onboarding/ShippingModule.jsx` **deleted**.

**Testimonials placeholder policy:**
Testimonials in `src/pages/Testimonials.jsx` are illustrative only. Must be replaced with real customer quotes before public launch, investor demo, or fundraising round.

**Frozen-until-cutover (do NOT edit):**
- `src/lib/scoreEngine.js` — 647-line multi-vertical engine, dies whole at PaymentsAnalyzer cutover.
- `src/pages/Results.jsx` — 661-line consumer of scoreEngine, dies whole at cutover.
Any refactor of these two before the cutover is forbidden — the replacement (`calculatePaymentsGap` + new results view) is already planned.

**Dormant / orphan candidates (accumulated across Fase 1.2 + 1.3 — backend cleanup phase):**

Frontend pages (deprecated, redirect to `/`):
- `src/pages/UnlockSavings.jsx`
- `src/pages/RecoveryTracker.jsx`
- `src/pages/Network.jsx`
- `src/pages/Insights.jsx`
- `src/pages/InsightDetail.jsx`
- `src/pages/StripeAnalyzer.jsx`
- `src/pages/Snapshot.jsx`
- `src/pages/ForProviders.jsx`
- `src/pages/Developers.jsx`
- `src/pages/DevelopersMCP.jsx`

Backend functions (candidate orphans — verify before deletion):
- `computeVerticalStatus` — only called by PaymentsModule (`vertical: 'payments'`); still live for that read.
- `runShippingAgent` — no active caller after 1.3.
- `getOnboardingStatus` — still called by PaymentsModule; response now partially unread (`statuses.saas`/`statuses.shipping` no longer consumed).

Backend functions to KEEP:
- `mcpServer` — untouched, per user instruction.

Entities (candidate orphans — verify before schema removal):
- `SaaSProfile` — no frontend consumer after 1.3.
- `ShippingProfile` — no frontend consumer after 1.3.
- `PaymentsProfile` — STILL LIVE (used by PaymentsModule).

Frontend components (verified NOT orphan):
- `src/components/onboarding/VerticalStatusBadge.jsx` — used by PaymentsModule (`<VerticalStatusBadge status={status} />`), keep.

---

## 2026-07-09 — Fase 1.2 · Purga rutas pre-pivot

Deprecated 11 pre-pivot / multi-vertical routes via redirect-to-home. See prior conversation for full list. All entering links swept. `sitemap.xml` and `robots.txt` (`base44/functions/sitemap/entry.ts`) cleaned of deprecated paths. `mcpServer` backend function intentionally left untouched.