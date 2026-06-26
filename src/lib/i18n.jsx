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
    meta_title:       "CAMBRA — Infrastructure Cost Intelligence for Independent Brands",
    meta_description: "CAMBRA benchmarks your payment fees, shipping costs and SaaS spend against 400+ European brands. Find where you overpay and recover margin automatically. Free analysis.",

    /* navigation */
    nav_dashboard:    "Dashboard",
    nav_analyzer:     "Analyzer",
    nav_results:      "Results",
    nav_connect:      "Connect Tools",
    nav_deals:        "Deals",
    nav_reports:      "Reports",
    nav_settings:     "Settings",
    nav_signout:      "Sign out",
    nav_how:          "How it works",
    nav_pricing:      "Pricing",
    nav_developers:   "Developers",
    nav_get_started:  "Get started",

    /* landing — hero */
    badge:                "Infrastructure Cost Intelligence",
    hero_headline:        "Your infrastructure is costing you more than it should.",
    hero_sub:             "CAMBRA benchmarks your payment fees, shipping costs and SaaS spend against anonymized data from independent European brands — and shows you exactly where you're overpaying. Most brands identify €10,000–€40,000/yr in recoverable costs.",
    hero_cta_primary:     "Run free analysis →",
    hero_cta_secondary:   "See how it works",
    hero_footnote:        "No credit card. No commitment. You pay 25% of verified savings only.",

    /* landing — problem */
    problem_label:        "The hidden cost problem",
    problem_headline:     "Independent brands overpay by 20–40% on infrastructure. Every month.",
    problem_card1_title:  "Payments",
    problem_card1_body:   "Most brands pay 2.2–2.8% in payment fees. The optimised rate for your volume is often 1.4–1.8%.",
    problem_card1_stat:   "€8,400/yr lost on average",
    problem_card2_title:  "Shipping",
    problem_card2_body:   "Carriers charge 15–30% more to brands without collective negotiating power.",
    problem_card2_stat:   "€4,200/yr lost on average",
    problem_card3_title:  "SaaS & Tools",
    problem_card3_body:   "The average independent brand pays for 3–4 overlapping or underused software tools.",
    problem_card3_stat:   "€3,800/yr lost on average",

    /* landing — how */
    how_label:            "How it works",
    step1_title:          "Enter your website",
    step1_desc:           "We automatically detect your payment providers, shipping carriers, marketing tools and SaaS stack. No manual setup.",
    step2_title:          "We benchmark your costs",
    step2_desc:           "We compare your effective rates against anonymized data from European brands at the same revenue tier and geography.",
    step3_title:          "You recover margin",
    step3_desc:           "We show you the gap, the opportunity in euros per year, and how to close it. Most improvements are live within 5 business days.",

    /* landing — benchmark */
    benchmark_label:      "Backed by real data",
    benchmark_headline:   "Built on anonymized data from European independent brands.",
    benchmark_payments:   "Average 1.7% optimised payment rate for EU small brands",
    benchmark_shipping:   "Average €4.80/pkg for brands shipping 500+ orders/mo",
    benchmark_saas:       "Average 2.8% of revenue on software tools",
    benchmark_footnote:   "All benchmarks are anonymized and aggregated across brands. No individual company data is ever exposed. Minimum 5 brands per cohort.",

    /* landing — pricing/cta */
    pricing_headline:     "Start for free. Pay only when you save.",
    pricing_model:        "Success fee only",
    pricing_line1:        "Free infrastructure analysis",
    pricing_line2:        "Free benchmark report",
    pricing_line3:        "Free recommendations",
    pricing_line4:        "25% of verified monthly savings — billed only when savings are confirmed. Nothing upfront, nothing if you don't save.",
    pricing_cta:          "Get your free analysis →",
    pricing_trust:        "Trusted by independent brands across France, Spain and the UK.",

    /* footer */
    footer_tagline:       "Infrastructure Intelligence for independent brands.",
    footer_privacy:       "Privacy Policy",
    footer_terms:         "Terms of Service",
    footer_contact:       "Contact",
    footer_legal:         "© 2025 CAMBRA. All rights reserved.",

    /* analyzer — step 1 */
    az_step1_title:       "Tell us about your brand",
    az_step1_sub:         "We'll detect your infrastructure automatically — most brands are fully mapped in under 60 seconds.",
    field_brand_name:     "Brand name",
    field_website:        "Website URL",
    field_country:        "Country",
    field_revenue:        "Monthly revenue",
    field_category:       "Category (optional)",
    discovery_analyzing:  "Analysing {website}…",
    discovery_found:      "Found {n} tools in {time}s",
    revenue_under10k:     "Under €10k",
    revenue_10_50k:       "€10k–€50k",
    revenue_50_100k:      "€50k–€100k",
    revenue_100_500k:     "€100k–€500k",
    revenue_over500k:     "Over €500k",
    resume_title:         "Welcome back.",
    resume_sub:           "We found your previous session. Continue where you left off?",
    resume_continue:      "Continue",
    resume_fresh:         "Start fresh",

    /* analyzer — step 2 */
    az_step2_title:       "Here's what we found",
    az_step2_sub:         "We detected these tools on your website and payment data. Confirm what's correct.",
    detected_source_website: "Website",
    detected_source_stripe:  "Stripe",
    detected_source_saved:   "Saved",
    detected_source_manual:  "Manual",
    confidence_high:      "High confidence",
    confidence_medium:    "Medium confidence",
    confidence_low:       "Low confidence",
    add_manually:         "Anything missing? Add manually →",
    field_payment_provider: "Who processes your payments?",
    field_payment_fee:    "What % do you pay in payment fees?",
    field_shipments:      "How many orders do you ship per month?",
    field_shipping_cost:  "Monthly shipping cost?",
    field_saas_spend:     "How much do you spend on software tools monthly?",
    confirm_cta:          "Confirm my stack →",

    /* analyzer — step 3 */
    az_step3_title:       "Upgrade to verified",
    az_step3_sub:         "Connect Stripe to replace estimates with real payment data. Takes 30 seconds.",
    az_step3_connect:     "Connect Stripe",
    az_step3_skip:        "Continue with estimates — you can connect later",
    az_step3_verified:    "Payments upgraded to verified ✓",

    /* analyzer — progress */
    progress_mapping:         "Mapping your infrastructure…",
    progress_benchmarks:      "Loading benchmarks for {country} {tier}…",
    progress_payments:        "Calculating payment savings…",
    progress_shipping:        "Calculating shipping savings…",
    progress_saas:            "Calculating SaaS savings…",
    progress_recommendations: "Building your recommendations…",
    progress_ready:           "Your report is ready ✓",

    /* results */
    analysis_label:               "Infrastructure Analysis",
    hero_identified:              "/yr identified",
    hero_see_how:                 "See how to recover this →",
    hero_confidence_estimated:    "Estimated — connect Stripe to verify",
    hero_confidence_verified:     "Verified — based on real Stripe data",
    hero_confidence_mixed:        "Mixed — partially verified",
    payments_title:               "Payments",
    payments_your_rate:           "Your effective rate",
    payments_benchmark:           "Network benchmark",
    payments_reference:           "Reference rate",
    payments_opportunity:         "/yr opportunity",
    payments_cta:                 "Verify with Stripe →",
    payments_verified:            "Verified with Stripe ✓",
    shipping_title:               "Shipping",
    shipping_your_cost:           "Your avg cost",
    shipping_benchmark:           "Network benchmark",
    shipping_per_shipment:        "/shipment",
    shipping_opportunity:         "/yr opportunity",
    shipping_cta:                 "Add shipping data",
    saas_title:                   "SaaS & Tools",
    saas_monthly:                 "Monthly spend",
    saas_detected:                "{n} tools detected",
    saas_opportunity:             "/yr opportunity",
    saas_cta:                     "Review detected tools",
    infrastructure_title:         "Your infrastructure",
    infrastructure_sub:           "Tools detected across your stack",
    infrastructure_empty:         "Connect your tools to map your infrastructure",
    share:                        "Share this report",
    connect_more:                 "Connect more tools to improve accuracy",
    how_calculated:               "How we calculated this",
    private_note:                 "Data is private and never shared",
    benchmarked_against:          "Benchmarked against {n} anonymized brands in {country} at your revenue tier",
    based_on:                     "Analysis based on {country} {tier} benchmarks",

    /* dashboard */
    state_a_title:        "Map your infrastructure in 3 minutes",
    state_a_sub:          "Enter your website. CAMBRA automatically detects your payment providers, shipping carriers and SaaS tools — then benchmarks your costs against anonymized data from European brands at your revenue tier.",
    state_a_cta:          "Start free analysis →",
    state_b_badge:        "Estimated",
    state_b_sub:          "Based on your inputs and {country} {tier} benchmarks. Connect Stripe to verify with real data.",
    state_b_cta:          "Connect Stripe to verify →",
    state_c_badge:        "Verified ✓",
    state_c_sub:          "Based on your real Stripe data. Updated {date}.",
    savings_to_date:      "Savings to date",
    this_month:           "This month",
    identified_potential: "Identified potential",
    next_report:          "Next report: {date}",
    your_infrastructure:  "Your infrastructure",
    ai_insights:          "AI Insights",
    recommendations_ready:"{n} recommendations ready",
    review_approve:       "Review & Approve →",
    last_scan:            "Last scan: {time}",
    rescan:               "Re-scan now",
    scanning:             "Scanning…",
    no_trend_yet:         "Savings tracking will appear once your first monthly report is generated",

    /* connect tools */
    ct_page_title:        "Connect your infrastructure",
    ct_page_sub:          "Every connection improves your benchmark accuracy and savings confidence.",
    summary_detected:     "{n} tools detected",
    summary_connected:    "{n} connected",
    summary_available:    "{n} available",
    found_in_stripe:      "Found in Stripe — €{amount}/mo",
    detected_via:         "Detected via {source}",
    connect_to_verify:    "Connect to verify →",
    coming_soon:          "Coming soon",
    last_sync:            "Last sync: {time}",
    sync_now:             "Sync now",
    stripe_section:       "Payments",

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
    cat_fashion:          "Fashion",
    cat_beauty:           "Beauty",
    cat_food:             "Food & Beverage",
    cat_electronics:      "Electronics",
    cat_home:             "Home & Living",
    cat_sports:           "Sports & Outdoors",
    cat_health:           "Health & Wellness",
    cat_toys:             "Toys & Kids",
    cat_pets:             "Pets",
    cat_jewelry:          "Jewelry & Accessories",
    cat_books:            "Books & Media",
    cat_automotive:       "Automotive",
    cat_b2b:              "B2B & Wholesale",
    cat_other:            "Other",

    /* validation errors */
    error_revenue_required: "Monthly revenue is required.",
    error_revenue_negative: "Monthly revenue cannot be negative.",
    error_fee_range:        "Payment fee % must be between 0 and 15.",
    error_invalid_number:   "Please enter a valid number.",
    error_website_required: "Website URL is required.",
    error_country_required: "Country is required.",
    error_brand_required:   "Brand name is required.",
    please_fix:             "Please fix the following:",

    /* analyzer — extra UI strings */
    analyzing_your_infra: "Analyzing your infrastructure…",
    progress_title:       "Analyzing your infrastructure",
    your_region:          "your region",
    your_tier:            "your tier",
    found_tools_on_site:  "Found {n} tool{plural} on your site.",
    no_public_signals:    "No public signals detected — you'll add tools manually in the next step.",
    welcome_back:         "Welcome back.",
    continue_where:       "Continue where you left off? Last step: {step}",
    tools_detected_extra: " · {n} tools detected",
    continue_label:       "Continue",
    start_fresh:          "Start fresh",
    back_label:           "Back",
    run_analysis_cta:     "Run analysis",
    select_country:       "Select your country",
    select_provider:      "Select a provider",
    select_carrier:       "Select a carrier",
    field_shipping_provider: "How do you ship orders?",
    field_saas_tools:     "What software tools do you use?",
    field_banking_fees_label: "Banking fees (monthly)",
    physical_store_q:    "Do you have a physical store?",
    yes:                  "Yes",
    no:                   "No",
    in_store_gmv_q:       "Monthly in-store GMV?",
    in_store_fee_q:       "In-store transaction fee %?",
    terminal_rental_q:    "Monthly terminal rental?",
    your_brand_placeholder:"Your brand name",

    /* results — extras */
    no_results:           "No results found.",
    run_the_analyzer:     "Run the Analyzer",
    sign_in_required:     "Sign-in required",
    sign_in_sub:          "Open the login window and return automatically.",
    sign_in:              "Sign in",
    your_rate:            "Your rate",
    your_cost:            "Your cost",
    your_spend:           "Your spend",
    network_benchmark:    "Network benchmark",
    reference_rate:       "Reference rate",
    opportunity_label:    "Opportunity",
    per_shipment_short:   "shipment",
    per_mo_short:         "mo",
    per_yr_short:         "yr",
    pct_of_revenue:       "% of revenue",
    detected_tools:       "Detected tools",
    methodology_label:    "Methodology",
    assumptions_label:    "Assumptions",
    score_engine_label:   "Score engine",
    savings_model_label:  "Savings model",
    benchmarks_label:     "Benchmarks",
    calculated_label:     "Calculated",
    via_stripe:           "via Stripe",
    via_oauth:            "via connected account",
    via_website:          "via website",
    via_manual:           "manual",
    via_estimated:        "estimated",
    link_copied:          "Link copied",
    copy_failed:          "Copy failed",

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
    agent_shipping:       "Shipping Agent",
    agent_saas:           "SaaS Agent",
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
    just_now:             "just now",
    minutes_ago:          "{n}m ago",
    hours_ago:            "{n}h ago",
    days_ago:             "{n}d ago",

    /* FIX 1 — ConnectTools category labels */
    cat_payments:         "Payments",
    cat_commerce:         "Commerce",
    cat_banking:          "Banking",
    cat_shipping:         "Shipping",
    cat_marketing:        "Marketing",
    cat_finance:          "Finance",
    cat_support:          "Support",
    cat_hr:               "HR",
    cat_telecom:          "Telecom",
    cat_logistics:        "Logistics",
    cat_analytics:        "Analytics",

    /* FIX 2 — Dashboard strings */
    savings_trend:        "Savings Trend",
    monthly_savings:      "Monthly Savings",
    to_date:              "to date",
    no_deal_yet:          "Savings tracking starts once your first deal is activated",
    infrastructure_empty_dashboard: "Run the Analyzer to map your infrastructure",
    verified_with_stripe: "Verified with Stripe",
    connect_stripe_cta:   "Connect Stripe to verify →",
    start_analysis_cta:   "Start free analysis →",
    feature_detection:    "Automatic detection",
    feature_benchmark:    "Benchmark comparison",
    feature_savings:      "Savings calculation",

    /* FIX 4 — Toast keys */
    sync_success:         "Sync completed successfully",
    sync_error:           "Sync failed — please try again",
    connect_success:      "Connected successfully",
    connect_error:        "Connection failed — please try again",

    /* FIX 5 — Discovery empty state */
    discovery_empty:      "We couldn't detect any tools automatically. Add them manually below.",

    /* FIX 7 — Results static benchmark note */
    benchmark_static_note:"Benchmark based on CAMBRA reference data — network sample growing",
    benchmark_seed_note:"Benchmark from CAMBRA seeded reference cohort — not yet backed by network data",

    /* Login gate */
    login_gate_headline:    "Your infrastructure audit is ready.",
    login_gate_sub:         "Create a free account or sign in to see your results.",
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
  },

  fr: {
    meta_title:       "CAMBRA — Optimisation des Coûts d'Infrastructure pour Marques Indépendantes",
    meta_description: "CAMBRA compare vos frais de paiement, coûts d'expédition et dépenses SaaS avec plus de 400 marques européennes. Identifiez où vous payez trop et récupérez vos marges. Analyse gratuite.",

    nav_dashboard:    "Tableau de bord",
    nav_analyzer:     "Analyseur",
    nav_results:      "Résultats",
    nav_connect:      "Connecter",
    nav_deals:        "Deals",
    nav_reports:      "Rapports",
    nav_settings:     "Paramètres",
    nav_signout:      "Se déconnecter",
    nav_how:          "Comment ça marche",
    nav_pricing:      "Tarifs",
    nav_developers:   "Développeurs",
    nav_get_started:  "Commencer",

    badge:                "Intelligence des Coûts d'Infrastructure",
    hero_headline:        "Votre infrastructure vous coûte bien plus qu'elle ne le devrait.",
    hero_sub:             "CAMBRA compare vos frais de paiement, coûts d'expédition et dépenses SaaS avec des données anonymisées de marques indépendantes européennes — et vous montre exactement où vous payez trop. La plupart des marques identifient entre 10 000 € et 40 000 €/an de coûts récupérables.",
    hero_cta_primary:     "Analyser gratuitement →",
    hero_cta_secondary:   "Voir comment ça marche",
    hero_footnote:        "Sans carte bancaire. Sans engagement. Vous payez 25% des économies vérifiées uniquement.",

    problem_label:        "Le problème des coûts cachés",
    problem_headline:     "Les marques indépendantes paient 20 à 40 % de trop sur leur infrastructure. Chaque mois.",
    problem_card1_title:  "Paiements",
    problem_card1_body:   "La plupart des marques paient entre 2,2% et 2,8% de frais de paiement. Le taux optimisé pour votre volume est souvent entre 1,4% et 1,8%.",
    problem_card1_stat:   "8 400 €/an perdus en moyenne",
    problem_card2_title:  "Expédition",
    problem_card2_body:   "Les transporteurs facturent 15 à 30 % de plus aux marques sans pouvoir de négociation collectif.",
    problem_card2_stat:   "4 200 €/an perdus en moyenne",
    problem_card3_title:  "SaaS & Outils",
    problem_card3_body:   "La marque indépendante moyenne paye pour 3 à 4 outils logiciels redondants ou sous-utilisés.",
    problem_card3_stat:   "3 800 €/an perdus en moyenne",

    how_label:            "Comment ça marche",
    step1_title:          "Entrez votre site web",
    step1_desc:           "Nous détectons automatiquement vos prestataires de paiement, transporteurs, outils marketing et stack SaaS. Aucune configuration manuelle.",
    step2_title:          "Nous comparons vos coûts",
    step2_desc:           "Nous comparons vos taux effectifs avec des données anonymisées de marques européennes au même niveau de CA et dans la même zone géographique.",
    step3_title:          "Vous récupérez vos marges",
    step3_desc:           "Nous vous montrons l'écart, l'opportunité en euros par an, et comment la combler. La plupart des améliorations sont effectives en 5 jours ouvrés.",

    benchmark_label:      "Basé sur des données réelles",
    benchmark_headline:   "Construit sur des données anonymisées de marques indépendantes européennes.",
    benchmark_payments:   "Taux de paiement optimisé moyen de 1,7% pour les petites marques européennes",
    benchmark_shipping:   "Moyenne de 4,80€/colis pour les marques expédiant 500+ commandes/mois",
    benchmark_saas:       "Moyenne de 2,8% du CA en outils logiciels",
    benchmark_footnote:   "Tous les benchmarks sont anonymisés et agrégés entre marques. Aucune donnée individuelle n'est jamais exposée. Minimum 5 marques par cohorte.",

    pricing_headline:     "Commencez gratuitement. Payez uniquement sur les économies réalisées.",
    pricing_model:        "Honoraires au succès uniquement",
    pricing_line1:        "Analyse d'infrastructure gratuite",
    pricing_line2:        "Rapport de benchmark gratuit",
    pricing_line3:        "Recommandations gratuites",
    pricing_line4:        "25% des économies mensuelles vérifiées — facturé uniquement lorsque les économies sont confirmées. Rien en avance, rien si vous n'économisez pas.",
    pricing_cta:          "Obtenir votre analyse gratuite →",
    pricing_trust:        "Utilisé par des marques indépendantes en France, Espagne et au Royaume-Uni.",

    footer_tagline:       "Intelligence d'infrastructure pour marques indépendantes.",
    footer_privacy:       "Politique de confidentialité",
    footer_terms:         "Conditions d'utilisation",
    footer_contact:       "Contact",
    footer_legal:         "© 2025 CAMBRA. Tous droits réservés.",

    az_step1_title:       "Parlez-nous de votre marque",
    az_step1_sub:         "Nous détecterons automatiquement votre infrastructure — la plupart des marques sont entièrement cartographiées en moins de 60 secondes.",
    field_brand_name:     "Nom de la marque",
    field_website:        "Site web",
    field_country:        "Pays",
    field_revenue:        "Chiffre d'affaires mensuel",
    field_category:       "Catégorie (optionnel)",
    discovery_analyzing:  "Analyse de {website}…",
    discovery_found:      "{n} outils trouvés en {time}s",
    revenue_under10k:     "Moins de 10k€",
    revenue_10_50k:       "10k€–50k€",
    revenue_50_100k:      "50k€–100k€",
    revenue_100_500k:     "100k€–500k€",
    revenue_over500k:     "Plus de 500k€",
    resume_title:         "Bon retour.",
    resume_sub:           "Nous avons retrouvé votre session précédente. Continuer où vous en étiez ?",
    resume_continue:      "Continuer",
    resume_fresh:         "Recommencer",

    az_step2_title:       "Voici ce que nous avons trouvé",
    az_step2_sub:         "Nous avons détecté ces outils sur votre site web et vos données de paiement. Confirmez ce qui est correct.",
    detected_source_website: "Site web",
    detected_source_stripe:  "Stripe",
    detected_source_saved:   "Sauvegardé",
    detected_source_manual:  "Manuel",
    confidence_high:      "Haute confiance",
    confidence_medium:    "Confiance moyenne",
    confidence_low:       "Faible confiance",
    add_manually:         "Il manque quelque chose ? Ajouter manuellement →",
    field_payment_provider: "Qui traite vos paiements ?",
    field_payment_fee:    "Quel % payez-vous en frais de paiement ?",
    field_shipments:      "Combien de commandes expédiez-vous par mois ?",
    field_shipping_cost:  "Coût d'expédition mensuel ?",
    field_saas_spend:     "Combien dépensez-vous en outils logiciels par mois ?",
    confirm_cta:          "Confirmer mon stack →",

    az_step3_title:       "Passez en données vérifiées",
    az_step3_sub:         "Connectez Stripe pour remplacer les estimations par de vraies données de paiement. 30 secondes.",
    az_step3_connect:     "Connecter Stripe",
    az_step3_skip:        "Continuer avec les estimations — vous pouvez connecter plus tard",
    az_step3_verified:    "Paiements mis à jour en vérifié ✓",

    progress_mapping:         "Cartographie de votre infrastructure…",
    progress_benchmarks:      "Chargement des benchmarks pour {country} {tier}…",
    progress_payments:        "Calcul des économies sur les paiements…",
    progress_shipping:        "Calcul des économies sur l'expédition…",
    progress_saas:            "Calcul des économies sur les outils SaaS…",
    progress_recommendations: "Construction de vos recommandations…",
    progress_ready:           "Votre rapport est prêt ✓",

    analysis_label:               "Analyse d'infrastructure",
    hero_identified:              "/an identifié",
    hero_see_how:                 "Voir comment récupérer cela →",
    hero_confidence_estimated:    "Estimé — connectez Stripe pour vérifier",
    hero_confidence_verified:     "Vérifié — basé sur vos vraies données Stripe",
    hero_confidence_mixed:        "Mixte — partiellement vérifié",
    payments_title:               "Paiements",
    payments_your_rate:           "Votre taux effectif",
    payments_benchmark:           "Benchmark réseau",
    payments_reference:           "Taux de référence",
    payments_opportunity:         "/an d'opportunité",
    payments_cta:                 "Vérifier avec Stripe →",
    payments_verified:            "Vérifié avec Stripe ✓",
    shipping_title:               "Expédition",
    shipping_your_cost:           "Votre coût moyen",
    shipping_benchmark:           "Benchmark réseau",
    shipping_per_shipment:        "/envoi",
    shipping_opportunity:         "/an d'opportunité",
    shipping_cta:                 "Ajouter des données d'expédition",
    saas_title:                   "SaaS & Outils",
    saas_monthly:                 "Dépenses mensuelles",
    saas_detected:                "{n} outils détectés",
    saas_opportunity:             "/an d'opportunité",
    saas_cta:                     "Examiner les outils détectés",
    infrastructure_title:         "Votre infrastructure",
    infrastructure_sub:           "Outils détectés dans votre stack",
    infrastructure_empty:         "Connectez vos outils pour cartographier votre infrastructure",
    share:                        "Partager ce rapport",
    connect_more:                 "Connecter plus d'outils pour améliorer la précision",
    how_calculated:               "Comment nous avons calculé cela",
    private_note:                 "Vos données sont privées et ne sont jamais partagées",
    benchmarked_against:          "Comparé à {n} marques anonymisées en {country} à votre niveau de CA",
    based_on:                     "Analyse basée sur les benchmarks {country} {tier}",

    state_a_title:        "Cartographiez votre infrastructure en 3 minutes",
    state_a_sub:          "Entrez votre site web. CAMBRA détecte automatiquement vos prestataires de paiement, transporteurs et outils SaaS — puis compare vos coûts avec des données anonymisées de marques européennes à votre niveau de CA.",
    state_a_cta:          "Lancer l'analyse gratuite →",
    state_b_badge:        "Estimé",
    state_b_sub:          "Basé sur vos données et les benchmarks {country} {tier}. Connectez Stripe pour vérifier avec de vraies données.",
    state_b_cta:          "Connecter Stripe pour vérifier →",
    state_c_badge:        "Vérifié ✓",
    state_c_sub:          "Basé sur vos vraies données Stripe. Mis à jour le {date}.",
    savings_to_date:      "Économies à ce jour",
    this_month:           "Ce mois",
    identified_potential: "Potentiel identifié",
    next_report:          "Prochain rapport : {date}",
    your_infrastructure:  "Votre infrastructure",
    ai_insights:          "Insights IA",
    recommendations_ready:"{n} recommandations prêtes",
    review_approve:       "Examiner et approuver →",
    last_scan:            "Dernier scan : {time}",
    rescan:               "Rescanner maintenant",
    scanning:             "Scan en cours…",
    no_trend_yet:         "Le suivi des économies apparaîtra dès que votre premier rapport mensuel sera généré",

    ct_page_title:        "Connectez votre infrastructure",
    ct_page_sub:          "Chaque connexion améliore la précision de votre benchmark et la confiance dans vos économies.",
    summary_detected:     "{n} outils détectés",
    summary_connected:    "{n} connecté(s)",
    summary_available:    "{n} disponible(s)",
    found_in_stripe:      "Trouvé dans Stripe — {amount} €/mois",
    detected_via:         "Détecté via {source}",
    connect_to_verify:    "Connecter pour vérifier →",
    coming_soon:          "Bientôt disponible",
    last_sync:            "Dernière sync : {time}",
    sync_now:             "Synchroniser",
    stripe_section:       "Paiements",

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

    cat_fashion:          "Mode",
    cat_beauty:           "Beauté",
    cat_food:             "Alimentation & Boissons",
    cat_electronics:      "Électronique",
    cat_home:             "Maison & Déco",
    cat_sports:           "Sport & Plein air",
    cat_health:           "Santé & Bien-être",
    cat_toys:             "Jouets & Enfants",
    cat_pets:             "Animaux",
    cat_jewelry:          "Bijoux & Accessoires",
    cat_books:            "Livres & Médias",
    cat_automotive:       "Automobile",
    cat_b2b:              "B2B & Gros",
    cat_other:            "Autre",

    error_revenue_required: "Le chiffre d'affaires mensuel est requis.",
    error_revenue_negative: "Le chiffre d'affaires mensuel ne peut pas être négatif.",
    error_fee_range:        "Les frais de paiement doivent être compris entre 0 et 15%.",
    error_invalid_number:   "Veuillez saisir un nombre valide.",
    error_website_required: "L'URL du site web est requise.",
    error_country_required: "Le pays est requis.",
    error_brand_required:   "Le nom de la marque est requis.",
    please_fix:             "Veuillez corriger les points suivants :",

    analyzing_your_infra: "Analyse de votre infrastructure…",
    progress_title:       "Analyse de votre infrastructure",
    your_region:          "votre région",
    your_tier:            "votre niveau",
    found_tools_on_site:  "{n} outil{plural} trouvé{plural} sur votre site.",
    no_public_signals:    "Aucun signal public détecté — vous ajouterez les outils manuellement à l'étape suivante.",
    welcome_back:         "Bon retour.",
    continue_where:       "Continuer où vous en étiez ? Dernière étape : {step}",
    tools_detected_extra: " · {n} outils détectés",
    continue_label:       "Continuer",
    start_fresh:          "Recommencer",
    back_label:           "Retour",
    run_analysis_cta:     "Lancer l'analyse",
    select_country:       "Sélectionnez votre pays",
    select_provider:      "Sélectionnez un prestataire",
    select_carrier:       "Sélectionnez un transporteur",
    field_shipping_provider: "Comment expédiez-vous les commandes ?",
    field_saas_tools:     "Quels outils logiciels utilisez-vous ?",
    field_banking_fees_label: "Frais bancaires (mensuels)",
    physical_store_q:    "Avez-vous un magasin physique ?",
    yes:                  "Oui",
    no:                   "Non",
    in_store_gmv_q:       "CA mensuel en magasin ?",
    in_store_fee_q:       "Frais de transaction en magasin % ?",
    terminal_rental_q:    "Location mensuelle du terminal ?",
    your_brand_placeholder:"Le nom de votre marque",

    no_results:           "Aucun résultat trouvé.",
    run_the_analyzer:     "Lancer l'analyseur",
    sign_in_required:     "Connexion requise",
    sign_in_sub:          "Ouvrez la fenêtre de connexion et revenez automatiquement.",
    sign_in:              "Se connecter",
    your_rate:            "Votre taux",
    your_cost:            "Votre coût",
    your_spend:           "Vos dépenses",
    network_benchmark:    "Benchmark réseau",
    reference_rate:       "Taux de référence",
    opportunity_label:    "Opportunité",
    per_shipment_short:   "envoi",
    per_mo_short:         "mois",
    per_yr_short:         "an",
    pct_of_revenue:       "% du CA",
    detected_tools:       "Outils détectés",
    methodology_label:    "Méthodologie",
    assumptions_label:    "Hypothèses",
    score_engine_label:   "Moteur de score",
    savings_model_label:  "Modèle d'économies",
    benchmarks_label:     "Benchmarks",
    calculated_label:     "Calculé",
    via_stripe:           "via Stripe",
    via_oauth:            "via compte connecté",
    via_website:          "via site web",
    via_manual:           "manuel",
    via_estimated:        "estimé",
    link_copied:          "Lien copié",
    copy_failed:          "Échec de la copie",

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
    agent_shipping:       "Agent Expédition",
    agent_saas:           "Agent SaaS",
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
    just_now:             "à l'instant",
    minutes_ago:          "il y a {n} min",
    hours_ago:            "il y a {n} h",
    days_ago:             "il y a {n} j",

    /* FIX 1 — ConnectTools category labels */
    cat_payments:         "Paiements",
    cat_commerce:         "Commerce",
    cat_banking:          "Banque",
    cat_shipping:         "Expédition",
    cat_marketing:        "Marketing",
    cat_finance:          "Finance",
    cat_support:          "Support",
    cat_hr:               "Ressources Humaines",
    cat_telecom:          "Télécom",
    cat_logistics:        "Logistique",
    cat_analytics:        "Analytique",

    /* FIX 2 — Dashboard strings */
    savings_trend:        "Tendance des économies",
    monthly_savings:      "Économies mensuelles",
    to_date:              "à ce jour",
    no_deal_yet:          "Le suivi des économies démarre dès que votre premier deal est activé",
    infrastructure_empty_dashboard: "Lancez l'Analyseur pour cartographier votre infrastructure",
    verified_with_stripe: "Vérifié avec Stripe",
    connect_stripe_cta:   "Connecter Stripe pour vérifier →",
    start_analysis_cta:   "Lancer l'analyse gratuite →",
    feature_detection:    "Détection automatique",
    feature_benchmark:    "Comparaison benchmark",
    feature_savings:      "Calcul des économies",

    /* FIX 4 — Toast keys */
    sync_success:         "Synchronisation réussie",
    sync_error:           "Synchronisation échouée — veuillez réessayer",
    connect_success:      "Connexion réussie",
    connect_error:        "Connexion échouée — veuillez réessayer",

    /* FIX 5 — Discovery empty state */
    discovery_empty:      "Nous n'avons pas pu détecter d'outils automatiquement. Ajoutez-les manuellement ci-dessous.",

    /* FIX 7 — Results static benchmark note */
    benchmark_static_note:"Benchmark basé sur les données de référence CAMBRA — échantillon réseau en croissance",
    benchmark_seed_note:"Benchmark issu d'une cohorte de référence CAMBRA — pas encore adossé à des données réseau",

    /* Login gate */
    login_gate_headline:    "Votre audit d'infrastructure est prêt.",
    login_gate_sub:         "Créez un compte gratuit ou connectez-vous pour voir vos résultats.",
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
  },

  es: {
    meta_title:       "CAMBRA — Inteligencia de Costes de Infraestructura para Marcas Independientes",
    meta_description: "CAMBRA compara tus comisiones de pago, costes de envío y gasto en SaaS con más de 400 marcas europeas. Descubre dónde pagas de más y recupera tu margen automáticamente. Análisis gratuito.",

    nav_dashboard:    "Panel",
    nav_analyzer:     "Analizador",
    nav_results:      "Resultados",
    nav_connect:      "Conectar",
    nav_deals:        "Deals",
    nav_reports:      "Informes",
    nav_settings:     "Ajustes",
    nav_signout:      "Cerrar sesión",
    nav_how:          "Cómo funciona",
    nav_pricing:      "Precios",
    nav_developers:   "Desarrolladores",
    nav_get_started:  "Empezar",

    badge:                "Inteligencia de Costes de Infraestructura",
    hero_headline:        "Tu infraestructura te está costando más de lo que debería.",
    hero_sub:             "CAMBRA compara tus comisiones de pago, costes de envío y gasto en SaaS con datos anonimizados de marcas independientes europeas — y te muestra exactamente dónde estás pagando de más. La mayoría de marcas identifica entre 10.000 € y 40.000 €/año en costes recuperables.",
    hero_cta_primary:     "Analizar gratis →",
    hero_cta_secondary:   "Ver cómo funciona",
    hero_footnote:        "Sin tarjeta de crédito. Sin compromiso. Solo pagas el 25% de los ahorros verificados.",

    problem_label:        "El problema de los costes ocultos",
    problem_headline:     "Las marcas independientes pagan entre un 20% y un 40% de más en infraestructura. Cada mes.",
    problem_card1_title:  "Pagos",
    problem_card1_body:   "La mayoría de marcas paga entre el 2,2% y el 2,8% en comisiones de pago. La tarifa optimizada para tu volumen suele estar entre el 1,4% y el 1,8%.",
    problem_card1_stat:   "8.400 €/año perdidos de media",
    problem_card2_title:  "Envíos",
    problem_card2_body:   "Los transportistas cobran entre un 15% y un 30% más a las marcas sin poder de negociación colectivo.",
    problem_card2_stat:   "4.200 €/año perdidos de media",
    problem_card3_title:  "SaaS y Herramientas",
    problem_card3_body:   "La marca independiente media paga por 3 o 4 herramientas de software redundantes o infrautilizadas.",
    problem_card3_stat:   "3.800 €/año perdidos de media",

    how_label:            "Cómo funciona",
    step1_title:          "Introduce tu web",
    step1_desc:           "Detectamos automáticamente tus proveedores de pago, transportistas, herramientas de marketing y stack SaaS. Sin configuración manual.",
    step2_title:          "Comparamos tus costes",
    step2_desc:           "Comparamos tus tarifas efectivas con datos anonimizados de marcas europeas en el mismo nivel de facturación y geografía.",
    step3_title:          "Recuperas tu margen",
    step3_desc:           "Te mostramos la diferencia, la oportunidad en euros al año, y cómo cerrarla. La mayoría de mejoras están activas en 5 días laborables.",

    benchmark_label:      "Basado en datos reales",
    benchmark_headline:   "Construido sobre datos anonimizados de marcas independientes europeas.",
    benchmark_payments:   "Tasa de pago optimizada media del 1,7% para pequeñas marcas europeas",
    benchmark_shipping:   "Media de 4,80€/paquete para marcas con 500+ envíos/mes",
    benchmark_saas:       "Media del 2,8% de la facturación en herramientas de software",
    benchmark_footnote:   "Todos los benchmarks son anonimizados y agregados entre marcas. Ningún dato individual se expone jamás. Mínimo 5 marcas por cohorte.",

    pricing_headline:     "Empieza gratis. Paga solo cuando ahorres.",
    pricing_model:        "Solo honorarios de éxito",
    pricing_line1:        "Análisis de infraestructura gratuito",
    pricing_line2:        "Informe de benchmark gratuito",
    pricing_line3:        "Recomendaciones gratuitas",
    pricing_line4:        "25% de los ahorros mensuales verificados — facturado solo cuando los ahorros se confirman. Nada por adelantado, nada si no ahorras.",
    pricing_cta:          "Obtener tu análisis gratuito →",
    pricing_trust:        "Utilizado por marcas independientes en Francia, España y el Reino Unido.",

    footer_tagline:       "Inteligencia de infraestructura para marcas independientes.",
    footer_privacy:       "Política de privacidad",
    footer_terms:         "Términos de servicio",
    footer_contact:       "Contacto",
    footer_legal:         "© 2025 CAMBRA. Todos los derechos reservados.",

    az_step1_title:       "Cuéntanos sobre tu marca",
    az_step1_sub:         "Detectaremos tu infraestructura automáticamente — la mayoría de marcas quedan mapeadas en menos de 60 segundos.",
    field_brand_name:     "Nombre de la marca",
    field_website:        "URL del sitio web",
    field_country:        "País",
    field_revenue:        "Facturación mensual",
    field_category:       "Categoría (opcional)",
    discovery_analyzing:  "Analizando {website}…",
    discovery_found:      "{n} herramientas encontradas en {time}s",
    revenue_under10k:     "Menos de 10k€",
    revenue_10_50k:       "10k€–50k€",
    revenue_50_100k:      "50k€–100k€",
    revenue_100_500k:     "100k€–500k€",
    revenue_over500k:     "Más de 500k€",
    resume_title:         "Bienvenido de nuevo.",
    resume_sub:           "Encontramos tu sesión anterior. ¿Continuar donde lo dejaste?",
    resume_continue:      "Continuar",
    resume_fresh:         "Empezar de nuevo",

    az_step2_title:       "Esto es lo que encontramos",
    az_step2_sub:         "Detectamos estas herramientas en tu web y datos de pago. Confirma lo que es correcto.",
    detected_source_website: "Web",
    detected_source_stripe:  "Stripe",
    detected_source_saved:   "Guardado",
    detected_source_manual:  "Manual",
    confidence_high:      "Alta confianza",
    confidence_medium:    "Confianza media",
    confidence_low:       "Baja confianza",
    add_manually:         "¿Falta algo? Añadir manualmente →",
    field_payment_provider: "¿Quién procesa tus pagos?",
    field_payment_fee:    "¿Qué % pagas en comisiones de pago?",
    field_shipments:      "¿Cuántos pedidos envías al mes?",
    field_shipping_cost:  "¿Coste de envío mensual?",
    field_saas_spend:     "¿Cuánto gastas en herramientas de software al mes?",
    confirm_cta:          "Confirmar mi stack →",

    az_step3_title:       "Pasa a datos verificados",
    az_step3_sub:         "Conecta Stripe para sustituir las estimaciones por datos reales de pago. 30 segundos.",
    az_step3_connect:     "Conectar Stripe",
    az_step3_skip:        "Continuar con estimaciones — puedes conectar más tarde",
    az_step3_verified:    "Pagos actualizados a verificado ✓",

    progress_mapping:         "Mapeando tu infraestructura…",
    progress_benchmarks:      "Cargando benchmarks para {country} {tier}…",
    progress_payments:        "Calculando ahorros en pagos…",
    progress_shipping:        "Calculando ahorros en envíos…",
    progress_saas:            "Calculando ahorros en SaaS…",
    progress_recommendations: "Construyendo tus recomendaciones…",
    progress_ready:           "Tu informe está listo ✓",

    analysis_label:               "Análisis de infraestructura",
    hero_identified:              "/año identificado",
    hero_see_how:                 "Ver cómo recuperar esto →",
    hero_confidence_estimated:    "Estimado — conecta Stripe para verificar",
    hero_confidence_verified:     "Verificado — basado en tus datos reales de Stripe",
    hero_confidence_mixed:        "Mixto — parcialmente verificado",
    payments_title:               "Pagos",
    payments_your_rate:           "Tu tasa efectiva",
    payments_benchmark:           "Benchmark de red",
    payments_reference:           "Tasa de referencia",
    payments_opportunity:         "/año de oportunidad",
    payments_cta:                 "Verificar con Stripe →",
    payments_verified:            "Verificado con Stripe ✓",
    shipping_title:               "Envíos",
    shipping_your_cost:           "Tu coste medio",
    shipping_benchmark:           "Benchmark de red",
    shipping_per_shipment:        "/envío",
    shipping_opportunity:         "/año de oportunidad",
    shipping_cta:                 "Añadir datos de envío",
    saas_title:                   "SaaS y Herramientas",
    saas_monthly:                 "Gasto mensual",
    saas_detected:                "{n} herramientas detectadas",
    saas_opportunity:             "/año de oportunidad",
    saas_cta:                     "Revisar herramientas detectadas",
    infrastructure_title:         "Tu infraestructura",
    infrastructure_sub:           "Herramientas detectadas en tu stack",
    infrastructure_empty:         "Conecta tus herramientas para mapear tu infraestructura",
    share:                        "Compartir este informe",
    connect_more:                 "Conectar más herramientas para mejorar la precisión",
    how_calculated:               "Cómo lo hemos calculado",
    private_note:                 "Tus datos son privados y nunca se comparten",
    benchmarked_against:          "Comparado con {n} marcas anonimizadas en {country} en tu nivel de facturación",
    based_on:                     "Análisis basado en benchmarks {country} {tier}",

    state_a_title:        "Mapea tu infraestructura en 3 minutos",
    state_a_sub:          "Introduce tu web. CAMBRA detecta automáticamente tus proveedores de pago, transportistas y herramientas SaaS — y compara tus costes con datos anonimizados de marcas europeas en tu nivel de facturación.",
    state_a_cta:          "Iniciar análisis gratuito →",
    state_b_badge:        "Estimado",
    state_b_sub:          "Basado en tus datos y benchmarks {country} {tier}. Conecta Stripe para verificar con datos reales.",
    state_b_cta:          "Conectar Stripe para verificar →",
    state_c_badge:        "Verificado ✓",
    state_c_sub:          "Basado en tus datos reales de Stripe. Actualizado el {date}.",
    savings_to_date:      "Ahorros hasta la fecha",
    this_month:           "Este mes",
    identified_potential: "Potencial identificado",
    next_report:          "Próximo informe: {date}",
    your_infrastructure:  "Tu infraestructura",
    ai_insights:          "Insights de IA",
    recommendations_ready:"{n} recomendaciones listas",
    review_approve:       "Revisar y aprobar →",
    last_scan:            "Último análisis: {time}",
    rescan:               "Volver a analizar",
    scanning:             "Analizando…",
    no_trend_yet:         "El seguimiento de ahorros aparecerá cuando se genere tu primer informe mensual",

    ct_page_title:        "Conecta tu infraestructura",
    ct_page_sub:          "Cada conexión mejora la precisión de tu benchmark y la confianza en tus ahorros.",
    summary_detected:     "{n} herramientas detectadas",
    summary_connected:    "{n} conectada(s)",
    summary_available:    "{n} disponible(s)",
    found_in_stripe:      "Encontrado en Stripe — {amount} €/mes",
    detected_via:         "Detectado via {source}",
    connect_to_verify:    "Conectar para verificar →",
    coming_soon:          "Próximamente",
    last_sync:            "Última sync: {time}",
    sync_now:             "Sincronizar",
    stripe_section:       "Pagos",

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

    cat_fashion:          "Moda",
    cat_beauty:           "Belleza",
    cat_food:             "Alimentación & Bebidas",
    cat_electronics:      "Electrónica",
    cat_home:             "Hogar & Deco",
    cat_sports:           "Deporte & Aventura",
    cat_health:           "Salud & Bienestar",
    cat_toys:             "Juguetes & Niños",
    cat_pets:             "Mascotas",
    cat_jewelry:          "Joyería & Accesorios",
    cat_books:            "Libros & Medios",
    cat_automotive:       "Automoción",
    cat_b2b:              "B2B & Mayorista",
    cat_other:            "Otro",

    error_revenue_required: "La facturación mensual es obligatoria.",
    error_revenue_negative: "La facturación mensual no puede ser negativa.",
    error_fee_range:        "El % de comisión de pago debe estar entre 0 y 15.",
    error_invalid_number:   "Por favor introduce un número válido.",
    error_website_required: "La URL del sitio web es obligatoria.",
    error_country_required: "El país es obligatorio.",
    error_brand_required:   "El nombre de la marca es obligatorio.",
    please_fix:             "Por favor corrige lo siguiente:",

    analyzing_your_infra: "Analizando tu infraestructura…",
    progress_title:       "Analizando tu infraestructura",
    your_region:          "tu región",
    your_tier:            "tu nivel",
    found_tools_on_site:  "{n} herramienta{plural} encontrada{plural} en tu sitio.",
    no_public_signals:    "No se detectaron señales públicas — añadirás herramientas manualmente en el siguiente paso.",
    welcome_back:         "Bienvenido de nuevo.",
    continue_where:       "¿Continuar donde lo dejaste? Último paso: {step}",
    tools_detected_extra: " · {n} herramientas detectadas",
    continue_label:       "Continuar",
    start_fresh:          "Empezar de nuevo",
    back_label:           "Atrás",
    run_analysis_cta:     "Ejecutar análisis",
    select_country:       "Selecciona tu país",
    select_provider:      "Selecciona un proveedor",
    select_carrier:       "Selecciona un transportista",
    field_shipping_provider: "¿Cómo envías los pedidos?",
    field_saas_tools:     "¿Qué herramientas de software usas?",
    field_banking_fees_label: "Comisiones bancarias (mensuales)",
    physical_store_q:    "¿Tienes tienda física?",
    yes:                  "Sí",
    no:                   "No",
    in_store_gmv_q:       "¿GMV mensual en tienda?",
    in_store_fee_q:       "¿% de comisión de transacción en tienda?",
    terminal_rental_q:    "¿Alquiler mensual del terminal?",
    your_brand_placeholder:"El nombre de tu marca",

    no_results:           "No se encontraron resultados.",
    run_the_analyzer:     "Ejecutar el analizador",
    sign_in_required:     "Inicio de sesión requerido",
    sign_in_sub:          "Abre la ventana de inicio de sesión y regresa automáticamente.",
    sign_in:              "Iniciar sesión",
    your_rate:            "Tu tasa",
    your_cost:            "Tu coste",
    your_spend:           "Tu gasto",
    network_benchmark:    "Benchmark de red",
    reference_rate:       "Tasa de referencia",
    opportunity_label:    "Oportunidad",
    per_shipment_short:   "envío",
    per_mo_short:         "mes",
    per_yr_short:         "año",
    pct_of_revenue:       "% de facturación",
    detected_tools:       "Herramientas detectadas",
    methodology_label:    "Metodología",
    assumptions_label:    "Suposiciones",
    score_engine_label:   "Motor de puntuación",
    savings_model_label:  "Modelo de ahorros",
    benchmarks_label:     "Benchmarks",
    calculated_label:     "Calculado",
    via_stripe:           "via Stripe",
    via_oauth:            "via cuenta conectada",
    via_website:          "via sitio web",
    via_manual:           "manual",
    via_estimated:        "estimado",
    link_copied:          "Enlace copiado",
    copy_failed:          "Error al copiar",

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
    agent_shipping:       "Agente de Envíos",
    agent_saas:           "Agente SaaS",
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
    just_now:             "ahora mismo",
    minutes_ago:          "hace {n} min",
    hours_ago:            "hace {n} h",
    days_ago:             "hace {n} d",

    /* FIX 1 — ConnectTools category labels */
    cat_payments:         "Pagos",
    cat_commerce:         "Comercio",
    cat_banking:          "Banca",
    cat_shipping:         "Envíos",
    cat_marketing:        "Marketing",
    cat_finance:          "Finanzas",
    cat_support:          "Soporte",
    cat_hr:               "RRHH",
    cat_telecom:          "Telecom",
    cat_logistics:        "Logística",
    cat_analytics:        "Analítica",

    /* FIX 2 — Dashboard strings */
    savings_trend:        "Tendencia de ahorros",
    monthly_savings:      "Ahorros mensuales",
    to_date:              "hasta la fecha",
    no_deal_yet:          "El seguimiento de ahorros comienza cuando se activa tu primer deal",
    infrastructure_empty_dashboard: "Ejecuta el Analizador para mapear tu infraestructura",
    verified_with_stripe: "Verificado con Stripe",
    connect_stripe_cta:   "Conectar Stripe para verificar →",
    start_analysis_cta:   "Iniciar análisis gratuito →",
    feature_detection:    "Detección automática",
    feature_benchmark:    "Comparación de benchmark",
    feature_savings:      "Cálculo de ahorros",

    /* FIX 4 — Toast keys */
    sync_success:         "Sincronización completada",
    sync_error:           "Sincronización fallida — inténtalo de nuevo",
    connect_success:      "Conexión exitosa",
    connect_error:        "Conexión fallida — inténtalo de nuevo",

    /* FIX 5 — Discovery empty state */
    discovery_empty:      "No pudimos detectar ninguna herramienta automáticamente. Añádelas manualmente abajo.",

    /* FIX 7 — Results static benchmark note */
    benchmark_static_note:"Benchmark basado en datos de referencia CAMBRA — muestra de red en crecimiento",
    benchmark_seed_note:"Benchmark de cohorte de referencia CAMBRA — aún no respaldado por datos de red",

    /* Login gate */
    login_gate_headline:    "Tu auditoría de infraestructura está lista.",
    login_gate_sub:         "Crea una cuenta gratuita o inicia sesión para ver tus resultados.",
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