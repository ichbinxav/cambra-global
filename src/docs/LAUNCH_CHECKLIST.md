# Checklist de lanzamiento

> TRUTH-1 (2026-07-24): reescrito. La versión anterior exigía "Google Analytics 4"
> como requisito de lanzamiento — contradiciendo frontalmente la política de
> cookies publicada ("no ponemos cookies ni almacenamiento de analítica o
> marketing"). También listaba requisitos de la era V1 ya resueltos u obsoletos.

## Estado real de analítica

**La beta se lanza SIN Google Analytics 4** (ni ningún otro tercero de analítica
o marketing). La única medición existente es el contador first-party de páginas
vistas del plugin de plataforma (`analyticsTracker`, ver Decision_Log_TRUTH1.md
Fase 0): envía solo el nombre de página al propio dominio y no escribe nada en
el cliente. Está declarado en la política de cookies §6.

### Prerrequisitos si algún día se introduce GA4 (o cualquier analítica de terceros)

Ninguno de estos existe hoy; **todos** son bloqueantes antes de cargar el primer script:

1. Bloqueo previo al consentimiento — el script NO puede cargarse antes de que
   el usuario acepte la categoría "analytics" del banner.
2. Carga condicionada — leer `cambra_cookie_consent` y cargar solo si
   `analytics: true`; descargar/no inicializar en caso contrario.
3. Actualizar las TRES políticas (cookies, privacidad, términos) en los TRES
   idiomas, con las cookies/claves exactas que el proveedor escriba, ANTES del
   despliegue.
4. Registro de revocación — al retirar el consentimiento, dejar de enviar y
   borrar las cookies/almacenamiento del proveedor.
5. Añadir el proveedor a la lista de subencargados (privacidad §5) y verificar
   su mecanismo de transferencia internacional (§10).

## Pendientes reales (a fecha 2026-07-24)

- **DNS del dominio**: verificación SPF/DKIM de cambra.global para email
  (Resend) — ver DNS_MIGRATION.md.
- **Meta/head en dominio custom**: los meta tags obsoletos en cambra.global
  requieren actualización a nivel de plataforma (deuda conocida).
- **Imagen social** (Open Graph/Twitter) 1200×630 dedicada — opcional; hoy se
  usa el logo.
- **Datos fiscales para facturación** desde la app: razón social, VAT/IVA,
  dirección (cuando se emita la primera factura real).
- **Revisión jurídica** de los puntos [REVISIÓN JURÍDICA] listados en
  Decision_Log_LEGAL1.md y Decision_Log_TRUTH1.md.

## Resueltos (histórico, ya no son pendientes)

- ~~GA4 Measurement ID~~ — decisión: sin analítica de terceros (ver arriba).
- ~~Dominio canónico~~ — cambra.global activo; canonical y og:url apuntan a él.
- ~~Claves Stripe~~ — `STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` /
  `STRIPE_WEBHOOK_SECRET` configuradas como secrets.
- ~~Email remitente~~ — `RESEND_FROM` / `RESEND_API_KEY` configurados.
- ~~Meta Pixel~~ — descartado: incompatible con la postura de privacidad
  publicada; si se reconsidera, aplican los mismos 5 prerrequisitos de GA4.
- ~~Conectores OAuth Drive/Gmail/Sheets/Slack~~ — era V1 multivertical;
  el producto payments-only no los usa.