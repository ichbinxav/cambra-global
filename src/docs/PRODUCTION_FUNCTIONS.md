# PRODUCTION_FUNCTIONS.md — Manifiesto de funciones backend (CONSOLIDATE-1 T1)

**Censo:** 2026-07-24 (actualizado 2026-08-11 con P1 Europe + P2 Provider Intelligence + P3 European Rate Intelligence + ECL P8/P9 + P6–P13 European Operating Architecture + pre-GO CANARY, Founder meeting seal y v0.95 P7/P8 Instantly transport) · **Total source: 300 directorios; despliegue físico: 276 funciones + 28 rutas lógicas consolidadas** · Generado por análisis estático de `base44/functions/*/entry.ts` + `base44/deployment-topology.json` + índice de callers en `src/` + automatizaciones registradas en plataforma. **Este documento es SOLO el mapa** — no se borró ni archivó nada. Es la base del segundo barrido PURGE-2 (15-ago).

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
| B (admin/founder-OS) | 81 | incl. founder-OS, P9 migration operations admin y dos controles comerciales pre-GO |
| C (scheduled / scheduler-ready) | 11 | billApiUsage, engineeringReportAgent†, processWebhookDeadLetters, purgeInactiveLeads, purgePaymentsAnalysisSessions, scheduledBenchmarkRecompute, sendMonthlySavingsSummary† |
| D (dev/test/seed) | 11 | _tenantGuard, createSelfTestBrand, phase2CleanupLegacyFields, runApiSelfTests, runFlowSelfTests, seedComplianceRules, seedDemoData, seedIntegrationCatalog, seedPaymentsRateTable, sendTestWebhook, verifyRegistrySync |
| E (QUARANTINE 15-ago) | 16 | ver tabla — probe de invocación activo (OperationalLog `quarantine_probe`) |
| F (vertical futura) | 1 | inferVendorsFromBankData (banking) |
| P10–P12 additions | 6 | 2 admin/internal control planes, 3 scheduled evidence/readiness workers and 1 conservative seed |

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
| getMyInformationRequests | me | ✓ | MerchantInformationRequest | Dashboard; devuelve solo tareas de información del merchant autenticado, sin datos internos de otros tenants |
| respondMerchantInformationRequest | me owner o admin | ✓ | MerchantInformationRequest, ProviderContact, Provider, AutonomyIncident | Dashboard; valida respuesta, guarda provenance y reanuda solo funciones allowlisted; “no lo sé” fuerza búsqueda alternativa antes de excepción |
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
| processUploadedFile | me (+ ownership brand) | – | Brand, PaymentsProfile, AnalyzerInput, StatementImport | StatementUploadCard + Vault; v2 signature/hash checks, independent Claude/OpenAI agreement, exact minor units, linked document audit and payments-statement-only fail-closed projection |
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
| processWebhookDeadLetters | **cada 5 min vía automation versionada** | gate; replay `exhausted` exige admin + `REPLAY_EXHAUSTED` | WebhookDeadLetter, WebhookEndpoint, WebhookDelivery, AgentTask, SchedulerRun | Scheduler slot guard + delivery id estable + claim pre-send y retry budget; replay manual queda bounded |
| scheduledBenchmarkRecompute | lunes 01:00 UTC | gate | BenchmarkContribution, BenchmarkCohort, BenchmarkUpdateLog |
| billApiUsage | mensual día 1 | gate | ApiUsageRecord, Organization, Invoice |
| sendMonthlySavingsSummary | mensual día 1 | me+admin | User, Brand, AnalyzerResult |
| engineeringReportAgent | diario 07:00 y 15:00 | me+admin | AgentTask, Event |
| retryPendingRecoverContracts | cada 15 min | gate (admin o interno) | Mandate, OperationalLog |
| recoverBillingDigest | lunes 09:00 (Europe/Madrid) | **SIN GATE — ver nota** | MonthlySavingsReport, DealActivation, Brand, OperationalLog |
| eclLifecycleScheduler | **cada 15 min vía automation versionada en `function.jsonc`; cada invocación registra best-effort AgentTask `ecl_lifecycle_scheduler`** | gate (admin o interno; scheduled task autentica como app-owner admin) | StatementImport, SavingsEvidence, EvidenceLifecycleEvent, ReviewCase, AgentTask, SchedulerRun | Slot guard antes de efectos; los intents ECL siguen siendo replay-safe e idempotentes. |
| reconcileRecoverBilling | **cada 15 min vía automation versionada en `function.jsonc`** | gate (admin o interno; scheduled task autentica como app-owner admin) | Invoice, PaymentEvent, MonthlySavingsReport, DealActivation, AgentTask, SchedulerRun | Slot guard; solo GET a Stripe y convergencia local; cero POST a Stripe. |
| eclProductionHealth | **cada 10 min vía automation versionada** | gate (admin o interno) | AgentTask, StatementImport, SavingsEvidence, Invoice, WebhookDeadLetter, ReviewCase, OperationalIncident | P7: lecturas críticas autoritativas/fail-closed; materializa/auto-resuelve señales, **nunca ejecuta recovery** ni muta economía/evidencia |

**`recoverBillingDigest` está gated y versionado.** Corre cada 7 días mediante `base44/functions/recoverBillingDigest/function.jsonc`, usando el mismo modelo de scheduler app-owner admin que el resto de automations versionadas. También admite `INTERNAL_CALL_SECRET` y ejecución manual admin; llamadas anónimas fallan cerradas. Sigue siendo read-only respecto a economía: solo envía el digest al destinatario configurado y registra `OperationalLog`; no aprueba informes ni crea facturas. La ventana de 6 h actúa además como guard de replay/idempotencia y `coverage_truncated` hace visible cualquier consulta que alcance su límite en lugar de fingir cobertura completa.

