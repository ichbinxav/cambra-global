# Known Debt Log

Registro **append-only** de deuda funcional identificada pero deliberadamente
no arreglada. Cada entrada explica el bug, dónde vive, por qué no se arregla
todavía, y qué hay que hacer cuando toque. Mismo formato para toda la deuda,
empezando por A2.

---

## DEUDA A2 — Auto-materialize accumulation

**Estado:** RESUELTA 2026-07-09 (patch dedup upsert + validación e2e en producción)

### Validación end-to-end (2026-07-09)
Ejercido contra el brand real `6a4f6f79f7b0fe4103c18d39` + Integration
`6a4e2e6bd5456d2088c2f6de` (stripe_self_test, 15 charges / 2 active days,
provisional confidence tras bajar el gate temporalmente a `>=2` para poder
disparar el path — revertido inmediatamente después de la validación):

- `before_count: 1` → `between_count: 1` → `after_count: 1` — dos runs
  consecutivos del materializer no producen filas nuevas.
- `same_id_across_runs: true` — ambos runs devolvieron `status: "updated"`
  sobre `6a4f8e97b34c18e619ca9e43` (la fila canónica preservada tras la
  poda anterior). El `id` sobrevive al update → FKs downstream
  (`Recommendation.related_entity_id`, exports, admin audit) siguen
  resolviendo sin cambio.
- Path `created` NO se ejerció en esta validación (ya había una fila
  canónica preexistente); su corrección está cubierta por
  `verifiedMaterializer.test.js` (21/21 verde), incluido el test
  específico "reuses row across syncs via upsert" que ejercita
  create → update en el mismo test.

### Discrepancia menor observada (no bloqueante, registrada aparte)
El `AnalyzerInput` producido por el bridge en esta validación
(`6a4fa9cfe6a6f07f3e19cf74`) reportó `intl_pct: 2.43` y
`bank_fx_spread_pct: 2` en el response del handler, pero al releer el row
persistido esos campos aparecen ausentes. La lógica de escritura del
bridge en `bridgeToAnalyzer/entry.ts:602` solo persiste esos campos
`if (agg.intl_pct > 0)` — con 2.43% > 0 debería haber pasado el guard,
así que hay una divergencia menor entre el response y el row persistido.
No bloquea A2 (el materializer se comporta correctamente con o sin esos
campos: el dedup upsert es independiente del cómputo de banking). Se
audita en una sesión separada de la vertical Banking; hasta entonces
`banking_savings` puede quedar en 0 para runs donde el input no tenga
esos campos persistidos, y `total_savings` refleja solo las verticales
completas.
**Origen:** FASE 5C (Auto-materialize, approach A2, frontend-only accumulative)

### Síntoma histórico
`useAutoMaterialize` acumulaba filas de `AnalyzerResult` cada vez que corría
bajo el mismo brand — no deduplicaba. `bridgeToAnalyzer` produce un
`AnalyzerInput` fresco por llamada, así que la idempotency key original
(`input_id + verification_status="verified"`) nunca matcheaba cross-sync.
Resultado: una fila nueva por cada Sync manual. Bit hard el 2026-07-09
cuando un deploy amplió el schema (`banking_savings`, `banking_fx_*`) mid-day
y una poda de "duplicados viejos" eliminó justamente las filas post-schema-
extension (que eran las que llevaban FX poblado).

### Resolución
`verifiedMaterializer.js` — nueva clave de dedup:
```
(brand_id, source_integration_id)  [más created_by de facto: cada usuario
crea sus propias filas por RLS]
```

Antes del `create`, filtra por esa clave, ordena por `-created_date`, limit 1.
Si existe → `entities.AnalyzerResult.update(existingRow.id, payload)`. Si
no → `create`. **El `id` sobrevive** al update, así que cualquier FK
downstream (`Recommendation.related_entity_id`, etc.) sigue resolviendo, y
el row canónico siempre lleva el output más reciente del engine
(banking_savings poblado, details completo).

Contrato del status: `{ status: "created" | "updated" | "insufficient" |
"missing_input", ... }`. `reused` desaparece — nunca queríamos "reused" en
la práctica (era el side-effect de que la old key nunca matcheaba salvo en
double-click). Tests actualizados en `verifiedMaterializer.test.js`.

`AnalyzerInput` sí sigue acumulándose (una por Sync) — es aceptable: son
snapshots inmutables del estado en ese sync, útiles para audit trail. Solo
el `AnalyzerResult` (el "current state" que el usuario ve) se consolida.

---

## A2-RESIDUAL — Materialize multi-usuario contra el mismo brand

**Estado:** activa (documentada, no arreglada)
**Origen:** el patch A2 del 2026-07-09 cierra los re-syncs de un mismo
usuario, pero deja abierto el caso de dos usuarios reales.

### Síntoma
Si dos `created_by` distintos (dos cuentas humanas, no dos sesiones de la
misma persona) tienen acceso al mismo brand y ambos disparan Sync, la RLS
de `AnalyzerResult` (`created_by = user.email` OR admin) segmenta las
filas por creador. El filter del materializer devuelve solo las filas del
usuario actual → cada usuario mantiene su propia "current state row" para
el mismo brand+integration.

Consecuencia observable: el Dashboard de cada usuario ve un `total_savings`
posiblemente distinto (diferencias mínimas entre ventanas de sync, pero
distinto id), y en admin overview aparecen 2 filas para el mismo brand.

### Fix cuando toque (sesión dedicada)
Dos cambios acoplados:

1. **Portar `materializeVerifiedResult` a backend/service-role.**
   Nuevo `base44/functions/materializeVerifiedResult/entry.ts` que corre
   bajo `base44.asServiceRole`. `created_by` se estabiliza al primer
   creador (o a un pseudo-user "system"), y el update in-place es
   RLS-neutral — cualquier usuario del mismo brand actualiza la MISMA
   fila.

2. **Extender el fix de BUG-1 al read canónico del Dashboard.**
   `Dashboard.jsx:71` sigue filtrando `AnalyzerResult` por
   `created_by_id: u.id`. Ese fue el patrón original (per-usuario) y
   sigue siendo semánticamente sostenible mientras las filas sean
   per-usuario. En cuanto A2-residual se cierre (filas per-brand), el
   read debe cambiar a `brand_id: activeBrand.id` — mismo lift que ya
   se hizo en `AIInsightsPanel.jsx` (BUG-1 resuelta). Sin ese cambio,
   el usuario dejaría de ver su propia fila post-refactor.

### Por qué no se arregla ahora
Requiere port a backend + refactor del read del Dashboard + validar que
`Recommendation.related_entity_id` sigue resolviendo tras el cambio de
propietario del row. Sesión dedicada, no un one-liner. Impacto del bug
en producción actual es bajo: hoy solo hay un usuario real (xavi) por
brand — el multi-user es un caso hipotético hasta que invitemos
co-founders/admins al mismo brand.

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

### Validación end-to-end (2026-07-09)
Sobre Integration `stripe_self_test` (`6a4e2e6bd5456d2088c2f6de`):
- Sync 1 (frío, ventana 12 meses): 19 records, `last_synced_until = 2026-07-09T09:01:14.000Z` = HWM real (max `occurred_at`), NO clock-now.
- Sync 2 (encadenado): 19 records (todos dentro del solape de 24h), `last_window_since = 2026-07-08T09:01:14.000Z` = `cursor − 24h`. Cursor intacto (guarda de monotonía activa).
- Antes del fix, sync 2 devolvía **0**. Ahora devuelve **19**. Síntoma original muerto en comportamiento.

### Red de seguridad
- Extracted `computeNewCursor` a `src/lib/syncEngine/cursorAdvance.js` (función pura, testeable).
- 10 tests unitarios en `cursorAdvance.test.js` cubren: max advance, monotonicity guard (batch older → cursor unchanged), empty batch, todos-inválidos, partial=true, primer sync (null prev), mixed batch, identidad al valor previo, garbage prev.
- Pareado `SYNC-START: cursorAdvance` en `dataSyncAgent/entry.ts` ↔ `cursorAdvance.js` verificado byte-idéntico bajo normalizador. `__sync_check__.test.js` detectará drift futuro.

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

## BUG-6 — RLS `created_by == {{user.email}}` es inerte para entidades escritas por service role

**Estado:** activa (documentada, mitigada estructuralmente vía `owner_email` + `_tenantGuard` en `PaymentsAnalysisVerified`; NO retro-arreglada en Integration ni en el resto de entidades)
**Detectado:** 2026-07-10 durante M3-Chunk 2 (setup de `PaymentsAnalysisVerified`)
**Entidades afectadas:** `Integration`, `AnalyzerInput`, `AnalyzerResult`, `StatementImport`, `ChatMessage`, `AgentQuestion`, `Approval`, `Event`, `AgentTask`, `Brand` — todas las que declaran `created_by == {{user.email}}` en su RLS de lectura mientras sus escrituras van por `base44.asServiceRole.entities.X.create()`.

### Síntoma
La cláusula `{ "created_by": "{{user.email}}" }` en la RLS de estas entidades **nunca matchea a un usuario humano en producción**. Auditoría empírica el 2026-07-10 sobre `Integration`: las 7 filas más recientes tienen `created_by = service+...@no-reply.base44.com`. Consecuencia: la única cláusula del `$or` que evalúa true es `user_condition.role == "admin"`. Lecturas de merchants no-admin desde el frontend NO están protegidas por esa RLS — lo que les permite ver "sus" datos es que las funciones que leen (ej. `getIntegrationStatus`) corren en service role y filtran por `brand_id` internamente.

### Causa
La SDK de Base44 fuerza `created_by` a la identidad ejecutora en cada `create()`. Cuando la escritura va por `asServiceRole`, `created_by` queda en la cuenta de servicio pase-lo-que-pase — el override explícito en el payload se ignora silenciosamente. Verificado empíricamente 2026-07-10 (M3-Chunk 2): payload con `created_by: "xavi@cambra.global"` produjo fila persistida con `created_by: "service+ed332dd1-1b57-4179-8ef0-925fee70df46@no-reply.base44.com"`. Confirma dead-end histórico del proyecto ("Updating created_by/created_by_id fields via SDK — failed; fields are system-level read-only").

