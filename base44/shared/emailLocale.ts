// emailLocale — single source of truth for "which language do we email this
// person in".
//
// EMAIL-1 (2026-07-31). The rule is deliberately dumb and total:
//   · exactly three supported locales (en/fr/es), mirroring the UI switcher;
//   · anything else — empty, null, "de", "EN-GB", a number, garbage — resolves
//     to 'en'. A send NEVER fails for lack of a language.
//
// The value itself is captured client-side from the active UI language (the
// same value that governs `cambra_lang` in localStorage) and persisted on the
// record that triggers the email. We deliberately do NOT infer it from the
// Accept-Language header in the backend: the visitor may have picked a
// language manually in the switcher, and that manual choice wins (same
// doctrine as UX-1 T0).

export type EmailLocale = 'en' | 'fr' | 'es';

export const SUPPORTED_EMAIL_LOCALES: EmailLocale[] = ['en', 'fr', 'es'];

export function normalizeLocale(value: unknown): EmailLocale {
  const raw = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 2) : '';
  return (SUPPORTED_EMAIL_LOCALES as string[]).includes(raw) ? (raw as EmailLocale) : 'en';
}

// Number/currency formatting must follow the recipient's locale too — a French
// reader expects "1 250 €"-style grouping, not "1,250". Same locale map the
// frontend i18n module uses (CURRENCY_LOCALES).
const INTL_LOCALES: Record<EmailLocale, string> = { en: 'en-IE', fr: 'fr-FR', es: 'es-ES' };

export function fmtEur(amount: number, locale: EmailLocale): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat(INTL_LOCALES[locale], {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    }).format(Math.round(n));
  } catch {
    return `€${Math.round(n).toLocaleString('en-US')}`;
  }
}

export function fmtMonthYear(date: Date, locale: EmailLocale): string {
  try {
    return new Intl.DateTimeFormat(INTL_LOCALES[locale], { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return date.toISOString().slice(0, 7);
  }
}