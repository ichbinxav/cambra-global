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

**Estado:** RESUELTA 2026-07-09 (cierre de sesión)
**Detectado:** 2026-07-09 durante validación FASE 2 (Opción B)
**Fichero:** `src/components/dashboard/AIInsightsPanel.jsx`
**Líneas resueltas:** ~68-95 (bloque `useEffect` load)

### Resolución
El panel resuelve primero el brand activo del usuario
(`Brand.filter({ created_by_id: me.id }, "-created_date", 1)` — misma fuente
que Dashboard.jsx) y luego consulta
`AgentRun.filter({ brand_id: activeBrand.id }, "-created_date", 3)`.
Si no hay brand activo → lista vacía (sin fallback a `.list()`, que era la
fuga). No se introduce BrandContext compartido — se difiere hasta un lift
más amplio; el fix aislado aquí es correcto porque la fuente de brand
activo es la misma constante usada en el Dashboard.

---

## BUG-1 (histórico) — descripción original

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

**Estado:** RESUELTA 2026-07-09 (cierre de sesión)
**Detectado:** 2026-07-09 durante validación FASE 2 (Opción B)
**Fichero:** `src/pages/Dashboard.jsx`
**Líneas:** 209-231 (definición de `heroBadge` / `heroSubtitle`)

### Resolución
El gate del héroe ahora deriva de `latest.verification_status` (AnalyzerResult
activo) y no de `stripeConnected`. Tres estados: `verified` (emerald),
`pending_verification` (blue "Provisional"), `estimated` (amber). Chip lateral
sincronizado con la misma variable. Ver Dashboard.jsx:224-247.

---

## BUG-2 (histórico) — condiciones originales

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

**Estado:** activa (pendiente re-verificación visual en `/ConnectTools`)
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

---

## BUG-4 — `dataSyncAgent` avanza `last_synced_until` a "ahora" en cada sync

**Estado:** RESUELTA 2026-07-09 (cierre de sesión, estrategia b aprobada)
**Detectado:** 2026-07-09 durante validación FASE 3 (auto-materialize)
**Fichero:** `base44/functions/dataSyncAgent/entry.ts`

### Resolución
Cursor-con-confirmación:
1. `last_synced_until` avanza al high-water mark REAL (max `occurred_at`
   entre los records procesados por ESE endpoint), no a `window.until`
   (= clock-now del inicio del sync).
2. **Guarda de monotonía**: `newCursor = max(hwm, epState.last_synced_until)` —
   un lote de records antiguos (backfill / clock skew / reordering)
   NUNCA retrocede el cursor.
3. Semántica limpia: el cursor persistido es el HWM real (no lleva el
   solape horneado dentro). El solape de 24h se aplica en LECTURA
   (`computeSyncWindow`: `since = cursor - 24h`) para absorber
   settlement delay (Stripe backdates balance_transactions).
4. Sin ocurrencias válidas en el lote → conserva el cursor previo
   (nunca deriva a clock-now).
5. Partial syncs (cap hit) → cursor previo intacto (comportamiento previo).

**Fuente-de-verdad de la lógica de ventana**: `src/lib/syncEngine/dateRange.js`
(módulo test-verificado). El bloque `SYNC-START: dateRange` en
`dataSyncAgent/entry.ts` es su duplicado verbatim (limitación Deno). El
`__sync_check__.test.js` detecta drift.

**Auditoría normalizers**: los 24 normalizers activos emiten `occurred_at`
con guarda null. Verificado el 2026-07-09.

---

## BUG-4 (histórico) — síntoma original

### Síntoma
Tras un primer sync exitoso (que trae ~90 días de histórico Stripe), los
siguientes syncs devuelven **0 records nuevos**, incluso cuando hay actividad
en Stripe posterior al primer sync. El bridge downstream ve 0 charges en
ventana y degrada a `insufficient`.

### Causa
`dataSyncAgent` avanza el cursor `last_synced_until` al momento del sync
(`Date.now()`), no al `created` del último balance_transaction procesado.
El siguiente sync arranca su ventana desde ese punto — que ya fue cubierto —
y no captura los events que llegaron entre el primer sync y "ahora" con
delay de settlement.

### Fix cuando toque
`last_synced_until` = max(`created`) real observado en la página final de
`balance_transactions`, no `Date.now()`. Además dejar un solape mínimo
(24h) para absorber settlement delay.

### Por qué no se arregla ahora
Requiere test controlado con Stripe test-mode + tocar `dataSyncAgent` que
está funcionando para el escenario de primer-sync (nuestro caso actual).
Se arregla al preparar sync recurrente / cron.

---

## BUG-5 — `handleDisconnect` apunta a entidad legacy `StripeConnection`

**Estado:** activa
**Detectado:** 2026-07-09 (documentado en FASE 1.5)
**Fichero:** `src/components/connect/StripeConnectCard.jsx`
**Líneas:** función `handleDisconnect` (~línea 195)

### Síntoma
Al pulsar "Disconnect" desde la Stripe card, la llamada a `stripeDisconnect`
devuelve 404 en connections Integration-backed (post-FASE-1). El estado
local se limpia (`setConnection(null)`) pero el registro Integration
subyacente permanece `status: "connected"` — al recargar, la card vuelve a
mostrar Connected.

### Causa
`stripeDisconnect` (backend) fue escrito para la entidad legacy
`StripeConnection`. Cuando la fuente de verdad pasó a `Integration` (FASE 1),
`handleSync` se ruteó al endpoint correcto (`dataSyncAgent`) pero
`handleDisconnect` se quedó apuntando al viejo. Misma familia que el fix
de `handleSync` que ya está desplegado.

### Fix cuando toque
Rutear `handleDisconnect` como `handleSync`: si `connection.provider` está
presente → invoke nueva función `integrationDisconnect({ integration_id })`
que marca la row Integration como `status: "disconnected"` y limpia
`access_token`. Fallback a `stripeDisconnect` sólo para connections legacy.

### Por qué no se arregla ahora
Requiere crear una nueva backend function (`integrationDisconnect`) y no es
crítica en flujo actual (usuarios connect → sync → results, no
disconnect). Se arregla junto con el resto del limpieza post-FASE-1 de
endpoints legacy.