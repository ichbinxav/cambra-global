# Decision Log — CAMBRA v0.98.0 Remediation R1

**Fecha:** 2026-08-13

**Chunk:** `R1 — P0 reales de producto, tenant, deploy y privacidad`

**Versión de apertura:** `0.98.0-rc.0`

**Versión de cierre:** `0.98.0-rc.1`

**Estado:** `REPOSITORY_REMEDIATED_RUNTIME_PENDING`; no es un production seal ni evidencia live

## 1. Baseline al abrir

R1 se abrió únicamente después del `verify:chunk` verde de R0. El recibo de cierre R0 registró 1.733 ficheros source, 229 test files, 2.774 tests PASS, 0 skips, 276 funciones físicas, 27 rutas lógicas y 2.704 ficheros staged. El árbol seguía deliberadamente dirty porque contiene el trabajo acumulado del usuario y de los MASTER SPECS; se preservó sin `reset`, `checkout`, borrado amplio ni reescritura destructiva.

No se confió en cifras truncadas del prompt. Cada identidad final de este chunk se vuelve a calcular mediante los selectores y builders canónicos.

## 2. Decisiones aplicadas

### 2.1 Una autoridad de mercado 33/30/3

La decisión del founder se materializó como autoridad versionada y generada:

- registro canónico exacto: `AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE, NO, IS, LI, CH, GB, AD`;
- 30 mercados activos exactos, con `ES` incluida;
- mercados protegidos exactos: `FR`, `BE`, `NL`;
- estado de la decisión: `FOUNDER_DECIDED`;
- protected significa research-only, nunca launch-active;
- un ISO2 desconocido, un país protegido o una región aportada manualmente se bloquea en backend;
- la región económica se deriva server-side sin cambiar el motor tarifario: `GB → UK`, `AD → RoW`, demás mercados canónicos → `EU`;
- pertenecer a los 30 no habilita capacidades reguladas ni outbound; outbound continúa en cero.

Frontend y backend se generan del mismo origen y se comparan byte a byte. El seed reconcilia `FR/BE/NL` como `REGULATORY_HOLD`/research-only y no los presenta como lanzados.

### 2.2 Claim anónimo con autoridad CAS durable

`PaymentsAnalysisSession` es la autoridad única del claim. El email normalizado de la sesión debe coincidir con el usuario autenticado; target inexistente, email ausente y ownership ajeno producen una respuesta no enumerable. La claim se adquiere con revisión, token y owner antes de cualquier materialización.

Dos claimants concurrentes no pueden ganar el mismo UUID. El perdedor no crea, borra ni modifica `AnalyzerResult`, `Brand` o `IntelligenceSnapshot`. Un fallo después del claim conserva el owner y deja estado resumible/reconciliable; no libera la sesión a otro usuario. `AnalyzerResult` e `IntelligenceSnapshot` enlazan la autoridad canónica y el replay del mismo owner es idempotente.

Se eliminó la garantía falsa `create → elegir oldest → borrar perdedores`.

### 2.3 Pipeline Base44 reproducible

`base44/config.jsonc` consume `base44/.deploy/functions`; cada wrapper de deploy ejecuta primero el bundle y usa el CLI local fijado `base44@0.1.5` mediante `npx --no-install`. No se descargan versiones implícitas ni se usa `latest`.

El manifest del bundle liga config, topología y staged tree. El release payload incluye el bundle físico ignorado por Git. El empaquetador reextrae el ZIP y verifica source, topology, config, manifest y bundle; además reconstruye el bundle de forma determinista desde un checkout limpio sin `.deploy`. CI conserva `.deploy` como artifact. La documentación diferencia correctamente 300 directorios source de 276 funciones físicas y 27 rutas lógicas.

No se ejecutó ningún deploy, push o smoke live. Esos pasos permanecen `RUNTIME_PENDING`.

### 2.4 Rate limit sin IP cruda

Las seis fronteras públicas (`getPaymentsGapTeaser`, `submitContactMessage`, `submitWaitlistSignup`, `joinCollective`, `submitCallRequest`, `submitPaymentsAnalysis`) derivan un fingerprint HMAC-SHA-256 domain-separated y versionado con forma `rlh:<key-version>:<digest>`.

