# Decision Log — SEED-ES: Siembra española de PaymentsRateTable + catálogo UI

Fecha: 2026-07-24 · Precondición M5-COUNTRY: asumida en verde por mandato del
chunk (la resolución por país está desplegada y verificada en vivo — ver test b).

## TAREA 1+2 — Filas sembradas (8, todas DRAFT verified=false, country=ES, region EU, tier ANY, active)

| cohort_key | %bps | fijo | achievable | rental | banda | Fuente (fecha) |
|---|---|---|---|---|---|---|
| monei\|ANY\|EU-ES | 65 | 0,24€ | 86 + 0,24€ (composición EU estándar) | — | 0.35 | monei.com/pricing (2026-07-24) |
| paycomet\|ANY\|EU-ES | 55 | 0,09€ | 86 + 0,09€ | — | 0.30 | paycomet.com (2026-07-24) |
| square\|ANY\|EU-ES | 140 | 0,25€ | 86 + 0,25€ | — | 0.35 | roams.es (jun 2026) |
| sumup\|ANY\|EU-ES\|in_store | 149 | 0 | 75 + arent 19€/mes | 0 | 0.25 | rankia (jul 2026) |
| zettle\|ANY\|EU-ES\|in_store | 110 | 0 | — | 0 | 0.40 | multi-fuente 2023-2025 |
| square\|ANY\|EU-ES\|in_store | 125 | 0,05€ | — | 0 | 0.25 | roams.es (jun 2026) |
| mypos\|ANY\|EU-ES\|in_store | 145 | 0,05€ | — | 0 | 0.25 | sincomisiones (jun 2026) |
| bank_tpv_es\|ANY\|EU-ES\|in_store | 80 | 0 | 75 (arent 0) | **25€/mes** | 0.50 | comisionestpv.es + batemat.es (2026) |

Decisiones de siembra no especificadas en el research (documentadas, no inventadas):
- **Achievable de las filas online ES** = composición EU estándar (interchange 26 +
  scheme 20 + margin 40 ±20), el mismo patrón que todas las filas draft FR.
  Dejarlo null habría producido achievable=current (resultado muerto).
- **Banda de square online** = 0.35 (draft por defecto; el research no la fijó).
- **SumUp Pagos Plus 19€/mes** modelado como `achievable_terminal_rental_monthly_minor:
  1900` — es exactamente la semántica del campo (coste fijo mensual amortizado).
- **bank_tpv_es lleva `terminal_rental_monthly_minor: 2500`** (punto medio del
  rango 10–35€/mes citado en el propio research), mismo patrón que la fila
  fallback FR (2500) y que yavin (2900). Sin él, la "cuota fija no capturada en
  bps" desaparecería del análisis por completo.
- Uplifts internacionales: null en todas (sin cita directa) → el motor emite la
  assumption "not modeled", nunca inventa.

Los PSP paneuropeos (Stripe/PayPal/Mollie/Adyen/Checkout.com) NO se tocaron.

## TAREA 3 — Catálogo UI + slugs

- `PaymentsAnalyzer.jsx`: catálogo dependiente de país vía `getProviderOptions(channel,
  country)`. ES online = lista existente + MONEI/PAYCOMET/Square (hasSeed:true) +
  "Bank virtual TPV (Redsys)" (hasSeed:false → colapsa a `other`), con `Other` al
  final. ES in-store = SumUp/Zettle/Square/myPOS + tiles CaixaBank/Santander/BBVA/
  Sabadell/"Other bank TPV" con `submitAs: "bank_tpv_es"` — el merchant español
  encuentra su banco y aterriza en la fila española de 80 bps, jamás en el
  fallback europeo de 220 bps. FR intacto (bancario → `other`, como hoy).
- `mapSlugForSubmit`: nuevo campo `submitAs` con precedencia sobre `hasSeed`.
  El mapeo por país es implícito y a prueba de fallos: las tiles bancarias solo
  existen en la lista ES.
- Guard: al cambiar de país se limpia cualquier provider seleccionado que ya no
  exista en el catálogo nuevo (single y combined) — imposible enviar un slug
  fuera del catálogo visible.
- `KNOWN_PROVIDERS` (bloque SYNC, **las 3 copias verbatim** — doctrina GREEN-2):
  + monei, paycomet, square, mypos, bank_tpv_es.
- `ALLOWED_PROVIDER_SLUGS` (validador de submitPaymentsAnalysis, fuera del SYNC):
  mismos 5 slugs antes de 'other'.

