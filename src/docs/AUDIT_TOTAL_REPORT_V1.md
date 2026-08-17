# AUDITORÍA TOTAL — Reporte de Fase 1 (v1, PARCIAL)

**Fecha:** 2026-08-17
**Directorio:** `cambra-global-p1-p5-copy` (confirmado con `pwd`), rama `agent/i18n-30-markets`
**Toolchain:** Node 24.19.0 / npm 11.17.0 exactos
**Estado de la Fase 1: NO CERRADA.** Instrumento construido, 3 dominios con resultado verificado,
6 pendientes. Lo explico abajo sin adornarlo.

---

## 0. Lo primero: por qué este reporte no dice "Fase 1 completa"

El prompt advierte contra la fantasía de "leer todas las líneas" y pide en su lugar la técnica
reproducible. Construí esa técnica y la ejecuté. Lo que produce, sobre 961 ficheros de código y
312 de test, son **2.196 candidatos**. Un candidato no es un hallazgo: cada uno hay que leerlo.

De los siete patrones, tres están **cerrados con veredicto verificado**. Cuatro tienen volumen
que requiere pasadas adicionales con filtros más finos. Decir "auditoría total completada" con
1.900 candidatos sin leer sería exactamente el tipo de afirmación que esta plataforma tiene ocho
gates para impedir.

**El instrumento queda en el repo** (`scripts/audit-sweep.mjs`, con test propio), así que las
pasadas siguientes no empiezan de cero.

---

## 1. El instrumento

`scripts/audit-sweep.mjs` — barrido de siete patrones sobre `base44/shared`, `base44/functions`,
`src/lib`, `src/pages`, `src/components`. Reporta `fichero:línea` y **sale con 0**, porque un
barrido heurístico que rompe el build acaba borrado. Los defectos confirmados sí llevan gate real.

**Por qué hacía falta.** El gate existente `harden-silent-failures.mjs` escanea **solo**
`base44/functions/**/*.ts` y solo dos formas (`.catch(() => null|[])` y `catch {}`). No mira
`base44/shared/*.ts` — **210 módulos, incluido el que tenía el defecto original de
`founderOSData.ts`** — ni `src/**`, ni las formas multilínea, ni un helper `safe()` genérico que
se traga el error en un fallback del llamante. Ese es el hueco que este barrido cubre.

**El instrumento tiene test propio** (`src/lib/auditSweepInstrument.test.js`, 13 tests, R4: conduce
el barrido, no afirma sobre su código). Un instrumento de auditoría sin test es una fuente de
hallazgos falsos con confianza, y este ya produjo tres.

---

## 2. Resultados por patrón

| | Patrón | Candidatos | Estado |
| --- | --- | --- | --- |
| P1 | `catch` que se traga el fallo en un valor vacío | 355 | **abierto** — 20 en `shared/` sin registro de fallo son los que importan |
| P2 | literal `confidence`/`verified`/`status` hardcodeado | 65 | **abierto** |
| P3 | coerción que convierte "no lo sé" en cero | 1.246 | **abierto** — mayoría ruido, necesita el filtro "¿el cero se presenta como hecho?" |
| P4 | test que afirma sobre texto fuente (R4) | 161 | **abierto** |
| P5 | texto de UI describiendo un estado que cambió | 356 | **abierto** — mayoría claves i18n `placeholder`, ruido |
| P6 | módulo sin llamante de producción | 12 → **6 confirmados** | **CERRADO** |
| P7 | categoría de gasto sin capability de emergencia | **0** | **CERRADO (negativo verificado)** |

---

## 3. Hallazgos confirmados

### H-1 — Seis módulos construidos, testeados, documentados y sin llamante (CONFIRMADO)

La clase exacta que nombra el prompt. Cada uno verificado a mano con búsqueda de árbol completo:

`campaignMetrics.ts` · `campaignsIntegration.ts` · `conversationFollowUp.ts` ·
`evidenceReviewCore.ts` · `commandLegacyChatMigration.ts` · `senderHealthAndSuppressions.ts`

Toda referencia externa a cada uno es **su propio test y su propio decision log**. Nada de
producción los alcanza.

**`evidenceReviewCore.ts` es mío** — lo construí en Dashboard C5, escribí su decision log, y nunca
lo cableé. El log se lee como si la capacidad existiera.

Lo que hace esto más grave que código muerto normal: **los decision logs son el registro que lee
el founder para saber qué puede hacer la plataforma.** Seis describen capacidades sin forma de
invocarlas. Es un defecto de documentación, y el log es lo que la gente cree.

**No arreglado, y por qué:** cablear un módulo a una superficie es **decisión de alcance**, no
arreglo de bug — la regla de autoridad del propio prompt. Cada uno tiene una elección real detrás
(¿la revisión de evidencia va en Audits o en Merchants? ¿estos módulos de Campaigns reemplazan el
camino actual o lo duplican?). Recomendación única para los seis, y es barata: **o se cablea o se
borra, y en ambos casos se corrige el decision log que afirma que existe.** Dejar el tercer estado
—construido, documentado, inalcanzable— es lo que produjo el hallazgo.

Detalle: `src/docs/Decision_Log_AUDIT_H_CONSISTENCY.md`.

### H-2 — La clase de bug de emergencia está limpia (NEGATIVO VERIFICADO)

