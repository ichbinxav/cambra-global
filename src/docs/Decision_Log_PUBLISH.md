# Decision Log — CHUNK PUBLISH (noindex rutas internas + publicación payments-only)

Fecha: 2026-07-18 (Europe/Madrid)
Precondición: GO formal recibido del founder ("Go", 2026-07-18 12:05) con la suite
verde confirmada sobre main_32 (444/444, lint 0 errores, build limpio).

Regla global respetada: CERO cambios en motor, tests o lógica de negocio. Solo
superficie pública (noindex/robots/sitemap) + verificación de acceso + preparación
de publicación.

---

## TAREA 1 — Clasificación de rutas (públicas vs internas)

Fuente de verdad: `src/App.jsx` (router).

### PÚBLICAS (indexables) — allowlist explícita en RobotsMeta + sitemap
| Ruta | En sitemap.xml | Notas |
|---|---|---|
| `/` (Landing) | ✅ | home |
| `/Landing` | (alias) | mismo componente |
| `/Analyzer` | ✅ | analyzer anónimo |
| `/HowItWorks` | ✅ | |
| `/ForProviders` | ✅ (añadido) | reactivada post-M4, faltaba en sitemap |
| `/Pricing` | ✅ | |
| `/Testimonials` | ✅ | |
| `/Contact` | ✅ | |
| `/Help`, `/Help/:slug` | ✅ (/Help) | |
| `/Privacy` | ✅ | legal |
| `/Terms` | ✅ | legal |
| `/Cookies` | ✅ | legal |

### INTERNAS (noindex, nofollow) — todo lo demás
- **App autenticada:** `/Dashboard`, `/Reports`, `/Account`, `/Invoices`, `/Vault`,
  `/ConnectIntegrations`, `/ConnectTools`, `/IntegrationsCallback`,
  `/Onboarding`, `/BrandProfile`.
- **Resultados de análisis:** `/Results`, `/AnalyzerTeaser` (ver DECISIÓN /Results abajo).
- **Auth/utilidad:** `/LoginGate`, `/auth/start`, `/HealthCheck`, `/dev/export`.
- **Admin (todo el panel):** `/admin` y `/admin/*` (command, inbox, chat, discovery,
  overview, users, users/:id, applications, pipeline, deals, providers, revenue,
  benchmarks, contracts, integrations, api-integrations, control, recommendations,
  compliance, activity, approvals, copilot, activation, activation/:id, invoices, waitlist).
- **Rutas deprecadas** que redirigen a `/` (Deals, UnlockSavings, RecoveryTracker,
  Network, Insights, InsightDetail, StripeAnalyzer, Snapshot, Developers*): heredan el
  noindex por defecto del allowlist; al redirigir a `/` acaban en una ruta pública, sin
  exposición de estructura.

### DECISIÓN — `/Results` permanece noindex
El brief lista "el Analyzer anónimo y sus resultados" como público. Sin embargo `/Results`
es TAMBIÉN la vista autenticada del informe del merchant (datos sensibles del comercio).
Ya estaba en `Disallow` del robots.txt preexistente. Mantener `/Results` fuera del
allowlist (→ noindex) es lo correcto y coherente. El contenido indexable de marketing
vive en `/` y `/Analyzer`; el resultado en sí no aporta valor SEO y sí riesgo de exponer
datos. Si en el futuro se quiere una landing de resultado compartible e indexable, se hará
en una ruta pública dedicada, no reutilizando `/Results`.

---

## TAREA 2 — noindex efectivo para rutas internas

### 2.1 — Meta robots por ruta (nuevo componente)
`src/components/shared/RobotsMeta.jsx` — montado dentro de `<Router>` en `src/App.jsx`
(junto a `ScrollToTop`). En cada navegación:
- Ruta en el allowlist público → `<meta name="robots" content="index, follow">`.
- Cualquier otra → `<meta name="robots" content="noindex, nofollow">`.

Diseño **fail-safe**: allowlist explícita. Toda ruta interna futura queda noindex por
defecto; solo se indexa lo que se opta-in explícitamente. `index.html` mantiene el meta
estático `index, follow` para la home y crawlers sin JS (correcto: la home ES pública).

### 2.2 — robots.txt (función `sitemap`, `?type=robots`)
Añadidos a `Disallow`: `/Onboarding`, `/BrandProfile`, `/HealthCheck`. `/dev/export` ya
cubierto por `Disallow: /dev`. Resto del listado interno ya presente.

### 2.3 — sitemap.xml (función `sitemap`)
Emite EXCLUSIVAMENTE las rutas públicas de la Tarea 1. Añadido `/ForProviders` (estaba
omitido tras su reactivación). Ninguna ruta interna/admin aparece. La entrada `Sitemap:`
del robots apunta a `${SITE_URL}/functions/sitemap`.