## Final Autonomous Platform Seal — commercial autonomy surface

| Función | Clase/Auth | Entidades | Autoridad |
|---|---|---|---|
| commercialStrategyAgent | B/internal · gate · alojada también en outboundControlAdmin | OutboundLead, CommercialPolicy, ContactSuppression, CommercialStrategy | P7 versionado: consume únicamente inteligencia canónica P1–P6, comprueba READY_FOR_CONTACT/policy/evidencia y persiste una estrategia auditable; no envía |
| commercialExecutionDryRun | B/internal · gate · alojada también en outboundControlAdmin | lectura opcional de OutboundLead, CommercialPolicy, OutboundSendingProfile, ContactSuppression | Prueba completa y no entregable lead→P7→P8→payload→reply→clasificación→NBA; `real_provider_call=false` y cero envíos |
| instantlyProviderAdmin | B · admin · alojada también en outboundControlAdmin | CommercialProviderState, OutboundSendingProfile, OutboundControl, CostUsageEvent, OperationalLog | Estado/diagnóstico API v2, campaña DRAFT, registro/rotación de webhook y test de entrega del proveedor con confirmación. La rotación admite una nueva clave solo en la petición admin y nunca la devuelve ni persiste; nunca autoactiva y la pausa remota no depende del presupuesto. |
| instantlyWebhook | pública por diseño · alojada también en resendInboundWebhook · header secreto con comparación constante | OutboundProviderEvent, CommunicationThread, CommunicationMessage, ContactSuppression, AutonomyIncident | Ingesta autenticada, idempotente y replay-safe de eventos Instantly; CAMBRA conserva el thread, la clasificación y la autoridad |
| instantlyReconciliationWorker | C/internal · alojada en processWebhookDeadLetters · cada 15 min con slot guard | CommercialProviderState, OutboundSendingProfile, OutboundProviderEvent, CostUsageEvent | Reconcilia cuentas, warm-up, campaña/webhook y eventos perdidos. La API forma parte de la suscripción fija de Instantly: reserva un suelo conservador de 1 céntimo por ciclo, manteniendo activos el presupuesto, la alerta y el kill-switch. |
| instantlyProviderEventRetryWorker | C · gate · cada 5 min · alojada también en processWebhookDeadLetters | OutboundProviderEvent, AutonomyIncident, SchedulerRun | Backoff bounded 1/5/15/60/240 min; cinco intentos y DLQ explícita, con slot guard anti-duplicado |
| instantlyReconciliationWorker | C · gate · cada 15 min · alojada también en processWebhookDeadLetters | CommercialProviderState, OutboundSendingProfile, OutboundProviderEvent, CommunicationThread, CommunicationMessage, CostUsageEvent, SchedulerRun | Reconciliación API v2 bounded de accounts/warm-up/campaign/webhook/emails; repara eventos omitidos sin reemplazar inteligencia canónica |
| commercialPolicyAdmin | B · admin | CommercialPolicy, OperationalLog | Crea/activa/pausa policy versionada; acquisition nace CANARY 10/día, sin mercados implícitos, y no se activa sin mercados/perfiles explícitos ni score ≥70 |
| backfillLegacySendingProfiles | B · admin | CommunicationThread, CommunicationMessage, CommercialPolicy, OutboundSendingProfile, OperationalLog | Migración idempotente y dry-run por defecto; resuelve solo con evidencia exacta y pausa/expone irresolubles como REVIEW_REQUIRED; apply exige confirmación explícita |
| goLiveControlAdmin | B · admin | RuntimeGateEvidence, EmergencyControl, CostBudgetControl, SchedulerRun, OperationalLog | Command plane fail-closed para DNS SPF/DKIM/DMARC, schedulers, supresión, bucle observable, presupuestos, simulacro de parada/reanudación y prueba de control Founder. Puede crear una sola vez el webhook Resend en el endpoint canónico y entregar su signing secret únicamente al Founder autenticado para traslado inmediato al vault; si el vault ya lo contiene no lo devuelve ni registra. En Instantly, el proof de campaña/webhook se aplica al perfil realmente preparado/activo/warming, mientras DNS sigue verificándose para todo el inventario pausado. Nunca certifica evidencia local como runtime real. |
| adminGlobalSearch | B · admin | Brand, Provider, OutboundLead, NegotiationCase, Invoice, Approval, AgentTask, CommunicationThread | Búsqueda global limitada y normalizada para inspección operativa; resultados etiquetados, sin mutaciones ni acceso merchant |
| costGovernanceWorker | C · gate · hourly | CostBudgetControl, CostUsageEvent, AutonomyIncident, OutboundControl, RuntimeGateEvidence | Agrega gasto diario/mensual por AI/API/enrichment/email, emite anomalías y activa kill-switch presupuestario antes de nuevas operaciones de pago |
| commercialGoLiveReadiness | B · admin | CommercialPolicy, OutboundSendingProfile, CommunicationThread, OutboundControl, P10/P11 evidence, OperationalLog | Dry-run pre-GO: valida CANARY, profiles, credenciales, mercados P10/P11 y legacy invariant; persiste hash efímero, nunca activa outbound |
| autonomousCommercialWorker | C · gate | CommercialPolicy, OutboundLead, ContactSuppression, CommunicationThread, CommunicationMessage, AgentTask | Hourly acquisition loop; no envía sin policy activa, legal_basis, score mínimo, business-hours, suppression y daily cap |
| autonomousPartnerWorker | C · gate | CommercialPolicy, PartnerProspect, ContactSuppression, CommunicationThread, CommunicationMessage, AgentTask, SchedulerRun | Hourly partner-distribution loop with duplicate-slot guard; Apollo discovery + partner-specific scoring + canonical outreach/follow-up/Outlook; no envía sin policy activa |
| commercialFollowUpWorker | C · gate | CommercialPolicy, OutboundSendingProfile, CommunicationThread, CommunicationMessage, AgentTask | Hourly due-follow-up loop; valida profile antes de policy/history/LLM y pausa como REVIEW_REQUIRED cualquier thread sin profile válido |
| commercialSendMessage | B/internal · gate | CommunicationThread, CommunicationMessage, ContactSuppression, CommercialPolicy, OutboundSendingProfile | Único sender autónomo; revalida P10/P11, mercado y profile allowlisted, policy/action/classification/suppression/idempotency y límites diarios; falta/invalid daily limit = cero envíos automáticos |
| resendInboundWebhook | pública por diseño · firma Svix/Resend | CommunicationThread, CommunicationMessage, ContactSuppression, OperationalLog | Verifica `svix-*` sobre body raw; `email.received` recupera cuerpo por Resend Receiving API; bounce/complaint suprimen |
| commercialReplyAgent | B/internal · gate | CommunicationThread, CommunicationMessage, CommercialPolicy, Approval, AgentTask | Clasifica reply; routine reply solo dentro de policy; unsubscribe stop; L4 crea Approval; provider offers pasan al negotiation case |
| founderMeetingAdmin | B · admin | FounderMeetingPolicy, CommunicationThread, FounderCommandAudit, OperationalLog + Outlook connector | Control Founder end-to-end: estado, preview/confirm de policy y comandos naturales deterministas, outcome estructurado, no-show y cancelación; nunca autoactiva ni convierte lo propuesto en acordado |
| startProviderNegotiation | B/internal · gate | DealActivation, Mandate, Provider, ProviderContact, CommercialPolicy, NegotiationCase, CommunicationThread | Solo Recover payments autorizado + Mandate active con `renegotiate_with_provider=true`; si falta contacto invoca `providerContactResolver` antes de bloquear |
| outlookInboundRouter | scheduled · every 5 minutes | CommunicationThread, CommunicationMessage, ContactSuppression, OperationalLog + Outlook shared connector | Bounded Outlook inbox poller; maps conversationId/sender only to active CAMBRA threads, dedupes provider message IDs and invokes the reply loop |
| outlookMeetingCoordinator | B/internal · gate | CommunicationThread, OutboundLead, AgentTask, OperationalLog + Outlook shared connector | Reads real Outlook calendar availability, creates a 30-minute event in the connected founder calendar and invites the lead; no fabricated slots |
| outboundControlAdmin | B · admin | OutboundControl, CommercialPolicy, OutboundSendingProfile, P10/P11 evidence | START exige confirmación, preflight hash PASS no expirado y recomputación idéntica justo antes de activar; PAUSE sigue inmediato. Never self-activates. |
| outboundDeliverabilityManager | B/internal · scheduled | OutboundControl, OutboundSendingProfile, CommunicationMessage | Hourly metrics/ramp controller. While paused it is metrics-only; when explicitly activated it pauses on bounce/complaint thresholds and ramps +50 only after sufficient healthy evidence and minimum 3-day interval. |
| alwaysOnLeadDiscoveryWorker | C · gate · hourly 24/7 | OutboundLead, LeadDiscoveryCheckpoint, LeadReservoirSnapshot, CommercialIntelligenceSnapshot, CommercialPolicy, MarketCapabilityControl, CostUsageEvent, SchedulerRun | P1-filtered provider partitions → checkpointed search → pre-enrichment company dedupe → selective enrichment/scoring → provider-independent warehouse and market sizing. Discovery has an explicit switch separate from outbound, applies cost/backoff/circuit guards and never sends. |
| outboundVolumeWorker | B/internal · scheduled | OutboundControl, OutboundSendingProfile, CommercialPolicy, OutboundLead, PartnerProspect, CommunicationThread | Resend volume acquisition pool. Hard no-op until master + volume switches are enabled; spreads current daily cap across business hours and reuses canonical commercial sender/suppression/idempotency gates. |
| providerContactResolver | B/internal · gate | Provider, ProviderContact, Document, MerchantInformationRequest | Resuelve contacto operativo en orden: relación merchant/documentación explícita → CRM/directorio previo → Apollo → investigación pública; nunca inventa emails; guarda provenance/confidence; si agota fuentes crea fallback merchant específico y reanudable |
| createMerchantInformationRequest | B/internal · gate | MerchantInformationRequest, Brand, Provider, DealActivation, CommunicationThread | Crea dependencia canónica deduplicada, localizada EN/FR/ES, intenta notificación gobernada y nunca convierte al founder en sustituto del merchant |
| missingInformationWorker | C/internal · hourly | MerchantInformationRequest, ProviderContact, AutonomyIncident | Reintenta resolución autónoma, recuerda al merchant de forma bounded y reanuda workflows allowlisted; evita BLOCKED sin next action |
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

