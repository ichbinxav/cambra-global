// src/lib/helpCenterContent.js
//
// v59.1 (2026-08-05) — Help Center localized content (EN / FR / ES).
// ─────────────────────────────────────────────────────────────────────────
// This module holds ONLY localized strings. Structure (slugs, icons, accents,
// vertical mapping, retired slugs, filtering logic) lives in helpCenterData.js
// and consumes this content via accessor functions. The separation keeps a
// single copy of the behaviour and three copies of the copy, not the reverse.
//
// Language policy:
//  - Every localized value is an object { en, fr, es }. A missing key resolves
//    to the EN value via resolve() in helpCenterData.js — never to undefined,
//    never to a raw key, never to a rendered object.
//  - Proper names stay untranslated across all languages: CAMBRA, Analyzer,
//    Recover, Stripe, PayPal, Shopify Payments, Adyen, Mollie, Checkout.com,
//    SumUp, Stripe Terminal, Smile & Pay, Zettle.
//  - Terminology (per product guidance):
//      FR: paiements par carte · coûts d'acceptation · économies vérifiées ·
//          commission au succès · import de relevé · connexion en lecture
//          seule · TPE (in-store terminal).
//      ES: pagos con tarjeta · costes de aceptación · ahorro verificado ·
//          comisión de éxito · carga de extractos · conexión en solo
//          lectura · TPV (in-store terminal).
//  - Payments-first: no FR/ES translation reintroduces shipping, SaaS,
//    insurance, telecom, energy, banking, financing, CAMBRA Pro, Founding
//    period, membership, or unavailable connectors as active services. The
//    single "other cost categories" disclaimer uses generic "other
//    infrastructure categories" wording in FR/ES so no dormant vertical is
//    named, keeping the message clean and the test assertions unambiguous.
// ─────────────────────────────────────────────────────────────────────────

// ── UI strings (component chrome: headers, placeholders, CTAs, labels) ──
export const HELP_UI = {
  // CategoryGrid
  exploreTitle: {
    en: "Explore the knowledge base.",
    fr: "Explorez la base de connaissances.",
    es: "Explora la base de conocimiento.",
  },
  categoriesCount: {
    en: "{n} categories · Continuously updated",
    fr: "{n} catégories · Mises à jour en continu",
    es: "{n} categorías · Actualizado continuamente",
  },
  // HelpSearch
  searchPlaceholder: {
    en: "Ask anything about card payment costs…",
    fr: "Posez vos questions sur les coûts de paiement par carte…",
    es: "Pregunta lo que quieras sobre los costes de pago con tarjeta…",
  },
  trendingLabel: {
    en: "Trending searches",
    fr: "Recherches populaires",
    es: "Búsquedas populares",
  },
  browseCategories: {
    en: "Browse categories",
    fr: "Parcourir les catégories",
    es: "Explorar categorías",
  },
  noResults: {
    en: 'No results for "{q}"',
    fr: 'Aucun résultat pour « {q} »',
    es: 'Sin resultados para «{q}»',
  },
  noResultsHint: {
    en: "Try a different keyword, or {contact}.",
    fr: "Essayez un autre mot-clé, ou {contact}.",
    es: "Prueba con otra palabra clave, o {contact}.",
  },
  contactLink: {
    en: "contact CAMBRA",
    fr: "contacter CAMBRA",
    es: "contactar con CAMBRA",
  },
  poweredBy: {
    en: "Powered by CAMBRA Intelligence",
    fr: "Propulsé par CAMBRA Intelligence",
    es: "Impulsado por CAMBRA Intelligence",
  },
  escToClose: {
    en: "to close",
    fr: "pour fermer",
    es: "para cerrar",
  },
  // HelpHero
  heroBadge: {
    en: "Help Center · Infrastructure Intelligence",
    fr: "Centre d'aide · Intelligence d'infrastructure",
    es: "Centro de ayuda · Inteligencia de infraestructura",
  },
  heroTitleA: {
    en: "Questions, answers,",
    fr: "Questions, réponses,",
    es: "Preguntas, respuestas,",
  },
  heroTitleB: {
    en: "and operating insights.",
    fr: "et insights opérationnels.",
    es: "e insights operativos.",
  },
  heroSubtitle: {
    en: "CAMBRA helps modern commerce brands analyze card-payment costs, identify inefficiencies, benchmark performance, and unlock optimization opportunities.",
    fr: "CAMBRA aide les marques de commerce indépendantes à analyser leurs coûts d'acceptation, identifier les inefficiences, comparer leurs performances et débloquer des opportunités d'optimisation.",
    es: "CAMBRA ayuda a las marcas de comercio independiente a analizar sus costes de aceptación, identificar ineficiencias, comparar su rendimiento y desbloquear oportunidades de optimización.",
  },
  trendingLabelHero: {
    en: "Trending:",
    fr: "Tendances :",
    es: "Tendencias:",
  },
  openSearch: {
    en: "Open search",
    fr: "Ouvrir la recherche",
    es: "Abrir la búsqueda",
  },
  // PopularArticles
  popularLabel: {
    en: "Popular this week",
    fr: "Populaire cette semaine",
    es: "Popular esta semana",
  },
  popularTitle: {
    en: "What brands are asking.",
    fr: "Ce que demandent les marques.",
    es: "Lo que preguntan las marcas.",
  },
  readArticle: {
    en: "Read article",
    fr: "Lire l'article",
    es: "Leer artículo",
  },
  // HelpCTA
  stillExploring: {
    en: "Still exploring?",
    fr: "Encore en train d'explorer ?",
    es: "¿Aún explorando?",
  },
  pickPath: {
    en: "Pick the path that fits your stack",
    fr: "Choisissez le chemin adapté à votre stack",
    es: "Elige el camino que mejor encaje con tu stack",
  },
  runAnalyzer: {
    en: "Run the Analyzer",
    fr: "Lancer l'Analyzer",
    es: "Ejecutar el Analyzer",
  },
  runAnalyzerDesc: {
    en: "Audit your card-payment costs in under 3 minutes.",
    fr: "Auditez vos coûts d'acceptation en moins de 3 minutes.",
    es: "Audita tus costes de aceptación en menos de 3 minutos.",
  },
  uploadInvoices: {
    en: "Upload statements",
    fr: "Importer des relevés",
    es: "Cargar extractos",
  },
  uploadInvoicesDesc: {
    en: "CAMBRA extracts real card-payment economics from your statements.",
    fr: "CAMBRA extrait l'économie réelle de vos paiements par carte à partir de vos relevés.",
    es: "CAMBRA extrae la economía real de tus pagos con tarjeta a partir de tus extractos.",
  },
  connectTools: {
    en: "Connect tools",
    fr: "Connecter des outils",
    es: "Conectar herramientas",
  },
  connectToolsDesc: {
    en: "Read-only connection for the sharpest possible benchmarks.",
    fr: "Connexion en lecture seule pour les benchmarks les plus précis possibles.",
    es: "Conexión en solo lectura para los benchmarks más precisos posibles.",
  },
  talkToCambra: {
    en: "Talk to CAMBRA",
    fr: "Parler à CAMBRA",
    es: "Habla con CAMBRA",
  },
  talkToCambraDesc: {
    en: "Book onboarding or escalate an operational question.",
    fr: "Planifiez l'onboarding ou remontez une question opérationnelle.",
    es: "Agenda el onboarding o escala una pregunta operativa.",
  },
  // HelpCategory
  helpCenter: {
    en: "Help Center",
    fr: "Centre d'aide",
    es: "Centro de ayuda",
  },
  searchKnowledge: {
    en: "Search the knowledge base…",
    fr: "Rechercher dans la base de connaissances…",
    es: "Buscar en la base de conocimiento…",
  },
  articlesComingSoon: {
    en: "Articles for this category are coming soon.",
    fr: "Les articles de cette catégorie arrivent bientôt.",
    es: "Los artículos de esta categoría llegarán pronto.",
  },
  browseOrReach: {
    en: "In the meantime, browse other topics or reach out directly.",
    fr: "En attendant, parcourez les autres sujets ou contactez-nous directement.",
    es: "Mientras tanto, explora otros temas o contacta directamente.",
  },
  talkToCambraShort: {
    en: "Talk to CAMBRA",
    fr: "Parler à CAMBRA",
    es: "Habla con CAMBRA",
  },
  relatedTopics: {
    en: "Related topics",
    fr: "Sujets connexes",
    es: "Temas relacionados",
  },
  // FAQAccordion
  wasThisHelpful: {
    en: "Was this helpful?",
    fr: "Cet article était-il utile ?",
    es: "¿Te ha sido útil?",
  },
  yes: { en: "Yes", fr: "Oui", es: "Sí" },
  no: { en: "No", fr: "Non", es: "No" },
  thanks: { en: "Thanks", fr: "Merci", es: "Gracias" },
  // HelpHero rotating placeholders (6)
  heroPlaceholders: [
    {
      en: "How does CAMBRA estimate savings?",
      fr: "Comment CAMBRA estime-t-il les économies ?",
      es: "¿Cómo calcula CAMBRA el ahorro?",
    },
    {
      en: "Do you audit in-store card payments (TPV)?",
      fr: "Auditez-vous les paiements par carte en point de vente (TPE) ?",
      es: "¿Auditáis los pagos con tarjeta en tienda (TPV)?",
    },
    {
      en: "Can I upload statements?",
      fr: "Puis-je importer des relevés ?",
      es: "¿Puedo cargar extractos?",
    },
    {
      en: "How accurate are benchmarks?",
      fr: "Quelle est la précision des benchmarks ?",
      es: "¿Qué precisión tienen los benchmarks?",
    },
    {
      en: "Is my data confidential?",
      fr: "Mes données sont-elles confidentielles ?",
      es: "¿Mis datos son confidenciales?",
    },
    {
      en: "How does CAMBRA's commercial model work?",
      fr: "Comment fonctionne le modèle commercial de CAMBRA ?",
      es: "¿Cómo funciona el modelo comercial de CAMBRA?",
    },
  ],
  // HelpHero trending chips (5) — language-aware
  heroTrending: [
    { en: "In-store payments", fr: "Paiements en boutique", es: "Pagos en tienda" },
    { en: "Stripe", fr: "Stripe", es: "Stripe" },
    { en: "Benchmarks", fr: "Benchmarks", es: "Benchmarks" },
    { en: "GDPR", fr: "RGPD", es: "RGPD" },
    { en: "Success fee", fr: "Commission au succès", es: "Comisión de éxito" },
  ],
};

