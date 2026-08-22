# Auditoría CAMBRA Base44 Pack — 2026-08-22

## Veredicto

**NO-GO para migrar o sembrar.** El pack se ha evaluado en modo de solo lectura. No se ha copiado ninguna fila al repositorio, no se ha creado ninguna entidad y no se ha ejecutado ningún seeder. El bloqueo se refiere al pack recibido y a su compatibilidad con el contrato actual; no invalida los datos que puedan reexportarse con evidencia completa.

Comprobación reproducible:

```bash
node scripts/check-cambra-base44-pack.mjs /ruta/al/directorio-del-pack
node scripts/check-cambra-base44-pack.mjs /ruta/al/directorio-del-pack --json
```

El proceso termina con código distinto de cero mientras exista cualquier bloqueo.

## Recuentos observados

| Archivo | Filas | Observación |
|---|---:|---|
| `rates_merged.csv` | 548 | 30 países, 18 proveedores |
| `blocked.csv` | 9 | Debe permanecer fuera de toda tabla activa |
| `bancos_seed_v1.csv` | 36 | Coincide con el recuento anunciado |
| `linea_base_10.csv` | 41 | Solo 8 de los 10 mercados de lanzamiento |
| `contratos_seed_v1.csv` | 36 | El prompt solicita otro nombre de archivo |
| `surcharges_seed_v3.csv` | 22 | Tabla auxiliar todavía no definida en el repositorio |

## Bloqueos priorizados

### P0 — El export está truncado y no preserva evidencia

- En tarifas hay 83 citas con longitud exacta de 110 caracteres y 215 notas con longitud exacta de 110. Varias terminan a mitad de palabra o URL.
- En bancos hay 13 notas con longitud exacta de 100 y URLs que terminan en fragmentos como `/negoz` y `/termin`.
- En línea base aparecen topes repetidos de 60, 90, 110 y 20 caracteres en segmento, URL, cita y confianza.
- En contratos existe una URL de Worldline que termina en `.pd`.

Una fuente o cita truncada no permite reproducir la verificación. No debe completarse por inferencia ni corregirse manualmente durante una carga.

### P0 — Evidencia y procedencia incompletas

- Solo 320 de 548 tarifas tienen simultáneamente URL y cita.
- 115 filas declaradas `primary_verified` no contienen ni URL ni cita.
- 113 filas `report_table` carecen de ambas.
- 59 filas no tienen `provenance` y las 548 dejan `confidence` vacía.

Una etiqueta `primary_verified` sin evidencia completa no puede convertirse en `verified=true`.

### P0 — El CSV no cumple el esquema v4 que declara el propio prompt

- `rates_merged.csv` mantiene la columna `card_class`, aunque el prompt exige que deje de almacenarse.
- Hay 143 valores de `tier` fuera del enum declarado y 8 valores de `scheme` fuera de contrato.
- Hay booleanos con mayúsculas (`True`/`False`) y 12 valores condicionales en `comparison_eligible`; no son booleanos canónicos.
- `card_class` está vacío en las 548 filas, por lo que tampoco puede usarse como fuente de migración.

Los valores inválidos no deben mapearse silenciosamente a `any`: eso cambiaría el alcance económico de una tarifa.

### P0 — Incompatibilidad con las entidades actuales

`PaymentsRateTable` usa hoy un contrato distinto: `provider_slug`, `percent_bps`, `fixed_fee_minor_units`, `fixed_fee_currency`, `region`, `verified`, `source_url`, `source_quote`, `savings_band_pct` y una identidad `cohort_key`, entre otros. El pack aporta `provider`, `rate_bps`, `fixed_minor`, `fee_currency`, `cc` y un modelo de cuatro ejes. De los campos requeridos actuales, solo `tier` coincide por nombre, y sus valores tampoco coinciden con el enum vigente.

Las entidades `ProviderSurcharges`, `BankReference`, `MarketBaseline` y `ProviderContractTerms` no existen todavía. Es inseguro reutilizar entidades parecidas o mezclar esas columnas en `PaymentsRateTable`.

### P1 — Contrato de adjuntos incoherente

