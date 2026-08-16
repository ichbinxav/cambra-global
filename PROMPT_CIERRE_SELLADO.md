# Prompt maestro — cierre, sellado y listo para lanzar (actualizado)

> Pégalo entero en tu Claude Code / Codex local, trabajando dentro de
> `cambra-global-p1-p5-copy`. Da por hecho que ya tienes en esa carpeta:
> `AUTORIA_COMMITS_PENDIENTES.md`, `CODEX_MASTER_PROMPT.md`,
> `SPEC_PIPELINE_NEGOCIACION.md` y
> `PROMPT_IDIOMAS_MONEDAS_30_MERCADOS.md`. Este prompt los encadena en el
> orden correcto — no los repite.

---

## Estado actual — no repitas trabajo ya hecho

1. **Fase 0.1 completada.** Los 3 commits de `AUTORIA_COMMITS_PENDIENTES.md`
   ya están en el historial con autoría correcta (`Codex
   <codex@local.invalid>`), `_incoming_patches/` borrada, nunca se usó
   `git am`. Verificado.
2. **Pendiente de verificación, no de ejecución**: se reportó un
   `npm run verify:chunk` "EXIT 0, 3.197 tests" sobre el árbol completo,
   pero ese número coincide exactamente con la cifra de uno de los 3
   commits individuales (un slice mucho más pequeño que el árbol real
   actual, que tiene ~550 archivos más incluyendo bastantes tests
   nuevos). Antes de asumir que la Fase 1 de este prompt ya está hecha:
   **exige una ejecución fresca y su output real**, no un número
   recordado. Si ya se hizo de verdad, perfecto, pero confírmalo primero.
3. **Tarea 3 (motor de impuestos) en marcha**, rama
   `agent/task3-tax-engine-30-markets`, con trabajo guardado en stash.
   No la reinicies — retómala y complétala con la Fase F de
   `PROMPT_IDIOMAS_MONEDAS_30_MERCADOS.md` (la capa de facturación
   electrónica que la Tarea 3 original no cubre) antes de darla por
   cerrada.
4. **Fase 0.2 sigue pendiente**: los ~550 archivos sin commitear de la
   sesión anterior (`adaptiveLead*`, `discoveryV2*`, `founderControlV2*`,
   páginas admin nuevas...) todavía no se han triado. Es el siguiente
   paso antes de correr un `verify` real de baseline.

---

## Contexto que necesitas antes de tocar nada

Esta copia tiene capas superpuestas:

1. Los 3 commits ya integrados (punto 1 de arriba) — no los toques salvo
   para el commit aclaratorio opcional que se comentó sobre el mensaje
   del primero (los manifiestos regenerados no viven en ese commit a
   propósito, porque se excluyeron de la aplicación del patch — no es un
   error, ya está aclarado con el fundador).
2. El resto de trabajo previo sin commitear (punto 4 de arriba), sin
   auditar ni pasado por `npm run verify` todavía.
3. Los gaps ya conocidos y documentados en `RELEASE.json` /
   `CODEX_MASTER_PROMPT.md` (motor de impuestos — en marcha, ver punto 3
   —, DPA sin integrar en la app, copy del funnel anónimo engañoso,
   cobertura de tarifas/idiomas incompleta — ver
   `PROMPT_IDIOMAS_MONEDAS_30_MERCADOS.md` para el prompt completo de
   idiomas + monedas + fiscalidad) y las piezas de UI de
   `SPEC_PIPELINE_NEGOCIACION.md` que aún no existen.

No asumas que nada de esto funciona hasta que `npm run verify` lo diga.
No edites `RELEASE.json` a mano bajo ningún concepto — se regenera solo,
nunca se fuerza.

---

## FASE 0 — Higiene de repo

**0.1** ✅ Hecho — ver "Estado actual".

**0.2** Pendiente. Para cada bloque coherente sin commitear (agrúpalos
por prefijo/feature: todo lo de `adaptiveLead*` junto, todo lo de
`discoveryV2*` junto, etc.): decide si es trabajo terminado y razonable
— en ese caso commitéalo con su propio mensaje, describiendo qué es — o
si está a medias/roto — en ese caso NO lo borres sin preguntar antes;
documenta en el reporte de esta fase qué encontraste y qué falta para
que esté completo.

