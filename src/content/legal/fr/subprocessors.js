// DPA-1 (2026-08-16) — traduction du master anglais (en/subprocessors.js), de
// sens juridique identique. Annexe III du DPA (/Dpa §7.1).
// Cohérent avec src/content/legal/fr/privacy.js §5. Aucune ligne n'affirme une
// entité, une région ou un instrument de transfert non vérifié.

export default {
  badge: "Légal · Annexe III",
  title: "Sous-traitants ultérieurs.",
  version: "1.0",
  lastUpdated: "Dernière mise à jour : 16 août 2026",
  back: "Retour",
  intro: [
    {
      title: "1. Objet de cette page",
      body: "Cette page constitue l'Annexe III de l'Accord de sous-traitance des données de CAMBRA. Elle liste les sous-traitants ultérieurs auxquels CAMBRA a recours pour fournir le service, le pays de l'entité contractante, le rôle de chacun et le mécanisme invoqué lorsque des données à caractère personnel quittent l'Espace économique européen. Conformément à l'article 7.2 du DPA, CAMBRA donne un préavis d'au moins 30 jours avant d'ajouter ou de remplacer un sous-traitant ultérieur ; la date ci-dessus constitue la référence de ce préavis.",
    },
    {
      title: "2. Comment lire la colonne statut",
      body: "CONFIRMÉ signifie que le prestataire est à la fois déclaré publiquement dans notre Politique de confidentialité et effectivement appelé par la plateforme de manière vérifiable. EN ATTENTE DE REVUE JURIDIQUE signifie que nous n'avons pas encore confirmé un point précis — généralement l'entité contractante exacte, la région d'hébergement ou l'instrument de transfert. Nous publions ces lacunes au lieu de les combler par un texte plausible : une affirmation non vérifiée dans un document de protection des données est pire qu'une lacune assumée.",
    },
  ],
  columns: { name: "Prestataire", country: "Pays", service: "Service", transfer: "Mécanisme de transfert", status: "Statut" },
  tables: [
    {
      heading: "3. Sous-traitants ultérieurs du service CAMBRA",
      note: "Prestataires qui traitent des données à caractère personnel pour le compte du client, c'est-à-dire des sous-traitants ultérieurs au sens de l'article 28, paragraphes 2 et 4, du RGPD.",
      rows: [
        { name: "Base44", country: "En attente de confirmation", service: "Hébergement de l'application, base de données, authentification et envoi d'e-mails transactionnels par la plateforme", transfer: "En attente de revue juridique — région d'hébergement non publiée par CAMBRA", status: "CONFIRMÉ — prestataire ; région et instrument de transfert en attente" },
        { name: "Anthropic PBC", country: "États-Unis", service: "Traitement par IA — extraction des relevés, intelligence produit et Copilot intégré", transfer: "Accord de sous-traitance du prestataire (clauses contractuelles types) — instrument précis en attente de revue", status: "CONFIRMÉ" },
        { name: "OpenAI", country: "États-Unis", service: "Contre-vérification de l'extraction par IA (second lecteur indépendant des relevés téléversés)", transfer: "Accord de sous-traitance du prestataire (clauses contractuelles types) — instrument précis en attente de revue", status: "CONFIRMÉ" },
        { name: "Resend, Inc.", country: "États-Unis", service: "Acheminement des e-mails sortants et routage des e-mails entrants", transfer: "Accord de sous-traitance du prestataire (clauses contractuelles types) — instrument précis en attente de revue", status: "CONFIRMÉ" },
        { name: "Stripe Payments Europe Ltd.", country: "Irlande", service: "Traitement des paiements pour la facturation de la commission de succès de CAMBRA ; accès en lecture seule au compte Stripe du client lorsque celui-ci l'autorise", transfer: "Dans l'EEE pour l'entité contractante ; les transferts ultérieurs sont régis par l'accord propre de Stripe", status: "CONFIRMÉ" },
      ],
    },
    {
      heading: "4. Autres prestataires — opérations propres à CAMBRA",
      note: "Ces prestataires apparaissent dans le code de la plateforme mais ne sont PAS des sous-traitants ultérieurs déclarés du service client : ils soutiennent la prospection et la recherche de marché propres à CAMBRA, où CAMBRA agit en qualité de responsable de ses propres données de contact professionnel et non de sous-traitant du client. Ils sont listés par transparence et leur qualification est en attente de confirmation juridique.",
      rows: [
        { name: "Microsoft (Graph / Outlook)", country: "En attente de confirmation", service: "Boîte professionnelle propre à CAMBRA — correspondance commerciale sortante et entrante", transfer: "En attente de revue juridique", status: "EN ATTENTE DE REVUE JURIDIQUE" },
        { name: "Instantly", country: "En attente de confirmation", service: "Campagnes commerciales sortantes de CAMBRA vers des prospects", transfer: "En attente de revue juridique", status: "EN ATTENTE DE REVUE JURIDIQUE" },
        { name: "Apollo", country: "En attente de confirmation", service: "Découverte et enrichissement de contacts professionnels pour la prospection propre à CAMBRA", transfer: "En attente de revue juridique", status: "EN ATTENTE DE REVUE JURIDIQUE" },
        { name: "Perplexity", country: "En attente de confirmation", service: "Recherche publique sur le marché et les prestataires (pages tarifaires des prestataires de paiement, veille concurrentielle)", transfer: "En attente de revue juridique", status: "EN ATTENTE DE REVUE JURIDIQUE" },
      ],
    },
  ],
  outro: [
    {
      title: "5. S'opposer à un sous-traitant ultérieur",
      body: "Conformément à l'article 7.2 du DPA, vous pouvez vous opposer, pour des motifs raisonnables liés à la protection des données, à tout ajout ou remplacement annoncé ici. Écrivez à privacy@cambra.global dans le délai de préavis. Si l'opposition ne peut être résolue, chacune des parties pourra résilier la partie du service concernée.",
    },
    {
      title: "6. Contact",
      body: "Pour toute question sur cette liste, les mécanismes de transfert ou les accords sous-jacents : privacy@cambra.global.",
    },
  ],
};
