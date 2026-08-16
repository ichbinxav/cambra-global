# Negociación de PSPs en los 33 mercados europeos de CAMBRA: descuentos documentados, thresholds negociables y playbooks

**Fecha de corte: 13 de agosto de 2026.**

Este bloque está diseñado para alimentar directamente un repositorio `NegotiationCase`: separa lo que el PSP **publica oficialmente**, lo que un merchant **afirma haber recibido**, y lo que razonablemente puede convertirse en un **prior de negociación**. El hallazgo central es importante: en Europa hay abundante evidencia de que el pricing enterprise se negocia, pero muy poca evidencia pública y verificable del patrón puro **“amenazo con marcharme → retention me ofrece X bps para quedarme”**. Las mejores señales públicas son, por tanto, una combinación de thresholds oficiales, licitaciones competitivas, custom pricing, ofertas de win-back y algún caso directo de retention. citeturn13search0turn13search1turn12search3turn17search2

Para fijar el perímetro de los “33 países de CAMBRA”, hay una limitación documental: la web pública de CAMBRA describe su actividad de auditoría de costes de pagos y benchmarking europeo, pero no expone una página pública con una lista nominal de 33 países. Para no inventar el alcance, este informe adopta como **universo operativo CAMBRA-33** el conjunto de 33 mercados que coincide con la cobertura “Europe — 33 countries” de Payment Yearbooks 2026: los 27 miembros de la UE más Islandia, Noruega, Serbia, Suiza, Turquía y Reino Unido. Es una **inferencia de alcance**, no una afirmación de que Payment Yearbooks defina internamente el perímetro de CAMBRA. citeturn5view0turn8view0turn8view2turn10view0turn11view0

## Hallazgos ejecutivos y priors que sí son accionables

La primera conclusión es que **no existe un “threshold Stripe Europa” o un “mínimo Adyen” único y públicamente defendible**. Stripe publica custom pricing con IC+, tarifas planas descontadas, descuentos por volumen, compromisos y descuentos multiproducto, pero no da un GPV universal a partir del cual se active. Adyen publica IC++ y reconoce que puede existir una facturación mínima dependiendo de industria y modelo de negocio, pero tampoco publica un único gate de GPV. Checkout.com trabaja con IC++ y adquisición europea directa, pero tampoco publica un threshold universal. citeturn13search0turn13search1turn25search1turn25search28

En cambio, algunos proveedores sí dejan **puntos de activación comerciales cuantificados**. Mollie publica descuentos por volumen para empresas que procesan más de **€100.000 al mes**. Braintree UK publica custom/discounted rates para determinados negocios de más de **£50.000 al mes**. Square UK abre custom pricing por encima de **£200.000 al año**; en Irlanda y Francia aparecen gates alrededor de **€200.000/año**, y en páginas concretas de Francia y España aparecen **€250.000/año**. SumUp publica custom pricing a partir de **£10.000/mes en Reino Unido** y **€10.000/mes** en varias de sus páginas de Alemania, Francia, Italia y España. Worldpay UK publica un custom tariff para un producto de terminal concreto por encima de **£75.000/año**. Estos números son extremadamente valiosos como priors, pero son **gates de producto, canal y país**, no reglas globales del PSP. citeturn12search3turn16search1turn15search0turn15search1turn15search34turn15search3turn14search2turn16search0turn16search1turn16search19turn16search24turn16search2

De hecho, Square demuestra por qué no debe almacenarse un único campo `provider_threshold`. En Irlanda una página de Payments sitúa el custom pricing sobre **€200.000/año**, mientras otro funnel comercial habla de potencial elegibilidad desde **€100.000 de card sales**; en Francia hay páginas de Payments alrededor de €200.000/año y una de restauración alrededor de €250.000; en España aparecen €250.000 en restauración/calculadora y €200.000 en otro producto. La conclusión correcta para `NegotiationCase` es `threshold_scope = country + product + channel + page_date`, no “Square threshold = €X”. citeturn15search1turn15search33turn15search34turn15search6turn15search3turn15search15turn15search31

La segunda conclusión es que **los descuentos extremos son posibles, pero la documentación pública no permite convertirlos en rate cards**. Un restaurante que procesaba aproximadamente $2,5 millones anuales relató que había obtenido históricamente **3 bps + $0,05/transacción** con Merchant Warehouse después de hacer competir a más de veinte processors; cuando escribió el hilo, Heartland le cobraba aproximadamente 14 bps + interchange + $0,04 y Square le había cotizado 2,5% flat incluyendo Amex. El mismo merchant dijo que ya había renegociado Heartland anteriormente y que Heartland afirmaba que no podía bajar más. Esto es una excelente evidencia de que un RFP agresivo puede llevar el markup a niveles muy bajos, pero es un caso estadounidense de hace años y no un benchmark europeo de 2026. citeturn20view0

La señal de **retention pura** más clara localizada sigue siendo CardPointe/CardConnect: un merchant que quería cancelar relató que una representante de retención ofreció revertir una cuota anual únicamente si seguía procesando con ellos; si cerraba la cuenta, no se la devolvían. Es exactamente el patrón que interesa a CAMBRA —concesión condicionada a quedarse— aunque el merchant procesaba menos de unos pocos miles de dólares mensuales y no conocemos el importe contractual exacto de la cuota. citeturn18search0

También hay evidencia de **poaching/migration incentives**. En 2026 un usuario afirmó que Mollie le ofreció **$50.000 para abandonar Stripe**. No existe contrato público, no publicó GPV ni jurisdicción y la cifra no está corroborada; debe almacenarse con confianza baja. Sin embargo, es una evidencia suficientemente concreta para añadir `migration_credit` como línea obligatoria de todos los RFP, no para asumir que Mollie ofrece $50.000 de forma general. Mollie, además, publica oficialmente programas comerciales de crecimiento y descuentos por volumen, de modo que la existencia de herramientas comerciales distintas al MDR es consistente con su estrategia oficial, aunque no corrobora ese bonus concreto. citeturn21search1turn12search3turn12search6

El caso Braintree de 2026 aporta otra regla de oro. Un merchant con **$1,58 millones procesados en 2025**, ticket medio de unos $2.250 y un chargeback en cinco años relató que Braintree le ofreció **2,1% + $0,30**, frente a 2,2% + $0,20 que pagaba entonces. Aceptó y pidió contrato, pero Braintree posteriormente le comunicó que la oferta había sido un error y no podía concederse. El merchant también afirmó que Stripe no negociaría con él hasta llevar seis meses procesando; esta última parte **no es una política pública de Stripe** y debe almacenarse como `REPORTED`, no como threshold oficial. citeturn21search0

Con un ticket de $2.250, la propuesta Braintree equivalía aproximadamente a 2,113%, frente a 2,209% del pricing anterior: cerca de **9,6 bps** de ahorro representativo. Sobre $1,58 millones de GPV serían unos **$1.510/año**, antes de otros fees. La enseñanza no es “Braintree da 10 bps”, sino que una headline reduction aparentemente atractiva puede valer relativamente poco con tickets altos y que **una oferta no debe entrar en el prior `EXECUTABLE` hasta estar aprobada por underwriting y documentada comercialmente**. citeturn21search0

Para CAMBRA, por tanto, recomiendo que el motor distinga tres objetos:

