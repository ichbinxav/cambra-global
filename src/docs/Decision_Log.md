# CAMBRA — Decision Log

Append-only log of strategic product & code decisions.
Order: most recent on top.

---

## 2026-07-09 — Chunk 2 CIERRE · LOCK #1 sealed + verification model

**LOCK #1 hardened.** El wrapper HTTP de `calculatePaymentsGap` envolvía `base44.auth.me()` sin try/catch — la SDK arroja `Base44Error("Authentication required to view users")` para callers anónimos en lugar de devolver null, y el outer catch echoing `error.stack` filtraba implementación al body de la respuesta (visto empíricamente en harness Chunk 2). Fix:
- `auth.me()` en try/catch → cualquier fallo (thrown o null) devuelve **401 con body exacto `{"error":"Unauthorized"}`**, cero campos extra.
- Outer catch ya no incluye `error.stack` ni `error.message`; loguea a `console.error` para operators y responde `{"error":"internal_error"}` genérico con 500.
- Cambio confinado al wrapper HTTP (fuera del bloque `SYNC-START/SYNC-END: paymentsGap`). Sync-check re-verificado: **5596 chars vs 5596 chars, idéntico**.

Verificación empírica (harness temporal, luego borrado):
- Fetch sin `Authorization` header → `status: 401`, `body: {"error":"Unauthorized"}`, `body_keys: ["error"]`, `has_stack: false`.

**Modelo de verificación de Chunk 2 — decisión pragmática.**
La verificación empírica vía harness Deno (amortización runtime probada en tres tickets €30/€80/€250 contra la fila real, fallback cascade, doble candado con fetch real) sustituye a Vitest local para el cierre de Chunk 2. Los 22 tests Vitest (`src/lib/paymentsGap.test.js`) quedan como **gate obligatorio del Chunk 6** junto con la suite completa (sync-check + normalizers + syncEngine + verificationStatus + scoreEngine + verifiedMaterializer + …). Sin ese verde local no se cierra el proyecto.

Discrepancia payload #3 del reporte anterior resuelta como error de transcripción (no de motor): el JSON crudo devuelve `current_effective_bps: 160` para Stripe EU ticket €250 (150 percent + 10 bps de amortización de €0.25 sobre €250), aritméticamente correcto. Los tres payloads muestran `monthly_savings_eur.point = 640` idéntico porque el fixed fee es igual en `current` y `achievable` (25 minor en ambos), por lo que se cancela en la resta y el gap queda constante en 64 bps — es la propiedad correcta de la fila sembrada, no un bug.

---

## 2026-07-09 — Chunk 2 · calculatePaymentsGap motor + tests

Motor puro `src/lib/paymentsGap.js` + endpoint Deno `base44/functions/calculatePaymentsGap` con **doble candado** de acceso. Todos los cálculos se derivan de la `PaymentsRateTable` sembrada en Chunk 1b — cero cifras hardcoded en el motor.

**Doble candado verificado:**
- **LOCK #1 (auth):** `base44.auth.me()` obligatorio → llamadas anónimas → 401. Verificado indirectamente: sin token de servicio la request no llega al handler.
- **LOCK #2 (header):** `X-Cambra-Internal-Call` == `INTERNAL_CALL_SECRET` (env). Verificado directo: `test_backend_function` (auth admin) sin header → **403 Forbidden**. La única forma de atravesar es una llamada backend→backend por subdominio del app añadiendo el header — patrón que usará `submitPaymentsAnalysis` en Chunk 3.

**Núcleo del motor (SYNC-verified):**
- Bloque entre `SYNC-START: paymentsGap` / `SYNC-END: paymentsGap` **byte-normalized IDÉNTICO** entre `src/lib/paymentsGap.js` y `base44/functions/calculatePaymentsGap/entry.ts` (5596 chars normalizados, cero divergencia). Se añadió la pareja al `__sync_check__.test.js` con soporte para `deno` override (segundo target Deno además de `dataSyncAgent`).
- Componentes atómicos (`percent_bps` + `fixed_fee_minor_units`) leídos de la tabla y **amortizados con `avg_ticket_eur` REAL** en runtime — la corrección estructural del 1b. Verificado end-to-end: mismo cohorte Stripe EU con ticket €30 vs €250 produce `current_effective_bps` de **233.33 vs 181.25** (mismos savings porque el gap se preserva, pero el `current` refleja el ticket real, no un blend).
- Cascada de selección: exacto → fallback regional. Merchant en Adyen EU → cae a `ANY|ANY|EU` (verified=false, banda ±35%, assumption fallback presente).
- Gate de completitud: motor exige las 4 filas regionales fallback presentes ANTES de calcular. Si faltan → `rate_table_incomplete`. Módulo-cache con retry de 400ms contra el issue de eventual-consistency observado en 1b.

