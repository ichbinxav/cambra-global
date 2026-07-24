# Decision Log — CONSOLIDATE-1 (Higiene y documentación de superficie)

**Fecha:** 2026-07-24 · **Regla:** cero cambios en motor (3 copias), RLS, esquemas de entidad, lógica de negocio, migraciones o borrados. Cuatro tareas, todas aplicadas dentro de su carril.

---

## TAREA 1 — Manifiesto de funciones de producción (SURFACE-1 Fase 0)

- **Censo automatizado de las 141 funciones** (análisis estático: mecanismos de auth por grep, entidades tocadas, uso de service role, índice de callers en `src/`, cruce con las 6 automatizaciones programadas activas de plataforma).
- Generado **`src/docs/PRODUCTION_FUNCTIONS.md`**: clasificación A(31) / A-API(6) / B(76) / C(6) / D(11) / E(16, QUARANTINE 15-ago) / F(1), con auth, SR, entidades y caller por función. NADA borrado ni archivado.
- Tripwire **`src/lib/productionFunctions.static.test.js`** (mismo patrón fs-estático que tenantGuard): falla ante función nueva no censada Y ante función censada que desaparece. **Verificado: 141/141, 0 duplicados, 0 sin listar, 0 stale.**
- Hallazgos anotados en el manifiesto (no tocados): `getBenchmarkForReport` sin gate detectado (agregado sin PII — revisar en SURFACE-1); 7 funciones internas sin caller en src (candidatas a revisión PURGE-2, incl. `stripeDisconnect` legado y los triggers `onBrandCreated`/`onSavingsEvidenceEvent` sin automatización registrada).

## TAREA 2 — Protección de doble-submit (DATA-1 A, solo frontend)

Auditados los handlers de registro/onboarding/contacto/connect/claim. **Antes → después:**

| Handler | Antes | Después |
|---|---|---|
| PaymentsAnalyzer `handleSubmit` | botón disabled ✓, sin guard | + `if (submitting) return` primera línea |
| JoinWaitlistButton `handleSubmit` | botón disabled ✓, sin guard | + `if (state==="submitting") return` |
| StripeConnectCard `handleConnect`/`handleSync`/`handleDisconnect` | botones disabled ✓, sin guard | + `if (busy) return` en los tres |
| PaymentsModule (onboarding) `save` | setSaving ✓ pero sin guard, y saving quedaba wedged si el create fallaba | + `if (saving \|\| !brandId) return` + try/finally que libera saving |
| ApiKeyConnectForm `handleSubmit` | disabled vía `canSave` (estado del padre, lag de 1 render) | + ref-guard same-tick (`submitRef`) con try/finally |
| ShopDomainCaptureForm `handleSubmit` | ídem | ídem |

**Ya conformes (sin cambios):** Contact (`if (submitting) return` + disabled), BookCallModal y CollectiveModal (`canSubmit` incluye `status!=="submitting"` + disabled), StripeConnectCard `handleRunVerifiedAnalysis` (`if (computing) return`), claim post-login en AuthContext (once-guard módulo `claimInFlight`). **Fuera de scope de la tarea:** Vault saveMeta/addLink (dashboard interno, no en la lista registro/onboarding/contacto/connect/claim). NO se tocó idempotencia backend ni el Brand duplicado.

## TAREA 3 — Controles de ficheros subidos (DATA-1 E)

**Controles YA existentes en `processUploadedFile` + flujo StatementImport (verificados):**
- Frontend `StatementUploadCard`: `accept=".pdf,.csv,.png,.jpg,.jpeg,.xlsx"` (allowlist de UI).
- L1/L3 solo procesan pdf/imagen; CSV/XLSX van por otros paths; extensión desconocida → `format_unknown`, nunca crash.
- Fallo de parseo seguro en todas las capas: JSON malformado del LLM → `null` → degrada, nunca lanza.
- Doble gate LLM cerrado-por-defecto (`EXTRACTION_LLM_ENABLED` / `EXTRACTION_L3_ENABLED`).
- Ownership de brand verificado (`created_by` + 403); campos rechazados jamás entran en escrituras canónicas.

**APLICADO (validación de input pura):**
1. **Allowlist de extensiones** en el handler: extensión fuera de `csv|xlsx?|pdf|png|jpe?g|webp|gif|json` → **400 `unsupported_file_type`**. Verificado empíricamente: `.exe` → 400.
2. **Tope de 15MB** tras el fetch en L1 y L3 (una línea cada uno) → degrada a `format_unknown`, protege memoria del worker.

**HALLAZGO-PARA-BACKLOG (no tocado — toca red/almacenamiento):**
- **SSRF en `file_url` (severidad alta):** el backend hace `fetch(file_url)` con URL suministrada por el cliente (con extensión pdf/imagen). Mitigación correcta = allowlist de host a storage de plataforma — ya en backlog TRUTH-1, reconfirmado aquí.
- **Sin validación MIME/firma (media):** la detección es por extensión; un binario renombrado `.pdf` llega al LLM (que degrada, pero consume tokens). Requiere sniff de magic bytes.
- **Sin tope de tamaño en el upload previo (baja):** `UploadFile` de plataforma no se controla desde la app; el cap de 15MB aplicado cubre el consumo posterior.

## TAREA 4 — Cabeceras de seguridad desde el repo (PROD-1 A)

**APLICADO en `index.html`:** `<meta name="referrer" content="strict-origin-when-cross-origin">` — única cabecera defensiva que los navegadores honran como meta tag; sin riesgo de romper nada (solo recorta el referrer saliente cross-origin).

**NO aplicado, con motivo:**
- **CSP vía `<meta http-equiv>`:** técnicamente posible (excepto `frame-ancestors`/`report-uri`) pero la regla del chunk exige probarla contra Analyzer + fuentes autoalojadas + storage de Base44 + Stripe antes de activarla → **backlog CSP-1** con inventario previo de orígenes (base44.app storage, media.base44.com, api backend, Calendly popup).
- **`X-Content-Type-Options: nosniff` y `Permissions-Policy`:** los navegadores IGNORAN su forma meta — son HTTP-header-only. → panel Base44.
- **HSTS y `frame-ancestors` reales:** header-only, controlados por plataforma. → panel Base44.

**Instrucción para el founder (panel Base44 / soporte):** solicitar en la configuración del dominio `cambra.global`: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (refuerzo del meta), `Permissions-Policy: camera=(), microphone=(), geolocation=()` y CSP con `frame-ancestors 'self'`. Si el panel no expone cabeceras, contactar con soporte de Base44.

## VERIFICACIÓN FINAL

- Manifiesto 141/141 + tripwire en verde (0 unlisted / 0 stale / 0 dupes).
- Handlers T2 listados antes/después (tabla arriba); todos los botones afectados ya tenían `disabled` vinculado.
- Ficheros: allowlist → 400 verificado empírico; caps de 15MB aplicados; 3 hallazgos a backlog con severidad.
- Cabeceras: meta referrer aplicado; funnel anónimo re-verificado tras los cambios (submit 200, motor 1.6.0 intacto).
- Suite/lint/build: no ejecutables en sandbox (limitación conocida); verificación sustitutiva = tripwires estáticos ejecutados vía Node + prueba HTTP del funnel + revisión de diff (todas las ediciones frontend son guards de 1-3 líneas).

## FUERA DE ALCANCE (confirmado sin tocar)

TENANT-1 (migración+backfill+RLS) · borrado de cliente · retención de sesiones anónimas · corrección Stripe sync · TYPES-1 · borrado real de funciones (15-ago) · idempotencia backend · Brand duplicado (FK).