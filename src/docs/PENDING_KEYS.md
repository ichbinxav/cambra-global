# Pending credentials & connector IDs

This document tracks the keys/IDs you will provide. When ready, follow the steps below and commit changes.

## App user connectors (OAuth) — required for Admin → Integrations tiles
These IDs are created after registering OAuth app credentials (client ID/secret/scopes) and enabling the connector. Paste the returned connector IDs into `src/lib/connectors.config.js`.

- Google Drive (read-only)
  - scopes: https://www.googleapis.com/auth/drive.readonly
  - Paste into: `CONNECTORS.drive = "cntr_..."`
- Google Sheets (read-only)
  - scopes: https://www.googleapis.com/auth/spreadsheets.readonly
  - Paste into: `CONNECTORS.sheets = "cntr_..."`
- Gmail (read-only labels/messages metadata)
  - scopes: https://www.googleapis.com/auth/gmail.readonly
  - Paste into: `CONNECTORS.gmail = "cntr_..."`
- Slack (read-only to list basic channels)
  - scopes: channels:read, groups:read, im:read, mpim:read
  - Paste into: `CONNECTORS.slack = "cntr_..."`

File to update:
- `src/lib/connectors.config.js`

Frontend tiles using these IDs (appear at the top of Admin → Integrations):
- Component: `src/components/connect/ConnectorTile.jsx`
- Injected in: `src/pages/admin/AdminIntegrations.jsx` (section: "Direct connections")

Backend check functions (already present):
- `functions/driveConnectionCheck`
- `functions/sheetsConnectionCheck`
- `functions/gmailConnectionCheck`
- `functions/slackConnectionCheck`

How it works:
1) User clicks Connect → OAuth popup opens (per-user).
2) When the popup closes, `ConnectorTile` calls the matching `*ConnectionCheck` function to verify access; AdminIntegrations refreshes to reflect status.

Until the IDs are provided, the UI will show "Setup pending" and the button will be disabled (expected).

## Other secrets/keys

### Instantly API v2 — required before any external pilot

- `INSTANTLY_API_KEY`: store only as a Base44 runtime secret.
- `INSTANTLY_WEBHOOK_SECRET`: generate a long random value and store only as a Base44 runtime secret. The same value is installed as the custom `x-cambra-instantly-secret` webhook header by the governed Admin action.
- Never paste either value into source, an entity, a screenshot, a test fixture or this document.
- Until both exist, Admin reports `NOT_CONFIGURED`, effective Instantly capacity is `0`, campaign creation/auth/webhook verification is blocked and outbound remains paused.
- After configuration: run the Admin API v2 diagnostic, configure a paused exact sender profile, create only the DRAFT CAMBRA campaign, register the deployed HTTPS webhook, prove sender warm-up and SPF/DKIM/DMARC, run zero-send dry-run, execute emergency-stop drill, then run a fresh matching CANARY preflight. Starting a pilot remains a separate explicit Founder action.

### Apollo sunset

- Existing `APOLLO_API_KEY` remains temporary lead-intelligence input only through **2026-09-07**.
- Do not add new canonical dependencies on Apollo IDs. Useful harvested data must remain in CAMBRA canonical entities with provenance before expiry.

---
When you hand over the connector IDs, paste them into `src/lib/connectors.config.js`, save, and the Connect buttons will become active automatically.
