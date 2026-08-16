# Decision Log — CAMBRA v0.98.0 Remediation R4

**Fecha:** 2026-08-14

**Chunk:** `R4 — Approvals y transiciones materiales`

**Versión de apertura:** `0.98.0-rc.3`

**Versión de cierre:** `0.98.0-rc.4`

**Estado:** `REPOSITORY_CHUNK_COMPLETE_RUNTIME_PENDING`; no es un production seal ni evidencia live

## 1. Baseline al abrir

R4 se abrió después del `verify:chunk` verde de R3. El recibo R3 registró 239 test files, 2.917 tests PASS, 0 skips, 276 funciones físicas, 27 rutas lógicas y 2.794 ficheros staged. La identidad source de apertura fue 1.753 ficheros con hash `feb1d2d26fb426eb6d79a63afab787352a1928e16cc6102908ecb59efed0099f`; el bundle fue `40572e61cc967b12676229da21ff1ae85865385885f4c2bb03c8cfb58fdb78d0`, la topología `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8` y el lockfile `077304c23a6d7e4ce867761df93bd014e5e498a0c74d87c6cc33ee5022343313`.

El árbol actual siguió siendo la autoridad. No se hizo `reset`, `checkout`, borrado amplio ni otra operación destructiva. No se desplegó, publicó, envió, activó, purgó ni mutó producción.

## 2. Inventario y gaps comprobados

- El inventario generado identifica 16 creators de Approval, 20 action types y siete ejecutores externos. No se creó otro approval, claim o execution plane.
- El preview anterior no enlazaba de forma exhaustiva policy, authority, intelligence, economía/legal, market scope, Emergency, actor/tenant/subject, expiry y nonce de un solo uso.
- `Approval` mezclaba decisiones legacy con una proyección de ejecución incompleta; algunos ejecutores podían finalizar sin una referencia provider explícita.
- Billing ya tenía claim CAS e idempotency Stripe, pero existían ventanas de crash entre receipt, `PaymentEvent`, proyecciones locales y el estado terminal del report. Un status HTTP post-transporte no demostraba por sí solo un fallo pre-effect.
- Developer migration ya tenía lifecycle/fence, pero sus receipts se reemplazaban entre actions y un lease ausente o inválido podía parecer expirado. Payments go-live necesitaba binding, receipts y reanudación conservadora.
- Recover acceptance tenía CAS parcial, pero contadores contradictorios o `success:false` debían bloquear. La supersession, PDF/email y orquestación post-acceptance siguen sin una cadena inmutable universal.
- La generación de reportes Recover era read-before-create sin unicidad durable: dos reports no-void del mismo activation/month podían alimentar claims separados. El repositorio no demuestra una constraint única Base44; la remediación contiene el split-brain y bloquea approval y todo POST Stripe, pero la reconciliación real sigue pendiente.
- Las rutas alternativas `generateInvoicePdf`, `recordPayment`, `reconcileInvoice` y `createPaymentLink` necesitaban bloquear por OR cualquier autoridad Recover o Stripe. Los tres ledgers financieros permitían writes frontend y el reconciler podía hambrear filas fuera del primer batch.
- El flujo Payments go-live continúa sin un productor canónico de `AUTHORIZE_MIGRATION` con `ADVANCED_E_SIGNATURE`; no se inventó esa autoridad legal.

## 3. Decisiones e implementación

### 3.1 Approval hash-bound y nonce de un solo uso

La serialización canónica enlaza payload, policy key/version, authority snapshot ID/hash, intelligence snapshot ID/hash, términos económicos y legales, market-scope version, EmergencyControl ID/revision, actor, tenant, subject, expiry y hash del nonce. El nonce crudo no se persiste en Approval, AgentTask, ChatMessage, Event ni logs.

El claim usa contadores CAS coherentes y readback exacto. Un cambio en cualquier dimensión, expiry, nonce usado, autoridad duplicada o dos confirmaciones concurrentes bloquea antes del efecto. Admin Approvals, Inbox, Founder Control y Admin Chat transmiten el nonce solo en memoria; recargar requiere un preview nuevo.

### 3.2 Decisión separada de ejecución

