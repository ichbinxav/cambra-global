# Decision Log — M5: Resolución country-aware en el motor de payments

Fecha: 2026-07-24 · Entorno: Base44 (sin terminal — lint/vitest/build quedan
para verificación externa; ver sección final).

## Resumen

El cohort_key (slug|tier|REGION[|channel]) no distinguía país dentro de EU,
pero el research verificado 2026-07-24 confirma divergencias FR/ES (SumUp
1,75% vs 1,49%; Zettle plano vs escalonado; Square 1,65% vs 1,25%) y
proveedores mono-país (MONEI, PAYCOMET, TPV bancario ES). M5 añade preferencia
por país a la selección de fila SIN tocar ninguna fila existente y con
retrocompatibilidad byte-idéntica (verificada en vivo, ver abajo). La siembra
ES NO es parte de este chunk (SEED-ES posterior).

## TAREA 1 — Esquema

`base44/entities/PaymentsRateTable.jsonc`: nuevo campo opcional `country`
(ISO-2 mayúsculas; ausente/null = fila paneuropea, TODAS las filas actuales).
El cohort_key NO cambia de formato — para filas nuevas con país la convención
es `slug|tier|REGION-CC` (p. ej. `sumup|ANY|EU-ES`) SOLO como identificador
legible: la resolución nunca parsea la key, lee los campos. Documentado en la
descripción del campo y en la del cohort_key. Cero migración.

## TAREA 2 — Motor (las tres copias, en el orden mandado)

Orden de edición: 1º `submitPaymentsAnalysis/entry.ts` (fuente de verdad),
2º `computeStripeVerifiedGap/entry.ts`, 3º `src/lib/paymentsGap.js`. Los tres
recibieron EXACTAMENTE los mismos find/replace → byte-idénticos por
construcción → el par `paymentsGap` del sync-check (con `extraDenos`) pasa sin
tocar el test.

### Diff de la sección compartida (SYNC block)

1. **normalizeInput** — nuevo campo opcional `country`: trim + toUpperCase +
   `/^[A-Z]{2}$/`; malformado/ausente → `null`. Añadido al objeto normalizado
   (entre `channel` e `intl_pct`).
2. **selectRow(rows, provider_slug, region, channel, country)** — nueva
   preferencia por país, POR CAMPOS (jamás parseando cohort_key):
   - Durante la indexación se busca una fila con `row.country === country`,
     mismo provider (gated por KNOWN_PROVIDERS, como los exact de hoy), tier
     ANY, misma region y mismo channel (normalizado con el default 'online'
     para filas legacy sin channel). Si existe → gana con `matched: "exact"`.
   - Guard regla 4: en el walk key-based, una fila con `country` definido y
     DISTINTO al del input se salta SIEMPRE (una fila ES nunca sirve a un
     merchant FR) — incluso si un seeder la hubiera colado bajo una key pan.
   - La cadena de fallback regional (`ANY|ANY|<region>[|in_store]`) queda
     intacta y country-agnóstica.
3. **selectMultiAnchorAchievable(…, country)** — mismo guard en el pool de
   anchors in-store: un anchor pinneado a otro país no es elegible. Un anchor
   country-match compite por min-effective con los paneuropeos (correcto: el
   achievable sigue siendo el mínimo firmable).
4. **calculateGap** — pasa `input.country` a selectRow y al multi-anchor.
5. **REQUIRED_FALLBACK_KEYS** — SIN CAMBIOS (mismas 4+4 keys, sin país).
6. **ENGINE_VERSION — decisión: se mantiene `payments-gap-1.5.0`.** El
   invariante del chunk exige resultados byte-idénticos (engine_version está
   DENTRO del resultado) y `paymentsGap.test.js` pinnea la cadena 1.5.0. Con
   la tabla actual la aritmética es idéntica; el bump se revisará cuando
   SEED-ES siembre las primeras filas con país. Documentado en el historial de
   versiones del propio bloque SYNC (entrada "M5").

### Callers (fuera del bloque SYNC)

