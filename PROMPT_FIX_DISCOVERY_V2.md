# Prompt maestro — arreglar Discovery V2 de verdad (fuentes, enriquecimiento, scoring, pipeline, UI)

> Pégalo entero en tu Claude Code / Codex local, dentro de
> `cambra-global-p1-p5-copy`. Esto forma parte de los ~550 archivos sin
> commitear de la Fase 0.2 de `PROMPT_CIERRE_SELLADO.md` — cuando
> termines este prompt, ese bloque de archivos (Discovery V2 completo)
> ya está listo para commitearse como un bloque propio y coherente en
> esa fase, con su propio mensaje.

---

## Contexto — auditoría real ya hecha, no la repitas

Mandé un agente a leer el motor completo (`discoveryV2Admin.ts`, 3.116
líneas) y los tests reales, no la documentación de diseño. Esto es lo
que encontró, con archivo y línea:

**Lo que SÍ funciona, wireado de verdad:**
- La máquina de estados completa: `startRun` (`discoveryV2Admin.ts:1232`)
  → `executeDiscoveryRun` (`:2097`) → `advanceRun` (`:1936`) recorre
  `PLAN → NATIVE_DISCOVERY → LOCAL_PREFIT → SELECTIVE_COMPANY_ENRICHMENT
  → SCORING → COMPLETE`.
- El scoring: `stageScore` (`:1754`) llama a `leadScoringAgent`, que
  corre `buildResilientLeadScore` (`base44/shared/leadScoringResilience.ts:131-181`)
  y rellena `score`/`score_breakdown_json` de verdad.
- El presupuesto: `claimDiscoveryRunBudget` (`costGovernance.ts:278`)
  comprueba `hard_cap_minor` antes de reservar gasto — real, no decorativo.
- `AdminDiscovery.jsx` es una UI completa y real (no un stub), 95 líneas
  densas que llaman a las acciones `discovery_v2_*` de `adminSummaries`.

**Lo que está roto o mal etiquetado:**
- **El enriquecimiento es un no-op.** `stageEnrich` (`:1672`) llama a
  `leadEnrichmentAgent` con `operation: "COMPANY_ENRICHMENT"`, pero esa
  función (`leadEnrichmentAgent/entry.ts:457`) corta en seco cualquier
  operación que no sea `CONTACT_RESOLUTION` y devuelve
  `"NO_COMPANY_ENRICHMENT_ADAPTER_CONFIGURED"` sin hacer nada — hay un
  comentario en el código que dice literalmente "ese camino está
  eliminado". El paso que describiste como clave — rellenar y ampliar
  la info de los mejores leads — hoy no hace nada.
- **La transición de pipeline no toca el campo que debería.** La acción
  "añadir a Growth" (`resultAction`, `:2304`) cambia `revenue_stage` y
  `reservoir_state`, pero nunca el campo `stage` del propio
  `OutboundLead` (`lead → enriched → scored → outreach_ready → ... →
  won/lost`). Esa progresión real la mueven workers antiguos sin
  relación (`autonomousCommercialWorker`, `alwaysOnLeadDiscoveryWorker`),
  no el flujo que ves en el dashboard de Discovery.
- **El corte automático Apollo → Instantly ya está diseñado y a medias
  construido, pero no funciona todavía por 3 fallos concretos** (no por
  falta de capacidad de Instantly, ver Fase A): `searchCompanies()`
  lanza error siempre en vez de llamar al endpoint real,
  `status()` reporta `BLOCKED` siempre aunque esté todo configurado, y
  el motor del dashboard (`discoveryV2Admin.ts`) ni siquiera llama a la
  función que decide qué proveedor usar — sigue con Apollo a pelo.
- `APOLLO_CONTRACT_EXPIRES_AT` (`2026-09-07T23:59:59.999Z`,
  `leadIntelligenceProvider.ts`) es correcto tal cual — es la fecha real
  de corte del contrato de Apollo, no hay que quitarla, solo terminar de
  conectar lo que depende de ella (Fase A/B).
- Campos del esquema que la documentación de diseño describe como
  evidencia de la ejecución (`pipeline_transition_json`,
  `intelligence_contribution_json`, `correction_refs`) se inicializan a
  vacío al crear la run y **nunca se actualizan en ningún otro sitio**.
