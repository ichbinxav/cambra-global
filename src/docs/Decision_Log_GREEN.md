# Decision Log — CHUNK GREEN (Reconciliación del motor + suite verde, pre-publicación)

Fecha: 2026-07-18 (Europe/Madrid)
Objetivo: dejar la suite en verde y el lint a cero como precondición para publicar
la versión payments-only. **No se publica en este chunk.**

Regla global respetada: `base44/functions/submitPaymentsAnalysis/entry.ts` (fuente de
verdad del motor) NO se ha tocado. Todos los ports van Deno → frontend, copia verbatim.

---

## TAREA 1 — Port 0.2b a `src/lib/paymentsGap.js`

**Cambio:** Reemplazado el bloque `KNOWN_PROVIDERS` (era pre-0.2b, solo 3 online + 4
in-store) por la copia **verbatim** del bloque equivalente de `entry.ts` (líneas
225-241), incluyendo comentarios.

- Añadidos slugs online FR (0.2b): `payplug`, `mollie`, `stancer`, `checkout_com`, `adyen`, `lyra`.
- Añadido slug in-store (0.2b): `yavin`.
- Comentarios copiados tal cual para que el sync-check normalice y compare sin divergencia.

**Impacto de producción:** ALINEA el frontend con el backend ya desplegado. Un merchant
con Mollie/Payplug/Stancer/etc. ahora ve en el navegador el cálculo por su fila seeded
`<slug>|ANY|EU` (exact-match) en vez del fallback regional — coherente con lo que el
backend ya persistía. Ninguna otra lógica del motor cambió.

**Segunda divergencia del sync-check:** NO detectada por inspección. El resto del bloque
SYNC de `paymentsGap.js` (normalizeInput, validateRateTable, selectRow, computeEffectiveBps,
selectMultiAnchorAchievable, computeMonthlySavings, applyBand, classifyResult, calculateGap,
aggregateCombinedClassification) es idéntico línea a línea al bloque SYNC de `entry.ts`
(líneas 254-1257). El único drift era `KNOWN_PROVIDERS`.

**Selector UI respecto a 0.2b (reporte, sin tocar):** El enum canónico
`ALLOWED_PROVIDER_SLUGS` en `entry.ts` ya incluye `payplug`, `stancer`, `lyra`, `yavin`
(marcado como "SINGLE SOURCE for the Chunk 4 form selector"). El componente cosmético
`src/components/paymentsAnalyzer/providerLogos.jsx` NO tiene marcas para estos slugs
(caen a inicial-en-círculo, que es el fallback previsto). Si el grid del formulario
(`ProviderGrid.jsx` / `AnalyzerEntryCards.jsx`) no ofrece aún estos slugs al usuario,
queda **PENDIENTE para un chunk de UI** — NO se añaden aquí (fuera de alcance: este
chunk es solo motor + verde).

---

## TAREA 2 — Fixture de `paymentsRoadmap.test.js`

**Cambio:** Añadidas las 3 filas fallback online que el motor exige
(`REQUIRED_FALLBACK_KEYS_ONLINE`): `ANY|ANY|UK`, `ANY|ANY|US`, `ANY|ANY|RoW`.

Sin ellas, `validateRateTable` devolvía `{ ok:false, error:"rate_table_incomplete" }`
antes de calcular nada — de ahí los 5 fallos. El motor NO estaba roto; el fixture solo
tenía filas EU. Valores usados = los verificados empíricamente en la instrucción, que
espejan la PaymentsRateTable viva (UK 200/25 GBP, US 290/30 USD, RoW 300/30 EUR;
achievable 100/150/160 bps respectivamente; band 0.35; verified false; active true).

**Ninguna aserción de los tests se ha modificado** (contrato sellado 2026-07-14
anti-double-counting). Resultado esperado con el fixture completo:
`engine.ok === true`, `classification === "savings_opportunity"`,
`annual_savings_eur.point === 2304`, `target_bps === 136`, `ambition_bps === 100`,
recs `recover_margin` + `better_rate` + `connect_verify`.

---

## TAREA 3 — Lint

- **Corrección React (verificada manualmente):** `src/pages/Landing.jsx:224`
  `fetchpriority="high"` → `fetchPriority="high"` (camelCase). Único error de
  corrección React del diagnóstico.
