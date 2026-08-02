# Decision Log — SEED-FR: Siembra francesa de PaymentsRateTable + corrección estructural PayComet/MONEI (ES)

Fecha: 2026-08-02 · Chunk de DATOS: cero cambios en el motor, en `selectRow` y en el
esquema de `PaymentsRateTable`. Fuente canónica: `base44/functions/seedPaymentsRateTable/entry.ts`
(bloque `seedFR` + filas paycomet/monei de `seedES` corregidas), aplicado en vivo el
2026-08-02 (seeder idempotente: 8 created / 28 updated / 0 errors).

## TAREA 1+2 — Filas FR sembradas (8, `country: 'FR'`, `region: 'EU'`)

| cohort_key | canal | %bps | fijo | rental | verified | banda | Fuente |
|---|---|---|---|---|---|---|---|
| payplug\|ANY\|EU-FR | online | 140 | 0,25€ | — | ✓ | 0.25 | payplug.com/fr/blog/frais-transaction-carte/ — "1,4% + 0,25€ pour une CB européenne" |
| payplug\|ANY\|EU-FR\|in_store | in_store | 140 | 0,05€ | 0 | ✓ | 0.25 | mismo artículo, nota presencial |
| sumup\|ANY\|EU-FR\|in_store | in_store | 175 | 0 | 0 | ✓ | 0.25 | sumup.com/fr-fr/acceptez-les-paiements/ |
| sumup\|PLUS\|EU-FR\|in_store | in_store | 89 | 0 | 1900 (19€/mes) | ✓ | 0.20 | sumup.com/fr-fr/paiements-plus/ |
| smile_and_pay\|ANY\|EU-FR\|in_store | in_store | 160 (punto medio 1,55–1,65%) | 0 | 0 | ✗ | 0.30 | tool-advisor.fr + entrepreneurhero.fr (variación documentada en source_notes) |
| smile_and_pay\|PLUS\|EU-FR\|in_store | in_store | 65 | 0 | 2900 (29€/mes) | ✗ | 0.30 | tool-advisor.fr |
| square\|ANY\|EU-FR\|in_store | in_store | 165 | 0 | 0 | ✗ | 0.30 | prizia.fr |
| bank_tpv_fr\|ANY\|EU-FR\|in_store | in_store | 27 ("a partir de") | 0,07€ | 2500 | ✗ | 0.50 | axepta.staging.bnpparibas/fr/tarif — ver Tarea 3 |

Decisiones de siembra:
- **Stripe/PayPal NO se duplicaron con `country: 'FR'`** — verificado que la fila
  paneuropea `stripe|ANY|EU` (1,5% + 0,25€) está citada verbatim también en
  stripe.com/fr/pricing (consta en sus source_notes desde Chunk 1b) y PayPal
  armoniza su tabla EEA. La tarifa francesa es idéntica → el fallback
  pan-regional sigue siendo la fila correcta para Francia, sin duplicados.
- **Payplug FR (140 bps) difiere de la fila paneuropea `payplug|ANY|EU` (150 bps)** —
  por eso la fila FR existe; gana por resolución de país (M5). La paneuropea
  queda intacta como fallback para el resto de la EU.
- **SumUp PLUS FR** sigue el patrón exacto de `sumup|PLUS|EU-ES|in_store`:
  tier `PLUS` la excluye de la resolución de tarifa actual de `selectRow` y la
  deja disponible en el pool multi-anchor de achievable; los 19€/mes se modelan
  como `terminal_rental_monthly_minor=1900`. Exclusión self intacta.
- **Smile & Pay FR** se sembró como fila país con verified=false y banda 0.30 por
  la divergencia entre fuentes (1,55%–1,65%); la fila paneuropea verificada
  (155, smileandpay.com/tarifs) queda intacta.
- `verified_at` de las filas FR verificadas está HARDCODEADO
  (`2026-08-02T12:00:00.000Z`) — mismo patrón COHERENCE-1 que seedES: re-ejecutar
  el seeder produce cero cambios.
- Uplifts internacionales: null en todas (sin cita como delta limpio) → el motor
  emite "intl uplift not modeled", nunca inventa.

## TAREA 3 — TPV bancario francés: suelo citado, NO número inventado ✔

- **`bank_tpv_fr` NO se sembró con un número inventado.** La única cifra pública
  de la banca francesa es el suelo "a partir de" de AXEPTA BNP Paribas
  (0,27% + 0,07€, fuente oficial axepta.staging.bnpparibas/fr/tarif). Esa cifra
  se sembró tal cual como suelo, con `verified: false`, banda máxima 0.50 y
  `source_notes` explicando que el coste real de un comercio concreto está POR
  ENCIMA y se negocia caso a caso — mismo patrón que la fila genérica
  `ANY|ANY|EU` para casos análogos. Alquiler 25€/mes = mediana FR ya documentada
  en `ANY|ANY|EU|in_store`.
- **Société Générale quedó fuera A PROPÓSITO**: su tarifario oficial (60 páginas)
  dice literalmente "Étude personnalisée" para la comisión monetaria — no hay
  dato público que sembrar.
- **Nota de ruteo**: el slug `bank_tpv_fr` no está en el catálogo UI ni en
  `ALLOWED_PROVIDER_SLUGS` — los bancos FR siguen colapsando a `other` →
  fallback genérico europeo `ANY|ANY|EU|in_store` (estimación, no tarifa
  bancaria francesa real). Cablear el slug (tiles BNP/CA/SG como hace ES con
  `bank_tpv_es`) es un chunk de UI/validador aparte; la fila deja el dato
  citado listo para ese momento.

