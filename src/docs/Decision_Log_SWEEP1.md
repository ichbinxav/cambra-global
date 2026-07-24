# Decision Log — SWEEP-1 (2026-07-24)

Mantenimiento menor de deuda técnica. Seis tareas; estado final abajo.

## T1 — `classification` en el teaser anónimo ✅
`getPaymentsGapTeaser` ahora proyecta `engine_result.classification`
(enum computado de 3 valores, cero datos sensibles) tanto en el resultado
top-level como en cada canal del modo combinado. Efecto: un lector anónimo
con `already_optimized` renderiza `OptimizedHero` en vez de una GapCard con
"€0/año". PaymentsResults ya enrutaba por `classification` — no tocado.

## T2 — brand_name opcional ✅
- Backend `submitPaymentsAnalysis`: validación single + combined pasa de
  required a opcional (2-80 chars solo si presente); el campo se omite del
  input_json cuando está vacío. NUNCA es input del engine → cero impacto
  en cálculos.
- Frontend `PaymentsAnalyzer`: quitado de validación requerida y de la
  píldora de progreso; el payload lo omite si está vacío.
- `BrandBlock`: etiqueta i18n "Brand name (optional)" (claves nuevas
  `brand_name_optional`, `brand_fallback` en EN/FR/ES).

## T3 — split del diccionario i18n ✅
`src/lib/i18n.jsx` (2122 líneas) → 195 líneas. Diccionarios extraídos a
`src/lib/locales/{en,fr,es}.js` (export default de objeto plano, comentarios
de sección conservados). **Paridad verificada programáticamente** (eval +
deep-compare): 537/537 claves por idioma, 0 diferencias de valor, +2 claves
nuevas de T2. API del módulo intacta (mismos exports, mismo `t()`).

## T4 — tokenización de morados ✅ (con excepciones documentadas)
~40 ocurrencias de `#5B4CF5`/`#8B7BFF` sustituidas por `var(--voltio)` /
`var(--voltio-2)` en estilos inline, gradientes, atributos SVG (stopColor,
fill, stroke) y fills de recharts. Los tokens ya valen exactamente esos hex
en `src/index.css` → cero cambio visual.

**Excepciones (dejadas a propósito, NO sustituir sin refactor):**
1. Concatenación de alpha (`` `${color}88` `` etc.) — `var()` + sufijo hex no
   es un color válido: PeerBenchmark:90 (MARKERS), ScoreGauge:18,
   CanCannotTable:16, SecurityBlock:11 (voltio.color), StepGrid:18,
   PopularArticles:54.
2. Clases Tailwind arbitrarias (`text-[#8B7BFF]`, `ring-[#8B7BFF]/50`,
   `from-[#5B4CF5]`) — los modificadores de opacidad no funcionan sobre
   `var()` y el purge exige literales: ProviderCard, AnalyzerEntryCards,
   PspVerificationOptions, ReportsKPIStrip, KPIStrip (admin),
   DashboardSidebar:44, MobileNavMenu:79/86.
   Migrarlas requiere mapear los tokens en `tailwind.config.js`
   (p. ej. `colors.voltio`) — refactor aparte, no cosmético.

## T5 — limpieza ESLint ✅ (verificación manual pendiente)
`src/eslint.config.js`: `src/lib/**` sale de `ignores` Y entra en `files`
(antes ni siquiera estaba cubierto). `src/components/ui/**` sigue ignorado
(shadcn generado; no se puede ejecutar lint en este entorno para auditarlo).
⚠️ No es posible ejecutar `eslint` aquí — validar en local.

## T6 — diagnóstico de la curva de pares ✅ (diagnóstico; recalibración pendiente de decisión)
Ejecutado sobre `computePaymentsBenchmark` (src/lib/paymentsBenchmark.js) con 9
escenarios representativos (online típico/caro, in-store banco/moderno,
already_optimized). Hallazgos, por severidad:

1. **INCOHERENCIA NARRATIVA (principal).** El merchant típico del ICP
   (1,90% vs suelo 1,50%) recibe *"cheaper than ~79% of brands your size"* —
   un benchmark halagador justo debajo de un hero que le dice que sobrepaga
   cientos/miles de €/año. Causa: la mediana modelada queda en
   `achievable + 0.42·(310 − achievable)` ≈ 2,17%, alta frente a la
   distribución real del ICP, así que casi cualquier input realista cae en el
   lado "barato" de la campana. Recomendación: bajar `MEDIAN_FRAC` a ~0,25-0,30
   (mediana ≈ 1,90-1,98%) o ensanchar `sdBps`. **No aplicado** — mueve números
   visibles del informe; es calibración de producto, decisión del operador.
2. **Saturación de extremos.** Con sd ≈ 34 pb, todo lo que pase de ~2,9%
   colapsa en "most expensive ~1-2%" (un 2,9% y un 4,5% leen casi igual).
   Consecuencia directa del sd estrecho; se corrige con el mismo ajuste de (1).
3. **Comentario desfasado.** El código dice que el techo queda "~1.5σ" sobre la
   mediana; realmente queda a ~2,76σ. Corregir el comentario al recalibrar.
4. **Menor — país en modo verified.** PaymentsResults pasa la región del cohort
   ("EU") como `country` → callout "brands EU your size". Gramaticalmente raro,
   no incorrecto.
5. **Cosmético.** La leyenda bajo el eje usa `justify-between` fijo; no se
   alinea con las x reales de los marcadores.

Verificado también: los estados already_optimized (~98% cheaper) y los casos
caros in-store producen callouts direccionales correctos; el eje siempre
contiene a YOU; el flip cheaper/expensive usa la cola correcta (sin bug).

## Verificación
- Paridad i18n: exec eval + deep-compare (arriba).
- Grep final de hexes morados: solo quedan las excepciones listadas.
- No se pudo ejecutar build/lint/tests (limitación del entorno).