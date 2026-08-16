# Investigación avanzada CAMBRA/E33 — Country Payments Economics

## Executive summary

Se ha construido un paquete de investigación con **33 dossiers nacionales en Markdown**, un **índice comparativo maestro**, una nota metodológica y un manifiesto de archivos, con fecha de corte **13 de agosto de 2026**. La investigación prioriza fuentes de primer nivel: reguladores y bancos centrales, schedules oficiales de Visa y Mastercard, operadores de esquemas/redes domésticas y documentación oficial de PSPs. Visa y Mastercard mantienen repositorios europeos de interchange por país y explican que interchange es solo un componente del merchant service charge; los schedules nacionales muestran que, aun dentro del EEE, la estructura comercial puede separarse sustancialmente de los caps consumer. citeturn31view0turn31view1

La principal conclusión económica es que **no existe un único “coste de tarjeta europeo”**. En buena parte del EEE, consumer debit/credit gravita alrededor del marco IFR de 0,20%/0,30%, pero hay excepciones domésticas inferiores, importes fijos, programas low-value y, sobre todo, una ruptura muy importante al pasar a tarjetas **Business/Corporate/Purchasing**, donde los schedules publicados pueden situarse aproximadamente en el rango del 1%–2% o más según país, canal, producto, MCC y qualification. citeturn31view0turn31view1

El análisis evita deliberadamente falsa precisión. Cuando no existe una fuente oficial y metodológicamente comparable para **market share de acquirers, ecommerce como porcentaje exacto de retail sales, SCA rejection rate, cross-border share o chargeback rate**, el dossier marca el campo como **ND/Parcial**, identifica proxies útiles y explica qué telemetría merchant/PSP debe utilizarse. Esto es particularmente importante porque variables como BIN geography, POS/CNP, merchant entity, MCC, settlement currency, 3DS exemption, fraude y reservas pueden alterar más el coste final que unas pocas décimas de interchange.

## Perímetro utilizado

La lista interna de los 33 países de CAMBRA no fue proporcionada. Además, en la presencia web pública de CAMBRA examinada no identifiqué un listado inequívoco de 33 mercados que permitiera reconstruir el perímetro corporativo con certeza; por ello el paquete declara explícitamente la hipótesis usada, en lugar de presentarla como una lista oficial de CAMBRA. citeturn31view10

Se ha utilizado el perímetro **E33 = UE27 + Reino Unido + EFTA4 + Turquía**:

**Austria, Bélgica, Bulgaria, Croacia, Chipre, Chequia, Dinamarca, Estonia, Finlandia, Francia, Alemania, Grecia, Hungría, Irlanda, Italia, Letonia, Lituania, Luxemburgo, Malta, Países Bajos, Polonia, Portugal, Rumanía, Eslovaquia, Eslovenia, España, Suecia, Reino Unido, Islandia, Liechtenstein, Noruega, Suiza y Turquía.**

La actualización monetaria de Bulgaria se ha incorporado expresamente: **el euro entró en circulación el 1 de enero de 2026**, convirtiendo Bulgaria en el vigesimoprimer miembro del área del euro, con tipo irrevocable de **BGN 1,95583 por EUR 1**. Esto es económicamente relevante porque algunos schedules de schemes publicados antes de la conversión todavía expresan determinados caps absolutos en BGN y requieren reconfirmación contractual. citeturn31view7

## Estructura y profundidad de los dossiers

Cada fichero nacional abre con un **Executive summary inferior a 250 palabras** y una tabla operativa con Visa consumer debit/credit, Mastercard consumer debit/credit, commercial-card economics, PSP/acquirers de referencia, settlement, SCA y cross-border/FX.

Después se cubren los diez bloques solicitados: interchange; schemes internacionales y domésticos; acquiring y PSPs; métodos de pago/card mix; cross-border y FX; wallets/fintech; regulación/SCA/3DS/routing; VAT/tax; settlement/netting; y drivers adicionales del coste merchant. Cada dossier incluye además un diagrama Mermaid del flujo **customer → PSP/gateway → acquirer → scheme/local rail → issuer → settlement**, una matriz de **total cost of acceptance** y un registro explícito de gaps de evidencia.

