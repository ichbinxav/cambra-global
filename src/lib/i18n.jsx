import { useState, useEffect, createContext, useContext, useCallback, useMemo } from "react";

/* ──────────────────────────────────────────────────────────────
   CAMBRA i18n — EN / FR / ES with flat-key dictionaries.

   API:
     const { lang, setLang, t, formatCurrency, formatDate } = useTranslation();
     t("hero_headline")                         → string
     t("benchmarked_against", { n: 42 })        → replaces {n}
     t(obj, "en")  // legacy 2-arg form for older components
   ────────────────────────────────────────────────────────────── */

export const LANGUAGES = [
  { code: "en", label: "English", short: "EN" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "es", label: "Español", short: "ES" },
];

const STORAGE_KEY = "cambra_lang";
const LEGACY_KEYS = ["node_lang"];

/* ── locale helpers ───────────────────────────────────────── */
const CURRENCY_LOCALES = { en: "en-IE", fr: "fr-FR", es: "es-ES" };
const DATE_LOCALES     = { en: "en-GB", fr: "fr-FR", es: "es-ES" };

export function formatCurrency(amount, lang = "en") {
  const locale = CURRENCY_LOCALES[lang] || CURRENCY_LOCALES.en;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    return `€${Math.round(Number(amount) || 0).toLocaleString()}`;
  }
}

export function formatDate(date, lang = "en") {
  if (!date) return "";
  const locale = DATE_LOCALES[lang] || DATE_LOCALES.en;
  try {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(date));
  } catch {
    return String(date);
  }
}