`Approval.decision_status` usa `PENDING | APPROVED | REJECTED | EXPIRED`. `AgentTask.execution_status` usa `NOT_STARTED | CLAIMED | EFFECTING | EXECUTED | FAILED_RETRYABLE | FAILED_TERMINAL | REVIEW_REQUIRED` con lease, fence y receipt explícito.

Los siete ejecutores externos —`publish_blog`, `publish_linkedin_post`, `publish_x_post`, `schedule_founder_meeting`, `send_follow_up_email`, `send_newsletter` y `send_outreach_email`— comparten la misma primitive. `EXECUTED` exige una referencia real del dominio/provider; se eliminó el receipt local fabricado a partir de una respuesta arbitraria. Filas legacy aprobadas sin receipt derivan a `NOT_STARTED` o `REVIEW_REQUIRED`, nunca a `EXECUTED`.

### 3.3 Billing issuance y collection

Cada request Stripe se construye desde un descriptor único y queda ligada a un fingerprint canónico de provider, account scope, mode, method, path, parámetros e idempotency key. Después de `EFFECT_STARTED`, todo resultado no concluyente queda `REVIEW_REQUIRED` salvo prueba explícita local de que el transporte no empezó.

Billing issuance conserva receipts hash-chained, valida account scope, `response_binding`, cap-plus-one y readbacks exactos. `readRecoverReportAuthority` exige exactamente un report no-void por activation/month después de crearlo, antes de anunciarlo, antes del CAS de approval y antes de cada POST Stripe. Una duplicidad queda fail-closed; no se inventa unicidad de datastore.

El webhook firmado relee el estado actual de Stripe y reanuda las proyecciones aunque el `PaymentEvent` ya exista; el receipt de evento por sí solo no se confunde con convergencia completa. Invoice/report se releen en sandwich para impedir que una escritura tardía resucite `paid` después de `disputed`, `refunded` o `void`. El reconciler selecciona por menor `last_reconciled_at`, estampa intento antes de consultar Stripe y evita starvation local. `onInvoiceStatusEvent` queda en cuarentena terminal HTTP 410.

`PaymentEvent`, `Invoice` y `MonthlySavingsReport` conservan reads aplicables y restringen writes a service role. Las cuatro rutas financieras alternativas bloquean si existe `monthly_savings_report_id` **o** `payment_provider=stripe` **o** `stripe_invoice_id`; `generateInvoicePdf` solo mantiene el camino legacy no-Recover, aún `PARTIAL` por falta de lease/reconciliación del upload.

### 3.4 Migración y go-live

Developer migration conserva la cadena del action actual y archiva cada cadena completada en un historial `prior_actions` append-only hash-chained entre apply, cutover y rollback. Lease ausente/inválido, readback ambiguo o fallo al persistir `REVIEW_REQUIRED` bloquean; no habilitan takeover. Los receipts enlazan prior hash, step, attempt, authority, binding, idempotency y resultado provider.

Payments go-live usa `MigrationTask.metadata_json` como autoridad CAS/fence del dominio, enlaza Activation, Mandate, Approval, autoridad legal, Emergency y material payload, y converge a `RECONCILING` ante ambigüedad post-effect. El replay reintenta únicamente proyecciones locales seguras. Plan materialization multirow, pasos no-go-live y el productor legal de approval permanecen gaps literales.

### 3.5 Recover acceptance y contratos

La aceptación serializa la autoridad en DealActivation, CAS-ea el Mandate con token, valida la invariante de un solo mandato activo y autoriza mediante binding exacto. Reads de mandato activos o pinned usan cap-two y una autoridad duplicada/ausente falla cerrada. Contadores ausentes, contradictorios o `success:false` fallan cerrados. Una revocación concurrente intenta compensar la autorización y exige readback.

La cadena completa de supersession, generación PDF, storage, email y orquestación posterior todavía no comparte receipts inmutables por paso. Por ello la cobertura global de `ROOT-OTR-011` permanece `PARTIAL`.

## 4. Archivos de R4

### Approvals

