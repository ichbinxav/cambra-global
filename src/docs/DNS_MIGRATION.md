# DNS Migration — `cambra.global` apex from OLD app → NEW app

**Fecha:** 2026-07-12 (v2 · post-review Xavi) · **Registrar:** IONOS · **Target:** apex `cambra.global` + `www.cambra.global`
**Panel donde vive el dominio:** IONOS **Domains & SSL** (panel clásico), NO IONOS Cloud DNS.

**Changelog v2:**
- **v1 recomendaba ANAME/ALIAS en apex → RETIRADO.** El panel clásico de IONOS Domains & SSL no expone ALIAS/ANAME (esa opción existe solo en IONOS Cloud DNS, un producto distinto). La estrategia oficial pasa a ser A record al IP estática que Base44 publica.
- **`base44.onrender.com` como target del CNAME → MARCADO PENDIENTE.** El valor autoritativo lo debe emitir el dashboard de Base44 al registrar el dominio en NUESTRA app; hasta que Xavi lo lea allí, va como `<PENDIENTE>`.

---

## 0 · TL;DR

- El apex `cambra.global` sirve hoy la **app vieja Base44** (landing multi-vertical purgada — confirmado empíricamente en fetch del 2026-07-12).
- Estrategia recomendada (Path A): **A record apex `@ → 216.24.57.1`** (IP estática que Base44 publica para custom domains, fuente: docs.base44.com/Setting-up-your-app/Connecting-an-external-domain) + **CNAME `www → <target del panel Base44>`**.
- Estrategia fallback (Path B) documentada abajo: **domain forwarding 301 `cambra.global → www.cambra.global`** en el UI de IONOS + CNAME `www` al target. **www pasa a ser el canonical** en este caso.
- **`contact.cambra.global` NO se toca** — verificado en Resend, entregando hoy.
- Downtime esperado: **0 min si se sigue el runbook**, con caveat SSL cubierto en §3.

---

## 1 · Diagnóstico del apex actual

Fetch a `https://cambra.global` el 2026-07-12 devuelve la landing pre-pivot (multi-vertical, enlaces a `/Analyzer`, `/ConnectTools`, `/#testimonials`). Esa versión ya no existe en el repo (purgada en Fase R1). **Hoy el apex sirve la app antigua**.

`www.cambra.global` no verificado empíricamente en este chunk — el runbook lo cubre configurándolo desde cero si no existe, o sobrescribiéndolo si existe.

---

## 2 · Estrategia del apex — Path A (recomendada) vs Path B (fallback)

### Path A — A record apex (RECOMENDADA)

Funciona porque Base44 publica una IP estática para custom domains: **`216.24.57.1`** (fuente autoritativa: `docs.base44.com/Setting-up-your-app/Connecting-an-external-domain` y `docs.base44.com/Community-and-support/Troubleshooting`, ambos consultados 2026-07-12).

Ventajas:
- Se hace 100% desde el panel Domains & SSL de IONOS con opciones que sí existen (A + CNAME).
- Apex y www resuelven ambos a Base44; el canonical se define en la app (redirect www→apex o apex→www según lo maneje Base44, no lo controla IONOS).
- Rollback trivial.

Desventaja:
- Si Base44 algún día cambia la IP estática, hay que actualizar el A record manualmente (a mitigar con TTL bajo — 3600, no menos por rate-limit de DNS negativo).

### Path B — Domain forwarding 301 + CNAME www (FALLBACK)

Solo si Path A falla (p. ej. Base44 rechaza la IP para nuestra app concreta o el registro de custom domain nos exige TXT + CNAME sin A). En este caso:
- IONOS Domains & SSL ofrece **"HTTP Forwarding"** o **"Domain Redirect"** — un 301 desde el apex a otra URL.
- Se configura: `cambra.global` → 301 → `https://www.cambra.global`
- `www` va con CNAME al target de Base44.
- **www se convierte en el canonical.** Hay que asegurar que:
  - Todos los CTAs del app y de emails usan `https://www.cambra.global/...` (o al menos toleran ambos).
  - El registro de custom domain en Base44 usa `www.cambra.global`, no el apex.
  - SEO: el 301 del apex hace que www acumule la autoridad — deseable a largo plazo, pero disruptivo si la app vieja acumulaba señales en el apex.

