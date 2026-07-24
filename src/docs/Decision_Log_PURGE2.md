# Decision Log — PURGE-2 (2026-07-24)

Barrido de código muerto backend: censo estático completo (entidades + funciones + automatizaciones),
borrado de huérfanos claros, cuarentena instrumentada para los dudosos.

## Metodología

1. **Censo de referencias**: escaneo de `src/` + todas las `base44/functions/*/entry.ts` buscando
   cada nombre de entidad y de función (invokes, imports, strings). Punto fijo: una función/entidad
   solo cuenta como viva si es alcanzable desde `src/` o desde una automatización registrada.
2. **Automatizaciones registradas** (7, ninguna apunta a huérfanos): purgePaymentsAnalysisSessions,
   engineeringReportAgent (×2), scheduledBenchmarkRecompute, billApiUsage, processWebhookDeadLetters,
   sendMonthlySavingsSummary.
3. **Recuento de filas** por entidad antes de decidir (regla: con datos ⇒ nunca borrar en fase 2).
4. **Intocables respetados**: motor payments-gap (3 copias SYNC), flujo verified Stripe, funnel
   anónimo, colectivo, waitlist/leads, i18n, RLS de SECURITY-1.

## FASE 2 — Borrados

### Entidades eliminadas (8 — todas con 0 filas y 0 referencias vivas; nada que exportar)
| Entidad | Motivo |
|---|---|
| Benchmark | Tabla estática V1, 0 filas, 0 consumidores |
| BenchmarkSnapshot | Solo la referenciaban computeIntelligenceForBrand + upsertBenchmarkSnapshot (ambas muertas) |
| CohortDefinition | V2 benchmarks, 0 refs |
| ComplianceIssue | V1 compliance, 0 refs |
| ComplianceReview | V1 compliance, 0 refs |
| IntegrationCredential | Sustituida por Integration/OAuthToken, 0 refs |
| IntelligenceInsight | V2 intelligence, 0 refs |
| LeadCapture | El funnel real escribe en `Lead` (submitWaitlistSignup); esta quedó huérfana con 0 filas |

### Funciones eliminadas (33 — 0 invokes desde src, 0 triggers, cadenas muertas V1/V2)
- **Deals V1**: activateDeal, activateDealOrchestrator, authorizeDeal, preflightActivateDeal,
  calculateNodeRevenue, onDealActivated (handler sin automatización), submitDealApplication
  (funnel retirado en FASE 1.2; DealApplication con 0 filas), scheduledEmails (sin cron).
- **Recommendations/Intelligence V2**: acknowledgeRecommendation, dismissRecommendation,
  getRecommendationsForBrand, regenerateAllRecommendations, computeIntelligenceForBrand,
  runRecommendationAgent, runPaymentsAgent, upsertBenchmarkSnapshot, setReviewStatus.
- **Economics/jobs sin cron**: getPlatformEconomics, monthlyEconomicsJob, econHelpers,
  monthlySavingsJob, markOverdueJob, scheduledDiscoveryJob, updateSavingsRealization.
- **Misc muertas**: getCompanyMemory, getProviderLeads, providerScopedData, createMyProvider,
  createNewVersion, phase0BackfillLegacyFields (one-shot ejecutado), createAgentQuestion,
  _apiConstants (doc no-op), probeStripeTestKey (THROWAWAY declarado en su propia cabecera).

## FASE 3 — Cuarentena [QUARANTINE 2026-08-15]

**Sonda de invocación**: cada función en cuarentena escribe `OperationalLog{event_type:"quarantine_probe"}`
al ser invocada (enum ampliado en el schema). Fila presente antes del 2026-08-15 ⇒ estaba viva,
quitar de cuarentena. Silencio ⇒ borrar en el segundo barrido.

### Entidad en cuarentena
- **Subscription** (2 filas de 2026-07-09, posibles early-birds reales) — RLS admin-only,
  descripción marcada. Ligada a startSubscription.

### Funciones en cuarentena (16)
| Función | Por qué no se borró ya |
|---|---|
| apiAuth | Stub deprecado que devuelve 410 Gone a llamadores obsoletos — es su propia cuarentena, sin sonda |
| authzScope, oauthRevoke, dispatchWebhook | Familia API-platform (apiV1/mcpServer vivos); posibles llamadas externas por URL |
| startSubscription | Subscription tiene 2 filas reales |
| inviteAdminUser, promoteMeToAdmin | Utilidades admin/bootstrap potencialmente deseadas |
| onInvoiceStatusEvent | Handler de automatización sin trigger registrado, pero superficie de invoicing viva |
| seedBenchmarkCohorts | Seeder de la cadena de benchmarks viva (cron scheduledBenchmarkRecompute) |
| seedStripeTestData, stripeTestGroundTruth, stripeHealthCheck | Harness de test/ops del sync engine (dormido hasta primer cliente live) |
| guardDealActivationStatus, updateDealActivationStatus, updateMigrationTaskStatus | Superficie admin de activaciones viva (AdminActivationDetail) aunque sin caller src |
| approveAgentRun | Superficie de approvals viva (AdminApprovals) aunque sin caller src |

### Vivas-por-referencia (NO tocadas, ya deprecadas + RLS admin desde SECURITY-1)
SaaSProfile / ShippingProfile: 0 filas pero referenciadas por computeVerticalStatus,
getOnboardingStatus y processUploadedFile (vivas). Borrarlas exigiría tocar código vivo — fuera de alcance.

## Verificación post-purga
- submitPaymentsAnalysis online FR (Stripe, GMV 30k, ticket 50, intl 15) → 226.25 / 149.5 bps,
  anual {2210.4, 2763, 3315.6} — **byte-idéntico al patrón de retrocompat**. ✓
- submitPaymentsAnalysis in-store ES (SumUp) → cohort `sumup|ANY|EU-ES|in_store`, multi-anchor
  smile_and_pay 155 bps, already_optimized. ✓
- getPaymentsGapTeaser (lectura anónima de la sesión ES) → 200, allowlist intacta. ✓
- getMyPaymentsHistory → 200. ✓
- stripeHealthCheck (función con sonda) → 200 + fila quarantine_probe escrita. ✓

## Segundo barrido (a partir de 2026-08-15)
1. `OperationalLog.filter({event_type:"quarantine_probe"})` — revisar qué sondas dispararon.
2. Silenciosas ⇒ borrar función (y Subscription + startSubscription juntos, exportando las 2 filas antes).
3. apiAuth: borrar directamente si nadie reportó el 410.