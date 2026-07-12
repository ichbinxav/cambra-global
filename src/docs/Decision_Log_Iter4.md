# Decision Log · Iter 4 — M4-refinado (v1.5.0)

> **Date sealed:** 2026-07-12 · **Owner:** Xavi + Base44 chief-of-staff
> **Engine version bumped:** `payments-gap-1.4.0` → `payments-gap-1.5.0`
> **SYNC block char delta:** 39,904 → 62,967 (+23,063 chars)

## 1 · Scope

Two capabilities land in v1.5.0. Both are **in-store only** (online path stays
byte-identical to 1.4.0 — retrocompat oracle locked with the Stripe EU
`226.25 / 149.5 / annual {6140, 7675, 9210}` fixture).

1. **Multi-anchor achievable selection.** In-store achievable is picked by
   MIN-EFFECTIVE across every verified in-store anchor in the merchant's
   region, evaluated at THEIR ticket. The winner is a real, publicly
   contractable provider — no interpolated theoretical rates.
2. **Deterministic 3-state classification** written onto every engine result:
   `savings_opportunity | already_optimized | insufficient_data`. Combined
   submits get an additional top-level `combined_classification` following a
   sealed precedence rule.

## 2 · Classifier matrix — SEALED

| # | Annual gap vs threshold | Row provenance | Ticket / pool state | → Classification |
|---|---|---|---|---|
| A | Material (> threshold) | Verified | Ticket present | `savings_opportunity` |
| B | Material (> threshold) | **Fallback** | Ticket present | **`savings_opportunity`** |
| C | Small (≤ threshold) | Verified | Ticket present | `already_optimized` |
| D | Small (≤ threshold) | **Fallback** | Ticket present | **`insufficient_data`** |
| E | Any | Any | **Ticket absent** | `insufficient_data` |
| F | Any | Any | `in_store` + pool empty | `insufficient_data` |

**Threshold:** `MAX(€200 absolute, 15 bps × monthly_gmv × 12 relative)` — the
LARGER of the two. Semantics **≤** — exactly at threshold counts as a
victory (rows C/D). Sealed with Xavi 2026-07-12.

**Precedence when multiple conditions apply:** row E first, row F second,
then the C/D/A/B trio.

## 3 · Combined-mode aggregator — SEALED

Precedence rule:

```
savings_opportunity > insufficient_data > already_optimized
```

* **Any channel `savings_opportunity`** → combined `savings_opportunity`.
  Total sums lo/point/hi across **only** the opportunity channels.
  Optimized channels contribute €0. Insufficient channels contribute €0.
  Per-channel classifications are preserved in the response so Results can
  render the mini-victory ("✓ Already at the best contractable rate") next
  to the recoverable channel's number.
* **Zero opportunity + at least one insufficient** → combined `insufficient_data`.
  Never claim global victory when we couldn't evaluate a channel.
* **All channels `already_optimized`** → combined `already_optimized`.

## 4 · The `verified=false` hotfix

**First draft (2026-07-12 morning):** classifier returned `insufficient_data`
unconditionally whenever `row_verified === false`. Reviewed same day —
would have killed the estimated funnel for every merchant on a bank TPV,
every RoW merchant, and every `other`-provider selection.

**Corrected literal (source `src/lib/paymentsGap.js`, line ~682):**

```js
if (belowThreshold) {
  return row_verified ? "already_optimized" : "insufficient_data";
}
return "savings_opportunity";
```

The corrected rule: `verified=false` **only** blocks `already_optimized`
(rows C↔D) and downgrades **zeros** to `insufficient_data`; a **material
gap** on a fallback row is still `savings_opportunity` (row B) — because
the fallback row already ships `FALLBACK_ASSUMPTION` verbatim next to the
number, so the merchant reads the caveat inline.

## 5 · Multi-anchor rules

