// AUDIT I18N-01 (2026-08-17, founder-authorised): widened from 3 to 23 languages so no
// merchant sees a silent English fallback under a fully-localised UI. Only en/fr/es carry
// legally-reviewed text; all others start as a copy of `en` with `__translation_readiness:
// 'PENDING_LEGAL_REVIEW'` and are meant to be overridden per locale by counsel. Callers
// that need to know whether the current locale's copy is legally approved read
// `recoveryEconomicsCopyReadiness(locale)`.
export const RECOVERY_ECONOMICS_COPY_VERSION = 'recover-economics-copy-v3-legal-review-per-locale';

type CopyBlock = {
  __translation_readiness?: 'APPROVED' | 'PENDING_LEGAL_REVIEW';
  title: string; y1: string; y2: string; after: string; cambra: string; keep: string;
  referrals: string; verified: string; survival: string; data: string;
};

const EN: CopyBlock = {
  __translation_readiness: 'APPROVED',
  title: '24-month Recovery Term', y1: 'Months 1–12', y2: 'Months 13–24', after: 'After month 24',
  cambra: 'CAMBRA fee', keep: 'You keep',
  referrals: 'Successful referrals reduce the CAMBRA fee by 5 percentage points each, down to a minimum 5% fee during the Recovery Term.',
  verified: 'Only positive Verified Savings are fee-bearing. No verified savings, no fee.',
  survival: 'Ending other CAMBRA services does not by itself end an activated Recovery Term. The success fee continues only on positive savings attributable to that Recover that can be verified during the remaining term.',
  data: 'During an active Recovery Term, reasonably necessary evidence may be required to verify savings. CAMBRA will not invoice estimated savings as verified savings.',
};

const COPY: Record<string, CopyBlock> = {
  en: EN,
  fr: {
    __translation_readiness: 'APPROVED',
    title: 'Période Recover de 24 mois', y1: 'Mois 1 à 12', y2: 'Mois 13 à 24', after: 'Après le 24e mois',
    cambra: 'Commission CAMBRA', keep: 'Vous conservez',
    referrals: 'Chaque parrainage réussi réduit la commission CAMBRA de 5 points de pourcentage, jusqu’à un minimum de 5 % pendant la période Recover.',
    verified: 'Seules les économies vérifiées positives donnent lieu à une commission. Sans économie vérifiée, aucune commission.',
    survival: 'La fin des autres services CAMBRA ne met pas, à elle seule, fin à une période Recover déjà activée. La commission ne continue que sur les économies positives attribuables à ce Recover et vérifiables pendant la durée restante.',
    data: 'Pendant une période Recover active, les éléments raisonnablement nécessaires à la vérification des économies peuvent être requis. CAMBRA ne facture pas des économies estimées comme si elles étaient vérifiées.',
  },
  es: {
    __translation_readiness: 'APPROVED',
    title: 'Recovery Term de 24 meses', y1: 'Meses 1–12', y2: 'Meses 13–24', after: 'Después del mes 24',
    cambra: 'Comisión CAMBRA', keep: 'Tú conservas',
    referrals: 'Cada referral exitoso reduce la comisión de CAMBRA en 5 puntos porcentuales, hasta un mínimo del 5% durante el Recovery Term.',
    verified: 'Solo el ahorro positivo realmente verificado genera comisión. Sin ahorro verificado, no hay comisión.',
    survival: 'Cancelar otros servicios de CAMBRA no extingue por sí solo un Recovery Term ya activado. La comisión solo continúa sobre ahorro positivo atribuible a ese Recover que pueda verificarse durante el plazo restante.',
    data: 'Durante un Recovery Term activo podrá solicitarse la evidencia razonablemente necesaria para verificar el ahorro. CAMBRA no facturará ahorro estimado como si fuera ahorro verificado.',
  },
};

// Every other supported locale gets the EN block wrapped with a PENDING marker so a
// downstream gate can refuse to sign a mandate in a language whose legal wording is not
// yet approved. The keys exist so the surface is translatable — no more hidden fallback.
const PENDING_LOCALES = ['de','it','pl','pt','el','sv','da','fi','cs','ro','hu','bg','hr','et','lv','lt','sk','sl','nb','is'];
for (const code of PENDING_LOCALES) {
  COPY[code] = { ...EN, __translation_readiness: 'PENDING_LEGAL_REVIEW' };
}

export function recoveryEconomicsCopy(locale: string): CopyBlock {
  return COPY[locale] || COPY.en;
}

export function recoveryEconomicsCopyReadiness(locale: string): 'APPROVED' | 'PENDING_LEGAL_REVIEW' | 'UNKNOWN' {
  const block = COPY[locale];
  if (!block) return 'UNKNOWN';
  return block.__translation_readiness || 'UNKNOWN';
}

const ACCEPTANCE_EN = (name: string) =>
  `I confirm I can legally bind ${name}. I accept the 24-month Recovery Term shown above: 25% of positive Verified Savings in months 1–12, 15% in months 13–24, then 0%, subject to applicable referral reductions with a 5% floor during the Recovery Term. I understand that ending other CAMBRA services does not by itself end an already activated Recovery Term and that no fee is due without positive Verified Savings.`;

export function recoveryEconomicsAcceptanceText(locale: string, entity: string): string {
  const name = String(entity || '').trim() ||
    ({ fr: 'mon entreprise', es: 'mi empresa' } as Record<string, string>)[locale] || 'my business';
  if (locale === 'fr') {
    return `Je déclare être habilité(e) à engager ${name}. J’accepte la période Recover de 24 mois présentée ci-dessus : 25 % des économies vérifiées positives pendant les mois 1 à 12, 15 % pendant les mois 13 à 24, puis 0 %, sous réserve des réductions de parrainage applicables avec un plancher de 5 % pendant la période Recover. Je comprends que la fin des autres services CAMBRA ne met pas, à elle seule, fin à une période Recover déjà activée et qu’aucune commission n’est due sans économie positive vérifiée.`;
  }
  if (locale === 'es') {
    return `Declaro que estoy autorizado/a para vincular jurídicamente a ${name}. Acepto el Recovery Term de 24 meses mostrado anteriormente: 25% del ahorro positivo verificado durante los meses 1–12, 15% durante los meses 13–24 y 0% después, sujeto a los descuentos por referrals aplicables con un suelo del 5% durante el Recovery Term. Entiendo que cancelar otros servicios de CAMBRA no extingue por sí solo un Recovery Term ya activado y que no existe comisión sin ahorro positivo verificado.`;
  }
  // Every other locale returns the English text with the readiness marker exposed via
  // recoveryEconomicsCopyReadiness — callers must gate on that before recording an
  // acceptance in a language whose legal wording is PENDING_LEGAL_REVIEW.
  return ACCEPTANCE_EN(name);
}