- `base44/shared/approvalAuthority.ts`
- `base44/shared/approvalResolutionSaga.ts`
- `base44/shared/externalApprovalExecution.ts`
- `base44/entities/Approval.jsonc`
- `base44/entities/AgentTask.jsonc`
- `base44/entities/FounderCommandAudit.jsonc`
- `base44/functions/founderOSCommand/entry.ts`
- `base44/functions/chatChiefOrchestrator/entry.ts`
- `base44/functions/blogAgent/entry.ts`, `linkedinAgent`, `xTwitterAgent`, `meetingAgent`, `followUpAgent`, `newsletterAgent` y `outreachAgent`
- `src/components/admin/approvals/ApprovalCard.jsx`
- `src/pages/admin/AdminApprovals.jsx`
- `src/pages/admin/AdminInbox.jsx`
- `src/pages/admin/AdminFounderControl.jsx`
- `src/pages/admin/AdminChat.jsx`
- `src/lib/approvalAuthoritySaga.test.js`
- `src/lib/externalApprovalExecution.test.js`
- `src/lib/founderApprovalRegistry.test.js`

### Recover, billing y migration

- `base44/shared/recoverAcceptance.ts`
- `base44/shared/recoverEconomicMandate.ts`
- `base44/shared/recoverReportAuthority.ts`
- `base44/functions/acceptRecoverMandate/entry.ts`
- `base44/shared/economicExecution.ts`
- `base44/functions/generateMonthlySavingsReport/entry.ts`
- `base44/functions/approveRecoverReportForInvoicing/entry.ts`
- `base44/functions/createEligibleRecoverInvoices/entry.ts`
- `base44/functions/stripeBillingWebhook/entry.ts`
- `base44/functions/reconcileRecoverBilling/entry.ts`
- `base44/functions/onInvoiceStatusEvent/entry.ts`
- `base44/functions/generateInvoicePdf/entry.ts`
- `base44/functions/recordPayment/entry.ts`
- `base44/functions/reconcileInvoice/entry.ts`
- `base44/functions/createPaymentLink/entry.ts`
- `base44/entities/Invoice.jsonc`, `MonthlySavingsReport.jsonc` y `PaymentEvent.jsonc`
- `base44/shared/developerMigrationLifecycle.ts`
- `base44/shared/paymentsMigrationSaga.ts`
- `base44/functions/updatePaymentsMigrationTask/entry.ts`
- `src/lib/recoverFinancialHardening.test.js`
- `src/lib/recoverBillingSaga.test.js`
- `src/lib/recoverBillingReconcilerSelection.test.js`
- `src/lib/financialEntityServiceRoleRls.test.js`
- `src/lib/eclP6Closure.test.js`
- `src/lib/developerMigrationLifecycle.test.js`
- `src/lib/paymentsMigrationSaga.test.js`
- `src/lib/paymentsMigrationP9.test.js`

### Evidencia del chunk

- `scripts/generate-remediation-r0.mjs`
- `config/remediation/material-boundary-registry.v1.json`
- `config/remediation/material-tenant-authorization-inventory.v1.json`
- `src/lib/remediationR0Artifacts.test.js`
- `scripts/generate-remediation-r4.mjs`
- `scripts/check-remediation-r4.mjs`
- `config/remediation/material-transition-saga-inventory.v1.json`
- `src/lib/remediationR4Artifacts.test.js`
- `scripts/generate-intelligence-canonical-v2.mjs`
- `scripts/check-intelligence-canonical-v2.mjs`
- `config/intelligence/orchestration-p0-remediation.v2.json`
- `config/intelligence/acceptance-test-catalog.v2.json`, `canonical-alias-map.v2.json`, `compatibility-ledger.v2.json`, `composition-manifest.v2.json`, `requirement-ledger.v2.json`, `root-seals.v2.json` y `scope-precedence.v2.json`
- `src/lib/intelligenceCanonicalReconciliationV2.test.js`
- `scripts/generate-agenttask-creator-inventory.mjs` y `config/agenttask-creator-inventory.json`
- `scripts/generate-scheduler-inventory.mjs` y `config/scheduler-inventory.json`
- `base44/shared/documentationRegistry.ts`
- `scripts/generate-documentation-manifest.mjs`
- `config/release-touch-list.json`
- `config/documentation-drift-manifest.json`
- `config/p1-durability-manifest.json`
- `package.json`
- `package-lock.json`
- `src/docs/Decision_Log_REMEDIATION_R4.md`

