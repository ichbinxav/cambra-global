# Prompt maestro — idiomas nativos, monedas y fiscalidad de los 30 mercados

> Pégalo entero en tu Claude Code / Codex local, dentro de
> `cambra-global-p1-p5-copy`. Estado a fecha de hoy: los 3 commits de
> `AUTORIA_COMMITS_PENDIENTES.md` ya están hechos con autoría correcta
> (`Codex <codex@local.invalid>`), y la Tarea 3 de `CODEX_MASTER_PROMPT.md`
> (motor de impuestos reverse-charge a 30 mercados) está en marcha en la
> rama `agent/task3-tax-engine-30-markets`. **No dupliques esa tarea** —
> la sección de fiscalidad de este prompt (Fase F) es una capa adicional
> sobre esa misma rama, no un motor nuevo. El resto de la higiene de
> repo (~550 archivos aún sin commitear) sigue pendiente por separado,
> según `PROMPT_CIERRE_SELLADO.md`.

---

## Ya investigué el estado real — no repitas este descubrimiento

Antes de escribir este prompt entré en tu copia real y comprobé lo que
existe hoy, en vez de asumir. Esto es lo que hay:

**Idiomas: solo 3, y falta casi todo.** `src/lib/i18n.jsx` +
`src/lib/locales/{en,es,fr}.js` (~1.594/1.526/1.526 líneas, 537 claves
por idioma, con test de paridad programática) es el único idioma del
producto además de EN. `config/europe-locales.json` ya define, para
cada uno de los 33 mercados, su(s) `native_locales` real(es) — pero
`legalDocumentLocales` y el registro de `productLocales` solo tienen
`en-GB`, `fr-FR`, `es-ES`. De los 30 mercados activos, solo 3
(`FR`\*, `ES`, `GB`) están en `NATIVE_PRODUCT`; 6 están en
`PARTIAL_NATIVE` (usan FR o EN aunque su idioma nativo es otro); **24
de 30 están en `FALLBACK_ONLY`** — es decir, un merchant en Alemania,
Italia, Polonia, Portugal, Países Nórdicos, Báltico o Europa del Este
usa el producto en inglés aunque ese no sea su idioma.

\* FR es mercado protegido (no se lanza), pero ya tiene `NATIVE_PRODUCT`
de una fase anterior — no hace falta tocarlo.

**Hay un test que bloquea esto a propósito, y hay que cambiarlo a
propósito.** `src/lib/i18nParity.test.js` tiene un test literal:
```js
it('keeps the supported language contract fixed to the launch locales', () => {
  expect(Object.keys(dictionaries)).toEqual(['en','fr','es']);
```
Esto es un test estático (regla R4 de `CODEX_MASTER_PROMPT.md`): protegía
una decisión de negocio que ya no es la decisión actual. **No es un bug
tuyo, es un cambio de alcance que hay que reflejar deliberadamente** —
amplía esa aserción a la lista final de idiomas, no la borres sin más.

**Monedas: están bien, con una excepción real.** `config/europe-markets.json`
ya tiene `primary_currency` correcto para los 33 mercados (EUR donde
corresponde, y `CZK, DKK, HUF, PLN, RON, SEK, NOK, ISK, CHF, GBP` donde
no) — tu impresión de que esto ya estaba hecho es correcta, no hace falta
rehacerlo. `formatCurrency()`/`formatMoneyMajor()` en
`src/lib/i18n.jsx` / `base44/shared/localeRuntime.ts` ya reciben la
moneda como parámetro, no la asumen — la infraestructura de formato está
bien.

**El hueco real de moneda está en los datos, no en el formato**:
`base44/functions/seedPaymentsRateTable/entry.ts` tiene 41 filas, y sus
`fixed_fee_currency` son **solo `EUR`, `GBP` y `USD`** — cero filas en
`CZK, DKK, HUF, PLN, RON, SEK, NOK, ISK, CHF`. Un merchant en Dinamarca,
Polonia, Hungría, Rumanía, Suecia, Noruega, Islandia o Suiza recibe hoy
una comparación de tarifas que, o bien está en la moneda equivocada, o
cae en el cohorte genérico `ANY|ANY|EU` con banda ±35% — no un problema
de traducción, un problema de cobertura de datos de tarifas.

