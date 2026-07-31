# Decision Log — CHUNK COPY-2A

**Fecha:** 2026-07-31 · **Alcance:** copy del flujo Analyzer → Results (+ PDF). Cero cambios en motor, umbrales, entidades, campos o rutas.

**Paridad i18n:** 601 → **617 claves por idioma** (EN = FR = ES). +16 claves nuevas: 1 leyenda Verificado/Estimado + 15 del bloque `fee_*`. Sin claves huérfanas, faltantes ni duplicadas.

**Tests de contrato:** grep sobre `src/**/*.test.js` buscando aserciones sobre estas cadenas → **ninguna**. No he tocado ningún test.

---

## TAREA 1 + 2 — Terminología y brevedad

### Bloque "Tus pagos, desglosados" (PaymentsDataInsights)

| Clave | Antes (ES) | Después (ES) |
|---|---|---|
| `ins_gmv_label` | Volumen con tarjeta (GMV) | **Ventas con tarjeta** |
| `ins_effective_label` | Tasa efectiva | **Lo que pagas** |
| `ins_effective_note` | El {pct}% de tu GMV se va en comisiones de pago. | El {pct}% de tus ventas con tarjeta se va en comisiones. |
| `ins_currentrate_title` | Tu tasa, desglosada | **Lo que pagas, desglosado** |
| `ins_currentrate_sub` | "Pagas {rate}: {floor} es suelo regulado que no se mueve, y {movable} es tu zona optimizable — ahí está el dinero recuperable." | **Partida en tres frases:** "Pagas {rate}. De eso, {floor} lo fija la ley y no se mueve. El otro {movable} es donde está el dinero recuperable." |
| `ins_currentrate_floor` | Suelo regulado | **Lo fija la ley** |
| `ins_currentrate_floor_note` | Intercambio + tarifas de red (IFR UE + Visa/Mastercard) — no negociable. | Comisión del banco + comisión de la tarjeta (Visa/Mastercard). Nadie puede bajarlas. |
| `ins_currentrate_movable` | Tu zona optimizable | **Lo que puede bajar** |
| `ins_currentrate_movable_note` | Margen del procesador + comisión fija + transfronterizo… | El margen de tu proveedor, la comisión por venta y las tarjetas extranjeras. Esto es lo que CAMBRA baja. |
| `ins_cardmix_ifr_note` | …Facturado a tasa combinada, sobrepagas… | …Te facturan una única tarifa, así que pagas de más… |
| `ins_crossborder_note` | El {pct}% de tu GMV es internacional — el recargo transfronterizo añade esto. | El {pct}% de tus ventas es internacional. Las tarjetas extranjeras cuestan más. |
| `ins_crossborder_notmodeled` | …tasa transfronteriza verificada… Conecta tu PSP… | …tarifa confirmada de tarjeta extranjera… Conéctalo… |
| `ins_fixeddrag_note` | …añade ~{drag}% a tu tasa efectiva. | …añade ~{drag}% a lo que pagas. |

EN: "Card sales", "What you pay", "Fixed by law", "What can come down", "bank fee + card network fee".
FR : "Ventes par carte", "Ce que vous payez", "Fixé par la loi", "Ce qui peut baisser", "frais banque + frais réseau carte".

### Comparativa (PeerBenchmark + PDF)

| Clave | Antes | Después |
|---|---|---|
| `bench_regional` | Benchmark regional · {country} | **vs. sector · {country}** / vs. industry / vs. secteur |
| `bench_regional_nocountry` | Benchmark regional | vs. sector |
| `bench_median` | Mediana de pares / Peer median / Médiane des pairs | **Comercio típico** / Typical business / Commerce type |
| `bench_modeled_note` | "Modelado a partir de tarifas públicas — se refinará a medida que los datos verificados alcancen masa crítica." | "Construido con tarifas públicas. Se afina según más comercios conectan sus datos." |
| `pdf_sec_benchmark` | Benchmark — dónde estás | vs. sector — dónde estás |
| `pdf_peer_median` | Mediana de pares | Comercio típico |

> **Nota de precisión:** "mediana" → "comercio típico", no "media". El valor sigue siendo la mediana; la etiqueta describe *a quién* representa, no la operación estadística, así que no se falsea nada.

### Cuenta agregada y evolución

`acct_total_gmv` → Ventas con tarjeta totales · `acct_blended_rate` "Tasa efectiva mezclada" → **Lo que pagas en total** · `acct_blended_note` "Ponderada por GMV" → "Ponderado por ventas" · `acct_sub` "tasa mezclada ponderada por volumen" → "tarifa ponderada por ventas" · `trend_legend_rate` "Tasa efectiva" → **Lo que pagas**.

