# PRODUCTION_FUNCTIONS.md — Manifiesto de funciones backend (CONSOLIDATE-1 T1)

**Censo:** 2026-07-24 (actualizado 2026-08-09 con ECL P8 + P9 Recover Fulfilment & Payments Migration + Final Autonomous Platform Seal) · **Total: 188 funciones** · Generado por análisis estático de `base44/functions/*/entry.ts` + índice de callers en `src/` + automatizaciones registradas en plataforma. **Este documento es SOLO el mapa** — no se borró ni archivó nada. Es la base del segundo barrido PURGE-2 (15-ago).

**Tripwire:** `src/lib/productionFunctions.static.test.js` falla si aparece una función no listada aquí (o si se borra una listada sin actualizar el manifiesto).

## Leyenda

- **Clase:** `A` merchant-facing · `A-API` API pública de partners (key/OAuth) · `B` admin/founder-OS interno · `C` scheduled (automatización) · `D` dev/test/seed · `E` deprecated (tag QUARANTINE 15-ago) · `F` vertical futura
- **Auth:** `anon` público (con rate-limit donde se indica) · `me` `auth.me()` + 401 · `admin` check de rol · `gate` internalGate / x-internal-secret · `key` API-key/OAuth-token hasheado · `pública` sin auth por diseño
- **SR:** usa `asServiceRole` · **Navegador:** cualquier función es un endpoint HTTP; "sí" = utilizable sin secreto interno (el auth listado es la única barrera)

## Resumen