Pool composition (in-store only):
- `verified === true`
- `channel === "in_store"`
- `region === merchant's region`
- `achievable_breakdown_json.anchor_provider` present
- `provider_slug !== merchant's current provider` (never recommend
  migrating to yourself)

Empty pool → engine falls back to `row.achievable_*` (regional fallback rows
carry a documented anchor). Winner emitted verbatim in
`result.benchmark_resolution = { method: "multi_anchor_min_effective",
avg_ticket_eur, ticket_source: "declared", candidates, winner,
winner_effective_bps, confidence }`. `confidence: "high"` requires ≥2
candidates AND `row.verified === true`. Any weakness → `"reduced"`.

Ticket-driven breakpoint verified in tests:
- €10 ticket EU → SumUp wins (fixed-fee drag beats Stripe Terminal below ~€17)
- €50 ticket EU → Stripe Terminal wins
- €100 ticket EU → Stripe Terminal wins comfortably

## 6 · Byte-parity triple

Motor lives in three files; SYNC block char-identical in all three:

| File | Block chars | Roundtrip matches src |
|---|---|---|
| `src/lib/paymentsGap.js` (SOURCE) | 62,967 | — |
| `base44/functions/submitPaymentsAnalysis/entry.ts` | 62,967 | ✅ |
| `base44/functions/computeStripeVerifiedGap/entry.ts` | 62,967 | ✅ |

`src/lib/syncEngine/__sync_check__.test.js` — **8 passed, 2 skipped (unrelated structural drift)**, 33 ms.

## 7 · Retrocompat oracle

Case Stripe / EU / online / GMV€1M-yr / ticket€50 / intl15%:

| Metric | 1.4.0 | 1.5.0 | Match |
|---|---|---|---|
| `current_effective_bps` | 226.25 | 226.25 | ✅ |
| `achievable_effective_bps` | 149.5 | 149.5 | ✅ |
| `annual.point` | 7675 | 7675 | ✅ |
| `annual.lo` | 6140 | 6140 | ✅ |
| `annual.hi` | 9210 | 9210 | ✅ |
| `benchmark_resolution` | absent | absent | ✅ |
| `classification` | (n/a in 1.4.0) | `savings_opportunity` | new field |

## 8 · Files touched

**Source of truth:** `src/lib/paymentsGap.js`
**Mirrors:** the two Deno functions above.
**UI:** `src/pages/PaymentsResults.jsx` (branches per classification),
`src/components/paymentsResults/OptimizedHero.jsx` (new),
`src/components/paymentsResults/CombinedGapHero.jsx` (mini-victory + honest sum).
**i18n:** `src/lib/i18n.jsx` — 10 new keys × 3 locales = 30 slots.
**Tests:** `src/lib/paymentsGap.classifier.test.js` (new, 3 families × N cases).

## 9 · Post-deploy verification — 2026-07-12 evening

**Diagnóstico del stale runtime.** Tras el bump a 1.5.0, el sandbox Deno de
Base44 siguió sirviendo 1.4.0 durante ~40 s pese a que los `entry.ts` en disco
llevaban 1.5.0 (`has_1_5_0_string: true` en las 3 copias, SYNC block byte-
idéntico). Descartado fallo de parse silencioso mediante:
1. **Scanner regex-aware** sobre ambos `entry.ts`: balance perfecto
   (curly 0 / paren 0 / square 0). El paren=1 inicial del scanner naif era
   falso positivo por no saltar RegExp literals (`/^https?:\/\//i`).
2. **Deploy probe:** añadido `__deploy_probe: "PROBE_20260712_A"` al response
   handler. Tras touch de whitespace en ambos `entry.ts` + 25 s → la probe
   apareció **junto con `engine_version: "payments-gap-1.5.0"` y
   `classification` presente**. Prueba definitiva de que el redeploy ocurre
   pero necesita un touch explícito + ~40-50 s cumulativos, no ~20 s.
3. Probe retirada tras confirmación; deploy limpio de vuelta.

