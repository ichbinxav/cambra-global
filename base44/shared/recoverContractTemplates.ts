// recoverContractTemplates — RECOVER-3 (2026-08-03).
//
// The contractual wording, versioned and DETERMINISTIC, in EN / FR / ES.
//
// Nothing here is translated at generation time by a model: the same mandate must
// always render the same words, and a legal document whose text depends on a
// non-deterministic call cannot be evidence of anything. Changing a single word
// means bumping RECOVER_CONTRACT_TEMPLATE_VERSION, which in turn produces a NEW
// document for NEW mandates and never rewrites a historical one.
//
// TERMINOLOGY, LOAD-BEARING: this is an ELECTRONIC ACCEPTANCE
// ("acceptation electronique" / "aceptacion electronica"). It is not a qualified
// electronic signature, there is no qualified certificate and no qualified
// timestamp, and no string in this file may imply otherwise.
//
// LIMITATION DECLARED HERE, NOT HIDDEN: RECOVER-1 did not persist the verbatim
// UI strings it displayed (no exact_text_shown / checkbox_text_exact column). The
// acceptance checkbox text below is therefore the VERSIONED reproduction of what
// the v1 popup rendered, keyed to document_version 'recover-mandate-v1' — the
// merchant's own name is interpolated exactly as the popup did. See
// Decision_Log_RECOVER3.md.

export const RECOVER_CONTRACT_TEMPLATE_VERSION = 'recover-contract-pdf-v1';

export type ContractLocale = 'en' | 'fr' | 'es';

export type ContractStrings = {
  doc_title: string;
  doc_subtitle: string;
  product: string;
  label_document_version: string;
  label_template_version: string;
  label_mandate_reference: string;
  label_accepted_on: string;
  label_language: string;
  provider_heading: string;
  provider_legal_form: string;
  provider_address: string;
  provider_registration: string;
  provider_vat: string;
  provider_capital: string;
  provider_representative: string;
  provider_support: string;
  client_heading: string;
  client_legal_name: string;
  client_organization: string;
  client_country: string;
  client_signatory: string;
  client_signatory_email: string;
  client_signatory_role: string;
  s1_title: string;
  s1_body: string[];
  s2_title: string;
  s2_body: string[];
  s2_baseline_reference: string;
  s2_baseline_value: string;
  s2_baseline_type: string;
  s2_verified_at: string;
  s3_title: string;
  s3_body: string[];
  s3_standard_fee: string;
  s3_discount: string;
  s3_effective_fee: string;
  s3_projected: string;
  s4_title: string;
  s4_body: string[];
  s5_title: string;
  s5_body: string[];
  s6_title: string;
  s6_body: string[];
  s6_actions: string[];
  s7_title: string;
  s7_body: string[];
  s7_limits: string[];
  s8_title: string;
  s8_body: string[];
  s9_title: string;
  s9_body: string[];
  s9_checkbox_label: string;
  s9_declared_authority: string;
  s9_checkbox_accepted: string;
  s9_yes: string;
  s10_title: string;
  s10_body: string[];
  s11_title: string;
  s11_body: string[];
  annex_title: string;
  annex_intro: string;
  annex_opened_at: string;
  annex_authenticated_at: string;
  annex_signed_at: string;
  annex_snapshot_hash: string;
  annex_document_version: string;
  annex_template_version: string;
  annex_mandate_id: string;
  annex_activation_id: string;
  annex_organization: string;
  annex_supersedes: string;
  annex_ip: string;
  annex_ip_unavailable: string;
  annex_user_agent: string;
  annex_session_freshness: string;
  page_of: string;
  footer_note: string;
  not_available: string;
};

/** The acceptance checkbox as rendered by the v1 popup, per language. */
export function checkboxTextFor(locale: ContractLocale, entity: string): string {
  const name = entity && entity.trim() ? entity.trim() : {
    en: 'my business', fr: 'mon entreprise', es: 'mi empresa',
  }[locale];
  return {
    en: `I confirm I can legally bind ${name} and I accept these terms.`,
    fr: `Je confirme que je peux engager juridiquement ${name} et j'accepte ces conditions.`,
    es: `Confirmo que puedo obligar legalmente a ${name} y acepto estas condiciones.`,
  }[locale];
}

