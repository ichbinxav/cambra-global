# CAMBRA: tarifas y proveedores en los mercados europeos

## Conclusión ejecutiva

La arquitectura que planteas es correcta, pero la investigación cambia varios detalles importantes del inventario inicial. La conclusión principal es que **conviene separar con mucha disciplina cuatro cosas que ahora aparecen mezcladas en una misma “tarifa”**: el precio final cobrado al comercio, el interchange, los scheme fees y las tarifas de un método doméstico. Mastercard recuerda expresamente que el interchange es solo uno de los componentes del Merchant Discount Rate, y Visa publica igualmente tablas diferenciadas intra-EEA e inter-EEA; por tanto, una fila IFR de 0,20 % no puede tratarse como si fuese una oferta de acquiring al merchant. citeturn23search0turn23search1turn23search8

A fecha de captura **13 de agosto de 2026**, el marco regulatorio central queda confirmado: el Reglamento europeo limita el interchange de tarjetas de consumo a **0,20 % en débito y 0,30 % en crédito** dentro de su ámbito de aplicación, y el régimen se incorporó al EEE, por lo que la capa regulatoria alcanza los 27 Estados de la UE más Noruega, Islandia y Liechtenstein. Reino Unido conserva esos mismos topes para operaciones domésticas de consumo, pero no para UK↔EEA; el PSR documentó que Visa y Mastercard elevaron las operaciones card-not-present UK–EEA desde 0,20/0,30 % hasta aproximadamente **1,15 % débito / 1,50 % crédito**. citeturn1search0turn1search1turn1search3turn23search2

También queda definitivamente resuelta la duda de Bulgaria: **Bulgaria adoptó el euro el 1 de enero de 2026**, con tipo irrevocable de conversión de **1 EUR = 1,95583 BGN**. Tu registro con BG en EUR es correcto. Con ello, el universo de 33 mercados queda efectivamente en **22 mercados EUR y 11 no-EUR** según el registro que has facilitado. citeturn2search6turn2search16

La primera corrección importante de cobertura es que **SumUp no está en los 33**: su selector oficial actual enumera 30 de esos mercados y no muestra Islandia, Liechtenstein ni Andorra. En cambio, **myPOS declara elegibles todos los países del EEE, Reino Unido y Suiza**, y Mollie anunció en junio de 2026 que ya cubre los 30 países del EEE; su documentación de elegibilidad añade Reino Unido y Suiza. En otras palabras, myPOS y Mollie alcanzan **32 de tus 33 mercados**, quedando Andorra como la verdadera excepción del pase paneuropeo. citeturn6view1turn15search3turn15search6turn15search14

La segunda corrección importante es metodológica: **no usaría `provider × country` como unidad suficiente de `PaymentsRateTable`**. Los precios cambian por canal, tipo de tarjeta, procedencia de la tarjeta, tarjeta de consumo/comercial, plan, volumen y parte fija. Los ejemplos actuales de SumUp España, myPOS UK y Square España demuestran que una única tasa nacional perdería información material. citeturn3search9turn0search3turn7search0

Mi recomendación para el seed es, por tanto:

| `truthLevel` propuesto | Qué significa | ¿Puede alimentar Analyzer? |
|---|---|---|
| `OFFICIAL_MERCHANT_RATE` | Precio público explícito cobrado al comercio | Sí, como benchmark, respetando condiciones |
| `OFFICIAL_SCHEME_RATE` | Interchange/scheme fee oficial | Solo como componente, nunca como MDR |
| `REGULATORY_CAP` | Límite legal o compromiso regulatorio | Solo como prior/floor analítico |
| `OFFICIAL_PRICING_MODEL` | Proveedor confirma modelo pero requiere cotización | No como tarifa numérica |
| `OFFICIAL_COVERAGE` | Solo prueba presencia/elegibilidad | No |
| `PROVISIONAL` | Catálogo inicial aún sin corroboración primaria | No |

Esto encaja especialmente bien con tu separación entre **benchmark/fallback**, priors jerárquicos de CPIC y activación comercial: investigar los 33 no implica hacer elegibles los 33. Mantendría exactamente tu regla de producto FR+ES y `LEGAL_REVIEW_REQUIRED` para el resto hasta que cambie P10.

## Marco regulatorio y significado de las tarifas

El IFR debe sembrarse una sola vez como regla transversal y no duplicarse como supuesto “precio de Visa/Mastercard” en cada país. Para tarjetas de consumo cubiertas por el reglamento, los topes son 0,20 % débito y 0,30 % crédito; Mastercard confirma además que el IFR del EEE cubre operaciones domésticas y transfronterizas dentro del EEE, mientras que el régimen británico limita su alcance a las operaciones domésticas de Reino Unido. citeturn1search0turn23search2

La consecuencia para tu modelo es importante. Una transacción debería poder resolver algo conceptualmente parecido a:

`merchantPrice = interchange + schemeFees + acquirerMarkup + fixedFee + ancillaryFees`

o, si el proveedor vende blended pricing:

`merchantPrice = blendedPercent + fixedFee`

y esos dos objetos **no deberían compartir el mismo `truthLevel`**, aunque ambos terminen representándose como coste efectivo sobre GMV. Mastercard señala expresamente que el MDR lo establece el adquirente y que el interchange constituye solo uno de sus componentes. citeturn23search7turn23search8