- **Ninguna función de etapa tiene un test de comportamiento real.**
  `stageDiscovery`, `stagePrefit`, `stageEnrich`, `stageScore`,
  `resultAction`, `advanceRun` solo aparecen en los tests dentro de
  comprobaciones de texto (`toContain` sobre el código fuente), nunca se
  invocan de verdad. Por eso el no-op del enriquecimiento nunca saltó.
- Todo esto está sin commitear todavía y nunca ha pasado un
  `npm run verify` real ni CI.

---

## Decisiones del fundador — ya tomadas, no las abras como preguntas

1. **Apollo descubre hasta que expire su contrato; Instantly SuperSearch
   toma el relevo automáticamente después — y esto YA está construido
   en un 80%, a medias.** No es una decisión que haya que implementar de
   cero: encontré `selectLeadIntelligenceProvider`
   (`leadIntelligenceProvider.ts`) con la lógica exacta ya escrita —
   `apollo_active_until_contract_expiry` mientras Apollo esté vivo,
   corte automático a Instantly cuando `APOLLO_CONTRACT_EXPIRES_AT`
   (`2026-09-07T23:59:59.999Z`) pasa. Y encontré `runInstantlyPreviewDiscovery`
   (`leadDiscoveryAgent/entry.ts:166-460`) — una función completa, con
   control de coste, checkpoints y deduplicación, que ya implementa
   exactamente el patrón que pediste: descubre por SuperSearch, y
   **descarta deliberadamente el contacto que SuperSearch trae pegado**
   (`bundled_person_data_policy: "DISCARDED_NOT_PERSISTED_NOT_SCORED_PRE_CONTACT_GATE"`,
   `person_filters_applied: false`) para tratarlo como descubrimiento de
   empresa puro, dejando la resolución de contacto para la etapa
   correspondiente más adelante — igual que con Apollo. Esto es trabajo
   reciente y real (el fichero tiene historial de commits, no es parte
   del montón viejo sin tocar), simplemente quedó a medias.
2. **Lo que de verdad bloquea esto son 3 fallos concretos, no una
   limitación del producto ni una decisión de arquitectura pendiente —
   arréglalos, no reconstruyas nada desde cero (Fase A):**
   - `InstantlySuperSearchLeadProvider.searchCompanies()`
     (`leadIntelligenceProvider.ts`) lanza siempre
     `INSTANTLY_COMPANY_SEARCH_UNSUPPORTED_CONTACT_PERSON_ONLY`, en vez
     de llamar al endpoint real (`/supersearch-enrichment/preview-leads-from-supersearch`)
     que `runInstantlyPreviewDiscovery` ya espera que llame — mismo
     endpoint que `searchPeople` ya usa correctamente en esa misma
     clase. Apunta `searchCompanies` a ese mismo endpoint.
   - `InstantlySuperSearchLeadProvider.status()` devuelve `BLOCKED`
     siempre, incluso con `configured` y `permissionVerified` en `true`
     — por eso `selectLeadIntelligenceProvider`, aunque ya tiene la
     lógica de corte correcta, nunca puede elegir Instantly. Corrige
     `status()` para que reporte disponible cuando de verdad lo esté.
   - **`discoveryV2Admin.ts` (el motor que usa el dashboard de Discovery
     V2) no llama a `selectLeadIntelligenceProvider` en ningún sitio** —
     hoy usa Apollo a pelo, sin pasar por la lógica de corte que ya
     existe en otro fichero. Conéctalo: `stageDiscovery` debe preguntar
     a `selectLeadIntelligenceProvider` qué proveedor usar en cada
     momento, no asumir Apollo siempre.
3. **No toques el candado manual de permiso de Instantly.** El código ya
   exige una fila en `CommercialProviderState` con
   `metrics_json.supersearch_permission_verified === true` antes de
   permitir cualquier llamada a Instantly — y `INSTANTLY_API_KEY`
   configurada. Esto parece un candado deliberado (confirmar que el
   plan contratado de Instantly de verdad incluye acceso a la API de
   SuperSearch antes de fiarse de ella) — mantenlo tal cual, no lo
   saltes ni lo automatices sin que el fundador confirme el plan.
4. **El enriquecimiento debe hacer dos cosas**, no una: (a) rellenar los
   datos de firmografía de la empresa (`employee_range`,
   `revenue_range`, `detected_technologies`, `ecommerce_platform`,
   `probable_payment_stack`, estimaciones de TPV) — la "info ampliada"
   que pediste —, y (b) resolver un contacto real por empresa (nombre,
   email, cargo) — el "contacto por empresa" que pediste. Esto aplica
   igual sea cual sea la fuente de descubrimiento (Apollo o Instantly),
   porque ambas tratan el contacto como un paso posterior separado, no
   parte del descubrimiento — únelas correctamente en la etapa de
   enriquecimiento, no elijas solo una.
