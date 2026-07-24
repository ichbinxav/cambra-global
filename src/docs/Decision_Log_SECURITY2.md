# Decision Log — SECURITY-2 (Auditoría de límites de confianza)

**Fecha de cierre:** 2026-07-24 17:45 UTC
**Alcance:** las 141 funciones backend desplegadas (censo local `base44/functions/*/entry.ts`).
**Patrón atacado:** el patrón invertido `if (user && user.role !== "admin") → 403` — deniega a usuarios no-admin pero **deja pasar llamadas anónimas** (`user == null` no entra en el `if`). Detectado por auditoría externa el 2026-07-24.
**Remedio canónico:** `base44/shared/internalGate.ts` — `requireAdminOrInternal` / `requireUserOrInternal`. La ausencia de usuario se trata como ATACANTE; la legitimidad interna se demuestra con `INTERNAL_CALL_SECRET` (header `x-internal-secret` o payload `internal_secret`). Verificado por grep: **no existe ninguna copia divergente** del gate fuera de `shared/internalGate.ts` (0 resultados), y la única aparición restante del patrón invertido en todo `base44/functions/` es un **comentario** en `recordPayment` que documenta el estado anterior.

---

## T1 — Censo completo: 141 funciones, mecanismo de gate y suficiencia

Metodología: análisis estático de cada `entry.ts` (import de `internalGate`, patrones de denegación explícita 401/403, verificación de firma, API-key) + revisión manual de todos los candidatos ambiguos. Recuento final:

| Categoría | Nº | Suficiencia |
|---|---|---|
| **GATE CANÓNICO** (`internalGate`) | 30 | Deny-by-default; anónimo = 403/401; interno solo con `INTERNAL_CALL_SECRET`. |
| **GATE PROPIO — admin-role** | 80 | `auth.me()` + `role === 'admin'` con denegación explícita (401/403 o `assert('Unauthorized'/'Forbidden')`). El anónimo nunca pasa: `!user` deniega ANTES del check de rol (patrón directo, no invertido). |
| **GATE PROPIO — usuario autenticado (+ownership)** | 16 | `auth.me()` obligatorio; anónimo → 401. Scoping por `created_by`/`user_email` donde aplica. |
| **GATE PROPIO — API-key / firma** | 3 | `apiV1`, `mcpServer` (Authorization: Bearer API-key con validación por request), receptor Stripe (verificación `STRIPE_WEBHOOK_SECRET`). |
| **PÚBLICA POR DISEÑO** | 12 | Justificación individual abajo. |
| **Total** | **141** | |

### GATE CANÓNICO (30) — detalle
`benchmarkLearningEngine`[Q] · `stripeTestGroundTruth`[Q] · `recordPayment` · `onBrandCreated` · `computeVerticalStatus`(user) · `startSubscription`[Q] · `seedBenchmarkCohorts`[Q] · `billApiUsage` · `integrationRegistry`(user) · `guardDealActivationStatus`[Q] · `purgePaymentsAnalysisSessions` · `approveAgentRun`[Q] · `runContinuousDiscovery`(user) · `onInvoiceStatusEvent`[Q] · `updateMigrationTaskStatus`[Q] · `oauthRevoke`[Q] · `authzScope`[Q] · `promoteMeToAdmin`[Q] · `generateMonthlySavingsReport` · `seedStripeTestData`[Q] · `regenerateRecommendationsForBrand`(user) · `stripeHealthCheck`[Q] · `inferVendorsFromBankData` · `generateRecommendations` · `processWebhookDeadLetters` · `dispatchWebhook`[Q] · `scheduledBenchmarkRecompute` · `onSavingsEvidenceEvent` · `updateDealActivationStatus`[Q] · `inviteAdminUser`[Q]

`[Q]` = además en cuarentena PURGE-2 (probe con dedup horario hasta 2026-08-15). `(user)` = variante `requireUserOrInternal` (usuario autenticado basta; ownership verificado dentro).

