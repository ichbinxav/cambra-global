# PRODUCTION_FUNCTIONS.md — Manifiesto de funciones backend (CONSOLIDATE-1 T1)

**Censo:** 2026-07-24 · **Total: 142 funciones** · Generado por análisis estático de `base44/functions/*/entry.ts` + índice de callers en `src/` + automatizaciones registradas en plataforma. **Este documento es SOLO el mapa** — no se borró ni archivó nada. Es la base del segundo barrido PURGE-2 (15-ago).

**Tripwire:** `src/lib/productionFunctions.static.test.js` falla si aparece una función no listada aquí (o si se borra una listada sin actualizar el manifiesto).

## Leyenda

- **Clase:** `A` merchant-facing · `A-API` API pública de partners (key/OAuth) · `B` admin/founder-OS interno · `C` scheduled (automatización) · `D` dev/test/seed · `E` deprecated (tag QUARANTINE 15-ago) · `F` vertical futura
- **Auth:** `anon` público (con rate-limit donde se indica) · `me` `auth.me()` + 401 · `admin` check de rol · `gate` internalGate / x-internal-secret · `key` API-key/OAuth-token hasheado · `pública` sin auth por diseño
- **SR:** usa `asServiceRole` · **Navegador:** cualquier función es un endpoint HTTP; "sí" = utilizable sin secreto interno (el auth listado es la única barrera)

## Resumen

| Clase | Nº | Notas |
|---|---|---|
| A (merchant) | 31 | funnel anónimo (7), dashboard/connect/vault autenticado (24) |
| A-API (partners) | 6 | apiAuth, apiOpenApiSpec, apiV1, mcpServer, oauthAuthorize, oauthToken |
| B (admin/founder-OS) | 76 | incl. 44 agentes/orquestadores del founder-OS (via agentRegistry) |
| C (scheduled) | 7 | billApiUsage, engineeringReportAgent†, processWebhookDeadLetters, purgeInactiveLeads, purgePaymentsAnalysisSessions, scheduledBenchmarkRecompute, sendMonthlySavingsSummary† |
| D (dev/test/seed) | 11 | _tenantGuard, createSelfTestBrand, phase2CleanupLegacyFields, runApiSelfTests, runFlowSelfTests, seedComplianceRules, seedDemoData, seedIntegrationCatalog, seedPaymentsRateTable, sendTestWebhook, verifyRegistrySync |
| E (QUARANTINE 15-ago) | 16 | ver tabla — probe de invocación activo (OperationalLog `quarantine_probe`) |
| F (vertical futura) | 1 | inferVendorsFromBankData (banking) |

† engineeringReportAgent y sendMonthlySavingsSummary tienen doble rol (B/A + C); se cuentan en C por su trigger primario.

## E — Deprecated en cuarentena (borrado candidato 15-ago)

approveAgentRun · authzScope · benchmarkLearningEngine · dispatchWebhook · guardDealActivationStatus · inviteAdminUser · oauthRevoke · onInvoiceStatusEvent · promoteMeToAdmin · seedBenchmarkCohorts · seedStripeTestData · startSubscription · stripeHealthCheck · stripeTestGroundTruth · updateDealActivationStatus · updateMigrationTaskStatus

Todas llevan tag `[QUARANTINE 2026-08-15]` + probe. Regla del barrido: si el probe (OperationalLog `quarantine_probe`) sigue en silencio a fecha de revisión → borrar (exportando filas de Subscription antes, ver schema).

## A — Merchant-facing (31)