**Fiscalidad: el motor de reverse-charge ya está en marcha (Tarea 3),
pero investigué una capa adicional que esa tarea no cubre — factura
electrónica obligatoria país por país.** Detalle completo en la Fase F.
Resumen: a fecha de agosto 2026, ningún mandato nacional de e-invoicing
de los 30 mercados obliga hoy a CAMBRA (proveedor francés facturando en
reverse-charge transfronterizo, sin establecimiento en el país del
cliente) — todos los regímenes revisados son de alcance doméstico
(ambas partes establecidas en el mismo país). Hay 3 países donde esa
exclusión no está confirmada con la misma claridad (Rumanía, Bélgica,
Grecia) y un hito futuro real y ya legislado (ViDA, obligatorio desde el
1 de julio de 2030) que sí alcanzará exactamente el modelo de negocio de
CAMBRA. Nada de esto bloquea el lanzamiento hoy, pero hay que dejarlo
documentado y no fingir que no existe.

---

## Lo que tienes que hacer

### FASE A — Investigación previa (rápida, antes de traducir nada)

No repitas mi investigación de arriba, pero sí valida y completa estos
tres puntos concretos, porque yo no los verifiqué a fondo:

1. **Confirma el idioma nativo prioritario de cada uno de los 30 mercados
   activos** usando `native_locales` de `config/europe-locales.json` como
   punto de partida, pero contrástalo — por ejemplo Chipre (`CY`) tiene
   `el-CY` y `tr-CY`; para un producto B2B dirigido a la República de
   Chipre (estado miembro UE) el griego es el idioma de negocio real, el
   turco es secundario. Malta (`MT`) e Irlanda (`IE`) tienen inglés como
   idioma oficial además del nativo — decide si vale con EN o si merece
   traducción propia. Documenta cada decisión, no la des por sentada.

2. **Confirma si hace falta traducir a `nl` (neerlandés).** Solo lo hablan
   `NL` y `BE` de forma nativa entre los 33 mercados del catálogo, y
   ambos están en `protected` (no se lanzan, `protectedMode:
   RESEARCH_ONLY`). Si es así, `nl` NO es necesario para el lanzamiento
   de los 30 — confírmalo y no gastes esfuerzo ahí a menos que quieras
   dejarlo listo para cuando FR/BE/NL se desbloqueen legalmente.

3. **Revisa si ya existe trabajo de traducción sin terminar** en el árbol
   (recuerda que hay cientos de archivos sin commitear de una sesión
   anterior — la Fase 0 de `PROMPT_CIERRE_SELLADO.md` ya te habrá hecho
   pasar por todo eso, pero vuelve a mirar específicamente por si hay
   algo en `src/lib/locales/`, `config/europe-locales.json` o
   `src/content/legal/` que ya avance esto antes de empezar desde cero).

### FASE B — Lista de idiomas a construir

Con lo anterior confirmado, esta es mi estimación de partida (verifícala,
no la copies a ciegas):

**Prioridad alta — único idioma de negocio de al menos un mercado activo,
sin cobertura hoy:**
`de` (AT, LI, y parcial en CH/LU) · `it` (IT, parcial en CH) ·
`el` (GR, CY) · `bg` (BG) · `hr` (HR) · `cs` (CZ) · `da` (DK) ·
`et` (EE) · `fi` (FI) · `sv` (SE, parcial en FI) · `hu` (HU) ·
`lv` (LV) · `lt` (LT) · `pl` (PL) · `pt` (PT) · `ro` (RO) · `sk` (SK) ·
`sl` (SI) · `nb` (NO) · `is` (IS)

→ 20 idiomas nuevos.

**Prioridad baja — mercado ya cubierto por EN/FR/ES como idioma oficial
o mayoritario de negocio; evalúa si compensa:**
`mt` (Malta, ya tiene EN oficial) · `ga` (Irlanda, ya tiene EN oficial) ·
`lb` (Luxemburgo, ya tiene FR/DE) · `ca` (Andorra, ya tiene ES/FR) ·
`tr` (Chipre norte, fuera del foco B2B UE)