| Tipo | Qué significa | Uso en recomendación |
|---|---|---|
| `OFFICIAL_PROGRAM` | Threshold, pricing model o palanca publicada por el PSP | Puede afirmarse como disponible, respetando país/producto |
| `REPORTED_CASE` | Merchant afirma haber recibido una oferta concreta | Prior de “qué preguntar”; nunca rate card |
| `INFERRED_PRIOR` | Deducción construida a partir de varios casos/programas | Sirve para elegir anchor, BATNA y variables; debe mostrar incertidumbre |

Un resultado importante para el producto es que **`retention`, `acquisition`, `win_back` y `custom_pricing` deben ser categorías distintas**. Mezclarlas produciría un modelo demasiado optimista: un bonus de migración del challenger no demuestra que el incumbent vaya a dar el mismo valor para retener; una tarifa enterprise estándar negociada tampoco prueba que surgiera de una amenaza de churn.

## Mapa de los 33 países: dónde existe poder de negociación documentado

El mapa siguiente no pretende enumerar todos los adquirentes de cada mercado. Su objetivo es responder a una pregunta más útil para CAMBRA: **¿qué stack de negociación puede montarse en cada uno de los 33 países, y qué threshold público puede emplearse como anchor?**

Hay cuatro proveedores que permiten construir un baseline paneuropeo bastante sólido. Stripe acepta merchants domiciliados en 30 de los 33 mercados del perímetro: en su lista actual aparecen los 27 países de la UE, Noruega, Suiza y Reino Unido, pero no Islandia, Serbia ni Turquía. Adyen declara capacidad de aceptación en una lista mucho más amplia que incluye los 33 mercados, aunque “aceptar pagos en un país” no debe confundirse automáticamente con disponer de la misma entidad contractual, local acquiring o producto POS en todos ellos. Checkout.com declara licencias en Francia y Reino Unido que le permiten direct acquiring en los 30 estados del EEE; Mollie anunció en junio de 2026 que había completado su cobertura de los 30 países del EEE, y mantiene además una operación regulada propia en Reino Unido. citeturn23view3turn25search3turn25search28turn22search10turn24search13

**Leyenda del stack:** `S` = Stripe custom; `A` = Adyen; `C` = Checkout.com; `M` = Mollie. `Local` significa que el RFP debe incluir además al menos un adquirente bancario/local, incluso cuando haya cuatro challengers globales. Ninguna lista de challengers debe considerarse exhaustiva.

| País CAMBRA-33 | Stack inicial de negociación | Gate cuantitativo público especialmente útil | Playbook de primera ronda |
|---|---|---|---|
| **Austria** | S / A / C / M + Local | Mollie: señal paneuropea >€100k/mes | Hacer competir IC++ de A/C contra custom S y tier M; pedir acquiring doméstico separado |
| **Bélgica** | S / A / C / M + Local | Mollie >€100k/mes | Igual que Austria; separar además coste de métodos locales y tarjetas |
| **Bulgaria** | S / A / C / M + Local | Mollie >€100k/mes | Mercado recién reforzado por la expansión EEE de Mollie; usar esa entrada para challenger quote |
| **Croacia** | S / A / C / M + Local | Mollie >€100k/mes | Mollie completó su expansión EEE con Croacia en junio de 2026: buen momento para pedir adquisición agresiva |
| **Chipre** | S / A / C / M + Local | Mollie >€100k/mes | Solicitar explícitamente domestic vs cross-border acquiring y settlement |
| **Chequia** | S / A / C / M + Local | Mollie >€100k/mes | IC++ histórico + local acquiring; no asumir un threshold Stripe/Adyen |
| **Dinamarca** | S / A / C / M + Local | Mollie >€100k/mes | Negociar coste de tarjetas y métodos nórdicos por separado; evitar blended único |
| **Estonia** | S / A / C / M + Local | Mollie >€100k/mes | RFP de cuatro PSPs; pedir fee por auth y mínimo además del porcentaje |
| **Finlandia** | S / A / C / M + Local | Mollie >€100k/mes | IC++ + métodos locales; wallet share como moneda de cambio |
| **Francia** | S / A / C / M + Square + SumUp + Local | Square ~€200k/año en Payments y ~€250k en ciertos funnels; SumUp >€10k/mes | Uno de los mercados con más anchors publicados: usar Square/SumUp para tensionar a PSP enterprise |
| **Alemania** | S / A / C / M + SumUp + Local | SumUp >€10k/mes; Mollie >€100k/mes | Abrir negociación mucho antes del “enterprise scale”: SumUp proporciona un gate bajo y Mollie otro de escala |
| **Grecia** | S / A / C / M + Local | Mollie >€100k/mes | Pedir precio por MID/entidad y no aceptar una única tarifa paneuropea sin reprice |
| **Hungría** | S / A / C / M + Local | Mollie >€100k/mes | Usar forecast de crecimiento y local acquiring como palancas |
| **Islandia** | A / C / M + Local | Mollie >€100k/mes como señal comercial | **Stripe no admite merchant domicile islandés en su lista actual**; el BATNA debe construirse con A/C/M/local |
| **Irlanda** | S / A / C / M + Square + Local | Square: >€200k/año en Payments; otro funnel señala >€100k | Guardar ambos thresholds con `product_scope`; usar la inconsistencia para solicitar evaluación manual |
| **Italia** | S / A / C / M + SumUp + Local | SumUp ≥€10k/mes; Mollie >€100k/mes | Pedir custom pricing desde volumen relativamente modesto; luego IC++ enterprise al escalar |
| **Letonia** | S / A / C / M + Local | Mollie >€100k/mes | RFP IC++ frente a custom blended, con local acquiring |
| **Lituania** | S / A / C / M + Local | Mollie >€100k/mes | Checkout mantiene además infraestructura europea relevante en Lituania; negociar multi-market si existe expansión báltica |
| **Luxemburgo** | S / A / C / M + Local | Mollie >€100k/mes | Compartir volumen de todo Benelux para aumentar wallet negociable |
| **Malta** | S / A / C / M + Local | Mollie >€100k/mes | Pedir desglose domestic/cross-border y reservas según vertical |
| **Países Bajos** | S / A / C / M + Local | Mollie >€100k/mes | Mercado natural para tensionar tarjetas contra métodos bancarios locales; no comparar sólo MDR de card |
| **Noruega** | S / A / C / M + Local | Mollie >€100k/mes | Pedir pricing NOK/local acquiring y método local por separado |
| **Polonia** | S / A / C / M + Local | Mollie >€100k/mes | Añadir BLIK/local-method economics al RFP, además de Visa/Mastercard |
| **Portugal** | S / A / C / M + Local | Mollie >€100k/mes | RFP multi-MID y reprice por tipo de tarjeta/método |
| **Rumanía** | S / A / C / M + Local | Mollie >€100k/mes | Utilizar la nueva expansión completa de Mollie en EEE como challenger adicional |
| **Serbia** | A + Local; otros PSPs sujetos a entidad/cross-border | No se localizó gate público comparable | Stripe no soporta merchant domicile; la lista de aceptación de Adyen incluye Serbia, pero debe confirmarse local acquiring. Priorizar bancos/adquirentes locales en BATNA |
| **Eslovaquia** | S / A / C / M + Local | Mollie >€100k/mes | Mollie lanzó comercialmente en el país en 2026; pedir acquisition incentive además de precio |
| **Eslovenia** | S / A / C / M + Local | Mollie >€100k/mes | RFP de cuatro globales + local; solicitar ramp tiers |
| **España** | S / A / C / M + Square + SumUp + Local | SumUp >€10k/mes; Square ~€250k/año, con alguna página/producto ~€200k | Dos anchors públicos muy útiles; pedir simultáneamente custom blended, IC++ y descuento de hardware/software |
| **Suecia** | S / A / C / M + Local | Mollie >€100k/mes | Pricing por SEK/local acquiring + métodos nórdicos |
| **Suiza** | S / A + Local; Mollie como challenger a verificar por producto | No hay gate universal fiable | Stripe sí admite merchant domicile; Adyen opera en Suiza. Mollie soporta productos/métodos suizos, pero conviene verificar elegibilidad exacta del producto antes de usarlo como BATNA |
| **Turquía** | A + Worldline/local + Local | No se localizó gate público universal | Stripe no admite merchant domicile turco; Adyen incluye Turquía y documenta tratamiento de payouts específico. El RFP debe apoyarse fuertemente en acquiring local |
| **Reino Unido** | S / A / C / M + Square + SumUp + Braintree + Worldpay + Local | Square >£200k/año; SumUp >£10k/mes; Braintree >£50k/mes; Worldpay >£75k/año en producto concreto | Mercado con mayor densidad de thresholds públicos: ejecutar subasta estructurada y negociar fee, hardware, soporte y contrato simultáneamente |

