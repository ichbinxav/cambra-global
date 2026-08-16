# Decision Log — I18N-30M: idiomas nativos para los 30 mercados activos

Fecha de arranque: 2026-08-15 · Rama: `agent/i18n-30-markets` ·
Diccionario: `src/lib/locales/{code}.js` (flat keys, paridad con `en.js`).
Documento VIVO — se actualiza con cada bloque de idioma committeado.
**Fase C CERRADA el 2026-08-16:** los 20 idiomas planificados están
implementados y committeados. Ver "Estado final" al pie.

## Corrección al brief de partida

El prompt estimaba **537 claves por idioma** (comentario histórico de la
extracción SWEEP-1 T3). El diccionario real tiene **1.349 claves** — el
propio `i18nParity.test.js` exige >1200. Todo el rollout se hace contra
las 1.349 reales. Los 2 blancos intencionales (`ri_sub_post`,
`su_badge_beta`) se preservan como `''` en todos los idiomas.

## Estado del rollout (se actualiza por bloque)

| # | Idioma | Commit | Mercados que sube | Estado |
|---|---|---|---|---|
| 1 | de (alemán) | 6ae54ef6 | AT, DE, LI → NATIVE · CH/LU/BE +soporte | ✅ verify verde |
| 2 | it (italiano) | d5f46a48 | IT → NATIVE · CH → NATIVE (de+fr+it) | ✅ verify verde |
| 3 | pl (polaco) | 838b629a | PL → NATIVE | ✅ verify verde |
| 4 | pt (portugués europeo) | 97301c7f | PT → NATIVE | ✅ verify verde |
| 5 | el (griego) | e58901d5 | GR → NATIVE · CY → NATIVE | ✅ verify verde |
| 6 | sv (sueco) | 48c6c978 | SE → NATIVE | ✅ verify verde |
| 7 | da (danés) | 5c19bc3d | DK → NATIVE | ✅ verify verde |
| 8 | fi (finés) | 4857312f | FI → NATIVE | ✅ verify verde |
| 9 | cs (checo) | afe996b8 | CZ → NATIVE | ✅ verify verde |
| 10 | ro (rumano) | b10973e2 | RO → NATIVE | ✅ verify verde |
| 11 | hu (húngaro) | eee8950e | HU → NATIVE | ✅ verify verde |
| 12 | bg (búlgaro) | 691eb3c2 | BG → NATIVE | ✅ verify verde |
| 13 | hr (croata) | 8d48ffa0 | HR → NATIVE | ✅ verify verde |
| 14 | et (estonio) | 0dfb8803 | EE → NATIVE | ✅ verify verde |
| 15 | lv (letón) | b97c0514 | LV → NATIVE | ✅ verify verde |
| 16 | lt (lituano) | 4080a76b | LT → NATIVE | ✅ verify verde |
| 17 | sk (eslovaco) | 69f902c8 | SK → NATIVE | ✅ verify verde |
| 18 | sl (esloveno) | 33386fbf | SI → NATIVE | ✅ verify verde |
| 19 | nb (noruego bokmål) | 7e776ad1 | NO → NATIVE (nn fuera de alcance) | ✅ verify verde |
| 20 | is (islandés) | — | IS → NATIVE | ✅ verify verde |

## Estado final de la Fase C

**23 product locales registrados** (en, fr, es + los 20 del rollout).
**27 de 30 mercados activos en NATIVE_PRODUCT:** FR ES GB AT DE LI IT CH
PL PT GR CY SE DK FI CZ RO HU BG HR EE LV LT SK SI NO IS.

Los 3 restantes NO son huecos, son decisiones documentadas más abajo:

| Mercado | Estado | Motivo |
|---|---|---|
| NL | Fallback EN honesto | `nl` no se construye: NL/BE son `protected: RESEARCH_ONLY` |
| MT, IE | Inglés nativo | EN es el idioma de negocio; no es fallback (`fallback_used: false`) |
| LU, AD | PARTIAL_NATIVE | cubiertos por fr/de y es/fr; `lb` y `ca` fuera del alcance |

