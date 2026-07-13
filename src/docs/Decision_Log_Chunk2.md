# CAMBRA — Decision Log · Chunk 2 (Landing canonical figures)

> This file extends `Decision_Log.md` — parent was hitting the 2500-line
> ceiling of the edit tool, so Chunk 2 (2026-07-13, canonical landing
> figures) is documented here. Read this file INTO the canonical log
> chronologically: this entry belongs at the TOP of `Decision_Log.md`
> under the "most recent on top" order.

---

## 2026-07-13 — Chunk 2 · Cifra ilustrativa canónica de la landing (R6) + regla permanente

**Contexto.** R4 (2026-07-12) estableció la marca de referencia única para
la landing (€1M GMV, gap ≈0.7pt), R5 (2026-07-12) reencuadró el hero de la
Savings Curve a la ventana 24 meses (€12k+/24mo). Pero R4/R5 usaron un gap
y unos derivados no perfectamente coincidentes con el motor 1.5.0 real, y
quedó riesgo de confundir "achievable que sigues pagando" con "achievable
recuperable" — el error del €48k al revés.

**Regla permanente (RE-SELLADA con aritmética explícita).**

> Toda cifra ilustrativa pública deriva de UNA SOLA marca canónica:
> **GMV €1M/año · effective 2.21% · achievable 1.47% · gap 0.74 pts**
>
> Cuenta canónica única (verificada aritméticamente):
> ```
> cost_current_yr    = €1M × 2.21%       = €22,100/yr  ← lo que paga hoy en total
> cost_achievable_yr = €1M × 1.47%       = €14,700/yr  ← siempre-pagas (interchange
>                                                        + scheme floor).
>                                                        NUNCA presentar como recuperable.
> overpay_yr         = €22,100 − €14,700 = €7,400/yr   ← LO RECUPERABLE (gap × GMV)
> recovered_24mo     = €7,400 × 2        ≈ €15,000     ← hero figure de Savings Curve
> per_month_ramped   = €15,000 / 24      ≈ €617/mo
> relative_overpay   = €7,400 / €22,100  ≈ 33%         ← cabe en "up to 40%"
> ```
>
> **Distinción crítica que no puede fallar**: el achievable (€14.700/yr) es
> lo que el merchant SEGUIRÁ pagando tras optimizar — es el suelo regulado,
> NO recuperable. El overpay (€7.400/yr) es la diferencia — ESTO es lo que
> recupera CAMBRA. Confundirlos y presentar €14.700 como "recuperable" es
> el error del €48k al revés y ya se cometió una vez (2026-07-10, hero de
> la curva). No repetirlo.
>
> **ICP endpoints (mismo gap, distinta GMV):**
> ```
> €200k GMV × 0.74% × 2 ≈ €3,000  / 24mo   (floor)
> €1M    GMV × 0.74% × 2 ≈ €15,000 / 24mo   (midpoint · hero)
> €2M    GMV × 0.74% × 2 ≈ €30,000 / 24mo   (ceiling)
> ```
> El "+" del hero (€15,000+) existe porque la reference brand es midpoint,
> no ceiling.
>
> **Si el motor cambia el gap de referencia, TODAS las superficies se
> re-derivan a la vez.** Nunca queda una superficie en un valor y otra en
> otro. Esta es la coherencia que un merchant escéptico comprueba haciendo
> la cuenta.

**Verificación de coherencia del trío (obligatoria, RAW):**

| Elemento visible | Cifra | Cuenta que la genera |
|---|---|---|
| H2 ProblemSection | **"up to 40%"** on card payments | Techo del rango de industria (consenso payments). Midpoint canónico = 33% cae cómodamente dentro. |
| Total overpay (yr) | **−€7,400/año** | ITEMS.reduce: €3,900 + €2,200 + €1,300 = **€7,400**. Match exacto con gap × GMV: 0.74% × €1M = €7,400. |
| Total recovered (24mo) | **≈ €15,000/24mo** en el sub-panel de ProblemSectionWow | €7,400 × 2 = €14,800 → redondeo comercial a €15,000 para cerrar con el hero de la curva. |
| SavingsCurveChart hero | **€15,000+ / 24 months** | Same €7,400/yr × 24mo pricing window. "+" porque €1M es midpoint ICP. |
| Range en curva footer | **€3,000 – €30,000+ / 24mo** | ICP floor (€200k × 0.74% × 2) → ceiling (€2M × 0.74% × 2). |
| Stat "rate saved" | **0.74pts** | Exacto (era "0.6pts" placeholder — corregido al gap real). |
| Stat "% of profit" | **~7%** | €7.400/año / ~€100k profit típico DTC (margen neto 10% sobre €1M GMV). Era 5% — bump honesto con el gap real. |
| Per-month ramped | **€617/mo** | €15.000 / 24 (derivado in-code, no hardcoded). |

**Verificación empírica ejecutada (2026-07-13):**
```
h2_holds:        40 >= 33.5        → true  ✓  ("up to 40%" ≥ relative_overpay)
trio_math_holds: |7400 × 2 − 15000| < 100 → true  ✓  (redondeo comercial cierra)
```

**Cambios ejecutados (2 archivos productivos):**

**`ProblemSectionWow.jsx`** — rewrite docstring + 3 items + H2 + sub-panel:
- Docstring header: reescrito para citar la cuenta canónica completa y la
  distinción achievable-vs-overpay con warning explícito del error del €48k
  al revés.
