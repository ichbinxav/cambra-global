# Checklist de lanzamiento — claves y datos pendientes

Esta lista recoge lo que falta para salir a producción. Actualizaré la app en cuanto compartas cada dato.

## Requeridos (ahora)
- Google Analytics 4 — Measurement ID (formato `G-XXXXXXX`) para activar analíticas.

## Cuando tengas el dominio
- Dominio canónico (p. ej., `https://midominio.com`) para `<link rel="canonical">` y `og:url`.
- Imagen social (Open Graph/Twitter) 1200×630 opcional; si no, seguiremos con la actual.

## Opcionales según funcionalidades
- Pagos (Stripe):
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET` (si activamos webhooks)
- Meta Pixel ID (si quieres publicidad/remarketing).
- Conectores OAuth a autorizar (si vas a conectar datos): Google Drive, Gmail, Google Sheets, Slack. Te guiaré en la autorización cuando lo decidamos.
- Email remitente: “From name” y email de respuesta para notificaciones.
- Datos fiscales para facturación (si emites facturas desde la app): razón social, VAT/Tax ID, dirección.

## Cómo compartirlos
- Pásame los IDs/secretos cuando los tengas y los añadiré de forma segura como variables de entorno (secrets) en Base44.