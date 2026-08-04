# PRODUCTION_SURFACE_INVENTORY.md

**Censo:** 2026-08-04 · 162 backend functions · 86 entidades · 0 agentes declarativos Base44

Este documento permite que un CTO o auditor comprenda qué está vivo, qué está
preparado y qué no debería estar expuesto. Es complementario a
`PRODUCTION_FUNCTIONS.md` (el manifiesto operativo) — aquí el foco es
**seguridad y exposición**.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Backend functions | 162 |
| Entidades | 86 |
| Agentes declarativos Base44 (`base44/agents/*.jsonc`) | **0 — el directorio no existe** |
| Functions que actúan como agentes/orquestadores ( InvokeLLM + Approval ) | 38+ |
| Functions con `asServiceRole` | ~120 (mayoría) |
| Functions públicas (sin auth de sesión) | 9 |
| Functions con trigger de automatización registrado | 9 |
| Functions en cuarentena (PURGE-2) | 16 |
| RLS habilitado en entidades | 100% (admin-only o ownership-filtered) |

---

## 2. Clasificación de funciones (seguridad)

### PRODUCTION_CRITICAL — merchant-facing, deben funcionar (37)

Las que un usuario autenticado o anónimo invoca desde el frontend en el flujo
vivo. Todas validan ownership o usan rate-limiting anónimo.

**Anónimas (rate-limited, sin sesión):**

| Función | Rate-limit | Cap | Entidades escritas | Riesgo |
|---|---|---|---|---|
| submitPaymentsAnalysis | ✓ | 16KB | RateLimitCounter, PaymentsAnalysisSession | PII: email + GMV |
| getPaymentsGapTeaser | ✓ | 16KB | (lectura) | Bajo — allowlist de campos |
| submitWaitlistSignup | ✓ | 16KB | RateLimitCounter, Lead | PII: email |
| submitCallRequest | ✓ | 16KB | RateLimitCounter, Lead | PII: email + phone |
| submitContactMessage | ✓ | 16KB | RateLimitCounter, Lead | PII: email |
| joinCollective | me + rate-limit | — | RateLimitCounter, CollectiveMember | Medio |
| sitemap | pública | — | — | Nulo — estático |

**Autenticadas (me + ownership):**

| Función | Auth | Entidades | Riesgo IDOR |
|---|---|---|---|
| claimAnonPaymentsResult | me | AnalyzerResult, Brand | Bajo — claim por UUID |
| getPaymentsAnalysisVerified | me + ownership | PaymentsAnalysisVerified, Brand | **Verificar:** filtra por brand_id |
| getMyPaymentsHistory | me | AnalyzerResult | Bajo — created_by |
| getBrandSavings | me + ownership | Brand, AnalyzerResult, BrandSavings | **Verificar:** filtra por brand_id |
| getInfrastructureGraph | me + ownership | Brand, InfrastructureNode, Edge | **Verificar:** filtra por brand_id |
| getIntegrationStatus | me + ownership | Brand, Integration, DetectedIntegration | **Verificar:** filtra por brand_id |
| getOnboardingStatus | me + ownership | Brand, PaymentsProfile | **Verificar:** filtra por brand_id |
| computeStripeVerifiedGap | me + ownership | PaymentsRateTable, Brand, Integration | **Verificar** |
| stripeOAuthConnect | me + ownership + multi-brand guard | Brand, StripeConnection | **Crítico:** ver multi-brand guard |
| stripeDataSync | me + ownership | Brand, StripeConnection | **Verificar** |
| dataSyncAgent | me + checks | Brand, Integration, AgentTask | **Verificar** |
| stripeConnectionDisconnect | me + ownership | Brand, Integration, StripeConnection | **Verificar** |
| oauthConnector | me + ownership | Brand, OAuthState, Integration | **Verificar** |
| initiateConnection | me + ownership | Brand, IntegrationCatalog, ConnectionSession | **Verificar** |
| processUploadedFile | me + ownership | Brand, AnalyzerInput, StatementImport | **Verificar** |
| runContinuousDiscovery | gate | Brand, ContinuousDiscoveryRun | Medio |
| securityAuditLog | me | SecurityAudit | Bajo |
| createDocument / listDocuments / linkDocument / unlinkDocument / updateDocumentMeta | me + admin en escritura sensible | Document, DocumentLink, Brand | **Verificar** ownership |
| getRecoverAcceptanceContext | me + ownership | DealActivation, Brand, Baseline, Mandate | **Verificar** |
| startRecoverAcceptance | me + ownership | DealActivation, Mandate | **Crítico:** transición de estado |
| acceptRecoverMandate | me + ownership | Mandate, DealActivation, Brand | **Crítico:** firma legal |
| startPaymentMethodSetup | me + ownership + Mandate active | DealActivation, Brand, Mandate | **Crítico:** SetupIntent Stripe |
| refreshPaymentMethodStatus | me + ownership | DealActivation | **Verificar** |
| getRecoverContractStatus | me + ownership o admin | Mandate, DealActivation, Brand | **Verificar** |
| downloadRecoverContract | me + ownership o admin | Mandate, DealActivation, Brand | **Crítico:** PDF privado con firma |
| sendMonthlySavingsSummary | me+admin (también C) | User, Brand, AnalyzerResult | Medio |
| getMyReferralLink | me | ReferralLink | Bajo — owner_email |
| getMyReferralStatus | me | ReferralLink | Bajo — owner_email |

