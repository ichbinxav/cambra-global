# Bloque 5 — GTM, deliverability y proof-of-demand para 33 mercados europeos

## Alcance y conclusiones ejecutivas

Para hacer reproducible “toda Europa, 33 países”, tomo como universo comercial **UE-27 + EFTA-4 + Reino Unido + Turquía = 33 mercados**. Es una definición operativa para este GTM, no una afirmación de que Europa tenga solamente 33 países. El perímetro queda así: Austria, Bélgica, Bulgaria, Croacia, Chipre, Chequia, Dinamarca, Estonia, Finlandia, Francia, Alemania, Grecia, Hungría, Irlanda, Italia, Letonia, Lituania, Luxemburgo, Malta, Países Bajos, Polonia, Portugal, Rumanía, Eslovaquia, Eslovenia, España, Suecia, Islandia, Liechtenstein, Noruega, Suiza, Reino Unido y Turquía.

La conclusión más importante para el plan septiembre-diciembre es que **no conviene tratar esos 33 países como 33 motions comerciales separados**. EuroCommerce ya articula asociaciones nacionales de retail en 28 países europeos, con organizaciones locales que sirven de fuente de cuentas; su listado actual permite construir seeds directamente en 27 de los 33 mercados de este scope sin empezar de cero. citeturn17search1turn20view1

En deliverability, la baseline de 2026 debe ser **SPF + DKIM + DMARC alineado en todos los dominios de outbound desde el primer día**, aunque el volumen esté por debajo del umbral formal de Google o Microsoft. Google aplica reglas adicionales aproximadamente a partir de 5.000 mensajes diarios dirigidos a cuentas personales de Gmail; Microsoft define high-volume como más de 5.000 mensajes diarios a sus servicios Outlook para consumidores. Yahoo no publica en las páginas actuales verificadas un umbral diario equivalente tan explícito, pero sí impone requisitos de bulk sender. citeturn19search0turn19search2turn18search1turn18search0

Hay además una corrección importante respecto a información antigua que circula todavía: **Yahoo sí publica actualmente un límite de quejas inferior al 0,3%**. No debe utilizarse la afirmación “Yahoo no fija umbral numérico”. citeturn18search0

Para el proof-of-demand, las mejores concentraciones verificadas entre septiembre y diciembre son París, Colonia, Londres, Madrid, Bruselas, Viena, Vilna, Malmö, Zagreb, Sofía, Atenas, Lisboa y París de nuevo a final de noviembre. Varias ferias compiten exactamente por las mismas fechas, así que intentar “ir a todo” con un solo fundador sería contraproducente: DMEXCO y eCommerce Expo London coinciden el 23–24 de septiembre; varios eventos CEE ocurren también alrededor del 23–24; y E-SHOW Madrid y eCommerce & Digital Marketing World Athens coinciden el 4 de noviembre. citeturn21search2turn26search17turn21search1turn26search20

Mi recomendación de GTM es, por tanto, **33 países en targeting digital, 8–12 mercados con campañas localizadas y solamente 5–7 eventos físicos “anchor”**, utilizando asociaciones, exhibitor lists, speakers, sponsors y señales tecnográficas para llenar el pipeline alrededor de cada cita.

## Requisitos de deliverability vigentes en 2026

### Lo que Google, Yahoo y Microsoft exigen hoy

| Requisito | Google Gmail | Yahoo/AOL | Microsoft Outlook consumer |
|---|---|---|---|
| Umbral bulk/high-volume | Aproximadamente **5.000 mensajes/día a cuentas personales Gmail**. citeturn19search0turn19search2 | Yahoo habla de bulk/significant-volume senders en su Sender Hub; en la documentación verificada no aparece un número diario equivalente a 5.000. citeturn18search0turn18search2 | **Más de 5.000 mensajes/día** a servicios Outlook de consumidor. citeturn18search1turn18search3 |
| SPF | Todos los remitentes: SPF o DKIM; bulk: **SPF y DKIM**. citeturn19search0turn19search2 | Bulk: autenticación reforzada; Sender Hub incluye SPF/DKIM dentro de requisitos. citeturn18search0 | **Debe pasar SPF** para el sending domain. citeturn18search1turn18search3 |
| DKIM | Bulk: **obligatorio junto con SPF**. citeturn19search0turn19search2 | Bulk: requerido dentro de la combinación de autenticación publicada por Yahoo. citeturn18search0 | **Debe pasar DKIM**. citeturn18search1turn18search3 |
| DMARC | Bulk: publicar DMARC, como mínimo `p=none`, y conseguir alineación del From mediante SPF o DKIM. citeturn19search0turn19search6 | Bulk: DMARC forma parte de los requisitos actuales de Yahoo. citeturn18search0 | **DMARC mínimo `p=none`**, alineado con SPF o DKIM, preferentemente ambos. citeturn18search1turn18search3 |
| One-click unsubscribe | Obligatorio para mensajes de marketing/subscription de bulk senders, mediante el mecanismo List-Unsubscribe/one-click. citeturn19search0turn19search2 | **Sí**, para promotional/marketing mail; Yahoo aclara que no aplica igual a transactional mail. citeturn18search0turn18search2 | Microsoft exige/recomienda actualmente un **functional unsubscribe** visible dentro de sus hygiene practices; la página high-volume verificada no formula un mandato específico RFC 8058 equivalente al de Google/Yahoo. citeturn18search1turn18search3 |
| Quejas/spam | Mantenerse por debajo de **0,3%**; Google recomienda trabajar sensiblemente por debajo y evitar llegar nunca a 0,3%. citeturn19search6turn19search9 | **Por debajo de 0,3%**. citeturn18search0 | La página high-volume de Microsoft verificada no publica un ceiling porcentual análogo; sí insiste en higiene, bajas y complaints. citeturn18search1turn18search3 |
| DNS/PTR/TLS/formato | Gmail exige prácticas técnicas adicionales como DNS inverso válido, TLS y mensajes RFC-conformes. citeturn19search0turn19search6 | Yahoo incluye DNS forward/reverse y buenas prácticas técnicas en Sender Hub. citeturn18search0 | El anuncio high-volume se concentra en SPF/DKIM/DMARC y añade higiene, From/Reply-To válido y unsubscribe. citeturn18search1turn18search3 |
| Consecuencia 2026 | Desde **noviembre de 2025**, Gmail intensificó la aplicación contra tráfico no conforme, incluyendo deferrals y rechazos temporales/permanentes. citeturn19search6turn19search3 | Enforcement activo de las reglas de bulk sender del Sender Hub. citeturn18search0turn18search2 | Los fallos de autenticación de high-volume están asociados a `550 5.7.515`; Microsoft inició el enforcement el 5 de mayo de 2025. citeturn18search3 |

