import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function productionChunk(id) {
  if (id.includes('vite/preload-helper')) return 'vite-runtime'
  if (!id.includes('/node_modules/')) return undefined
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-core'
  if (id.includes('/node_modules/@base44/')) return 'base44-runtime'
  if (id.includes('/node_modules/@radix-ui/') || id.includes('/node_modules/@floating-ui/') || /\/node_modules\/(cmdk|vaul|sonner|react-hot-toast|react-remove-scroll)\//.test(id)) return 'ui-runtime'
  if (id.includes('/node_modules/@tanstack/') || /\/node_modules\/(react-router|react-router-dom|@remix-run)\//.test(id)) return 'navigation-data-runtime'
  if (/\/node_modules\/(recharts|d3-|victory-vendor)\//.test(id)) return 'charts-runtime'
  if (/\/node_modules\/(framer-motion|@hello-pangea|embla-carousel)\//.test(id)) return 'motion-runtime'
  if (/\/node_modules\/(jspdf|dompurify|fflate|fast-png)\//.test(id)) return 'document-pdf-runtime'
  if (id.includes('/node_modules/html2canvas/')) return 'document-canvas-runtime'
  if (/\/node_modules\/(react-markdown|remark-|rehype-|mdast-|micromark|unified)\//.test(id)) return 'markdown-runtime'
  if (/\/node_modules\/(react-leaflet|leaflet|three)\//.test(id)) return 'map-runtime'
  if (/\/node_modules\/(react-hook-form|@hookform|zod)\//.test(id)) return 'form-runtime'
  if (/\/node_modules\/(date-fns|moment)\//.test(id)) return 'date-runtime'
  if (id.includes('/node_modules/lucide-react/')) return 'icons-runtime'
  if (id.includes('/node_modules/@stripe/')) return 'stripe-runtime'
  if (/\/node_modules\/(lodash|tailwind-merge|clsx|class-variance-authority)\//.test(id)) return 'utilities-runtime'
  return 'vendor-runtime'
}

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
  ],
  build: {
    rollupOptions: {
      output: { manualChunks: productionChunk },
    },
  },
});