**Ningún idioma está marcado como revisado por hablante nativo.** Los 23
locales llevan `quality_status: AUTOMATED_QA` y
`legal_review_status: LEGAL_REVIEW_REQUIRED`, y los documentos legales
siguen en `IMPLEMENTED_UNVERIFIED` / `LEGAL_REVIEW_REQUIRED` en los 33
mercados. La revisión humana por mercado sigue siendo trabajo pendiente
(Fase E) y no se ha simulado en ningún estado del registry.

## Decisiones deliberadas (Fase A/B — no reabrir sin motivo)

1. **`nl` NO se construye.** Solo NL y BE lo tienen nativo, y ambos están
   en `protected: RESEARCH_ONLY` (`config/europe-markets.json`). Se
   añadirá si FR/BE/NL se desbloquean legalmente.
2. **Malta e Irlanda quedan en EN** (idioma oficial de negocio). `mt` y
   `ga` fuera del alcance. MT/IE permanecen PARTIAL_NATIVE con razón
   documentada aquí — no es un hueco, es una decisión.
3. **Chipre → griego.** `el-CY` es el idioma de negocio de la República
   (miembro UE); `tr-CY` deliberadamente fuera del alcance B2B.
4. **Luxemburgo:** cubierto por fr (ya nativo) + de. `lb` fuera del
   alcance; LU queda PARTIAL_NATIVE porque su `native_locales[0]` es
   lb-LU. Andorra: cubierto por es+fr; `ca` fuera del alcance.
5. **Suiza → NATIVE_PRODUCT con de+fr+it** (sus tres idiomas nativos
   cubiertos); default de-DE, el idioma de negocio primario.
6. **Noruega → `nb`** (bokmål); `nn` fuera del alcance.
7. **Portugués EUROPEO (pt-PT)** — "o seu", "connosco", "ecrã", TPA —
   nunca variantes brasileñas.
8. **Locales BCP-47 genéricos de país** (de-DE, it-IT…) en vez de
   per-market (de-AT): un archivo de diccionario por IDIOMA; la moneda y
   el formato por mercado los resuelve el registry, no el diccionario.

## Cambios de contrato en tests (regla R4 — deliberados, nunca borrados)

- `i18nParity.test.js`: el contrato fijo `['en','fr','es']` pasó a lista
  explícita `SUPPORTED_LANGUAGES` (sigue siendo EXACTA); test nuevo de
  resolución Intl (NumberFormat/DateTimeFormat) por idioma.
- `p9EuropeanLocalization.test.js`: la lista de product locales se amplía
  por bloque; el invariante de "fallback honesto" se conservó rotando el
  mercado testigo al siguiente pendiente en cada bloque. **Testigo final:
  NL**, el único mercado que sigue resolviendo a un fallback no nativo.
  MT/IE NO sirven como testigo: el inglés es nativo allí y su resolución
  devuelve `fallback_used: false` — el test lo detectó al intentar usar MT.
- `landingRelease.test.js`: el conteo de locales del readiness report se
  deriva del registro fuente (sin `3` mágico); el barrido de claims
  prohibidos en landing gana patrones por idioma (DSGVO-konform,
  conforme al GDPR, zgodne z RODO, conforme com o RGPD, συμβατό με GDPR…).
- Colisión real encontrada: `import it from` choca con el `it()` de
  vitest — los diccionarios con nombres reservados se importan como
  `{code}Dict` en los tests.

## Cascada de regeneración por idioma (solo generadores, regla R2)

`config/europe-locales.json` (fuente) → `npm run locales:generate` →
`node scripts/generate-landing-readiness-report.mjs` →
`documentation:generate` → `durability:generate`. Verify:chunk completo
antes de cada commit.

## Qué queda pendiente de revisión humana (Fase E — honestidad)