Para Visa y Mastercard tampoco hace falta mantener una tabla artesanal basada en blogs. Las dos redes mantienen páginas oficiales desde las que enlazan sus tablas de interchange intra-EEA, interregional/EEA inbound y otras variantes. Esas páginas deben ser las fuentes canónicas de un eventual `SchemeRateTable`; además, Mastercard advierte que sus tablas se actualizan periódicamente, lo que refuerza la necesidad de guardar `capturedAt` y `effectiveFrom`. citeturn23search0turn23search1

### Reino Unido merece una dimensión propia

El valor **1,15 %/1,50 %** que aparece en tu texto no es una tarifa de acquiring de Worldpay, Barclaycard o SumUp. Es el nivel de interchange CNP que el PSR documentó para determinadas operaciones de consumo transfronterizas UK↔EEA después del Brexit; el regulador señaló que los niveles anteriores eran 0,20/0,30 %. Por tanto, guardaría esos registros como `SCHEME_INTERCHANGE`, con `cardPresence=CNP` y `crossBorderRegion=UK_EEA`, nunca como `MERCHANT_MDR`. citeturn1search3turn1search20

Para las operaciones domésticas británicas siguen existiendo los topes de 0,20/0,30 %. La propia página de interchange de Mastercard diferencia expresamente el régimen EEA —doméstico y EEA cross-border— del régimen UK —solo UK domestic—. citeturn1search5turn23search2

### Suiza no debe heredarse del cluster EEE

Suiza exige otra política. No está dentro del IFR del EEE y la autoridad de competencia suiza mantiene actuaciones específicas sobre interchange de Visa y Mastercard, incluidas decisiones recientes sobre débito Visa en 2025, Mastercard en 2024 y transacciones EEA→Suiza. No cargaría, por tanto, ningún “0,20/0,30 por proximidad europea” para CH. citeturn22search2turn22search4

Eso refuerza tu intuición de que CH puede producir un gap especialmente interesante frente a FR/ES, pero el gap debe medirse contra **tarifas suizas y transfronterizas reales**, no inferirse únicamente de la ausencia del IFR.

## Proveedores paneuropeos: qué queda realmente demostrado

El pase paneuropeo sí es la estrategia óptima, aunque yo modificaría el orden y las expectativas. La evidencia actual permite distinguir proveedores capaces de generar tarifas públicas automáticamente de otros que solo sirven para completar la matriz de cobertura.

| Proveedor | Resultado de la investigación | Uso recomendado |
|---|---|---|
| **SumUp** | Selector oficial en 30/33 mercados; faltan IS, LI y AD. Publica precios simples por país en bastantes locales. citeturn6view1 | Primer extractor de `OFFICIAL_MERCHANT_RATE` |
| **myPOS** | Elegibilidad oficial EEE + UK + CH, es decir, 32/33; no Andorra. citeturn15search3turn15search7 | Segundo pase paneuropeo; muy útil para SMB |
| **Mollie** | Desde junio de 2026 opera en los 30 EEE y su ayuda incluye CH + UK. citeturn15search6turn15search14 | Excelente para online/APMs y tarifas de métodos locales |
| **Square** | Europa limitada oficialmente a **GB, IE, FR y ES**. La afirmación de tu inventario queda confirmada. citeturn7search1 | Benchmark excelente precisamente en FR/ES/GB/IE |
| **Adyen** | Modelo público Interchange++; el coste de interchange se transmite como componente variable. citeturn0search29turn0search13 | `OFFICIAL_PRICING_MODEL`; no inventar blended rate |
| **Stripe** | Pricing local sí cambia por país y procedencia de tarjeta; por ejemplo, la página suiza muestra una estructura distinta de las páginas EEA. citeturn0search0turn0search8 | Capturar página local, nunca copiar una tasa europea global |
| **Viva.com** | Interchange++ y presencia europea amplia, pero la propia comunicación habla de 24 mercados; además, su “0 % transaction fees” funciona mediante cashback condicionado, no como acquiring gratis. citeturn8search1turn8search9turn8search33 | Guardar precio bruto, cashback aparte |
| **Checkout.com** | Pricing oficial **personalizado**, 150+ monedas y domestic coverage en 45+ países. citeturn15search4 | `OFFICIAL_PRICING_MODEL`, sin tasa numérica |
| **PayPal** | Publica merchant-fee schedules por jurisdicción; existen estructuras distintas por servicio y mercado. citeturn15search5turn15search17 | Ingesta por país/producto, no una única fila PayPal |
| **Revolut** | Hay precios públicos localizados y también acquiring enterprise basado en coste + markup negociado. citeturn8search18turn8search30 | Separar Reader/SMB de Enterprise |
| **Worldline / Nexi** | Cobertura y ofertas nacionales, pero muchas relaciones bancarias y precios son contractuales; Nexi Italia sí publica promociones y documentación de transparencia. citeturn18search23turn18search30 | Profundizar solo en países prioritarios |
| **Teya** | Mantendría proveedor en el catálogo, pero no elevaría a `OFFICIAL_MERCHANT_RATE` sin una tarifa capturada directamente de Teya para el mercado. | Cobertura/proveedor, precio pendiente |

Dos observaciones son especialmente útiles para el worker.