- **Imports sin usar:** eliminado `AuroraBackground` en `src/pages/Landing.jsx` (importado
  pero nunca referenciado en el JSX — el spotlight del Hero es un `motion.div` propio).

**LIMITACIÓN DE ENTORNO (honestidad):** este entorno de edición NO puede ejecutar
`eslint`/`vitest`/`vite`. Por tanto:
- Los ~10 imports sin usar restantes reportados por la auditoría NO pudieron localizarse
  archivo-por-archivo desde aquí (el diagnóstico da el conteo agregado, no la lista).
  Deben resolverse con `npx eslint . --fix` en local, revisando el diff antes de
  commitear para no eliminar imports usados en JSX condicional.
- El criterio de aceptación (los 3 comandos en verde) queda **pendiente de ejecución
  local** — ver sección VERIFICACIÓN.

---

## TAREA 4 — Metadata `index.html` (payments-only)

Reescritos SOLO `<head>` (title, description, og:*, twitter:*, JSON-LD) y `<noscript>`.
NO tocados: `lang`, hreflang, robots, canonical, sitemap (chunk aparte).

- `<title>` → `CAMBRA — Card payment cost audit for independent brands`
- meta/og/twitter description → copy única de auditoría de pagos (sin shipping/SaaS,
  sin cifras de marcas).
- JSON-LD → cambiado de `Organization` a `Service` (serviceType "Card payment cost audit",
  areaServed Europe, provider CAMBRA). Sin referencias multivertical.
- `<noscript>` → copy payments-only con "European payment benchmarks built from public
  pricing and regulatory interchange floors".

Eliminadas todas las menciones prohibidas: "shipping", "SaaS", "400+ European brands",
"economic operating system", "collective leverage".

---

## TAREA 5 — Higiene de dependencias

- `vitest` movido de `dependencies` → `devDependencies` en `package.json`.
- NO se actualizó ninguna versión de Vite/Vitest/esbuild (upgrade = chunk aparte).
- `npm install` para regenerar el lockfile queda **pendiente de ejecución local**
  (este entorno no ejecuta npm).
- README: pendiente de reformular la frase sobre vulnerabilidades si existe — no se
  localizó una afirmación literal "aisladas en rutas de desarrollo" en el README raíz
  durante este chunk; si aparece, aplicar la reformulación indicada.

---

## SANITY CHECK DE RUNTIME (solo lectura — EJECUTADO)

Leída la PaymentsRateTable viva vía service role. Filas activas: **27**.

| Fallback | Presente + activo |
|---|---|
| ANY\|ANY\|EU | ✅ |
| ANY\|ANY\|UK | ✅ |
| ANY\|ANY\|US | ✅ |
| ANY\|ANY\|RoW | ✅ |
| ANY\|ANY\|EU\|in_store | ✅ |
| ANY\|ANY\|UK\|in_store | ✅ |
| ANY\|ANY\|US\|in_store | ✅ |
| ANY\|ANY\|RoW\|in_store | ✅ |

Slugs FR 0.2b online sembrados: `payplug|ANY|EU`, `mollie|ANY|EU`, `stancer|ANY|EU`,
`lyra|ANY|EU`, `sumup|ANY|EU` — todos presentes. `yavin|ANY|EU|in_store` presente.

**Sin BLOCKER.** El motor NO devolverá `rate_table_incomplete` en producción para
ninguna de las 4 regiones ni en ninguno de los 2 canales.

---

## VERIFICACIÓN FINAL — PENDIENTE DE EJECUCIÓN LOCAL

Este entorno no dispone de la toolchain para ejecutar los comandos. Ejecutar en local
y pegar el output literal antes de dar el chunk por cerrado:

```
npm run lint      # esperado: 0 problems
npx vitest run    # esperado: 0 failed, 444 passed, 2 skipped (446 total)
npx vite build    # esperado: build completo sin errores
```

Estado de código en este chunk (todo aplicado en el repo):
- [x] Tarea 1 — KNOWN_PROVIDERS portado verbatim.
- [x] Tarea 2 — fixture roadmap completado (3 fallbacks online).
- [~] Tarea 3 — fetchPriority + 1 import muerto (AuroraBackground) corregidos;
      resto de imports muertos pendiente de `eslint --fix` local.
- [x] Tarea 4 — index.html payments-only.
- [~] Tarea 5 — vitest → devDependencies; `npm install` (lockfile) pendiente local.
- [x] Sanity check tabla viva — OK, sin BLOCKER.