Para interchange se ha separado **consumer de commercial** y, donde el schedule lo permite, **POS/card-present de ecommerce/CNP**. Visa y Mastercard publican los schedules domésticos precisamente porque las tasas dependen, entre otros factores, de país, producto y tipo de transacción; esa documentación oficial se utiliza como source of record en lugar de aplicar indiscriminadamente el 0,20%/0,30%. citeturn31view0turn31view1

Para **American Express y Discover/Diners**, los dossiers no inventan una MIF equivalente cuando el modelo no ofrece una tabla merchant-facing comparable a Visa/Mastercard. En esos casos se trata como variable económicamente accionable el **MDR/merchant service fee contractual**, y se señala la necesidad de distinguir modelos three-party de acuerdos/licencias que puedan introducir componentes four-party.

El marco regulatorio también está actualizado más allá de PSD2. En noviembre de 2025 Consejo y Parlamento alcanzaron un acuerdo político provisional sobre el nuevo marco **Payment Services Regulation + revisión de PSD2/PSD3**, incluyendo mayor transparencia en los cargos de card acquiring y medidas reforzadas contra el fraude. citeturn31view8 En paralelo, desde octubre de 2025 los PSPs de la eurozona deben posibilitar el envío de instant euro payments, además de su recepción, con verification of payee y sin cobrar por instant payment más que por la transferencia ordinaria equivalente. citeturn31view9

## Hallazgos de Country Payments Economics

El primer hallazgo transversal es el **cost cliff de commercial cards**. Utilizar 0,20% debit y 0,30% credit como supuesto universal subestima de forma material el coste de merchants con business travel, B2B, procurement o corporate-card mix. Los schedules oficiales de Visa y Mastercard contienen escalones específicos para Business, Corporate, Purchasing, premium y otras categorías, y pueden cambiar además entre card-present y ecommerce. citeturn31view0turn31view1 En el índice se resaltan casos particularmente relevantes como España, Portugal, Irlanda, Reino Unido, Croacia, Alemania y los países nórdicos.

El segundo hallazgo es que **domestic routing puede ser más importante que la comparación Visa vs Mastercard**. Francia requiere analizar CB frente al rail internacional; Alemania, girocard; Dinamarca, Dankort; Italia, BANCOMAT; y Noruega, BankAxept. Noruega ofrece una de las evidencias públicas más completas: en 2025 BankAxept representó **46% del número de transacciones con tarjetas noruegas**, pero **70% de los pagos en terminales físicos dentro de Noruega**. Las tarjetas internacionales alcanzaron 54% del número total de transacciones con tarjetas noruegas, y BankAxept representó 40% del valor de card transactions. citeturn31view4 Esto demuestra por qué un market share agregado de “cards” es insuficiente para calcular merchant economics.

El tercer hallazgo es la creciente importancia de **A2A, instant payments y wallets domésticos**. Polonia es especialmente significativa: BLIK procesó **2.900 millones de transacciones por PLN 441.500 millones durante 2025**, terminó el año con **20,7 millones de cuentas activas** y generó aproximadamente **1.400 millones de pagos ecommerce**, casi la mitad de las operaciones BLIK. citeturn31view6 En Suiza, TWINT comunicó **901 millones de transacciones en 2025 y más de seis millones de usuarios activos**, confirmando que para un merchant local no puede tratarse como un método marginal. citeturn31view5 Los dossiers aplican el mismo enfoque a Bizum, Swish, MB WAY/MULTIBANCO, IRIS, qvik, iDEAL/Wero, Bancontact, Vipps MobilePay y otros métodos locales.

El cuarto hallazgo es la singularidad de **UK↔EEE cross-border CNP**. El Payment Systems Regulator documenta que, tras la salida británica de la UE, Mastercard y Visa elevaron el interchange de consumer CNP UK-EEE desde **0,20% hasta 1,15% en debit** y desde **0,30% hasta 1,50% en credit**. El PSR estima que esos incrementos suponen **£150–200 millones adicionales anuales para empresas**, por lo que localizar merchant entity/acquiring y comprender issuer geography puede tener un efecto económico muy superior a negociar algunos basis points del markup del PSP. citeturn31view3