| Función | Auth | SR | Entidades | Caller principal |
|---|---|---|---|---|
| submitPaymentsAnalysis | anon + rate-limit + cap 16KB | ✓ | RateLimitCounter, PaymentsRateTable, PaymentsAnalysisSession | PaymentsAnalyzer |
| getPaymentsGapTeaser | anon (UUID sesión) + rate-limit + cap 16KB | ✓ | RateLimitCounter, PaymentsAnalysisSession | PaymentsResults |
| submitWaitlistSignup | anon + rate-limit + cap 16KB | ✓ | RateLimitCounter, Lead | JoinWaitlistButton |
| submitCallRequest | anon + rate-limit + cap 16KB | ✓ | RateLimitCounter, Lead | BookCallModal |
| submitContactMessage | anon + rate-limit + cap 16KB | ✓ | RateLimitCounter, Lead | Contact |
| joinCollective | me + rate-limit | ✓ | RateLimitCounter, CollectiveMember | CollectiveModal |
| sitemap | pública (por diseño) | – | – | crawlers |
| claimAnonPaymentsResult | me | ✓ | AnalyzerResult, PaymentsAnalysisSession, Brand | AuthContext (auto-claim post-login) |
| getPaymentsAnalysisVerified | me | ✓ | PaymentsAnalysisVerified, Brand | PaymentsResults |
| getMyPaymentsHistory | me | ✓ | AnalyzerResult | ResultsHistory |
| getBrandSavings | me | ✓ | Brand, AnalyzerResult, BrandSavings +3 | SavingsTrendPanel |
| getInfrastructureGraph | me | ✓ | Brand, InfrastructureNode, InfrastructureEdge +1 | Dashboard |
| getIntegrationStatus | me | ✓ | Brand, IntegrationCatalog, DetectedIntegration +3 | ConnectTools |
| getOnboardingStatus | me | ✓ | Brand, PaymentsProfile +2 | Onboarding |
| getUploadCapability | me | – | – | PspVerificationOptions |
| computeVerticalStatus | gate (llamada interna desde front autenticado) | ✓ | Brand, *Profiles | PaymentsModule |
| computeStripeVerifiedGap | me (+ checks internos) | ✓ | PaymentsRateTable, Brand, Integration +1 | StripeConnectCard |
| stripeOAuthConnect | me (+ ownership brand, guard multi-marca) | ✓ | Brand, StripeConnection, ConsentRecord | callback OAuth |
| stripeDataSync | me | ✓ | Brand, StripeConnection | StripeConnectCard |
| dataSyncAgent | me (+ checks internos) | ✓ | Brand, Integration, AgentTask +1 | StripeConnectCard |
| stripeConnectionDisconnect | me | ✓ | Brand, Integration, StripeConnection +1 | StripeConnectCard |
| oauthConnector | me | ✓ | Brand, OAuthState, Integration | ConnectIntegrations |
| initiateConnection | me | ✓ | Brand, IntegrationCatalog, ConnectionSession +1 | ConnectTools |
| integrationRegistry | gate parcial / lectura registry | – | – | ConnectIntegrations |
| processUploadedFile | me (+ ownership brand) | – | Brand, AnalyzerInput, StatementImport +3 | StatementUploadCard |
| runContinuousDiscovery | gate | ✓ | Brand, ContinuousDiscoveryRun +4 | LastScanBar |
| securityAuditLog | me | – | SecurityAudit | ConnectorTile |
| createDocument / listDocuments / linkDocument / unlinkDocument / updateDocumentMeta | me (+ admin en rutas de escritura sensibles) | – | Document, DocumentLink, Brand, Provider | Vault |
| sendMonthlySavingsSummary | me+admin (también C) | ✓ | User, Brand, AnalyzerResult | Account + scheduler |

## A-API — API de partners (6)

| Función | Auth | SR | Entidades |
|---|---|---|---|
| apiAuth | key | – | – (helper compartido) |
| apiOpenApiSpec | pública (spec) | – | – |
| apiV1 | key hasheada + scoping por org | ✓ | OAuthToken, ApiKey, ApiUsageRecord, Organization +2 |
| mcpServer | key/OAuth bearer | ✓ | OAuthToken, ApiKey, RateLimitCounter +3 |
| oauthAuthorize | me | ✓ | OAuthApp, OrganizationMember, OAuthAuthorizationCode |
| oauthToken | client_secret + cap 10KB | ✓ | OAuthApp, OAuthAuthorizationCode, OAuthToken |