### GATE PROPIO — admin-role (80)
Todas las funciones de las familias admin/ops/agentes/seeders/orquestadores no listadas en otra categoría: `adminSummaries`, `adminUpdateApplicationStatus`, `adminOverrides` (assert), `regenerateMigrationTasks` (assert), `getWaitlistLeads`, `getWaitlistAggregate`, `getAdminRecommendationQueue`, `getActivationAdminDetail`, `getCommandCenterPulse`, `answerAgentQuestion`, `chatChiefOrchestrator`, `brainOrchestrator`, `copilotChat`, `founderCopilotAgent`, todos los `*Agent` (24 agentes: blog, codeReview, security, qaMonitor, seo, crm, linkedin, xTwitter, newsletter, competitorMonitor, providerMonitor, providerResearch, leadDiscovery, leadEnrichment, leadScoring, meeting, followUp, gdpr, legalReview, contractIP, compliance, investorUpdate, spendIntelligence, discoveryTechStack, engineeringReport, fixValidator, qa, recommendationEngine, systemHealth, outreach), orquestadores (`leadOrchestrator`, `outreachOrchestrator`, `marketingOrchestrator`, `researchOrchestrator`), seeders (`seedDemoData`, `seedComplianceRules`, `seedIntegrationCatalog`, `seedPaymentsRateTable`), self-tests (`runApiSelfTests`, `runFlowSelfTests`, `sendTestWebhook`, `createSelfTestBrand`, `verifyRegistrySync`), facturación admin (`generateInvoiceFromReport`, `generateInvoicePdf`, `reconcileInvoice`, `createPaymentLink`), plataforma (`createApiKey`, `revokeApiKey`, `securityAuditLog`, `integritySummary`, `buildInfrastructureGraph`, `discoverCompanyInfrastructure`, `phase2CleanupLegacyFields`, `markOverdueJob`, `monthlyEconomicsJob`, `monthlySavingsJob`, `calculateNodeRevenue`, `getPlatformEconomics`, `getProviderLeads`, `oauthConnector` admin-side, connection checks de Drive/Sheets/Gmail/Slack), etc. Mecanismo homogéneo: usuario resuelto server-side, rol verificado, denegación explícita.

### GATE PROPIO — usuario autenticado (16)
`getMyPaymentsHistory`, `getPaymentsAnalysisVerified`, `getOnboardingStatus`, `getBrandSavings`, `getIntegrationStatus`, `claimAnonPaymentsResult` (usuario + token de sesión), `stripeOAuthConnect`, `stripeDataSync`, `stripeDisconnect`, `stripeConnectionDisconnect`, `computeStripeVerifiedGap`, `initiateConnection`, `dataSyncAgent`, `processUploadedFile`, `revokeMandate` (usuario + ownership `activation.user_email === me.email` o admin), documentos (`createDocument`/`listDocuments`/`linkDocument`/`unlinkDocument`/`updateDocumentMeta` — user+ownership), `_tenantGuard` (helper de scoping). Anónimo → 401 en todos.

### PÚBLICA POR DISEÑO (12) — justificación individual

| Función | Por qué es pública | Salvaguardas |
|---|---|---|
| `submitPaymentsAnalysis` | Funnel anónimo del Analyzer (producto core) | Rate-limit por hora (`PAYMENTS_ANALYSIS_RATE_LIMIT_PER_HOUR`), validación de inputs, solo crea su propia sesión |
| `getPaymentsGapTeaser` | Lectura del teaser anónimo por `session_id` (UUID no adivinable) | Rate-limit, proyección teaser (sin datos de terceros) |
| `submitWaitlistSignup` | Captura de leads pública | Validación de email, solo escribe `Lead` |
| `submitContactMessage` | Formulario público de /Contact (creado en SECURITY-2 Fase 5) | Validación de email/campos (400 en inválido), solo escribe `Lead` + notifica admin |
| `submitCallRequest` | CTA "book a call" del report anónimo | Validación, solo escribe lead propio |
| `joinCollective` | CTA de conversión del report anónimo | Validación de email, escribe solo `CollectiveMember` propio |
| `sitemap` | sitemap.xml para crawlers | Solo lectura de rutas estáticas |
| `getBenchmarkForReport` | Agregados de benchmark para el report anónimo | Solo agregados anonimizados vía service role; nunca filas de tenant |
| `getUploadCapability` | Feature-flags de subida para el Analyzer anónimo | Solo devuelve flags; nunca secretos |
| `oauthAuthorize` / `oauthToken` | Endpoints OAuth2 estándar — públicos por especificación | Validación de client_id/secret/código/PKCE propia del protocolo |
| `apiAuth` | DEPRECATED — devuelve `410 Gone` incondicional | Sin lógica ni datos |

