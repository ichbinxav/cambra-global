// LEGAL-1 (2026-07-24) — Cookie & storage policy content, built from the
// code-verified inventory in src/docs/Decision_Log_LEGAL1.md (Fase 0).
// Every row below corresponds to an identifier actually set by the code
// (writer file:line documented in the Decision Log). Do NOT add entries
// here without adding them to the inventory first.

export default {
  badge: "Legal · Cookie policy",
  title: "Cookie Policy.",
  lastUpdated: "Last updated: 12 August 2026",
  back: "Back",
  columns: { name: "Name", purpose: "Purpose", duration: "Duration", category: "Category" },
  intro: [
    {
      title: "1. What this policy covers",
      body: "Cookies are small text files stored on your device by your browser. The platform also uses browser storage — localStorage (persists after you close the browser) and sessionStorage (cleared when the tab closes). Browser storage is not technically a cookie, but it serves comparable purposes, so this policy lists both — exactly as used by the application, verified against our source code.",
    },
    {
      title: "2. How CAMBRA uses them",
      body: "Strictly to operate the platform: keep you signed in, hand your anonymous analysis over to your new account, and remember preferences such as your language. We set no advertising cookies, no third-party trackers, no behavioral profiling and no cross-site identifiers.",
    },
  ],
  tables: [
    {
      heading: "3. Cookies",
      note: "First-party cookies set on the cambra.global domain.",
      rows: [
        { name: "cambra_anon_session", purpose: "Carries your anonymous analysis session across sign-up so your report can be attached to your new account", duration: "30 minutes", category: "Strictly necessary" },
      ],
    },
    {
      heading: "4. localStorage",
      note: "Persists until you clear your browser's site data.",
      rows: [
        { name: "base44_access_token", purpose: "Authentication token issued by our platform provider (Base44) that keeps you signed in. A legacy alias named 'token' is written alongside it by the platform SDK", duration: "Until sign-out or browser data cleared", category: "Strictly necessary" },
        { name: "cambra_pending_anon_session", purpose: "Same purpose as the cambra_anon_session cookie, same-browser channel; removed automatically once your report is attached", duration: "Deleted automatically once used", category: "Strictly necessary" },
        { name: "cambra_cookie_consent", purpose: "Records the consent-policy version, your category choices, interface locale, choice source and timestamp", duration: "Until browser data cleared or consent withdrawn", category: "Strictly necessary" },
        { name: "cambra_lang", purpose: "Remembers your language preference (EN/FR/ES). A legacy key from an earlier version (node_lang) may still be read — never written — to migrate this preference", duration: "Until browser data cleared", category: "Functional" },
        { name: "cambra_market", purpose: "Remembers the European operating market you selected. Browser locale or timezone is used only to suggest a market until you make an explicit choice", duration: "Until browser data cleared or automatic mode restored", category: "Functional" },
        { name: "cambra_copilot_open", purpose: "Remembers whether the assistant panel is open or closed", duration: "Until browser data cleared", category: "Functional" },
      ],
    },
    {
      heading: "5. sessionStorage",
      note: "Cleared automatically when the browser tab closes.",
      rows: [
        { name: "cambra_redirect_after_login", purpose: "Remembers the page you were trying to reach so you land back on it after signing in", duration: "Until the tab closes", category: "Strictly necessary" },
        { name: "cambra_ref_code", purpose: "Remembers the referral code of the business whose invite link you opened, so the referral can still be recorded when you run your analysis a few screens later. An opaque random code, not derived from personal data", duration: "Until the tab closes", category: "Strictly necessary" },
        { name: "cambra_chat_conv", purpose: "Remembers the active conversation in the administration chat (admin accounts only)", duration: "Until the tab closes", category: "Functional" },
      ],
    },
  ],
  after: [
    {
      title: "6. Your consent choices",
      body: "On your first visit, the consent banner gives equally available choices to accept all, reject optional categories or manage preferences. Analytics and marketing start switched off; strictly necessary storage remains active. Your versioned choice is recorded in cambra_cookie_consent. CAMBRA uses two first-party measurements on the same hosting platform: a page-view counter sends the page name when you navigate, and — only when analytics is enabled — a closed set of product-funnel events such as analysis started/completed or Recover accepted. These events reject email addresses, names, tokens, URLs, session/user/entity identifiers, filenames and free text. Neither measurement sets an analytics or advertising cookie; no third-party advertising network is involved. Turning analytics off prevents the consent-gated product events. You can reopen the consent settings from this page at any time.",
    },
    {
      title: "7. Managing cookies & storage",
      body: "Strictly necessary entries cannot be disabled — the platform does not work without them. Functional entries can be removed at any time from your browser settings (clear cookies and site data); the only effect is losing the corresponding preference.",
    },
    {
      title: "8. Contact",
      body: "Questions about how CAMBRA uses cookies and browser storage: privacy@cambra.global. Publisher: CAMBRA Global SASU, SIREN 105 452 916, SIRET 105 452 916 00015, EU VAT FR50105452916, 47 rue Vivienne, Chez Vivienne Domiciliation, 75002 Paris, France.",
    },
  ],
};
