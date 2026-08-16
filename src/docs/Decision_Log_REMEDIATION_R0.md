# Decision Log — CAMBRA v0.98.0 Remediation R0

**Fecha:** 2026-08-13

**Chunk:** `R0 — Reconciliación de verdad y plan real`

**Estado de este documento:** baseline de apertura reproducible; no es un release, un production seal ni evidencia live

**Versión observada al abrir:** `0.97.0`

**Branch / HEAD:** `main` / `a52b65949d30635a794d6823564b5c54a89688a7`

## 1. Alcance y límites de esta ejecución

Este log fija la verdad observada al abrir R0 antes de remediar el repositorio. La auditoría fue local y no ejecutó despliegues, publicaciones, envíos, campañas, rotaciones de secretos, mutaciones de datos live ni `PURGE-2`. Tampoco emitió root seals ni convirtió resultados de test en evidencia de runtime.

El worktree no estaba limpio al abrir. Se preservó completo, sin `reset`, `checkout`, borrado amplio ni reescritura de cambios previos:

- 288 ficheros modificados;
- 135 ficheros no trackeados;
- 0 ficheros staged;
- 423 entradas dirty en total;
- `git diff --shortstat`: 288 files changed, 30,217 insertions, 4,061 deletions, sin contar los no trackeados.

## 2. Toolchain e instalación reproducible

El baseline se ejecutó con el toolchain exacto exigido, aislado mediante `PATH`:

| Componente | Valor | Resultado |
|---|---:|---|
| Node | `24.19.0` | PASS |
| npm | `11.17.0` | PASS |
| `npm ci` | 695 paquetes instalados | PASS |

Comandos base:

```bash
node --version
npm --version
npm ci
```

`npm ci` informó tres install scripts pendientes de aprobación (`core-js`, `esbuild`, `fsevents`), pero finalizó con exit code `0`. No modificó el lockfile.

## 3. Identidad exacta de apertura

La identidad source se calculó con el selector canónico de `scripts/lib/sourceTreeHash.mjs`, no con un recuento informal del filesystem.

| Identidad | Recuento | SHA-256 completo | Estado |
|---|---:|---|---|
| Source tree, `sha256-tree-v1` | 1,727 ficheros | `8c42eb1b0ea9160a010e309176db40f61313dbb11763f440cf81497f2a13f2c9` | OPENING BASELINE |
| Deployment topology | 276 físicas / 27 lógicas | `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8` | PASS |
| Bundle físico staged | 2,704 ficheros | `8e108019f7e4930877968caf712829bf82b3d0b78ae34180c4590d72cb6368f3` | PASS |
| Bundle manifest | n/a | `2d72ff610e2f1f5f011ff54397c13aa1e041594e02b995f745168edbced7b3e3` | PASS |
| `package-lock.json` | n/a | `fe9c5cb96e1add8286adef2ab8626240a7b17aa7dd63bbf36a5ddc60f8c42236` | PASS |

Inventario Base44 observado:

- 300 directorios source bajo `base44/functions`;
- 276 funciones físicas deployables;
- 27 rutas lógicas: 24 respaldadas por directorio y 3 por módulo compartido;
- 252 entidades;
- el rebuild del bundle en una copia temporal canónica produjo exactamente 276 físicas, 27 lógicas, 2,704 ficheros y el mismo staged-tree SHA-256;
- no se añadió ninguna función física.

Delta frente a las cifras orientativas del prompt:

- 1,727 ficheros: coincide;
- 276 físicas, 27 lógicas y 2,704 staged: coincide;
- el hash truncado orientativo del prompt no es autoridad y no coincide con el árbol recibido; manda el SHA completo recalculado anterior;
- el bundle actual tampoco coincide con el hash truncado orientativo; el rebuild aislado demuestra la identidad actual indicada arriba.

## 4. Tests y gates de apertura

Vitest se ejecutó sin escribir `.release-evidence`, usando un reporter JSON fuera del repositorio:

- 228 test files;
- 2,767 tests PASS;
- 0 FAIL;
- 0 skips, pending, todo o disabled;
- delta frente al baseline orientativo: `+1` test, sin cambio en test files ni skips.

El gate obligatorio produjo **24 PASS y 3 FAIL** en el estado de apertura.

### 4.1 PASS — 24