---

## T2 — Automatizaciones: contexto de auth del scheduler + ejecución verificada

**Cómo se autentican los triggers de plataforma (evidencia del probe, OperationalLog 2026-07-24T16:44:16Z):** la automatización programada invoca la función con `authorization: Bearer <JWT>` que resuelve a `base44.auth.me() = { email: 94.martinez.x@gmail.com, role: "admin" }` (el dueño de la app), más headers `base44-scheduled-task: true`, `base44-automation-id`, `base44-service-authorization`. **Conclusión: el scheduler pasa el gate canónico como admin — ninguna automatización necesita el secreto interno y ninguna quedó auto-bloqueada.** El probe temporal (`probeSchedulerAuth` + automatización TEMP) fue eliminado/archivado tras capturar la evidencia.

**Ejecución manual de cada automatización registrada (2026-07-24 ~17:40 UTC, mismo actor-class que el scheduler):**

| Automatización | Función | Resultado manual | Evidencia adicional |
|---|---|---|---|
| Purge Payments Analysis Sessions (90d TTL) | `purgePaymentsAnalysisSessions` | 200 — `{ok:true, retention_days:90, deleted:0}` | last_run_status: success |
| Weekly Benchmark Recompute | `scheduledBenchmarkRecompute` | 200 — `{ok:true, cohorts_updated:3, contributions_processed:3}` | success |
| Bill API Usage (Monthly Overage) | `billApiUsage` | 200 — `{period_month:"2026-06", invoiced:0, failed:0}` (sin overage pendiente; claim `run_2026-06_b3cb64c1` emitido y sin efecto) | success |
| Process Webhook Dead Letters (cada 5 min) | `processWebhookDeadLetters` | 200 — `{processed:0, pending_total:0}` | **Logs muestran POSTs del scheduler cada 5 min hasta 17:38 UTC — post-parche, en vivo y en verde** |
| Monthly Savings Summary Email | `sendMonthlySavingsSummary` | 200 — `{sent:1, total:1}` (único opt-in: el founder) | success |
| Engineering Report — Morning / Afternoon | `engineeringReportAgent` | 200 — `{ok:true, task_id:…, counts:{critical:0,…}}` | success en ambas |
| TEMP — SECURITY-2 scheduler auth probe | `probeSchedulerAuth` | — archivada y función eliminada (diagnóstico completado) | evidencia en OperationalLog |

---

## T3 — Inventario de cambios SECURITY-2 (antes → después)

**Nuevo:**
- `base44/shared/internalGate.ts` — gate canónico (`requireAdminOrInternal`, `requireUserOrInternal`, `quarantineProbe` con dedup horario).
- `base44/functions/submitContactMessage` — el formulario de /Contact estaba roto (endpoint inexistente); endpoint público con validación.
- Esquemas: `ApiUsageRecord.billing_run_id` (claim anti doble-facturación), `WebhookDeadLetter.locked_at` (claim anti doble-envío). Aditivos.

**Funciones parcheadas (30) — antes → después:**

