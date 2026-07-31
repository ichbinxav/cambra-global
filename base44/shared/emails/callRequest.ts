// emails/callRequest — confirmation sent to a merchant who requests a call.
// EMAIL-1 (2026-07-31): localized EN/FR/ES. Copy unchanged in substance.

import { normalizeLocale, type EmailLocale } from '../emailLocale.ts';
import { shell, eyebrow, h1, p, footer, type Email } from './layout.ts';

type Params = { name?: string };

const COPY: Record<EmailLocale, {
  subject: string; thanks: (name: string) => string; body: string; foot: string;
}> = {
  en: {
    subject: 'We got your request — CAMBRA',
    thanks: (n) => `Thanks${n ? `, ${n}` : ''}.`,
    body: "We got your request and we'll reach out to schedule a call. Talk soon.",
    foot: 'CAMBRA · Payments margin recovery.',
  },
  fr: {
    subject: 'Nous avons bien reçu votre demande — CAMBRA',
    thanks: (n) => `Merci${n ? `, ${n}` : ''}.`,
    body: 'Nous avons bien reçu votre demande et nous vous contacterons pour fixer un rendez-vous téléphonique. À très vite.',
    foot: 'CAMBRA · Récupération de marge sur les paiements.',
  },
  es: {
    subject: 'Hemos recibido tu solicitud — CAMBRA',
    thanks: (n) => `Gracias${n ? `, ${n}` : ''}.`,
    body: 'Hemos recibido tu solicitud y te escribiremos para concertar una llamada. Hasta pronto.',
    foot: 'CAMBRA · Recuperación de margen en pagos.',
  },
};

export function callRequestEmail(localeRaw: unknown, params: Params = {}): Email {
  const locale = normalizeLocale(localeRaw);
  const c = COPY[locale];
  const name = String(params.name || '').trim();

  return {
    subject: c.subject,
    html: shell([eyebrow('CAMBRA'), h1(c.thanks(name)), p(c.body, 24), footer(c.foot)].join('')),
  };
}