| Clase | Nº | Notas |
|---|---|---|
| A (merchant) | 39 | funnel, dashboard/connect/vault, Recover acceptance/billing y P9 payments migration (proyección cliente + arranque idempotente) |
| A-API (partners) | 6 | apiAuth, apiOpenApiSpec, apiV1, mcpServer, oauthAuthorize, oauthToken |
| B (admin/founder-OS) | 79 | incl. founder-OS y P9 migration operations admin |
| C (scheduled / scheduler-ready) | 11 | billApiUsage, engineeringReportAgent†, processWebhookDeadLetters, purgeInactiveLeads, purgePaymentsAnalysisSessions, scheduledBenchmarkRecompute, sendMonthlySavingsSummary† |
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
| getMyBillingRecords | me | ✓ | Brand, Invoice, MonthlySavingsReport, Baseline | Invoices, Reports (v61-D: tenant scope desde la sesión, sin brand_id del cliente; respuesta proyectada) |
| getMyPaymentsMigration | me (+ ownership server-side) | ✓ | DealActivation, MigrationTask | PaymentsMigrationCard (P9: proyección customer-safe; oculta notas/owners/retries internos y solo expone blockers que requieren al comercio) |
| getMyRecoveryCommitments | me (brand ownership server-side) | ✓ | Brand, DealActivation, BillingRule | Account / cancellation preview; proyección segura de Recovery Terms y fee actual |
| cancelCambraService | me + confirmación explícita + acknowledgement de Recoveries | ✓ | Brand, DealActivation, OperationalLog | Account; cancela relación general, pausa Recoveries no activados y conserva V2 ya activados |
| startPaymentsMigration | me owner o admin; exige Mandate active | ✓ | DealActivation, Mandate, MigrationTask, OperationalLog | acceptRecoverMandate fire-and-forget + bootstrap idempotente P9; authorized → migrating y crea plan CAMBRA-owned |
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
| getRecoverAcceptanceContext | me (+ ownership activación/marca) | ✓ | DealActivation, Brand, Baseline, BillingRule, Mandate, PaymentsAnalysisVerified, StripeConnection | popup Recover; P5 bloquea apertura si no hay fuente de pago verificada/fresca |
| startRecoverAcceptance | me (+ ownership) | ✓ | DealActivation, Brand, Baseline, BillingRule, Mandate, SavingsEvidence + fuentes Stripe/ECL | popup Recover; P5 materializa evidencia canónica, exige `freeze_baseline` y congela evidence binding en snapshot |
| acceptRecoverMandate | me (+ ownership; 2 aceptaciones explícitas) | ✓ | Mandate, DealActivation, Brand, Baseline, BillingRule, EvidenceAttestation, SavingsEvidence, AuthorizationLog, OperationalLog | popup Recover; P5 refresca binding, crea attestation checksum-bound y exige `recover_proposal` antes de activar |
| startPaymentMethodSetup | me (+ ownership; exige Mandate `active`) | ✓ | DealActivation, Brand, Mandate | PaymentMethodSetupCard (RECOVER-2) |
| refreshPaymentMethodStatus | me (+ ownership) | ✓ | DealActivation | PaymentMethodSetupCard (RECOVER-2) |
| getRecoverContractStatus | me (+ ownership) o admin | ✓ | Mandate, DealActivation, Brand | ContractDocumentCard (RECOVER-3) |
| downloadRecoverContract | me (+ ownership) o admin | ✓ | Mandate, DealActivation, Brand | ContractDocumentCard / RecoverContractAdminPanel |
| eclProcessEvidence | admin externo; caller interno solo con `INTERNAL_CALL_SECRET`; attest sigue owner-only | ✓ | StatementImport, SavingsEvidence, EvidenceLifecycleEvent, EvidenceAttestation, EvidenceStrike, ReviewCase, Baseline | admin / eclReviewWorkflow / bridge P5; único motor de clasificación, nunca un bypass de billing |
| eclIncidentWorkflow | **admin-only** | ✓ | OperationalIncident, AgentTask + invocación allowlisted de workers | P7 `/admin/ecl-operations`; list/get/acknowledge/recover/resolve con claim anti-concurrencia; no acepta function names arbitrarios |
| generateRecoverContractPdf | gate (interno) o admin | ✓ | Mandate, DealActivation, Brand, OperationalLog | acceptRecoverMandate (fire-and-forget), reconciliador, admin |
| sendRecoverContractEmail | gate (interno) o admin | ✓ | Mandate, OperationalLog | generateRecoverContractPdf, reconciliador, admin (resend explícito) |
| stripeBillingWebhook | pública por diseño — firma HMAC de Stripe (`stripe-signature`) + secret por modo | ✓ | DealActivation, Invoice, PaymentEvent, MonthlySavingsReport | Stripe — P6: dedupe autoritativo + GET fresco del invoice antes de mutar; valida id/customer/currency/total/metadata y cuarentena mismatches |
| recordConditionsActivation | admin (humano — verifica evidencia) | ✓ | DealActivation, Mandate, OperationalLog | AdminActivationDetail (RECOVER-4 — ancla el calendario contractual) |
| checkVatVies | admin o gate | ✓ | Brand, OperationalLog | admin / pre-facturación (RECOVER-4 — validación VIES) |
| approveRecoverReportForInvoicing | admin | ✓ | MonthlySavingsReport, DealActivation, Brand, Mandate, Baseline, SavingsEvidence, ReviewCase, EvidenceStrike, BillingRule, OperationalLog | admin; P5 exige gate canónico `approve_report` antes del primer write de elegibilidad |
| createEligibleRecoverInvoices | admin o gate (scheduler mensual) | ✓ | MonthlySavingsReport, DealActivation, Brand, Mandate, Baseline, SavingsEvidence, ReviewCase, EvidenceStrike, Invoice, PaymentEvent, OperationalLog | admin / scheduler; P5 autoriza `create_invoice`; P6 reclama `execution_key` local antes del primer Stripe POST y mantiene idempotency keys por report |

## A-API — API de partners (6)

| Función | Auth | SR | Entidades |
|---|---|---|---|
| apiAuth | key | – | – (helper compartido) |
| apiOpenApiSpec | pública (spec) | – | – |
| apiV1 | key hasheada + scoping por org | ✓ | OAuthToken, ApiKey, ApiUsageRecord, Organization +2 |
| mcpServer | key/OAuth bearer | ✓ | OAuthToken, ApiKey, RateLimitCounter +3 |
| oauthAuthorize | me | ✓ | OAuthApp, OrganizationMember, OAuthAuthorizationCode |
| oauthToken | client_secret + cap 10KB | ✓ | OAuthApp, OAuthAuthorizationCode, OAuthToken |

## C — Scheduled / scheduler-ready (12)