/* ── dictionaries (flat keys) ─────────────────────────────── */
const DICT = {
  en: {
    /* meta */

    /* navigation */
    nav_dashboard:    "Dashboard",
    nav_analyzer:     "Analyzer",
    nav_connect:      "Connect Tools",
    nav_reports:      "Reports",
    nav_settings:     "Settings",
    nav_how:          "How it works",
    nav_pricing:      "Pricing",
    nav_get_started:  "Get started",

    /* sidebar (app shell) */
    sidebar_results:      "Results",
    sidebar_documents:    "Documents",
    sidebar_account:      "Account",
    sidebar_workspace:    "Workspace",
    sidebar_network_live: "Network live",
    sidebar_admin:        "Admin Panel",
    sidebar_homepage:     "Go to homepage",
    sidebar_signout:      "Sign out",

    /* landing — hero */
    hero_badge:           "Pay only if we save you money",
    hero_h1_line1:        "Stop overpaying.",
    hero_h1_line2:        "Recover the margin.",
    hero_sub:             "Most independent brands overpay up to 40% on card payments — hidden inside blended rates. CAMBRA measures your effective rate against the interchange floor and recovers what's negotiable. You keep 75%. We only get paid when you do.",
    hero_cta_primary:     "Recover your margin — 3 min",
    hero_cta_secondary:   "Discover real brands savings",
    hero_trust_1:         "No retainer · no contract",
    hero_trust_2:         "Credentials encrypted, never in plain text",
    hero_trust_3:         "EU brands only",

    /* landing — how it works (steps) */
    how_h2:               "Four steps from estimate to recovered margin.",
    how_h2_pre:           "Four steps from estimate to",
    how_h2_hl:            "recovered margin",
    how_step1_title:      "Tell us what you process",
    how_step1_desc:       "Your annual GMV, average ticket, and current PSP. Sixty seconds. Nothing to connect.",
    how_step2_title:      "See your effective rate",
    how_step2_desc:       "We compare what you actually pay against the interchange floor — the real minimum for cards your size.",
    how_step3_title:      "Connect your provider to confirm",
    how_step3_desc:       "Read-only. Your estimate becomes a confirmed number from your real transaction data.",
    how_step4_title:      "Join to recover it",
    how_step4_desc:       "Claim your savings and join the brands negotiating as one. Together we unlock rates none of us could get alone.",

    /* landing — hero */

    /* landing — problem */

    /* landing — how */
    how_label:            "How it works",

    /* landing — benchmark */

    /* landing — pricing/cta */

    /* footer */
    footer_tagline:       "Efficient infrastructure for independent commerce.",
    footer_privacy:       "Privacy Policy",
    footer_terms:         "Terms of Service",
    footer_contact:       "Contact",
    footer_for_providers: "For providers",

    /* analyzer — step 1 */

    /* analyzer — step 2 */
    detected_source_stripe:  "Stripe",

    /* analyzer — step 3 */
    az_step3_verified:    "Payments upgraded to verified ✓",

    /* analyzer — progress */

    /* results */
    hero_confidence_estimated:    "Estimated — connect Stripe to verify",
    hero_confidence_verified:     "Verified — based on real Stripe data",
    hero_confidence_provisional:  "Provisional — verified on partial Stripe data. Connect more history to lock in.",
    payments_title:               "Payments",
    payments_verified:            "Verified with Stripe ✓",
    payments_provisional:         "Provisional · partial Stripe data",
    connect_more:                 "Connect more tools to improve accuracy",

    /* dashboard */
    state_a_title:        "Map your infrastructure in 3 minutes",
    state_a_sub:          "Enter your website. CAMBRA automatically detects your payment providers, shipping carriers and SaaS tools — then benchmarks your costs against anonymized data from European brands at your revenue tier.",
    state_a_cta:          "Start free analysis →",
    state_b_badge:        "Estimated",
    state_c_badge:        "Verified ✓",
    state_c_badge_provisional: "Provisional",
    savings_to_date:      "Savings to date",
    this_month:           "This month",
    identified_potential: "Identified potential",
    next_report:          "Next report: {date}",
    your_infrastructure:  "Your infrastructure",
    ai_insights:          "AI Insights",
    review_approve:       "Review & Approve →",
    rescan:               "Re-scan now",
    scanning:             "Scanning…",

    /* connect tools */
    ct_page_title:        "Connect your infrastructure",
    ct_page_sub:          "Every connection improves your benchmark accuracy and savings confidence.",
    ct_group_psp:         "PSP · Online payments",
    ct_group_tpv:         "TPV · In-store terminal",
    ct_group_commerce:    "Commerce",
    ct_group_commerce_sub:"To detect your volume — not a payment provider",
    summary_detected:     "{n} tools detected",
    summary_connected:    "{n} connected",
    summary_available:    "{n} available",
    found_in_stripe:      "Found in Stripe — €{amount}/mo",
    connect_to_verify:    "Connect to verify →",
    coming_soon:          "Coming soon",
    last_sync:            "Last sync: {time}",
    sync_now:             "Sync now",

    /* badges */
    badge_verified:       "Verified",
    badge_estimated:      "Estimated",
    badge_mixed:          "Mixed",
    badge_connected:      "Connected",
    badge_detected:       "Detected",
    badge_available:      "Available",
    badge_coming_soon:    "Coming soon",
    badge_high:           "High confidence",
    badge_medium:         "Medium confidence",
    badge_low:            "Low confidence",

    /* categories */
    cat_other:            "Other",

    /* validation errors */

    /* analyzer — extra UI strings */

    /* results — extras */
    per_mo_short:         "mo",
    per_yr_short:         "yr",

    /* dashboard — extras */
    auto_detection:       "Automatic detection",
    bench_comparison:     "Benchmark comparison",
    savings_calc:         "Savings calculation",
    dashboard_word:       "Dashboard",
    measured_cumulative:  "Measured cumulative savings — past, not projected.",
    from_latest_analysis: "From your latest analysis",
    last_12_months:       "Last 12 months",
    tracking_starts_next: "Tracking starts next month",
    tracking_will_appear: "Savings tracking will appear once your first monthly report is generated.",
    partially_verified:   "Partially verified",
    estimated_label:      "Estimated",
    verified_label:       "Verified",

    /* AI insights */
    ai_latest_runs:       "Latest agent runs",
    ai_loading:           "Loading agent runs…",
    ai_empty:             "AI analysis will appear after your first Analyzer run.",
    ai_open_analyzer:     "Open Analyzer",
    ai_confidence:        "Confidence {pct}%",
    ai_pending_review:    "Pending admin review.",
    agent_payments:       "Payments Agent",
    agent_recommendation: "Recommendation Agent",
    agent_general:        "General Agent",
    status_running:       "Running",
    status_awaiting:      "Awaiting approval",
    status_approved:      "Approved",
    status_rejected:      "Rejected",
    status_completed:     "Completed",
    status_failed:        "Failed",

    /* Last scan */
    continuous_discovery: "Continuous discovery",
    last_scan_ago:        "Last scan {time}",
    changes_detected_n:   "{n} change{plural} detected",
    never_label:          "never",
    last_scan_never:      "Never scanned",
    just_now:             "just now",
    minutes_ago:          "{n}m ago",
    hours_ago:            "{n}h ago",
    days_ago:             "{n}d ago",

    /* FIX 1 — ConnectTools category labels (R2: reduced to payments+commerce) */
    cat_payments:         "Payments",
    cat_commerce:         "Commerce",

    /* M4-TPV Fase 2B — in-store landing upsell strip */
    landing_upsell_in_store_eyebrow: "Also for in-store",
    landing_upsell_in_store_title:   "Physical terminals count too.",
    landing_upsell_in_store_desc:    "We audit your TPV — SumUp, Stripe Terminal, Smile & Pay, Zettle, or your traditional bank acquirer. Same 60-second audit, same 25% success fee, same in-store or online.",
    landing_upsell_in_store_cta:     "Audit my TPV",

    /* M4-TPV Fase 3 — Analyzer channel tabs + CombinedGapHero strings.
       Consumed by PaymentsAnalyzer (tab labels) and CombinedGapHero
       (results page hero for combined submits). */
    analyzer_channel_online:      "Online",
    analyzer_channel_in_store:    "In-store",
    analyzer_channel_combined:    "Both",
    /* payments results — already_optimized state + combined mini-victory (M4-refinado v1.5.0) */
    opt_hero_eyebrow: "Payments audit",
    opt_hero_title: "You're at the floor",
    opt_hero_body: "Your current effective rate is at or below the best publicly contractable rate for merchants of your size and region. There's no meaningful gap for us to help you recover on this channel.",
    opt_hero_cta_secondary: "Re-run with different inputs",
    opt_footnote: "Below MAX(€200 / year, 15 bps of annual GMV) — the noise floor of our estimate.",
    opt_channel_pill: "✓ Already at the best contractable rate",
    combined_mixed_total_note: "Total sums channels with a recoverable gap. Optimized channels contribute €0.",
    insufficient_hero_title: "We don't have a defensible answer",
    insufficient_hero_body: "Your inputs land on a regional-average benchmark rather than a provider-verified one, or the multi-anchor pool for your channel is empty. Rather than show a number we can't back, we're routing you to connect your PSP for an exact figure.",
    insufficient_hero_cta: "Connect your PSP",
    combined_hero_eyebrow:        "Payments gap · combined",
    combined_hero_badge:          "Online + In-store",
    combined_hero_lead:           "Your total overpayment across channels is roughly",
    combined_hero_month_suffix:   "a month, summed across channels.",

    /* Step 3 — Score CTA + RecoveryRoadmap (payments-only) */
    score_cta_recover:    "See how we recover it",
    score_cta_unlock:     "Unlock your plan",
    score_cta_toptier:    "You're top-tier · monitor drift",
    roadmap_recoverable:  "RECOVERABLE",
    roadmap_up_to:        "up to",
    roadmap_per_year:     "/ year",
    roadmap_range:        "range",
    roadmap_ambition:     "Brands in your tier reach ~{x}% — where the collective pushes",
    roadmap_routes:       "Routes to get there",
    route_margin_title:   "We renegotiate your margin",
    route_rate_title:     "We move you to a better rate",
    route_verify_title:   "Connect to verify and we start",
    route_cta_migration:  "Start your managed migration",
    route_cta_collective: "Reserve your spot in the collective",
    route_cta_verify:     "Connect to verify",
    route_cta_call:       "Book a call",
    route_caveat_estimated: "Target estimated from market ranges, subject to verification.",
    meta_effort_low:      "effort low",
    meta_effort_med:      "effort medium",
    meta_effort_high:     "effort high",
    meta_conf_high:       "confidence high",
    meta_conf_med:        "confidence medium",
    meta_conf_low:        "confidence estimated",
    meta_prio_high:       "priority high",
    meta_prio_med:        "priority medium",
    roadmap_toptier_title: "You're top-tier",
    roadmap_toptier_body:  "Your payments setup is already at the market floor. We monitor your drift for free so it stays that way — if it ever moves, we'll tell you.",
    roadmap_locked_more_one:   "+{n} more route in your plan",
    roadmap_locked_more_other: "+{n} more routes in your plan",
    roadmap_locked_sub:    "Create your account to unlock your full recovery plan.",

    /* Report v2 — Pieza C: peer benchmark distribution */
    bench_title:          "Where you stand vs brands like you",
    /* Label refined off "illustrative" (dented perceived validity) to a
       regional benchmark badge. Internally the cohort still grows and the
       percentile is anchored to seeded market ranges — that nuance lives in
       AssumptionsFootnote, not this badge. */
    bench_regional:       "Regional benchmark · {country}",
    bench_regional_nocountry: "Regional benchmark",
    bench_top10:          "Top 10%",
    bench_median:         "Peer median",
    bench_you:            "YOU",
    bench_axis_cheaper:   "cheaper",
    bench_axis_pricier:   "pricier",
    bench_callout:        "You're in the most expensive ~{pct}% of {country} brands your size.",
    bench_callout_nocountry: "You're in the most expensive ~{pct}% of brands your size.",
    bench_callout_cheaper:   "You're cheaper than ~{pct}% of {country} brands your size.",
    bench_callout_cheaper_nocountry: "You're cheaper than ~{pct}% of brands your size.",

    /* Report v2 — Collective (clickwrap-lite) + Book a call */
    coll_eyebrow:        "The collective",
    coll_title:          "Join the collective",
    coll_sub:            "Many brands negotiating as one. The more GMV joins, the more leverage the collective has to recover your margin.",
    coll_email_label:    "Email",
    coll_email_ph:       "you@brand.com",
    coll_gmv_label:      "Monthly GMV",
    coll_gmv_note:       "from your analysis",
    coll_submit:         "Join as founding member",
    coll_submitting:     "Joining…",
    coll_clickwrap_pre:  "By joining you accept the",
    coll_clickwrap_link: "Collective Terms",
    coll_terms_draft:    "Draft — pending legal review",
    coll_terms_title:    "Collective Terms (draft)",
    coll_terms_body:     "By joining the CAMBRA Collective you authorize CAMBRA to include your payment volume, aggregated and pseudonymized, in the collective negotiating power used to recover margin on behalf of its members. There is no upfront cost and no lock-in. CAMBRA only charges a fee on verified savings that actually materialize, under the results-based model. You can leave the collective at any time. This text is a DRAFT pending legal review and does not constitute a binding contract until its final reviewed version.",
    coll_terms_close:    "Got it",
    coll_success_title:  "You're in · founding member",
    coll_success_body:   "€{gmv} of GMV now in the collective. We'll email you with the next steps.",
    coll_success_body_nogmv: "Welcome to the collective. We'll email you with the next steps.",
    coll_error:          "Something went wrong. Please try again.",
    coll_done:           "Done",
    /* Report v2 — cross-links + context subcopy */
    coll_secondary_call: "Prefer to talk? Book a call",
    call_secondary_coll: "or join the collective",
    coll_ctx_margin:     "Let CAMBRA renegotiate your processor margin — join to start.",
    coll_ctx_rate:       "Let CAMBRA move you to a better rate — join to start.",

    /* Book a call */
    call_eyebrow:        "Let's talk",
    call_title:          "Book a call",
    call_sub:            "Your opportunity is large enough to deserve a conversation. Tell us and we'll reach out to schedule.",
    call_name_label:     "Name",
    call_name_ph:        "Your name",
    call_email_label:    "Email",
    call_email_ph:       "you@brand.com",
    call_msg_label:      "Message (optional)",
    call_msg_ph:         "Briefly tell us about your situation…",
    call_submit:         "Request a call",
    call_submitting:     "Sending…",
    call_success_title:  "Request sent",
    call_success_body:   "We'll email you to schedule the call.",
    call_error:          "Something went wrong. Please try again.",

    /* FIX 2 — Dashboard strings */

    /* FIX 4 — Toast keys */
    sync_success:         "Sync completed successfully",
    sync_error:           "Sync failed — please try again",
    connect_success:      "Connected successfully",
    connect_error:        "Connection failed — please try again",

    /* FIX 5 — Discovery empty state */

    /* FIX 7 — Results static benchmark note */

    /* Chunk 6 — verification confidence badges on Results */

    /* Chunk 5C — auto-materialize toasts after manual sync */

    /* Login gate */
    login_gate_headline:    "Your infrastructure audit is ready.",
    login_gate_sub:         "Create a free account or sign in to see your results.",
    login_gate_connect_headline: "Connect your tools securely.",
    login_gate_connect_sub:      "Create a free account or sign in to connect Stripe and your other tools with read-only access.",
    login_gate_cta:         "Continue",
    login_gate_footnote:    "Free to start. No credit card. Pay only when you save.",
    login_gate_terms:       "By continuing, you agree to our",
    login_gate_terms_link:  "Terms of Service",
    login_gate_and:         "and",
    login_gate_privacy_link:"Privacy Policy",

    /* Cookie consent */
    cookie_banner_text:     "We use cookies to improve your experience and analyse platform usage.",
    cookie_accept_all:      "Accept all",
    cookie_manage:          "Manage preferences",
    cookie_necessary:       "Necessary",
    cookie_necessary_desc:  "Required for the platform to work. Cannot be disabled.",
    cookie_analytics:       "Analytics",
    cookie_analytics_desc:  "Help us understand how you use CAMBRA to improve the product.",
    cookie_marketing:       "Marketing",
    cookie_marketing_desc:  "Personalised insights and communications.",
    cookie_save:            "Save preferences",
    cookie_modal_title:     "Cookie preferences",
    cookie_modal_sub:       "CAMBRA is committed to your privacy. Choose which cookies you allow.",
    cookie_always_on:       "Always on",

    /* 0.4 — HowItWorks page */
    hiw_hero_badge:   "How it works · 4 steps",
    hiw_hero_h1:      "From cost data to recovered margin.",
    hiw_hero_sub:     "A structured payments audit — built for independent operators. No upfront fees, no lock-in.",
    hiw_s1_eyebrow:   "analyze",
    hiw_s1_title:     "Analyze anonymously",
    hiw_s1_detail:    "Answer a few quick questions about your revenue, provider and volumes. No account, no connection, no card. Sixty seconds.",
    hiw_s1_cta:       "Start the audit",
    hiw_s2_eyebrow:   "diagnose",
    hiw_s2_title:     "See your real payment costs",
    hiw_s2_detail:    "We compare your effective fee against the achievable floor for your tier and geography, and split the delta by interchange, scheme fees and processor margin — the three layers that actually leak money.",
    hiw_s2_cta:       "Run the analyzer",
    hiw_s3_eyebrow:   "verify",
    hiw_s3_title:     "Connect your provider for exact numbers",
    hiw_s3_detail:    "Go from estimation to calculation. A read-only connection turns your declared inputs into transaction-level truth — same benchmark, verified figures.",
    hiw_s3_cta:       "Connect your provider",
    hiw_s4_eyebrow:   "recover",
    hiw_s4_title:     "Recover margin",
    hiw_s4_detail:    "When the gap is real and material, CAMBRA helps you close it — through renegotiation or migration — on a performance-based fee. If we don't recover anything, you pay nothing.",
    hiw_s4_cta:       "See recovery model",
    hiw_cta_button:   "Run your free audit",
    hiw_cta_note:     "Free forever for early operators · No credit card required",

    /* 0.4 — Testimonials page (chrome only; quotes stay untranslated placeholders) */
    tst_hero_badge:   "Testimonials · From real operators",
    tst_hero_h1:      "What brands say about CAMBRA.",
    tst_hero_sub:     "Real results from independent commerce brands across Europe.",
    tst_role_at:      "{role} at {company}",
    tst_illustrative_note: "Illustrative sample quotes — not real customers yet.",

    /* 0.4 — Pricing page */
    prc_split_eyebrow:   "Pricing model",
    prc_split_h2:        "You keep the margin. We take a share.",
    prc_you_keep:        "You keep",
    prc_cambra:          "CAMBRA",
    prc_duration_label:  "Duration",
    prc_duration_val:    "24 months",
    prc_duration_note:   "Then 100% yours, forever",
    prc_atbench_label:   "Already at benchmark",
    prc_atbench_val:     "You pay €0",
    prc_atbench_note:    "No gap, no fee — ever",
    prc_nosav_label:     "If no savings",
    prc_nosav_val:       "You pay €0",
    prc_nosav_note:      "Risk is entirely on us",
    prc_hero_badge:      "Pricing · Aligned with your margin",
    prc_hero_h1:         "First analyze. Then recover.",
    prc_hero_sub:        "Not two pricing tiers — two inevitable steps. Step 01 is the free audit. Step 02 is when we help you actually recover the margin we found.",
    prc_cta_primary:     "Run free audit — 3 min",
    prc_cta_secondary:   "See how it works",
    prc_trust_1:         "No credit card",
    prc_trust_2:         "Read-only, encrypted access",
    prc_trust_3:         "5-minute setup",
    prc_trust_4:         "Cancel anytime",
    prc_promise_eyebrow: "The founder's promise",
    prc_promise_text:    "If CAMBRA doesn't recover any margin for you, you owe us nothing. Not for the audit, not for the negotiation, not for the migration. Our incentives are 100% aligned with yours — we only get paid when your bank statements confirm the savings.",
    prc_faq_eyebrow:     "Frequently asked",
    prc_faq_h2:          "Clarity, not fine print.",
    prc_faq_q1: "Is the infrastructure intelligence really free?",
    prc_faq_a1: "Yes — no card, no commitment. Early founding brands get full access to the audit, benchmarks, scoring and dashboard at no cost.",
    prc_faq_q2: "How does the recovery model work?",
    prc_faq_a2: "When CAMBRA actively helps you recover margin, we participate in 25% of the verified savings for 24 months. You keep the majority. No upfront fee, no subscription, no minimum. If we don't recover anything, you pay nothing — the risk is entirely on us. After 24 months, 100% of the recovered margin stays with you.",
    prc_faq_q3: "What counts as 'verified savings'?",
    prc_faq_a3: "Recovered margin that is measurable, attributable to CAMBRA's negotiation or migration support, and reconciled against your real provider statements. Estimates from the audit are never charged — only what shows up on your actual bills once the change is live.",
    prc_faq_q4: "So what does it actually cost me?",
    prc_faq_a4: "The audit and estimate are free during early access. You only pay if you activate the recovery service AND we successfully lower a real cost that shows up on your provider statements. The fee is a share of what we save you — never more than what you actually gain.",
    prc_faq_q5: "Can I stop at any time?",
    prc_faq_a5: "Yes. No lock-in, no minimum duration. Pause or terminate from your account settings.",
    prc_faq_q6: "Is my data confidential?",
    prc_faq_a6: "Always. Read-only access, encrypted at rest and in transit, never sold, never shared. See our Privacy Policy.",
    prc_final_cta:       "Start with the free audit",
    prc_final_note:      "3 minutes · No card · You'll see your savings in euros",

    /* Phase 1 — data insights (report + dashboard). All derived from
       engine_result + input_snapshot, single source of truth. */
    ins_section_title:      "Your payments, decomposed",
    ins_section_sub:        "Every figure comes from your analysis — nothing estimated on top.",
    ins_total_fees_label:   "Total fees you pay",
    ins_total_fees_note:    "Gross cost of accepting cards — not your recoverable savings.",
    ins_gmv_label:          "Card volume (GMV)",
    ins_effective_label:    "Effective rate",
    ins_effective_note:     "{pct}% of your GMV goes to payment fees.",
    ins_currentrate_title:      "Your rate, decomposed",
    ins_currentrate_sub:        "You pay {rate}: {floor} is a regulated floor that never moves, and {movable} is your optimizable zone — that's where the recoverable money is.",
    ins_currentrate_floor:      "Regulated floor",
    ins_currentrate_floor_note: "Interchange + scheme fees (EU IFR + Visa/Mastercard) — non-negotiable.",
    ins_currentrate_movable:    "Your optimizable zone",
    ins_currentrate_movable_note: "Processor margin + fixed fee + cross-border — this is what CAMBRA works down.",
    ins_currentrate_recoverable: "Where CAMBRA recovers",
    ins_layer_per_year:     "/yr",
    ins_cardmix_title:      "Card mix & cost",
    ins_cardmix_debit:      "Debit",
    ins_cardmix_credit:     "Credit",
    ins_cardmix_domestic:   "Domestic",
    ins_cardmix_intl:       "International",
    ins_cardmix_ifr_note:   "Your debit should cost ~{ideal}%. Billed at a blended rate, you overpay roughly {overpay} a year on debit alone.",
    ins_pertx_title:        "Cost per transaction",
    ins_pertx_cost:         "Per transaction",
    ins_pertx_count:        "Transactions / month",
    ins_pertx_ticket:       "at a {ticket} average ticket",
    ins_crossborder_title:  "Cross-border cost",
    ins_crossborder_note:   "{pct}% of your GMV is international — the cross-border uplift adds this.",
    ins_crossborder_notmodeled: "You have international volume, but we don't have a verified cross-border rate for this provider. Connect your PSP for the exact figure.",
    ins_fixeddrag_title:    "Fixed-fee drag",
    ins_fixeddrag_note:     "At a {ticket} ticket, the {fee} fixed fee adds ~{drag}% to your effective rate.",
    ins_per_year_full:      "per year",
    ins_per_month_full:     "per month",

    /* Phase 2 — account aggregate (dashboard, shown when ≥2 analyses). All
       derived from persisted engine_result rows, sum-validated before render. */
    acct_title:             "Your account, aggregated",
    acct_sub:               "Across {n} analyses — money summed, blended rate weighted by volume.",
    acct_total_gmv:         "Total card volume",
    acct_total_fees:        "Total fees you pay",
    acct_blended_rate:      "Blended effective rate",
    acct_blended_note:      "GMV-weighted across all your analyses.",
    acct_total_savings:     "Recoverable, aggregated",
    acct_savings_note:      "Point estimate summed across analyses.",
    acct_confidence:        "Confidence",
    acct_conf_verified:     "Verified — backed by real provider data",
    acct_conf_provisional:  "Provisional — partial verified data",
    acct_conf_estimated:    "Estimated — connect a provider to verify",
    acct_analyses_count:    "{n} analyses",
    acct_channels_online:   "Online",
    acct_channels_in_store: "In-store",

    /* Phase 2 — analysis evolution (dashboard, shown when ≥2 analyses).
       Re-runs ARE the series — this is the correct home for them. */
    trend_eyebrow:          "Evolution",
    trend_title:            "How your numbers moved",
    trend_sub:              "Across {n} analyses over time.",
    trend_legend_rate:      "Effective rate",
    trend_legend_savings:   "Identified savings",
    trend_caption:          "Every re-run plotted in time — nothing averaged. Verified points are ringed.",

    /* Phase 3 — in-store (TPE/TPV) tiles. Shown only for in-store/combined. */
    instore_section_title:     "In-store terminal (TPE)",
    instore_section_sub:       "What your card terminal really costs — rental included, no double counting.",
    instore_rental_title:      "Terminal rental",
    instore_rental_note:       "{month}/mo of rental = +{impact} of your effective rate. This is part of the rate you already pay — not an extra on top.",
    instore_rental_per_month:  "/mo rental",
    instore_rental_effective:  "of your effective rate",
    instore_rental_part:       "Terminal rental",
    instore_rental_rest:       "Rest of your rate",
    instore_rental_coherence:  "Rental + rest = {total} — your full effective rate. The rental is inside it, never added on top.",
    instore_split_title:       "Online vs in-store",
    instore_split_note:        "Each channel's rate, cost and savings — the two add up to your combined total.",
    instore_split_savings:     "savings",
    instore_split_total:       "Combined savings",
    instore_subpayg_title:     "Subscription vs pay-as-you-go",
    instore_subpayg_disclaimer:"Market reference only — informative, not a switch recommendation.",
    instore_subpayg_crossover: "Break-even volume",
    instore_subpayg_yours:     "Your volume",
    instore_subpayg_verdict_sub: "At your volume, a subscription terminal pays off — about {delta}/mo cheaper than pay-as-you-go.",
    instore_subpayg_verdict_payg:"At your volume, pay-as-you-go pays off — about {delta}/mo cheaper than a subscription terminal.",
    instore_subpayg_cambra:    "CAMBRA gets you the best terminal deal for your volume — no need to shop around.",

    /* Download audit (PDF) */
    pdf_download_cta:        "Download audit (PDF)",
    pdf_generating:          "Generating…",
    pdf_doc_title:           "Payments audit",
    pdf_badge_verified:      "VERIFIED",
    pdf_badge_estimated:     "ESTIMATED",
    pdf_channel_combined:    "Online + In-store",
    pdf_sec_aggregate:       "Aggregate — whole business",
    pdf_sec_summary:         "Summary",
    pdf_sec_rate_decomposed: "Your rate, decomposed",
    pdf_sec_cost:            "Cost breakdown",
    pdf_sec_benchmark:       "Benchmark — where you stand",
    pdf_sec_roadmap:         "Recovery roadmap",
    pdf_sec_method:          "Method & confidence",
    pdf_score:               "Efficiency score",
    pdf_recoverable:         "Recoverable",
    pdf_range:               "Range",
    pdf_per_yr:              "/yr",
    pdf_current_rate:        "Current effective rate",
    pdf_achievable_rate:     "Achievable rate",
    pdf_regulated_floor:     "Regulated floor",
    pdf_optimizable_zone:    "Optimizable zone",
    pdf_total_fees:          "Total fees paid",
    pdf_gmv:                 "Card volume (GMV)",
    pdf_effective_pct:       "Effective rate",
    pdf_cost_per_tx:         "Cost per transaction",
    pdf_cross_border:        "International volume",
    pdf_card_mix:            "Card mix",
    pdf_your_rate:           "Your rate",
    pdf_peer_median:         "Peer median",
    pdf_top10:               "Top 10%",
    pdf_percentile:          "Your position",
    pdf_percentile_val:      "Among the ~{pct}% most expensive of your size",
    pdf_percentile_val_cheaper: "Cheaper than ~{pct}% of brands your size",
    pdf_toptier:             "You're at the achievable floor — top-tier payment costs.",
    pdf_engine_version:      "Engine version",
    pdf_footer_note:         "Estimate based on your inputs — connect your provider to verify. CAMBRA · Payments audit.",

    /* Action Center — "your next best step" (dashboard panel + compact report) */
    ac_eyebrow:              "Your next best step",
    ac_verify_title:         "Verify your savings",
    ac_verify_why:           "Turn your ~{amount}/yr estimate into a verified number — connect your provider, read-only.",
    ac_verify_cta:           "Connect your provider",
    ac_recover_title:        "Recover {amount}/yr",
    ac_recover_why_coll:     "Join the collective — many brands negotiating as one — to start recovering it.",
    ac_recover_cta_coll:     "Join the collective",
    ac_call_title:           "Recover {amount}/yr",
    ac_call_why:             "Your opportunity is large enough for a call — let's plan the recovery together.",
    ac_call_cta:             "Book a call",
    ac_incoll_title:         "Book your recovery call",
    ac_incoll_why:           "You're in the collective. Book a call so we can start recovering your {amount}/yr.",
    ac_incoll_cta:           "Book your call",
    ac_toptier_title:        "You're top-tier",
    ac_toptier_why:          "Your effective rate is at the achievable floor. We'll monitor it for free — if it ever drifts, we'll tell you.",
    ac_toptier_badge:        "Efficient",
    ac_addchannel_title:     "Add your other channel",
    ac_addchannel_why_instore: "You've analyzed online. Add your in-store terminal for the full picture.",
    ac_addchannel_why_online:  "You've analyzed in-store. Add your online payments for the full picture.",
    ac_addchannel_cta:       "Run the analysis",
    ac_chip_effort_low:      "Low effort",
    ac_chip_impact_verify:   "Unlocks exact figures",
    ac_chip_impact_recover:  "Recover margin",
    ac_chip_impact_protect:  "Keeps you top-tier",
    ac_chip_impact_complete: "Full-business view",
    ac_secondary_call:       "Prefer to talk? Book a call",
    ac_secondary_coll:       "or join the collective",

    /* Landing — TheStackSection */
    stack_eyebrow: "WHAT WE ANALYZE",
    stack_h2_pre:  "Your entire payments stack.",
    stack_h2_kw:   "One analysis.",
    stack_c1_t: "Online payments",
    stack_c1_d: "Stripe, Mollie, PayPal… what each sale really costs you.",
    stack_c2_t: "In-store terminals",
    stack_c2_d: "The quiet leak in your physical channel.",
    stack_c3_t: "Contracts",
    stack_c3_d: "What you signed vs. what brands your size actually pay.",
    stack_c4_t: "Benchmark (base layer)",
    stack_c4_d: "Real costs from real brands. Not the price list.",

    /* Landing — RealImpactSection */
    ri_eyebrow:   "REAL IMPACT",
    ri_h2_pre:    "That gap is",
    ri_h2_kw:     "+7% net profit.",
    ri_sub_pre:   "One real brand, €1M in annual sales: paying an effective 2.21% per transaction when 1.47% was achievable. A ",
    ri_sub_kw:    "0.74-point",
    ri_sub_post:  " gap — €7,400 a year, ≈€15,000 over 24 months. Recovered, that's about 7% more net profit. Same sales. Same team.",

    /* Landing — Founding150Section */
    f150_eyebrow: "FOUNDING 150",
    f150_h2_l1:   "150 brands.",
    f150_h2_l2:   "Free forever.",
    f150_h2_kw:   "One dataset.",
    f150_sub:     "We're selecting 150 independent brands (€200k–€2M in annual sales) to build Europe's first database of what payments really cost. In exchange: full analysis and ongoing monitoring, free, forever.",
    f150_cta:     "Claim my spot",
  },

  fr: {

    nav_dashboard:    "Tableau de bord",
    nav_analyzer:     "Analyseur",
    nav_connect:      "Connecter",
    nav_reports:      "Rapports",
    nav_settings:     "Paramètres",
    nav_how:          "Comment ça marche",
    nav_pricing:      "Tarifs",
    nav_get_started:  "Commencer",

    /* sidebar (app shell) */
    sidebar_results:      "Résultats",
    sidebar_documents:    "Documents",
    sidebar_account:      "Compte",
    sidebar_workspace:    "Espace de travail",
    sidebar_network_live: "Réseau en direct",
    sidebar_admin:        "Panneau d'administration",
    sidebar_homepage:     "Retour à l'accueil",
    sidebar_signout:      "Se déconnecter",

    /* landing — hero */
    hero_badge:           "Vous ne payez que si nous vous faisons économiser",
    hero_h1_line1:        "Arrêtez de trop payer.",
    hero_h1_line2:        "Récupérez votre marge.",
    hero_sub:             "La plupart des marques indépendantes paient jusqu'à 40 % de trop sur les paiements par carte — un surcoût dissimulé dans des taux mélangés. CAMBRA mesure votre taux effectif par rapport au plancher d'interchange et récupère ce qui est négociable. Vous gardez 75 %. Nous ne sommes rémunérés que lorsque vous économisez.",
    hero_cta_primary:     "Récupérez votre marge — 3 min",
    hero_cta_secondary:   "Découvrez les économies de vraies marques",
    hero_trust_1:         "Sans honoraires · sans engagement",
    hero_trust_2:         "Identifiants chiffrés, jamais en clair",
    hero_trust_3:         "Réservé aux marques de l'UE",

    /* landing — how it works (steps) */
    how_h2:               "Quatre étapes, de l'estimation à la marge récupérée.",
    how_h2_pre:           "Quatre étapes, de l'estimation à la",
    how_h2_hl:            "marge récupérée",
    how_step1_title:      "Dites-nous ce que vous encaissez",
    how_step1_desc:       "Votre volume annuel, votre panier moyen et votre prestataire de paiement actuel. Soixante secondes. Rien à connecter.",
    how_step2_title:      "Découvrez votre taux effectif",
    how_step2_desc:       "Nous comparons ce que vous payez réellement au plancher d'interchange — le minimum réel pour une structure de votre taille.",
    how_step3_title:      "Connectez votre prestataire pour confirmer",
    how_step3_desc:       "En lecture seule. Votre estimation devient un chiffre confirmé, à partir de vos transactions réelles.",
    how_step4_title:      "Rejoignez-nous pour la récupérer",
    how_step4_desc:       "Récupérez vos économies et rejoignez les marques qui négocient d'une seule voix. Ensemble, nous obtenons des taux qu'aucune d'entre nous n'atteindrait seule.",



    how_label:            "Comment ça marche",



    footer_tagline:       "Infrastructure efficace pour le commerce indépendant.",
    footer_privacy:       "Politique de confidentialité",
    footer_terms:         "Conditions d'utilisation",
    footer_contact:       "Contact",
    footer_for_providers: "Pour les prestataires",


    detected_source_stripe:  "Stripe",

    az_step3_verified:    "Paiements mis à jour en vérifié ✓",


    hero_confidence_estimated:    "Estimé — connectez Stripe pour vérifier",
    hero_confidence_verified:     "Vérifié — basé sur vos vraies données Stripe",
    hero_confidence_provisional:  "Provisoire — vérifié sur données Stripe partielles. Connectez plus d'historique.",
    payments_title:               "Paiements",
    payments_verified:            "Vérifié avec Stripe ✓",
    payments_provisional:         "Provisoire · données Stripe partielles",
    connect_more:                 "Connecter plus d'outils pour améliorer la précision",

    state_a_title:        "Cartographiez votre infrastructure en 3 minutes",
    state_a_sub:          "Entrez votre site web. CAMBRA détecte automatiquement vos prestataires de paiement, transporteurs et outils SaaS — puis compare vos coûts avec des données anonymisées de marques européennes à votre niveau de CA.",
    state_a_cta:          "Lancer l'analyse gratuite →",
    state_b_badge:        "Estimé",
    state_c_badge:        "Vérifié ✓",
    state_c_badge_provisional: "Provisoire",
    savings_to_date:      "Économies à ce jour",
    this_month:           "Ce mois",
    identified_potential: "Potentiel identifié",
    next_report:          "Prochain rapport : {date}",
    your_infrastructure:  "Votre infrastructure",
    ai_insights:          "Insights IA",
    review_approve:       "Examiner et approuver →",
    rescan:               "Rescanner maintenant",
    scanning:             "Scan en cours…",

    ct_page_title:        "Connectez votre infrastructure",
    ct_page_sub:          "Chaque connexion améliore la précision de votre benchmark et la confiance dans vos économies.",
    ct_group_psp:         "PSP · Paiements en ligne",
    ct_group_tpv:         "TPE · Terminal en boutique",
    ct_group_commerce:    "Commerce",
    ct_group_commerce_sub:"Pour détecter votre volume — pas un prestataire de paiement",
    summary_detected:     "{n} outils détectés",
    summary_connected:    "{n} connecté(s)",
    summary_available:    "{n} disponible(s)",
    found_in_stripe:      "Trouvé dans Stripe — {amount} €/mois",
    connect_to_verify:    "Connecter pour vérifier →",
    coming_soon:          "Bientôt disponible",
    last_sync:            "Dernière sync : {time}",
    sync_now:             "Synchroniser",

    badge_verified:       "Vérifié",
    badge_estimated:      "Estimé",
    badge_mixed:          "Mixte",
    badge_connected:      "Connecté",
    badge_detected:       "Détecté",
    badge_available:      "Disponible",
    badge_coming_soon:    "Bientôt",
    badge_high:           "Haute confiance",
    badge_medium:         "Confiance moyenne",
    badge_low:            "Faible confiance",

    cat_other:            "Autre",



    per_mo_short:         "mois",
    per_yr_short:         "an",

    auto_detection:       "Détection automatique",
    bench_comparison:     "Comparaison benchmark",
    savings_calc:         "Calcul des économies",
    dashboard_word:       "Tableau de bord",
    measured_cumulative:  "Économies cumulées mesurées — réelles, non projetées.",
    from_latest_analysis: "Depuis votre dernière analyse",
    last_12_months:       "12 derniers mois",
    tracking_starts_next: "Le suivi commence le mois prochain",
    tracking_will_appear: "Le suivi des économies apparaîtra dès la génération de votre premier rapport mensuel.",
    partially_verified:   "Partiellement vérifié",
    estimated_label:      "Estimé",
    verified_label:       "Vérifié",

    ai_latest_runs:       "Dernières exécutions d'agents",
    ai_loading:           "Chargement des exécutions…",
    ai_empty:             "L'analyse IA apparaîtra après votre première analyse.",
    ai_open_analyzer:     "Ouvrir l'analyseur",
    ai_confidence:        "Confiance {pct}%",
    ai_pending_review:    "En attente de revue admin.",
    agent_payments:       "Agent Paiements",
    agent_recommendation: "Agent Recommandations",
    agent_general:        "Agent Général",
    status_running:       "En cours",
    status_awaiting:      "En attente d'approbation",
    status_approved:      "Approuvé",
    status_rejected:      "Rejeté",
    status_completed:     "Terminé",
    status_failed:        "Échec",

    continuous_discovery: "Découverte continue",
    last_scan_ago:        "Dernier scan {time}",
    changes_detected_n:   "{n} changement{plural} détecté{plural}",
    never_label:          "jamais",
    last_scan_never:      "Jamais scanné",
    just_now:             "à l'instant",
    minutes_ago:          "il y a {n} min",
    hours_ago:            "il y a {n} h",
    days_ago:             "il y a {n} j",

    /* FIX 1 — ConnectTools category labels (R2: reduced to payments+commerce) */
    cat_payments:         "Paiements",
    cat_commerce:         "Commerce",

    /* M4-TPV Fase 2B — in-store landing upsell strip */
    landing_upsell_in_store_eyebrow: "Aussi en boutique",
    landing_upsell_in_store_title:   "Les terminaux physiques comptent aussi.",
    landing_upsell_in_store_desc:    "Nous auditons votre TPE — SumUp, Stripe Terminal, Smile & Pay, Zettle, ou votre banque acquéreur traditionnelle. Même audit de 60 secondes, même 25% de success fee, en boutique comme en ligne.",
    landing_upsell_in_store_cta:     "Auditer mon TPE",

    /* M4-TPV Fase 3 — Analyzer channel tabs + CombinedGapHero strings. */
    analyzer_channel_online:      "En ligne",
    analyzer_channel_in_store:    "En boutique",
    analyzer_channel_combined:    "Les deux",
    /* payments results — already_optimized state + combined mini-victory (M4-refinado v1.5.0) */
    opt_hero_eyebrow: "Audit paiements",
    opt_hero_title: "Vous êtes déjà au plancher",
    opt_hero_body: "Votre taux effectif actuel est au niveau — ou en dessous — du meilleur tarif contractable publiquement pour un marchand de votre taille et région. Aucun écart significatif à récupérer sur ce canal.",
    opt_hero_cta_secondary: "Relancer avec d'autres valeurs",
    opt_footnote: "En dessous de MAX(200 € / an, 15 pb du GMV annuel) — le seuil de bruit de notre estimation.",
    opt_channel_pill: "✓ Déjà au meilleur tarif contractable",
    combined_mixed_total_note: "Le total additionne les canaux avec un écart récupérable. Les canaux optimisés comptent pour 0 €.",
    insufficient_hero_title: "Nous n'avons pas de réponse défendable",
    insufficient_hero_body: "Vos données atterrissent sur une moyenne régionale plutôt qu'un tarif fournisseur vérifié, ou le pool multi-ancres de votre canal est vide. Plutôt qu'un chiffre que nous ne pouvons étayer, connectez votre PSP pour un résultat exact.",
    insufficient_hero_cta: "Connecter votre PSP",
    combined_hero_eyebrow:        "Écart de paiements · combiné",
    combined_hero_badge:          "En ligne + Boutique",
    combined_hero_lead:           "Votre surcoût total sur les deux canaux est d'environ",
    combined_hero_month_suffix:   "par mois, cumulés sur les deux canaux.",

    /* Step 3 — Score CTA + RecoveryRoadmap (payments-only) */
    score_cta_recover:    "Voir comment nous la récupérons",
    score_cta_unlock:     "Débloquez votre plan",
    score_cta_toptier:    "Vous êtes au top · surveillez la dérive",
    roadmap_recoverable:  "RÉCUPÉRABLE",
    roadmap_up_to:        "jusqu'à",
    roadmap_per_year:     "/ an",
    roadmap_range:        "fourchette",
    roadmap_ambition:     "Les marques de votre palier atteignent ~{x}% — là où pousse le collectif",
    roadmap_routes:       "Les voies pour y parvenir",
    route_margin_title:   "Nous renégocions votre marge",
    route_rate_title:     "Nous vous amenons à un meilleur taux",
    route_verify_title:   "Connectez pour vérifier, et nous démarrons",
    route_cta_migration:  "Lancez votre migration gérée",
    route_cta_collective: "Réservez votre place dans le collectif",
    route_cta_verify:     "Connectez pour vérifier",
    route_cta_call:       "Réservez un appel",
    route_caveat_estimated: "Objectif estimé à partir des fourchettes du marché, sous réserve de vérification.",
    meta_effort_low:      "effort faible",
    meta_effort_med:      "effort moyen",
    meta_effort_high:     "effort élevé",
    meta_conf_high:       "confiance élevée",
    meta_conf_med:        "confiance moyenne",
    meta_conf_low:        "confiance estimée",
    meta_prio_high:       "priorité élevée",
    meta_prio_med:        "priorité moyenne",
    roadmap_toptier_title: "Vous êtes au top",
    roadmap_toptier_body:  "Votre configuration de paiement est déjà au plancher du marché. Nous surveillons gratuitement votre dérive pour qu'elle le reste — si elle bouge un jour, nous vous préviendrons.",
    roadmap_locked_more_one:   "+{n} voie de plus dans votre plan",
    roadmap_locked_more_other: "+{n} voies de plus dans votre plan",
    roadmap_locked_sub:    "Créez votre compte pour débloquer votre plan de récupération complet.",

    /* Report v2 — Pieza C: peer benchmark distribution */
    bench_title:          "Votre position face aux marques comme vous",
    bench_regional:       "Benchmark régional · {country}",
    bench_regional_nocountry: "Benchmark régional",
    bench_top10:          "Top 10%",
    bench_median:         "Médiane des pairs",
    bench_you:            "VOUS",
    bench_axis_cheaper:   "moins cher",
    bench_axis_pricier:   "plus cher",
    bench_callout:        "Vous êtes dans les ~{pct}% les plus chers des marques {country} de votre taille.",
    bench_callout_nocountry: "Vous êtes dans les ~{pct}% les plus chers des marques de votre taille.",
    bench_callout_cheaper:   "Vous êtes moins cher que ~{pct}% des marques {country} de votre taille.",
    bench_callout_cheaper_nocountry: "Vous êtes moins cher que ~{pct}% des marques de votre taille.",

    /* Report v2 — Collectif (clickwrap-lite) + Réserver un appel */
    coll_eyebrow:        "Le collectif",
    coll_title:          "Rejoignez le collectif",
    coll_sub:            "Plusieurs marques qui négocient ensemble. Plus le GMV s'additionne, plus le collectif a de poids pour récupérer votre marge.",
    coll_email_label:    "Email",
    coll_email_ph:       "vous@marque.com",
    coll_gmv_label:      "GMV mensuel",
    coll_gmv_note:       "de votre analyse",
    coll_submit:         "Rejoindre comme membre fondateur",
    coll_submitting:     "Adhésion…",
    coll_clickwrap_pre:  "En rejoignant, vous acceptez les",
    coll_clickwrap_link: "Conditions du Collectif",
    coll_terms_draft:    "Brouillon — en attente de revue juridique",
    coll_terms_title:    "Conditions du Collectif (brouillon)",
    coll_terms_body:     "En rejoignant le Collectif CAMBRA, vous autorisez CAMBRA à inclure votre volume de paiements, de façon agrégée et pseudonymisée, dans le pouvoir de négociation collectif utilisé pour récupérer de la marge au nom de ses membres. Aucun frais initial ni engagement. CAMBRA ne facture qu'une commission sur les économies vérifiées effectivement réalisées, selon le modèle à la performance. Vous pouvez quitter le collectif à tout moment. Ce texte est un BROUILLON en attente de revue juridique et ne constitue pas un contrat contraignant tant que sa version finale révisée n'est pas publiée.",
    coll_terms_close:    "Compris",
    coll_success_title:  "Vous y êtes · membre fondateur",
    coll_success_body:   "€{gmv} de GMV désormais dans le collectif. Nous vous écrirons pour les prochaines étapes.",
    coll_success_body_nogmv: "Bienvenue dans le collectif. Nous vous écrirons pour les prochaines étapes.",
    coll_error:          "Une erreur est survenue. Veuillez réessayer.",
    coll_done:           "Terminé",
    /* Report v2 — cross-links + context subcopy */
    coll_secondary_call: "Vous préférez en parler ? Réservez un appel",
    call_secondary_coll: "ou rejoignez le collectif",
    coll_ctx_margin:     "Laissez CAMBRA renégocier votre marge de processeur — rejoignez pour démarrer.",
    coll_ctx_rate:       "Laissez CAMBRA vous amener à un meilleur taux — rejoignez pour démarrer.",

    /* Book a call */
    call_eyebrow:        "Parlons-en",
    call_title:          "Réservez un appel",
    call_sub:            "Votre opportunité est assez grande pour mériter une conversation. Dites-nous-en plus et nous vous contacterons pour planifier.",
    call_name_label:     "Nom",
    call_name_ph:        "Votre nom",
    call_email_label:    "Email",
    call_email_ph:       "vous@marque.com",
    call_msg_label:      "Message (facultatif)",
    call_msg_ph:         "Décrivez brièvement votre situation…",
    call_submit:         "Demander un appel",
    call_submitting:     "Envoi…",
    call_success_title:  "Demande envoyée",
    call_success_body:   "Nous vous contacterons par email pour planifier l'appel.",
    call_error:          "Une erreur est survenue. Veuillez réessayer.",

    /* FIX 2 — Dashboard strings */

    /* FIX 4 — Toast keys */
    sync_success:         "Synchronisation réussie",
    sync_error:           "Synchronisation échouée — veuillez réessayer",
    connect_success:      "Connexion réussie",
    connect_error:        "Connexion échouée — veuillez réessayer",

    /* FIX 5 — Discovery empty state */

    /* FIX 7 — Results static benchmark note */

    /* Chunk 6 — verification confidence badges on Results */

    /* Chunk 5C — auto-materialize toasts after manual sync */

    /* Login gate */
    login_gate_headline:    "Votre audit d'infrastructure est prêt.",
    login_gate_sub:         "Créez un compte gratuit ou connectez-vous pour voir vos résultats.",
    login_gate_connect_headline: "Connectez vos outils en toute sécurité.",
    login_gate_connect_sub:      "Créez un compte gratuit ou connectez-vous pour relier Stripe et vos autres outils en lecture seule.",
    login_gate_cta:         "Continuer",
    login_gate_footnote:    "Gratuit pour commencer. Sans carte bancaire. Payez uniquement sur les économies.",
    login_gate_terms:       "En continuant, vous acceptez nos",
    login_gate_terms_link:  "Conditions d'utilisation",
    login_gate_and:         "et",
    login_gate_privacy_link:"Politique de confidentialité",

    /* Cookie consent */
    cookie_banner_text:     "Nous utilisons des cookies pour améliorer votre expérience et analyser l'utilisation de la plateforme.",
    cookie_accept_all:      "Tout accepter",
    cookie_manage:          "Gérer les préférences",
    cookie_necessary:       "Nécessaires",
    cookie_necessary_desc:  "Requis pour le fonctionnement de la plateforme. Ne peut pas être désactivé.",
    cookie_analytics:       "Analytique",
    cookie_analytics_desc:  "Nous aide à comprendre comment vous utilisez CAMBRA pour améliorer le produit.",
    cookie_marketing:       "Marketing",
    cookie_marketing_desc:  "Insights personnalisés et communications.",
    cookie_save:            "Enregistrer les préférences",
    cookie_modal_title:     "Préférences cookies",
    cookie_modal_sub:       "CAMBRA s'engage à respecter votre vie privée. Choisissez les cookies que vous autorisez.",
    cookie_always_on:       "Toujours activé",

    /* 0.4 — HowItWorks page */
    hiw_hero_badge:   "Comment ça marche · 4 étapes",
    hiw_hero_h1:      "Des données de coûts à la marge récupérée.",
    hiw_hero_sub:     "Un audit des paiements structuré — conçu pour les opérateurs indépendants. Sans frais initiaux, sans engagement.",
    hiw_s1_eyebrow:   "analyser",
    hiw_s1_title:     "Analysez anonymement",
    hiw_s1_detail:    "Répondez à quelques questions rapides sur votre chiffre d'affaires, votre prestataire et vos volumes. Sans compte, sans connexion, sans carte. Soixante secondes.",
    hiw_s1_cta:       "Lancer l'audit",
    hiw_s2_eyebrow:   "diagnostiquer",
    hiw_s2_title:     "Découvrez vos vrais coûts de paiement",
    hiw_s2_detail:    "Nous comparons votre taux effectif au plancher atteignable pour votre catégorie et votre zone, puis décomposons l'écart entre interchange, frais de réseau et marge du processeur — les trois couches où l'argent fuit vraiment.",
    hiw_s2_cta:       "Lancer l'analyseur",
    hiw_s3_eyebrow:   "vérifier",
    hiw_s3_title:     "Connectez votre prestataire pour des chiffres exacts",
    hiw_s3_detail:    "Passez de l'estimation au calcul. Une connexion en lecture seule transforme vos données déclarées en vérité au niveau des transactions — même référentiel, chiffres vérifiés.",
    hiw_s3_cta:       "Connecter votre prestataire",
    hiw_s4_eyebrow:   "récupérer",
    hiw_s4_title:     "Récupérez votre marge",
    hiw_s4_detail:    "Quand l'écart est réel et significatif, CAMBRA vous aide à le combler — par renégociation ou migration — avec une rémunération à la performance. Si nous ne récupérons rien, vous ne payez rien.",
    hiw_s4_cta:       "Voir le modèle de récupération",
    hiw_cta_button:   "Lancez votre audit gratuit",
    hiw_cta_note:     "Gratuit à vie pour les premiers opérateurs · Sans carte bancaire",

    /* 0.4 — Testimonials page (chrome only) */
    tst_hero_badge:   "Témoignages · D'opérateurs réels",
    tst_hero_h1:      "Ce que les marques disent de CAMBRA.",
    tst_hero_sub:     "Des résultats concrets de marques de commerce indépendantes partout en Europe.",
    tst_role_at:      "{role} chez {company}",
    tst_illustrative_note: "Exemples illustratifs — pas encore de vrais clients.",

    /* 0.4 — Pricing page */
    prc_split_eyebrow:   "Modèle tarifaire",
    prc_split_h2:        "Vous gardez la marge. Nous en prenons une part.",
    prc_you_keep:        "Vous gardez",
    prc_cambra:          "CAMBRA",
    prc_duration_label:  "Durée",
    prc_duration_val:    "24 mois",
    prc_duration_note:   "Ensuite 100 % à vous, pour toujours",
    prc_atbench_label:   "Déjà au niveau du référentiel",
    prc_atbench_val:     "Vous payez 0 €",
    prc_atbench_note:    "Pas d'écart, pas de frais — jamais",
    prc_nosav_label:     "Si aucune économie",
    prc_nosav_val:       "Vous payez 0 €",
    prc_nosav_note:      "Le risque est entièrement pour nous",
    prc_hero_badge:      "Tarifs · Alignés sur votre marge",
    prc_hero_h1:         "D'abord analyser. Ensuite récupérer.",
    prc_hero_sub:        "Pas deux formules — deux étapes inévitables. L'étape 01, c'est l'audit gratuit. L'étape 02, c'est quand nous vous aidons à récupérer concrètement la marge trouvée.",
    prc_cta_primary:     "Lancer l'audit gratuit — 3 min",
    prc_cta_secondary:   "Voir comment ça marche",
    prc_trust_1:         "Sans carte bancaire",
    prc_trust_2:         "Accès en lecture seule, chiffré",
    prc_trust_3:         "Configuration en 5 minutes",
    prc_trust_4:         "Annulable à tout moment",
    prc_promise_eyebrow: "La promesse du fondateur",
    prc_promise_text:    "Si CAMBRA ne récupère aucune marge pour vous, vous ne nous devez rien. Ni pour l'audit, ni pour la négociation, ni pour la migration. Nos intérêts sont alignés à 100 % avec les vôtres — nous ne sommes payés que lorsque vos relevés bancaires confirment les économies.",
    prc_faq_eyebrow:     "Questions fréquentes",
    prc_faq_h2:          "De la clarté, pas des petites lignes.",
    prc_faq_q1: "L'intelligence d'infrastructure est-elle vraiment gratuite ?",
    prc_faq_a1: "Oui — sans carte, sans engagement. Les premières marques fondatrices ont un accès complet à l'audit, aux référentiels, au scoring et au tableau de bord, sans aucun frais.",
    prc_faq_q2: "Comment fonctionne le modèle de récupération ?",
    prc_faq_a2: "Lorsque CAMBRA vous aide activement à récupérer de la marge, nous prenons 25 % des économies vérifiées pendant 24 mois. Vous gardez la majeure partie. Sans frais initiaux, sans abonnement, sans minimum. Si nous ne récupérons rien, vous ne payez rien — le risque est entièrement pour nous. Après 24 mois, 100 % de la marge récupérée vous revient.",
    prc_faq_q3: "Qu'entend-on par « économies vérifiées » ?",
    prc_faq_a3: "La marge récupérée qui est mesurable, attribuable à la renégociation ou à la migration menées par CAMBRA, et rapprochée de vos relevés de prestataire réels. Les estimations de l'audit ne sont jamais facturées — uniquement ce qui apparaît sur vos factures réelles une fois le changement en place.",
    prc_faq_q4: "Alors, combien ça me coûte concrètement ?",
    prc_faq_a4: "L'audit et l'estimation sont gratuits pendant l'accès anticipé. Vous ne payez que si vous activez le service de récupération ET que nous réduisons réellement un coût qui apparaît sur vos relevés de prestataire. Notre rémunération est une part de ce que nous vous faisons économiser — jamais plus que ce que vous gagnez réellement.",
    prc_faq_q5: "Puis-je arrêter à tout moment ?",
    prc_faq_a5: "Oui. Sans engagement, sans durée minimale. Suspendez ou résiliez depuis les paramètres de votre compte.",
    prc_faq_q6: "Mes données sont-elles confidentielles ?",
    prc_faq_a6: "Toujours. Accès en lecture seule, chiffré au repos et en transit, jamais vendu, jamais partagé. Consultez notre politique de confidentialité.",
    prc_final_cta:       "Commencez par l'audit gratuit",
    prc_final_note:      "3 minutes · Sans carte · Vos économies affichées en euros",

    /* Phase 1 — data insights */
    ins_section_title:      "Vos paiements, décomposés",
    ins_section_sub:        "Chaque chiffre vient de votre analyse — rien d'estimé par-dessus.",
    ins_total_fees_label:   "Total des frais payés",
    ins_total_fees_note:    "Coût brut de l'acceptation des cartes — pas vos économies récupérables.",
    ins_gmv_label:          "Volume carte (GMV)",
    ins_effective_label:    "Taux effectif",
    ins_effective_note:     "{pct}% de votre GMV part en frais de paiement.",
    ins_currentrate_title:      "Votre taux, décomposé",
    ins_currentrate_sub:        "Vous payez {rate} : {floor} est un plancher réglementé qui ne bouge pas, et {movable} est votre zone optimisable — c'est là qu'est l'argent récupérable.",
    ins_currentrate_floor:      "Plancher réglementé",
    ins_currentrate_floor_note: "Interchange + frais de réseau (IFR UE + Visa/Mastercard) — non négociable.",
    ins_currentrate_movable:    "Votre zone optimisable",
    ins_currentrate_movable_note: "Marge du processeur + frais fixe + transfrontalier — c'est ce que CAMBRA fait baisser.",
    ins_currentrate_recoverable: "Où CAMBRA récupère",
    ins_layer_per_year:     "/an",
    ins_cardmix_title:      "Mix cartes & coût",
    ins_cardmix_debit:      "Débit",
    ins_cardmix_credit:     "Crédit",
    ins_cardmix_domestic:   "Domestique",
    ins_cardmix_intl:       "International",
    ins_cardmix_ifr_note:   "Votre débit devrait coûter ~{ideal}%. Facturé à un taux mélangé, vous surpayez environ {overpay} par an rien qu'en débit.",
    ins_pertx_title:        "Coût par transaction",
    ins_pertx_cost:         "Par transaction",
    ins_pertx_count:        "Transactions / mois",
    ins_pertx_ticket:       "pour un panier moyen de {ticket}",
    ins_crossborder_title:  "Coût transfrontalier",
    ins_crossborder_note:   "{pct}% de votre GMV est international — le surcoût transfrontalier ajoute ceci.",
    ins_crossborder_notmodeled: "Vous avez du volume international, mais nous n'avons pas de taux transfrontalier vérifié pour ce prestataire. Connectez votre PSP pour le chiffre exact.",
    ins_fixeddrag_title:    "Poids du frais fixe",
    ins_fixeddrag_note:     "À un panier de {ticket}, le frais fixe de {fee} ajoute ~{drag}% à votre taux effectif.",
    ins_per_year_full:      "par an",
    ins_per_month_full:     "par mois",

    /* Phase 2 — account aggregate */
    acct_title:             "Votre compte, agrégé",
    acct_sub:               "Sur {n} analyses — montants additionnés, taux mélangé pondéré par le volume.",
    acct_total_gmv:         "Volume carte total",
    acct_total_fees:        "Total des frais payés",
    acct_blended_rate:      "Taux effectif mélangé",
    acct_blended_note:      "Pondéré par le GMV sur toutes vos analyses.",
    acct_total_savings:     "Récupérable, agrégé",
    acct_savings_note:      "Estimation ponctuelle additionnée sur les analyses.",
    acct_confidence:        "Confiance",
    acct_conf_verified:     "Vérifié — appuyé sur des données prestataire réelles",
    acct_conf_provisional:  "Provisoire — données vérifiées partielles",
    acct_conf_estimated:    "Estimé — connectez un prestataire pour vérifier",
    acct_analyses_count:    "{n} analyses",
    acct_channels_online:   "En ligne",
    acct_channels_in_store: "En boutique",

    /* Phase 2 — analysis evolution */
    trend_eyebrow:          "Évolution",
    trend_title:            "Comment vos chiffres ont bougé",
    trend_sub:              "Sur {n} analyses dans le temps.",
    trend_legend_rate:      "Taux effectif",
    trend_legend_savings:   "Économies identifiées",
    trend_caption:          "Chaque relance tracée dans le temps — rien de moyenné. Les points vérifiés sont cerclés.",

    /* Phase 3 — in-store (TPE/TPV) */
    instore_section_title:     "Terminal en boutique (TPE)",
    instore_section_sub:       "Ce que votre terminal coûte vraiment — location incluse, sans double comptage.",
    instore_rental_title:      "Location du terminal",
    instore_rental_note:       "{month}/mois de location = +{impact} de votre taux effectif. Cela fait partie du taux que vous payez déjà — pas un surcoût.",
    instore_rental_per_month:  "/mois location",
    instore_rental_effective:  "de votre taux effectif",
    instore_rental_part:       "Location du terminal",
    instore_rental_rest:       "Reste de votre taux",
    instore_rental_coherence:  "Location + reste = {total} — votre taux effectif complet. La location est incluse, jamais ajoutée par-dessus.",
    instore_split_title:       "En ligne vs en boutique",
    instore_split_note:        "Taux, coût et économies par canal — les deux totalisent votre combiné.",
    instore_split_savings:     "économies",
    instore_split_total:       "Économies combinées",
    instore_subpayg_title:     "Abonnement vs paiement à l'usage",
    instore_subpayg_disclaimer:"Référence marché uniquement — informatif, pas une recommandation de changement.",
    instore_subpayg_crossover: "Volume d'équilibre",
    instore_subpayg_yours:     "Votre volume",
    instore_subpayg_verdict_sub: "À votre volume, un terminal en abonnement est rentable — environ {delta}/mois de moins qu'au paiement à l'usage.",
    instore_subpayg_verdict_payg:"À votre volume, le paiement à l'usage est rentable — environ {delta}/mois de moins qu'un abonnement.",
    instore_subpayg_cambra:    "CAMBRA vous obtient le meilleur deal terminal pour votre volume — pas besoin de comparer.",

    /* Download audit (PDF) */
    pdf_download_cta:        "Télécharger l'audit (PDF)",
    pdf_generating:          "Génération…",
    pdf_doc_title:           "Audit des paiements",
    pdf_badge_verified:      "VÉRIFIÉ",
    pdf_badge_estimated:     "ESTIMÉ",
    pdf_channel_combined:    "En ligne + En boutique",
    pdf_sec_aggregate:       "Agrégé — toute l'activité",
    pdf_sec_summary:         "Résumé",
    pdf_sec_rate_decomposed: "Votre taux, décomposé",
    pdf_sec_cost:            "Détail des coûts",
    pdf_sec_benchmark:       "Référentiel — votre position",
    pdf_sec_roadmap:         "Plan de récupération",
    pdf_sec_method:          "Méthode & confiance",
    pdf_score:               "Score d'efficacité",
    pdf_recoverable:         "Récupérable",
    pdf_range:               "Fourchette",
    pdf_per_yr:              "/an",
    pdf_current_rate:        "Taux effectif actuel",
    pdf_achievable_rate:     "Taux atteignable",
    pdf_regulated_floor:     "Plancher réglementé",
    pdf_optimizable_zone:    "Zone optimisable",
    pdf_total_fees:          "Total des frais payés",
    pdf_gmv:                 "Volume carte (GMV)",
    pdf_effective_pct:       "Taux effectif",
    pdf_cost_per_tx:         "Coût par transaction",
    pdf_cross_border:        "Volume international",
    pdf_card_mix:            "Mix cartes",
    pdf_your_rate:           "Votre taux",
    pdf_peer_median:         "Médiane des pairs",
    pdf_top10:               "Top 10%",
    pdf_percentile:          "Votre position",
    pdf_percentile_val:      "Parmi les ~{pct}% les plus chers de votre taille",
    pdf_percentile_val_cheaper: "Moins cher que ~{pct}% des marques de votre taille",
    pdf_toptier:             "Vous êtes au plancher atteignable — coûts de paiement au top.",
    pdf_engine_version:      "Version du moteur",
    pdf_footer_note:         "Estimation basée sur vos données — connectez votre prestataire pour vérifier. CAMBRA · Audit des paiements.",

    /* Action Center — "votre prochaine meilleure étape" */
    ac_eyebrow:              "Votre prochaine meilleure étape",
    ac_verify_title:         "Vérifiez vos économies",
    ac_verify_why:           "Transformez votre estimation de ~{amount}/an en chiffre vérifié — connectez votre prestataire, en lecture seule.",
    ac_verify_cta:           "Connecter votre prestataire",
    ac_recover_title:        "Récupérez {amount}/an",
    ac_recover_why_coll:     "Rejoignez le collectif — plusieurs marques qui négocient d'une seule voix — pour commencer à la récupérer.",
    ac_recover_cta_coll:     "Rejoindre le collectif",
    ac_call_title:           "Récupérez {amount}/an",
    ac_call_why:             "Votre opportunité mérite un appel — planifions la récupération ensemble.",
    ac_call_cta:             "Réserver un appel",
    ac_incoll_title:         "Réservez votre appel de récupération",
    ac_incoll_why:           "Vous êtes dans le collectif. Réservez un appel pour commencer à récupérer vos {amount}/an.",
    ac_incoll_cta:           "Réserver votre appel",
    ac_toptier_title:        "Vous êtes au top",
    ac_toptier_why:          "Votre taux effectif est au plancher atteignable. Nous le surveillons gratuitement — s'il dérive un jour, nous vous préviendrons.",
    ac_toptier_badge:        "Efficace",
    ac_addchannel_title:     "Ajoutez votre autre canal",
    ac_addchannel_why_instore: "Vous avez analysé l'en ligne. Ajoutez votre terminal en boutique pour la vue complète.",
    ac_addchannel_why_online:  "Vous avez analysé la boutique. Ajoutez vos paiements en ligne pour la vue complète.",
    ac_addchannel_cta:       "Lancer l'analyse",
    ac_chip_effort_low:      "Effort faible",
    ac_chip_impact_verify:   "Débloque les chiffres exacts",
    ac_chip_impact_recover:  "Récupérer la marge",
    ac_chip_impact_protect:  "Vous garde au top",
    ac_chip_impact_complete: "Vue complète de l'activité",
    ac_secondary_call:       "Vous préférez en parler ? Réservez un appel",
    ac_secondary_coll:       "ou rejoignez le collectif",

    /* Landing — TheStackSection */
    stack_eyebrow: "CE QUE NOUS ANALYSONS",
    stack_h2_pre:  "Toute votre infrastructure de paiement.",
    stack_h2_kw:   "Une seule analyse.",
    stack_c1_t: "Paiements en ligne",
    stack_c1_d: "Stripe, Mollie, PayPal… le coût réel de chaque vente.",
    stack_c2_t: "Terminaux en boutique",
    stack_c2_d: "La fuite silencieuse de votre canal physique.",
    stack_c3_t: "Contrats",
    stack_c3_d: "Ce que vous avez signé vs. ce que paient les marques de votre taille.",
    stack_c4_t: "Benchmark (couche de base)",
    stack_c4_d: "Des coûts réels de marques réelles. Pas la grille tarifaire.",

    /* Landing — RealImpactSection */
    ri_eyebrow:   "IMPACT RÉEL",
    ri_h2_pre:    "Cet écart, c'est",
    ri_h2_kw:     "+7 % de bénéfice net.",
    ri_sub_pre:   "Une marque réelle, 1 M€ de ventes annuelles : un taux effectif de 2,21 % par transaction quand 1,47 % était atteignable. Un écart de ",
    ri_sub_kw:    "0,74 point",
    ri_sub_post:  " — 7 400 € par an, ≈15 000 € sur 24 mois. Récupéré, c'est environ 7 % de bénéfice net en plus. Mêmes ventes. Même équipe.",

    /* Landing — Founding150Section */
    f150_eyebrow: "FOUNDING 150",
    f150_h2_l1:   "150 marques.",
    f150_h2_l2:   "Gratuit à vie.",
    f150_h2_kw:   "Une base de données.",
    f150_sub:     "Nous sélectionnons 150 marques indépendantes (200 k€–2 M€ de ventes annuelles) pour construire la première base européenne du coût réel des paiements. En échange : analyse complète et suivi continu, gratuits, pour toujours.",
    f150_cta:     "Réserver ma place",
  },

  es: {

    nav_dashboard:    "Panel",
    nav_analyzer:     "Analizador",
    nav_connect:      "Conectar",
    nav_reports:      "Informes",
    nav_settings:     "Ajustes",
    nav_how:          "Cómo funciona",
    nav_pricing:      "Precios",
    nav_get_started:  "Empezar",

    /* sidebar (app shell) */
    sidebar_results:      "Resultados",
    sidebar_documents:    "Documentos",
    sidebar_account:      "Cuenta",
    sidebar_workspace:    "Espacio de trabajo",
    sidebar_network_live: "Red en directo",
    sidebar_admin:        "Panel de administración",
    sidebar_homepage:     "Volver al inicio",
    sidebar_signout:      "Cerrar sesión",

    /* landing — hero */
    hero_badge:           "Solo pagas si te ahorramos dinero",
    hero_h1_line1:        "Deja de pagar de más.",
    hero_h1_line2:        "Recupera tu margen.",
    hero_sub:             "La mayoría de las marcas independientes pagan hasta un 40 % de más en los pagos con tarjeta — un sobrecoste oculto en tarifas combinadas. CAMBRA mide tu tasa efectiva frente al suelo de intercambio y recupera lo que es negociable. Te quedas con el 75 %. Solo cobramos cuando tú ahorras.",
    hero_cta_primary:     "Recupera tu margen — 3 min",
    hero_cta_secondary:   "Descubre lo que ahorran marcas reales",
    hero_trust_1:         "Sin cuota fija · sin permanencia",
    hero_trust_2:         "Credenciales cifradas, nunca en texto plano",
    hero_trust_3:         "Solo para marcas de la UE",

    /* landing — how it works (steps) */
    how_h2:               "Cuatro pasos, de la estimación al margen recuperado.",
    how_h2_pre:           "Cuatro pasos, de la estimación al",
    how_h2_hl:            "margen recuperado",
    how_step1_title:      "Cuéntanos cuánto facturas",
    how_step1_desc:       "Tu volumen anual, tu ticket medio y tu proveedor de pagos actual. Sesenta segundos. Nada que conectar.",
    how_step2_title:      "Descubre tu tasa efectiva",
    how_step2_desc:       "Comparamos lo que pagas de verdad con el suelo de intercambio — el mínimo real para una empresa de tu tamaño.",
    how_step3_title:      "Conecta tu proveedor para confirmarlo",
    how_step3_desc:       "Solo lectura. Tu estimación se convierte en una cifra confirmada, a partir de tus transacciones reales.",
    how_step4_title:      "Únete para recuperarlo",
    how_step4_desc:       "Reclama tus ahorros y únete a las marcas que negocian a una sola voz. Juntas conseguimos tarifas que ninguna lograría por separado.",



    how_label:            "Cómo funciona",



    footer_tagline:       "Infraestructura eficiente para el comercio independiente.",
    footer_privacy:       "Política de privacidad",
    footer_terms:         "Términos de servicio",
    footer_contact:       "Contacto",
    footer_for_providers: "Para proveedores",


    detected_source_stripe:  "Stripe",

    az_step3_verified:    "Pagos actualizados a verificado ✓",


    hero_confidence_estimated:    "Estimado — conecta Stripe para verificar",
    hero_confidence_verified:     "Verificado — basado en tus datos reales de Stripe",
    hero_confidence_provisional:  "Provisional — verificado sobre datos parciales de Stripe. Conecta más historial.",
    payments_title:               "Pagos",
    payments_verified:            "Verificado con Stripe ✓",
    payments_provisional:         "Provisional · datos Stripe parciales",
    connect_more:                 "Conectar más herramientas para mejorar la precisión",

    state_a_title:        "Mapea tu infraestructura en 3 minutos",
    state_a_sub:          "Introduce tu web. CAMBRA detecta automáticamente tus proveedores de pago, transportistas y herramientas SaaS — y compara tus costes con datos anonimizados de marcas europeas en tu nivel de facturación.",
    state_a_cta:          "Iniciar análisis gratuito →",
    state_b_badge:        "Estimado",
    state_c_badge:        "Verificado ✓",
    state_c_badge_provisional: "Provisional",
    savings_to_date:      "Ahorros hasta la fecha",
    this_month:           "Este mes",
    identified_potential: "Potencial identificado",
    next_report:          "Próximo informe: {date}",
    your_infrastructure:  "Tu infraestructura",
    ai_insights:          "Insights de IA",
    review_approve:       "Revisar y aprobar →",
    rescan:               "Volver a analizar",
    scanning:             "Analizando…",

    ct_page_title:        "Conecta tu infraestructura",
    ct_page_sub:          "Cada conexión mejora la precisión de tu benchmark y la confianza en tus ahorros.",
    ct_group_psp:         "PSP · Pagos online",
    ct_group_tpv:         "TPV · Terminal en tienda",
    ct_group_commerce:    "Commerce",
    ct_group_commerce_sub:"Para detectar tu volumen — no es un proveedor de pagos",
    summary_detected:     "{n} herramientas detectadas",
    summary_connected:    "{n} conectada(s)",
    summary_available:    "{n} disponible(s)",
    found_in_stripe:      "Encontrado en Stripe — {amount} €/mes",
    connect_to_verify:    "Conectar para verificar →",
    coming_soon:          "Próximamente",
    last_sync:            "Última sync: {time}",
    sync_now:             "Sincronizar",

    badge_verified:       "Verificado",
    badge_estimated:      "Estimado",
    badge_mixed:          "Mixto",
    badge_connected:      "Conectado",
    badge_detected:       "Detectado",
    badge_available:      "Disponible",
    badge_coming_soon:    "Próximamente",
    badge_high:           "Alta confianza",
    badge_medium:         "Confianza media",
    badge_low:            "Baja confianza",

    cat_other:            "Otro",



    per_mo_short:         "mes",
    per_yr_short:         "año",

    auto_detection:       "Detección automática",
    bench_comparison:     "Comparación de benchmarks",
    savings_calc:         "Cálculo de ahorros",
    dashboard_word:       "Panel",
    measured_cumulative:  "Ahorros acumulados medidos — reales, no proyectados.",
    from_latest_analysis: "Desde tu último análisis",
    last_12_months:       "Últimos 12 meses",
    tracking_starts_next: "El seguimiento empieza el próximo mes",
    tracking_will_appear: "El seguimiento de ahorros aparecerá cuando se genere tu primer informe mensual.",
    partially_verified:   "Parcialmente verificado",
    estimated_label:      "Estimado",
    verified_label:       "Verificado",

    ai_latest_runs:       "Últimas ejecuciones de agentes",
    ai_loading:           "Cargando ejecuciones…",
    ai_empty:             "El análisis IA aparecerá tras tu primer análisis.",
    ai_open_analyzer:     "Abrir analizador",
    ai_confidence:        "Confianza {pct}%",
    ai_pending_review:    "Pendiente de revisión admin.",
    agent_payments:       "Agente de Pagos",
    agent_recommendation: "Agente de Recomendaciones",
    agent_general:        "Agente General",
    status_running:       "En curso",
    status_awaiting:      "Esperando aprobación",
    status_approved:      "Aprobado",
    status_rejected:      "Rechazado",
    status_completed:     "Completado",
    status_failed:        "Fallido",

    continuous_discovery: "Descubrimiento continuo",
    last_scan_ago:        "Último escaneo {time}",
    changes_detected_n:   "{n} cambio{plural} detectado{plural}",
    never_label:          "nunca",
    last_scan_never:      "Sin escanear",
    just_now:             "ahora mismo",
    minutes_ago:          "hace {n} min",
    hours_ago:            "hace {n} h",
    days_ago:             "hace {n} d",

    /* FIX 1 — ConnectTools category labels (R2: reduced to payments+commerce) */
    cat_payments:         "Pagos",
    cat_commerce:         "Comercio",

    /* M4-TPV Fase 2B — in-store landing upsell strip */
    landing_upsell_in_store_eyebrow: "También en tienda",
    landing_upsell_in_store_title:   "Los terminales físicos también cuentan.",
    landing_upsell_in_store_desc:    "Auditamos tu TPV — SumUp, Stripe Terminal, Smile & Pay, Zettle, o tu banco adquirente tradicional. La misma auditoría de 60 segundos, el mismo 25% de success fee, en tienda o en línea.",
    landing_upsell_in_store_cta:     "Auditar mi TPV",

    /* M4-TPV Fase 3 — Analyzer channel tabs + CombinedGapHero strings. */
    analyzer_channel_online:      "Online",
    analyzer_channel_in_store:    "En tienda",
    analyzer_channel_combined:    "Ambos",
    /* payments results — already_optimized state + combined mini-victory (M4-refinado v1.5.0) */
    opt_hero_eyebrow: "Auditoría de pagos",
    opt_hero_title: "Ya estás en el suelo",
    opt_hero_body: "Tu tasa efectiva actual está en — o por debajo de — la mejor tarifa contratable públicamente para un comercio de tu tamaño y región. No hay ahorro material que podamos ayudarte a recuperar en este canal.",
    opt_hero_cta_secondary: "Rehacer con otros datos",
    opt_footnote: "Por debajo de MAX(200 € / año, 15 pb del GMV anual) — el suelo de ruido de nuestra estimación.",
    opt_channel_pill: "✓ Ya al mejor precio contratable",
    combined_mixed_total_note: "El total suma los canales con un ahorro recuperable. Los canales optimizados aportan 0 €.",
    insufficient_hero_title: "No tenemos una respuesta defendible",
    insufficient_hero_body: "Tus datos caen en una media regional en lugar de en una tarifa verificada por proveedor, o el pool multi-ancla de tu canal está vacío. En vez de mostrar un número que no podemos sostener, conecta tu PSP para un dato exacto.",
    insufficient_hero_cta: "Conectar tu PSP",
    combined_hero_eyebrow:        "Brecha de pagos · combinada",
    combined_hero_badge:          "Online + En tienda",
    combined_hero_lead:           "Tu sobrecoste total en ambos canales es de aproximadamente",
    combined_hero_month_suffix:   "al mes, sumados en ambos canales.",

    /* Step 3 — Score CTA + RecoveryRoadmap (payments-only) */
    score_cta_recover:    "Ver cómo lo recuperamos",
    score_cta_unlock:     "Desbloquea tu plan",
    score_cta_toptier:    "Eres top-tier · monitoriza tu drift",
    roadmap_recoverable:  "RECUPERABLE",
    roadmap_up_to:        "hasta",
    roadmap_per_year:     "/ año",
    roadmap_range:        "rango",
    roadmap_ambition:     "Marcas de tu tramo llegan a ~{x}% — hacia donde empuja el colectivo",
    roadmap_routes:       "Rutas para conseguirlo",
    route_margin_title:   "Renegociamos tu margen",
    route_rate_title:     "Te llevamos a una tarifa mejor",
    route_verify_title:   "Conecta para verificar y arrancamos",
    route_cta_migration:  "Empieza tu migración gestionada",
    route_cta_collective: "Reserva tu plaza en el colectivo",
    route_cta_verify:     "Conecta para verificar",
    route_cta_call:       "Reserva una llamada",
    route_caveat_estimated: "Objetivo estimado a partir de rangos de mercado, sujeto a verificación.",
    meta_effort_low:      "esfuerzo bajo",
    meta_effort_med:      "esfuerzo medio",
    meta_effort_high:     "esfuerzo alto",
    meta_conf_high:       "confianza alta",
    meta_conf_med:        "confianza media",
    meta_conf_low:        "confianza estimada",
    meta_prio_high:       "prioridad alta",
    meta_prio_med:        "prioridad media",
    roadmap_toptier_title: "Eres top-tier",
    roadmap_toptier_body:  "Tu setup de pagos ya está en el suelo del mercado. Monitorizamos tu drift gratis para que siga así — si algún día se desvía, te avisamos.",
    roadmap_locked_more_one:   "+{n} ruta más en tu plan",
    roadmap_locked_more_other: "+{n} rutas más en tu plan",
    roadmap_locked_sub:    "Crea tu cuenta para desbloquear tu plan de recuperación completo.",

    /* Report v2 — Pieza C: peer benchmark distribution */
    bench_title:          "Dónde estás frente a marcas como la tuya",
    bench_regional:       "Benchmark regional · {country}",
    bench_regional_nocountry: "Benchmark regional",
    bench_top10:          "Top 10%",
    bench_median:         "Mediana de pares",
    bench_you:            "TÚ",
    bench_axis_cheaper:   "más barato",
    bench_axis_pricier:   "más caro",
    bench_callout:        "Estás en el ~{pct}% más caro de las marcas {country} de tu tamaño.",
    bench_callout_nocountry: "Estás en el ~{pct}% más caro de las marcas de tu tamaño.",
    bench_callout_cheaper:   "Eres más barato que ~{pct}% de las marcas {country} de tu tamaño.",
    bench_callout_cheaper_nocountry: "Eres más barato que ~{pct}% de las marcas de tu tamaño.",

    /* Report v2 — Colectivo (clickwrap-lite) + Reserva una llamada */
    coll_eyebrow:        "El colectivo",
    coll_title:          "Únete al colectivo",
    coll_sub:            "Muchas marcas negociando como una sola. Cuanto más GMV se suma, más fuerza tiene el colectivo para recuperar tu margen.",
    coll_email_label:    "Email",
    coll_email_ph:       "tu@marca.com",
    coll_gmv_label:      "GMV mensual",
    coll_gmv_note:       "de tu análisis",
    coll_submit:         "Únete al colectivo · founding member",
    coll_submitting:     "Uniéndote…",
    coll_clickwrap_pre:  "Al unirte aceptas los",
    coll_clickwrap_link: "Términos del Colectivo",
    coll_terms_draft:    "Borrador — pendiente de revisión legal",
    coll_terms_title:    "Términos del Colectivo (borrador)",
    coll_terms_body:     "Al unirte al Colectivo CAMBRA autorizas a CAMBRA a incluir tu volumen de pagos, de forma agregada y pseudonimizada, en la fuerza negociadora colectiva usada para recuperar margen en nombre de sus miembros. No hay coste inicial ni permanencia. CAMBRA solo cobra una comisión sobre el ahorro verificado que efectivamente se materialice, conforme al modelo por resultados. Puedes salir del colectivo en cualquier momento. Este texto es un BORRADOR pendiente de revisión legal y no constituye un contrato vinculante hasta su versión final revisada.",
    coll_terms_close:    "Entendido",
    coll_success_title:  "Estás dentro · founding member",
    coll_success_body:   "€{gmv} de GMV ya en el colectivo. Te escribimos con los próximos pasos.",
    coll_success_body_nogmv: "Bienvenido al colectivo. Te escribimos con los próximos pasos.",
    coll_error:          "Algo falló. Inténtalo de nuevo.",
    coll_done:           "Listo",
    /* Report v2 — cross-links + context subcopy */
    coll_secondary_call: "¿Prefieres hablar? Reserva una llamada",
    call_secondary_coll: "o únete al colectivo",
    coll_ctx_margin:     "Deja que CAMBRA renegocie tu margen de procesador — únete para arrancar.",
    coll_ctx_rate:       "Deja que CAMBRA te lleve a una tarifa mejor — únete para arrancar.",

    /* Book a call */
    call_eyebrow:        "Hablemos",
    call_title:          "Reserva una llamada",
    call_sub:            "Tu oportunidad es lo bastante grande como para merecer una conversación. Cuéntanos y te contactamos para agendar.",
    call_name_label:     "Nombre",
    call_name_ph:        "Tu nombre",
    call_email_label:    "Email",
    call_email_ph:       "tu@marca.com",
    call_msg_label:      "Mensaje (opcional)",
    call_msg_ph:         "Cuéntanos brevemente tu situación…",
    call_submit:         "Solicitar llamada",
    call_submitting:     "Enviando…",
    call_success_title:  "Solicitud enviada",
    call_success_body:   "Te contactamos por email para agendar la llamada.",
    call_error:          "Algo falló. Inténtalo de nuevo.",

    /* FIX 2 — Dashboard strings */

    /* FIX 4 — Toast keys */
    sync_success:         "Sincronización completada",
    sync_error:           "Sincronización fallida — inténtalo de nuevo",
    connect_success:      "Conexión exitosa",
    connect_error:        "Conexión fallida — inténtalo de nuevo",

    /* FIX 5 — Discovery empty state */

    /* FIX 7 — Results static benchmark note */

    /* Chunk 6 — verification confidence badges on Results */

    /* Chunk 5C — auto-materialize toasts after manual sync */

    /* Login gate */
    login_gate_headline:    "Tu auditoría de infraestructura está lista.",
    login_gate_sub:         "Crea una cuenta gratuita o inicia sesión para ver tus resultados.",
    login_gate_connect_headline: "Conecta tus herramientas de forma segura.",
    login_gate_connect_sub:      "Crea una cuenta gratuita o inicia sesión para conectar Stripe y tus otras herramientas con acceso de solo lectura.",
    login_gate_cta:         "Continuar",
    login_gate_footnote:    "Gratis para empezar. Sin tarjeta. Solo pagas cuando ahorras.",
    login_gate_terms:       "Al continuar, aceptas nuestros",
    login_gate_terms_link:  "Términos de servicio",
    login_gate_and:         "y",
    login_gate_privacy_link:"Política de privacidad",

    /* Cookie consent */
    cookie_banner_text:     "Usamos cookies para mejorar tu experiencia y analizar el uso de la plataforma.",
    cookie_accept_all:      "Aceptar todo",
    cookie_manage:          "Gestionar preferencias",
    cookie_necessary:       "Necesarias",
    cookie_necessary_desc:  "Requeridas para el funcionamiento de la plataforma. No se pueden desactivar.",
    cookie_analytics:       "Analítica",
    cookie_analytics_desc:  "Nos ayuda a entender cómo usas CAMBRA para mejorar el producto.",
    cookie_marketing:       "Marketing",
    cookie_marketing_desc:  "Insights y comunicaciones personalizadas.",
    cookie_save:            "Guardar preferencias",
    cookie_modal_title:     "Preferencias de cookies",
    cookie_modal_sub:       "CAMBRA se compromete con tu privacidad. Elige qué cookies permites.",
    cookie_always_on:       "Siempre activado",

    /* 0.4 — HowItWorks page */
    hiw_hero_badge:   "Cómo funciona · 4 pasos",
    hiw_hero_h1:      "De los datos de costes al margen recuperado.",
    hiw_hero_sub:     "Una auditoría de pagos estructurada — hecha para operadores independientes. Sin costes iniciales, sin permanencia.",
    hiw_s1_eyebrow:   "analizar",
    hiw_s1_title:     "Analiza de forma anónima",
    hiw_s1_detail:    "Responde unas preguntas rápidas sobre tu facturación, tu proveedor y tus volúmenes. Sin cuenta, sin conexión, sin tarjeta. Sesenta segundos.",
    hiw_s1_cta:       "Empezar la auditoría",
    hiw_s2_eyebrow:   "diagnosticar",
    hiw_s2_title:     "Descubre tus costes reales de pago",
    hiw_s2_detail:    "Comparamos tu tasa efectiva con el suelo alcanzable para tu categoría y zona, y desglosamos la diferencia entre intercambio, tarifas de red y margen del procesador — las tres capas por donde de verdad se escapa el dinero.",
    hiw_s2_cta:       "Ejecutar el analizador",
    hiw_s3_eyebrow:   "verificar",
    hiw_s3_title:     "Conecta tu proveedor para cifras exactas",
    hiw_s3_detail:    "Pasa de la estimación al cálculo. Una conexión de solo lectura convierte tus datos declarados en la verdad a nivel de transacción — el mismo benchmark, cifras verificadas.",
    hiw_s3_cta:       "Conecta tu proveedor",
    hiw_s4_eyebrow:   "recuperar",
    hiw_s4_title:     "Recupera tu margen",
    hiw_s4_detail:    "Cuando la diferencia es real y significativa, CAMBRA te ayuda a cerrarla — mediante renegociación o migración — con una comisión por resultados. Si no recuperamos nada, no pagas nada.",
    hiw_s4_cta:       "Ver el modelo de recuperación",
    hiw_cta_button:   "Haz tu auditoría gratis",
    hiw_cta_note:     "Gratis para siempre para los primeros operadores · Sin tarjeta",

    /* 0.4 — Testimonials page (chrome only) */
    tst_hero_badge:   "Testimonios · De operadores reales",
    tst_hero_h1:      "Lo que las marcas dicen de CAMBRA.",
    tst_hero_sub:     "Resultados reales de marcas de comercio independiente por toda Europa.",
    tst_role_at:      "{role} en {company}",
    tst_illustrative_note: "Testimonios de ejemplo — aún no son clientes reales.",

    /* 0.4 — Pricing page */
    prc_split_eyebrow:   "Modelo de precios",
    prc_split_h2:        "Tú te quedas el margen. Nosotros una parte.",
    prc_you_keep:        "Te quedas",
    prc_cambra:          "CAMBRA",
    prc_duration_label:  "Duración",
    prc_duration_val:    "24 meses",
    prc_duration_note:   "Después, 100 % tuyo, para siempre",
    prc_atbench_label:   "Ya en el benchmark",
    prc_atbench_val:     "Pagas 0 €",
    prc_atbench_note:    "Sin diferencia, sin comisión — nunca",
    prc_nosav_label:     "Si no hay ahorro",
    prc_nosav_val:       "Pagas 0 €",
    prc_nosav_note:      "El riesgo es todo nuestro",
    prc_hero_badge:      "Precios · Alineados con tu margen",
    prc_hero_h1:         "Primero analiza. Luego recupera.",
    prc_hero_sub:        "No son dos planes — son dos pasos inevitables. El paso 01 es la auditoría gratuita. El paso 02 es cuando te ayudamos a recuperar de verdad el margen que encontramos.",
    prc_cta_primary:     "Auditoría gratis — 3 min",
    prc_cta_secondary:   "Ver cómo funciona",
    prc_trust_1:         "Sin tarjeta",
    prc_trust_2:         "Acceso de solo lectura y cifrado",
    prc_trust_3:         "Configuración en 5 minutos",
    prc_trust_4:         "Cancela cuando quieras",
    prc_promise_eyebrow: "La promesa del fundador",
    prc_promise_text:    "Si CAMBRA no te recupera ningún margen, no nos debes nada. Ni por la auditoría, ni por la negociación, ni por la migración. Nuestros incentivos están 100 % alineados con los tuyos — solo cobramos cuando tus extractos bancarios confirman el ahorro.",
    prc_faq_eyebrow:     "Preguntas frecuentes",
    prc_faq_h2:          "Claridad, no letra pequeña.",
    prc_faq_q1: "¿La inteligencia de infraestructura es de verdad gratis?",
    prc_faq_a1: "Sí — sin tarjeta, sin compromiso. Las primeras marcas fundadoras tienen acceso completo a la auditoría, los benchmarks, el scoring y el panel, sin coste alguno.",
    prc_faq_q2: "¿Cómo funciona el modelo de recuperación?",
    prc_faq_a2: "Cuando CAMBRA te ayuda activamente a recuperar margen, participamos en el 25 % del ahorro verificado durante 24 meses. Tú te quedas con la mayor parte. Sin costes iniciales, sin suscripción, sin mínimo. Si no recuperamos nada, no pagas nada — el riesgo es todo nuestro. Después de 24 meses, el 100 % del margen recuperado se queda contigo.",
    prc_faq_q3: "¿Qué cuenta como «ahorro verificado»?",
    prc_faq_a3: "El margen recuperado que es medible, atribuible a la renegociación o migración de CAMBRA, y conciliado con los extractos reales de tu proveedor. Las estimaciones de la auditoría nunca se cobran — solo lo que aparece en tus facturas reales una vez aplicado el cambio.",
    prc_faq_q4: "Entonces, ¿cuánto me cuesta en realidad?",
    prc_faq_a4: "La auditoría y la estimación son gratis durante el acceso anticipado. Solo pagas si activas el servicio de recuperación Y logramos reducir un coste real que aparece en los extractos de tu proveedor. La comisión es una parte de lo que te ahorramos — nunca más de lo que de verdad ganas.",
    prc_faq_q5: "¿Puedo cancelar cuando quiera?",
    prc_faq_a5: "Sí. Sin permanencia, sin duración mínima. Pausa o cancela desde los ajustes de tu cuenta.",
    prc_faq_q6: "¿Mis datos son confidenciales?",
    prc_faq_a6: "Siempre. Acceso de solo lectura, cifrado en reposo y en tránsito, nunca se vende, nunca se comparte. Consulta nuestra política de privacidad.",
    prc_final_cta:       "Empieza con la auditoría gratis",
    prc_final_note:      "3 minutos · Sin tarjeta · Verás tu ahorro en euros",

    /* Phase 1 — data insights */
    ins_section_title:      "Tus pagos, desglosados",
    ins_section_sub:        "Cada cifra viene de tu análisis — nada estimado por encima.",
    ins_total_fees_label:   "Total de comisiones que pagas",
    ins_total_fees_note:    "Coste bruto de aceptar tarjetas — no es tu ahorro recuperable.",
    ins_gmv_label:          "Volumen con tarjeta (GMV)",
    ins_effective_label:    "Tasa efectiva",
    ins_effective_note:     "El {pct}% de tu GMV se va en comisiones de pago.",
    ins_currentrate_title:      "Tu tasa, desglosada",
    ins_currentrate_sub:        "Pagas {rate}: {floor} es suelo regulado que no se mueve, y {movable} es tu zona optimizable — ahí está el dinero recuperable.",
    ins_currentrate_floor:      "Suelo regulado",
    ins_currentrate_floor_note: "Intercambio + tarifas de red (IFR UE + Visa/Mastercard) — no negociable.",
    ins_currentrate_movable:    "Tu zona optimizable",
    ins_currentrate_movable_note: "Margen del procesador + comisión fija + transfronterizo — esto es lo que CAMBRA baja.",
    ins_currentrate_recoverable: "Donde CAMBRA recupera",
    ins_layer_per_year:     "/año",
    ins_cardmix_title:      "Mix de tarjetas y coste",
    ins_cardmix_debit:      "Débito",
    ins_cardmix_credit:     "Crédito",
    ins_cardmix_domestic:   "Doméstico",
    ins_cardmix_intl:       "Internacional",
    ins_cardmix_ifr_note:   "Tu débito debería costar ~{ideal}%. Facturado a tasa combinada, sobrepagas unos {overpay} al año solo en débito.",
    ins_pertx_title:        "Coste por transacción",
    ins_pertx_cost:         "Por transacción",
    ins_pertx_count:        "Transacciones / mes",
    ins_pertx_ticket:       "con un ticket medio de {ticket}",
    ins_crossborder_title:  "Coste transfronterizo",
    ins_crossborder_note:   "El {pct}% de tu GMV es internacional — el recargo transfronterizo añade esto.",
    ins_crossborder_notmodeled: "Tienes volumen internacional, pero no tenemos una tasa transfronteriza verificada para este proveedor. Conecta tu PSP para la cifra exacta.",
    ins_fixeddrag_title:    "Peso de la comisión fija",
    ins_fixeddrag_note:     "Con un ticket de {ticket}, la comisión fija de {fee} añade ~{drag}% a tu tasa efectiva.",
    ins_per_year_full:      "al año",
    ins_per_month_full:     "al mes",

    /* Phase 2 — account aggregate */
    acct_title:             "Tu cuenta, agregada",
    acct_sub:               "En {n} análisis — importes sumados, tasa mezclada ponderada por volumen.",
    acct_total_gmv:         "Volumen de tarjeta total",
    acct_total_fees:        "Total de comisiones que pagas",
    acct_blended_rate:      "Tasa efectiva mezclada",
    acct_blended_note:      "Ponderada por GMV en todos tus análisis.",
    acct_total_savings:     "Recuperable, agregado",
    acct_savings_note:      "Estimación puntual sumada en los análisis.",
    acct_confidence:        "Confianza",
    acct_conf_verified:     "Verificado — respaldado por datos reales del proveedor",
    acct_conf_provisional:  "Provisional — datos verificados parciales",
    acct_conf_estimated:    "Estimado — conecta un proveedor para verificar",
    acct_analyses_count:    "{n} análisis",
    acct_channels_online:   "Online",
    acct_channels_in_store: "En tienda",

    /* Phase 2 — analysis evolution */
    trend_eyebrow:          "Evolución",
    trend_title:            "Cómo se movieron tus números",
    trend_sub:              "En {n} análisis a lo largo del tiempo.",
    trend_legend_rate:      "Tasa efectiva",
    trend_legend_savings:   "Ahorro identificado",
    trend_caption:          "Cada re-ejecución trazada en el tiempo — nada promediado. Los puntos verificados van con anillo.",

    /* Phase 3 — in-store (TPE/TPV) */
    instore_section_title:     "Terminal en tienda (TPV)",
    instore_section_sub:       "Lo que tu terminal cuesta de verdad — alquiler incluido, sin doble-cuenta.",
    instore_rental_title:      "Alquiler del terminal",
    instore_rental_note:       "{month}/mes de alquiler = +{impact} de tu tasa efectiva. Esto es parte de la tasa que ya pagas — no un coste extra encima.",
    instore_rental_per_month:  "/mes alquiler",
    instore_rental_effective:  "de tu tasa efectiva",
    instore_rental_part:       "Alquiler del terminal",
    instore_rental_rest:       "Resto de tu tasa",
    instore_rental_coherence:  "Alquiler + resto = {total} — tu tasa efectiva completa. El alquiler está dentro, nunca sumado encima.",
    instore_split_title:       "Online vs en tienda",
    instore_split_note:        "Tasa, coste y ahorro por canal — los dos suman tu total combinado.",
    instore_split_savings:     "ahorro",
    instore_split_total:       "Ahorro combinado",
    instore_subpayg_title:     "Abono vs pago por uso",
    instore_subpayg_disclaimer:"Solo referencia de mercado — informativo, no una recomendación de cambio.",
    instore_subpayg_crossover: "Volumen de equilibrio",
    instore_subpayg_yours:     "Tu volumen",
    instore_subpayg_verdict_sub: "A tu volumen, un terminal con abono compensa — unos {delta}/mes más barato que pago por uso.",
    instore_subpayg_verdict_payg:"A tu volumen, el pago por uso compensa — unos {delta}/mes más barato que un abono.",
    instore_subpayg_cambra:    "CAMBRA te consigue el mejor deal de terminal para tu volumen — sin tener que comparar.",

    /* Download audit (PDF) */
    pdf_download_cta:        "Descargar auditoría (PDF)",
    pdf_generating:          "Generando…",
    pdf_doc_title:           "Auditoría de pagos",
    pdf_badge_verified:      "VERIFICADO",
    pdf_badge_estimated:     "ESTIMADO",
    pdf_channel_combined:    "Online + En tienda",
    pdf_sec_aggregate:       "Agregado — todo el negocio",
    pdf_sec_summary:         "Resumen",
    pdf_sec_rate_decomposed: "Tu tasa, desglosada",
    pdf_sec_cost:            "Desglose de coste",
    pdf_sec_benchmark:       "Benchmark — dónde estás",
    pdf_sec_roadmap:         "Plan de recuperación",
    pdf_sec_method:          "Método y confianza",
    pdf_score:               "Score de eficiencia",
    pdf_recoverable:         "Recuperable",
    pdf_range:               "Rango",
    pdf_per_yr:              "/año",
    pdf_current_rate:        "Tasa efectiva actual",
    pdf_achievable_rate:     "Tasa alcanzable",
    pdf_regulated_floor:     "Suelo regulado",
    pdf_optimizable_zone:    "Zona optimizable",
    pdf_total_fees:          "Total de comisiones pagadas",
    pdf_gmv:                 "Volumen con tarjeta (GMV)",
    pdf_effective_pct:       "Tasa efectiva",
    pdf_cost_per_tx:         "Coste por transacción",
    pdf_cross_border:        "Volumen internacional",
    pdf_card_mix:            "Mix de tarjetas",
    pdf_your_rate:           "Tu tasa",
    pdf_peer_median:         "Mediana de pares",
    pdf_top10:               "Top 10%",
    pdf_percentile:          "Tu posición",
    pdf_percentile_val:      "Entre el ~{pct}% más caro de tu tamaño",
    pdf_percentile_val_cheaper: "Más barato que ~{pct}% de las marcas de tu tamaño",
    pdf_toptier:             "Estás en el suelo alcanzable — costes de pago top-tier.",
    pdf_engine_version:      "Versión del motor",
    pdf_footer_note:         "Estimación basada en tus datos — conecta tu proveedor para verificar. CAMBRA · Auditoría de pagos.",

    /* Action Center — "tu siguiente mejor paso" */
    ac_eyebrow:              "Tu siguiente mejor paso",
    ac_verify_title:         "Verifica tu ahorro",
    ac_verify_why:           "Convierte tu estimación de ~{amount}/año en un número verificado — conecta tu proveedor, solo lectura.",
    ac_verify_cta:           "Conecta tu proveedor",
    ac_recover_title:        "Recupera {amount}/año",
    ac_recover_why_coll:     "Únete al colectivo — muchas marcas negociando como una sola — para empezar a recuperarlo.",
    ac_recover_cta_coll:     "Únete al colectivo",
    ac_call_title:           "Recupera {amount}/año",
    ac_call_why:             "Tu oportunidad es lo bastante grande para una llamada — planifiquemos juntos la recuperación.",
    ac_call_cta:             "Reserva una llamada",
    ac_incoll_title:         "Reserva tu llamada de recuperación",
    ac_incoll_why:           "Ya estás en el colectivo. Reserva una llamada para empezar a recuperar tus {amount}/año.",
    ac_incoll_cta:           "Reserva tu llamada",
    ac_toptier_title:        "Eres top-tier",
    ac_toptier_why:          "Tu tasa efectiva está en el suelo alcanzable. La monitorizamos gratis — si algún día se desvía, te avisamos.",
    ac_toptier_badge:        "Eficiente",
    ac_addchannel_title:     "Añade tu otro canal",
    ac_addchannel_why_instore: "Ya analizaste el online. Añade tu terminal en tienda para la foto completa.",
    ac_addchannel_why_online:  "Ya analizaste la tienda. Añade tus pagos online para la foto completa.",
    ac_addchannel_cta:       "Hacer el análisis",
    ac_chip_effort_low:      "Esfuerzo bajo",
    ac_chip_impact_verify:   "Desbloquea cifras exactas",
    ac_chip_impact_recover:  "Recuperar margen",
    ac_chip_impact_protect:  "Te mantiene top-tier",
    ac_chip_impact_complete: "Vista de todo el negocio",
    ac_secondary_call:       "¿Prefieres hablar? Reserva una llamada",
    ac_secondary_coll:       "o únete al colectivo",

    /* Landing — TheStackSection */
    stack_eyebrow: "QUÉ ANALIZAMOS",
    stack_h2_pre:  "Todo tu stack de pagos.",
    stack_h2_kw:   "Un solo análisis.",
    stack_c1_t: "Pagos online",
    stack_c1_d: "Stripe, Mollie, PayPal… lo que de verdad te cuesta cada venta.",
    stack_c2_t: "TPV en tienda",
    stack_c2_d: "La fuga silenciosa de tu canal físico.",
    stack_c3_t: "Contratos",
    stack_c3_d: "Lo que firmaste vs. lo que pagan las marcas de tu tamaño.",
    stack_c4_t: "Benchmark (capa base)",
    stack_c4_d: "Costes reales de marcas reales. No la tarifa publicada.",

    /* Landing — RealImpactSection */
    ri_eyebrow:   "IMPACTO REAL",
    ri_h2_pre:    "Ese gap es",
    ri_h2_kw:     "+7% de beneficio neto.",
    ri_sub_pre:   "Una marca real, 1 M€ de ventas anuales: pagaba un 2,21% efectivo por transacción cuando el 1,47% era alcanzable. Un gap de ",
    ri_sub_kw:    "0,74 puntos",
    ri_sub_post:  " — 7.400 € al año, ≈15.000 € en 24 meses. Recuperado, es cerca de un 7% más de beneficio neto. Mismas ventas. Mismo equipo.",

    /* Landing — Founding150Section */
    f150_eyebrow: "FOUNDING 150",
    f150_h2_l1:   "150 marcas.",
    f150_h2_l2:   "Gratis para siempre.",
    f150_h2_kw:   "Una base de datos.",
    f150_sub:     "Seleccionamos 150 marcas independientes (200k–2M € de ventas anuales) para construir la primera base europea del coste real de los pagos. A cambio: análisis completo y monitoring continuo, gratis, para siempre.",
    f150_cta:     "Reservar mi plaza",
  },
};

