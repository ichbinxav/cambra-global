# CAMBRA product analytics taxonomy

Version: `cambra-product-events-v1`

Product events are sent to Base44 first-party analytics only after the browser has stored explicit `analytics: true` consent in `cambra_cookie_consent`. Tracking is best-effort and must never change product behavior.

Allowed events: `onboarding_started`, `onboarding_completed`, `integration_started`, `integration_connected`, `integration_failed`, `analysis_started`, `analysis_completed`, `analysis_failed`, `results_viewed`, `opportunity_viewed`, `recover_started`, `recover_accepted`, `recover_abandoned`, `document_uploaded`, `document_processing_failed`, `provider_connection_started`, `provider_connection_completed`, `critical_admin_action`.

Allowed properties are a small scalar allowlist: source, channel, provider, status, reason code, mode, locale, market, step, document type and action. Email, personal/company names, tokens, URLs, session/user/entity identifiers, filenames, document bodies and message content are rejected. This is a product funnel signal, not a financial, billing, legal or operational source of truth.
