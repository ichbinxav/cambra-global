# CAMBRA landing release matrix

Generated 2026-08-12 from the canonical P1/P9 registries. This is an engineering-readiness artifact, not legal advice and not a GO decision.

## Truth status

- Overall: **PARTIAL_PRODUCTION_READINESS**
- Landing informational coverage: **33/33 markets**
- Analyzer action enabled: **2/33 markets (FR, ES)**
- Product locales implemented: **3**
- Market-specific legal applicability approved: **0/33**
- Hreflang: **not emitted** because CAMBRA has no independent localized URLs or SSR/prerender surface

## Market × experience matrix

| Code | Market | Currency | Default locale | Translation | Analyzer | Recovery | Legal applicability |
|---|---|---:|---|---|---|---|---|
| AT | Austria | EUR | de-DE | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| BE | Belgium | EUR | fr-FR | PARTIAL_NATIVE | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| BG | Bulgaria | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| HR | Croatia | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| CY | Cyprus | EUR | el-GR | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| CZ | Czechia | CZK | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| DK | Denmark | DKK | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| EE | Estonia | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| FI | Finland | EUR | en-GB | PARTIAL_NATIVE | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| FR | France | EUR | fr-FR | NATIVE_PRODUCT | ENABLED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| DE | Germany | EUR | de-DE | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| GR | Greece | EUR | el-GR | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| HU | Hungary | HUF | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| IE | Ireland | EUR | en-GB | PARTIAL_NATIVE | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| IT | Italy | EUR | it-IT | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| LV | Latvia | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| LT | Lithuania | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| LU | Luxembourg | EUR | fr-FR | PARTIAL_NATIVE | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| MT | Malta | EUR | en-GB | PARTIAL_NATIVE | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| NL | Netherlands | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| PL | Poland | PLN | pl-PL | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| PT | Portugal | EUR | pt-PT | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| RO | Romania | RON | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| SK | Slovakia | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| SI | Slovenia | EUR | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| ES | Spain | EUR | es-ES | NATIVE_PRODUCT | ENABLED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| SE | Sweden | SEK | sv-SE | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| NO | Norway | NOK | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| IS | Iceland | ISK | en-GB | FALLBACK_ONLY | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| LI | Liechtenstein | CHF | de-DE | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| CH | Switzerland | CHF | de-DE | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| GB | United Kingdom | GBP | en-GB | NATIVE_PRODUCT | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| AD | Andorra | EUR | es-ES | PARTIAL_NATIVE | LIMITED | REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |

## Product locale matrix

| Locale | Language | Translation | Automated quality | Legal review |
|---|---|---|---|---|
| en-GB | en | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| fr-FR | fr | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| es-ES | es | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| de-DE | de | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| it-IT | it | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| pl-PL | pl | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| pt-PT | pt | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| el-GR | el | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |
| sv-SE | sv | IMPLEMENTED | AUTOMATED_QA | LEGAL_REVIEW_REQUIRED |

Language choice and operating market are separate. Browser locale/timezone provides only a suggestion. An explicit market selection is authoritative for the public experience, but never grants legal or execution authority.

## Authoritative European baseline sources

- [EUR-Lex — EU personal-data baseline](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=EN) — AUTHORITATIVE_SOURCE_RECORDED
- [EUR-Lex — Electronic communications and device storage baseline](https://eur-lex.europa.eu/eli/dir/2002/58/oj) — AUTHORITATIVE_SOURCE_RECORDED
- [European Data Protection Board — Consent interpretation](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en) — AUTHORITATIVE_GUIDANCE_RECORDED
- [European Commission — EU online-service transparency baseline](https://digital-strategy.ec.europa.eu/en/policies/e-commerce-directive) — AUTHORITATIVE_SOURCE_RECORDED

These sources establish research baselines only. They do not validate national implementation, B2B terms, tax, marketing, recovery mandates or regulated activity for any particular market.

## Honest blockers

- Native product translation is implemented only for en-GB, fr-FR and es-ES.
- Every market remains LEGAL_REVIEW_REQUIRED for market-specific applicability.
- Localized URL/SSR infrastructure does not exist, so hreflang is intentionally not emitted.
- Analyzer execution is enabled only for FR and ES; the other 31 markets are intelligence-only.

## Implemented landing controls

- Market and language selectors are distinct.
- Market currency is sourced from the canonical P1 registry.
- Unsupported markets route to access review instead of Analyzer execution.
- Public claims no longer use a fabricated merchant example or universal savings claim.
- Evidence states are explicit: estimated, provisional and verified.
- Consent categories default off; accept, reject and granular choices are available.
- Consent can be reopened and withdrawn from the Cookie Policy.
- Legal pages identify their unverified market-specific translation/applicability status.
- Unknown routes remain noindex by default; canonical metadata stays centralized.