### 2.4 — Inventario público de páginas/entidades
No se ha detectado que el build de la app emita un índice público de páginas o de
entidades. `mcpServer` / `apiOpenApiSpec` existen como funciones pero requieren
autenticación/clave y no son un inventario navegable anónimo. Sin limitación que reportar
en este punto. (Verificación definitiva del lado servido corresponde al checklist en
dominio — Tarea 5.)

---

## TAREA 3 — Verificación de acceso a rutas sensibles (solo lectura)

### DevExport (`/dev/export`) — PROTEGIDO ✅
Envuelto en `<AdminRoute>` en `src/App.jsx`. `AdminRoute` exige `isAuthenticated` Y
`user.role === "admin"`:
- Anónimo → pantalla "Admins only" + enlace de sign-in (no renderiza DevExport).
- Autenticado no-admin → `<Navigate to="/Dashboard">`.
- La página solo captura DOM same-origin de rutas que a su vez están protegidas por RLS.
No devuelve datos a anónimos. **Cumple criterio.**

### HealthCheck (`/HealthCheck`) — PÚBLICO POR DISEÑO, sin fuga ✅
Ruta pública (sin `ProtectedRoute`), intencional para verificar frescura de bundle tras
deploys. Su único contenido dinámico es una constante `BUILD_STAMP` ("20260626-force").
NO revela claves, nombres de entidades, configuración ni estado interno. Añadida a
`Disallow` del robots.txt y a la lista noindex (RobotsMeta) para que no se indexe.
**No es BLOCKER.**

**Sin BLOCKER en Tarea 3 → se puede publicar.**

---

## TAREA 4 — Publicar (PENDIENTE — acción de plataforma, fuera del entorno de edición)

No ejecutable desde el entorno de edición: no hay acción de "publish" ni control del
dominio `cambra.global` (mapeo de dominio custom = configuración de plataforma). La
publicación se dispara con el botón **Publish** de Base44.

Verificación tras publicar (a ejecutar por el founder en el dominio):
- El `<title>` servido en `cambra.global` debe ser EXACTAMENTE
  `CAMBRA — Card payment cost audit for independent brands` (ya presente en `index.html`
  del repo, línea 15).
- Si el dominio sigue sirviendo el título antiguo ("CAMBRA Global" / "economic operating
  system"): problema de conexión commit↔dominio → documentar qué build está conectado y
  detenerse; escalar a soporte de Base44 (no es código de app).

---

## TAREA 5 — Checklist post-publicación (PENDIENTE — a ejecutar en el dominio custom)

No ejecutable desde el entorno (no puedo navegar ni ver el código servido de
`cambra.global`). A ejecutar por el founder; para los flujos dentro de la app usar el
Testing Agent (panel lateral). Pegar resultados aquí:

1. **Título/metadata** (view-source cambra.global): title + description payments-only, sin
   "400+" / "shipping" / "SaaS".  → [ resultado ]
2. **Flujo anónimo E2E** en el dominio (no en preview): análisis estimado desde la home
   hasta Results con Recovery Roadmap. Testing Agent goal sugerido: "Complete an anonymous
   payments analysis from the home page through to the results with the Recovery Roadmap".
   → [ resultado ]
3. **Login en dominio custom**: iniciar sesión, verificar que el estado autenticado
   persiste (Dashboard accesible, sin caer al rescue path anónimo). Testing Agent goal:
   "Sign in and confirm the Dashboard stays accessible without dropping to the anonymous
   path".
   ⚠ Bug conocido de sesión post-login en dominio custom. Si se reproduce, NO es resoluble
   por código de app. Documentar evidencia exacta (pasos, comportamiento, dominio vs
   preview) y abrir ticket con soporte de Base44 citando "auth token delivery on custom
   domain".  → [ resultado / evidencia ]
4. **Noindex** (view-source de una ruta interna, p.ej. /Vault): confirmar
   `<meta name="robots" content="noindex, nofollow">` y que `/functions/sitemap?type=robots`
   responde el robots.txt correcto.  → [ resultado ]
5. **OG preview**: compartir cambra.global muestra title/description nuevos.  → [ resultado ]

---

## FUERA DE ALCANCE (no tocado)
Bundle/code-splitting, i18n FR/ES, selector de proveedores 0.2b, upgrade de dependencias,
cualquier cambio de copy. Idioma: inglés por defecto (confirmado por el founder).

## ESTADO
- [x] Tarea 1 — clasificación de rutas.
- [x] Tarea 2 — RobotsMeta (noindex por ruta) + robots.txt + sitemap solo-público.
- [x] Tarea 3 — DevExport protegido, HealthCheck sin fuga. Sin BLOCKER.
- [ ] Tarea 4 — publicar (botón Publish de Base44 — acción del founder).
- [ ] Tarea 5 — checklist en dominio custom (a ejecutar + pegar resultados).