`PROMPT_1_DATOS.md` exige `B_contratos.csv`, pero el pack contiene `contratos_seed_v1.csv`. Ningún automatismo debe adivinar que son equivalentes.

### P1 — Cobertura incompleta del lanzamiento

`linea_base_10.csv` contiene CY, CZ, ES, GR, HR, IT, PL y PT. Faltan DE y GB respecto de los diez mercados activos declarados por `PROMPT_2_LAUNCH_10.md`.

## Contrato de reexportación obligatorio

Una nueva entrega solo podrá pasar a revisión de carga si cumple todo lo siguiente:

1. **Entrega inmutable y completa.** ZIP con UTF-8, CSV RFC 4180, finales de línea declarados y `manifest.json` con nombre exacto, SHA-256, número de filas, número de columnas y tamaño en bytes de cada archivo. No se admiten límites de longitud aplicados por celda.
2. **Nombres inequívocos.** El prompt, el manifiesto y el ZIP deben usar exactamente el mismo nombre para contratos. Debe elegirse `B_contratos.csv` o `contratos_seed_v1.csv`, no ambos como alias implícito.
3. **Recuentos declarados.** El manifiesto debe declarar 548 tarifas, 9 bloqueadas, 36 bancos, 41 líneas base, 36 contratos y 22 recargos, o explicar con un changelog firmado cualquier variación. También debe declarar 30 países y 18 proveedores en tarifas.
4. **Evidencia sin truncar.** Cada fila sembrable debe incluir URL absoluta, cita completa, fecha de consulta, procedencia y confianza. `primary_verified` exige URL y cita. Una URL debe poder validarse y una cita debe localizarse en la fuente.
5. **Enums canónicos.** `scheme`, `funding`, `issuer_region` y `tier` deben contener exclusivamente los valores del prompt, en minúsculas. Todo valor externo al enum debe resolverse en origen con un changelog; no se transformará a `any` automáticamente.
6. **Tipos canónicos.** Booleanos exclusivamente `true`, `false` o vacío cuando el esquema lo permita. Estados condicionales deben tener una columna y un enum propios. Importes en minor units deben ser enteros seguros y toda moneda ISO 4217 debe estar explícita.
7. **Esquema v4 real.** `card_class` no debe estar presente como columna persistida. Deben entregarse los cuatro ejes ortogonales y una especificación de clave estable que impida colisiones. El export debe incluir un diccionario de datos con tipo, nulabilidad, enum, unidad y semántica de cada campo.
8. **Tablas auxiliares separadas.** Recargos, bancos, líneas base y contratos deben tener claves, relaciones y reglas de acceso propias. Ninguno de sus campos puede mezclarse en `PaymentsRateTable`.
9. **Cobertura.** `MarketBaseline` debe cubrir ES, IT, PT, GB, GR, HR, DE, PL, CZ y CY, o marcar explícitamente el mercado sin evidencia como no sembrable. No se permiten ceros ni valores derivados para cubrir ausencias.
10. **Separación de bloqueadas.** Las 9 filas de `blocked.csv` deben llevar clave estable y motivo, no aparecer en el conjunto activo y no poder activarse por un upsert posterior.
11. **Mapa de migración aprobado.** Antes de cargar debe existir un documento campo-a-campo entre el esquema v4 y las entidades Base44, incluidas conversiones de nombres, unidades, claves y enums. Toda conversión debe ser determinista y probada.
12. **Carga reversible.** Primero dry-run sin escrituras, después entorno de staging con recuentos y pruebas de colisión, y por último aprobación humana. El seeder debe ser idempotente, registrar el hash del pack y abortar la transacción completa ante la primera discrepancia.

## Criterio de GO

El checker debe devolver `GO`, el mapa de migración debe estar aprobado, las cuatro entidades auxiliares deben existir con sus políticas de acceso, y un dry-run debe demostrar cero truncaciones, cero valores fuera de enum, cero evidencia requerida ausente, cero colisiones y cero filas de `blocked.csv` en el conjunto activo. Hasta entonces, el trabajo correcto es reexportar y validar; no sembrar.