**Regla operativa añadida a KNOWN_DEBT** (patrón repetitivo, no bug de código):
> "Base44 sandbox — cambios sólo en constantes o strings dentro de `entry.ts`
> pueden requerir touch de whitespace + ~40 s para propagar al runtime Deno.
> Verificar SIEMPRE con probe `__deploy_probe` cuando el cambio sea de tipo
> version-bump-only, antes de correr tests end-to-end."

**5 casos reales contra 1.5.0 en producción** (cita literal de responses):

| # | Payload | engine_version | classification | benchmark_resolution.winner | annual point |
|---|---|---|---|---|---|
| 1 | Bank TPV Boutique €40k/€60/ES/in_store | `1.5.0` ✅ | `savings_opportunity` | `smile_and_pay` @ 155 bps | €3,420 |
| 2 | Cafetería €20k/€10/FR/in_store | `1.5.0` ✅ | `savings_opportunity` | `smile_and_pay` @ 155 bps | €1,860 |
| 3 | Boutique €60k/€120/FR/in_store | `1.5.0` ✅ | `savings_opportunity` | `stripe_terminal` @ 148.33 bps | €5,460 |
| 4 | Stripe EU €83k/€50/15% online (retrocompat) | `1.5.0` ✅ | `savings_opportunity` | (online — n/a) | €7,675 |
| 5 | Combined DTC€50k + popup€20k FR | `1.5.0` ✅ | (heredado top) | (per-channel) | €6,312 (total) |

**Retrocompat oracle CLAVADO** (Case 4): `226.25 / 149.5 / annual {6140, 7675, 9210}` — **byte-idéntico** a 1.4.0 y a 1.3.0 desde producción.

**Descubrimiento empírico del corte.** El pool multi-anchor EU en la tabla
deployada tiene **3 candidatos verificados** (`smile_and_pay`,
`stripe_terminal`, `sumup`) — no 2 como el fixture local. Smile & Pay a
1.55% flat gana a tickets bajos/medios donde el fixed-fee drag de Stripe
Terminal (`+ €0.10`) domina. La aritmética publicada en el response
confirma que el breakpoint es correcto:
- €10 ticket: Smile 155 < SumUp 175 < Stripe Terminal 240 → Smile gana
- €60 ticket: Smile 155 < Stripe Terminal 156.67 < SumUp 175 → Smile gana por 1.67 bps
- €120 ticket: Stripe Terminal 148.33 < Smile 155 < SumUp 175 → **Stripe Terminal gana** (breakpoint disparado)

Los tests locales (que sí usan un fixture de 2 anchors) siguen siendo
válidos como oracle de la LÓGICA del selector; los responses de producción
son el oracle de la SELECCIÓN real dada la tabla actual. Ambas están
coherentes.

**Corte 2 sellado con el motor 1.5.0 verificado en producción, no en disco.**

## 10 · /ForProviders v2 resurrection (2026-07-12 · post-M4)

**Decisión de producto.** Xavi revierte la resolución §8 de Fase 1 (que había dejado `/ForProviders` como `<Navigate to="/" />` y §8 huérfano en Terms). `/ForProviders` vuelve como página viva, payments-only, con modelo de dos niveles (Listed / Partner).

**Modelo articulado en la página.**
- **Tier 1 — Listed:** pricing público del proveedor → entra en el benchmark achievable (`PaymentsRateTable` verified=true). Auditabilidad no negociable: source URL + source quote citable. Sin fee, sin exclusividad, sin compensación bilateral.
- **Tier 2 — Partner:** tarifa exclusiva para merchants CAMBRA (mejor que public) + acuerdo referral. La oferta se presenta en Results como slot "CAMBRA exclusive offer" — **etiquetado explícitamente**, visual y semánticamente separado del benchmark público.

