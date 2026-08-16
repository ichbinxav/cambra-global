# Diseño pan‑europeo del corpus gold de extractos, liquidaciones y recibos para los 33 países del perímetro histórico SEPA

## Alcance, interpretación de los 33 países y conclusión ejecutiva

Para convertir el Bloque 6 en el corpus que realmente pueda **sellar el requisito manual 8**, tomo “los 33 países de Europa de Cambra” como el **perímetro europeo de 33 países usado históricamente por SEPA**: los 28 Estados de la UE de aquella etapa —incluido Reino Unido— más **Islandia, Liechtenstein, Mónaco, Noruega y Suiza**. El BCE describía expresamente SEPA en 2013 como un área de 33 países con esa composición. Es importante congelar esta definición en metadata porque **no coincide con el SEPA actual**: a 13 de agosto de 2026, el European Payments Council habla de **41 países y territorios**. citeturn18search0turn18search1

Los 33 del scope quedan, por tanto:

**Austria, Bélgica, Bulgaria, Croacia, Chipre, Chequia, Dinamarca, Estonia, Finlandia, Francia, Alemania, Grecia, Hungría, Irlanda, Italia, Letonia, Lituania, Luxemburgo, Malta, Países Bajos, Polonia, Portugal, Rumanía, Eslovaquia, Eslovenia, España, Suecia, Reino Unido, Islandia, Liechtenstein, Mónaco, Noruega y Suiza.**

La primera conclusión importante cambia ligeramente el diseño original: **FR/ES/EN no puede seguir siendo la frontera lingüística del gold si el gate pretende afirmar cobertura de esos 33 países**. FR, ES y EN deben mantenerse como los tres idiomas de control y como lenguas de guidelines/análisis, pero el `gold_real` necesita documentos en la lengua efectivamente emitida por el proveedor o banco. La UE reconoce 24 lenguas oficiales y, fuera de la UE, el propio perímetro añade, entre otros, islandés y noruego; Suiza y Liechtenstein introducen además una realidad lingüística y monetaria distinta. citeturn24search0turn24search1

La arquitectura recomendada pasa a tener cuatro ejes independientes:

```text
merchant_country
document_language
provider_country
settlement_currency
```

y dos ejes temporales adicionales:

```text
format_epoch
currency_epoch
```

Esto es esencial. Un merchant polaco puede recibir un informe Stripe en inglés con operaciones PLN y un payout EUR; un comercio suizo puede recibir documentos en alemán, francés o italiano liquidados en CHF o EUR; y un comercio croata tiene un cambio de `currency_epoch` particularmente valioso porque Croacia adoptó el euro el 1 de enero de 2023. Bulgaria crea otro caso todavía más interesante para el benchmark: adoptó el euro el **1 de enero de 2026**, por lo que un corpus 2021–2026 puede contener documentos reales BGN y EUR del mismo país muy próximos temporalmente. citeturn24search3turn17search2turn17search4

La separación de procedencias propuesta originalmente se mantiene y se vuelve aún más importante:

| Dataset | Qué contiene | ¿Puede decidir el gate? |
|---|---|---:|
| `gold_real` | documentos reales aportados legalmente por comercios, saneados y adjudicados | **Sí; es el KPI principal** |
| `gold_official` | muestras, templates y ejemplos oficiales publicables | No; resultado separado |
| `augment_synthetic` | documentos generados/reconstruidos y perturbaciones | No |
| `stress_derived` | rasterizados, OCR, JPEG, rotaciones y conversiones derivados de `gold_real` | Sólo como slice del `source_document_id` real correspondiente |

El principio de evaluación debe ser tajante: **ningún documento sintético, sandbox o muestra pública puede hacer que el requisito manual 8 pase de FAIL a PASS**. Puede ayudar a desarrollar el extractor y diagnosticarlo, pero no puede aportar verdaderos positivos al KPI de certificación.

También cambiaría la escala. Para 33 países, un corpus “mínimo europeo” creíble debería situarse aproximadamente en **4.000–5.500 documentos reales saneados**; la versión de producción que permita hablar seriamente de generalización pan‑europea debería apuntar a **9.000–12.000 documentos reales**, sin contar derivados ni sintéticos. El número bruto no debe repartirse uniformemente: el objetivo principal sigue siendo cubrir diversidad de `country × provider × document_type × layout_family × format_epoch`, no acumular copias casi idénticas.

## Matriz operativa para los 33 países

La siguiente matriz no pretende afirmar que el proveedor indicado sea “el mayor” de cada mercado. Es una **matriz de adquisición del benchmark**: qué familias aportan suficiente diferencia estructural para que valga la pena buscar documentos reales. Donde existe un processor/adquirente nacional claro lo priorizo; donde el mercado es más fragmentado, propongo combinar banco adquirente local con una familia PSP internacional.

