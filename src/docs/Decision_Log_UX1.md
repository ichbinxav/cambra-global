# Decision Log — CHUNK UX-1 (2026-07-29)

Cambio de estrategia sellado en este chunk: la prioridad pasa de "progressive
value" (máximo valor antes del registro) a **maximizar creación de cuentas y
captación de leads**, reservando parte del informe para usuarios identificados.

Reglas respetadas: motor de cálculo intacto (cero cambios en el bloque SYNC),
RLS intacto, paridad EN/FR/ES en todo texto nuevo (8 claves × 3 idiomas en
`src/lib/locales/{en,fr,es}.js`, bloque "UX-1").

---

## T1 — Email obligatorio en el Analyzer ✅

**Antes:** el analyzer anónimo generaba informes sin ningún dato de contacto.
**Después:** ningún informe se genera sin un email válido, en los 3 modos
(Online / In-store / Both).

- **Frontend** (`src/pages/PaymentsAnalyzer.jsx`): campo email REQUERIDO
  (nuevo FieldCard antes del bloque de marca), validación de formato con
  `EMAIL_RE` (no solo `required`), error inline + error en la lista de
  validación, contador de progreso incluye el email, payload envía
  `email` (trim + lowercase) en modo single y combined.
- **Backend** (`base44/functions/submitPaymentsAnalysis/entry.ts`):
  `validateEmail()` — requerido + formato + máx. 254 chars — aplicado en el
  path single (dentro de `validateInput`) y en el path combined. Rechazo:
  `400 { error: 'invalid_input', field: 'email', reason: 'missing'|'invalid_type' }`.
  El email se persiste SOLO en `input_snapshot` (metadato de sesión / lead)
  — nunca entra al motor y nunca sale por el allowlist del teaser.
- **Mensajes de error:** `analyzer_email_required` / `analyzer_email_invalid`
  en EN/FR/ES.
- **Endpoints modificados:** `submitPaymentsAnalysis` (único endpoint que
  genera informes). `getPaymentsGapTeaser` solo LEE sesiones ya creadas con
  email — no necesita gate propio.
- **Formularios ya existentes con email:** Waitlist (`JoinWaitlistButton` →
  `submitWaitlistSignup`), Book a Call (`BookCallModal` → `submitCallRequest`)
  y Collective ya exigían email; sin cambios.

## T2 — Achievable rate oculta en el informe gratuito ✅

**Antes:** el teaser anónimo devolvía y mostraba la tasa objetivo exacta.
**Después:** no se envía ni se muestra; se mantienen ahorro estimado y rango.

- **Backend** (`getPaymentsGapTeaser`): `achievable_effective_bps` → `null`
  (nivel superior y por canal). Además se filtran las líneas de assumptions
  que empiezan por "Achievable" (composición interchange/scheme/margin y
  anchors in-store) — la tasa no puede reconstruirse desde el payload.
- **Frontend** (`PaymentsGapCard.jsx`): estado bloqueado (candado +
  `locked_achievable_rate`) en el chip compacto, en la caja "You should pay"
  y en el fallback del score.
- **Degradación aceptada y documentada:** con achievable ausente, el Score
  gauge, PeerBenchmark y RecoveryRoadmap se auto-ocultan en el teaser anónimo
  (sus helpers ya devuelven `available:false` / `insufficient_data` con
  entradas no finitas — verificado en `paymentsScore.js`,
  `paymentsBenchmark.js`, `paymentsRoadmap.js`). Todo se desbloquea tras el
  claim post-registro (el AnalyzerResult propio conserva el engine_result
  completo).
- Usuarios autenticados/verified: sin cambios (leen por claim/verified path).

## T3 — Vista BOTH: solo un total para anónimos ✅

**Antes:** el combinado anónimo mostraba total + strip por canal + sección
completa por canal.
**Después:** anónimo ve UN total (rango) + nota bloqueada
(`locked_combined_breakdown`); el strip por canal del hero y las dos
secciones por canal solo se renderizan para usuarios registrados.

- Archivos: `CombinedGapHero.jsx` (prop `isAnonymous` + nota candado),
  `PaymentsResults.jsx` (prop + gate del grid por canal).
- `CombinedChannelSection.jsx` sin cambios — simplemente deja de montarse
  para anónimos.

## T4 — PDF bloqueado para anónimos ✅