// ── Category localized content (title + description) keyed by slug ──
export const CATEGORY_CONTENT = {
  "getting-started": {
    title: { en: "Getting Started", fr: "Premiers pas", es: "Primeros pasos" },
    description: {
      en: "First steps with CAMBRA's card-payment cost audit.",
      fr: "Premiers pas avec l'audit des coûts d'acceptation CAMBRA.",
      es: "Primeros pasos con la auditoría de costes de aceptación de CAMBRA.",
    },
  },
  analyzer: {
    title: { en: "Card payment Analyzer", fr: "Analyzer de paiements par carte", es: "Analyzer de pagos con tarjeta" },
    description: {
      en: "How the Analyzer audits your card-payment costs.",
      fr: "Comment l'Analyzer audite vos coûts d'acceptation.",
      es: "Cómo el Analyzer audita tus costes de aceptación.",
    },
  },
  savings: {
    title: { en: "Savings & Optimization", fr: "Économies et optimisation", es: "Ahorro y optimización" },
    description: {
      en: "From detected gap to verified savings.",
      fr: "De l'écart détecté aux économies vérifiées.",
      es: "De la brecha detectada al ahorro verificado.",
    },
  },
  payments: {
    title: { en: "Card payments", fr: "Paiements par carte", es: "Pagos con tarjeta" },
    description: {
      en: "Online PSP and in-store TPV rates, fees, and benchmark logic.",
      fr: "Taux, frais et logique de benchmark des PSP en ligne et TPE en point de vente.",
      es: "Tasas, comisiones y lógica de benchmark de PSP online y TPV en tienda.",
    },
  },
  benchmarks: {
    title: { en: "Benchmarks & Methodology", fr: "Benchmarks et méthodologie", es: "Benchmarks y metodología" },
    description: {
      en: "Where the data comes from and how it's modeled.",
      fr: "D'où viennent les données et comment elles sont modélisées.",
      es: "De dónde provienen los datos y cómo se modelan.",
    },
  },
  integrations: {
    title: { en: "Connections & uploads", fr: "Connexions et imports", es: "Conexiones y cargas" },
    description: {
      en: "Connect Stripe (read-only) or upload statements from any provider.",
      fr: "Connectez Stripe (en lecture seule) ou importez des relevés de n'importe quel fournisseur.",
      es: "Conecta Stripe (en solo lectura) o carga extractos de cualquier proveedor.",
    },
  },
  uploads: {
    title: { en: "Statement uploads", fr: "Import de relevés", es: "Carga de extractos" },
    description: {
      en: "Upload provider statements for a verified analysis.",
      fr: "Importez les relevés de votre fournisseur pour une analyse vérifiée.",
      es: "Carga los extractos de tu proveedor para un análisis verificado.",
    },
  },
  security: {
    title: { en: "Data & Security", fr: "Données et sécurité", es: "Datos y seguridad" },
    description: {
      en: "Encryption, access, GDPR, and read-only guarantees.",
      fr: "Chiffrement, accès, RGPD et garanties en lecture seule.",
      es: "Cifrado, acceso, RGPD y garantías en solo lectura.",
    },
  },
  pricing: {
    title: { en: "Pricing & success fee", fr: "Tarifs et commission au succès", es: "Precios y comisión de éxito" },
    description: {
      en: "Free analysis, success fee only on verified savings.",
      fr: "Analyse gratuite, commission au succès uniquement sur les économies vérifiées.",
      es: "Análisis gratuito, comisión de éxito solo sobre el ahorro verificado.",
    },
  },
  troubleshooting: {
    title: { en: "Technical Troubleshooting", fr: "Résolution de problèmes techniques", es: "Resolución de problemas técnicos" },
    description: {
      en: "Resolve connection, upload, and data issues.",
      fr: "Résoudre les problèmes de connexion, d'import et de données.",
      es: "Resuelve problemas de conexión, carga y datos.",
    },
  },
  legal: {
    title: { en: "Legal & Compliance", fr: "Juridique et conformité", es: "Legal y cumplimiento" },
    description: {
      en: "Terms, privacy, mandates, and provider authorization.",
      fr: "Conditions, confidentialité, mandats et autorisation fournisseur.",
      es: "Condiciones, privacidad, mandatos y autorización de proveedores.",
    },
  },
};