Primero, **“0 % fees” no siempre significa `rate=0`**. Viva explica un mecanismo por el que las comisiones pueden recuperarse mediante cashback asociado al uso de su tarjeta empresarial. Guardar una fila `0.00` falsearía CPIC y cualquier cálculo de ahorro. citeturn8search9

Segundo, los proveedores que venden Interchange++ no deben reducirse a una sola tasa. Adyen explica que con ese modelo el interchange real se repercute y desglosa; por definición, el coste resultante varía con la operación. citeturn0search13turn0search29

## Matriz investigada de los mercados

La siguiente matriz toma las monedas de tu `europeMarkets.ts`. La columna “baseline” indica **qué queda suficientemente probado hoy para iniciar investigación/benchmark**, no que todos los nombres sean legalmente activables por CAMBRA. Para evitar falsa precisión, cuando no he encontrado en este pase una tarifa pública primaria local concreta, no asigno ningún porcentaje.

| Mercado | Moneda | Baseline verificable a 13-08-2026 | Método/esquema local que merece modelo propio | Estado recomendado |
|---|---:|---|---|---|
| **FR** | EUR | SumUp, Square, myPOS, Mollie; BPCE mantiene Payplug. Crédit Agricole compró en junio de 2026 el 100 % de CAWL, corrigiendo la descripción anterior como JV 50/50 permanente. citeturn3search12turn7search2turn15search3turn18search0turn18search1 | **CB / Cartes Bancaires** publica su propio interchange y sigue siendo la red francesa líder; no mezclar CB con Visa/MC. citeturn16search0turn16search11 | **Profundizar ya** |
| **ES** | EUR | SumUp y Square ofrecen tarifas públicas locales; myPOS/Mollie dan cobertura EEA. citeturn3search9turn7search0turn15search3turn15search6 | **Bizum** ya es método comercial online y presencial; la contratación comercial se realiza a través de bancos/plataformas certificadas. citeturn16search7turn16search13 | **Profundizar ya** |
| **IT** | EUR | SumUp publica 1,95 % PAYG y 0,95 % en Plus; Nexi anuncia POS desde 0,99 % para BANCOMAT/principales circuitos en determinadas ofertas. citeturn3search6turn18search30 | **BANCOMAT/PagoBANCOMAT** mantiene estructura propia de comisiones y debe modelarse separadamente. citeturn16search1 | **Tier de entrada siguiente** |
| **PT** | EUR | SumUp publica tasa local; Mollie ofrece precio específico para MB WAY y Multibanco; SIBS opera acquiring y la red MULTIBANCO. citeturn3search3turn8search0turn16search9 | **MB WAY + MULTIBANCO**. SIBS los presenta como métodos principales de su gateway portugués. citeturn16search12turn16search15 | **Tier de entrada siguiente** |
| **GB** | GBP | SumUp, Square y myPOS tienen pricing público; myPOS diferencia domestic consumer, EEA, Amex y otras categorías. citeturn0search22turn0search30turn0search3 | No rail doméstico equivalente a CB/Dankort; el gran eje analítico es **domestic vs UK↔EEA**. citeturn1search3turn23search2 | **Tier de entrada siguiente** |
| **DE** | EUR | SumUp/myPOS/Mollie dan baseline paneuropeo. Mollie ofrece Wero y otros métodos locales. citeturn6view1turn15search3turn15search2 | **girocard** merece serie independiente: el Bundesbank concluye que girocard se encuentra entre los medios más baratos para retailers y que las redes internacionales cuestan más. citeturn4search14 | Benchmark |
| **AT** | EUR | SumUp, myPOS y Mollie confirmados por cobertura paneuropea. citeturn6view1turn15search3turn15search14 | EPS permanece como candidato local, pero no cargaría tasa sin captura primaria específica. | Benchmark |
| **BE** | EUR | SumUp, myPOS, Mollie. citeturn6view1turn15search3turn15search14 | **Bancontact** es una de las mejores anclas públicas: Bancontact Pro publica aprox. €0,06 por operación física o €0,20 online, más €18/año de servicio. citeturn4search4 | **Benchmark prioritario** |
| **NL** | EUR | SumUp, myPOS, Mollie. citeturn6view1turn15search3turn15search6 | **iDEAL→Wero**: transición ya iniciada, pero iDEAL no ha desaparecido. Los bancos neerlandeses debían conectarse a Wero desde octubre de 2026 y la transición de merchants puede prolongarse hasta finales de 2027. citeturn9search6turn9search1 | **Benchmark prioritario** |
| **IE** | EUR | SumUp, Square, myPOS y Mollie. Square confirma Irlanda como uno de sus cuatro países europeos. citeturn0search14turn7search1turn15search14 | Sin esquema doméstico de precio público equiparable a Bancontact/Dankort; usar card-acquiring + APM. | Benchmark |
| **LU** | EUR | SumUp/myPOS/Mollie. citeturn6view1turn15search3turn15search14 | No tratar Payconiq como estado permanente: **Luxemburgo está migrando Payconiq hacia Wero durante H2 2026**, con desaparición prevista de Payconiq tras la transición. citeturn9search0 | Benchmark, actualizar marca |
| **FI** | EUR | SumUp/myPOS/Mollie; Vipps MobilePay opera comercialmente en Finlandia y el resto nórdico soportado. citeturn6view1turn15search3turn17search15 | “MobilePay fusionado con Vipps” ya no debe anotarse como duda: el producto actual es **Vipps MobilePay**. citeturn17search1turn17search18 | Benchmark |
| **GR** | EUR | SumUp/myPOS/Mollie; Viva es actor nacido en Grecia con modelo Interchange++. citeturn6view1turn15search3turn8search1 | IRIS merece investigación aparte cuando GR entre en calendario; no sembraría todavía un coste sin fuente de merchant pricing. | Benchmark |
| **CY** | EUR | SumUp/myPOS/Mollie cubren el mercado. citeturn6view1turn15search3turn15search14 | JCC puede mantenerse como candidato local del catálogo, pero tarifa pendiente de captura oficial. | Benchmark |
| **MT** | EUR | SumUp/myPOS/Mollie. HSBC Malta **sigue operando y publicando actividad en 2026**; no debe marcarse simplemente como “salido”. Existe un proceso de cambio accionarial, pero no equivale a desaparición actual. citeturn6view1turn15search3turn20search6 | No hay un rail público comparable a Bancontact; priorizar PSPs paneuropeos. | Benchmark |
| **EE** | EUR | SumUp, myPOS, Mollie. citeturn6view1turn15search3turn15search6 | Banklinks/PSPs bálticos pueden permanecer en research backlog; no hace falta forzar una tasa local para el seed inicial. | Benchmark |
| **LV** | EUR | SumUp, myPOS, Mollie. citeturn6view1turn15search3turn15search6 | Tratar como cluster báltico para priors es razonable, pero no copiar tarifas de EE/LT sin igualdad de fuente y producto. | Benchmark |
| **LT** | EUR | SumUp, myPOS, Mollie. citeturn6view1turn15search3turn15search6 | **Eliminar kevin. como proveedor vigente**: Banco de Lituania revocó su licencia en septiembre de 2024 tras la apertura de insolvencia. citeturn19search0 | Benchmark; corrección obligatoria |
| **SK** | EUR | SumUp, myPOS y Mollie cubren EEE. citeturn6view1turn15search3turn15search6 | BLIK está construyendo interoperabilidad con el mercado eslovaco; la siguiente etapa anunciada para finales de 2026 conecta usuarios bancarios eslovacos con e-commerce polaco. citeturn17search7 | Benchmark |
| **SI** | EUR | SumUp, myPOS, Mollie. citeturn6view1turn15search3turn15search6 | **Nova KBM ya no debe figurar como banco independiente**: se fusionó con SKB y opera como OTP banka desde 2024. citeturn19search1turn19search5 | Benchmark; corregir catálogo |
| **HR** | EUR | SumUp, myPOS, Mollie; Revolut publica también condiciones locales de acquiring online. citeturn6view1turn15search3turn8search30 | Mantener separación card-present/online; no mezclar pricing turístico estacional con una única tasa nacional. | Benchmark |
| **BG** | EUR | SumUp, myPOS, Mollie; EUR desde 01-01-2026. citeturn6view1turn15search3turn2search6 | **BORICA/local acquiring** merece un antes/después del euro; las filas BGN antiguas deben quedar con fecha de fin y no convertirse silenciosamente en EUR. | **Research especial 2026** |
| **SE** | SEK | SumUp publica 1,49 % PAYG y 0,79 % Plus con 349 SEK/mes; myPOS/Mollie cubren también. citeturn13search3turn15search3turn15search14 | **Swish** ofrece soluciones comerciales y e-commerce propias. citeturn17search0turn17search4 | **Benchmark FX prioritario** |
| **DK** | DKK | SumUp publica 0,89 % en su oferta local; myPOS/Mollie cubren. citeturn13search6turn15search3 | **Dankort**: tarifa merchant online pública de **0,36 %**, con mínimo mensual de DKK 50 en el acuerdo online. citeturn4search3 | **Benchmark FX prioritario** |
| **NO** | NOK | SumUp: 1,49 % PAYG; Plus 0,79 % doméstica por 349 NOK/mes; myPOS/Mollie cubren EEE. citeturn14search5turn15search3 | **BankAxept**: Nets publica un componente de terminal de NOK 0,35 por transacción que baja por volumen hasta NOK 0,02; no confundirlo con MDR total. citeturn5search2 | **Benchmark FX prioritario** |
| **IS** | ISK | **No SumUp**, pero myPOS y Mollie ya declaran cobertura EEE. citeturn6view1turn15search3turn15search6 | Valitor **sí fue adquirido**: Rapyd confirma que Valitor ya forma parte de Rapyd. citeturn19search7 | Benchmark FX |
| **CH** | CHF | SumUp 1,50 % PAYG / 0,99 % Plus por CHF29; myPOS y Mollie cubren CH. Stripe publica además pricing suizo propio. citeturn12search0turn15search3turn0search0 | **TWINT** es una pieza imprescindible: la propia empresa afirma aceptación en cuatro de cada cinco tiendas y más del 84 % de tiendas online suizas. citeturn17search19 | **Benchmark FX prioritario** |
| **LI** | CHF | No SumUp; sí myPOS y Mollie porque ambos incluyen EEE. citeturn6view1turn15search3turn15search6 | Jurídicamente EEE: no heredar automáticamente tarifas CH aunque comparta CHF y ecosistema comercial. El IFR del EEE es la referencia regulatoria para su ámbito aplicable. citeturn1search1 | Benchmark FX, cluster separado de CH |
| **PL** | PLN | SumUp/myPOS/Mollie; Mollie publica pricing específico BLIK y Przelewy24. citeturn6view1turn15search3turn8search0 | **BLIK** es central: registró 2,9 mil millones de operaciones en 2025 y el e-commerce continúa siendo su canal más fuerte. Además, el programa Polska Bezgotówkowa sigue ofreciendo infraestructura subvencionada, incluso un primer año sin costes en determinados productos. citeturn17search20turn22search15 | **Benchmark FX prioritario** |
| **CZ** | CZK | SumUp, myPOS, Mollie confirmados por cobertura. citeturn6view1turn15search3turn15search6 | GoPay/Comgate pueden mantenerse como candidatos de investigación local; sin tarifa primaria capturada, no seed numérico. | Benchmark FX |
| **HU** | HUF | SumUp, myPOS y Mollie cubren el mercado. citeturn6view1turn15search3turn15search6 | Mantener un campo para impacto fiscal local, pero **no convertir el impuesto financiero en un recargo merchant fijo sin documentación contractual del adquirente**. | Benchmark FX |
| **RO** | RON | SumUp, myPOS, Mollie. citeturn6view1turn15search3turn15search6 | Netopia/PayU/euPlătesc quedan como capa local pendiente de precios primarios; no es necesario bloquear el benchmark paneuropeo. | Benchmark FX |
| **AD** | EUR | Es la excepción: no aparece en SumUp y no está dentro de la elegibilidad EEA+UK+CH declarada por myPOS/Mollie. citeturn6view1turn15search3turn15search14 | Tratar **Andorra como celda jurídica y comercial propia**, no como España. Sí participa en SEPA, pero eso no convierte al país en EEE ni prueba aplicabilidad del IFR. citeturn15search11 | `LEGAL_REVIEW_REQUIRED` + research manual |