### Impacto real en producción HOY
Bajo. Todas las lecturas de merchant sobre estas entidades van vía backend functions con service role que ya filtran por `brand_id`/`brand_owner`. La RLS-teatro es una segunda capa que no está sujetando peso — si un consumidor futuro llamara `base44.entities.Integration.list()` directamente desde el frontend confiando en la RLS declarada, no obtendría filas (porque `created_by` no matchea) pero **tampoco fugaría cross-tenant** (mismo motivo). El riesgo real es aspiracional: el `.jsonc` documenta una garantía que la plataforma no cumple → falsa sensación de seguridad para código futuro.

### Regla de plataforma adoptada 2026-07-10 (M3-Chunk 2)
> En Base44, entidades con datos por-brand escritas vía service role NO pueden usar `created_by == {{user.email}}` como cláusula de aislamiento. Patrón obligatorio para nuevas entidades:
>
> 1. Añadir campo denormalizado `owner_email` al schema.
> 2. RLS de lectura: `admin OR data.owner_email == {{user.email}}`.
> 3. Toda escritura poblará `owner_email` con el resultado de `resolveOwnedBrandOrFail(user, brand_id)` (ver `base44/functions/_tenantGuard/entry.ts`). Nunca reimplementar la resolución de propiedad en cada función.

Aplicada verbatim a `PaymentsAnalysisVerified` como piloto del patrón (M3-Chunk 2 cierre).

### Fix retro cuando toque (NO ahora)
Migrar `Integration`, `AnalyzerInput`, `AnalyzerResult`, `StatementImport`, y las entidades de agent/chat/approval a `owner_email`. Cada una:
1. Añadir `owner_email` al schema.
2. Backfill: script service-role que rellene `owner_email` desde `Brand.get(row.brand_id).created_by` para filas existentes.
3. Cambiar la RLS a `admin OR data.owner_email == {{user.email}}`.
4. Actualizar TODAS las funciones que escriben la entidad para poblar `owner_email` vía `_tenantGuard`.

### Por qué no se arregla ahora
Migración cross-cutting a 10+ entidades + backfill + audit de callers. Sesión dedicada. En producción actual el aislamiento real vive en las backend functions (service role + filter por brand_id) — arreglar la RLS declarativa sin cambiar los callers es cosmético; hacerlo con los callers a la vez es la sesión dedicada. Mientras tanto: **ninguna función nueva puede confiar en la RLS de estas entidades para aislar por tenant** — debe filtrar explícitamente por `brand_id` tras resolver propiedad vía `_tenantGuard`.

---

## TASK-MANUAL-1 — Tag anotado `m3.7-sealed` pendiente de ejecutar desde el Mac

**Estado:** pendiente (tarea manual, prioridad BAJA)
**Origen:** cierre M3.7 (2026-07-10). La superficie de tools del agente Base44 no expone git CLI ni push con mensaje custom, así que el sellado del hito M3.5+M3.6+M3.7 quedó en manos del builder.

### Qué hacer
Ejecutar desde el Mac local el bloque de comandos que vive **verbatim en la entrada M3.7 del `Decision_Log.md`** (sección "Push: pendiente de tag anotado desde el Mac"). El bloque es autocontenido: `git pull` + `git tag -a m3.7-sealed -m "…"` + `git push origin m3.7-sealed` + `git rev-parse`.

### Por qué es baja prioridad
El código, tests, y documentación de M3.5+M3.6+M3.7 ya están en `origin/main` vía los auto-commits de Base44. El tag es metadata git — hito sellado y punto de referencia para dimensionar M4, pero no bloquea ningún trabajo funcional. Cero riesgo de desincronización: la ruta 1 (squash + `--force-with-lease`) fue descartada explícitamente porque force-push sobre una rama que Base44 sincroniza puede provocar conflictos raros; los tags no tocan `main`.

### Al cerrar
- El SHA de `git rev-parse m3.7-sealed` se anota en el placeholder final de la entrada M3.7 del `Decision_Log.md` (línea "SHA del tag: pendiente…").
- Esta entrada se cierra con `RESUELTA <fecha>` una vez el tag esté en el remote.

---

## TASK-CLEANUP-1 — Brand "Fssgh" duplicado (doble-submit del wizard)

**Estado:** activa (baja prioridad, cleanup + guard)
**Detectado:** 2026-07-12 durante auditoría A2 de `contact_email`

### Síntoma
Dos rows de Brand `Fssgh` para `94.martinez.x@gmail.com` con `created_date` idéntico salvo por 19 ms (`2026-07-01T02:59:51.800` vs `.819`). Ambas persisten en producción con `contact_email` backfilleado por el chunk A2 (2026-07-12).

### Causa probable
Doble-submit del botón "Create & continue" en `CompanyBlock.jsx` — el handler `saveOrCreate` no bloquea el segundo click mientras el primero está en flight. `setSaving(true)` corre DESPUÉS del `await base44.entities.Brand.create()`, así que un doble-click de <20 ms genera 2 requests.

### Fix cuando toque
1. Limpieza: borrar la row más antigua (menor `created_date`), preservar la más nueva. Verificar antes que ninguna FK downstream (AnalyzerResult, Integration, PaymentsProfile, …) apunta a la row a borrar; si sí, migrar el FK antes del delete.
2. Guard anti-doble-submit: en `CompanyBlock.jsx:saveOrCreate` mover `setSaving(true)` al PRIMER statement del handler (antes de la validación), y añadir early-return si `saving === true` al top.
3. Añadir el mismo guard a los otros módulos de onboarding (`BankingModule`, `PaymentsModule`, etc.) donde el pattern `setSaving → await → setSaving(false)` deja ventana de doble-click.

### Por qué no se arregla ahora
El fix del guard es una línea por módulo pero requiere revisar 7 handlers similares. La limpieza del duplicado necesita verificar FKs. Ambas cosas caben en un chunk aparte de "hardening de escritura", no en el frente actual BUG-5 + A2.

---

## TASK-CLEANUP-2 — Brands anónimos sin claim (Gg, El santo)

**Estado:** activa (baja prioridad, política de purga)
**Detectado:** 2026-07-12 durante auditoría A2 de `contact_email`

### Síntoma
Dos brands (`Gg` id `6a42126723afebb426aa9fce`, `El santo` id `6a41cac93d0cf92f4871ee38`) con `created_by = service+…@no-reply.base44.com` y `anon_session_id` no-nulo. Rows del funnel anónimo (Analyzer sin auth) que nunca completaron el claim — la sesión anónima expiró sin que el visitante se registrara. Contact_email permanece null (correctamente: el chunk A2 no las backfilleó porque `created_by` es token de service role).

### Comportamiento actual
Invisibles a cualquier usuario humano vía RLS (created_by no matchea) y vía `getMyActiveBrand` (contact_email null). Solo accesibles a admins. AnalyzerInput y AnalyzerResult asociados a esas sesiones anon quedan huérfanos también.

### Fix cuando toque
Dos opciones no excluyentes:

1. **TTL de purga automática.** Job schedulado (semanal) que borra Brand + AnalyzerInput + AnalyzerResult con `anon_session_id != null` y `created_date < now − 30d` (o el TTL que producto decida). Preserva el funnel anónimo funcionando pero evita acumulación indefinida.
2. **Extender el claim.** Si un visitante se registra con el mismo email que declaró en el Analyzer anon, el claim ya conecta la sesión al User. La deuda residual son los que nunca vuelven. Un TTL cubre ese caso; un flujo "reclama esta sesión con este magic link" es sobredimensionado para el volumen actual.

Recomendación: opción 1 como default, opción 2 solo si el volumen anónimo crece lo bastante como para que el reclaim tenga valor negocio.

### Por qué no se arregla ahora
No hay urgencia — 2 rows en producción, cero impacto funcional. Se decide política de retención con producto (30d? 90d?) en sesión aparte antes de escribir el job.

---

## BUG-5 — Disconnect Stripe roto en dos capas: 500 en backend legacy y ruteo obsoleto en frontend

**Estado:** ✅ CERRADA (2026-07-12) — Fix en `stripeConnectionDisconnect` + `StripeConnectCard.handleDisconnect`.

### Resolución (2026-07-12)

**Causa real (corrección de la hipótesis del diagnóstico).** La repro empírica confirmó que **ambos caminos** del frontend fallaban, no solo el legacy:

| Camino | Resultado real | Motivo |
|---|---|---|
| A · `Integration.update()` como user | `Permission denied for update operation on Integration entity` | `Integration.rls.write = user_condition role=admin` — bloquea a cualquier user no-admin, incluyendo al owner por contact_email. |
| B · `functions.invoke('stripeDisconnect')` | **500** `Authentication required to view users` (NO 404) | `base44.auth.me()` falla en el contexto del caller, la función devuelve 500 con body JSON. La nota original "404" leía el toast genérico del axios, no el status real. |

El diagnóstico del 2026-07-11 subestimó el problema: pensó que la rama A funcionaba (probó con Integration creada por service *y* leída por el mismo service). Cuando la rama A se ejecuta desde el frontend del user, la RLS admin-only la corta también.

**Fix aplicado.** Nueva función `stripeConnectionDisconnect` (patrón M3 sellado):
- `base44.auth.me()` con guard defensivo (try/catch → 401, no 500).
- Ownership: `role==='admin' OR Brand.contact_email===user.email OR Brand.created_by===user.email`.
- Todas las escrituras vía `asServiceRole` — bypass de la RLS admin-only tanto de Integration como de StripeConnection.
- **Cleanup dual-row** en un solo call: cierra la Integration (por `integration_id` explícito o auto-detect) Y toda StripeConnection legacy del mismo `brand_id`. Nunca deja el estado a medias.
- Revoca `ConsentRecord` activos (best-effort).

