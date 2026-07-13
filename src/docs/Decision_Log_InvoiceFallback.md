# Decision Log — Fallback universal de facturas (FASE B)

> Extends `Decision_Log.md`. Read chronologically at the TOP of the canonical
> log ("most recent on top"). Documents the invoice-upload fallback chunk of
> 2026-07-13, including the FALSE-PREMISE CORRECTION the diagnosis surfaced.

---

## 2026-07-13 — Fallback universal de facturas · FASE B (UI/funnel honesta)

### Corrección de premisa (CRÍTICA — documentada por petición del operador)

El chunk se pidió como *"reutiliza el pipeline de facturas verified de M4
(upload 3 documentos → invoiceExtraction → layer2 → gap medido verified) y
extiéndelo al canal online por PSP"*. **Ese pipeline NO EXISTE.** El
diagnóstico Fase 1 (con citas archivo:línea) demostró que lo que hay son dos
piezas DESCONECTADAS:

1. **`processUploadedFile`** — extractor genérico de 3 capas (Layer 1 Anthropic
   gated · Layer 2 validators deterministas · Layer 3 OpenAI cross-check gated).
   Toma **UN** documento (`entry.ts:565`, `file_url` único), escribe a
   `PaymentsProfile`/`ShippingProfile`/`SaaSProfile`/`AnalyzerInput` — entidades
   del **motor viejo multi-vertical purgado** (`entry.ts:631-695`). **No produce
   gap, no promedia 3 facturas, no toca el path verified de payments.**

2. **`computeStripeVerifiedGap`** — el ÚNICO path verified real. Exclusivo de
   Stripe vía env keys (`entry.ts:1546-1552`: `stripe_self` / `stripe_self_test`,
   NO OAuth Connect). **No consume facturas** — lee balance_transactions de la
   API de Stripe.

**No hay puente entre (1) y (2).** "Subir 3 facturas → gap verified" no estaba
construido para ningún canal, ni online ni in-store. La coherencia inter-factura
("doble revisión entre las 3") tampoco existe: Layer 3 compara L1 vs L3 sobre
UN mismo documento, no factura-vs-factura.

**Corrección adicional del tablero de PSPs:** ni siquiera Stripe tiene OAuth
Connect self-service. Hoy funciona con env keys del operador (KNOWN_DEBT:
*"Stripe Connect: Missing app registration, Client ID/Secret, and real OAuth"*).
Verified vivo hoy = Stripe-por-operador. Cero PSP con OAuth self-service.

### Decisión: FASE B (no A, no C)

- **A (puente completo)** rechazada: construir el motor de ensamblaje
  verified-por-facturas (2+ funciones backend, coherencia inter-factura
  inexistente, flag, UI, tests) antes de lanzar y sin demanda real = el
  "construir en vez de lanzar" que se está evitando.
- **C (parar)** rechazada: el diagnóstico ya dio lo necesario para replantear.
- **B (capa UI/funnel honesta)** ELEGIDA: activar la tarjeta Upload + el selector
  Connect-vs-Upload por PSP con copy honesto, enchufando el `processUploadedFile`
  existente como PRIMER PASO. El motor de ensamblaje multi-factura queda
  explícitamente diferido a un chunk futuro gobernado por demanda real.

### Alcance real ejecutado en B

**Backend (1 función nueva, read-only):**
- **`getUploadCapability`** — sonda read-only. Lee `EXTRACTION_LLM_ENABLED` +
  `EXTRACTION_L3_ENABLED` (secrets no legibles desde el front) y devuelve
  `extraction_live` (bool). NUNCA ejecuta el extractor, NUNCA toca motor /
  computeStripeVerifiedGap / estimado / Stripe. Fail-closed: cualquier error →
  `extraction_live: false` → copy "coming soon". **Probado 2026-07-13**:
  `{ ok: true, extraction_live: true, layer1_enabled: true, layer3_enabled: true }`
  — el extractor está LIVE hoy, así que el copy es "in beta", no "coming soon".