La matriz produce un resultado muy útil para tu planificación: **no necesitas investigar 33 ecosistemas bancarios nacionales a la misma profundidad para obtener un benchmark europeo razonable**. Un primer sweep de SumUp + myPOS + Mollie, seguido por los rails domésticos que realmente rompen el modelo de tarjeta porcentual, cubre prácticamente todo el espacio. citeturn6view1turn15search3turn15search6

## Tarifas públicas que ya son suficientemente sólidas para sembrar

Estas son las filas que considero más seguras para introducir ahora como benchmark, siempre conservando literalmente las condiciones del producto. Todas deberían llevar `capturedAt = 2026-08-13`; el `effectiveFrom` solo debe rellenarse cuando la fuente publique explícitamente una fecha de entrada en vigor.

| Mercado | Proveedor / rail | Canal / condición | Precio público | Moneda | Truth level |
|---|---|---|---:|---:|---|
| FR | SumUp PAYG | presencial | **1,75 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search12 |
| FR | SumUp Payments Plus | presencial, plan €19/mes | **0,89 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search12 |
| FR | Square | presencial, EU/EEA | **1,65 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn7search2 |
| FR | Square | online, EU/EEA | **1,40 % + €0,25** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn7search2 |
| ES | SumUp PAYG | presencial | **1,49 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search9 |
| ES | SumUp Plus | consumidor doméstico, €19/mes | **0,75 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search9 |
| ES | SumUp | online | **1,95 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search9 |
| ES | Square | presencial, tarjeta EU/EEA | **1,25 % + €0,05** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn7search0 |
| ES | Square | online, tarjeta EU/EEA | **1,40 % + €0,25** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn7search0 |
| IT | SumUp PAYG | presencial | **1,95 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search6 |
| IT | SumUp Plus | presencial, €19/mes | **0,95 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search6 |
| IT | Nexi | oferta POS, BANCOMAT/principales circuitos | **desde 0,99 %** | EUR | `OFFICIAL_MERCHANT_RATE`, `PROMOTIONAL/CONDITIONAL` citeturn18search30 |
| PT | SumUp | estándar | **1,50 %** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn3search3 |
| PT | Mollie MB WAY | online | **1,50 % + €0,25** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn8search0 |
| PT | Mollie Multibanco | online | **2,10 % + €0,35** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn8search0 |
| GB | SumUp PAYG | presencial | **1,69 %** | GBP | `OFFICIAL_MERCHANT_RATE` citeturn0search30 |
| GB | SumUp Plus | tarjeta doméstica, £19/mes | **0,99 %** | GBP | `OFFICIAL_MERCHANT_RATE` citeturn0search22 |
| GB | SumUp | online | **2,50 %** | GBP | `OFFICIAL_MERCHANT_RATE` citeturn0search22 |
| GB | myPOS | presencial, consumidor doméstico, <£10k/mes | **1,10 % + £0,07** | GBP | `OFFICIAL_MERCHANT_RATE` citeturn0search3 |
| GB | myPOS | presencial, consumidor EEA | **2,20 % + £0,07** | GBP | `OFFICIAL_MERCHANT_RATE` citeturn0search3 |
| GB | myPOS | online, consumidor doméstico | **1,30 % + £0,15** | GBP | `OFFICIAL_MERCHANT_RATE` citeturn0search3 |
| BE | Bancontact Pro | tienda | **€0,06/tx** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn4search4 |
| BE | Bancontact Pro | online | **€0,20/tx** | EUR | `OFFICIAL_MERCHANT_RATE` citeturn4search4 |
| BE | Bancontact Pro | fee de servicio | **€18/año** | EUR | `OFFICIAL_FIXED_FEE` citeturn4search4 |
| DK | SumUp | presencial estándar | **0,89 %** | DKK | `OFFICIAL_MERCHANT_RATE` citeturn13search6 |
| DK | Dankort | online | **0,36 %**, mínimo DKK50/mes | DKK | `OFFICIAL_MERCHANT_RATE` citeturn4search3 |
| NO | SumUp PAYG | presencial | **1,49 %** | NOK | `OFFICIAL_MERCHANT_RATE` citeturn14search5 |
| NO | SumUp Plus | doméstica, NOK349/mes | **0,79 %** | NOK | `OFFICIAL_MERCHANT_RATE` citeturn14search5 |
| NO | Nets / BankAxept | componente de transacción de terminal | **NOK0,35 → NOK0,02 según volumen** | NOK | `OFFICIAL_COMPONENT_RATE`, no MDR citeturn5search2 |
| SE | SumUp PAYG | presencial | **1,49 %** | SEK | `OFFICIAL_MERCHANT_RATE` citeturn13search3 |
| SE | SumUp Plus | presencial, 349 SEK/mes | **0,79 %** | SEK | `OFFICIAL_MERCHANT_RATE` citeturn13search3 |
| CH | SumUp PAYG | presencial | **1,50 %** | CHF | `OFFICIAL_MERCHANT_RATE` citeturn12search0 |
| CH | SumUp Plus | presencial, CHF29/mes | **0,99 %** | CHF | `OFFICIAL_MERCHANT_RATE` citeturn12search0 |
| CH | Stripe | tarjetas domésticas suizas | **2,90 % + CHF0,30** | CHF | `OFFICIAL_MERCHANT_RATE` citeturn0search0 |
| CH | Stripe | tarjetas internacionales | **3,25 % + CHF0,30** | CHF | `OFFICIAL_MERCHANT_RATE` citeturn0search0 |
| PL | Mollie BLIK | online | **1,60 % + €0,25** | EUR* | `OFFICIAL_MERCHANT_RATE` citeturn8search0 |
| PL | Mollie Przelewy24 | online | **2,20 % + €0,25** | EUR* | `OFFICIAL_MERCHANT_RATE` citeturn8search0 |