### PRODUCTION_CRITICAL — Stripe billing (3)

| Función | Auth | Entidades | Riesgo |
|---|---|---|---|
| stripeBillingWebhook | **pública por diseño** — firma HMAC Stripe | DealActivation, Invoice, PaymentEvent, MonthlySavingsReport | **Crítico:** verify signature obligatorio; dedupe por event.id |
| createEligibleRecoverInvoices | admin o gate (scheduler) | MonthlySavingsReport, DealActivation, Invoice, PaymentEvent | **Crítico:** emite facturas reales en Stripe |
| approveRecoverReportForInvoicing | admin | MonthlySavingsReport, DealActivation, Brand, Mandate | **Crítico:** gate humano medición→facturable |

### A-API — Partners (6)

| Función | Auth | Riesgo |
|---|---|---|
| apiAuth | key | Helper — no expone datos solo |
| apiOpenApiSpec | pública (spec) | Nulo — estático |
| apiV1 | key hasheada + scoping org | **Verificar:** scoping por org_id correcto |
| mcpServer | key/OAuth bearer | **Verificar:** scoping |
| oauthAuthorize | me | OAuth flow interno |
| oauthToken | client_secret + cap 10KB | **Crítico:** client_secret en request |

### PRODUCTION_SUPPORT — contratos PDF y email (6)

| Función | Auth | Entidades | Riesgo |
|---|---|---|---|
| generateRecoverContractPdf | gate o admin | Mandate, DealActivation, Brand, OperationalLog | **Crítico:** PDF legal — re-verify hash |
| sendRecoverContractEmail | gate o admin | Mandate, OperationalLog | Medio — email a signed_by_email |
| retryPendingRecoverContracts | gate | Mandate, OperationalLog | Bajo — reconciliador |
| generateInvoicePdf | me+admin | Invoice | Medio — PDF factura |
| checkVatVies | admin o gate | Brand, OperationalLog | Medio — VIES API externa |
| recordConditionsActivation | admin (humano) | DealActivation, Mandate, OperationalLog | **Crítico:** ancla calendario contractual |

### ADMIN_INTERNAL — paneles admin y founder-OS (77)

Todas con `me+admin` o `gate`. Riesgo principal: que un admin legítimo sea
comprometido. No hay IDOR entre merchants porque el admin ve todo por diseño.