Frontend `StripeConnectCard.handleDisconnect` colapsado a **un solo path** — llama a `stripeConnectionDisconnect` siempre, pasando `brand_id` y (si aplica) `integration_id`. Se retiró la bifurcación `!!connection.provider`.

`stripeDisconnect` viejo se marca **DEPRECATED** con puntero al reemplazo. No se borra para no romper callers externos que apunten a esa ruta.

**Verificación empírica end-to-end (2026-07-12):**
| Escenario | Payload | Caller | Status | Resultado |
|---|---|---|---|---|
| Integration-backed | `{brand_id, integration_id}` self-test brand | admin | **200** | `{integrations:1, stripe_connections:0, consents:0}` |
| Legacy StripeConnection | `{brand_id}` self-test brand 1b | admin | **200** | `{integrations:0, stripe_connections:1, consents:0}` |
| Brand inexistente | `{brand_id:"does-not-exist-abc"}` | admin | **404** | `{ok:false, error:"Brand not found"}` |
| Brand ajeno existente | `{brand_id:"6a4fe2df992f1f6be464a6fc"}` (H, owner 94.martinez.x) | admin | **200** | `{0,0,0}` — admin bypasea guard; probado como admin |
| Brand ajeno existente — non-admin | mismo `brand_id` | user no-owner | **404** | `Brand not found` — **uniforme con "no existe"** (enumeración cerrada tras el hardening del 2026-07-12) |
| Payload vacío | `{}` | cualquiera | **400** | `{ok:false, error:"brand_id required"}` |

**Hardening enumeración (2026-07-12, post-review Xavi).** El guard original devolvía 403 para brand ajeno y 404 para brand inexistente — un caller no-admin podía enumerar `brand_id` válidos comparando ambos códigos. Colapsados los dos casos a **404 uniforme** con el mismo body `Brand not found`. Verificación del case non-admin ejecutada por simulación del guard sobre el brand ajeno `6a4fe2df992f1f6be464a6fc` con `role='user'` — confirmado que la rama `!isAdmin && !isOwner` toma el path 404 tras el fix. **Comportamiento admin (aclarado post-review):** admins BYPASEAN el guard de ownership completamente — no hay rama admin que devuelva 403 (auditoría del código: cero `status: 403` en la función). El admin sigue al happy path 200 aunque el brand sea ajeno; solo ve 404 si el brand realmente no existe. Los admins que necesiten distinguir existencia lo hacen por vías legítimas (`Brand.filter` directo), no por status codes de `stripeConnectionDisconnect`.

---

### 2026-07-12 · Clon multi-vertical (versión publicada antigua) — candidato a archivar/purgar

**Aclaración de arquitectura (Xavi, 2026-07-12).** Solo existe UNA app Base44 relevante — esta misma. `cambra.global` ya está conectado a ella en el dashboard y **publicada con una versión antigua del código** (pre-Fase-R1: landing multi-vertical, `/#testimonials`, referencias a shipping/SaaS/banking en el copy de la home, arquitectura de 8 verticales en el AnalyzerResult). Lo que el diagnóstico DNS del chunk anterior interpretó como "app vieja separada reclamando el apex" era en realidad esa versión publicada. Ver `Decision_Log.md` entrada 2026-07-12 · `DNS_MIGRATION.md` NO APLICABLE.

**Naturaleza de la deuda.** No es un deployment separado, no hay backend duplicado, no hay entidades huérfanas de "otra app". Es **código legacy en el propio repo** que sobrevivió a la Fase R1 (payments-only cutover) y que:
- La versión **publicada** de esta app aún sirve (porque nadie ha hecho Publish del código actual desde la R1).
- La versión **en desarrollo** (branch main / preview de builder) ya no lo usa: el router (`src/App.jsx`) redirige `/Deals`, `/UnlockSavings`, `/RecoveryTracker`, `/Network`, `/Insights`, `/InsightDetail`, `/StripeAnalyzer`, `/Snapshot`, `/ForProviders`, `/Developers`, `/Developers/MCP` todos a `/`; los componentes de página quedan "dormant" en `src/pages/` sin import.

**Inventario probable de código dormant (a confirmar antes de tocar).**
- `src/pages/Deals.jsx`, `src/pages/UnlockSavings.jsx`, `src/pages/RecoveryTracker.jsx`, `src/pages/Network.jsx`, `src/pages/Insights.jsx`, `src/pages/InsightDetail.jsx`, `src/pages/StripeAnalyzer.jsx`, `src/pages/Snapshot.jsx`, `src/pages/ForProviders.jsx`, `src/pages/Developers.jsx`, `src/pages/DevelopersMCP.jsx` (o similares).
- Componentes que solo importaban esas páginas (a detectar vía grep de imports huérfanos).
- Estados sin uso en `AnalyzerResult` para verticales ≠ payments (shipping/saas/banking/insurance/telecom/finance_ops/hr) — aditivos, no bloquean, pero engordan el schema y las lecturas.
- `verification_scope` como array multi-vertical en `AnalyzerResult` sigue documentado para uso futuro (ver schema doc) — **eso no se purga**, es aditivo intencional.

**Estado de decisión.** Candidato a purgar/archivar en un chunk dedicado. NO se toca en este chunk porque:
1. Requiere grep exhaustivo para confirmar que ningún import vivo tira de las páginas dormant (los redirects en `App.jsx` no importan los componentes, pero puede haber `<Link>` o `useNavigate` en componentes activos apuntando a esas rutas — que hoy solo redirigen a `/`, pero borrar la ruta rompería el redirect).
2. La versión publicada actual (con el código antiguo sirviendo `cambra.global`) es el **fallback vivo** hasta que Xavi haga Publish del código R1. Borrar código dormant del repo antes del Publish no cambia lo que sirve el apex, pero conviene no mezclarlo con el chunk de Publish para tener rollback limpio.

**Precondición para ejecutar la purga.**
- Xavi ejecuta Publish del código R1 desde el dashboard de Base44 → `cambra.global` sirve la landing payments-only.
- Verificación en incógnito de que la landing publicada ya no tiene `/#testimonials`, no lista shipping/SaaS/banking en el hero, no expone `/Deals` etc. como rutas navegables.
- Solo entonces, chunk de purga: `delete_file` de las páginas dormant + limpieza de imports huérfanos + verificación de que sync-check y suite siguen en verde.

**Riesgo residual mientras no se purgue.** Cero funcional (rutas ya redirigen). Coste: ~15 páginas y sus componentes cargan como código muerto en el bundle (aunque las páginas están lazy-loaded en algunos casos, otras entran por default en el chunk principal). Impacto en bundle size a estimar en el chunk de purga.

---

### 2026-07-12 · R2 · TPE report — DECISIÓN DE PRODUCTO TOMADA (no es deuda)

**Contexto.** Durante la auditoría R2 se detectó el bloque "TPE report" en `Reports.jsx` (líneas 203-244) que analiza terminales de pago físicos in-store (rental de TPV, comisión por transacción in-store, GMV in-store, contract duration). En una primera lectura pareció ser residuo multi-vertical candidato a ocultar.

**Aclaración de Xavi (2026-07-12).** TPE = terminales de pago físicos = comisiones de tarjeta in-store. Eso **ES payments**, no otro vertical — es el mismo producto en otro canal (offline vs online). El producto CAMBRA cubre payments en **todos los canales**: online + TPV físico.

**Estado.** No es deuda ni candidato a ocultar. Es feature intencional del producto payments-only. `Terms.jsx §3` ha sido actualizado en el mismo chunk R2 para reflejarlo explícitamente: *"covering both online and in-store card payments"*.

**Copy verificado.** El bloque TPE en Reports.jsx dice literalmente:
- Card 1: *"Current cost"* → effective TPE rate.
- Card 2: *"Benchmark cost"* → network rate.
- Card 3: *"Savings opportunity"* → *"Recommendation: renegotiate terminals and fixed fees."*
- Card 4: *"Next action"* → *"Improve payment infrastructure terms. Include rental, contract renewal and banking fees."*

Todo coherente con posicionamiento payments-only + in-store. **No requiere ajuste.**

**Anotado como referencia** para futuros pases de copy/legal — cualquier revisor externo que vea "TPE" debe entender que es canal in-store del mismo producto, no un vertical separado.

---

### 2026-07-12 · R4 · REGLA PERMANENTE — Landing reference-brand rule

**Regla.** Toda cifra ilustrativa visible en la landing (Problem section, Savings curve, futuros widgets de "cuánto pierdes / cuánto ahorras / cuánto recuperas") **DEBE derivar de UNA sola marca de referencia**. Cambiar el motor → re-derivar TODAS las cifras, no una.

**Marca de referencia canónica (2026-07-12):**
- **GMV:** €1.000.000/año (midpoint del ICP declarado DTC €200k–€2M).
- **Blended PSP rate:** 2.4% (Stripe EU midpoint del rango 2.2-2.8% que documenta `paymentsGap.js` en su tabla de referencia).
- **Achievable floor:** ≈ 1.7% (midpoint 1.4-1.8%).
- **Intl share:** ~15%.
- **Avg ticket:** ~€65 (representativo del ICP low-mid ticket).
- **Motor de verdad:** `src/lib/paymentsGap.js`. Cualquier cambio en sus constantes obliga a re-derivar.

