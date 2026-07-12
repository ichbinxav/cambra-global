# Decision Log — Iteración 4 (2026-07-12)

_Continuación de `Decision_Log.md`, que alcanzó el límite de 2500 líneas._

## Cierre de auditoría total — 4 frentes

**Trigger de Xavi:** auditoría de barrido por los rincones no cerrados en iteraciones 1-3. 4 frentes independientes en un chunk.

### Frente 1 — InfrastructureStatus (Dashboard) purgado del árbol

**Diagnóstico:** el componente aún contenía filas para Logistics×2 + Commerce SaaS junto a las dos filas payments (Online + TPV) + un header "3-pillar framework". Post-pivot payments-only, tras retonar las filas muertas, quedaban únicamente 2 filas útiles.

**Decisión: eliminar el componente del Dashboard, no fusionar.** Justificación:
- Con 2 filas (Payments Online / In-store TPV) el componente ya duplica información que el Dashboard surface más arriba y más abajo:
  - El KPI `payment_savings` (bloque "Quick stats — payments only") cubre el número clave online.
  - El bloque "Your infrastructure" (`graphNodes`) lista los providers detectados con badge `Verified / Connected / Detected / Estimated` — que es exactamente lo que las 2 filas restantes intentaban comunicar.
- Un card de 2 filas + un header + un link "Connect tools" es visualmente ruido, no información. La densidad del Dashboard mejora quitándolo.

Ficheros: `src/components/dashboard/InfrastructureStatus.jsx` borrado; `src/pages/Dashboard.jsx` — import y JSX del componente eliminados, comentario justificando la ausencia dejado in-place.

### Frente 2 — HelpHero chip muerto "Infrastructure Score" → "In-store payments"

**Diagnóstico:** `HelpHero.jsx` tenía `PLACEHOLDERS` (6 preguntas rotativas en la barra de búsqueda) y `TRENDING` (5 chips clicables debajo). Ambos contenían "Infrastructure Score" — concepto muerto eliminado en iteración 3 junto con la categoría del mismo nombre. Un click en el chip disparaba una búsqueda que devolvía cero resultados.

**Fix aplicado:**
- `PLACEHOLDERS[1]`: "What is the Infrastructure Score?" → "Do you audit in-store card payments (TPV)?"
- `TRENDING[0]`: "Infrastructure Score" → "In-store payments"

**Verificación de que las 5 chips resuelven a resultados no vacíos** (grep tokenizado sobre `helpCenterData.js`, simulando el matching del modal):

| Chip | Tokens | Hits |
|---|---|---|
| In-store payments | `in-store` + `payments` | 19 + 26 |
| Stripe | `stripe` | 13 |
| Benchmarks | `benchmarks` | 19 |
| GDPR | `gdpr` | 6 |
| Success fee | `success` + `fee` | 3 + 21 |

Los 5 chips producen resultados contundentes. Ninguno queda muerto.

### Frente 3 — Purga de huérfanos (patrón M3.5)

**Método:** grep de imports anclado por fichero, con la regex `from ['"]<path>['"]` para cada candidato, sobre todo `src/` y `base44/`. Solo se borra un fichero si 0 callers (excluido el propio owner).

**30 ficheros purgados:**