5. **Solo los mejores leads se enriquecen, nunca todos.** Es
   literalmente lo que el nombre de la etapa (`SELECTIVE_COMPANY_ENRICHMENT`)
   ya promete — verifica que de verdad filtra por `enrichment_worthy` /
   `pre_score` calculado en `LOCAL_PREFIT` antes de gastar en
   enriquecimiento, y si no lo hace, constrúyelo. El criterio de "mejor"
   debe derivarse de los filtros que el fundador puso al crear la run,
   no de un umbral fijo en el código.

---

## Lo que tienes que hacer

### FASE A — Termina el corte Apollo → Instantly que ya estaba a medias

No reconstruyas la lógica de selección de proveedor — ya existe y es
correcta. Arregla solo los 3 puntos concretos que la bloquean:

1. **`InstantlySuperSearchLeadProvider.searchCompanies()`
   (`leadIntelligenceProvider.ts`)**: hoy lanza
   `INSTANTLY_COMPANY_SEARCH_UNSUPPORTED_CONTACT_PERSON_ONLY` siempre.
   Cámbialo para que llame al mismo endpoint que `searchPeople` ya usa
   correctamente (`/supersearch-enrichment/preview-leads-from-supersearch`)
   — es el que `runInstantlyPreviewDiscovery` en `leadDiscoveryAgent/entry.ts`
   ya está preparado para consumir, incluyendo la política de descartar
   el contacto pegado al resultado (`bundled_person_data_policy`) —
   no toques esa parte, ya está bien.
2. **`InstantlySuperSearchLeadProvider.status()`**: hoy devuelve
   `BLOCKED` siempre. Corrígelo para que devuelva disponible cuando
   `configured && permissionVerified` sean ciertos — exactamente la
   misma condición que ya usa `runInstantlyPreviewDiscovery` para su
   propio candado (`supersearch_permission_verified`). Reutiliza esa
   misma fuente de verdad en vez de duplicar el criterio.
3. **`discoveryV2Admin.ts` → `stageDiscovery`**: hoy no llama a
   `selectLeadIntelligenceProvider` en ningún sitio, usa Apollo
   directamente. Conéctalo: antes de invocar `leadDiscoveryAgent`,
   pregunta a `selectLeadIntelligenceProvider` qué proveedor está activo
   ahora mismo y pasa `provider: selected` en el body de la invocación
   (el propio `leadDiscoveryAgent` ya sabe despachar a
   `runInstantlyPreviewDiscovery` cuando `body.provider === "instantly_supersearch"`
   — revisa el dispatch al final del fichero).
4. No toques el candado de `CommercialProviderState.metrics_json.supersearch_permission_verified`
   ni la exigencia de `INSTANTLY_API_KEY` — son un candado deliberado
   (confirmar que el plan de Instantly de verdad incluye SuperSearch
   antes de fiarse de la API) y no de un bug. El fundador confirmará
   ese permiso manualmente antes del 7 de septiembre; tu trabajo aquí es
   que, una vez confirmado, el sistema lo use automáticamente — no saltarte
   la comprobación.

### FASE B — Verifica el corte, no lo elimines

1. Con la Fase A terminada, `APOLLO_CONTRACT_EXPIRES_AT` en
   `leadIntelligenceProvider.ts` deja de ser un problema por sí solo —
   es exactamente la fecha que marca el corte deseado, no algo que haya
   que arrancar del código. Confírmalo con un test: antes del 7 de
   septiembre `selectLeadIntelligenceProvider` debe elegir Apollo; desde
   el 7 de septiembre (con Instantly configurado y verificado) debe
   elegir Instantly automáticamente, sin deploy ni cambio de código ese
   día.
2. Añade la red de seguridad que hablamos: si Apollo falla *antes* del
   7 de septiembre (clave revocada, error 401/403 sostenido), que el
   sistema caiga a Instantly si está disponible, en vez de dejar
   Discovery completamente parado — y que quede registrado en
   `OperationalLog` o el mecanismo de alertas que ya use el proyecto,
   para que el fundador se entere de que el corte pasó antes de lo
   esperado.