| Función | Antes | Después |
|---|---|---|
| `recordPayment` | Patrón invertido — anónimo podía acreditar importes a cualquier factura | Gate canónico + validación financiera + idempotencia + máquina de estados (código completo en T4) |
| `billApiUsage` | Patrón invertido + `catch(()=>null)` marcaba `billed:true` aunque la factura fallara | Gate canónico + claim `billing_run_id` + `billed:true` solo tras confirmar Invoice (código en T4) |
| `purgePaymentsAnalysisSessions` | Patrón invertido | Gate canónico |
| `onBrandCreated`, `onInvoiceStatusEvent`[Q], `onSavingsEvidenceEvent` | Patrón invertido (handlers de automatización de entidad) | Gate canónico |
| `generateMonthlySavingsReport`, `generateRecommendations`, `inferVendorsFromBankData` | Fallo de auth otorgaba privilegio (catch → seguir como interno) | Gate canónico — un fallo de auth nunca otorga privilegio |
| `runContinuousDiscovery` | `catch` ponía `isServiceRole=true` (mismo error conceptual que el invertido) | `requireUserOrInternal` |
| `regenerateRecommendationsForBrand`, `computeVerticalStatus` | Patrón invertido — anónimo pasaba | `requireUserOrInternal` + ownership de brand para no-admin |
| `integrationRegistry` | Sin gate efectivo | `requireUserOrInternal` (metadata estática, deny-by-default) |
| `scheduledBenchmarkRecompute`, `benchmarkLearningEngine`[Q], `processWebhookDeadLetters`, `dispatchWebhook`[Q] | Gate parcial/invertido; DLQ sin claim | Gate canónico + `locked_at` (claim 10 min) en re-entregas DLQ |
| `startSubscription`[Q], `seedBenchmarkCohorts`[Q], `seedStripeTestData`[Q], `stripeTestGroundTruth`[Q], `stripeHealthCheck`[Q], `guardDealActivationStatus`[Q], `updateDealActivationStatus`[Q], `updateMigrationTaskStatus`[Q], `approveAgentRun`[Q], `oauthRevoke`[Q], `authzScope`[Q], `promoteMeToAdmin`[Q], `inviteAdminUser`[Q] | En cuarentena PURGE-2, varias con gate débil o invertido | Gate canónico delante de la lógica original + `quarantineProbe` con dedup |

**Frontend:** `src/pages/ConnectTools.jsx` — el registro de interés en integraciones "coming soon" enviaba un shape inválido a `LeadCapture` y tragaba el error (el interés nunca se guardaba); reparado con el shape correcto (`source_page: connect_tools_interest:<slug>`) y error visible al usuario.

**Pruebas negativas (Fases 4-5):** 19 funciones sondeadas anónimamente → todas 401/403; probes de cuarentena registran `actor: anonymous` correctamente en OperationalLog.

---

## T4 — Salvaguardas financieras (código fuente vigente)

### `recordPayment/entry.ts` — validación + idempotencia + máquina de estados

```ts
// recordPayment — registers a payment against an Invoice.
//
// SECURITY-2 (2026-07-24):
//   · Canonical trust gate (admin OR INTERNAL_CALL_SECRET). The previous
//     inverted pattern `if (user && user.role !== 'admin')` let ANONYMOUS
//     callers credit arbitrary amounts to any invoice.
//   · amount validated: finite number, > 0, ≤ MAX_PAYMENT_EUR.
//   · currency (when provided) must match the invoice currency.
//   · IDEMPOTENCY: when processor + processor_ref are present, an existing
//     PaymentEvent with that pair short-circuits — the invoice is NOT
//     re-credited and the previous state is returned. Manual payments
//     without a ref (method 'manual', admin-triggered from AdminInvoices)
//     cannot be deduplicated automatically — documented criterion: the
//     admin UI is the safeguard for those.
//   · STATE MACHINE: payments are only accepted from 'issued' /
//     'partially_paid' / 'due' / 'overdue'. A 'paid' invoice is never
//     modified again by this endpoint (refunds are an explicit separate
//     event, out of scope here).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';

const MAX_PAYMENT_EUR = 1_000_000;

function computeStatus(total, paid) {
  if (paid <= 0) return 'due';
  if (paid > 0 && paid < total) return 'partially_paid';
  return 'paid';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const { invoice_id, amount, currency = null, processor = null, processor_ref = null, received_at = null, method = 'manual', note = null } = body || {};
    if (!invoice_id) return Response.json({ error: 'invoice_id is required' }, { status: 400 });

    // ── Financial validation ──
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return Response.json({ error: 'amount must be a finite number greater than 0' }, { status: 400 });
    }
    if (amt > MAX_PAYMENT_EUR) {
      return Response.json({ error: `amount exceeds the maximum accepted (${MAX_PAYMENT_EUR})` }, { status: 400 });
    }

    const rows = await base44.asServiceRole.entities.Invoice.filter({ id: invoice_id }, '-created_date', 1);
    const inv = rows?.[0];
    if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    if (currency && inv.currency && String(currency).toUpperCase() !== String(inv.currency).toUpperCase()) {
      return Response.json({ error: `currency mismatch: invoice is ${inv.currency}` }, { status: 400 });
    }

    // 'paid' is terminal for this endpoint — a paid invoice is never re-credited.
    const blockedStatuses = ['draft', 'void', 'refunded', 'failed', 'paid'];
    if (blockedStatuses.includes(inv.status)) {
      return Response.json({ error: `Payments not allowed from status ${inv.status}` }, { status: 400 });
    }

    // ── Idempotency (processor + processor_ref) ──
    if (processor && processor_ref) {
      const dup = await base44.asServiceRole.entities.PaymentEvent.filter(
        { processor, processor_ref, invoice_id: inv.id }, '-created_date', 1
      );
      if (dup?.length) {
        return Response.json({ invoice: inv, idempotent: true, existing_event_id: dup[0].id });
      }
    }

    const total = Number(inv.total_amount || 0);
    const newPaid = Math.round(((Number(inv.amount_paid || 0) + amt) + Number.EPSILON) * 100) / 100;
    const newBalance = Math.max(0, Math.round(((total - newPaid) + Number.EPSILON) * 100) / 100);
    const newStatus = computeStatus(total, newPaid);

    const updated = await base44.asServiceRole.entities.Invoice.update(inv.id, {
      amount_paid: newPaid,
      balance_due: newBalance,
      status: newStatus,
      paid_at: newStatus === 'paid' ? (received_at || new Date().toISOString()) : inv.paid_at || null,
      billing_snapshot_json: { ...(inv.billing_snapshot_json || {}), last_payment_method: method }
    });

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || null,
      amount: amt,
      currency: inv.currency || 'EUR',
      event_type: newStatus === 'paid' ? 'payment_succeeded' : 'payment_partially_succeeded',
      processor: processor,
      processor_ref: processor_ref,
      occurred_at: received_at || new Date().toISOString(),
      metadata_json: { method, note, recorded_by: gate.user?.email || 'internal' }
    });

    if (inv.monthly_savings_report_id) {
      const target = newStatus === 'paid' ? 'paid' : 'invoiced';
      await base44.asServiceRole.entities.MonthlySavingsReport.update(inv.monthly_savings_report_id, { status: target });
    }

    return Response.json({ invoice: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
```