1. `npm run toolchain:check`
2. `npm run policy:check`
3. `npm run markets:check`
4. `npm run locales:check`
5. `npm run growth:check`
6. `npm run landing:check`
7. `npm run ecl:check`
8. `npm run dr:catalog:check` — 252 entidades
9. `npm run research:check`
10. `npm run documentation:check`
11. `npm run scheduler:hardening:check`
12. `npm run retention:check`
13. `npm run secrets:check`
14. `npm run public-errors:check`
15. `npm run silent-failures:check`
16. `npm run dependency:audit` — 744 dependencias, 0 vulnerabilidades conocidas, evidencia sellada y ligada al source hash de apertura
17. `npm run base44:functions:check` — equivalencia ejecutada en una copia temporal canónica para no regenerar el bundle del worktree
18. `npm run ci:check`
19. `npm run intelligence:canonical:check`
20. `npm run lint`
21. `npx tsc -p tsconfig.critical.json`
22. `npm run typecheck`
23. `npx vitest run` — con reporter adicional fuera del repo
24. `npm run build`

### 4.2 FAIL — 3

1. `npm run clean:check` — FAIL transitivo porque `durability:check` falla.
2. `npm run durability:check` — FAIL con 131 diagnósticos SHA/byte-count sobre 66 ficheros.
3. `npm run scheduler:check` — FAIL de apertura: `config/scheduler-inventory.json` estaba stale.

`verify:chunk` no existía al abrir R0. El script `verify` previo no es equivalente porque incluye regeneración de release, reservada para R7. Por tanto el chunk no estaba verde y este documento no presenta R0 como cerrado ni como release candidate.

## 5. Durability manifest stale

`config/p1-durability-manifest.json` estaba desactualizado respecto al árbol de apertura. El checker devolvió 131 mismatches sobre 66 paths: 2 entidades, 44 handlers, 10 módulos shared y 10 paths de config/package/scripts/docs/tests.

Paths afectados:

- Entidades: `base44/entities/Mandate.jsonc`, `base44/entities/MonthlySavingsReport.jsonc`.
- Handlers: `acceptRecoverMandate`, `alwaysOnLeadDiscoveryWorker`, `approveRecoverReportForInvoicing`, `autonomousCompanyOrchestrator`, `autonomousOperationsSupervisor`, `autonomousPartnerWorker`, `billApiUsage`, `blogAgent`, `chatChiefOrchestrator`, `commercialFollowUpWorker`, `commercialSendMessage`, `computeStripeVerifiedGap`, `copilotChat`, `costGovernanceWorker`, `createEligibleRecoverInvoices`, `createPaymentLink`, `developerMigrationEngine`, `discoveryTechStackAgent`, `dispatchWebhook`, `eclLifecycleScheduler`, `founderOSCommand`, `goLiveControlAdmin`, `intelligenceAccess`, `joinCollective`, `leadDiscoveryAgent`, `leadScoringAgent`, `meetingAgent`, `operatingHealthWorker`, `outboundControlAdmin`, `outboundDeliverabilityManager`, `outboundVolumeWorker`, `outlookMeetingCoordinator`, `postMeetingWorker`, `processUploadedFile`, `processWebhookDeadLetters`, `productionReadinessWorker`, `providerNegotiationAgent`, `providerResearchAgent`, `providerRevenueBillingWorker`, `recommendationEngineAgent`, `reconcileRecoverBilling`, `resolveCommercialApproval`, `spendIntelligenceAgent`, `submitCallRequest`.
- Shared: `base44/shared/commercialActivationRuntime.ts`, `base44/shared/costGovernance.ts`, `base44/shared/documentationRegistry.ts`, `base44/shared/eclRecoverEvidence.ts`, `base44/shared/economicExecution.ts`, `base44/shared/goLiveRuntime.ts`, `base44/shared/intelligenceCapabilities.ts`, `base44/shared/legalExecutionRuntime.ts`, `base44/shared/recoverAcceptance.ts`, `base44/shared/schedulerRun.ts`.
- Otros: `config/freeze-change-log.json`, `config/pre-ecl-freeze.json`, `package.json`, `scripts/check-release-manifest.mjs`, `scripts/generate-release-manifest.mjs`, `scripts/lib/evidence.mjs`, `scripts/package-release.mjs`, `src/docs/PRODUCTION_FUNCTIONS.md`, `src/lib/eclP5Closure.test.js`, `src/lib/eclP6Closure.test.js`.

No se regeneró el manifest de durabilidad durante esta captura de baseline.