### Estados especiales del informe

| Clave | Cambio |
|---|---|
| `opt_hero_body` | "Tu tasa efectiva actual está en…" → "Lo que pagas ya está en — o por debajo de — la mejor tarifa que podrías contratar hoy…" |
| `opt_footnote` | **`bps` y `GMV` eliminados y la fórmula traducida:** "Por debajo de MAX(200 €/año, 15 pb del GMV anual) — el suelo de ruido" → "Lo que quede está por debajo de 200 € al año, o del 0,15 % de tus ventas con tarjeta — demasiado pequeño para darlo por real." Mismo umbral, misma aritmética; 15 pb = 0,15 % es conversión de unidad, no cambio de valor. |
| `insufficient_hero_body` | Fuera "pool multi-ancla" y "PSP". Dos frases: dato regional no confirmado → conecta tu proveedor. |
| `pdf_toptier` | "suelo alcanzable — costes top-tier" → "Ya estás en la mejor tarifa disponible — costes de pago inmejorables." |
| `ac_toptier_why` | "Tu tasa efectiva está en el suelo alcanzable" → "Ya estás en la mejor tarifa disponible" |

### TPV / in-store

`instore_rental_note`, `instore_rental_effective`, `instore_rental_coherence`: "tasa efectiva" → **"lo que pagas"** en las tres. `instore_subpayg_crossover` "Volumen de equilibrio" → **"Ventas de equilibrio"**; `instore_subpayg_yours` "Tu volumen" → "Tus ventas".

**"TPV" se mantiene en ES** (excepción declarada). EN: "card terminal". FR: "terminal de paiement" — corregido en `fee_instore_fallback` y en el aviso de AssumptionsFootnote, que decía "TPV provider" en inglés.

### Overlay, gate y CTAs

`overlay_step_2` "Asignando tu cohorte regional" → **"Buscando comercios similares"** · `overlay_step_3` "Comparando contra los suelos de interchange" → **"Comparando con las tarifas mínimas permitidas"** · `locked_achievable_rate` "tu tasa alcanzable exacta" → "la tarifa exacta que podrías pagar" · `login_gate_b2` "interchange, esquemas, margen" → "comisión del banco, de la tarjeta y margen del proveedor" · `coll_gmv_label` "GMV mensual" → **"Ventas mensuales"** · `sc_run_sub` "Mide tu tasa efectiva" → "Mide lo que pagas de verdad".

### Nota SumUp Pagos Plus (`plus_anchor_note`)

Antes: una frase con paréntesis anidados y punto y coma. Después, tres frases, **con toda la información intacta**:

> "La tarifa mostrada es SumUp Pagos Plus: 19 €/mes, sin permanencia, con la cuota ya incluida. El 0,75 % cubre las operaciones estándar. Las tarjetas premium y de empresa pueden costar más."

Se conservan: el nombre del plan, el precio, la ausencia de permanencia, que la cuota está amortizada dentro de la tarifa, el alcance del 0,75 % y el aviso de tarjetas premium.

---

## TAREA 3 — Verificado / Estimado, una sola vez

Clave nueva `verified_estimated_legend`, renderizada en `PaymentsGapCard` **inmediatamente debajo de la primera fila de badges** de la página. Las apariciones posteriores del badge no llevan explicación.

- ES: "Verificado = con tus datos conectados. Estimado = con tarifas públicas del sector."
- EN / FR: literales del brief.

Los badges en sí (`Verified`, `Public pricing`, `Regional estimate`) no cambian: la distinción se mantiene, solo se explica una vez.

---

## TAREA 4 — "De dónde sale lo que pagas" (FeeBreakdownCard)

Era el bloque más denso del producto **y estaba hardcodeado en inglés**, así que en ES/FR salía en inglés. Ahora está localizado (15 claves `fee_*`) y reescrito.

**Intro online** — antes: *"Interchange and scheme fees are hard floors set by Visa/Mastercard and issuing banks. The processor margin is what your PSP charges on top — that's the piece you can move."*
Ahora (ES): "La comisión del banco y la de la tarjeta son fijas — nadie puede bajarlas. El margen de tu proveedor es lo que cobra encima. Esa es la parte que se puede mover."

**Intro in-store** — antes: *"In-store card-present pricing is usually published as a single blended rate — there's no auditable interchange/scheme split. Instead of inventing one, we anchor the achievable rate to a specific provider you can contract today."*
Ahora (ES): "En tienda física, los proveedores publican una tarifa única sin desglose. En vez de inventarnos uno, comparamos con la mejor tarifa que puedes contratar hoy."

> El matiz que hace defendible la cifra — que **no** nos inventamos un desglose y que la referencia es un proveedor **real y contratable hoy** — se conserva literal. Es lo único innegociable de esta reescritura.

