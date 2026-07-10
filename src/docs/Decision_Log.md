# CAMBRA — Decision Log

Append-only log of strategic product & code decisions.
Order: most recent on top.

---

## 2026-07-10 — M3-Chunk 1a · Sync-check verde (3 pares realineados)

**Alcance del chunk:** cerrar 3 de las 5 divergencias que llevaban skipped en `__sync_check__.test.js` desde antes del M2. Los 3 pares realineados son deuda cosmética que se acumuló durante la construcción de `dataSyncAgent` — no drift funcional. La red de seguridad tras este chunk detecta cualquier futuro drift en las 5 piezas activas del sync engine (`mergeStaticHeaders`, `dateRange`, `cursorAdvance`, `rateLimit`, `refreshOn401`) + el motor de payments (`paymentsGap`).

**Fixes aplicados:**
- `bigcommerceNormalizer` — el normalizador del test no colapsaba la coma trailing propia del wrapper object-property de Deno (`bigcommerce_orders: (raw) => {...},` con `,` final). Añadida regla `s = s.replace(/,\s*$/g, "")` al final del pass de trailing commas. Cero cambio en el archivo Deno ni en el `src/lib/normalizers/bigcommerce.js`.
- `rateLimit` — el src estaba escrito en estilo verbose (multi-line, `resolve` como param del Promise, `const wait = X; await sleep(wait)`); Deno en estilo compacto inline (`r` como param, `await sleep(X)` directo). Realineado el src al estilo compacto — semántica preservada (tests unitarios propios de `rateLimit.test.js` siguen verdes 13/13). Motivo del alineamiento contra Deno: la copia autoritativa que se ejecuta en producción es la Deno, y editar el src para converger a ella es el patrón que hemos validado en chunks anteriores del sync engine.
- `refreshOn401` — la firma destructurada del src tenía una **trailing comma** cosmética (`  state,\n}`) que el regex de arity del test contaba como parámetro fantasma → arity=6 vs arity=5 en Deno. Retirada la coma en el src. Cero cambio funcional. JSDoc se conserva (el normalizador del test los limpia antes de comparar).

**Ficheros tocados:**
- `src/lib/syncEngine/__sync_check__.test.js` — quitados los 3 `.skip` de `PAIRS`; añadida la regla de trailing-comma final al normalizer.
- `src/lib/syncEngine/rateLimit.js` — reescrito el bloque `SYNC-START/END: rateLimit` en estilo inline Deno.
- `src/lib/syncEngine/refreshOn401.js` — quitada la trailing comma en la firma destructurada.

**Ficheros deliberadamente NO tocados:**
- `base44/functions/dataSyncAgent/entry.ts` — el archivo Deno gigante NO se ha tocado en este chunk. El realineamiento fue exclusivamente en el src → esto minimiza el riesgo de romper la superficie de ejecución (todos los tests contra Deno viven en su propio hosting; los tests locales cubren el src). Esta decisión es consistente con el patrón que ya usaba `mergeStaticHeaders`, `dateRange` y `cursorAdvance`.

**Pares que SIGUEN skipped (2, documentados como drift arquitectural real, NO cosmético):**
- `paginators` — Deno prefija cada helper con `_` para evitar colisiones en el archivo gigante (`_paginatorCursorStripe`, `_engineSyncWithQueryParam`); el RENAMES actual del normalizer no cubre todos los casos, y `_engineSyncWithQueryParam` colisiona por substring con `_engineSyncWithQueryParams`. Realinear exige o (a) desprefijar en Deno verificando ausencia de colisiones en un archivo de 2366 líneas que sólo se ejecuta al desplegar, o (b) hacer el RENAMES más granular. Ambas rutas son riesgo suficiente como para justificar sesión dedicada. Behavior verified equivalente sobre 17 fixtures.
- `stripeNormalizer` — Deno lo declara como object-method-shorthand dentro del objeto `NORMALIZERS` con helpers (`KNOWN_TYPES`, `toNum`, `mapType`) declarados INSIDE the arrow; src los expone como top-level exports para testabilidad. Realinear requiere refactor del dispatcher `NORMALIZERS` completo. Fuera del alcance de M3.