## 6. Scheduler: apertura frente a regeneración posterior

Estado de apertura:

- 69 schedules declarados;
- 67 activos;
- 67 con slot guard;
- 0 activos unguarded;
- inactivos: `autonomousCommercialWorker` y `seedP3RateIntelligence`;
- scheduler inventory SHA-256: `c6c98a0730d3ea6a96a4cbf057b15c1dbb1e53316647f23941d5e9a9b0c51ec5`;
- `scheduler:check`: FAIL stale.

El único delta byte-a-byte que esperaba el generador era:

```text
billApiUsage.side_effects:
MUTATING_OR_EXTERNAL; VERIFY SOURCE
->
READ_ONLY_OR_UNKNOWN
```

Una regeneración posterior, ocurrida después de fijar el opening baseline, cambió:

- scheduler inventory SHA-256 a `6c5a1be84a101bdaad04e6cd92076efcb7e909bec096662f930fc398aaa08f48`;
- source-tree SHA-256 a `6cdfcc67215c71422fa54e930d1a33c6e6cf8a8dab207c7bf2b4df66bac06bd2`;
- `scheduler:check` a PASS byte-a-byte;
- los counts permanecieron 69 / 67 / 67 / 0.

Ese PASS posterior no cierra la verdad material del scheduler: `billApiUsage` delega `Invoice.create` e `Invoice.update` a `base44/shared/apiUsageBilling.ts`. El generador inspecciona el handler local y no sigue esa mutación delegada, por lo que `READ_ONLY_OR_UNKNOWN` sería una clasificación materialmente incompleta. Debe corregirse el generador o declararse el efecto delegado antes de considerar reconciliado este inventario. El FAIL de apertura no se reescribe retrospectivamente como PASS.

## 7. `release:check` — 14 fallos literales de apertura

El comando read-only `npm run release:check` reprodujo exactamente 14 fallos:

1. `releaseName mismatch: "CAMBRA v0.97.0 — Final Production Seal"`
2. `backend bundle manifest changed since release generation`
3. `backend staged tree identity mismatch`
4. `durability manifest changed since manifest generation (durabilityManifestSha mismatch)`
5. `documentation drift manifest changed since release manifest generation`
6. `sourceTreeHash mismatch: manifest 9274d245dba56ccc... vs current 8c42eb1b0ea9160a... (source changed since manifest generation)`
7. `manifest frozen-file record drift: base44/functions/processUploadedFile/entry.ts`
8. `tests evidence unsealed — regenerate the canonical evidence and RELEASE.json`
9. `build evidence unsealed — regenerate the canonical evidence and RELEASE.json`
10. `lint evidence unsealed — regenerate the canonical evidence and RELEASE.json`
11. `typecheck-critical evidence unsealed — regenerate the canonical evidence and RELEASE.json`
12. `typecheck-baseline evidence unsealed — regenerate the canonical evidence and RELEASE.json`
13. `dependency-audit evidence manifest_mismatch — regenerate the canonical evidence and RELEASE.json`
14. `RELEASE.json canonical_mismatch — run npm run release:manifest; hand-edited readiness/evidence fields are forbidden`

Drift material embebido en `RELEASE.json`:

- declara 1,571 source files y hash `9274d245dba56ccc7d8152aeab6e43f94ed3cc55feadda14a1f44553541a711f`, frente a 1,727 y el opening hash real;
- declara bundle de 2,279 ficheros con staged hash `db58b65895a153884c9451a81e92eb69c445cf47d94b7d8d4839a8a59989a905`, frente a 2,704 y el hash real;
- el topology SHA y lockfile SHA sí coinciden con el árbol observado;
- `config/documentation-drift-manifest.json` pasa su checker propio; lo stale es la referencia antigua dentro de `RELEASE.json`;
- `base44/.deploy/manifest.json` es reproducible y actual; lo stale es la identidad de bundle embebida en `RELEASE.json`.

No se ejecutaron `release:manifest`, `release:package` ni regeneración final de evidencia; permanecen reservados para R7.

## 8. Rutas en cuarentena

El código actual contiene 16 rutas instrumentadas con `quarantineProbe`:

`approveAgentRun`, `authzScope`, `dispatchWebhook`, `guardDealActivationStatus`, `inviteAdminUser`, `oauthRevoke`, `onInvoiceStatusEvent`, `promoteMeToAdmin`, `regenerateMigrationTasks`, `seedBenchmarkCohorts`, `seedStripeTestData`, `startSubscription`, `stripeHealthCheck`, `stripeTestGroundTruth`, `updateDealActivationStatus`, `updateMigrationTaskStatus`.

