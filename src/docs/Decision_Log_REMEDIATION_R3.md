# Decision Log — CAMBRA v0.98.0 Remediation R3

**Fecha:** 2026-08-14

**Chunk:** `R3 — Claims, leases e idempotencia`

**Versión de apertura:** `0.98.0-rc.2`

**Versión de cierre:** `0.98.0-rc.3`

**Estado:** `CHUNK_COMPLETE_REPOSITORY_VERIFIED_RUNTIME_PENDING`; no es un production seal ni evidencia live

## 1. Baseline al abrir

R3 se abrió después del `verify:chunk` verde de R2. El recibo R2 registró 237 test files, 2.875 tests PASS, 0 skips, 276 funciones físicas, 27 rutas lógicas y 2.724 ficheros staged. La identidad source post-recibo fue 1.749 ficheros con hash `a7c79aea9236f8a6785f35650da9cd0f56a520fd36aae9a8ff2d831722dcc9c0`; el bundle fue `f3c143f8e75a4d71274404b8603d6f7c243e371af51c968ad7f707c4ed65e530` y la topología `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8`.

El árbol actual siguió siendo la autoridad. No se hizo `reset`, `checkout`, borrado amplio ni otra operación destructiva. No se desplegó, envió, activó, purgó ni mutó producción.

## 2. Inventario y gaps comprobados

- `schedulerRun.ts`, `commercialSendSafety.ts` y `webhookDeadLetterClaim.ts` ya eran autoridades durables; R3 no creó un segundo control plane.
- Scheduler separó claim de effect-start, pero al inicio del chunk no conservaba historia arbitraria A→B→A, no enlazaba de forma bidireccional `operation_key` y `effect_key` y algunos contadores CAS contradictorios podían parecer éxito.
- El inventario contiene 69 schedules, 67 activos y 2 inactivos. Los 67 activos están slot-guarded, pero solo 57 demuestran heartbeat periódico y los 67 carecen de deadline/timeout duro probado.
- Outlook no persistía de forma concluyente un ID inmutable antes de `/send`; una respuesta 202 podía confundirse con un resultado más fuerte de lo demostrado.
- Resend, Instantly y Core email tenían garantías distintas y no debían colapsarse en una promesa universal de exactly-once.
- El webhook inicial no tenía un intent CAS antes del transporte; el DLQ necesitaba semántica estricta de lease desconocido, effect-start y replay manual.
- `sendTestWebhook` era una ruta material omitida del inventario y podía emitir un webhook real sin el contrato R3. Se conservó el endpoint físico pero se puso en cuarentena HTTP 410 con cero efecto provider.

## 3. Decisiones e implementación

### 3.1 Contrato común sin nueva autoridad

`materialEffectContract.ts` es una fachada pura, sin I/O, entidad ni lease. Proyecta los estados de las autoridades existentes a `CLAIMED`, `EFFECT_STARTED`, `EXECUTED`, `FAILED_PRE_EFFECT`, `FAILED_POST_EFFECT`, `REVIEW_REQUIRED`, `RELEASED` o `EXPIRED_PRE_EFFECT`.

`ACCEPTED` y `OBSERVED` nunca significan ejecución o entrega. Una etiqueta pre-effect contradictoria con `effects_started=true` se proyecta a `REVIEW_REQUIRED`. `COMMITTED` se reconoce como terminal ejecutado para el transporte y `ROLLED_BACK` como release pre-effect.

### 3.2 Scheduler y overlap de triggers

CONTROL y ATTEMPT usan token, owner, revision y contadores CAS coherentes. Solo se admite takeover de un ATTEMPT enlazado, expirado y con `effects_started=false`. Lease ausente/inválido, RUNNING expirado, linkage ausente o fallo al persistir el owner superseded bloquean/quarantinan y no crean un nuevo intento.

Scheduled, manual e internal comparten una identidad explícita de operación/efecto. La historia durable ATTEMPT evita que A vuelva a ejecutarse después de completar B. Operation y effect se enlazan uno-a-uno; cualquier contradicción requiere revisión. Un CONTROL ocupado solo devuelve duplicate probado cuando ambas identidades coinciden; una operación distinta recibe conflicto no-2xx.

El inventario generado declara honestamente los 10 workers sin heartbeat periódico probado y los 67 deadlines/timeouts UNKNOWN. Por ello OTR-005 permanece `PARTIAL`.

### 3.3 Email y providers

El claim existente de send-slot persiste `TRANSPORT_STARTED` antes del provider y exige un `CommunicationMessage` local más referencia provider tipada antes de `COMMITTED`.