| Función | Trigger | Auth | Entidades |
|---|---|---|---|
| purgePaymentsAnalysisSessions | diario 01:15 | gate | PaymentsAnalysisSession |
| purgeInactiveLeads | mensual día 1, 01:30 UTC | gate (admin o interno) | Lead, OutboundLead |
| processWebhookDeadLetters | **cada 5 min vía automation versionada** | gate; replay `exhausted` exige admin + `REPLAY_EXHAUSTED` | WebhookDeadLetter, WebhookEndpoint, WebhookDelivery, AgentTask | P7 conserva delivery id estable, claim pre-send y retry budget; replay manual queda bounded |
| scheduledBenchmarkRecompute | lunes 01:00 UTC | gate | BenchmarkContribution, BenchmarkCohort, BenchmarkUpdateLog |
| billApiUsage | mensual día 1 | gate | ApiUsageRecord, Organization, Invoice |
| sendMonthlySavingsSummary | mensual día 1 | me+admin | User, Brand, AnalyzerResult |
| engineeringReportAgent | diario 07:00 y 15:00 | me+admin | AgentTask, Event |
| retryPendingRecoverContracts | cada 15 min | gate (admin o interno) | Mandate, OperationalLog |
| recoverBillingDigest | lunes 09:00 (Europe/Madrid) | **SIN GATE — ver nota** | MonthlySavingsReport, DealActivation, Brand, OperationalLog |
| eclLifecycleScheduler | **cada 15 min vía automation versionada en `function.jsonc`; cada invocación registra best-effort AgentTask `ecl_lifecycle_scheduler`** | gate (admin o interno; scheduled task autentica como app-owner admin) | StatementImport, SavingsEvidence, EvidenceLifecycleEvent, ReviewCase, AgentTask |
| reconcileRecoverBilling | **cada 15 min vía automation versionada en `function.jsonc`** | gate (admin o interno; scheduled task autentica como app-owner admin) | Invoice, PaymentEvent, MonthlySavingsReport, DealActivation, AgentTask | P6: solo GET a Stripe; P7 añade liveness telemetry `recover_billing_reconciler`; cero POST a Stripe |
| eclProductionHealth | **cada 10 min vía automation versionada** | gate (admin o interno) | AgentTask, StatementImport, SavingsEvidence, Invoice, WebhookDeadLetter, ReviewCase, OperationalIncident | P7: lecturas críticas autoritativas/fail-closed; materializa/auto-resuelve señales, **nunca ejecuta recovery** ni muta economía/evidencia |

**`recoverBillingDigest` está gated y versionado.** Corre cada 7 días mediante `base44/functions/recoverBillingDigest/function.jsonc`, usando el mismo modelo de scheduler app-owner admin que el resto de automations versionadas. También admite `INTERNAL_CALL_SECRET` y ejecución manual admin; llamadas anónimas fallan cerradas. Sigue siendo read-only respecto a economía: solo envía el digest al destinatario configurado y registra `OperationalLog`; no aprueba informes ni crea facturas. La ventana de 6 h actúa además como guard de replay/idempotencia y `coverage_truncated` hace visible cualquier consulta que alcance su límite en lugar de fingir cobertura completa.

## Final Autonomous Platform Seal — commercial autonomy surface

