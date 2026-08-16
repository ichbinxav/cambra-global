# Bloque 5 — GTM y deliverability

**Corte de investigación:** 13 de agosto de 2026  
**Estado recomendado:** `RESEARCH_SEALED`  
**Implementación:** `FAIL_CLOSED` hasta completar pruebas reales de DNS, headers, unsubscribe, reputación y entrega con los dominios y buzones de Instantly.

## Niveles usados

- `VERIFIED_OFFICIAL`: documentación oficial del proveedor u organizador.
- `VERIFIED_VENDOR`: información publicada por el propio competidor.
- `INFERRED`: conclusión derivada de varias fuentes.
- `PROPOSED`: política interna recomendada para CAMBRA.

---

## 1. Conclusión ejecutiva

Las decisiones importantes para CAMBRA son estas:

1. Google ha endurecido de verdad la aplicación de sus reglas. Desde noviembre de 2025 está aumentando los rechazos temporales y permanentes. Además, si un dominio alcanza una vez el umbral de bulk sender de Gmail, conserva esa clasificación de forma permanente. Google agrega el volumen de los subdominios bajo el mismo dominio principal.
2. Microsoft ya rechaza remitentes de alto volumen mal autenticados con `550 5.7.515`. Para Microsoft consumer, el umbral publicado es de 5.000 mensajes diarios usando el mismo dominio `5322.From`.
3. CAMBRA debe implantar un estándar universal más estricto que el mínimo de cada proveedor: SPF, DKIM de 2048 bits, DMARC, alineación, PTR, TLS, RFC 8058 one-click unsubscribe y suppression global, aunque Microsoft todavía trate el one-click como recomendación y no como requisito duro de autenticación.
4. Apollo e Instantly no deben decidir qué empresa es un buen merchant. Deben resolver al decisor y el email después de que CAMBRA haya descubierto y validado la empresa mediante directorios, ferias, tecnología, checkout y evidencia web.
5. Por el foco actual de lanzamiento, España debe ser el mercado de proof-of-demand. Francia puede alimentar inteligencia, benchmarks, directorios y pipeline futuro, pero no justificar viajes o campañas activas hasta que cambie el market flag.
6. Las prioridades presenciales de mayor valor son Digital 1to1 Barcelona, E‑SHOW Madrid y uno o dos eventos verticales. Las grandes ferias francesas deben utilizarse inicialmente para extraer directorios de marcas y encontrar partners, no para gastar dinero indiscriminadamente en presencia física.
7. El competidor directo más parecido no es CMSPI ni Harmonize: es EcomStream, porque ofrece auditoría de costes, benchmark, renegociación con el PSP actual y no-cure-no-pay para retailers y marcas europeas. CAMBRA no debe afirmar que “nadie hace optimización de pagos”; debe afirmar que automatiza y hace accesible al mid-SMB europeo lo que hoy se presta principalmente como consultoría especializada o software enterprise.
8. Existe una decisión estratégica pendiente sobre la independencia: CAMBRA no puede venderse como asesor completamente independiente y, al mismo tiempo, recibir comisiones opacas de los PSP recomendados. EcomStream utiliza precisamente la ausencia de acuerdos de referral con PSP como argumento competitivo.

---

## 2. Requisitos vigentes de bulk senders en 2026

### Comparativa operativa

| Proveedor | Cuándo considera bulk/high-volume | Autenticación exigida | Quejas | Unsubscribe |
|---|---|---|---|---|
| Google Gmail personal | Aproximadamente 5.000 mensajes en 24 horas al Gmail personal, agregando subdominios bajo el mismo dominio principal. Alcanzarlo una vez deja la clasificación permanente. | Para cualquier remitente: SPF o DKIM. Para bulk: SPF y DKIM, DMARC mínimo `p=none`, alineación del From, PTR, TLS y formato RFC 5322. | Google aconseja mantenerla por debajo de 0,1% y evitar llegar a 0,3%. | RFC 8058 one-click y enlace visible en el cuerpo para mensajes promocionales o de suscripción; procesamiento en un máximo de 48 horas. |
| Yahoo/AOL | Yahoo habla de remitentes de volumen significativo, pero en la documentación oficial revisada no publica un umbral numérico equivalente a los 5.000 de Gmail/Microsoft. | SPF y DKIM para bulk, DMARC mínimo `p=none`, autenticación y alineación. PTR válido y gestión activa de reputación. | Debe permanecer por debajo de 0,3%. Para CAMBRA conviene aplicar un límite interno más estricto de 0,1%. | One-click unsubscribe para correo comercial/promocional y mecanismo visible de baja. |
| Microsoft Outlook.com/Hotmail/Live consumer | 5.000 o más mensajes diarios usando el mismo dominio del `5322.From` hacia servicios consumer de Microsoft. | SPF y DKIM deben pasar; DMARC debe estar publicado y al menos SPF o DKIM debe estar alineado. | Microsoft no publica en estas reglas un límite universal numérico como el 0,3% de Google/Yahoo. | Microsoft recomienda unsubscribe funcional y prefiere one-click, aunque el requisito duro anunciado para high-volume se concentra en SPF, DKIM y DMARC. Incumplimiento: `550 5.7.515`. |

Estas reglas se aplican principalmente a Gmail personal y a los servicios consumer de Microsoft; no deben confundirse con todos los buzones de Google Workspace o Microsoft 365. Aun así, CAMBRA no debería mantener dos estándares diferentes: debe exigir el estándar fuerte a todos los dominios de outbound.

### Headers mínimos de one-click

Para todas las campañas comerciales de CAMBRA:

```text
List-Unsubscribe-Post: List-Unsubscribe=One-Click
List-Unsubscribe: <https://unsubscribe.cambra-domain.example/u/TOKEN>
```

Además de estos headers, el mensaje debe contener un enlace de baja visible en el cuerpo. No basta con un `mailto:` y no basta con esconder el enlace en texto ilegible. Google documenta específicamente el mecanismo HTTPS de RFC 8058.

### Implicaciones directas para Instantly

#### 2.1 Los dominios separados sirven para aislar riesgo, no para evadir reglas

CAMBRA debería mantener:

- `cambra.global` y los buzones corporativos fuera del cold outbound.
- Dominios outbound claramente relacionados con CAMBRA, sin typos ni suplantación.
- SPF, DKIM, DMARC, tracking y unsubscribe independientes por dominio.
- Un número limitado y controlado de buzones por dominio.
- Reputación y límites separados por mailbox, dominio y proveedor receptor.

Usar muchos subdominios de una única raíz no evita la clasificación bulk de Gmail, porque Google agrega el volumen bajo el dominio principal.

#### 2.2 El objetivo interno debe ser muy inferior al máximo de los proveedores

**Política CAMBRA propuesta:**

- Objetivo operativo de quejas: `<0,05%`.
- Umbral de precaución: `0,05–0,09%`.
- Pausa automática: `>=0,10%`.
- Nunca acercarse deliberadamente al `0,30%`.
- Cualquier queja antes de alcanzar 1.000 mensajes entregados provoca revisión manual.

A volúmenes pequeños, una sola queja altera mucho la tasa: una queja sobre 500 entregados ya representa un 0,20%. Por eso un límite basado únicamente en porcentaje no es suficiente durante el warm-up.

#### 2.3 Todo outbound debe tratarse técnicamente como promocional

Aunque existan excepciones para mensajes puramente transaccionales, los correos de prospección de CAMBRA deben tratarse como comerciales para:

- one-click unsubscribe;
- enlace visible;
- suppression inmediata;
- trazabilidad del consentimiento u otra base aplicable;
- separación de transactional y outbound.

La conformidad técnica con Google/Yahoo/Microsoft no determina por sí sola la legalidad del contacto bajo GDPR/ePrivacy. La validación jurídica debe permanecer como un gate separado de deliverability.

---

## 3. Requisito manual 4 — Domain & Mailbox Readiness

### Contrato funcional recomendado

```text
DeliverabilityStatus =
  BLOCKED
  | CONFIGURING
  | WARMING
  | READY
  | PAUSED
  | QUARANTINED
  | RETIRED
```

Ningún mailbox podrá ser asignado a una campaña si no está en `READY`.

### Datos que deben guardarse

#### Por dominio

- Dominio organizativo y subdominio.
- Proveedor DNS.
- Fecha de registro y fecha de incorporación a CAMBRA.
- Uso autorizado: outbound, transactional, corporate, partner.
- SPF encontrado, sintaxis, fuentes autorizadas, pass y alineación.
- DKIM selector, longitud de clave, pass y alineación.
- DMARC record, política, `pct`, `rua`, pass y alineación.
- PTR y forward-confirmed reverse DNS.
- TLS.
- From, envelope sender, return-path y tracking-domain alignment.
- Estado del endpoint one-click.
- Enlace visible en plantilla.
- Propagación de suppression.
- Gmail bulk classification: `UNKNOWN | NON_BULK | BULK_PERMANENT`.
- Quejas por proveedor.
- Hard y soft bounces.
- Rechazos y códigos SMTP.
- Fecha de última comprobación y evidencia.
- `next_review_at`.
- Historial de cambios DNS y de reputación.

#### Por mailbox

- Dominio y proveedor de buzón.
- Fecha de creación.
- Warm-up iniciado/finalizado.
- Límite diario actual.
- Mensajes nuevos, follow-ups y total diario.
- Reply rate.
- Positive reply rate.
- Complaint count.
- Hard-bounce rate.
- Soft-bounce rate.
- Última actividad.
- Campaigns asignadas.
- Estado y razón de la última pausa.

### Acceptance gates

| ID | Gate obligatorio | Resultado esperado |
|---|---|---|
| `D4-AUTH-01` | SPF | Pass y alineado con la infraestructura remitente. |
| `D4-AUTH-02` | DKIM | Pass, alineado y clave de 2048 bits. Google acepta un mínimo inferior, pero CAMBRA debe exigir 2048. |
| `D4-AUTH-03` | DMARC | Registro válido, mínimo `p=none`, `rua` activo y al menos un mecanismo alineado. |
| `D4-DNS-01` | PTR/forward DNS | Resolución directa e inversa coherentes. |
| `D4-TLS-01` | TLS | Envío cifrado activo. |
| `D4-UNSUB-01` | RFC 8058 | Headers correctos y endpoint HTTPS que devuelve `2xx`. |
| `D4-UNSUB-02` | Body unsubscribe | Enlace visible, funcional y no engañoso. |
| `D4-SUPPRESS-01` | Baja global | La baja se replica a todos los mailboxes, campañas y proveedores en menos de 15 minutos. |
| `D4-SEED-01` | Seed test | Entrega y headers comprobados en Gmail, Yahoo/AOL y Outlook/Hotmail. |
| `D4-TELEM-01` | Telemetría | Captura de delivered, deferred, bounced, complained, unsubscribed y SMTP code. |
| `D4-REP-01` | Reputación | Paneles del proveedor y feedback loops configurados cuando estén disponibles. |
| `D4-AUDIT-01` | Evidencia | Cada check tiene timestamp, output y origen verificable. |
| `D4-FAIL-01` | Fail closed | Cualquier fallo duro impide pasar a `READY`. |