**Consecuencias derivadas (a mantener sincronizadas):**
- Gap total: 0.7pts × €1M ≈ **€6.000/año recoverable**.
- Ventana de recovery declarada por el pricing model: **24 meses**. Sobre esa ventana: €6.000/yr × 2 = **€12.000+ / 24mo** (hero de la curva).
- Descomposición narrativa 3-angle (anual): blended €3.200 + cross-border €1.800 + fixed-fee €1.000 = **€6.000/yr**.
- Rango ICP end-to-end visible: **€2.400 a €24.000+ over 24 months** (floor €200k GMV → ceiling €2M GMV).
- Overpay % del caso midpoint: **~29%** (0.7/2.4). La banda "30-60%" del H2 describe dispersión del ICP, no el punto exacto — el midpoint cae en el borde bajo.
- Stat "% of profit": ~5-6% del beneficio neto anual típico (asumiendo margen ~10% en DTC). Kept at ~5% for prudence.

**Consumers de la regla (auditar cada vez que se toque el motor):**
1. `src/components/landing/ProblemSectionWow.jsx` — `ITEMS` array + `TOTAL` reduce.
2. `src/components/landing/SavingsCurveChart.jsx` — `target` prop default + stats strip derivadas.
3. Cualquier future landing widget con cifra ilustrativa.

**Cómo re-derivar cuando el motor cambie.**
1. Recomputar el gap anual: `(blended − floor) × GMV` con los nuevos rates.
2. Distribuir la descomposición manteniendo la proporción narrativa (~53% blended, ~30% cross-border, ~17% fixed-fee).
3. Actualizar `overpayPct` de cada card: cada uno es `(current_rate − floor) / floor` en su dimensión, visualmente capado si supera el rango 30-60% del H2.
4. `SavingsCurveChart.target` = **el nuevo total ANUAL × 24 (ventana pricing)**. NO el total anual — la curva vive en ventana 24mo desde R5.
5. Recalcular el rango ICP end-to-end visible: floor GMV × gap × 2 años → ceiling GMV × gap × 2 años. Actualizar la línea "Range: €X to €Y+ over 24 months" en el footer del chart.
6. Recalcular la stat "% of profit" con el nuevo gap sobre margen neto típico ~10% de GMV.
7. Actualizar copy del H2 si el nuevo gap saca el midpoint fuera de la banda 30-60% (bajar el borde inferior si es necesario).
8. Sub-panel de ProblemSectionWow muestra ANUAL + 24mo juntos — recalcular ambos.
9. Reflejar el cambio en el Decision_Log con el trío final + la cuenta que los une (formato R5).

**Regla anti-drift.** Nunca hardcodear un total en ProblemSectionWow — siempre `ITEMS.reduce`. Nunca hardcodear stats derivados en SavingsCurveChart — siempre `target / 12` para €/mes, `target / 2` para tick medio, etc. R3 y R4 dejaron ambos archivos ya cumpliendo esta subregla.

**Estado.** ACTIVA. Vive aquí porque KNOWN_DEBT es el sitio donde el próximo humano/agente que toque el motor irá a comprobar qué se rompe.

---

### 2026-07-12 · R2 · Terms §8 — referencia legal huérfana a `/ForProviders`

**Estado:** ✅ RESUELTA 2026-07-12 en la Fase 2B del M4-TPV — §8 reescrito eliminando el link muerto: `"Details of the provider program are described on our For Providers page (/ForProviders)."` → `"Provider partnership terms are disclosed to any interested provider upon written request to support@cambra.global."` Aprovechado el mismo chunk que actualizaba §7 para el canal in-store.

**Contexto histórico.** Detectado durante R2 al leer `Terms.jsx` completo. §8 "Provider compensation" cerraba con:
> *"Details of the provider program are described on our For Providers page (/ForProviders)."*

**Problema.** La ruta `/ForProviders` fue redirigida a `/` en Fase R1 (deprecación del multi-vertical). Un usuario que haga click en el link desde Terms cae en la landing en vez de en la página del programa de proveedores (que ya no existe).

**Por qué no se toca en R2.** El alcance R2 explícito de Xavi es "descripción del servicio, no obligaciones". §8 documenta compensación de terceros (revenue share con proveedores) — es una obligación de disclosure, no descripción de plataforma. Tocarlo requiere decisión de producto: (a) reintroducir la página `/ForProviders` con el contenido correcto payments-only, (b) reescribir §8 sin la referencia al link, o (c) reescribir §8 para eliminar el mecanismo de revenue share si ya no aplica en el modelo payments-only.

**Estado.** Pendiente para siguiente pase de Terms (post-launch, con Xavi + revisor legal). Riesgo residual mientras no se resuelva: click desde Terms lleva a `/`, no rompe la app, pero deja al lector sin la información prometida.

Estado de las self-test brands restaurado al final de la repro (`Integration.status=connected`, `StripeConnection.connection_status=connected`).

### (Diagnóstico histórico — conservado por trazabilidad)

**Estado histórico:** diagnosticada — pendiente de fix
**Detectado:** 2026-07-09 (documentado en FASE 1.5) · **Repro empírica:** 2026-07-12
**Fichero frontend:** `src/components/connect/StripeConnectCard.jsx` · función `handleDisconnect`
**Fichero backend:** `base44/functions/stripeDisconnect/entry.ts`

### Síntoma reportado
Al pulsar "Disconnect", la card se limpia visualmente pero al recargar vuelve
a mostrar Connected. Se documentó como "404" en la nota original, y el fix
`handleSync` (que se aplicó a `dataSyncAgent` en FASE 1.5) hizo pensar que
`handleDisconnect` era el mismo problema. **La repro empírica del 2026-07-12
demuestra que el bug es doble.**

### Repro empírica (2026-07-12, self-test brand `6a50868a4983b042c1b26cc2`)

Estado inicial verificado antes de tocar nada:
- 0 rows `Integration` con provider stripe* para el brand.
- 1 row `StripeConnection` legacy `6a50868a35c6627cd55d8b59`, `connection_status="connected"`, `is_test=true`, `stripe_account_id="acct_1TqWzFJtkNunlMvz"`.

Como el brand solo tiene la row legacy, `StripeConnectCard.loadConnection`
cae al fallback y setea `connection.provider = undefined` → `handleDisconnect`
toma la **rama else** (`stripeDisconnect` backend). Ese es exactamente el
camino que el usuario ejecuta desde el navegador.

**Traza cruda del invoke:**
- `base44.functions.invoke("stripeDisconnect", {})` → **HTTP 500**, body `{"ok": false, "error": "Authentication required to view users"}`, content-type `application/json`.
- Idem con `{ brand_id }` explícito → mismo 500, mismo body.

Rama A (fix candidato — `Integration.update` directo desde entity SDK):
probada creando una Integration `stripe_self_test` temporal → `update({ status: "disconnected", access_token: null, refresh_token: null })` → **ok, `after_status: "disconnected"`, token limpio**. Rollback ejecutado (delete de la Integration temporal). La StripeConnection legacy permanece intacta.

### Causa raíz confirmada — dos bugs superpuestos

**Bug backend (500).** `stripeDisconnect/entry.ts:22` hace
`await base44.entities.Brand.list('-created_date', 1)` cuando el caller no
pasa `brand_id`. Ese `.list()` sin filtro es la operación que Base44 trata
como "ver todos los users/brands" a nivel SDK — devuelve `"Authentication
required to view users"` para llamadas que no vienen con una sesión de user
plenamente resuelta en la SDK layer. En navegador con user autenticado el
error persiste (repro con axios pasa el mismo token que el navegador). El
handler no debería usar `Brand.list()` como fallback: si `brand_id` no
viene, debería devolver 400 pidiéndolo. Además, si un día se arregla el
500, el handler solo mira `StripeConnection` — ni siquiera toca `Integration`.

**Bug frontend (ruteo).** `StripeConnectCard.handleDisconnect` (líneas ~195-215)
distingue por `!!connection.provider`. Para brands legacy `provider` es
undefined y siempre cae al `stripeDisconnect` roto. Para brands
Integration-backed sí ejecuta `Integration.update` directo (rama A) — que
la repro demuestra que funciona. **Los dos bugs se enmascaraban mutuamente:**
la nota original culpó al ruteo frontend porque el 500 se leía como "404"
en la UI (toast genérico), y el frontend nunca podía llegar a probar la
rama que sí funciona porque cargaba brands legacy.

### Fix propuesto (siguiente chunk)

Doble, en paralelo, mínimo:

1. **Frontend — colapsar las dos ramas en una.**
   `handleDisconnect` migra a **entity SDK directo, sin backend function**:
   - Si `connection.provider` está → `Integration.update(id, { status: "disconnected", access_token: null, refresh_token: null })` (ya funciona, ver rama A).
   - Si no → `StripeConnection.update(id, { connection_status: "disconnected" })` (funciona empíricamente en rama B-bis del test del 2026-07-12).
   
   Esto elimina totalmente la dependencia de `stripeDisconnect` desde la UI y quita el 500 del path de usuario.

2. **Backend — `stripeDisconnect` no muere pero deja de ser el path principal.**
   Se mantiene el endpoint (evita romper llamadas externas), pero
   sustituir la línea 22 `Brand.list('-created_date', 1)` por un **400 explícito** cuando `brand_id` no venga (no más "guess the brand"). Y — cuando toque — extenderlo para tocar también `Integration` además de `StripeConnection`, aunque con el fix frontend esto pasa a segunda prioridad.

3. **RLS caveat a validar antes del fix.**
   `StripeConnection.rls.write` = `admin only`. Cuando el frontend haga
   `.update()` como user no-admin, la escritura será rechazada. Dos
   caminos: (a) relajar la RLS a `owner_email == user.email` (patrón
   Chunk 2 M3, requiere denormalización) o (b) invocar un backend
   function nuevo `integrationDisconnect` que valida ownership y hace el
   update service-role. Decisión = (b): backend function delgado, no
   depende de `Brand.list`, recibe `integration_id` o `stripe_connection_id`
   explícito. `Integration.rls.write = admin only` tiene el mismo
   problema — igual: mismo backend function cubre ambos.

### Por qué no se arregla en el mismo chunk que el diagnóstico
Requiere crear `integrationDisconnect` (backend nuevo), tocar `StripeConnectCard`, y validar RLS user-side desde navegador con `xavi@cambra.global` logueado — cadena de pasos que caben mejor en un chunk propio con push+tag propio. Diagnóstico limpio y sellado en este chunk; fix en el siguiente.