3. Si Instantly también falla justo el día del corte (permiso no
   verificado, clave no configurada a tiempo), el sistema debe fallar
   de forma clara y visible en el dashboard (`no_available_lead_provider`,
   que ya existe como motivo en `selectLeadIntelligenceProvider`) — no
   debe intentar seguir usando Apollo en silencio después de expirado.

### FASE C — Arregla el enriquecimiento selectivo de verdad

1. Verifica primero si `LOCAL_PREFIT` (`stagePrefit`) calcula
   `pre_score` y `enrichment_worthy` de forma real a partir de los datos
   ya disponibles sin llamada paga, y si `SELECTIVE_COMPANY_ENRICHMENT`
   (`stageEnrich`) ya filtra por `enrichment_worthy === true` antes de
   llamar al enriquecimiento. Si no lo hace (compruébalo, no lo
   asumas), constrúyelo — el criterio de corte debe ser configurable
   desde los filtros de la run, no un número mágico en el código.
2. Construye el adaptador de enriquecimiento de empresa que falta: usa
   el endpoint de Organization/Company Enrichment de Apollo (mismo
   proveedor que ya usas para discovery — coherente con la decisión de
   arquitectura) para rellenar `employee_range`, `revenue_range`,
   `detected_technologies`, `ecommerce_platform`,
   `probable_payment_stack`, `estimated_tpv_min_eur`/`max_eur`. **Nunca
   inventes un valor si Apollo no lo devuelve** — dejar un campo vacío
   es correcto, rellenarlo con un valor inventado no lo es (misma regla
   que ya rige las tarifas del rate table en este proyecto).
3. En la misma etapa (o inmediatamente después, para los mismos leads
   seleccionados), invoca `leadEnrichmentAgent` con
   `operation: "CONTACT_RESOLUTION"` — el camino que **ya funciona** —
   para resolver el contacto real (nombre, email, cargo) por empresa.
   El resultado debe quedar en los campos existentes del
   `OutboundLead` (revisa `contact_full_name`, `contact_email`,
   `contact_title`, `contactability`).
4. Actualiza `last_enriched_at` y `stage: "enriched"` cuando ambas partes
   (firmografía + contacto) se completen — o documenta explícitamente
   qué pasa si solo una de las dos tiene éxito (enriquecimiento parcial:
   no lo marques como completo si falta el contacto, por ejemplo).

### FASE D — Confirma que el scoring usa los filtros del fundador y da contacto por empresa

1. Lee `buildResilientLeadScore` (`leadScoringResilience.ts:131-181`) y
   confirma que los criterios de scoring realmente derivan de los
   filtros que el fundador puso al crear la run (sector, rango de
   empleados, TPV estimado, plataforma de ecommerce, etc.) — no de una
   fórmula fija que ignora la configuración de la run. Si encuentras que
   ignora algún filtro relevante, arréglalo y dilo en el reporte.
2. Confirma que el resultado final por lead, una vez pasa por scoring Y
   enriquecimiento, incluye de verdad un contacto nombrado por empresa
   (no solo el dominio/nombre de la empresa) — es explícitamente lo que
   pediste ("me dará contacto por empresa").

### FASE E — Arregla la transición real a pipeline

1. `resultAction` (`:2304`) debe transicionar `OutboundLead.stage` por
   el enum real (`lead → enriched → scored → outreach_ready → ...`),
   no solo tocar `revenue_stage`/`reservoir_state`. Decide y documenta
   qué acción del founder corresponde a qué transición de `stage` (por
   ejemplo: "añadir a pipeline" → `outreach_ready`; "descartar" →
   `disqualified`).
2. Rellena `pipeline_transition_json` en `DiscoveryExecutionRun` cada
   vez que una acción mueve leads de stage — es la evidencia inmutable
   de ejecución que la propia entidad promete y hoy no cumple.
3. Concilia esto con los workers antiguos que hoy mueven `stage` por su
   cuenta (`autonomousCommercialWorker`, `alwaysOnLeadDiscoveryWorker`)
   — no crees dos caminos que se puedan pisar entre sí. Si un lead
   viene de una run de Discovery V2, que sea Discovery V2 quien controle
   su `stage` hasta que entre en outreach; documenta la frontera exacta.

### FASE F — UI: que se vea todo lo de arriba