\*Esta última pareja ilustra por qué `settlementCurrency` y `marketCurrency` deben ser campos distintos: una oferta paneuropea puede publicar el precio de un método polaco en EUR aunque el mercado sea PLN. **No convertiría esa fila a PLN en la ingestión.** Mantendría la moneda de la tarifa tal como la publica la fuente y realizaría cualquier proyección posterior mediante `FxSnapshot`.

Hay otras dos clases de filas que sí conviene sembrar, pero **en tablas distintas de merchant pricing**:

| Scope | Valor | Clasificación correcta |
|---|---:|---|
| EEA consumer debit | **0,20 % máx. interchange** | `REGULATORY_CAP` citeturn1search0 |
| EEA consumer credit | **0,30 % máx. interchange** | `REGULATORY_CAP` citeturn1search0 |
| UK domestic consumer debit | **0,20 % máx. interchange** | `REGULATORY_CAP` citeturn1search5turn23search2 |
| UK domestic consumer credit | **0,30 % máx. interchange** | `REGULATORY_CAP` citeturn1search5turn23search2 |
| UK↔EEA CNP consumer debit, nivel documentado por PSR | **1,15 %** | `SCHEME_INTERCHANGE_BENCHMARK` citeturn1search3 |
| UK↔EEA CNP consumer credit, nivel documentado por PSR | **1,50 %** | `SCHEME_INTERCHANGE_BENCHMARK` citeturn1search3 |
| iDEAL 2026 | **€0,0070 + €0,0015 routing incremental** | `OFFICIAL_SCHEME_RATE`, **no merchant price** citeturn4search1 |

