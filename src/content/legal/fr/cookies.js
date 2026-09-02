// LEGAL-1 — Traduction française du texte maître anglais (en/cookies.js).
// Sens identique, vouvoiement.

export default {
  badge: "Légal · Politique de cookies",
  title: "Politique de cookies.",
  lastUpdated: "Dernière mise à jour : 12 août 2026",
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
        { name: "cambra_cookie_consent", purpose: "Enregistre la version de la politique, vos choix par catégorie, la langue de l'interface, la source du choix et son horodatage", duration: "Jusqu'à l'effacement des données ou au retrait du consentement", category: "Strictement nécessaire" },
        { name: "cambra_lang", purpose: "Mémorise votre préférence de langue (EN/FR/ES). Une clé héritée d'une version antérieure (node_lang) peut encore être lue — jamais écrite — pour migrer cette préférence", duration: "Jusqu'à l'effacement des données du navigateur", category: "Fonctionnel" },
        { name: "cambra_market", purpose: "Mémorise le marché européen d'activité que vous avez choisi. La langue ou le fuseau du navigateur sert uniquement à suggérer un marché avant votre choix explicite", duration: "Jusqu'à l'effacement des données ou au retour au mode automatique", category: "Fonctionnel" },
        { name: "cambra_copilot_open", purpose: "Mémorise si le panneau assistant est ouvert ou fermé", duration: "Jusqu'à l'effacement des données du navigateur", category: "Fonctionnel" },
      ],
    },
    {
      heading: "5. sessionStorage",
      note: "Effacé automatiquement à la fermeture de l'onglet du navigateur.",
      rows: [
        { name: "cambra_redirect_after_login", purpose: "Mémorise la page que vous cherchiez à atteindre afin de vous y ramener après connexion", duration: "Jusqu'à la fermeture de l'onglet", category: "Strictement nécessaire" },
        { name: "cambra_ref_code", purpose: "Mémorise le code de recommandation du commerce dont vous avez ouvert le lien d'invitation, afin que la recommandation puisse être enregistrée lorsque vous lancez votre analyse quelques écrans plus loin. Code aléatoire opaque, non dérivé de données personnelles", duration: "Jusqu'à la fermeture de l'onglet", category: "Strictement nécessaire" },
        { name: "cambra_chat_conv", purpose: "Mémorise la conversation active dans le chat d'administration (comptes administrateurs uniquement)", duration: "Jusqu'à la fermeture de l'onglet", category: "Fonctionnel" },
      ],
    },
  ],
  after: [
    {
      title: "6. Vos choix de consentement",
      body: "Lors de votre première visite, la bannière permet de tout accepter, de refuser les catégories facultatives ou de gérer les préférences. L'analytique et le marketing sont désactivés par défaut ; le stockage strictement nécessaire reste actif. Votre choix versionné est enregistré dans cambra_cookie_consent. CAMBRA utilise deux mesures internes sur la même plateforme d'hébergement : un compteur de pages vues transmet le nom de la page lors de la navigation et, uniquement si l'analytique est activée, une liste fermée d'événements de parcours produit, par exemple analyse commencée/terminée ou Recover accepté. Ces événements refusent les adresses e-mail, noms, jetons, URL, identifiants de session/utilisateur/entité, noms de fichiers et texte libre. Aucune de ces mesures ne dépose de cookie analytique ou publicitaire et aucun réseau publicitaire tiers n'intervient. La désactivation de l'analytique bloque les événements produit soumis au consentement. Vous pouvez rouvrir les réglages depuis cette page à tout moment.",
    },
    {
      title: "7. Gérer les cookies et le stockage",
      body: "Les éléments strictement nécessaires ne peuvent pas être désactivés — la plateforme ne fonctionne pas sans eux. Les éléments fonctionnels peuvent être supprimés à tout moment depuis les paramètres de votre navigateur (effacer les cookies et données de site) ; le seul effet est la perte de la préférence correspondante.",
    },
    {
      title: "8. Contact",
      body: "Questions sur l'utilisation des cookies et du stockage navigateur par CAMBRA : privacy@cambra.global. Éditeur : CAMBRA Global SASU, SIREN 105 452 916, SIRET 105 452 916 00015, TVA intracommunautaire FR50105452916, 47 rue Vivienne, 75002 Paris, France.",
    },
  ],
};