// ── FAQ localized content. Order matches CATEGORIES structure in data module. ──
export const FAQ_CONTENT = [
  {
    category: "getting-started",
    title: { en: "About CAMBRA", fr: "À propos de CAMBRA", es: "Acerca de CAMBRA" },
    items: [
      {
        q: {
          en: "What is CAMBRA?",
          fr: "Qu'est-ce que CAMBRA ?",
          es: "¿Qué es CAMBRA?",
        },
        a: {
          en: "CAMBRA analyzes your card-payment costs — online (PSP) and in-store (TPV / physical terminal) — measures your effective rate against verifiable public benchmarks, and helps you recover what you're overpaying. Independent commerce brands typically overpay up to 40% on card processing without knowing it.",
          fr: "CAMBRA analyse vos coûts d'acceptation — en ligne (PSP) et en point de vente (TPE / terminal physique) — mesure votre taux effectif face à des benchmarks publics vérifiables, et vous aide à récupérer ce que vous surpayez. Les marques de commerce indépendantes surpaient généralement jusqu'à 40 % sur les paiements par carte sans le savoir.",
          es: "CAMBRA analiza tus costes de aceptación — online (PSP) y en tienda (TPV / terminal físico) — mide tu tasa efectiva frente a benchmarks públicos verificables y te ayuda a recuperar lo que pagas de más. Las marcas de comercio independiente suelen pagar de más hasta un 40 % en pagos con tarjeta sin saberlo.",
        },
      },
      {
        q: {
          en: "Who is CAMBRA built for?",
          fr: "Pour qui CAMBRA est-il conçu ?",
          es: "¿Para quién está hecho CAMBRA?",
        },
        a: {
          en: "Independent commerce brands — DTC, omnichannel, marketplace-led — typically between €500K and €50M annual revenue, where card-processing costs have grown faster than visibility. CAMBRA is designed for operators, founders and CFOs who suspect margin is leaking on payments but lack a structured way to prove it.",
          fr: "Les marques de commerce indépendantes — DTC, omnicanal, places de marché — généralement entre 500 K€ et 50 M€ de chiffre d'affaires annuel, là où les coûts d'acceptation ont augmenté plus vite que la visibilité. CAMBRA est conçu pour les opérationnels, fondateurs et directeurs financiers qui soupçonnent une fuite de marge sur les paiements par carte sans moyen structuré de la prouver.",
          es: "Marcas de comercio independiente — DTC, omnicanal, marketplaces — generalmente entre 500 K€ y 50 M€ de facturación anual, donde los costes de aceptación han crecido más rápido que la visibilidad. CAMBRA está diseñado para operadores, fundadores y CFOs que sospechan que se filtra margen en los pagos con tarjeta pero carecen de un medio estructurado para demostrarlo.",
        },
      },
      {
        q: {
          en: "What kinds of costs does CAMBRA analyze?",
          fr: "Quels types de coûts CAMBRA analyse-t-il ?",
          es: "¿Qué tipo de costes analiza CAMBRA?",
        },
        a: {
          en: "Card-payment costs, in both channels: online payments (Stripe, PayPal, Shopify Payments, Adyen, Mollie, Checkout.com, and other PSPs) and in-store terminal payments (SumUp, Stripe Terminal, Smile & Pay, Zettle, and traditional bank TPVs). Effective rates, interchange, scheme fees, cross-border uplift, fixed-fee drag, and terminal rental — every component of your all-in cost per transaction.",
          fr: "Les coûts d'acceptation, sur les deux canaux : paiements en ligne (Stripe, PayPal, Shopify Payments, Adyen, Mollie, Checkout.com et autres PSP) et paiements sur terminal en point de vente (SumUp, Stripe Terminal, Smile & Pay, Zettle et TPE bancaires traditionnels). Taux effectifs, interchange, frais de scheme, majoration transfrontalière, trainage des frais fixes et location de terminal — chaque composant de votre coût tout compris par transaction.",
          es: "Los costes de aceptación, en ambos canales: pagos online (Stripe, PayPal, Shopify Payments, Adyen, Mollie, Checkout.com y otros PSP) y pagos en terminal en tienda (SumUp, Stripe Terminal, Smile & Pay, Zettle y TPV bancarios tradicionales). Tasas efectivas, interchange, comisiones de scheme, recargo transfronterizo, arrastre de comisión fija y alquiler de terminal — cada componente de tu coste total por transacción.",
        },
      },
      {
        q: {
          en: "Does CAMBRA analyze other cost categories?",
          fr: "CAMBRA analyse-t-il d'autres catégories de coûts ?",
          es: "¿CAMBRA analiza otras categorías de costes?",
        },
        a: {
          en: "Not today. CAMBRA starts with card payments — that is the first infrastructure category we audit end-to-end. Shipping, SaaS, insurance, telecom, energy, banking and financing are part of the long-term vision but are not currently available. Additional categories may be introduced only after they are validated to the same evidence standard.",
          // v59.1 — FR/ES use generic "other infrastructure categories" wording so no
          // dormant vertical is named in a non-EN language (payments-first cleanliness).
          fr: "Pas aujourd'hui. CAMBRA commence par les paiements par carte — c'est la première catégorie d'infrastructure que nous auditons de bout en bout. D'autres catégories d'infrastructure font partie de la vision long terme mais ne sont pas disponibles actuellement. De nouvelles catégories pourraient être introduites uniquement après avoir été validées selon le même standard de preuve.",
          es: "Hoy no. CAMBRA empieza por los pagos con tarjeta — es la primera categoría de infraestructura que auditamos de principio a fin. Otras categorías de infraestructura forman parte de la visión a largo plazo pero no están disponibles actualmente. Solo se podrían introducir nuevas categorías tras ser validadas con el mismo estándar de evidencia.",
        },
      },
      {
        q: {
          en: "Is CAMBRA a procurement platform?",
          fr: "CAMBRA est-il une plateforme d'achat ?",
          es: "¿Es CAMBRA una plataforma de compras?",
        },
        a: {
          en: "No. CAMBRA is an intelligence and audit layer for card-payment costs. Procurement is downstream — we focus on visibility, benchmarking, and surfacing optimization opportunities. Acting on them is a separate step, fully under your control.",
          fr: "Non. CAMBRA est une couche d'intelligence et d'audit des coûts d'acceptation. Les achats sont en aval — nous nous concentrons sur la visibilité, le benchmark et la détection d'opportunités d'optimisation. Passer à l'action est une étape distincte, entièrement sous votre contrôle.",
          es: "No. CAMBRA es una capa de inteligencia y auditoría de los costes de aceptación. Las compras son una fase posterior — nos centramos en la visibilidad, el benchmark y la detección de oportunidades de optimización. Actuar sobre ellas es un paso aparte, totalmente bajo tu control.",
        },
      },
      {
        q: {
          en: "Is CAMBRA replacing my payment provider?",
          fr: "CAMBRA remplace-t-il mon fournisseur de paiement ?",
          es: "¿CAMBRA sustituye a mi proveedor de pago?",
        },
        a: {
          en: "Not necessarily. Most optimizations happen by renegotiating with your current provider using benchmark evidence. Switching is one option among many — CAMBRA's job is to show you the full picture, not push a specific outcome.",
          fr: "Pas nécessairement. La plupart des optimisations passent par une renégociation avec votre fournisseur actuel à l'aide de preuves de benchmark. Changer de fournisseur est une option parmi d'autres — le rôle de CAMBRA est de vous montrer la situation complète, pas de pousser un résultat précis.",
          es: "No necesariamente. La mayoría de las optimizaciones se logran renegociando con tu proveedor actual usando evidencia de benchmark. Cambiar de proveedor es una opción entre muchas — el trabajo de CAMBRA es mostrarte la imagen completa, no empujar un resultado concreto.",
        },
      },
      {
        q: {
          en: "Why do modern brands overpay for card payments?",
          fr: "Pourquoi les marques modernes surpaient-elles les paiements par carte ?",
          es: "¿Por qué las marcas modernas pagan de más por los pagos con tarjeta?",
        },
        a: {
          en: "Three reasons: pricing opacity, benchmark blindness, and contract drift. Providers rarely volunteer better terms. Without comparable peer data, brands can't tell what 'fair' looks like. And contracts set at launch rarely get re-audited as volumes grow. CAMBRA solves all three for card payments.",
          fr: "Trois raisons : l'opacité des tarifs, l'aveuglement face aux benchmarks et la dérive des contrats. Les fournisseurs proposent rarement de meilleures conditions de leur propre chef. Sans données peers comparables, les marques ne savent pas à quoi ressemble un tarif « juste ». Et les contrats signés au lancement sont rarement ré-audités à mesure que les volumes croissent. CAMBRA résout ces trois points pour les paiements par carte.",
          es: "Por tres motivos: opacidad de precios, ceguera frente a los benchmarks y deriva de contratos. Los proveedores rara vez ofrecen mejores condiciones por iniciativa propia. Sin datos comparables de pares, las marcas no saben qué es un precio «justo». Y los contratos firmados al inicio rara vez se reauditan a medida que crecen los volúmenes. CAMBRA resuelve los tres para los pagos con tarjeta.",
        },
      },
      {
        q: {
          en: "What makes CAMBRA different from consultants?",
          fr: "Qu'est-ce qui distingue CAMBRA des consultants ?",
          es: "¿Qué diferencia a CAMBRA de los consultores?",
        },
        a: {
          en: "Consultants are episodic, expensive, and inconsistent. CAMBRA is continuous, data-driven, and built on benchmark intelligence — not opinions. The Analyzer runs in minutes, not months, and stays in place to monitor your card-payment costs going forward.",
          fr: "Les consultants sont épisodiques, coûteux et incohérents. CAMBRA est continu, piloté par les données et fondé sur l'intelligence de benchmark — pas sur des opinions. L'Analyzer tourne en quelques minutes, pas en mois, et reste en place pour surveiller vos coûts d'acceptation dans la durée.",
          es: "Los consultores son episódicos, caros e inconsistentes. CAMBRA es continuo, basado en datos y construido sobre inteligencia de benchmark — no de opiniones. El Analyzer se ejecuta en minutos, no en meses, y permanece para monitorizar tus costes de aceptación a futuro.",
        },
      },
    ],
  },
  {
    category: "analyzer",
    title: { en: "Card payment Analyzer", fr: "Analyzer de paiements par carte", es: "Analyzer de pagos con tarjeta" },
    items: [
      {
        q: {
          en: "What is the Payments Analyzer?",
          fr: "Qu'est-ce que l'Analyzer de paiements ?",
          es: "¿Qué es el Analyzer de pagos?",
        },
        a: {
          en: "The Analyzer is CAMBRA's core engine. It audits your card-payment cost structure — online, in-store, or both — benchmarks it against verifiable public pricing for comparable providers, and produces a per-channel gap in basis points plus an estimated monthly and annual savings range. Typically under 60 seconds.",
          fr: "L'Analyzer est le moteur central de CAMBRA. Il audite la structure de vos coûts d'acceptation — en ligne, en point de vente, ou les deux — la compare aux tarifs publics vérifiables de fournisseurs comparables, et produit un écart par canal en points de base plus une estimation mensuelle et annuelle des économies. Généralement en moins de 60 secondes.",
          es: "El Analyzer es el motor central de CAMBRA. Audita la estructura de tus costes de aceptación — online, en tienda o ambos — la compara con precios públicos verificables de proveedores comparables, y produce una brecha por canal en puntos básicos más una estimación mensual y anual de ahorro. Normalmente en menos de 60 segundos.",
        },
      },
      {
        q: {
          en: "How does the Analyzer work?",
          fr: "Comment fonctionne l'Analyzer ?",
          es: "¿Cómo funciona el Analyzer?",
        },
        a: {
          en: "You answer a short sequence about your monthly GMV, average ticket, provider, country, and cross-border share. CAMBRA combines those inputs with public provider pricing (Stripe, PayPal, Shopify Payments, SumUp, Stripe Terminal, and others we've verified) to estimate the gap between what you pay today and what your cohort's floor rate is.",
          fr: "Vous répondez à une courte série de questions sur votre TMV mensuel, votre ticket moyen, votre fournisseur, votre pays et votre part transfrontalière. CAMBRA combine ces données avec les tarifs publics des fournisseurs (Stripe, PayPal, Shopify Payments, SumUp, Stripe Terminal et d'autres que nous avons vérifiés) pour estimer l'écart entre ce que vous payez aujourd'hui et le taux plancher de votre cohorte.",
          es: "Respondes a una breve secuencia sobre tu GMV mensual, ticket medio, proveedor, país y porcentaje transfronterizo. CAMBRA combina esos datos con los precios públicos de los proveedores (Stripe, PayPal, Shopify Payments, SumUp, Stripe Terminal y otros que hemos verificado) para estimar la brecha entre lo que pagas hoy y la tasa mínima de tu cohorte.",
        },
      },
      {
        q: {
          en: "What is analyzed?",
          fr: "Qu'est-ce qui est analysé ?",
          es: "¿Qué se analiza?",
        },
        a: {
          en: "Your effective processing rate (%), fixed-fee drag amortized against your real ticket size, cross-border uplift on the international portion of your GMV, terminal rental for in-store channels, and the composition of achievable rates (interchange + scheme fees + processor margin). Each channel — online and in-store — is benchmarked independently against the appropriate verified provider row.",
          fr: "Votre taux effectif de traitement (%), le trainage des frais fixes amorti sur votre ticket moyen réel, la majoration transfrontalière sur la part internationale de votre TMV, la location de terminal pour les canaux en point de vente, et la composition des taux atteignables (interchange + frais de scheme + marge processeur). Chaque canal — en ligne et en point de vente — est comparé indépendamment à la ligne de fournisseur vérifiée appropriée.",
          es: "Tu tasa efectiva de procesamiento (%), el arrastre de comisión fija amortizado sobre tu ticket medio real, el recargo transfronterizo sobre la parte internacional de tu GMV, el alquiler de terminal para canales en tienda y la composición de las tasas alcanzables (interchange + comisiones de scheme + margen del procesador). Cada canal — online y en tienda — se compara de forma independiente con la fila de proveedor verificada correspondiente.",
        },
      },
      {
        q: {
          en: "How accurate are estimates?",
          fr: "Quelle est la précision des estimations ?",
          es: "¿Qué precisión tienen las estimaciones?",
        },
        a: {
          en: "Accuracy scales with the data you provide. Manual inputs produce a reliable directional estimate. Adding uploaded statements or a connected Stripe account tightens the range significantly. CAMBRA always shows you the confidence level of each finding.",
          fr: "La précision augmente avec les données fournies. Des saisies manuelles produisent une estimation directionnelle fiable. Ajouter des relevés importés ou un compte Stripe connecté resserre significativement la fourchette. CAMBRA indique toujours le niveau de confiance de chaque résultat.",
          es: "La precisión crece con los datos que aportas. Las entradas manuales producen una estimación direccional fiable. Añadir extractos cargados o una cuenta Stripe conectada estrecha el rango de forma significativa. CAMBRA muestra siempre el nivel de confianza de cada hallazgo.",
        },
      },
      {
        q: {
          en: "Why does CAMBRA ask these questions?",
          fr: "Pourquoi CAMBRA pose-t-il ces questions ?",
          es: "¿Por qué CAMBRA hace estas preguntas?",
        },
        a: {
          en: "Every question maps to a benchmark dimension. Revenue tier determines pricing leverage. Channel mix shifts which costs matter. Geography affects rates. The questionnaire is intentionally minimal — every field exists because it changes the analysis.",
          fr: "Chaque question correspond à une dimension du benchmark. Le palier de revenu détermine le levier tarifaire. Le mix de canaux modifie les coûts pertinents. La géographie influe sur les taux. Le questionnaire est volontairement minimal — chaque champ existe parce qu'il modifie l'analyse.",
          es: "Cada pregunta corresponde a una dimensión del benchmark. El tramo de ingresos determina la capacidad de negociación. El mix de canales cambia qué costes importan. La geografía afecta a las tasas. El cuestionario es deliberadamente mínimo — cada campo existe porque cambia el análisis.",
        },
      },
      {
        q: {
          en: "Can I edit information later?",
          fr: "Puis-je modifier mes informations plus tard ?",
          es: "¿Puedo editar la información más adelante?",
        },
        a: {
          en: "Yes. Every analysis is stored and can be refined as you connect Stripe, upload statements, or update inputs. The Analyzer is designed to evolve with your business.",
          fr: "Oui. Chaque analyse est conservée et peut être affinée à mesure que vous connectez Stripe, importez des relevés ou mettez à jour vos données. L'Analyzer est conçu pour évoluer avec votre activité.",
          es: "Sí. Cada análisis se guarda y puede refinarse a medida que conectas Stripe, cargas extractos o actualizas los datos. El Analyzer está diseñado para evolucionar con tu negocio.",
        },
      },
    ],
  },
  {
    category: "savings",
    title: { en: "Savings & Optimization", fr: "Économies et optimisation", es: "Ahorro y optimización" },
    items: [
      {
        q: {
          en: "How does CAMBRA estimate savings?",
          fr: "Comment CAMBRA estime-t-il les économies ?",
          es: "¿Cómo calcula CAMBRA el ahorro?",
        },
        a: {
          en: "By computing the gap between your current card-payment cost and the benchmark for your tier, applied to your real volumes. Estimates are conservative by design — we'd rather underpromise and overdeliver.",
          fr: "En calculant l'écart entre votre coût d'acceptation actuel et le benchmark de votre palier, appliqué à vos volumes réels. Les estimations sont conservatoires par conception — nous préférons sous-promettre et sur-livrer.",
          es: "Calculando la brecha entre tu coste de aceptación actual y el benchmark de tu tramo, aplicado a tus volúmenes reales. Las estimaciones son conservadoras por diseño — preferimos prometer menos y entregar más.",
        },
      },
      {
        q: {
          en: "Are savings guaranteed?",
          fr: "Les économies sont-elles garanties ?",
          es: "¿Está garantizado el ahorro?",
        },
        a: {
          en: "No platform can honestly guarantee savings sight-unseen. What CAMBRA guarantees is the analysis: structured, benchmarked, evidence-based, and ready to act on. Actual realized savings depend on execution.",
          fr: "Aucune plateforme ne peut honnêtement garantir des économies à l'aveugle. Ce que CAMBRA garantit, c'est l'analyse : structurée, comparée, fondée sur des preuves et prête à exploiter. Les économies réellement réalisées dépendent de l'exécution.",
          es: "Ninguna plataforma puede garantizar ahorro a ciegas de forma honesta. Lo que CAMBRA garantiza es el análisis: estructurado, con benchmark, basado en evidencia y listo para actuar. El ahorro realmente realizado depende de la ejecución.",
        },
      },
      {
        q: {
          en: "What happens after analysis?",
          fr: "Que se passe-t-il après l'analyse ?",
          es: "¿Qué ocurre tras el análisis?",
        },
        a: {
          en: "You receive a structured report: your per-channel effective rate, the benchmark for your cohort, the gap in basis points, and an estimated monthly and annual savings range. From there you can act independently on your provider, or use CAMBRA's recovery workflows.",
          fr: "Vous recevez un rapport structuré : votre taux effectif par canal, le benchmark de votre cohorte, l'écart en points de base et une estimation mensuelle et annuelle des économies. Vous pouvez ensuite agir de façon autonome auprès de votre fournisseur, ou utiliser les workflows de récupération de CAMBRA.",
          es: "Recibes un informe estructurado: tu tasa efectiva por canal, el benchmark de tu cohorte, la brecha en puntos básicos y una estimación mensual y anual de ahorro. Desde ahí puedes actuar de forma independiente con tu proveedor, o usar los flujos de recuperación de CAMBRA.",
        },
      },
      {
        q: {
          en: "What is CAMBRA's success fee?",
          fr: "Quelle est la commission au succès de CAMBRA ?",
          es: "¿Cuál es la comisión de éxito de CAMBRA?",
        },
        a: {
          en: "When CAMBRA helps activate an optimization that produces verified savings, we share in those savings — 25% of the verified monthly delta over a 24-month agreement, only on results that materialize. No savings, no fee.",
          fr: "Quand CAMBRA aide à activer une optimisation qui produit des économies vérifiées, nous partageons ces économies — 25 % du delta mensuel vérifié sur un accord de 24 mois, uniquement sur les résultats qui se matérialisent. Pas d'économies, pas de commission.",
          es: "Cuando CAMBRA ayuda a activar una optimización que produce ahorro verificado, compartimos ese ahorro — el 25 % del delta mensual verificado durante un acuerdo de 24 meses, solo sobre resultados que se materialicen. Sin ahorro, no hay comisión.",
        },
      },
      {
        q: {
          en: "Do I pay upfront?",
          fr: "Dois-je payer à l'avance ?",
          es: "¿Pago por adelantado?",
        },
        a: {
          en: "No. The Analyzer, benchmarks, and gap reports are free during early access. Recovery workflows are activated on a success-fee basis only when verified savings are recovered.",
          fr: "Non. L'Analyzer, les benchmarks et les rapports d'écart sont gratuits pendant l'accès anticipé. Les workflows de récupération sont activés sur la base d'une commission au succès uniquement lorsque des économies vérifiées sont récupérées.",
          es: "No. El Analyzer, los benchmarks y los informes de brecha son gratuitos durante el acceso anticipado. Los flujos de recuperación se activan con comisión de éxito solo cuando se recupera ahorro verificado.",
        },
      },
      {
        q: {
          en: "What if no savings are found?",
          fr: "Que se passe-t-il si aucune économie n'est trouvée ?",
          es: "¿Qué pasa si no se encuentra ahorro?",
        },
        a: {
          en: "You still walk away with a benchmarked picture of your card-payment costs and a clear read on where you stand vs. your cohort's floor rate. That visibility is the foundation of every future negotiation.",
          fr: "Vous repartez tout de même avec une image comparée de vos coûts d'acceptation et une lecture claire de votre position face au taux plancher de votre cohorte. Cette visibilité est la base de toute négociation future.",
          es: "Aun así te llevas una imagen con benchmark de tus costes de aceptación y una lectura clara de dónde estás frente a la tasa mínima de tu cohorte. Esa visibilidad es la base de toda negociación futura.",
        },
      },
      {
        q: {
          en: "Can CAMBRA optimize existing provider contracts?",
          fr: "CAMBRA peut-il optimiser des contrats fournisseurs existants ?",
          es: "¿Puede CAMBRA optimizar contratos existentes con proveedores?",
        },
        a: {
          en: "Yes — and most optimizations do exactly that. Renegotiation against benchmark evidence is faster, less disruptive, and often more impactful than switching.",
          fr: "Oui — et la plupart des optimisations font exactement cela. La renégociation sur la base de preuves de benchmark est plus rapide, moins perturbante et souvent plus impactante qu'un changement de fournisseur.",
          es: "Sí — y la mayoría de las optimizaciones hacen precisamente eso. Renegociar con evidencia de benchmark es más rápido, menos disruptivo y a menudo más impactante que cambiar de proveedor.",
        },
      },
    ],
  },
  {
    category: "benchmarks",
    title: { en: "Benchmarks & Methodology", fr: "Benchmarks et méthodologie", es: "Benchmarks y metodología" },
    items: [
      {
        q: {
          en: "Where do benchmark ranges come from?",
          fr: "D'où viennent les fourchettes de benchmark ?",
          es: "¿De dónde provienen los rangos de benchmark?",
        },
        a: {
          en: "CAMBRA maintains proprietary benchmark datasets built from anonymized analyzer data, public provider pricing verified against each provider's pricing page, and regulatory interchange floors — segmented by revenue tier, geography, and channel mix.",
          fr: "CAMBRA maintient des jeux de données de benchmark propriétaires, construits à partir de données d'analyse anonymisées, de tarifs publics de fournisseurs vérifiés contre la page de tarification de chacun, et de planchers d'interchange réglementaires — segmentés par palier de revenu, géographie et mix de canaux.",
          es: "CAMBRA mantiene conjuntos de datos de benchmark propios, construidos a partir de datos de análisis anonimizados, precios públicos de proveedores verificados contra la página de tarifas de cada uno, y suelos de interchange regulatorios — segmentados por tramo de ingresos, geografía y mix de canales.",
        },
      },
      {
        q: {
          en: "How often are benchmarks updated?",
          fr: "À quelle fréquence les benchmarks sont-ils mis à jour ?",
          es: "¿Con qué frecuencia se actualizan los benchmarks?",
        },
        a: {
          en: "Continuously. As more brands run analyses and connect data, the benchmark dataset tightens. Major revisions are published quarterly.",
          fr: "En continu. À mesure que davantage de marques lancent des analyses et connectent des données, le jeu de benchmark s'affine. Les révisions majeures sont publiées trimestriellement.",
          es: "De forma continua. A medida que más marcas ejecutan análisis y conectan datos, el conjunto de benchmark se afina. Las revisiones mayores se publican trimestralmente.",
        },
      },
      {
        q: {
          en: "Are benchmarks anonymized?",
          fr: "Les benchmarks sont-ils anonymisés ?",
          es: "¿Los benchmarks están anonimizados?",
        },
        a: {
          en: "Yes — always. Individual brand data is never exposed. Benchmarks are aggregated statistical models, designed to be useful without ever being identifying.",
          fr: "Oui — toujours. Les données individuelles d'une marque ne sont jamais exposées. Les benchmarks sont des modèles statistiques agrégés, conçus pour être utiles sans jamais être identifiants.",
          es: "Sí — siempre. Los datos individuales de una marca nunca se exponen. Los benchmarks son modelos estadísticos agregados, diseñados para ser útiles sin ser nunca identificativos.",
        },
      },
      {
        q: {
          en: "How does CAMBRA compare businesses?",
          fr: "Comment CAMBRA compare-t-il les entreprises ?",
          es: "¿Cómo compara CAMBRA empresas?",
        },
        a: {
          en: "By revenue tier, geography, and channel mix. Two brands at the same scale but with different channel mixes are benchmarked differently — because their card-payment economics are different.",
          fr: "Par palier de revenu, géographie et mix de canaux. Deux marques de même échelle mais avec un mix de canaux différent sont comparées différemment — parce que l'économie de leurs paiements par carte est différente.",
          es: "Por tramo de ingresos, geografía y mix de canales. Dos marcas del mismo tamaño pero con distinto mix de canales se comparan de forma diferente — porque la economía de sus pagos con tarjeta es distinta.",
        },
      },
      {
        q: {
          en: "What is considered an optimized card-payment cost?",
          fr: "Qu'est-ce qu'un coût d'acceptation optimisé ?",
          es: "¿Qué se considera un coste de aceptación optimizado?",
        },
        a: {
          en: "An effective rate within the top quartile of your peer group, no avoidable fixed-fee drag, cross-border uplift right-sized to your actual international volume, and terminal rental eliminated where a modern TPV allows it. Most brands aren't there yet — and that's the point.",
          fr: "Un taux effectif dans le premier quartile de votre groupe de pairs, sans trainage évitable des frais fixes, une majoration transfrontalière ajustée à votre volume international réel, et une location de terminal éliminée quand un TPE moderne le permet. La plupart des marques n'en sont pas là — c'est tout l'enjeu.",
          es: "Una tasa efectiva en el primer cuartil de tu grupo de pares, sin arrastre evitable de comisión fija, un recargo transfronterizo ajustado a tu volumen internacional real y un alquiler de terminal eliminado cuando un TPV moderno lo permite. La mayoría de las marcas aún no está ahí — y de eso se trata.",
        },
      },
    ],
  },
  {
    category: "payments",
    title: { en: "Card payments", fr: "Paiements par carte", es: "Pagos con tarjeta" },
    items: [
      {
        q: {
          en: "What payment costs does CAMBRA analyze?",
          fr: "Quels coûts de paiement CAMBRA analyse-t-il ?",
          es: "¿Qué costes de pago analiza CAMBRA?",
        },
        a: {
          en: "Effective processing rates, interchange and scheme fees, FX costs, terminal economics for card-present, and provider-specific add-ons. We benchmark the all-in cost — not just headline rates.",
          fr: "Taux effectifs de traitement, interchange et frais de scheme, coûts de change, économie de terminal pour le paiement de présence, et options spécifiques aux fournisseurs. Nous comparons le coût tout compris — pas seulement les taux affichés.",
          es: "Tasas efectivas de procesamiento, interchange y comisiones de scheme, costes de cambio, economía de terminal para pago presencial y complementos específicos de proveedor. Comparamos el coste total — no solo las tasas de portada.",
        },
      },
      {
        q: {
          en: "What's the network benchmark for payments?",
          fr: "Quel est le benchmark réseau pour les paiements ?",
          es: "¿Cuál es el benchmark de red para los pagos?",
        },
        a: {
          en: "Depends on your tier and geography. EU brands above €1M typically benchmark at 1.4–1.8% effective rate. Brands above €10M can reach 1.1–1.4%. Card-present has separate benchmarks.",
          fr: "Cela dépend de votre palier et de votre géographie. Les marques européennes au-dessus de 1 M€ se situent généralement à 1,4–1,8 % de taux effectif. Les marques au-dessus de 10 M€ peuvent atteindre 1,1–1,4 %. Le paiement de présence a des benchmarks distincts.",
          es: "Depende de tu tramo y tu geografía. Las marcas europeas por encima de 1 M€ suelen situarse en 1,4–1,8 % de tasa efectiva. Las marcas por encima de 10 M€ pueden alcanzar 1,1–1,4 %. El pago presencial tiene benchmarks propios.",
        },
      },
      {
        q: {
          en: "Can CAMBRA analyze Stripe directly?",
          fr: "CAMBRA peut-il analyser Stripe directement ?",
          es: "¿Puede CAMBRA analizar Stripe directamente?",
        },
        a: {
          en: "Yes. Connecting Stripe gives CAMBRA read-only access to your true effective rate, volume mix, and fee breakdown — producing the sharpest possible benchmark. The Stripe connection is implemented; live verification with a real account is pending.",
          fr: "Oui. Connecter Stripe donne à CAMBRA un accès en lecture seule à votre vrai taux effectif, votre mix de volumes et le détail des frais — produisant le benchmark le plus précis possible. La connexion Stripe est implémentée ; la validation en production avec un compte réel est en attente.",
          es: "Sí. Conectar Stripe da a CAMBRA acceso en solo lectura a tu tasa efectiva real, tu mix de volúmenes y el desglose de comisiones — produciendo el benchmark más preciso posible. La conexión Stripe está implementada; la validación en producción con una cuenta real está pendiente.",
        },
      },
      {
        q: {
          en: "Do you audit in-store card payments (TPV terminals)?",
          fr: "Auditez-vous les paiements par carte en point de vente (TPE) ?",
          es: "¿Auditáis los pagos con tarjeta en tienda (TPV)?",
        },
        a: {
          en: "Yes. The Analyzer covers both online (PSP) and in-store (TPV / physical terminal) card payments — same 60-second flow, pick your channel at the top. Public pricing is benchmarked verbatim for the four in-store providers we've verified in Europe (SumUp, Stripe Terminal, Smile & Pay, Zettle by PayPal); traditional bank acquirers (BNP, Crédit Agricole, Société Générale, BPCE, etc.) fall back to a regional average with a wider band, clearly labelled as an estimate. Combined mode analyzes both channels in one pass and shows a per-channel breakdown.",
          fr: "Oui. L'Analyzer couvre les paiements par carte en ligne (PSP) et en point de vente (TPE / terminal physique) — même flux de 60 secondes, choisissez votre canal en haut. Les tarifs publics sont comparés verbatim pour les quatre fournisseurs en point de vente vérifiés en Europe (SumUp, Stripe Terminal, Smile & Pay, Zettle by PayPal) ; les banques acquéreurs traditionnelles (BNP, Crédit Agricole, Société Générale, BPCE, etc.) retombent sur une moyenne régionale avec une fourchette plus large, clairement étiquetée comme estimation. Le mode combiné analyse les deux canaux en une passe et montre un détail par canal.",
          es: "Sí. El Analyzer cubre los pagos con tarjeta online (PSP) y en tienda (TPV / terminal físico) — mismo flujo de 60 segundos, elige tu canal arriba. Los precios públicos se comparan literalmente para los cuatro proveedores en tienda verificados en Europa (SumUp, Stripe Terminal, Smile & Pay, Zettle by PayPal); los bancos adquirentes tradicionales (BNP, Crédit Agricole, Société Générale, BPCE, etc.) recurren a una media regional con un rango más amplio, claramente etiquetado como estimación. El modo combinado analiza ambos canales en una pasada y muestra un desglose por canal.",
        },
      },
      {
        q: {
          en: "What statements do you need to verify my in-store rates?",
          fr: "Quels relevés faut-il pour vérifier mes taux en point de vente ?",
          es: "¿Qué extractos necesitáis para verificar mis tasas en tienda?",
        },
        a: {
          en: "For an estimated audit — none. The Analyzer gives you a directional gap from your inputs alone (monthly GMV, average ticket, provider, country). To move from estimated to verified in-store, we'd need a monthly TPV provider statement showing: total fees for the period, processed volume, transaction count, and any separately listed fixed fees or terminal rental. PDF, Excel, or CSV — whatever your provider sends you. Verified in-store is currently in beta and rolling out to early-access merchants; the estimated path is live for everyone today.",
          fr: "Pour un audit estimé — aucun. L'Analyzer vous donne un écart directionnel à partir de vos seules données (TMV mensuel, ticket moyen, fournisseur, pays). Pour passer d'estimé à vérifié en point de vente, nous aurions besoin d'un relevé mensuel du fournisseur TPE montrant : les frais totaux de la période, le volume traité, le nombre de transactions et d'éventuels frais fixes ou location de terminal listés séparément. PDF, Excel ou CSV — selon ce que votre fournisseur vous envoie. Le vérifié en point de vente est actuellement en bêta et déploie chez les marchands en accès anticipé ; le parcours estimé est disponible pour tous aujourd'hui.",
          es: "Para una auditoría estimada — ninguno. El Analyzer te da una brecha direccional a partir solo de tus datos (GMV mensual, ticket medio, proveedor, país). Para pasar de estimado a verificado en tienda, necesitaríamos un extracto mensual del proveedor TPV que muestre: las comisiones totales del periodo, el volumen procesado, el número de transacciones y posibles comisiones fijas o alquiler de terminal listados aparte. PDF, Excel o CSV — según lo que envíe tu proveedor. El verificado en tienda está actualmente en beta y desplegando entre los comerciantes de acceso anticipado; el recorrido estimado está disponible hoy para todos.",
        },
      },
      {
        q: {
          en: "What do you do with statements I upload?",
          fr: "Que faites-vous des relevés que j'importe ?",
          es: "¿Qué hacéis con los extractos que cargo?",
        },
        a: {
          en: "Strict pipeline, no surprises: (1) files are encrypted in transit (TLS 1.3) and at rest (AES-256), stored on EU infrastructure; (2) processed by AI models (Anthropic + OpenAI cross-check) to extract structured cost fields — total fees, volume, ticket, provider terms — nothing else; (3) your files and extractions are scoped to your account only, never shared with third parties, never used to train provider or public models; (4) you can delete any uploaded file on request, and account deletion removes all uploads within 30 days per our retention policy. Full detail lives in the Privacy notice under 'AI-assisted processing' (Privacy §4).",
          fr: "Pipeline strict, sans surprise : (1) les fichiers sont chiffrés en transit (TLS 1.3) et au repos (AES-256), stockés sur une infrastructure UE ; (2) traités par des modèles d'IA (Anthropic + OpenAI en double contrôle) pour extraire les champs de coût structurés — frais totaux, volume, ticket, conditions fournisseur — rien d'autre ; (3) vos fichiers et extractions sont limités à votre compte, jamais partagés avec des tiers, jamais utilisés pour entraîner des modèles de fournisseur ou publics ; (4) vous pouvez supprimer tout fichier importé sur demande, et la suppression du compte retire tous les imports dans les 30 jours selon notre politique de conservation. Le détail complet figure dans la notice de confidentialité, section « Traitement assisté par IA » (Confidentialité §4).",
          es: "Pipeline estricto, sin sorpresas: (1) los archivos se cifran en tránsito (TLS 1.3) y en reposo (AES-256), almacenados en infraestructura de la UE; (2) los procesan modelos de IA (Anthropic + OpenAI en doble verificación) para extraer campos de coste estructurados — comisiones totales, volumen, ticket, condiciones del proveedor — nada más; (3) tus archivos y extracciones se limitan a tu cuenta, nunca se comparten con terceros, nunca se usan para entrenar modelos de proveedor o públicos; (4) puedes eliminar cualquier archivo cargado bajo petición, y la eliminación de la cuenta retira todas las cargas en 30 días según nuestra política de retención. El detalle completo está en el aviso de privacidad, sección «Tratamiento asistido por IA» (Privacidad §4).",
        },
      },
    ],
  },
  {
    category: "integrations",
    title: { en: "Connections & uploads", fr: "Connexions et imports", es: "Conexiones y cargas" },
    items: [
      {
        q: {
          en: "Which integrations are supported?",
          fr: "Quelles intégrations sont prises en charge ?",
          es: "¿Qué integraciones están soportadas?",
        },
        a: {
          // v59.1 — honest Stripe classification (no unproven "live" claim).
          en: "Stripe is the implemented read-only connection today (OAuth: balance transactions, charges, fee breakdown). It is classified as 'Implemented — live verification pending' until verified with a real account in the deployed environment. Other PSPs (PayPal, Mollie, Adyen, Checkout.com, Shopify Payments) are on the roadmap, not currently connectable. Statement uploads (PDF / CSV / Excel) work for any provider today, including in-store TPV providers not on the connected list.",
          fr: "Stripe est la connexion en lecture seule implémentée aujourd'hui (OAuth : transactions de solde, charges, détail des frais). Elle est classée « Implémenté — validation en production en attente » tant qu'elle n'est pas validée avec un compte réel dans l'environnement déployé. D'autres PSP (PayPal, Mollie, Adyen, Checkout.com, Shopify Payments) sont au roadmap, non connectables actuellement. L'import de relevés (PDF / CSV / Excel) fonctionne pour tout fournisseur aujourd'hui, y compris les fournisseurs TPE en point de vente absents de la liste connectée.",
          es: "Stripe es la conexión en solo lectura implementada hoy (OAuth: transacciones de saldo, cargos, desglose de comisiones). Se clasifica como «Implementado — validación en producción pendiente» hasta que se valide con una cuenta real en el entorno desplegado. Otros PSP (PayPal, Mollie, Adyen, Checkout.com, Shopify Payments) están en el roadmap, no conectables actualmente. La carga de extractos (PDF / CSV / Excel) funciona hoy para cualquier proveedor, incluidos los proveedores TPV en tienda que no están en la lista de conexiones.",
        },
      },
      {
        q: {
          en: "Is the Stripe connection read-only?",
          fr: "La connexion Stripe est-elle en lecture seule ?",
          es: "¿La conexión Stripe es en solo lectura?",
        },
        a: {
          en: "Yes — always. CAMBRA never modifies data in your Stripe account. The OAuth scope is minimal and read-only, audited and revocable at any time.",
          fr: "Oui — toujours. CAMBRA ne modifie jamais les données de votre compte Stripe. Le scope OAuth est minimal et en lecture seule, audité et révocable à tout moment.",
          es: "Sí — siempre. CAMBRA nunca modifica los datos de tu cuenta Stripe. El scope OAuth es mínimo y en solo lectura, auditado y revocable en cualquier momento.",
        },
      },
      {
        q: {
          en: "Does CAMBRA modify my systems?",
          fr: "CAMBRA modifie-t-il mes systèmes ?",
          es: "¿CAMBRA modifica mis sistemas?",
        },
        a: {
          en: "Never. CAMBRA reads, analyzes, and benchmarks. All actions on your stack happen on your side, under your control.",
          fr: "Jamais. CAMBRA lit, analyse et compare. Toutes les actions sur votre stack se font de votre côté, sous votre contrôle.",
          es: "Nunca. CAMBRA lee, analiza y compara. Todas las acciones sobre tu stack ocurren de tu lado, bajo tu control.",
        },
      },
      {
        q: {
          en: "What happens after connection?",
          fr: "Que se passe-t-il après la connexion ?",
          es: "¿Qué ocurre tras la conexión?",
        },
        a: {
          en: "Your analysis automatically refines as fresh data flows in. A connected Stripe account unlocks tighter benchmarks, more granular optimization opportunities, and continuous monitoring of your effective rate.",
          fr: "Votre analyse s'affine automatiquement à mesure que de nouvelles données arrivent. Un compte Stripe connecté débloque des benchmarks plus serrés, des opportunités d'optimisation plus granulaires et un suivi continu de votre taux effectif.",
          es: "Tu análisis se refina automáticamente a medida que entran datos nuevos. Una cuenta Stripe conectada desbloquea benchmarks más ajustados, oportunidades de optimización más granulares y monitorización continua de tu tasa efectiva.",
        },
      },
    ],
  },
  {
    category: "uploads",
    title: { en: "Statement uploads", fr: "Import de relevés", es: "Carga de extractos" },
    items: [
      {
        q: {
          en: "Can I upload statements?",
          fr: "Puis-je importer des relevés ?",
          es: "¿Puedo cargar extractos?",
        },
        a: {
          en: "When document extraction is enabled, you can upload a payment-provider statement. Two independent readers extract volume, fees and transaction count, then deterministic checks compare them. A disagreement is held for review and no amount is applied.",
          fr: "Lorsque l'extraction documentaire est activée, vous pouvez importer un relevé de prestataire de paiement. Deux lecteurs indépendants extraient le volume, les frais et le nombre de transactions, puis des contrôles déterministes les comparent. En cas de désaccord, le document est mis en revue et aucun montant n'est appliqué.",
          es: "Cuando la extracción documental está activada, puedes subir un extracto del proveedor de pagos. Dos lectores independientes extraen volumen, comisiones y número de transacciones, y después unas reglas deterministas los comparan. Si no coinciden, queda en revisión y no se aplica ningún importe.",
        },
      },
      {
        q: {
          en: "Which file formats are supported?",
          fr: "Quels formats de fichier sont pris en charge ?",
          es: "¿Qué formatos de archivo están soportados?",
        },
        a: {
          en: "PDF, CSV, JSON and image formats (PNG, JPG/JPEG, WebP, GIF), up to 15MB. XLS/XLSX are rejected until a verified workbook parser is available.",
          fr: "PDF, CSV, JSON et formats d'image (PNG, JPG/JPEG, WebP, GIF), jusqu'à 15 Mo. XLS/XLSX sont refusés tant qu'un analyseur de classeur vérifié n'est pas disponible.",
          es: "PDF, CSV, JSON y formatos de imagen (PNG, JPG/JPEG, WebP, GIF), hasta 15 MB. XLS/XLSX se rechazan hasta disponer de un parser de hojas de cálculo verificado.",
        },
      },
      {
        q: {
          en: "How does statement analysis work?",
          fr: "Comment fonctionne l'analyse de relevés ?",
          es: "¿Cómo funciona el análisis de extractos?",
        },
        a: {
          en: "The file is signature-checked, hashed and read independently twice. Only an agreed EUR payment statement can populate Analyzer inputs. Extraction success is not verified savings and does not authorize billing.",
          fr: "Le fichier est contrôlé par signature, haché et lu deux fois indépendamment. Seul un relevé de paiement en EUR concordant peut alimenter l'Analyzer. Une extraction réussie ne constitue pas des économies vérifiées et n'autorise aucune facturation.",
          es: "El archivo se valida por firma, se calcula su hash y se lee dos veces de forma independiente. Solo un extracto de pagos en EUR coincidente puede alimentar el Analyzer. Una extracción correcta no equivale a ahorro verificado ni autoriza facturación.",
        },
      },
      {
        q: {
          en: "Can I combine uploads with manual inputs?",
          fr: "Puis-je combiner imports et saisies manuelles ?",
          es: "¿Puedo combinar cargas con entradas manuales?",
        },
        a: {
          en: "You can keep manual inputs and upload a statement. Accepted statement fields update the corresponding Analyzer inputs, while connected Stripe verification remains a separate evidence path.",
          fr: "Vous pouvez conserver les saisies manuelles et importer un relevé. Les champs acceptés mettent à jour les entrées correspondantes de l'Analyzer, tandis que la vérification Stripe connectée reste un parcours de preuve distinct.",
          es: "Puedes mantener las entradas manuales y subir un extracto. Los campos aceptados actualizan las entradas correspondientes del Analyzer, mientras que la verificación conectada de Stripe sigue siendo una vía de evidencia separada.",
        },
      },
    ],
  },
  {
    category: "security",
    title: { en: "Data & Security", fr: "Données et sécurité", es: "Datos y seguridad" },
    items: [
      {
        q: {
          en: "Is my data secure?",
          fr: "Mes données sont-elles sécurisées ?",
          es: "¿Mis datos están seguros?",
        },
        a: {
          en: "Access is role-scoped and audited. When optional document extraction is enabled, the uploaded document is processed by the configured AI providers under CAMBRA's processor/privacy terms; the feature stays off until those terms and retention settings are approved.",
          fr: "L'accès est limité par rôle et audité. Lorsque l'extraction documentaire facultative est activée, le document importé est traité par les fournisseurs d'IA configurés selon les conditions de sous-traitance et de confidentialité de CAMBRA ; la fonction reste désactivée tant que ces conditions et la conservation ne sont pas approuvées.",
          es: "El acceso está limitado por rol y auditado. Cuando se activa la extracción documental opcional, el documento subido es procesado por los proveedores de IA configurados conforme a las condiciones de encargado y privacidad de CAMBRA; la función permanece desactivada hasta aprobar esas condiciones y la retención.",
        },
      },
      {
        q: {
          en: "Is CAMBRA GDPR compliant?",
          fr: "CAMBRA est-il conforme au RGPD ?",
          es: "¿CAMBRA cumple con el RGPD?",
        },
        a: {
          en: "Yes. CAMBRA is built GDPR-first: lawful basis for every processing operation, full data subject rights, EU-based infrastructure, and a documented retention policy.",
          fr: "Oui. CAMBRA est conçu RGPD d'abord : base légale pour chaque opération de traitement, droits des personnes concernés pleinement respectés, infrastructure basée dans l'UE et politique de conservation documentée.",
          es: "Sí. CAMBRA está construido RGPD primero: base jurídica para cada operación de tratamiento, derechos de los interesados plenamente respetados, infraestructura en la UE y política de retención documentada.",
        },
      },
      {
        q: {
          en: "Who can access my information?",
          fr: "Qui peut accéder à mes informations ?",
          es: "¿Quién puede acceder a mi información?",
        },
        a: {
          en: "Only you and the CAMBRA team members directly supporting your account. Internal access is logged, scoped, and reviewed.",
          fr: "Seulement vous et les membres de l'équipe CAMBRA qui accompagnent directement votre compte. L'accès interne est journalisé, limité et revu.",
          es: "Solo tú y los miembros del equipo CAMBRA que dan soporte directo a tu cuenta. El acceso interno se registra, se acota y se revisa.",
        },
      },
      {
        q: {
          en: "Does CAMBRA access funds?",
          fr: "CAMBRA accède-t-il aux fonds ?",
          es: "¿CAMBRA accede a los fondos?",
        },
        a: {
          en: "Never. CAMBRA has zero financial authority over your accounts, payments, or operations. We analyze data — we don't move money.",
          fr: "Jamais. CAMBRA n'a aucune autorité financière sur vos comptes, paiements ou opérations. Nous analysons les données — nous ne déplaçons pas d'argent.",
          es: "Nunca. CAMBRA no tiene ninguna autoridad financiera sobre tus cuentas, pagos u operaciones. Analizamos datos — no movemos dinero.",
        },
      },
      {
        q: {
          en: "Is uploaded data encrypted?",
          fr: "Les données importées sont-elles chiffrées ?",
          es: "¿Los datos cargados están cifrados?",
        },
        a: {
          en: "Yes. All uploads are encrypted at rest and in transit. Original files can be deleted on request without affecting your analysis history.",
          fr: "Oui. Tous les imports sont chiffrés au repos et en transit. Les fichiers originaux peuvent être supprimés sur demande sans affecter votre historique d'analyse.",
          es: "Sí. Todas las cargas se cifran en reposo y en tránsito. Los archivos originales pueden eliminarse bajo petición sin afectar a tu historial de análisis.",
        },
      },
      {
        q: {
          en: "Can I delete my data?",
          fr: "Puis-je supprimer mes données ?",
          es: "¿Puedo borrar mis datos?",
        },
        a: {
          en: "Yes — at any time, in full. Account deletion removes all personal and operational data within 30 days, in accordance with GDPR.",
          fr: "Oui — à tout moment, intégralement. La suppression du compte retire toutes les données personnelles et opérationnelles dans les 30 jours, conformément au RGPD.",
          es: "Sí — en cualquier momento, por completo. La eliminación de la cuenta retira todos los datos personales y operativos en 30 días, conforme al RGPD.",
        },
      },
      {
        q: {
          en: "Are benchmarks built from my data?",
          fr: "Les benchmarks sont-ils construits à partir de mes données ?",
          es: "¿Los benchmarks se construyen con mis datos?",
        },
        a: {
          en: "Only in fully anonymized, aggregated form — and only with consent. Individual brand data is never identifiable in any benchmark output.",
          fr: "Uniquement sous forme anonymisée et agrégée — et seulement avec consentement. Les données individuelles d'une marque ne sont jamais identifiables dans aucun résultat de benchmark.",
          es: "Solo de forma totalmente anonimizada y agregada — y solo con consentimiento. Los datos individuales de una marca nunca son identificables en ningún resultado de benchmark.",
        },
      },
    ],
  },
  {
    category: "pricing",
    title: { en: "Pricing & success fee", fr: "Tarifs et commission au succès", es: "Precios y comisión de éxito" },
    items: [
      {
        q: {
          en: "Is CAMBRA free?",
          fr: "CAMBRA est-il gratuit ?",
          es: "¿CAMBRA es gratuito?",
        },
        a: {
          en: "Yes. The Analyzer, benchmarks and core insights are free during early access. There's no credit card required to run a full audit.",
          fr: "Oui. L'Analyzer, les benchmarks et les insights clés sont gratuits pendant l'accès anticipé. Aucune carte bancaire n'est requise pour lancer un audit complet.",
          es: "Sí. El Analyzer, los benchmarks y los insights clave son gratuitos durante el acceso anticipado. No hace falta tarjeta para ejecutar una auditoría completa.",
        },
      },
      {
        q: {
          en: "What's included in free access?",
          fr: "Qu'inclut l'accès gratuit ?",
          es: "¿Qué incluye el acceso gratuito?",
        },
        a: {
          en: "Full card-payment analysis (online and in-store), your per-channel effective rate, the benchmark for your cohort, the gap in basis points, and an estimated monthly and annual savings range.",
          fr: "L'analyse complète des paiements par carte (en ligne et en point de vente), votre taux effectif par canal, le benchmark de votre cohorte, l'écart en points de base et une estimation mensuelle et annuelle des économies.",
          es: "El análisis completo de pagos con tarjeta (online y en tienda), tu tasa efectiva por canal, el benchmark de tu cohorte, la brecha en puntos básicos y una estimación mensual y anual de ahorro.",
        },
      },
      {
        q: {
          en: "How does CAMBRA make money?",
          fr: "Comment CAMBRA gagne-t-il de l'argent ?",
          es: "¿Cómo gana dinero CAMBRA?",
        },
        a: {
          en: "Only on results. When CAMBRA helps activate an optimization that produces verified savings, we charge a success fee — 25% of the verified savings over a 24-month agreement. No savings, no fee. There is no joining fee and no monthly subscription today.",
          fr: "Uniquement sur les résultats. Quand CAMBRA aide à activer une optimisation qui produit des économies vérifiées, nous facturons une commission au succès — 25 % des économies vérifiées sur un accord de 24 mois. Pas d'économies, pas de commission. Il n'y a aujourd'hui ni frais d'adhésion ni abonnement mensuel.",
          es: "Solo con resultados. Cuando CAMBRA ayuda a activar una optimización que produce ahorro verificado, cobramos una comisión de éxito — el 25 % del ahorro verificado durante un acuerdo de 24 meses. Sin ahorro, no hay comisión. Hoy no hay cuota de alta ni suscripción mensual.",
        },
      },
      {
        q: {
          en: "Do I pay anything if no savings are found?",
          fr: "Dois-je payer quelque chose si aucune économie n'est trouvée ?",
          es: "¿Pago algo si no se encuentra ahorro?",
        },
        a: {
          en: "No. The analysis is free, and the success fee only applies to savings that are actually verified and recovered. If we don't recover margin, you don't owe a fee.",
          fr: "Non. L'analyse est gratuite, et la commission au succès ne s'applique qu'aux économies réellement vérifiées et récupérées. Si nous ne récupérons pas de marge, vous ne devez aucune commission.",
          es: "No. El análisis es gratuito, y la comisión de éxito solo se aplica al ahorro que se verifica y recupera realmente. Si no recuperamos margen, no debes comisión.",
        },
      },
      {
        q: {
          en: "Can I cancel anytime?",
          fr: "Puis-je résilier à tout moment ?",
          es: "¿Puedo cancelar en cualquier momento?",
        },
        a: {
          en: "Yes. CAMBRA has no lock-in. You can pause, downgrade, or close your account at any time without penalty.",
          fr: "Oui. CAMBRA n'a pas de durée d'engagement. Vous pouvez suspendre, rétrograder ou fermer votre compte à tout moment sans pénalité.",
          es: "Sí. CAMBRA no tiene permanencia. Puedes pausar, bajar de plan o cerrar tu cuenta en cualquier momento sin penalización.",
        },
      },
    ],
  },
  {
    category: "troubleshooting",
    title: { en: "Technical Troubleshooting", fr: "Résolution de problèmes techniques", es: "Resolución de problemas técnicos" },
    items: [
      {
        q: {
          en: "My integration won't connect.",
          fr: "Mon intégration ne se connecte pas.",
          es: "Mi integración no se conecta.",
        },
        a: {
          en: "First confirm the source account has admin or read-access permissions. If the issue persists, disconnect and reconnect, or contact support with the integration name and timestamp.",
          fr: "Vérifiez d'abord que le compte source dispose des permissions admin ou de lecture. Si le problème persiste, déconnectez puis reconnectez, ou contactez le support avec le nom de l'intégration et l'horodatage.",
          es: "Confirma primero que la cuenta de origen tiene permisos de admin o de lectura. Si el problema persiste, desconecta y vuelve a conectar, o contacta con soporte indicando el nombre de la integración y la marca de tiempo.",
        },
      },
      {
        q: {
          en: "My upload didn't parse correctly.",
          fr: "Mon import n'a pas été analysé correctement.",
          es: "Mi carga no se procesó correctamente.",
        },
        a: {
          en: "Try re-uploading a cleaner version of the document. If extraction continues to fail, send the file to support — we'll process it manually and improve the model.",
          fr: "Essayez de réimporter une version plus nette du document. Si l'extraction continue d'échouer, envoyez le fichier au support — nous le traiterons manuellement et améliorerons le modèle.",
          es: "Prueba a recargar una versión más nítida del documento. Si la extracción sigue fallando, envía el archivo a soporte — lo procesaremos manualmente y mejoraremos el modelo.",
        },
      },
      {
        q: {
          en: "My savings estimate seems off.",
          fr: "Mon estimation d'économies semble incorrecte.",
          es: "Mi estimación de ahorro parece incorrecta.",
        },
        a: {
          en: "The gap is most sensitive to your monthly GMV, average ticket, provider, country, and international share. Double-check those inputs first — a wrong avg ticket in particular can shift the fixed-fee drag significantly. If something still looks wrong after re-running with corrected inputs, contact support with your analysis ID.",
          fr: "L'écart est très sensible à votre TMV mensuel, ticket moyen, fournisseur, pays et part internationale. Vérifiez d'abord ces données — un ticket moyen erroné notamment peut modifier sensiblement le trainage des frais fixes. Si quelque chose semble toujours incorrect après une nouvelle exécution avec des données corrigées, contactez le support avec votre identifiant d'analyse.",
          es: "La brecha es muy sensible a tu GMV mensual, ticket medio, proveedor, país y porcentaje internacional. Revisa primero esos datos — un ticket medio equivocado, en particular, puede alterar notablemente el arrastre de comisión fija. Si algo sigue pareciendo incorrecto tras volver a ejecutar con datos corregidos, contacta con soporte indicando tu ID de análisis.",
        },
      },
    ],
  },
  {
    category: "legal",
    title: { en: "Legal & Compliance", fr: "Juridique et conformité", es: "Legal y cumplimiento" },
    items: [
      {
        q: {
          en: "Does CAMBRA sign mandates on my behalf?",
          fr: "CAMBRA signe-t-il des mandats en mon nom ?",
          es: "¿CAMBRA firma mandatos en mi nombre?",
        },
        a: {
          en: "Only with explicit, scoped authorization. Every mandate is reviewed, signed digitally, and revocable. CAMBRA never acts outside the scope you authorize.",
          fr: "Uniquement avec une autorisation explicite et délimitée. Chaque mandat est revu, signé numériquement et révocable. CAMBRA n'agit jamais au-delà du périmètre que vous autorisez.",
          es: "Solo con autorización explícita y delimitada. Cada mandato se revisa, se firma digitalmente y es revocable. CAMBRA nunca actúa fuera del alcance que autorizas.",
        },
      },
      {
        q: {
          en: "Where is CAMBRA based?",
          fr: "Où CAMBRA est-il basé ?",
          es: "¿Dónde tiene su sede CAMBRA?",
        },
        a: {
          en: "CAMBRA is a European company with infrastructure hosted in the EU, designed for GDPR compliance from day one.",
          fr: "CAMBRA est une entreprise européenne avec une infrastructure hébergée dans l'UE, conçue pour la conformité RGPD dès le premier jour.",
          es: "CAMBRA es una empresa europea con infraestructura alojada en la UE, diseñada para el cumplimiento del RGPD desde el primer día.",
        },
      },
    ],
  },
];