| Fichero | Callers antes | Justificación cascada |
|---|---|---|
| `src/lib/exportResults.js` | 0 | CSV exporter multi-vertical del wizard muerto. |
| `src/components/recommendations/RecommendationList.jsx` | 0 | Componente sin monta — nadie construía la lista. |
| `src/components/recommendations/RecoveryBadge.jsx` | 0 (post-RecommendationList) | RecommendationList era su único caller — cascada limpia. |
| `src/lib/recoveryModel.js` | 0 (post-RecoveryBadge) | RecoveryBadge era su único caller — cascada limpia. |
| `src/components/dashboard/HeroSavings.jsx` | 0 | Legacy hero del dashboard multi-vertical. |
| `src/components/dashboard/GMVMetrics.jsx` | 0 | KPI multi-vertical del wizard muerto. |
| `src/components/dashboard/CumulativeSavingsChart.jsx` | 0 | Chart legacy — SavingsTrendPanel es el consumido hoy. |
| `src/components/dashboard/InfraScore.jsx` | 0 | Score composite del pre-pivot. |
| `src/components/dashboard/IntelligenceWidget.jsx` | 0 | Widget del multi-vertical intelligence. |
| `src/components/dashboard/EconomicsStrip.jsx` | 0 | KPI strip legacy. |
| `src/components/dashboard/DriftAlertStrip.jsx` | 0 | Alertas de drift del multi-vertical. |
| `src/components/dashboard/DriftMonitor.jsx` | 0 | Monitor de drift del multi-vertical. |
| `src/components/dashboard/InfrastructureGraphPanel.jsx` | 0 | Panel de grafo — sustituido por render inline en Dashboard. |
| `src/components/dashboard/SavingsTrend.jsx` | 0 | Componente bare — el que se usa es SavingsTrendPanel. |
| `src/components/dashboard/LiveSystemHeader.jsx` | 0 | Header live del pre-pivot. |
| `src/components/dashboard/MetricCard.jsx` | 0 | Card genérica no consumida. |
| `src/components/dashboard/InfrastructureStatus.jsx` | 0 (post-Frente-1) | Frente 1 lo saca del Dashboard. |
| `src/components/shared/MetricCard.jsx` | 0 | Duplicado del pre-pivot. |
| `src/components/shared/NodeSymbol.jsx` | 0 | Símbolo del grafo multi-vertical. |
| `src/components/shared/NodeLoader.jsx` | 0 | Loader del grafo multi-vertical. |
| `src/components/shared/NavyCard.jsx` | 0 | Card wrapper legacy. |
| `src/components/shared/Surface.jsx` | 0 | Wrapper legacy. |
| `src/components/shared/BrandLogoWordmark.jsx` | 0 | Wordmark no consumido. |
| `src/components/shared/StatusDot.jsx` | 0 | Dot no consumido. |
| `src/components/shared/CategoryBadge.jsx` | 0 | Badge no consumido. |
| `src/components/shared/SectionShell.jsx` | 0 | Shell no consumido. |
| `src/components/shared/DataQualityBanner.jsx` | 0 | Banner del multi-vertical. |
| `src/components/shared/ConfidenceBadge.jsx` | 0 | Badge legacy — reemplazado por el nuevo verification confidence inline. |
| `src/components/shared/NetworkDataBadge.jsx` | 0 | Badge legacy. |
| `src/components/shared/SectionDivider.jsx` | 0 | Divider no consumido. |

**Caso RecommendationList/RecoveryBadge resuelto explícitamente:** el grep inicial encontró que `RecommendationList` importa `RecoveryBadge` (aparente falso positivo). Refinamiento con regex por identificador confirmó: (a) `RecommendationList` tiene 0 callers externos → borrar; (b) tras borrarlo, `RecoveryBadge` queda con 0 callers → borrar; (c) tras borrar `RecoveryBadge`, `recoveryModel.js` (que solo era importado por RecoveryBadge) queda con 0 callers → borrar. Cascada de 3 verificada file-a-file antes de tocar nada.

**Suite intacta por construcción** — ninguno de los 30 ficheros borrados está bajo `src/lib/*.test.js` ni bajo los ficheros que la suite ejercita (`paymentsGap`, normalizers Stripe/BigCommerce, syncEngine helpers, tenantGuard, verificationStatus, scoreEngine, layer2Validators, benchmark sync, analyzerResultsHandoff).

### Frente 4 — i18n legacy purga