**Paneles admin (34):** eclIncidentWorkflow (ECL P7 — operaciones/incidentes, admin-only, recovery allowlisted y CAS; consumido por `/admin/ecl-operations`), eclReviewWorkflow (ECL P4/P4 Production Proof — runtime/list/get/resolve, admin-only, CAS `resolving`, reprocess canónico; consumido por `/admin/evidence-review`; runtime proyecta solo el último AgentTask del scheduler), adminOverrides, adminSummaries, adminUpdateApplicationStatus, answerAgentQuestion, chatChiefOrchestrator, createApiKey, createPaymentLink, discoveryTechStackAgent, driveConnectionCheck, generateInvoicePdf, generateMonthlySavingsReport (gate; P5: cuando la medición es `fully_verified` intenta refrescar SavingsEvidence canónico; un fallo conserva el informe pero los gates económicos posteriores bloquean), getActivationAdminDetail, getAdminRecommendationQueue, getCommandCenterPulse, getWaitlistAggregate, getWaitlistLeads, gmailConnectionCheck, integritySummary, reconcileInvoice (P6: bloqueado para Recover Stripe; sin ajustes en facturas finalizadas), recordPayment (gate; P6: bloqueado para Recover Stripe), regenerateRecommendationsForBrand (gate), revokeApiKey, stripeBillingKeyCheck (RECOVER-2 — diagnóstico de claves/secrets de la cuenta de facturación; nunca devuelve valores), sheetsConnectionCheck, slackConnectionCheck, copilotChat (founder copilot), founderCopilotAgent, investorUpdateAgent, qaAgent, getBenchmarkForReport (verificado: sin gate por diseño — devuelve solo agregados de cohorte, filtra `is_public=false` y todo cohort con k<10 merchants distintos, y nunca emite `source_anon_id` ni contribuciones individuales), buildInfrastructureGraph (sin caller), discoverCompanyInfrastructure (sin caller)

