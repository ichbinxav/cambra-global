// recoverMandateCopy — RECOVER-3-FIX (2026-08-03).
//
// THE single source of the mandate's user-facing wording, in EN / FR / ES.
//
// Three surfaces must show the SAME words: the acceptance popup
// (RecoverMandateModal), the frozen terms summary (MandateTermsSummary) and the
// contractual PDF (recoverContractTemplates + recoverContractPdf). Three
// independent copies would drift, and a merchant accepting one wording while the
// PDF states another is exactly the defect this module exists to prevent.
//
// CROSS-BOUNDARY NOTE: the frontend cannot import a Deno module and the backend
// cannot import from src/. So this module is the source, the backend PDF imports
// it directly, and the popup receives the SAME strings from
// getRecoverAcceptanceContext (`mandate_copy`) rather than restating them. There
// is one text, one place.
//
// TERMINOLOGY, LOAD-BEARING: this is an ELECTRONIC ACCEPTANCE
// ("acceptation électronique" / "aceptación electrónica"). Never a qualified
// electronic signature, in any language.
//
// LEGAL REVIEW: the FR/ES wording below is applied verbatim as specified in
// RECOVER-1 §13 and RECOVER-3-FIX. Legal review of the TRANSLATED wording is
// still pending before use with real clients (see Decision_Log_RECOVER3.md).

export const MANDATE_COPY_VERSION = 'recover-mandate-copy-v1';

export type MandateLocale = 'en' | 'fr' | 'es';

export type MandateCopy = {
  titles: {
    purpose: string;
    baseline: string;
    fee: string;
    duration: string;
    first_period: string;
    actions: string;
    limits: string;
    payment_method: string;
    acceptance: string;
    documents: string;
    revocation: string;
  };
  actions_intro: string;
  actions: string[];
  /** Paragraph form of the limits. FR/ES were specified as prose. */
  limits_body: string[];
  /** Bullet form of the limits. EN was specified as a list. */
  limits_bullets: string[];
  summary: {
    fee_label: string;
    duration_label: string;
    duration_value: string;
    baseline_label: string;
    baseline_verified_on: string;
    projected_label: string;
  };
};

/**
 * The acceptance checkbox, per language.
 *
 * EN is deliberately LEFT AS THE v1 POPUP RENDERED IT: the PDF reproduces the
 * statement the merchant actually ticked, keyed to document_version
 * 'recover-mandate-v1', so rewording it would falsify every existing English
 * acceptance. FR/ES had no acceptance before this change, so they carry the full
 * wording specified in RECOVER-1 §13.
 */
export function checkboxTextFor(locale: MandateLocale, entity: string, feePct?: number | string): string {
  const fallback = { en: 'my business', fr: 'mon entreprise', es: 'mi empresa' }[locale] || 'my business';
  const name = entity && String(entity).trim() ? String(entity).trim() : fallback;
  const fee = feePct === undefined || feePct === null || feePct === '' ? '—' : String(feePct);

  if (locale === 'fr') {
    return (
      `Je déclare être habilité(e) à agir au nom de ${name} et j'accepte le Mandat commercial Recover Margin ` +
      `ainsi que les Conditions, y compris la référence vérifiée présentée ci-dessus, une durée de 24 mois à ` +
      `compter de l'activation des nouvelles conditions approuvées, et la commission variable de CAMBRA ` +
      `correspondant à ${fee} % des économies vérifiées. Je comprends qu'aucune commission CAMBRA n'est due ` +
      `en l'absence d'économie vérifiée positive et que l'autorisation du moyen de paiement sera effectuée ` +
      `séparément.`
    );
  }
  if (locale === 'es') {
    return (
      `Declaro que estoy autorizado/a para actuar en nombre de ${name} y acepto el Mandato comercial Recover ` +
      `Margin y sus Condiciones, incluido el baseline verificado mostrado anteriormente, una duración de 24 ` +
      `meses desde la activación de las nuevas condiciones aprobadas y la comisión variable de CAMBRA del ` +
      `${fee}% del ahorro verificado. Entiendo que no se devenga ninguna comisión de CAMBRA si no existe un ` +
      `ahorro verificado positivo y que la autorización del método de pago se completará por separado.`
    );
  }
  return `I confirm I can legally bind ${name} and I accept these terms.`;
}

const EN: MandateCopy = {
  titles: {
    purpose: 'Purpose',
    baseline: 'Verified baseline',
    fee: 'Success fee',
    duration: 'Duration',
    first_period: 'First measured and invoiced period',
    actions: 'Authorized commercial actions',
    limits: 'Limits of authority',
    payment_method: 'Payment-method setup',
    acceptance: 'Electronic acceptance',
    documents: 'Documents incorporated by reference',
    revocation: 'Revocation',
  },
  actions_intro: "The Client authorizes CAMBRA to, on the Client's behalf:",
  actions: [
    "analyse the Client's payment costs and conditions;",
    'request information and offers from providers;',
    'contact providers;',
    'negotiate commercial conditions;',
    'compare available alternatives;',
    'recommend a course of action;',
    'coordinate implementation of the conditions the Client has approved;',
    'verify the savings obtained.',
  ],
  limits_body: ['The following limits are an essential part of this mandate:'],
  limits_bullets: [
    "CAMBRA does not hold or safeguard the Client's funds;",
    "CAMBRA does not execute the Client's payments;",
    'CAMBRA does not provide the regulated payment service;',
    "CAMBRA does not accept binding offers on the Client's behalf;",
    "CAMBRA does not enter into contracts on the Client's behalf;",
    'no service is migrated or modified without a separate final approval by the Client;',
    'the regulated provider continues to provide the service;',
    'this mandate is revocable at any time;',
    'amounts already earned on savings already verified remain payable.',
  ],
  summary: {
    fee_label: 'Success fee on verified savings',
    duration_label: 'Duration',
    duration_value: '24 months from go-live',
    baseline_label: 'Verified baseline',
    baseline_verified_on: 'verified',
    projected_label: 'Projected annual savings',
  },
};

