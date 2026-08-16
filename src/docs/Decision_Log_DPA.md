# Decision Log — DPA público, subencargados y aceptación con evidencia

**Fecha:** 2026-08-16 · **Prompt:** PROMPT_DPA_LEGAL_V1.md · **Estado:** implementado, texto PENDIENTE DE REVISIÓN JURÍDICA.

---

## C0 — lo que se encontró antes de tocar nada

| Punto | Hallazgo verificado |
|---|---|
| Contenido legal | `src/content/legal/{en,es,fr}/{terms,privacy,cookies}.js`, patrón `{badge,title,lastUpdated,back,sections[]}`. Inglés = maestro (LEGAL-1). |
| Layout | `LegalPageLayout.jsx` para páginas de secciones; `Cookies.jsx` usa el shell directamente por tener tablas. |
| Aviso de revisión | **Ya existía**: el layout pinta `legal_review_badge` + `legal_review_notice` en TODAS las páginas legales. |
| Rutas | `src/App.jsx`, patrón capitalizada + redirect en minúsculas. |
| Footer | `PublicFooter.jsx`, claves i18n `footer_privacy` / `footer_terms`. |
| **Aceptación de términos** | **NO EXISTE NINGUNA.** `Onboarding.jsx` no tiene nada. `LoginGate.jsx` solo muestra texto pasivo ("al continuar aceptas…") con enlaces — *browsewrap*, sin casilla y sin registro. `ConsentRecord` es consentimiento OAuth de proveedor, no legal. Nadie podía responder "qué versión aceptó este cliente y cuándo". |
| Patrón de evidencia reutilizable | `Mandate` + `acceptRecoverMandate`: `signed_by_email`, `signed_at`, `ip_address`, `user_agent`, `document_version`, `acceptance_snapshot_hash`. |
| Subencargados reales | `privacy.js` §5 **ya declara** la lista: Base44, Anthropic PBC, OpenAI, Resend Inc., Stripe Payments Europe Ltd. Corroborada en código (`api.anthropic.com` y `api.openai.com` en `processUploadedFile`; `api.resend.com` en `commercialSendMessage`/`resendInboundWebhook`; `api.stripe.com`; Base44 = hosting según Terms §1). |
| R5 | 276 funciones físicas = objetivo exacto de `deployment-topology.json`. Un directorio nuevo rompe `base44:functions:check` → obligatorio usar ruta lógica. |

---

## Fase A — página /Dpa

Publicado `DPA_MAESTRO_CAMBRA_ENCARGADO_ES.md` v1.0 en `{en,es,fr}/dpa.js` + `src/pages/Dpa.jsx` + rutas + `footer_dpa`.

**Valores fijados de los placeholders** (el maestro los traía entre corchetes; se publican sin corchetes):

| Placeholder del maestro | Valor publicado | Dónde |
|---|---|---|
| `[30] días` preaviso de subencargados | **30 días** | §7.2 |
| `[48] horas` notificación de brechas | **48 horas** | §9.2 |
| `[15] días laborables` preaviso de auditoría | **15 días laborables** | §10.2 |
| `[una] vez por año natural` | **una vez por año natural** | §10.2 |
| `[90] días` supresión tras terminación | **90 días** | §12.2 |

Un test comprueba que no queda ningún `[n]` renderizado en la página.

**NO publicado:** `DPA_MAESTRO_CAMBRA_RESPONSABLE_ES.md` (plantilla que CAMBRA hace firmar a sus proveedores). Publicarla tergiversaría la relación con el cliente. Registrado como `published_at: null` en `config/legal/dpa-status.json` y bloqueado por test.

---

## Fase B — página /Subprocessors (Anexo III)

Fuente de verdad, en este orden: (1) `privacy.js` §5 — lo ya declarado públicamente; (2) el código que llama a cada proveedor. **Nada inventado.**

**Tabla 1 — subencargados del servicio (CONFIRMADOS):** Base44, Anthropic PBC, OpenAI, Resend Inc., Stripe Payments Europe Ltd.

**Tabla 2 — otros proveedores hallados en el código, NO declarados subencargados:** Microsoft (Graph/Outlook), Instantly, Apollo, Perplexity. Sirven la prospección propia de CAMBRA (CAMBRA como responsable, no como encargado del cliente). Se publican como `PENDIENTE DE REVISIÓN JURÍDICA` en vez de afirmar o esconder su calificación.

**Huecos publicados como pendientes, no rellenados:**
- **Región de alojamiento de Base44 y su instrumento de transferencia.** CAMBRA no la publica: la afirmación "EU-based infrastructure" se eliminó deliberadamente de Terms §1 durante LEGAL-1 por no ser demostrable. No se puede afirmar un mecanismo de transferencia para la capa de hosting.
- **Instrumento concreto de transferencia** de cada proveedor estadounidense (privacy §10 dice "cláusulas contractuales tipo" genéricamente).

