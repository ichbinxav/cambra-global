# PRODUCTION_FUNCTIONS.md — Manifiesto de funciones backend (CONSOLIDATE-1 T1)

**Censo:** 2026-07-24 (actualizado 2026-08-03 con RECOVER-1/RECOVER-2) · **Total: 147 funciones** · Generado por análisis estático de `base44/functions/*/entry.ts` + índice de callers en `src/` + automatizaciones registradas en plataforma. **Este documento es SOLO el mapa** — no se borró ni archivó nada. Es la base del segundo barrido PURGE-2 (15-ago).

**Tripwire:** `src/lib/productionFunctions.static.test.js` falla si aparece una función no listada aquí (o si se borra una listada sin actualizar el manifiesto).

## Leyenda

- **Clase:** `A` merchant-facing · `A-API` API pública de partners (key/OAuth) · `B` admin/founder-OS interno · `C` scheduled (automatización) · `D` dev/test/seed · `E` deprecated (tag QUARANTINE 15-ago) · `F` vertical futura
- **Auth:** `anon` público (con rate-limit donde se indica) · `me` `auth.me()` + 401 · `admin` check de rol · `gate` internalGate / x-internal-secret · `key` API-key/OAuth-token hasheado · `pública` sin auth por diseño
- **SR:** usa `asServiceRole` · **Navegador:** cualquier función es un endpoint HTTP; "sí" = utilizable sin secreto interno (el auth listado es la única barrera)

## Resumen

| Clase | Nº | Notas |
|---|---|---|
| A (merchant) | 37 | funnel anónimo (7), dashboard/connect/vault autenticado (24), aceptación Recover Margin (3 — RECOVER-1), cobro del success fee (3 — RECOVER-2: alta de método de pago, refresco de estado y webhook firmado) |
| A-API (partners) | 6 | apiAuth, apiOpenApiSpec, apiV1, mcpServer, oauthAuthorize, oauthToken |
| B (admin/founder-OS) | 77 | incl. 44 agentes/orquestadores del founder-OS (via agentRegistry) |
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
| getRecoverAcceptanceContext | me (+ ownership activación/marca) | ✓ | DealActivation, Brand, Baseline, BillingRule, Mandate | popup de aceptación Recover Margin |
| startRecoverAcceptance | me (+ ownership) | ✓ | DealActivation, Brand, Baseline, BillingRule, Mandate | popup de aceptación Recover Margin |
| acceptRecoverMandate | me (+ ownership) | ✓ | Mandate, DealActivation, Brand, Baseline, BillingRule, AuthorizationLog, OperationalLog | popup de aceptación Recover Margin |
| startPaymentMethodSetup | me (+ ownership; exige Mandate `active`) | ✓ | DealActivation, Brand, Mandate | PaymentMethodSetupCard (RECOVER-2) |
| refreshPaymentMethodStatus | me (+ ownership) | ✓ | DealActivation | PaymentMethodSetupCard (RECOVER-2) |
| getRecoverContractStatus | me (+ ownership) o admin | ✓ | Mandate, DealActivation, Brand | ContractDocumentCard (RECOVER-3) |
| downloadRecoverContract | me (+ ownership) o admin | ✓ | Mandate, DealActivation, Brand | ContractDocumentCard / RecoverContractAdminPanel |
| generateRecoverContractPdf | gate (interno) o admin | ✓ | Mandate, DealActivation, Brand, OperationalLog | acceptRecoverMandate (fire-and-forget), reconciliador, admin |
| sendRecoverContractEmail | gate (interno) o admin | ✓ | Mandate, OperationalLog | generateRecoverContractPdf, reconciliador, admin (resend explícito) |
| stripeBillingWebhook | pública por diseño — firma HMAC de Stripe (`stripe-signature`) + secret por modo | ✓ | DealActivation, Invoice, PaymentEvent, MonthlySavingsReport | Stripe (cuenta de facturación de CAMBRA) — RECOVER-4: también invoice.*/dispute/credit_note, dedupe por event.id |
| recordConditionsActivation | admin (humano — verifica evidencia) | ✓ | DealActivation, Mandate, OperationalLog | AdminActivationDetail (RECOVER-4 — ancla el calendario contractual) |
| checkVatVies | admin o gate | ✓ | Brand, OperationalLog | admin / pre-facturación (RECOVER-4 — validación VIES) |
| approveRecoverReportForInvoicing | admin | ✓ | MonthlySavingsReport, DealActivation, Brand, Mandate, BillingRule, OperationalLog | admin (RECOVER-4 — gate humano medición→facturable) |
| createEligibleRecoverInvoices | admin o gate (scheduler mensual) | ✓ | MonthlySavingsReport, DealActivation, Brand, Mandate, Invoice, PaymentEvent, OperationalLog | admin / scheduler (RECOVER-4 — factura Stripe variable, numeración Stripe) |

