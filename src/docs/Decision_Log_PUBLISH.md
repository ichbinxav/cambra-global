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

---

## CHUNK SEO-1 — Coherencia robots.txt ↔ noindex (2026-07-18)

### Problema
Doble protección contradictoria: una ruta en `Disallow` NUNCA es rastreada, el
bot no renderiza React, no ve el `noindex` de RobotsMeta, y puede indexar la URL
"a ciegas" desde un enlace externo. Regla de Google: para que `noindex` funcione,
la ruta NO puede estar bloqueada por robots.txt. → Política única.

### Política única aplicada
- **Páginas React (HTML servido por la SPA)** → desindexar SOLO con `noindex`
  (RobotsMeta). SALEN del `Disallow`.
- **Endpoints no-HTML** (`/functions/*`, callbacks OAuth bajo `/auth/`) → sin meta
  que el bot pueda leer → SE QUEDAN en `Disallow`.

### robots.txt resultante
```
User-agent: *
Allow: /
Disallow: /functions/
Disallow: /auth/

Sitemap: <SITE_URL>/functions/sitemap
```
Todas las páginas React internas retiradas del Disallow. Sitemap intacto (solo-público).

### Tarea 2 — Verificación cruzada ruta por ruta (cobertura noindex)
Allowlist público de RobotsMeta: `/`, `/landing`, `/analyzer`, `/howitworks`,
`/pricing`, `/testimonials`, `/contact`, `/forproviders`, `/for-providers`, `/help`,
`/privacy`, `/terms`, `/cookies`. Fail-safe: todo lo no listado → `noindex`.

Rutas retiradas del Disallow y su cobertura:
| Ruta | ¿En allowlist? | Meta emitido |
|---|---|---|
| `/Dashboard` | no | noindex ✅ |
| `/Account` | no | noindex ✅ |
| `/Reports` | no | noindex ✅ |
| `/Vault` | no | noindex ✅ |
| `/Invoices` | no | noindex ✅ |
| `/Onboarding` | no | noindex ✅ |
| `/BrandProfile` | no | noindex ✅ |
| `/ConnectIntegrations` | no | noindex ✅ |
| `/ConnectTools` | no | noindex ✅ |
| `/IntegrationsCallback` (ruta React) | no | noindex ✅ |
| `/LoginGate` | no | noindex ✅ |
| `/HealthCheck` | no | noindex ✅ |
| `/AnalyzerTeaser` | no | noindex ✅ |
| `/admin` y `/admin/*` | no | noindex ✅ |
| `/dev/export` | no | noindex ✅ |

**Ajuste requerido — `/Results`:** estaba en el allowlist público (recibía
`index,follow`). La decisión del CHUNK PUBLISH es que `/Results` permanezca
`noindex` (vista autenticada, datos de merchant). Para cumplir la política SEO-1
(páginas React → solo noindex, sin Disallow) SIN indexarla, se retiró `/results`
del allowlist de RobotsMeta. Resultado: `/Results` → `noindex` ✅, y sale del
Disallow como el resto. Este es el ÚNICO cambio en RobotsMeta (permitido por el
brief ante hallazgo de Tarea 2).

**BLOCKER:** ninguno. No existe ruta interna que quede sin Disallow Y sin noindex.

### Tarea 3 — Limitación estructural (aceptada, no "arreglada")
El `noindex` se inyecta **client-side** vía React (RobotsMeta). Googlebot renderiza
JS y lo verá correctamente. Crawlers que NO ejecutan JS verán el meta estático
`index, follow` del `index.html`. La mitigación ideal sería una cabecera
`X-Robots-Tag: noindex` **por ruta** en el servidor; el entorno de Base44 no expone
configuración de cabeceras HTTP por ruta para la SPA, por lo que se documenta como
**limitación de plataforma aceptada**. Riesgo residual: un crawler sin-JS podría
listar una URL interna sin contenido (nunca su contenido, protegido por auth/RLS).
NO se cambia el meta estático del index.html a `noindex` por defecto: desindexaría
las páginas públicas si el bot captura el HTML antes del render. Si en el futuro
Base44 habilita cabeceras por ruta, migrar el noindex de las rutas internas a
`X-Robots-Tag` server-side.