- `submitPaymentsAnalysis`: engineInput lleva `country: v.clean.country`
  (single) y `country` top-level (combined). El contrato de entrada NO cambia
  — country ya era requerido en el payload.
- `computeStripeVerifiedGap`: engineInput lleva
  `country: auth.acct_country_hint` (misma fuente que la región del cohort).

## TAREA 3 — Tests

Nuevo `src/lib/paymentsCountry.test.js` (10 tests):
- (a) FR + fila sumup sin país → paneuropea (comportamiento actual).
- (b) ES + pan Y country=ES → gana la ES (149 bps); mismo table, FR → pan (175).
- (c) FR + solo fila ES → cae a `ANY|ANY|EU` (fallback), jamás la ES.
- (c-candado) fila ES escondida bajo key pan legacy → igualmente rechazada
  para FR (la resolución es por campos, no por key).
- (d) input sin country → paneuropea; con solo fila ES → fallback.
- (e) clasificador: `already_optimized` idéntico sobre fila country-específica
  verified con gap 0; roadmap: `buildRecoveryRoadmap` sobre resultado de fila
  ES → state/pool/target correctos, ≥2 rutas. (Nota conocida: el roadmap
  parsea la región de la key → 'EU-ES' no matchea marketRange → `ambition_bps`
  se omite limpiamente, nunca se inventa. Aceptable; si SEED-ES quiere ambition
  en filas país, tocar la derivación de región del roadmap en ese chunk.)
- RETROCOMPAT ×2: con tabla sin filas país, resultado byte-idéntico con y sin
  country en el input (comparación campo a campo incl. assumptions y
  engine_version); llamadas legacy a selectRow con 3/4 args intactas.

Ningún test existente tocado. Sync-check: sin par nuevo (la sección compartida
sigue bajo los mismos marcadores `SYNC-START/END: paymentsGap` en las 3 copias).

## TAREA 4 — Selector de país del Analyzer

`COUNTRY_OPTIONS` en `PaymentsAnalyzer.jsx`: FR y ES primero (antes ES, FR);
el resto de países se mantienen seleccionables (siguen funcionando vía
fallback regional). Sin gating adicional. Único cambio de UI del chunk.

## Confirmación explícita del invariante de retrocompatibilidad

Verificado EN VIVO contra el backend desplegado (tabla de producción, sin
filas país), comparando con los oráculos capturados antes de M5 (misma
jornada):

- **Online** Stripe/FR/GMV 30.000/ticket 50/intl 10 →
  `217.5 / 145 / annual {lo:2088, point:2610, hi:3132}` · cohort
  `stripe|ANY|EU` exact verified · mismas 3 assumptions ·
  savings_opportunity. **Byte-idéntico al run pre-M5** (sesión
  `2776ab20-…` pre vs `8278a20d-…` post).
- **In-store** Yavin/FR/GMV 40.000/ticket 35 →
  `87.25 / 155` · winner smile_and_pay · candidates idénticos
  (155 / 168.571428… / 175) · insufficient_data. **Byte-idéntico al run
  pre-M5** (`75411c5f-…` pre vs `0d0201e4-…` post).

Además, el test RETROCOMPAT del archivo nuevo fija el mismo invariante a nivel
unitario para siempre.

## Fuera de alcance respetado

Sin siembra ES · sin copy · sin catálogo ES en UI · Zettle escalonado se
modelará como fila de punto con banda en SEED-ES · sin i18n.

## VERIFICACIÓN EXTERNA PENDIENTE (sin terminal en este entorno)

```
npm run lint          → esperado: 0 errores
npx vitest run        → esperado: 454 passed (444 + 10 nuevos) / 2 skipped / 0 failed
                        incl. sync-check verde (par paymentsGap, 3 copias)
npx vite build        → esperado: limpio
```

Nota de deuda: `submitPaymentsAnalysis/entry.ts` (1922 líneas) y
`computeStripeVerifiedGap/entry.ts` (1918) superan la guía de 1300 líneas de
la plataforma — consecuencia estructural del patrón inline-SYNC (sin imports
entre funciones Deno). Consolidar cuando exista soporte de módulos compartidos.