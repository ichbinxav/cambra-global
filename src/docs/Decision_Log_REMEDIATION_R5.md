# Decision Log — CAMBRA v0.98.0 Remediation R5

**Fecha:** 2026-08-14

**Chunk:** `R5 — Authority, trace y planos operativos canónicos`

**Versión de apertura:** `0.98.0-rc.4`

**Versión de cierre prevista:** `0.98.0-rc.5`

**Estado:** `LOCAL_GATE_PASSED_RUNTIME_PENDING`; no es un production seal ni evidencia live

## 1. Baseline al abrir

R5 se abrió únicamente después del `verify:chunk` verde de R4. El recibo R4 registró 244 test files, 3.068 tests PASS, 0 skips, 276 funciones físicas, 27 rutas lógicas y 2.825 ficheros staged. La identidad source puntual posterior al recibo R4 fue 1.764 ficheros con hash `1fbd4e70665c40a1b397d3e42920b30b38b7d57ca312c94f9f9ec27363866bed`; el bundle staged fue `a7b34083e7d40015f7cdcc52d98dee933fa14a7107ba22bd100cbe70488b31db`, su manifest `85790b3fd3b9ae281fbe3074a520acd9efd4a67be12c8f095a4989382dac7de8`, la topología `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8`, el scheduler inventory `8a2b7ca8442bfbcbcbd383f84323d5ecbebb78c254dfb208cb5d1caf37c39229` y el lockfile `6b046557ed638753d3f250432cbaa41896092f0d3c00139ec469c0e16908c8da`.

El árbol actual sigue siendo la autoridad. No se hizo `reset`, `checkout`, borrado amplio ni otra operación destructiva. No se desplegó, publicó, envió, activó, purgó, rotó secretos ni mutó producción.

## 2. Inventario y gaps comprobados

- La autoridad de efectos contiene exactamente diez clases canónicas: `SEND`, `NEGOTIATE`, `SCHEDULE_MATERIAL`, `EXECUTE`, `APPROVE`, `SIGN_MANDATE`, `SPEND`, `BILL_CHARGE`, `MIGRATE_GO_LIVE` y `PROMOTE_LEARNING`.
- El registro material conserva 42 fronteras. Cinco están conectadas a la fachada común y 37 permanecen observadas en source sin cobertura universal; por ello ROOT-OTR-012 continúa `PARTIAL`.
- El inventario AgentTask observa 60 creator files después de cuarentenarse `systemHealthAgent`; 46 son materiales. Tres tienen raíz/terminal AgentTask pero ninguno demuestra todavía el adaptador Event canónico completo, por lo que los 46 siguen incompletos y 111 rutas materiales quedan sin resolución local completa; ROOT-OTR-013 continúa `PARTIAL`.
- El catálogo workforce deriva 34 agentes, cinco orquestadores y 33 filas explícitas de autoridad; ninguna fila concede autoridad material. `systemHealthAgent` queda como superficie legacy en cuarentena.
- Existe un único supervisor general activo, `autonomousOperationsSupervisor`; `operatingHealthWorker` es proyección advisory y `productionReadinessWorker` es evaluador de release. `eclProductionHealth` se inventaría como sweep ECL autoritativo separado, no como un segundo supervisor general.
- Los tres ledgers de incidentes tienen propósito distinto: `AutonomyIncident` es la autoridad operativa canónica, `OperationalIncident` es compatibilidad ECL proyectada y `IncidentAlertDelivery` es únicamente delivery. No apareció un cuarto ledger ni ningún writer de `AgentRun`.
- La auditoría adversarial encontró y obligó a corregir capabilities/market-scope no vinculados, trace terminal incoherente, CAS de provenance incompleto, adaptación Event sobrestimada, lecturas ECL truncadas tratadas como saludables, incidentes activos omitidos y catálogo workforce sin versión.

## 3. Decisiones e implementación

### 3.1 R5.A — Autoridad versionada por clase de efecto

`base44/shared/effectAuthority.ts` es una fachada pura sobre las autoridades existentes; no persiste claims ni crea un segundo plano. Exige clase canónica, mercado, tenant/sujeto, policy, autoridad, Intelligence, coste y Emergency según el contrato de la frontera. `market_scope_requirement` solo admite `REQUIRED` o `NOT_APPLICABLE_PLATFORM`; capabilities desconocidas o no incluidas en el epoch claim bloquean. Las fronteras adaptadas revalidan inmediatamente antes del efecto material. El generador de R0 emite `effect-authority-registry.v1.json` con las diez clases y las 42 fronteras.

### 3.2 R5.B — Envelope de trace, step, effect y receipt