**Restricciones DURAS respetadas en el chunk (verified RAW).**
1. Cero cambios en motor `paymentsGap` (versión sigue `1.5.0`, sync-check triple byte-idéntico).
2. Cero cambios en `PaymentsRateTable` (schema y contenido intactos).
3. Cero cambios en paths verified (`getPaymentsAnalysisVerified`, `computeStripeVerifiedGap`, `submitPaymentsAnalysis`).
4. Cero UI construida en `/Results` — la coherencia con Partner es SOLO documentación de diseño futuro (§10.1 abajo).
5. Cero cifras de red fabricadas en el copy (grep confirmado: único hit "X merchants" es un comentario negando la regla, no una cifra real).
6. Cero menciones shipping/SaaS en la página.

### 10.1 · Diseño del slot "CAMBRA exclusive offer" en /Results — SIN CONSTRUIR HOY

Documentado aquí para el chunk futuro (bloqueado por firma del primer Partner real, ver KNOWN_DEBT nueva entrada). El diseño obliga a `/Results` a preservar la auditabilidad del benchmark público:

**Posición.** Slot NUEVO en `/Results`, DEBAJO del hero de gap (`PaymentsGapCard` / `CombinedGapHero` / `OptimizedHero` — según classification), ANTES de `FeeBreakdownCard`. Nunca reemplaza al hero — se añade como capa comercial adicional.

**Contenido.** Card visualmente distinto del hero: fondo navy con acento cyan matching de la eyebrow del tier Partner en `/ForProviders`. Label pill obligatoria *"CAMBRA exclusive"*. Content = nombre del partner + tarifa exclusiva completa (percent + fixed + rental si aplica) + delta contra el achievable del benchmark → *"You'd save an additional €X/yr on top of the public floor"*.

**Regla intocable — auditabilidad.** El motor sigue calculando `achievable_effective_bps` con la lógica multi-anchor sobre el pool público (regla §5 de este documento). El Partner offer NUNCA se pliega en ese cálculo. El slot lo COMPARA con el achievable público y presenta la delta positiva encima. Consecuencia lógica: si el Partner NO batiría al achievable público (ej. su tarifa exclusiva sigue peor que el multi-anchor winner porque el ticket del merchant favorece a otro proveedor), el slot **no se renderiza** — porque no ofrece valor real. Auditoría honesta: la herramienta no muestra Partner offers que no ayudan al merchant, sean quienes sean.

**Datos.** Nueva entity `PartnerAgreement` (nombre, tarifa exclusiva, canal online/in_store, región, fechas de vigencia). `submitPaymentsAnalysis` resolvería el Partner offer aplicable durante el mismo flow del engine result y lo emitiría en `engine_result.partner_offer` (opcional, ausente cuando no aplique).

**Gate frontend.** `PaymentsResults.jsx` renderiza `<PartnerOfferSlot />` solo si `engine_result.partner_offer` viene poblado. Sin partner offer → nada nuevo bajo el hero (`FeeBreakdownCard` sigue directamente).

**Combined mode.** Si el submit es combined y hay Partner offers aplicables por canal, cada canal tiene su propio partner slot (o ninguno). La aritmética del combined hero (`combined_savings = sum(opportunity channels)`) NO absorbe los partner deltas — el partner delta se muestra separado por canal, como capa adicional. El total público sigue siendo el total público.

**Cuándo se construye.** Bloqueado por firma del primer acuerdo Partner real. Antes de eso: cero UI, cero entity, cero data. Se construye con el partner real sentado en la mesa para no producir mockups que envejecen ni tests que verifican fixtures ficticios. Ver KNOWN_DEBT entrada `"Primer acuerdo Partner pendiente"`.

## 11 · Funnel fixes pre-launch (2026-07-12)

Dos fixes de UX descubiertos en el walkthrough final del análisis in-store, ambos afectan conversión antes del lanzamiento. Cero cambios de motor, cero cambios de benchmark, cero cambios de paths verified.

### 11.1 · #1 CRÍTICO — Pérdida del análisis anónimo al crear cuenta

