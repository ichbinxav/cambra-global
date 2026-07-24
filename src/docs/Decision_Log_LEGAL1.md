# Decision Log — LEGAL-1 (Coherencia legal: cookies reales, claims verificables, trilingüe)

**Fecha:** 2026-07-24 · **Regla rectora:** solo se afirma lo que se puede demostrar.
**Archivos tocados:** `src/content/legal/{en,fr,es}/{privacy,terms,cookies}.js` (nuevos), `src/pages/{Privacy,Terms,Cookies}.jsx`, `src/components/shared/LegalPageLayout.jsx`, este log. **Cero cambios en motor, funciones, entidades o banner de consentimiento** (el texto se alineó al comportamiento real del banner, no al revés).

---

## FASE 0 — Inventario verificado de almacenamiento en cliente

| clave | mecanismo real | quién la escribe (archivo:línea) | finalidad | duración | categoría |
|---|---|---|---|---|---|
| `cambra_anon_session` | **cookie** (Path=/, SameSite=Lax) | `PaymentsResults.jsx:280,405` (set) · borrada en `PaymentsResults.jsx:268`, `AuthContext.jsx:87` · leída en `AuthContext.jsx:78` | Transporta la sesión de análisis anónima a través del redirect de registro (rescate cross-tab/OAuth popup) | 30 min (`Max-Age=1800`) | Estrictamente necesaria |
| `cambra_pending_anon_session` | **localStorage** | `PaymentsResults.jsx:277,404` (set) · leída/borrada `AuthContext.jsx:74,86` | Mismo rescate, canal same-tab; se elimina al completar el claim | Hasta su uso | Estrictamente necesaria |
| `cambra_redirect_after_login` | **sessionStorage** | `App.jsx:117` (set) · leída `LoginGate.jsx:22`, `AuthRedirect.jsx:18` | Retomar la página destino tras login | Sesión de pestaña | Estrictamente necesaria |
| `cambra_cookie_consent` | **localStorage** | `CookieConsent.jsx:26` | Registra la elección de consentimiento + timestamp | Hasta borrado del navegador | Estrictamente necesaria |
| `cambra_lang` | **localStorage** | `i18n.jsx:150` (set) · leída `i18n.jsx:81` | Preferencia de idioma EN/FR/ES | Hasta borrado | Funcional |
| `cambra_copilot_open` | **localStorage** (NO cookie, como declaraba la página antigua) | `CopilotPanel.jsx:26` (set) · leída `:17` | Estado abierto/cerrado del panel asistente | Hasta borrado | Funcional |
| `cambra_chat_conv` | **sessionStorage** | `AdminChat.jsx:15` (set) · leída `:12` | Conversación activa del chat admin (solo admins) | Sesión de pestaña | Funcional |
| `base44_access_token` (+ alias legado `token`) | **localStorage** (verificado en `@base44/sdk/dist/utils/auth-utils.js:112-114`) | SDK de plataforma | Token de autenticación que mantiene la sesión | Hasta logout / borrado | Estrictamente necesaria |
| `node_lang` | **localStorage** (solo LECTURA, legado) | leída en `i18n.jsx:84` (`LEGACY_KEYS`); nunca se escribe | Migración de preferencia de idioma de versión anterior | N/A (solo se lee si existe) | Funcional |

**No son almacenamiento** (descartados del inventario): `cambra_c_logo_white_background` — es parte del nombre de archivo de una imagen (`CopilotPanel.jsx:47`), no una clave. `sidebar_state` — cookie del componente shadcn `ui/sidebar.jsx:20,66`, pero **ningún archivo importa ese componente** (grep de imports: vacío) → nunca se establece; excluida.

**Las 4 declaradas en la página antigua:**
- `cambra_session`, `cambra_csrf` — **NO existen en el código ni las pone la plataforma** (la auth de Base44 es token en localStorage, sin cookies de sesión/CSRF propias). Declaraciones fantasma → **eliminadas**.
- `cambra_consent` — nunca existió con ese nombre; el real es `cambra_cookie_consent` (y es localStorage, no cookie) → **corregida**.
- `cambra_copilot_open` — existe pero es **localStorage**, no cookie, y estaba mal categorizada → **reubicada**.

## FASE 1 — Cookies.jsx reescrita