El baseline `Mollie >€100k/mes` debe interpretarse como **señal publicada de volume pricing**, no como una garantía automática idéntica en todas las entidades, métodos o países. Mollie afirma actualmente operar en los 30 países del EEE y publica IC++/volume discounts en su propuesta para negocios de rápido crecimiento. citeturn22search10turn12search3turn12search6

En Francia, Irlanda y España, las diferencias entre las propias páginas de Square son especialmente importantes para CAMBRA: prueban que un PSP puede utilizar **distintos thresholds dentro de un mismo país según funnel, vertical o producto**. En lugar de resolver la discrepancia escogiendo el número más alto, el playbook debe guardar todos los gates y preguntar al vendedor: “¿Cuál de estas vías de custom pricing aplica a este MID, producto y volumen?”. citeturn15search1turn15search33turn15search34turn15search6turn15search3turn15search31

SumUp proporciona el counterexample más útil para merchants pequeños/medios: custom pricing no es necesariamente un fenómeno de decenas de millones de euros. Sus páginas actuales sitúan el contacto para custom rates en torno a **10.000 mensuales** en Reino Unido, Alemania, Francia, Italia y España. Eso no demuestra que el mismo threshold opere en los otros 28 mercados, pero sí cambia el prior de negociación: para un merchant que ya supera ~€10k/mes en esos países, aceptar pasivamente el sticker es innecesario. citeturn14search2turn16search0turn16search1turn16search19turn16search24

La cobertura geográfica también cambia el poder negociador. Stripe ofrece merchant accounts en 30 de estos 33 mercados y deja fuera actualmente Islandia, Serbia y Turquía. Mollie, tras su expansión de junio de 2026, cubre todos los países del EEE, mientras Checkout.com declara direct acquiring en los 30 estados del EEE. En Serbia y Turquía, por tanto, el playbook no debe ser una copia del RFP de España o Alemania: hay que aumentar el peso de adquirentes locales y comprobar cuidadosamente qué significa “coverage” para cada proveedor —aceptación, acquiring local, cross-border acquiring, onboarding del merchant y settlement no son sinónimos—. citeturn23view3turn22search10turn25search28turn25search3

## Casos públicos de descuentos, retention y switching

La tabla siguiente es el núcleo de `NegotiationCase`. **Ninguna cifra anecdótica se presenta como tarifa disponible hoy.** En los casos de Reddit, la fuente prueba únicamente que una cuenta pública afirmó haber recibido esa propuesta.

| PSP / caso | Merchant y volumen | Concesión u oferta reportada | Tipo | Truth level recomendado | Confianza | Prior útil |
|---|---:|---|---|---|---|---|
| **CardPointe / CardConnect** | Merchant pequeño; en el hilo declara volumen muy bajo | Retention ofreció revertir la annual fee **sólo si seguía procesando** | Retention directa | `REPORTED_CASE` | **Media-alta** | Al cancelar, pedir reversión de fees extraordinarios, PCI/annual/platform fees y créditos retroactivos |
| **Heartland** | Restaurante ~$2m/año Visa/MC/Discover + ~$0,5m Amex; AOV ~$60 | Ya había renegociado anteriormente; Heartland afirmó después que no podía bajar más | Renegociación incumbent | `REPORTED_CASE` | **Media-alta** | El primer “no podemos bajar más” justifica RFP, no necesariamente fin de negociación |
| **Merchant Warehouse** | Mismo restaurante, ~$2,5m/año total | **3 bps + $0,05/txn durante 2 años** tras hacer competir a >20 processors; después markup subió a 15 bps | Competitive acquisition | `REPORTED_CASE` | **Media-alta**, pero antiguo | Un markup extremadamente bajo ha existido; pedir rate lock y protección frente a repricing |
| **Square** | Mismo restaurante ~$2,5m/año | **2,5% flat incluyendo Amex** | Challenger quote | `REPORTED_CASE` | **Media-alta**, antigua | Pedir blended alternativo además de IC++; comparar con effective rate real |
| **PayPal** | Volumen “significativo”, no cuantificado | Merchant afirma que PayPal llamó, redujo tarifa y se llevó todo el volumen frente a Stripe | Acquisition / share-of-wallet | `REPORTED_CASE` | **Media** | Ofrecer consolidación de wallet share a cambio de price concession |
| **Braintree** | $1,58m en 2025; AOV ~$2.250; 1 chargeback/5 años | **2,1% + $0,30**, luego retirado como “error” | Custom offer no ejecutada | `REPORTED_CASE` | **Media-alta para el relato; cero como rate ejecutable** | No cerrar el RFP hasta tener underwriting y oferta firmada |
| **Stripe** en mismo caso | Merchant anterior | Usuario afirma que Stripe exigía 6 meses de processing antes de negociar | Supuesta sales condition | `REPORTED_CASE` | **Baja-media** | Preguntar por tenure requirements; no almacenarlo como política Stripe |
| **Mollie** | GPV y país no publicados | Usuario de 2026 afirma oferta de **$50k migration bonus** para dejar Stripe | Acquisition incentive | `REPORTED_CASE` | **Baja** | Añadir `migration_credit / buyout / professional_services_credit` a cada RFP |
| **Stripe**, hilo histórico | No suficientemente verificable para generalizar | Usuario afirmó que volumen alrededor de $50k/mes podía abrir descuento y que $100k podía generar otra reducción | Historical anecdotal tier | `REPORTED_CASE` | **Baja**, muy antiguo | Sólo prior para “preguntar”; la política oficial actual no publica esos gates |

Los cuatro primeros casos proceden del mismo hilo del restaurante y son particularmente ricos porque el merchant publicó GPV, AOV, pricing actual y alternativas. Heartland estaba en aproximadamente 14 bps + interchange + $0,04; el merchant calculaba su effective processing cost total, incluida la economía de Amex, en ~2,482%, frente a una proyección de ~2,258% con Payment Depot y 2,5% con Square. Es un ejemplo excelente de por qué CAMBRA debería almacenar y comparar **effective rate/TCO**, no únicamente el headline markup. citeturn20view0

