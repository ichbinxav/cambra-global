// LEGAL-1 — Traduction française du texte maître anglais (en/cookies.js).
// Sens identique, vouvoiement.

export default {
  badge: "Légal · Politique de cookies",
  title: "Politique de cookies.",
  lastUpdated: "Dernière mise à jour : 24 juillet 2026",
  back: "Retour",
  columns: { name: "Nom", purpose: "Finalité", duration: "Durée", category: "Catégorie" },
  intro: [
    {
      title: "1. Champ de cette politique",
      body: "Les cookies sont de petits fichiers texte stockés sur votre appareil par votre navigateur. La plateforme utilise également le stockage du navigateur — localStorage (persiste après la fermeture du navigateur) et sessionStorage (effacé à la fermeture de l'onglet). Le stockage navigateur n'est techniquement pas un cookie, mais il remplit des finalités comparables : cette politique liste donc les deux — exactement tels qu'utilisés par l'application, vérifiés sur notre code source.",
    },
    {
      title: "2. Comment CAMBRA les utilise",
      body: "Strictement pour faire fonctionner la plateforme : vous maintenir connecté, rattacher votre analyse anonyme à votre nouveau compte, et mémoriser vos préférences comme la langue. Nous ne déposons aucun cookie publicitaire, aucun traceur tiers, aucun profilage comportemental et aucun identifiant inter-sites.",
    },
  ],
  tables: [
    {
      heading: "3. Cookies",
      note: "Cookies internes (first-party) déposés sur le domaine cambra.global.",
      rows: [
        { name: "cambra_anon_session", purpose: "Transporte votre session d'analyse anonyme lors de l'inscription afin que votre rapport soit rattaché à votre nouveau compte", duration: "30 minutes", category: "Strictement nécessaire" },
      ],
    },
    {
      heading: "4. localStorage",
      note: "Persiste jusqu'à ce que vous effaciez les données de site de votre navigateur.",
      rows: [
        { name: "base44_access_token", purpose: "Jeton d'authentification émis par notre fournisseur de plateforme (Base44) qui vous maintient connecté. Un alias hérité nommé « token » est écrit en parallèle par le SDK de la plateforme", duration: "Jusqu'à la déconnexion ou l'effacement des données du navigateur", category: "Strictement nécessaire" },
        { name: "cambra_pending_anon_session", purpose: "Même finalité que le cookie cambra_anon_session, via le même navigateur ; supprimé automatiquement une fois votre rapport rattaché", duration: "Supprimé automatiquement après usage", category: "Strictement nécessaire" },
        { name: "cambra_cookie_consent", purpose: "Enregistre votre choix de consentement aux cookies et son horodatage", duration: "Jusqu'à l'effacement des données du navigateur", category: "Strictement nécessaire" },
        { name: "cambra_lang", purpose: "Mémorise votre préférence de langue (EN/FR/ES). Une clé héritée d'une version antérieure (node_lang) peut encore être lue — jamais écrite — pour migrer cette préférence", duration: "Jusqu'à l'effacement des données du navigateur", category: "Fonctionnel" },
        { name: "cambra_copilot_open", purpose: "Mémorise si le panneau assistant est ouvert ou fermé", duration: "Jusqu'à l'effacement des données du navigateur", category: "Fonctionnel" },
      ],
    },
    {
      heading: "5. sessionStorage",
      note: "Effacé automatiquement à la fermeture de l'onglet du navigateur.",
      rows: [
        { name: "cambra_redirect_after_login", purpose: "Mémorise la page que vous cherchiez à atteindre afin de vous y ramener après connexion", duration: "Jusqu'à la fermeture de l'onglet", category: "Strictement nécessaire" },
        { name: "cambra_chat_conv", purpose: "Mémorise la conversation active dans le chat d'administration (comptes administrateurs uniquement)", duration: "Jusqu'à la fermeture de l'onglet", category: "Fonctionnel" },
      ],
    },
  ],
  after: [
    {
      title: "6. Vos choix de consentement",
      body: "Lors de votre première visite, une bannière de consentement propose « Tout accepter » et « Gérer les préférences », où l'analytique et le marketing peuvent être activés individuellement (le stockage strictement nécessaire est toujours actif). Votre choix est enregistré dans cambra_cookie_consent avec un horodatage. En termes clairs : CAMBRA ne dépose actuellement aucun cookie ni stockage analytique ou marketing — votre choix enregistré ne prendra effet que si de tels outils sont un jour introduits, et cette politique sera mise à jour au préalable. La seule mesure d'usage en place est un compteur de pages vues interne (first-party) : lorsque vous naviguez entre les pages, l'application envoie le nom de la page (p. ex. « Analyzer ») à notre plateforme d'hébergement sur ce même domaine. Il n'écrit rien sur votre appareil — ni cookie, ni stockage — et n'implique aucun tiers ni réseau publicitaire.",
    },
    {
      title: "7. Gérer les cookies et le stockage",
      body: "Les éléments strictement nécessaires ne peuvent pas être désactivés — la plateforme ne fonctionne pas sans eux. Les éléments fonctionnels peuvent être supprimés à tout moment depuis les paramètres de votre navigateur (effacer les cookies et données de site) ; le seul effet est la perte de la préférence correspondante.",
    },
    {
      title: "8. Contact",
      body: "Questions sur l'utilisation des cookies et du stockage navigateur par CAMBRA : privacy@cambra.global. Éditeur : CAMBRA GLOBAL SASU, SIREN 105 452 916, 42 rue Vivienne, 75002 Paris, France.",
    },
  ],
};