Desventaja de Path B: cambio de canonical es más invasivo. Reservar para caso Path A imposible.

**Decisión de este chunk: Path A. Path B queda documentado y no se ejecuta salvo aviso.**

---

## 3 · Tabla IONOS (Path A) — cambios a aplicar

### 3.1 · Records a **AÑADIR / MODIFICAR** (apex de app nueva)

| Tipo   | Host / Nombre | Valor                                       | TTL  | Notas |
|--------|---------------|---------------------------------------------|------|-------|
| A      | `@`           | `216.24.57.1`                               | 3600 | IP estática que Base44 publica para apex de custom domains. Ver docs.base44.com/Setting-up-your-app/Connecting-an-external-domain. **Solo UN A record en @**; si el panel deja otro conviviendo, resolución rota. |
| CNAME  | `www`         | `<PENDIENTE — leer del panel Base44>`       | 3600 | Ver §4.1 abajo — Xavi lo lee del dashboard de Base44 al registrar el custom domain en la app **nueva**. Docs genéricos sugieren `base44.onrender.com` pero eso es el default de la documentación, no un valor por app: **usar el literal del panel**. Si el panel no muestra un CNAME target y en cambio pide TXT de verificación + segundo A, seguir lo que diga el panel. |

### 3.2 · Records a **ELIMINAR** (limpieza obligatoria antes del cambio)

| Tipo   | Host / Nombre | Valor actual (probable) | Acción | Motivo |
|--------|---------------|-------------------------|--------|--------|
| A      | `@`           | IP de la app vieja      | **BORRAR** | Base44 requiere "solo un A record" en apex. Conviven→ resolución rota. |
| AAAA   | `@`           | (cualquiera)            | **BORRAR si existe** | AAAA bloquea la conexión IPv4 al backend Base44 (docs.base44.com/Community-and-support/Troubleshooting: "Remove any AAAA records"). |
| A      | `www`         | (cualquiera)            | **BORRAR si existe** | Colisiona con el CNAME nuevo. |
| AAAA   | `www`         | (cualquiera)            | **BORRAR si existe** | Idem. |
| CAA    | `@`           | (cualquiera restrictivo)| **REVISAR** | Si hay CAA que no autoriza `letsencrypt.org` / `pki.goog`, Base44 no puede emitir SSL. Si dudas, borrar el CAA. |
| ALIAS/ANAME | `@`      | (n/a en Domains & SSL panel) | — | No aplica: el panel clásico no ofrece ALIAS. Solo mencionado por completitud — si Xavi ve la opción, es que está mirando el panel equivocado (IONOS Cloud DNS). |

### 3.3 · Records **EXISTENTES — NO TOCAR bajo ningún concepto**

Subdominio `contact.cambra.global` verificado en Resend. **NUNCA se editan en este chunk.**

| Tipo   | Host                              | Valor esperado | Estado |
|--------|-----------------------------------|----------------|--------|
| MX     | `send.contact` (o similar Resend) | Resend endpoint | **existing — do not touch** |
| TXT    | `send.contact` (SPF)              | `v=spf1 include:amazonses.com ~all` (o el que Resend haya generado) | **existing — do not touch** |
| CNAME  | `resend._domainkey.contact` (DKIM)| valor único emitido por Resend | **existing — do not touch** |
| TXT    | `_dmarc.contact` (si se añadió)   | DMARC de Resend | **existing — do not touch** |

> **Regla vinculante:** cualquier record cuyo `host` contenga `.contact` o `contact.` NO se toca. Si el UI de IONOS muestra alguno durante la edición del apex, se deja exactamente como está.

---

## 4 · Ventana crítica anti-downtime

**Comportamiento del A record.** Cambiar el A del apex en IONOS es una operación atómica desde el punto de vista de resolución: cuando IONOS publica el nuevo valor, los resolvers globales lo van adoptando en su TTL correspondiente (típicamente 5-30 min en Europa, hasta 48h en el peor caso).