**0.3** Al final de esta fase, `git status` debe quedar limpio: todo
commiteado, o explícitamente listado como pendiente con la razón.

---

## FASE 1 — Baseline real

**1.1** Instala con el toolchain exacto: Node 24.19.0, npm 11.17.0
(`npm run toolchain:check` es el primer gate y aborta con cualquier otra
versión). `npm ci`, nunca `npm install`.

**1.2** Corre `npm run verify:chunk` (o `npm run verify` completo si
tienes tiempo) sobre el árbol ya limpio de la Fase 0 — **una ejecución
real, ahora mismo, no una cifra de un commit anterior** (ver punto 2 de
"Estado actual"). Pega el output tal cual.

**1.3** Si algo falla que no venga de las fases siguientes de este
prompt, no lo arregles todavía a ciegas: lista cada fallo con su causa
probable y sigue a la Fase 2 con esa lista en mano.

---

## FASE 2 — Cerrar los gaps conocidos de release

Ejecuta las tareas de `CODEX_MASTER_PROMPT.md`, en su mismo orden, un
commit por tarea, `npm run verify` en verde antes de pasar a la
siguiente. Las Tareas 0, 1 y 2 de ese documento (git init, los 4 bugs,
extender el typecheck a las 300 funciones) **ya están resueltas** por
los commits de la Fase 0 — sáltatelas y ve directa a:

- **Tarea 3** — motor de impuestos a los 30 mercados activos (bloqueante:
  hoy solo factura en FR/ES). **Ya en marcha** (ver "Estado actual",
  punto 3) — retómala desde la rama/stash existente, y antes de darla
  por cerrada completa también la Fase F de
  `PROMPT_IDIOMAS_MONEDAS_30_MERCADOS.md` (facturación electrónica: qué
  país obliga a qué formato, qué no aplica hoy a CAMBRA, qué hay que
  vigilar de cara a 2030 con ViDA).
- **Tarea 4** — DPA firmable integrado en la app de verdad (rutas,
  página, aceptación electrónica, verificación cruzada con la política de
  privacidad). Los tres ficheros fuente (`dpa.js`/`dpa.es.js`/`dpa.fr.js`)
  ya están listos, solo falta integrarlos.
- **Tarea 5** — honestidad del funnel anónimo (alta prioridad: el copy
  actual presenta el precio de lista público del proveedor como si fuera
  lo que el merchant paga hoy).
- **Tarea 6** — cobertura de tarifas e idiomas para los 30 mercados.
  Este es exactamente el alcance de `PROMPT_IDIOMAS_MONEDAS_30_MERCADOS.md`
  (Fases A-E) — ejecútalo completo aquí, no lo trates como un prompt
  aparte y desconectado.

Las reglas de la casa de ese mismo documento (R1 a R6) aplican sin
excepción: toolchain exacto, jamás tocar a mano un archivo generado,
respeta los ficheros congelados de `config/pre-ecl-freeze.json`, no
"arregles" un test estático borrándolo o vaciándolo (excepto cuando el
propio cambio de alcance lo exige deliberadamente, como el test de
paridad de idiomas — documéntalo si lo haces), no crees funciones nuevas
bajo `base44/functions/` (límite de 50 en el plan de Base44 — nuevas
acciones van dentro de una función existente), y la definición de
"hecho" de cada tarea es siempre `npm run verify` en EXIT 0.

---

## FASE 3 — Piezas de negociación pendientes

`SPEC_PIPELINE_NEGOCIACION.md`, ya en esta carpeta, tiene las 16 piezas,
el diagrama de estados y la tabla de decisiones del fundador (las 7 están
cerradas, sin puntos abiertos). Lo que ya existe en el backend está
descrito en la tabla "Resumen" al principio del documento; lo que falta
es sobre todo interfaz:

- Dashboard del fundador para revisar/aceptar/rechazar cada caso.
- Vista de lista + detalle por caso: hilo de email completo, respuesta
  manual, botones Launch / Launch Own / Launch Comp.
- Notificaciones al merchant en cada cambio de estado (la matriz completa
  está en la Pieza correspondiente del spec).