El secreto debe tener al menos 32 caracteres y su versión es obligatoria. El header de proxy está allowlisted; `X-Forwarded-For` solo se acepta si se configura explícitamente y se toma el hop derecho que debe controlar el proxy de plataforma. IPv4, IPv6 y bracket+port se normalizan en memoria. El secreto ausente o una configuración ambigua devuelven `503` antes de cualquier write. Durante rotación se consumen los buckets current y previous, de modo que cambiar de clave no reinicia el allowance.

`RateLimitCounter` es service-role-only, no admite principal `ip` y tiene retención de dos días. Los logs técnicos guardan fingerprint/version, no dirección. `PURGE-2` no se ejecutó y queda pendiente con receipts de runtime.

En `submitPaymentsAnalysis` el orden material es: market gate → HMAC rate limit → receipt SLO → referral → session/materialización.

### 2.5 Credenciales Integration server-only y pruebas tenant

Se reutilizó la entidad existente `IntegrationCredential`; no se creó otro vault o plano. La entidad quedó service-role-only y guarda únicamente ciphertext AES-GCM versionado. `Integration` conserva metadata y sus campos legacy quedan deprecados.

El boundary compartido exige binding exacto `integration_id + brand_id`, detecta duplicados/filas foráneas y falla cerrado. Create, read, rotate y revoke verifican persistencia mediante readback. Las filas legacy se migran lazy en una lectura gobernada y solo se limpian después de persistir y releer exactamente la nueva autoridad. Las respuestas de status proyectan metadata y nunca serializan tokens.

No se ejecutó migración de datos live. El schema y la migración real permanecen `RUNTIME_PENDING`.

El inventario generado contiene 39 fronteras tenant: 21 con shared gate ejecutable, 5 con pure gate ejecutable, 12 source-observed y una ruta físicamente ausente. Resultado honesto: 26 `PASSED_LOCAL`, 13 `NOT_RUN`, 39 `PARTIAL`, 39 `NOT_MET`, 0 `CLOSED`, 0 `RUNTIME_VERIFIED`. `resolveOwnedActivation` devuelve el mismo 404 no enumerable para actor ajeno/desconocido/target inexistente y 503 ante lecturas ausentes, duplicadas o ambiguas.

## 3. Archivos modificados por R1

### Mercado y producto

- `scripts/generate-europe-markets.mjs`
- `config/europe-markets.json`
- `base44/shared/generated/europeMarkets.ts`
- `src/lib/generated/europeMarkets.js`
- `base44/shared/marketLaunchScope.ts`
- `base44/functions/submitPaymentsAnalysis/entry.ts`
- `base44/functions/seedEuropeMarketFoundation/entry.ts`
- `src/lib/publicExperience.jsx`
- `src/pages/PaymentsAnalyzer.jsx`
- `src/lib/marketLaunchScope.test.js`
- `src/lib/publicExperience.test.js`
- `src/lib/p1EuropeMarketFoundation.test.js`

### Claim anónimo

- `base44/entities/PaymentsAnalysisSession.jsonc`
- `base44/entities/AnalyzerResult.jsonc`
- `base44/entities/IntelligenceSnapshot.jsonc`
- `base44/shared/anonymousPaymentsClaim.ts`
- `base44/functions/claimAnonPaymentsResult/entry.ts`
- `src/lib/anonymousPaymentsClaim.test.js`

### Pipeline Base44 y packaging

- `.github/workflows/ci.yml`
- `ci/github-workflow-ci.yml`
- `base44/config.jsonc`
- `base44/deployment-topology.json`
- `scripts/lib/base44Bundle.mjs`
- `scripts/build-base44-functions.mjs`
- `scripts/base44-runtime-smoke.ts`
- `scripts/lib/releasePayload.mjs`
- `scripts/generate-release-manifest.mjs`
- `scripts/check-release-manifest.mjs`
- `scripts/package-release.mjs`
- `package.json`
- `package-lock.json`
- `README.md`
- `src/README.md`
- `src/docs/BASE44_BACKEND_DEPLOYMENT_TOPOLOGY.md`
- `src/lib/base44DeploymentTopology.test.js`
- `src/lib/base44ReproduciblePipeline.test.js`
- `src/lib/releasePayload.test.js`