| Función | Clase/Auth | Entidades | Autoridad |
|---|---|---|---|
| commercialPolicyAdmin | B · admin | CommercialPolicy, OperationalLog | Crea/activa/pausa policy versionada; activación exige confirmación explícita y supersede policy previa del mismo engine |
| autonomousCommercialWorker | C · gate | CommercialPolicy, OutboundLead, ContactSuppression, CommunicationThread, CommunicationMessage, AgentTask | Hourly acquisition loop; no envía sin policy activa, legal_basis, score mínimo, business-hours, suppression y daily cap |
| commercialFollowUpWorker | C · gate | CommercialPolicy, CommunicationThread, CommunicationMessage, AgentTask | Hourly due-follow-up loop; stops on inbound reply/suppression/max followups and requires policy + business-hours unless explicit manual override |
| commercialSendMessage | B/internal · gate | CommunicationThread, CommunicationMessage, ContactSuppression, CommercialPolicy | Único sender autónomo; revalida policy/action/classification/suppression/idempotency antes de Resend |
| resendInboundWebhook | pública por diseño · firma Svix/Resend | CommunicationThread, CommunicationMessage, ContactSuppression, OperationalLog | Verifica `svix-*` sobre body raw; `email.received` recupera cuerpo por Resend Receiving API; bounce/complaint suprimen |
| commercialReplyAgent | B/internal · gate | CommunicationThread, CommunicationMessage, CommercialPolicy, Approval, AgentTask | Clasifica reply; routine reply solo dentro de policy; unsubscribe stop; L4 crea Approval; provider offers pasan al negotiation case |
| startProviderNegotiation | B/internal · gate | DealActivation, Mandate, Provider, ProviderContact, CommercialPolicy, NegotiationCase, CommunicationThread | Solo Recover payments autorizado + Mandate active con `renegotiate_with_provider=true`; si falta contacto invoca `providerContactResolver` antes de bloquear |
| outlookInboundRouter | connector automation · Outlook `created` | CommunicationThread, CommunicationMessage, ContactSuppression, OperationalLog + Outlook shared connector | Event-driven Outlook inbox router; safely ignores non-email `created` events, maps conversationId/sender to CAMBRA thread, dedupes and invokes reply loop |
| outlookMeetingCoordinator | B/internal · gate | CommunicationThread, OutboundLead, AgentTask, OperationalLog + Outlook shared connector | Reads real Outlook calendar availability, creates a 30-minute event in the connected founder calendar and invites the lead; no fabricated slots |
| providerContactResolver | B/internal · gate | Provider, ProviderContact, Document | Resuelve contacto operativo en orden: relación merchant/documentación explícita → CRM/directorio previo → Apollo → investigación pública; nunca inventa emails; guarda provenance/confidence |
| providerNegotiationAgent | B/internal · gate | NegotiationCase, NegotiationOffer, CommunicationThread, CommunicationMessage, Approval, AgentTask | Multi-round pricing; estructura offers; puede contraofertar; final/material/max-round/target alcanzado → L4 Approval, nunca autoacepta |
| reviewProviderContract | B/internal · gate | NegotiationCase, NegotiationOffer, Approval, AgentTask | Extracts contract terms from supplied contract text and deterministically compares against approved offer; mismatch/unusual clause → L4; never executes/signs |
| resolveCommercialApproval | B · admin | Approval, NegotiationCase, NegotiationOffer, DealActivation, Mandate, CommunicationThread, OperationalLog | Revalida offer vigencia + Recover + mismo Mandate antes de aprobar; aprobación comercial no firma contrato ni hace go-live |

## B — Admin / founder-OS interno (79)

| Función | Auth | SR | Entidades | Caller principal |
|---|---|---|---|---|
| getAdminOperationsCockpit | admin | ✓ | AgentTask, OperationalIncident, Approval, AgentQuestion, ReviewCase, MonthlySavingsReport, Invoice, WebhookDeadLetter | P8 `/admin` + `/admin/automations`; proyección read-only de salud/atención |
| adminAgentOperations | admin | ✓ | AgentTask, OperationalLog + invocación de allowlist fija de agentes | P8 `/admin/agents`; status + run manual allowlisted, sin arbitrary function invocation |
| updatePaymentsMigrationTask | admin | ✓ | MigrationTask, DealActivation, OperationalLog | P9 AdminActivationDetail; avance secuencial, blocker/retry, go-live gate y verificación exige conditions activation evidence |



Todas con auth `me+admin` (o `gate`) y mayoritariamente SR. Agrupadas:

**Producción autenticada (3):**

| Función | Auth | SR | Entidades | Caller principal |
|---|---|---|---|---|
| getMyReferralLink | me (gate de usuario autenticado) | ✓ | ReferralLink | ShareResultButton / InviteCollectiveBlock |
| getMyReferralStatus | me (`auth.me()` + 401) | ✓ | ReferralLink | Referrals / EffectiveFeePanel |
| applyReferralActivation | admin o `gate` (internalGate) | ✓ | ReferralActivation, ReferralLink, PaymentsAnalysisSession, Brand, DealActivation, BillingRule | admin / futura automatización sobre MonthlySavingsReport |