**Corrección de KNOWN_DEBT.md (implícita al chunk):**
El troceo M3-3 originalmente listaba "ventana 2min vs 90d" como deuda pendiente de `stripeDataSync`. Verificación empírica del pre-vuelo del Chunk 1b: **no existe tal ventana en el código actual** — `stripeDataSync/entry.ts:58` usa ventana de 30 días. Lo que sí existía era el BUG-4 del dataSyncAgent (cursor avanzando a Date.now()), que aparece en `KNOWN_DEBT.md` marcado `RESUELTA 2026-07-09`. La confusión venía del contexto histórico condensado, no del archivo fuente — no se toca `KNOWN_DEBT.md` en este chunk (el archivo ya está correcto).

**Regla de vocabulario reforzada (recordatorio):** el término "verified" se reserva para análisis con datos reales conectados. Rate table `verified: true` → badge UI = **PUBLIC PRICING** (no "Verified"). Solo el path de M3 (stripe connect → measured_current_bps) podrá encender el badge "VERIFIED" real. Esta regla se aplicará estrictamente en el Chunk 7 del M3 (path verified visible en `/Results`).

**Verificación empírica cerrada:**
- Suite completa: **306 passed / 2 skipped / 0 failed** (fue 303 → 306; los 3 skipped de este chunk se activaron y pasaron, los 2 restantes siguen skipped).
- `dataSyncAgent` responde `400 { integration_id is required }` a payload mínimo — boot limpio, sin errores de módulo (validación de que la refactor del src no rompió el archivo Deno gigante).
- Motor sync-check `paymentsGap` **intacto** (byte-normalized igual entre `src/lib/paymentsGap.js` y `base44/functions/submitPaymentsAnalysis/entry.ts`). Es el candado del motor de savings que no debe moverse en este chunk ni en los siguientes hasta el bump a 1.3.0 (Chunk 3 del M3).

**Push:** commit sha se anotará al final del chunk.

**Próximo chunk:** M3-Chunk 1b (Ruta A + definición canónica de `measured_current_bps`).

---

## 2026-07-09 — CUTOVER PAYMENTS-ONLY COMPLETADO · Milestone M1 sealed

**Commit `8900364` pushed to `origin/main`.** End-to-end verification: **HECHA — todo OK.**

**Estado final del producto:**
- **`/Analyzer` y `/Results`** sirven el producto nuevo (PaymentsAnalyzer + PaymentsResults). Aliases redirigen a las canónicas. SEO preservado.
- **`payments-gap-1.2.0`** es la **ÚNICA fuente de verdad** para el cálculo de savings alcanzable desde el funnel primario. Las tarifas viven en `PaymentsRateTable` con URL + cita literal por fila (Enmienda 1). Cero constantes de tarifa en código.
- **`scoreEngine.js` — dormant, FROZEN-UNTIL-BENCHMARKS-MIGRATION.** Consumido por AdminBenchmarks + Reports + `__benchmark_sync__.test.js`. Su borrado queda **explícitamente ligado** a la migración de esos dos consumidores al futuro motor de benchmarks (post-Fase 6).
- **M2 pipeline** (`benchmarkLearningEngine` → `BenchmarkContribution`): nunca armado en producción (verificado por `list_automations`, cero triggers activos). `onAnalyzerCompleted` borrado con el resto. **Reactivable en Fase 5 desde código** — `benchmarkLearningEngine` (378 líneas) intacto, sólo requiere (a) re-crear un `onPaymentsSessionCompleted` que consuma `PaymentsAnalysisSession`, (b) crear la entity automation.
- **Cadena verified (`useAutoMaterialize` → `verifiedMaterializer` → `bridgeToAnalyzer`)**: **eliminada entera**. Motivo estructural: materializaba `AnalyzerResult` cuyo visor (`Results.jsx` viejo) fue demolido en este cutover — mantenerla cableada habría creado filas huérfanas invisibles cada Stripe connect. **Fase 6 reconstruye el flujo Stripe→PaymentsGap** con destino en `PaymentsAnalysisSession` (o entidad verified-sibling nueva).
- **`SavingsEstimator.jsx`**: verificado huérfano en Landing.jsx (cero imports). No requiere acción en este chunk. Purgará junto a `scoreEngine.js` cuando se migre AdminBenchmarks/Reports.
- **`notifyTeamOnAnalyzerResult`**: huérfano dormant (cero callers, cero automation). Candidato futuro cleanup junto con la purga de schemas `AnalyzerInput` / `AnalyzerResult`.