**DEPRECATED (BILLING-FIX-1, 2026-08-04):** generateInvoiceFromReport — stub 410 Gone. Emitía numeración local `max+1` sin unicidad en `(series, sequence)` y no comprobaba si el informe ya estaba facturado. Sustituida por `createEligibleRecoverInvoices` (numeración de Stripe + dedupe por `(deal_activation_id, month)`). Se conserva el fichero para que un trigger de plataforma no visible en el repo falle ruidosamente en vez de duplicar facturas. Ver `Decision_Log_BILLING_FIX1.md`.

**Agentes founder-OS vía agentRegistry (38):** blogAgent, brainOrchestrator, codeReviewAgent, competitorMonitorAgent, complianceAgent, contractIPAgent, crmAgent, fixValidatorAgent, followUpAgent, gdprAgent, leadDiscoveryAgent, leadEnrichmentAgent, leadOrchestrator, leadScoringAgent, legalReviewAgent, linkedinAgent, marketingOrchestrator, meetingAgent, newsletterAgent, outreachAgent, outreachOrchestrator, providerMonitorAgent, providerResearchAgent, qaMonitorAgent, recommendationEngineAgent, researchOrchestrator, securityAgent, seoAgent, spendIntelligenceAgent, systemHealthAgent, xTwitterAgent (+7 ya listados arriba con doble rol)

**Internos sin caller en src/ (candidatos a revisión PURGE-2, NO tocados):** generateRecommendations (gate), inferVendorsFromBankData (gate — clase F, banking), onBrandCreated (gate — trigger sin automatización registrada), onSavingsEvidenceEvent (gate — ídem), regenerateMigrationTasks, revokeMandate, stripeDisconnect (legado, superseded por stripeConnectionDisconnect)

## D — Dev/test/seed (11)

_tenantGuard · createSelfTestBrand · phase2CleanupLegacyFields (migración one-off ejecutada) · runApiSelfTests · runFlowSelfTests · seedComplianceRules · seedDemoData · seedIntegrationCatalog · seedPaymentsRateTable · sendTestWebhook · verifyRegistrySync — todas `me+admin`.

## Mantenimiento

1. Función nueva → añadir fila aquí + nombre en `MANIFEST` de `productionFunctions.static.test.js` (el test rompe si no).
2. Función borrada (PURGE-2) → quitar de ambos.
3. La clasificación de auth es estática (grep de mecanismos) — la verificación profunda vive en Decision_Log_SECURITY2.md.
| acquisitionAttributionWorker | B/internal · scheduled | OutboundLead, CommunicationThread, Brand, AcquisitionAttribution | Hourly deterministic exact-email attribution from contacted merchant lead to Brand; ambiguous matches remain unattributed. |
| acquisitionLearningWorker | B/internal · scheduled daily | AcquisitionLearningCohort, AcquisitionAttribution, MonthlySavingsReport | Bounded acquisition cohort learning; Verified Savings influence prioritization only through deterministic attribution. |
| outreachExperimentLearningWorker | B/internal · scheduled daily | CommunicationThread, OutboundLead, PartnerProspect, OutreachExperimentStats | Controlled outreach experimentation learner; keeps 20% exploration and only exploits variants after >=20 samples. Cannot change claims, sender identity, pricing, policy or authorization. |

| developerMigrationEngine | B · admin | DeveloperWorkspace, DeveloperMigrationRun, AgentTask, Approval + GitHub connector | CAMBRA Developer repo migration engine. Admin-only; scans repository, produces plan, writes only to a new branch/PR after approval, and requires separate L4 approval before merge/cutover. |

| autonomousOperationsSupervisor | B/internal · scheduled | AgentTask, CommunicationThread, NegotiationCase, MigrationTask, DealActivation, AutonomyIncident | P11 cross-loop supervisor every 15 min; safe recovery/orchestration only, never economic approval or L4 bypass. |
| postMeetingWorker | B/internal · scheduled | CommunicationThread, CommunicationMessage, ContactSuppression, SchedulerRun | Policy-gated continuation in the same canonical thread, only after a structured Founder outcome; scheduler lease, idempotent send and missing-outcome Inbox question prevent duplicates or invented commitments. |
| negotiationMemoryWorker | B/internal · scheduled daily | NegotiationCase, NegotiationOffer, NegotiationMemoryCohort | Builds advisory provider negotiation memory; never changes authority or accepts terms. |
| onboardingConciergeWorker | B/internal · scheduled | Brand, CommercialPolicy, CommunicationThread, ContactSuppression | Merchant onboarding concierge; chases incomplete payments onboarding inside founder-approved merchant-operations policy. |
| recoverAutopilotWorker | B/internal · scheduled daily | DealActivation, MonthlySavingsReport, Invoice, AgentTask | Generates due measurements, issues only already-approved eligible invoices, then runs read-only Stripe reconciliation. Never auto-approves reports. |

