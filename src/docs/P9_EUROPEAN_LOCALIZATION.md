# P9 — European localization

P9 separates market, language, locale, currency and timezone. `config/europe-locales.json` is the canonical authored registry; generated frontend and backend copies are drift-checked. All 33 European markets have an explicit locale policy.

The implemented product locales are `en-GB`, `fr-FR` and `es-ES`. Existing critical product dictionaries and long-form legal documents have automated parity coverage. Their presence does not imply legal applicability or legal approval: every market remains `LEGAL_REVIEW_REQUIRED` for that question and P10 owns the decision.

Locale resolution is deterministic. An explicit user selection wins, followed by merchant preference, localized route/domain hints, market default, browser preference, geolocation hint and global fallback. Geolocation is never a lock. Formatting uses `Intl` with explicit locale, currency and timezone.

Markets without a native implemented product locale are reported `FALLBACK_ONLY` and cannot be described as fully localized. CAMBRA currently uses one client-side URL per route, so emitting several `hreflang` values would be false. Localized URL/SSR support is an explicit SEO limitation, not hidden readiness.

Translation provenance is modeled by `TranslationReview`. AI may produce a draft; financial and legal content remains human/legal-review gated.