Confirma esta lista en la Fase A y ajústala si tu investigación encuentra
algo distinto.

### FASE C — Construcción, en bloques, no de golpe

Esto son ~20 idiomas × 537 claves = **más de 10.000 cadenas nuevas**, sin
contar los documentos legales. No lo intentes en un solo paso — hazlo en
bloques verificados:

1. Por cada idioma nuevo: crea `src/lib/locales/{code}.js` con las
   **mismas 537 claves exactas** que `en.js` (paridad estructural, nunca
   claves de más ni de menos), traducidas por un hablante nativo de
   calidad profesional — no traducción literal palabra por palabra,
   sino la que usarías en un producto financiero B2B real en ese idioma.
   Usa `base44/shared/localeRuntime.ts` → `CAMBRA_TERMINOLOGY` como
   glosario de términos ya fijados (verified_savings, effective_rate,
   benchmark, Recover, launch_readiness) y **amplíalo con el mismo
   criterio** para cada idioma nuevo — que "Recover" no se traduzca
   distinto en dos sitios del mismo idioma.
2. Registra el idioma en `src/lib/i18n.jsx`: añádelo a `LANGUAGES`, a
   `CURRENCY_LOCALES` y a `DATE_LOCALES` con el locale BCP-47 correcto
   (usa `native_locales[0]` del mercado como referencia, no lo inventes).
3. Actualiza `config/europe-locales.json` (fuente) — añade el idioma a
   `productLocales`, actualiza `supported_product_locales` y
   `translation_readiness` de cada mercado que ese idioma cubre (de
   `FALLBACK_ONLY`/`PARTIAL_NATIVE` a `NATIVE_PRODUCT`), y corre
   `npm run locales:generate` (regla R2 — nunca edites a mano
   `src/lib/generated/localeRegistry.js`/`.ts`).
4. Actualiza `src/lib/i18nParity.test.js`: amplía la lista fija de
   idiomas soportados a la lista final, y añade el nuevo diccionario al
   objeto `dictionaries` del test para que la paridad de 537 claves se
   verifique también en el idioma nuevo.
5. Corre `npm run test` (o al menos el fichero de i18n) después de
   **cada idioma**, no al final de los 20 — así un error de paridad se
   detecta en el idioma que lo causó, no en un batch de 10.000 líneas.

Para los documentos legales (`src/content/legal/{code}/{terms,privacy,cookies,dpa}.js`,
mismo patrón que EN/ES/FR ya usan) — trabájalos en un segundo pase, no
mezclados con la traducción de producto: son textos con implicaciones de
cumplimiento distintas y un error ahí pesa más que uno en la UI. Usa
`legalIdentityConsistency.test.js` como referencia del patrón de
verificación cruzada que ya existe para EN/ES/FR y replícalo.

### FASE D — El hueco de moneda real (seed de tarifas)

Para los mercados activos con moneda no-EUR sin cobertura hoy en
`seedPaymentsRateTable/entry.ts` (`CZ, DK, HU, PL, RO, SE, NO, IS, CH,
LI`), en este orden de prioridad:

1. **Mejor opción**: busca tarifas públicas reales de PSPs con presencia
   en esos mercados en su moneda local, con `source_url` +
   `source_quote` verbatim — exactamente el mismo estándar que ya usan
   las 18 filas `verified:true` existentes. **Nunca inventes una fila.
   Sin fuente, no hay fila** — esto ya es una regla dura del proyecto,
   no la relajes por prisa.
2. Si no encuentras fuente verificable para un mercado concreto: dilo
   explícitamente en tu reporte y deja que ese mercado siga cayendo en
   el cohorte `ANY|ANY|EU` — pero confirma que, cuando eso pase, la UI
   muestra con claridad que es una cifra de referencia general y no
   específica del mercado/moneda del merchant (revisa
   `AssumptionsFootnote.jsx`, ya tocado en la Tarea 5 de
   `CODEX_MASTER_PROMPT.md`).