**Certificado SSL.** El cert de Base44 para `cambra.global` no existe todavía. Se emite automáticamente cuando (a) el DNS resuelve al backend Base44 **Y** (b) Base44 detecta ownership del dominio. Ese ciclo puede tardar entre 30 s y varios minutos.

**Ventana teórica de downtime:** intervalo entre "IONOS empieza a servir el A nuevo" y "Base44 completa la emisión del cert". Durante ese hueco los visitantes ven o bien la app vieja (si el DNS aún no propagó a su resolver), o bien un error SSL (si propagó pero el cert nuevo aún no está listo).

**Mitigación obligatoria — orden estricto:**

1. **PRIMERO** registrar el dominio en la app nueva desde el dashboard Base44 (paso 5.1).
2. **DESPUÉS** cambiar el DNS en IONOS.

Ese orden hace que Base44 quede "esperando" el DNS cuando lo cambies — la emisión del cert arranca en cuanto la resolución llega, minimizando el hueco a segundos.

---

## 5 · Runbook — orden exacto de ejecución

### 5.1 · Registrar el dominio en la app nueva (Base44 dashboard) — **BLOQUEA todo lo demás**

**Tú (Base44 dashboard)**, antes de tocar IONOS:
1. Abre el dashboard de la app **nueva** (esta).
2. `Settings → Domain` (o el nombre que el UI use).
3. Añade `cambra.global` como custom domain.
4. Añade también `www.cambra.global`.
5. El UI mostrará algo como "Waiting for DNS" — estado esperado.
6. **Copia los valores exactos que el UI muestre**:
   - Para el apex `cambra.global`: probablemente pedirá `A → 216.24.57.1` (si es así, coincide con nuestra tabla §3.1 y confirma Path A). Si en su lugar pide un CNAME apex, TXT de verificación, o cualquier otra cosa: para y avisa antes de continuar — es un caso no cubierto por este runbook.
   - Para `www.cambra.global`: copiar el CNAME target literal. **Ese es el valor que va en la celda `<PENDIENTE>` de §3.1**. Si Base44 muestra `base44.onrender.com`, usar ese; si muestra `apps.base44.io` o cualquier otro literal específico por app, usar el que muestre. **El literal del panel manda sobre este documento.**
7. **NO retirar todavía el dominio de la app vieja.** Se hace al final (§5.4).

**Yo (code agent)** no puedo ejecutar este paso — el registro de custom domain no está expuesto por ninguna tool de código. 100% acción de Xavi en el UI.

### 5.2 · Aplicar el DNS en IONOS (Path A)

**Tú (IONOS panel)**, con los valores del §5.1 en la mano:

1. `Menu → Domains & SSL → cambra.global → DNS`.
2. **Anota antes de borrar** los valores actuales de los records que vas a modificar (para el rollback §7).
3. **Borra** los records de §3.2 (A/AAAA del apex y de www, si existen; revisa CAA).
4. **Añade / modifica** los records de §3.1:
   - `A @ → 216.24.57.1` TTL 3600
   - `CNAME www → <valor literal copiado en §5.1 punto 6>` TTL 3600
5. Confirma. IONOS mostrará "Changes queued" o similar.

### 5.3 · Verificar en Base44

**Tú (Base44 dashboard)**, tras esperar 5-10 min:
1. Vuelve a `Settings → Domain`.
2. `cambra.global` debe pasar de "Waiting for DNS" → "Verified" → "SSL issued".
3. `www.cambra.global` idem.
4. Si tras 30 min sigue en "Waiting for DNS": pasa a §7 · Rollback y avisa.

### 5.4 · Retirar el dominio de la app vieja

**Solo tras confirmar en 5.3 que la app nueva sirve `cambra.global` en HTTPS sin error de cert:**

1. Dashboard app **vieja** → `Settings → Domain → cambra.global` → retirar.
2. Idem `www.cambra.global` si estaba en la vieja.

Paso sanitario — sin él, la app vieja sigue "reclamando" el dominio internamente en Base44 aunque el DNS ya no la apunte.

---

## 6 · Verificación post-cambio (Path A)