### P12 — Intelligence & Proprietary Moat Layer (2026-08-10)

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| intelligenceAccess | B/internal + admin gate | IntelligenceEvidence, IntelligenceObservation, KnowledgeClaim, ProviderPricingVersion, IntelligenceSnapshot, IntelligenceOutcome, KnowledgeConflict | Canonical P12 write/read boundary. Immutable evidence path, idempotency hashes, evidence-gated knowledge promotion, bitemporal pricing lookup and immutable decision snapshots. It also exposes bounded research retrieval/source summaries and an admin-confirmed, idempotent candidate-only research sync. External research never writes operational rate, policy, CPIC model or training truth. No billing or L4 authority. |
| intelligenceMaintenanceWorker | C/internal · daily | PaymentsRateTable → ProviderPricingVersion, KnowledgeConflict | Versions the existing payments pricing source into the temporal ledger. Does not scrape external sites or silently replace prior verified history. |
| knowledgeIntegrityWorker | C/internal · 6h | IntelligenceEvidence, ProviderPricingVersion | Quarantines temporal/value anomalies. Does not rewrite raw evidence content. |
| outcomeLearningWorker | C/internal · daily | MonthlySavingsReport → IntelligenceOutcome | Copies deterministic Verified Savings truth into outcome learning. Never approves reports, recalculates financial truth or invoices. |
| moatCuratorWorker | C/internal · daily | ProviderPricingVersion, AnonymizedIntelligenceAggregate, KnowledgeConflict → MoatMetric, KnowledgeGap | Never reads raw tenant outcomes. Financial depth uses only complete privacy-safe k≥10 native-currency snapshots; incomplete aggregate coverage blocks every write and is surfaced for review. |
| privacySafeIntelligenceWorker | C/internal · daily | BenchmarkCohort, IntelligenceOutcome → AnonymizedIntelligenceAggregate | Fixed-snapshot complete pagination, latest observation per distinct merchant, k≥10 and explicit native-currency isolation. Snapshots append/version source history; incomplete reads, mixed/unknown currency and identifiers are fail-closed. |
| getIntelligenceCommandCenter | B/admin | P12 intelligence aggregates | Admin-only command-center projection; no raw foreign-tenant evidence export. |
| intelligenceAdmin | B/admin | KnowledgeClaim, KnowledgeConflict, IntelligenceEvidence, OperationalLog | Explicit reason-required override actions with before/after audit. Inferred claims cannot be promoted to verified by override alone. |
| intelligenceBackfill | B/internal + admin gate | Existing representable pricing/outcome provenance | Idempotent orchestrated backfill. Does not fabricate historical source type or effective date. |


### P13 — Payment Routing Intelligence & Shadow Orchestration (2026-08-10)

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| recordRoutingObservation | B/internal + admin gate | PaymentRoutingObservation, Event | Minimized read/simulate ingestion only. Rejects PAN/CVV-like fields. Production learning requires explicit production classification; unknown/internal/test data is non-learning by default. |
| routingHistoricalBackfill | C/internal + admin gate | PaymentsAnalysisVerified → PaymentRoutingObservation | Aggregate-window backfill only. Safe-defaults historical non-demo rows to `internal_test`; only explicitly confirmed production brand IDs become learning-eligible. Never fabricates transaction features. |
| shadowRoutingEngine | C/internal + admin gate | PaymentRoutingObservation, ProviderPricingVersion, RoutingProviderPerformance, ShadowRoutingDecision, RoutingOpportunity, IntelligenceSnapshot | Counterfactual shadow decisions only. `REAL_ROUTING_ALLOWED=false`; no PaymentIntent/capture/refund/retry/checkout mutation. Opportunities require production-eligible evidence. |
| routingPerformanceWorker | C/internal · scheduled | PaymentRoutingObservation → RoutingProviderPerformance | Approval-performance aggregation from eligible transaction-level observed outcomes; no counterfactuals become observed truth. |
| routingSimulator | B/internal + admin gate | ShadowRoutingDecision → RoutingSimulation | Retrospective simulation only; never deploys a rule or touches payment execution. |
| routingReadinessWorker | C/internal · scheduled | Production-eligible routing evidence → RoutingReadinessAssessment | R0–R3 evidence assessment only. Real routing is explicitly prohibited and gated on future PCI/regulatory/reliability decisions. |
| getRoutingIntelligenceCommandCenter | B/admin | Routing aggregates | Admin-only read projection. No activation endpoint and no payment execution authority. |


