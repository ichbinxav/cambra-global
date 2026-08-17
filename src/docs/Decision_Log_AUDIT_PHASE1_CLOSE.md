# AUDIT — Fase 1 cierre parcial de findings verificados

**Fecha:** 2026-08-17
**Directorio:** `cambra-global-p1-p5-copy` · Node 24.19.0 / npm 11.17.0

---

## Estado tras dos rondas de verificación

El workflow de auditoría ejecutó 11 dominios paralelos → **130 candidatos**. Dos rondas de
verificación adversarial cubrieron 35 de los 85 no-negativos:

- **3 CRITICAL** arreglados en commits anteriores (`SEC-01`, `P2-01`, `P3-01`).
- **29 restantes con veredicto** → 6 refutados, 29 sobreviven (todos con corrección).
- **6 refutados no se tocan** — cada uno con razonamiento multi-eje que verifiqué. Ese es el
  valor real del paso adversarial: seis "arreglos" a código correcto ahorrados.
- **50 findings sin verificar** todavía por límite de sesión (el reset caía a 22:50). No los
  arreglo hasta que pasen por la fase de refutación.

---

## Arreglados en este commit

Todos con `AUDIT <ID>` en el sitio del código para trazabilidad, tests o verify:chunk en verde.

### P1-SHARED-001 + P3-03 · `base44/shared/growthPathRuntime.ts`

30+ lecturas de entidades monetarias envueltas en un `safe()` que devolvía `[]` sin log, sin
contador y sin flag — la misma forma exacta del defecto original de `founderOSData.ts`. Y una
tercera copia privada de la coerción nulable (`Number.isFinite(Number(x)) ? Number(x) : 0`) sumaba
`actualRevenue` y `actualCash` como totales confiables.

Un `Invoice.list()` que lanzara mostraba en `AdminGrowth` "Actual revenue: EUR 0 · Operational
evidence" y `persistGrowthPathSnapshot` lo hacía **durable** en `MarketGrowthSnapshot`.

Añadido `summarize()` que reporta `counted`/`missing` y devuelve `null` (no 0) cuando ninguna fila
tenía el campo. El objeto devuelto lleva ahora `revenue_complete` y `cash_complete`, así que el
consumidor puede distinguir un total de una cota inferior.

### P1-SHARED-002 · `base44/shared/commandRunExecutor.ts:237`

El único `.catch(() => [])` que quedaba en `base44/shared/`, sobre la lectura de la **punta de
la cadena de recibos tamper-evident**. En un fallo transitorio, `previousReceipt` se convertía en
`null`, `buildNextReceipt` escribía el siguiente recibo como si la cadena empezara de cero
(sequence: 1, previous_hash: null) y la cadena se rompía en silencio. `verifyReceiptChain` marcaba
`duplicate_sequence` después, pero el lector de admin ya había mostrado un valor sin base.

Fail-closed: un fallo de lectura sobre la punta detiene el run con `receipt_chain_tip_unreadable`,
y una `last_receipt_hash` que apunta a una fila que ya no existe detiene con
`receipt_chain_tip_missing`. Nunca se muta historia por un blip de lectura.

### P3-02 · `base44/shared/founderMerchantsV2.ts:41`

`const numberOrNull = (v) => Number.isFinite(Number(v)) ? Number(v) : null` — el defecto
`Number(null) === 0` reintroducido. Reemplazado por `nullableNumber` del módulo compartido.

### P2-03 · `base44/shared/founderMerchantsV2.ts` (bloque `overview`)

El bloque leía diez fuentes y omitía **`Approval` y `AutonomyIncident`** de `summarySources`, y
`evidenceStatus` fallaba en abierto: cualquier fuente que no estuviera en `sourceStatus` se
reportaba como `AVAILABLE`. Resultado: cada merchant devolvía `needs_attention: 0`,
`attention_status: 'AVAILABLE'` para dos lecturas que ni siquiera se hacían.

**Consumidor real, según la verificación:** Ask CAMBRA. El copilot recibía este payload como
contexto canónico, así que un merchant con tres aprobaciones pendientes se reportaba al founder
como "cero decisiones pendientes".

Ahora se leen ambas entidades en la rama, y `evidenceStatus` falla-cerrado cuando el llamante
está trackeando source health y esta fuente no aparece — pero mantiene el comportamiento abierto
cuando el llamante no pasa `sourceStatus` en absoluto (para no romper 13 tests existentes).

### MB-04 · `base44/shared/founderMerchantsV2.ts` (cuatro sitios de caja)

Cuatro reducciones sobre `amount_paid` sin filtrar por status: `revenueCollected` (portfolio),
`monthCollected` (KPI mensual), `collected` (drilldown), `invoiceEvolution` (serie mensual). Todas
alimentan cifras founder-facing, y `invoiceEvolution` alimenta un test que asegura
`truth_boundary.collected === 'verified_payment'`.