Esa distinción evita uno de los errores más peligrosos para CPIC: comparar, por ejemplo, un **1,49 % all-in de SumUp** con un **0,20 % IFR** y concluir que el “margen evitable” es 129 bps. El segundo importe no incluye scheme fees, acquiring, terminal, fixed fees ni servicios asociados. citeturn3search9turn23search7

## Correcciones al inventario inicial y señales de 2026

Hay varias entradas del texto inicial que conviene corregir directamente en el repo o, como mínimo, en los comentarios de research.

**Crédit Agricole–Worldline en Francia ha cambiado muy recientemente.** El 30 de junio de 2026 Crédit Agricole completó la adquisición del 100 % de CAWL. Worldline continúa aportando soluciones de acceptance, pero ya no es preciso describir CAWL simplemente como una JV conjunta de acquiring en los mismos términos anteriores. citeturn18search1

**Square: tu cobertura era correcta.** La documentación de Square señala que la aceptación de pagos está disponible en Estados Unidos, Canadá, Australia, Japón y, en Europa, Reino Unido, Irlanda, Francia y España. Por tanto, no debe extrapolarse Square a Italia o Portugal al construir el pase paneuropeo. citeturn7search1

**SumUp: “prácticamente los 33” es demasiado amplio.** El selector actual cubre 30 mercados de tu lista, pero no IS, LI ni AD. Esa diferencia importa porque precisamente Islandia y Liechtenstein son EEE y pueden cubrirse con myPOS/Mollie, mientras Andorra queda fuera de ambos patrones. citeturn6view1turn15search3