**Síntoma.** Merchant anónimo hace el análisis, ve el gap, pulsa el CTA "Stop overpaying" para desbloquear el detalle, entra al signup Base44, vuelve autenticado… y aterriza en el **Analyzer vacío**. El análisis anónimo se pierde en el redirect. Rotura del funnel exactamente en el momento de conversión.

**Causa raíz — RAW cita del bug (pre-fix), `src/pages/PaymentsResults.jsx`:**
```jsx
onClick={() => navigate(isVerifiedMode ? "/Dashboard" : "/LoginGate?next=/Analyzer")}
```

El botón envía al usuario a `/LoginGate?next=/Analyzer`. `LoginGate` lee `?next=` y llama `base44.auth.redirectToLogin("/Analyzer")` — el `anon_session_id` (que estaba en la URL actual `/Results?session=<uuid>`) se descarta al construir el `next=`. Tras el login, Base44 devuelve al usuario a `/Analyzer` limpio.

**Por qué el fix es puramente URL-plumbing.** `getPaymentsGapTeaser/entry.ts` corre bajo `base44.asServiceRole` y **no** verifica auth para leer una session (verified RAW: `teaser_endpoint_requires_auth: false, teaser_endpoint_uses_service_role: true`). Preservar `?session=<uuid>` en el `next=` es suficiente: la misma URL de Results funciona idéntica antes y después del login. Sin cambios de backend, sin cambios de RLS, sin cambios de reader.

**Fix aplicado.** `PaymentsResults.jsx` CTA "Stop overpaying" reescrito:
```jsx
onClick={() => {
  if (isVerifiedMode) { navigate("/Dashboard"); return; }
  const currentPath = window.location.pathname + window.location.search;
  navigate(`/LoginGate?next=${encodeURIComponent(currentPath)}`);
}}
```

`window.location.search` incluye `?session=<uuid>`; `encodeURIComponent` protege el `?` interno del `next=` para que sobreviva el parse en `LoginGate`. `LoginGate.safeAbsoluteUrl()` ya acepta rutas absolutas del mismo origen (verificado, sin cambios).

**Flujo end-to-end tras el fix.**
1. Merchant anónimo submite Analyzer → recibe `anon_session_id` → `navigate("/Results?session=<uuid>")`.
2. Ve el gap en Results (teaser). Pulsa "Stop overpaying".
3. Handler compone `currentPath = "/Results?session=<uuid>"` → `navigate("/LoginGate?next=%2FResults%3Fsession%3D<uuid>")`.
4. `LoginGate` decodifica `next` → `redirectToLogin("/Results?session=<uuid>")`.
5. Base44 login (Google / email) → callback vuelve a `/Results?session=<uuid>` con user autenticado.
6. `PaymentsResults` monta, lee `session` de la URL, llama `getPaymentsGapTeaser({ anon_session_id })` (mismo endpoint, service-role, agnóstico de auth), rehidrata su gap.
7. El usuario aterriza en **SU report**, mismo número, ahora firmado. Sin pérdida.

**Nota sobre claim al brand.** El flujo NO ejecuta claim automático del `anon_session_id` al nuevo brand (esa deuda vive en Decision_Log histórico como flujo separado). Preservar el resultado ES el fix del momento de conversión; el claim opcional a un brand persistente es una capa distinta que puede añadirse después sin volver a romper este funnel.

### 11.2 · #2 — Reubicar el detalle de assumptions al gate correcto

**Síntoma.** El bloque "Assumptions" completo (lista de amortización de fixed fee, achievable anchor, clarifier de las dos bandas, engine version + cohort key + match type) se mostraba **igual en el teaser anónimo que en el report completo**. Sobrecarga cognitiva antes del gate de sign-up: el usuario ve el gap → intenta procesar 4 assumptions técnicas y una nota meta sobre bandas ± → se distrae del CTA de conversión.