### 6.1 · Comandos DNS (desde tu terminal Mac)

```sh
# Apex — debe devolver exactamente 216.24.57.1
dig +short cambra.global A
# Expected: 216.24.57.1

# www — debe devolver el CNAME literal del panel Base44 y su A resuelta
dig +short www.cambra.global CNAME
# Expected: <valor del panel Base44>  (ej: base44.onrender.com)
dig +short www.cambra.global A
# Expected: 216.24.57.1  (o la IP a la que resuelva el CNAME de Base44)

# AAAA — DEBE devolver vacío (Base44 requiere que no exista)
dig +short cambra.global AAAA
# Expected: (vacío)
dig +short www.cambra.global AAAA
# Expected: (vacío)

# Sanity check defensivo: contact.* NO debe haber cambiado
dig +short send.contact.cambra.global TXT
dig +short resend._domainkey.contact.cambra.global CNAME
# Expected: los MISMOS valores que devolvían antes del chunk
```

### 6.2 · Herramientas web de propagación

- https://dnschecker.org/#A/cambra.global — debería mostrar `216.24.57.1` en ≥ 80% de resolvers globales.
- https://dnschecker.org/#CNAME/www.cambra.global — CNAME correcto.

### 6.3 · Prueba de servicio

Abre `https://cambra.global` en Incognito (caché limpia). Debe cargar la **landing NUEVA** (payments-only, R1, "Stop overpaying · Recover the margin", **sin** el link `/#testimonials` que sí tiene la vieja). Confirmar también:
- `https://www.cambra.global` sirve la app (idealmente redirigiendo a apex; en Path A ambos son válidos y la app nueva maneja el canonical internamente).
- Cert SSL válido (candado verde, emitido por Let's Encrypt o Google Trust Services vía Base44).

---

## 7 · Rollback

### 7.1 · Rollback rápido (DNS solo, ~30 s de config + TTL propagación)

En IONOS, revertir §3.1 al estado previo (usar los valores que anotaste en §5.2 punto 2):

| Tipo | Host | Valor a restaurar | TTL |
|------|------|-------------------|-----|
| A    | `@`  | IP previa (app vieja) | 3600 |
| (AAAA `@`) | `@` | si existía, restaurar | 3600 |
| CNAME o A | `www` | valor previo | 3600 |

Propagación del rollback: mismo TTL que el cambio original (típicamente 5-30 min).

### 7.2 · Rollback completo (Base44 dashboard)

Si además el registro dejó algo raro:
1. App **nueva**: `Settings → Domain` → retirar `cambra.global` y `www.cambra.global`.
2. App **vieja**: verificar que `cambra.global` sigue reclamado; si no, re-añadirlo.

Con DNS revertido y domain reclamado solo por la vieja, estado idéntico al del 2026-07-12 pre-chunk.

### 7.3 · Si Path A no funciona → probar Path B

Si tras el rollback confirmas que Base44 no valida `216.24.57.1` para nuestra app (caso raro pero posible según cómo el dashboard emita instrucciones para nuestra app concreta):

1. Rollback DNS (§7.1).
2. Configurar en IONOS Domains & SSL: **HTTP Forwarding** de `cambra.global` → `https://www.cambra.global` (redirect 301).
3. Añadir CNAME `www → <target del panel Base44>` TTL 3600.
4. En Base44: registrar solo `www.cambra.global` como custom domain (no el apex).
5. Actualizar en la app cualquier CTA/canonical/OpenGraph que hardcodee `cambra.global` sin `www` — chunk aparte, no automático.

Path B no se ejecuta salvo aviso explícito.

---

## 8 · Inventario de email — resultado del punto 4 del chunk original

### 8.1 · Senders en código (from-address literal)

Grep exhaustivo en `base44/functions/**/entry.ts`:

| Archivo:línea | Transport | From-address literal | ¿Depende del dominio Resend? |
|---|---|---|---|
| `sendMonthlySavingsSummary/entry.ts:155` | `Core.SendEmail` (integración Base44) | `from_name: 'CAMBRA'` — la plataforma pone el sender | **NO** |
| `submitWaitlistSignup/entry.ts:160` | Resend REST directo | `Deno.env.get('RESEND_FROM') \|\| 'CAMBRA <hello@contact.cambra.global>'` | **SÍ** |
| `scheduledEmails/entry.ts:49` (`analyzer_followup`) | `Core.SendEmail` | `from_name: 'CAMBRA'` | **NO** |
| `scheduledEmails/entry.ts:92` (`expiring_contracts`) | `Core.SendEmail` | `from_name: 'CAMBRA'` | **NO** |
| `scheduledEmails/entry.ts:139` (`monthly_digest`) | `Core.SendEmail` | `from_name: 'CAMBRA'` | **NO** |

**Conclusión — parte "from-address": 0 correcciones de código necesarias.** El único sender Resend-directo (`submitWaitlistSignup`) ya tiene default `hello@contact.cambra.global`. Ninguna string `@cambra.global` a secas en senders.

**Acción manual pendiente para Xavi:** dashboard Base44 → Settings → Secrets → confirmar valor literal de `RESEND_FROM` contiene `@contact.cambra.global`. exec_tool no puede leer `Deno.env`.

### 8.2 · To-addresses hardcodeados (solo inventario, no se cambian)

| Archivo:línea | To-address | Contexto |
|---|---|---|
| `submitWaitlistSignup:139-140` | `Deno.env.get('ADMIN_NOTIFICATION_EMAIL')` (env, no hardcoded) | Notifica al admin en waitlist signup |
| `sendMonthlySavingsSummary:157` | `u.email` (dinámico) | Resumen mensual al user (incluye self-test brand backfilleado a `xavi@cambra.global` en chunk A2 — cuando DNS aterrice y buzón exista, empezará a recibir) |
| `scheduledEmails:51` | `result.created_by` (dinámico) | Analyzer follow-up |
| `scheduledEmails:94` | `deal.user_email` (dinámico) | Contract expiring |
| `scheduledEmails:141` | `email` (dinámico) | Monthly digest |

Nada hardcoded a `@cambra.global` en `to`. La única mención `xavi@cambra.global` en codebase es dato (backfill A2 del self-test), no dirección de envío.

### 8.3 · URLs muertas en scheduledEmails — **CORREGIDAS en este chunk** (v2, aprobado por Xavi)

`scheduledEmails/entry.ts` tenía 3 CTAs en el HTML del email con URL literal `https://cambra.co/...` (dominio del pivot anterior, muerto). Corregidos a `https://cambra.global/...`:

- Línea 63 · `href="https://cambra.co/Onboarding"` → `href="https://cambra.global/Onboarding"`
- Línea 110 · `href="https://cambra.co/Dashboard"` → `href="https://cambra.global/Dashboard"`
- Línea 178 · `href="https://cambra.co/Dashboard"` → `href="https://cambra.global/Dashboard"`

Cambio de string únicamente, sin lógica. Las rutas `/Onboarding` y `/Dashboard` existen en el router actual (`src/App.jsx`) — `/Onboarding` es pública, `/Dashboard` está dentro del `DashboardLayout` protegido. Los CTAs no dependen del path exacto de la ruta, solo del dominio.

**Riesgo residual mientras el DNS no aterrice:** los emails que se envíen entre este chunk y la ejecución del DNS tendrán CTAs apuntando a `cambra.global`, que aún sirve la app vieja. La app vieja también tiene `/Onboarding` (existía pre-purga), así que los links no fallan — solo llevan al UI viejo. Aceptable por el corto lapso previsto.

---

## 9 · Estado esperado post-chunk

- `cambra.global` sirve la app nueva (payments-only, R1) vía A record apex + CNAME www.
- `www.cambra.global` idem.
- `contact.cambra.global` sigue verificado en Resend, entregando con `hello@contact.cambra.global`.
- App vieja pierde la reclamación de `cambra.global` (paso §5.4).
- Emails de `scheduledEmails` tienen CTAs apuntando al dominio vivo.
- Suite: 348 / 0 / 2 intacto (el cambio de string en `scheduledEmails/entry.ts` no toca lógica ni ningún mirror SYNC, así que sync-check no se activa).