**Paneles admin (34):** eclIncidentWorkflow (ECL P7 — operaciones/incidentes, admin-only, recovery allowlisted y CAS; consumido por `/admin/ecl-operations`), eclReviewWorkflow (ECL P4/P4 Production Proof — runtime/list/get/resolve, admin-only, CAS `resolving`, reprocess canónico; consumido por `/admin/evidence-review`; runtime proyecta solo el último AgentTask del scheduler), adminOverrides, adminSummaries, adminUpdateApplicationStatus, answerAgentQuestion, chatChiefOrchestrator, createApiKey, createPaymentLink, discoveryTechStackAgent, driveConnectionCheck, generateInvoicePdf, generateMonthlySavingsReport (gate; P5: cuando la medición es `fully_verified` intenta refrescar SavingsEvidence canónico; un fallo conserva el informe pero los gates económicos posteriores bloquean), getActivationAdminDetail, getAdminRecommendationQueue, getCommandCenterPulse, getWaitlistAggregate, getWaitlistLeads, gmailConnectionCheck, integritySummary, reconcileInvoice (P6: bloqueado para Recover Stripe; sin ajustes en facturas finalizadas), recordPayment (gate; P6: bloqueado para Recover Stripe), regenerateRecommendationsForBrand (gate), revokeApiKey, stripeBillingKeyCheck (RECOVER-2 — diagnóstico de claves/secrets de la cuenta de facturación; nunca devuelve valores), sheetsConnectionCheck, slackConnectionCheck, copilotChat (founder copilot), founderCopilotAgent, investorUpdateAgent, qaAgent, getBenchmarkForReport (verificado: sin gate por diseño — devuelve solo agregados de cohorte, filtra `is_public=false` (cohortes con n<5) y nunca emite `source_anon_id` ni contribuciones individuales), buildInfrastructureGraph (sin caller), discoverCompanyInfrastructure (sin caller)

**DEPRECATED (BILLING-FIX-1, 2026-08-04):** generateInvoiceFromReport — stub 410 Gone. Emitía numeración local `max+1` sin unicidad en `(series, sequence)` y no comprobaba si el informe ya estaba facturado. Sustituida por `createEligibleRecoverInvoices` (numeración de Stripe + dedupe por `(deal_activation_id, month)`). Se conserva el fichero para que un trigger de plataforma no visible en el repo falle ruidosamente en vez de duplicar facturas. Ver `Decision_Log_BILLING_FIX1.md`.

**Agentes founder-OS vía agentRegistry (38):** blogAgent, brainOrchestrator, codeReviewAgent, competitorMonitorAgent, complianceAgent, contractIPAgent, crmAgent, fixValidatorAgent, followUpAgent, gdprAgent, leadDiscoveryAgent, leadEnrichmentAgent, leadOrchestrator, leadScoringAgent, legalReviewAgent, linkedinAgent, marketingOrchestrator, meetingAgent, newsletterAgent, outreachAgent, outreachOrchestrator, providerMonitorAgent, providerResearchAgent, qaMonitorAgent, recommendationEngineAgent, researchOrchestrator, securityAgent, seoAgent, spendIntelligenceAgent, systemHealthAgent, xTwitterAgent (+7 ya listados arriba con doble rol)

**Internos sin caller en src/ (candidatos a revisión PURGE-2, NO tocados):** generateRecommendations (gate), inferVendorsFromBankData (gate — clase F, banking), onBrandCreated (gate — trigger sin automatización registrada), onSavingsEvidenceEvent (gate — ídem), regenerateMigrationTasks, revokeMandate, stripeDisconnect (legado, superseded por stripeConnectionDisconnect)

## D — Dev/test/seed (11)

_tenantGuard · createSelfTestBrand · phase2CleanupLegacyFields (migración one-off ejecutada) · runApiSelfTests · runFlowSelfTests · seedComplianceRules · seedDemoData · seedIntegrationCatalog · seedPaymentsRateTable · sendTestWebhook · verifyRegistrySync — todas `me+admin`.

## Mantenimiento

1. Función nueva → añadir fila aquí + nombre en `MANIFEST` de `productionFunctions.static.test.js` (el test rompe si no).
2. Función borrada (PURGE-2) → quitar de ambos.
3. La clasificación de auth es estática (grep de mecanismos) — la verificación profunda vive en Decision_Log_SECURITY2.md.