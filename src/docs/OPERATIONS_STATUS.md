# OPERATIONS_STATUS

> Living document of platform/domain configuration required for CAMBRA to operate
> correctly in production. Each section lists what is done, what is pending, and
> who must act.

---

## Product scope (v59, 2026-08-05)

**Source of truth:** `src/lib/featureScope.js` — `FEATURE_SCOPE` registry.
**Rule:** a surface may show a category only when its vertical is both
`productionEnabled` and `merchantVisible`. The Help Center (`getVisibleCategories`
in `helpCenterData.js`) and the Help SEO dynamic resolver consume this registry.

- **Active category:** payments (card payments — online PSP + in-store TPV).
- **Active channels:** online (PSP) and in-store (TPV / physical terminal).
- **Live connections:** Stripe — read-only OAuth (balance transactions, charges,
  fee breakdown). Live status is conditional on the OAuth flow being operational
  and proven with a real account; verify before any "live" claim in copy.
- **Upload-supported formats:** PDF, CSV, Excel (.xls/.xlsx), PNG, JPG (max 20MB).
  Statement upload works for any PSP or TPV provider, including those not on the
  connected list.
- **Code-level connectors (not live / not merchant-presented):** Shopify, WooCommerce,
  BigCommerce (commerce platforms whose data could feed the payments analysis),
  Google Drive, Google Sheets, Gmail, Slack. These remain in code (registry /
  normalizers) as dormant infrastructure and MUST NOT appear in Help, onboarding,
  navigation, pricing, or any merchant-facing claim as available integrations.
- **Future categories (roadmap, not currently available):** shipping, SaaS,
  insurance, telecom, energy, banking, financing. These may be presented only as
  explicit roadmap — no launch dates, no activation CTA.
- **Retired Help slugs:** `shipping`, `saas`, `insurance`, `telecom`, `energy`,
  `banking`, `financing`, `cambra-pro`, `founding-period`, `logistics`
  (see `RETIRED_HELP_SLUGS` in `helpCenterData.js`). `/Help/<retired-slug>`
  redirects to `/Help`; SeoMeta emits `noindex,nofollow` for them.
- **Prohibited merchant-facing claims:** "CAMBRA Pro", "Founding period",
  "Founding membership", "membership plan", "connect all your tools",
  "all your infrastructure", "all providers", "production-ready" for unproven
  connectors, presenting dormant verticals as active services.
- **Allowed vision framing:** "CAMBRA starts with card payments", "Payments are
  the first infrastructure category", "Additional categories may be introduced
  only after validation", "Future infrastructure categories are not currently
  available". "Infrastructure Intelligence" may remain as corporate positioning
  when explained as long-term vision.
- **Review date:** 2026-08-05. **Owner:** product/engineering (no per-file owners
  in repo).

### Documents marked historical (do not treat as a current checklist)

The following docs describe earlier phases or the pre-pivot multi-vertical
product. They are kept for history; where they contradict this section, this
section wins:

- `src/docs/LAUNCH_CHECKLIST.md`, `src/docs/PENDING_KEYS.md`,
  `src/docs/OAUTH_SETUP_PENDING.md`, `src/docs/KNOWN_DEBT.md`, `README.md`,
  `src/README.md`, and `src/docs/Decision_Log_*.md`.

---

## SEO — Centralized per-route metadata (SEO-1, 2026-08-05)

### What is implemented

- **Single source of truth:** `src/lib/seoConfig.js` defines canonical path,
  title (EN/FR/ES), description (EN/FR/ES), `og:type`, robots and JSON-LD for
  every public route.
- **Single writer:** `src/components/shared/SeoMeta.jsx` renders inside
  `<Router>` and updates `document.title`, meta description, Open Graph
  (title/description/type/url/image/locale), Twitter, canonical link, robots
  and the per-route JSON-LD (`#cambra-route-jsonld`) on every route **and**
  language change.
