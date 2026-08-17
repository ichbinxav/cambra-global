# El estado de CAMBRA — un solo documento

**Fecha:** 2026-08-17 · **Versión:** v0.98.0 · **Rama:** `agent/i18n-30-markets`
**Toolchain:** Node 24.19.0 / npm 11.17.0 · **Directorio de trabajo:** `cambra-global-p1-p5-copy`

Esto es el mapa. No sustituye a los 82 decision logs individuales; los indexa. Si algo aquí y un
log discrepan, gana el log.

---

## Lo primero: el sello de producción sigue en `false`, a propósito

`productionSealEligible: false`. Los ocho sellos raíz de CAMBRA Intelligence están `NOT_SEALED`.

Nada del trabajo de este período produjo evidencia de runtime. Cada test verifica comportamiento
contra fixtures, cada gate verifica estructura contra código fuente — y ninguna de las dos cosas
prueba que un sistema desplegado hiciera algo. Los sellos exigen exactamente eso: evidencia real
de producción sobre origen, runtime, privacidad, coste, linaje y verificación.

**Quedan 12 requisitos de producción pendientes**, y los 12 requieren evidencia externa que este
repositorio no puede fabricar:

- Ejecución de CI remoto en verde sobre el SHA final (este manifiesto se generó fuera de GitHub Actions).
- Prueba real de alerta HIGH/CRITICAL con delivery, retry, deduplicación y visibilidad de founder.
- Paridad de deploy: source tree, git SHA, hash y file count exactos runtime vs. release.
- Identidad inmutable de runtime + SLO probados por evidencia durability.
- Ocho sellos raíz de Intelligence emitidos con evidencia real.
- Reverificación externa del corpus de investigación founder.
- Paquete R9 / cobertura de country economics 33/33.
- Prueba real de deliverability (SPF, DKIM, DMARC, webhooks Resend/Instantly autenticados).
- Ciclo real de suppression (bounce, complaint, unsubscribe).
- Prueba de founder control (start, pause, resume, approve, reject) desde admin.
- Ensayo real de restore con RPO/RTO medidos.
- Evaluación de extracción de documentos sobre corpus FR/ES/EN anonimizado.

**Ninguna línea de código mueve el sello.** Solo lo mueve un despliegue que haga algo y lo demuestre.

Y `legal_review: PENDING` en `config/legal/dpa-status.json` está sin tocar deliberadamente —
decisión del founder, no revisada en este programa.

---

## Números totales del árbol

| | Valor |
| --- | --- |
| Commits totales en el árbol | 2.982 |
| Commits en los últimos dos días (todo este empujón) | 78 |
| Entidades Base44 | 264 |
| Funciones físicas Base44 | **276** (grandfathered, no se toca) |
| Rutas lógicas hospedadas sobre esas 276 | **38** |
| Módulos compartidos `base44/shared/*.ts` | 210 |
| Ficheros de test | 302 |
| Tests pasando (`npm run verify`) | **4472** |
| `release:check` | PASS (LOCAL VALIDATION — no CI) |
| Directas escrituras CRUD del navegador | **0 abiertas** (12 en C0 → 8 gobernadas + 3 retiradas + 1 anulada) |

---

## Programas cerrados en este período

Ocho programas grandes fuera del código de mantenimiento habitual:

### 1. i18n · 30 mercados

- **20 idiomas activos**, 1.349 claves por idioma, protocolo de 9 pasos.
- **27 de 30 mercados** cubiertos nativamente. Tres protegidos (FR, BE, NL) como research-only bajo el bloqueo de la Fase D.
- **Fase D BLOQUEADA por datos**, no por código: el motor de tarifas necesita las 28 monedas locales sembradas y ese es un input de negocio, no un cambio de software. El bloqueo está declarado con un test que salta si alguien intenta rellenarlo por otra vía.
- Detalle: `docs/EINVOICING_COMPLIANCE_WATCH.md`, `Decision_Log_i18n_*` (no aplica — está en commits, la fase C está cerrada).