Excluido `void` en las cuatro. **`refunded` es decisión del founder** (neto vs bruto): la
mantengo dentro de `collected` **y** surfaceo `refunded_minor` por separado en la evolución
mensual, para que la decisión sea visible sin destruir la evidencia de que ese cash sí se movió.

### P2-02 · `base44/shared/financeCore.ts:163`

El flag `rows_source_complete` se consultaba en exactamente una rama (el short-circuit de filas
vacías). En la rama con filas, `completeness` venía solo de `nullableSum` — que mide cobertura
sobre las filas **que llegaron**, no si la lectura de la fuente fue completa. Una lectura truncada
de 500 filas todas con el campo → `COMPLETE + VERIFIED` sobre una cota inferior.

Ahora `rows_source_complete: false` degrada la ruta con-filas también: `COMPLETE` → `LOWER_BOUND`
y `VERIFIED` → `DERIVED` con boundary explícito.

### MB-01 + MB-02 · `base44/functions/providerRevenueReconciliationWorker/entry.ts`

Dos defectos en un `reduce`. Ledger leído por `{provider_id, period}` ignorando `agreement_id`,
`currency` y `is_demo` — un proveedor con dos acuerdos veía ambos sumados contra un statement de
un solo acuerdo, y un statement en USD se comparaba con un ledger en EUR sin comprobar divisa.
Y la reducción usaba `accrued_amount_minor || expected_amount_minor || 0`: cuando el accrued era
legítimamente cero (nada ese periodo), el `||` caía al **forecast**, así que un statement tenía
que coincidir con la previsión para reconciliar.

Ahora se filtra por `agreement_id` + `currency`, se rechaza el statement con
`provider-revenue-unscoped` si le falta alguno, `expected` usa solo `accrued_amount_minor`, y las
filas demo quedan fuera.

### MB-03 · `base44/shared/apiUsageBilling.ts`

`billApiUsageOrganization` creaba un `Invoice` con `status: 'issued'` y **cero campos fiscales**:
sin `tax_treatment`, sin `tax_rate`, `tax_amount` en el default cero, `total_amount == subtotal`.
Una factura "emitida" sin determinación fiscal es una neta facturada como bruta.

Fail-closed: se crea como `status: 'draft'` con `tax_treatment: 'TAX_REVIEW_REQUIRED'` y una nota
que indica la determinación fiscal pendiente. Promocionar a `issued` requiere que se corra el
Organization por `recoverTax` — camino de escritura pendiente, out of scope aquí, declarado.

### P2-06 · `base44/shared/disasterRecoveryRuntime.ts:155`

El manifiesto de backup guardaba `attachments.all_verified_before_upload: true` como literal.
Nada verificaba nada antes de subir: `fetchOwnedFile` solo comprobaba `response.ok` y un tope de
bytes, y los SHA-256 eran digests **de la copia recuperada**, no comparaciones contra una
referencia externa. Auto-atestación sellada en el manifiesto.

Sustituido por `attachment_verification: 'digested_after_fetch_only'`, que describe lo que
realmente pasó.

### P2-07 · `base44/shared/disasterRecoveryRuntime.ts:279`

`source_environment: 'prod'` hardcodeado, y `attestRestore` luego ANDaba
`evidence.source_environment === 'prod'` en la condición de PASS. Como el literal era el único
escritor de ese campo, la cláusula nunca podía fallar — peso muerto en el booleano y
auto-atestación en el JSON de evidencia. Ahora se lee de la cadena del manifiesto que la función
acaba de cargar (`selected.source_environment`).

### P2-04 · `base44/functions/buildInfrastructureGraph/entry.ts:186-188`

`Number(sc.total_fees_monthly || 0)` y `Number(sc.effective_fee_pct || 0)` coaccionaban agregados
ausentes a 0. Aguas abajo el merge en la línea 121/123 usa `??` — pero 0 no es nullish, así que
esos ceros **sobreescribían** un coste previamente observado con `cost_confidence: 'verified'`
intacto. Reclamación de "coste verificado cero" sobre un merchant que sí paga Stripe.

Ahora propaga `null` cuando el agregado está ausente para que el `??` mantenga el valor previo, y
`cost_confidence` cae a `'unmeasured'` en ese caso.

### P3-05 · `base44/functions/shadowRoutingEngine/entry.ts`

Cada `ProviderPricingVersion` sin tarifa escalar (que son todas las que siembra
`seedP3RateIntelligence`) se valoraba como `estimated_cost_minor: 0` y podía **ganar la ruta por
coste** contra rivales reales. Mismo defecto que P3-01 en otro sitio.

Un `priced()` local propaga null y la fila se **excluye** de los candidatos en vez de valorarse
en cero (siguiendo el mismo criterio que `aggregateCore.pricingCostMinor`: solo se puede saltar
una tarifa si no hay volumen que la aplique).

### P3-06 · `base44/functions/recordProviderRevenuePayment/entry.ts:19`

`paid = Math.min(inv.amount_minor||0, prior_paid+amount)` con `status = paid >= inv.amount_minor||0`
cerraba como `paid` una factura de importe cero — porque `Math.min(0, x) === 0` y `0 >= 0` es
`true`. Excedente descartado, sin registro de variance.