**Diagnóstico.** El contenido detallado es correcto y auditable (parte del compromiso M4-refinado), pero el LUGAR está mal. El teaser anónimo debe optimizar para conversión ("aquí está tu gap, crea cuenta para ver el detalle"); el detalle vive en el report post-signup donde el usuario está comprometido.

**Fix aplicado — `src/components/paymentsResults/AssumptionsFootnote.jsx`:**
- Nueva gate `isVerifiedMode = engineResult?.mode === "verified"`.
- Modo `verified` (usuario autenticado con datos reales de Stripe) → **detalle completo** intacto (lista + clarifier de bandas + engine metadata).
- Modo `estimated` (teaser anónimo o combined estimated) → **una sola línea con candado**: *"Full audit trail — how we amortized the fixed fee, which anchor we compared against, and the confidence bands — appears in your report after you create a free account."*
- El disclaimer "regional estimate" cuando `verified=false` (fila fallback) **SIGUE VISIBLE en ambos modos** — es un warning, no metodología. Sin él, el teaser mentiría por omisión.

**Cero cambios en:**
- El motor emite el mismo array `assumptions[]` en ambos modos (verificado).
- `FeeBreakdownCard` parsea assumptions independientemente y sigue funcionando (no toca `AssumptionsFootnote`).
- El hero (`PaymentsGapCard`, `CombinedGapHero`, `OptimizedHero`) y el CTA principal, intactos.

### 11.1.bis · Ampliación (2026-07-12, misma sesión) — el redirect post-signup sí perdía la URL

Xavi reprodujo el bug en vivo tras aplicar la 11.1 y confirmó el síntoma: análisis anónimo → CTA "Stop overpaying" → login/signup con email nuevo → aterriza en `/` (landing), no en su Results. El fix 11.1 preservaba `?session=<uuid>` en `next=`, pero el usuario seguía perdiéndose.

**Causa raíz definitiva — RAW cita del SDK Base44, `node_modules/@base44/sdk/dist/modules/auth.js` línea 2961:**

```js
redirectToLogin(nextUrl) {
    const redirectUrl = nextUrl
        ? new URL(nextUrl, window.location.origin).toString()
        : window.location.href;
    const loginUrl = `${options.appBaseUrl}/login?from_url=${encodeURIComponent(redirectUrl)}`;
    window.location.href = loginUrl;
}
```

El SDK codifica el `nextUrl` como `from_url` en la URL de `/login` de Base44. La plataforma Base44 respeta `from_url` **en la rama de LOGIN** (usuario con cuenta existente), pero **puede descartarlo en la rama de SIGNUP** (creación de cuenta nueva) — que es exactamente el caso del CTA "Stop overpaying" cuyo propósito es convertir anónimos en usuarios. Ese comportamiento es server-side de Base44 y no controlable desde el SDK.

**Fix — defensa en profundidad, dos capas.**

- **Capa A (URL — ya en 11.1):** `?next=/Results?session=<uuid>` cubre la rama de login existente.
- **Capa B (localStorage — nueva):** justo antes de disparar `redirectToLogin`, `PaymentsResults` persiste el `anon_session_id` en `localStorage.cambra_pending_anon_session`. `AuthContext.checkUserAuth` lee esa clave inmediatamente después de confirmar autenticación, la borra, valida shape UUID v4, y si el usuario NO está ya en `/Results?session=...` lo redirige con `window.location.replace`. Cubre la rama de signup donde `from_url` se pierde.

**Idempotencia y no-loops.**
- `removeItem` se ejecuta ANTES del navigate → un segundo login no reintenta el rescate.
- Guardia `onResults` → si Base44 SÍ respetó `from_url` (rama login OK), no re-navega encima.
- Guardia UUID v4 → un valor manipulado en localStorage no produce navegación arbitraria (el reader `getPaymentsGapTeaser` ya valida UUID v4 server-side; el guard cliente-side es defensa adicional).
- Cero backend: `getPaymentsGapTeaser` sigue siendo service-role y agnóstico de auth (verified RAW: `teaser_endpoint_requires_auth: false`).

