# Decision Log — COPY-3 / COPY-3-FIX (landing reference example)

## Ancla canónica (COPY-3-FINAL)

- GMV ejemplo: **€2.000.000/año**
- Tarifa pagada: **2,30%** → €46.000/año
- Tarifa alcanzable: **0,92%** → €18.400/año (**FLOOR**, nunca se presenta como ahorro)
- **GAP = 1,38 pts = €27.600/año → €55.200 en 24 meses**
- Reparto: comercio 75% (€41.400 / 24 meses) · CAMBRA 25% (€13.800 / 24 meses)

Regla no negociable: floor (€18.400) y gap (€27.600) nunca se muestran mezclados
como si fueran la misma cifra ("fabricated-telemetry class of error").

### Descomposición de las tres tarjetas (ProblemSectionWow)

| Ángulo | % del gap | € / año | overpayPct visual |
|---|---|---|---|
| Tarifa combinada (blended) | 50% | 13.800 | +50% |
| Cross-border | 30% | 8.280 | +58% |
| Peso de la comisión fija | 20% | 5.520 | +25% |
| **Total** | 100% | **27.600** | — |

Suman exactamente €27.600 (el componente calcula el total con un reduce sobre
los ítems, así que no puede desalinearse). Topes visuales ≤58% para quedar bajo
la banda "40–60%" del hero.

Sub-narrativas independientes del ancla, sin recalibrar por seguir siendo cifras
de mercado válidas: cross-border +1,75% vs ~0,9% negociado; comisión fija €0,25
vs €0,15 sobre ticket medio ~€65.

### Banda "Similar businesses"

Misma fórmula proporcional (1,38 pts × GMV × 24 meses):
- €200k → €5.520 ≈ **€5.500**
- €2M → €55.200 ≈ **€55.000+**

## COPY-3-FIX — % de beneficio neto (`ric_profit_note`)

Texto restaurado: **"≈14% more net profit — recovered without selling one more unit."**
(ES/FR equivalentes.)

**Margen neto asumido: 9,86% sobre GMV.** Cálculo: beneficio anual del ejemplo
= €2M × 9,86% ≈ €197.200. Ahorro anual identificado = €27.600.
€27.600 ÷ €197.200 ≈ **14%**.

Nota de trazabilidad: la versión anterior del ejemplo (€1M GMV, gap €7.400,
"≈7% of annual profit") implicaba un margen neto asumido del ~10,6%. Ambos
valores (9,86% y 10,6%) son supuestos de margen razonables para comercio
independiente y **ninguno está verificado con datos reales de clientes de
CAMBRA**. Se documenta el cambio de supuesto de forma explícita en vez de
presentarlo como un dato medido.

## COPY-4 — El 14% como única cifra dominante

Jerarquía invertida en la sección "Impacto real":

- Titular: `ri_h2_kw` pasa de "€55.200 recuperados" a "+14% de beneficio neto"
  (mismo tratamiento .kw-m, mismo tamaño y posición).
- Párrafo: una sola frase que desemboca en el 14%. Fuera 1,38pts, €55.200,
  €41.400, 25% y "€27.600/año" — siguen vivos en la tarjeta y en el bloque
  "The hidden cost problem".
- Tarjeta: la cifra grande verde (`--menta-dark`) es ahora `+14%` con la línea
  "más de beneficio neto"; el contador €55.200 se degrada a texto pequeño gris
  (`--gris-2`) sin color de acento, conservando la animación.
- Stats de apoyo: `€2.3k/month` (ink) · `1.38pts` (coral) · `75%` — este último
  pasa de `--menta-dark` a `--ink` para que ningún otro dato comparta el verde
  de acento del 14%.

### COPY-4-FIX — jerarquía de 4 niveles

1. Titular de sección: **+14%** en verde (`.kw-m`) — intacto.
2. Cifra dominante de la tarjeta: **€55.200+** con el degradado de marca
   existente `var(--g-voltio)` (mismo token que el trazo de la curva; no se creó
   ningún degradado nuevo) + "recuperados en 24 meses".
3. Segunda cifra: **+14% más de beneficio neto**, verde `--menta-dark`, 26px.
4. Stats de apoyo: `€2.3k/mes` (ink) · `1.38pts` (coral) · `75%` (ink) — ninguno
   usa el degradado de marca ni el verde de acento.

### Mensaje del reparto 75/25 → **opción (b)**

Se retira de la tarjeta de recovery (clave `ric_split_note` eliminada). Motivo:
el reparto 75/25 ya aparece dos veces en la misma página, en bloques visibles y
más adecuados — el bloque total de "The hidden cost problem"
(`prob_total_line2/3`: "41.400 € se quedan en el comercio… CAMBRA solo cobra el
25%") y el subtítulo de "Impacto real" (`ri_sub_post`). Repetirlo una tercera
vez dentro de la tarjeta saturaba un bloque que ya carga contador, nota de
beneficio, tres stats, gráfica, rango y disclaimer.