Dos precisiones son críticas para no diseñar mal el stack.

Primero, el threshold publicado por Google se refiere a **cuentas personales Gmail**, no a cualquier empresa que utilice Google Workspace. La propia documentación/FAQ de Gmail distingue el ámbito de las sender guidelines para cuentas personales. Esto reduce la probabilidad de que un outbound estrictamente B2B alcance 5.000 Gmail personales diarios, pero **no justifica operar sin SPF, DKIM o DMARC**. citeturn19search2turn19search6

Segundo, el one-click que Google/Yahoo esperan no debe confundirse con poner simplemente un enlace “unsubscribe” en el footer. Para la implementación técnica segura, los mensajes de marketing deben salir con headers equivalentes a:

```text
List-Unsubscribe: <https://dominio.example/unsubscribe/...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

y además tener una baja visible y sencilla para el destinatario. Google y Yahoo describen expresamente el mecanismo one-click para mensajes promocionales/de suscripción. citeturn19search0turn18search0turn18search2

### Gate que convertiría en el requisito manual de deliverability

Antes de permitir una sola CommercialCampaign a escala, implementaría un **hard gate**:

**DNS/auth → header test → reputation → launch.**

En DNS, SPF debe pasar; DKIM debe pasar; DMARC debe existir como mínimo en `p=none` y el dominio visible en `From:` debe alinear con SPF y/o DKIM. En Microsoft, estos tres elementos son precisamente la condición high-volume publicada; Microsoft recuerda además que SPF puede fallar si la configuración supera el límite de diez DNS lookups. citeturn18search1turn18search3

Después haría un mensaje real a cuentas seed Gmail, Yahoo y Outlook y comprobaría el raw source: `spf=pass`, `dkim=pass`, `dmarc=pass`, TLS, From correcto y ambos headers de unsubscribe. **No asumiría que Instantly, Apollo o el ESP generan automáticamente el one-click solo porque la plantilla tenga un enlace de baja.**

Para Gmail, registraría los dominios en Postmaster Tools y utilizaría **<0,1% como operating target interno y 0,3% como zona roja absoluta**, dado que las guías actuales recomiendan mantenerse sustancialmente por debajo del máximo. citeturn19search6turn19search9

Para Yahoo, el control es aún más claro: la cifra publicada que debe alimentar el requisito es **<0,3%**, no “sin límite conocido”. citeturn18search0

Para Microsoft, además de buscar `550 5.7.515`, monitorizaría junking/rejections y no convertiría la ausencia de un complaint ceiling porcentual publicado en licencia para tolerar quejas. Microsoft insiste expresamente en list hygiene, bounce management, prácticas transparentes y unsubscribe funcional. citeturn18search1turn18search3

Finalmente, **no utilizaría rotación de dominios como técnica para evadir los thresholds de los mailbox providers**. Si se separa infraestructura de outbound del correo corporativo, debe ser para compartimentar riesgo operativo y reputacional, manteniendo exactamente las mismas reglas de autenticación, baja y calidad en cada dominio.

## Calendario europeo septiembre-diciembre 2026

Las fechas siguientes se han investigado con corte de **13 de agosto de 2026**. Cuando pude confirmar una fecha en la web del propio organizador, la trato como “confirmada”. Cuando no encontré una cita local comparable respaldada por fuente oficial durante septiembre-diciembre, no invento una: indico un **hub regional** para cubrir ese país.

| País | Cita sept–dic 2026 verificada / cobertura recomendada | Prioridad GTM |
|---|---|---|
| **Austria** | **EXVOMO E-Commerce Inspiration Summit**, Viena, **7 octubre 2026**; la web oficial lo presenta como conferencia e-commerce austríaca con unas 400 inscripciones. citeturn23search28 | **A** |
| **Bélgica** | **Retail Marketing Day**, Bruselas, **24 septiembre**; y **RetailDetail Night**, Bruselas, **19 noviembre**. RetailDetail publica ambas fechas 2026. citeturn23search33turn23search25 | **A** |
| **Bulgaria** | **eCA Conference**, Sofia Tech Park, **15 octubre 2026**; alternativamente eCommerce Annual Summit el 6 de octubre. citeturn23search18turn23search2 | **A** |
| **Croacia** | **CRO Commerce**, Zagreb, **13 octubre 2026**, organizado por eCommerce Hrvatska y dedicado a online retailers. citeturn23search3turn23search19 | **A** |
| **Chipre** | No cierro una fecha local Q4 como “confirmada” con el estándar de fuente exigido. Hub recomendado: **eCommerce & Digital Marketing World**, Atenas, **4 noviembre**. citeturn26search20 | Regional |
| **Chequia** | **Czech Retail Days**, Praga, **5–6 noviembre 2026**. citeturn6search0 | **A** |
| **Dinamarca** | **E-handelskonferencen**, Copenhague, **8 octubre 2026**, de Dansk Erhverv. citeturn4search0 | **A** |
| **Estonia** | Para Q4 usaría como hub báltico **EcomExpo**, Vilna, **1 octubre**, antes que inventar una cita local de igual señal. citeturn5search0turn26search17 | Regional |
| **Finlandia** | La nueva **Click Commerce** oficial de Helsinki se celebró **11–12 marzo 2026**, fuera del periodo pedido. Para Q4 utilizaría **eTail Nordic, Malmö, 20–21 octubre**. citeturn26search5turn26search19 | Regional |
| **Francia** | **NRF Retail's Big Show Europe**, París, **15–17 septiembre**; y **Tech for Retail**, París, **30 noviembre–1 diciembre**. Ambas fechas están publicadas por los organizadores. citeturn21search0turn22search0turn22search2 | **A+** |
| **Alemania** | **DMEXCO**, Colonia, **23–24 septiembre**, y **Retail NXT**, Bad Vilbel, **30 septiembre–1 octubre**. citeturn21search2turn21search5turn26search12 | **A+** |
| **Grecia** | **15th eCommerce & Digital Marketing World**, Atenas, **4 noviembre 2026**, con tracks de eCommerce, digital marketing y retail tech. citeturn26search20 | **A** |
| **Hungría** | **XXII E-Commerce Conference**, Budapest, **8 septiembre 2026**. citeturn6search6 | **A** |
| **Irlanda** | **Irish eCommerce Awards**, Dublín, **18 septiembre 2026**. Es más ecosystem/networking que trade show, pero sirve para account discovery. citeturn9search32 | B |
| **Italia** | **Ecommerce Tech Summit**, Milán, **20 octubre 2026**; el calendario europeo actual confirma la cita y Casaleggio Associati la organiza. citeturn9search18turn26search3 | **A** |
| **Letonia** | **RIGA COMM**, Riga, **8–9 octubre 2026**, con contenido de digital business/e-commerce. citeturn5search21 | B/A |
| **Lituania** | **EcomExpo**, Vilna, **1 octubre 2026**; evento dedicado al ecosistema e-commerce báltico. citeturn5search0turn26search17 | **A** |
| **Luxemburgo** | No he fijado una feria local Q4 de señal comparable. El hub más eficiente es Bruselas: **RetailDetail Night, 19 noviembre**. citeturn23search25 | Regional |
| **Malta** | No he podido validar con fuente oficial suficiente una feria e-commerce local Q4. Utilizaría **Web Summit Lisboa, 9–12 noviembre**, como hub tecnológico, no como sustituto perfecto de una feria retail. citeturn26search24 | Regional |
| **Países Bajos** | **DMWF Europe**, Ámsterdam, **24–25 noviembre 2026**, como cita digital/commercial adyacente; para puro e-commerce la alternativa regional es el ecosistema Benelux. citeturn10search22 | B |
| **Polonia** | **Global Check-in**, Varsovia, **23 septiembre 2026**, centrado en cross-border e-commerce. citeturn5search31 | A/B |
| **Portugal** | **Web Summit**, Lisboa, **9–12 noviembre 2026**. Es generalista de tecnología, no exclusivamente retail, pero ofrece densidad empresarial muy superior a inventar una feria e-commerce local no verificada. citeturn26search24 | B |
| **Rumanía** | **eCommerce Talks**, Bucarest, **24 septiembre 2026**. citeturn6search23 | **A** |
| **Eslovaquia** | No cierro una cita local Q4 comparable. Hub operativo: **Czech Retail Days, Praga, 5–6 noviembre**. citeturn6search0 | Regional |
| **Eslovenia** | No cierro una fecha local Q4 de igual calidad de evidencia. Hub regional: **CRO Commerce, Zagreb, 13 octubre**. citeturn23search3 | Regional |
| **España** | **E-SHOW Madrid**, IFEMA, **4–5 noviembre 2026**. La página oficial ya publica programa 2026 y ponentes/retailers. citeturn21search1turn21search4 | **A+** |
| **Suecia** | **eTail Nordic**, Malmö, **20–21 octubre 2026**; WBR lo presenta como encuentro de e-commerce, digital marketing y omnichannel nórdico. citeturn26search19 | **A** |
| **Islandia** | Sin una feria local Q4 comparable validada, trataría Islandia dentro del Nordic cluster y usaría **eTail Nordic, Malmö, 20–21 octubre**. citeturn26search19 | Regional |
| **Liechtenstein** | Cubrir mediante Suiza/DACH. La cita de mayor afinidad es el **GDI International Retail Summit**, Suiza, **16–17 septiembre 2026**. citeturn9search19 | Regional |
| **Noruega** | Para calendario comprometido utilizaría el hub nórdico **eTail Nordic, 20–21 octubre**; no elevaría a “confirmada” una cita noruega si la evidencia disponible procede solo de páginas de partners. citeturn26search19 | Regional |
| **Suiza** | **76th International Retail Summit / GDI**, **16–17 septiembre 2026**. citeturn9search19 | **A** |
| **Reino Unido** | **eCommerce Expo London**, ExCeL, **23–24 septiembre 2026**, uno de los grandes eventos europeos dedicados a e-commerce. citeturn9search0turn26search17 | **A+** |
| **Turquía** | WORLDEF mantiene activo en 2026 su ecosistema oficial internacional de e-commerce/retail, pero la búsqueda actual no me permitió fijar una fecha Istanbul sept–dic suficientemente sólida sin contradicciones entre fuentes. **No pondría una fecha en el calendario cerrado hasta que WORLDEF la publique inequívocamente en su web oficial.** citeturn26search0turn26search4 | Watchlist |

### Qué eventos sí compraría para proof-of-demand

**París, 15–17 septiembre — NRF** es probablemente el test inicial de mayor calidad. El organizador espera unos **12.000 profesionales, 525 expositores y 100+ sesiones**, con business meetings explícitamente orientados a conectar retailers, brands y solution providers. citeturn21search6turn21search17

**Colonia, 23–24 septiembre — DMEXCO** aporta digital commerce, tecnología y grandes marcas y tiene un ecosistema formal de exposición y networking. citeturn21search2turn21search14

**Vilna, 1 octubre — EcomExpo** es la forma barata de testar Baltics/CEE con un único desplazamiento, mientras que **Malmö, 20–21 octubre — eTail Nordic** concentra los mercados nórdicos. citeturn26search17turn26search19

**Madrid, 4–5 noviembre — E-SHOW** sería imprescindible para Iberia: el programa publicado ya incluye compañías como Tradeinn, Puma y Alessi y sesiones explícitas de rentabilidad, e-commerce y eficiencia. citeturn21search4

**París, 30 noviembre–1 diciembre — Tech for Retail** es el cierre ideal: la organización anuncia más de 420 expositores, 15.000 visitantes y 200 conferencias, y su programa está orientado a herramientas digitales para retail físico y online. citeturn22search0turn22search3

No intentaría físicamente Londres y Colonia el 23–24 de septiembre con una sola persona, ni Madrid y Atenas el 4 de noviembre. Es mejor convertir uno en field event y el otro en **event-triggered outbound**.

## ICP y targeting real para Instantly y Apollo

### Qué puede filtrar realmente SuperSearch en 2026

SuperSearch ya permite combinar **job title/seniority, ubicación, industria/keywords, company size, revenue, domains, job listings, tecnologías detectadas en la web, señales, noticias y funding**; el filtro Technologies busca tecnología presente en el website y Signals incorpora actividad, buying intent, crecimiento y acontecimientos corporativos. citeturn17search10turn17search2

Las Signals se ampliaron en abril de 2026 para detectar acontecimientos como **job changes, funding, product launches, public pain points y website updates**, incluyendo contexto que se puede usar para personalizar mensajes. citeturn17search2

Apollo, por su parte, actualizó su documentación de filtros el 31 de julio de 2026. Permite combinar filtros de empresa y persona, buying intent, job titles, management level, departments/functions, job postings y otros atributos; además, sus filtros se combinan con lógica AND entre categorías y OR dentro de una misma categoría. citeturn17search3turn17search7

El punto clave no es “sacar una lista de retailers”. El ICP real para optimización de costes de pago es:

> **Merchant con checkout propio + suficiente payment volume + capacidad de negociar PSP/acquirer + persona financiera/payments accesible + indicio de complejidad suficiente para que 5–30 bps de mejora sean económicamente relevantes.**

Un seller que solo vende dentro de un marketplace es, por tanto, un **seed de descubrimiento**, pero no necesariamente un ICP: si el marketplace controla el checkout y el acquiring, el seller no controla la estructura de coste que queremos optimizar.

### Verticales que priorizaría

| Vertical | Señal de ICP | Búsqueda inicial |
|---|---|---|
| Fashion, footwear, accessories | Alto volumen online, cross-border, devoluciones, varios países/métodos | Apparel & Fashion + Retail; 50–5.000 empleados; ecommerce tech |
| Beauty/cosmetics | D2C + retail omnichannel, repeat purchase | Cosmetics/Beauty/Consumer Goods + ecommerce |
| Home/furniture/decor | Tickets altos y negocio cross-border | Furniture/Home Furnishings/Retail |
| Consumer electronics | Ticket alto, múltiples tender types y fraude | Consumer Electronics/Retail |
| Sports/outdoor | Muchas marcas D2C y omnichannel | Sporting Goods/Retail |
| Generalist retail/FMCG | Gran throughput y omnichannel | Retail/Grocery/Consumer Goods |
| Pure-play D2C/e-commerce | Checkout bajo control directo | Keywords `ecommerce`, `online store`, `D2C`, `direct-to-consumer` |
| Marketplaces | Muy atractivo solo si el propio marketplace es el merchant/acquirer; sellers se usan para descubrir D2C paralelo | Keywords `marketplace`, `platform`, `online marketplace` |
| Travel/ticketing/subscription | Segunda ola: pagos recurrentes, multi-currency y autorización son muy sensibles | Travel, ticketing, subscription/digital |

PaymentGenes identifica precisamente como KPIs de merchant payment optimization el acceptance cost, scheme/processing fees, fraud y authorization rates, y su benchmark utiliza datos de más de 3.000 merchants. Esto respalda que el ICP deba definirse por **economía de pagos y complejidad**, no solo por “ser ecommerce”. citeturn24search0turn25search22

### Receta de SuperSearch

Construiría primero **cuentas**, después personas.

**Company-level:**

```text
Location:
33 países, separados por clusters