- Tres tablas por **mecanismo real**: Cookies / localStorage / sessionStorage — la distinción que faltaba.
- Token de Base44 documentado (§4, primera fila).
- **Coherencia con el banner** (`CookieConsent.jsx`, sin tocar): ofrece "Accept all" + "Manage preferences" con toggles de analítica y marketing (necesarias siempre on), escribe `cambra_cookie_consent`, y **el rechazo no bloquea nada porque hoy no existe NINGÚN almacenamiento de analítica ni marketing** (grep: cero llamadas a gtag/plausible/posthog/analytics.track en src). El texto lo dice en claro (§6): la elección registrada solo tendrá efecto si esas herramientas se introducen, previa actualización de la política. Decisión: no se recortan los toggles del banner — registrar la preferencia es sobre-divulgación inocua; prometer granularidad inexistente en el texto no lo era.
- **"Last updated" era `new Date()`** (fecha dinámica diaria) tanto en Cookies.jsx:43 como en LegalPageLayout.jsx:42 → sustituido por constante en el contenido: **24 de julio de 2026** en las tres páginas.

## FASE 2 — Auditoría de claims (antes → después)

| # | Claim | Veredicto | Acción |
|---|---|---|---|
| P§5 | "Base44 … **EU region**" | NO DEMOSTRABLE (config de hosting no acreditable) | Eliminado; solo "application hosting & database". [REVISIÓN JURÍDICA] |
| P§6 | "**TLS 1.3** in transit, **AES-256** at rest" | NO DEMOSTRABLE (specs de infraestructura de terceros) | → "cifrado en tránsito y en reposo conforme a los estándares de nuestro proveedor de infraestructura" (misma calibración que /Security `sec_chip_2`/`sec_b4_body`) |
| P§6 | "credentials encrypted with **AES-256-GCM**, dedicated key" | **DEMOSTRABLE** — código propio: `oauthConnector/entry.ts:950-996` (WebCrypto AES-GCM, clave de 32 bytes `INTEGRATION_TOKEN_KEY`) | Conservado, reformulado "at the application level … never exposed to client code" |
| P§6 | "All data stored in **EU-based infrastructure**" | NO DEMOSTRABLE | Eliminado. [REVISIÓN JURÍDICA] |
| P§4 | "not used to **train provider models**" | DEMOSTRABLE **como claim atribuido** (términos API comerciales de Anthropic/OpenAI) | → "sus acuerdos estándar…, cuyas condiciones establecen que los datos enviados por API no se usan para entrenar sus modelos". Sin prometer ZDR (no contratado). Alcance precisado: se envían importes/comisiones/fechas/nombres de proveedor, nunca datos personales de clientes finales |
| P§5 | "each bound by **GDPR-compliant DPAs**" | NO DEMOSTRABLE hoy (DPA Anthropic en revisión final — deuda conocida) | → "each engaged under its respective data processing agreement". [REVISIÓN JURÍDICA] |
| P§8 | "deleted within **90 days**" | NO DEMOSTRABLE (no existe job de purga automática — deuda conocida) | → "without undue delay". [REVISIÓN JURÍDICA] |
| P§8 | Facturación 10 años (L123-22) | DEMOSTRABLE (obligación legal citada) | Conservado. [REVISIÓN JURÍDICA] confirmación de plazo |
| P§7 | "respond within 30 days" | Recalibrado a la fórmula legal | → "within one month, as required by Art. 12 GDPR" |
| P§2 | "usage **telemetry**" | NO DEMOSTRABLE (no hay telemetría; sí logs de servidor) | → "technical logs generated by normal platform operation" |
| P§9 | "strictly necessary **cookies** for authentication" | Incorrecto (el token es localStorage) | → "cookies y almacenamiento del navegador (localStorage/sessionStorage)" |
| P§10 | "we rely on **SCC (Decision 2021/914)**" | Parcialmente demostrable (mecanismo lo aporta cada proveedor) | → claim atribuido: "mecanismos previstos en el DPA de cada proveedor, como las SCC". [REVISIÓN JURÍDICA] |
| P badge | "Legal · **GDPR compliant**" | Autocertificación no demostrable | → "Legal · Privacy" |
| T§1 | "Hosting … **in EU-based infrastructure**" | NO DEMOSTRABLE | → "Hosting is provided by Base44." |
| T§9 (antigua) | "**Network directory**" | Describe una feature V1 desactivada (`/Network` → redirect a home) | **Sección eliminada**, resto renumerado (16→15) |
| T§7 | Success fee 25% / 24 meses / sin suscripción / auditoría gratis | DEMOSTRABLE (coincide con Pricing y el producto real) | Conservado verbatim |
| Demostrables conservados | Identidad SASU/SIREN, OAuth read-only (`stripeOAuthConnect`), propiedad de datos, CNIL/72h (obligación legal), lista de subencargados (todos con API keys configuradas: Anthropic, OpenAI, Resend, Stripe, Base44) | — | — |