Revisa `AdminDiscovery.jsx` con las Fases C-E ya implementadas y
confirma que la interfaz muestra, por cada lead de una run completada:
el score y su desglose, el estado de enriquecimiento (firmografía +
contacto, no solo un booleano genérico), el contacto resuelto si existe,
y una acción clara para moverlo a pipeline que dispare de verdad la
transición de `stage` de la Fase E. Si algo de esto falta en la UI
aunque el backend ya lo tenga, es tarea tuya añadirlo aquí — el
fundador pidió explícitamente que "cumpla con la UI".

### FASE G — Campos muertos del esquema

`intelligence_contribution_json` y `correction_refs` en
`DiscoveryExecutionRun` siguen sin poblarse tras las fases anteriores.
Decide para cada uno: o lo conectas a algo real (por ejemplo,
`correction_refs` podría enlazar con casos donde un founder corrigió
manualmente un resultado de scoring — revisa si existe ese flujo en
otro sitio del código antes de construirlo de cero) o documentas
explícitamente en `src/docs/` por qué se queda vacío por ahora y no es
una evidencia que este prompt deba cerrar.

### FASE H — Tests reales de las funciones de etapa

Esto es la causa raíz de por qué el bug del enriquecimiento nunca se
detectó — ciérrala bien:

1. Añade tests de comportamiento (no grep de strings) que invoquen
   directamente `stageDiscovery`, `stagePrefit`, `stageEnrich`,
   `stageScore`, `resultAction` y `advanceRun` con datos simulados,
   verificando las transiciones de estado y de `stage` reales, no solo
   que la función "no lance".
2. Un test específico que habría detectado el no-op de esta ronda:
   crear un lead con `enrichment_worthy: true`, correr `stageEnrich`, y
   comprobar que `employee_range`/`contact_email`/`last_enriched_at`
   quedan realmente rellenos — no que la función devuelva `ok`.
3. Un test que confirme que un lead con `enrichment_worthy: false` NO
   se envía a enriquecer (protege la Fase C.1 — selectividad real).
4. Mantén `discoveryV2OperationalTruth.test.js` como está (su cobertura
   de concurrencia/leasing es buena) y añade estos nuevos tests en un
   fichero que sí cubra las etapas de negocio — no los mezcles.

### FASE I — Encaje con la higiene de repo

Cuando termines A-H, esto queda listo para entrar en la Fase 0.2 de
`PROMPT_CIERRE_SELLADO.md` como su propio bloque de commit: todo
Discovery V2 (motor, entidad, tests, UI, docs) junto, con un mensaje que
describa qué se arregló (no lo que la documentación de diseño original
prometía). `npm run verify:chunk` debe pasar en EXIT 0 con este bloque
incluido antes de darlo por commiteado.

---

## Definición de "hecho"

- `selectLeadIntelligenceProvider` elige Apollo antes del 7 de
  septiembre de 2026 y cambia solo a Instantly SuperSearch después,
  verificado por test con fechas simuladas — sin deploy el día del
  corte.
- Los 3 fallos de la Fase A están corregidos: `searchCompanies` de
  Instantly llama al endpoint real, `status()` refleja el estado real,
  y `discoveryV2Admin.ts` consulta a `selectLeadIntelligenceProvider`
  en vez de asumir Apollo.
- El candado manual de permiso de Instantly
  (`supersearch_permission_verified`) sigue intacto y es quien decide
  si Instantly está realmente disponible tras el corte.
- Un lead con `enrichment_worthy: true` que pasa por una run completa
  termina con firmografía rellena (cuando Apollo la tiene) Y un contacto
  resuelto (nombre/email/cargo) — verificado por test, no por lectura de
  código.
- Un lead con `enrichment_worthy: false` nunca gasta presupuesto de
  enriquecimiento.
- `resultAction` transiciona `OutboundLead.stage` de verdad y
  `DiscoveryExecutionRun.pipeline_transition_json` deja evidencia de
  cada transición.
- La UI muestra score, desglose, estado real de enriquecimiento y
  contacto resuelto por lead, con una acción de pipeline que funciona.
- Tests de comportamiento reales para las 6 funciones de etapa,
  incluyendo el caso que habría detectado el bug de esta ronda.
- `npm run verify:chunk` EXIT 0 con todo esto incluido.

## Formato de reporte

Por cada fase: archivos cambiados, qué encontraste que ya funcionaba
correctamente (no lo reescribas si ya estaba bien — dilo y sigue), qué
estaba roto y cómo lo arreglaste, resultado real de test/verify, y
cualquier decisión de arquitectura que tomaste que no estuviera 100%
explícita en este prompt.
