# OAuth App-User Connectors — Setup Checklist (A1)

> **Estado:** ⏳ PENDING — esperando credenciales OAuth del builder.
>
> **Bloqueante para:** flow de ConnectTools (Google Drive / Sheets / Gmail / Slack).
> Sin estos IDs, `lib/connectors.config.js` queda con strings vacías y los `Connect`
> buttons de la página `ConnectTools` no funcionan.

---

## Qué tienes que hacer TÚ (fuera de este chat)

Crear 4 OAuth apps externas y traer al chat los `client_id` + `client_secret` de cada una. Total estimado: **40-60 min** la primera vez (el verification screen de Google es lo más lento).

Cuando vuelvas con las credenciales, lánzame: **"A1 — tengo las credenciales"** y registro los 4 connectors en paralelo en este orden: Drive → Sheets → Gmail → Slack.

---

## 1 · Google Drive / Sheets / Gmail (3 apps, mismo proyecto GCP)

Las tres comparten un **solo proyecto en Google Cloud**, pero **cada una se registra como connector separado** en Base44 con scopes distintos.

### 1.1 Crear proyecto en Google Cloud Console
1. Ir a https://console.cloud.google.com/
2. Crear proyecto: **"CAMBRA Production"** (o el nombre que prefieras)
3. Anotar el `Project ID`

### 1.2 Habilitar las 3 APIs
En `APIs & Services → Library`, habilitar:
- **Google Drive API**
- **Google Sheets API**
- **Gmail API**

### 1.3 OAuth consent screen
En `APIs & Services → OAuth consent screen`:
- **User type:** External
- **App name:** CAMBRA
- **User support email:** tu email
- **Authorized domains:** añade el dominio de tu app (el del secret `APP_DOMAIN`)
- **Scopes** — añadir los 3 read-only:
  - `https://www.googleapis.com/auth/drive.readonly`
  - `https://www.googleapis.com/auth/spreadsheets.readonly`
  - `https://www.googleapis.com/auth/gmail.readonly`
- **Test users:** añadir tu email mientras esté en modo "Testing"
- **Publishing status:** déjalo en "Testing" para empezar. Cuando quieras abrirlo al público real, tendrás que pasar el **verification process** de Google (puede tardar 4-6 semanas si pides scopes sensitive/restricted — Gmail readonly es restricted; Drive y Sheets son sensitive).

### 1.4 Crear OAuth client ID
En `APIs & Services → Credentials → Create credentials → OAuth client ID`:
- **Application type:** Web application
- **Name:** `CAMBRA Web Client`
- **Authorized redirect URIs:** ⚠️ **Base44 te dará la URI exacta** cuando lances `register_workspace_connector`. Por ahora deja vacío y vuelves a pegarla cuando la tengas.

> **Importante:** un solo OAuth client ID sirve para Drive, Sheets y Gmail. Los 3 connectors de Base44 usarán el mismo `client_id` + `client_secret`, solo cambian los scopes que se piden.

### 1.5 Anotar para traer al chat
- [ ] `GOOGLE_CLIENT_ID` = `xxxxxxx.apps.googleusercontent.com`
- [ ] `GOOGLE_CLIENT_SECRET` = `GOCSPX-xxxxxxx`

---

## 2 · Slack

### 2.1 Crear Slack app
1. Ir a https://api.slack.com/apps → **Create New App** → **From scratch**
2. **App Name:** `CAMBRA`
3. **Workspace:** tu workspace de pruebas

### 2.2 OAuth & Permissions
En `OAuth & Permissions`:
- **Redirect URLs:** ⚠️ Base44 te dará la URI exacta cuando lance `register_workspace_connector`. Lo añades después.
- **User Token Scopes** (no Bot — User):
  - `channels:read`
  - `users:read`

### 2.3 Basic Information
En `Basic Information → App Credentials`:
- [ ] `SLACK_CLIENT_ID` = `xxxxxxx.xxxxxxx`
- [ ] `SLACK_CLIENT_SECRET` = `xxxxxxx`

---

## Cuando vuelvas

Dime **"A1 — tengo las credenciales"** y ejecutaré exactamente esto, sin más preguntas:

1. `register_workspace_connector` × 4 (Drive, Sheets, Gmail, Slack) — uno por uno, cada uno abrirá un formulario en chat donde pegas los client_id + secret correspondientes.
2. Por cada registro, Base44 me devuelve el `cntr_xxx` ID y la **redirect URI exacta** que tienes que pegar en Google Cloud y Slack.
3. Actualizo `lib/connectors.config.js` con los 4 IDs reales.
4. Verifico que `pages/ConnectTools` ya puede llamar al flow.

Tiempo en chat: **≈ 5 min** una vez tengas las credenciales en la mano.

---

## Notas

- **Read-only por seguridad.** Todos los scopes son `*.readonly`. No pedimos write a nada.
- **App-user, no shared.** Cada brand conecta su propia cuenta de Google/Slack — el token no se comparte entre tenants.
- **Verification de Google.** Mientras tu OAuth consent screen esté en "Testing", solo los emails de la lista de test users pueden conectar. Para producción pública necesitas el verification process de Google (no urgente — empieza en Testing y solo lo abres cuando tengas tracción real).
- **No reutilices el client_id de Stripe ni el de OAuth interno de tu app.** Estos 4 connectors son OAuth apps externas registradas en Google y Slack, distintas de cualquier OAuth interno de CAMBRA.