| País | Idioma de captura P0 | Moneda/epoch a preservar | Familias de pago/adquirencia que buscaría primero | Corpus mínimo específico del país |
|---|---|---|---|---|
| **Austria** | DE; EN secundario | EUR | **PAYONE**, Worldline, Adyen/Stripe | extracto bancario PDF + export; settlement adquirente; payout PSP; ticket POS. PAYONE actúa también como adquirente y realiza settlement de transacciones de tarjeta. citeturn23search0turn23search4turn19search2 |
| **Bélgica** | NL + FR; DE slice | EUR | **Worldline**, Mollie, Bancontact ecosystem | banco NL y FR; settlement; Mollie CSV/PDF/MT940/CODA; ticket. Mollie ofrece un Settlement Report con transacciones, fees, chargebacks, refunds y varios formatos, haciéndolo especialmente útil para el dual-reader. citeturn20search2turn20search4 |
| **Bulgaria** | BG; EN secundario | **BGN ≤2025 / EUR ≥2026** | **BORICA**, banco adquirente, Adyen/Stripe | documentos pre-euro y post-euro obligatorios; vPOS/POS; banco; PSP. BORICA soporta infraestructura vPOS y trabaja con entidades financieras locales; Bulgaria adoptó EUR el 1/1/2026. citeturn22search0turn22search8turn17search2 |
| **Croacia** | HR; EN secundario | **HRK ≤2022 / EUR ≥2023** | Worldline/Adyen + acquiring bancario | mínimo un epoch HRK y dos EUR; banco + settlement + receipt. Croacia cambió al euro el 1/1/2023, por lo que es un slice de drift monetario obligatorio. citeturn24search3turn24search11turn19search2 |
| **Chipre** | EL + EN; TR oportunista | EUR | **JCC** + banco adquirente + PSP global | Merchant Portal JCC, refunds/reversals, banco, recibo. JCC documenta gestión de pagos, reversals, refunds y estados de transacción desde Merchant Portal/API. citeturn22search1turn22search5turn24search36 |
| **Chequia** | CS; EN secundario | CZK + EUR | Global Payments, Worldline/Adyen, banco local | CZK obligatorio; PDF/CSV bancario; settlement de adquirente; payout PSP; receipt. Global Payments ofrece cobertura adquirente europea con portales de informes y settlement; Adyen admite merchants de Chequia. citeturn21search5turn19search2 |
| **Dinamarca** | DA; EN secundario | DKK + EUR | **Nets/Nexi**, Adyen/Stripe | settlement Nets, banco, payout PSP, POS. Nets publica reporting específico de pagos nórdicos y distingue settlement de otras facturas/transacciones. citeturn21search1turn21search13 |
| **Estonia** | ET; EN secundario | EUR | **EveryPay**, Nets/Adyen | gateway/acquiring local, banco, settlement, receipt y PSP internacional. EveryPay aporta una familia báltica diferente de las interfaces globales; Adyen soporta Estonia. citeturn13search0turn19search2 |
| **Finlandia** | FI + SV; EN secundario | EUR | **Paytrail**, Nets/Nexi | settlement Paytrail PDF/CSV/XLSX, banco, Nets, PSP global. Paytrail permite informes de settlement en varias representaciones estructuradas. citeturn13search3turn13search7turn21search1 |
| **Francia** | FR | EUR | **Worldline**, Payplug, bancos FR, Stripe/PayPal/SumUp | mantener el núcleo original: banco FR + acquiring + payout + receipt + global PSP. Worldline aporta adquirencia; Payplug añade otra interfaz merchant francesa. citeturn21search0turn16search0 |
| **Alemania** | DE; EN secundario | EUR | **PAYONE**, Worldline, Stripe/PayPal | settlement PAYONE, banco, PSP y POS. PAYONE documenta merchant/subaccounts para settlement y su actividad como acquirer. citeturn23search0turn23search4 |
| **Grecia** | EL; EN secundario | EUR | **Worldline/Cardlink**, banco adquirente | settlement, extracto, informes de transacciones y receipt. Cardlink aporta merchant/POS local y Worldline documenta variantes griegas de reporting, incluido statement mensual. citeturn12search2turn12search23 |
| **Hungría** | HU; EN secundario | HUF + EUR | Global Payments/Adyen + gateway bancario local | HUF obligatorio; banco; acquiring; PSP; POS. No depender de un único template internacional. Global Payments ofrece portales merchant/reporting en su cobertura EU y Adyen incluye Hungría. citeturn21search5turn19search2 |
| **Irlanda** | EN; GA oportunista | EUR | Global Payments, Stripe, SumUp, Adyen | banco business, payout global, merchant settlement y receipt. Es un excelente control EN dentro de la eurozona, evitando que “English” equivalga exclusivamente a UK/GBP. citeturn21search5turn19search2turn19search16 |
| **Italia** | IT; EN secundario | EUR | **Nexi**, Worldline, Stripe/PayPal | Nexi acquiring/POS + banco + global PSP + receipt. Nexi proporciona soluciones de merchant/acquiring, soporte de disputas y gestión de pagos. citeturn23search1turn23search9 |
| **Letonia** | LV; EN secundario | EUR | **Klix/Citadele**, Adyen/Nets | banco local, gateway local, payout y ticket. Klix aporta una familia báltica diferenciada; Adyen incluye Letonia en su cobertura europea. citeturn13search6turn19search2 |
| **Lituania** | LT; EN secundario | EUR | **Paysera**, Adyen/Nets | Paysera + banco + global settlement + POS. Su valor no es sólo el proveedor, sino obligar al extractor a funcionar con vocabulario y nombres de campo LT. citeturn13search1turn19search2 |
| **Luxemburgo** | FR + DE; EN frecuente; LB oportunista | EUR | Worldline/Adyen + banco LU | al menos dos idiomas reales del mismo mercado; banco, adquirente y PSP. Adyen soporta Luxemburgo y Worldline dispone de acquiring europeo. citeturn19search2turn21search0 |
| **Malta** | EN + MT | EUR | **Bank of Valletta merchant acquiring**, Global Payments/Adyen | statement bancario EN/MT cuando exista, settlement adquirente, PSP y recibo. BOV proporciona servicios merchant y reporting orientado a reconciliación. citeturn14search0turn14search20 |
| **Países Bajos** | NL; EN secundario | EUR | **Mollie**, Adyen, Worldline | Mollie Settlement/Balance, banco, Adyen y receipt. Es uno de los mercados más útiles para probar formatos estructurados alternativos porque Mollie exporta CSV, PDF, MT940 y CODA. citeturn20search2turn20search10 |
| **Polonia** | PL; EN secundario | PLN + EUR | **Przelewy24**, **PayU**, Adyen | payouts P24, PayU statements, banco PLN, PSP global y receipt. P24 permite relacionar cada payout con sus transacciones y tiene reporting de payouts; PayU define statements con compras, refunds y payouts. citeturn23search2turn23search6turn23search3 |
| **Portugal** | PT | EUR | **SIBS**, MULTIBANCO/MB WAY, PSP global | referencias MULTIBANCO, MB WAY, settlement/acquiring, banco y POS. SIBS actúa como acquirer de esquemas locales/internacionales y soporta comercio online y físico. citeturn22search3turn22search13turn22search24 |
| **Rumanía** | RO; EN secundario | RON + EUR | SIBS, NETOPIA/Global Payments, Adyen | RON obligatorio; banco, gateway local, settlement y receipt. SIBS ofrece solución para Rumanía dentro de su cobertura y Adyen incluye el país. citeturn22search13turn19search2 |
| **Eslovaquia** | SK; EN secundario | EUR | Global Payments/Adyen + gateway local | banco + local acquiring + global PSP + POS. La prioridad es conseguir contenido real SK en vez de considerar que EUR homogeneiza el formato. citeturn21search5turn19search2 |
| **Eslovenia** | SL; EN secundario | EUR | **Bankart**, Adyen/Worldline | Bankart POS/acquiring, banco, PSP y receipt. Bankart procesa operaciones ATM/POS del lado adquirente y dispone de merchant/POS tooling. citeturn22search2turn22search21 |
| **España** | ES; CA/EU/GL slices | EUR | **Redsys**, Santander/Getnet, CaixaBank, Stripe/PayPal/SumUp | conservar el diseño español original: banco, TPV, liquidación, receipt y global PSP; añadir idiomas cooficiales cuando aparezcan realmente. Redsys ofrece herramientas de información/reporting para comercios. citeturn10search0turn10search8 |
| **Suecia** | SV; EN secundario | SEK + EUR | **Nets/Nexi**, Adyen, PSP global | SEK obligatorio; settlement Nets, banco, global payout, POS. Nets cubre explícitamente el ecosistema nórdico y permite exportación de settlement y transaction data en su plataforma unificada. citeturn21search1turn21search7 |
| **Reino Unido** | EN; CY oportunista | GBP + EUR | Worldpay/Global Payments, Stripe/PayPal/SumUp | statement bancario business, merchant settlement, payout y POS; mantener GBP separado de EN-euro. Global Payments ofrece Merchant Portal con reporting, chargebacks y reconciliación. citeturn21search11 |
| **Islandia** | IS; EN secundario | ISK + EUR | **Rapyd/Valitor** + bancos islandeses | banco ISK, merchant settlement, payout, ticket y variante EN. EFTA identifica ISK como moneda islandesa; Valitor pasó a formar parte de Rapyd, por lo que el corpus histórico debe conservar ambos epochs de branding. citeturn24search1turn14search5 |
| **Liechtenstein** | DE; EN secundario | CHF + EUR | **Worldline**, Adyen + bancos LI | banco CHF, Worldline settlement/myPortal, PSP y receipt. EFTA identifica CHF y alemán para Liechtenstein; Adyen incluye el país en su cobertura europea. citeturn24search1turn19search2turn15search4 |
| **Mónaco** | FR; EN/IT oportunistas | EUR | banco adquirente local + PSP internacional verificado por donor | banco, acquiring, receipt y payout. **No daría por cubierta Mónaco por extrapolación desde Francia**: debe existir evidencia documental de merchant monegasco. El francés es la lengua oficial. citeturn24search2turn24search6 |
| **Noruega** | NO; EN secundario; Sami oportunista | NOK + EUR | **Nets/Nexi**, Adyen | settlement Nets, banco NOK, PSP y POS. EFTA identifica NOK y noruego/sami; Nets trata Noruega como parte central de su corpus nórdico. citeturn24search1turn21search1 |
| **Suiza** | DE + FR + IT; EN; RM raro | CHF + EUR | **Worldline**, Adyen + adquirentes bancarios | cubrir al menos DE/FR; idealmente IT; CHF obligatorio; settlement + banco + receipt. Worldline dispone de merchant tooling suizo y Adyen admite Suiza. citeturn21search24turn19search2 |