- **Todos los idiomas nuevos** llevan `quality_status: AUTOMATED_QA` y
  `legal_review_status: LEGAL_REVIEW_REQUIRED` — el MISMO estado que
  en/fr/es. Ningún idioma se marca como revisado por hablante nativo
  humano porque ninguno lo ha revisado. Checks automáticos por idioma:
  paridad exacta de claves (0 de más, 0 de menos), 0 vacíos indebidos,
  0 valores idénticos al inglés en cadenas largas, resolución Intl del
  locale sin excepción, lint, suite completa.
- **Documentos legales** (`src/content/legal/{code}/`): segundo pase,
  deliberadamente NO mezclado con la traducción de producto (peso de
  cumplimiento distinto). Pendiente para todos los idiomas nuevos.
- **Fase F (e-invoicing watch)**: ver `docs/EINVOICING_COMPLIANCE_WATCH.md`.

## Fase D — tarifas en moneda local: BLOQUEADA, hueco declarado

**Resultado: NO se siembra ninguna fila en moneda local. No es pereza ni
falta de fuentes — el motor actual las calcularía mal en silencio.**

### La causa, con la línea de código exacta

`src/lib/paymentsGap.js`, `computeEffectiveBps()`, comentario previo a la
función (declaración explícita del propio motor):

> *"The caller is responsible for currency alignment. We do NOT do FX
> here: PaymentsRateTable stores the fixed fee in the provider's native
> currency, but for a first-pass gap estimate we treat EUR/GBP/USD as
> ~1:1 at the magnitudes involved (fees under €0.50)."*

El cálculo es `fixedMajor = fixed_fee_minor_units / 100` y luego
`amortizedBps = (fixedMajor / avg_ticket_eur) * 10000`. El divisor está
en EUR; el numerador se toma **tal cual**, sin mirar
`fixed_fee_currency`. La aproximación ~1:1 es defendible para EUR/GBP/USD
(mismo orden de magnitud). Para las monedas de la Fase D no lo es.

### Error que se introduciría (ticket de 40 EUR)

| Moneda | Fijo hipotético | bps que calcularía el motor | bps reales | Error |
|---|---|---|---|---|
| EUR | 0,25 € | 62,5 | 62,5 | 1,0× (fila real, correcta) |
| CHF | 0,30 CHF | 75,0 | 79,8 | 0,9× — dentro de tolerancia |
| CZK | 6,00 CZK | 1.500,0 | 59,8 | **25×** |
| ISK | 35,00 ISK | 8.750,0 | 59,1 | **148×** |
| HUF | 90,00 HUF | 22.500,0 | 57,0 | **395×** |

DKK (~7,5:1), SEK y NOK (~11:1), PLN (~4,3:1) y RON (~5:1) fallan igual,
solo que con menor factor. Sembrar esas filas produciría una cifra de
sobrecoste inventada de facto en la cara del comerciante — exactamente lo
que la doctrina de evidencia del producto prohíbe.

### Decisión

1. **No se siembra ninguna fila CZK/DKK/HUF/PLN/RON/SEK/NOK/ISK.** El
   hueco queda declarado aquí, no disimulado con una conversión silenciosa.
2. **CH/LI (CHF) quedan igualmente sin sembrar** en este bloque: aunque
   0,9× cae dentro de la tolerancia declarada del motor, sembrar solo esas
   dos daría una cobertura engañosamente parcial de la Fase D y sigue
   requiriendo `source_url` + cita verbatim aún no obtenida.
3. **Invariante bloqueado por test** (`paymentsRateCurrency.test.js`): el
   seeder no puede contener monedas fuera del conjunto que el motor trata
   como ~1:1. Si alguien añade una fila CZK creyendo que ayuda, el test
   falla y le apunta a esta sección.

### Qué desbloquearía la Fase D (decisión de producto, no mecánica)

Dar al motor una ruta FX explícita: o bien `avg_ticket` y fijo en la misma
moneda evidenciada, o una conversión declarada con fuente y fecha en la
propia fila. Es un cambio en el núcleo del cálculo del gap (protegido por
la suite de `paymentsGap`), no un seed. Debe ir en su propio PR y con
decisión previa del fundador sobre cómo se declara el FX al comerciante.