### 2. FX paso 2 · dinero real en moneda del merchant

- Divisa en el wizard del Analyzer, en los informes y en la facturación.
- Presentación limpia (los `€` hardcodeados de `Reports.jsx` fuera).
- Rate table de gap map con tests R4 y un candado que impide meter monedas locales sin cumplir la Fase D.
- Ingesta diaria de tasas del BCE (`fxSnapshotWorker`), que desbloquea análisis verificado no-EUR.
- Freeze actualizado con autorización explícita para tocar `processUploadedFile`.
- Commits: `9fb888c8` (paso 2), `a3afa32b` (freeze + ingesta), `30c1fc58` (BCE).

### 3. DPA · legal listo para publicación

- Página pública `/Dpa` en en/es/fr con incorporación por referencia y aceptación con evidencia.
- Lista de subencargados publicada y actualizada con datos del DPA público de Base44.
- Anexo de jurisdicciones para 30 mercados.
- Sin resolver: `legal_review: PENDING` y región de alojamiento Base44. Decisión del founder.
- Commits: `342c731f`, `2f04555e`, `f63ca850`.

### 4. Discovery V2

- Corte real Apollo → Instantly.
- Enriquecimiento real (no simulado).
- Transiciones honestas del pipeline en vez de la "cadena de zeros" del `catch → []` original.
- Commit: `445ab4c8`.

### 5. Campaigns + Inbox & Conversations · C0 → C10

- **C1** — schemas canónicos backward-compatible.
- **C2** — workspace de Campaigns con proyección legacy.
- **C3** — audiencia versionada, gate de content claims, secuencia y preflight.
- **C4** — motor de ejecución con métricas honestas (dry-run only).
- **C5** — Inbox & Conversations con resolución de inbound fail-closed.
- **C6/C7** — SLA, cola de follow-up, escalada por contenido, sender health y suppressions.
- **C8/C9** — superficies de integración y decisión sobre legacy.
- **C10** — doc de arquitectura.
- Detalle: `Decision_Log_CAMPAIGNS_CONVERSATIONS_C0..C8_C9.md`.

### 6. CAMBRA Command · C1 → C7

Ejecutor durable con claves propias, cadena de recibos tamper-evident y router de proveedores AI.

- **C0** — inventario y gap map.
- **C1** — `FounderPermit`, ledger `CommandReceipt` y schemas.
- **C2** — página `/admin/chat` con conversaciones durables y ramas.
- **C3** — cierre del inventario del plano de conocimiento/evidencia; validación de citas.
- **C4** — tool registry, tool search y coordinador multi-paso (48 tools declaradas).
- **C5** — router de modelos GPT/Claude con adaptador OpenAI (segundo proveedor).
- **C6** — ejecutor durable `CommandRun` con claves propias; el ledger de recibos escribiendo.
- **C7** — cierre de las cuatro deudas.
- Detalle: `Decision_Log_COMMAND_C0..C7.md`.

### 7. DASHBOARD CORE · C0 → C16

De 43 entradas en el sidebar a **13** (la arquitectura declarada, no 12 — el founder pidió que Founder Control conserve entrada propia porque lleva el emergency stop).