### Estados automáticos

#### Pasar a `PAUSED` inmediatamente

- SPF, DKIM o DMARC deja de pasar.
- Se pierde alineación del From.
- Falla PTR o TLS.
- El endpoint de unsubscribe no responde.
- Una baja no se propaga.
- Microsoft devuelve `550 5.7.515`.
- Se detectan rechazos repetidos de autenticación de Gmail o Yahoo.
- El dominio se utiliza desde una herramienta remitente no registrada.

#### Pasar a `QUARANTINED`

- Quejas `>=0,10%`.
- Una queja durante los primeros 1.000 entregados, pendiente de revisión.
- Hard bounce `>2%` en una ventana móvil de 200 envíos.
- Señales de blocklist o degradación importante en dos proveedores.
- Aumento abrupto de volumen fuera del ramp autorizado.
- Comportamiento sospechoso del proveedor de warm-up.

### Progresión DMARC recomendada

1. Configuración inicial: `p=none`, con reporting.
2. Validación de todas las fuentes durante al menos siete días.
3. Subida a `p=quarantine`.
4. `p=reject` cuando todas las herramientas, redirects, tracking y formularios estén correctamente alineados.

El mínimo aceptado por los proveedores no debe confundirse con el estado final más seguro del dominio.

---

## 4. Requisito manual 5 — Commercial Campaign Launch

### Regla central

```text
send_allowed =
  campaign.approved
  AND mailbox.status == READY
  AND domain.status == READY
  AND company.qualified
  AND contact.email_verified
  AND NOT globally_suppressed
  AND NOT duplicate
  AND legal_policy_allows
```

### Gates de campaña

| ID | Gate | Condición |
|---|---|---|
| `D5-ICP-01` | Empresa validada | Dominio vivo, checkout funcional y evidencia de que es una marca/retailer real. |
| `D5-ICP-02` | Fit | País, vertical, tamaño, plataforma y score dentro del perfil aprobado. |
| `D5-SOURCE-01` | Provenance | Directorio, feria, technographic source o búsqueda guardada identificados. |
| `D5-CONTACT-01` | Decisor | Persona coherente con el tamaño de la empresa y el problema de pagos. |
| `D5-EMAIL-01` | Email | Email profesional verificado. Excluir inicialmente catch-all, risky y unknown. |
| `D5-DEDUPE-01` | Dedupe | Una empresa canónica, un contacto inicial y supresión transversal. |
| `D5-CAP-01` | Cap mailbox | 10 nuevos/día al principio; aumento progresivo hasta aproximadamente 30/día cuando exista evidencia estable. |
| `D5-TEMPLATE-01` | Plantilla | One-click, enlace visible, identificación de CAMBRA y reason-to-contact verificable. |
| `D5-REPLY-01` | Reply handling | Una respuesta humana cancela automáticamente los follow-ups pendientes. |
| `D5-NEGATIVE-01` | Negativa | “No”, “remove”, “stop”, “unsubscribe” y equivalentes se suprimen globalmente. |
| `D5-SEND-01` | Mailbox | Solo buzones `READY`, sin selección aleatoria fuera de política. |
| `D5-AUDIT-01` | Audit trail | Motivo del contacto, datos usados, variante, buzón, timestamps y resultado. |

### Límites recomendados

La infraestructura puede prepararse para los 3.000–5.000 mensajes mensuales previstos, pero la campaña inicial no debe consumir esa capacidad por obligación. Primero hay que demostrar que una fuente, vertical y propuesta producen evidence uploads.

**Propuesta:**

- Mailbox nuevo: máximo 10 nuevos contactos/día.
- Mailbox maduro: máximo aproximado 30 nuevos/día.
- Follow-ups contabilizados dentro del volumen total.
- Una empresa recibe un solo contacto en la primera pasada.
- Sin cambios de identidad remitente dentro de la misma conversación.
- Sin envío continuo 24/7: respetar 08:00–19:00 en la zona del destinatario.
- Sin ramp superior al 25–30% semanal salvo evidencia estable.

### Métricas que sí importan

No optimizar el sistema principalmente por opens. Las métricas de negocio deben ser:

1. entregas válidas;
2. respuestas humanas;
3. respuestas positivas o cualificadas;
4. reuniones realizadas;
5. extractos, facturas o contratos aportados;
6. análisis completados;
7. oportunidades materiales encontradas;
8. pilotos o Founding Brands activados;
9. ahorro verificado.

### Priors de aprendizaje

Para evitar inventar “benchmarks de cold email” como verdad de mercado:

- Mantener modelos separados por `country × vertical × source_type × company_size × persona`.
- Empezar con priors débiles, por ejemplo `Beta(1,1)`, para reply, positive reply, meeting, upload y material opportunity.
- Mostrar media posterior e intervalo creíble, no solo el porcentaje puntual.
- No mezclar automáticamente España y Francia.
- No mezclar leads de directorio oficial con leads genéricos de una base B2B.
- No promover una fuente hasta tener una muestra mínima y evidencia posterior suficiente.

---

## 5. Ferias y eventos septiembre–diciembre de 2026

### Clasificación

- **A — Activación GTM:** merece asistencia si se preagendan reuniones.
- **B — Directorio/vertical:** excelente para conseguir empresas, aunque no necesariamente para viajar.
- **C — Partners/enterprise:** útil para PSP, tecnología, consultores o inteligencia; menos ajustado al mid-SMB inicial.

### Calendario verificado