`agentTaskEnvelope.ts` amplía la autoridad `AgentTask` existente con `trace_id`, parent/run/step, tenant/sujeto, policy/authority/Intelligence, coste, efecto, receipt y terminalidad. No crea otra entidad ni claim plane. La liquidación usa CAS coherente, fence/readback exactos y protege el binding completo de provenance; combinaciones terminal/effect incoherentes quedan incompletas o en review. El inventario exige un adaptador Event real y no interpreta la ausencia de writes crudos como adaptación. La cobertura sigue deliberadamente parcial: no se promociona ningún creator como trace completo mientras falte esa emisión canónica.

### 3.3 R5.C–E — Supervisión fail-closed, incidentes y planos legacy

Las matrices críticas de supervisor, health y release tratan fallo, forma inválida, duplicado y truncación como `UNKNOWN`/bloqueo. `eclProductionHealth` usa cap-plus-one y no declara `healthy` ni resuelve incidentes desde una página incompleta. El cockpit expone cobertura y todos los activos dentro de un contrato acotado sin presentar un `slice` como universo completo. `canonicalIncident.ts` reconcilia las vistas existentes con dedupe estable; no introduce un tercer ledger. `systemHealthAgent` responde 410 y no es invocable como plano operativo; `AgentRun` queda service-only y sin writers. Los dos artefactos generados ligan workforce y planos a la versión de package actual.

## 4. Archivos de R5

Los paths materiales quedan enumerados y hash-bound por `config/remediation/authority-trace-operational-inventory.v1.json`. Incluyen:

- autoridad/trace: `base44/shared/effectAuthority.ts`, `base44/shared/agentTaskEnvelope.ts`, `base44/entities/AgentTask.jsonc`, `base44/entities/Event.jsonc` y cinco fronteras de efecto;
- operaciones/incidentes: `base44/shared/supervisorObservation.ts`, `base44/shared/canonicalIncident.ts`, `autonomousOperationsSupervisor`, `operatingHealthWorker`, `productionReadinessWorker`, `eclProductionHealth`, `getAdminOperationsCockpit` y la cuarentena `systemHealthAgent`;
- generadores: `generate-remediation-r0`, `generate-agenttask-creator-inventory`, `generate-agent-workforce-catalog`, `generate-operational-plane-inventory` y `generate-remediation-r5`, junto con sus checkers/tests;
- artefactos: `effect-authority-registry.v1.json`, `agenttask-creator-inventory.json`, `agent-workforce-catalog.v1.json`, `operational-plane-inventory.v1.json` y `authority-trace-operational-inventory.v1.json`.

## 5. Frozen

Los tres cambios frozen R5 se registraron exclusivamente mediante `scripts/update-freeze.mjs`; no se editó manualmente el manifest:

- `base44/entities/OperationalIncident.jsonc`: `null → fd7b63450eefa7b4a1b7ac796ee9c394596b706a3970e85b25e20031c743d782`, para restringir el ledger ECL de compatibilidad a writers service-role.
- `base44/functions/eclProductionHealth/entry.ts`: `null → 04319755697ef8cc260039dbcfdd1c81050526f64aba3127b4d39532fecc201a`, para que lecturas fallidas, malformadas, truncadas o con episodios activos duplicados bloqueen `healthy` y auto-resolución. No se añadió recovery worker, efecto económico ni acción de producción.
- `base44/functions/processWebhookDeadLetters/entry.ts`: `7cfdc87ab8f5077ae17635c2c2deaab553702cb8d0a6af4042245efc2ad168a4 → 52747e27fc56469c5d87a8d2ea939890a3d620e4f12f7315f291c4680801f3fe`, para ligar el AgentTask ya existente al envelope de trace R5, sin cambiar delivery, retries, receiver ni semántica post-efecto.

El verificador de freeze mantiene prohibidos los imports ECL en cualquier handler ordinario frozen. Únicamente admite congelar por hash un handler cuyo propio path sea ECL y figure exactamente en la allowlist code-owned del stage declarado; el caso positivo y el rechazo del handler ordinario tienen prueba focal.

## 6. Tests y estado OTR

La auditoría local cubre denegaciones de las diez clases, capabilities/market scope, race y tamper del envelope, fallos/ambigüedad de dependencias, truncación ECL, dedupe de incidentes, cuarentena legacy, catálogo versionado y drift de todos los artefactos.

