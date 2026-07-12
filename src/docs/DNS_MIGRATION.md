# DNS Migration — `cambra.global` apex from OLD app → NEW app

**Fecha:** 2026-07-12 · **Registrar:** IONOS · **Target:** apex `cambra.global` + `www.cambra.global`
**Autor:** Chunk "custom domain + email inventory"

---

## 0 · TL;DR

- El apex `cambra.global` sirve hoy la **app vieja Base44** (landing multi-vertical purgada — confirmado empíricamente en el fetch del 2026-07-12).
- La app nueva se mapeará vía **ANAME** en apex (IONOS lo soporta como "ALIAS" desde 2022) + **CNAME** en `www`, ambos apuntando a `base44.onrender.com`.
- **`contact.cambra.global` NO se toca — está verificado en Resend y entregando mails hoy.**
- Downtime esperado: **0 minutos si se sigue el runbook en el orden dado**, con caveat en la sección "Ventana crítica" abajo.

---

## 1 · Diagnóstico del apex actual

Fetch a `https://cambra.global` el 2026-07-12 devuelve la landing pre-pivot (multi-vertical, con enlaces a `/Analyzer`, `/ConnectTools`, `/#testimonials`). Esa versión ya no existe en el repo de la app nueva (purgada en Fase R1). Confirmación: **hoy el apex sirve la app antigua**.

`www.cambra.global` no se verificó en este chunk; se asume que:
- O bien tiene un CNAME al mismo destino que el apex.
- O bien no está configurado.

Se cubre en el runbook.

---

## 2 · Tabla IONOS — cambios a aplicar

Formato tal cual el UI de IONOS pide.

### 2.1 · Records a **AÑADIR / MODIFICAR** (apex de app nueva)

| Tipo   | Host / Nombre | Valor                    | TTL  | Notas |
|--------|---------------|--------------------------|------|-------|
| ANAME (o ALIAS) | `@` | `base44.onrender.com` | 3600 | Reemplaza el ALIAS/A actual que apunta a la app vieja. En IONOS aparece como "ALIAS". |
| CNAME  | `www`         | `base44.onrender.com`    | 3600 | Si ya existe un `www` con otro destino, lo modificas. Si no existe, lo creas. |

### 2.2 · Records a **ELIMINAR** (limpieza obligatoria antes del ANAME)

| Tipo   | Host / Nombre | Valor actual (probable) | Acción | Motivo |
|--------|---------------|-------------------------|--------|--------|
| A      | `@`           | IP de la app vieja      | **BORRAR** | Convivir A + ANAME rompe la resolución; Base44 requiere "solo uno". |
| AAAA   | `@`           | (cualquiera)            | **BORRAR si existe** | AAAA bloquea la conexión IPv4 al backend Base44 (documentado). |
| A      | `www`         | (cualquiera)            | **BORRAR si existe** | Colisiona con el CNAME que vamos a poner. |
| AAAA   | `www`         | (cualquiera)            | **BORRAR si existe** | Idem. |
| CAA    | `@`           | (cualquiera restrictivo)| **REVISAR** | Si hay CAA que no autoriza `letsencrypt.org` / `pki.goog`, Base44 no puede emitir SSL. Si dudas, borra el CAA temporalmente. |

### 2.3 · Records **EXISTENTES — NO TOCAR bajo ningún concepto**

Estos son los del subdominio `contact.cambra.global` que ya funcionan con Resend. **NUNCA se editan en este chunk.**

| Tipo   | Host                              | Valor esperado | Estado |
|--------|-----------------------------------|----------------|--------|
| MX     | `send.contact` (o similar Resend) | Resend endpoint | **existing — do not touch** |
| TXT    | `send.contact` (SPF)              | `v=spf1 include:amazonses.com ~all` (o el que Resend haya generado) | **existing — do not touch** |
| CNAME  | `resend._domainkey.contact` (DKIM)| valor único emitido por Resend | **existing — do not touch** |
| TXT    | `_dmarc.contact` (si se añadió)   | DMARC de Resend | **existing — do not touch** |