### Privacidad, rate limit y retención

- `base44/shared/rateLimit.ts`
- `base44/entities/RateLimitCounter.jsonc`
- `base44/entities/ApiActivityLog.jsonc`
- `base44/entities/ApiKey.jsonc`
- `base44/entities/OAuthToken.jsonc`
- `base44/functions/getPaymentsGapTeaser/entry.ts`
- `base44/functions/submitContactMessage/entry.ts`
- `base44/functions/submitWaitlistSignup/entry.ts`
- `base44/functions/joinCollective/entry.ts`
- `base44/functions/submitCallRequest/entry.ts`
- `base44/functions/apiV1/entry.ts`
- `base44/functions/mcpServer/entry.ts`
- `base44/functions/runApiSelfTests/entry.ts`
- `base44/shared/retentionPolicy.ts`
- `config/data-retention-matrix.json`
- `scripts/check-data-retention.mjs`
- `env.example`
- `src/lib/rateLimit.test.js`
- `src/lib/retentionPolicy.test.js`

### Credenciales y tenant proof

- `base44/entities/Integration.jsonc`
- `base44/entities/IntegrationCredential.jsonc`
- `base44/shared/integrationCredentials.ts`
- `base44/functions/oauthConnector/entry.ts`
- `base44/functions/dataSyncAgent/entry.ts`
- `base44/functions/maintenanceEngine/entry.ts`
- `base44/functions/stripeConnectionDisconnect/entry.ts`
- `base44/functions/getIntegrationStatus/entry.ts`
- `base44/shared/recoverAcceptance.ts`
- `scripts/generate-remediation-r0.mjs`
- `scripts/check-remediation-r0.mjs`
- `config/remediation/material-boundary-registry.v1.json`
- `config/remediation/material-tenant-authorization-inventory.v1.json`
- `src/lib/integrationCredentialBoundary.test.js`
- `src/lib/materialTenantAuthorization.test.js`
- `src/lib/remediationR0Artifacts.test.js`

### Evidencia del chunk

- `base44/shared/documentationRegistry.ts`
- `scripts/generate-documentation-manifest.mjs`
- `config/documentation-drift-manifest.json`
- `config/release-touch-list.json`
- `config/p1-durability-manifest.json`
- `src/docs/Decision_Log_REMEDIATION_R1.md`

No se añadió ninguna función física, ruta lógica o entidad. `IntegrationCredential` ya existía. Los outputs de `base44/.deploy` se regeneraron exclusivamente con el builder canónico.

## 4. Frozen, ECL y cambios excluidos

No se modificó semántica ECL, copy público, pricing ni el motor económico/tarifario. Un intento transitorio de aplicar HMAC a evidencia Recover se revirtió antes del cierre para respetar el scope. No quedó cambio material en ese contrato.

No se modificó ningún fichero frozen mediante acceso directo y no se ejecutó `scripts/update-freeze.mjs`. No hubo freeze token ni cambio frozen sancionado en R1.

## 5. Tests locales

Suites focales reproducibles:

- mercado 33/30/3 y adapters: 3 files / 70 tests PASS;
- anonymous claim: 14 casos focales; regresión relacionada 5 files / 98 tests PASS;
- clean checkout, bundle y ZIP: 22 tests PASS, incluido checkout real 7/7;
- HMAC/retención/orden pre-write: 7 files / 43 tests PASS;
- Integration credential boundary: 7/7; regresión 6 files / 35 tests PASS;
- tenant/material authorization: 15 files / 195 tests PASS; focal final 4 files / 64 tests PASS.

`lint`, typecheck crítico, typecheck completo, checks de mercados/retención/CI, diff check y los bundles focales pasaron. El CLI local quedó fijado y comprobado como `0.1.5`. La auditoría de dependencias ejecutada con red autorizada informó 745 dependencias y 0 vulnerabilidades conocidas.

El resultado canónico de `npm run verify:chunk` se registra en la sección 8 después de ejecutar el árbol final del chunk.

## 6. OTR y seals