### P14 — Aggregate Demand & Dynamic Procurement + Final Revenue Engine (2026-08-10)

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| aggregateDemandWorker | C/internal · 6h | Production PaymentRoutingObservation, DemandUnit, AggregatePool, AggregateCommitment | Normalizes production-eligible demand. Observed/addressable/committed are distinct; committed comes only from explicit commitments. |
| aggregateProcurementWorker | C/internal · 6h | AggregatePool, Provider Intelligence, AggregateRFP, NegotiationCase | Opens truthful competitive RFPs only when APS/readiness and active policy permit. |
| collectiveNegotiationAgent | B/internal · gate | NegotiationCase/Offer, AggregateBid, CommunicationThread, Approval | Reuses canonical commercial stack. May negotiate, never guarantees uncommitted volume or executes material contracts. |
| aggregateAgreementWorker | C/internal · 6h | DynamicAgreement, AgreementTier, PrivateRateCard | Watches machine-readable tiers; provider-confirmation/manual tiers never self-activate. |
| aggregateEligibilityWorker | C/internal · 6h | PrivateRateCard, MerchantRateEligibility | Merchant-specific eligibility; underwriting-pending pricing remains potential, not guaranteed. |
| getAggregateCommandCenter | B/admin | Aggregate projections | Admin-only read control plane. |
| revenueLifecycleWorker | C/internal · 30m | DealActivation, MonthlySavingsReport, Invoice → RevenueLifecycle | Deterministic revenue-state projection; does not mutate financial source-of-truth records. |
| getFinancialControlTower | B/admin | RevenueLifecycle, Savings, Invoice, PaymentEvent | Separates estimated, verified, billable, invoiced and collected values. |
| operatingHealthWorker | C/internal · daily | cross-domain health signals | Advisory company-health score only. |
| realWorldValidationWorker | C/internal · daily | production-classified evidence, PilotMerchantValidation, RealWorldGapReport | First-10 pilot ledger excludes internal/demo/test data. |
| revenueGoldenPathSelfTest | C/internal · daily | structural flow checks, AgentTask | Recurrent technical contract test; explicitly does not move money or claim real-merchant validation. |
| getFounderControlCenter | B/admin | Approval, incidents, meetings, health, finance, gaps | High-value founder governance projection; routine operations remain autonomous/observable. |

P14 private rates are distinct from public ProviderPricingVersion and are consumed by Shadow Routing only when the merchant has an active `eligible` MerchantRateEligibility. Aggregate proposal approval and exact contract execution are separate L4 steps.

| salesPipelineWorker | C/internal · hourly | OutboundLead, AcquisitionAttribution, RevenueLifecycle, AggregatePool | Revenue-stage/priority projection; unknown monetary value remains unknown. |
| collectionOperationsWorker | C/internal · daily | Invoice, PaymentEvent/reconciliation, AutonomyIncident, CommunicationThread | Reconciles first, reminds safely, escalates disputes; never performs a manual PaymentIntent retry. |
| agentPerformanceWorker | C/internal · daily | AgentTask, Approval, AgentPerformanceMetric | Measures success/escalation/error/override; cannot widen authority and does not invent revenue attribution. |
| executiveDigestWorker | C/internal · daily | Cross-domain aggregates → ExecutiveDigest | Deterministic founder digest; financial numbers come from authoritative records. |
| customerSuccessWorker | C/internal · daily | Integrations, incidents, invoices, RoutingOpportunity, MerchantRateEligibility | Advisory retention/expansion signals; merchant communication remains policy-gated. |
| unitEconomicsWorker | C/internal · daily | PilotMerchantValidation, RevenueLifecycle, CustomerSuccessSignal | Unknown CAC/cost/LTV inputs remain null and explicit in `missing_inputs`. |
| developerSignalWorker | C/internal · 2h | Critical AutonomyIncident → AgentTask | Investigation signal only; patch/apply/merge/cutover remain DeveloperMigrationEngine approval-gated. |


## P15 — Provider Revenue Share & Dual-Sided Economics

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| providerEconomicsAssessmentWorker | C/internal · 6h | AggregateBid → ProviderEconomicAssessment | Computes provider economics separately from Merchant Outcome Score; recommendation firewall is merchant-first and compensation_effect_on_ranking=false. |
| providerMonetizationAgent | B/internal · gate | NegotiationCase, AggregateBid, NegotiationOffer, CommunicationThread, Approval | Opens provider-economics phase only after merchant suitability; may negotiate but cannot activate compensation or execute contract. |
| providerRevenueAttributionWorker | C/internal · hourly | DynamicAgreement, AggregatePoolMember, DealActivation → ProviderRevenueAttribution | Attribution requires matching operational provider activation; leads/analysis alone never qualify. |
| providerRevenueLifecycleWorker | C/internal · hourly | Attribution + production PaymentRoutingObservation → ProviderRevenueLedger | EXPECTED/ELIGIBLE/ACCRUED projection; accrual requires agreement legal status approved + activation_allowed. |
| providerRevenueTierWorker | C/internal · 6h | ProviderCompensationTier + attributed production activity | Dynamic provider-compensation tiers; contractual automatic tiers still require the agreement legal gate. |
| providerRevenueReconciliationWorker | C/internal · daily | ProviderRevenueStatement vs ProviderRevenueLedger | Reconciles reported provider amounts/volume and raises bounded incidents on mismatch. |
| providerRevenueRecoveryAgent | B/internal · gate | AutonomyIncident, provider thread | Requests correction for evidenced discrepancies; cannot create or modify entitlement. |
| providerRevenueBillingWorker | C/internal · monthly | ProviderRevenueLedger → ProviderRevenueInvoice | Supports CAMBRA invoice / provider self-billing modes; never invents invoice number or tax authority. |
| recordProviderRevenueInvoiceIssued | B/internal · gate | ProviderRevenueInvoice, ProviderRevenueLedger | Accepts externally valid invoice number/document and advances to payment_pending; duplicate numbers rejected. |
| recordProviderRevenuePayment | B/internal · gate | ProviderRevenueInvoice, ProviderRevenueLedger | Records evidenced provider payment with deduplicated external payment reference; no money movement. |
| approveProviderMonetizationLegalReview | B/admin | DynamicAgreement | Requires explicit legal opinion, jurisdiction, disclosure, tax and settlement references before provider compensation can activate. |
| getProviderEconomicsCommandCenter | B/admin | Provider-side subledger and assessments | Admin-only provider economics control tower. |
| providerEconomicsIntelligenceWorker | C/internal · daily | Agreements, ledger, conflicts → MoatMetric/KnowledgeGap | Confidential provider-compensation intelligence; cannot influence merchant ranking. |

