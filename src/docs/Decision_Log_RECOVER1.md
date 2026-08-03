# Decision Log — RECOVER-1 (2026-08-03)

Electronic acceptance of the "Recover Margin" mandate: two-phase `Mandate` state
machine, frozen terms snapshot, and the in-line invariant that a `DealActivation`
never reaches `authorized` without an active mandate.

## Lo que la inspección previa encontró (sección 2 del chunk)

Cuatro criterios de parada se activaron y se resolvieron con decisión explícita,
no por aproximación. Un quinto hallazgo apareció durante la auditoría y cambió el
diseño.

### 1. No existe relación canónica usuario ↔ organización ↔ Brand

`Organization` / `OrganizationMember` existen, pero son la **tenencia de la
plataforma API** (`monthly_api_quota`, `rate_limit_per_minute`,
`stripe_customer_id`; consumidas por `apiAuth` / `ApiUsageRecord`). `Brand` no
tiene `organization_id` y nada las une. La propiedad real se expresa por email:
`Brand.contact_email` / `created_by`, `DealActivation.user_email` — que es lo que
ya hacen todas las RLS.

**Decisión:** `Mandate.organization_id` guarda un `Brand.id`. **El campo conserva
el nombre `organization_id`, deliberadamente, aunque hoy apunte a un `Brand`:** el
día que existan Organizaciones reales con varias marcas (deuda conocida desde
BUG-6) solo cambia **a qué apunta**, no el esquema. Documentado en el propio
campo: *"Hoy, organización = marca. Este campo apuntará a una Organization real
cuando exista soporte multi-marca."*

### 2. Criterio de baseline verificado — se amplió, no se sustituyó