Ese hilo contiene además una señal que suele perderse: una persona que se identificó como representante de Heartland dijo que, después de más de un año con el proveedor, el merchant podía volver a negociar y que veía margen para reducir Amex; el merchant contestó que ya había renegociado una vez y que Heartland decía no poder bajar más. Como la afirmación procede de una cuenta de Reddit y no de una política corporativa, su nivel debe ser `REPORTED`, pero refuerza el prior de que **tenure y historial de processing son argumentos comerciales**. citeturn20view0

El caso Merchant Warehouse es todavía más interesante para diseño de contratos. El merchant no sólo obtuvo 3 bps + $0,05; explica que posteriormente el markup pasó a **15 bps**. Por tanto, un NegotiationCase no está completo con `discount_bps`. También necesita `duration`, `rate_lock`, `repricing_rights`, `renewal_rate`, `scheme_fee_pass_through` y `notice_period`. Un descuento de 12 bps que dura doce meses y luego desaparece puede tener menor NPV que un descuento inicial más pequeño protegido durante tres años. citeturn20view0

CardPointe aporta el patrón de retention que el dataset busca explícitamente: la concesión estaba condicionada a **continuar procesando**. El caso no permite estimar cuántos bps puede obtener un merchant europeo, pero demuestra que el equipo de cancelaciones puede tener un **budget de concesiones distinto del account manager ordinario**. Para el playbook, eso justifica una etapa separada `commercial_review → formal_churn_notice → retention_escalation`, siempre que el merchant tenga realmente capacidad de migrar. citeturn18search0

PayPal ilustra una palanca diferente. Un merchant afirmó que Stripe no le había dado una mejora pese a volumen significativo, mientras PayPal lo llamó, redujo la tarifa y “got all the business”. La cifra no se conoce y la geografía del account no queda suficientemente establecida, pero el mecanismo es valioso: **el wallet share futuro es una moneda negociable**, no sólo el GPV histórico. citeturn18search2

El caso Braintree muestra por qué `offer_status` tiene que ser un campo de primera clase. La oferta verbal/comercial fue cuantificada, aceptada por el merchant y después retirada. Un motor de benchmarks que sólo guardase `provider=Braintree`, `rate=2.1%+0.30`, `GPV=1.58m` produciría una recomendación falsa; debe guardar `offer_status=WITHDRAWN`, `contract_signed=false` y `underwriting_confirmed=false`. citeturn21search0

Y el supuesto bonus de Mollie es el mejor ejemplo de cómo tratar outliers: **no debe eliminarse**, porque contiene información estratégica; tampoco debe elevarse a benchmark. El prior correcto es “migration incentives pueden existir y vale la pena solicitarlos”, no “Mollie paga $50k”. citeturn21search1

### Priors económicos para “qué pedir”

No recomiendo almacenar un único `expected_discount_bps` por PSP. El markup negociable depende demasiado del starting point y del mix. Es preferible convertir el prior en un **request ladder**:

| Situación | Primer anchor recomendado | Concesión alternativa | Confidence del prior |
|---|---|---|---|
| Merchant todavía en sticker/self-service pero ya supera un gate público | Pedir **custom rate review completa**, no 5 bps simbólicos | IC++ + fee fijo alternativo | Alta sobre la existencia de custom pricing |
| IC++ con markup claramente visible | Pedir reducción material del **markup controlable** y del fee fijo simultáneamente | Tier automático por volumen | Media; resultado concreto depende del account |
| Blended pricing | Pedir **dos ofertas**: discounted blended e IC++ | Rebate anual condicionado a GPV | Alta como táctica, no como resultado |
| Merchant con multi-country GPV | Consolidar forecast europeo a cambio de tiers | Rate por país/MID + wallet-share commitment | Media-alta |
| Coste de migración alto | Pedir **50–100% del coste de switching documentado** como crédito, no una cifra arbitraria | Professional services, hardware, token migration | Media como playbook; baja sobre importe alcanzable |
| Incumbent se niega a tocar MDR | Mover negociación a fixed fees, FX, disputes, minimums, support, hardware y contract term | Rate lock / cap de incrementos | Alta como estrategia multipalanca |
| Oferta del challenger no firmada | Mantener dos PSPs vivos | No anunciar churn irreversible | Alta, apoyada por el caso Braintree |
| Incumbent afirma “final offer” | Presentar reprice escrito de alternativa ejecutable | Formal churn/retention escalation | Media-alta |

Para contextualizar la importancia económica de los bps:

\[
\text{Ahorro anual}=\text{GPV anual}\times\frac{\text{bps}}{10.000}
\]

| GPV anual | 5 bps | 10 bps | 25 bps | 50 bps |
|---:|---:|---:|---:|---:|
| €1m | €500 | €1.000 | €2.500 | €5.000 |
| €5m | €2.500 | €5.000 | €12.500 | €25.000 |
| €10m | €5.000 | €10.000 | €25.000 | €50.000 |
| €50m | €25.000 | €50.000 | €125.000 | €250.000 |
| €100m | €50.000 | €100.000 | €250.000 | €500.000 |

Esto ayuda a evitar dos errores. En GPV bajo, ahorrar 5 bps puede valer menos que eliminar una cuota fija, conseguir terminales gratis o mejorar settlement. En GPV alto, una concesión aparentemente pequeña puede financiar una migración completa, por lo que la amenaza de churn se vuelve mucho más creíble.

## Pricing negociable por PSP y estrategia recomendada

### Matriz principal

| PSP | Evidencia oficial de negociabilidad | Gate público defendible | Cobertura relevante para CAMBRA-33 | Qué pedir primero | Confidence |
|---|---|---|---|---|---|
| **Stripe** | IC+, discounted flat, volume tiers, commitments, multiproduct/country pricing | **Ninguno universal publicado** | Merchant domicile en 30/33; no Islandia, Serbia, Turquía | IC++ y discounted blended sobre el mismo dataset; tiers 12/24 meses; commitment discount | **Alta** |
| **Adyen** | IC++ / pricing sales-led; minimum invoice puede aplicar | **Ninguno universal publicado** | Amplia aceptación incluyendo los 33; modalidad/local acquiring depende del mercado | acquiring markup, processing fee, minimum invoice, local acquiring, settlement | **Alta** modelo; media en cobertura específica |
| **Checkout.com** | IC++; adquisición europea enterprise | **Ninguno público universal** | Direct acquiring en los 30 países EEE; UK | Historical reprice IC++, processor margin, FX/cross-border, risk tooling | **Alta** |
| **Mollie** | Volume discounts, IC++, multiproduct/country pricing | **>€100k/mes** publicado | Todo EEE desde junio 2026 + UK; otros mercados verificar | Todos los tiers, true-up anual, migration credit, dedicated support | **Alta** |
| **Square** | Custom processing y paquetes custom | UK >£200k/año; IE/FR alrededor de €200k; ES/verticales hasta €250k; funnels alternativos diferentes | UK, Irlanda, Francia, España son los mercados europeos relevantes verificados aquí | Processing + hardware + software + implementation + AM | **Alta**, pero gate product-specific |
| **SumUp** | Individual/custom fees en páginas locales | >£10k/mes UK; >€10k/mes DE/FR/ES; ≥€10k IT | Amplia presencia europea; threshold verificado sólo en esos mercados | Custom rate + support/hardware; después comparar contra IC++ enterprise | **Alta** en países citados |
| **Braintree / PayPal Enterprise** | Custom flat, IC+, discounted rates según modelo/volume | UK **>£50k/mes** | Pricing country-specific | Custom flat vs IC+; underwriting approval escrito | **Alta** programa |
| **Worldpay** | Custom/variable pricing por producto | UK terminal específico **>£75k/año** | Especialmente relevante UK; otras geografías/productos requieren RFQ | Variable/cost-plus vs blended + terminal rental + term | **Alta** sólo para el producto citado |
| **Global Payments** | Filing corporativo: merchant discount varía por negociación; IC+ o bundled | Ninguno universal | Operación internacional; confirmar entidad por país | Merchant discount, fee fijo, B2B optimization separada del descuento | **Alta** negociabilidad |
| **Worldline** | Sales-led acquiring; formulario comercial segmenta por volumen; acquiring paneuropeo | No es defendible convertir los buckets del formulario en un “gate” | Cobertura de acquiring amplia en EEE y diversos mercados CAMBRA | Pricing por país/acquiring entity, routing, FX, settlement y volumen agregado | **Alta** modelo |
| **Viva.com** | Tailored pricing aparece en ofertas/partner motions | Sin threshold universal localizado | La compañía declaró presencia en 29 mercados europeos en 2026 | Quote multi-country, acquiring + terminal + settlement | **Media-alta** |