Employees:
50–5,000 inicialmente

Revenue:
≥ 10M cuando el dato esté disponible
(no usarlo como hard exclusion si falta)

Industries include:
Retail
Apparel & Fashion
Consumer Goods
Cosmetics
Furniture
Consumer Electronics
Sporting Goods
Internet / eCommerce cuando proceda

Keywords include:
ecommerce
e-commerce
online store
omnichannel
direct-to-consumer
marketplace

Technologies:
Shopify / Shopify Plus
PrestaShop
Magento / Adobe Commerce
Shopware
Salesforce Commerce Cloud
BigCommerce
WooCommerce

Signals:
growth
funding
product launch
website/technology change
hiring
buying intent

Job listings:
payments
treasury
ecommerce
finance transformation
procurement
```

SuperSearch permite precisamente combinar technology scans, signals, job listings, revenue/headcount y domain-based searches, por lo que esta receta está alineada con los filtros que existen hoy y no con funcionalidades teóricas. citeturn17search10turn17search2

No haría obligatorio detectar Stripe, Adyen, Checkout.com u otro PSP en el website. **Esto es una inferencia técnica:** dado que SuperSearch define Technologies como tecnologías observables en una web, una integración de payments server-side puede no ser visible públicamente; por eso, ecommerce platform es un filtro positivo útil, mientras que PSP detectado es una señal adicional, no un hard gate. citeturn17search10

**People-level:**

```text
Priority 1
Head of Payments
VP Payments
Payments Director
Payments Manager

