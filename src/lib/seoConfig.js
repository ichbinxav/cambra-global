// v59 (2026-08-05) — Help retired-slug awareness.
import { getCategory, isRetiredHelpSlug } from "@/lib/helpCenterData";

// SEO-1 (2026-08-05) — Centralized SEO source of truth for all public routes.
//
// This module is the SINGLE authority for per-route metadata in CAMBRA. The
// SeoMeta component (src/components/shared/SeoMeta.jsx) reads this config and
// writes document.title, meta description, Open Graph, Twitter, canonical,
// robots and JSON-LD for the current route + active language.
//
// Design rules:
//  - Only canonical public routes are listed here. Every route NOT listed is
//    treated as noindex,nofollow by SeoMeta (safe default). This keeps the
//    Dashboard, Results, Account, admin, etc. out of the index without
//    maintaining a separate denylist.
//  - Canonical URLs are normalized to https://cambra.global (no query, no hash,
//    no trailing slash except the root). Query strings, tokens and fragments
//    are ignored so share links and auth redirects never produce duplicate
//    canonicals.
//  - Titles and descriptions are provided in EN / FR / ES. They are scoped to
//    the current payments-first product (card-payment cost audit + recovery +
//    partner/provider programmes). No description claims shipping, SaaS,
//    insurance, banking or financing as a current service.
//  - No hreflang is emitted. The app changes language client-side without
//    independent /en /fr /es URL paths, so hreflang would point three languages
//    at the same URL — a false signal. The architecture (SeoMeta) is ready to
//    add hreflang when localized routes exist. See OPERATIONS_STATUS.md.
//
// PAYMENTS-FIRST SCOPE: do not extend this file with shipping/SaaS/insurance/
// financing routes unless those services ship and have their own canonical
// routes.

export const SEO_ORIGIN = "https://cambra.global";

// Single default social image (brand mark). Per-route overrides possible.
export const DEFAULT_OG_IMAGE =
  "https://media.base44.com/images/public/69b8bcd2986e2cf428289270/411e1f39a_cambra_c_logo_white_background.png";

export const DEFAULT_ROBOTS = "index, follow";
export const NOINDEX_ROBOTS = "noindex, nofollow, noarchive, nosnippet";

// og:locale per language — kept here so SeoMeta is the only writer of OG.
export const OG_LOCALE = { en: "en_GB", fr: "fr_FR", es: "es_ES" };

// ── Homepage Service schema (authoritative copy; index.html keeps a static
//    copy for non-JS scrapers — SeoMeta does NOT write JSON-LD for "/"). ──
export const HOMEPAGE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "CAMBRA payment cost audit and recovery",
  url: SEO_ORIGIN,
  provider: { "@type": "Organization", name: "CAMBRA", legalName: "CAMBRA Global SASU", vatID: "FR50105452916", taxID: "105452916" },
  serviceType: "Card payment cost audit and verified savings recovery",
  areaServed: "Europe",
  description:
    "CAMBRA shows European businesses what card processing costs, identifies supported opportunities to reduce payment fees and helps recover verified margin.",
};

// Build a WebPage JSON-LD block for a non-homepage public route.
export function webPageSchema({ title, description, canonical, lang = "en" }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: canonical,
    inLanguage: { en: "en", fr: "fr", es: "es" }[lang] || "en",
    isPartOf: { "@type": "WebSite", name: "CAMBRA", url: SEO_ORIGIN },
  };
}

