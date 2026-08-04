# Decision Log — RECOVER-4 (2026-08-04)

Medición mensual verificable, fiscalidad FR/ES, facturación Stripe y cobro del
success fee de Recover Margin.

## Alcance implementado en esta iteración

1. **Calendario contractual** (`recordConditionsActivation`, admin-only):
   `conditions_activated_at` procede SIEMPRE de evidencia verificada por un
   humano (enum de fuentes; nunca de la aceptación RECOVER-1, del SetupIntent
   ni del frontend). Zona horaria contractual: **Europe/Paris**. El mes de
   activación no se factura; el primer mes natural completo posterior es el
   primer periodo medido; la factura se emite el mes siguiente
   (2026-08-15 → agosto no facturable, septiembre medido, octubre factura).
   `agreement_end_at` = 24 meses medidos; nada se mide/factura después.
2. **Matemática monetaria** (`shared/recoverBillingMath.ts`): enteros de
   céntimos, half-up documentado, versión `recover4-calc-v1` + hash SHA-256.
   El 25% (o pct reducido) se aplica SIEMPRE sobre el ahorro neto verificado,
   nunca sobre un importe con IVA (§5). Ahorro ≤0 → fee 0, sin factura, sin
   carry-forward.
3. **Fuente del porcentaje** (§11): el pct aceptado en el snapshot del Mandate
   es el TECHO; la BillingRule vigente del mes puede bajarlo (descuento de
   parrainage adquirido, no retroactivo — reutiliza `shared/billingFee.ts`)
   pero nunca subirlo. Descuento = descuento comercial sobre el fee
   (`referral_commercial_discount`), nunca reducción del ahorro ni pago al
   referidor.
4. **Motor fiscal mínimo** (`shared/recoverTax.ts`): estados explícitos
   FR_STANDARD_TVA / ES_EU_REVERSE_CHARGE / TAX_REVIEW_REQUIRED /
   UNSUPPORTED_JURISDICTION. **Ninguna regla vive en el código como fuente
   jurídica**: todo tratamiento no-bloqueado exige `RECOVER_TAX_CONFIG_JSON`
   (aprobado por el asesor: régimen FR confirmado, tasa en bps, tax-rate ids
   de Stripe por modo, confirmación reverse charge ES, `einvoicing_mode`).
   Sin config → TODO bloqueado con TAX_REVIEW_REQUIRED. Solo FR/ES, solo EUR,
   solo `business_taxable_person`; el país fiscal viene de datos legales del
   Brand, nunca de IP/idioma/tarjeta/IBAN.
5. **VIES** (`checkVatVies`): REST oficial de la Comisión, timeout 10s.
   `invalid` NUNCA se convierte automáticamente en TVA francesa — bloquea.
   `unavailable`/`timeout` bloquean con retry, NO son `invalid`. Evidencia
   (identificador de consulta, snapshot saneado) en el Brand y congelada en la
   factura. Estados de revisión manual solo por acción admin documentada.
6. **Elegibilidad** (`approveRecoverReportForInvoicing`, admin humano):
   solo `fully_verified` + `verified/realized` + verified_by/at +
   `evidence_count > 0` + baseline EXACTAMENTE el aceptado en el snapshot del
   mandato (§8 — nunca "el baseline current de turno") + calendario + método
   de pago listo + fiscalidad resoluble. `manual_override` bloqueado (no
   existe el flujo de doble aprobación; §9). Estados de bloqueo con razón
   normalizada. Alerta (no bloqueo) si la 1ª factura llega con el PDF
   contractual en `failed_permanent`.
7. **Factura Stripe** (`createEligibleRecoverInvoices`): factura VARIABLE por
   mes (NUNCA Subscription). draft → invoiceitem → finalize; **el `number` de
   Stripe es la numeración legal** — no hay secuencia local max+1 (los campos
   `series`/`sequence` quedan como legado no escrito). Idempotencia: clave
   lógica activación+mes+report, chequeo local + Idempotency-Keys de Stripe
   por paso (`r4:inv:create/item/fin:{report}`) — la doble ejecución del
   scheduler reanuda, no duplica. FR: Tax Rate real de Stripe (id en config,
   por modo) — nunca un campo local mientras Stripe cobra otro total. ES:
   `tax_exempt=reverse` + tax id `eu_vat` en el Customer + menciones
   «Autoliquidación por el destinatario» y «Reverse charge — Article 196,
   Directive 2006/112/EC» + VAT IDs de ambas partes en el footer. Descripción
   de línea localizada EN/FR/ES por `Brand.locale`.