Priority 2
CFO
Finance Director
VP Finance
Head of Finance
Treasury Director
Head of Treasury

Priority 3
Head / Director / VP Ecommerce
Chief Digital Officer
COO

Priority 4
Procurement Director
Strategic Procurement
Commercial Finance
```

Para enterprise buscaría 3–4 personas por cuenta. Para mid-market, CFO/Finance Director + Head of E-commerce suele ser suficiente para descubrir quién posee realmente payments.

### Receta equivalente en Apollo

Apollo recomienda comenzar por Companies y permite estrechar mediante industry, employee count, buying intent y job postings; después se puede pasar a contacts con job title y seniority. citeturn17search7turn17search3

Usaría:

```text
Companies:
33-country location
50–5,000 employees
revenue band
industry + keywords
technology
job postings
funding / growth
buying intent

People:
C-suite / VP / Director / Head
Finance / Payments / Operations / Ecommerce
titles del bloque anterior

Email:
Verified para secuencias outbound
```

Apollo dispone además de filtros tecnográficos, intent y job-posting, de modo que se puede utilizar un score en lugar de una única query demasiado restrictiva. citeturn17search3turn17search11turn17search23

### Scoring recomendado antes de enviar

Yo convertiría el ICP en puntos:

| Señal | Score |
|---|---:|
| Checkout propio claramente identificable | +3 |
| Merchant de mid-market/enterprise | +2 |
| Opera en varios países/currencies | +2 |
| Múltiples payment methods/PSPs visibles o declarados | +2 |
| Head of Payments/Payments Director presente | +2 |
| CFO/Finance/Treasury accesible | +1 |
| Ecommerce platform identificada | +1 |
| Hiring/growth/funding/market expansion reciente | +1 |
| Marketplace-only sin checkout propio | **−4** |
| PSP/acquirer/payment vendor en lugar de merchant | **excluir** |
| Agencia/consultoría ecommerce | **excluir** |

Enviar outbound prioritariamente a scores de **7+** evitaría que la infraestructura de deliverability se utilice para compensar una lista mediocre.

## Directorios de cuentas para los 33 países

La fuente central más sólida para retail europeo es el directorio de **miembros nacionales de EuroCommerce**. La página actual lista organizaciones nacionales y sus webs, no simplemente nombres de países, por lo que sirve como seed source verificable para account discovery. citeturn20view1

Los seeds validados en esa fuente son:

| Mercado | Asociación/fuente seed |
|---|---|
| Austria | **WKÖ – Wirtschaftskammer Österreich** |
| Bélgica | **Comeos** |
| Bulgaria | **Association of Modern Trade** |
| Croacia | **HGK** y **HUP** |
| Chipre | **Cyprus Chamber of Commerce and Industry** |
| Chequia | **SOCR ČR** |
| Dinamarca | **Dansk Erhverv** |
| Estonia | **Eesti Kaupmeeste Liit** |
| Finlandia | **Kaupan Liitto** |
| Francia | **FCD – Fédération du Commerce et de la Distribution** |
| Alemania | **HDE** y **BGA** |
| Grecia | **ESEE** |
| Hungría | **OKSZ** y **VOSZ** |
| Irlanda | **Retail Ireland** |
| Italia | **Confcommercio** y **Federdistribuzione** |
| Lituania | **LPIA** |
| Luxemburgo | **Luxembourg Confederation** |
| Países Bajos | **MKB-Nederland** y **Raad Nederlandse Detailhandel** |
| Polonia | **POHiD** |
| Portugal | **APED** y **CCP** |
| Rumanía | **AMRCR** |
| Eslovaquia | **SAMO** |
| Eslovenia | **TZS – Trgovinska zbornica Slovenije** |
| España | **ANGED** y **ASEDAS** |
| Suecia | **Svensk Handel** |
| Islandia | **SVTH** |
| Noruega | **Virke** |

Todos esos nombres aparecen en el listado nacional de EuroCommerce consultado en agosto de 2026. citeturn20view1

Eso deja **Letonia, Malta, Suiza, Liechtenstein, Reino Unido y Turquía** fuera de la cobertura directa del listado nacional que hemos utilizado. No rellenaría esos huecos con nombres de asociaciones no validados. Para estos seis mercados el acquisition pipeline debería partir de **event exhibitor/speaker lists + searches de SuperSearch/Apollo + cámaras/sector bodies validados localmente antes de importar**, mientras que Liechtenstein puede tratarse prácticamente como extensión del cluster DACH.

Ecommerce Europe es otra fuente paneuropea válida para ampliar e-commerce associations: su sistema admite asociaciones nacionales de Estados UE, EFTA y países candidatos, y su misión es representar el e-commerce europeo y cross-border commerce. citeturn20view0turn17search0

### Cómo transformar un directorio en cuentas comerciales

El proceso no debería ser “scrape association → email everyone”. La secuencia correcta es:

**Association/event → domain → tech enrichment → payment-complexity score → person enrichment → verified address → campaign.**

Instantly permite cargar domains y utilizar sus filtros de tecnologías, signals y company enrichment para convertir un listado de dominios en leads cualificados. citeturn17search10

Ejemplo Francia:

```text
FCD members / NRF exhibitors / Tech for Retail participants
→ dominio
→ ecommerce platform?
→ checkout propio?
→ multi-country?
→ 50+ employees / revenue signal
→ CFO + Head Payments + Head Ecommerce
→ verified work email
→ campaña FR
```

NRF ofrece además un exhibitor list y un Business Meetings service diseñado para transformar conexiones entre retailers y proveedores en reuniones comerciales, lo que lo hace especialmente útil como directorio vivo para el sprint de septiembre. citeturn21search9turn21search0

Para España:

```text
ANGED / ASEDAS
+ E-SHOW exhibitors, speakers y marcas
→ domains
→ tech enrichment
→ checkout/payment QA
→ Finance/Payments/Ecommerce personas
→ CommercialCampaign ES
```

La agenda de E-SHOW 2026 ya identifica responsables digitales y de e-commerce de retailers concretos, por lo que no hace falta empezar con búsquedas genéricas en LinkedIn. citeturn21search4

Para plataformas Shopify/Presta/Magento/Shopware, utilizaría primero el **Technologies filter** de Instantly y el equivalente technographic de Apollo, no footprints manuales frágiles. SuperSearch declara que su filtro Technologies escanea tecnologías presentes en sitios web, mientras Apollo dispone de technographic filtering dentro de su actual set avanzado de filtros. citeturn17search10turn17search11

Los marketplaces deben usarse de dos maneras distintas:

**Marketplace company itself → ICP alto**, porque controla o negocia payments.

**Marketplace seller → discovery source**, pero el seller solamente pasa a ICP si tiene también checkout D2C propio.

Ese detalle evitará que CommercialCampaign desperdicie cientos de contactos en pequeños sellers que no pueden decidir nada sobre acquiring.

## Competidores y cómo posicionarse contra ellos

### El mercado directo

Los tres competidores más cercanos encontrados son **CMSPI, Redbridge Payments Advisory y PaymentGenes**.

| Competidor | Qué vende realmente | Evidencia de benchmarking/optimización | Cómo cobra públicamente |
|---|---|---|---|
| **CMSPI** | Payments advisory + intelligence para grandes merchants; ahorro, acceptance y performance. | Se posiciona como advisor de merchants Global 500 y publica casos de ahorro y optimización de payments; tiene una solución específica de cost reduction. citeturn24search3turn24search7 | **No encontré rate card pública** en las páginas oficiales revisadas; modelo enterprise/sales-led. |
| **Redbridge Payments Advisory** | Acceptance-cost audit, benchmarking, commercial framework negotiation y payment performance. | Dice haber analizado miles de millones de transacciones y cientos de contratos; benchmarkea si el merchant está pagando un precio justo. citeturn24search1turn25search0 | **Success fee**: Redbridge dice explícitamente que las success fees alinean sus objetivos con los del cliente. citeturn25search6 |
| **PaymentGenes** | Payment strategy, merchant advisory, audit y optimisation. | Determina “fair market pricing” usando datos de **3.000+ merchants** y ofrece audit, contract review, cost analysis y negociación. citeturn24search0turn25search10 | **No encontré una tarifa pública del servicio merchant consultancy** en las páginas revisadas; engagement consultivo/bespoke. |

**Redbridge es probablemente el comparador comercial más peligroso** para una propuesta “te encontramos savings sin riesgo”, porque el success fee ya elimina gran parte de la objeción presupuestaria. Además, Redbridge publica haber generado €1.000 millones de savings para enterprise merchants y un promedio de 20% de recurring savings en su cartera de payments; son cifras del propio proveedor, no una auditoría independiente, pero constituyen una referencia competitiva importante. citeturn25search6

**PaymentGenes es el benchmark/data competitor más claro**: su propuesta actual incluye explicitamente comparar payment costs y performance contra fair-market value utilizando un dataset de más de 3.000 merchants. citeturn25search1turn25search22

**CMSPI domina la narrativa enterprise**: se presenta como payment advisor de cientos de Global 500 merchants y combina consultoría con tecnología/data intelligence. citeturn24search3turn24search23

### Competidores indirectos: orchestration

La segunda categoría no vende “benchmark independiente” sino **infraestructura para cambiar cómo se enrutan los pagos**.

**APEXX** promete conectar merchants con acquirers/PSPs y enrutar transacciones para optimizar costes y fees. citeturn24search6

**IXOPAY** vende payment orchestration para operar con distintos proveedores y métodos, unificar datos y escalar internacionalmente. citeturn24search2turn24search10

**Primer** permite multi-acquirer routing y argumenta que el merchant puede elegir procesador según approval probability, coste o región, reduciendo fees y dependencia de un único PSP. citeturn25search20

Esto crea una diferenciación muy útil:

> **Orchestration responde “¿cómo enruto mejor?”; un benchmark independiente debe responder antes “¿qué estoy pagando, qué parte es inevitable, dónde estoy fuera de mercado y qué cambio produce ROI sin replatforming?”.**

Primer reconoce precisamente que payment orchestration supone gestionar varios processors, payment methods, routing y una capa de infraestructura; la plataforma vende control operativo del stack, no un benchmark independiente pre-RFP. citeturn25search2turn25search8

### Objeciones que aparecerán y respuesta recomendada

**“Nuestro PSP ya nos optimiza el pricing.”**

La respuesta comercial no debe atacar al PSP. Debe ser: *“Perfecto; nosotros medimos independientemente interchange, scheme/processing y commercial markup para comprobar dónde ya estáis bien y dónde existe gap frente a mercado.”* Redbridge y PaymentGenes demuestran que ya existe demanda merchant por esa evaluación independiente. citeturn24search1turn24search0

**“Podemos hacer el RFP nosotros.”**

Posicionamiento: *“No sustituimos procurement; llegáis al RFP con baseline, fee taxonomy, benchmark y target economics.”* PaymentGenes vende precisamente contract review + cost analysis + negotiation, y CMSPI publica casos que combinan audit/RFP con optimización posterior. citeturn25search10turn24search23

**“No queremos cambiar de PSP ni tocar engineering.”**

Ésta debería ser una objeción favorable. La primera fase puede ser puramente analítica: invoices, merchant statements, transaction mix y contratos. Sólo se recomienda routing/orchestration si el economics lo justifican. Así se diferencia de plataformas como Primer, APEXX o IXOPAY, cuyo valor emerge al introducir o gestionar infraestructura multi-provider. citeturn24search6turn24search2turn25search20

**“El ahorro será demasiado pequeño.”**

Convertir basis points a euros durante la discovery evita discutir porcentajes abstractos:

- 10 bps sobre €20 M de volumen = **€20.000/año**.
- 10 bps sobre €50 M = **€50.000/año**.
- 20 bps sobre €100 M = **€200.000/año**.
- 30 bps sobre €250 M = **€750.000/año**.

PaymentGenes observa que, en merchants de alto volumen, pequeñas mejoras porcentuales en fees o approval rates pueden producir valor económico relevante. citeturn25search28

### Por qué ahora

El argumento de “why now” no debería ser solamente “payments are complicated”.

Redbridge destaca en junio de 2026 que los datos regulatorios muestran que las **scheme y processing fees cobradas a acquirers aumentaron al menos un 25% como proporción del valor transaccionado entre 2017 y 2023**, a pesar del marco europeo de interchange. citeturn24search5

En Europa, el interchange de muchas consumer cards está regulado, pero eso no elimina scheme fees, acquirer markups ni otros componentes del acceptance cost; precisamente por ello continúan existiendo oportunidades de benchmarking y negociación. citeturn24search21turn25search16

A la vez, el entorno europeo es fragmentado entre métodos locales, múltiples PSP/acquirers, SCA/PSD2 y commerce cross-border, lo que incrementa el valor de una visión normalizada e independiente del coste total. citeturn24search18turn25search2

Por tanto, el mensaje no sería:

> “Te ayudamos a reducir comisiones.”

Sería:

> **“Te decimos, con datos, qué parte de cada euro de acceptance cost está dentro de mercado, qué parte no, cuánto EBITDA hay disponible y qué acciones lo capturan sin obligarte a cambiar de stack.”**

Eso coloca la oferta entre la consultoría enterprise de CMSPI/Redbridge/PaymentGenes y el software de orchestration, en vez de competir frontalmente como “otro consultor de payments”.

## Plan de ejecución septiembre-diciembre

### Septiembre: demostrar que Finance/Payments responde

El primer sprint debe construirse alrededor de **NRF París, 15–17 septiembre**. NRF ofrece un entorno específicamente retail y 12.000 profesionales esperados, por lo que es el mejor anchor para una primera prueba continental. citeturn21search0turn21search6

Entre finales de agosto y el 14 de septiembre prepararía 300–500 cuentas FR + Benelux + DACH, con tres cohorts:

```text
A: Head of Payments / Payments Director
B: CFO / Finance Director / Treasury
C: Head Ecommerce / Digital
```

CTA único:

> **“European Payment Cost Benchmark: en 20 minutos te digo qué datos necesito para comprobar si vuestro acceptance cost está dentro de mercado.”**

No vender demo de software. Vender **diagnóstico**.

Después de NRF, el siguiente gran bloque cae el 23–24 de septiembre: DMEXCO, eCommerce Expo London, Retail Marketing Day el 24 y varias citas CEE se solapan. citeturn21search2turn23search33turn26search17

Con un solo equipo, elegiría **Colonia físicamente** y haría UK/CEE como event-triggered outbound. Con dos personas, Colonia + Londres.

### Octubre: descubrir qué regiones convierten

Octubre ofrece una secuencia casi perfecta de experimentos locales: Vilna 1, Viena 7, Copenhague/Riga 8, Zagreb 13, Sofía 15 y Milán/Malmö 20–21. citeturn26search17turn23search28turn23search3turn23search18turn26search19

No hace falta estar físicamente en todos. La regla debería ser:

**“event detected” = trigger de campaña**, no = billete de avión.

Ejemplo:

```text
Subject:
[Company] × CRO Commerce — quick payment-cost benchmark?