Stripe es probablemente el caso donde más daño hace inventar un threshold. Su documentación actual dice explícitamente que un paquete personalizado puede incorporar **IC+, discounted flat rates, volume discounts basados en tiers, commitments y product usage, además de multiproduct pricing**. No publica “contact us from €X”. Por tanto, para Stripe el modelo correcto no es `threshold = €1m/month`; debe ser `threshold = NOT_PUBLIC`, `negotiability = CONFIRMED`. citeturn13search0

Además, su lista actual de países permite una regla geográfica muy precisa. De los 33 mercados de este estudio, Stripe admite entidades en 30: todos los UE incluidos en el scope, Noruega, Suiza y Reino Unido. **Islandia, Serbia y Turquía no figuran actualmente en la lista de países soportados para merchant accounts.** Esto altera mucho el BATNA de esos tres mercados. citeturn23view3

**Playbook Stripe.** Enviar 3–6 meses de transacciones reales y exigir dos repricings: `Option A = discounted blended`, `Option B = IC+`. Solicitar en la misma ronda tiers para GPV actual, forecast +25% y forecast +50%; descuento adicional por compromiso; coste incremental de Radar/Billing/Connect; precio por país y moneda; y protección contractual del markup. El anchor no debería ser “quiero 20 bps menos”, sino “mostrad vuestro mejor coste controlable bajo ambas estructuras y haced que el siguiente tier se active automáticamente”. La propia arquitectura comercial de Stripe respalda esta forma de negociar. citeturn13search0

El claim de Reddit de que Stripe pidió seis meses de historial a un merchant de $1,58m/año debe transformarse en una **pregunta de due diligence**, no en una regla: “¿Hay requisitos de tenure, live processing o risk history para aplicar custom pricing? Que aparezcan por escrito en la oferta”. citeturn21search0

Adyen funciona de forma distinta. Su pricing está construido alrededor de processing fee más el coste del método de pago y utiliza IC++ para tarjetas en los modelos relevantes; además indica que puede existir una **minimum invoice** dependiendo de industria y modelo. No se ha localizado un volumen universal que active negociación. citeturn13search1turn13search11

**Playbook Adyen.** Negociar `acquiring_markup`, `processing_fee_per_txn`, `minimum_invoice`, country/MID pricing, local acquiring, payout/settlement y cualquier fee adicional por producto. En un merchant paneuropeo, la concesión que se ofrece a cambio no debería ser sólo “más GPV”: puede ser el go-live secuencial de países o una mayor share-of-wallet condicionada a authorization rate y economics. Adyen declara capacidad para aceptar pagos en una lista que incluye los 33 mercados aquí analizados, pero la empresa debe confirmar expresamente qué países tienen acquiring local, qué entidad contrata y qué modelo de payout corresponde. citeturn25search3turn25search13

Checkout.com es un challenger especialmente útil para merchants digitales grandes porque publica IC++ y posee licencias en Reino Unido y Francia que le permiten direct acquiring en los 30 países del EEE. Su documentación enfatiza además la transparencia a nivel de transacción en IC++. citeturn25search1turn25search11turn25search28

**Playbook Checkout.com.** La petición más fuerte es un historical reprice del fichero real, con `interchange`, `scheme fees`, `processor margin`, `FX/cross-border`, authorization-related products y otros cargos en columnas distintas. No negociar sólo “margin bps”: exigir que cualquier ahorro comercial no reaparezca en otra línea. Para un incumbent Stripe/Adyen, un reprice escrito de Checkout.com es un BATNA mucho más persuasivo que una captura de pantalla de un foro. Checkout.com publicó en 2026 un caso de Direct Ferries en el que el merchant buscaba además reducir dependencia de un único PSP, ilustrando que la arquitectura multi-PSP forma parte de conversaciones enterprise actuales. citeturn25search31

Mollie tiene uno de los mejores gates para el modelo: **más de €100.000 al mes** para volume pricing. Además, en junio de 2026 anunció cobertura completa del EEE tras entrar en Croacia e Islandia. citeturn12search3turn12search6turn22search1turn22search10

**Playbook Mollie.** Si el merchant está cerca de €100k/mes, no esperar a cruzarlo. Pedir por adelantado toda la tabla de tiers y un ramp schedule. Ejemplo contractual: precio A hasta €100k; B desde €100k; C desde €250k; D desde €500k, con activación automática. Pedir además `annual_true_up`, para que si el merchant supera el compromiso anual recupere el diferencial del período, y añadir explícitamente `migration_credit`. El caso anecdótico de $50k hace que preguntar por este último campo tenga valor esperado positivo aunque la expectativa razonable de recibir exactamente $50k sea muy baja. citeturn21search1

Square debe modelarse a nivel de país y producto. En Reino Unido la propia compañía invita a hablar de custom rates por encima de £200k/año y menciona descuentos de hardware/software y otros componentes comerciales; Irlanda, Francia y España muestran gates en torno a €200k–€250k dependiendo del funnel. citeturn15search0turn15search24turn15search1turn15search34turn15search3

**Playbook Square.** No gastar toda la negociación en el percentage rate. Solicitar un package price de processing + terminales + software + implementation + soporte/account management. En retail/hospitality multi-location, el hardware y rollout pueden tener más valor que unos pocos bps. El caso histórico del restaurante con ~$2,5m/año, al que Square cotizó 2,5% flat incluyendo Amex, confirma que el competidor puede cambiar no sólo el precio sino también la **estructura** para presentar un TCO distinto. citeturn20view0

SumUp abre custom pricing a un nivel mucho menor en las cinco geografías donde se localizó una cifra oficial actual: aproximadamente 10k mensuales. Esa señal es especialmente importante para la capa SMB/mid-market de CAMBRA. citeturn14search2turn16search0turn16search1turn16search19turn16search24

**Playbook SumUp.** En Alemania, Francia, Italia, España o Reino Unido, un merchant por encima de ese gate debería activar una recomendación automática del tipo: `CUSTOM_PRICING_ELIGIBLE → contact sales before renewal`. Pedir tarifa individual, hardware, soporte y condiciones de salida. Si el merchant crece hacia €100k+/mes, introducir además Mollie/Adyen/Checkout/Stripe en la licitación para comprobar si sigue siendo óptima la estructura del proveedor SMB.

Braintree publica que custom flat rates, interchange-plus y discounted rates dependen, entre otros factores, del modelo de negocio y el processing volume; en UK se documenta un punto comercial de más de £50k/mes. citeturn13search2turn16search1turn16search5

