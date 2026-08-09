export const RECOVER_UI_COPY = {
  en: {
    panel: {
      eyebrow: 'Recover margin', authorized: 'Authorization in place', authorize: 'Authorize us to recover your margin',
      accepted: (fee) => `You've authorized us at a ${fee}% fee on verified savings. We only charge on savings confirmed against your own statements. You can revoke it at any time.`,
      pitch: (fee) => `We'll negotiate with your provider, or move you to a better rate, and charge ${fee}% of what we actually recover — verified against your statements. No recovery, no fee.`,
      review: 'Review and authorize', notReady: "This deal isn't at the authorization stage yet — we'll let you know as soon as it is.",
      blockers: {
        no_verified_baseline: 'We need a verified starting figure before you can authorize us. Connect your provider or upload a statement — once our team confirms it, this unlocks.',
        ecl_verified_payment_source_unavailable: 'We need fresh verified payment data before Recover can be authorized. Sync your payment provider and try again.',
        ecl_source_vertical_unsupported: 'Recover evidence enforcement is currently available for payments only.',
      },
    },
    modal: {
      close: 'Close', eyebrow: 'Recover margin', title: 'Authorize CAMBRA to recover your margin', intro: 'You are authorizing us to negotiate with your provider, or to move you to a better rate, on your behalf.',
      preparing: 'Preparing your terms…', evidence: 'Verified payment evidence', name: 'Your full name', namePlaceholder: 'Jane Doe', role: 'Your role (optional)', rolePlaceholder: 'Founder',
      evidenceFallback: 'I confirm, to the best of my knowledge, that the verified baseline and payment-cost figures shown here are accurate.',
      legalFallback: (entity) => `I confirm I can legally bind ${entity || 'my business'} and I accept these terms.`,
      changed: 'The terms changed while this window was open, so we did not record your acceptance. Close and reopen it to review the updated terms.',
      genericError: 'We could not prepare or record your authorization. Nothing has been accepted. Please try again.',
      recording: 'Recording your acceptance…', accept: 'Accept and authorize', signedAs: (email, version) => `Signed as ${email || 'your account'} · ${version || ''}`,
    },
    payment: {
      saved: "Payment method saved. It is only charged against savings we've verified — never before.",
      intro: 'Add a payment method for future success-fee invoices. Nothing is charged now — we only invoice once savings are verified against your own statements.',
      saving: 'Saving', save: 'Save payment method', preparing: 'Preparing', add: 'Add payment method',
      startError: "We couldn't start the secure setup. Please try again.", stripeError: "We couldn't reach Stripe. Please check your connection and retry.",
      bankError: 'Your bank declined the authorization.', pending: "Stripe hasn't confirmed the method yet. Give it a moment and retry.",
    },
  },
  fr: {
    panel: {
      eyebrow: 'Recover margin', authorized: 'Autorisation en place', authorize: 'Autorisez-nous à récupérer votre marge',
      accepted: (fee) => `Vous nous avez autorisés avec une commission de ${fee}% sur les économies vérifiées. Nous facturons uniquement les économies confirmées à partir de vos propres relevés. Vous pouvez révoquer cette autorisation à tout moment.`,
      pitch: (fee) => `Nous négocions avec votre prestataire ou vous faisons passer à de meilleures conditions, puis facturons ${fee}% de ce que nous récupérons réellement — vérifié à partir de vos relevés. Aucun gain, aucune commission.`,
      review: 'Vérifier et autoriser', notReady: "Cette opération n'est pas encore à l'étape d'autorisation. Nous vous préviendrons dès qu'elle le sera.",
      blockers: {
        no_verified_baseline: 'Nous avons besoin d’une référence vérifiée avant votre autorisation. Connectez votre prestataire ou importez un relevé ; dès validation, cette étape sera débloquée.',
        ecl_verified_payment_source_unavailable: 'Nous avons besoin de données de paiement récentes et vérifiées avant d’autoriser Recover. Synchronisez votre prestataire de paiement puis réessayez.',
        ecl_source_vertical_unsupported: 'La vérification des preuves Recover est actuellement disponible uniquement pour les paiements.',
      },
    },
    modal: {
      close: 'Fermer', eyebrow: 'Recover margin', title: 'Autoriser CAMBRA à récupérer votre marge', intro: 'Vous nous autorisez à négocier avec votre prestataire, ou à vous faire passer à de meilleures conditions, en votre nom.',
      preparing: 'Préparation de vos conditions…', evidence: 'Preuve de paiement vérifiée', name: 'Nom complet', namePlaceholder: 'Jeanne Dupont', role: 'Fonction (facultatif)', rolePlaceholder: 'Fondatrice / Fondateur',
      evidenceFallback: 'Je confirme, à ma connaissance, que la référence vérifiée et les coûts de paiement affichés ici sont exacts.',
      legalFallback: (entity) => `Je confirme pouvoir engager juridiquement ${entity || 'mon entreprise'} et j’accepte ces conditions.`,
      changed: 'Les conditions ont changé pendant que cette fenêtre était ouverte. Votre acceptation n’a donc pas été enregistrée. Fermez puis rouvrez la fenêtre pour consulter les conditions mises à jour.',
      genericError: 'Nous n’avons pas pu préparer ou enregistrer votre autorisation. Rien n’a été accepté. Réessayez.',
      recording: 'Enregistrement de votre acceptation…', accept: 'Accepter et autoriser', signedAs: (email, version) => `Signé avec ${email || 'votre compte'} · ${version || ''}`,
    },
    payment: {
      saved: 'Moyen de paiement enregistré. Il ne sera utilisé que pour des économies que nous avons vérifiées — jamais avant.',
      intro: 'Ajoutez un moyen de paiement pour les futures factures de commission au succès. Rien n’est débité maintenant : nous facturons uniquement après vérification des économies sur vos propres relevés.',
      saving: 'Enregistrement', save: 'Enregistrer le moyen de paiement', preparing: 'Préparation', add: 'Ajouter un moyen de paiement',
      startError: 'Impossible de démarrer la configuration sécurisée. Réessayez.', stripeError: 'Impossible de joindre Stripe. Vérifiez votre connexion puis réessayez.',
      bankError: 'Votre banque a refusé l’autorisation.', pending: 'Stripe n’a pas encore confirmé le moyen de paiement. Réessayez dans un instant.',
    },
  },
  es: {
    panel: {
      eyebrow: 'Recover margin', authorized: 'Autorización activa', authorize: 'Autorízanos a recuperar tu margen',
      accepted: (fee) => `Nos has autorizado con una comisión del ${fee}% sobre el ahorro verificado. Solo cobramos sobre ahorros confirmados frente a tus propios extractos. Puedes revocar la autorización en cualquier momento.`,
      pitch: (fee) => `Negociaremos con tu proveedor o te moveremos a mejores condiciones y cobraremos el ${fee}% de lo que recuperemos de verdad — verificado frente a tus extractos. Sin ahorro, no hay comisión.`,
      review: 'Revisar y autorizar', notReady: 'Esta operación todavía no está en la fase de autorización. Te avisaremos en cuanto lo esté.',
      blockers: {
        no_verified_baseline: 'Necesitamos una referencia verificada antes de que puedas autorizarnos. Conecta tu proveedor o sube un extracto; cuando quede confirmado, se desbloqueará esta etapa.',
        ecl_verified_payment_source_unavailable: 'Necesitamos datos de pago recientes y verificados antes de autorizar Recover. Sincroniza tu proveedor de pagos e inténtalo de nuevo.',
        ecl_source_vertical_unsupported: 'La verificación de evidencia de Recover está disponible actualmente solo para pagos.',
      },
    },
    modal: {
      close: 'Cerrar', eyebrow: 'Recover margin', title: 'Autoriza a CAMBRA a recuperar tu margen', intro: 'Nos autorizas a negociar con tu proveedor o a moverte a mejores condiciones en tu nombre.',
      preparing: 'Preparando tus condiciones…', evidence: 'Evidencia de pago verificada', name: 'Nombre completo', namePlaceholder: 'María García', role: 'Cargo (opcional)', rolePlaceholder: 'Fundador/a',
      evidenceFallback: 'Confirmo, según mi leal saber y entender, que la baseline verificada y los costes de pago mostrados aquí son correctos.',
      legalFallback: (entity) => `Confirmo que puedo vincular jurídicamente a ${entity || 'mi empresa'} y acepto estas condiciones.`,
      changed: 'Las condiciones cambiaron mientras esta ventana estaba abierta, así que no hemos registrado tu aceptación. Ciérrala y vuelve a abrirla para revisar las condiciones actualizadas.',
      genericError: 'No hemos podido preparar o registrar tu autorización. No se ha aceptado nada. Inténtalo de nuevo.',
      recording: 'Registrando tu aceptación…', accept: 'Aceptar y autorizar', signedAs: (email, version) => `Firmado como ${email || 'tu cuenta'} · ${version || ''}`,
    },
    payment: {
      saved: 'Método de pago guardado. Solo se utilizará contra ahorros que hayamos verificado — nunca antes.',
      intro: 'Añade un método de pago para futuras facturas de comisión de éxito. No se cobra nada ahora: solo facturamos cuando el ahorro está verificado frente a tus propios extractos.',
      saving: 'Guardando', save: 'Guardar método de pago', preparing: 'Preparando', add: 'Añadir método de pago',
      startError: 'No hemos podido iniciar la configuración segura. Inténtalo de nuevo.', stripeError: 'No hemos podido conectar con Stripe. Comprueba tu conexión e inténtalo de nuevo.',
      bankError: 'Tu banco ha rechazado la autorización.', pending: 'Stripe todavía no ha confirmado el método. Espera un momento y vuelve a intentarlo.',
    },
  },
};

export function recoverUiCopy(lang) {
  return RECOVER_UI_COPY[lang] || RECOVER_UI_COPY.en;
}