## TAREA 4 — Verificación funcional (submits reales, backend de producción)

**(a) ES + Stripe online 30k/50/intl10** → `stripe|ANY|EU` exact verified,
217.5 / 145 / anual {2088, 2610, 3132} — **byte-idéntico al resultado FR**
(oráculo pre/post M5). Los paneuropeos no se ven afectados por la siembra ES. ✓

**(b) Separación por país demostrada en producción** ✓✓
- ES + SumUp in-store (40k/35) → `sumup|ANY|EU-ES|in_store`, current **149 bps**
  (la fila española), matched exact.
- FR + SumUp in-store (mismo input) → `sumup|ANY|EU|in_store`, current **175 bps**
  (la fila FR verificada), savings_opportunity €960/año.
Mismo proveedor, mismo input, país distinto → fila distinta, sin fuga cruzada.

**(c) ES + CaixaBank (colapso a bank_tpv_es) 10k/25** → colapso ✓: cohort
`bank_tpv_es|ANY|EU-ES|in_store`, current 105 bps (80 + 25€/mes de alquiler
amortizado, visible en las assumptions). **Clasificación: `insufficient_data`,
NO `savings_opportunity`.** Ver análisis abajo.

**(d) ES + MONEI online 30k/50** → `monei|ANY|EU-ES` exact, current 113 bps
(65 + 0,24€ amortizado). Fila ES ✓. Clasificación insufficient_data (current
por debajo del achievable compuesto de 134 — honesto: MONEI IC++ ya es barato).

## ⚠️ Hallazgo del test (c) — el achievable de 75 NO puede aplicarse con el motor actual

La expectativa del chunk ("revela el gap contra el achievable de 75") choca con
dos reglas SELLADAS del motor (M4-refinado v1.5.0), que este chunk no toca:

1. **Multi-anchor achievable (in-store)**: cuando el pool de anchors verified
   de la región no está vacío (EU: smile_and_pay 155 / stripe_terminal 140+10c /
   sumup 175), el achievable es SIEMPRE el mínimo efectivo públicamente
   contratable — **155 bps** al ticket típico. El `achievable_percent_bps: 75`
   de la fila solo se usa con pool vacío (UK/US/RoW). Un achievable de 75 bps
   "negociado dentro del banco" no es públicamente contratable — la regla de
   auditabilidad lo excluye por diseño.
2. **Clasificador**: current (105) < achievable (155) → ahorro 0 → fila
   unverified → `insufficient_data`. Y aunque el pool no existiera: gap 80→75 =
   5 bps, siempre bajo el suelo relativo de 15 bps → nunca savings_opportunity.

**Este resultado es el honesto**: a un merchant con TPV bancario negociado al
0,8% no podemos decirle que ahorra migrando a SumUp al 1,49% — la misión de la
fila (evitar el absurdo de 220 bps del fallback europeo) está cumplida, y el
copy que ve es "estimate, connect to verify", no un número inflado. (Aritmética
de esquina: solo con GMV < ~1.100€/mes el drag del alquiler supera al anchor y
aparece savings_opportunity — micro-merchant, no el ICP.)

**Opciones para el founder (decisión de producto, no la tomo unilateralmente):**
- A. Aceptar `insufficient_data` como resultado correcto del caso (c) y ajustar
  la expectativa del chunk (mi recomendación — cero cambios de motor).
- B. Chunk de motor aparte: modo achievable "within-provider negotiation" para
  filas con achievable propio y flag explícito (cambio del bloque SYNC sellado,
  bump de engine_version, re-baseline de oráculos).
- C. Verificar (verified=true) las filas ES de SumUp/Square in-store cuando haya
  cita humana → entran al anchor pool con guard de país y el achievable ES baja
  a ~125-149; el bancario seguiría sin gap (80 < 125), así que (c) no cambia.

## Fuera de alcance respetado
Filas FR intactas (0 modificadas) · sin i18n ES · sin copy de landing · Zettle
como punto estimado con banda 0.40 (tramos dinámicos: chunk aparte).

## VERIFICACIÓN EXTERNA PENDIENTE (sin terminal en este entorno)
```
npm run lint     → esperado 0 errores
npx vitest run   → suite verde; sync-check paymentsGap verde (KNOWN_PROVIDERS
                   editado verbatim en las 3 copias). Vigilar cualquier test que
                   asserte el CONTENIDO exacto de KNOWN_PROVIDERS o del enum
                   ALLOWED_PROVIDER_SLUGS — actualizarlo con los 5 slugs nuevos.
npx vite build   → limpio
``