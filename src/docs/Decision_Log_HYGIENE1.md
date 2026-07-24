# Decision Log — HYGIENE-1 (Cierre de higiene delegable)

**Fecha:** 2026-07-24 · **Regla:** cero cambios en motor (3 copias), RLS, gates de auth o lógica de negocio. Cuatro tareas independientes, todas aplicadas.

---

## TAREA 1 — Blindaje del `dangerouslySetInnerHTML` de PeerBenchmark

**Antes:** `PeerBenchmark.jsx` inyectaba `t(calloutKey, { pct: displayPct, country: country || "" })` como HTML, con `displayPct` tomado tal cual de `computePaymentsBenchmark` y `country` sin restricción. Seguro hoy (diccionario propio + número calculado), pero frágil ante un cambio futuro de la clave.

**Después:**
1. **Comentario de advertencia** explícito sobre el bloque: la fuente debe ser SIEMPRE diccionario i18n + valores numéricos calculados; nunca input de usuario ni campos de la marca; si hiciera falta texto del merchant → refactor a JSX.
2. **Saneado de parámetros:** `displayPct = Number.isFinite(Number(rawPct)) ? Number(rawPct) : 0` y `safeCountry = /^[A-Z]{2}$/.test(country) ? country : ""`. La selección de clave (`_nocountry`) usa ahora `safeCountry`, así un country malformado cae al template sin país en vez de renderizar "in ".
3. **Salida visual idéntica:** el `.replace` del `<strong>` sigue operando sobre `~${displayPct}%` — para todo pct finito (el caso real siempre) el número es el mismo valor que antes, en los 3 idiomas (las claves `bench_callout*` interpolan `{pct}`/`{country}` idéntico en EN/FR/ES). El badge del header (`bench_regional`) es JSX de texto plano — no inyecta HTML, sin cambios.

## TAREA 2 — `rel="noopener noreferrer"` en `target="_blank"`

Los 12 hits del grep original eran de dos tipos: (a) 6 con `rel` correcto pero en la LÍNEA SIGUIENTE (falsos positivos del grep line-based — Navbar, MobileNavMenu, AdminLayout, ConnectIntegrations, ApiKeyConnectForm, ShopDomainCaptureForm) → atributos fusionados en una línea para que el criterio de aceptación sea greppeable; (b) 6 reales: `Vault.jsx` ×2 y `AdminContracts.jsx` (`noreferrer` sin `noopener` → completado), `AdminInvoices.jsx` y `Invoices.jsx` (sin `rel`, URLs Stripe externas → `noopener noreferrer`), `CompanyBlock.jsx` (`/Terms` interno → `noopener`, criterio del chunk para rutas internas).

**Criterio de aceptación (output literal):**
```
$ grep -rn 'target="_blank"' src/ --include="*.jsx" | grep -v noopener
CLEAN   (cero resultados)
```

## TAREA 3 — Límite de tamaño de body en endpoints públicos

**Patrón replicado de `oauthToken` (entry.ts:58-65):** check de `content-length` + check de `text.length` ANTES de parsear → **413**. Adaptación mínima: los endpoints del funnel devuelven `Response.json({error:'request_too_large'},{status:413})` (su convención de error propia) en vez del `errorResponse` OAuth-shaped de oauthToken.

- **Límite: 16KB en los cuatro.** Payload real del Analyzer combinado medido (online + in-store con todos los sliders + metadata de marca con brand_name de 120 chars y website de 120 chars): **564 bytes** → 16KB da ~29× de margen. No hace falta 32KB.
- `submitPaymentsAnalysis`: cap + `JSON.parse(bodyText)` (el catch `invalid_json_body` 400 se conserva).
- `getPaymentsGapTeaser`: cap solo en la rama POST (la rama GET no tiene body).
- `submitWaitlistSignup` y `submitCallRequest`: cap + parse tolerante (`catch → {}`) idéntico al comportamiento previo de `req.json().catch(()=>({}))`.
- `submitContactMessage`: **verificado, ya coherente** — `MAX_BODY_BYTES = 16 * 1024` propio con el mismo patrón. Sin cambios.

**Verificación empírica del funnel (2026-07-24):**
| llamada | resultado |
|---|---|
| submit online (Stripe/FR/GMV 30k/ticket 50/intl 15) | 200 · engine 1.6.0 · `stripe\|ANY\|EU` verified exact · annual point €2.763 |
| submit in-store (SumUp/ES/GMV 20k/ticket 25) | 200 · `sumup\|ANY\|EU-ES\|in_store` verified exact · `already_optimized` (multi-anchor winner smile_and_pay) |
| teaser (session del submit online) | 200 · snapshot + engine_result idénticos |
| waitlist (HTTP anónimo real) | 200 · `{ok:true, lead_id}` |
| call request | 200 · `{ok:true, lead_id}` |
| **body 20KB → submitPaymentsAnalysis** | **413** `{"error":"request_too_large"}` |
| **body 20KB → submitWaitlistSignup** | **413** `{"error":"request_too_large"}` |

Leads de prueba (`hygiene1-verify@cambra-test.dev`) borrados tras la verificación.

Nota de harness: `test_backend_function` bloquea `submitWaitlistSignup` por el secret opcional `WAITLIST_RATE_LIMIT_PER_HOUR` no configurado (la función tiene default en código) — pre-existente, verificado vía HTTP directo como hace el navegador.

## TAREA 4 — TODO multi-marca de `stripeOAuthConnect`

**Diagnóstico (cómo elegía la marca):** sin `brand_id` explícito, `Brand.filter({created_by}, '-created_date', 1)` → **la marca MÁS RECIENTE, en silencio**. Con dos marcas, el OAuth de Stripe se vincularía siempre a la última creada aunque el merchant quisiera conectar la primera: `StripeConnection`, `ConsentRecord` y el `stripeDataSync` inicial quedarían colgados de la marca equivocada → análisis "verificado" con los datos del negocio que no es. Con `brand_id` explícito ya se verificaba ownership (FIX 6) — ese camino no cambia.

**Fix aplicado (fallar ruidosamente antes que adivinar):** el fallback ahora pide 2 marcas; si `brands.length > 1` y no llega `brand_id` → **400 `{error:'multiple_brands', message:'Your account has more than one brand. Pass an explicit brand_id...'}`**. Cero escrituras antes del error.

**Caso mono-marca intacto:** mismo filter (solo cambia el limit 1→2), mismo `brands[0].id`, mismos errores para 0 marcas. Verificado por lectura del diff — no hay usuarios multi-marca reales hoy contra los que probar, y el path con `brand_id` explícito no se tocó.

**Backlog (NO construido — es producto):** selector de marca en la UI del connect flow: `StripeConnectCard` ya pasa `brand_id` cuando tiene brand context; faltaría (1) un picker cuando `getMyActiveBrand` devuelva >1, (2) manejar el error `multiple_brands` en el frontend con ese picker en vez del toast genérico, (3) decidir si el brand elegido se persiste como "activa" de la sesión. Hoy el error es inalcanzable desde la UI real (nadie tiene 2 marcas).

## VERIFICACIÓN FINAL
- Grep T2: cero resultados (output arriba).
- Funnel público: 4 submits + teaser en verde + dos 413 empíricos (tabla arriba).
- OAuth: mono-marca intacto, multi-marca → 400 accionable.
- Suite / lint / build: ver cifras al pie.

## FUERA DE ALCANCE (sin cambios)
Migración SDK · BUG-6 (`owner_email`) · reducción de superficie backend · Help trilingüe · 554 errores typecheck · selector de marca UI · fila PayPal guest checkout.