No se añadió función física, ruta lógica, entidad ni control plane. La fachada de report authority reutiliza `readSingletonAuthority` y la autoridad durable sigue siendo el conjunto de `MonthlySavingsReport` no-void del dominio.

## 5. Frozen

`stripeBillingWebhook/entry.ts` se actualizó exclusivamente mediante `scripts/update-freeze.mjs`, con token y razón explícitos. El change log registra las tres transiciones R4, sin omitir hashes intermedios:

1. `7d901ff82c2d09cbed38988b6307f4d6bb18ab8ca46416e2d542aa39cc214601` → `4bbe0f5f3530eee4282d70aaa4bde06259bd486270e45d9bb8cb86843767c9c3`: reanudación current-state, cap-plus-one, readbacks y convergencia resumible.
2. `4bbe0f5f3530eee4282d70aaa4bde06259bd486270e45d9bb8cb86843767c9c3` → `e8926bdc76536033e95b7d27e7cdfb07766fbd2f6ad2641b02a70c08c58dffec`: binding exacto del evento al Invoice, CAS monotónico y receipts inmutables.
3. `e8926bdc76536033e95b7d27e7cdfb07766fbd2f6ad2641b02a70c08c58dffec` → `af836e8e2d69c40a7db9ecfc8f5261fdf4e7d8562d2b03a2c545d16c82552a71`: revocación de una proyección `paid` stale tras disputa, refund o void.

El hash live y sancionado al cerrar evidencia local es `af836e8e2d69c40a7db9ecfc8f5261fdf4e7d8562d2b03a2c545d16c82552a71`. No se editó el freeze a mano y no cambió pricing, copy, semántica ECL ni economía contractual.

## 6. Tests y estado OTR

La suite local canónica del ledger pasó exactamente **31/31 test files y 439/439 tests**, sin skips reportados por Vitest. El `verify:chunk` final pasó **244/244 test files y 3.068/3.068 tests**, con 0 fallos y 0 skips. El baseline de apertura fue 239 files/2.917 tests/0 skips: R4 añadió cinco test files y 151 tests sin reducir cobertura ni aumentar skips.

Los nombres literales añadidos o reforzados de mayor riesgo incluyen:

- `hash-binds every one-use confirmation dimension independently`;
- `grants exactly one claim when two attempts race`;
- `ignores a fake EXECUTED audit receipt when canonical execution is NOT_STARTED`;
- `requires an explicit typed effect receipt before EXECUTED`;
- `keeps the gateway and all seven executors on the durable protocol`;
- `consumes an unambiguous one-use nonce through every Founder approval UI`;
- `quarantines both report creators when activation-month creation races`;
- `detects a report inserted between approval checks before the CAS`;
- `does not advertise a report when a contender appears after its first post-create proof`;
- `revalidates the report singleton after creation, before approval CAS, and before every Stripe POST`;
- `blocks duplicate $name mandate authority before any provider or CAS effect`;
- `blocks every Recover or Stripe authority in %s before mutation/effect`;
- `hash-binds the complete Stripe request and quarantines a changed replay with zero transport`;
- `repairs report when Invoice advances between issuer derivation and finalize CAS`;
- `does not let a paused paid webhook resurrect report evidence after a stronger refund`;
- `covers more than two batches across consecutive bounded cycles`;
- `fails closed on unavailable, over-cap, duplicate, or unbound authority rows`;
- `terminally quarantines the legacy invoice entity-event route before any authority or write`;
- `preserves a hash-chained action history across apply, cutover and rollback`;
- `converges to reconciliation when provider success cannot be checkpointed`;
- `keeps all three OTR binary closures NOT_MET and OTR-011 PARTIAL`.

Comandos y resultados literales de evidencia antes del gate completo:

```text
node scripts/generate-agenttask-creator-inventory.mjs
PASS — 61 creator files, 5 root adapted, 56 not adapted

npm run scheduler:generate
PASS — 69 scheduled automations

npm run remediation:r0:generate && npm run remediation:r0:check
PASS — 42 material boundaries; 42 tenant rows; 69/67/67 scheduled/active/guarded; research 11/9/2; INPUT_CORPUS_MISSING

npm run remediation:r4:generate && npm run remediation:r4:check
PASS — 7 saga rows; 16 creators; 20 action types; 7 executors; 44 evidence files; 0 CLOSED; OTR-011 PARTIAL

npx vitest run src/lib/remediationR0Artifacts.test.js src/lib/remediationR4Artifacts.test.js
PASS — 2 files / 15 tests

npx vitest run <31 ficheros exactos de orchestration-p0-remediation.v2>
PASS — 31 files / 439 tests

npm run intelligence:canonical:generate && npm run intelligence:canonical:check
PASS — 538 requirements; 892 acceptance definitions; 20/20 OTR NOT_MET; 8/8 root seals NOT_SEALED

npx vitest run src/lib/intelligenceCanonicalReconciliationV2.test.js src/lib/intelligenceRequirementLedger.test.js
PASS — 2 files / 15 tests

npm run documentation:check
PASS — registry p18-docs-1.15.0; 293 source paths; 41 canonical docs; zero drift

npm run durability:check
PASS — 492 files; stage ECL_P8_PRODUCTION_ADMIN_AUTOMATION_AI_OPERATIONS; 0 mismatches

git diff --check
PASS — no whitespace errors
```

Fallos intermedios preservados, no ocultados:

```text
npm run remediation:r4:check
FAIL — remediation_r4_invalid:generated_drift:config/remediation/material-transition-saga-inventory.v1.json
Corrección: se actualizó el generador y se regeneró el artefacto; el rerun pasó con 44 evidence files.

suite canónica propuesta antes de regenerar config/agenttask-creator-inventory.json
FAIL — 30/31 files, 416/417 tests; único fallo: inventario AgentTask stale
Corrección: se regeneró desde base44/functions/**/*.ts (61 creators, 5 adaptados, 56 no adaptados); el rerun exacto pasó 31/31 y 439/439 tras incluir los dos tests financieros.

primer npm run verify:chunk sobre el árbol de cierre
FAIL — public-errors:check detectó un diagnóstico interno expuesto en la respuesta 503 de createEligibleRecoverInvoices/entry.ts:154
Corrección: la frontera conserva el código público estable stripe_billing_account_authority_unavailable y material_effects_fail_closed=true, pero ya no serializa el mensaje interno; se añadió una aserción de no exposición.

segundo npm run verify:chunk
FAIL — Vitest: 235/244 files y 3.055/3.068 tests PASS; 13 regresiones estáticas en nueve files buscaban nombres de helpers, comillas o llamadas Stripe directas anteriores a las fachadas R4.
Corrección: se mantuvieron todos los requisitos y se actualizaron únicamente los contratos de test para exigir persistRecoverReportApprovalDecision, claimedStripeRequest/executeRecoverBillingProviderRequest, gates ECL y regex semánticos tolerantes al formato; además se prohíbe raw stripeRequest POST. Los dos grupos focales pasaron 4 files/83 tests y 5 files/101 tests.

tercer npm run verify:chunk
PASS — 244/244 test files; 3.068/3.068 tests; 0 fallos; 0 skips; build PASS.
```

Los recibos focales previos del subárbol financiero fueron 2 files/34 tests y la regresión billing 7 files/152 tests, ambos PASS. En el árbol final también pasaron `tsconfig.critical`, typecheck completo, lint, dependency audit (745 dependencias, 0 vulnerabilidades), Base44 bundle/check y build.

Estado honesto por eje:

- `ROOT-OTR-009`: `REPO_REMEDIATED_RUNTIME_PENDING`, `PASSED_LOCAL`, binario `NOT_MET`;
- `ROOT-OTR-010`: `REPO_REMEDIATED_RUNTIME_PENDING`, `PASSED_LOCAL`, binario `NOT_MET`;
- `ROOT-OTR-011`: `PARTIAL`, `PASSED_LOCAL`, binario `NOT_MET`.