**Coherencia con /Security:** verificada — Privacy ya no afirma nada más fuerte que `sec_chip_2` ("Encrypted in transit & at rest") ni `sec_b4_body` ("encrypted in transit (TLS) and at rest").

## FASE 3 — Trilingüe

**Mecanismo elegido:** bloques de contenido por idioma en `src/content/legal/{en,fr,es}/{privacy,terms,cookies}.js`, seleccionados por `useTranslation().lang` en la página. Justificación: el diccionario i18n (536 claves/idioma) es para cadenas de UI; ~40 párrafos legales × 3 idiomas lo hincharían y romperían la paridad de claves vigilada. Los archivos de contenido reutilizan el selector de idioma existente sin tocar `i18n.jsx` — la solución más simple que no rompe el patrón.

- EN = texto maestro; FR (vouvoiement) y ES (tuteo) son **traducciones**, no reinterpretaciones — mismo sentido jurídico, mismas cifras, mismos marcadores.
- Terminología: GDPR→RGPD, data controller→« responsable du traitement »/«responsable del tratamiento», sub-processor→« sous-traitant »/«encargado del tratamiento», SCC→« clauses contractuelles types »/«cláusulas contractuales tipo».
- CAMBRA GLOBAL SASU (SIREN 105 452 916, París) y el RGPD como marco, idénticos en las tres versiones.
- `LegalPageLayout` gana props `lastUpdated` y `backLabel` (constantes desde el contenido).

## VERIFICACIÓN FINAL

**Grep de contraste (bidireccional):** las 7 claves `cambra_*` del código están declaradas en la política; la política declara exactamente esas 7 + `base44_access_token` y `node_lang` (justificadas: SDK de plataforma y clave legada solo-lectura). Fantasmas eliminados — `grep -rn "cambra_session|cambra_csrf|\bcambra_consent\b" src` → **CLEAN**.

```
código → política: cambra_anon_session ✓ · cambra_pending_anon_session ✓ · cambra_redirect_after_login ✓
· cambra_cookie_consent ✓ · cambra_lang ✓ · cambra_copilot_open ✓ · cambra_chat_conv ✓
política → código: las 7 anteriores + base44_access_token (SDK plataforma, auth-utils.js:112)
+ node_lang (legado solo-lectura, i18n.jsx:84)
```

**Claims restantes:** `grep "TLS 1.3|AES-256 at rest|EU region|EU-based" src/pages src/content` → solo el comentario del changelog en `en/terms.js`. Cero claims no demostrables en texto visible.

**Render trilingüe:** las tres páginas leen `useTranslation().lang` (mismo contexto que alimenta el `LanguageSwitcher` de la navbar) y hacen fallback a EN; el cambio de idioma re-renderiza vía contexto React. Tablas con `overflow-x-auto` (patrón previo conservado) — sin desbordes.

**lint** → 0 errores · **vitest** → 454 passed / 2 skipped / 0 failed · **vite build** → EXIT=0.

## Puntos [REVISIÓN JURÍDICA] para el abogado

1. **Ubicación del alojamiento** — confirmar región real de Base44/AWS y, si es UE, reincorporar el claim con evidencia.
2. **DPAs de subencargados** — cerrar la revisión del DPA de Anthropic (deuda conocida) antes de afirmar "GDPR-compliant DPAs".
3. **Plazos de conservación** — fijar plazos concretos de supresión post-cuenta (hoy "sin dilación indebida" porque no existe purga automática) y validar el plazo de facturación de 10 años.
4. **Base jurídica del benchmarking** (interés legítimo, art. 6.1.f) — LIA (evaluación de interés legítimo) no documentada.
5. **Transferencias internacionales** — verificar SCC/DPF en los DPAs de Anthropic, OpenAI y Resend; el tratamiento de leads vía Apollo (outbound) carece de base legal documentada y NO está cubierto por esta política (deuda conocida, fuera de alcance de este chunk).
6. **Terms §11 (limitación de responsabilidad), §12 (desistimiento B2B), §14 (jurisdicción CMAP/París)** — validación por abogado francés.
7. **Derechos ARCO/RGPD** — no existe endpoint público para ejercicio de derechos (deuda conocida); hoy el canal es privacy@cambra.global.
8. **Consentimiento** — la elección vive solo en localStorage, sin persistencia en DB (deuda conocida): valorar si hace falta registro server-side como prueba de consentimiento.