Body:
Vi que vuestro equipo está dentro del ecosistema CRO Commerce.
Estamos comparando acceptance economics de retailers europeos:
scheme/processing/acquirer markup, authorization y payment mix.

Si compartís el breakdown agregado o 1-3 meses de statements,
os devolvemos un first-pass de dónde merece la pena profundizar.

¿Quién lleva payments economics: Finance, Treasury o Ecommerce?
```

La campaña no necesita afirmar que el prospect asistirá salvo que ese dato esté realmente en speaker/exhibitor/attendee data.

A final de octubre debería existir evidencia suficiente para contestar tres preguntas: **qué vertical entrega statements, qué persona posee el problema y qué tamaño mínimo produce ROI obvio.**

### Noviembre: Iberia y conversión a paid pilot

El 4 de noviembre hay que elegir entre Madrid y Atenas. Para una empresa con base comercial en España y ambición paneuropea, priorizaría **E-SHOW Madrid**: el propio programa tiene retailers internacionales y casos sobre crecimiento, rentabilidad, automatización y e-commerce. citeturn21search4

El motion español debería salir de ANGED/ASEDAS + E-SHOW + Shopify/Presta/Magento/Shopware technology filters. ANGED y ASEDAS figuran actualmente como miembros nacionales españoles de EuroCommerce. citeturn20view1

Después vendrían Czech Retail Days, Web Summit, RetailDetail Night y DMWF Europe como fuentes secundarias de meetings y account data. citeturn6search0turn26search24turn23search25turn10search22

Aquí dejaría de medir “reply rate” como KPI principal. Los KPIs reales serían:

| KPI proof-of-demand | Lo que demuestra |
|---|---|
| Qualified discoveries / 100 target accounts | El dolor existe |
| % que sabe quién controla payments economics | Buyer clarity |
| % que comparte statement/fee breakdown | Confianza + intensidad del problema |
| Benchmark datasets recibidos | Creación del data moat |
| Paid diagnostics | Willingness to pay |
| Success-fee proposals aceptadas | Willingness to share savings |
| Estimated annual savings / merchant | Economic value |
| Conversion Finance vs Payments vs Ecommerce | Buyer persona real |
| Conversión por país/vertical | Dónde concentrar 2027 |

### Final de noviembre y diciembre: cerrar la tesis europea

**Tech for Retail París, 30 noviembre–1 diciembre**, debe funcionar como examen final del trimestre. Su escala y mix de grandes retailers hacen posible volver al mismo mercado donde se inició el sprint en NRF y comprobar cuánto ha madurado la proposición entre septiembre y diciembre. citeturn22search0turn22search3

Para el 15 de diciembre, aplicaría un go/no-go con criterios concretos de negocio, no vanity metrics:

**Go fuerte** si hay al menos 30 discoveries ICP, 10 merchants que hayan facilitado información real de payment cost, varios casos donde los savings potenciales superen claramente el coste del servicio y al menos tres geografías con respuesta repetible.

**Refinar ICP** si hay replies y meetings pero nadie comparte datos: significa que el messaging genera curiosidad, pero la confianza, persona o propuesta de intercambio de valor no funciona.

**Cambiar wedge** si Finance responde pero el ahorro puro no mueve compras: el benchmark puede ampliarse hacia authorization/revenue leakage, PSP negotiation o payment performance. CMSPI, PaymentGenes y Redbridge ya combinan costes con approval/conversion precisamente porque el merchant business case no siempre termina en fees. citeturn24search3turn25search22turn24search28

**No escalar volumen** si la forma de conseguir meetings depende de enviar indiscriminadamente. SuperSearch y Apollo ya ofrecen technologies, job postings, intent y real-time company signals suficientes para que el crecimiento del pipeline venga de mejor selección, no de acercarse al límite de Gmail/Yahoo/Microsoft. citeturn17search2turn17search3turn17search10

La estructura final para septiembre-diciembre queda así:

**33 países en coverage → 27 asociaciones nacionales verificadas como seeds + seis mercados cubiertos mediante fuentes locales/eventos → technographic + signal enrichment → account score → Finance/Payments/Ecommerce personas → verified email → deliverability gate → campaign → event-triggered discovery → payment-cost dataset → paid benchmark/success-fee proposal.**

Ese diseño conecta directamente los cuatro elementos del bloque: **deliverability protege la infraestructura; ICP mejora la relevancia; ferias aceleran la obtención de datos y reuniones; y el posicionamiento contra CMSPI/Redbridge/PaymentGenes y orchestration platforms convierte esos meetings en una oferta diferenciada.**