El quinto es **Turquía**, que debe tratarse fuera del supuesto IFR europeo y con especial cuidado respecto de documentación antigua de schemes. BKM mantiene las tasas domésticas inter-participant vigentes y es la referencia prioritaria del dossier; el paquete evita presentar un viejo schedule Mastercard como si reflejara las condiciones domésticas de 2026. citeturn31view2

Finalmente, el dossier noruego ilustra también la necesidad de medir cross-border con datos reales: en 2025 hubo **528 millones de operaciones con tarjetas noruegas realizadas en el extranjero o con contrapartes extranjeras**; 334 millones correspondieron a pagos a websites extranjeros. Entre los pagos online con tarjetas noruegas, 64% fueron a retailers noruegos, proporcionando un proxy excepcionalmente bueno de la dimensión cross-border digital en ese mercado. citeturn31view4 En la mayoría de los otros países no existe una publicación oficial de granularidad equivalente, por lo que el paquete no extrapola ese porcentaje.

## Calidad de evidencia y límites

Se ha aplicado una jerarquía explícita: **A = regulador/banco central/scheme; B = operador doméstico o PSP oficial; C = industria/estimación claramente etiquetada; ND = dato que no puede defenderse con una fuente suficientemente sólida**. Los schedules oficiales de Visa y Mastercard son la referencia primaria para interchange, pero incluso estos deben releerse antes de cerrar un business case porque contienen qualification rules, MCCs especiales, caps absolutos, large-ticket rates y fechas de entrada en vigor que pueden cambiar. citeturn31view0turn31view1

Hay cinco campos donde se ha preferido **ND a una cifra aparentemente precisa pero metodológicamente incorrecta**: cuota exacta de acquirers/PSPs; porcentaje ecommerce sobre ventas retail; SCA rejection; chargeback rate nacional; y proporción cross-border de un merchant genérico. En particular, “porcentaje de población que compra por Internet”, “porcentaje de pagos del wallet que son ecommerce” y “porcentaje ecommerce del total retail turnover” no son métricas intercambiables.

El mismo principio se aplica a SCA. La evolución regulatoria europea hacia instant payments, verification of payee y un nuevo marco PSD3/PSR está documentada oficialmente, pero no produce una tasa única de “rechazo SCA” válida para un país entero. citeturn31view8turn31view9 El KPI económicamente útil debe reconstruirse desde logs PSP/merchant como **attempt → 3DS frictionless/challenge → challenge completion → authorization → capture**, segmentado por BIN, issuer, exemption, importe, canal y MIT/CIT.

Por ello, los dossiers deben leerse como una **base de Country Payments Economics/RFP y market-entry modelling**, no como un quotation contractual. El coste final debe modelarse como:

**TCOA = interchange + scheme/network fees + processing + acquiring markup + gateway/3DS/tokenization + FX/DCC + fraud + chargebacks + settlement/reserve + local levies.**

Ese enfoque es especialmente importante cuando existe un rail doméstico o A2A capaz de desplazar cards, y cuando la combinación de merchant entity, issuer geography y canal activa un régimen cross-border diferente.

## Entregables

El paquete generado contiene **33 dossiers nacionales `.md`**, el **índice comparativo `.md`**, una **metodología `.md`** y un **manifest `.csv`**. Los 33 dossiers han sido verificados para comprobar que contienen Executive Summary, fuentes y diagramas Mermaid.

**Paquete completo, recomendado para uso y versionado:**  
[Descargar los 33 dossiers + índice + metodología + manifest en ZIP](sandbox:/mnt/data/CAMBRA_E33_Payments_Economics_2026-08-13.zip)

**Índice comparativo maestro:**  
[Descargar 00_INDEX_CAMBRA_E33.md](sandbox:/mnt/data/CAMBRA_E33_Payments_Economics_2026-08-13/00_INDEX_CAMBRA_E33.md)

**Metodología y jerarquía de evidencia:**  
[Descargar METHODOLOGY.md](sandbox:/mnt/data/CAMBRA_E33_Payments_Economics_2026-08-13/METHODOLOGY.md)

**Manifest de los 33 países y nombres de fichero:**  
[Descargar MANIFEST.csv](sandbox:/mnt/data/CAMBRA_E33_Payments_Economics_2026-08-13/MANIFEST.csv)