> **Regla vinculante:** cualquier record cuyo `host` contenga la subcadena `.contact` o `contact.` NO se toca. Si el UI de IONOS te muestra alguno mientras editas apex, lo dejas exactamente como está.

---

## 3 · Ventana crítica anti-downtime — LEE ANTES DE TOCAR NADA

**Qué hace ANAME en IONOS.** El ANAME (llamado "ALIAS" en su UI) es un CNAME de facto en el apex. IONOS lo resuelve del lado servidor y devuelve la A real de `base44.onrender.com`. Cambiar el ALIAS es **atómico** desde el punto de vista de resolución.

**Pero:** el certificado SSL de Base44 para `cambra.global` **no existe todavía**. Se emite automáticamente cuando (a) el DNS resuelve al backend de Base44 **y** (b) Base44 detecta ownership del dominio. Ese ciclo puede tardar entre 30 s y varios minutos.

**Ventana teórica de downtime:** el intervalo entre "IONOS empieza a servir el ALIAS nuevo" y "Base44 completa la emisión del certificado". Durante ese hueco los visitantes de `cambra.global` verán o bien la app vieja (si el DNS aún no propagó a su resolver) o bien un error SSL (si propagó pero el cert nuevo aún no está listo).

**Mitigación obligatoria — orden estricto:**

1. **PRIMERO** registrar el dominio en la app nueva desde el dashboard Base44 (paso 4.1 abajo).
2. **DESPUÉS** cambiar el DNS en IONOS.

Ese orden hace que Base44 esté "esperando" el DNS cuando lo cambies — la emisión del cert arranca en cuanto la resolución llega, minimizando el hueco a segundos.

**No hacerlo al revés.** Cambiar el DNS antes de registrar el dominio en la app nueva garantiza minutos de error SSL para todo el mundo.

---

## 4 · Runbook — orden exacto de ejecución

### 4.1 · Registrar el dominio en la app nueva (Base44 dashboard)

**Tú (Base44 dashboard)**, antes de tocar IONOS:
1. Abre el dashboard de la app **nueva** (esta).
2. `Settings → Domain` (o el nombre que el UI use).
3. Añade `cambra.global` como custom domain.
4. Añade también `www.cambra.global`.
5. El UI te dirá "Waiting for DNS" — es el estado esperado. Déjalo así.
6. **Copia los valores exactos que el UI te muestre.** Si difieren de `base44.onrender.com` (p. ej. te da un valor propio del app id), **usa los del UI, no los de este documento**. Este doc asume el default del docstring oficial; el UI es la fuente de verdad para tu app concreta.

**Yo (Base44 code agent)** no puedo ejecutar este paso — el registro de custom domain no está expuesto por ninguna tool de código. Es 100% acción tuya en el UI.

**NO retires todavía el dominio de la app vieja.** Base44 debería permitir que dos apps tengan el mismo custom domain listado "waiting for DNS" simultáneamente; solo una recibirá tráfico (la que el DNS resuelva). Si el UI de Base44 rechaza el registro con "domain already claimed by another app", **para aquí y avisa** — hay que abrir soporte antes de continuar.

### 4.2 · Aplicar el DNS en IONOS

**Tú (IONOS panel)**, cuando el paso 4.1 esté completo:

1. `Menu → Domains & SSL → cambra.global → DNS`.
2. **Borra** los records listados en la sección **2.2** (A/AAAA del apex y de www, si existen).
3. **Añade / modifica** los records listados en la sección **2.1** (ANAME `@` + CNAME `www`).
4. Confirma. IONOS mostrará "Changes queued" o similar; TTL de propagación **hasta 48 h** en el peor caso, típicamente **5-30 min** en Europa.

### 4.3 · Verificar en Base44

**Tú (Base44 dashboard)**, después de esperar 5-10 min tras el paso 4.2:
1. Vuelve a `Settings → Domain`.
2. `cambra.global` debe pasar de "Waiting for DNS" → "Verified" → "SSL issued".
3. Si tras 30 min sigue en "Waiting for DNS", pasa a la sección **6 · Rollback** y avisa.

### 4.4 · Retirar el dominio de la app vieja

**Solo tras confirmar en 4.3 que la app nueva sirve `cambra.global` en HTTPS sin error de cert:**