P15 uses a strict recommendation firewall: merchant suitability/ranking is computed without provider compensation. Provider economics are optimized only after merchant terms are established. Merchant-side Invoice/PaymentEvent and provider-side ProviderRevenueLedger/ProviderRevenueInvoice are separate financial ledgers and are added only for total CAMBRA economics.

## P16 — Founder OS & Autonomous Company Command Center (2026-08-10)

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| getFounderOSCommandCenter | B/admin | Existing domain truth → Founder OS snapshot | Read-only canonical executive cockpit. Financial values remain ledger-derived; includes confidence/freshness and founder attention. |
| founderOSQuery | B/admin | Cross-domain governed read projections | Company summary, WHY, search, Merchant/Provider 360, relationship graph, war room and decision evidence. Does not perform external actions or mutate financial truth. |
| founderOSCommand | B/admin | Approval, FounderCommandAudit, StrategyDirective + existing domain resolvers | Governed `DO IT` gateway: preview → confirmation where required → canonical resolver → audit. Material commercial/aggregate approvals reuse `resolveCommercialApproval`; unknown L4 is not raw-executed. |
| founderOSSimulation | B/admin | FounderSimulation + measured Founder OS inputs | Simulation only (`production_effect=false`). Missing ARPA/LTV/capacity remains unknown rather than invented. |
| founderChiefOfStaff | B/admin | Canonical Founder OS snapshot + StrategyDirective | AI narrative/priority layer. Prompt forbids invented metrics/trends/targets/forecasts; evidence snapshot remains authoritative. |
| autonomousCompanyOrchestrator | C/internal · 6h | P6 commercial intelligence + P7 pipeline/learning + ExecutiveDigest → AgentTask/Event/FounderDecision | Coordination-only nervous system. It invokes no direct send, contract acceptance, migration cutover, spend or charge; material authority remains in existing gates. |

P16 is deliberately a governance layer above autonomous operations. It does not give AI agents approve/sign/spend/charge authority, does not create a second financial ledger and does not turn simulation into production action.

## P17 — Autonomous Maintenance & Self-Healing Engine (2026-08-10)

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| maintenanceEngine | C/internal · 10 min + B/admin manual | Integration, WebhookDeadLetter, AgentTask, ProviderPricingVersion, Invoice, ProviderRevenueStatement, SecurityAudit → MaintenanceRun, AutonomyIncident, RemediationKnowledge | Unified detect → diagnose → allowlisted reversible repair → verify → log → learn loop. Security/contracts/permissions/money movement/code deployment never auto-execute. |
| getMaintenanceCenter | B/admin | MaintenanceRun + active incidents + integration/agent/provider/security health | Founder OS evidence-backed Maintenance Center. Composite health is advisory; financial ledgers remain authoritative. |
| dependencySecurityWorker | C/internal · 6h | Registered DeveloperWorkspace repositories + GitHub Dependabot → AutonomyIncident | Continuous dependency alert watch where GitHub/Dependabot coverage exists. Findings are human-required; no dependency patch is auto-merged. |

P17 reuses the existing OAuth refresh, webhook DLQ retry, Recover billing reconciliation, Provider Intelligence maintenance and Developer Migration/Signal machinery. A repair is never marked resolved until its post-action verification passes; failed recovery is escalated and retained as negative remediation evidence.

## P18 — Operating Bible, Founder Handbook & Living Documentation (2026-08-10)

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| documentationQuery | B/admin | Source-controlled documentation registry | Answers system-behavior questions in EN/FR/ES and explicitly labels the result non-live. Current metrics/incidents must still use Founder OS/domain queries. |
| documentationMaintenanceWorker | C/internal · daily | Documentation registry → DocumentationObject / DocumentationVersion / DocumentationHealthAssessment | Versions structured documentation and publishes runtime Documentation Health. It cannot modify product/economic behavior or promote a feature from planned/partial to implemented by itself. |
| emergencyControlAdmin | B/admin | EmergencyControl + existing OutboundControl / CommercialPolicy | Founder emergency containment. SAFE MODE blocks new external communications, negotiation execution, migration starts and new Recover invoice issuance while preserving monitoring, reconciliation and evidence. Activation/restoration require explicit confirmation tokens. |

P18 adds a release-time documentation drift gate over the implementation paths referenced by the canonical documentation registry. SAFE MODE is deliberately not described as a universal kill switch for every internal/read-only agent: it is enforced at the material external-effect boundaries, while narrower acquisition/policy/access revocation controls remain separate. Billing pause means new issuance only; existing financial truth and reconciliation continue.


## P1 Europe market foundation

| Function | Access | Purpose |
|---|---|---|
| seedEuropeMarketFoundation | admin/internal | Idempotent 33-market registry, placeholder intelligence state and conservative capability-policy seed |
| seedProviderIntelligenceFoundation | B/internal · admin/internal gate | ProviderResearchState, MarketIntelligenceProfile, Event | P2 idempotent 33×8 research-state seed only; creates no provider/pricing facts and explicitly preserves zero-fabrication |
| resolveMerchantMarketContext | admin/internal | Evidence-first additive merchant market context; legacy fields preserved |
| backfillMerchantMarketContexts | admin/internal | Idempotent shadow backfill with migration provenance |
| checkMarketCapability | admin/internal | Shared deterministic jurisdiction/capability decision + audit |
| marketPolicyAdmin | admin | Versioned policy supersession, scoped kill switch and explicit expiring override |
| getEuropeMarketsCommandCenter | admin | Europe/Markets Admin projection |

P1 production-rollout gates are also consumed at external communication, Recover mandate/contract, provider negotiation, migration and Recover billing boundaries. Default legacy/shadow rollout does not silently change existing merchant execution.