const EN: ContractStrings = {
  doc_title: 'Commercial Mandate and Success Fee Agreement',
  doc_subtitle: 'Recover Margin',
  product: 'Recover Margin',
  label_document_version: 'Document version',
  label_template_version: 'Template version',
  label_mandate_reference: 'Agreement reference',
  label_accepted_on: 'Electronically accepted on',
  label_language: 'Language',
  provider_heading: 'Service provider',
  provider_legal_form: 'Legal form',
  provider_address: 'Registered address',
  provider_registration: 'Registration number',
  provider_vat: 'VAT identification',
  provider_capital: 'Share capital',
  provider_representative: 'Represented by',
  provider_support: 'Contact',
  client_heading: 'Client',
  client_legal_name: 'Legal entity',
  client_organization: 'Organization reference',
  client_country: 'Country',
  client_signatory: 'Authorized signatory',
  client_signatory_email: 'Signatory email',
  client_signatory_role: 'Signatory role',
  s1_title: '1. Purpose',
  s1_body: [
    'Recover Margin is a business-to-business service by which CAMBRA analyses the payment costs the Client actually pays, and works to reduce them, either by renegotiating with the Client\'s existing provider or by identifying a better available alternative.',
    'CAMBRA is remunerated exclusively through a success fee on savings that are verified against the Client\'s own provider statements. If no positive verified saving is achieved, no fee is due.',
  ],
  s2_title: '2. Verified baseline',
  s2_body: [
    'The parties agree on the following verified starting figure, which was confirmed before this acceptance and is the reference against which any saving is measured.',
  ],
  s2_baseline_reference: 'Baseline reference',
  s2_baseline_value: 'Baseline value',
  s2_baseline_type: 'Baseline type',
  s2_verified_at: 'Verified on',
  s3_title: '3. Success fee',
  s3_body: [
    'The fee is calculated as: positive verified saving multiplied by the effective success fee rate below. The fee applies only to savings actually verified; projected figures are indicative and create no obligation.',
    'Tax treatment is not addressed by this document.',
  ],
  s3_standard_fee: 'Standard success fee',
  s3_discount: 'Discount applied',
  s3_effective_fee: 'Effective success fee',
  s3_projected: 'Projected annual saving (indicative)',
  s4_title: '4. Duration',
  s4_body: [
    'The success fee applies for 24 months from the activation of the new approved conditions.',
  ],
  s5_title: '5. First measured and invoiced period',
  s5_body: [
    'The month in which the new conditions are activated is not billable. The first full calendar month after activation is the first measured period, and it is invoiced in the following month.',
    'If no positive verified saving exists for a measured period, nothing is due for that period.',
  ],
  s6_title: '6. Authorized commercial actions',
  s6_body: ['The Client authorizes CAMBRA to, on the Client\'s behalf:'],
  s6_actions: [
    'analyse the Client\'s payment costs and conditions;',
    'request information and offers from providers;',
    'contact providers;',
    'negotiate commercial conditions;',
    'compare available alternatives;',
    'recommend a course of action;',
    'coordinate implementation of the conditions the Client has approved;',
    'verify the savings obtained.',
  ],
  s7_title: '7. Limits of authority',
  s7_body: ['The following limits are an essential part of this mandate:'],
  s7_limits: [
    'CAMBRA does not hold or safeguard the Client\'s funds;',
    'CAMBRA does not execute the Client\'s payments;',
    'CAMBRA does not provide the regulated payment service;',
    'CAMBRA does not accept binding offers on the Client\'s behalf;',
    'CAMBRA does not enter into contracts on the Client\'s behalf;',
    'no service is migrated or modified without a separate final approval by the Client;',
    'the regulated provider continues to provide the service;',
    'this mandate is revocable at any time;',
    'amounts already earned on savings already verified remain payable.',
  ],
  s8_title: '8. Payment-method setup',
  s8_body: [
    'The payment method for future success fee invoices is set up separately, through CAMBRA\'s payment processor. This document contains no card or bank account data, and setting up a payment method takes no payment at that time.',
  ],
  s9_title: '9. Electronic acceptance',
  s9_body: [
    'This agreement was accepted electronically by the person identified below, from an authenticated session. It is an electronic acceptance; it is not a qualified electronic signature.',
  ],
  s9_checkbox_label: 'Statement accepted',
  s9_declared_authority: 'Authority declared',
  s9_checkbox_accepted: 'Acceptance confirmed',
  s9_yes: 'Yes',
  s10_title: '10. Documents incorporated by reference',
  s10_body: [
    'The following documents form part of this agreement in the versions in force at the time of acceptance. Their identifiers and hashes are listed in the annex.',
  ],
  s11_title: '11. Revocation',
  s11_body: [
    'The Client may revoke this mandate at any time from their CAMBRA account or by contacting CAMBRA support. Revocation stops future authorized actions; it does not cancel fees already earned on savings already verified.',
  ],
  annex_title: 'Annex - Evidence of electronic acceptance',
  annex_intro: 'The following record was captured by CAMBRA at the time of acceptance.',
  annex_opened_at: 'Acceptance opened at',
  annex_authenticated_at: 'Session verified by server at',
  annex_signed_at: 'Acceptance recorded at',
  annex_snapshot_hash: 'Accepted terms hash (SHA-256)',
  annex_document_version: 'Mandate document version',
  annex_template_version: 'Document template version',
  annex_mandate_id: 'Mandate identifier',
  annex_activation_id: 'Activation identifier',
  annex_organization: 'Organization identifier',
  annex_supersedes: 'Supersedes mandate',
  annex_ip: 'IP address recorded',
  annex_ip_unavailable: 'Server-verified IP evidence unavailable',
  annex_user_agent: 'Browser user agent',
  annex_session_freshness: 'The session was verified as valid at the moment of acceptance. The elapsed time since the signatory last authenticated is not recorded.',
  page_of: 'Page',
  footer_note: 'Recover Margin - electronic acceptance record',
  not_available: 'Not available',
};

