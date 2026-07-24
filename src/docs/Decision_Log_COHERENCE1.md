# Decision Log — COHERENCE-1: capa de presentación country-aware (2026-07-24)

Alcance: 3 fixes de producto en la superficie de resultados + siembra canónica.
**Cero cambios en el motor** — ni `src/lib/paymentsGap.js` ni las funciones que
lo espejan (`submitPaymentsAnalysis`, `computeStripeVerifiedGap`) fueron tocadas
(archivos editados en este chunk, lista completa: PaymentsInStoreInsights.jsx,
PlusAnchorNote.jsx [nuevo], PaymentsResults.jsx, FeeBreakdownCard.jsx,
i18n.jsx, seedPaymentsRateTable/entry.ts, y el `source_notes` de la fila PLUS
en la tabla viva).

## TAREA 1 — PaymentsInStoreInsights country-aware y honesto

`src/components/paymentsResults/PaymentsInStoreInsights.jsx`:

1. **Filtro de país (pool):** nuevo memo `pool` que replica la regla del motor
   (M5, field-based, nunca parsea cohort_key): filas sin `country` siempre
   elegibles; fila con país distinto jamás; sin país en el snapshot → solo
   country-less. Aplica a las tres tiles.
2. **Verified real:** `verifiedRegion` ahora exige `x.verified === true` — las
   referencias payg/subscription ya no pueden construirse desde filas DRAFT.
   Consecuencia deliberada: para FR la tile sub-vs-payg se auto-oculta (no hay
   fila verified con rental en el pool FR) en lugar de mostrar el fallback
   bancario no verificado — "dato real o estado honesto".
3. **Fila propia country-aware:** lookup por campos con la preferencia del
   motor — (a) fila `country === país` que matchee slug/región con `tier ANY`
   (PLUS nunca es fila ACTUAL, misma regla que selectRow), (b) paneuropea,
   (c) fallback regional `provider_slug ANY`. El template-string sobre
   cohort_key desapareció.

## TAREA 2 — Transparencia del anchor SumUp Plus

- Nuevo `src/components/paymentsResults/PlusAnchorNote.jsx`, montado en
  PaymentsResults tras FeeBreakdownCard (layout teaser apilado + grid).
  Detección FIELD-based sin hardcodear 75/1900: recalcula el effective bps de
  las filas `tier=PLUS` del rateTable (percent + fixed/ticket + rental/GMV,
  la misma aritmética de amortización del motor) y lo compara con el
  achievable del resultado (ε < 0.5 bps) bajo la misma regla de país.
- **Hallazgo:** el allowlist del teaser anónimo (`getPaymentsGapTeaser`)
  DESCARTA `benchmark_resolution` (y `classification`). La detección se ancla
  por eso en `achievable_effective_bps` — presente en ambos reader paths e
  igual por construcción al effective del winner; cuando benchmark_resolution
  sí llega (owned/verified), el slug del winner se exige como guard extra.
- i18n: clave `plus_anchor_note` × 3 idiomas con la copy EXACTA aprobada
  (patrón I18N-GAP). No parafrasear.
- Tabla viva: `source_notes` de `sumup|PLUS|EU-ES|in_store` ampliado con el
  matiz "operaciones estándar ELEGIBLES… premium/empresa pueden costar más.
  Fuente: sumup.com/es-es/ (condiciones del plan Pagos Plus)". El seed lleva
  la cadena idéntica.
- **Fix colateral (superficie del achievable):** el parser de
  `FeeBreakdownCard.anchorLine` buscaba `"Achievable rate anchored to"` pero
  el motor 1.5/1.6 emite `"Achievable anchored to"` — el panel de anchor
  in-store llevaba cayendo al fallback genérico. Regex ampliada a ambas
  formas; verificado en pantalla (panel "ACHIEVABLE RATE ANCHOR" visible).

## TAREA 3 — Siembra canónica reproducible