- **C0** — baseline y gap map, sin editar código.
- **C1** — registro de navegación como fuente única, framework compartido y tres gates.
- **C2/C3** — modelo canónico del Pipeline, `PipelineStageEvent` (**la única entidad nueva del programa**), guarded transitions y `pipeline:check`.
- **C4/C5** — Audits & Opportunities backend + regla del `Number(null) === 0` centralizada.
- **C6/C7** — Recover root confirmado, el creador que nunca tuvo, y el handler gobernado de Contract.
- **C8** — Finance truth model y el join revenue-to-cost que C0 encontró ausente.
- **C9** — Finance workspace y el gate fiscal B2B que un formulario estaba limpiando.
- **C10** — el "medio" que faltaba de la cadena de intelligence de precios.
- **C11** — Intelligence shell, la cola de precios alcanzable, y la "shadow rate".
- **C12** — la escritura de entidad ya no es la decisión de confianza (OAuth apps + webhooks gobernados).
- **C13** — retirada de 10 rutas legacy, la workspace última construida, y el corte del sidebar bloqueado por diseño hasta las 10 decisiones del founder.
- **C14** — las 10 decisiones del founder aplicadas + la consolidación.
- **C15** — las tres últimas CRUD del navegador, y lo que cada una hacía en realidad (plan terms desde array del browser, "suspend" que no existía, notas con autor "admin" cuando no había usuario).
- **C16** — la cola única del founder, y las dos rutas restantes.
- Detalle: `Decision_Log_DASHBOARD_CORE_C0..C14.md`.

### 8. Auditoría total · workflow de 11 agentes + refutación adversarial

Un barrido de patrones sobre todo el árbol producido **130 candidatos** en 11 dominios. Cada
hallazgo pasó (o intentó pasar) por un verificador adversarial cuya tarea era **refutarlo**.

- **11 auditores read-only en paralelo** — P1 (catch swallow), P2 (verified literal), P3 (`|| 0`), P4 (R4 tests), A (money), B (function reads), C (security/tenant), D (legal), E (i18n), G (frozen/generated), I (deps/secrets).
- **35 findings verificados en dos rondas** (las otras 50 cayeron al límite de sesión).
- **6 refutados con razonamiento multi-eje** — seis "arreglos" a código correcto que este workflow ahorró. `MB-06` fue el más claro: el escenario descrito era **imposible por construcción**.
- **14 findings arreglados** — 3 CRITICAL + 11 HIGH/MEDIUM/LOW.
- **45 negativos verificados** — resultados que dicen "buscamos y no hay nada", que valen tanto como los positivos.
- **15 findings registrados sin arreglar** con razón declarada.
- **50 sin verificar** — no se tocan hasta pasar por refutación, por lo que enseñaron los 6 refutados.

Detalle: `AUDIT_TOTAL_REPORT_V1.md`, `Decision_Log_AUDIT_H_CONSISTENCY.md`, `Decision_Log_AUDIT_PHASE1_CLOSE.md`. Instrumento reutilizable: `scripts/audit-sweep.mjs`.

---

## Los tres CRITICAL que la auditoría encontró (y arregló)

Estos son los que valían la pena de este workflow por sí solos.

### SEC-01 · un POST sin autenticar podía gastar las claves de IA de CAMBRA

Commit **`78537f9a`**. Introducido por mí en COMMAND-C7.

`guardedScheduledServe` en `schedulerRun.ts:72` pasa cualquier petición no-SCHEDULED **directa al
handler sin autenticar** — el contrato es que cada ruta hospedada se autentique a sí misma. Tres
de las cuatro rutas de `maintenanceEngine` lo cumplen. La cuarta —
`command_run_sweep`, la que añadí en C7 — **no**: tomaba `asServiceRole` de inmediato y el
`requireAdminOrInternal` del fichero estaba más abajo y nunca se alcanzaba.

Ataque alcanzable: `POST {"host_action":"command_run_sweep"}` sin sesión avanza hasta cinco
`CommandRun` del founder por llamada, gasta `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` e invoca
cualquier herramienta con autoridad service-role. Repetible hasta drenar el cost cap, concurrente
con la automatización real (bypasseaba también el lease del scheduler).

Arreglado y **la clase gateada**: `scripts/check-hosted-route-gates.mjs` recorre cada host y falla
si una rama toma `asServiceRole` sin gate o con el gate después. El orden es invisible cuando el
handler es una línea de 200 columnas — que es exactamente por qué sobrevivió a la revisión. Y el
gate falló en su primera ejecución **sobre su propio arreglo**, porque mi comentario menciona
`asServiceRole` — sexta vez con ese patrón en el programa. Ahora mide sobre código.