Hay una consecuencia metodológica especialmente importante: **la cobertura “33/33” no se consigue porque Stripe, PayPal o Adyen aparezcan en muchos mercados**. El benchmark debe demostrar simultáneamente una capa **global** y una capa **local**.

Para cada país, la celda mínima de `country_core` debe contener al menos:

```text
1 familia de statement bancario
1 familia de acquiring/settlement real
1 familia de PSP/payout
1 familia de recibo/ticket o transaction receipt
```

Si un proveedor fusiona varias funciones —por ejemplo Mollie Settlement o Nets unified settlement— sigue siendo necesario un statement bancario independiente que permita probar la reconciliación entre el movimiento recibido en la cuenta y el payout del procesador.

Mónaco merece un tratamiento especial: no lo marcaría automáticamente como cubierto utilizando un documento francés. `merchant_country=MC` debe estar demostrado por la procedencia del donante o por metadata verificable; un PDF de un banco francés en francés no convierte la celda monegasca en cubierta.

## Proveedores transversales y familias documentales que deben repetirse entre países

El benchmark pan‑europeo necesita una **columna vertebral internacional constante**. Esto permite separar los errores causados por idioma/locale de los causados por cambiar completamente de proveedor.

**Stripe** debe mantenerse como uno de los controles principales. Su Payout Reconciliation permite relacionar los payouts bancarios con las transacciones que forman cada lote y descargar información CSV; Stripe también dispone de Balance y otros financial reports. Su lista actual de disponibilidad cubre un amplio conjunto de mercados europeos, pero la disponibilidad debe registrarse por país/producto real y no extrapolarse. citeturn20search0turn20search12turn20search13turn20search1

Una ventaja adicional de Stripe para el corpus 2026 es que sus componentes recientes de reporting permiten balance summary, payout reconciliation y ending-balance reconciliation con exportes resumidos o itemizados; esto crea un nuevo `format_epoch` que no debe mezclarse silenciosamente con exports más antiguos. Stripe documentó esos componentes en abril de 2026 y, para determinados connected accounts sin full Dashboard, incluso existe una frontera de disponibilidad desde el 1 de abril de 2026. citeturn20search5turn20search14

**PayPal** es probablemente el mejor proveedor internacional para estudiar drift explícitamente documentado. Activity Download ofrece PDF, CSV y TAB —además de formatos contables condicionados— y permite períodos históricos de hasta siete años, con un máximo de doce meses por informe. Los Monthly/Custom Statements están disponibles en PDF y CSV; el custom tiene una ventana documentada de tres años. citeturn19search6turn19search12

PayPal además advierte que amplía los atributos de algunos informes con el tiempo y recomienda integrar por **nombre de columna, no por posición**. Su Balance Report de agosto de 2026 es CSV y la documentación avisa expresamente de nuevas columnas; el Settlement Report, actualizado el 11 de agosto de 2026, usa CSV/TAB, tipos de fila, versiones de fichero y segmentación cuando se supera el límite de registros. Es prácticamente un caso de laboratorio para el objetivo de “dual-reader contra deriva” del Bloque 6. citeturn19search9turn19search18

**SumUp** cubre otra familia muy distinta: payout reports diarios/mensuales, accounting reports y transaction/sales exports. El payout report contiene las transacciones ya pagadas, fecha de payout y fees; accounting puede exportarse CSV, detailed CSV y PDF; sales history permite CSV/XLS y revenue report PDF. citeturn19search1turn19search4turn19search13turn19search19

**Adyen** debe ser el control internacional de reconciliación de acquiring de mayor complejidad. Su Settlement Details contiene transacciones, fees, refunds, chargebacks y otras modificaciones del balance; otros reports permiten columnas configurables, zonas horarias y diferentes objetivos contables. Además, DCC modifica el contenido de los Settlement/Received Payment Details reports y puede requerir columnas específicas. citeturn19search29turn19search8turn19search11