| Fecha 2026 | Evento | Uso recomendado |
|---|---|---|
| 5–7 septiembre, París | Who’s Next, Bijorhca, Shoppe Object e Interfilière | B. Fuente especialmente fuerte para moda, accesorios, joyería, lifestyle y marcas independientes. |
| 10–14 septiembre, París | Maison&Objet | B. Home, decoración, diseño y concept stores; utilizar su ecosistema MOM para seed lists. |
| 15–17 septiembre, París | NRF Retail’s Big Show Europe | C. Es la referencia que ocupa el espacio de Paris Retail Week. Mejor para partners, retailers grandes e inteligencia que para el ICP inicial. |
| 24–27 septiembre, Madrid | Madridjoya | A/B. Joyería y relojería española; muy alineada con marcas de ticket medio/alto y costes de pago relevantes. |
| 24–27 septiembre, Madrid | Bisutex | A/B. Bisutería, accesorios, moda y regalo; buen directorio para mid-SMB. |
| 28–29 septiembre, Lyon | Natexpo | B. Marcas bio, wellness y alimentación especializada; investigación Francia, no activación por defecto. |
| 2–5 octubre, París | Première Classe | B. Accesorios y moda premium; seed list francesa. |
| 5–7 octubre, Barcelona | Barcelona New Economy Week | C. Demasiado transversal para ser fuente principal; potencial para partners y ecosistema. |
| 6–8 octubre, Biarritz | One to One IA x Expérience Client | C. Evento de reuniones ejecutivas y partners; más enterprise que merchant mid-SMB. |
| 14–15 octubre, París | Cosmetic 360 | B. Excelente directorio de beauty/cosmetics, aunque parte del público es fabricante o proveedor y debe filtrarse. |
| 21–22 octubre, Barcelona | Cosmetorium | A/B. Belleza y cosmética española; útil para encontrar marcas, fabricantes con DTC y partners sectoriales. |
| 21–22 octubre, Barcelona | BizBarcelona | C. Fuente amplia de pymes; menor precisión que Cosmetorium o Digital 1to1. |
| 22–23 octubre, Barcelona | Digital 1to1 Spain Winter | A, confianza media. La página actual muestra la edición 2026, pero conserva contenido interno de 2025. Debe reconfirmarse oficialmente antes del 22 de septiembre. |
| 3–4 noviembre, Cannes | MAPIC | C. Retail property, cadenas y partners; generalmente por encima del core ICP. |
| 4–5 noviembre, Madrid | E‑SHOW Madrid / Tech Show Madrid | A. Evento horizontal de e-commerce más directamente útil para CAMBRA en España. |
| 11–12 noviembre, Madrid | Logistics & Automation + Empack | B/C. Muy útil cuando CAMBRA active el wedge de logística; ahora sirve para partners y merchants con complejidad operativa. |
| 13–15 noviembre, Madrid | Salón Look | A/B. Beauty, peluquería y estética profesional; habrá ruido offline, por lo que debe validarse la existencia de DTC/checkout. |
| 30 noviembre–1 diciembre, París | Tech for Retail | C/B. Partners, retail tech, PSP y grandes merchants; buena inteligencia competitiva, pero no prioritaria para viajar en el lanzamiento español. |

### E‑SHOW Barcelona

A 13 de agosto de 2026 no he localizado una edición de E‑SHOW Barcelona 2026 confirmada de forma suficientemente clara en la web oficial. Las páginas visibles remiten principalmente a Madrid. No debe crearse un evento CAMBRA ni planificarse gasto hasta que exista confirmación oficial.

### Regla de viaje

**Propuesta CAMBRA: no viajar por “estar presente”.**

Autorizar asistencia solamente cuando exista al menos uno de estos escenarios:

- 8 reuniones cualificadas con merchants preagendadas;
- 2 reuniones con channel partners de alto potencial;
- acceso confirmado a un directorio no disponible remotamente;
- intervención, mesa o participación con distribución real;
- coste esperado por oportunidad razonable frente al outbound.

En caso contrario, importar directorios, enriquecerlos y trabajar la feria remotamente.

---

## 6. Plan de proof-of-demand: agosto–diciembre

Todos los números siguientes son objetivos internos propuestos, no benchmarks universales del mercado.

### 13 de agosto–7 de septiembre: Apollo harvest y preparación

Apollo sigue disponible hasta el 7 de septiembre de 2026, por lo que la prioridad no es mandar rápidamente, sino conservar una capa de datos reutilizable antes de perder el acceso.

#### Objetivo

- 1.500 dominios raw procedentes de ferias, asociaciones y marketplaces B2B.
- 600 empresas con checkout y marca validados.
- 300 empresas con score CAMBRA `>=70`.
- 150–250 decisores con email profesional verificado.
- Tres cohorts españolas listas:
  - fashion/jewelry;
  - beauty/wellness;
  - home/concept.
- Una lista francesa `RESEARCH_ONLY`, sin envío.
- Req 4 completamente probado antes de autorizar el primer envío.

Apollo debe utilizarse para resolver personas, títulos y emails sobre dominios ya validados, no para exportar indiscriminadamente miles de personas.

### Septiembre: microcohorts españolas

Tres campañas de 50–75 empresas cada una, una por vertical.

- Un contacto inicial por empresa.
- Una única tesis de valor por cohort.
- Una sola variable principal por experimento.
- Mensaje basado en evidencia de la empresa, no en falsa personalización.
- CTA: análisis privado, acceso Founding Brand o aportación de statement.
- Sin demo grupal.

#### Gate de septiembre

- Positive/qualified reply `>=5%` sobre entregados.
- Reunión realizada `>=2%`.
- Al menos 3–4 uploads de extractos, facturas o contratos.
- Hard bounce `<2%`.
- Cero fallos de unsubscribe o autenticación.

