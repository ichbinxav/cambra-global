# Decision Log — SEED-ES-2: Anchors españoles + motor 1.6.0 + ajuste bank_tpv_es

Fecha: 2026-07-24 · Precondición SEED-ES: verificada (submits a-d del log anterior).
Motor: **cero cambio de lógica** — solo la constante ENGINE_VERSION + historial.

## TAREA 1 — Vía elegida: TIER PLUS con slug `sumup` (no `sumup_plus`)

Fila creada: `sumup|PLUS|EU-ES|in_store` · slug `sumup` · tier `PLUS` · country ES
· 75 bps + 0 fijo + **rental 1900** (Pagos Plus 19€/mes modelado como alquiler:
económicamente idéntico — coste fijo mensual amortizado contra GMV — y el motor
ya amortiza ese campo en computeEffectiveBps) · verified=true · banda 0.20 ·
`achievable_breakdown_json: { anchor_provider: "sumup" }`.

**Por qué tier y no slug** (verificado contra el código de selectRow antes de decidir):
1. El countryRow de M5 exige `tier === "ANY"` y las keys candidatas solo
   construyen `|ANY|` → una fila tier PLUS es **invisible para la resolución de
   tarifa actual** (nunca puede servirse como "lo que pagas hoy"), que es
   exactamente lo que queremos de un anchor de plan.
2. El pool multi-anchor **no filtra por tier** → la fila sí entra como achievable.
3. La vía `sumup_plus` habría ROTO la exclusión self ("never recommend moving to
   yourself"): un merchant con slug `sumup` habría recibido `sumup_plus` como
   achievable — recomendar mudarse a ti mismo, justo lo que el chunk prohíbe
   sortear. Con slug `sumup` la exclusión funciona sola (verificado en submit 3).
4. Coste de la vía: añadir `"PLUS"` al enum `tier` del esquema (cambio de datos,
   aditivo, documentado en la descripción del campo). Cero cambios en
   KNOWN_PROVIDERS ni en ALLOWED_PROVIDER_SLUGS — la vía slug los habría arrastrado.

**Efecto de la exclusión self (documentado y verificado):** un merchant ES cuyo
proveedor actual es SumUp NO recibe el anchor Plus (el pool excluye TODAS las
filas con su slug: Plus 81, estándar ES 149 y pan-EU 175). Su achievable pasa a
ser Smile&Pay 155 → como paga 149 sobre fila ahora verified, clasifica
`already_optimized`. "Negocia tu upgrade a Plus" es within-provider — backlog.

## TAREA 2 — sumup|ANY|EU-ES|in_store promovida a anchor

verified → true (+verified_at, +source_quote "1,49% tarifa estándar ES") +
`achievable_breakdown_json: { anchor_provider: "sumup" }`. Mismo estándar que
los anchors FR. El resto de filas ES permanece DRAFT (sin tocar).

## TAREA 3 — bank_tpv_es: 80 → 100 bps

Justificación añadida a la fila: el ICP está más cerca del 0,7–1,2% negociado
que del punto medio optimista; la banda 0.50 sigue cubriendo el rango. Resto de
campos intactos (rental 2500, achievable 75).

## TAREA 4 — ENGINE_VERSION 1.6.0

Las tres copias (`submitPaymentsAnalysis` → `computeStripeVerifiedGap` →
`src/lib/paymentsGap.js`, en ese orden) llevan `payments-gap-1.6.0` + la entrada
de historial VERBATIM mandada por el chunk (mismo find/replace aplicado a las
tres → byte-idénticas por construcción; el sync-check lo vigila).
`paymentsGap.test.js`: actualizado ÚNICAMENTE el pin de versión (las dos
aserciones del mismo test, 1.5.0 → 1.6.0, con comentario del porqué). Ningún
otro test tocado. Mi `paymentsCountry.test.js` compara versiones relativas —
inmune al bump.

## TAREA 5 — Verificación en vivo (output literal resumido)

**1. Caso (c) RESUELTO** — ES + bank_tpv_es (colapso CaixaBank), 30k/50:
`current 108.33` (100 + 25€/mes amortizado = 8,33 bps) · `achievable 81.33` ·
`winner: sumup` (Plus: 75 + 19€/mes amortizado = 6,33 bps) ·
**`classification: savings_opportunity`** · anual {486, **972**, 1458} ·
assumption "Achievable anchored to sumup at 0.75%…". Gap real: **27 bps**
(el ~125/~44 del enunciado asumía otra amortización del alquiler; a 30k GMV los
25€ añaden 8,33 bps, no 25). Por encima del umbral (972 > max(200, 540)) ✓.

**2. Sin fuga a FR** — FR + Yavin 40k/35: `87.25 / 155`, winner smile_and_pay,
candidates idénticos (155 / 168.57 / 175 — **ningún anchor ES**),
insufficient_data — byte-idéntico al oráculo M5 salvo `engine_version: 1.6.0`
(exactamente el propósito del bump) ✓.

**3. Exclusión self** — ES + SumUp 40k/35: cohort `sumup|ANY|EU-ES|in_store`
(149, ahora verified) · pool SIN ningún candidato sumup (Plus excluido junto a
las otras dos filas sumup) · achievable = smile_and_pay 155 > 149 → savings 0
→ **`already_optimized`** (posible ahora que la fila es verified) ✓.

**4. ES + Square 30k/50** — current 135 · achievable 81.33 (winner sumup Plus) ·
**`savings_opportunity`** €1.932/año — NO already_optimized: el enunciado lo
esperaba, pero con el anchor Plus el suelo ES baja a ~81 bps y Square a 135
tiene gap material real (Pagos Plus a ese GMV es genuinamente más barato).
Resultado honesto del motor; already_optimized además habría requerido fila
verified y Square ES sigue DRAFT.

**5. Online ES intacto** — ES + Stripe 30k/50/intl10: `217.5 / 145 /
{2088, 2610, 3132}`, cohort stripe|ANY|EU, mismas assumptions — byte-idéntico
al submit (a) del SEED-ES salvo engine_version 1.6.0 ✓.

## Notas menores observadas
- `benchmark_resolution.candidates` ahora puede listar el mismo provider varias
  veces (sumup 81/149/175 — tres filas distintas). Cosmético; si la UI de
  Results renderiza candidates por nombre, considerar dedupe visual (backlog).
- `confidence: "reduced"` en (1) y (4) pese a pool ≥2: regla existente del motor
  (fila actual unverified degrada la confianza). Correcto.

## VERIFICACIÓN EXTERNA PENDIENTE (checklist del zip)
```
npm run lint · npx vitest run (pin 1.6.0 actualizado; resto intacto —
cualquier otro fallo sería regresión: no se detectó ninguna causa en este
chunk) · npx vite build
``