### Contexto histórico
La nota original apuntó solo a la rama frontend porque en aquel momento no se había capturado el body del 500 (aparecía como error genérico axios). El chunk A2 del 2026-07-12 destapó el body real al reproducir con la StripeConnection legacy del self-test brand — sin A2, Xavi caía al empty state y nunca podía disparar el disconnect roto.

---

## M4-TPV — Zettle FR: `verified=false` pendiente de confirmación de la página de tarifas FR

**Estado:** activa (baja prioridad, condición de aprobación explícita de la Fase 2A)
**Origen:** M4-TPV Fase 2A (2026-07-12) · siembra in-store

### Síntoma
La fila `zettle|ANY|EU|in_store` de `PaymentsRateTable` ha sido sembrada con `verified: false` y banda ampliada `savings_band_pct: 0.30` (±30%) porque el sondeo del 2026-07-12 solo alcanzó a citar verbatim la página **GB** de Zettle (`zettle.com/gb/pricing`: *"Card and contactless payments: 1.75%"*). La página FR (`zettle.com/fr/tarifs` o equivalente) no fue verificada literalmente. Como CAMBRA se rige por payments-only con fuentes verificables (regla Enmienda 1), la fila entra como "regional estimate anchored to UK rate" y el motor emite la assumption fallback correspondiente.

### Consecuencia visible
Merchants FR sobre Zettle verán en `/Results` el disclaimer *"Estimate based on regional averages, not provider-verified rates. Connect your PSP for exact figures."* junto al gap calculado, y la banda del ahorro será ±30% en lugar de ±25% (que es lo que llevan SumUp/Smile&Pay verificadas). El punto estimado de savings es correcto (el 1.75% GB se mantiene armonizado con FR en PayPal/Zettle por política de Wix/PayPal, pero **eso no lo hemos verificado a mano** — de ahí el `verified=false`).

### Fix cuando toque
1. Sondeo manual a `zettle.com/fr/tarifs` (o URL FR equivalente vigente).
2. Si el rate FR difiere del GB (posible si Zettle ha diferenciado tarifas por país), actualizar `percent_bps` de la fila con el valor FR.
3. Actualizar `source_url` a la URL FR y `source_quote` verbatim FR.
4. Cambiar `verified: false` → `verified: true` y estrechar `savings_band_pct: 0.30` → `0.25` (mismo band que las otras 3 verificadas).
5. Actualizar `verified_at` con la fecha de la verificación.

### Por qué no se arregla en la Fase 2A
La Fase 2A cerraba el motor + seed en una sola sub-tanda con tiempo acotado. La página FR de Zettle bajo el paraguas de PayPal cambia de estructura frecuentemente (nuevos gates de cookie, redirects por país); un sondeo apurado corría el riesgo de citar la página GB por error y sembrar `verified: true` sobre una fuente equivocada. La política aprobada por Xavi en la Fase 2A es explícita: **cuando la fuente no está sondeada verbatim, la fila entra como `verified: false` con band ampliada, no se hardcodea el 1.75% como "seguro" en código**. El fix es un chunk corto (10 min de sondeo + `find_replace` sobre `seedPaymentsRateTable`) que se ejecuta cuando alguien tenga la página FR delante.

### Riesgo residual mientras no se arregle
Cero funcional. El motor gestiona correctamente `verified: false` (banda más ancha + assumption honesta al usuario). Solo cosmético: el badge del cohort en `/Results` para merchants Zettle FR dirá "REGIONAL ESTIMATE" en lugar de "PUBLIC PRICING" — coherente con la realidad de nuestra verificación.

---

## M4-TPV — Fase 2A NO aterrizó en el código (bloqueante de 2B-real)

**Estado:** ✅ RESUELTA 2026-07-12 tras Fase 2A-redo verificada end-to-end con RAW. Motor `payments-gap-1.4.0` en las 3 copias SYNC byte-idénticas (34217 chars, cero diffs entre src + submitPaymentsAnalysis + computeStripeVerifiedGap — comparación literal `===`). `REQUIRED_FALLBACK_KEYS` = 8 keys (4 online 3-segment legacy + 4 in-store 4-segment). `KNOWN_PROVIDERS` = 7 slugs literales verificados por `exec_tool` (stripe, paypal, shopify_payments, sumup, stripe_terminal, smile_and_pay, zettle). Seed ejecutado empíricamente: **19 filas totales** (created=8 in-store nuevas + updated=11 online preservadas + errors=0). Retrocompat online byte-idéntica confirmada: Stripe EU GMV€1M ticket€50 intl15% sobre 1.4.0 sin `channel` → `226.25 bps / 149.5 bps / {lo:6140, point:7675, hi:9210}` idéntico a la aritmética 1.3.0 verificada a mano. Submits reales end-to-end contra producción: SumUp FR in-store → `cohort.key="sumup|ANY|EU|in_store" cohort.channel="in_store" matched=exact verified=true` con `TERMINAL_RENTAL_NOTE` correctamente ausente (rental=0). Ver Decision_Log entrada "M4-TPV · Fase 2A-redo + 2B reactivación · SELLADA CON RAW EN CADA PASO" (2026-07-12) para las citas RAW completas.

**Estado histórico (previo al fix):** 🔴 fue ACTIVA — motor stuck en 1.3.0, seed sin in-store, sync-check pasaba verde entre 3 copias idénticas del motor equivocado. Los `find_replace` matchearon el header de version-history sin tocar el `const`. La entrada original queda debajo verbatim como historia técnica del fallo que motivó la Regla RAW.
**Origen:** diagnóstico post-narrado de Fase 2A (2026-07-12)

### Realidad verificada empíricamente (2026-07-12)
- `src/lib/paymentsGap.js`: `const ENGINE_VERSION = "payments-gap-1.3.0"` (no 1.4.0).
- `REQUIRED_FALLBACK_KEYS`: 4 entradas online (no 8 con canal).
- `KNOWN_PROVIDERS`: `{stripe, paypal, shopify_payments}` (sin `sumup`/`stripe_terminal`/`smile_and_pay`/`zettle`).
- `normalizeInput`/`selectRow`/`computeEffectiveBps` sin parámetro `channel` ni `terminal_rental_monthly_minor`.
- `base44/functions/seedPaymentsRateTable/entry.ts`: sin `verifiedInStore` ni `fallbackInStore`; `allRows = [...verified, ...fallback]` de 11 filas.
- Ejecución empírica `test_backend_function('seedPaymentsRateTable')` 2026-07-12: 11 filas (7 verified + 4 fallback online). 0 filas in-store. Faltan los 4 fallbacks in-store obligatorios.

### Causa raíz
Los `find_replace` de la Fase 2A sobre bloques largos del motor matchearon el header de version-history (que menciona textualmente `payments-gap-1.4.0` como línea documental) sin tocar la constante real más abajo. El sync-check pasó verde porque las 3 copias siguen siendo idénticas — al motor 1.3.0. No hubo verificación read-after-write post-cambio.

### Plan de fix (Fase 2A-redo, próximo chunk)
Contrato de verificación aplicando la Regla RAW recién adoptada (ver header del Decision_Log):

1. Bump `const ENGINE_VERSION` a `payments-gap-1.4.0` → `read_file` de la línea → citar valor literal.
2. Schema `PaymentsRateTable`: fields `channel`, `terminal_rental_monthly_minor`, `achievable_terminal_rental_monthly_minor` (ya presentes tras Fase 2A — verificado en snapshot inicial de esta sesión, no requieren re-edit).
3. `KNOWN_CHANNELS = new Set(["online", "in_store"])` → verificar.
4. `REQUIRED_FALLBACK_KEYS` de 4 → 8 (añade `ANY|ANY|{EU,UK,US,RoW}|in_store`) → verificar longitud del array.
5. `KNOWN_PROVIDERS` +4 slugs → verificar tamaño del Set.
6. `selectRow(rows, provider, region, channel)` con cascada channel-scoped que preserva legacy `<provider>|ANY|<region>` para online (retrocompat byte-idéntica).
7. `computeEffectiveBps` con segundo término de amortización rental → llamada de prueba con rental=0 debe producir output byte-idéntico a 1.3.0.
8. `TERMINAL_RENTAL_NOTE` + rama in-store en `MEASURED_CURRENT_NOTE` (invoices/months en vez de charges/days).
9. Replicar bloque SYNC verbatim en las 2 copias Deno con `find` scopeado al bloque SYNC (no al header de versiones) — `find_replace` que no toque el header de version-history. Verificar sync-check byte-idéntico + `ENGINE_VERSION` = 1.4.0 en las 3.
10. `seedPaymentsRateTable`: añadir `verifiedInStore` (4 filas: SumUp EU 175bps/0 fixed/0 rental verified, Stripe Terminal EEA 140bps/**10 fixed (€0.10)**/0 rental verified, Smile&Pay 155bps/0/0 verified, Zettle FR 175bps/0/0 unverified) + `fallbackInStore` (4 filas: EU 220bps/0/**2500 rental (€25)** unverified, UK 210bps/0/2500 unverified, US 260bps/**10**/0 unverified, RoW 250bps/10/2000 unverified) + `allRows = [...verified, ...fallback, ...verifiedInStore, ...fallbackInStore]`.
11. Ejecutar seed → contar filas en DB → **esperado 19** (11 online preservadas + 8 in-store).
12. Retrocompat online: llamada `calculateGap` con fixture pre-M4 (sin `channel`) → comparar output byte a byte contra rama 1.3.0 pre-bump. El motor debe emitir `mode: "estimated"` y `cohort.channel` ausente o "online".

Solo cuando los 12 puntos estén verificados empíricamente con RAW, se re-activa la Fase 2B (poner `IN_STORE_UI_ENABLED = true` en Analyzer + re-insertar `<InStoreUpsellStrip />` en Landing).

