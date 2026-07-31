// emails/collectiveJoin — confirmation sent to a merchant who joins the
// CAMBRA Collective (founding member).
//
// EMAIL-1 (2026-07-31):
//   · T1 — the "The Collective Terms are a draft pending legal review" footer
//     line is GONE. COPY-1/LEGAL-2 removed that labelling from the clickwrap
//     UI at the founder's instruction; keeping it in the email meant the two
//     surfaces disagreed about the status of the same document. The scope of
//     what the member accepted is unchanged — only the status qualifier is.
//   · T3 — localized EN/FR/ES. Tuteo in ES, vouvoiement in FR.
//
// Commitment-bearing sentences ("we don't promise a specific rate up front",
// "we only ever charge on savings that actually materialize") are TRANSLATED,
// not reinterpreted: the three versions say the same thing about money.

import { normalizeLocale, fmtEur, type EmailLocale } from '../emailLocale.ts';
import { shell, eyebrow, h1, p, footer, type Email } from './layout.ts';

type Params = { gmvEurMonthly?: number | null };

const COPY: Record<EmailLocale, {
  subject: string; eyebrow: string; h1: string;
  lead: string; gmv: (amount: string) => string; next: string; foot: string;
}> = {
  en: {
    subject: "You're in — CAMBRA Collective (founding member)",
    eyebrow: 'CAMBRA COLLECTIVE',
    h1: "You're in — founding member.",
    lead: "Welcome to the CAMBRA Collective. You've joined as a founding member — many businesses negotiating as one to recover the margin each of us loses on card payments.",
    gmv: (a) => `<strong>${a}/mo</strong> in sales added to the collective's negotiating weight.`,
    next: "What happens next: we'll reach out as the collective grows and we're ready to negotiate on your behalf. We don't promise a specific rate up front — we only ever charge on savings that actually materialize.",
    foot: 'CAMBRA · Payments margin recovery.',
  },
  fr: {
    subject: 'Vous y êtes — Collectif CAMBRA (membre fondateur)',
    eyebrow: 'COLLECTIF CAMBRA',
    h1: 'Vous y êtes — membre fondateur.',
    lead: "Bienvenue dans le Collectif CAMBRA. Vous le rejoignez comme membre fondateur — de nombreux commerces qui négocient comme un seul, pour récupérer la marge que chacun de nous perd sur les paiements par carte.",
    gmv: (a) => `<strong>${a}/mois</strong> de ventes ajoutées au poids de négociation du collectif.`,
    next: "La suite : nous vous contacterons à mesure que le collectif grandit et que nous serons prêts à négocier en votre nom. Nous ne promettons pas de tarif précis à l'avance — nous ne facturons jamais que sur des économies réellement obtenues.",
    foot: 'CAMBRA · Récupération de marge sur les paiements.',
  },
  es: {
    subject: 'Ya estás dentro — Colectivo CAMBRA (socio fundador)',
    eyebrow: 'COLECTIVO CAMBRA',
    h1: 'Ya estás dentro — socio fundador.',
    lead: 'Bienvenido al Colectivo CAMBRA. Entras como socio fundador — muchos comercios negociando como uno solo para recuperar el margen que cada uno perdemos en los pagos con tarjeta.',
    gmv: (a) => `<strong>${a}/mes</strong> de ventas sumadas al peso negociador del colectivo.`,
    next: 'Qué pasa ahora: te escribiremos a medida que el colectivo crezca y estemos listos para negociar en tu nombre. No prometemos una tarifa concreta por adelantado — solo cobramos sobre ahorros que se materializan de verdad.',
    foot: 'CAMBRA · Recuperación de margen en pagos.',
  },
};

export function collectiveJoinEmail(localeRaw: unknown, params: Params = {}): Email {
  const locale = normalizeLocale(localeRaw);
  const c = COPY[locale];
  const gmv = Number(params.gmvEurMonthly);
  const gmvLine = Number.isFinite(gmv) && gmv > 0 ? p(c.gmv(fmtEur(gmv, locale))) : '';

  return {
    subject: c.subject,
    html: shell([eyebrow(c.eyebrow), h1(c.h1), p(c.lead), gmvLine, p(c.next, 24), footer(c.foot)].join('')),
  };
}