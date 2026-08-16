# Decision Log — CAMBRA v0.98.0 Remediation R6

**Fecha:** 2026-08-14

**Chunk:** `R6 — Research intake, quarantine y verificación`

**Versión de apertura:** `0.98.0-rc.5`

**Versión de cierre:** `0.98.0-rc.6`

**Estado:** `REPOSITORY_INTAKE_COMPLETE_RUNTIME_REVERIFICATION_PENDING`

## 1. Decisión del founder que fija el alcance

El founder aclaró el 14 de agosto de 2026 que el corpus real y completo entregado contiene exactamente 11 originales físicos; no existen otras 25–26 investigaciones que deban esperarse. Esta decisión sustituye exclusivamente el supuesto numérico anterior de 25–26 fuentes. No convierte el contenido en verdad verificada ni autoriza ejecución, training o promoción automática.

El alcance canónico queda fijado en:

- 11 originales físicos Markdown;
- 9 documentos únicos por SHA-256;
- 2 duplicados exactos;
- 260 chunks reproducibles.

Los duplicados exactos observados son `deep-research-report 4.md == deep-research-report 10.md` y `deep-research-report.md == deep-research-report 7.md`.

## 2. Integración local y límites de confianza

El importador preserva bytes, nombre, capture date, SHA-256, line count, headings, chunks, URLs y citas opacas. La capa normalizada contiene 31 candidatos y 9 conflictos. Cada registro permanece `UNVERIFIED_EXTERNAL_RESEARCH` y tiene bloqueados explícitamente:

- ejecución;
- model input;
- calibración;
- promoción automática;
- training.

La integración local completa significa que el repositorio conoce y puede reproducir el corpus entregado. No significa que sus afirmaciones, citas o conclusiones hayan sido verificadas externamente.

## 3. Gaps que permanecen abiertos

`external_source_reverification` y la detección de near-duplicates permanecen `NOT_RUN`; hay 323 citas opacas que requieren recuperación de URL. La taxonomía de 25 áreas temáticas conserva sus estados reales —14 `PARTIAL`, 10 `MISSING` y una `ARTIFACT_MISSING`— sin confundir cobertura temática con número de ficheros.

R9 referencia un paquete no retenido, `CAMBRA_E33_Payments_Economics_2026-08-13.zip`, junto con `00_INDEX_CAMBRA_E33.md`, `METHODOLOGY.md`, `MANIFEST.csv` y 33 dossiers nacionales. Ese material no forma parte del corpus físico entregado y no se reconstruye. `research-conflict:r9-missing-package` continúa `OPEN_ARTIFACT_RECOVERY_REQUIRED`; Country Payments Economics 33/33 sigue incompleto.

## 4. Evidencia y gates R6

El contrato generado exige exactamente 11 físicos, 9 únicos y 2 duplicados. El gate R6 solo puede pasar para `REPOSITORY_INTAKE_ONLY`; conserva `production_seal_eligible=false` y la reverificación runtime/externa pendiente.

Resultados de cierre observados sobre `0.98.0-rc.6`:

- `research:check`: 11 originales, 9 únicos, 2 duplicados, 260 chunks; 31 candidatos, 9 conflictos, 0 ejecutables y 0 training;
- `remediation:r0:check`: inventario de research ligado al alcance exacto del founder;
- `remediationR0Artifacts`: contrato de conteo, tamper, confianza y R9 incompleto;
- `verify:chunk`: PASS — 247 archivos de test, 3.111 tests, 0 fallos; build Vite PASS; bundle Base44 276 funciones físicas / 27 rutas lógicas / 2.853 archivos staged.

## 5. Estado OTR y seals

ROOT-OTR-017 y ROOT-OTR-018 permanecen `PARTIAL / PASSED_LOCAL / LOCAL_FAILURE_INJECTION / NOT_MET`. El writer universal de decisiones de elegibilidad, el dataset gate, la reverificación externa y la evidencia runtime siguen ausentes.

Los 20 OTR permanecen `NOT_MET`, los ocho root seals permanecen `NOT_SEALED` y `productionSealEligible=false`. R6 no emite un research seal, knowledge seal ni production seal.

## 6. Conducta de producción

No se desplegó, envió, activó, purgó, entrenó ni mutó producción. Tras pasar el gate local exacto, R7 puede abrirse únicamente para generar una v0.98.0 reproducible y un ZIP verificado que conserve todos estos blockers; nunca para presentar el corpus o el release como production-sealed.