### P2-01 · `dependencySecurityWorker` marcaba vulnerabilidades como resueltas y **verificadas** desde una ausencia

Commit **`9a5e0dbb`**.

Si GitHub devolvía 502, o el token perdía el scope `security_events`, `activeKeys` quedaba vacío
para ese repo y cada `p17:dependency:<repo>:*` con incidencia abierta se marcaba
`status: 'resolved'` con `recovery_json: {verified: true, note: "no longer returned by the
authoritative GitHub sweep"}`. Cuatro criticals sin parchear pasaban a "resueltas y verificadas".

Ahora solo resuelve incidencias de repos cuyo barrido **completó sin lanzar**, extrae el repo de
la clave, y una clave que no puede atribuir a un repo la **deja abierta**. Un lectura de
workspaces de longitud cero se trata como `UNAVAILABLE`, no como "no hay repos".

### P3-01 · una propuesta sin tarifa cotizada valorada en **cero puntos base**

Commit **`9a5e0dbb`**.

`collectiveNegotiationAgent` preserva la ausencia de tarifa como `null` bajo un prompt que dice
"no inventes términos ausentes". `pricingCostMinor` hacía `null || 0` → 0 bps. Un proveedor que
cotizaba solo un `monthly_fee` de 500€/mes salía a ~6 bps efectivos sobre un pool de 10M€, score
94/100, pasaba la puerta de idoneidad, avanzaba el `NegotiationCase` a `awaiting_provider` con
`merchant_terms_established: true`, y llegaba al founder como aprobación diciendo "Merchant
Outcome Score: 94". El coste real era **UNKNOWN**.

Arreglo: un coste computado desde un componente que nadie declaró **no es un coste**. Devuelve
`null` cuando falta cualquier componente aplicable (`variable_rate_bps` solo se puede saltar si
hay volumen 0), y una cotización explícita de **0 bps sigue siendo un cero real** — es un hecho
distinto del silencio.

---

## El resto del arreglo de auditoría (commit `c15ba9c3`)

- **`growthPathRuntime`** — la forma exacta del bug original de `founderOSData` reintroducida.
- **`commandRunExecutor`** — la punta de la cadena tamper-evident con `.catch(() => [])`.
- **`founderMerchantsV2.overview`** — afirmaba `AVAILABLE` sobre `Approval` y `AutonomyIncident` que no leía; el copilot le decía al founder "cero decisiones pendientes" con tres aprobaciones abiertas.
- **`founderMerchantsV2` (4 sitios de caja)** — reducciones sobre `amount_paid` incluyendo `void`.
- **`providerRevenueReconciliationWorker`** — dos defectos: sin `agreement_id`, sin `currency`, y `accrued || expected` caía al forecast cuando el accrued era legítimamente cero.
- **`apiUsageBilling`** — facturas `issued` sin decisión fiscal.
- **`financeCore`** — el flag `rows_source_complete` se consultaba en una sola rama.
- **`disasterRecoveryRuntime`** — dos self-attestations selladas en el manifiesto.
- **`buildInfrastructureGraph`** — 0 sobreescribiendo un coste observado con `cost_confidence: 'verified'` intacto.
- **`shadowRoutingEngine`** — precios sin tarifa valorados en 0 y ganando la ruta por coste.
- **`recordProviderRevenuePayment`** — factura de importe cero cerrada como `paid`.
- **`getBrandSavings`** — `measurement_quality: 'estimated'` sobre un conjunto vacío por lectura fallida.
- **`shadowRoutingCore` + `bestEffort`** — dos módulos sin cobertura de comportamiento; 27 tests R4 nuevos que **conducen** cada función.

---

## Lo que sigue abierto

**50 findings sin verificar** — el workflow se cayó al límite de sesión con 46/96 agentes en la segunda ronda. No los toco hasta que pasen por refutación (el paso adversarial salvó seis "arreglos" hoy).

