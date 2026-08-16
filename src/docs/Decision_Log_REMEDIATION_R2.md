# Decision Log — CAMBRA v0.98.0 Remediation R2

**Fecha:** 2026-08-13

**Chunk:** `R2 — Stripe, alertas, DR y Emergency Core`

**Versión de apertura:** `0.98.0-rc.1`

**Versión de cierre:** `0.98.0-rc.2`

**Estado:** `CHUNK_VERIFIED_WITH_DECLARED_OTR_PARTIALS`; no es un production seal ni evidencia live

## 1. Baseline al abrir

R2 se abrió solo después del `verify:chunk` verde de R1. El recibo final de R1 registró 235 test files, 2.827 tests PASS, 0 skips, 276 funciones físicas, 27 rutas lógicas y 2.714 ficheros staged. La identidad source observada después de cerrar el propio log R1 fue 1.745 ficheros con hash `8b7dc61a108d9ec7b6540fa985ed168efa6f3419eb38c09a814ad9b800947794`; el bundle R1 fue `7dbf7b5c7b23d057e977cbce9810d65eb9efc0cf6912a923954142b2d2154a49` y la topología `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8`.

El árbol actual manda sobre cualquier cifra del prompt. Se conservaron todos los cambios previos; no hubo `reset`, `checkout`, borrado amplio ni otra operación destructiva.

## 2. Inventario y gaps comprobados

- El webhook físico Stripe ya verificaba firma sobre raw body, pero no gobernaba `account.application.deauthorized` ni `account.updated` de connected accounts.
- El alerting existente enviaba una comunicación por incidente y proyectaba una respuesta del provider como `DELIVERED`.
- `CompressionStream.write` recibía un buffer con ownership no portable en el target Node exacto.
- Las primitivas `EmergencyControl`, captura de epoch, fencing y contención ya existían; no se creó un segundo plano.
- Varias fronteras materiales inventariadas aún usaban point checks o no heredaban el epoch hasta el efecto externo.
- La evidencia por transporte no estaba persistida con el enum contractual exacto.
- Outlook y Resend no ofrecen en este contrato una pausa provider-wide demostrable; deben permanecer localmente bloqueados pero remotamente no verificados.

## 3. Decisiones e implementación

### 3.1 Stripe connected accounts

El endpoint físico existente conserva firma sobre el body crudo y livemode fail-closed. Para eventos Connect, `event.account` es el identificador de connected account; `data.object` se valida como `application` en deauthorization y como el `Account` exacto en `account.updated`.

La resolución de `Integration.provider_account_id` debe producir exactamente una autoridad. Un claim CAS durable por `event.id + account`, con revisión, token, lease y estado `EFFECT_STARTED`, evita doble aplicación y bloquea el replay ciego después de ambigüedad. Un `Event` idempotente conserva receipt y `AutonomyIncident` conserva la reconciliación si una transición multi-entidad queda parcial.

La rutina común de desconexión se reutiliza desde webhook y ruta manual. Revoca `IntegrationCredential`, desconecta `Integration` y `StripeConnection` legacy, revoca `ConsentRecord`, marca la fuente Recover como missing y registra `OperationalLog`. Los drops de `charges_enabled`/`payouts_enabled` son sticky: un webhook positivo posterior nunca reactiva automáticamente.

La configuración real del endpoint Connected accounts y sus receipts siguen pendientes de runtime.

### 3.2 Alertas agregadas al founder

`AutonomyIncident` sigue siendo la única verdad del incidente e `IncidentAlertDelivery` el ledger de transporte. `maintenanceEngine` aloja un ciclo material con `worker_key=incidentAlertingAggregate` y slot de 15 minutos sobre el scheduler/fencing existente; no se añadió ruta ni función.

Un ciclo agrega los HIGH/CRITICAL elegibles en un solo email y enlaza todos sus IDs. La selección excluye incidentes originados por alerting para evitar recursión. Un singleton `OutboundControl`, Emergency epoch, sender y cost governance se comprueban antes del efecto. El provider response se registra como `ACCEPTED`, nunca como delivery observada; un fallo genérico después de `EFFECT_STARTED`, una persistencia ambigua o un finalizer perdido convergen a `REVIEW_REQUIRED` y no se reintentan a ciegas.

Outbound continúa pausado por decisión del founder; la existencia del mecanismo no autoriza ningún envío.

### 3.3 DR gzip portable