Una vertical que no alcanza señal no se escala por intuición; se revisan fuente, persona, mensaje y oportunidad observada.

### Octubre: validar valor real

Prioridad:

- Cosmetorium.
- Digital 1to1, condicionado a reuniones.
- Directorios de Madridjoya y Bisutex.
- Profundizar únicamente en la vertical ganadora o en las dos mejores.

#### Gate acumulado de octubre

- 15 reuniones realizadas.
- 8 uploads utilizables.
- 4 casos con oportunidad material y explicable.
- Al menos 2 merchants que acepten avanzar a negociación, piloto o Founding Brand.
- Evidencia suficiente para comparar `event_directory` frente a `generic_database`.

### Noviembre: convertir intención

Utilizar E‑SHOW Madrid como deadline comercial:

- outreach previo 14–21 días antes;
- reuniones agendadas, no simple networking;
- landing o intake específico por evento;
- QR o enlace que lleve a análisis privado;
- seguimiento dentro de las 48 horas posteriores.

#### Gate de noviembre

- 3 compromisos de piloto/Founding Brand.
- 2 conversaciones serias con partners.
- 1 caso suficientemente limpio para convertirse en narrativa comercial anonimizada.
- Una fuente y una vertical con posterior bayesiano claramente superior al resto.

### Diciembre: consolidación

- Convertir los primeros análisis en casos de savings potential.
- Congelar la definición del ICP ganador.
- Retirar fuentes de baja calidad.
- Definir los argumentos por PSP/vertical.
- Construir el plan de escala de enero sobre evidencia, no sobre opens.
- No superar 10.000 mensajes mensuales hasta haber completado varias semanas sin deterioro de entrega y con señales comerciales repetibles.

---

## 7. Directorios y fuentes de empresas

### España

| Fuente | Utilidad | Riesgo |
|---|---|---|
| Madridjoya / Bisutex / Cosmetorium / Salón Look | Directorios verticales de alta precisión para jewelry, fashion accessories y beauty. | Expositores B2B, distribuidores o fabricantes sin DTC; validar checkout. |
| ModaEspaña | Marcas de moda y origen español. | No todas tendrán e-commerce o tamaño suficiente. |
| STANPA | Ecosistema de perfumería y cosmética, con más peso y credibilidad sectorial. | Tiende a incluir empresas grandes, fabricantes y proveedores. |
| Comertia | Marcas retail de tamaño ya relevante; especialmente útil para la parte alta del ICP. | Sus criterios de entrada —incluyendo escala mínima— dejan fuera a pequeños DTC. |
| Adigital | Fuente transversal de empresas digitales y e-commerce. | Muy ruidosa: agencias, SaaS, plataformas y grandes empresas. |

### Francia

| Fuente | Utilidad | Riesgo |
|---|---|---|
| FEVAD | Miembros y actores del e-commerce francés. | Mezcla retailers, tecnología, servicios y grandes compañías. |
| COSMED | Muy buen universo de cosmética, con gran presencia de pymes. | Fabricantes y laboratorios sin canal DTC. |
| Fédération Française du Prêt-à-Porter Féminin | Marcas de moda y directorios sectoriales. | Validar tienda activa y país de operación. |
| Alliance du Commerce | Grandes retailers, moda y comercio especializado. | Normalmente por encima del ICP inicial. |
| Who’s Next/Bijorhca, Maison&Objet/MOM y Cosmetic 360 | Directorios de marcas mucho más precisos que bases B2B genéricas. | Parte de los expositores son proveedores o wholesale-only. |

### Marketplaces B2B y plataformas de nicho

Deben utilizarse como seed sources, nunca como prueba suficiente de que una empresa pertenece al ICP.

- Ankorstore publica decenas de miles de marcas y está especialmente orientado a marcas europeas y retailers independientes.
- Faire declara más de 100.000 marcas y permite navegar por categorías, geografía y atributos como “made in Europe”. Es valioso, pero contiene muchas marcas no europeas o demasiado pequeñas.
- Orderchamp trabaja con aproximadamente 7.000 marcas europeas y está centrado en wholesale independiente.
- PrestaShop Examples ofrece una pequeña colección oficial de tiendas destacadas que puede utilizarse como seed de alta confianza tecnológica.

### Validación obligatoria posterior

Cada candidato debe pasar por:

1. dominio propio;
2. empresa/marca identificable;
3. checkout activo;
4. posibilidad real de comprar, no mero catálogo;
5. país y mercados de envío;
6. tecnología observada;
7. evidencia de tamaño/madurez;
8. no marketplace, no agencia, no dropshipping evidente;
9. PSP y métodos de pago cuando sean detectables;
10. evidencia guardada con URL y fecha.

PrestaShop admite un modo catálogo sin venta online, por lo que detectar PrestaShop no basta para demostrar que existe un checkout.

---

## 8. Apollo e Instantly: filtros mapeados al ICP real

### Flujo correcto

```text
Directorio/feria/marketplace
        ↓
Dominio canónico
        ↓
Validación checkout + marca + país
        ↓
Tecnología y señales
        ↓
CAMBRA ICP/Opportunity Score
        ↓
Apollo o Instantly: decisor + email
        ↓
Verificación, dedupe y suppression
        ↓
CommercialCampaign
```

Apollo e Instantly ofrecen filtros de empresa, empleados, revenue, tecnologías, keywords, títulos, seniority, señales y lookalikes. Apollo aplica `AND` entre grupos de filtros y `OR` dentro de un mismo grupo, algo que debe tenerse en cuenta para evitar búsquedas demasiado amplias.