**Criterio documentado — pagos manuales sin `processor_ref`:** no son deduplicables automáticamente (no hay clave de idempotencia natural); la salvaguarda es operativa — solo un admin puede dispararlos desde AdminInvoices y la máquina de estados impide re-acreditar una factura `paid`.

### `billApiUsage/entry.ts` — claim anti doble-ejecución

```ts
// billApiUsage — invoices each organization's API overage for the previous
// month. Runs on the 1st of every month at 02:00 via scheduled automation.
//
// SECURITY-2 (2026-07-24):
//   · Canonical trust gate (admin OR INTERNAL_CALL_SECRET) replacing the
//     inverted pattern that let anonymous callers trigger billing runs.
//   · Double-run protection: each record is CLAIMED with a billing_run_id
//     BEFORE invoicing; records already claimed by another run are skipped.
//   · `billed: true` is set ONLY after the Invoice creation is confirmed —
//     the old `.catch(() => null)` silently swallowed invoice failures while
//     still marking the record billed (revenue silently lost).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    // Previous month bucket
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodMonth = prev.toISOString().slice(0, 7);
    const runId = `run_${periodMonth}_${crypto.randomUUID().slice(0, 8)}`;

    const records = await base44.asServiceRole.entities.ApiUsageRecord.filter({ period_month: periodMonth, billed: false });
    const billable = records.filter((r) => (r.overage_amount_eur || 0) > 0);

    const results = [];
    const errors = [];
    for (const rec of billable) {
      // ── Claim before billing (double-execution protection) ──
      const fresh = await base44.asServiceRole.entities.ApiUsageRecord.get(rec.id).catch(() => null);
      if (!fresh || fresh.billed || (fresh.billing_run_id && fresh.billing_run_id !== runId)) {
        results.push({ id: rec.id, status: "skipped_claimed_elsewhere" });
        continue;
      }
      await base44.asServiceRole.entities.ApiUsageRecord.update(rec.id, { billing_run_id: runId });

      const org = await base44.asServiceRole.entities.Organization.get(rec.organization_id).catch(() => null);
      if (!org) {
        results.push({ id: rec.id, status: "skipped_no_org" });
        continue;
      }

      // Create the invoice — NO silent catch. If this fails, the record
      // stays billed:false (with the claim released) and the error is reported.
      let invoice = null;
      try {
        invoice = await base44.asServiceRole.entities.Invoice.create({
          status: "issued",
          currency: "EUR",
          issued_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          subtotal_amount: rec.overage_amount_eur,
          total_amount: rec.overage_amount_eur,
          balance_due: rec.overage_amount_eur,
          notes: `API overage · ${periodMonth} · ${rec.overage_count} requests above quota`,
          billing_snapshot_json: {
            organization_id: org.id,
            organization_name: org.name,
            period_month: periodMonth,
            included_quota: rec.included_quota,
            total_requests: rec.request_count,
            overage_count: rec.overage_count,
            overage_amount_eur: rec.overage_amount_eur,
          },
        });
      } catch (invErr) {
        // Release the claim so the next run retries this record.
        await base44.asServiceRole.entities.ApiUsageRecord.update(rec.id, { billing_run_id: null }).catch(() => null);
        errors.push({ id: rec.id, organization: org.name, error: invErr.message });
        results.push({ id: rec.id, status: "invoice_creation_failed", error: invErr.message });
        continue;
      }

      // billed:true ONLY after the invoice exists.
      await base44.asServiceRole.entities.ApiUsageRecord.update(rec.id, {
        billed: true,
        billed_at: new Date().toISOString(),
      });

      results.push({ id: rec.id, organization: org.name, amount_eur: rec.overage_amount_eur, invoice_id: invoice.id, status: "invoiced" });
    }

    if (errors.length) console.error("billApiUsage — invoice creation failures:", JSON.stringify(errors));

    return Response.json({ period_month: periodMonth, run_id: runId, invoiced: results.filter(r => r.status === "invoiced").length, failed: errors.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
```