**Frontend (2 componentes nuevos + 2 ediciones):**
- **`PspVerificationOptions.jsx`** (nuevo) — se renderiza bajo el selector de
  PSP. Regla: PSP con verified vivo → tarjeta "Connect {PSP}"; cualquier otro →
  tarjeta Upload statements. **Fuente de verdad = catálogo real**
  (`IntegrationCatalog.status === "live"`, hoy solo Stripe —
  `seedIntegrationCatalog:13`). NO se usa `auth_type` (miente: paypal/mollie
  dicen "oauth" sin flujo real). Set `LIVE_VERIFIED_PROVIDERS = {stripe}` en una
  línea para el futuro.
- **`StatementUploadCard.jsx`** (nuevo) — 3 estados honestos por `extraction_live`:
  `null` → skeleton; `false` → "Coming soon — get notified" (SIN input, sería
  no-op); `true` → upload beta real que llama `processUploadedFile` EXISTENTE
  (single-doc, primer paso). Copy explícito: "verified from statements — in
  beta", el número verified NO es inmediato, el equipo revisa antes.
- **`PaymentsAnalyzer.jsx`** (editado) — import + render de `PspVerificationOptions`
  bajo el `ProviderGrid` en single-channel (online/in_store). Combined fuera de
  scope (dos providers, sin selección única). Ancla `id="psp-selector"` para el
  scroll desde la tarjeta de entrada.
- **`AnalyzerEntryCards.jsx`** (editado) — la tarjeta "Upload" pasa de
  `enabled:false / "Coming soon"` (muerta) a `enabled:true / "In beta" /
  "Choose provider"`, que scrollea al selector de PSP donde vive la opción real.

### Copy honesto (condición #1 — verificado)

- Stripe → "Connect Stripe · Verified · measure your actual effective rate".
- Otros PSP + extractor ON → "Upload your last 3 {PSP} statements · In beta ·
  isn't instant yet · team reviews before it becomes verified".
- Otros PSP + extractor OFF → "Coming soon · your estimate above is instant and
  needs no upload". SIN input de archivo (evita prometer un no-op).
- NADA promete un gap verified inmediato por facturas.

### Restricciones respetadas (condiciones #3 + #4 — verificadas ex-post)

- **Motor de ensamblaje NO construido** — cero promediado, cero coherencia
  inter-factura, cero `calculateGap` con measured desde facturas. Diferido.
- **Cero cambios en motor 1.5.0 / `computeStripeVerifiedGap` / estimado / path
  Stripe.** El sync-check triple no se dispara (no se tocó ningún bloque SYNC).
- **`processUploadedFile` intacto** — sigue escribiendo donde escribía
  (`*Profile`/`AnalyzerInput`). NO se re-cableó al motor nuevo en este chunk.
- **Cero cambios en schemas o RLS.**
- **Suite 389/0/2** — los archivos nuevos son componentes visuales + 1 endpoint
  read-only sin unit tests directos; suite intacta por construcción.

### Deuda documentada residual

- **Motor de ensamblaje verified-por-facturas** (upload 3 → promediar →
  coherencia inter-factura → `calculateGap` verified → `PaymentsAnalysisVerified`):
  chunk futuro, gobernado por demanda real. El path verified 1.3.0 del motor
  YA existe y aceptaría `measured_current_bps` — lo que falta es el ensamblaje +
  la lógica de coherencia inter-factura.
- **OAuth Connect self-service real** (Stripe y resto): deuda real, no una tarde.
  Hoy verified = Stripe-por-operador (env keys). Para el lanzamiento no es
  bloqueante (el estimado cubre a todos; el verified Stripe funciona en modo
  operador manual).
- **`processUploadedFile` escribe a entidades del motor viejo purgado** — cuando
  se construya el motor de ensamblaje habrá que añadir una salida que devuelva
  `measured_current_bps` sin tocar esas escrituras (o un endpoint que lo envuelva).

---