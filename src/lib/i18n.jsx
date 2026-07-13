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