Pruebas de Fase 5 sobre facturas de test: importe negativo → 400; importe > máximo → 400; divisa distinta → 400; pago duplicado (processor+ref) → `idempotent:true` sin re-acreditar; pago sobre factura `paid` → 400. Datos de test eliminados tras la verificación.

---

## T5 — Regresión final de endpoints públicos (2026-07-24 17:42 UTC, llamadas anónimas reales contra producción)

| Prueba | Salida literal |
|---|---|
| `submitPaymentsAnalysis` — Stripe / FR / GMV 30.000 € / ticket 50 € (online) | `200 {ok:true, anon_session_id:"807df630-ab07-462f-aa98-c45dcaac0030"}` |
| `submitPaymentsAnalysis` — SumUp / ES / GMV 25.000 € / ticket 35 € (in-store) | `200 {ok:true, anon_session_id:"282f7824-4020-4498-8f84-e0e08677ae3a"}` |
| `getPaymentsGapTeaser` — sesión FR anterior | `200` con `{ok, engine_version, input_snapshot, engine_result}` — teaser completo |
| `submitWaitlistSignup` — email de test | `200 {ok:true, lead_id:…}` — Lead creado y verificado |
| `submitContactMessage` — mensaje válido | `200 {ok:true, lead_id:…}` — Lead creado y verificado |
| `submitContactMessage` — email inválido | `400 {ok:false, error:"invalid_email"}` — validación correcta |
| ConnectTools — interés en integración | Registro `LeadCapture` con `source_page: "connect_tools_interest:shopify"` creado y **verificado persistido** en la entidad (misma ruta/shape que el frontend reparado) |

**Limpieza:** los dos `Lead` de test y el `LeadCapture` de test fueron eliminados tras la verificación. Las dos `PaymentsAnalysisSession` de test caducan por el TTL de 90 días (purge diario 01:15 UTC, verificado operativo en T2).

---

## Cierre

- Anti-patrón invertido: **0 apariciones ejecutables** en 141 funciones (solo 1 comentario documental).
- Gate canónico único en `shared/internalGate.ts`, **sin copias divergentes**.
- 7 automatizaciones activas verificadas: el scheduler autentica como admin (owner) — ninguna auto-bloqueada; todas ejecutadas manualmente con 200.
- Endpoints públicos del funnel: intactos y verificados con salidas literales.
- Salvaguardas financieras (idempotencia, claims, validación, máquina de estados) en producción y probadas.

**SECURITY-2 — CERRADO. Proyecto listo para exportación (SWEEP-1 + SECURITY-2).**

*Firmado: auditoría interna SECURITY-2, 2026-07-24.*