// ── Popular articles. read time stays language-neutral ("3 min"). ──
export const POPULAR_CONTENT = [
  {
    slug: "estimate-savings",
    category: "savings",
    read: "3 min",
    title: {
      en: "How does CAMBRA estimate savings?",
      fr: "Comment CAMBRA estime-t-il les économies ?",
      es: "¿Cómo calcula CAMBRA el ahorro?",
    },
  },
  {
    slug: "in-store-audit",
    category: "payments",
    read: "2 min",
    title: {
      en: "Do you audit in-store card payments (TPV)?",
      fr: "Auditez-vous les paiements par carte en point de vente (TPE) ?",
      es: "¿Auditáis los pagos con tarjeta en tienda (TPV)?",
    },
  },
  {
    slug: "benchmark-accuracy",
    category: "benchmarks",
    read: "4 min",
    title: {
      en: "How accurate are benchmark estimates?",
      fr: "Quelle est la précision des estimations de benchmark ?",
      es: "¿Qué precisión tienen las estimaciones de benchmark?",
    },
  },
  {
    slug: "switching-providers",
    category: "savings",
    read: "3 min",
    title: {
      en: "Do I need to switch providers?",
      fr: "Dois-je changer de fournisseur ?",
      es: "¿Necesito cambiar de proveedor?",
    },
  },
  {
    slug: "data-security",
    category: "security",
    read: "3 min",
    title: {
      en: "Is my data secure?",
      fr: "Mes données sont-elles sécurisées ?",
      es: "¿Mis datos están seguros?",
    },
  },
  {
    slug: "business-model",
    category: "pricing",
    read: "2 min",
    title: {
      en: "How does CAMBRA make money?",
      fr: "Comment CAMBRA gagne-t-il de l'argent ?",
      es: "¿Cómo gana dinero CAMBRA?",
    },
  },
];

// ── Trending search chips (HelpSearch) — language-aware ──
export const TRENDING_SEARCHES = [
  { en: "In-store TPV", fr: "TPE en point de vente", es: "TPV en tienda" },
  { en: "Stripe connection", fr: "Connexion Stripe", es: "Conexión Stripe" },
  { en: "Benchmark accuracy", fr: "Précision des benchmarks", es: "Precisión de los benchmarks" },
  { en: "Success fee", fr: "Commission au succès", es: "Comisión de éxito" },
  { en: "Upload statements", fr: "Importer des relevés", es: "Cargar extractos" },
  { en: "GDPR", fr: "RGPD", es: "RGPD" },
];