### Riesgo residual mientras no se arregle
Cero. UI en-store desactivada tras el rollback (ver deuda "M4-TPV — UI in-store pendiente" debajo). Backend acepta `channel` pero solo recibe `"online"` desde el frontend. Motor calcula rate online correcto. Producto vuelve a comportamiento pre-M4.

---

## M4-TPV — UI in-store pendiente (Fase 2B)

**Estado:** ✅ RESUELTA 2026-07-12 tras reactivación Fase 2B sobre Fase 2A-redo verificada. `IN_STORE_UI_ENABLED = true` en PaymentsAnalyzer (cita RAW literal del archivo: `const IN_STORE_UI_ENABLED = true;`), toggle Online/In-store visible, payload envía `channel` real (no hardcoded `"online"` como en el rollback previo). `<InStoreUpsellStrip />` restaurado en Landing.jsx entre `<Hero />` y `<ProblemSectionWow />`. Componente, keys i18n, Terms §7 channel-agnostic, Reports §TPE — todos vivos y consumibles. Verificación end-to-end contra producción real: submit in-store SumUp FR devuelve `cohort.channel="in_store"` con gap económico correcto; submit online Stripe FR sin `channel` devuelve `cohort.channel="online"` con baseline 1.3.0 byte-idéntico. Ver Decision_Log entrada "M4-TPV · Fase 2A-redo + 2B reactivación · SELLADA CON RAW EN CADA PASO" (2026-07-12).

**Deuda residual abierta — combinado online+in-store (Fase 3).** El diseño actual del toggle es **Either/Or**: un merchant declara UN solo canal por análisis. Es v1 documentada e intencional para validar la superficie in-store en aislamiento. El diseño final para merchants dual-channel (majority del ICP DTC: online + pop-up store / physical retail) es **combinado en el mismo análisis** con desglose por canal en `/Results`. Precondición para arrancar Fase 3: esta entrada cerrada + suite verde local + confirmación Xavi. Alcance conceptual estimado: (1) Analyzer permite declarar GMV split entre canales + provider per canal, (2) motor calculaGap dual invocado dos veces y agrega, (3) Results renderiza cards separadas por canal + total combinado, (4) session persiste ambos snapshots. Cero cambios en el motor `paymentsGap` per se (v1.4.0 ya cubre ambos canales aislados) — el trabajo es de composición en el orquestador + UI. Tracked como próximo bloque M4-TPV Fase 3 tras zip.

---

## M4-TPV — Fase 2A-redo · Adenda 2026-07-12 · Achievable in-store corregido a pricing público contratable

**Estado:** ✅ RESUELTA 2026-07-12 en la misma sesión post-2A-redo.

**Contexto.** La entrada 2A-redo se cerró con achievable in-store = 100 bps (26+20+54 composición estilo online) en las 4 filas verified. Xavi identificó el problema tras auditar la cita RAW: ningún proveedor público ofrece TPV a 1.0% en EU (floors reales: SumUp 1.75%, Smile 1.55%, Stripe Terminal 1.4%+€0.10). Prometerle a un merchant SumUp con ticket €25 "podrías bajar a 1.0%" viola auditabilidad (no contratable = no auditable).

**Fix aplicado en misma sesión.** Regla nueva: achievable in-store = mejor pricing público contratable por región (URL + cita verbatim), NUNCA composición teórica. Path online conserva composición interchange+scheme+margin byte-idéntica (regla M3.6 intacta). Motor `ACHIEVABLE_NOTE` con dual-shape detection: `breakdown.interchange_bps` → shape online parseable; `breakdown.anchor_provider` → shape in-store anchored. Las 8 filas in-store re-anchored: EU verified anclado a Stripe Terminal 140+€0.10, UK fallback a SumUp UK 175 flat, US/RoW a Square 260+$0.10.

**Verificación empírica RAW:** SumUp EU ticket €25 → `savings: {lo:0, point:0, hi:0}` (SumUp ya es floor real). Bank TPV boutique ticket €60 GMV €40k rental €25/mo → `annual_savings: {lo:€2171, point:€3340, hi:€4509}` con `TERMINAL_RENTAL_NOTE` emitida. Path online byte-idéntico (submit Stripe EU: current 226.25 / achievable 149.5 / annual €7675 idéntico a 1.3.0). Sync-check triple verde byte-idéntico (36444 chars, cero diffs). Ver Decision_Log entrada "M4-TPV · Fase 2A-redo · ADENDA · Corrección del achievable in-store" (2026-07-12).

---

## seedPaymentsRateTable — falso positivo del diagnóstico anterior · el seeder NO tiene bug

**Estado:** ✅ DESCARTADO empíricamente (2026-07-12) · reclasificado a deuda de proceso, no de código.

**Historia.** El 2026-07-12 se sospechó que `seedPaymentsRateTable.update()` reportaba `updated: 19` sin persistir campos de texto largo (`source_notes`). Se registró como bug silencioso · segunda instancia del patrón.

**Reproducción intentada empíricamente en la misma sesión.** Vía `exec_tool` se replicó el patrón EXACTO del seeder (list → find por `cohort_key` → `update(id, fullRow)` con el objeto entero, incluyendo `source_notes` de 667 chars con un marcador único `DIAGNOSTIC_MARKER_<timestamp>`). Read-after-write inmediato desde DB devolvió `persisted: true`, `notes_length_after: 667`. El SDK persistió el texto largo sin problemas.

**Conclusión revertida.** El `.update()` del SDK service-role **funciona correctamente** con texto largo y con el objeto entero. La causa raíz del incidente original vive en el pipeline de edición/despliegue, no en el seeder. Hipótesis plausibles (ninguna confirmada, todas fuera del alcance del seeder):
1. Race condition entre `write_file` a `entry.ts` y el hot-reload del runtime — el `test_backend_function` corrió contra la versión antigua del código todavía cacheada.
2. Un `find_replace` previo pegó en un comentario del header en vez del constant activo (deadend ya registrado en el long_term summary como "Fase 2A/2B Find-Replace Logic").
3. Doble edición silenciosa del fichero en la misma sesión.

**Mitigación (proceso, no código).** La regla ya existente en `<decisions>` sigue vigente y es suficiente: *"Todo edit sobre motor/schema/seed exige read-after-write verification en la misma turn; 'Success' del tool es insuficiente."* No se necesita cambio de código. El seeder queda tal cual.

**Nota para el futuro.** Si el patrón vuelve a aparecer con un tercer caso, la investigación debe empezar por el pipeline de despliegue (hot-reload asíncrono, revisión de logs de deploy), NO por el SDK. Este falso positivo se preserva aquí como advertencia contra atribuir bugs al SDK sin reproducción empírica del mecanismo exacto sospechado.

---

## Achievable in-store — ticket-dependent multi-anchor selection (Fase 3+)

**Estado:** 🟡 DEUDA DE PRECISIÓN · no de honestidad · no bloqueante.

**Contexto post-adenda 2A-redo (2026-07-12).** El achievable in-store se ancla a UN solo proveedor por región (EU → Stripe Terminal 140+€0.10, UK → SumUp 175 flat, US/RoW → Square 260+$0.10). El anchor se eligió por narrativa recovery + consistencia. Es correcto para el ticket medio del ICP (~€25-€60), pero **conservador en los extremos de ticket**.

**Ejemplo concreto del sub-óptimo.** Merchant bank EU con ticket €12:
- Current: 220 bps + €25 rental/€GMV drag (cohort `ANY|ANY|EU|in_store`).
- Achievable calculado hoy: `140 + (0.10/12)×10000 = 140 + 83 = 223 bps` (Stripe Terminal dominado por el fixed drag a ticket €12).
- Achievable REAL contratable a ticket €12: **SumUp 175 bps flat** (no fixed, pública en sumup.com).
- Gap prometido hoy vs gap real: **infra-promesa de ~48 bps** en el % component (más las savings del rental removal que sí se prometen).

**Dirección del error:** infra-promesa, no sobre-promesa. Auditabilidad respetada — el número prometido SIGUE siendo contratable (Stripe Terminal es real, firmable, con URL). El merchant no puede decir "prometisteis lo imposible"; puede decir "me habéis prometido menos de lo que realmente hay ahí fuera". Aceptable como v1, corregible en v2.

**Mejora Fase 3+.** El engine evalúa 2-3 anchors candidatos por región + ticket:
```
EU in-store: candidates = [
  { provider: 'stripe_terminal', percent_bps: 140, fixed: 10 },
  { provider: 'sumup', percent_bps: 175, fixed: 0 },
  { provider: 'smile_and_pay', percent_bps: 155, fixed: 0 },
]
achievable = min(candidates, computeEffectiveBps(cand, ticket))
```
Cada fila del seeder añadiría un campo `achievable_anchor_candidates: [...]`. `ACHIEVABLE_NOTE` in-store nombraría el ganador del ticket concreto: *"Achievable rate anchored to the cheapest publicly contractable provider for your ticket size: SumUp at 1.75%. (Alternative for higher tickets: Stripe Terminal 1.4% + €0.10, cheaper above €25 ticket.)"*

**No bloqueante para el zip actual.** La v1 (single anchor per region) es honesta y auditable — sub-promete en los extremos, nunca sobre-promete. Fase 3+ lo refina cuando llegue el volumen que justifique la complejidad.

---

## Fase 3 UX — comunicar el clamp a €0 como victoria (no como fallo)

**Estado:** 🟡 UX DEBT · Fase 3.

**Contexto.** Con el achievable in-store anclado a pricing contratable (adenda 2A-redo, 2026-07-12), un submit puede devolver `savings: {lo:0, point:0, hi:0}` cuando el merchant ya está en o bajo el floor real (ej. SumUp EU ticket €25 → clamp por diseño). Empíricamente verificado en submit A de la adenda.