No asumiría que Adyen equivale a “cobertura automática de 33 países”. Su documentación de Platforms enumera actualmente un gran número de mercados europeos —incluidos, por ejemplo, Austria, Bulgaria, Croacia, Chipre, Chequia, Liechtenstein, Noruega, Suiza y Reino Unido—, pero no todos los integrantes del perímetro histórico aparecen necesariamente en cada producto. `provider_country_support` debe obtenerse del producto concreto y de la cuenta del donante. citeturn19search2

**Worldline** debe funcionar como segundo eje transnacional de adquirencia. Su oferta actual combina merchant acquiring, in-store, e-commerce y servicios de pagos en Europa; la compañía describe también portales y reporting de merchant acquiring. Esto resulta particularmente útil para obtener una misma familia corporativa bajo mercados nacionales distintos. citeturn21search0turn21search12

**Nets/Nexi** debe ser la familia transversal nórdica. Nets distingue reporting de settlement respecto de otras facturas y su plataforma unificada permite exportar datos de settlement y transacción, lo que la convierte en una fuente adecuada para Dinamarca, Suecia, Noruega y Finlandia. citeturn21search7turn21search13

**Global Payments** es útil especialmente para el slice de adquirencia paneuropea y UK/Europa central. Su solución europea describe cobertura directa en la UE, merchant ledgers, pricing, billing, settlement y portales web para informes/transacciones; el Merchant Portal incluye reporting, chargebacks y reconciliation. citeturn21search5turn21search11

**Mollie** merece convertirse en P0 para Benelux y P1 para generalización europea. Su Settlement Report ofrece revenue, deductions, costs, refunds, chargebacks y fees, con CSV/PDF/MT940/CODA; el Balance Report añade opening balance y movimientos de balance. Es exactamente la clase de proveedor que demuestra por qué “CSV” no debe tratarse como una única familia estructural universal. citeturn20search2turn20search10

La matriz transversal final debería verse conceptualmente así:

| Familia | Lo que controla | Artefactos P0 |
|---|---|---|
| Stripe | PSP internacional y reconciliación payout | Payout Reconciliation CSV, Balance CSV, receipt |
| PayPal | multiformato + drift de columnas/versiones | Activity PDF/CSV/TAB, Monthly PDF/CSV, Settlement |
| SumUp | micro/SME + POS + accounting | payout PDF, accounting PDF/CSV, sales CSV/XLS, receipt |
| Adyen | acquiring complejo, DCC, chargebacks | Settlement Details, Payment Accounting, terminal receipt |
| Worldline | acquiring paneuropeo + variación nacional | settlement/transaction report, merchant portal, receipt |
| Nets/Nexi | Nordics + merchant acquiring | settlement report, SFTP/export, POS |
| Global Payments | UK/Central Europe acquiring | settlement, merchant reporting, disputes |
| Mollie | Benelux + formatos bancarios | Settlement PDF/CSV/MT940/CODA, Balance |
| PayU/P24 | Polonia/CEE | statement, payout, transaction/refund report |
| SIBS | Portugal + payment rails locales | acquiring/MB WAY/MULTIBANCO reports |
| BORICA | Bulgaria | POS/vPOS + bank acquiring exports |
| JCC | Chipre | merchant transactions/refunds/settlement |
| Bankart | Eslovenia | POS/acquiring/merchant artefacts |

La clave es no intentar encontrar los mismos documentos en todos los proveedores. El benchmark mejora cuando tiene **heterogeneidad funcional real**: statements bancarios, payout reports, settlement reports, transaction exports, merchant invoices, chargeback reports y tickets no son sinónimos y no deberían compartir un esquema plano indiscriminadamente.

## Diseño del gold, cuotas y esquema multilingüe paneuropeo

La unidad de cobertura debe ampliarse respecto al diseño inicial. Propongo que el catálogo se gobierne mediante:

```text
country
× provider
× provider_product
× document_type
× document_language
× original_format
× layout_family_id
× format_epoch
× currency_epoch
```

`source_year` sigue existiendo, pero **no sustituye a `format_epoch`**. PayPal documenta que sus informes evolucionan añadiendo atributos; Stripe introdujo nuevos componentes de reporting en 2026; Adyen permite variar columnas de ciertos reports. Un documento de enero y otro de noviembre del mismo año pueden pertenecer a familias incompatibles. citeturn19search9turn20search14turn19search8

Tampoco permitiría que `format_epoch` absorbiese un cambio de moneda. Croacia y Bulgaria demuestran que `currency_epoch` es una dimensión diferente. Un template puede conservar prácticamente el mismo layout y cambiar de HRK a EUR o de BGN a EUR, introduciendo nuevos códigos, símbolos, redondeos, textos de conversión y reconciliaciones. Croacia adoptó EUR en 2023 y Bulgaria en 2026. citeturn24search3turn17search2

### Distribución recomendada del corpus

Para un **Minimum European Gold**, propondría:

| Slice | Objetivo real aproximado |
|---|---:|
| 33 `country_core` | 80–120 documentos reales por país |
| PSP internacionales repetidos entre países | 1.000–1.500 adicionales |
| drift/format epochs deliberados | incluidos en anteriores, pero ≥20 % del corpus |
| recibos POS/fotos reales | ≥800 |
| PDFs nativos | ≥1.500 |
| CSV/TAB/XLS/XLSX nativos | ≥1.200 |
| scans/fotos originales | ≥700 |
| **Total real** | **≈4.000–5.500** |

Para `corpus-europe-v1.0` de producción:

| Slice | Objetivo |
|---|---:|
| País medio | 180–250 reales |
| Países de mayor diversidad/provider coverage | 300–500 |
| Donantes/comercios diferentes | 150–250 |
| Layout families | ≥250–350 |
| Documents reales adjudicados | **≈9.000–12.000** |
| Derivados stress | 8.000–15.000, fuera del N real |
| Sintéticos | 5.000–10.000, siempre separados |

No exigiría “40 documentos de cada combinación completa”, porque el producto cartesiano sería enorme e innecesario. En cambio, la celda de cobertura tendría niveles:

```text
UNCOVERED
1_SAMPLE
BASIC
SUPPORTED
GOLD
```

donde `GOLD` exige, por ejemplo:

```yaml
real_documents: ">=20"
independent_source_entities: ">=3"
layout_families: ">=2"
native_formats: ">=2 when the provider supports them"
adjudicated: true
privacy_review: passed
```

Para `country_core`, el umbral sería mayor porque agrupa proveedores:

```yaml
real_documents: ">=80"
source_entities: ">=5"
bank_statement_families: ">=2"
acquiring_or_settlement_families: ">=1"
psp_families: ">=1"
receipt_family: ">=1"
local_language_present: true
```