const FR: ContractStrings = {
  doc_title: 'Mandat commercial et accord de commission de succes',
  doc_subtitle: 'Recover Margin',
  product: 'Recover Margin',
  label_document_version: 'Version du document',
  label_template_version: 'Version du modele',
  label_mandate_reference: 'Reference de l\'accord',
  label_accepted_on: 'Accepte electroniquement le',
  label_language: 'Langue',
  provider_heading: 'Prestataire',
  provider_legal_form: 'Forme juridique',
  provider_address: 'Siege social',
  provider_registration: 'Numero d\'immatriculation',
  provider_vat: 'Identifiant TVA',
  provider_capital: 'Capital social',
  provider_representative: 'Represente par',
  provider_support: 'Contact',
  client_heading: 'Client',
  client_legal_name: 'Entite juridique',
  client_organization: 'Reference organisation',
  client_country: 'Pays',
  client_signatory: 'Signataire autorise',
  client_signatory_email: 'E-mail du signataire',
  client_signatory_role: 'Fonction du signataire',
  s1_title: '1. Objet',
  s1_body: [
    'Recover Margin est un service entre professionnels par lequel CAMBRA analyse les couts de paiement effectivement supportes par le Client et travaille a les reduire, soit en renegociant avec le prestataire existant du Client, soit en identifiant une meilleure alternative disponible.',
    'CAMBRA est remuneree exclusivement par une commission de succes sur les economies verifiees a partir des releves du prestataire du Client. En l\'absence d\'economie verifiee positive, aucune commission n\'est due.',
  ],
  s2_title: '2. Reference verifiee',
  s2_body: [
    'Les parties conviennent de la reference verifiee suivante, confirmee avant la presente acceptation, a partir de laquelle toute economie est mesuree.',
  ],
  s2_baseline_reference: 'Identifiant de la reference',
  s2_baseline_value: 'Valeur de reference',
  s2_baseline_type: 'Type de reference',
  s2_verified_at: 'Verifiee le',
  s3_title: '3. Commission de succes',
  s3_body: [
    'La commission est calculee comme suit : economie verifiee positive multipliee par le taux de commission effectif indique ci-dessous. La commission ne s\'applique qu\'aux economies effectivement verifiees ; les montants projetes sont indicatifs et ne creent aucune obligation.',
    'Le traitement fiscal n\'est pas traite par le present document.',
  ],
  s3_standard_fee: 'Commission standard',
  s3_discount: 'Remise appliquee',
  s3_effective_fee: 'Commission effective',
  s3_projected: 'Economie annuelle projetee (indicative)',
  s4_title: '4. Duree',
  s4_body: [
    'La commission de succes s\'applique pendant 24 mois a compter de l\'activation des nouvelles conditions approuvees.',
  ],
  s5_title: '5. Premiere periode mesuree et facturee',
  s5_body: [
    'Le mois d\'activation des nouvelles conditions n\'est pas facturable. Le premier mois calendaire complet suivant l\'activation constitue la premiere periode mesuree, facturee le mois suivant.',
    'En l\'absence d\'economie verifiee positive sur une periode mesuree, rien n\'est du pour cette periode.',
  ],
  s6_title: '6. Actions commerciales autorisees',
  s6_body: ['Le Client autorise CAMBRA a, pour son compte :'],
  s6_actions: [
    'analyser ses couts et conditions de paiement ;',
    'demander des informations et des offres aux prestataires ;',
    'contacter les prestataires ;',
    'negocier les conditions commerciales ;',
    'comparer les alternatives disponibles ;',
    'recommander une ligne de conduite ;',
    'coordonner la mise en oeuvre des conditions approuvees par le Client ;',
    'verifier les economies obtenues.',
  ],
  s7_title: '7. Limites du mandat',
  s7_body: ['Les limites suivantes font partie essentielle du present mandat :'],
  s7_limits: [
    'CAMBRA ne detient ni ne conserve les fonds du Client ;',
    'CAMBRA n\'execute pas les paiements du Client ;',
    'CAMBRA ne fournit pas le service de paiement reglemente ;',
    'CAMBRA n\'accepte pas d\'offres engageantes au nom du Client ;',
    'CAMBRA ne conclut pas de contrats au nom du Client ;',
    'aucun service n\'est migre ni modifie sans une approbation finale distincte du Client ;',
    'le prestataire reglemente continue de fournir le service ;',
    'le present mandat est revocable a tout moment ;',
    'les montants deja acquis sur des economies deja verifiees restent dus.',
  ],
  s8_title: '8. Mise en place du moyen de paiement',
  s8_body: [
    'Le moyen de paiement des futures factures de commission est mis en place separement, via le prestataire de paiement de CAMBRA. Le present document ne contient aucune donnee de carte ni de compte bancaire, et la mise en place d\'un moyen de paiement ne donne lieu a aucun prelevement a ce moment.',
  ],
  s9_title: '9. Acceptation electronique',
  s9_body: [
    'Le present accord a ete accepte electroniquement par la personne identifiee ci-dessous, depuis une session authentifiee. Il s\'agit d\'une acceptation electronique ; il ne s\'agit pas d\'une signature electronique qualifiee.',
  ],
  s9_checkbox_label: 'Declaration acceptee',
  s9_declared_authority: 'Pouvoir declare',
  s9_checkbox_accepted: 'Acceptation confirmee',
  s9_yes: 'Oui',
  s10_title: '10. Documents incorpores par reference',
  s10_body: [
    'Les documents suivants font partie du present accord dans les versions en vigueur au moment de l\'acceptation. Leurs identifiants et empreintes figurent en annexe.',
  ],
  s11_title: '11. Revocation',
  s11_body: [
    'Le Client peut revoquer le present mandat a tout moment depuis son compte CAMBRA ou en contactant le support CAMBRA. La revocation met fin aux actions autorisees futures ; elle n\'annule pas les commissions deja acquises sur des economies deja verifiees.',
  ],
  annex_title: 'Annexe - Preuve de l\'acceptation electronique',
  annex_intro: 'L\'enregistrement suivant a ete capture par CAMBRA au moment de l\'acceptation.',
  annex_opened_at: 'Acceptation ouverte le',
  annex_authenticated_at: 'Session verifiee par le serveur le',
  annex_signed_at: 'Acceptation enregistree le',
  annex_snapshot_hash: 'Empreinte des conditions acceptees (SHA-256)',
  annex_document_version: 'Version du document de mandat',
  annex_template_version: 'Version du modele de document',
  annex_mandate_id: 'Identifiant du mandat',
  annex_activation_id: 'Identifiant de l\'activation',
  annex_organization: 'Identifiant de l\'organisation',
  annex_supersedes: 'Remplace le mandat',
  annex_ip: 'Adresse IP enregistree',
  annex_ip_unavailable: 'Preuve d\'adresse IP verifiee par le serveur non disponible',
  annex_user_agent: 'Agent utilisateur du navigateur',
  annex_session_freshness: 'La session a ete verifiee comme valide au moment de l\'acceptation. Le temps ecoule depuis la derniere authentification du signataire n\'est pas enregistre.',
  page_of: 'Page',
  footer_note: 'Recover Margin - enregistrement d\'acceptation electronique',
  not_available: 'Non disponible',
};

