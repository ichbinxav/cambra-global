# Decision Log — CONTRACT-FIX (brand_name opcional)

**Fecha:** 2026-07-24 · **Alcance:** solo `src/pages/__contracts__/analyzerResultsHandoff.test.js` (+ este log). **Cero cambios de código de producto.**

## Contexto

SWEEP-1 T2 (2026-07-24) hizo `brand_name` opcional en el Analyzer anónimo (decisión de producto: reducir fricción antes de mostrar valor; el nombre se pide en el flujo de claim). El contrato `analyzerResultsHandoff.test.js` seguía exigiendo el comportamiento anterior y fallaba — el contrato haciendo su trabajo. Caso legítimo de actualización de test: el contrato cambió a propósito.

## Cambios en el contrato (bloque "Brand-block metadata")

1. **`requires brand_name (missing → invalid_input)` → sustituido por su inverso estricto:** el backend acepta ausencia sin `invalid_input` — se asierta que NO existe la rama `field: 'brand_name', reason: 'missing'` Y que la ausencia se normaliza a `''` (nunca `undefined`) vía el trim presence-safe en **ambos** caminos (single-channel `brand_name_raw` y combined `brandName`).
2. **Rango 2-80 conservado, condicionado a presencia:** se asierta la constante `brand_name: { minLen: 2, maxLen: 80 }` (entry.ts L1346) **y** que ambos caminos la aplican detrás de guard de presencia (`if (brand_name_raw && …minLen` / `if (brandName && …minLen`).
3. **Test nuevo — sello del fallback:** (a) clave i18n `brand_fallback` presente en los tres locales con la copy exacta ("Your brand" / "Votre marque" / "Tu marca"); (b) la superficie de resultados (PaymentsResults.jsx + los 24 componentes de `paymentsResults/`) no interpola `brand_name` en crudo en ningún sitio — no existe ruta de código que pueda pintar `''` ni `"undefined"`.
4. **Test del cliente actualizado:** de "sends brand_name (required)" a asertar el spread condicional exacto `...(brandName.trim() !== "" ? { brand_name: … } : {})` — misma convención "blank → send nothing" que website/sector.
5. Comentario de cabecera del bloque actualizado (decisión, fecha, razón, dónde se exige ahora el nombre) y renumeración de los comentarios posteriores.

## Barrido de contratos hermanos (Tarea 2)

`grep -rln "brand_name" src --include="*.test.js"` → **único resultado: `analyzerResultsHandoff.test.js`**. Ningún otro archivo de la suite (contratos, motor, sync-check, benchmarks, normalizers) asume brand_name obligatorio. **Declarado explícitamente: no había hermanos que actualizar.**

## Verificación final

- `npx vitest run` → **454 passed | 2 skipped | 0 failed** (26 files). El recuento sube de 453 a 454: se sustituyó 1 test y se añadió 1 nuevo (fallback) → +1 neto.
- `npm run lint` (eslint --quiet) → **0 errores**.
- Archivos tocados: `src/pages/__contracts__/analyzerResultsHandoff.test.js` y `src/docs/Decision_Log_CONTRACT_FIX.md`. Ninguno fuera de `__contracts__`/docs.

Nota operativa: la limitación histórica "no se pueden ejecutar tests/lint en este entorno" ya no aplica — esta verificación se ejecutó de verdad en el sandbox.