import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // TRUTH-1 Fase 4 (2026-07-24): was 'error' (warnings hidden blind).
  // Build warnings are inventoried in Decision_Log_TRUTH1.md.
  logLevel: 'warn',
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      // TRUTH-1 Fase 0 (2026-07-24) — flags audited against the plugin source
      // (dist/html-injections-plugin.js). hmrNotifier / navigationNotifier /
      // visualEditAgent inject ONLY in dev mode (Base44 editor preview) and
      // never ship in the production build. analyticsTracker is the single
      // production injection: an inline first-party script that POSTs the page
      // NAME (first path segment) to /api/app-logs/... on the app's own origin
      // — no cookies, no local/sessionStorage, no third-party domain, no query
      // strings. Kept ON because it feeds the Base44 workspace analytics panel;
      // it is declared in the cookie policy (§6). Set to false to remove it.
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ]
});