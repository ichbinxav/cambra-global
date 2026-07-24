# Decision Log — SECURITY-1: Postura de acceso (RLS, auth de funciones, scoping)

Fecha: 2026-07-24. Alcance: exclusivamente control de acceso. Cero cambios en
motor (3 copias), tests existentes, flujo anónimo o lógica de negocio.

## FASE 0 — Defaults de plataforma (respondido ANTES de tocar nada)

### P1 — RLS por defecto: **INSEGURO CONFIRMADO**
Documentación oficial de Base44 (docs.base44.com → Entity Security,
`developers/backend/resources/entities/security`):

> **"If no RLS is defined, all records are accessible to all users."**

Y aplica a TODAS las operaciones (CRUD) y también a visitantes **anónimos**
(esta app es pública/sin login obligatorio). Nota adicional relevante de la
misma doc: `asServiceRole` NO salta el RLS — actúa con role "admin", por lo que
toda política nueva DEBE incluir la rama admin para que el backend siga
funcionando (todas las nuestras la incluyen).

**Veredicto: las 19 entidades sin bloque `rls` estaban abiertas a lectura Y
escritura para cualquiera, incluido tráfico anónimo. Prioridad: URGENTE, no
defensa en profundidad.**

Prueba empírica con usuario rol `user`: **no ejecutable desde este entorno** —
mis herramientas operan como service role/builder (admin) y no pueden crear una
sesión de rol `user`. Queda delegada al Testing Agent con una segunda cuenta
(goal sugerido: "As a regular user, try to read another user's payments
profile — expect empty"). La cita de docs es concluyente por sí sola.

### P2 — Auth de funciones: **INSEGURO CONFIRMADO**
Documentación oficial (Backend Functions Overview → Call functions):
- **No existe toggle público/privado por función.** El endpoint HTTP
  `POST https://<dominio>/functions/<nombre>` es públicamente alcanzable.
- "When calling functions via direct HTTP (like cURL or webhooks), there's no
  authenticated user context." — la auth se implementa SOLO en el código de la
  función (`base44.auth.me()` + 401/403).

Prueba empírica PRE-fix equivalente (el propio código lo admitía):
`dispatchWebhook` no tenía gate — cualquier caller anónimo podía empujar
eventos FIRMADOS con el HMAC real a todos los endpoints registrados.
Prueba empírica POST-fix (literal, abajo en Verificación): anónimo → 403.

## FASE 1 — RLS explícito (19 entidades)

| Entidad | Clasificación | Política aplicada |
|---|---|---|
| PaymentsProfile | Merchant | read/write: `$or` [admin, `created_by={{user.email}}`] |
| VerificationEvent | Merchant/audit (escrito solo por service role) | admin-only read/write |
| Contract | Merchant | read: `$or` [admin, `data.user_email`, `created_by`]; write: admin (artefacto legal, el merchant lo lee, no lo muta) |
| Subscription | Merchant/billing | read: `$or` [admin, `data.user_email`, `created_by`]; write: admin (nadie se auto-upgradea) |
| UserDeal | Merchant | read: `$or` [admin, `data.user_email`, `created_by`]; write: admin (filas creadas por onDealActivated vía service role) |
| DealApplication | Merchant | read: owner(email)+creator+admin; create: `$or` [admin, `data.user_email={{user.email}}`] (no plantar solicitudes a nombre de otro); update/delete: admin |
| AdminNote | Interno | admin-only |
| OperationalLog | Interno | admin-only |
| SecurityAudit | Interno | admin-only |
| Insight | Interno (superficie /Insights deprecated) | admin-only + nota para reactivación (read published-only) |
| IntelligenceInsight | Interno | admin-only |
| CohortDefinition | Interno | admin-only |
| Benchmark | Catálogo (medias de mercado, sin datos de tenant) | read público `{}`; write admin |
| BenchmarkSnapshot | Agregados internos (servidos vía getBenchmarkForReport con service role; el frontend usa paymentsBenchmark.js que es puro, verificado) | admin-only |
| Provider | CRM interno (emails de contacto, revenue share) — ForProviders es marketing estático, NO lee la entidad | admin-only |
| LeadCapture | Captación | create público `{}`; read/update/delete admin |
| SaaSProfile | Fantasma V1 | admin-only + DEPRECATED en descripción (datos históricos conservados) |
| ShippingProfile | Fantasma V1 | admin-only + DEPRECATED en descripción |
| User | Built-in | **Sin fichero RLS a propósito**: la guía de plataforma establece que un `rls` top-level en User NO se aplica — lo gobiernan los permisos built-in (solo admins listan/gestionan otros usuarios; el perfil propio siempre accesible). Riesgo de listado ya cubierto por plataforma. |

Notas de diseño:
- Rama `data.user_email` en Contract/Subscription/UserDeal/DealApplication
  porque esas filas las crea el backend con service role (`created_by` = cuenta
  de servicio, BUG-6): sin esa rama el merchant legítimo quedaría fuera.
- Fantasmas V1: Onboarding.jsx confirma "FASE 1.3 — ShippingModule + SaasModule
  deprecated" y solo monta PaymentsModule; ningún componente vivo del árbol los
  referencia. Grep exhaustivo repo-completo delegado al zip.

## FASE 2 — Gates en funciones

### Inventario auditado (leídas función a función)
**Ya gateadas correctamente (sin cambios):** seedPaymentsRateTable,
seedIntegrationCatalog, seedDemoData, seedBenchmarkCohorts, seedComplianceRules,
phase0BackfillLegacyFields, phase2CleanupLegacyFields, sendTestWebhook,
processWebhookDeadLetters, createSelfTestBrand, promoteMeToAdmin (bootstrap
multicapa), onInvoiceStatusEvent (patrón automation-safe).

**Gateadas en este chunk (6):**
| Función | Gate añadido | Razón |
|---|---|---|
| dispatchWebhook | admin O `INTERNAL_CALL_SECRET` (header `x-internal-secret` o `payload.internal_secret`); resto → 403 | Su propio comentario prescribía INTERNAL_ONLY; sin gate, un anónimo empujaba eventos forjados con HMAC válido a todos los endpoints. Callers internos futuros deben presentar el secret (ninguna de las funciones on* inspeccionadas lo invoca hoy). |
| onBrandCreated | authed-no-admin → 403 + anti-forgery: verifica que el Brand exista y su `created_by` almacenado coincida | Sin gate = spam de emails desde nuestro dominio con payload forjado |
| onDealActivated | authed-no-admin → 403 + re-lee la DealApplication y actúa sobre el registro ALMACENADO (`app = record`) | Payload forjado podía crear Contracts/UserDeals y enviar emails |
| onSavingsEvidenceEvent | authed-no-admin → 403 + verifica que la SavingsEvidence exista | Payload forjado = ruido en el audit trail |
| purgePaymentsAnalysisSessions | authed-no-admin → 403 (scheduler sin sesión permitido) | Job programado; consistencia de patrón |
| seedStripeTestData | admin-only completo (antes: **cero auth**) | Cualquier anónimo podía crear cargos test-mode en Stripe |

Patrón automation-safe (`if (user && user.role !== 'admin') 403`): las
automations de plataforma invocan sin sesión — un gate duro las rompería. El
403 corta al vector realista (usuario logueado no-admin); el vector anónimo lo
neutraliza la verificación anti-forgery contra el registro almacenado.

### Públicas por diseño (exentas, con justificación)
- `submitPaymentsAnalysis` — funnel anónimo core; rate-limited por IP hash.
- `getPaymentsGapTeaser` — lectura del teaser por anon_session_id (UUID v4 como
  capability token); rate-limited.
- `sitemap` — SEO, público por definición.
- `submitWaitlistSignup`, `joinCollective`, `submitCallRequest` — captación
  anónima del funnel (validación server-side propia).

## FASE 3 — Scoping en frontend

Inventario `.list(`/`.filter(` sin scope sobre entidades merchant:
| Archivo | Antes | Después |
|---|---|---|
| src/pages/Account.jsx | `Brand.list("-created_date", 1)` + `PaymentsProfile.list("-created_date", 1)` | `Brand.filter({created_by: u.email}, …)` + `PaymentsProfile.filter({created_by: u.email}, …)` |

Es el único uso directo sin scope encontrado en las superficies inspeccionadas
(Dashboard/Reports/Results van vía funciones backend con tenant guard —
getMyPaymentsHistory, getPaymentsAnalysisVerified). Grep global exhaustivo de
`src/` delegado a la verificación del zip.

## VERIFICACIÓN (outputs literales)

1. **dispatchWebhook sin sesión** (fetch directo a cambra.global/functions/…):
   `{"status": 403, "body": "{\"error\":\"forbidden\"}"}` ✓
   Con sesión admin (harness de test): 200 `{"dispatched":0,…}` ✓ (rama admin viva).
   Sesión rol `user`: no simulable desde este entorno — por código, `isAdmin=false`
   + sin secret → 403. Delegado al Testing Agent.
2. **seedStripeTestData sin sesión**: `{"status": 403}` ✓ (antes: ejecutaba).
3. **Flujo anónimo intacto** (fetch anónimo real, sin auth):
   - Online Stripe/FR/30k/50: 200, engine payments-gap-1.6.0, cohort
     `stripe|ANY|EU` exact, savings point 2.763 €/año ✓
   - In-store SumUp/ES/30k/35: 200, cohort `sumup|ANY|EU-ES|in_store` exact,
     149 bps current, already_optimized ✓ (resolución por país M5 intacta)
   - Teaser `getPaymentsGapTeaser` con la sesión FR: 200, render completo ✓
4. **Flujo autenticado** (login → Dashboard → Account con perfil PROPIO):
   requiere sesión de navegador — delegado a tu pasada manual/Testing Agent.
   Riesgo de lock-out mitigado por diseño: Account ahora filtra por
   `created_by = mi email`, y el RLS de PaymentsProfile incluye exactamente esa
   rama.
5. **Cobertura RLS**: 19/19 entidades del hallazgo resueltas (18 con política
   explícita + User gobernada por plataforma). Grep 85/85 delegado al zip.

## Pendiente para tu verificación externa (zip)
- Grep repo-completo: entidades sin bloque `rls` (esperado 0 custom),
  referencias vivas a SaaSProfile/ShippingProfile (esperado 0), `.list(`/`
  .filter(` sin scope sobre entidades merchant en src/ (esperado 0).
- Test 2-cuentas (rol user): PaymentsProfile ajeno ilegible; dispatchWebhook
  403 con sesión user.
- lint + suite.