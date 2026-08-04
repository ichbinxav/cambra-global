# Decision Log — BILLING-FIX-1 (2026-08-04)

## Neutralización de la ruta legacy `generateInvoiceFromReport`

### Los dos defectos

1. **Doble factura por el mismo ahorro.** La función no comprobaba si el
   `MonthlySavingsReport` ya tenía factura antes de crearla. Dos llamadas con el
   mismo `report_id` emitían dos facturas fiscales por el mismo mes medido.
2. **Numeración correlativa no fiable.** `nextSequence()` resolvía `max+1`
   leyendo la última `Invoice` de la serie, sin bloqueo, y `Invoice.jsonc` no
   declara unicidad en `(series, sequence)`. Dos llamadas concurrentes escribían
   el mismo número. CAMBRA Global SASU emite facturas fiscales francesas: la
   correlatividad sin huecos ni duplicados es un requisito legal, no una
   preferencia.

### Por qué se neutraliza en vez de borrarse

Cualquier función es un endpoint HTTP, y una automatización creada desde el
dashboard de Base44 no es visible en el repositorio: el análisis estático
confirma que ningún componente de `src/` la invoca, pero no puede descartar un
trigger de plataforma. Con el fichero borrado, ese trigger fallaría con un 404
genérico; con el stub 410 falla **ruidosamente y con motivo explícito**, en vez
de seguir duplicando facturas en silencio. El borrado definitivo se decide en el
barrido PURGE-2, cuando el registro de automatizaciones esté confirmado.

### Ruta sustituta

`createEligibleRecoverInvoices` (RECOVER-4):

- **Numeración:** Stripe Invoicing es la autoridad del número legal; no existe
  secuencia local `max+1` en este flujo.
- **Deduplicación:** filtra `Invoice` por `(deal_activation_id, month)` y usa
  claves de idempotencia de Stripe, más la clave lógica
  `deal_activation_id + month + report_id`.
- **Gate:** solo factura informes con `billing_eligibility_status === 'eligible'`,
  estado que únicamente escribe la aprobación humana explícita
  (`approveRecoverReportForInvoicing`).

### Alcance del cambio

Se tocaron cuatro ficheros: el stub, este documento, `PRODUCTION_FUNCTIONS.md`
(reclasificación a DEPRECATED) y nada más. No se modificaron
`createEligibleRecoverInvoices`, `reconcileInvoice`, `recordPayment`,
`generateInvoicePdf`, `billApiUsage`, `shared/billingFee.ts` ni el esquema
`Invoice.jsonc`.