**Playbook Braintree.** Añadir una regla de proceso derivada del caso 2026: ningún `BAFO` pasa a `VALIDATED_OFFER` hasta que `underwriting_status=APPROVED`, `pricing_authority_confirmed=true`, `effective_date` y `term` estén documentados. Mantener al segundo challenger vivo hasta entonces. citeturn21search0

Worldpay UK ofrece otro buen ejemplo de threshold product-specific: el producto de terminal consultado dirige a custom tariff por encima de **£75.000 de card turnover anual**. No debe extrapolarse al ecommerce ni a otros países. citeturn16search2

**Playbook Worldpay.** Pedir en una sola hoja percentage markup, per-item/auth, terminal rental, monthly minimum, joining/setup, settlement, contract length, termination y price-increase rights. El headline rate no sirve si un descuento del processing se recupera mediante alquiler de terminal o aumento contractual.

Global Payments proporciona la evidencia corporativa más explícita de que el precio se negocia: su filing señala que los merchant discount rates dependen de la negociación y de las características económicas de las transacciones, y que las estructuras pueden ser interchange-plus o bundled. citeturn17search2

**Playbook Global Payments.** Separar siempre `commercial_discount` de `interchange_optimization`. Si el proveedor consigue bajar el coste mediante mejor data qualification, Level 2/3 u otra optimización, eso no debe contabilizarse como una concesión de margen del PSP. De lo contrario CAMBRA podría atribuir al vendedor una “rebaja” que en realidad proviene de cambiar cómo cualifican las transacciones.

Worldline, por su parte, publicita acquiring paneuropeo/local y utiliza en su funnel comercial segmentos de volumen desde 100k hasta decenas de millones. Esos buckets prueban segmentación comercial, pero **no prueban que €100k sea un threshold de descuento**. citeturn14search6turn14search13

**Playbook Worldline.** En merchants multinacionales, pedir una propuesta país por país y una segunda propuesta consolidada paneuropea. La diferencia entre ambas revela cuánto valor atribuye el PSP a la concentración de wallet y permite negociar local acquiring, routing, FX y settlement sin esconderlo dentro de un único MDR.

## Playbook paneuropeo para convertir estos priors en ahorro real

La secuencia óptima no empieza amenazando al PSP actual. Empieza haciendo que la amenaza sea **creíble**.

**Data pack.** El merchant debería poder reconstruir al menos 12 meses de GPV, número de transacciones, AOV, distribución de tickets, card-present/card-not-present, debit/credit, consumer/commercial, domestic/cross-border, moneda, país de emisión cuando esté disponible, refunds, chargebacks, fraude, authorization rate, settlement y todos los fees. Square reconoce expresamente volumen y average transaction size entre los factores de custom pricing; Checkout.com y Adyen enfatizan la importancia del análisis transaccional y de la transparencia IC++. citeturn15search33turn25search11turn13search13

**Normalización.** CAMBRA debería calcular dos métricas diferentes:

\[
\text{Effective Rate}=
\frac{\text{coste total de pagos}}{\text{GPV}}
\]

y

\[
\text{Controllable PSP Margin}=
\text{Coste total}-
\text{Interchange}-
\text{Scheme/pass-through}
\]

La primera responde “¿cuánto me cuesta realmente?”. La segunda responde “¿cuánto de ese coste puede razonablemente conceder el PSP?”. IC++ existe precisamente para hacer más visible esta separación. citeturn25search1turn13search11

**RFP simétrico.** A los finalistas hay que enviarles exactamente el mismo dataset y pedir tres estructuras: `best blended`, `best IC++/cost-plus` y `volume-tier schedule`. Stripe admite oficialmente ambas familias de estructura; Checkout.com trabaja con IC++; Braintree reconoce custom flat e interchange-plus; Global Payments declara bundled e interchange-plus. citeturn13search0turn25search1turn13search2turn17search2

**Historical reprice.** Ésta debería ser una condición de shortlist: el proveedor tiene que aplicar su pricing a tres meses reales de transacciones y devolver coste por transacción o, como mínimo, por segmento suficientemente granular. Así se neutralizan frases como “desde X%” y se detecta si el ahorro procede realmente del processor markup.

**BAFO antes de retention.** No presentar al incumbent una oferta preliminar. Obtener `Best and Final Offer` de al menos dos challengers, validar underwriting tanto como sea posible y calcular migration TCO. Sólo entonces llevar una cifra al incumbent: “la alternativa validada reduce nuestro coste anual neto en €X después de implementación”.

**Retention escalation.** El mensaje efectivo no es “si no me bajáis, me voy”; es: “Tenemos una oferta ejecutable, integración evaluada y un business case aprobado. Preferimos quedarnos si cerráis un gap de €X y corregís estas cuatro condiciones”. El caso CardPointe indica que la función de retention puede disponer de concesiones que no aparecieron en la relación ordinaria, mientras el caso Heartland muestra que, cuando el incumbent declara haber llegado a su floor, tener challengers reales es lo que convierte la conversación en una decisión. citeturn18search0turn20view0

**No revelar inmediatamente el reservation price.** Dejar que el PSP haga la primera propuesta de commercial review/retention. Si ofrece sólo bps, mover la negociación a las demás variables.

El paquete debería cubrir como mínimo:

| Campo negociable | Petición CAMBRA |
|---|---|
| Processor/acquirer markup | Reducir bps explícitos |
| Per-transaction/auth fee | Reducir/eliminar fee fijo; crítico con AOV bajo |
| Volume tiers | Activación automática sin nueva negociación |
| Annual true-up | Reembolso retroactivo al superar el volumen anual |
| Minimum invoice/monthly minimum | Waiver durante ramp o eliminación |
| FX | Spread contractual visible y, si procede, tiers |
| Cross-border | Pricing separado; mayor local acquiring |
| Disputes | Fee, refund del fee al ganar cuando sea posible, tooling |
| Reserve | Porcentaje, duración y release schedule definidos |
| Settlement | Mejorar T+N cuando underwriting lo permita |
| Migration | Cash/fee credit, token migration, professional services |
| Hardware | Descuento/gratuidad por rollout |
| Software | Bundle o descuento multiproducto |
| Support | Named AM/TAM, escalation path y SLA |
| Price protection | Rate lock o cap de subida del markup |
| Contract term | Evitar duración excesiva a cambio de descuento modesto |
| Termination | Bajar/eliminar early-termination fee |
| Auto-renewal | Notice claro y sin repricing oculto |
| Portability | Exportación/tokens/datos dentro de posibilidades técnicas y contractuales |

Stripe confirma oficialmente que commitments, volume tiers y multiproduct usage son variables de pricing; Square confirma que hardware y otros elementos pueden entrar en la conversación custom. Esto permite tratar esos campos como **palancas reales**, aunque no todos los PSP concederán todos ellos. citeturn13search0turn15search0

### Anchors específicos por proveedor