Globalmente quedan 14 OTR `PARTIAL`, 6 `REPO_REMEDIATED_RUNTIME_PENDING`, 20/20 cierre binario `NOT_MET`, 8/8 root seals `NOT_SEALED`, `productionSealEligible=false` y veredicto `NOT_GO_READY`.

## 7. RUNTIME_PENDING

- carrera real de dos confirmaciones sobre Base44 desplegado final-SHA;
- receipts/replay/reconciliación real de los siete ejecutores externos;
- auditoría y backfill de Approval/AgentTask legacy live, no ejecutados;
- validación live de authority, intelligence, policy, Emergency y market-scope dependencies;
- crash-between-step y current-state receipts Stripe reales;
- constraint/semántica real de Base44 para activación/month, carrera datastore con dos creadores y reconciliación manual/runtime de cualquier duplicado no-void;
- semántica runtime de filtros `$in`/`$nin`, null sorting y orden ascendente usada por lecturas cap-two y reconciler fair-selection;
- receipts reales del account scope, request/response binding, issuance, dispute, refund, void y reparación monotónica Invoice/report;
- lease/idempotencia/reconciliación de upload para el PDF legacy no-Recover;
- saga universal o bloqueo explícito final para rutas legacy no-Recover `recordPayment`/`reconcileInvoice`;
- GitHub apply/cutover/rollback con refs, SHA, PR, checks y receipts desplegados;
- Payments go-live con datos runtime, receipt y compensación real;
- productor y evidencia legal `AUTHORIZE_MIGRATION` con `ADVANCED_E_SIGNATURE`;
- saga única para materialización multirow y pasos no-go-live de Payments;
- cadena inmutable y compensación completa de Recover supersession, PDF, storage, email y post-acceptance;
- todos los blockers live heredados de R0–R3.

No se desplegó, publicó, envió email, activó campaña, rotó secreto, purgó ni mutó producción.

## 8. Gate final e identidad

El gate se ejecutó con Node `24.19.0`, npm `11.17.0`, Deno fijado y `CAMBRA_INTELLIGENCE_SPEC_DIR=/Users/xavimartinezcontero/Documents`:

```bash
PATH=/private/tmp/cambra-node-v24.19.0/bin:/private/tmp/cambra-deno/bin:$PATH \
  npm_config_cache=/private/tmp/cambra-npm-cache \
  CAMBRA_INTELLIGENCE_SPEC_DIR=/Users/xavimartinezcontero/Documents \
  npm run verify:chunk
```

Resultado literal final: `PASS`. Quedaron verdes toolchain, clean, policy, markets `33/30/3`, locales, growth, landing, ECL, DR catalog, research `11/9/2`, durabilidad, documentación, scheduler, retention, secrets, public errors, silent failures, dependency audit, Base44 functions, CI config, canonical intelligence, remediation R0/R4, lint, typecheck crítico, typecheck completo, 244/244 test files, 3.068/3.068 tests y build.

Identidad observada inmediatamente antes de incorporar este recibo al propio log:

- source tree: 1.764 ficheros, `sha256-tree-v1` `9ecbdcca0bcf7ca0a6b9b9e828f851681a0b97ce66e9643a3cc87b02cac06a73`;
- bundle físico: 276 funciones, 27 rutas lógicas, 2.825 ficheros staged, `a7b34083e7d40015f7cdcc52d98dee933fa14a7107ba22bd100cbe70488b31db`;
- bundle manifest: `85790b3fd3b9ae281fbe3074a520acd9efd4a67be12c8f095a4989382dac7de8`;
- deployment topology: `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8`;
- scheduler inventory: `8a2b7ca8442bfbcbcbd383f84323d5ecbebb78c254dfb208cb5d1caf37c39229`;
- lockfile: `6b046557ed638753d3f250432cbaa41896092f0d3c00139ec469c0e16908c8da`.

El source hash es deliberadamente un recibo pre-log: el decision log pertenece al source tree y no puede contener su propio hash final sin autorreferencia. Tras escribir este recibo se regeneraron y verificaron documentación y durabilidad; `git diff --check` también pasó. Los gates de release reservados a R7 no se ejecutaron. No se emitió seal, no se desplegó y no hubo mutación live.