**15 findings verificados y no arreglados** con razón declarada:

- `P3-04` — reduce a MEDIUM tras verificación; requiere retooling del módulo de proyección de métricas del founder.
- `P2-08` — LOW; el consumidor no llega a decisiones críticas.
- `P3-08` — `DECISION`: 12 módulos con copia privada de la coerción, gate solo cubre 4. Widening es scope decision.
- Cinco tests R4 restantes: reescritura requiere entender la intención original y todos son latentes.
- R4-12 refutado en el enunciado original.

**Deudas de C0-C16 heredadas al operador, no defectos:**

- Los seis módulos "construidos, testeados y sin caller" (`Decision_Log_AUDIT_H_CONSISTENCY.md`) — o se cablean o se borran, es decisión de alcance.
- `/admin/audits` construida, pero necesita evidencia runtime para llegar al sello.
- Merger de la cola founder en una única lista ordenada dentro de C16 lo hace posible; la elección del **orden** ya está declarada, no aprendida.
- La región de alojamiento de Base44 sin confirmar.

---

## Índice de decision logs

**Audit:**
- `AUDIT_TOTAL_REPORT_V1.md` · `Decision_Log_AUDIT_H_CONSISTENCY.md` · `Decision_Log_AUDIT_PHASE1_CLOSE.md`

**Dashboard Core (17):** `Decision_Log_DASHBOARD_CORE_C0..C14.md` (C15 y C16 sin log dedicado, cubiertos en los commit messages `f273cc01` y `326be5fa`)

**CAMBRA Command (8):** `Decision_Log_COMMAND_C0..C7.md`

**Campaigns + Conversations (10):** `Decision_Log_CAMPAIGNS_CONVERSATIONS_C0..C8_C9.md`

**Auditorías y arreglos anteriores:** `Decision_Log_BILLING_FIX1.md` · `Decision_Log_CONTRACT_FIX.md` · `Decision_Log_COHERENCE1.md` · `Decision_Log_CONSOLIDATE1.md` · etc.

**Copy / UI:** `Decision_Log_COPY1..3.md`, `Decision_Log_COPY2A.md`, `Decision_Log_COPY2B.md`

**Backlog:** `Decision_Log_BACKLOG1.md` · `Decision_Log_InvoiceFallback.md` · `Decision_Log_Chunk2.md`

Total: **82 decision logs** en `src/docs/`.

---

## Cinco reglas de casa que este período aplicó sin excepción

1. **Cero git destructivo.** Ni un `reset --hard`, ni un `push --force`, ni un `branch -D` sin permiso.
2. **Nunca editar generados a mano.** Regenerados con su script cada vez, incluso cuando la única forma de que el commit pasara la barrera era regenerar cinco manifests en orden estricto.
3. **`config/pre-ecl-freeze.json` respetado.** Un solo update (`processUploadedFile`) con autorización explícita del founder.
4. **R4.** Cada test añadido conduce comportamiento; los que grep sobre fuente están declarados como findings.
5. **No inventar estados que no se puedan demostrar.** El sello sigue `false` y `legal_review` sigue `PENDING` no porque no puedan cambiarse, sino porque no hay evidencia que lo justifique.

---

## Verificación final (a la hora de escribir esto)

`npm run verify` completo, no `verify:chunk`.

```
Tests   4472 passed (4472)
Test Files   315 passed (315)
release:check PASS (LOCAL VALIDATION — not release CI)
  CAMBRA v0.98.0 — 30/33 Verified Repository Package (No Production Seal)
productionSealEligible: false
pendingProductionRequirements: 12
futureActivationRequirements: 12
Directorio limpio.
```

Ningún fichero frozen tocado sin autorización. Ningún fichero generado editado a mano. El branch
`agent/i18n-30-markets` está listo para el PR cuando decidas — el trabajo de publicación (Fase 2
del prompt de auditoría) NO se ha hecho, y no se hará sin tu confirmación explícita.