Las cuatro categorías de gasto declaradas en `CostUsageEvent.category` (`ai`, `api`, `enrichment`,
`email`) **están todas mapeadas** a una capability de emergencia en `costGovernance.ts:67-70`:
`email` → communications, y `api`/`enrichment`/`ai` → paid_discovery.

El hueco de `ai` era una instancia de una clase; la clase no tiene más miembros.

**Y aquí hay que contar algo de mi propio trabajo.** La primera versión de este check era
**vacía**: leía los enums de `EmergencyControl.jsonc`, que declara **dos** valores, así que
"0 categorías sin bloqueo" no comprobaba casi nada. Lo cazó una aserción anti-vacuidad que había
puesto en el test del instrumento (`expect(declared.length).toBeGreaterThan(3)`). El mecanismo
real es otro: `EmergencyControl` lleva **flags booleanos** `*_paused` y `costGovernance` mapea cada
categoría sobre uno. Check reescrito contra el mecanismo verdadero; el cero de ahora sí vale.

### H-3 — La matemática de facturación de Recover es exacta (NEGATIVO VERIFICADO)

El barrido de dominio A marcó `recoverBillingMath.ts` por aritmética de dinero sin `BigInt`.
Leído: **es correcto.** Unidades menores enteras de principio a fin, política de redondeo
half-up documentada, `divRoundHalfUp` en espacio entero, impuesto calculado sobre la comisión **ya
redondeada**, y `eurToMinor` con guardarraíl explícito de epsilon IEEE-754 para el caso
`19.995 * 100 = 1999.4999…`.

Céntimos enteros en un `Number` de JS son exactos hasta 2^53 — unos 90 billones de euros — así que
`BigInt` no hace falta aquí y su ausencia no es defecto. **La heurística sobre-marcó.**

Se registra porque la lista de "aritmética de dinero en float sin módulo exacto" tiene 223 líneas
y **el fichero más importante de esa lista está bien**. Cualquier uso de esa lista tiene que
arrancar de ese hecho.

---

## 4. Corrección a una premisa del prompt

El prompt dice que `.release-evidence/tests.json`, `vitest-raw.json` y `RELEASE.json` "llevan desde
el 14 de agosto sin refrescarse pese a decenas de commits reales encima".

**Ya no es cierto.** Los tres se regeneraron hoy, 2026-08-17, por los `npm run verify` completos de
C14, C15 y C16, y están commiteados. `vitest-raw.json` marca `14:43:19Z` y `RELEASE.json`
`14:44:12Z` de hoy. Era cierto cuando escribiste el prompt; mi propio trabajo reciente lo cambió.

El dominio F queda por tanto reducido al **barrido R4** (161 candidatos), que sigue abierto.

---

## 5. Lo que queda abierto en la Fase 1

**Los cuatro patrones con volumen** (P1, P2, P3, P4) necesitan pasadas con filtros más finos. El
criterio que los convierte en hallazgos reales, y que ya funcionó tres veces esta ronda:
un `|| 0` es defecto **cuando el cero se presenta luego como hecho o decide algo que un `null`
habría bloqueado**. Aplicar ese filtro a 1.246 candidatos es trabajo de varias pasadas, no de una.

**Dominios sin abrir todavía:** B (honestidad de lectura, más allá de los 20 sitios localizados),
C (tenant isolation en las superficies nuevas, secretos en logs/receipts), D (coherencia legal en
tres idiomas), E (paridad real de claves i18n), G (frozen sin tocar — parcialmente cubierto por los
gates que ya corren en verde), I (`npm audit` real y secretos en el árbol).

**El sello de producción sigue en `false`** y `legal_review` sigue en `PENDING` — sin tocar, como
manda el prompt.

---

## 6. Verify

`npm run verify` completo (pipeline de release entero, no `verify:chunk`) en **EXIT 0** con
evidencia fresca generada hoy: **4415 tests, 311 ficheros**, `release:check` PASS,
`productionSealEligible: false`, 12 requisitos de producción pendientes y **los 12 necesitan
evidencia de runtime o externa**.

Tras los cambios de esta auditoría hay que volver a correrlo; el commit de este reporte lo incluye.

---

## 7. Alcance exacto del push de la Fase 2 — SI el founder confirma

Lo que subiría, y nada más:

- Todo el trabajo de esta rama: DASHBOARD CORE C0–C16, CAMBRA Command C1–C7, i18n 30 mercados,
  FX paso 2, DPA, Discovery V2, Campaigns/Conversations.
- El instrumento de auditoría y su test.
- Este reporte y los decision logs de auditoría.
- Evidencia de release regenerada de verdad.

Lo que **no** cambia y sube tal cual está hoy:

- `productionSealEligible: false` y los ocho sellos raíz en `NOT_SEALED`.
- `legal_review: PENDING` en `config/legal/dpa-status.json` — sin tocar, decisión ya tomada.
- La región de alojamiento de Base44 sin confirmar.
- Los seis módulos desconectados, como hallazgo declarado con recomendación.

**PARADA.** No toco git remoto, GitHub ni Base44 sin tu confirmación explícita por escrito. Y antes
de que la des conviene que sepas que **la Fase 1 no está cerrada** — puedes confirmar la publicación
del estado actual sabiendo eso, o pedirme más pasadas de auditoría primero. Las dos son razonables;
lo que no lo sería es que confirmaras creyendo que la auditoría terminó.