| PSP | Frase inicial recomendada |
|---|---|
| **Stripe** | “Aplicad a nuestro histórico vuestro mejor discounted flat y vuestro mejor IC+; mostrad tiers a 12/24 meses y descuento por commitment/multiproduct.” |
| **Adyen** | “Separad IC++, acquiring markup, processing fee, minimum invoice y economics de local acquiring por país.” |
| **Checkout.com** | “Historical reprice completo IC++ con processor margin, FX/cross-border y todos los productos auxiliares separados.” |
| **Mollie** | “Procesamos €X/mes; mostrad todos los volume tiers, su activación y qué migration/implementation credit podéis ofrecer.” |
| **Square** | “Estamos por encima del custom-pricing gate relevante; cotizad processing, hardware, software, implementation y account management como paquete.” |
| **SumUp** | “Estamos por encima del gate de custom pricing local; queremos individual rate y coste total de hardware/support.” |
| **Braintree** | “Queremos custom flat e IC+; toda oferta deberá venir aprobada y documentada antes de exclusividad.” |
| **Worldpay** | “Cotizad variable/cost-plus y blended con terminal rental, minimums, term, termination y settlement.” |
| **Global Payments** | “Separad merchant discount negociable de interchange y de cualquier saving por optimization.” |
| **Worldline** | “Cotizad una opción por país y otra consolidada para todo nuestro GPV europeo.” |

### Árbol de decisión para `NegotiationCase`

```text
¿Existe pricing custom oficial?
        │
        ├── NO ──► Construir challenger quote + preguntar sales
        │
        └── SÍ
             │
             ├── ¿Existe threshold público?
             │       │
             │       ├── SÍ y merchant ≥ threshold
             │       │      ► trigger = CUSTOM_PRICING_ELIGIBLE
             │       │
             │       └── NO / no publicado
             │              ► usar GPV + growth + risk + wallet share
             │
             ▼
       Obtener 2+ ofertas
             │
       Historical reprice
             │
       Underwriting viable
             │
       BAFO challengers
             │
       Incumbent commercial review
             │
       Formal churn/retention escalation
             │
       ┌─────┴─────┐
       │           │
   Counteroffer   No match
       │           │
   Reprice TCO   Ejecutar BATNA
       │
       └────► Contrato + rate protection
```

Un detalle crucial es que el **BATNA no necesita ser más barato sólo en MDR**. Un challenger puede ganar mediante mejor auth rate, local acquiring, menor FX, mejor settlement o menor coste operativo. Checkout.com, por ejemplo, publicó en 2026 un caso donde Direct Ferries reportó una mejora inicial de margen de 0,60% y alrededor de 2% en acceptance tras determinadas optimizaciones; estas métricas no son benchmarks generalizables, pero muestran por qué el business case de payments debe incorporar rendimiento además del fee. citeturn25search31

## Modelo de datos, confidence scoring y límites legales

Para alimentar priors de forma segura, el objeto no debería ser simplemente `PSP → discount`. Una estructura razonable sería:

```text
NegotiationCase
  provider
  merchant_country
  acquiring_country
  merchant_vertical
  channel                 # ecommerce / CP / omnichannel
  case_date
  source_type             # official / merchant_first_person / third_party
  truth_level             # OFFICIAL / REPORTED / INFERRED
  offer_type              # retention / acquisition / win_back / custom
  trigger                 # churn / RFP / volume / renewal / share_of_wallet
  annual_gpv
  monthly_gpv
  average_ticket
  risk_indicators
  pricing_before
  pricing_offer
  pricing_model           # blended / IC+ / IC++ / membership
  percentage_markup
  fixed_txn_fee
  ancillary_fees
  migration_credit
  hardware_credit
  volume_tiers
  minimum_commitment
  term
  rate_lock
  offer_status            # verbal / written / approved / signed / withdrawn
  underwriting_status
  outcome
  source_date
  source_reference
  geographic_applicability
  product_scope
  confidence_score
  staleness_score
```

El campo `offer_status` es indispensable por Braintree; `rate_lock` por Merchant Warehouse; `retention_condition` por CardPointe; `geographic_applicability` por Stripe/Mollie/Square; y `product_scope` por las discrepancias internas de Square. citeturn21search0turn20view0turn18search0turn15search1turn15search31

Propongo este scoring interno de **100 puntos**, explícitamente como metodología CAMBRA y no como estadística externa:

| Dimensión | Puntos |
|---|---:|
| Calidad de fuente: oficial / primera persona / tercero | 0–40 |
| Especificidad: GPV + rate + proveedor + contexto | 0–25 |
| Recencia | 0–20 |
| Corroboración o documentación adicional | 0–15 |

Aplicándolo de manera conservadora:

| Caso | Score sugerido | Motivo |
|---|---:|---|
| Stripe custom pricing oficial | **95** | Oficial, actual y explícito; falta threshold numérico porque no existe publicado |
| Mollie >€100k/mes | **95** | Gate oficial actual |
| Square gates por país | **90–95** | Oficiales, pero product/funnel-specific |
| SumUp €10k/mes en países verificados | **90–95** | Oficial y local |
| Braintree UK £50k/mes | **90** | Oficial y cuantificado |
| Worldpay £75k/año | **85** | Oficial, pero producto UK concreto |
| Heartland/Merchant Warehouse | **68** | Primera persona, cifras ricas y consistentes; antiguo y fuera de Europa |
| CardPointe retention | **65** | Retention directa en primera persona; sin contrato |
| Braintree 2,1% + $0,30 retirado | **68** para “oferta reportada”; **5** para “rate ejecutable” | Muy específico, pero withdrawn |
| PayPal rate reduction | **48** | Primera persona, pero sin cifra/GPV completo |
| Mollie $50k switching bonus | **35** | Actual y concreto, pero extraordinario, sin contrato, GPV ni geografía |
| Stripe $50k/month anecdotal gate histórico | **20–25** | Muy antiguo y contradicho en utilidad por ausencia de gate público actual |

Esto permite que el motor preserve información “valiosa pero sucia” sin contaminar la capa factual.

### Lo que es razonable recopilar y lo que debe evitarse

Recopilar unilateralmente tarifas **publicadas** por PSPs y testimonios que los merchants han hecho públicos es jurídicamente muy distinto de organizar un intercambio de pricing confidencial y prospectivo entre merchants competidores. Las Horizontal Guidelines de la Comisión Europea tratan el intercambio de información entre competidores bajo el artículo 101 TFUE y consideran especialmente sensible la información capaz de revelar la estrategia competitiva, incluidos precios y otros parámetros comerciales. Por ello, CAMBRA debería ser especialmente prudente con datos actuales, individualizados y no públicos intercambiados entre merchants que compiten entre sí. citeturn27search0

Eso no significa que un benchmark interno basado en fuentes públicas sea equivalente a una práctica anticompetitiva. El riesgo aumenta cuando existe **intercambio estructurado entre competidores**, particularmente sobre pricing actual/futuro o estrategia. La arquitectura de CAMBRA debería, por ello, preferir fuentes públicas, datos históricos cuando sea posible y outputs agregados en los casos en que merchants competidores alimenten información privada; cualquier programa de benchmarking privado a escala debería someterse a revisión antitrust específica. citeturn27search0

La Directiva de Secretos Empresariales protege información empresarial no divulgada frente a adquisición, uso o divulgación ilícitos. Esto introduce una frontera práctica clara: **indexar una tarifa que su propio receptor publicó voluntariamente es una cosa; solicitar a un empleado del PSP que filtre su pricing matrix interno, pagar por información sustraída o inducir a un merchant a violar un NDA es otra**. CAMBRA debería excluir cualquier material cuya procedencia implique acceso no autorizado o incumplimiento conocido de confidencialidad. citeturn26search1turn26search7