| OTR | Implementación | Test local | Verificación | Cierre binario |
|---|---|---|---|---|
| ROOT-OTR-012 | `PARTIAL` | `PASSED_LOCAL` | `LOCAL_FAILURE_INJECTION` | `NOT_MET` |
| ROOT-OTR-013 | `PARTIAL` | `PASSED_LOCAL` | `LOCAL_FAILURE_INJECTION` | `NOT_MET` |
| ROOT-OTR-014 | `REPO_REMEDIATED_RUNTIME_PENDING` | `PASSED_LOCAL` | `LOCAL_FAILURE_INJECTION` | `NOT_MET` |
| ROOT-OTR-015 | `REPO_REMEDIATED_RUNTIME_PENDING` | `PASSED_LOCAL` | `LOCAL_FAILURE_INJECTION` | `NOT_MET` |
| ROOT-OTR-020 | `REPO_REMEDIATED_RUNTIME_PENDING` | `PASSED_LOCAL` | `LOCAL_FAILURE_INJECTION` | `NOT_MET` |

Resultados observados antes del gate global:

- suite R5 focal/adversarial: **7/7 files, 78/78 tests PASS**;
- catálogo canónico mapeado R5: **36/36 files, 505/505 tests PASS**, 0 skips observados;
- `agenttask:check`: 60 creators, 46 materiales, 0 trace completo y 111 rutas materiales no resueltas;
- `workforce:check`: 34 agentes, 5 orquestadores, 33 filas de autoridad y un supervisor general;
- `operational-planes:check`: cinco superficies, una general, una ECL especializada, tres entidades de incidentes y 0 writers AgentRun;
- `remediation:r0:check`, `remediation:r5:check`, `ecl:check`, lint y TypeScript critical: PASS;
- canonical v2: **11 PARTIAL + 9 REPO_REMEDIATED_RUNTIME_PENDING**, 20/20 `NOT_MET`, 8/8 `NOT_SEALED`.

El gate global posterior a documentación/durability pasó con Node `24.19.0`, npm `11.17.0` y el Deno fijado por el workspace: **247/247 test files, 3.110/3.110 tests PASS, 0 fallos y 0 skips observados**. `vite build`, lint, TypeScript critical/general, los checkers de toolchain, freeze/ECL, mercados, research, seguridad, dependencias, bundle, CI, canonical y remediación R0/R4/R5 pasaron. La auditoría de dependencias observó 745 dependencias y 0 vulnerabilidades conocidas.

## 7. RUNTIME_PENDING

- desplegar el bundle físico del SHA final y obtener identidad runtime;
- ejecutar denegaciones reales por clase de efecto y consultar cero efectos/receipts;
- completar los 37 boundaries no conectados y los 46 creator files materiales sin trace AgentTask/Event completo;
- ejecutar trace completeness sobre runs reales, con tenant/step/cost/effect/receipt y terminalidad;
- realizar fallos reales de cada dependencia del supervisor/health/readiness, ventanas y denominadores suficientes;
- comprobar paridad/dedupe/reconciliación live de `AutonomyIncident` y `OperationalIncident` y delivery real separado;
- validar compatibilidad desplegada AgentTask/AgentRun, callers legacy en cuarentena y drift del catálogo workforce;
- conservar todos los blockers live heredados de R0–R4, incluidos deploy/smoke, Stripe, transportes, schedulers, approvals, sagas, costes, backups, rotaciones, retención y PURGE-2;
- source reverification externa del research no realizada.

## 8. Gate final e identidad

`verify:chunk` pasó localmente de extremo a extremo. El recibo pre-log observó:

- identidad source puntual: 1.777 ficheros, `sha256-tree-v1` `4b714f54b38962c7ac5adbbb7da919cbe99ace415ac6f62904acfe0656894707`;
- bundle Base44: 276 funciones físicas, 27 rutas lógicas y 2.853 ficheros staged, tree `3b41b2664e3f60d3f053ab371221d2c1a3e0bbd467213aece2147571f6904d72`;
- manifest del bundle: `1f2275736f70a9595f959de3ddddc30347951523e4c006444dea91329c14551b`;
- topología: `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8`;
- scheduler inventory: `8a2b7ca8442bfbcbcbd383f84323d5ecbebb78c254dfb208cb5d1caf37c39229`;
- lockfile: `ad792bd4f805d33adc63555462e66d3b640fa1ddd688b8730c647b97b6e00c14`;
- documentación: registry `p18-docs-1.16.0`, 315 source paths y 42 documentos canónicos;
- durabilidad: 517 ficheros, 0 mismatches, stage `ECL_P8_PRODUCTION_ADMIN_AUTOMATION_AI_OPERATIONS`.

Esta identidad es deliberadamente pre-log para evitar un hash autorreferencial; el gate se repite después de regenerar documentación/durabilidad. `productionSealEligible=false`, 20/20 OTR `NOT_MET` y 8/8 root seals `NOT_SEALED` permanecen invariantes. No se desplegó ni se obtuvo evidencia runtime/live.