1. Abre el dashboard de la app **vieja**.
2. `Settings → Domain → cambra.global`.
3. Retira el dominio.

Este paso es sanitario — sin él, la app vieja sigue "reclamando" el dominio en Base44 aunque el DNS ya no la apunte. No afecta al servicio del usuario final, pero deja el estado limpio.

---

## 5 · Verificación post-cambio

### 5.1 · Comandos DNS (desde tu terminal Mac)

```sh
# Debería devolver una IP del rango de Render (usualmente 216.24.57.x)
dig +short cambra.global A

# Idem para www
dig +short www.cambra.global CNAME
dig +short www.cambra.global A

# Confirmar que contact.* sigue igual (chequeo defensivo)
dig +short send.contact.cambra.global TXT
dig +short resend._domainkey.contact.cambra.global CNAME
```

**Salida esperada:**
- `cambra.global A` → resuelve a una IP de Render (`216.24.57.x` o similar).
- `www.cambra.global` → CNAME a `base44.onrender.com`.
- Los records `contact.*` deben devolver **exactamente** lo mismo que devuelven hoy — si cambian, algo del paso 4.2 salió mal.

### 5.2 · Herramienta web de propagación

- https://dnschecker.org/#A/cambra.global — debería mostrar la nueva IP en ≥ 80% de los resolvers globales.
- https://dnschecker.org/#CNAME/www.cambra.global — CNAME correcto.

### 5.3 · Prueba de servicio

Abre `https://cambra.global` en un navegador con caché limpia (Incognito). Debe cargar la **landing nueva** (payments-only, con la copy R1 de "Stop overpaying · Recover the margin" pero **sin** los enlaces a `/#testimonials` que sí aparecen en la vieja — si aparecen, todavía estás viendo la vieja por caché).

Confirma también:
- `https://www.cambra.global` redirige a apex (o carga la misma app — depende de cómo el hosting lo maneje; ambas son OK).
- Certificado SSL válido (candado verde).

---

## 6 · Rollback

Si el paso 4.3 falla o el paso 5.3 muestra la app rota:

### 6.1 · Rollback rápido (30 s, DNS solo)

En IONOS, revierte los records de la sección **2.1** al estado previo:

| Tipo | Host | Valor a restaurar | TTL |
|------|------|-------------------|-----|
| A o ALIAS | `@` | valor previo (apuntaba a app vieja) | 3600 |
| CNAME | `www` | valor previo | 3600 |

Los records de la sección **2.2** que borraste se restauran manualmente con los mismos valores. Si no anotaste los originales antes de borrar, se puede recuperar desde el historial de DNS de IONOS (retención 30 días en su panel).

Propagación del rollback: mismo TTL que el cambio original.

### 6.2 · Rollback completo (Base44 dashboard)

Si además el registro de `cambra.global` en la app nueva dejó algo raro:
1. App **nueva**: Settings → Domain → retirar `cambra.global` y `www.cambra.global`.
2. App **vieja**: verifica que `cambra.global` sigue reclamado allí. Si no, re-añadirlo.

Con el DNS revertido y el domain solo reclamado por la app vieja, el estado queda **idéntico al del 2026-07-12 antes del chunk**.

---

## 7 · Inventario de email — resultado del punto 4 del chunk

### 7.1 · Senders en el código (from-address literal)

Grep exhaustivo en `base44/functions/**/entry.ts`:

| Archivo:línea | Transport | From-address literal | ¿Depende del dominio Resend? |
|---|---|---|---|
| `base44/functions/sendMonthlySavingsSummary/entry.ts:155` | `base44.asServiceRole.integrations.Core.SendEmail` | `from_name: 'CAMBRA'` — no expone from-address, la plataforma pone el sender | **NO** |
| `base44/functions/submitWaitlistSignup/entry.ts:160` | `fetch('https://api.resend.com/emails', …)` directo | `Deno.env.get('RESEND_FROM') \|\| 'CAMBRA <hello@contact.cambra.global>'` | **SÍ** |
| `base44/functions/scheduledEmails/entry.ts:49` (`analyzer_followup`) | `Core.SendEmail` | `from_name: 'CAMBRA'` | **NO** |
| `base44/functions/scheduledEmails/entry.ts:92` (`expiring_contracts`) | `Core.SendEmail` | `from_name: 'CAMBRA'` | **NO** |
| `base44/functions/scheduledEmails/entry.ts:139` (`monthly_digest`) | `Core.SendEmail` | `from_name: 'CAMBRA'` | **NO** |

