# Known Debt Log

Registro **append-only** de deuda funcional identificada pero deliberadamente
no arreglada. Cada entrada explica el bug, dónde vive, por qué no se arregla
todavía, y qué hay que hacer cuando toque. Mismo formato para toda la deuda,
empezando por A2.

---

## DEUDA A2 — Auto-materialize accumulation

**Estado:** activa
**Origen:** FASE 5C (Auto-materialize, approach A2, frontend-only accumulative)

`useAutoMaterialize` acumula filas de `AnalyzerInput` y `AnalyzerResult` cada
vez que corre bajo el mismo brand — no deduplica por (brand_id, source_hash).
En operación normal el hook corre 1x por Sync manual, así que la acumulación
es lenta. En un flujo automatizado (cron o retries agresivos) crece rápido.

**Fix cuando toque:**
- Antes de crear un nuevo `AnalyzerResult`, comprobar si existe uno reciente
  (< 24h) para el mismo `brand_id` con `source_integration_id` idéntico y, si
  sí, `update()` en vez de `create()`.
- Alternativa: mover el trigger a un backend function `materializeVerified`
  con lógica de upsert transaccional (más limpio pero requiere 5C-A1).

**No arreglar sin confirmación de producto** — se acepta la acumulación como
coste conocido mientras el trigger sea manual (botón Sync).

---

## BUG-1 — AI Insights filtra por usuario, no por brand activo

**Estado:** activa
**Detectado:** 2026-07-09 durante validación FASE 2 (Opción B)
**Fichero:** `src/components/dashboard/AIInsightsPanel.jsx`
**Líneas:** ~76-78 (query `base44.entities.AgentRun.list("-created_date", 3)`)

### Síntoma
El panel "Latest agent runs" del Dashboard muestra runs que NO pertenecen al
brand activo. Reproducido: xavi tiene dos brands (`H` y `CAMBRA (self-test)`).
Con `CAMBRA (self-test)` como brand activo (recién creado hoy), el panel
muestra un run tipo "Northpine Home — €9816/yr" de hace 14 días, que
pertenece a `H`. Lectura de usuario: "este brand tiene una recomendación de
€9816/yr" — falso, ese brand no tiene ningún agent run.

### Causa
La query es `AgentRun.list("-created_date", 3)`. RLS ya limita al usuario
autenticado, pero no distingue entre brands del mismo usuario. La entity
`AgentRun` tiene `brand_id`, pero la query no lo usa como filtro.

### Fix cuando toque
1. Elevar el brand activo a estado compartido (BrandContext o prop desde
   Dashboard.jsx línea 84-86 — misma fuente que ya usa el hero).
2. Cambiar la query a
   `base44.entities.AgentRun.filter({ brand_id: activeBrand.id }, "-created_date", 3)`.
3. Manejar estado "no active brand" con panel vacío en lugar de fallback a
   `.list()`.

### Por qué no se arregla ahora
Mismo patrón de scoping que causó el lío pre-FASE-2 con el brand H. Meter un
parche aislado aquí sin infra de brand activo compartido (BrandContext) crea
un segundo sitio donde el bug puede reaparecer. Se arregla junto con el
lift de brand activo, no antes.

---

## BUG-2 — Badge "Verified" del héroe se enciende sin AnalyzerResult

**Estado:** activa
**Detectado:** 2026-07-09 durante validación FASE 2 (Opción B)
**Fichero:** `src/pages/Dashboard.jsx`
**Líneas:** 209-211 (definición de `heroBadge`)

### Síntoma
El héroe del Dashboard muestra "Verified — based on real Stripe data" con
`€0/yr` cuando existe una Integration Stripe conectada pero NO existe ningún
`AnalyzerResult` verified para el brand activo. Lectura de usuario:
"CAMBRA verificó que ahorro €0/año" en lugar de "aún no puedo verificar tus
ahorros — corre el análisis".

### Causa
La condición del badge, tras FASE 1, es simplemente:
```js
const heroBadge = stripeConnected ? verified_badge : estimated_badge;
```
donde `stripeConnected = !!stripeConn` y `stripeConn` viene de
`Integration.status === "connected"` (o del fallback legacy StripeConnection).
Basta con que la Integration esté conectada — no se comprueba si hay
`AnalyzerResult` con `verification_scope` que incluya `"payments"`.

### Fix cuando toque
La condición correcta requiere **dos condiciones AND**:
1. `stripeConnected === true` (Integration en estado connected), Y
2. Existe al menos un `AnalyzerResult` para `brand.id` con
   `Array.isArray(verification_scope) && verification_scope.includes("payments")`
   (o el equivalente per-vertical documentado en el schema
   `AnalyzerResult.verification_scope` — union entre filas del mismo brand).

Cambio propuesto:
```js
const hasVerifiedPayments = latest?.verification_scope?.includes?.("payments") === true;
const isVerified = stripeConnected && hasVerifiedPayments;
const heroBadge = isVerified ? verified_badge : estimated_badge;
```

### Por qué no se arregla ahora
FASE 3 (verifiedMaterializer disparado desde `useAutoMaterialize` al Sync)
todavía no ha materializado ningún `AnalyzerResult` verified para el brand
nuevo. Si flipamos la condición ahora, bloqueamos el paso de estimated →
verified que estamos justo a punto de habilitar. Se arregla **después** de
que FASE 3 pueda producir el `AnalyzerResult` verified, para que el flip a
Verified sea real y no cosmético.

---

## BUG-3 — Contador de header "0 connected" mientras la card dice Connected

**Estado:** activa
**Detectado:** 2026-07-09 durante validación FASE 1.5
**Fichero:** `src/pages/ConnectTools.jsx`
**Líneas:** ~285-293 (resumen `detectedCount` / `connectedCount` / `availableCount`)

### Síntoma
En `/ConnectTools`, la `StripeConnectCard` muestra correctamente
"Connected · last sync ..." (post-FASE-1). Sin embargo, la barra de resumen
inmediatamente encima sigue mostrando "0 connected". Discrepancia visible:
la card dice connected, el contador dice 0.

### Causa
`ConnectTools.jsx` cuenta connected/detected/available desde el array
`sourceList = flatList.length ? flatList : allIntegrations`, que viene del
endpoint `getIntegrationStatus` — el cual, hasta FASE 1, agregaba
`StripeConnection` (legacy) y no incluía las filas `Integration` como
"connected" en el conteo. Misma familia de scoping/counting que BUG-1 y
BUG-2: se leía la fuente antigua después del cambio de source-of-truth.

### Fix cuando toque
Alinear `getIntegrationStatus` (backend) para que también contribuya al
conteo desde `Integration` (mismos 3 slugs Stripe + resto de providers
Integration-backed). No es solo cosmético — otras vistas que dependan del
mismo agregado (dashboard KPI de "tools connected") sufren la misma
subcuenta.

### Por qué no se arregla ahora
Prioridad más baja que el 500 en curso; misma familia de scoping post-FASE-1
que ya está bajo trabajo. Se arregla junto con el lift de fuente única de
"connected" cuando cerremos FASE 1.5/3.