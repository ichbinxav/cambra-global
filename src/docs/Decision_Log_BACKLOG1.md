# Decision Log — CHUNK BACKLOG-1 v2 (Limpieza técnica post-publicación)

Fecha: 2026-07-24 · Entorno: Base44 (sin terminal — lint/vitest/build/grep NO
ejecutables aquí; ver "Verificación externa pendiente" al final).

---

## TAREA 1 — Coherencia cromática del AnalyzingOverlay ✅ COMPLETA

`src/components/paymentsAnalyzer/AnalyzingOverlay.jsx`, mismas opacidades:

| Sitio | Antes | Después |
|---|---|---|
| boxShadow glow barra (~L80) | `rgba(34,211,238,0.55)` | `rgba(91,76,245,0.55)` |
| fondo paso activo (~L98) | `rgba(34,211,238,0.15)` | `rgba(91,76,245,0.15)` |
| borde paso activo (~L100) | `rgba(34,211,238,0.6)` | `rgba(91,76,245,0.6)` |

Lógica de pasos, cierre por respuesta real y barra asintótica: intactos.
(De paso T3: los dos gradientes `#5B4CF5 → #39C6F0` del archivo ahora usan
`var(--voltio)` — mismo color renderizado.)

## TAREA 2 — Lint a cero ✅ CAMBIO APLICADO / ejecución externa pendiente

- Eliminado `import { BRAND_ASSETS }` sin usar en `src/pages/PaymentsAnalyzer.jsx`
  (verificado: cero usos del símbolo en el archivo).
- `npx eslint . --fix` y `npm run lint` no son ejecutables en este entorno —
  córrelos en local. No se espera ningún error nuevo de este chunk.

## TAREA 3 — Unificar el token morado ✅ NÚCLEO COMPLETO / grep final externo

### 1. Inventario de usos del token viejo (por inspección de archivos, sin grep)

`var(--voltio)` / `var(--voltio-2)` encontrados:
- `src/index.css` — `.eyebrow { color: var(--voltio) }` (usado por SectionHeading
  en toda la landing/Pricing)
- `src/pages/HowItWorks.jsx` L75 (fondo flecha CTA), L87 (icono eyebrow)
- `src/pages/Contact.jsx` L81 (icono tarjetas de contacto)
- `src/pages/Pricing.jsx` L204 (icono Sparkles), L207 (eyebrow promesa)
- Derivado `--g-voltio` — consumido por `.kw`, `.btn-primary`, DashboardSidebar
  (item activo), MobileNavMenu (CTAs), PricingDual (precio gradiente + CTA),
  HowItWorks (CTA final), PaymentsAnalyzer (pills/CTA), AnalyzerEntryCards.

Revisión de legibilidad del cambio #3A2BB0 → #5B4CF5 sobre paper claro:
#5B4CF5 sobre #FAFAFC ≈ 4.6:1 — pasa AA para el eyebrow (11px mono bold) y
para los iconos. Ningún sitio queda ilegible.

### 2. Tokens redefinidos en `src/index.css`

```
--voltio:#5B4CF5; --voltio-2:#8B7BFF; /* unificado con el morado aplicado de facto — 2026-07 */
--g-voltio:linear-gradient(120deg,var(--voltio) 0%,var(--voltio-2) 55%,#2FA9D6 100%);
```