**Incluye:** 38+ orquestadores AI (blogAgent, codeReviewAgent, competitorMonitor,
complianceAgent, crmAgent, etc.) que llaman InvokeLLM y escriben a AgentRun/
AgentTask/Approval.

**approveAgentRun** está en CUARENTENA — el flujo de aprobación real se hace
inline en cada función, no a través de este handler centralizado.

### TEST_OR_VALIDATION (11)

createSelfTestBrand, phase2CleanupLegacyFields, runApiSelfTests, runFlowSelfTests,
seedComplianceRules, seedDemoData, seedIntegrationCatalog, seedPaymentsRateTable,
sendTestWebhook, verifyRegistrySync, _tenantGuard

**Riesgo:**Todas con `me+admin`. **Verificar que no sean accesibles en producción
sin admin.** seedDemoData y createSelfTestBrand escriben datos — si se invocan
accidentalmente pueden contaminar la base de datos.

### PREPARED_NOT_LIVE (1)

| Función | Estado | Riesgo |
|---|---|---|
| inferVendorsFromBankData | Vertical banking futura (F) | Bajo — sin callers en src/ |

### LEGACY_DORMANT / QUARANTINE (16)

approveAgentRun, authzScope, benchmarkLearningEngine, dispatchWebhook,
guardDealActivationStatus, inviteAdminUser, oauthRevoke, onInvoiceStatusEvent,
promoteMeToAdmin, seedBenchmarkCohorts, seedStripeTestData, startSubscription,
stripeHealthCheck, stripeTestGroundTruth, updateDealActivationStatus,
updateMigrationTaskStatus

Todas llevan tag `[QUARANTINE 2026-08-15]` + probe de invocación (OperationalLog
`quarantine_probe`). **Acción:** si el probe sigue en silencio a la fecha de
revisión → borrar (exportando filas de Subscription antes).

**Riesgo:** Si son accesibles sin auth, un atacante podría invocarlas. **Verificar
que el gate/me+admin siga activo en cada una.**

### UNKNOWN_REQUIRES_REVIEW (7)

Functions internas sin caller en src/ — no se sabe si están vivas o muertas:

generateRecommendations, onBrandCreated, onSavingsEvidenceEvent,
regenerateMigrationTasks, revokeMandate, stripeDisconnect, createPaymentLink

**createPaymentLink** — NOTA: depende de producción activa (ver dead_ends).
**revokeMandate** — permite self-service merchant; verificar que no permita
revocar el mandato de OTRO merchant.
**stripeDisconnect** — superseded por stripeConnectionDisconnect; verificar
que no quede accesible.

---

## 3. Endpoints públicos — auditoría de seguridad

Un endpoint "público" es uno que no exige `auth.me()`. Hay 9:

| Endpoint | Protección | ¿Acepta parámetros? | ¿Qué puede hacer? |
|---|---|---|---|
| submitPaymentsAnalysis | rate-limit + cap 16KB | Sí (inputs del Analyzer) | Persistir PaymentsAnalysisSession + Lead |
| getPaymentsGapTeaser | rate-limit + cap 16KB + UUID | Sí (session_id) | Leer UNA sesión por UUID (allowlist de campos) |
| submitWaitlistSignup | rate-limit + cap 16KB | Sí (email) | Persistir Lead |
| submitCallRequest | rate-limit + cap 16KB | Sí (email, phone) | Persistir Lead + enviar email admin |
| submitContactMessage | rate-limit + cap 16KB | Sí (email, message) | Persistir Lead |
| sitemap | ninguna (por diseño) | No | Devolver XML estático |
| stripeBillingWebhook | **firma HMAC** (stripe-signature) | Sí (event Stripe) | **CRÍTICO:** crear/modificar Invoice, PaymentEvent, MonthlySavingsReport |
| apiOpenApiSpec | ninguna | No | Devolver spec estática |
| recoverBillingDigest | **SIN GATE** (ver nota) | No (ignora body) | Enviar email a admin (única dirección de entorno) |

