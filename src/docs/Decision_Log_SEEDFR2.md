# Decision Log — SEED-FR-2 / BANK-BREAKDOWN-ES: PayPlug dos planes, desglose bancario ES, cableado UI

Fecha: 2026-08-02 · Datos + cableado de UI. Cero cambios en `selectRow`, en el
esquema de la entidad y en la lógica del motor (la única edición del bloque SYNC
es `KNOWN_PROVIDERS`, sancionada por el chunk, aplicada VERBATIM en las 3 copias:
`src/lib/paymentsGap.js`, `submitPaymentsAnalysis`, `computeStripeVerifiedGap`).
Seeder aplicado en vivo: 5 created / 36 updated / 0 errors.

## TAREA 1 — PayPlug: dos planes, verificado contra la FUENTE OFICIAL

**Hallazgo clave**: se verificó directamente `payplug.com/fr/tarifs` (fetch
2026-08-02) antes de sembrar, como pedía el chunk. **La fuente oficial NO
confirma los números del comparador** (passerelledepaiement.com decía Starter
1,2% + 0,25€ y Pro 0,5% + 0,15€). Lo oficial es:

| Plan | Online | En magasin | Abono | CA indicativo |
|---|---|---|---|---|
| Starter | 1,5% + 0,25€ | 1,5% + 0,10€ | 10€/mes | ≤100k€/año |
| Pro | 1,1% + 0,25€ | 1,1% + 0,10€ | 30€/mes | 100k€–1M€ |
| Enterprise | personalizado | — | — | >1M€ (no sembrable) |

**Criterio aplicado**: la web oficial manda → se sembraron los números
oficiales con `verified: true` y banda 0.20, citando payplug.com/fr/tarifs
verbatim. La discrepancia con el comparador queda documentada aquí y en las
`source_notes` de cada fila (no se sembró el dato del comparador ni como
verified=false — habría sido sembrar un dato que la fuente primaria contradice).

Filas (4, sustituyen/añaden sobre las 2 de SEED-FR):
- `payplug|ANY|EU-FR` (online Starter): 150 bps + 0,25€ + rental 1000 (10€/mes).
  Ahora además con intl uplift citado (Hors zone euro 2,9% → +140 bps / achievable 70).
- `payplug|PLUS|EU-FR` (online Pro): 110 bps + 0,25€ + rental 3000. **Limitación
  documentada**: el pool multi-anchor existe SOLO in-store (motor sellado) — la
  fila Pro online es dato sin consumo del motor hoy; activarla online sería un
  chunk de motor aparte.
- `payplug|ANY|EU-FR|in_store` (Starter): 150 bps + 0,10€ + rental 1000
  (sustituye el 1,4% + 0,05€ del artículo de blog de SEED-FR — sí tenía el
  mismo defecto: le faltaba el plan y el abono).
- `payplug|PLUS|EU-FR|in_store` (Pro): 110 bps + 0,10€ + rental 3000,
  `anchor_provider: payplug` → entra al pool multi-anchor, igual que SumUp Plus.

## TAREA 2 — Desglose bancario español: de un número a cuatro tiles, tres filas

| cohort_key | %bps | fijo | rental | banda | Fuente |
|---|---|---|---|---|---|
| bank_tpv_es_sabadell\|ANY\|EU-ES\|in_store | 20 | 0,07€ (mín. modelado como fijo) | 2500 | 0.35 | rankia.com + finantresnoticias.com + pagosrecurrentes.com — coincidencia exacta 3 fuentes |
| bank_tpv_es_caixabank\|ANY\|EU-ES\|in_store | 60 (punto medio 0,40–0,80%) | 0 | 2500 | 0.50 | rankia.com / rankiabusiness.com (Comercia Global Payments); rango completo en source_notes |
| bank_tpv_es_santander\|ANY\|EU-ES\|in_store | 40 | 0,18€ | 2500 | 0.50 | rankiabusiness.com — se siembra la Getnet BÁSICA publicada (0,40%+0,18€), NO el "desde 0,30%" de la Premium (un suelo no es una tarifa — mismo criterio que bank_tpv_fr) |

- **BBVA NO se sembró — confirmación explícita**: no publica tarifa base (solo
  promoción de 12 meses gratis). No se inventó ni un punto medio; su tile sigue
  colapsando al genérico `bank_tpv_es`.
- **`bank_tpv_es` genérico se mantiene** intacto como fallback (tiles BBVA y
  "Other bank TPV").
- Rango CaixaBank: el shape existente de `achievable_breakdown_json` (anchor /
  composición) no modela rangos de tarifa actual — el rango vive en
  `source_notes`, no se inventó un shape nuevo.