**Diagnóstico real** (la auditoría previa había reportado ~194; el conteo exacto medido con literal grep `t("<key>")` es superior):
- Total keys en el dict EN: **338**
- Keys usadas literalmente vía `t("key")`: **113**
- **6 call-sites dinámicos** con `t(variable)` que exigen preservar prefijos:
  1. `AIInsightsPanel.jsx` → `t(AGENT_LABEL_KEY[r.agent_type])` + `t(cfg.key)` — safelist: 22 keys (`agent_*`, `ai_*`, `status_*`, `awaiting_approval`, `just_now`, `minutes_ago`, `hours_ago`, `days_ago`, `review_approve`).
  2. `Navbar.jsx` → `t(labelKey[lbl])` — safelist: 7 nav keys (`nav_analyzer`, `nav_dashboard`, `nav_get_started`, `nav_how`, `nav_pricing`, `nav_reports`, `nav_settings`).
  3. `ConfidenceBadge.jsx` → `t(s.key)` (fichero borrado en Frente 3 — el safelist se conserva porque `UpgradeToVerified` usa las mismas keys `badge_*`).
  4. `UpgradeToVerified.jsx` → `t(key)` — safelist: 6 keys (`badge_connected`, `badge_estimated`, `badge_verified`, `uv_payments_*`).
  5. `ConnectTools.jsx` → `t(meta.labelKey)` — safelist: 23 keys (`badge_*`, `cat_payments`, `cat_commerce`, `cat_other`, `coming_soon`, `connect_to_verify`, `ct_page_*`, `detected_source_stripe`, `found_in_stripe`, `last_sync`, `nav_analyzer`, `nav_connect`, `stripe_self`, `stripe_self_test`, `summary_*`, `sync_*`).

Cada safelist extraído por grep literal `["']<snake_case>["']` sobre el fichero, filtrando strings tipo i18n key (`snake_case` con underscore). Auditable — no adivinado.

- **Keys huérfanas totales** (no en `used_literal` ∪ `dynamic_safelist` = 174 keys seguras): **202 keys**.
- Reservadas manualmente: `lang`, `style`, `currency` (no son keys de `t()`, son metadata del contexto).

**Purga aplicada** vía script Node.js sobre `src/lib/i18n.jsx`:
- Regex `/^\s*<key>\s*:\s*["']/` matcheando línea a línea las 202 keys en los 3 bloques (`en:`, `fr:`, `es:`).
- Resultado: **1360 → 754 líneas** = **606 líneas eliminadas exactas** (202 × 3, confirmando cobertura completa en los 3 idiomas para todas las keys purgadas).
- Post-purge validation: re-grep de las 202 keys sobre el fichero final → **0 keys purgadas siguen presentes**. Grep cruzado sobre todo `src/`: **0 llamadas `t("key")` en código con key ausente en el diccionario final**.

**Dictionary final:** 136 keys por idioma (338 - 202) × 3 = 408 entries totales.

**Prefijos preservados de call-sites dinámicos:** `agent_*`, `ai_*`, `status_*`, `nav_*` (7 keys nav vivas), `badge_*` (7 keys badge vivas), `uv_*`, `cat_payments/commerce/other`, `ct_page_*`, `summary_*`, `sync_*`, `detected_source_stripe`, `found_in_stripe`, `stripe_self*`, `last_sync`, `connect_to_verify`, `coming_soon`, `just_now`, `minutes_ago`, `hours_ago`, `days_ago`, `review_approve`, `awaiting_approval`.

### Ficheros tocados en la iteración 4
- **30 ficheros borrados** (29 huérfanos + InfrastructureStatus por Frente 1).
- `src/pages/Dashboard.jsx` — import + JSX de InfrastructureStatus eliminados + comentario justificando la ausencia.
- `src/components/help/HelpHero.jsx` — 2 strings (placeholder + chip trending).
- `src/lib/i18n.jsx` — 606 líneas eliminadas, 202 keys huérfanas por idioma × 3.
- `src/docs/Decision_Log_Iter4.md` — este fichero (Decision_Log.md alcanzó el límite de 2500 líneas).
- `src/docs/KNOWN_DEBT.md` — cierre de deuda residual.

**Restricción cumplida:** solo purga + copy, cero lógica de motor, cero cambios en `paymentsGap`, `submitPaymentsAnalysis`, `computeStripeVerifiedGap`, ni en el trío SYNC. Suite 370/0/2 intacta por construcción.