- **No competing systems:** the language provider (`src/lib/i18n.jsx`) no longer
  writes meta tags — it keeps only `<html lang>`. The old `RobotsMeta` component
  was removed; `SeoMeta` is the only decision point for the robots meta.
- **Safe default:** any route not listed in `seoConfig.js` is rendered
  `noindex,nofollow`. This covers Dashboard, Results, Account, Reports, Vault,
  Invoices, ConnectTools, ConnectIntegrations, admin, LoginGate, HealthCheck
  and every alias/redirect route.
- **Canonical hygiene:** canonical and `og:url` are normalized to
  `https://cambra.global` + canonical path (root keeps a trailing slash, all
  others none). Query strings, tokens and hashes are ignored.

### Public canonical routes (indexable)

```
/                /Analyzer       /HowItWorks   /Pricing       /Partners
/ForProviders    /Testimonials   /Contact      /Security      /Help
/Help/:slug      /Privacy        /Terms        /Cookies
```

### SPA limitation (IMPORTANT — not faked)

CAMBRA is a React + Vite SPA served by Base44. There is **no server-side render
and no per-route prerender** on the platform today. `index.html` is a single
shell with homepage metadata; `SeoMeta` rewrites the head **client-side after
JavaScript executes**.

Consequences:

- ✅ **Google (and any JS-executing crawler):** per-route title, description,
  canonical, Open Graph, JSON-LD and robots are applied correctly. This is the
  primary SEO surface.
- ⚠️ **Social scrapers that do NOT execute JavaScript** (LinkedIn, WhatsApp,
  Facebook, Slack, X card crawlers, some preview tools): these read the static
  `index.html` head. They will see the **homepage** title/description/OG image
  for **every** shared URL. Per-route social previews will NOT work for them
  until a server-side solution is in place.

### Manual configuration required (to enable per-route social previews)

Pick **one** of the following when the platform supports it. Do NOT pretend it
works today.

1. **Base44 prerender / SSR** (preferred): if Base44 ships a per-route
   server-render or prerender feature for public pages, enable it for the 13
   canonical public routes listed above so the head is correct in the raw HTML.
   Then `SeoMeta` becomes a progressive enhancement rather than the only writer.
2. **Edge/CDN prerender** (e.g. Cloudflare, Vercel, Netlify prerender): if the
   `cambra.global` domain is fronted by a CDN that supports prerendering for
   bots, configure it to serve a rendered snapshot for the public routes to
   known social-user-agents. This is a **DNS / proxy** change, not an app
   change.
3. **Static per-route HTML** (manual fallback): generate per-route
   `index.html`-equivalent heads for the 13 public routes and serve them at the
   canonical paths. Not currently available through Base44's single-shell
   model — would require a build-time prerender step (`react-snap` /
   `vite-plugin-ssg`). Out of scope for now.

### hreflang

Not emitted. The app switches language client-side without independent
`/en`, `/fr`, `/es` URL paths, so hreflang would point three languages at the
same URL — a false signal. `SeoMeta` is structured to add hreflang the day
localized routes exist. No migration is planned in this phase.

### Domain configuration

- `cambra.global` must be the primary domain in the Base44 app settings
  (canonical origin is hard-coded to `https://cambra.global` in `seoConfig.js`).
- `https://cambra.global` → the Base44 app (DNS A/CNAME or Base44 domain
  mapping). The `sitemap.xml` and `robots.txt` reference this origin.
- Verify SPF/DKIM for `@cambra.global` email (separate, see email config).

### Files

- `src/lib/seoConfig.js` — per-route config (edit titles/descriptions here).
- `src/components/shared/SeoMeta.jsx` — the writer component.
- `public/sitemap.xml` — kept in sync with `CANONICAL_PUBLIC_PATHS` (verified by
  tests).
- `public/robots.txt` — `Allow: /`, `Disallow: /functions/`, `Disallow: /auth/`.
- `src/lib/seoSurface.test.js` — invariant tests for the SEO surface.