### recoverBillingDigest — único endpoint sin mecanismo de auth

Ver PRODUCTION_FUNCTIONS.md §C para el argumento de seguridad completo (4
propiedades). **Si alguna propiedad cambia, la función necesita un gate real.**

### stripeBillingWebhook — el endpoint más crítico

- **Debe verificar `stripe-signature` contra el secret por modo** (test/live).
- **Dedupe por event.id** — un replay del mismo event no debe duplicar facturas.
- **No persiste datos sensibles de tarjeta** — solo refs y códigos sanitizados.
- **Verificar que el secret esté configurado** para AMBOS modos
  (`STRIPE_BILLING_WEBHOOK_SECRET_TEST` y el de live).

---

## 4. Endpoints que aceptan IDs de entidad — auditoría IDOR

Los siguientes endpoints aceptan un ID en el payload o URL y deben verificar
que el caller autenticado es dueño del recurso:

### Verificación ownership brand_id

Todas las funciones merchant-facing que aceptan `brand_id` deben verificar que
`brand.contact_email === user.email` O `created_by === user.email` O admin.
El test estático `tenantGuard.static.test.js` cubre las funciones que usan
service role, pero **no las que usan el cliente del usuario** — estas dependen
de RLS.

**Entidades con RLS de ownership (Brand, DealActivation, Mandate, Baseline,
Invoice, MonthlySavingsReport, AnalyzerResult, etc.):** RLS filtra del lado de
la base de datos. Pero una función que hace `asServiceRole.entities.X.filter()`
**elude RLS** y debe filtrar manualmente.

### Funciones que usan asServiceRole + aceptan IDs

| Función | ID aceptado | ¿Filtra manualmente? |
|---|---|---|
| getRecoverAcceptanceContext | deal_activation_id | **Verificar** |
| startRecoverAcceptance | deal_activation_id | **Verificar** |
| acceptRecoverMandate | mandate_id | **Verificar** |
| startPaymentMethodSetup | deal_activation_id | **Verificar** |
| downloadRecoverContract | mandate_id | **Verificar** |
| getActivationAdminDetail | activation_id | Admin-only ✓ |
| getIntegrationStatus | brand_id | **Verificar** |
| getBrandSavings | brand_id | **Verificar** |
| getInfrastructureGraph | brand_id | **Verificar** |

> **Acción pendiente:** auditar el código de cada una de estas funciones para
> confirmar que el filtro manual existe y es correcto. El test estático de
> tenant isolation cubre la existencia del guard, pero no su corrección
> lógica.

---

## 5. Agentes vs. orquestadores — veracidad arquitectónica

### Hecho verificado

**No existe el directorio `base44/agents/`.** No hay archivos `.jsonc`
declarativos de agentes Base44. El README afirmaba `base44/agents/*.jsonc
In-app AI agents (with approvals)` — **eso es falso** y ha sido corregido.

### Lo que sí existe

La "agent architecture" se implementa como **backend functions** que:

1. Llaman `base44.integrations.Core.InvokeLLM` para razonamiento.
2. Escriben a entidades `AgentRun`, `AgentTask`, `Approval`, `Event`.
3. Siguen el patrón: `actions_proposed` → `Approval` row → `approveAgentRun`
   (cuando el riesgo ≥ 2) → ejecución.

### Clasificación honesta

| Tipo | Cantidad | Descripción |
|---|---|---|
| Agentes declarativos Base44 | 0 | No existen. El directorio no está creado. |
| Orquestadores AI (backend functions) | 38+ | *Agent + *Orchestrator functions que llaman InvokeLLM |
| Flujos con aprobación humana | todos los de risk ≥ 2 | Approval entity bloquea hasta acción humana |
| Funcionalidades preparadas, no activas | varios | PREPARED_NOT_LIVE / LEGACY_DORMANT |

### Entidades de agente