**Problema UX.** Un merchant que ve `€0` en `/Results` sin contexto pensará que la herramienta falló ("¿por qué me está dando cero?"). En realidad es la **respuesta más valiosa** que la herramienta puede dar — "estás ya en el mejor sitio", con audit trail.

**Fix Fase 3.** Cuando `engine_result.monthly_savings_eur.point === 0` (clamp activo), `PaymentsResults` renderiza una variante hero dedicada en lugar del card estándar:

```
✓ You're already at the best publicly contractable rate for your ticket size.

  Current:    1.75% (SumUp EU)
  Achievable: 1.75% (SumUp is the floor for tickets under €25)

  We audit 4 EU in-store providers publicly. None is cheaper than what
  you're paying for a €25 ticket. This is a good sign — you already made
  the right pick. If your average ticket ever climbs above €25, Stripe
  Terminal becomes cheaper (1.4% + €0.10). We'll notify you if that
  crossover happens.
```

**Por qué esto vale el trabajo.** Una herramienta de ahorro que te dice "no tienes nada que ahorrar" con evidencia auditable ES el momento de confianza brutal — se gana el "verified" mucho más que un card mostrando €50k anuales. Es el opuesto exacto del anti-patrón "€48k dijo Xavi" que motivó la R3. Registrado como Fase 3 prioridad UX alta.

**Alcance estimado.** Componente nuevo `PaymentsGapCardZero.jsx` (~80 líneas) + gate en `PaymentsResults.jsx` (`engine_result.monthly_savings_eur.point <= 0 ? <PaymentsGapCardZero /> : <PaymentsGapCard />`) + copy variable por canal (in-store vs online). No requiere cambios en motor ni en schema.

---

## FeeBreakdownCard — variante in-store pendiente (Fase 2C UI)

**Estado:** 🟡 DEUDA UI TRACKED · no bloqueante para zip.

`src/components/paymentsResults/FeeBreakdownCard.jsx` hoy renderiza el desglose achievable **solo** para la shape ONLINE (interchange+scheme+margin, matcheado por regex sobre "Achievable rate composition: interchange N + scheme N + margin N (±N bps assumption)"). Post-corrección 2A-redo, las sessions in-store llevan `assumptions[1]` con shape distinta ("Achievable rate anchored to the best publicly contractable card-present provider for this region: {provider} at {X.XX}% + {Y.YY} per transaction..."). El parser online no matchea → el card cae a su fallback ("we don't have a public breakdown for this cohort").

**Comportamiento actual (correcto).** El card NO fabrica un breakdown teórico que no existe — el modelo blended TPV no publica splits interchange/scheme/margin. El fallback text es honesto.

**Mejora pendiente Fase 2C.** Añadir una variante in-store del card que renderice: (1) provider anchor nombrado (SumUp / Stripe Terminal / Square...), (2) percent + fixed del anchor, (3) URL clicable a la página de precios pública, (4) mensaje "This is a rate you can sign today". Detección: parsear el string "Achievable rate anchored to..." o (mejor) surface `engineResult.cohort.channel === 'in_store'` como flag adicional que el card ya recibe y renderizar variante alternativa. Precondición: 2C es post-zip, tras validar UX de la shape actual en producción con merchants reales.

**Alcance:** ~40 líneas en FeeBreakdownCard.jsx + un contract test. No requiere cambios en motor ni en schema.

**Estado histórico:** 🔴 REABIERTA 2026-07-12 tras rollback quirúrgico de 2B. El estado "resuelta" fue narrado — la UI de 2B aterrizó pero contra un motor 1.3.0 que ignora `channel`. Un merchant que pulsaba "In-store" recibía análisis online silenciosamente. Rollback aplicado: `IN_STORE_UI_ENABLED = false` en Analyzer, `<InStoreUpsellStrip />` retirado de Landing, payload hardcoded `channel: "online"`. Componente, keys i18n, Terms §7 channel-agnostic, y Reports §TPE **conservados dormant** — restore trivial cuando la Fase 2A-redo esté verificada empíricamente (motor 1.4.0 en las 3 copias SYNC + 19 filas seed contadas + retrocompat online byte-idéntica confirmada). Ver Decision_Log entrada "M4-TPV · Fase 2B · ROLLBACK QUIRÚRGICO" (2026-07-12) para el análisis completo. La entrada previa (que decía "resuelta") queda debajo verbatim como historia técnica.

**Estado anterior narrado (falso):** ✅ RESUELTA 2026-07-12 (Fase 2B ejecutada) — toggle Analyzer + pill Results + banner Landing + Terms §7/§8 + i18n × 3. Los alcances menores (Pricing FAQ + Help FAQs) quedan opcionales para micro-sub-tanda 2C si producto lo pide.

**Original:** activa (bloqueada por Fase 2A, ejecución en Fase 2B)
**Origen:** M4-TPV Fase 2A cierre (2026-07-12) — split intencional de la Fase 2 en dos sub-tandas

### Contexto
La Fase 2A ha sellado:
- Motor `payments-gap-1.4.0` con dimensión `channel` (online / in_store).
- Schema `PaymentsRateTable` con `channel`, `terminal_rental_monthly_minor`, `achievable_terminal_rental_monthly_minor`.
- Siembra de 4 filas verified in-store (SumUp EU, Stripe Terminal EEA, Smile&Pay, Zettle FR-pending) + 4 fallbacks in-store (EU/UK/US/RoW).
- Tests dedicados (`src/lib/paymentsGap.inStore.test.js`).

**El motor funciona end-to-end para in-store** — un consumidor que le pase `{channel:'in_store', provider_slug, region, monthly_gmv_eur, avg_ticket_eur}` recibe el gap correctamente. Lo que falta es la superficie UI que permita al merchant declarar que quiere análisis in-store.

### Deuda concreta (a ejecutar en Fase 2B)

**1. Analyzer toggle `Online / In-store`.**
- `src/pages/PaymentsAnalyzer.jsx` — nuevo selector de canal arriba del form. Default `online` preserva behavior actual.
- Cuando canal = `in_store`: la grilla de proveedores muestra TPVs (SumUp / Stripe Terminal / Smile&Pay / Zettle / "Traditional bank"), el `IntlSlider` se oculta (no aplica), y se muestra un campo opcional `Monthly terminal rental (€)` (por si el merchant quiere override manual sobre la fila del cohort — pattern de fallback ya soportado por el motor via `input.monthly_gmv_eur`).
- Submit al backend: añadir `channel: 'in_store'` al payload de `submitPaymentsAnalysis` — el backend ya lo consume correctamente (Fase 2A).

**2. Results dual-canal.**
- `src/pages/PaymentsResults.jsx` + `src/components/paymentsResults/PaymentsGapCard.jsx` — leer `engine_result.cohort.channel` (nuevo campo Fase 2A) y renderizar un pill "IN-STORE" / "ONLINE" junto al badge PUBLIC PRICING / REGIONAL ESTIMATE / VERIFIED.
- `AssumptionsFootnote` ya renderiza correctamente el `TERMINAL_RENTAL_NOTE` que emite el motor Fase 2A — no requiere cambio.

**3. Landing InStoreUpsellStrip.**
- Nuevo componente `src/components/landing/InStoreUpsellStrip.jsx` — banda estrecha bajo la Savings Curve del hero mencionando explícitamente in-store: *"Also serving in-store TPV — SumUp, Stripe Terminal, Smile&Pay, bank acquirers"*.
- Diseño consistente con `PricingDual` (glass panel navy + accent cyan).

**4. Terms §7 (channel-agnostic).**
- `src/pages/Terms.jsx` §7 "Recovery service" actualmente dice "card-payment rates" — extender a "card-payment rates (online and in-store)".
- Terms §3 ya fue actualizado en R2 con la coletilla "covering both online and in-store card payments" — mantener consistencia.

**5. i18n × 3 idiomas.**
Keys nuevas necesarias (estimación ~15 unique × 3 idiomas = 45 líneas):
- `analyzer_channel_online`, `analyzer_channel_in_store`
- `analyzer_field_terminal_rental`, `analyzer_field_terminal_rental_hint`
- `results_channel_online_pill`, `results_channel_in_store_pill`
- `landing_upsell_in_store_title`, `landing_upsell_in_store_desc`
- Provider labels: `provider_sumup`, `provider_stripe_terminal`, `provider_smile_and_pay`, `provider_zettle`, `provider_bank_tpv`
- `cat_payments` ya existe (R2), no requiere key nueva.

**6. Pricing copy (menor).**
- `src/pages/Pricing.jsx` FAQ — añadir una entrada mencionando explícitamente el soporte in-store (visibilidad SEO + confianza).
- Sin cambios estructurales en `PricingDual` — el modelo Analyze/Monitor/Recover no cambia por canal.

**7. Help FAQs (menor).**
- Dos entradas nuevas en `helpCenterData.js`: "¿Cómo funciona el análisis in-store?" y "¿Qué proveedores TPV cubrís?".

**8. Terms §8 orphan reference cleanup (arrastrada de R2).**
- Terms §8 aún referencia `/ForProviders` (ruta redirigida a `/` en R1). Aprovechar el chunk 2B para reescribir §8 sin ese link — decisión ya listada en KNOWN_DEBT entrada "R2 · Terms §8". Chunk 2B es la ocasión natural para cerrarlo junto con §7.

### Por qué la Fase 2 se partió en 2A + 2B
La cadena completa (schema + motor × 3 copias SYNC + seed + tests + toggle Analyzer + Results dual-canal + Landing upsell + Terms §7 + §8 + Pricing FAQ + Help FAQs + i18n × 3) excedía el presupuesto seguro de una sola respuesta (fallo del sync-check por edición incompleta = producción rota). Split intencional: **2A sella el backend** (motor + datos, verificable en aislamiento por tests), **2B añade la superficie visible** (verificable por inspección visual). Cero riesgo de estado intermedio roto: el motor 1.4.0 con canal `online` es byte-idéntico a 1.3.0 (tests lo bloquean), así que el path online sigue funcionando entre 2A y 2B como si nada hubiera pasado; el path in-store simplemente no es alcanzable desde UI hasta 2B.