## A-API — API de partners (6)

| Función | Auth | SR | Entidades |
|---|---|---|---|
| apiAuth | key | – | – (helper compartido) |
| apiOpenApiSpec | pública (spec) | – | – |
| apiV1 | key hasheada + scoping por org | ✓ | OAuthToken, ApiKey, ApiUsageRecord, Organization +2 |
| mcpServer | key/OAuth bearer | ✓ | OAuthToken, ApiKey, RateLimitCounter +3 |
| oauthAuthorize | me | ✓ | OAuthApp, OrganizationMember, OAuthAuthorizationCode |
| oauthToken | client_secret + cap 10KB | ✓ | OAuthApp, OAuthAuthorizationCode, OAuthToken |

## C — Scheduled (8)

| Función | Trigger | Auth | Entidades |
|---|---|---|---|
| purgePaymentsAnalysisSessions | diario 01:15 | gate | PaymentsAnalysisSession |
| purgeInactiveLeads | mensual día 1, 01:30 UTC | gate (admin o interno) | Lead, OutboundLead |
| processWebhookDeadLetters | cada 5 min | gate | WebhookDeadLetter, WebhookEndpoint, WebhookDelivery |
| scheduledBenchmarkRecompute | lunes 01:00 UTC | gate | BenchmarkContribution, BenchmarkCohort, BenchmarkUpdateLog |
| billApiUsage | mensual día 1 | gate | ApiUsageRecord, Organization, Invoice |
| sendMonthlySavingsSummary | mensual día 1 | me+admin | User, Brand, AnalyzerResult |
| engineeringReportAgent | diario 07:00 y 15:00 | me+admin | AgentTask, Event |
| retryPendingRecoverContracts | cada 15 min | gate (admin o interno) | Mandate, OperationalLog |
| recoverBillingDigest | lunes 09:00 (Europe/Madrid) | **SIN GATE — ver nota** | MonthlySavingsReport, DealActivation, Brand, OperationalLog |

**Nota sobre `recoverBillingDigest` (único endpoint sin mecanismo de auth).** La invocación del scheduler no lleva sesión de usuario y no puede portar el secreto interno, así que la función es alcanzable sin autenticar. Es el ÚNICO endpoint cuya seguridad descansa en un argumento y no en un mecanismo, y por eso queda escrito aquí y no solo en el comentario del código. El argumento, en cuatro puntos: (1) no acepta ningún parámetro — el cuerpo de la petición se ignora por completo, así que un llamante no puede influir en qué se lee ni a quién se escribe; (2) su respuesta son solo contadores agregados (cuántos meses cerrados no tienen informe generado, cuántos informes esperan aprobación, cuántos esperan factura, cuántos están bloqueados) más el mes vigilado en formato `YYYY-MM` — cero PII, cero importes, cero identificadores; DIGEST-GAP-1 (2026-08-04) añadió el primer contador y la lectura de `DealActivation`, y por diseño solo aumenta el recuento: el nombre del comercio y el mes viajan únicamente dentro del correo al destinatario de entorno, nunca en la respuesta HTTP; (3) solo puede enviar correo a la dirección configurada en el entorno (`ADMIN_NOTIFICATION_EMAIL` / `FOUNDER_EMAIL`), nunca a un destinatario suministrado; (4) ventana de 6 h verificada contra `OperationalLog` antes de enviar, de modo que un llamante anónimo no puede usarla para inundar ese buzón. No aprueba informes ni emite facturas: es un recordatorio. Si alguna de esas cuatro propiedades cambia, la función necesita un gate real.

## B — Admin / founder-OS interno (77)

Todas con auth `me+admin` (o `gate`) y mayoritariamente SR. Agrupadas:

**Producción autenticada (3):**