**Alternativas descartadas.**
- Backend-side: guardar `anon_session_id → user_email` post-signup vía webhook de Base44 → complejidad alta, requiere hook en auth flow de plataforma no expuesto en SDK, no escala a signups Google (no email hasta después de OAuth).
- Cookie con SameSite=Lax: rechaza cross-site en Safari ITP, y el signup redirige a un origin distinto de la app; `localStorage` es más simple y sobrevive la ida-vuelta de mismo origen.

### 11.3 · Verificación RAW (post-fix)

Ejecutada por `exec_tool` sobre los archivos modificados:

| Check | Valor |
|---|---|
| `fix1_preserves_url` (currentPath + encodeURIComponent presentes) | ✅ true |
| `fix1_old_broken_path_still_present` (`"/LoginGate?next=/Analyzer"` literal) | ✅ false — eliminado |
| `fix2_verified_gate_present` (`isVerifiedMode = engineResult?.mode === "verified"`) | ✅ true |
| `fix2_teaser_lock_line` (`"Full audit trail —"` presente) | ✅ true |
| `fix2_conditional_render` (`{isVerifiedMode ? (` presente) | ✅ true |
| `teaser_endpoint_requires_auth` (getPaymentsGapTeaser gate de auth) | ✅ false — session-only |
| `teaser_endpoint_uses_service_role` (asServiceRole) | ✅ true — funciona ambos lados del login |

**Verificación adicional Capa B (11.1.bis):**

| Check | Valor |
|---|---|
| `layerB_writes_pending_key` (`localStorage.setItem("cambra_pending_anon_session", …)` en Results) | ✅ true |
| `layerB_reads_pending_key` (`localStorage.getItem` en AuthContext) | ✅ true |
| `layerB_removes_after_read` (removeItem antes de navigate — no re-loop) | ✅ true |
| `layerB_uuid_guard` (regex UUID v4 antes de aceptar) | ✅ true |
| `layerB_avoids_pingpong_on_results` (skip si ya está en `/Results?session=…`) | ✅ true |
| `layerB_navigates_to_results` (`window.location.replace('/Results?session=…')`) | ✅ true |
| `layerB_only_after_auth_succeeds` (rescate tras `setIsAuthenticated(true)`) | ✅ true |

### 11.4 · Flujo end-to-end tras el doble fix

**Rama LOGIN (cuenta existente, `from_url` respetado por Base44):**
1. `/Results?session=<uuid>` → click "Stop overpaying".
2. Layer B escribe `localStorage.cambra_pending_anon_session = <uuid>`.
3. Layer A: `navigate("/LoginGate?next=%2FResults%3Fsession%3D<uuid>")`.
4. `LoginGate.redirectToLogin("/Results?session=<uuid>")` → SDK arma `/login?from_url=/Results?session=<uuid>`.
5. Base44 login → callback vuelve a `/Results?session=<uuid>`.
6. `AuthContext.checkUserAuth` OK, lee `pending`, ve que ya está en `/Results?session=…`, no re-navega, sólo borra la clave.
7. `PaymentsResults` monta, lee `session` de la URL, rehidrata → **report poblado**.

**Rama SIGNUP (cuenta nueva, `from_url` descartado por Base44):**
1. Pasos 1-4 idénticos.
2. Base44 signup con email nuevo → callback devuelve al usuario a `/` (landing, `from_url` perdido).
3. Landing es pública, `AuthContext.checkUserAuth` corre igual y setea `isAuthenticated=true`.
4. Layer B detecta `pending`, borra la clave, no está en `/Results`, hace `window.location.replace('/Results?session=<uuid>')`.
5. `PaymentsResults` monta con `session=<uuid>` → **report poblado**.

Cero pérdida en ambas ramas, cero ping-pong si el rescate se dispara sobre un `/Results` ya bueno, cero backend, motor 1.5.0 intocado.