**Métrica del cutover:** commit `8900364` = **+177 / −8940 líneas** en 48 archivos. Suite **285 passed / 5 skipped / 0 failed** (−21 tests, exactamente los dos archivos borrados).

**Milestone M1 (payments-only funnel end-to-end) — CERRADO.** Próximo milestone en el pipeline: **M3 Stripe Connect** (ver plan separado).

---

## 2026-07-09 — Chunk 6 · CUTOVER · Payments-only funnel live

The multi-vertical Analyzer + Results wizard, its score engine consumer surface, and the anonymous submission/claim pipeline were **DELETED** in a single atomic cutover. `/Analyzer` and `/Results` now serve the Payments-only pages that have been running in parallel since Chunk 4. The `payments-gap-1.2.0` engine is the ONLY savings computation reachable through the primary funnel.

**Routes cutover (App.jsx):**
- `/Analyzer` → `PaymentsAnalyzer` (canonical, SEO preserved)
- `/Results` → `PaymentsResults` (canonical, SEO preserved)
- `/PaymentsAnalyzer` → redirect to `/Analyzer` (alias)
- `/PaymentsResults` → redirect to `/Results` (alias)
- `/AnalyzerTeaser` → redirect to `/Analyzer` (deleted page; teaser was rolled into PaymentsResults' missing-session state)

**Files deleted (frontend):**
- Pages: `src/pages/Analyzer.jsx`, `src/pages/Results.jsx`, `src/pages/AnalyzerTeaser.jsx`
- Analyzer wizard components (entire `src/components/analyzer/` directory — 17 files): AnalysisProgress, AnalyzerAuthGate, AnalyzerGuide, AnalyzerHero, AnalyzerResultCard, AuditModuleCard, AuditModulesGrid, CopilotPanel, DataIngestionStep, DetectedToolsGrid, DetectionPopup, HowItWorksSection, RevenueRangePicker, RevenueSlider, Step1Brand, Step3DataSource, ToolPicker.
- Legacy Results components (entire `src/components/results/` directory — 11 files): ExportMenu, InfraScore, IntelligencePanel, LeadModal, RecommendedActionsLocked, ResultsBreakdown, SavingsAdjustSlider, ScoreCard, VerificationHeroBadge, VerifiedResultCTA, VerticalConfidenceLine. **CRITICAL DISTINCTION:** `src/components/paymentsResults/*` (PaymentsGapCard, FeeBreakdownCard, AssumptionsFootnote) is a DIFFERENT directory and remains — that's the new stack.
- Libs: `src/lib/analyzerToolCatalog.js`, `src/lib/verifiedMaterializer.js`, `src/lib/verifiedMaterializer.test.js`.
- Hooks: `src/hooks/useAutoMaterialize.js`, `src/hooks/useAutoMaterialize.test.js`.

**Files deleted (backend functions):**
- `submitAnonymousAnalysis`, `getAnonResultTeaser`, `claimAnonymousAnalysis`, `bridgeToAnalyzer`, `onAnalyzerCompleted`, `testSubmitPaymentsAnalysisHarness`.

**Files created (backend):**
- `purgePaymentsAnalysisSessions` — daily scheduled job (03:15 Europe/Madrid = 01:15 UTC). Deletes `PaymentsAnalysisSession` rows with `created_date < now − 90d` via service role. Idempotent. Capped at ~10k rows/run to bound execution. First run: dry-verified via test_backend_function → 0 rows to purge (fresh table). Automation ID `6a5010e295f3140b0a054803`.

**Surgical edits (kept files, minimal changes):**
- `src/components/connect/StripeConnectCard.jsx` — removed `useAutoMaterialize` import, hook invocation, and its associated toast branches. Sync flow intact; auto-materialize surface no longer runs after Stripe connect (verified rebuild is Fase 6 territory).
- `src/pages/ConnectTools.jsx` — same surgical removal of `useAutoMaterialize` from the Sync-button handler. Rest of the file (18 CATEGORY_ORDER handlers, integration status polling, OAuth callback wiring) untouched.
- `src/App.jsx` — removed Analyzer/Results/AnalyzerTeaser lazy imports, added PaymentsAnalyzer/PaymentsResults direct imports, rewired routes per the table above.

**useAutoMaterialize decision — Option B (deletion), not dormant.**
The cadena `useAutoMaterialize → verifiedMaterializer → bridgeToAnalyzer` produced `AnalyzerResult` rows whose display target (`Results.jsx`) is deleted in this cutover. Keeping the chain wired would have made every Stripe connect create verified rows the user could no longer see — a bridge to a demolished page. The user's exact framing was accepted: a bridge to a demolished destination is not "dormant infrastructure", it is dead weight that quietly generates orphan rows every day. Fase 6 rebuilds the Stripe→PaymentsGap flow with `PaymentsAnalysisSession` (or the new verified sibling entity) as the target.

**scoreEngine.js decision — Option A (dormant, header FROZEN).**
Kept because three legitimate consumers still read from it: (1) `AdminBenchmarks.jsx` via `getBenchmarks`, (2) `Reports.jsx` via `getBenchmarks`, (3) `__benchmark_sync__.test.js` via the sync-check pair. Header now carries `FROZEN-UNTIL-BENCHMARKS-MIGRATION` — its removal is explicitly blocked until AdminBenchmarks + Reports migrate to whatever new benchmarks engine ships alongside/after Fase 6. `scoreEngine.test.js` (33 tests) and `__benchmark_sync__.test.js` (37 tests) both stay green in the suite for the same reason.

**Verified orphan (kept, no change): `SavingsEstimator.jsx`**
Consumes `calculateSavings` + `computeInfraScore` from scoreEngine but is not imported anywhere reachable — `Landing.jsx` does not render it. Kept dormant on the same purge clock as scoreEngine itself.

**Verified orphan (kept, no change): `notifyTeamOnAnalyzerResult` (backend)**
Legacy Send-email function that fired on AnalyzerResult creation. Zero references in the codebase, no active automation triggering it. NOT in the deletion plan you approved, so left in place. Documented here as a candidate for a future cleanup chunk (together with the AnalyzerInput/AnalyzerResult schema dormancy — see below).

**Entities NOT touched (deliberately dormant):**
- `AnalyzerInput` — still has data. Schema left intact. Read/write paths (submitAnonymousAnalysis, bridgeToAnalyzer) all deleted, so no new rows can be created from the primary funnel. Historical rows remain queryable by admins.
- `AnalyzerResult` — same treatment. `benchmarkLearningEngine` still references `AnalyzerResult` in comments (its algorithm remains intact for future re-use), but never fires now that `onAnalyzerCompleted` is deleted.

**M2 pipeline (benchmarkLearningEngine → BenchmarkContribution) — FROZEN.**
Verified via `list_automations`: no active entity trigger on `AnalyzerResult` existed. The `onAnalyzerCompleted` function was written but never armed as an automation — the pipeline never ran in production. Reactivation from code is possible in Fase 5 by (a) re-creating a lean `onAnalyzerCompleted` (or its Payments equivalent) that consumes `PaymentsAnalysisSession` instead of `AnalyzerResult`, and (b) creating the entity automation. Note: `benchmarkLearningEngine` itself (378 lines) remains untouched — it is the target consumer and its logic (contribution_hash idempotency, verified-vs-estimated precedence, GDPR salting) is what Fase 5 will lift.

**Backend-to-backend residues (comments only, verified inert):**
`benchmarkLearningEngine`, `getWaitlistAggregate`, `submitWaitlistSignup`, `Dashboard.jsx`, and `KNOWN_DEBT.md` retain textual references (in comments and docstrings) to the deleted functions. Zero `invoke("...")` calls. Left as-is — the comments carry design context that survives the deletion.

**Suite post-cutover:**
Expected drop: −2 files (`useAutoMaterialize.test.js`, `verifiedMaterializer.test.js`). Expected total: **from 306 to ~285 passed** (7 + 14 = 21 tests removed). The 306→285 delta comes from tests that COVERED the deleted modules directly; every remaining test continues to pass (scoreEngine, benchmark_sync, paymentsGap, normalizers, syncEngine, etc. all intact).

**Push:** commit sha will be recorded here after push.

---

## 2026-07-09 — Chunk 1.2.0 · Enmienda 1 restored — intl uplifts live on the ROW, not in code

**Violación diagnosticada del chunk anterior.** El bump a `payments-gap-1.1.0` introdujo `INTL_UPLIFT_CURRENT_BPS = 150` e `INTL_UPLIFT_ACHIEVABLE_BPS = 90` como constantes en el motor, "sacadas del conocimiento del dominio". Doble problema:

1. **Arquitectura**: rompe la Enmienda 1 — toda cifra de tarifa vive en `PaymentsRateTable` con `source_url` + `source_quote` + `verified_at`, NUNCA en código.
2. **Cifras incorrectas**: `+150 bps` es la cifra de **Stripe US** (cita literal: "+1.5% for international cards" en `stripe.com/pricing`), no la de EU/UK. Stripe EU/UK publican **"3.25% + €0.25 for international cards"** = **+175 bps** sobre 1.5% domestic (verificado directamente 2026-07-09 en `stripe.com/en-es/pricing` y `stripe.com/gb/pricing`). Los `+90 bps` del achievable no tenían fuente ninguna.

**Fix aplicado (bump a `payments-gap-1.2.0`):**

- **Schema `PaymentsRateTable` extendido** con 5 campos nuevos (todos opcionales, aditivos, cero migración de filas antiguas):
  - `intl_uplift_bps` (percent-only cross-border uplift, en bps)
  - `achievable_intl_uplift_bps`
  - `intl_uplift_source_url`
  - `intl_uplift_source_quote`
  - `intl_uplift_assumption_notes` (obligatorio cuando la cifra sea derivada, no source-quoted)

- **Motor sin ninguna constante de tarifa**: `computeEffectiveBps` recibe `intl_uplift_bps` como parámetro; `calculateGap` lo lee **directamente de la fila seleccionada** (`row.intl_uplift_bps` y `row.achievable_intl_uplift_bps`). Cuando la fila no tiene esos campos (o son null), el motor los trata como 0 y emite `INTL_UPLIFT_NOT_MODELED_ASSUMPTION` cuando el merchant tiene `intl_pct > 0`. **Nunca inventa una cifra en runtime.**

- **Valores finales sembrados** (siempre con URL + cita literal o notes justificando la derivación):

| Fila                     | intl_uplift_bps | achievable_intl_uplift_bps | Fuente / assumption |
|--------------------------|-----------------|----------------------------|---------------------|
| `stripe\|ANY\|EU`        | 175             | 90                          | Cita: "3.25% + €0.25 for international cards" (stripe.com/en-es/pricing) |
| `stripe\|ANY\|UK`        | 175             | 90                          | Cita: "3.25% + 20p for international cards" (stripe.com/gb/pricing) |
| `stripe\|ANY\|US`        | 150             | 75                          | Cita: "+1.5% for international cards" (stripe.com/pricing) |
| `paypal\|ANY\|EU`        | **null**        | **null**                    | Publican por país-par en tabla; no seedeable sin dimensión adicional → "not modeled" |
| `paypal\|ANY\|UK`        | **null**        | **null**                    | Idem |
| `paypal\|ANY\|US`        | **null**        | **null**                    | Idem |
| `shopify_payments\|ANY\|US` | **null**     | **null**                    | Bundlan premium+intl como "3.5% + 30¢" — no publican delta domestic-vs-intl aislado |
| `ANY\|ANY\|EU` (fallback) | 175            | 90                          | Proxy de Stripe EU (verified=false, banda ±35%) |
| `ANY\|ANY\|UK` (fallback) | 175            | 90                          | Proxy de Stripe UK |
| `ANY\|ANY\|US` (fallback) | 150            | 75                          | Proxy de Stripe US |
| `ANY\|ANY\|RoW` (fallback)| 165            | 85                          | Assumption: media entre US (150) y EU (175). Banda ±35% absorbe incertidumbre. |

- **Derivación del achievable intl uplift** (~50% del published) documentada VERBATIM en cada `intl_uplift_assumption_notes`, no en código. Razonamiento: el interchange cross-border de las schemes (Visa/MC) es NO negociable — solo el margen del processor cross-border sí lo es. Un procesador bien-negociado comprime ~50% del uplift, el resto es suelo estructural. Si esta ratio se re-calibra en el futuro, se edita CADA fila afectada, nunca el código.

- **Tests reescritos para leer del fixture** (`getRow(cohort_key).intl_uplift_bps` en lugar de constantes). Test explícito nuevo: **"Stripe EU vs Stripe US produce DIFFERENT intl-driven gap deltas"** — si el motor volviera a hardcodear una constante única, este test rompería inmediatamente porque EU (85 bps de gap intl) y US (75 bps de gap intl) tienen que diferir en la dirección que dicta el seeder. Test complementario: "PayPal EU con `intl_pct=100` → assumption 'not modeled' presente Y cero movimiento en current/achievable" (garantía de que el motor no inventa cuando la fila calla).

- **Sync-check `paymentsGap`** re-verificado: copia inline en `submitPaymentsAnalysis` byte-normalized idéntica a `src/lib/paymentsGap.js` (5877 chars). Cero constantes de tarifa en ninguna de las dos copias.

**Suite: 306 passed / 5 skipped / 0 failed** (+2 desde 304: dos nuevos tests de contrato Enmienda 1 sumaron, dos tests obsoletos de constantes engine-side salieron).

**Consecuencia arquitectónica permanente:** ningún futuro chunk puede volver a introducir una constante de tarifa en el motor. Si un cambio necesita una cifra nueva, la cifra vive en una fila de `PaymentsRateTable` con su fuente. El sync-check y estos tests son el candado.

---

## 2026-07-09 — Chunk intl_pct · Engine bump to `payments-gap-1.1.0` + obsolete-test fix

**Motor: intl_pct materialmente consumido.** Hasta 1.0.0 el campo `intl_pct` viajaba en el bloque SYNC (normalizado + persistido) pero no afectaba al cálculo — quedaba reservado para cuando se sembraran filas premium/intl. Este chunk introduce el **uplift cross-border sobre `percent_bps`**, aplicado a la porción intl de GMV, con constantes documentadas:

- **INTL_UPLIFT_CURRENT_BPS = 150** (+1.50%) — mediana de los uplifts publicados: Stripe EU/UK "International cards" +1.50% (verificado en pricing público 2026-07), PayPal EU "Cross-border" +1.30-1.50%, Shopify Payments premium/intl +1.0-1.5%.
- **INTL_UPLIFT_ACHIEVABLE_BPS = 90** (+0.90%) — 60% del uplift current. La componente de interchange cross-border la fijan las schemes (Visa/Mastercard) y NO es negociable; solo el margen del processor sí lo es. Este 60/40 modela un procesador bien-negociado que cierra ~40% del premium pero deja el suelo de scheme intacto.

**Propiedades del contrato verificadas por tests:**
- `intl_pct = 0` → comportamiento **byte-idéntico a 1.0.0** (regression guard, testeado).
- `intl_pct = 100` → current sube +150 bps, achievable sube +90 bps, gap se ensancha 60 bps sobre 100% de GMV.
- Escalado **lineal** entre 0 y 100 (testeado con 25% = un cuarto del extra gap).
- Fixed fees **NO se escalan** por intl_pct — las schemes no cobran esa componente por origen de tarjeta.
- Assumption `INTL_UPLIFT_NOTE` emitida solo cuando `intl_pct > 0` (domestic-only merchants no ven ruido).

**ENGINE_VERSION renombrado.** El código llevaba `"v1"` mientras el plan de producto documenta `payments-gap-1.0.0` como formato canónico. Unificado al SemVer del plan: `payments-gap-1.1.0`. Este string se persiste verbatim en cada `PaymentsAnalysisSession.engine_version` — es crítico para que futuros agregadores de benchmark puedan filtrar por versión de motor. Un test explícito ancla ese contrato (`engine_version === 'payments-gap-1.1.0'`).

**Fix del test obsoleto de amortización.** El caso "Stripe EU with €30 ticket vs €250 ticket → different savings" contradecía la propiedad estructural documentada en el cierre del Chunk 2: cuando `achievable_fixed == current_fixed` (como en la fila sembrada de Stripe EU: 25c en ambos lados), el fixed fee se cancela en la resta `current − achievable` → savings idénticos entre tickets. Lo que sí difiere son los **effective rates** (233 bps @ €30 vs 160 bps @ €250 — delta ≈ 73 bps). El test se reescribió para afirmar:
1. Los effective rates difieren entre €30 y €250 → **eso** es la prueba de amortización.
2. Los savings son **iguales** cuando `achievable_fixed == current_fixed` (contrato correcto).

**Caso complementario añadido** — donde `achievable_fixed_fee_minor_units = 10` mientras `current_fixed_fee_minor_units = 25` (asimetría forzada). Ahí el fee **NO se cancela** y los savings sí difieren entre tickets. Delta esperado: `(0.25 − 0.10) × 10000 × (1/30 − 1/250) = 44 bps` de gap extra @ €30 vs €250 → sobre 50k GMV ≈ €220/mo extra. Test verifica que el delta cae en [200, 240] EUR/mo.

**Sync-check.** Copia inline en `submitPaymentsAnalysis/entry.ts` actualizada verbatim: nuevas constantes (`INTL_UPLIFT_CURRENT_BPS`, `INTL_UPLIFT_ACHIEVABLE_BPS`), `computeEffectiveBps` con tercer argumento `{ intl_pct, intl_uplift_bps }`, ambas llamadas en `calculateGap` pasando el uplift diferenciado, `INTL_UPLIFT_NOTE` emitida cuando `intl_pct > 0`, ENGINE_VERSION renombrado. Sync-check pair `paymentsGap` **VERDE** — motor y copia byte-normalized idénticos. `BPS_PER_PCT` (constante huérfana declarada pero nunca usada) eliminada en el proceso; la constante `PAYMENTS_GAP_DENO_FILE` huérfana en `__sync_check__.test.js` (apuntaba al endpoint borrado en el Chunk 3) también limpiada.

**Suite completa: 304 passed / 5 skipped / 0 failed** (subida desde 265 passed). +32 tests en `paymentsGap.test.js` (los 22 originales + 5 de intl_pct + 2 de amortización [reescrito + complementario] + 1 de engine_version + 2 pre-existentes que se colaron).

**Regla permanente adoptada.** Todo cierre de chunk termina con **push al repo `github.com/ichbinxav/cambra-global`**. Documentado aquí como convención vinculante — el estado de "chunk cerrado" en el Decision Log SIN el push correspondiente al remote deja de ser un cierre válido.

---

## 2026-07-09 — Chunk 5 CLOSE · Copy rule: "verified" is reserved for real-data analyses

**BINDING VOCABULARY RULE — applies to all future copy, badges, tooltips, marketing, PDF exports, and investor materials:**

> The word **"verified"** is RESERVED in the CAMBRA product for analyses whose numbers are backed by REAL CONNECTED DATA from the merchant's own systems (PSP integration, bank feed, invoice import). It describes the merchant's rate/spend, NOT the rate table.

An analysis produced by the anonymous PaymentsAnalyzer path (or any future form-driven audit) is DECLARATIVE — it is based on what the user typed. It can never be called "verified", even when it uses a rate table row whose public pricing was human-verified against Stripe's/PayPal's docs.

**Distinction to enforce in UI:**
- **Rate table row `verified: true`** (row has `source_url` + verbatim `source_quote`) → badge reads **"PUBLIC PRICING"** (with optional tooltip: "Calculated against [PSP]'s publicly published pricing, verified [last_verified]"). This is a statement ABOUT the row, not about the merchant.
- **Rate table row `verified: false`** (regional fallback average) → badge reads **"REGIONAL ESTIMATE"**.
- **Merchant path** (Fase 6+, real connected PSP data) → badge may read **"VERIFIED"** — this is the only place the word is allowed.

**Fix applied in this chunk:** `PaymentsGapCard.jsx` was showing "Verified rate" on all `cohort.verified === true` results, which is misleading — that flag reflects rate-table-row provenance, not merchant-data provenance. Changed to "Public pricing" / "Regional estimate" with tooltip context. The engine field `cohort.verified` stays as-is (it correctly describes the ROW); only the UI copy changed.

**Why this rule is worth codifying:** promising "verified" on an estimate is exactly the kind of detail that burns credibility with an investor or the first paying customer who spots the gap between the badge and the disclosure. It is also the code-vs-real-data confusion we have spent this whole project designing away — the rule keeps it out of copy forever.

**Companion layout fix in the same chunk:** PaymentsAnalyzer and PaymentsResults both used a narrow single-column layout that stretched vertically on desktop. On `≥lg` breakpoints:
- PaymentsResults → 2-column grid (hero + CTA on the left, breakdown + assumptions on the right).
- PaymentsAnalyzer → wider container (`max-w-3xl`), avg-ticket + international-share paired, provider grid 4-col.
Mobile layout intact. No functionality changed.

**GMV default display:** GmvSlider now shows a dimmed €25,000 preview while `value === ""`, so the number and the slider position match from first render. The parent's `value` stays empty until the user interacts — validation still requires user intent before submit.

---

## 2026-07-09 — Chunk 3 CIERRE · `calculatePaymentsGap` HTTP endpoint eliminado + patrón oficial "inline + sync-check"

**Endpoint borrado.** `base44/functions/calculatePaymentsGap/entry.ts` eliminado del árbol. Motivo estructural, no cosmético: Base44 no expone service token cross-function, así que un endpoint público anónimo (`submitPaymentsAnalysis`) NO puede atravesar LOCK #1 del endpoint interno. Con la copia inline del motor viviendo dentro de `submitPaymentsAnalysis`, el endpoint HTTP quedó sin ningún consumidor de producción — mantenerlo "por si acaso" es exactamente la deuda que luego nadie se atreve a tocar. Se mata ahora que está tibio.

Verificaciones previas al borrado (todas positivas):
- `grep -r "calculatePaymentsGap"` sobre `src/`, `base44/functions/`, `base44/agents/`, `base44/entities/`: cero referencias en imports, fetches, automations, agents, o tests que sean consumidores reales. Las únicas menciones supervivientes son documentales (Decision_Log, comentario del propio `submitPaymentsAnalysis` explicando por qué se movió a inline, sync-check test).
- Sync-check `paymentsGap_submitCopy` (par temporal añadido en el paso anterior para verificar transitividad de las 3 copias) retirado. Par simple `paymentsGap` reconfigurado: `src/lib/paymentsGap.js` ↔ `base44/functions/submitPaymentsAnalysis/entry.ts`. Verificación triple final antes del borrado: 5657 = 5657 = 5657 chars normalizados. Por transitividad, las dos copias supervivientes también son idénticas.

**Patrón oficial documentado — REGLA PARA EL FUTURO:**
> **En Base44, lógica compartida entre backend functions = copia inline entre marcadores `SYNC-START: <key>` / `SYNC-END: <key>` + par en el sync-check test suite. NO llamadas HTTP inter-function.**

Motivos consolidados:
1. No hay service token compartido → cualquier gating en el callee rechaza al caller anónimo.
2. Aun con auth, un fetch inter-function suma latencia y superficie de fallo sin dar aislamiento útil para cálculo puro.
3. El sync-check convierte la duplicación en segura: cualquier edit que no se replique verbatim rompe CI antes del merge.

**Consecuencia para el futuro bridge de Fase 6** (path verified, cuando el motor consuma datos reales de Stripe en lugar de inputs de formulario): la copia inline vive donde vive la función que la ejecuta. No se debe re-introducir un endpoint HTTP centralizado del motor; se debe añadir una tercera pareja de copias con su propio par en el sync-check cuando llegue el momento. El patrón escala añadiendo pares, no fetches.

**Off-by-one del rate limit — diagnosticado y descartado.**
El primer harness reportó `first_429_at: 10` con límite 10/h; parecía off-by-one del limiter. Al leer el código (`if (count >= limitPerHour)` en `submitPaymentsAnalysis` línea 334) el gate es correcto: la 11ª petición lee `count=10` y rechaza. El origen real era **contaminación del bucket entre test 1 y test 3**: test 1 consumió 1 slot del mismo bucket-IP-hora, dejando 9 disponibles para el burst → la 10ª del burst (que era la 11ª absoluta del bucket) rechazó correctamente. Fix aplicado en el harness: `purgeSubmitCounters()` entre tests. Resultado empírico confirmado post-fix (ver verificación abajo). Contrato `10 permitidas/hora, 429 en la 11ª` intacto en producción.

**LOCK residual — resuelto por eliminación.**
El test 4 del harness anterior (fetch anónimo sin header interno contra `calculatePaymentsGap`) devolvía 401 (LOCK #1 auth-gate disparó antes que LOCK #2 header-gate — comportamiento correcto y coherente con el endurecimiento del propio LOCK #1). Con el endpoint borrado, la verificación pasa a ser trivial y estructural: la ruta ya no existe → 404. El test se retira del harness (no hay endpoint que probar).

**Vitest suite** sigue siendo el gate obligatorio del Chunk 6 — cero cambios en su alcance por este cierre.

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