// ── Static public routes ──
export const SEO_STATIC = {
  "/": {
    canonicalPath: "/",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    schema: HOMEPAGE_SCHEMA, // SeoMeta skips writing it (index.html static copy)
    title: {
      en: "Reduce card payment fees and recover margin | CAMBRA",
      fr: "Réduire les frais de paiement par carte | CAMBRA",
      es: "Reducir comisiones de pago con tarjeta | CAMBRA",
    },
    description: {
      en: "See what card processing costs your business, find supported opportunities to reduce payment fees and recover verified margin. Free first analysis.",
      fr: "Découvrez ce que les paiements par carte coûtent à votre entreprise, réduisez les frais lorsque les chiffres le permettent et récupérez une marge vérifiée.",
      es: "Descubre cuánto le cuesta a tu negocio cobrar con tarjeta, reduce comisiones cuando los datos lo justifican y recupera margen verificado.",
    },
  },
  "/Analyzer": {
    canonicalPath: "/Analyzer",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Free card processing fee analyzer | CAMBRA",
      fr: "Analyseur gratuit des frais de paiement par carte | CAMBRA",
      es: "Analizador gratuito de comisiones de tarjeta | CAMBRA",
    },
    description: {
      en: "Check your card processing fees and effective payment rate by market. Every result explains its evidence and uncertainty.",
      fr: "Vérifiez vos frais de paiement par carte et votre taux effectif selon votre marché. Chaque résultat explique ses preuves et ses incertitudes.",
      es: "Comprueba tus comisiones de pago con tarjeta y tu tasa efectiva por mercado. Cada resultado explica su evidencia y sus límites.",
    },
  },
  "/how-it-works": {
    canonicalPath: "/how-it-works",
    ogType: "article",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "How It Works | CAMBRA",
      fr: "Comment CAMBRA audite et récupère la marge de paiement par carte",
      es: "Cómo CAMBRA audita y recupera el margen de pago con tarjeta",
    },
    description: {
      en: "How CAMBRA benchmarks your card payment costs, builds a recovery plan and verifies the savings — success fee only on verified, activated margin.",
      fr: "Comment CAMBRA évalue vos coûts de paiement par carte, construit un plan de récupération et vérifie les économies — honoraires au succès uniquement sur la marge vérifiée et activée.",
      es: "Cómo CAMBRA evalúa tus costes de pago con tarjeta, construye un plan de recuperación y verifica el ahorro — honorario de éxito solo sobre el margen verificado y activado.",
    },
  },
  "/pricing": {
    canonicalPath: "/pricing",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Pricing | CAMBRA",
      fr: "Tarifs — analyse gratuite, honoraire au succès sur économies vérifiées | CAMBRA",
      es: "Precios — análisis gratuito, honorario de éxito sobre ahorro verificado | CAMBRA",
    },
    description: {
      en: "Free card payment cost analysis. CAMBRA charges a success fee only on verified savings recovered over 24 months — no joining fee, no monthly subscription.",
      fr: "Analyse gratuite des coûts de paiement par carte. CAMBRA facture un honoraire au succès uniquement sur les économies vérifiées récupérées sur 24 mois — sans frais d'adhésion, sans abonnement mensuel.",
      es: "Análisis gratuito de costes de pago con tarjeta. CAMBRA cobra un honorario de éxito solo sobre el ahorro verificado recuperado durante 24 meses — sin cuota de alta, sin suscripción mensual.",
    },
  },
  "/Partners": {
    canonicalPath: "/Partners",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Partner Programme — CAMBRA",
      fr: "Programme Partenaires — CAMBRA",
      es: "Programa Partners — CAMBRA",
    },
    description: {
      en: "The CAMBRA Partner Programme for advisers, agencies and associations who help independent brands. No joining fee, no commission, no exclusivity.",
      fr: "Le Programme Partenaires CAMBRA pour les conseillers, agences et associations qui accompagnent les marques indépendantes. Sans frais d'adhésion, sans commission, sans exclusivité.",
      es: "El Programa Partners de CAMBRA para asesores, agencias y asociaciones que acompañan a marcas independientes. Sin cuota de alta, sin comisión, sin exclusividad.",
    },
  },
  "/ForProviders": {
    canonicalPath: "/ForProviders",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "For payment providers — CAMBRA",
      fr: "Pour les fournisseurs de paiement — CAMBRA",
      es: "Para proveedores de pago — CAMBRA",
    },
    description: {
      en: "How payment providers join CAMBRA's benchmark and partner programme. Equal access, merchant-first recommendations, benchmark integrity.",
      fr: "Comment les fournisseurs de paiement rejoignent le benchmark et le programme partenaires CAMBRA. Accès égal, recommandations centrées marchand, intégrité du benchmark.",
      es: "Cómo los proveedores de pago se unen al benchmark y al programa de partners de CAMBRA. Acceso igual, recomendaciones centradas en el comerciante, integridad del benchmark.",
    },
  },
  "/Contact": {
    canonicalPath: "/Contact",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Contact CAMBRA",
      fr: "Contacter CAMBRA",
      es: "Contacta con CAMBRA",
    },
    description: {
      en: "Contact the CAMBRA team about card payment cost audits, recovery and the partner programme.",
      fr: "Contactez l'équipe CAMBRA à propos des audits de coûts de paiement par carte, de la récupération et du programme partenaires.",
      es: "Contacta con el equipo de CAMBRA sobre auditorías de costes de pago con tarjeta, recuperación y el programa de partners.",
    },
  },
  "/Security": {
    canonicalPath: "/Security",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Security at CAMBRA",
      fr: "Sécurité chez CAMBRA",
      es: "Seguridad en CAMBRA",
    },
    description: {
      en: "How CAMBRA protects merchant data, handles connections and keeps card payment analysis secure.",
      fr: "Comment CAMBRA protège les données marchands, gère les connexions et sécurise l'analyse des paiements par carte.",
      es: "Cómo CAMBRA protege los datos del comerciante, gestiona conexiones y mantiene seguro el análisis de pagos con tarjeta.",
    },
  },
  "/Help": {
    canonicalPath: "/Help",
    ogType: "website",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Help centre — CAMBRA",
      fr: "Centre d'aide — CAMBRA",
      es: "Centro de ayuda — CAMBRA",
    },
    description: {
      en: "Answers to common questions about CAMBRA's card payment cost audit, recovery process and partner programme.",
      fr: "Réponses aux questions fréquentes sur l'audit de coûts de paiement par carte CAMBRA, le processus de récupération et le programme partenaires.",
      es: "Respuestas a preguntas frecuentes sobre la auditoría de costes de pago con tarjeta de CAMBRA, el proceso de recuperación y el programa de partners.",
    },
  },
  "/Privacy": {
    canonicalPath: "/Privacy",
    ogType: "article",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Privacy policy — CAMBRA",
      fr: "Politique de confidentialité — CAMBRA",
      es: "Política de privacidad — CAMBRA",
    },
    description: {
      en: "How CAMBRA collects, uses and protects merchant data in its card payment cost audit and recovery service.",
      fr: "Comment CAMBRA collecte, utilise et protège les données marchands dans son service d'audit et de récupération des coûts de paiement par carte.",
      es: "Cómo CAMBRA recopila, usa y protege los datos del comerciante en su servicio de auditoría y recuperación de costes de pago con tarjeta.",
    },
  },
  "/Terms": {
    canonicalPath: "/Terms",
    ogType: "article",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Terms — CAMBRA",
      fr: "Conditions — CAMBRA",
      es: "Condiciones — CAMBRA",
    },
    description: {
      en: "The terms governing CAMBRA's card payment cost audit and recovery service.",
      fr: "Les conditions régissant le service d'audit et de récupération des coûts de paiement par carte de CAMBRA.",
      es: "Las condiciones que rigen el servicio de auditoría y recuperación de costes de pago con tarjeta de CAMBRA.",
    },
  },
  "/Dpa": {
    canonicalPath: "/Dpa",
    ogType: "article",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Data Processing Addendum — CAMBRA",
      fr: "Avenant relatif au traitement des données — CAMBRA",
      es: "Anexo de tratamiento de datos — CAMBRA",
    },
    description: {
      en: "The data processing terms governing CAMBRA's handling of personal data for customers.",
      fr: "Les conditions de traitement des données personnelles applicables aux clients de CAMBRA.",
      es: "Las condiciones de tratamiento de datos personales aplicables a los clientes de CAMBRA.",
    },
  },
  "/Subprocessors": {
    canonicalPath: "/Subprocessors",
    ogType: "article",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Subprocessors — CAMBRA",
      fr: "Sous-traitants ultérieurs — CAMBRA",
      es: "Subencargados del tratamiento — CAMBRA",
    },
    description: {
      en: "The current subprocessors CAMBRA uses to provide its services and protect customer data.",
      fr: "Les sous-traitants ultérieurs actuellement utilisés par CAMBRA pour fournir ses services et protéger les données clients.",
      es: "Los subencargados que CAMBRA utiliza actualmente para prestar sus servicios y proteger los datos de clientes.",
    },
  },
  "/Cookies": {
    canonicalPath: "/Cookies",
    ogType: "article",
    robots: DEFAULT_ROBOTS,
    title: {
      en: "Cookie policy — CAMBRA",
      fr: "Politique relative aux cookies — CAMBRA",
      es: "Política de cookies — CAMBRA",
    },
    description: {
      en: "How CAMBRA uses cookies on its website.",
      fr: "Comment CAMBRA utilise les cookies sur son site web.",
      es: "Cómo CAMBRA usa las cookies en su sitio web.",
    },
  },
};