`transformBytes` escribe una copia `Uint8Array` owned al stream. Los tests cubren bytes vacíos, payload grande y un subarray que no posee el buffer completo. No cambia el formato ni la semántica criptográfica o de backup.

### 3.4 Emergency Core y transportes

Se reutilizaron `emergencyState`, `captureEmergencyEpoch`, `inheritEmergencyEpoch`, `assertEmergencyEpochUnchanged`, `guardedEmergencyEffect` y los claims económicos existentes. Las fronteras adaptadas heredan el mismo epoch y lo releen inmediatamente antes y después del efecto; una carrera posterior al provider se trata como ambigüedad/revisión, no como permiso de retry.

La autoridad `EmergencyControl` persiste evidencia por `outlook`, `resend` e `instantly` con estados exactos `NOT_CONFIGURED`, `LOCALLY_BLOCKED`, `REMOTELY_VERIFIED_PAUSED`, `UNVERIFIED` o `ERROR`. La escritura usa CAS sobre el mismo control y readback exacto. `CONTAINED` solo es posible si cada transporte configurado cumple el contrato estricto. Outlook y Resend configurados quedan `LOCALLY_BLOCKED` y mantienen `CONTAINMENT_INCOMPLETE`; Instantly solo alcanza pausa remota verificada con receipt.

La cobertura local se amplió en migración de Payments, webhook dispatch y agentes de negociación/monetización adaptados. No se hizo una migración universal de IA ni se tocó la semántica ECL/económica; ese inventario permanece parcial para R6.

## 4. Archivos de R2

### Stripe

- `base44/shared/stripeConnectedAccountLifecycle.ts`
- `base44/functions/stripeBillingWebhook/entry.ts`
- `base44/functions/stripeConnectionDisconnect/entry.ts`
- `base44/entities/Integration.jsonc`
- `src/lib/stripeConnectedAccountLifecycle.test.js`

### Alerting

- `base44/shared/incidentAlerting.ts`
- `base44/entities/IncidentAlertDelivery.jsonc`
- `base44/functions/maintenanceEngine/entry.ts`
- `base44/shared/adminSettingsV2.ts`
- `base44/functions/getMaintenanceCenter/entry.ts`
- `src/lib/incidentAlerting.test.js`

### Emergency y DR

- `base44/shared/disasterRecoveryCore.ts`
- `src/lib/disasterRecovery.test.js`
- `base44/shared/operationalControl.ts`
- `base44/entities/EmergencyControl.jsonc`
- `base44/functions/emergencyControlAdmin/entry.ts`
- `base44/functions/dispatchWebhook/entry.ts`
- `base44/functions/startPaymentsMigration/entry.ts`
- `base44/functions/updatePaymentsMigrationTask/entry.ts`
- `base44/shared/commercialModelRouter.ts`
- `base44/functions/providerNegotiationAgent/entry.ts`
- `base44/functions/collectiveNegotiationAgent/entry.ts`
- `base44/functions/providerMonetizationAgent/entry.ts`
- `src/lib/emergencyEpochBoundary.test.js`
- `src/lib/emergencyMaterialBoundaries.test.js`
- `src/lib/commercialModelRouter.test.js`

### Contratos de regresión actualizados

- `src/lib/eclP1Gate.test.js`
- `src/lib/eclP4ProductionProof.test.js`
- `src/lib/p15ProviderEconomics.test.js`
- `src/lib/researchKnowledgeConsumers.test.js`

### Evidencia del chunk

- `scripts/generate-intelligence-canonical-v2.mjs`
- `config/intelligence/orchestration-p0-remediation.v2.json`
- `base44/shared/documentationRegistry.ts`
- `scripts/generate-documentation-manifest.mjs`
- `config/documentation-drift-manifest.json`
- `config/release-touch-list.json`
- `config/p1-durability-manifest.json`
- `config/pre-ecl-freeze.json`
- `config/freeze-change-log.json`
- `package.json`
- `package-lock.json`
- `src/docs/Decision_Log_REMEDIATION_R2.md`

No se añadió función física, ruta lógica ni entidad.

## 5. Frozen

`stripeBillingWebhook/entry.ts` se incorporó y actualizó exclusivamente mediante `scripts/update-freeze.mjs`. El receipt final sancionado usa la razón explícita de seguridad R2 y fija el hash `7d901ff82c2d09cbed38988b6307f4d6bb18ab8ca46416e2d542aa39cc214601`. El primer receipt `freeze_add` conserva la razón breve `R2`; el receipt inmediatamente posterior documenta el alcance completo. No se modificó manualmente el manifest frozen ni la semántica económica de facturas.

