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

## T6 — diagnóstico de la curva de pares ⏸️ PENDIENTE
No abordado en este barrido (alcance sin definir). Queda en backlog.

## Verificación
- Paridad i18n: exec eval + deep-compare (arriba).
- Grep final de hexes morados: solo quedan las excepciones listadas.
- No se pudo ejecutar build/lint/tests (limitación del entorno).