**Antes:** cualquier visitante podía descargar el PDF del audit.
**Después:** el botón muestra candado para anónimos y redirige a
`/LoginGate?next=<informe>` (el informe se recupera tras login vía session
rescue). Autenticados: descarga intacta.

- Archivo: `DownloadAuditButton.jsx`.
- **No existe endpoint público de PDF del audit** — se genera client-side
  (`paymentsAuditPdf.js`). Defensa en profundidad: tras T2 el payload anónimo
  ya no contiene la tasa objetivo ni el desglose, así que ni saltándose la UI
  se obtiene el contenido reservado. `generateInvoicePdf` (facturas) es otro
  flujo, autenticado, fuera de alcance.

## T10 — Logotipo en la pantalla de carga ✅

**Antes:** `AnalyzingOverlay` mostraba una ilustración generada por IA
(`flowFrosted`) que renderizaba glifos/cuadrados corruptos; `LoadingScreen`
usaba el SVG de la "C".
**Después:** ambas pantallas usan el asset PNG oficial de la "C"
(`BRAND_ASSETS.cMarkVoltioPng`), proporciones intactas, sin reconstrucciones
con caracteres/iconos.

- Archivos: `AnalyzingOverlay.jsx`, `LoadingScreen.jsx`.

## T0 — Idioma: selector en móvil + autodetección ✅ (2026-07-29)

- **Autodetección** (`src/lib/i18n.jsx`): en la primera visita (sin elección
  guardada) el idioma se resuelve desde `navigator.languages` → fr/es/en.
  La detección NO se persiste — solo una elección manual escribe en
  localStorage, así el switcher siempre manda. Elecciones previas intactas.
- **Móvil** (`MobileNavMenu.jsx`): el `LanguageSwitcher` (antes solo en la
  navbar desktop) ahora aparece en la cabecera del menú móvil.

## T7 — CTA consolidada en el informe ✅ (2026-07-29)

**Antes:** el CTA principal del informe anónimo decía "Stop overpaying" y el
subcopy mencionaba el colectivo, pero el destino real era el registro
(`openDestination` ya redirige anónimos a signup). Copy y destino no coincidían.
**Después:** para anónimos el bloque dice "Create free account" + subcopy que
enumera lo que desbloquea (tasa alcanzable exacta, desglose de fees, plan de
recuperación) — UNA acción, alineada con los candados T2/T3/T4. Registrados y
verified sin cambios (collective/call/dashboard). Archivo: `PaymentsResults.jsx`
(solo copy del ctaBlock; cero cambios de routing).
Nota: la página del informe usa copy EN hardcodeado de forma consistente; la
nueva línea sigue ese patrón (la i18n completa de PaymentsResults es deuda
previa, fuera del alcance de UX-1).

## T8 — "draft pending" ✅ (verificado — ya no existe)

Revisión manual de las superficies candidatas: contenido legal EN/FR/ES
(terms/privacy/cookies), `Terms.jsx`, `LegalPageLayout`, `Pricing.jsx`,
`PublicFooter`, `Reports.jsx`, `Invoices.jsx`, `ResultsHistory.jsx` y el PDF
del audit (`paymentsAuditPdf.js`). Ningún texto "draft pending" / "draft
pending legal review" visible queda en el producto — fue eliminado en LEGAL-1
(los marcadores [REVISIÓN JURÍDICA] viven solo en el Decision Log interno,
nunca en UI). Nada que borrar.

---

## Tareas del chunk PENDIENTES (próximos turnos)

- **T5** — Rediseño de la pantalla de autenticación. ⚠️ Restricción de
  plataforma: el login/registro/OAuth lo gestiona Base44 (no hay formularios
  propios de credenciales); el rediseño se hará sobre `LoginGate` dentro de
  lo que la plataforma permite.
- **T6** — Verificación del upload de invoices/statements
  (`StatementUploadCard` + `processUploadedFile` + `getUploadCapability`).
- **T9** — Connect Infrastructure: solo Stripe + "upload your statements".

## Verificación

- Analyzer Online / In-store / Both: validación bloquea el submit sin email;
  con email válido el payload llega al backend y este lo exige de nuevo.
- Backend: `submitPaymentsAnalysis` responde 400 `field: 'email'` si falta o
  es inválido (single y combined).
- Teaser: respuesta sin `achievable_effective_bps` (null) y sin líneas
  "Achievable…" en assumptions.
- Vista Both anónima: un solo total + candado; registrada: desglose completo.
- PDF: candado + redirección a login para anónimos.