# PaymentsRateTable — mapa de huecos de cobertura (30 mercados)

**Fecha:** 2026-08-16 · **Estado:** GAP DECLARADO — proyecto de DATOS, no de ingeniería
**Origen:** FX paso 2 (integridad de currency en Analyzer/Reports/billing), Fase D del prompt maestro.

## Qué hay hoy (inventario verificado sobre `seedPaymentsRateTable/entry.ts`)

- **41 filas** en total.
- **Filas con país:** ES ×12, FR ×10. **Ningún otro país tiene fila propia.**
- **Divisas de fixed fee:** EUR ×30, USD ×7, GBP ×4 — exactamente el conjunto
  `ENGINE_ONE_TO_ONE_CURRENCIES` que protege el candado de
  `src/lib/paymentsRateCurrency.test.js`.
- **Regiones:** EU ×36, US ×7, UK ×5, RoW ×2 (filas `ANY|ANY|<region>` de
  fallback incluidas).

## Qué significa para los 30 mercados activos

Los 28 mercados sin filas propias caen al fallback pan-regional
`ANY|ANY|EU` (220 bps). El resultado que ve un merchant de esos mercados es
honesto **como banda** (±35% + fila marcada como fallback), pero no compara
contra tarifas reales de su mercado: compara contra el promedio europeo.

**El fix de divisa (FX paso 2) está completo** — un merchant polaco que
introduce PLN obtiene una conversión BCE verificable y un resultado EUR
correcto. Lo que falta NO es conversión: son **datos de tarifas reales**
(páginas de precios verificadas, con `source_url` y cita textual) para los
proveedores dominantes de cada mercado, como se hizo con SEED-ES y SEED-FR.

## Qué NO se ha hecho deliberadamente

No se han sembrado filas para los 28 mercados restantes. La doctrina de la
tabla exige datos verificados de páginas públicas de precios
(`verification_status: verified`, `source_url`, cita) y ese trabajo de campo
no está en el árbol. **Inventar filas está prohibido** — el candado de
divisa fallará ante cualquier fila cuya `fixed_fee_currency` no sea
EUR/GBP/USD, y esa es la señal correcta: primero datos, luego siembra.

## Qué haría falta para cerrar cada mercado (checklist por mercado)

1. Identificar los 3–5 proveedores dominantes (PSP online + TPV bancario).
2. Capturar la tarifa publicada: percent_bps, fixed fee **en divisa local**,
   alquiler de terminal si aplica, con `source_url` + cita textual.
3. Sembrar filas `country=<ISO2>` con `fixed_fee_currency` real.
4. Ampliar `ENGINE_ONE_TO_ONE_CURRENCIES` **no** — en su lugar, dar al motor
   la conversión del fixed fee vía FxSnapshot (el residuo documentado en
   `computeEffectiveBps`) antes de aceptar la primera fila con fee no
   EUR/GBP/USD.
5. Actualizar `paymentsRateCurrency.test.js` deliberadamente (R4) en el
   mismo cambio que el punto 4 — nunca antes.

## Escalado

Decisión de priorización de mercados y presupuesto para el trabajo de campo
de tarifas: **founder**. Este documento es el registro del hueco; el
Decision_Log_I18N_30_MERCADOS.md enlaza aquí desde la sección Fase D.
