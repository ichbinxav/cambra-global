# CAMBRA Founder/Admin Settings V2 — implementation matrix

Status: implemented as a lightweight configuration surface over canonical
stores. Settings configures or explains configuration; it does not operate
CAMBRA.

## Architecture and quota

- UI: one lazy route, `/admin/settings`, with eight sections and lightweight
  local search.
- Read model: section-lazy `view: settings` mode on the existing
  `getFounderControlCenter` physical function, using
  `base44/shared/adminSettingsV2.ts`.
- Writes currently supported: audited Founder locale/market/currency/timezone
  preference through `founderOSCommand`.
- Physical function count remains **276**; logical route count remains **27**.
- Settings never queries credential entities directly from the browser.

## Requirement mapping

| Section | Canonical source / behavior | Result |
|---|---|---|
| Company | `cambraLegalIdentity.ts`; public identity plus Admin-only fiscal runtime profile and cross-consumer consistency evidence | Implemented, release-managed |
| Users & Access | Base44 internal-admin projection only; merchant/user accounts are not queried or mixed into Settings | Implemented honestly; granular RBAC/MFA/session control not fabricated |
| Language & Region | `LocalePreference` stores language, locale, market, currency, timezone, date/number/currency formats and first day of week independently | Implemented |
| Notifications | Real HIGH/CRITICAL deduplicated email policy and masked recipient | Read-only; category/digest/quiet-hours remain unavailable until a real consumer exists |
| Integrations | Sanitized `Integration`, provider state and sending-profile projections | Implemented; secrets omitted, mutations remain provider-specific |
| AI & Costs | Canonical global cost control, usage and hard caps | Implemented read-only with deep link to governed Founder Control mutation |
| Data & Privacy | Versioned retention engine/evidence and k≥10 privacy boundary | Implemented read-only; safeguards cannot be weakened in Settings |
| Developer / Advanced | Curated deployment identity and canonical control flags | Implemented read-only; no environment editor |

## Deliberately unsupported rather than simulated

- Finance/Commercial/Operations/Read-only internal roles: the current
  authorization model only supports admin/user.
- MFA status, session revocation and suspension: not exposed by the canonical
  Base44 user model used by this app.
- Per-category notification preferences, digests and quiet hours: there is no
  canonical preference consumer yet. Mandatory HIGH/CRITICAL alerts remain
  governed by incident alerting.
- Arbitrary edits to legal identity, model routing, feature flags, retention or
  private fiscal environment values: these remain release/policy governed.

## Security and performance

- Every section is loaded independently; merchant datasets, logs, agent runs,
  backups and incident history are not loaded into Settings.
- The entire Settings surface renders atomically in English, French or Spanish;
  all three dictionaries are parity-checked in tests.
- Access tokens, refresh tokens, webhook secrets and arbitrary integration
  metadata are absent from the response projection.
- Private fiscal references are returned only by the authenticated admin
  endpoint and are never embedded in the public bundle.
- Operational controls, Emergency Stop, approvals, backups, workers and
  outbound execution remain on their dedicated pages.

## Truth boundary

“Not configured” or “platform-managed/not exposed” is a real state, not a UI
failure. Settings never presents an unsupported toggle as operational and never
turns a connection into authority.