| Función | Auth | SR | Entidades | Caller principal |
|---|---|---|---|---|
| getMyReferralLink | me (gate de usuario autenticado) | ✓ | ReferralLink | ShareResultButton / InviteCollectiveBlock |
| getMyReferralStatus | me (`auth.me()` + 401) | ✓ | ReferralLink | Referrals / EffectiveFeePanel |
| applyReferralActivation | admin o `gate` (internalGate) | ✓ | ReferralActivation, ReferralLink, PaymentsAnalysisSession, Brand, DealActivation, BillingRule | admin / futura automatización sobre MonthlySavingsReport |

**Paneles admin (32):** adminOverrides, adminSummaries, adminUpdateApplicationStatus, answerAgentQuestion, chatChiefOrchestrator, createApiKey, createPaymentLink, discoveryTechStackAgent, driveConnectionCheck, generateInvoicePdf, generateMonthlySavingsReport (gate), getActivationAdminDetail, getAdminRecommendationQueue, getCommandCenterPulse, getWaitlistAggregate, getWaitlistLeads, gmailConnectionCheck, integritySummary, reconcileInvoice, recordPayment (gate), regenerateRecommendationsForBrand (gate), revokeApiKey, stripeBillingKeyCheck (RECOVER-2 — diagnóstico de claves/secrets de la cuenta de facturación; nunca devuelve valores), sheetsConnectionCheck, slackConnectionCheck, copilotChat (founder copilot), founderCopilotAgent, investorUpdateAgent, qaAgent, getBenchmarkForReport (verificado: sin gate por diseño — devuelve solo agregados de cohorte, filtra `is_public=false` (cohortes con n<5) y nunca emite `source_anon_id` ni contribuciones individuales), buildInfrastructureGraph (sin caller), discoverCompanyInfrastructure (sin caller)

**DEPRECATED (BILLING-FIX-1, 2026-08-04):** generateInvoiceFromReport — stub 410 Gone. Emitía numeración local `max+1` sin unicidad en `(series, sequence)` y no comprobaba si el informe ya estaba facturado. Sustituida por `createEligibleRecoverInvoices` (numeración de Stripe + dedupe por `(deal_activation_id, month)`). Se conserva el fichero para que un trigger de plataforma no visible en el repo falle ruidosamente en vez de duplicar facturas. Ver `Decision_Log_BILLING_FIX1.md`.

**Agentes founder-OS vía agentRegistry (38):** blogAgent, brainOrchestrator, codeReviewAgent, competitorMonitorAgent, complianceAgent, contractIPAgent, crmAgent, fixValidatorAgent, followUpAgent, gdprAgent, leadDiscoveryAgent, leadEnrichmentAgent, leadOrchestrator, leadScoringAgent, legalReviewAgent, linkedinAgent, marketingOrchestrator, meetingAgent, newsletterAgent, outreachAgent, outreachOrchestrator, providerMonitorAgent, providerResearchAgent, qaMonitorAgent, recommendationEngineAgent, researchOrchestrator, securityAgent, seoAgent, spendIntelligenceAgent, systemHealthAgent, xTwitterAgent (+7 ya listados arriba con doble rol)

**Internos sin caller en src/ (candidatos a revisión PURGE-2, NO tocados):** generateRecommendations (gate), inferVendorsFromBankData (gate — clase F, banking), onBrandCreated (gate — trigger sin automatización registrada), onSavingsEvidenceEvent (gate — ídem), regenerateMigrationTasks, revokeMandate, stripeDisconnect (legado, superseded por stripeConnectionDisconnect)

## D — Dev/test/seed (11)

_tenantGuard · createSelfTestBrand · phase2CleanupLegacyFields (migración one-off ejecutada) · runApiSelfTests · runFlowSelfTests · seedComplianceRules · seedDemoData · seedIntegrationCatalog · seedPaymentsRateTable · sendTestWebhook · verifyRegistrySync — todas `me+admin`.

## Mantenimiento

1. Función nueva → añadir fila aquí + nombre en `MANIFEST` de `productionFunctions.static.test.js` (el test rompe si no).
2. Función borrada (PURGE-2) → quitar de ambos.
3. La clasificación de auth es estática (grep de mecanismos) — la verificación profunda vive en Decision_Log_SECURITY2.md.