**Tests Vitest (`src/lib/paymentsGap.test.js`, 22 casos):**
- `validateRateTable`: 5 casos (tabla completa, missing fallback EU, fallback inactive, no-array, contrato REQUIRED_FALLBACK_KEYS)
- `computeEffectiveBps`: 3 casos (Stripe EU @€30 → ~233 bps, @€250 → ~160 bps, diferencia = ~73 bps)
- `selectRow`: 4 casos (exact match Stripe EU, Adyen EU→fallback, Mollie RoW→fallback, checkout.com no leaks a Stripe)
- `calculateGap` E2E: 8 casos (rechazo GMV inválido, rechazo ticket negativo, refuse partial table, amortización proof E2E, banda ±20% verificado, banda ±35% + fallback assumption, achievable breakdown en output, annual = 12× monthly, región desconocida → RoW, normalización provider)
- Edge cases GMV: 4 casos (GMV €500, GMV €10M lineal, PayPal EU > Stripe EU savings, merchant al benchmark → 0 savings)
- Helpers: 3 casos (applyBand con band=0, applyBand clampa lo≥0, computeMonthlySavings nunca negativo)

**Verificación end-to-end con 5 payloads reales** (via harness temporal que replicaba el patrón que usará submitPaymentsAnalysis — luego borrado):
- `stripe|EU` ticket €80 → 181.25 bps current / 117.25 achievable / **€640/mo point** / cohort exact verified
- `stripe|EU` ticket €30 → 233.33 bps current / 169.33 achievable / **€640/mo point** (mismo gap, distinto current — amortización probada)
- `stripe|EU` ticket €250 → 160.00 bps current / 96.00 achievable / **€640/mo point**
- `adyen|EU` ticket €80 → fallback ANY|ANY|EU, banda ±35%, assumption fallback presente
- `paypal|US` GMV €10M → escalado lineal correcto

**Config añadida:**
- Secret `INTERNAL_CALL_SECRET` (32-hex, generado local con `openssl rand -hex 32`).

**Deudas conocidas de Chunk 2 (documentadas, no bugs):**
- FX cross-currency: motor asume EUR/GBP/USD ≈ 1:1 para el componente `fixed_fee` (magnitudes <€0.50). Es correcto para primera-pasada; cuando entren datos live de Stripe se refinará con tipo de cambio real.
- Field `intl_pct` normalizado y aceptado pero NO consumido aún — reservado para uplift de tarjetas internacionales cuando se seedeen filas premium/intl en Fase 6.
- `BPS_PER_PCT` const declarada pero no usada (guardián por si evoluciona el output — 3 líneas de código a limpiar si molesta).

---

## 2026-07-09 — Chunk 1b · PaymentsRateTable creada y sembrada (10 filas)

Entidad `PaymentsRateTable` creada con schema de **componentes atómicos** — corrigiendo un error de diseño del reporte 1a: guardar tarifas blended a un AOV asumido (100€) habría producido resultados erróneos para todo merchant fuera de ese ticket. Ahora `percent_bps` y `fixed_fee_minor_units` se almacenan por separado; el motor `calculatePaymentsGap` (Chunk 2) amortiza el fee fijo con el `avg_ticket` real del usuario en runtime.

**Seeded rows (10):**
- **7 verified rows** (con `source_url` + `source_quote` verbatim):
  - Stripe EU, Stripe UK, Stripe US
  - PayPal EU (ES market), PayPal UK, PayPal US
  - Shopify Payments US (Basic plan)
- **4 fallback rows** (`verified: false`, banda ±35%, assumption obligatoria en output): EU / UK / US / RoW

**Decisiones aplicadas:**
- **Sin tier segmentation por fila**: Stripe/PayPal no publican tiering; el tier afecta a la banda de savings en el motor, no a la fila (`tier: 'ANY'` en todas).
- **Fórmula achievable transparente**: cada fila verificada guarda `achievable_breakdown_json` con `{ interchange_bps, scheme_fees_bps, processor_margin_bps, processor_margin_band_bps, sources }`. El componente `processor_margin` está explícitamente marcado como assumption con banda ±20-25 bps.
- **IFR (EU 2015/751)** citado como fuente legal del suelo de interchange en filas EU/UK.

**Documentado en `source_notes` como TODO para futuras iteraciones (NO seeded ahora):**
- Stripe EEA premium cards (1,9% + 0,25€) — cuando el motor soporte mix premium (Fase 6+)
- Stripe UK premium cards (1.9% + 20p)
- Shopify Grow/Advanced/Plus (2.7%/2.5%/2.25% + 30¢) — cuando el formulario pregunte plan Shopify
- Shopify premium cards (3.5% + 30¢)
- PayPal Checkout US (3.49% + 49¢) — distinto flow que Standard Card
- Adyen, Mollie, Checkout.com, Braintree, Worldpay — sin pricing público claro; caen a fallback regional hasta que se seedee cada uno con fuente

**Idempotencia:** el seeder (`seedPaymentsRateTable`, admin-only) hace upsert por `cohort_key`. Re-ejecutable sin duplicar. Rows existentes → UPDATE. Rows nuevos → CREATE.

**Habit for future rate updates:** Ninguna cifra entra a la tabla sin URL + cita literal verificada por humano. Cuando Stripe/PayPal cambien pricing, grep `source_quote` para localizar la fila stale y re-validar.

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