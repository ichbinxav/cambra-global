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