- Resend usa una `Idempotency-Key` estable y requiere receipt ID; su garantía documentada queda limitada a la ventana/payload del provider.
- Outlook crea el draft con `Prefer: IdType="ImmutableId"`, persiste ese ID por CAS antes de `/send` y trata 202 como `ACCEPTED`, nunca `DELIVERED`.
- Instantly ejecuta una sola mutación; timeout, 429, 5xx o receipt ausente quedan en `REVIEW_REQUIRED` sin retry. La cola inicial conserva `provider_lead_id` como `INSTANTLY_LEAD_ID`.
- Core SendEmail usa keys estables y at-most-once conservador; una ambigüedad no se reintenta a ciegas.

Las alertas agregadas continúan detrás de SchedulerRun, Emergency, OutboundControl, cost governance y el mismo contrato de receipts. Outbound permanece pausado.

### 3.4 Webhooks y DLQ

`dispatchWebhook` exige una idempotency key, crea un intent `WebhookDeadLetter` determinista y gana un CAS antes del transporte. El DLQ valida lease `ACTIVE | EXPIRED | UNKNOWN`, persiste `EFFECT_STARTED`, conserva la misma identidad en replay manual y solo permite terminal `EXECUTED` post-effect con receipt resuelto.

Provider success seguido de fallo local de receipt se convierte en `REVIEW_REQUIRED`; el replay no reenvía. Un receiver arbitrario no ofrece idempotencia o reconciliación universal, por lo que CAMBRA conserva la ambigüedad en vez de simular exactly-once. La proyección secundaria de salud de `WebhookEndpoint` puede quedar stale después de un terminal seguro; permanece deuda operativa P2, sin riesgo de doble efecto.

`sendTestWebhook` devuelve 410 `QUARANTINED`, no importa egress ni escribe delivery. El inventario material ahora lo enlaza al boundary canónico.

## 4. Archivos de R3

### Contrato, scheduler e inventario

- `base44/shared/materialEffectContract.ts`
- `base44/shared/schedulerRun.ts`
- `base44/entities/SchedulerRun.jsonc`
- `scripts/generate-scheduler-inventory.mjs`
- `scripts/harden-scheduled-functions.mjs`
- `config/scheduler-inventory.json`
- diecisiete callers directos de `claimSchedulerRun` y `base44/shared/incidentAlerting.ts`, adaptados al fence explícito
- `src/lib/materialEffectContract.test.js`
- `src/lib/schedulerLeaseFencing.test.js`

### Email/provider

- `base44/shared/commercialSendSafety.ts`
- `base44/shared/outboundProvider.ts`
- `base44/shared/costGovernance.ts`
- `base44/functions/commercialSendMessage/entry.ts`
- callers de `sendCostGovernedEmail` con stable event key
- `base44/functions/submitContactMessage/entry.ts`
- `base44/functions/submitWaitlistSignup/entry.ts`
- `src/lib/commercialSendSafety.test.js`
- `src/lib/commercialEmailProviderSafety.test.js`

### Webhook/DLQ

- `base44/shared/webhookDeadLetterClaim.ts`
- `base44/functions/dispatchWebhook/entry.ts`
- `base44/functions/processWebhookDeadLetters/entry.ts`
- `base44/functions/sendTestWebhook/entry.ts`
- `base44/entities/WebhookDeadLetter.jsonc`
- `base44/entities/WebhookDelivery.jsonc`
- `src/lib/webhookDeadLetterClaim.test.js`
- `src/lib/webhookEgressSafety.test.js`

### Evidencia del chunk

- `scripts/generate-remediation-r0.mjs`
- `config/remediation/material-boundary-registry.v1.json`
- `scripts/generate-intelligence-canonical-v2.mjs`
- `scripts/check-intelligence-canonical-v2.mjs`
- `config/intelligence/orchestration-p0-remediation.v2.json`
- `src/lib/intelligenceCanonicalReconciliationV2.test.js`
- `base44/shared/documentationRegistry.ts`
- `scripts/generate-documentation-manifest.mjs`
- `config/release-touch-list.json`
- `config/pre-ecl-freeze.json`
- `config/freeze-change-log.json`
- `package.json`
- `package-lock.json`
- `src/docs/Decision_Log_REMEDIATION_R3.md`

No se añadió función física, ruta lógica, entidad ni claim plane.

## 5. Frozen

`processWebhookDeadLetters/entry.ts` se incorporó al freeze exclusivamente mediante `scripts/update-freeze.mjs --add`, con razón explícita R3 y confirm token `7cfdc87ab8f5077ae17635c2c2deaab553702cb8d0a6af4042245efc2ad168a4`. El cambio endurece replay/receipts y no altera semántica económica ECL. No se editó el manifest frozen a mano.

## 6. Tests y estado OTR