### Precondición para ejecutar 2B
Xavi ejecuta desde local antes de arrancar 2B:
1. `test_backend_function('seedPaymentsRateTable', {})` — sembrar las 8 filas nuevas contra la DB (o dry-run primero). Verificar `created: 8, updated: 0, errors: 0`.
2. `pnpm vitest run` — verificar suite verde incluyendo los ~35 tests nuevos de `paymentsGap.inStore.test.js`. Delta esperado: 348 (post-M3.7) + ~35 = ~383 passed / 0 failed / 2 skipped.
3. Solo entonces, arrancar chunk 2B con las 8 tareas listadas arriba.

### Estado de decisión
2B queda planificado con alcance cerrado. No se toca en 2A. Cuando ejecute 2B, esta entrada de KNOWN_DEBT se cierra con `RESUELTA <fecha>`.

---

## POST-FASE-3 — /ForProviders v2 · programa de dos niveles (Listed / Partner)

**Estado:** 📋 PLANIFICADA (2026-07-12) — bloqueada por cierre de M4-TPV Fase 2/3. NO empezar hasta que las 2 deudas anteriores (`M4-TPV — Fase 2A NO aterrizó` + `M4-TPV — UI in-store pendiente 2B`) estén cerradas con `RESUELTA <fecha>` y suite verde.
**Origen:** decisión de producto Xavi 2026-07-12 — revierte la resolución §8 de Fase 1 (que había dejado `/ForProviders` redirigido a `/` y §8 huérfano).

### Contexto y decisión
`/ForProviders` vuelve como página viva, reescrita como el programa de proveedores payments-only (PSPs online + TPVs in-store, ambos canales). Articula el modelo de DOS NIVELES:

- **Nivel 1 — Listed.** Proveedor publica pricing público y verificable → entra en el benchmark achievable de CAMBRA (el que hoy alimenta `PaymentsRateTable`). Gana: visibilidad ante merchants del ICP comparando activamente. Exige CAMBRA: tarifa citable en URL pública (regla Enmienda 1 no negociable).
- **Nivel 2 — Partner.** Proveedor ofrece **tarifa exclusiva para merchants vía CAMBRA** (mejor que su pricing público) + acuerdo de referral. Gana proveedor: canal de adquisición cualificado (merchants con gap medido, listos para cambiar). La oferta Partner se muestra en `/Results` como oferta destacada CAMBRA, **etiquetada como exclusiva** — NUNCA mezclada en el benchmark como si fuera precio de mercado. El benchmark sigue 100% público y auditable; lo exclusivo se presenta como exclusivo.

### Alcance del chunk cuando toque
1. **Recuperar la estructura pre-purga** (git history / Decision_Log M3.5) → listar sus secciones → clasificar: adapta / elimina (multi-vertical) / nueva. Tono y calidad visual de la original se mantienen.
2. **Copy nuevo payments-only** sobre esa estructura: hero para proveedores (*"Merchants are comparing you right now — be the answer"*), explicación de los dos niveles con requisitos y beneficios (tabla o cards), CTA de contacto (`contact@cambra.global` o formulario si la original lo tenía). **Cero cifras de red fabricadas** (nada de "X merchants conectados" inventado; si hace falta prueba social: "founding cohort in progress" honesto). **Cero menciones shipping/SaaS**.
3. **Ruta y nav:** reactivar `/ForProviders` en `src/App.jsx` (hoy `<Navigate to="/" replace />`) y restaurar el link donde vivía pre-purga (footer probablemente — verificar).
4. **Terms §8:** la cláusula vuelve a referenciar `/ForProviders` como página viva. Su texto refleja los dos niveles **sin comprometer términos comerciales concretos** (los % de referral y las tarifas exclusivas se negocian por acuerdo, no se publican en Terms). Ajuste mínimo, sin inventar obligaciones.
5. **Coherencia con Results (solo diseño, NO construir):** documentar en Decision_Log cómo se mostrará una oferta Partner cuando exista la primera — slot "CAMBRA exclusive offer" en `/Results`, etiquetado como exclusivo, separado visualmente del benchmark. Diseño para el futuro; hoy no hay partners → **cero UI nueva en Results en este chunk**.
6. **KNOWN_DEBT:** cerrar la entrada "R2 · Terms §8" (resuelta por resurrección) y abrir una nueva: "Primer acuerdo Partner pendiente — cuando exista, construir el slot de oferta exclusiva en `/Results` según diseño del Decision_Log".
7. **i18n** si la página era traducida (verificar en git history); Decision_Log arriba documentando la decisión ("dos niveles Listed/Partner, benchmark público intacto, exclusivas como capa comercial — revierte resolución §8 de Fase 1").

### Restricciones duras
- **NO empezar hasta cerrar Fase 2 y Fase 3 de M4-TPV.** Precondición explícita.
- **Cero cambios en motor, benchmark, paths verified, o `/Results`.** El punto 5 es solo documentación de diseño futuro. Ni una línea de código en `/Results` en este chunk.
- **Suite verde** antes de arrancar y después de cerrar.

### Por qué no ahora
La superficie payments in-store (Fase 2B) tiene que estar viva y verificada antes de que un proveedor TPV vea `/ForProviders` — el pitch a SumUp/myPOS/Viva depende de que la landing y el analyzer ya cubran in-store visiblemente. Adelantar el chunk crea una página que promete cobertura in-store que la UI aún no entrega.

### Valor cuando exista
Primer email a SumUp/myPOS/Viva/Smile&Pay con URL que enseñar. Pitch limpio: *"vuestro pricing público ya está en nuestro benchmark; ¿queréis ganar a los demás con una tarifa exclusiva para nuestros merchants?"*. La página es la infraestructura de ese pitch.

---

## Help Center — refactor payments-only + traducción FR/ES + 3 FAQs in-store

**Estado:** 🟡 activa (identificada en M4-TPV Fase 3 barrido de coherencia, 2026-07-12)
**Fichero:** `src/lib/helpCenterData.js` (~480 líneas) + `src/pages/Help.jsx` + componentes `src/components/help/*`

### Síntoma detectado en el barrido Fase 3
Auditoría del punto 8 del checklist reveló tres problemas en el Help Center:
1. **Multi-vertical residual pre-R2.** `helpCenterData.js` mantiene 14 categorías incluyendo `shipping` (L41-46), `saas` (L47-53), y menciones explícitas en payments category L120 ("Payments processing, card-present terminals, shipping and logistics, SaaS subscriptions, commerce platform fees, banking and FX, business insurance, and increasingly telecom and operational infrastructure"). Contradicción con el pivot payments-only sellado en R2.
2. **Cero traducción FR/ES.** `Help.jsx` no consume `useTranslation()`. `helpCenterData.js` es EN puro. Los 3 idiomas soportados en el resto del producto no aplican al Help Center.
3. **Las 3 FAQs in-store pedidas por Xavi no existen.** Ninguna entry menciona: "¿analizáis TPV?", "¿qué facturas para verificar in-store?", "¿qué hacéis con mis facturas subidas?". La categoría `uploads` L328-348 habla de invoices en general pero no distingue online (Stripe connect) vs in-store (upload TPV statement).

### Por qué no se arregla en Fase 3
Alcance excede el barrido de coherencia. Un refactor completo requiere:
1. Purga de categorías multi-vertical (`shipping`, `saas`) + reescritura de la categoría `payments` para incluir in-store explícitamente + revisión de las 14 categorías restantes filtrando menciones a shipping/SaaS/insurance/telecom/banking.
2. Introducir `useTranslation()` en `Help.jsx`, `HelpCategory.jsx`, `HelpHero.jsx`, `HelpSearch.jsx`, `HelpCTA.jsx`, `PopularArticles.jsx`, `CategoryGrid.jsx`, `FAQAccordion.jsx` + añadir ~80+ keys nuevas × 3 idiomas al dictionary `src/lib/i18n.jsx` (que ya está en 2000+ líneas — considerar splitear el dict por sección si sigue creciendo).
3. Añadir las 3 FAQs in-store nuevas (mínimo):
   - Q: `"¿Analizáis pagos in-store (TPV)?"` — A: sí, motor 1.4.0 cubre 4 verified providers EU (SumUp / Stripe Terminal / Smile&Pay / Zettle) + fallback bank TPV; el gap se calcula sobre GMV + avg ticket + provider + region.
   - Q: `"¿Qué facturas necesito para verificar in-store?"` — A: statement mensual del TPV provider (SumUp/Stripe Terminal/etc.) mostrando: fees totales del período + volumen procesado + número de transacciones + fixed fees separados si los hay. Formato PDF, Excel, o CSV.
   - Q: `"¿Qué hacéis con mis facturas subidas?"` — A: extracción LLM (Anthropic + OpenAI cross-check) para pull structured fields (fees, volume, ticket); almacenamiento cifrado con retention según Privacy §8; nunca compartidas con terceros; borrables on-demand; **verified in-store TODAVÍA gated** (flag off en producción, el path solo produce estimated hoy — ver aclaración Fase 3 en Decision_Log).

Chunk propio (post-Fase-3 o paralelo si Xavi lo prioriza).

### Alcance estimado
~4 horas: purga (~30min) + i18n scaffolding (~2h) + reescritura content (~1h) + verificación cross-idioma. No requiere cambios en motor ni schema.

### Riesgo residual mientras no se arregle
Bajo. Help Center es página secundaria (2 clicks desde landing). Merchants FR/ES ven contenido EN — funcional pero no ideal. Cero copy in-store hoy — si un merchant TPV busca "how do you audit my TPV?" no encuentra respuesta pero el Analyzer sí produce el resultado correcto. Impact primaryly SEO + first-impression cross-linguistic, no funcional.