### Configuración base España

#### Company filters

- `HQ location = Spain`, no simplemente ubicación del contacto.
- Empleados, en búsquedas separadas:
  - `2–10`;
  - `11–50`;
  - `51–200`.
- Market segments:
  - E-commerce;
  - D2C;
  - Retail.
- Tecnología:
  - Shopify;
  - WooCommerce;
  - PrestaShop.
- Revenue:
  - utilizar bandas aproximadas compatibles con €250.000–€20 millones;
  - marcar el dato como `ESTIMATED`, nunca como verdad financiera.
- Una empresa por dominio canónico.
- Excluir listas ya contactadas, clientes, partners y suppressed.

#### Vertical keywords

**Fashion/accessories**

```text
moda, ropa, accesorios, calzado, bolsos, lencería,
streetwear, fashion, apparel, footwear, handbags
```

**Beauty/wellness**

```text
cosmética, belleza, skincare, cuidado personal,
bienestar, perfumería, cosmetics, wellness
```

**Jewelry**

```text
joyería, bisutería, relojería, jewelry, jewellery,
watches, accessories
```

**Home/concept**

```text
hogar, decoración, mobiliario, iluminación,
concept store, home decor, furniture, design
```

No deben mezclarse todas las keywords en una sola búsqueda. Cada vertical necesita una búsqueda, scoring y campaña separados.

### Personas por tamaño

#### Empresas de 2–10 empleados

- Founder / Co-founder.
- CEO.
- Owner.
- Fundador/a.
- Cofundador/a.
- Propietario/a.
- Gerente.
- Director/a general.

#### Empresas de 11–50

Los anteriores más:

- Head/Director of E-commerce.
- Digital Director.
- Operations Director.
- Finance Director.
- Responsable e-commerce.
- Responsable de operaciones.
- Director/a financiero/a.

#### Empresas de 51–200

- CFO.
- COO.
- VP/Director E-commerce.
- Head of Payments.
- Finance Director.
- Operations Director.
- Procurement, únicamente cuando tenga responsabilidad sobre PSP.

### Instantly SuperSearch

Para CAMBRA, el uso de mayor valor no es una búsqueda abierta, sino:

1. subir CSV o Google Sheet con dominios validados;
2. solicitar una persona por empresa;
3. limitar títulos, departamentos y seniority;
4. exigir work email verificado;
5. aplicar tamaño, ubicación y tecnología;
6. devolver el resultado a CAMBRA para dedupe y scoring final.

SuperSearch permite dominio upload, lookalikes, tecnologías, revenue, empleados, keywords, job listings, señales y una persona por empresa. Sus señales de 2026 incluyen expansión, cambios tecnológicos, lanzamientos, variaciones de tráfico, financiación, cambios de pricing y movimientos de liderazgo. Deben usarse como timing overlays, no como sustituto del ICP.

### Campos de AI research

Cada lead enriquecido debería devolver:

```text
live_checkout
brand_owned_store
platform
country_hq
ships_to_spain
ships_to_france
vertical
product_category
payment_methods_detected
multi_currency_detected
cross_border_signal
bnpl_detected
marketplace_risk
dropshipping_risk
merchant_maturity
evidence_url
evidence_excerpt
evidence_checked_at
```

Los métodos de pago detectados deben considerarse una señal blanda: muchos checkouts cargan dinámicamente, requieren ubicación, login o una fase avanzada de compra.

### Scoring propuesto

| Factor | Puntos |
|---|---:|
| Checkout activo y plataforma validada | 25 |
| Tamaño/GMV compatible | 20 |
| Vertical prioritaria | 15 |
| Marca independiente real | 15 |
| Complejidad de pagos observable | 10 |
| Decisor y work email verificados | 10 |
| Timing signal | 5 |

Penalizaciones:

- Marketplace, agencia, dropshipping, hobby o sin checkout: `-100`.
- Gran corporación fuera de ICP: `-100`.
- Wholesale-only: `-40`.
- Revenue/tamaño muy incierto: `-15`.
- Catch-all o persona dudosa: `-25`.

Decisión:

```text
score >= 70       → CAMPAIGN_ELIGIBLE
score 55–69       → HUMAN_REVIEW
score < 55        → REJECT_OR_NURTURE
```

---

## 9. Competidores europeos: quién hace qué y cómo cobra

### Mapa competitivo