Además, `apiAuth` es una ruta física autocuarentenada que devuelve `410 Gone` incondicional y no utiliza probe.

Existe drift semántico en los documentos históricos: algunos inventarios incluyen `benchmarkLearningEngine`, que ya no tiene probe, y omiten `regenerateMigrationTasks`; `apiAuth` también se contabiliza por separado. La autoridad para este baseline es el código observado: 16 con probe más `apiAuth` self-410. No se ejecutó `PURGE-2`.

## 9. Research disponible

`npm run research:check` devolvió:

- 11 originales preservados;
- 9 documentos únicos por SHA-256;
- 2 duplicados exactos;
- 260 chunks;
- 31 candidatos normalizados;
- 9 conflictos;
- 0 datos promovidos a ejecutables;
- 0 datos usados como training.

El prompt R0/R6 exige un corpus físico de 25–26 investigaciones. Solo hay 11 originales en el árbol recibido. Estado obligatorio:

```text
INPUT_CORPUS_MISSING
```

No se inventan los documentos ausentes ni su contenido. R6 no puede declararse completo hasta recibir y vincular por SHA-256 el corpus restante. Los informes presentes permanecen conocimiento externo no confiable, candidate-only y sujeto a fuente, fecha, contradicción y verificación.

## 10. Estado honesto al cerrar esta captura R0

Esta captura de R0 reconcilia el baseline, pero **no constituye un release ni autoriza abrir R1 mientras los gates del chunk no estén verdes**.

- 20/20 OTR: cierre binario `NOT_MET`;
- 8/8 root seals: `NOT_SEALED`;
- `productionSealEligible`: `false`;
- veredicto: `NOT_GO_READY`;
- versión no promovida: continúa `0.97.0`;
- `0.98.0-rc.0`: no emitida en esta captura;
- evidencia live: no ejecutada ni fingida;
- deploy/publicación/envíos/campañas: no ejecutados;
- runtime drills y receipts finales: pendientes;
- `INPUT_CORPUS_MISSING`: abierto;
- durability y verdad semántica del scheduler: pendientes de remediación dentro de R0.

El resultado correcto de la captura inicial fue `R0_BASELINE_CAPTURED_REMEDIATION_PENDING`, no `PASS`, `PILOT_READY`, `PRODUCTION_SEALED` ni `GO_READY`. La sección siguiente se completa únicamente después de regenerar y verificar los artefactos R0; no reescribe retrospectivamente el baseline anterior.

## 11. Cierre de implementación R0

Estado al terminar el chunk: `R0_REPOSITORY_ARTIFACTS_VERIFIED`; esto no implica cierre live ni readiness de producción.

Cambios de R0:

- versión de paquete/lockfile promovida de `0.97.0` a `0.98.0-rc.0` sin tag, publicación ni deploy;
- añadido `verify:chunk`, que excluye expresamente `release:manifest`, `release:check`, `release:package` y la evidencia final reservada para R7;
- corregido el generador del inventario scheduler para seguir imports locales y no clasificar `billApiUsage` como read-only cuando delega escrituras de `Invoice`;
- reconciliado el ledger OTR generado con ejes independientes de implementación, cierre binario, test local y verificación;
- creado un registro generado de fronteras materiales sin introducir un segundo claim plane;
- creado el inventario físico del corpus research, con `11` originales, `9` contenidos únicos, `2` duplicados exactos y `INPUT_CORPUS_MISSING`;
- actualizado el registro/manifiesto documental y la durabilidad para reflejar el árbol R0.

Archivos source/config modificados o creados por R0:

- `package.json`, `package-lock.json`;
- `scripts/generate-scheduler-inventory.mjs`, `config/scheduler-inventory.json`;
- `scripts/generate-intelligence-canonical-v2.mjs`, `scripts/check-intelligence-canonical-v2.mjs`, `src/lib/intelligenceCanonicalReconciliationV2.test.js`;
- `config/intelligence/orchestration-p0-remediation.v2.json` y los siete artefactos v2 coherentemente regenerados por el mismo generador: `composition-manifest.v2.json`, `requirement-ledger.v2.json`, `acceptance-test-catalog.v2.json`, `canonical-alias-map.v2.json`, `scope-precedence.v2.json`, `compatibility-ledger.v2.json`, `root-seals.v2.json`;
- `scripts/generate-remediation-r0.mjs`, `scripts/check-remediation-r0.mjs`, `config/remediation/material-boundary-registry.v1.json`, `config/remediation/research-corpus-inventory.v1.json`, `src/lib/remediationR0Artifacts.test.js`;
- `base44/shared/documentationRegistry.ts`, `scripts/generate-documentation-manifest.mjs`, `config/documentation-drift-manifest.json`;
- `config/release-touch-list.json`, `config/p1-durability-manifest.json`;
- `src/docs/Decision_Log_REMEDIATION_R0.md`.

El bundle generado bajo `base44/.deploy` se reconstruyó mediante `npm run base44:functions:check`; no se editó manualmente. No se añadió ninguna función física ni ruta lógica.

No hubo cambios frozen. `scripts/update-freeze.mjs` no se ejecutó.

Evidencia local OTR dirigida:

```text
Test Files 20 passed (20)
Tests 210 passed (210)
```

Esta prueba demuestra únicamente los subcriterios locales referenciados por cada fila, con `local_test_scope=PARTIAL_CRITERION_ONLY`. No convierte ninguna OTR en `CLOSED` ni en `RUNTIME_VERIFIED`.

Tests añadidos por R0: `src/lib/remediationR0Artifacts.test.js` (`7/7`), que cubre derivación de las 39 fronteras, 38 callers AI, corpus 11/9/2, hard gate R6 y tamper/drift. El contrato de `src/lib/intelligenceCanonicalReconciliationV2.test.js` fue actualizado (`8/8`) para los cuatro ejes OTR y para separar binding de specs adjuntos de reverificación externa de research. Total antes/después: `228 → 229` test files; `2,767 → 2,774` tests; skips `0 → 0`.

El comando canónico final del chunk es:

```bash
npm run verify:chunk
```

Primera ejecución completa posterior a los cambios: todos los gates del repositorio llegaron a PASS, incluidos `229` test files y `2,774` tests, sin skips. El proceso exterior terminó con código `1` únicamente porque el wrapper de captura intentó asignar la variable reservada de zsh `status` después de que el build finalizase; no fue un fallo de `verify:chunk`. Se repitió el mismo comando con un wrapper corregido para obtener el recibo canónico de salida.

Resultado literal de la repetición canónica:

```text
verify:chunk PASS
Test Files 229 passed (229)
Tests 2774 passed (2774)
skips 0
build PASS
```

Identidad R0 observada antes de añadir este recibo al propio log:

| Artefacto | Recuento | SHA-256 |
|---|---:|---|
| Source tree canónico | 1,733 | `a0da5e197111fcfa3bdd69ff0e49ad8314b273a48b786b2bf04e8479ddeac756` |
| Deployment topology | 276 físicas / 27 lógicas | `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8` |
| Bundle staged | 2,704 | `0d8dd6ac09e5a7543500a7446290daee52ad22a4e53381c4a4e9c26b50d13a8f` |
| Bundle manifest | n/a | `b9f657a2f7743fbe59bbd81efe82293c1e763a3a859597064bcb303cc8a7118b` |
| Scheduler inventory | 69 / 67 / 67 | `a13aff3b45e7acd3e996775402972a1623e2372950d3f76679da886390c5bc64` |
| Lockfile | n/a | `1bcb595504d9642dc90945eab826643188cc29f7a8bba7f4efb37de936843561` |

El source hash anterior es un recibo point-in-time: el decision log forma parte del source tree, por lo que escribir el hash dentro del propio log cambia el hash. La identidad release autoconsistente se genera en R7 mediante el mecanismo canónico que excluye `RELEASE.json`; R0 no finge resolver esa autorreferencia ni emite un release manifest.

Estado que permanece bloqueado después del cierre local:

- 20/20 OTR con cierre binario `NOT_MET`;
- 8/8 root seals `NOT_SEALED`;
- `productionSealEligible=false`;
- `NOT_GO_READY`;
- drills autenticados, provider receipts, runtime parity, SLO windows y final-SHA deployment no ejecutados;
- R6 bloqueado por `INPUT_CORPUS_MISSING`;
- `release:check` y packaging siguen reservados para R7;
- R1 puede abrirse únicamente después del segundo `verify:chunk` verde; este cierre no reduce ninguno de los blockers runtime anteriores.