**Mollie se ha vuelto mucho más paneuropeo de lo que su reputación histórica BeNeLux sugiere.** El 18 de junio de 2026 anunció cobertura de los 30 mercados EEE; su documentación incluye además Suiza y Reino Unido. Para el worker ya no lo trataría solo como proveedor de NL/BE/DE/FR. citeturn15search6turn15search14

**Lithuania: kevin. debe salir de la lista de proveedores vigentes.** Banco de Lituania revocó la licencia de Kevin EU en septiembre de 2024 tras constatar dificultades financieras graves y la apertura de insolvencia. Puede conservarse históricamente para análisis competitivo, pero no como provider activo. citeturn19search0

**Slovenia: Nova KBM está obsoleto como nombre de entidad actual.** Nova KBM y SKB se fusionaron en agosto de 2024 y la entidad resultante opera como OTP banka; la integración operacional se completó en septiembre de 2024. citeturn19search1turn19search5

**Islandia: la compra de Valitor no está pendiente.** Rapyd confirma que Valitor forma actualmente parte de Rapyd. La nota del repo debería pasar de “verificar” a “Rapyd/Valitor”, dejando aparte cualquier análisis competitivo o regulatorio histórico. citeturn19search7

**Malta: no marcar HSBC como “salido” todavía.** HSBC Bank Malta mantenía sitio de banca empresarial activo en julio de 2026 y figura aún como entidad del grupo; la existencia de una operación corporativa sobre la participación no equivale a que HSBC haya dejado ya de operar en el mercado. citeturn20search6

**Países Bajos: iDEAL tampoco ha desaparecido.** A 13 de agosto de 2026 la transformación a Wero está en marcha: EPI comunicó que la conexión de todos los bancos emisores neerlandeses estaba prevista para octubre de 2026, mientras la transición completa de merchants se extiende hasta finales de 2027. En el modelo haría `IDEAL` y `WERO` coexistentes con ventanas de vigencia, no un rename inmediato. citeturn9search6turn9search1

**Luxemburgo tiene una migración parecida, pero más inmediata.** Wero indica que Payconiq se sustituye por fases durante la segunda mitad de 2026; por ello una fila `PAYCONIQ_LU` capturada hoy necesita una caducidad agresiva. citeturn9search0

**Polonia realmente tiene una distorsión de coste de entrada.** Fundacja Polska Bezgotówkowa sigue activa en 2026 y anuncia terminal, terminal en teléfono o gateway online sin coste durante el primer año dentro de su programa para empresas elegibles. Ese subsidio no debería modificar la tasa estructural del adquirente: modelaría un `MerchantIncentive` con plazo, porque convertirlo en MDR=0 contaminaría el prior de Polonia después de que expire la ayuda. citeturn22search1turn22search15

**Suiza necesita investigación regulatoria propia y continua.** COMCO/WEKO mantiene un corpus específico y reciente para interchange de débito Visa/Mastercard y para pagos transfronterizos desde el EEE. Esto valida tu decisión de no extrapolar IFR a CH. citeturn22search2turn22search4

## Diseño recomendado para `PaymentsRateTable` y caducidad

Con esta investigación, el objeto mínimo que usaría no sería una fila `{country, provider, rate}`. Ese modelo pierde demasiada información justo en los mercados que más interesan a CAMBRA.

Una fila útil debería conservar, como mínimo, estas dimensiones conceptuales:

```ts
type TruthLevel =
  | "OFFICIAL_MERCHANT_RATE"
  | "OFFICIAL_SCHEME_RATE"
  | "REGULATORY_CAP"
  | "OFFICIAL_PRICING_MODEL"
  | "OFFICIAL_COVERAGE"
  | "PROVISIONAL";

type PaymentChannel = "CARD_PRESENT" | "ECOMMERCE" | "MOTO" | "OMNICHANNEL";
type CardClass = "CONSUMER" | "COMMERCIAL" | "PREMIUM" | "UNKNOWN";
type CardOrigin =
  | "DOMESTIC"
  | "EEA"
  | "UK"
  | "NON_EEA"
  | "INTERNATIONAL"
  | "UNKNOWN";

interface PaymentRateResearchRow {
  market: string;
  provider: string;
  product?: string;
  paymentMethod?: string;

  channel: PaymentChannel;
  cardClass?: CardClass;
  cardOrigin?: CardOrigin;

  percentFee?: number;
  fixedFeeMinor?: number;
  fixedFeeCurrency?: string;

  monthlyFeeMinor?: number;
  monthlyFeeCurrency?: string;

  // Importante: moneda en la que LA FUENTE publica/cobra la tarifa,
  // que no tiene por qué coincidir con la moneda principal del mercado.
  nativeRateCurrency: string;

  truthLevel: TruthLevel;
  sourceType:
    | "PROVIDER"
    | "SCHEME"
    | "REGULATOR"
    | "CENTRAL_BANK"
    | "OTHER_OFFICIAL";

  sourceCapturedAt: string;
  effectiveFrom?: string;
  effectiveTo?: string;

  requiresFxSnapshot: boolean;
  promotional?: boolean;
  conditional?: boolean;

  notes?: string;
}
```