- Alquiler 25€/mes en las 3 filas = mediana del mercado ES ya citada
  (comisionestpv.es), mismo patrón que el genérico — sin él, los bancos
  parecerían artificialmente más baratos que el genérico.
- Todas verified=false (fuentes agregadoras, tarifas negociadas). Sabadell con
  banda 0.35 (más estrecha) por la coincidencia multi-fuente exacta.

## TAREA 3 — Cableado ES + KNOWN_PROVIDERS

- `PaymentsAnalyzer.jsx`: tiles CaixaBank/Santander/Sabadell → `submitAs` con
  slug propio; BBVA → sigue en `bank_tpv_es` (sin fila propia, ver arriba).
- `KNOWN_PROVIDERS`: +4 slugs (`bank_tpv_es_sabadell`, `bank_tpv_es_caixabank`,
  `bank_tpv_es_santander`, `bank_tpv_fr`) con comentario de chunk, editado
  VERBATIM en las 3 copias del bloque SYNC (doctrina GREEN-2; sync-check verde
  por construcción).
- `ALLOWED_PROVIDER_SLUGS` (validador, fuera del SYNC): mismos 4 slugs antes
  de `other`.

## TAREA 4 — Cableado francés

**Decisión documentada (no en silencio)**: hoy los comercios FR usaban la lista
in-store GENÉRICA (solo ES tenía lista propia). Se crea
`PROVIDER_OPTIONS_IN_STORE_FR` EN ESTE CHUNK — mismo patrón que ES en
`getProviderOptions(channel, country)` — porque la alternativa (añadir los
tiles a la lista genérica) dejaría a un comercio alemán enviando `bank_tpv_fr`
o `square` sin fila para su país. La lista FR añade: **Payplug** (hasSeed),
**Square** (hasSeed) y **"Banque traditionnelle"** → `submitAs: "bank_tpv_fr"`
(etiqueta honesta: la fila es el suelo "a partir de" de AXEPTA BNP,
verified=false). El resto de países no cambia ni un byte.

## VERIFICACIÓN EN VIVO (mismo input 40k€/mes GMV, ticket 35€, presencial)

**(2) Cuatro bancos españoles → cuatro tarifas distintas, ninguna en fallback:**

| Banco | cohort (exact) | current bps | antes (colapsado a genérico) |
|---|---|---|---|
| Sabadell | bank_tpv_es_sabadell\|…\|in_store | **46,25** | 106,25 |
| CaixaBank | bank_tpv_es_caixabank\|…\|in_store | **66,25** | 106,25 |
| Santander | bank_tpv_es_santander\|…\|in_store | **97,68** (savings_opportunity ~€861/año) | 106,25 |
| Genérico (BBVA / "no sé") | bank_tpv_es\|…\|in_store | **106,25** | 106,25 |

El dato que la UI recogía y descartaba ahora llega al motor: Sabadell paga
menos de la mitad que el punto genérico — exactamente el hallazgo del research.

**(3) PayPlug Starter vs Pro según volumen (misma mecánica que SumUp Plus):**
- FR + SumUp 40k/35 → pool: **payplug Pro gana (146,1 bps** = 110 + 28,6 fijo +
  7,5 de los 30€/mes amortizados), por delante de smile 155 y del Starter 181,1.
- FR + SumUp 2k/35 → los abonos de Payplug amortizan fatal a bajo volumen
  (Starter 228,6 / Pro 288,6) → **gana smile_and_pay 155**. El pool diferencia
  por GMV introducido ✓.

**(4) Proveedores FR alcanzables desde la UI, no solo en datos:**
- FR + Payplug presencial → `payplug|ANY|EU-FR|in_store` exact verified,
  181,07 bps (con nota del abono de 10€/mes amortizado), savings ~€4.191/año.
- FR + Square presencial → `square|ANY|EU-FR|in_store` exact, 165 bps.
- "Banque traditionnelle" → envía `bank_tpv_fr` (slug en allowlist + KNOWN_PROVIDERS).

**(5) BBVA**: no sembrado con número inventado — sin fila, tile en el genérico ✓.

## Fuera de alcance respetado

`selectRow`/esquema intactos · sin campo de umbral de facturación (sigue como
limitación documentada) · Société Générale fuera · solo ES/FR · dropdowns sin
rediseño visual (solo opciones + submitAs).

## VERIFICACIÓN EXTERNA PENDIENTE (sin terminal en este entorno)
```
npm run lint     → esperado 0 errores
npx vitest run   → suite verde esperada; sync-check paymentsGap verde
                   (KNOWN_PROVIDERS editado verbatim en las 3 copias)
npx vite build   → limpio
``