DECISIÓN (revisar en tu QA visual): `--g-voltio` estaba definido con los hexes
viejos (#3A2BB0→#5A49D6→#2FA9D6), así que TODOS los CTAs con gradiente cambian
de tono al morado claro de facto — es la instrucción del paso 2 ("actualízalos
coherentemente a la nueva familia"), pero es el cambio visual más visible del
chunk. Texto blanco sobre #8B7BFF en CTAs bold: aceptable, pero míralo.

### 3. Hardcodeados sustituidos por token (archivo → nº de sustituciones)

- `AnalyzingOverlay.jsx` — 2 gradientes → var(--voltio)
- `PaymentsResults.jsx` — 2 gradientes CTA → var(--voltio)
- `AnalyzerEntryCards.jsx` — 2 gradientes + 5 × "#8B7BFF" → tokens
- `DashboardSidebar.jsx` — 2 × "#8B7BFF" (ping dots) → var(--voltio-2)
- `HowItWorks.jsx` — gradiente número (#8B7BFF → var(--voltio-2); el #3A2BB0
  del mismo gradiente se deja tal cual para render idéntico)
- `ProviderCard.jsx` — 2 × "#8B7BFF" → var(--voltio-2)
- `MobileNavMenu.jsx` — 2 × "#5B4CF5" + 2 gradientes + 1 × "#8B7BFF" → tokens
- `PspVerificationOptions.jsx` — 3 × "#5B4CF5" → var(--voltio)
- `PricingDual.jsx` — 2 × "#5B4CF5" + 1 × "#8B7BFF" → tokens

### Excepciones deliberadas (NO sustituidas)

1. `rgba(91,76,245,x)` / `rgba(139,123,255,x)` — regla explícita de la tarea.
2. Clases Tailwind arbitrarias (`text-[#8B7BFF]`, `ring-[#5B4CF5]/40`,
   `border-[#8B7BFF]/30` en ProviderCard, MobileNavMenu, DashboardSidebar,
   AnalyzerEntryCards, PspVerificationOptions) — `var()` no funciona con el
   modificador de opacidad `/50` de Tailwind; convertirlas exigiría re-mapear
   a tokens de Tailwind (riesgo > beneficio). El grep final las encontrará:
   son exclusiones esperadas.
3. `SavingsCurveChart.jsx` (curva de la landing) — los `#5B4CF5`/`#8B7BFF`
   son ATRIBUTOS DE PRESENTACIÓN SVG (`stopColor`, `fill`, `stroke`); `var()`
   no está soportado de forma fiable en presentation attributes. Se dejan.
4. `#3A2BB0` hardcodeados (HowItWorks gradiente número, PricingDual badge
   "Most popular", rgba(58,43,176,…) en Contact/Pricing) — valor viejo del
   token escrito a mano; renderiza idéntico a hoy y no está en el alcance.

### Pendiente para tu grep externo

El sweep cubre los archivos de alta visibilidad (analyzer, results, landing
nav/pricing, sidebar, públicas). Sin grep en este entorno no puedo garantizar
cero restos en el resto de `src/` (secciones de Landing, componentes de
results/dashboard no leídos). Tu criterio 4: cualquier resto que encuentres
fuera de las excepciones 1-3 es sustitución mecánica segura (mismo color).

## TAREA 4 — Reducción del bundle inicial ✅ FRUTA MADURA / medición externa

Paso 1 (medir) no ejecutable aquí. Análisis por grafo de imports del chunk
principal (candidatos más pesados, en orden estimado):
1. 23 páginas admin importadas EAGER en App.jsx (recharts + tablas) — corregido
2. jsPDF (~350KB min) vía import estático de paymentsAuditPdf en
   DownloadAuditButton (PaymentsResults → ruta pública /Results) — corregido
3. Reports (recharts) eager — corregido
4. framer-motion — landing primer viewport, prohibido tocar
5. recharts vía Dashboard/ConnectTools/AdminOverview/Revenue/Benchmarks — ya lazy
6. SavingsCurveChart — VERIFICADO: SVG artesanal, NO usa recharts → nada que
   lazy-loadear, la curva de la landing queda intacta
7. three.js — no encontrado en ningún import del grafo público; probablemente
   ni entra al bundle (tree-shaken). Confirmar en el visualizador.

Aplicado:
- `DownloadAuditButton.jsx`: `await import("@/lib/paymentsAuditPdf.js")` solo
  al pulsar exportar (jsPDF fuera del chunk inicial; spinner existente cubre
  la carga).
- `src/App.jsx`: 23 páginas admin + `Reports` convertidas a `lazy()`. El
  `<Suspense fallback={LazyFallback}>` ya envolvía `<Routes>` — cero cambios
  de render, mismo LoadingScreen.
- Nada del primer viewport de la home tocado; orden de la landing intacto;
  motor/Analyzer solo a nivel de imports (T2).

Regla de parada: sin medición no sé si esto baja de 800 KB. Si tras tu build
sigue por encima, el siguiente candidato es un refactor estructural (separar
CopilotPanel global y trocear el workspace compartido) — NO se hace en este
chunk, tal como manda la regla.

## Verificación del flujo anónimo (backend real, 2026-07-24)

`submitPaymentsAnalysis` — online, Stripe, FR, GMV 30.000, ticket 50, intl 10:
→ 200 OK · engine payments-gap-1.5.0 · cohort `stripe|ANY|EU` verified=true,
matched=exact · savings_opportunity · annual {lo:2088, point:2610, hi:3132} ·
sesión `2776ab20-4295-480f-a5b2-511256ee9910` (navegable en /Results?session=…).

## VERIFICACIÓN EXTERNA PENDIENTE (no ejecutable en Base44)

```
npm run lint          → esperado: 0 errores (unused-import eliminado)
npx vitest run        → esperado: 444 passed / 2 skipped (nada tocado en motor/tests)
npx vite build        → reportar peso del chunk principal ANTES (2,42 MB) y DESPUÉS
grep -rn "#5B4CF5\|#8B7BFF" src/  → esperado: solo index.css + excepciones 2-3 de T3
```

QA visual recomendado: CTAs con gradiente (tono más claro por --g-voltio),
overlay del analyzer en morado, curva de la landing intacta, /admin y /Reports
cargan con el LoadingScreen (ahora lazy), exportación PDF desde /Results.