La suite canónica ampliada de R3 ejecutó 24 test files y 276 tests, todos PASS. Incluye inyección de fallos/concurrencia para CAS, fencing, takeover, tres triggers, historia A→B→A, binding operation/effect, crash windows de providers, receipt local perdido, dos claimants DLQ y replay manual.

Estado honesto por eje:

- `ROOT-OTR-004`: `REPO_REMEDIATED_RUNTIME_PENDING`, `PASSED_LOCAL`, binario `NOT_MET`;
- `ROOT-OTR-005`: `PARTIAL`, `PASSED_LOCAL`, binario `NOT_MET`;
- `ROOT-OTR-006`: `REPO_REMEDIATED_RUNTIME_PENDING`, `PASSED_LOCAL`, binario `NOT_MET`;
- `ROOT-OTR-007`: `REPO_REMEDIATED_RUNTIME_PENDING`, `PASSED_LOCAL`, binario `NOT_MET`;
- `ROOT-OTR-008`: `REPO_REMEDIATED_RUNTIME_PENDING`, `PASSED_LOCAL`, binario `NOT_MET`.

Globalmente quedan 16 OTR `PARTIAL`, 4 `REPO_REMEDIATED_RUNTIME_PENDING`, 20/20 cierre binario `NOT_MET`, 8/8 root seals `NOT_SEALED`, `productionSealEligible=false` y veredicto `NOT_GO_READY`.

## 7. RUNTIME_PENDING

- deploy Base44 del final SHA y recuento remoto 276/27;
- contention real de SchedulerRun y consulta de ATTEMPT/CONTROL receipts;
- kill/takeover con workers reales, incluidos los 10 sin heartbeat periódico probado;
- deadlines/timeouts finitos para 67 schedules;
- concurrencia real scheduled/manual/internal sobre una operación material;
- receipts y reconciliación real Resend/Outlook/Instantly/Core email;
- receipt ID de Resend para las dos notificaciones públicas, cuyo ledger hoy conserva la reserva estable y el HTTP observado pero no el ID de respuesta provider;
- límites de Resend fuera de su ventana de idempotencia;
- observación Outlook Sent Items y delivery real;
- custom webhook receiver receipts y reconciliación externa;
- replay manual/scheduled DLQ concurrente con datos live;
- reparación/reconciliación de la proyección secundaria WebhookEndpoint;
- todos los blockers live heredados de R0–R2.

No se desplegó, publicó, envió email, activó campaña, rotó secreto, purgó ni mutó producción.

## 8. Gate final e identidad

El gate se ejecutó con Node `24.19.0`, npm `11.17.0`, Deno fijado y `CAMBRA_INTELLIGENCE_SPEC_DIR=/Users/xavimartinezcontero/Documents`:

```bash
PATH=/private/tmp/cambra-node-v24.19.0/bin:/private/tmp/cambra-deno/bin:$PATH \
  npm_config_cache=/private/tmp/cambra-npm-cache \
  CAMBRA_INTELLIGENCE_SPEC_DIR=/Users/xavimartinezcontero/Documents \
  npm run verify:chunk
```

Resultado literal final: `PASS` con 239/239 test files, 2.917/2.917 tests, 0 fallos y 0 skips. Antes de R3 eran 237 test files, 2.875 tests y 0 skips; R3 no redujo cobertura ni aumentó skips. `lint`, typecheck crítico, typecheck completo, build, dependency audit (745 dependencias, 0 vulnerabilidades), `clean:check`, ECL, policy, markets, research, scheduler, retention, secrets, public errors, silent failures, canonical intelligence y remediation R0 quedaron verdes.

Identidad observada inmediatamente antes de incorporar este recibo al propio log:

- source tree: 1.753 ficheros, `sha256-tree-v1` `037bac52934e33eb000c4c31cf80796f131ffe59eae0284e00544a6e1ef13a98`;
- bundle físico: 276 funciones, 27 rutas lógicas, 2.794 ficheros staged, `40572e61cc967b12676229da21ff1ae85865385885f4c2bb03c8cfb58fdb78d0`;
- bundle manifest: `bae078869642e7ee2c18fcf82bbbf097453d76b27600850531cbe3a5c4ad5f5a`;
- deployment topology: `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8`;
- scheduler inventory: `8a2b7ca8442bfbcbcbd383f84323d5ecbebb78c254dfb208cb5d1caf37c39229`;
- lockfile: `077304c23a6d7e4ce867761df93bd014e5e498a0c74d87c6cc33ee5022343313`.

El hash source anterior es deliberadamente un recibo pre-log para evitar una autorreferencia imposible; los manifests de documentación y durabilidad se regeneraron después del log y se verificaron sin drift. `git diff --check` también pasó. No se ejecutaron los gates de release reservados a R7, no se emitió ningún seal y no hubo deploy ni mutación live.