**Barras:** `Interchange` → Comisión del banco · `Scheme fees` → Comisión de la tarjeta · `Processor margin` → Margen de tu proveedor. La nota del margen decía *"Assumed ±N bps — this is where the savings live"*; ahora "Estimación nuestra, ±{band}%. Aquí está el ahorro." — se mantiene explícito que es una suposición nuestra.

**`bps` eliminado de la pantalla:** las barras mostraban `150 bps`; ahora muestran `1.50%`. Solo formato de presentación (`bps/100`), el parser, los valores y el ancho de las barras son idénticos.

**Ancla in-store:** "Achievable rate anchor" → "La mejor tarifa que puedes contratar hoy". La línea de ancla del motor se sigue mostrando **verbatim** (es la traza auditable).

---

## TAREA 5 — PDF

`paymentsAuditPdf` no tiene cadenas propias: todas sus etiquetas pasan por `t("pdf_*")`, así que hereda automáticamente. Verificado clave por clave. Los cambios que le llegan: "Tasa efectiva actual" → **Lo que pagas ahora**, "Tasa alcanzable" → **Tarifa posible**, "Suelo regulado" → **Lo fija la ley**, "Zona optimizable" → **Lo que puede bajar**, "Volumen con tarjeta (GMV)" → **Ventas con tarjeta**, "Mediana de pares" → **Comercio típico**, "Benchmark — dónde estás" → **vs. sector — dónde estás**. Pantalla y PDF hablan igual.

---

## Otras cadenas hardcodeadas del flujo (EN, no i18n)

| Archivo | Antes | Después |
|---|---|---|
| `PaymentsGapCard` | "Effective rate" | `t("ins_effective_label")` → localizada |
| `PaymentsGapCard` | "{x} achievable" / "achievable rate" | "{x} possible" / "the rate you could pay" |
| `PaymentsGapCard` | "effective, on {psp}" | "what you pay, on {provider}" |
| `PaymentsGapCard` | "Connect your PSP to score" | "Connect your provider to score" |
| `PaymentsGapCard` | tooltip "…for this cohort" | "…for this case" |
| `PaymentsScoreBadge` | "how close your effective rate is to the best achievable rate" | "how close what you pay is to the best rate possible" |
| `GmvSlider` | "Monthly card GMV" (+2 aria-labels) | "Monthly card sales" |
| `BrandBlock` | "Cohort benchmark" / "benchmark you against similar brands" | "Compare vs. industry" / "compare you with similar businesses" |
| `CountryField` | "benchmarked against this country's providers and interchange rules" | "we compare your rate with the providers and the legal caps of this country" |
| `AnalyzerEntryCards` | "Public pricing benchmark against merchants of your size + region" | "We compare you with similar businesses in your region, using public prices" |
| `PspVerificationOptions` | "your actual effective rate" | "what you really pay" |
| `AssumptionsFootnote` | párrafo de ±bps de 4 líneas | dos frases, sin "bps" ni "cohort" |
| `AssumptionsFootnote` | "Full audit trail — how we amortized the fixed fee…" | "The full working — how we spread the fixed fee…" |

---

## Deuda declarada

1. **`AssumptionsFootnote` sigue siendo EN-only.** Su lista de supuestos son cadenas que **emite el motor**, y traducirlas exige tocar el motor — prohibido en este chunk. Simplificar solo el marco dejaría el marco en español y la lista en inglés, que es peor. Va entero a **COPY-2C** junto con la localización de los strings del motor, que es un chunk con riesgo real (los parsers de `FeeBreakdownCard` dependen del texto exacto en inglés).
2. **La línea de ancla in-store se muestra verbatim en inglés** por el mismo motivo, y a propósito: es traza auditable.
3. `metadata` del pie (`engine`, `cohort`, `match`) se mantiene en monospace y en inglés: es identificación técnica para soporte, no copy de comercio.

---

## Verificación

- ✅ Paridad: EN = FR = ES = 617 claves. Sin huérfanas, faltantes ni duplicadas.
- ✅ Grep de `GMV / effective rate / achievable / cohort / benchmark / bps / interchange / scheme fee` sobre las cadenas visibles del flujo Analyzer+Results → **cero**. Los restos vivos están todos fuera de alcance: `how_step*`, `hiw_s2_detail`, `sec_b2_body` (Landing / How it works / Security = COPY-2B).
- ✅ PDF sin cadenas propias: hereda al 100 %.
- ✅ Ningún test de contrato afectado.
- ❌ **No ejecutable desde aquí:** suite, lint, build y capturas de pantalla del Analyzer/Results/PDF en los tres idiomas. Quedan para la batería externa sobre el zip.