La propuesta inicial (`locked && source === 'api' && verified_at`) era demasiado
estrecha en un punto que **construimos nosotros mismos**: el flujo de
`StatementUploadCard` existe para que un extracto subido, tras revisión humana,
llegue a ser verificado ("our team reviews the extraction before it becomes a
verified number"). Exigir `source === 'api'` habría **excluido por diseño** a todo
comercio verificado por esa vía, dejando inútil ese trabajo para la elegibilidad a
Recover Margin.

**Decisión:** `locked === true && verified_at presente && verified_by presente`,
**sin restringir `source`**. El par `verified_at`/`verified_by` es la prueba de que
alguien (sistema o humano) verificó el dato; `source` es procedencia, no prueba.

La RLS de `Baseline` es admin/`created_by`, así que el comercio **no puede leer su
propio baseline**. No se toca esa RLS: `getRecoverAcceptanceContext` lo sirve con
`asServiceRole` **después** de aplicar el criterio, que vive una sola vez en
`base44/shared/recoverAcceptance.ts#isVerifiedBaseline`.

### 3. No hay señal de autenticación reciente — limitación aceptada, no disimulada

`base44.auth.me()` devuelve id/email/full_name/role/created_date: **no hay hora de
login, ni `session_id`, ni endpoint de reautenticación**. La sección 15 del chunk
no es implementable tal como está escrita.

**Decisión, sin suavizarla:** `authenticated_at` guarda **el instante en que el
servidor validó la sesión** al aceptar. Literalmente: *verificamos que la sesión es
válida en el instante de aceptar; no podemos verificar hace cuánto se autenticó.*
Esto es una **limitación de plataforma aceptada, no una equivalencia funcional**.
No hay umbral de frescura y no hay reautenticación. **No existe campo `session_id`**
en la entidad: una columna siempre nula solo insinuaría una capacidad que no
tenemos.

La evidencia se guarda igual, aunque sea parcial: `authenticated_at`, `ip_address`
(cuando la cabecera existe) y `user_agent`.

**Añadido a la lista de revisión legal ya abierta** (cláusula de exclusividad del
PSP, estatuto de Agente comercial, estructura del BSA): la solidez probatoria de
una aceptación electrónica que compromete **24 meses de facturación variable** sin
verificación de frescura de sesión. No se resuelve con más ingeniería; se resuelve
nombrándolo.

### 4. `Mandate.required` era incompatible con una aceptación en dos fases

`signed_by_name`, `signed_by_email` y `signed_at` estaban en `required`, y por
definición no existen durante `acceptance_started`. Auditoría de escritores
(2026-08-03): **no había ningún creador de `Mandate` en todo el repo** — solo
lectores (`getActivationAdminDetail`, `contractIPAgent`, `guardDealActivationStatus`,
`updateDealActivationStatus`) y un actualizador (`revokeMandate`). Ningún test
contractual sellaba el enum.

**Decisión:** `required` queda en `authorized_actions_json` + `status`. La presencia
de firma se exige **en la transición a `active`**, dentro de
`acceptRecoverMandate` — no en el esquema. Se añadió `owner_email` (escrito al
crear) porque sin él el comercio no podría leer su propio mandato en curso bajo
RLS, ya que `signed_by_email` aún es nulo.

## 5. El guardián era una ilusión de red de seguridad — y se deja morir

Hallazgo que apareció durante la auditoría y **cambió la premisa del diseño**:

- `guardDealActivationStatus` es un handler de automatización de entidad sobre
  `DealActivation`, marcado `[QUARANTINE 2026-08-15]` (PURGE-2: la función **sigue
  ejecutándose**, con una sonda `OperationalLog{event_type:"quarantine_probe"}`;
  silencio hasta el 15-ago ⇒ se borra).
- **La app tiene CERO automatizaciones de entidad registradas** (verificado
  2026-08-03). Es decir: ese guardián **nunca se ha disparado**. No era una red de
  seguridad con fecha de caducidad — era código muerto.
- `updateDealActivationStatus` (que sí exige mandato activo antes de `authorized`)
  también está en cuarentena y **sin caller en `src/`**.

**Decisión: dejarlos morir en el barrido del 15-ago. No se genera la fila de
sonda.** Dos motivos:

1. Un guardián **reactivo** que revierte `DealActivation.status` por fuera del
   flujo puede pisarse con la supersesión de mandatos justo en el instante más
   delicado: el **solapamiento transitorio de dos mandatos activos** que el propio
   chunk tolera como excepción documentada. Serían dos escritores del mismo campo
   sin coordinarse.
2. La protección en línea es **estrictamente más fuerte**: previene la escritura
   inválida en vez de descubrirla después y deshacerla. Resucitar el guardián no
   añadiría seguridad, añadiría una **segunda fuente de verdad** para lo mismo.

**Si alguien lee esto dentro de un año preguntándose "¿por qué no usamos el
guardián que ya existía?": porque no existía en funcionamiento. Estaba muerto antes
de este chunk, sin caller y sin trigger.** La invariante la garantiza
`acceptRecoverMandate` en línea.

## La invariante, y dónde está exactamente

`acceptRecoverMandate`, en este orden y por este motivo:

1. **Re-verifica el hash de los términos** — si la comisión o el baseline se
   movieron mientras el popup estaba abierto, el hash no coincide y la aceptación
   **se rechaza** (409 `terms_changed`) en vez de vincular al comercio a otras
   condiciones.
2. **Relee el mandato** inmediatamente antes de escribirlo — sin doble aceptación,
   sin aceptar después de una revocación.
3. **Activa el mandato PRIMERO** — el mandato existe antes de que exista
   autorización alguna.
4. **Relee los mandatos y confirma que el activo está realmente ahí** — nunca se
   autoriza sobre una suposición (500 `mandate_activation_failed` si no).
5. **Relee la activación** y recorre la máquina declarada
   `activated → awaiting_authorization → authorized`, comprobando el estado
   inmediatamente antes de cada escritura.
6. **Supersede** los mandatos activos anteriores de esa activación.

Sin transacciones en la plataforma, la seguridad es: **clave de idempotencia
persistida y reclamada antes de cualquier cambio de estado** (`idempotency_key` =
`recover:<activation>:<owner>:<hash>`), **relectura antes de cada escritura**, y
**colapso de duplicados al releer** (mismo patrón que `shared/referralLink.ts`).
Reabrir el popup devuelve la MISMA fila; un popup abierto tras cambiar la comisión
produce otro hash y por tanto otra aceptación honesta, no una reutilización de
términos rancios.

## Superficie añadida

| Función | Rol |
|---|---|
| `getRecoverAcceptanceContext` | READ-ONLY: elegibilidad, comisión del mes, baseline verificado, snapshot + hash |
| `startRecoverAcceptance` | Crea el `Mandate` en `acceptance_started` (idempotente por clave) |
| `acceptRecoverMandate` | Registra la firma, activa el mandato, autoriza la activación, supersede |

Lógica compartida en `base44/shared/recoverAcceptance.ts` (criterio de baseline,
snapshot, hash estable, resolución de propiedad, evidencia, clave de idempotencia)
— una sola definición, importada por las tres. Censadas en
`PRODUCTION_FUNCTIONS.md` + `MANIFEST` de `productionFunctions.static.test.js`.

`acceptance_started` **no es una autorización**: todo consumidor que exige mandato
vivo filtra `status === 'active'`, que es lo que ya hacían los lectores previos.

## Bug de plataforma encontrado al probar

`entities.X.filter({ id })` **lanza** `"Object not found"` para un id inexistente
en vez de devolver `[]`. Sin `.catch(() => [])` un id incorrecto salía como **500**
en lugar de 404. Corregido en las tres funciones y en el módulo compartido.
Verificado: id inexistente → 404 `activation not found` / `mandate not found`.
(Misma trampa presente en `getActivationAdminDetail`, no tocada aquí.)

## Pendiente

- Popup de aceptación (UI) y su cableado.
- Verificación E2E en vivo del flujo completo.