**Hallazgo abierto para revisión legal** (`open_findings` en el config): privacy §5 describe a Resend como "transactional email delivery", pero en el código el correo al comerciante (welcome, newsletter, collective) sale por `Core.SendEmail` de Base44, mientras Resend se usa en `commercialSendMessage` y `resendInboundWebhook`. No es falso, es impreciso sobre qué flujo va por dónde.

---

## Fase C — incorporación por referencia y aceptación

### Incorporación: §5 bis, no renumeración

Los Terms se citan a sí mismos ("Section 7", "Section 7(c)", "Section 14"). Insertar una sección §6 y correr 6→7…16→17 habría roto esas citas en tres idiomas. Se insertó **§5 bis** justo después de §5 (Propiedad de los datos), que es donde el prompt la pedía: cero renumeración, cero citas rotas. La numeración *bis* es práctica estándar en redacción jurídica francesa y CAMBRA es sociedad francesa. Un test verifica que §7, §14 y §16 siguen existiendo y que las citas internas siguen resolviendo.

`lastUpdated` de los Terms actualizado a 2026-08-16 en los tres idiomas, y añadido campo `version: "2026-08-16"` (antes no tenían versión: la aceptación necesita registrar *cuál*).

### Aceptación: gate autenticado, no casilla en LoginGate

**Decisión y por qué se apartó de la letra del prompt.** El prompt sugería la casilla en Onboarding o LoginGate. La autenticación la aloja Base44 y **sale de la aplicación**: una casilla en LoginGate solo podría guardar una intención en `localStorage` y confiar en que sobreviva el viaje de ida y vuelta, y en ese momento no hay identidad a la que vincular la evidencia. Se colocó en el **primer render autenticado dentro de la app** (`ProtectedRoute` → `LegalAcceptanceGate`): es el punto más temprano donde la aceptación se puede vincular a una identidad real y persistir con evidencia observada en servidor, y cubre **todas** las vías de entrada, no solo el claim del análisis anónimo.

**Piezas:**
- `base44/entities/LegalAcceptance.jsonc` — evidencia durable. RLS: lectura propia o admin; **escritura solo admin** (nunca cliente directo).
- `base44/shared/legalAcceptance.ts` — módulo puro: versiones vigentes, validación *fail-closed*, construcción del registro.
- Acción `record_legal_acceptance` **alojada en `claimAnonPaymentsResult`** (R5: ruta lógica `recordLegalAcceptance` en `deployment-topology.json`, 28 rutas). Es también el anfitrión correcto por el fondo: ese endpoint es donde un visitante anónimo se materializa en titular de cuenta (crea el Brand).
- `src/lib/legalVersions.js` — espejo en frontend (el bundle no puede importar el módulo Deno). La duplicación es riesgo real, por eso el test la ata a las tres fuentes.

**Garantías:**
- Casilla **no marcada por defecto**; el botón está deshabilitado hasta marcarla.
- Se muestran las **versiones exactas** que se aceptan, no ocultas tras los enlaces.
- `email`, `accepted_at`, `ip_address` y `user_agent` se observan **en servidor**; nunca se leen del cuerpo de la petición.
- Versión obsoleta o desconocida → **rechazada** (`terms_version_stale`), no registrada como aceptación de la vigente.
- Idempotente: reaceptar las mismas versiones no duplica el registro legal.
- **FAIL CLOSED:** si la evidencia no se persiste (o la autoridad no responde), el backend devuelve 503 y el gate **no deja entrar** y muestra el error. Verificado por mutación: al hacer que el gate ignore el fallo de persistencia, el test correspondiente falla.
- El fallo de **lectura** no bloquea (solo vuelve a preguntar; reaceptar es idempotente). Bloquear a un cliente por un fallo de lectura sería un candado contra el usuario, no contra el riesgo.

---

## Fase D — control de revisión

`config/legal/dpa-status.json`: `legal_review: PENDING` para el DPA y para la lista de subencargados, ambos con `blocking_for_production_seal: true`. **No se afirma en ningún sitio que la revisión haya ocurrido.** El founder debe pasar el texto por abogado antes del sello de producción. Un test falla si alguien cambia el estado sin querer.

Las páginas no llevan banner de borrador propio porque el layout compartido **ya** muestra el aviso de estado de revisión en todas las páginas legales; `Subprocessors.jsx` lo pinta explícitamente al construirse sobre el shell.

---

## Cambio de infraestructura de test

`vitest.config.js` no declaraba runtime JSX, así que los tests compilaban con el runtime clásico mientras la app se construye con `@vitejs/plugin-react` (automático). Consecuencia: cualquier test de render en jsdom fallaba con "React is not defined" en componentes que la app renderiza sin problema — artefacto del entorno de test, no defecto real. Se añadió `esbuild: { jsx: 'automatic' }`. Los componentes que ya importaban React no se ven afectados.

---

## Fuera de alcance, respetado

No se tradujo el DPA a los otros ~19 idiomas (tanda aparte cuando el texto maestro tenga revisión legal). No se tocó pricing, mandato Recover ni ninguna otra sección de los Terms más allá de §5 bis. No se publicó el maestro de Responsable. No se desplegó nada.