/* ── Legacy nested-object translations (kept for older landing components) ── */
export const translations = {
  /* legacy passthrough — older components import { translations, t } from i18n
     and call t(translations.xxx, lang). Empty object short-circuits via fallback. */
};

/* ── interpolation ────────────────────────────────────────── */
function interpolate(str, params) {
  if (!params || typeof str !== "string") return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/* ── Context ──────────────────────────────────────────────── */
const LanguageContext = createContext({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
  formatCurrency: (n) => formatCurrency(n, "en"),
  formatDate: (d) => formatDate(d, "en"),
});

function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && DICT[v]) return v;
    for (const legacy of LEGACY_KEYS) {
      const lv = localStorage.getItem(legacy);
      if (lv && DICT[lv]) return lv;
    }
  } catch {}
  return "en";
}

// Ensure a meta tag exists; create it if missing. Returns the element.
function ensureMeta(selector, attrs) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  return el;
}

function updateMetaTags(lang) {
  try {
    const dict = DICT[lang] || DICT.en;
    const title = dict.meta_title;
    const description = dict.meta_description;

    // <html lang>
    document.documentElement.lang = lang;

    // <title>
    if (title) document.title = title;

    // Standard description
    if (description) {
      ensureMeta('meta[name="description"]', { name: "description" })
        .setAttribute("content", description);
    }

    // Open Graph
    if (title) {
      ensureMeta('meta[property="og:title"]', { property: "og:title" })
        .setAttribute("content", title);
    }
    if (description) {
      ensureMeta('meta[property="og:description"]', { property: "og:description" })
        .setAttribute("content", description);
    }
    ensureMeta('meta[property="og:locale"]', { property: "og:locale" })
      .setAttribute("content", { en: "en_GB", fr: "fr_FR", es: "es_ES" }[lang] || "en_GB");

    // Twitter
    if (title) {
      ensureMeta('meta[name="twitter:title"]', { name: "twitter:title" })
        .setAttribute("content", title);
    }
    if (description) {
      ensureMeta('meta[name="twitter:description"]', { name: "twitter:description" })
        .setAttribute("content", description);
    }
  } catch {}
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => readStoredLang());

  const setLang = useCallback((next) => {
    if (!DICT[next]) return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    updateMetaTags(next);
  }, []);

  useEffect(() => {
    updateMetaTags(lang);
  }, [lang]);

  /* dual-mode t():
     - t("key", { params })                  → flat lookup with interpolation
     - t(obj, "en")                          → legacy nested-object lookup */
  const t = useCallback((keyOrObj, paramsOrLang) => {
    if (keyOrObj && typeof keyOrObj === "object") {
      const requested = (typeof paramsOrLang === "string" && DICT[paramsOrLang]) ? paramsOrLang : lang;
      return keyOrObj?.[requested] ?? keyOrObj?.en ?? "";
    }
    const key = String(keyOrObj);
    const dict = DICT[lang] || DICT.en;
    const raw = dict[key] ?? DICT.en[key] ?? key;
    return interpolate(raw, typeof paramsOrLang === "object" ? paramsOrLang : null);
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    formatCurrency: (n) => formatCurrency(n, lang),
    formatDate:     (d) => formatDate(d, lang),
  }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage()    { return useContext(LanguageContext); }
export function useTranslation() { return useContext(LanguageContext); }

/* Standalone t() for non-React callers (rare): falls back to English only. */
export function t(keyOrObj, paramsOrLang) {
  if (keyOrObj && typeof keyOrObj === "object") {
    const requested = (typeof paramsOrLang === "string" && DICT[paramsOrLang]) ? paramsOrLang : "en";
    return keyOrObj?.[requested] ?? keyOrObj?.en ?? "";
  }
  const key  = String(keyOrObj);
  const raw  = DICT.en[key] ?? key;
  return interpolate(raw, typeof paramsOrLang === "object" ? paramsOrLang : null);
}