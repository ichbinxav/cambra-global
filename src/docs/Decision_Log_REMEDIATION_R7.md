# Decision Log — CAMBRA v0.98.0 Remediation R7

**Fecha:** 2026-08-14

**Chunk:** `R7 — composición final, evidencia y paquete verificable`

**Versión de apertura:** `0.98.0-rc.6`

**Versión de cierre:** `0.98.0`

**Estado:** `FINAL_REPOSITORY_PACKAGE_CANDIDATE`

## 1. Resultado compuesto

R7 compone los cambios R0–R6 mediante un pipeline reproducible en un paquete v0.98.0 autoverificable. La autoridad de mercado conserva 33 mercados canónicos, 30 activos y tres protegidos contra activación: Francia, Bélgica y Países Bajos. España permanece activa. Los tres mercados protegidos siguen visibles para research y no se promueven mediante fallbacks o configuración manual.

El corpus completo declarado por el founder queda fijado en 11 originales físicos, 9 SHA-únicos y 2 duplicados exactos. Todos permanecen `UNVERIFIED_EXTERNAL_RESEARCH`; ejecución, model input, calibración, promoción automática y training continúan bloqueados. La reverificación externa, los near-duplicates y el paquete R9 de Country Payments Economics siguen pendientes.

## 2. Significado exacto de «sealed»

El artefacto R7 se sella localmente mediante una identidad reproducible del source tree, verificación del bundle Base44, extracción del ZIP, reconstrucción byte-idéntica del bundle incluido y recibos externos `.sha256` e `.integrity.json`. Ese sello prueba integridad del paquete entregado; no prueba despliegue ni comportamiento de producción. Los timestamps y duraciones de la evidencia pertenecen a cada gate, por lo que dos ejecuciones independientes no se presentan como ZIP byte-idénticos.

`productionSealEligible` permanece `false`. Los 20 ROOT-OTR permanecen `NOT_MET` y los ocho root seals canónicos permanecen `NOT_SEALED`. No se transforma evidencia local, mocks o inyección de fallos en una garantía de proveedor o runtime real.

## 3. Identidad y empaquetado

La versión declarada en `package.json` y `package-lock.json` es `0.98.0`. `RELEASE.json` se genera desde el árbol y la evidencia ejecutada; no se edita para elevar readiness. El empaquetador incluye la fuente canónica y `.deploy`, valida el ZIP extraído, compara topology/config/manifest/tree y reconstruye el bundle determinista.

El hash SHA-256 del ZIP no se escribe dentro del propio ZIP para evitar identidad circular. Se entrega fuera del archivo en los sidecars generados por `release:package`.

## 4. Gates de cierre

Antes de emitir el paquete final se ejecutan, sobre el candidate exacto:

- toolchain Node `24.19.0` y npm `11.17.0`;
- freeze/ECL, durability, documentación, mercados, research, scheduler, AgentTask, workforce, planos operativos, retención, secretos y errores públicos;
- dependency audit, bundle Base44, CI source contract, Intelligence Canonical y remediaciones R0/R4/R5;
- ESLint, typecheck crítico y general, Vitest completo y build Vite;
- generación y replay canónico de `RELEASE.json`;
- reextracción del ZIP y reconstrucción determinista del bundle incluido.

Los totales y hashes finales se obtienen del gate y de los sidecars; no se anticipan ni se inventan en este log.

## 5. Blockers que conserva v0.98.0

- falta evidencia CI remota y deploy parity del SHA/árbol/bundle final;
- no existen receipts runtime completos para SLO, scheduler contention, providers, billing, restore y Emergency Stop;
- delivery/reconciliation real de Outlook, Resend, Instantly, Stripe y webhooks permanece pendiente;
- no se ejecutaron schema migration, backfill legacy, PURGE-2 ni live-data drills;
- R9 Country Payments Economics no está retenido y no se reconstruye;
- los gaps parciales enumerados por los inventarios OTR permanecen abiertos.

Estos blockers obligan a `readinessLevel=NOT_GO_READY`, `finalVerdict=NOT_GO_READY` y `productionSealEligible=false` en una generación local.

## 6. Conducta de producción

R7 no despliega, envía, activa, purga, migra, entrena ni muta producción. La autenticación local de Base44 solo demuestra disponibilidad del CLI; no se ejecuta `functions deploy`, `site deploy`, smoke de producción ni ninguna llamada live.

El resultado autorizado es un handoff local autoverificable de v0.98.0, producido por un pipeline reproducible; no es un production seal.