Ahora rechaza con `invoice_amount_missing_or_zero` cuando el importe es no-positivo, y con
`payment_exceeds_invoice_amount` cuando el pago excede — dropping silencioso no es opción cuando
la entidad no tiene campo para guardar el overpaid.

### P3-07 · `base44/functions/getBrandSavings/entry.ts`

`safeBestEffort` en la lectura devolvía `[]` en fallo con `console.warn` — indistinguible aguas
abajo de "cero reportes". `measurementQuality` (derivado solo de `measurement_mode`) etiquetaba el
conjunto vacío como `'estimated'`: reclamación de confianza sobre cifras que la lectura nunca
entregó.

Ahora la lectura es `try/catch` con `reportsReadable`; una lectura fallida devuelve
`measurement_quality: 'unknown'` y añade `reports_readable: false` en el payload.

### R4-03 + R4-07 · `src/lib/auditR4BehaviouralTests.test.js`

Dos módulos sin cobertura de comportamiento:
- **`shadowRoutingCore.ts`** — 10 funciones puras, 6 constantes; solo referenciado por tests con
  `toContain` sobre texto fuente.
- **`bestEffort.ts`** — la primitiva de observabilidad de la que depende toda la doctrina de
  "lectura honesta"; solo referenciada por tres greps.

27 tests de comportamiento nuevos que **conducen** cada función. Ninguna aserción hace grep del
módulo bajo prueba. Un caso a destacar: los tests cazaron dos defectos de mi propio código de
test — la firma real de `validateObservation` (devuelve el array directamente, no `{ok, errors}`)
y el nombre real del código de error (`provider_required`, no `provider_slug_required`). R4 muerde
también contra el redactor del test.

---

## Refutados por el verificador (no se tocan)

Cada uno con razonamiento multi-eje que revisé:

- **P2-05** — `maintenanceEngine safeRepair.close_stale_task`. La wiring de señal→acción sí es
  alcanzable, pero el mecanismo de fallo descrito falla en cuatro ejes independientes.
- **R4-01** — `adminCockpitFailVisible.test.js`. La mutación propuesta es un no-op demostrable
  (`truncatedSources` es una copia local no consumida).
- **R4-08** — `ctoProductionRemediation.test.js`. La premisa fáctica ("no test invoca
  `internalErrorResponse`") es falsa — existe un test de comportamiento en `getFounderControlCenterBehavior`.
- **R4-09** — `p16FounderOS.test.js`. Rechazado en alcanzabilidad, en la afirmación de "silent 0"
  y en la premisa de cobertura.
- **R4-11** — `documentExtractionV2.test.js`. La descripción del test es exacta, pero el fix
  propuesto está refutado en dos ejes verificados.
- **MB-06** — `reconcileInvoice`. El escenario es **imposible por construcción**: dos guards
  anteriores excluyen ambas poblaciones descritas y ninguna factura del árbol puede llegar a la
  rama afectada.

---

## Findings sobrevivientes NO arreglados (con razón)

- **P3-04** (`founderOSCore.safeNumber`) — el verificador movió el sitio del defecto y lo redujo a
  MEDIUM. El arreglo real requiere retooling del módulo de proyección de métricas del founder,
  cambio de mucho más alcance que un bug fix. Registrado. Su forma alcanzable
  (`accrued_amount_minor` ausente y luego etiquetado `verified`) requiere una escritura no
  reachable en producción hoy.
- **P2-08** (`founderOSQuery.safe()`) — LOW. Reemplazar por `safeTracked` es limpio pero el
  consumidor (`why_metric`) no llega a decisiones críticas.
- **P3-08** (`nullableNumber` — DECISION) — 12 módulos con copia privada, gate solo cubre 4.
  Widening del allowlist es scope decision del founder: qué módulos son "financial-enough" para
  que el gate los cubra.
- **R4-02, R4-04, R4-05, R4-06, R4-10** — tests que afirman sobre texto en vez de comportamiento
  pero cuya reescritura completa (con el módulo bajo prueba de verdad) requiere entender la
  intención original del test, y todos son latentes (no ocultan un defecto activo). Registrados
  para conversión posterior.
- **R4-12** — refutado en el enunciado original (`stripeBilling` **sí** tiene tests transitivos y
  su valor pineado se afirma literalmente en `recoverBillingSaga.test.js:618`).

---

## Contadores tras esta ronda

- CRITICAL: 3 → **0 abiertos**.
- HIGH: 30 originales, verificados 15 (11 arreglados + 4 registrados), 15 sin verificar todavía.
- Sello de producción sigue `false`. Sin evidencia de runtime, no se puede mover.
- `legal_review: PENDING`. Sin tocar.
- Ningún fichero frozen tocado.

Los 50 verificadores restantes vuelven a intentarse cuando la sesión resetee. Hasta entonces,
ninguno de esos findings se toca.