const FR: MandateCopy = {
  titles: {
    purpose: 'Objet',
    baseline: 'Référence vérifiée',
    fee: 'Commission de succès',
    duration: 'Durée',
    first_period: 'Première période mesurée et facturée',
    actions: 'Actions commerciales autorisées',
    limits: 'Limites du mandat',
    payment_method: 'Configuration du moyen de paiement',
    acceptance: 'Acceptation électronique',
    documents: 'Documents incorporés par référence',
    revocation: 'Révocation',
  },
  actions_intro: 'Le mandat commercial autorise exclusivement CAMBRA à :',
  actions: [
    'analyser les coûts de paiement du client ;',
    'demander au client ou aux prestataires les informations nécessaires ;',
    'solliciter des offres et propositions commerciales ;',
    'contacter les prestataires concernés ;',
    'négocier des offres et conditions commerciales dans le cadre autorisé ;',
    'comparer les alternatives ;',
    'recommander une option ;',
    'coordonner une mise en œuvre expressément approuvée ;',
    'vérifier les économies obtenues selon la méthodologie acceptée.',
  ],
  limits_body: [
    "CAMBRA ne détient pas les fonds du client. CAMBRA n'exécute pas de paiements pour le compte du client. " +
      'CAMBRA ne fournit pas le service de paiement réglementé ; le prestataire de paiement reste seul ' +
      "responsable de ce service réglementé. CAMBRA ne peut pas accepter d'offre engageante au nom du client, " +
      'ni contracter en son nom, ni ordonner une migration, ni modifier ou résilier des services. CAMBRA ne ' +
      'peut mettre en œuvre une alternative qu\'après approbation finale distincte du client. Le mandat est ' +
      "révocable. La révocation n'affecte pas les montants déjà dus, et n'invalide pas les actes déjà " +
      'approuvés ou légitimement réalisés avant sa prise d\'effet.',
  ],
  limits_bullets: [],
  summary: {
    fee_label: 'Commission sur les économies vérifiées',
    duration_label: 'Durée',
    duration_value: '24 mois à compter de l\'activation',
    baseline_label: 'Référence vérifiée',
    baseline_verified_on: 'vérifiée le',
    projected_label: 'Économie annuelle projetée',
  },
};

const ES: MandateCopy = {
  titles: {
    purpose: 'Objeto',
    baseline: 'Baseline verificado',
    fee: 'Comisión de éxito',
    duration: 'Duración',
    first_period: 'Primer periodo medido y facturado',
    actions: 'Acciones comerciales autorizadas',
    limits: 'Límites del mandato',
    payment_method: 'Configuración del método de pago',
    acceptance: 'Aceptación electrónica',
    documents: 'Documentos incorporados por referencia',
    revocation: 'Revocación',
  },
  actions_intro: 'El mandato comercial autoriza exclusivamente a CAMBRA a:',
  actions: [
    'analizar los costes de pago del cliente;',
    'solicitar al cliente o a los proveedores la información necesaria;',
    'pedir ofertas y propuestas comerciales;',
    'contactar con los proveedores pertinentes;',
    'negociar ofertas y condiciones comerciales dentro del alcance autorizado;',
    'comparar alternativas;',
    'recomendar una opción;',
    'coordinar una implementación expresamente aprobada;',
    'verificar el ahorro obtenido según la metodología aceptada.',
  ],
  limits_body: [
    'CAMBRA no custodia los fondos del cliente. CAMBRA no ejecuta pagos en nombre del cliente. CAMBRA no ' +
      'presta el servicio de pagos regulado; el proveedor de pagos sigue siendo el único responsable de ese ' +
      'servicio regulado. CAMBRA no puede aceptar una oferta vinculante en nombre del cliente, ni contratar ' +
      'en su nombre, ni ordenar una migración, ni modificar o cancelar servicios. CAMBRA solo puede ' +
      'implementar una alternativa tras la aprobación final independiente del cliente. El mandato es ' +
      'revocable. La revocación no afecta a las cantidades ya devengadas, ni invalida los actos ya aprobados ' +
      'o legítimamente realizados antes de que surtiera efecto.',
  ],
  limits_bullets: [],
  summary: {
    fee_label: 'Comisión sobre el ahorro verificado',
    duration_label: 'Duración',
    duration_value: '24 meses desde la activación',
    baseline_label: 'Baseline verificado',
    baseline_verified_on: 'verificado el',
    projected_label: 'Ahorro anual proyectado',
  },
};

const COPY: Record<MandateLocale, MandateCopy> = { en: EN, fr: FR, es: ES };

export function mandateCopy(locale: string | undefined | null): MandateCopy {
  return COPY[(locale || 'en') as MandateLocale] || EN;
}