- `ITEMS[0].amount`: 3200 → **3900** (blended, 53% del gap). `overpayPct`: 41 → 50.
- `ITEMS[1].amount`: 1800 → **2200** (cross-border, 30% del gap). `overpayPct`: 35 → 38.
- `ITEMS[2].amount`: 1000 → **1300** (fixed-fee drag, 17% del gap). `overpayPct`: 22 → 25.
- Suma: 3900 + 2200 + 1300 = **€7,400** ✓ (verificado in-code — `TOTAL = ITEMS.reduce(...)`).
- H2 span gradient: `"30–60%"` → **`"up to 40%"`**. La copia "on card payments. Every month." intacta.
- Sub-panel del total: `"−€6,000/year"` → **`"−€7,400/year"`**, `"−€12,000 over 24 months"` → **`"≈ €15,000 over 24 months"`**, disclaimer actualizado con detalle numérico honesto ("2.21% vs 1.47% achievable").

**`SavingsCurveChart.jsx`** — rewrite docstring + target + stats + footer:
- Docstring header: reescrito citando la cuenta canónica y advirtiendo del error achievable-vs-overpay.
- `target = 12000` → **`target = 15000`** (con comentario explicando el redondeo comercial de €14.800 → €15k para axis ticks limpios €0/€7.5K/€15K).
- Comentario `perMonth`: `"€12,000 / 24 = €500/mo"` → `"€15,000 / 24 ≈ €625/mo"` (el código deriva de `target/months`, no hardcode).
- Microcopy hero: `"≈ 5% of annual profit"` → **`"≈ 7% of annual profit"`** con explicación in-comment: €7,400/yr sobre ~€100k profit típico DTC = 7%.
- Stats strip: `"0.6pts rate saved"` → **`"0.74pts rate saved"`** (gap real del motor). `"~5% of profit"` → **`"~7% of profit"`**.
- Footer meta: rewrite completo del `Range` a **`€3,000 to €30,000+ over 24 months`** con explicación in-comment de los tres puntos ICP.
- Disclaimer footer: `"typical blended pricing"` → **`"2.21% effective vs 1.47% achievable"`**.

**Cero cambios en:**
- La forma de la curva (`buildCurve` sigue con cubic ease-out sobre 24 puntos — el `target` se re-escala automáticamente).
- Los 24 X-axis labels ni los 3 Y-ticks (todos derivados de `target` — se recalculan solos: €0 / €7.5K / €15K+).
- La animación del marker M{n} ni el endpoint halo.
- `PricingDual.jsx` — no muestra cifras ilustrativas de ahorro, solo el 25% success fee y €29/mo strikethrough (ambos correctos post-R1).
- `StopLeavingMarginCTA.jsx` — no muestra números, solo copy narrativo.
- Testimonials — decisión explícita del fundador NO TOCARLOS.
- SEO meta tags — verificado con grep: JSON-LD `offers.description` menciona "25% of verified savings over 24 months" — es descripción del pricing model, no cifra ilustrativa de ahorro. Intacto.
- Terms/Privacy/Help — cero menciones a cifras ilustrativas en el copy.

**Grep de barrido final ejecutado (post-fix, 2026-07-13):**

Ejecutado en `src/` sobre patrones estrictos anclados (`30-60%`, `€6,000`/`6000`, `€12,000`/`12000`, `€48,000`, `€2,564`, `€3,847`, `€29K`, `overpay N%`) con filtro contextual que descarta CSS (`gradient`, `rgba`, `blur`, `%` en atributos de estilo).

Resultado literal:
- **Cero hits** de `30-60%`, `€6,000`, `€12,000`, `€2,564`, `€3,847` en código fuente productivo (jsx/js) post-fix.
- `€48,000` solo aparece en `SavingsCurveChart.jsx` línea 17 y en `Decision_Log.md` — ambas dentro de comentarios de notas históricas ("R2/R3: reframed from '€48,000' fabricated telemetry"). Preservados intencionalmente como memoria del error corregido — no visibles al usuario.
- `€29K` solo aparece en `Testimonials.jsx:10` dentro del quote inventado "Emma Rossi". Decisión explícita del fundador: **testimonios NO se tocan en este chunk** — se abordan en un chunk P0 separado.
- Todas las menciones remanentes de `€6.000`/`6.000`/`12.000` residen en `Decision_Log.md` como historia narrada de R4/R5 (append-only, preservado verbatim).

**Restricciones respetadas (verificadas ex-post):**
- **Cero cambios en `paymentsGap.js`** — motor 1.5.0 intacto. Sync-check triple no se dispara.
- **Cero cambios en backend functions** — `submitPaymentsAnalysis`, `getPaymentsGapTeaser`, `computeStripeVerifiedGap`, todos intactos.
- **Cero cambios en schemas o RLS**.
- **Cero cambios en `PricingDual`** (€29/mo, 25%, 24-month agreement — ninguno tocado).
- **Cero tests borrados o modificados** — suite 389/0/2 intacta por construcción (los archivos tocados son componentes visuales sin unit tests directos).

**Archivos tocados en Chunk 2:**
- `src/components/landing/ProblemSectionWow.jsx` (docstring + 3 items + H2 + sub-panel).
- `src/components/landing/SavingsCurveChart.jsx` (docstring + target + 3 stats + footer meta).
- `src/docs/Decision_Log_Chunk2.md` (este archivo — la entrada padre `Decision_Log.md` topó con el ceiling de 2500 líneas del tool).

**Deuda documentada residual:**
- **Testimonios inventados** (`Testimonials.jsx` — Emma Rossi €29K, Marco Blanc, Sophie Delacroix, Luca Moretti). Chunk P0 separado — decisión del fundador diferida.
- **Cifra "€48,000" en comentario histórico de `SavingsCurveChart.jsx`**. Intencionalmente preservada como memoria de la corrección. Cero visibilidad al usuario.

---