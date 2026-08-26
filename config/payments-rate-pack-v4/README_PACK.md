# Paquete Base44 — orden de ejecución

## Ejecución 1: PROMPT_1_DATOS.md  +  estos 6 adjuntos
| Fichero | Qué es | Destino |
|---|---|---|
| rates_merged.csv | 548 tarifas, 30 países, 18 proveedores | PaymentsRateTable |
| blocked.csv | 9 filas que NUNCA se siembran | referencia |
| surcharges_seed_v4.csv | recargos intl + FX por proveedor | ProviderSurcharges |
| bancos_seed_v2.csv | 36 filas de capa bancaria (mínimos por operación) | BankReference |
| linea_base_10_v2.csv | 41 líneas base regulatorias | MarketBaseline |
| EVIDENCE_INDEX.md | mapa fila→fuente cruda | auditoría |
| contratos_seed_v1.csv | permanencias y mínimos (Teya 12/36, PeP 24…) | ProviderContractTerms |

Instrucción crítica al agente: **cargar los CSV tal cual, prohibido transcribir o "corregir" valores a mano.**

## Ejecución 2: PROMPT_2_LAUNCH_10.md — sin adjuntos
## Ejecución 3: PROMPT_3_MOTOR.md — sin adjuntos (usa lo sembrado en 1)