| Competidor | Modelo y mercado | Pricing conocido | Lectura para CAMBRA |
|---|---|---|---|
| EcomStream | Auditoría de invoices, contratos y settlements; benchmark, renegociación con PSP actual, RFP y performance para retailers y marcas europeas. | No-cure-no-pay como porcentaje del ahorro, sin upfront; performance con mensualidad acreditable contra success fee; interim por día/proyecto. El porcentaje exacto no es público. | Competidor directo más próximo. Founder-led y consultivo; CAMBRA debe diferenciarse por software, escala, self-serve, extractor multilingüe y cobertura mid-SMB. |
| ERA Group | Reducción de costes indirectos, incluyendo merchant card services y contratos. | No-cure-no-pay, a menudo convertido después en servicio de largo plazo. Declara un target aproximado de €30–300 millones de ingresos locales. | Prueba que el success fee es aceptado, pero su ICP está muy por encima del de CAMBRA. |
| CMSPI | Auditoría forense, benchmark, routing y optimización para grandes merchants globales. | Precio comercial no publicado; engagement enterprise. | Autoridad fuerte y datos enterprise, pero no producto accesible para marcas de €250k–€20M. |
| Redbridge | Consulting de acceptance cost, fee stack, benchmark, tender y negociación. | No se localiza tarifa self-serve pública. | Competidor enterprise de consulting y treasury; valida el problema pero no el modelo SMB automatizado. |
| PaymentGenes | Benchmark de pricing, vendor selection y payments consulting, con base histórica de miles de merchants. | Custom/contact sales. | Fuerte en grandes retailers, omnichannel y selección de proveedores. |
| Pagos | SaaS de armonización, monitorización, cost optimization y benchmarking. | Growth: $1.000/mes; benchmarking: $500/mes adicional o standalone; enterprise custom. | Competidor software más claro, pero exige datos/conexiones y parte de un coste elevado para el mid-SMB. |
| Optimized Payments / Harmonize | Sistema de datos de pagos, analytics y asesoría integrada para operaciones multiproveedor. | No se localiza precio público; enfoque demo/enterprise. | Compite por payment intelligence, no por un intake ligero y success-fee para pequeños merchants. |
| PayConsulting | Consultoría española de pagos, costes, conversión, fraude, compliance y routing. | Assessment inicial gratuito; precio posterior no publicado. Segmenta por volumen mensual de pagos. | Competidor local/indirecto, más amplio en performance y compliance que en benchmark automatizado neutral. |
| IXOPAY / BR-DGE | Orquestación, conexión con múltiples adquirentes y routing. | Custom enterprise. | Sustituto indirecto cuando el merchant ya tiene escala y voluntad de integrar; CAMBRA debe diagnosticar antes de recomendar arquitectura. |

### Conclusión competitiva correcta

No debe utilizarse:

> “No existe nadie que optimice los costes de pago.”

Sí puede utilizarse, con prudencia:

> “La optimización existe, pero suele estar reservada a grandes merchants, consultoría especializada o software de coste e integración elevados. CAMBRA la convierte en un flujo accesible, verificable y automatizado para marcas europeas mid-SMB.”

La combinación que no he encontrado públicamente empaquetada de la misma manera es:

- discovery de empresas;
- intake privado y statement-first;
- extracción multilingüe;
- benchmark con confidence/provenance;
- detección de oportunidad;
- negociación asistida;
- migración solo cuando es necesaria;
- verificación de ahorro;
- billing sobre ahorro verificado;
- aprendizaje continuo por PSP, país, vertical y tamaño.

Esto debe presentarse como diferenciación de producto observada, no como prueba absoluta de inexistencia de otro actor.

---

## 10. Posicionamiento recomendado

### Categoría

**Payment Cost Intelligence & Recovery for European Commerce**

### Frase central

> CAMBRA encuentra, explica y recupera costes de pago evitables para marcas europeas, sin obligarlas a cambiar de PSP ni a instalar una infraestructura enterprise.

### Versión comercial sencilla

> Sube tus extractos. CAMBRA te dice qué estás pagando, qué deberías estar pagando y te ayuda a conseguirlo. Solo cobra sobre ahorro realmente verificado.

### Diferenciadores

1. Statement-first: se puede empezar sin integración técnica.
2. Incumbent-first: primero renegocia con el PSP actual.
3. Mid-SMB first: diseñada para empresas demasiado pequeñas para CMSPI/Redbridge/ERA, pero demasiado complejas para ignorar sus costes.
4. Explainable: cada ahorro tiene línea, fuente, benchmark, confidence y evidencia.
5. Outcome pricing: sin coste sobre ahorro teórico.
6. Multilingüe y europeo: normalización por país, PSP, moneda y formato.
7. Operación completa: detectar → analizar → negociar → verificar.
8. Self-serve privado: sin obligar a demos grupales.

### Lectura del pricing de CAMBRA

Con la estructura actual:

- 25% del ahorro verificado durante el primer año.
- 15% durante el segundo.
- 0% posteriormente.

Sobre dos años de ahorro constante:

- CAMBRA recibe el equivalente al 20% del ahorro total de los primeros 24 meses.
- El merchant conserva el 80%.
- Desde el mes 25 conserva el 100%.

Esta explicación es mucho más defendible que limitarse a decir “25% de success fee”.

---

## 11. Objeciones comerciales

| Objeción | Respuesta CAMBRA |
|---|---|
| “Mi PSP ya me da buenas condiciones.” | Un PSP puede explicar su precio, pero no es un benchmark independiente de su propio margen. CAMBRA muestra línea por línea qué es regulado, pass-through, margen o fee negociable. |
| “No quiero cambiar de proveedor.” | CAMBRA empieza por renegociar con el actual. La migración solo se plantea cuando la evidencia muestra que el incumbent no puede cerrar la diferencia. |
| “Podemos negociarlo nosotros.” | Perfecto: CAMBRA puede entregar el benchmark y evidence pack para que el equipo negocie, o actuar bajo mandato. |
| “El porcentaje es caro.” | Solo se aplica a ahorro realizado y verificable. En 24 meses, CAMBRA recibe el 20% del ahorro acumulado y el merchant retiene el 80%; después conserva todo. |
| “Stripe/Shopify Payments es simple.” | El precio visible no siempre refleja el coste efectivo por mix de tarjetas, países, FX, métodos alternativos, refunds, disputes y fees periféricos. |
| “No quiero compartir datos sensibles.” | El análisis inicial debe funcionar con statements y contratos minimizados, sin PAN ni cardholder data, con retención limitada y evidencias auditables. |
| “Un broker me lo hace gratis.” | Hay que preguntar quién remunera al broker y si las recomendaciones están condicionadas por acuerdos comerciales. |
| “Un orquestador ya optimiza esto.” | Un orquestador puede mejorar routing y resiliencia, pero implica integración y complejidad. CAMBRA determina primero si esa inversión está justificada. |
| “No sé si el ahorro será material.” | Si no se encuentra ahorro material verificable, no se activa el success fee. |