const ES: ContractStrings = {
  doc_title: 'Mandato comercial y acuerdo de comision de exito',
  doc_subtitle: 'Recover Margin',
  product: 'Recover Margin',
  label_document_version: 'Version del documento',
  label_template_version: 'Version de la plantilla',
  label_mandate_reference: 'Referencia del acuerdo',
  label_accepted_on: 'Aceptado electronicamente el',
  label_language: 'Idioma',
  provider_heading: 'Prestador del servicio',
  provider_legal_form: 'Forma juridica',
  provider_address: 'Domicilio social',
  provider_registration: 'Numero de registro',
  provider_vat: 'Identificacion a efectos de IVA',
  provider_capital: 'Capital social',
  provider_representative: 'Representado por',
  provider_support: 'Contacto',
  client_heading: 'Cliente',
  client_legal_name: 'Entidad juridica',
  client_organization: 'Referencia de organizacion',
  client_country: 'Pais',
  client_signatory: 'Firmante autorizado',
  client_signatory_email: 'Email del firmante',
  client_signatory_role: 'Cargo del firmante',
  s1_title: '1. Objeto',
  s1_body: [
    'Recover Margin es un servicio entre empresas por el que CAMBRA analiza los costes de pago que el Cliente paga realmente y trabaja para reducirlos, bien renegociando con el proveedor actual del Cliente, bien identificando una mejor alternativa disponible.',
    'CAMBRA se remunera exclusivamente mediante una comision de exito sobre el ahorro verificado contra los propios extractos del proveedor del Cliente. Si no se consigue un ahorro verificado positivo, no se devenga ninguna comision.',
  ],
  s2_title: '2. Baseline verificado',
  s2_body: [
    'Las partes acuerdan la siguiente cifra de partida verificada, confirmada antes de esta aceptacion, que es la referencia contra la que se mide cualquier ahorro.',
  ],
  s2_baseline_reference: 'Referencia del baseline',
  s2_baseline_value: 'Valor del baseline',
  s2_baseline_type: 'Tipo de baseline',
  s2_verified_at: 'Verificado el',
  s3_title: '3. Comision de exito',
  s3_body: [
    'La comision se calcula como: ahorro verificado positivo multiplicado por el tipo de comision efectiva indicado a continuacion. La comision se aplica unicamente al ahorro efectivamente verificado; las cifras proyectadas son indicativas y no generan obligacion alguna.',
    'El tratamiento fiscal no se aborda en este documento.',
  ],
  s3_standard_fee: 'Comision estandar',
  s3_discount: 'Descuento aplicado',
  s3_effective_fee: 'Comision efectiva',
  s3_projected: 'Ahorro anual proyectado (indicativo)',
  s4_title: '4. Duracion',
  s4_body: [
    'La comision de exito se aplica durante 24 meses desde la activacion de las nuevas condiciones aprobadas.',
  ],
  s5_title: '5. Primer periodo medido y facturado',
  s5_body: [
    'El mes en que se activan las nuevas condiciones no es facturable. El primer mes natural completo posterior a la activacion es el primer periodo medido, y se factura al mes siguiente.',
    'Si no existe ahorro verificado positivo en un periodo medido, nada se debe por ese periodo.',
  ],
  s6_title: '6. Actuaciones comerciales autorizadas',
  s6_body: ['El Cliente autoriza a CAMBRA a, por cuenta del Cliente:'],
  s6_actions: [
    'analizar sus costes y condiciones de pago;',
    'solicitar informacion y ofertas a proveedores;',
    'contactar con proveedores;',
    'negociar condiciones comerciales;',
    'comparar alternativas disponibles;',
    'recomendar un curso de accion;',
    'coordinar la implementacion de las condiciones aprobadas por el Cliente;',
    'verificar los ahorros obtenidos.',
  ],
  s7_title: '7. Limites del mandato',
  s7_body: ['Los siguientes limites son parte esencial de este mandato:'],
  s7_limits: [
    'CAMBRA no custodia ni mantiene fondos del Cliente;',
    'CAMBRA no ejecuta los pagos del Cliente;',
    'CAMBRA no presta el servicio de pago regulado;',
    'CAMBRA no acepta ofertas vinculantes en nombre del Cliente;',
    'CAMBRA no contrata en nombre del Cliente;',
    'ningun servicio se migra ni se modifica sin una aprobacion final separada del Cliente;',
    'el proveedor regulado continua prestando el servicio;',
    'este mandato es revocable en cualquier momento;',
    'las cantidades ya devengadas sobre ahorros ya verificados siguen siendo pagaderas.',
  ],
  s8_title: '8. Configuracion del metodo de pago',
  s8_body: [
    'El metodo de pago de las futuras facturas de comision se configura por separado, a traves del proveedor de pagos de CAMBRA. Este documento no contiene datos de tarjeta ni de cuenta bancaria, y configurar un metodo de pago no genera ningun cobro en ese momento.',
  ],
  s9_title: '9. Aceptacion electronica',
  s9_body: [
    'Este acuerdo fue aceptado electronicamente por la persona identificada a continuacion, desde una sesion autenticada. Se trata de una aceptacion electronica; no es una firma electronica cualificada.',
  ],
  s9_checkbox_label: 'Declaracion aceptada',
  s9_declared_authority: 'Poder declarado',
  s9_checkbox_accepted: 'Aceptacion confirmada',
  s9_yes: 'Si',
  s10_title: '10. Documentos incorporados por referencia',
  s10_body: [
    'Los siguientes documentos forman parte de este acuerdo en las versiones vigentes en el momento de la aceptacion. Sus identificadores y hashes constan en el anexo.',
  ],
  s11_title: '11. Revocacion',
  s11_body: [
    'El Cliente puede revocar este mandato en cualquier momento desde su cuenta de CAMBRA o contactando con el soporte de CAMBRA. La revocacion detiene las actuaciones autorizadas futuras; no cancela comisiones ya devengadas sobre ahorros ya verificados.',
  ],
  annex_title: 'Anexo - Prueba de la aceptacion electronica',
  annex_intro: 'CAMBRA registro la siguiente evidencia en el momento de la aceptacion.',
  annex_opened_at: 'Aceptacion iniciada el',
  annex_authenticated_at: 'Sesion verificada por el servidor el',
  annex_signed_at: 'Aceptacion registrada el',
  annex_snapshot_hash: 'Hash de las condiciones aceptadas (SHA-256)',
  annex_document_version: 'Version del documento de mandato',
  annex_template_version: 'Version de la plantilla del documento',
  annex_mandate_id: 'Identificador del mandato',
  annex_activation_id: 'Identificador de la activacion',
  annex_organization: 'Identificador de la organizacion',
  annex_supersedes: 'Sustituye al mandato',
  annex_ip: 'Direccion IP registrada',
  annex_ip_unavailable: 'Evidencia de IP verificada por el servidor no disponible',
  annex_user_agent: 'Agente de usuario del navegador',
  annex_session_freshness: 'La sesion se verifico como valida en el momento de la aceptacion. El tiempo transcurrido desde la ultima autenticacion del firmante no queda registrado.',
  page_of: 'Pagina',
  footer_note: 'Recover Margin - registro de aceptacion electronica',
  not_available: 'No disponible',
};

const TEMPLATES: Record<ContractLocale, ContractStrings> = { en: EN, fr: FR, es: ES };

export function contractStrings(locale: ContractLocale): ContractStrings {
  return TEMPLATES[locale] || EN;
}