### Criterio 5 — Republicar
Requiere un segundo Publish para servir el robots.txt nuevo. Puede fusionarse con
el Publish pendiente del CHUNK PUBLISH (una sola publicación).

### Estado SEO-1
- [x] Tarea 1 — robots.txt: Disallow solo de `/functions/` y `/auth/`.
- [x] Tarea 2 — verificación cruzada + ajuste `/Results` fuera del allowlist. Sin BLOCKER.
- [x] Tarea 3 — limitación client-side documentada.
- [ ] Criterio 5 — republicar (acción del founder; fusionable con el Publish anterior).

---

## MICRO-CHUNK FIX-TESTS (2026-07-18) — 3 fallos del Testing Agent

### P5 (BLOCKER) — "Country dropdown renders an empty list" — RESUELTO
**Diagnóstico:** el Analyzer NO carga los países de ninguna entidad ni de
PaymentsRateTable. Usa un `<select>` nativo alimentado por `COUNTRY_OPTIONS`, una
**constante estática** del propio `PaymentsAnalyzer.jsx` (22 países). No hay query,
no hay RLS, no hay dependencia de auth → la lista NUNCA puede quedar vacía por datos.
Descartada la hipótesis de RLS anónimo (no aplica: no hay lectura de entidad).

**Causa real:** contraste. Las `<option>` usaban `className="bg-neutral-900"` sin
color de texto explícito. Sobre el fondo oscuro de la página, en entornos
headless/algunos SO el menú desplegable nativo hereda texto oscuro → opciones
**invisibles** (texto negro sobre negro), reportado por el agente como "empty list".

**Fix (UI-only, sin lógica):** ambas instancias del `<select>` de país (modo
single-channel y modo combined) fuerzan ahora `color:#ffffff` + `background:#0b1020`
en cada `<option>` y `colorScheme:"dark"` en el `<select>`. Opciones legibles en
cualquier entorno. Contrato de payload y validación intactos.

**P1** (el agente terminaba antes de enviar): explicado por el mismo bug — sin país
seleccionable el form no validaba. Cubierto por el mismo fix.

### P4 — "/dev/export accesible para no-admin" — FALSO POSITIVO
**Auditoría del router:** existe UNA sola ruta a DevExport:
`<Route path="/dev/export" element={<AdminRoute><DevExport/></AdminRoute>} />`.
No hay variante de casing (`/DevExport`, `/dev/Export`), ni alias, ni ruta comodín
que monte la página fuera de `AdminRoute`. `AdminRoute` exige
`isAuthenticated && role==="admin"`; no-admin → `<Navigate to="/Dashboard">`.

**Rol del usuario de prueba:** el entorno tiene usuarios admin reales
(`xavi@cambra.global`, `94.martinez.x@gmail.com`). Si el Testing Agent corrió
autenticado como uno de ellos, `AdminRoute` le concede acceso **legítimamente** —
es acceso admin correcto, no un guard roto. Además `DevExport` no filtra datos por
sí mismo: carga rutas en iframes same-origin cuyo contenido sigue protegido por sus
propios ProtectedRoute/AdminRoute + RLS.

**Conclusión:** sin cambio de código. No existe ruta interna sin guard. Documentado
como falso positivo del test (rol admin del usuario de prueba).

### Re-test pendiente (a ejecutar por el founder con el Testing Agent)
- **P5/P1:** "Complete an anonymous payments analysis with GMV 30000, average ticket
  50, Stripe, France — reach the results page with the Recovery Roadmap." Debe llegar
  a `/Results` con el Recovery Roadmap.
- **P4:** re-ejecutar con un usuario de rol `user` (no admin) y confirmar que
  `/dev/export` redirige a `/Dashboard`. Esperado: verde (redirección).

---

## ESTADO
- [x] Tarea 1 — clasificación de rutas.
- [x] Tarea 2 — RobotsMeta (noindex por ruta) + robots.txt + sitemap solo-público.
- [x] Tarea 3 — DevExport protegido, HealthCheck sin fuga. Sin BLOCKER.
- [ ] Tarea 4 — publicar (botón Publish de Base44 — acción del founder).
- [ ] Tarea 5 — checklist en dominio custom (a ejecutar + pegar resultados).