// ── Dynamic public routes (param segments). Canonical = the actual path. ──
//    SeoMeta resolves these after the static map misses.
export const SEO_DYNAMIC = [
  {
    pattern: /^\/Help\/[^/]+$/,
    // Help category pages. A slug that maps to a live Help category is
    // indexable (canonical = current path). A RETIRED slug (shipping, saas,
    // …) or an unknown slug is noindex,nofollow — retired slugs redirect to
    // /Help in the UI (HelpCategory), and must never be indexed with stale
    // multi-vertical content.
    resolve: (pathname /* , lang */) => {
      const slug = decodeURIComponent(pathname.split("/")[2] || "");
      const base = SEO_STATIC["/Help"];
      const live = Boolean(getCategory(slug)) && !isRetiredHelpSlug(slug);
      const label = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        canonicalPath: pathname,
        ogType: "article",
        robots: live ? DEFAULT_ROBOTS : NOINDEX_ROBOTS,
        title: {
          en: `${label} — CAMBRA Help`,
          fr: `${label} — Aide CAMBRA`,
          es: `${label} — Ayuda CAMBRA`,
        },
        description: base.description,
      };
    },
  },
];

// ── Resolution ──
// Returns the config entry for a pathname, or null (→ caller applies noindex).
export function getSeoForPath(pathname) {
  if (!pathname || typeof pathname !== "string") return null;
  if (SEO_STATIC[pathname]) return SEO_STATIC[pathname];
  for (const d of SEO_DYNAMIC) {
    if (d.pattern.test(pathname)) return d.resolve(pathname, "en"); // lang resolved by SeoMeta caller
  }
  return null;
}

// Resolve with a specific language (used by SeoMeta + tests).
export function getSeoForPathLang(pathname, lang) {
  if (!pathname) return null;
  if (SEO_STATIC[pathname]) return SEO_STATIC[pathname];
  for (const d of SEO_DYNAMIC) {
    if (d.pattern.test(pathname)) return d.resolve(pathname, lang);
  }
  return null;
}

// Build the absolute canonical URL for a canonicalPath. Root keeps a trailing
// slash; every other path has none. No query, no hash.
export function buildCanonicalUrl(canonicalPath) {
  if (!canonicalPath) return SEO_ORIGIN + "/";
  if (canonicalPath === "/") return SEO_ORIGIN + "/";
  return SEO_ORIGIN + canonicalPath;
}

// Canonical public paths (for sitemap sync + tests). Order matches sitemap.
export const CANONICAL_PUBLIC_PATHS = Object.keys(SEO_STATIC);