- Dashboard de MIGRATIONS con las dos vías — cambio de configuración vs.
  desarrollo — y la lógica de escalera de responsabilidad.
- Vista de preview para los casos de desarrollo, estilo Base44.

Sigue las Piezas 1-14 tal como están escritas. Presta especial atención
al Piece 16 (invariantes duros A-D): los invariantes A (no-auto-inicio) y
B (integridad del hilo) ya están implementados en el backend por los
commits de la Fase 0 — la UI debe reflejarlos, nunca crear una vía que
los rodee (por ejemplo, un botón que dispare contacto con el proveedor
sin pasar por `negotiationLaunchAuthority`).

---

## FASE 4 — Verificación final e informe de cierre

**4.1** `npm run verify` completo, EXIT 0, sin excepciones ni gates
saltados.

**4.2** Genera `docs/REPOSITORY_CLOSURE_2026.md` como pide la Tarea 7 de
`CODEX_MASTER_PROMPT.md`: clasifica cada uno de los 20 `ROOT-OTR` y los
12 `pendingProductionRequirements` de `RELEASE.json` con exactamente uno
de estos tres valores: `REPO_COMPLETE`, `REPO_PARTIAL (razón)`,
`NOT_REPO_CLOSABLE`. Incluye en ese informe el estado de la Fase F
(facturación electrónica) como su propia línea, aunque no sea uno de los
20 ROOT-OTR originales — es un hallazgo nuevo de esta ronda.

**4.3** Regenera el manifiesto con `npm run release:manifest` — nunca a
mano. Si `readinessLevel` se queda en `NOT_GO_READY` porque falta
evidencia de runtime, ese es el resultado correcto y esperado. Dilo tal
cual, sin suavizarlo.

---

## Lo que no puedes hacer — no lo intentes, no lo simules

- Aprobación legal de Recover V2 y de las traducciones del mandato FR/ES.
- Configuración fiscal (`RECOVER_TAX_CONFIG_JSON`) firmada por un asesor
  fiscal real — tú construyes el motor, el asesor confirma los flags.
  Esto incluye los 4 puntos abiertos de la Fase F (Rumanía, Bélgica,
  Grecia, e-reporting francés) — no los cierres tú mismo.
- Revisión de un abogado del DPA, en especial del Anexo II.
- Revisión de nativo humano de cada idioma nuevo (Fase E de
  `PROMPT_IDIOMAS_MONEDAS_30_MERCADOS.md`) — puedes dejarlo con calidad
  automática verificada, no con "revisado por humano" si nadie lo revisó.
- Deploy real a Base44 y prueba de paridad de las 276 funciones.
- SPF / DKIM / DMARC y el ciclo de vida de supresión de email.
- Un drill real de backup/restore con RPO/RTO medidos.
- Un incidente de producción controlado para probar la entrega de alertas.
- Ventanas de SLO de 30 días.
- El primer merchant real completando el flujo entero: Connect → Sync →
  Analyzer → Recover → Verified Savings → Billing → Stripe →
  Reconciliation.

Ese último punto es el cuello de botella real de este proyecto, y no es
código.

---

## Qué significa "sellado y listo para lanzar" aquí — sé honesto

Significa: cada gap que se puede cerrar desde el repositorio está
cerrado, `npm run verify` está en verde, y el informe de cierre dice con
precisión qué queda pendiente y de quién depende cerrarlo. **No
significa** que `RELEASE.json` vaya a marcar `GO` — probablemente seguirá
en `NOT_GO_READY`, porque faltan pruebas de funcionamiento real que
ningún cambio de código puede sustituir. Repórtalo así, sin maquillarlo.

---

## Formato de reporte, por cada fase

1. Archivos cambiados (rutas).
2. Resultado exacto de `npm run verify` (o `verify:chunk`) — siempre de
   una ejecución real y reciente, nunca una cifra citada de memoria o de
   un commit anterior.
3. Tests añadidos y qué comportamiento comprueban — no qué strings buscan.
4. Cualquier cosa que encontraste y no estaba prevista en este prompt.
5. Cualquier cosa que decidiste no hacer, y por qué.

Si un gate falla y no entiendes por qué: para y pregunta. No toques un
archivo generado, uno congelado, ni `RELEASE.json` para forzar que pase.