## C — Scheduled (7)

| Función | Trigger | Auth | Entidades |
|---|---|---|---|
| purgePaymentsAnalysisSessions | diario 01:15 | gate | PaymentsAnalysisSession |
| purgeInactiveLeads | mensual día 1, 01:30 UTC | gate (admin o interno) | Lead, OutboundLead |
| processWebhookDeadLetters | cada 5 min | gate | WebhookDeadLetter, WebhookEndpoint, WebhookDelivery |
| scheduledBenchmarkRecompute | lunes 01:00 UTC | gate | BenchmarkContribution, BenchmarkCohort, BenchmarkUpdateLog |
| billApiUsage | mensual día 1 | gate | ApiUsageRecord, Organization, Invoice |
| sendMonthlySavingsSummary | mensual día 1 | me+admin | User, Brand, AnalyzerResult |
| engineeringReportAgent | diario 07:00 y 15:00 | me+admin | AgentTask, Event |

## B — Admin / founder-OS interno (76)

Todas con auth `me+admin` (o `gate`) y mayoritariamente SR. Agrupadas:

**Paneles admin (32):** adminOverrides, adminSummaries, adminUpdateApplicationStatus, answerAgentQuestion, chatChiefOrchestrator, createApiKey, createPaymentLink, discoveryTechStackAgent, driveConnectionCheck, generateInvoiceFromReport, generateInvoicePdf, generateMonthlySavingsReport (gate), getActivationAdminDetail, getAdminRecommendationQueue, getCommandCenterPulse, getWaitlistAggregate, getWaitlistLeads, gmailConnectionCheck, integritySummary, reconcileInvoice, recordPayment (gate), regenerateRecommendationsForBrand (gate), revokeApiKey, sheetsConnectionCheck, slackConnectionCheck, copilotChat (founder copilot), founderCopilotAgent, investorUpdateAgent, qaAgent, getBenchmarkForReport ⚠️(sin gate detectado — agregado sin PII; revisar en SURFACE-1), buildInfrastructureGraph (sin caller), discoverCompanyInfrastructure (sin caller)

**Agentes founder-OS vía agentRegistry (38):** blogAgent, brainOrchestrator, codeReviewAgent, competitorMonitorAgent, complianceAgent, contractIPAgent, crmAgent, fixValidatorAgent, followUpAgent, gdprAgent, leadDiscoveryAgent, leadEnrichmentAgent, leadOrchestrator, leadScoringAgent, legalReviewAgent, linkedinAgent, marketingOrchestrator, meetingAgent, newsletterAgent, outreachAgent, outreachOrchestrator, providerMonitorAgent, providerResearchAgent, qaMonitorAgent, recommendationEngineAgent, researchOrchestrator, securityAgent, seoAgent, spendIntelligenceAgent, systemHealthAgent, xTwitterAgent (+7 ya listados arriba con doble rol)

**Internos sin caller en src/ (candidatos a revisión PURGE-2, NO tocados):** generateRecommendations (gate), inferVendorsFromBankData (gate — clase F, banking), onBrandCreated (gate — trigger sin automatización registrada), onSavingsEvidenceEvent (gate — ídem), regenerateMigrationTasks, revokeMandate, stripeDisconnect (legado, superseded por stripeConnectionDisconnect)

## D — Dev/test/seed (11)

_tenantGuard · createSelfTestBrand · phase2CleanupLegacyFields (migración one-off ejecutada) · runApiSelfTests · runFlowSelfTests · seedComplianceRules · seedDemoData · seedIntegrationCatalog · seedPaymentsRateTable · sendTestWebhook · verifyRegistrySync — todas `me+admin`.

## Mantenimiento

1. Función nueva → añadir fila aquí + nombre en `MANIFEST` de `productionFunctions.static.test.js` (el test rompe si no).
2. Función borrada (PURGE-2) → quitar de ambos.
3. La clasificación de auth es estática (grep de mecanismos) — la verificación profunda vive en Decision_Log_SECURITY2.md.