La necesidad de `cardOrigin` no es teórica: myPOS UK publica **1,10 % + £0,07 para consumer doméstica** frente a **2,20 % + £0,07 para consumer EEA**; Square España distingue tarjetas EEA de no-EEA; y la regulación británica distingue UK domestic de UK↔EEA. Sin esa dimensión el benchmark británico resultaría materialmente incorrecto. citeturn0search3turn7search0turn23search2

También añadiría una tabla separada para costes de scheme/regulación:

```ts
interface SchemeRate {
  scheme: "VISA" | "MASTERCARD" | "CB" | "GIROCARD" | "DANKORT" | "BANKAXEPT" | string;
  regionFrom: string;
  regionTo: string;
  channel: PaymentChannel;
  cardClass: CardClass;
  cardType?: "DEBIT" | "CREDIT";
  percentFee?: number;
  fixedFeeMinor?: number;
  currency?: string;
  truthLevel: "OFFICIAL_SCHEME_RATE" | "REGULATORY_CAP";
  capturedAt: string;
  effectiveFrom?: string;
}
```

Visa y Mastercard mantienen precisamente páginas oficiales para esos schedules; por tanto, son mejores candidatos para un `schemeRateResearchWorker` independiente que para mezclarlos con Stripe/SumUp en el mismo scraper. citeturn23search0turn23search1

Para **métodos de precio fijo**, no calcularía el equivalente porcentual al ingerir. Bancontact, iDEAL y algunos componentes de BankAxept muestran por qué: el coste porcentual efectivo depende del ticket. citeturn4search4turn4search1turn5search2 Por ejemplo, €0,20 sobre un ticket de €10 equivale al 2 %, mientras que sobre €100 equivale al 0,20 %. Esa conversión pertenece al Analyzer con el ticket observado/estimado, no al registro de la tarifa.

Para **planes con cuota mensual**, la misma regla: SumUp Plus España no es simplemente “0,75 %”; exige €19/mes y aplica condiciones sobre el tipo de tarjeta. El cálculo de CPIC debe amortizar la cuota por el volumen/transacciones del merchant. citeturn3search9

Para **promociones y subsidios**, añadiría `effectiveTo` o `promotional=true`. Nexi publica promociones con fechas explícitas y Polska Bezgotówkowa subsidia temporalmente la aceptación; ninguno de los dos debe transformarse en un prior estructural permanente. citeturn18search11turn22search15

Finalmente, mantendría tu gate FX, con una pequeña precisión conceptual: la decisión de si una fila necesita `FxSnapshot` debe depender de **la moneda de la tarifa que realmente entra en el cálculo**, no solo de la moneda principal del país. Un método polaco puede estar tarifado por un PSP en EUR; una tarifa en PLN sí requerirá PLN→moneda del Analyzer. Mollie demuestra precisamente que método, mercado y moneda de pricing no siempre coinciden. citeturn8search0

Con ello, el orden óptimo de ejecución queda:

**FR y ES**: revalidar y completar ahora, porque ya existen varias tarifas oficiales comparables y son los únicos mercados activos según tu marco. SumUp + Square proporcionan inmediatamente varios puntos de referencia independientes. citeturn3search9turn3search12turn7search0turn7search2

**IT, PT y GB**: ya hay suficiente pricing público para dejar preparada la infraestructura sin activar países. Italia dispone de SumUp y Nexi; Portugal de SumUp, MB WAY/Multibanco y SIBS; UK ofrece la muestra más rica por segmentación doméstica/EEA gracias a SumUp y myPOS. citeturn3search6turn18search30turn3search3turn16search12turn0search3

**Tier benchmark**: priorizaría no cinco sino **siete anclas**: CB, girocard, Bancontact, iDEAL/Wero, Dankort, BankAxept y TWINT. Las primeras seis explican diferencias estructurales de coste frente a Visa/Mastercard; TWINT añade el principal caso extracomunitario de wallet doméstica dentro de tu ICP europeo. citeturn16search0turn4search14turn4search4turn9search1turn4search3turn5search2turn17search19

Y para la caducidad no usaría un único `N meses`. Aplicaría ventanas según clase de dato: **pricing promocional y APM en transición, muy corto; merchant rates públicos, medio; caps legales, largo pero monitorizado; coverage/provider ownership, revisión periódica**. Los cambios de CAWL en junio de 2026, la expansión de Mollie en junio de 2026 y la transición iDEAL/Wero muestran que incluso datos que parecían estructurales pueden cambiar en pocos meses. citeturn18search1turn15search6turn9search6

La conclusión práctica para CAMBRA es que el Bloque de tarifas puede alcanzar ya una base bastante más sólida de lo que sugiere una investigación banco-por-banco: **32/33 mercados tienen al menos dos PSP paneuropeos cuya presencia está oficialmente acreditada, 30/33 aparecen en el selector actual de SumUp, y los mercados más importantes para el roadmap cuentan ya con tarifas merchant públicas directamente utilizables**. citeturn6view1turn15search3turn15search6 El trabajo costoso debería concentrarse ahora en FR/ES, en normalizar correctamente las dimensiones de precio y en capturar los rails domésticos que realmente alteran la economía del pago; no en completar por fuerza una falsa precisión bancaria para los 33 mercados.