El RGPD sigue siendo aplicable cuando el dataset contiene datos personales. Que un username, nombre o perfil sea públicamente visible no convierte automáticamente todo tratamiento posterior en irrelevante a efectos de protección de datos. Entre los principios del artículo 5 están licitud/lealtad/transparencia, limitación de finalidad y minimización. En consecuencia, para un prior de negociación suele ser suficiente almacenar “merchant anónimo, restaurante, ~$2,5m GPV, Heartland, fecha, fuente”; normalmente no aporta valor enriquecer el perfil con teléfono, domicilio, familiares u otros datos personales. citeturn26search2turn26search5turn26search19

CAMBRA también debería distinguir `source_reference` de `source_copy`. Para los fines del benchmark suele bastar con retener el hecho estructurado, una breve descripción y referencia a la fuente; no es necesario republicar hilos enteros ni construir copias masivas de contenido ajeno.

### Reglas de ingestión recomendadas

Un caso anecdótico entraría con:

```text
truth_level      = REPORTED
is_official       = false
contract_seen     = false
can_generalize    = false
use_as_rate_card  = false
use_as_ask_prior  = true
```

Un threshold de Mollie:

```text
provider          = Mollie
truth_level       = OFFICIAL
pricing_program   = volume_discount
threshold_value   = 100000
threshold_currency= EUR
threshold_period  = monthly
geographic_scope  = published_European_offer
product_scope     = payments
confidence        = HIGH
```

Un caso como el bonus de $50k:

```text
provider          = Mollie
truth_level       = REPORTED
offer_type        = acquisition
concession_type   = migration_credit
amount            = 50000 USD
merchant_gpv      = UNKNOWN
merchant_country  = UNKNOWN
contract_seen     = false
confidence        = LOW
recommended_prior = ASK_FOR_MIGRATION_CREDIT
not_recommended   = EXPECT_50000_USD
```

Y el caso Braintree debería preservar el fracaso de la oferta:

```text
provider             = Braintree
annual_gpv           = 1.58m USD
offer                 = 2.1% + 0.30 USD
offer_status          = WITHDRAWN
contract_signed       = false
underwriting_confirmed= false
truth_level           = REPORTED
prior                 = REQUIRE_WRITTEN_APPROVAL_BEFORE_CLOSING_RFP
```

citeturn21search1turn21search0

La política de producto debería impedir automáticamente transformar un `REPORTED_CASE` en una frase del tipo “PSP X ofrece Y a partir de Z”. Sólo `OFFICIAL_PROGRAM` puede producir ese lenguaje. Los casos `REPORTED` pueden generar frases como: “Existe un caso público no verificado en el que un merchant afirma haber conseguido X; úselo como referencia para preguntar, no como tarifa esperada”.

## Conclusiones para NegotiationCase y playbooks CAMBRA

El hallazgo más útil para los 33 mercados no es un único descuento en bps. Es una **jerarquía de poder negociador**.

En la mayor parte de la UE, además de Noruega e Islandia, CAMBRA puede construir una subasta competitiva fuerte usando combinaciones de Stripe, Adyen, Checkout.com, Mollie y adquirentes locales. Stripe confirma custom pricing pero no threshold; Adyen y Checkout dan acceso a modelos transparentes IC++; Mollie añade un gate explícito de €100k/mes. Esa combinación permite abrir una conversación de pricing sin necesidad de inventar el supuesto “mínimo enterprise” de Stripe o Adyen. citeturn13search0turn13search1turn25search1turn22search10

**Reino Unido es el mercado con mejor evidencia pública de thresholds negociables** dentro del universo estudiado: Square >£200k/año, SumUp >£10k/mes, Braintree >£50k/mes y un producto Worldpay >£75k/año, además de Stripe/Adyen/Checkout/Mollie. Esto permite construir playbooks muy deterministas en función de GPV. citeturn15search0turn14search2turn16search1turn16search2

**España, Francia e Irlanda son especialmente interesantes por Square**, porque sus propias páginas muestran gates distintos según producto/funnel. España y Francia añaden además el gate bajo de SumUp, mientras Francia e Irlanda mantienen una buena densidad de challengers. CAMBRA debería aprovechar precisamente esas discrepancias: cuando un merchant cae por debajo de un threshold en una página pero por encima de otro funnel del mismo PSP, la recomendación correcta es solicitar una evaluación manual de custom pricing. citeturn15search33turn15search34turn15search6turn15search3turn15search31turn16search1turn16search24

**Alemania e Italia tienen un trigger especialmente temprano mediante SumUp**, alrededor de €10k/mes en las páginas oficiales verificadas. Para merchants que crecen, Mollie aporta un segundo milestone alrededor de €100k/mes. El playbook puede por tanto ser escalonado: custom SMB rate primero; RFP IC++ enterprise después. citeturn16search0turn16search19turn12search3

**Islandia es distinta porque Stripe no admite actualmente merchant domicile**, mientras Mollie acaba de completar su cobertura EEE con la entrada islandesa y Adyen/Checkout ofrecen alternativas paneuropeas. Esto convierte la expansión de Mollie en una señal comercial especialmente relevante allí. citeturn23view3turn22search1turn22search10turn25search28

**Serbia y Turquía exigen un playbook más local.** Stripe no soporta actualmente entidades merchant domiciliadas allí. Adyen incluye ambos países dentro de su footprint de aceptación y documenta específicamente Turquía en sus modelos de payout, pero ello no debe convertirse sin verificación contractual en “local acquiring idéntico al de Francia”. En estos dos mercados, el poder negociador debe construirse con adquirentes locales y globales compatibles, no copiando el shortlist de la UE. citeturn23view0turn23view1turn25search3turn25search13

**Suiza** se sitúa entre ambos modelos: Stripe sí permite merchant domicile y Adyen opera en el mercado; Mollie muestra soporte para métodos suizos y elegibilidad de productos para negocios suizos, pero la documentación localizada no justifica extrapolar todos sus productos/adquirencia como si Suiza fuese simplemente otro país EEE. El motor debe ser capaz de decir `VERIFY_PRODUCT_ELIGIBILITY` en lugar de rellenar el hueco con una suposición. citeturn23view3turn24search6turn24search12

Finalmente, la mejor estimación de “qué pedir” no es una tabla mágica de 10/20/30 bps. Los casos públicos enseñan algo más potente:

**Pedir estructura, no sólo descuento.** Un merchant grande debe obtener blended e IC++ comparables.

**Pedir tiers, no una fotografía.** El crecimiento futuro debe reducir automáticamente el precio.

**Pedir permanencia a cambio de protección.** Si el PSP exige commitment, devolverlo con rate lock y caps de repricing.

**Pedir switching economics por separado.** Migration credits, hardware, implementation y professional services tienen su propio budget comercial; el anecdótico $50k de Mollie es un prior para abrir esa pregunta, no para fijar la expectativa. citeturn21search1

**Llegar a retention con un BATNA, no con un bluff.** CardPointe demuestra que la amenaza real de cancelación puede desbloquear concesiones; Heartland demuestra que, cuando el incumbent dice haber llegado al floor, una licitación real es el siguiente paso. citeturn18search0turn20view0

**No matar al segundo proveedor hasta tener contrato.** La experiencia Braintree demuestra que “aceptado verbalmente” y “approved rate” no son lo mismo. citeturn21search0

Y, sobre todo, **no convertir un prior en una verdad**. “Un restaurante con ~$2,5m de volumen consiguió históricamente 3 bps + $0,05 haciendo competir a veinte processors” es una observación legítima. “A €2,5m/año puedes conseguir 3 bps” sería una regla inventada. La primera pertenece a `NegotiationCase`; la segunda no. citeturn20view0