3. No implementes conversión de divisa silenciosa (mostrar una cifra en
   EUR como si fuera CZK, o viceversa, sin decirlo) — si no hay dato
   nativo en la moneda del mercado, se declara la limitación, no se
   disfraza.

### FASE E — Calidad "perfecto y sin errores" — sé honesto sobre qué es alcanzable desde el repo

Puedo pedirte precisión estructural (paridad de claves, sin cadenas
vacías, terminología consistente, tests verdes) y coherencia lingüística
de alta calidad. Lo que **no** puedo pedirte de forma creíble es una
revisión de nativo humano de cada uno de ~20 idiomas nuevos ni una
revisión legal por país — eso es exactamente la misma categoría que
`legal_review_status: LEGAL_REVIEW_REQUIRED` que ya existe para EN/ES/FR
en `config/europe-locales.json`. Usa el mismo campo, en el mismo estado,
para cada idioma nuevo. No marques ningún idioma como revisado por un
humano nativo si no lo ha revisado uno.

Antes de dar por cerrado cada idioma, corre estas comprobaciones
automáticas como mínimo (documenta cuáles añades):
- Paridad de claves exacta contra `en.js` (0 de más, 0 de menos).
- 0 valores vacíos o `undefined`.
- 0 valores idénticos al inglés en claves donde eso sería sospechoso
  (nombres propios como "CAMBRA" o "Recover" exceptuados a propósito).
- El locale BCP-47 usado en `LANGUAGES`/`CURRENCY_LOCALES`/`DATE_LOCALES`
  resuelve con `Intl.NumberFormat`/`Intl.DateTimeFormat` sin excepción.

### FASE F — Fiscalidad de los 30 mercados: lo que la Tarea 3 no cubre

La Tarea 3 de `CODEX_MASTER_PROMPT.md` (ya en marcha en
`agent/task3-tax-engine-30-markets`) resuelve **qué tratamiento de IVA
aplica** a cada factura (`EU_B2B_REVERSE_CHARGE`, `OUTSIDE_SCOPE_EU_VAT`,
`FR_STANDARD_TVA`) — eso es correcto y suficiente para el motor. Lo que
NO cubre, y que investigué específicamente porque me lo pediste, es si
alguno de los 30 países **obliga a emitir la factura en un formato de
facturación electrónica concreto** (más allá del tratamiento de IVA).
Es un área que se mueve rápido — cité fuentes, verifícalas y vuelve a
comprobar cualquier fecha antes de dar nada por definitivo.

**Hallazgo central: hoy, agosto 2026, ningún mandato nacional de
e-invoicing obliga a CAMBRA.** El patrón se repite en cada país
investigado — Italia (SDI), Alemania, España, Polonia (KSeF), Croacia:
el mandato es **estrictamente doméstico** (proveedor Y cliente
establecidos en el mismo país). CAMBRA es un proveedor francés
facturando en reverse-charge transfronterizo sin establecimiento en el
país del cliente — fuera de alcance en todos los casos confirmados.

**3 países donde esa exclusión NO está confirmada con la misma claridad
— verifica con un asesor antes de dar el visto bueno**:
- **Rumanía (e-Factura)** — el régimen más maduro y de mayor alcance de
  los revisados; el tratamiento exacto de una factura entrante en
  reverse-charge desde un proveedor no establecido no quedó claro en las
  fuentes. Prioridad más alta de las tres.
- **Bélgica** — mandato doméstico obligatorio desde el 1 de enero de
  2026 (Peppol-BIS); el trato de facturas transfronterizas entrantes en
  reverse-charge no se confirmó explícitamente.
- **Grecia (myDATA)** — entrando en vigor por fases durante 2026; una
  fuente indica que el e-invoicing "sigue siendo opcional" para
  transacciones con empresas de la UE, pero no lo tomes como definitivo.

