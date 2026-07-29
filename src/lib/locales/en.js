// CAMBRA i18n — EN dictionary (flat keys).
// SWEEP-1 T3 (2026-07-24): extracted verbatim from src/lib/i18n.jsx — zero
// key/value changes. i18n.jsx imports this file; API unchanged.
export default {
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
    /* SWEEP-1 T6 — honesty note under the modeled peer curve */
    bench_modeled_note:   "Modeled from public pricing data — refined as verified merchant data reaches critical mass.",

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

    /* I18N-GAP — Landing TrustSecuritySection */
    trust_sec_eyebrow: "TRUST & SECURITY",
    trust_sec_h2_pre:  "Your data is yours.",
    trust_sec_h2_kw:   "Always.",
    trust_sec_b1_t:    "Bank-level encryption",
    trust_sec_b1_d:    "Your data is encrypted in transit and at rest.",
    trust_sec_b2_t:    "Read-only access",
    trust_sec_b2_d:    "We can see your fees. We can never move your money.",
    trust_sec_b3_t:    "GDPR compliant",
    trust_sec_b3_d:    "Built in Europe, under European rules.",
    trust_sec_b4_t:    "Strict isolation",
    trust_sec_b4_d:    "Your data never mixes with anyone else's.",
    /* trust_sec_link — the source table appends " →"; the component renders the
       arrow as an <ArrowRight> icon, so the string omits it (see Decision_Log_I18N_GAP). */
    trust_sec_link:      "How we handle your data",
    trust_sec_vault_alt: "CAMBRA — your data secured in an isolated vault",

    /* I18N-GAP — /Security page (copy calibrated, do not paraphrase) */
    sec_eyebrow:  "SECURITY",
    sec_h1_pre:   "Built so we",
    sec_h1_kw:    "can't",
    sec_h1_post:  "hurt you.",
    sec_sub:      "The honest answer to the question every founder should ask before connecting anything: \"what exactly can CAMBRA see, and what can it do?\"",
    /* i18n: traducción propia, revisar — hero trust chips (not in source table) */
    sec_chip_1:   "Read-only OAuth",
    sec_chip_2:   "Encrypted in transit & at rest",
    sec_chip_3:   "GDPR · France",
    sec_b1_h2:    "Read-only. By design, not by promise.",
    sec_b1_body:  "When you connect your payment provider, you grant CAMBRA read-only access through the provider's official OAuth flow. That access lets us read your transaction fees and volumes. It does not let us create charges, issue refunds, move funds, or modify anything in your account. This isn't a policy we follow — it's a technical boundary set by the provider. Even if we wanted to touch your money, we couldn't.",
    sec_can_title:    "What we can see",
    sec_can_1:    "Transaction amounts and fees",
    sec_can_2:    "Payment methods and card types",
    sec_can_3:    "Currencies and regions",
    sec_can_4:    "Payout schedules",
    sec_cannot_title: "What we can never do",
    sec_cannot_1: "Move or hold money",
    sec_cannot_2: "Create or refund charges",
    sec_cannot_3: "See your customers' card numbers",
    sec_cannot_4: "Change anything in your account",
    sec_b2_h2:    "Aggregates, not identities.",
    sec_b2_body:  "Our analysis runs on aggregate numbers: volumes, fees, rates, payment mix. We do not need — and do not process — your end customers' personal data. No names, no emails, no card numbers. Card data never touches CAMBRA at any point: it stays within your payment provider's certified infrastructure. Statement uploads are used solely to compute your effective rate, and the figures we benchmark are anonymized and aggregated.",
    sec_b3_h2:    "Your numbers never leak into anyone else's.",
    sec_b3_body:  "Every brand's data lives in strict isolation, enforced at the database layer. Benchmarks are built from anonymized aggregates — no brand can ever see another brand's rates, volumes, or identity. When your data contributes to a benchmark, it does so as a number in a cohort, never as your name.",
    sec_b4_h2:    "Encrypted everywhere it travels, everywhere it rests.",
    sec_b4_body:  "All data is encrypted in transit (TLS) and at rest. Access to production data is restricted and logged. We keep what we need to run your analysis and monitoring — nothing more.",
    sec_b5_h2:    "European company. European rules.",
    sec_b5_body:  "CAMBRA Global SASU is incorporated in France and operates under GDPR. You can request access to your data or its deletion at any time. A Data Processing Agreement is available for brands that require one — ask us at {email}.",
    sec_b6_h2:    "Leaving takes one click.",
    sec_b6_body:  "You can disconnect your payment provider at any moment from your dashboard, and the connection is revoked immediately at the provider level. Your access, your call — always.",
    sec_close_h2:   "Questions? Ask before you connect.",
    sec_close_body: "If anything here is unclear, write to us before connecting anything. We'd rather earn your trust slowly than lose it fast.",
    sec_cta_contact: "Contact us",
    sec_cta_analyze: "See my payment gap",

    /* I18N-GAP — AnalyzingOverlay */
    overlay_title:  "Running your payments audit",
    overlay_step_1: "Reading your inputs",
    overlay_step_2: "Matching your regional cohort",
    overlay_step_3: "Comparing against interchange floors",
    overlay_step_4: "Building your audit",

    /* COHERENCE-1 — PLUS plan-anchor transparency note (exact copy, do not paraphrase) */
    plus_anchor_note: "Rate shown is SumUp Pagos Plus (€19/month plan, no lock-in), monthly fee included in the effective rate. The 0.75% applies to eligible standard transactions; premium and commercial cards may cost more.",

    /* SWEEP-1 T2 — brand name is optional in the anonymous analyzer */
    brand_name_optional: "Brand name (optional)",
    brand_fallback:      "Your brand",

    /* UX-1 — mandatory email gate + locked teaser fields */
    analyzer_email_label:       "Your email",
    analyzer_email_hint:        "Required — we send your report here",
    analyzer_email_placeholder: "you@yourbrand.com",
    analyzer_email_required:    "Enter your email to see your results.",
    analyzer_email_invalid:     "Enter a valid email address (e.g. you@yourbrand.com).",
    locked_achievable_rate:     "Create your free account to unlock your exact achievable rate.",
    locked_combined_breakdown:  "Create your free account to see the online vs in-store breakdown.",
    locked_pdf_download:        "Create your free account to download the PDF report.",
};