## TAREA 4 — PayComet y MONEI (ES): de porcentaje plano a cuota + umbral

Estructura real confirmada por 4 fuentes independientes: **19€/mes** que cubren
hasta 2.000€ de facturación mensual; por encima, **0,50% + 0,09€** nacional /
**0,60% + 0,09€** eurozona.

| fila | antes | después |
|---|---|---|
| paycomet\|ANY\|EU-ES | 55 bps + 0,09€, sin cuota | 50 bps + 0,09€ + rental 1900 (19€/mes) |
| monei\|ANY\|EU-ES | 65 bps + 0,24€, sin cuota | 50 bps + 0,09€ + rental 1900 (19€/mes) |

- Se siembra el tramo **nacional** (50 bps — caso más común del ICP); el uplift
  eurozona (+10 bps) no se modela como intl_uplift (sin cita como delta limpio).
- Los 19€/mes se modelan como `terminal_rental_monthly_minor=1900` — el campo
  ya usado por SumUp Pagos Plus; económicamente idéntico (coste fijo mensual
  amortizado). **Verificado en vivo que el motor SÍ lo amortiza en canal online**
  (assumption emitida: "Monthly terminal rental of 19.00 EUR amortized over
  €30000.00 of monthly card volume").
- **LIMITACIÓN CONOCIDA (documentada, no parcheada)**: el motor amortiza los
  19€/mes sobre TODO el GMV, pero esa cuota ya cubre los primeros 2.000€ de
  facturación sin % encima. No existe campo de "umbral cubierto por la cuota" —
  crearlo sería un chunk de ESQUEMA aparte, fuera de alcance. Efecto: ligera
  sobreestimación del coste actual para GMV >> 2k€ (~6 bps a 30k€/mes),
  del lado conservador. Anotado también en las source_notes de ambas filas.
- Fuentes actualizadas: sincomisiones.org/tpv-virtual/plataformas/paycomet y
  monei.com/pricing (source_quote citando la estructura completa).

### Antes/después en vivo (30k€/mes GMV, ticket 50€, intl 0, ES online)

| | ANTES | DESPUÉS |
|---|---|---|
| PayComet current | **73,0 bps** (55 + 18 fijo) | **74,3 bps** (50 + 18 fijo + 6,3 cuota amortizada) |
| MONEI current | **113,0 bps** (65 + 48 fijo) | **74,3 bps** (50 + 18 fijo + 6,3 cuota) |
| Clasificación | insufficient_data, ahorro 0 | insufficient_data, ahorro 0 (sin cambio — ambas siguen por debajo del achievable compuesto; honesto: son IC++/low-cost) |

La corrección grande es MONEI (−38,7 bps de coste actual: la estimación plana
anterior le imputaba casi el doble del coste real).

## VERIFICACIÓN FUNCIONAL (submits reales, backend de producción, motor 1.6.0)

**(a) FR + Payplug online 30k/50/intl0** → `payplug|ANY|EU-FR` exact verified,
current **190 bps** (140 + 0,25€ amortizado), `savings_opportunity`
{lo 121,5 / point 162 / hi 202,5}€/mes. La fila FR gana al fallback genérico ✓.

**(b) FR + SumUp in-store 40k/35** → `sumup|ANY|EU-FR|in_store` exact verified,
current **175 bps**, `savings_opportunity` ~83€/mes. Pool multi-anchor FR:
payplug 154,3 (winner) / smile_and_pay 155 / stripe_terminal 168,6 — SumUp
(ANY y PLUS) auto-excluido por la regla self, igual que en España. Para un
merchant FR NO-SumUp, el anchor `sumup|PLUS|EU-FR` entra al pool con los
19€/mes amortizados según el GMV introducido — misma mecánica volumen-dependiente
pago-por-uso vs. Plus que ya opera en ES ✓.

**(c) Separación por país sin fuga cruzada** ✓✓
- ES + SumUp in-store (mismo input 40k/35) → `sumup|ANY|EU-ES|in_store`,
  current **149 bps**, `already_optimized` (149 < winner smile 155).
- FR + SumUp in-store (mismo input) → `sumup|ANY|EU-FR|in_store`, **175 bps**,
  savings. Mismo proveedor, mismo input, país distinto → fila distinta; ninguno
  cayó en el fallback genérico.

**(d) PayComet/MONEI recalculados** → ver tabla antes/después arriba; la
assumption del alquiler amortizado aparece en ambos, confirmando que el campo
funciona en canal online.

## Fuera de alcance respetado

Cero cambios en motor/`selectRow`/esquema · sin campo nuevo de umbral de
facturación (limitación documentada) · Société Générale fuera (sin dato
público) · catálogo UI FR intacto (payplug in-store / square FR / bank_tpv_fr
no ruteables desde la UI todavía — chunk de UI aparte si se quiere exponerlos;
las filas quedan listas como datos) · ningún país fuera de ES/FR.

## Grep de control

`country: 'FR'` en el seeder → exactamente las 8 filas de la tabla de arriba,
ninguna huérfana fuera del bloque `seedFR`. En la tabla viva: 8 filas creadas
con esos cohort_keys (respuesta del seeder 2026-08-02).

## VERIFICACIÓN EXTERNA PENDIENTE (sin terminal en este entorno)
```
npm run lint     → esperado 0 errores (solo datos + docs; ningún .js/.jsx tocado)
npx vitest run   → suite verde esperada — el sync-check del motor no se toca
                   (bloque SYNC intacto); ningún test asserta el contenido de
                   PaymentsRateTable ni del seeder.
npx vite build   → limpio (el seeder es Deno backend, fuera del bundle)
``