**Un caso propio que sí te afecta directamente — investígalo aparte**:
Francia tiene, además de su mandato doméstico de e-invoicing (que no
aplica a las ventas de CAMBRA a clientes no franceses), una obligación
separada de **e-reporting** para transacciones internacionales, que
podría alcanzar a CAMBRA precisamente por ser la parte francesa de la
operación. No lo confundas con el mandato de e-invoicing doméstico —
son obligaciones distintas. Pide a tu asesor fiscal que confirme si
e-reporting aplica a las ventas B2B transfronterizas en reverse-charge
de CAMBRA.

**Hito futuro real, ya legislado, que sí alcanzará a CAMBRA — no lo
construyas ahora, pero documéntalo**: el paquete "VAT in the Digital
Age" (ViDA) de la UE, adoptado como Directiva (UE) 2025/516, establece
que desde el **1 de julio de 2030** la factura electrónica estructurada
(EN 16931) y el reporte casi en tiempo real serán obligatorios
específicamente para operaciones B2B transfronterizas intracomunitarias
— incluyendo, de forma explícita, reverse-charge cuando el proveedor no
está establecido en el país del cliente. Es exactamente el patrón de
negocio de CAMBRA. Faltan casi 4 años; no es una tarea de este prompt,
pero sí debe quedar registrada como un requisito futuro con fecha, para
que nadie lo redescubra desde cero en 2029.

**Qué hacer con todo esto ahora mismo:**
1. No implementes ningún envío estructurado a plataformas nacionales
   (KSeF, SDI, Peppol, e-Factura...) — no es necesario hoy y añadiría
   complejidad sin obligación legal real.
2. Sí añade un campo de seguimiento — puede ser tan simple como una
   entrada en `config/data-retention-matrix.json` o un documento nuevo
   `docs/EINVOICING_COMPLIANCE_WATCH.md` — con los 3 países a verificar
   con el asesor, el caso de e-reporting francés, y el hito ViDA de
   2030 con su fecha.
3. Pregunta explícitamente al asesor fiscal (la misma persona que firma
   `RECOVER_TAX_CONFIG_JSON` en la Tarea 3) sobre los 4 puntos abiertos
   de arriba — no lo cierres tú mismo, ni lo des por bueno solo porque
   la investigación automatizada no encontró nada en contra.
4. Si Peppol se vuelve un estándar de facto que varios clientes esperan
   (aunque no sea obligatorio), considéralo una mejora de producto
   futura, no un bloqueante de lanzamiento — anótalo en el mismo
   documento de seguimiento, no lo mezcles con lo legalmente exigido.

---

## Definición de "hecho" para este prompt

- `npm run verify` completo en EXIT 0, incluyendo el test de paridad
  ampliado.
- Cada uno de los 30 mercados activos tiene `translation_readiness:
  NATIVE_PRODUCT` en `config/europe-locales.json`, salvo los que decidiste
  explícitamente dejar en fallback con una razón documentada (ej. si de
  verdad decides que Malta/Irlanda no lo necesitan).
- El hueco de moneda de la Fase D queda cerrado con fuentes verificadas
  donde existan, y explícitamente documentado (no oculto) donde no.
- El documento de seguimiento de e-invoicing de la Fase F existe, con
  los 3 países a verificar, el caso francés de e-reporting, y el hito
  ViDA 2030 — sin implementar ningún envío estructurado que hoy no hace
  falta.
- Un documento nuevo, `src/docs/Decision_Log_I18N_30_MERCADOS.md`, con el
  mismo formato que `src/docs/Decision_Log_I18N_GAP.md` ya existente:
  qué se añadió, qué se decidió deliberadamente distinto, qué queda
  pendiente de revisión humana/legal por idioma.

## Formato de reporte

Por cada idioma (o bloque de idiomas si los agrupas), igual que en los
prompts anteriores: archivos cambiados, resultado de test/verify, y
cualquier mercado donde decidiste no perseguir `NATIVE_PRODUCT` — con la
razón. Si el test de paridad falla en un idioma concreto, para ahí,
arréglalo, y no sigas acumulando idiomas sobre una base rota. Para la
Fase F, reporta explícitamente qué confirmó o no confirmó el asesor
fiscal en los 4 puntos abiertos — no lo des por cerrado sin esa
confirmación.
