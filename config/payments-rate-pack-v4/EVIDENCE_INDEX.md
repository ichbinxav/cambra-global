# Índice de evidencia — de cada fila a su fuente cruda

Cada fila lleva `source_round`. Este índice mapea la ronda al paquete original (todos en tu poder, súbelos a un /evidence del repo):

| Ronda | Paquete original | Qué contiene |
|---|---|---|
| R1+R2+R3 (SumUp núcleo) | Informes R1–R3 pegados en conversación + CAMBRA_RATES_ALL_ROUNDS_RECOVERED.zip | anclas y confirmaciones triples; URLs canónicas en las 12 principales, resto `URL_PENDIENTE` |
| R2 | CAMBRA_GAPS_REGENERADO_2026-08-19.zip | Stripe HU/RO, SumUp LT/FI/SI, UniCredit |
| R4 | CAMBRA_RATE_EVIDENCE_PATCH_2026-08-19.zip | FI/SI/LT resueltos, UniCredit cuotas |
| R5 | adquirencia_online_30_mercados_2026-08-20.zip | Mollie, GoPay |
| R6/recargos | auditoria_recargo_internacional_fx_FINAL_2026-08-20.zip | matriz Stripe/PayPal 30 mercados |
| R7 | CAMBRA_menu_fino_7_mercados.zip | Viva, Teya, Revolut, locales PL, contratos |
| Bancos + líneas base | CAMBRA_10_MERCADOS_LAUNCH_CLOSURE + CAMBRA_10_mercados_lanzamiento.zip | D_bancos, A_linea_base con URL completa |

Las 174 filas `URL_PENDIENTE_REVERIFICACION` (Stripe patrón + SumUp de 16 países menores + transcripciones de informe) tienen la tarifa triple-contrastada pero la URL vive en los informes, no en el campo. **El monitor trimestral de 90 días las repuebla en su primera pasada** — es la misma visita que ya exige la caducidad.