El requisito de idioma debe evaluarse por contenido real. `document_language`, `languages_present`, `ui_locale` y `numeric_locale` tienen que seguir separados. La diversidad lingüística europea hace inadecuado un simple enum `FR|ES|EN`; la UE trabaja con 24 lenguas oficiales, y el perímetro añade mercados no UE con otras configuraciones nacionales. citeturn24search0turn24search1

Recomendaría mantener las **guidelines maestras** en ES y EN —y FR para validación lingüística— mientras que los labels siguen siendo canónicos e independientes del idioma:

```json
{
  "raw_label": "Kwota rozliczenia",
  "canonical_field": "settlement_amount",
  "document_language": "pl",
  "raw_value": "1 245,70 PLN",
  "canonical_value": {
    "amount": "1245.70",
    "currency": "PLN"
  }
}
```

El esquema funcional original se puede conservar, pero añadiría algunos campos indispensables para Europa completa:

| Nueva dimensión | Campos |
|---|---|
| geografía | `merchant_country`, `account_country`, `acquirer_country`, `provider_country` |
| idioma | `document_language`, `languages_present`, `ui_locale`, `numeric_locale` |
| moneda | `transaction_currency`, `settlement_currency`, `account_currency`, `currency_epoch`, `fx_rate` |
| payment rail | `payment_scheme`, `local_payment_method`, `bank_transfer_scheme` |
| reconciliación | `bank_credit_reference`, `settlement_reference`, `payout_reference`, `batch_id` |
| drift | `source_year`, `format_epoch`, `layout_family_id`, `provider_report_version` |
| estructura | `delimiter`, `encoding`, `decimal_separator`, `thousands_separator`, `date_pattern` |
| procedencia | `provenance_class`, `source_entity_id`, `source_document_id`, `agreement_id` |

Especialmente importante: **el raw Unicode no puede perderse**. Entre los 33 países aparecen comas y puntos decimales, espacios finos/no separables, caracteres diacríticos, alfabetos griego y cirílico, apóstrofos tipográficos y diferentes convenciones de fecha. El parser canonicalizador puede producir ISO/Decimal, pero el gold debe retener el valor textual saneado exactamente como se presenta.

Un ejemplo búlgaro realista del tipo de transición que el corpus debe representar sería:

```text
[epoch pre-euro]
Сума: 1 234,56 BGN
Такса: 12,30 BGN
Нетно: 1 222,26 BGN

[epoch post-euro 2026]
Сума: 631,22 EUR
Такса: 6,29 EUR
Нетно: 624,93 EUR
```

Los valores serían sintéticos tras saneamiento, pero **la época monetaria, la lengua, la geometría, el tipo de separators y las relaciones contables serían reales**. Bulgaria adoptó el euro el 1 de enero de 2026, de modo que este no es un stress case inventado sino una fuente real de deriva de 2026. citeturn17search2turn17search4

## Privacidad, anonimización y marco jurídico para un corpus de 33 países

La expansión territorial no cambia la regla básica: un fichero no se vuelve anónimo por sustituir el nombre del comercio o el titular. El RGPD regula datos personales y establece principios como finalidad, minimización, seguridad y protección desde el diseño; cuando el tratamiento probablemente entrañe un alto riesgo, el artículo 35 contempla la evaluación de impacto. citeturn17search3

CNIL expresa el punto de forma especialmente útil para este proyecto: un proceso de anonimización pretende hacer imposible identificar a las personas y debe ser irreversible para que el resultado deje de considerarse dato personal; además aconseja no presumir que un dataset bruto es anónimo. citeturn25search1turn25search18

A fecha de **13 de agosto de 2026**, las **Guidelines 02/2026 on Anonymisation** del EDPB ya han sido adoptadas para consulta pública, pero el plazo de comentarios permanece abierto hasta el **30 de octubre de 2026**. Por tanto, son una referencia muy relevante para el threat model y el release review, pero no deben presentarse todavía como unas guidelines finales cerradas tras consulta. citeturn18search2turn18search6turn18search10

El mapa jurídico del corpus debe separar además las jurisdicciones:

| Grupo del scope de 33 | Tratamiento de gobernanza |
|---|---|
| Estados UE | RGPD + normativa nacional aplicable |
| Islandia, Liechtenstein, Noruega | carril EEE; documentar entidad/roles y transfer flow |
| Reino Unido | carril jurídico separado; la Comisión renovó la decisión de adecuación para UK el 19/12/2025 |
| Suiza | carril FADP suizo + análisis de transferencias; FADP revisada vigente desde 1/9/2023 |
| Mónaco | carril no-EEE independiente; no extrapolar automáticamente el régimen francés |

La Comisión mantiene su sistema de decisiones de adecuación bajo el artículo 45 del RGPD y publica actualmente la renovación de adecuación del Reino Unido de diciembre de 2025. Suiza, por su parte, aplica su Federal Act on Data Protection revisada desde el 1 de septiembre de 2023. citeturn18search3turn25search0turn25search6

Esto no significa que cada documento del Reino Unido o Suiza requiera automáticamente el mismo mecanismo contractual; significa que `data_transfer_route` debe registrarse y validarse en vez de asumir que todos los integrantes del viejo perímetro “SEPA 33” forman un único espacio jurídico. Para transferencias a terceros países sin el mecanismo adecuado, la Comisión contempla, entre otras herramientas, cláusulas contractuales tipo. citeturn18search11turn18search18

El modelo de zonas debe mantenerse:

```text
RAW QUARANTINE
   │ originales personales
   │ acceso ingest/privacy
   ▼
PSEUDONYMIZED WORK
   │ mappings y QA
   │ accesos muy restringidos
   ▼
SANITIZED GOLD CANDIDATE
   │ sin mappings
   │ scanner privacy
   ▼
GOLD RELEASE
```

En un proyecto paneuropeo añadiría `release_reidentification_risk` como artefacto versionado. La revisión no debe buscar solamente nombres, IBAN o tarjetas, sino quasi-identifiers formados por combinaciones como:

```text
fecha + importe exacto + pequeña ciudad + merchant descriptor
payout amount + bank reference + timestamp
transaction ID + visible QR
invoice number + VAT/tax ID
rare chargeback amount + exact date
```

Las transformaciones de los valores monetarios deben seguir siendo **constraint-aware**. No basta cambiar:

```text
Gross = 100.00
```

por:

```text
Gross = 317.42
```

si se conservan los fees, taxes, refund, net y closing balance originales. El corpus debe reconstruir todo el grafo financiero:

\[
gross - fees - refunds - chargebacks + adjustments = net
\]

y, cuando exista:

\[
opening\ balance + \sum movements = closing\ balance
\]

Así, un extractor puede ser sometido a validaciones contables reales sin conservar la transacción del consumidor.

Para identificadores, utilizaría alias sintácticamente compatibles pero irreversibles en el release:

```text
real payout ID        -> HMAC interno -> po_8K7M2Q...
real transaction ID   -> HMAC interno -> tr_P4N9...
real merchant ID      -> alias         -> merchant_027
real IBAN             -> IBAN deliberadamente no enrutable/placeholder
real masked PAN       -> máscara con últimos dígitos NUEVOS
```

Los últimos cuatro dígitos reales de una tarjeta enmascarada tampoco son necesarios para probar el extractor. Deben reemplazarse por dígitos sintéticos coherentes dentro del documento.

El scanner de privacidad de salida debe inspeccionar **más que la imagen renderizada**:

```text
texto extraíble
OCR layer
XMP / EXIF
PDF annotations
embedded files
hidden objects
URLs
QR/barcodes
document author
comments
filenames
form fields
JavaScript/actions
```

La expansión a tickets fotografiados hace además obligatoria la eliminación de metadata EXIF y de elementos del entorno que puedan identificar al comercio o a una persona cuando no sean necesarios para el benchmark.

No usaría blur como anonimización. El flujo correcto sigue siendo:

```text
dato real
→ sustitución
→ rerender seguro
→ verificación de privacidad
→ después blur/skew/JPEG/fade
```

La perturbación visual se aplica sobre un contenido ya saneado.

## Deriva temporal, dual‑reader, monedas y pipeline paneuropeo

El Bloque 6 existe precisamente porque un extractor que funciona contra “el CSV de Stripe que tenemos ahora” no demuestra robustez. El corpus europeo debe convertir el drift en una dimensión explícita y medible.

PayPal proporciona un ejemplo especialmente claro: Activity Download admite varias representaciones y hasta siete años de histórico, mientras que Monthly/Custom Statement tiene formatos y ventanas distintas. Además, sus informes financieros pueden añadir atributos a lo largo del tiempo, motivo por el que PayPal aconseja integrar por nombre de columna. citeturn19search6turn19search12turn19search9

Stripe, por su parte, documenta distintos financial reports descargables en CSV, y en 2026 introdujo componentes adicionales de Balance/Payout Reconciliation. citeturn20search13turn20search14

Mollie demuestra otro tipo de drift potencial: un mismo settlement puede estar representado como CSV, PDF, MT940 o CODA. Esas representaciones no deben colapsarse en una sola muestra porque permiten comprobar si la capa estructurada y la capa visual llegan al mismo canonical gold. citeturn20search2turn20search4

El `dual_reader` debería, por tanto, evaluarse en cuatro rutas:

```text
native structured
    CSV / TAB / XLSX / MT940 / CODA / bank exports

native document
    PDF con text layer / HTML receipt

native visual
    scanned PDF / image / photographed receipt

derived visual
    PDF→PNG / raster PDF / JPEG / OCR-PDF
```

Cada fichero tiene:

```yaml
source_document_id: src_...
artifact_id: art_...
original_format: pdf
derived_format: png
is_provider_native: false
conversion_chain: pdf-native->png-300dpi
```

Un CSV convertido internamente a PDF **nunca** debe figurar como:

```text
provider_native_pdf=true
```

sino como:

```text
provider_native_csv=true
derived_pdf=true
```

Esto impide que una prueba aparentemente “PDF” sea en realidad una plantilla controlada por vuestro propio renderizador.

La regla anti-leak más importante sigue siendo:

> **todo artefacto derivado del mismo `source_document_id` pertenece al mismo split.**

Pero con 33 países añadiría agrupación jerárquica:

```text
source_document_id
   ⊂ source_entity_id
      ⊂ contributor_group_id
```

y el splitter debería intentar mantener `source_entity_id` íntegro. Un comercio que aporta seis años no debe tener 2022–2024 en development y 2025–2026 en blind test salvo que el objetivo explícito de ese slice sea temporal forecasting y se haya definido antes de mirar los resultados.

### Epochs que deben buscarse deliberadamente

Para cada proveedor/país importante:

| Epoch | Objetivo |
|---|---|
| `legacy_accessible` | template más antiguo que el donor pueda demostrar |
| `middle` | formato intermedio |
| `current_2026` | versión vigente en 2026 |
| `config_variant` | columnas o settings alternativos |
| `native_format_variant` | PDF frente a CSV/XLS/TAB cuando ambos sean del proveedor |
| `currency_transition` | obligatorio para HRK→EUR y BGN→EUR |

Croacia debe disponer de un slice explícito:

```text
country=HR
currency_epoch=HRK_PRE_2023
currency_epoch=EUR_POST_2023
```

porque adoptó EUR el 1 de enero de 2023. citeturn24search11

Bulgaria debe disponer de:

```text
country=BG
currency_epoch=BGN_PRE_2026
currency_epoch=EUR_2026
```

porque el cambio se produjo el 1 de enero de 2026. citeturn17search2

No convertiría automáticamente documentos antiguos de BGN/HRK a EUR en el gold. Precisamente su valor es demostrar que el extractor no ha aprendido que `country=BG ⇒ EUR` o `country=HR ⇒ EUR`.

### Pipeline propuesto

```text
Partner / banco / PSP / official sample
                 │
                 ▼
        RAW QUARANTINE
                 │
       hash + MIME + provenance
                 │
                 ▼
      secret/PII/payment scan
                 │
         ┌───────┴────────┐
         ▼                ▼
 structured parser     visual parser
 CSV/XLS/TAB/...       PDF/image/HTML
         │                │
         └───────┬────────┘
                 ▼
       INTERMEDIATE MODEL
 page/block/table/cell/style
                 │
                 ▼
        semantic replacement
                 │
       constrained resampling
 dates / amounts / totals / IDs
                 │
                 ▼
          safe re-render
                 │
                 ▼
   extractable-text + metadata
        + QR + object scan
                 │
                 ▼
           PRIVACY GATE
          FAIL ─┤├─ PASS
                 │
                 ▼
        GOLD REAL CANDIDATE
                 │
        annotation + QA
                 │
                 ▼
           adjudication
                 │
                 ▼
          split assignment
                 │
        ┌────────┴────────┐
        ▼                 ▼
 native gold      derived stress
```

Todos los logs de esta pipeline deben utilizar identificadores internos y categorías, no snippets de PII. Un error como:

```text
Failed parsing customer "Jean Dupont", IBAN FR76...
```

volvería a introducir precisamente la información que la pipeline pretende retirar.

## Evaluación, splits y gate que puede cerrar el requisito manual 8

El diseño original 50/20/30 sigue siendo válido como punto de partida:

| Partición | Objetivo |
|---|---:|
| `development` | 50 % |
| `validation` | 20 % |
| `blind_test_real` | 30 % |

Pero en Europa completa el splitter debe satisfacer simultáneamente constraints por país y donor. Los sintéticos **no participan en estos porcentajes**.

Propondría cinco slices independientes dentro del blind:

| Slice | Pregunta que responde |
|---|---|
| `core_33` | ¿funciona en los 33 mercados? |
| `format_drift` | ¿funciona en layouts/versions no vistos? |
| `language_holdout` | ¿generaliza a vocabulario/locales distintos? |
| `provider_holdout` | ¿generaliza a un proveedor no ajustado durante desarrollo? |
| `noise_realistic` | ¿sobrevive a scans, fotos, thermal fade y conversiones? |

El slice más importante para no hacer trampas es `core_33`. Un F1 paneuropeo alto puede ocultar un extractor desastroso en Malta, Bulgaria o Letonia si Francia/Alemania/UK aportan miles de filas.

Por tanto, reportaría **micro, macro y floors**.

Para cada occurrence gold:

\[
Precision=\frac{TP}{TP+FP}
\]

\[
Recall=\frac{TP}{TP+FN}
\]

\[
F1=\frac{2PR}{P+R}
\]

Una predicción de:

```text
gold:  1.234,56 EUR
pred:  1.234,55 EUR
```

es incorrecta. Después de canonicalizar separadores, no aplicaría una “tolerancia de un céntimo” a campos financieros críticos.

Asimismo:

```text
gold field = payout_amount
pred field = closing_balance
same numeric value
```

no es un TP. El extractor debe identificar **semántica + valor**.

### Métricas obligatorias

| Métrica | Gate |
|---|---|
| exact-match field precision | principal |
| exact-match field recall | principal |
| normalized exact-match | principal tras canonicalización |
| critical-field micro-F1 | principal |
| country macro-F1 | principal |
| provider macro-F1 | principal |
| format-epoch macro-F1 | principal |
| transaction-row F1 | principal para tablas |
| all-required-fields document accuracy | principal |
| financial-consistency rate | principal |
| OCR CER/WER | diagnóstico |
| bbox/span accuracy | diagnóstico si se devuelve evidence |
| confidence calibration | diagnóstico/operación |
| bootstrap 95 % CI | obligatorio en la release |

Para tablas debe realizarse matching uno-a-uno de rows. No es correcto puntuar simplemente:

```text
gold row 17 ↔ predicted row 17
```

porque una cabecera repetida, un refund omitido o una fila partida desplazaría toda la tabla. El emparejamiento debe utilizar primero identificadores y, si no existen, una función controlada de fecha + importe + tipo + referencia, seguida de matching bipartito en duplicados.

### Gate recomendado para el requisito manual 8

Yo formalizaría el requisito manual como una condición computable:

```yaml
manual_requirement_8:
  dataset: gold_real
  test_split: blind_test_real
  all_33_countries_present: true
  synthetic_examples_count_for_pass: false
  official_examples_count_for_pass: false

  privacy:
    prohibited_payment_data_leaks: 0
    direct_identifier_leaks: 0
    source_document_split_leaks: 0

  coverage:
    country_core_min_real_docs: 80
    country_core_min_source_entities: 5
    local_language_required: true
    bank_statement_required: true
    settlement_or_acquiring_required: true
    psp_or_payout_required: true
    receipt_required: true

  critical_fields:
    precision_micro_min: 0.995
    recall_micro_min: 0.990
    f1_macro_country_min: 0.960

  table_extraction:
    transaction_row_f1_min: 0.980

  documents:
    all_required_fields_accuracy_min: 0.970

  drift:
    format_epoch_f1_min: 0.950

  financial_consistency:
    rate_min: 0.995
```

Estos valores son **criterios de ingeniería propuestos**, no thresholds impuestos por una norma externa. Su función es impedir que un resultado global excepcional tape una zona geográfica rota.

Añadiría una condición todavía más dura:

```text
NO COUNTRY MAY BE "UNCOVERED" OR "1_SAMPLE"
```

y otra:

```text
NO CRITICAL country × document_type CELL < 0.92 F1
```

Es decir, un 99,4 % global no debería sellar el extractor si el settlement griego obtiene 78 % o los statements polacos 83 %.

La métrica reportada debería producir automáticamente una matriz:

```text
country
× provider
× provider_product
× document_type
× language
× format_epoch
× original_format
× noise_class
× field
```

Por ejemplo:

```text
PL × PayU × statement × pl × epoch_2025 × CSV × clean × payout_amount
BG × bank × statement × bg × BGN_2025 × PDF × native × closing_balance
BG × bank × statement × bg × EUR_2026 × PDF × native × closing_balance
HR × acquirer × settlement × hr × HRK_2022 × PDF × scan × net
HR × acquirer × settlement × hr × EUR_2024 × CSV × clean × net
```

Esto permitiría responder a la pregunta realmente útil: **“¿qué cambio rompió el extractor?”**, en vez de limitarse a observar que el F1 descendió unas décimas.

## Plan de adquisición, esfuerzo y criterios de release paneuropeos

La adquisición debe hacerse en tres olas, pero el criterio de las olas no sería simplemente “país grande primero”. Hay que maximizar diferencias estructurales.

La primera ola debería contener mercados que cubran las principales familias:

| Ola inicial | Razón |
|---|---|
| España | Redsys/Getnet/banca + ES |
| Francia | Worldline/banca + FR |
| Reino Unido | GBP + EN + acquiring anglosajón |
| Alemania | PAYONE + DE |
| Países Bajos | Mollie/Adyen + multiformato |
| Polonia | PLN + P24/PayU + PL |
| Dinamarca | Nets + DKK + Nordics |
| Bulgaria | BG/cirílico + transición EUR 2026 |

Con esos ocho mercados se prueban antes de escalar: tres idiomas originales, nuevas lenguas, alfabeto cirílico, EUR/GBP/PLN/DKK, adquirentes locales, PSP globales, CSV/PDF/MT940-like structures y una transición monetaria 2026.

La segunda ola cubriría Italia, Portugal, Grecia, Suecia, Finlandia, Chequia, Rumanía, Croacia, Bélgica, Austria, Irlanda y Suiza.

