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
- (Add here any additional API keys or webhooks you plan to share later.)

---
When you hand over the connector IDs, paste them into `src/lib/connectors.config.js`, save, and the Connect buttons will become active automatically.