| Entidad | Propósito | ¿Viva? |
|---|---|---|
| AgentRun | Registro de cada ejecución | Sí — escrita por orquestadores |
| AgentTask | Tareas derivadas de un run | Sí |
| Approval | Gate humano para risk ≥ 2 | Sí |
| AgentQuestion | Preguntas que un agente hace al admin | Sí |
| ChatMessage | Conversación con copilot | Sí |

### approveAgentRun — estado

`approveAgentRun` está en **CUARENTENA** (tag QUARANTINE). El flujo real de
aprobación se hace **inline** en cada orquestador (no a través de un handler
centralizado). Si se reactiva, crearía un segundo writer de Approval que
podría colisionar. **No borrar** hasta confirmar que ningún orquestador lo
llama — el probe de invocación lo dirá.

---

## 6. Entidades — clasificación compacta

### 86 entidades, agrupadas por riesgo:

**Tenant-facing con RLS de ownership (30):** Brand, DealActivation, Mandate,
Baseline, Invoice, MonthlySavingsReport, AnalyzerResult, AnalyzerInput,
PaymentsAnalysisSession, PaymentsAnalysisVerified, BrandSavings,
AuthorizationLog, OperationalLog, SavingsEvidence, ReferralLink,
ReferralActivation, CollectiveMember, StatementImport, Contract, UserDeal,
DealApplication, MigrationTask, ConnectionTask, ConnectionSession,
ConsentRecord, Document, DocumentLink, DetectedIntegration, StripeConnection,
Integration

**Admin-only RLS (40+):** Provider, ProviderLead, OutboundLead, WebhookEndpoint,
WebhookDelivery, WebhookDeadLetter, ApiKey, ApiUsageRecord, OAuthApp,
OAuthToken, OAuthState, OAuthAuthorizationCode, ApiActivityLog, Benchmark,
BenchmarkCohort, BenchmarkContribution, BenchmarkSnapshot, BenchmarkUpdateLog,
CohortDefinition, ComplianceIssue, ComplianceRule, SecurityAudit,
InfrastructureNode, InfrastructureEdge, IntegrationCatalog, IntegrationConnection,
IntegrationCredential, RateLimitCounter, IdempotencyKey, BillingRule, Event,
Approval, AgentQuestion, AgentRun, AgentTask, AgentTask, ChatMessage,
CompanyMemory, ContinuousDiscoveryRun, DiscoveryFinding, DiscoveryJob,
Insight, IntelligenceInsight, Organization, OrganizationMember, Recommendation,
Subscription, VerificationEvent

**Pública-creación (LeadCapture):** create abierta (funnel anónimo); read/update/
delete admin-only.

**Built-in (User):** read-only para no-admins.

### Entidades que almacenan PII

| Entidad | PII | RLS |
|---|---|---|
| Brand | contact_email, billing_*, vat_number | ownership |
| Lead / LeadCapture | email, whatsapp | admin-only read |
| PaymentsAnalysisSession | contact_email, ip_hash | admin-only |
| CollectiveMember | email | admin-only |
| Mandate | signed_by_email, ip_address, user_agent | ownership |
| Invoice | customer_*, supplier_* | admin-only |
| OAuthToken | (encrypted) token | admin-only |
| Integration | (encrypted) access_token | ownership |

---

## 7. Limitaciones de esta auditoría

1. **No se ejecutaron los tests** en este ciclo — las cifras de tests/audit/
   typecheck deben verificarse en el entorno local.
2. **La verificación de ownership** en funciones con asServiceRole se basó en
   la lectura del test estático y PRODUCTION_FUNCTIONS.md, no en una lectura
   línea por línea de cada function entry.ts. La sección 4 marca las que
   requieren verificación manual.
3. **No se probaron ataques reales** — esta es una auditoría estática de
   superficie, no un pentest.
4. **La cuarentena (16 functions)** no se eliminó — se documentó y se dejó el
   probe activo para confirmar inactividad antes del borrado.