La tercera cerraría Estonia, Letonia, Lituania, Eslovaquia, Eslovenia, Hungría, Chipre, Malta, Islandia, Liechtenstein, Luxemburgo, Noruega y Mónaco, manteniendo Mónaco como una celda que **no puede declararse cerrada con documentos franceses sustitutos**.

Para cada donor enviaría una solicitud orientada a **variantes**, no a volumen:

```text
1 statement con pocas operaciones
1 statement multipágina
1 export CSV/XLS/TAB del mismo o periodo próximo
1 payout normal
1 payout con refund
1 refund parcial si existe
1 chargeback/dispute si existe
1 adjustment/negative settlement si existe
1 cambio de año
1 ejemplo histórico de layout anterior
2–5 receipts/tickets
```

Siempre que se obtenga el mismo periodo en PDF y CSV, ambos deben conservar el mismo `source_document_id`, porque son una pareja de oro para verificar el dual-reader.

Para un proyecto de producción de 9.000–12.000 reales, estimaría:

| Área | Persona-días |
|---|---:|
| legal, privacy y acuerdos multipaís | 35–50 |
| partner sourcing/onboarding | 120–170 |
| ingestion/catalog/provenance | 40–55 |
| anonimización y privacy QA | 90–130 |
| schema/guidelines/localización | 45–65 |
| anotación, review y adjudicación | 240–340 |
| benchmark/splits/metrics | 35–50 |
| release engineering/storage/audit | 25–35 |
| **Total orientativo** | **630–895 persona-días** |

Un núcleo de **6–8 FTE técnicos/operativos**, más DPO/legal y revisores lingüísticos part-time, sitúa la construcción de una versión paneuropea seria más cerca de **seis a nueve meses naturales** que de las 14–18 semanas del corpus FR/ES/EN original. El mayor riesgo de calendario seguirá siendo conseguir diversidad real y contratos, no escribir el parser.

El release manifest debería crecer hasta algo como:

```text
corpus-europe-v1.0/
├── manifest.parquet
├── country_coverage.parquet
├── provider_coverage.parquet
├── annotations.jsonl
├── schema.json
├── label_guidelines_es.md
├── label_guidelines_en.md
├── label_guidelines_fr.md
├── terminology/
│   ├── bg.yaml
│   ├── cs.yaml
│   ├── da.yaml
│   ├── de.yaml
│   ├── el.yaml
│   ├── et.yaml
│   ├── fi.yaml
│   ├── ...
│   └── sv.yaml
├── normalization.yaml
├── currency_epochs.yaml
├── format_epochs.yaml
├── layout_families.parquet
├── noise_taxonomy.yaml
├── splits.json
├── anonymization_policy.yaml
├── provenance_policy.yaml
├── privacy_release_report.json
├── evaluation_config.yaml
├── pipeline_manifest.json
├── checksums.sha256
└── CHANGELOG.md
```

`currency_epochs.yaml`, por ejemplo, debería congelar hechos históricos necesarios para reproducir el benchmark:

```yaml
HR:
  - id: HRK_PRE_EURO
    until: "2022-12-31"
    currency: HRK
  - id: EUR
    from: "2023-01-01"
    currency: EUR

BG:
  - id: BGN_PRE_EURO
    until: "2025-12-31"
    currency: BGN
  - id: EUR
    from: "2026-01-01"
    currency: EUR
```

Las fechas coinciden con los cambios oficiales documentados por BCE/UE. citeturn24search3turn17search2

Finalmente, no declararía `corpus-europe-v1.0` ni permitiría que el requisito manual 8 quede **SEALED** hasta que se cumplan simultáneamente estas condiciones:

| Condición de salida | Exigencia |
|---|---|
| países | **33/33 `country_core` cubiertos** |
| documentos | sólo reales saneados deciden el PASS |
| procedencia | 100 % con provenance verificable |
| donantes | ningún `source_entity_id` cruzando splits |
| derivados | ningún `source_document_id` cruzando splits |
| banco | al menos una familia real en cada país; preferiblemente dos |
| adquirencia | al menos una settlement/acquiring family en cada país |
| PSP | una familia de payout/report donde sea operativamente aplicable |
| tickets | cobertura POS/receipt en los 33 o gap formalmente bloqueante |
| idioma | lengua local real presente; FR/ES/EN no sirven como proxy universal |
| drift | más de una layout family en cada país donde exista histórico accesible |
| moneda | HRK→EUR y BGN→EUR representados obligatoriamente |
| privacy | cero PAN completo, CVV/CVC, PIN, track y cero PII directa residual |
| annotations | campos críticos adjudicados |
| contabilidad | invariantes automáticas pasan |
| test | blind split congelado antes del tuning final |
| métricas | thresholds del gate superados globalmente **y por country floor** |
| reproducibilidad | dataset/schema/pipeline/evaluator versions fijadas y checksums verificables |

La diferencia entre este diseño y simplemente “añadir 30 países al corpus FR/ES/EN” es fundamental. El resultado correcto es un **benchmark paneuropeo estratificado**, donde las familias globales —Stripe, PayPal, SumUp, Adyen, Worldline— proporcionan controles comparables y las familias nacionales —BORICA, JCC, Bankart, SIBS, PAYONE, Nexi, P24/PayU, Nets, Mollie y otras obtenidas de bancos partners— introducen la heterogeneidad que el extractor encontrará de verdad. Stripe, PayPal, SumUp y Adyen documentan hoy familias maduras de reporting/reconciliación; Worldline, Nets, Global Payments, Mollie y los proveedores locales aportan la capa adquirente que evita convertir el benchmark en una simple prueba de cuatro dashboards SaaS. citeturn20search0turn19search18turn19search4turn19search29turn21search0turn21search7turn21search5turn20search2

El **gold europeo correcto no necesita conservar la identidad financiera real de nadie** para preservar lo que interesa al extractor. Debe conservar procedencia, layout, paginación, idioma, encoding, separators, estructura de tabla, relaciones entre filas, ruido, comportamiento de settlement, coherencia contable y deriva de formato; nombres, IBAN, PAN parcial real, referencias, fechas exactas e importes pueden sustituirse de forma coherente. Esa separación entre **realismo estructural** y **datos identificables** es la que permite disponer de un blind test con valor probatorio sin convertir el corpus en un repositorio innecesario de información financiera personal. La distinción coincide con el principio europeo de no confundir seudonimización con anonimización efectiva y cobra todavía más importancia en 2026, mientras las nuevas Guidelines 02/2026 del EDPB permanecen en consulta pública hasta el 30 de octubre. citeturn25search1turn18search2