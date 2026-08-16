# E-invoicing compliance watch — 30 mercados activos

> Documento de VIGILANCIA, no de implementación. Fase F del prompt
> "idiomas/monedas/fiscalidad 30 mercados" (2026-08-16). Complementa la
> Tarea 3 del brief de cierre (`agent/task3-tax-engine-30-markets`), que
> resuelve el TRATAMIENTO de IVA. Este documento cubre lo que esa tarea
> no cubre: si algún país obliga a emitir la factura en un FORMATO de
> facturación electrónica concreto.
>
> **Decisión de alcance (deliberada):** NO se implementa ningún envío
> estructurado a plataformas nacionales (KSeF, SDI, Peppol, e-Factura,
> myDATA…). A fecha de la investigación no existe obligación legal que
> alcance a CAMBRA, y añadirlo sería complejidad sin mandato. Este
> documento existe para que nadie redescubra el tema desde cero.

## Hallazgo central (agosto 2026 — verificar fechas antes de decidir)

Ningún mandato nacional de e-invoicing de los 30 mercados activos obliga
hoy a CAMBRA. El patrón se repite en todos los regímenes revisados
(Italia/SDI, Alemania, España, Polonia/KSeF, Croacia): el mandato es
**estrictamente doméstico** — proveedor Y cliente establecidos en el mismo
país. CAMBRA Global SASU es un proveedor FRANCÉS facturando en
reverse-charge transfronterizo (art. 44+196, Directiva 2006/112/CE) sin
establecimiento en el país del cliente: fuera de alcance en todos los
casos confirmados.

## 4 puntos abiertos — SOLO los cierra el asesor fiscal

El mismo asesor que firma `RECOVER_TAX_CONFIG_JSON` (Tarea 3). Ninguno de
estos puntos se considera cerrado por investigación automatizada.

| # | Punto | Detalle | Prioridad |
|---|---|---|---|
| 1 | **Rumanía — e-Factura** | El régimen más maduro y de mayor alcance de los revisados. El tratamiento exacto de una factura entrante en reverse-charge desde un proveedor no establecido NO quedó claro en las fuentes. | **ALTA** |
| 2 | **Bélgica — Peppol-BIS** | Mandato doméstico obligatorio desde el 1 de enero de 2026. El trato de facturas transfronterizas entrantes en reverse-charge no se confirmó explícitamente. (BE es mercado protegido — relevante solo si se desbloquea.) | Media |
| 3 | **Grecia — myDATA** | Entrando en vigor por fases durante 2026. Una fuente indica que el e-invoicing "sigue siendo opcional" para transacciones con empresas de la UE — no tomarlo como definitivo. | Media |
| 4 | **Francia — e-REPORTING internacional** | Distinto del mandato doméstico francés de e-invoicing (que no aplica a ventas de CAMBRA a clientes no franceses). Francia tiene una obligación SEPARADA de e-reporting para transacciones internacionales que podría alcanzar a CAMBRA precisamente por ser la parte francesa de la operación. **No confundir las dos obligaciones.** | **ALTA** |

## Hito futuro ya legislado — ViDA (obligatorio 1 de julio de 2030)

El paquete "VAT in the Digital Age", adoptado como **Directiva (UE)
2025/516**, establece que desde el **2030-07-01** la factura electrónica
estructurada (EN 16931) y el reporte casi en tiempo real serán
obligatorios específicamente para operaciones B2B transfronterizas
intracomunitarias — incluyendo, de forma explícita, reverse-charge cuando
el proveedor no está establecido en el país del cliente. **Es exactamente
el patrón de negocio de CAMBRA.** No es tarea de hoy; es un requisito
futuro con fecha. Planificar la implementación con ≥12 meses de
antelación (arranque de diseño no más tarde de mediados de 2029).

## Peppol como estándar de facto (no obligación)

Si varios clientes empiezan a esperar facturas por Peppol aunque no sea
obligatorio, tratarlo como **mejora de producto futura**, no como
bloqueante de lanzamiento. Registrar aquí la demanda si aparece:

- (sin registros todavía)

## Reglas de mantenimiento de este documento

1. Cada confirmación del asesor se anota en la tabla con fecha y
   referencia — el punto no se cierra sin esa confirmación.
2. Cualquier cambio normativo detectado (p. ej. un mandato que amplíe su
   alcance a proveedores no establecidos) se añade como fila nueva con
   fuente y fecha de verificación.
3. Este documento NUNCA justifica por sí solo implementar un envío
   estructurado: eso requiere confirmación del asesor + decisión del
   fundador.