8. **Snapshot contable** (`billing_snapshot_json` + `invoice_snapshot_hash`):
   report, baseline, mandate hash, pcts, decisión fiscal, evidencia VIES,
   identidades, periodo, redondeo, referencias Stripe. Append-only tras
   finalizar. Una factura finalizada no se edita: void/credit note/rectificativa.
9. **Webhook** (extensión de `stripeBillingWebhook`, misma verificación de
   firma + livemode): invoice.finalized/sent/paid/payment_failed/
   payment_action_required/voided + charge.dispute.created +
   credit_note.created. Dedupe por `event.id` (PaymentEvent.processor_event_id).
   Guard de cross-tenant (customer del evento vs customer de la factura).
   SCA/SEPA: `payment_action_required`/fallo → factura QUEDA abierta (`due`),
   pago manual por `hosted_invoice_url`, jamás segunda factura del mismo mes.
   `paid` definitivo solo por evento Stripe (nunca al iniciar el adeudo SEPA).
   Primera factura pagada: `live → monetizing` (idempotente; no toca otros
   estados) + report → paid.
10. **SEPA pre-notificación**: `prenotification_status='provider_managed'` —
    Stripe (su Creditor ID + emails automáticos) lleva la notificación; CAMBRA
    no envía una segunda contradictoria. **PENDIENTE verificar en test mode**
    que los emails de Stripe están activados antes del primer cobro SEPA real.
11. **e-invoicing Francia** (§17): `einvoicing_mode` en la config fiscal
    (pre_mandate / approved_platform_ready / blocked_not_ready);
    `blocked_not_ready` detiene TODA emisión automática. La plataforma agréée,
    la clasificación de empresa y las fechas reales son una obligación
    corporativa a documentar por el asesor — fuera del código.
12. **VERI\*FACTU** (§16): EXCLUIDO. CAMBRA es proveedor francés sin entidad
    ni establecimiento permanente en España; la obligación del cliente español
    sobre sus propios sistemas no convierte la factura francesa en VERI\*FACTU.
13. **PaymentEvent**: enum ampliado ADITIVAMENTE (payment_processing,
    payment_action_required, invoice_voided, dispute_created,
    credit_note_created) + `processor_event_id`/`event_hash` para idempotencia.
    Nunca payloads Stripe completos, PAN, IBAN ni secretos.

## Fuera de esta iteración (deliberado)

- Panel del comercio (§34) y emails de factura propios (§35) — Stripe hosted
  invoice + sus emails cubren el arranque; UI merchant en un chunk posterior.
- Schedulers `generateMonthlyRecoverSavings`/`reconcileRecoverInvoices`/
  `retryFailedRecoverCollections` como automatizaciones — se crearán cuando la
  config fiscal esté aprobada; hasta entonces todo es manual-admin.
- Credit notes / rectificativas automatizadas (§32) — solo vía Stripe
  dashboard + registro manual; flujo propio pendiente.
- Métricas analytics (§36) — pendiente.
- Tests unitarios espejo de la matemática (patrón sync-marker del repo) —
  pendiente; la aritmética es determinista y está aislada en un módulo.

## Bloqueos activos (criterios de parada §39)

1. `RECOVER_TAX_CONFIG_JSON` NO configurado → toda facturación bloqueada
   (TAX_REVIEW_REQUIRED). Requiere: confirmación del asesor del régimen de TVA
   de CAMBRA, tasa FR, Tax Rate ids de Stripe (test y live), confirmación del
   tratamiento FR→ES y modo e-invoicing.
2. `evidence_count > 0` exige adjuntar SavingsEvidence antes de aprobar un
   report — el generador actual no lo puebla; flujo de evidencia manual admin.
3. Datos fiscales del cliente (billing_legal_name, dirección, VAT, tipo B2B)
   deben cargarse en el Brand antes de aprobar — no existe aún UI para ello.
4. Webhook secret de producción (live) sigue pendiente (arrastrado de RECOVER-2).