---

## 12. Independencia y revenue share de proveedores

Esta es la decisión estratégica más delicada del bloque.

EcomStream afirma de forma explícita que no trabaja para PSP, no recibe referral revenue y no mantiene relaciones comerciales que creen conflictos. Por tanto, CAMBRA no puede utilizar la misma promesa mientras incorpora revenue share de proveedores sin disclosure.

### Modelo recomendado

#### Opción A — `MERCHANT_ONLY`

- CAMBRA cobra únicamente al merchant.
- No recibe comisión del PSP seleccionado.
- Ranking y recomendación completamente independientes.
- Posicionamiento más fuerte.

#### Opción B — `DISCLOSED_REBATE`

Cuando exista pago del provider:

- debe declararse antes de la decisión;
- no puede modificar score, ranking ni recomendación;
- debe registrarse en `ProviderEconomicRelationship`;
- debe descontarse de la factura CAMBRA o trasladarse al merchant;
- el merchant debe poder solicitar una comparación sin proveedores remuneradores.

### Prohibido

- Comisión no declarada.
- Posicionar más alto al proveedor que paga.
- Usar “independiente” sin explicar las relaciones económicas.
- Cobrar simultáneamente success fee al merchant y referral fee al provider sin compensación o disclosure.
- Permitir que el Commercial Agent conozca el payout antes de generar el ranking técnico.

---

## 13. “Por qué ahora”

### Hechos

La regulación europea limita el interchange de muchas tarjetas de consumo a aproximadamente 0,20% para débito y 0,30% para crédito, pero no limita todo el coste de aceptación: siguen existiendo scheme fees, margen del adquirente/PSP, cross-border, FX, servicios y costes periféricos.

CMSPI estima que las actualizaciones de scheme fees de abril de 2026 tendrán un impacto relevante sobre merchants europeos. Es una estimación de un actor comercial, no una cifra regulatoria independiente, pero confirma que el fee stack sigue cambiando en 2026.

Google y Microsoft están aplicando requisitos de autenticación con rechazos reales, reduciendo la viabilidad del outbound masivo de baja calidad. Esto favorece el enfoque company-first y evidence-first de CAMBRA.

### Inferencia estratégica

- Las grandes consultoras se concentran en enterprise.
- Pagos cuesta al menos $1.500 mensuales si se combina Growth y benchmarking.
- ERA declara un target de €30–300 millones.
- EcomStream demuestra que el no-cure-no-pay funciona, pero su servicio sigue siendo altamente personal y consultivo.

Por tanto, existe un espacio defendible para marcas europeas de aproximadamente €250.000–€20 millones, atendidas mediante software, automatización, datos explicables y success fee.

Q4 también es un momento especialmente útil para conseguir statements con mayor volumen, observar mix real y abrir conversaciones de presupuesto o renovación. Esto es una inferencia GTM y debe probarse con los cohorts de septiembre–diciembre, no almacenarse como verdad permanente.

---

## 14. Política de actualización de la inteligencia

Este bloque no debe congelarse como documentación estática.

| Dataset | Revisión |
|---|---|
| Google/Yahoo/Microsoft sender rules | Cada 7 días y ante cambios de error codes. |
| DNS y readiness de cada dominio | Diario y antes de cada campaign launch. |
| Fechas de eventos | Mensual; después T‑60, T‑30, T‑14 y T‑7. |
| Apollo/Instantly filters | Mensual y al cambiar plan/API. |
| Directorios y exhibitor lists | En cuanto se publique una nueva edición. |
| Pricing de competidores | Mensual durante prelaunch; trimestral posteriormente. |
| Claims de competidores | Mantener como `VERIFIED_VENDOR`, nunca como verdad independiente. |

Cada registro debería contener:

```text
source_url
source_type
retrieved_at
effective_from
effective_to
country
provider_or_competitor
claim
truth_level
confidence
evidence_excerpt
next_review_at
supersedes_record_id
```

---

## 15. Seal final del bloque

### Puede cerrarse ahora

- Requisitos actuales de Google, Yahoo y Microsoft identificados.
- Estándar universal CAMBRA definido.
- Acceptance gates de los requisitos 4 y 5 definidos.
- Calendario septiembre–diciembre verificado.
- Ausencia de confirmación de E‑SHOW Barcelona registrada.
- Fuentes y filtros ICP definidos.
- Competidores, pricing público y posicionamiento documentados.
- Plan de proof-of-demand definido.
- Conflicto de independencia/revenue share identificado.

### No puede marcarse todavía como producción sellada

- SPF, DKIM y DMARC no comprobados sobre cada dominio real.
- Endpoint RFC 8058 no probado end-to-end.
- Suppression global no probada entre CAMBRA e Instantly.
- Seed delivery Gmail/Yahoo/Microsoft no ejecutada.
- Complaint telemetry no verificada.
- Mailbox caps y circuit breakers no probados.
- Digital 1to1 debe reconfirmarse oficialmente por la inconsistencia de su página.
- `send_capacity` debe continuar en `0` hasta que el Req 4 obtenga `READY`.

### Orden de implementación bloqueado

```text
Req 4 Domain Readiness
        ↓
Live DNS/Header/Unsubscribe Tests
        ↓
Req 5 Campaign Readiness
        ↓
Spain Microcohorts
        ↓
Evidence Uploads
        ↓
Verified Opportunity
        ↓
Scale
```