## P10–P13 European regulatory, legal, production and growth control plane

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| checkRegulatoryActivity | B/internal · admin/internal gate | RegulatoryPolicyVersion, RegulatoryRegistration, RegulatoryPartnerMandate, RegulatoryEvidence, ComplianceDecision | Deterministic P10 decision and audit endpoint. Unknown, stale or insufficient authority fails closed; it cannot grant legal clearance. |
| regulatoryMonitoringWorker | C/internal · daily | RegulatoryPolicyVersion, RegulatoryEvidence, RegulatoryRegistration → ComplianceIssue | Flags policy/evidence review debt and expiring or missing registration dates. It never promotes a legal conclusion or activates a capability. |
| seedP10RegulatoryControl | D/seed · admin/internal gate | 33 markets × 17 activities → RegulatoryPolicyVersion, Event | Idempotent conservative seed: every new cell starts `LEGAL_REVIEW_REQUIRED`; zero registration, authorization, passport or partner permission claims are created. |
| canExecuteLegalAction | B/internal · admin/internal gate | P10 + LegalExecutionPolicy + contract/mandate/approval/agent evidence → AuthoritySnapshot, LegalExecutionDecision | P11 deterministic evaluation. Caller cannot inject policy decisions; missing legal evidence, audit persistence or authority fails closed. |
| manageLegalExecution | B/admin · strict admin | LegalExecutionPolicy, LegalKillSwitch, MandateAuthorityGrant, MandateAuthorityRestriction, Mandate, Event | Append/supersede P11 policies, contain execution, verify evidenced signer capacity and manage least-authority evidence. `ALLOW` and authority grants require approved evidence; admin status alone grants no legal authority. |
| seedP11LegalExecution | D/seed · strict admin | 33 markets × canonical P11 actions → LegalExecutionPolicy | Idempotent conservative seed. All cells start review-required and grant zero permission. |
| productionReadinessWorker | C/internal · daily | ProductionFinding, ReleaseVerification, DisasterRecoveryExercise, ServiceLevelSnapshot → ProductionReadinessSnapshot | Separates local technical completion from final-SHA remote CI, Base44 runtime, real restore, dependency and document-corpus proof. Missing external evidence keeps P12 externally blocked. |
| getEuropeMarketsCommandCenter (`view:growth`) | B/admin + scheduled every 6h | CountryProfile, MarketIntelligenceProfile, P9–P13 evidence → MarketGrowthSnapshot, FounderGrowthBrief, GrowthPathSnapshot, GrowthDecision | Existing deployed function name consolidates the evidence-limited 33-market portfolio and Growth Path V1 in `SHADOW_RECOMMEND_ONLY`; its single schedule uses `SchedulerRun` duplicate protection and avoids another Base44 function slot. It cannot send, spend, launch, contract or bypass P10/P11/emergency controls. |
| getEuropeanGrowthCommandCenter | B/admin | MarketGrowthSnapshot, GrowthDecision, GrowthDecisionOutcome, GrowthExperiment, GrowthCostLedger, AcquisitionTouch, FounderGrowthBrief | Admin-only read projection. Unknown CAC/cost/attribution and insufficient samples remain explicit; it exposes no market-activation endpoint. |

These eight functions are technically implemented but do not prove legal permission, production deployment, final-SHA remote CI or real commercial performance. P11 is enforced at communication, mandate acceptance, provider negotiation, migration coordination/go-live and Recover invoice issuance boundaries. Runtime schedules become production evidence only after Base44 sync/deployment is observed.

## P3 European Rate Intelligence

| Function | Class / auth | Core data | Boundary |
|---|---|---|---|
| rateIntelligenceQuery | B/internal + admin gate | ProviderPricingVersion, RateComponent, RateResearchState, PricingWatchTarget, KnowledgeConflict | Canonical P3 read/evaluate surface. Tenant-private observations stay tenant-scoped; resolver returns explicit UNKNOWN/PARTIAL/CONFLICT/STALE outcomes instead of guessing. No benchmark or achievable-rate inference. |
| rateIntelligenceWatchWorker | C/internal · every 6h dispatcher | PricingWatchTarget, RateSourceSnapshot, RateChangeCandidate, Event, AgentTask | Risk-based source freshness/change watch. Unstructured source changes create `REVIEW_REQUIRED` candidates and never auto-promote numeric pricing or overwrite canonical truth. |
| seedP3RateIntelligence | D/seed · admin/internal gate | 33-market research universe, RateResearchState/Pass, IntelligenceEvidence, RateSourceSnapshot, ProviderPricingVersion, RateComponent, EvidenceAssertion, PricingWatchTarget | Idempotent P3 bootstrap from researched evidence. Primary anchors are validated before canonical creation; unknown/custom pricing remains explicit; P4 models and P5 achievable rates are out of scope. |
| projectVerifiedPaymentsToP4 | B/internal + admin gate | PaymentsAnalysisVerified, Integration → P4EvidenceProjection | Idempotent private projection of verified aggregate merchant evidence. Requires keyed pseudonyms; never mutates P3 truth or retained anonymous aggregates. |
| requestP4Estimate | B/internal + admin gate | private P4 service → P4StatisticalEstimate | Optional fail-closed statistical-estimator bridge. Tenant-safe output only; model/version/OOD/lineage remain separate from P3 pricing truth and cannot become an offer by themselves. |

P3 cutover rule: `ProviderPricingVersion + RateComponent` is the canonical factual pricing ledger. `PaymentsRateTable` is compatibility-only during migration; unsafe legacy placeholders/estimates are quarantined, demo rows are ignored, and exact verified P3 truth may project downward to an existing exact-country legacy row. Legacy estimates never promote upward into canonical P3 truth.