**Conclusión — parte "from-address":** el único sender que depende del dominio verificado en Resend es `submitWaitlistSignup`, y **su default en código YA es `hello@contact.cambra.global`**. No hay ninguna string `@cambra.global` (a secas, sin `contact.`) en ningún path de sender.

**Acción pendiente para el usuario (NO ejecutable desde código):** abrir el dashboard Base44 → Settings → Secrets y confirmar que el valor literal de `RESEND_FROM` contiene `@contact.cambra.global` (no `@cambra.global` a secas). Si el env var contradice el default del código, el env var gana. exec_tool corre en Node CommonJS y no puede leer `Deno.env`, así que la verificación es manual.

### 7.2 · To-addresses hardcodeados (solo inventario, no se cambian)

| Archivo:línea | To-address | Contexto |
|---|---|---|
| `submitWaitlistSignup/entry.ts:139-140` | `Deno.env.get('ADMIN_NOTIFICATION_EMAIL')` (env var, no hardcoded) | Notifica al admin cuando alguien se apunta al waitlist |
| `sendMonthlySavingsSummary/entry.ts:157` | `u.email` (dinámico) | El resumen mensual va al user (incluye el self-test brand backfilleado hoy a `xavi@cambra.global` en el chunk A2 — cuando el DNS aterrice y el buzón `xavi@` exista en IONOS, empezará a recibir el resumen) |
| `scheduledEmails/entry.ts:51` | `result.created_by` (dinámico) | Analyzer follow-up al owner del resultado |
| `scheduledEmails/entry.ts:94` | `deal.user_email` (dinámico) | Contract expiring al owner del deal |
| `scheduledEmails/entry.ts:141` | `email` (dinámico) | Monthly digest al user |

Nada hardcoded a `@cambra.global` en el vertiente `to`. La única mención a un email concreto `@cambra.global` en el codebase es la del backfill del self-test brand (`xavi@cambra.global` en `AnalyzerResult`/`Brand.contact_email`), que es un **dato**, no una dirección de envío desde el código.

### 7.3 · URLs muertas — reporte separado (NO scope de este chunk)

`scheduledEmails/entry.ts` contiene 3 CTAs en el HTML del email con **URL literal `https://cambra.co/...`** (dominio del pivot anterior, muerto):

- Línea 63 · `https://cambra.co/Onboarding`
- Línea 110 · `https://cambra.co/Dashboard`
- Línea 178 · `https://cambra.co/Dashboard`

Cuando estos 3 emails se envíen, los CTAs romperán. **Fix trivial** (buscar y reemplazar por `https://cambra.global/...` cuando el DNS esté completado). Lo dejo **fuera de este chunk** porque:
1. No es un problema de from-address (los emails se ENVÍAN correctamente vía Core.SendEmail).
2. Fase 1.2 marcó `/Onboarding` y `/Dashboard` como redirects — el path exacto post-DNS habría que confirmarlo.
3. El usuario pidió explícitamente "sólo inventario, no los cambies" para las to-addresses; extiendo esa disciplina a los URLs también.

Recomendación: chunk aparte tras confirmar DNS + rutas finales.

---

## 8 · Estado esperado post-chunk

- `cambra.global` sirve la app nueva (payments-only, R1).
- `www.cambra.global` idem.
- `contact.cambra.global` sigue verificado en Resend, entregando mails con `hello@contact.cambra.global` como sender.
- App vieja sigue accesible por su URL `*.base44.app` (o el dominio que tenga aparte) — solo pierde la reclamación de `cambra.global`.
- Cero cambios en código de producto (regla del chunk cumplida: el único sender que dependía del dominio verificado ya tenía el default correcto).
- Suite intacta 348 / 0 / 2 (este chunk no toca ningún archivo `.js` de producto; sync-check no debería activarse).