`seedPaymentsRateTable/entry.ts` + bloque `seedES`, upsert por cohort_key
(mecánica existente, sin duplicar). `verified_at` HARDCODEADO (no NOW) en las
filas ES para idempotencia real.

**Diff seed-vs-tabla-viva (documentado):**
- El encargo decía "11 filas ES". La tabla viva tiene **9** filas con
  `country: "ES"` (verificado dos veces por query): 8 de SEED-ES + 1 PLUS de
  SEED-ES-2. Las keys: sumup|PLUS|EU-ES|in_store, sumup|ANY|EU-ES|in_store,
  zettle|ANY|EU-ES|in_store, square|ANY|EU-ES|in_store,
  mypos|ANY|EU-ES|in_store, bank_tpv_es|ANY|EU-ES|in_store,
  paycomet|ANY|EU-ES, square|ANY|EU-ES, monei|ANY|EU-ES. El seed replica esas
  9 verbatim (incluidos los cambios SEED-ES-2: bank_tpv_es 80→100 bps, sumup
  ES verified=true) + el appendix COHERENCE-1 de la PLUS.
- Nota pre-existente (fuera de alcance): las filas FR/base del seed siguen
  usando `verified_at: NOW`, así que re-ejecutar el seed les refresca ese
  timestamp. Las ES no.

**Verificación de idempotencia (literal):**
- SHA-256 de las 9 filas ES (sin campos de auditoría) ANTES del seed:
  `7ea937ee9b6193c96f7af32de72006efe2599e7175eda6184a763c1ece06d3a2`
- Ejecución del seed: `created: 0, updated: 28, errors: 0` (28 = 19 previas + 9 ES).
- SHA-256 DESPUÉS: `7ea937ee…d3a2` — **idéntico, cero cambios**.
- Duplicados por cohort_key tras el seed: **0**. Total tabla: 36 filas
  (28 del seed + 8 filas fuera del seed, p. ej. self-test/legacy — intactas).
- Criterio "tabla vacía → idéntica a producción": garantizado por
  construcción (el seed contiene los 28 payloads verbatim; las 8 filas
  no-seed son datos de test fuera del contrato).

## VERIFICACIÓN FINAL (lecturas de página reales, sesiones anónimas)

1. **ES · SumUp in-store** (`session d82c9be6…`): página completa coherente
   con el motor — 1,49% current (no 1,75), badge PUBLIC PRICING, cohort ES,
   anchor smile&pay 1,55%, €0 recuperable (already at floor). ✓
2. **FR · SumUp in-store** (`session 16eb18c3…`): 1,75% current, anchor
   smile&pay 1,55%, cohort FR — **ninguna cifra proveniente de filas ES**
   (ni 1,49, ni 0,75, ni nota Plus). ✓
3. **ES · TPV bancario** (`session 3dc50a62…`): motor 1,08% → 0,81%
   (winner = fila PLUS: 75 bps + 19 €/mes amortizados = 81,33 bps) y la
   **nota "SUMUP PAGOS PLUS" visible en pantalla** con la copy exacta, entre
   el anchor panel y el disclaimer regional. ✓
4. Motor intacto: ningún edit sobre paymentsGap.js ni las 2 copias Deno; los
   3 submits de verificación devuelven engine `payments-gap-1.6.0` con la
   misma aritmética pre-chunk.

## Observaciones registradas (no tocadas, fuera de alcance)

- El allowlist del teaser descarta `classification` además de
  `benchmark_resolution`: por eso un resultado ES already_optimized anónimo
  renderiza PaymentsGapCard con €0 en vez de OptimizedHero (el hero optimizado
  solo aparece en owned/verified). Candidato a chunk propio si producto quiere
  el hero verde también en el teaser.
- Las tiles in-store de PaymentsInStoreInsights solo montan en el layout grid
  (owned/verified/optimized) y en Dashboard — el teaser apilado no las
  renderiza por diseño (1.4). La coherencia country-aware de la Tarea 1 aplica
  a esas superficies.