No se tocaron los frozen `approveRecoverReportForInvoicing` y `processWebhookDeadLetters` en este chunk.

## 6. Tests y OTR

Las suites focales prueban firma/binding/idempotencia/reconciliación Stripe, agregación/cooldown/concurrencia/ambigüedad de alerting, gzip portable y matriz de lectura/epoch/contención de Emergency. También prueban que un transporte Anthropic iniciado nunca cae en retry/fallback ciego, que los inventarios de migración fallan cerrados ante lectura o truncación y que el replay de una contención incompleta conserva el error no-2xx.

Estados honestos:

- `ROOT-OTR-001`: `PARTIAL`, `PASSED_LOCAL` para las fronteras citadas, cierre `NOT_MET`;
- `ROOT-OTR-002`: `PARTIAL`, `PASSED_LOCAL` para las carreras citadas, cierre `NOT_MET`;
- `ROOT-OTR-003`: `PARTIAL`, `PASSED_LOCAL` para persistencia/normalización local, cierre `NOT_MET`;
- `ROOT-OTR-007`: mejorado por alerting agregado, pero `PARTIAL/NOT_MET` hasta reconciliación completa por provider;
- los restantes OTR conservan sus ejes anteriores y ninguno se marca `CLOSED`.

Globalmente: 20/20 OTR `NOT_MET`, 8/8 root seals `NOT_SEALED`, `productionSealEligible=false`, veredicto `NOT_GO_READY`.

## 7. RUNTIME_PENDING

- deploy Base44 del final SHA y recuento remoto 276/27;
- configuración/scope real del endpoint Stripe Connected accounts;
- receipts live e idempotencia de `account.application.deauthorized` y `account.updated`;
- concurrencia real del ciclo de alertas y reconciliación de aceptación/delivery;
- emergency stop drill autenticado;
- receipts remotos de Instantly;
- limitación explícita Outlook/Resend sin pausa provider-wide verificable;
- carrera pre/post provider sobre cada frontera material todavía no adaptada;
- pruebas live de migración y dispatch webhook;
- claim durable pre-efecto para `dispatchWebhook`; en R2 queda explícitamente `PARTIAL` porque un fallo de persistencia después de la respuesta del receptor no permite demostrar at-most-once;
- ventanas SLO, restore, secretos, retención, `PURGE-2` y demás blockers heredados.

No se desplegó, publicó, envió email, activó campaña, rotó secreto, purgó ni mutó producción.

## 8. Gate final e identidad

Comandos finales ejecutados con Node `24.19.0`, npm `11.17.0` y Deno del toolchain fijado:

- `npm run verify:chunk`: todos los gates previos a release pasaron; `dependency:audit` observó 745 dependencias y 0 vulnerabilidades conocidas.
- `npx vitest run`: 237 test files, 2.875 tests PASS, 0 FAIL y 0 skips.
- suite canónica OTR: 21 test files y 230 tests PASS.
- suite focal R2 ampliada: 16 test files y 163 tests PASS.
- `npm run build`: PASS.
- `npm run base44:functions:check`: PASS, 276 funciones físicas, 27 rutas lógicas y 2.724 ficheros staged; hash `f3c143f8e75a4d71274404b8603d6f7c243e371af51c968ad7f707c4ed65e530`.
- `git diff --check`: PASS.

El snapshot de source inmediatamente anterior a escribir este recibo contenía 1.749 ficheros y hash `sha256-tree-v1` `48c64347288df21c3d6e913eeff20e5ff54441c03f8d7cdf995144731b3e33c1`. Se etiqueta como pre-recibo porque incrustar el hash de este mismo fichero dentro del árbol produciría una referencia circular. El hash final post-recibo se emite fuera del árbol en el handoff del chunk. La topología observada fue `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8`, el scheduler inventory `a13aff3b45e7acd3e996775402972a1623e2372950d3f76679da886390c5bc64` y el lockfile `31254f7a5fc622a8ba512ee7ae7a03f0ac24b282d23039529f76e6d9f2259605`.

Frente al baseline de R1, la suite aumenta de 235 a 237 test files y de 2.827 a 2.875 tests, sin aumentar skips. La identidad release autoconsistente se reserva para R7; R2 no regenera `RELEASE.json`, no empaqueta release y no emite ningún seal.