R1 refuerza especialmente la base de `ROOT-OTR-001`, `ROOT-OTR-012`, `ROOT-OTR-013` y `ROOT-OTR-019`, pero no cumple sus criterios universales ni aporta evidencia live. Ninguna fila se marca `CLOSED`.

- 20/20 OTR: cierre binario `NOT_MET`;
- 8/8 root seals: `NOT_SEALED`;
- `productionSealEligible=false`;
- veredicto: `NOT_GO_READY`;
- tests locales no se proyectan a `RUNTIME_VERIFIED`.

## 7. RUNTIME_PENDING y blockers

- deploy físico Base44 sobre final SHA;
- aplicación live del schema `IntegrationCredential` y migración/verificación de filas legacy;
- autenticación del CLI y smoke remoto;
- comprobación remota de 276 funciones y redeploy unchanged;
- receipts de ejecución de retención y `PURGE-2` — no ejecutado;
- rotación live del secreto HMAC y prueba del proxy/header real;
- pruebas de autorización sobre datos tenant reales;
- completitud de las 12 fronteras tenant source-only y la ruta dataset ausente;
- provider/runtime receipts, SLOs y paridad de identidad;
- todo blocker OTR heredado de R0.

Outbound continúa pausado. No se envió email, activó campaña, desplegó, publicó, rotó secretos ni mutó producción.

## 8. Gate final e identidad

La primera ejecución completa descubrió dos residuos locales y no se presentó como PASS:

- `silent-failures:check` detectó tres `.catch(() => null)` en `claimAnonPaymentsResult`; se sustituyeron por fallos observables y reconciliación explícita;
- la ejecución siguiente encontró un assert estático que aún buscaba `checkRateLimit` y el inventario generado de creators `AgentTask` stale; se actualizó el test al boundary HMAC real y se regeneró el inventario.

Tras cada corrección se repitieron los tests focales y se regeneraron remediation, documentación y durabilidad. La repetición completa final terminó con exit code `0`:

```text
toolchain:check PASS — Node 24.19.0, npm 11.17.0
markets:check PASS — 33 canonical · 30 active · 3 protected
dependency:audit PASS — 745 dependencies, 0 known vulnerabilities
base44:functions:bundle PASS — 276 physical functions, 27 logical routes, 2714 staged files
intelligence-canonical-v2:check PASS — 20/20 OTR NOT_MET · 8/8 root seals NOT_SEALED
remediation-r0:check PASS — 39 material boundaries · 39 tenant rows · 0 closed · 0 runtime-verified
Test Files 235 passed (235)
Tests 2827 passed (2827)
skips 0
build PASS
verify:chunk exit 0
```

Delta de tests R0→R1: 229→235 test files, 2.774→2.827 tests, 0→0 skips. No se redujo ninguna suite.

Identidad observada antes de insertar este recibo en el propio decision log:

| Artefacto | Recuento | SHA-256 completo |
|---|---:|---|
| Source tree `sha256-tree-v1` | 1.745 | `bb050a8e848f11d2ccbe8829a0089f8cdccc9c2566b86b1e17a969930620ef0b` |
| Deployment topology | 276 físicas / 27 lógicas | `a69dadd587f189c15e09be16d3311fa1ff290333496ff5b3007b55b2e0b972d8` |
| Bundle staged | 2.714 | `7dbf7b5c7b23d057e977cbce9810d65eb9efc0cf6912a923954142b2d2154a49` |
| Bundle manifest | n/a | `d7596ce79ccee09f9a96d81167dded87f42f0afd3288b2b48b7ce82fc3fffc7f` |
| Scheduler inventory | 69 / 67 / 67 | `a13aff3b45e7acd3e996775402972a1623e2372950d3f76679da886390c5bc64` |
| Lockfile | n/a | `4468b7efbafcf72f82f774042f8c1d3166d828db75b56cd9f93eef1a9a1e59d2` |

El source hash es un recibo point-in-time: escribirlo dentro de un documento que pertenece al source tree cambia el propio árbol. La identidad release autoconsistente se genera únicamente en R7 con el mecanismo canónico; R1 no genera `RELEASE.json`, no empaqueta release y no emite seal.
