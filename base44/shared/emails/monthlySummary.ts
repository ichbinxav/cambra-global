// emails/monthlySummary — the monthly savings summary sent to opted-in users.
// Triggered by sendMonthlySavingsSummary.
//
// P0.2 (2026-08-04): payments-only. Removed the multi-vertical efficiency
// score card and the breakdown-by-area section (which listed shipping,
// saas, and insurance alongside payments — redundant in a payments-only
// product). The email now reports: identified annual savings, per-month
// potential, and cumulative estimate — all card-payment figures.
//
// EMAIL-1 (2026-07-31): localized EN/FR/ES.

import { normalizeLocale, fmtEur, fmtMonthYear, type EmailLocale } from '../emailLocale.ts';
import { type Email } from './layout.ts';

type Params = {
  firstName: string;
  total: number;
  monthly: number;
  cumulative: number;
  appDomain: string;
  now?: Date;
};

const COPY: Record<EmailLocale, {
  subject: (month: string) => string;
  h1: string;
  hi: (name: string) => string;
  identified: string;
  perMonth: (amount: string) => string;
  cumulative: string;
  cta: string;
  optout: (href: string, label: string) => string;
  optoutLink: string;
}> = {
  en: {
    subject: (m) => `Your CAMBRA savings summary — ${m}`,
    h1: 'Your monthly savings summary',
    hi: (n) => `Hi${n ? ` ${n}` : ' there'}, here's what your card payments look like this month.`,
    identified: 'Identified annual savings',
    perMonth: (a) => `≈ ${a} / month potential`,
    cumulative: 'Cumulative est.',
    cta: 'Open dashboard →',
    optout: (href, label) => `You're receiving this because monthly summaries are enabled on your CAMBRA account. You can turn them off anytime in <a href="${href}" style="color:#666;">${label}</a>.`,
    optoutLink: 'Account settings',
  },
  fr: {
    subject: (m) => `Votre résumé d'économies CAMBRA — ${m}`,
    h1: "Votre résumé mensuel d'économies",
    hi: (n) => `Bonjour${n ? ` ${n}` : ''}, voici où en sont vos paiements par carte ce mois-ci.`,
    identified: 'Économies annuelles identifiées',
    perMonth: (a) => `≈ ${a} / mois de potentiel`,
    cumulative: 'Cumul estimé',
    cta: 'Ouvrir le tableau de bord →',
    optout: (href, label) => `Vous recevez ce message parce que les résumés mensuels sont activés sur votre compte CAMBRA. Vous pouvez les désactiver à tout moment dans <a href="${href}" style="color:#666;">${label}</a>.`,
    optoutLink: 'les paramètres du compte',
  },
  es: {
    subject: (m) => `Tu resumen de ahorros CAMBRA — ${m}`,
    h1: 'Tu resumen mensual de ahorros',
    hi: (n) => `Hola${n ? ` ${n}` : ''}, así están tus pagos con tarjeta este mes.`,
    identified: 'Ahorro anual identificado',
    perMonth: (a) => `≈ ${a} / mes de potencial`,
    cumulative: 'Acumulado est.',
    cta: 'Abrir el panel →',
    optout: (href, label) => `Recibes este correo porque tienes activados los resúmenes mensuales en tu cuenta de CAMBRA. Puedes desactivarlos cuando quieras en <a href="${href}" style="color:#666;">${label}</a>.`,
    optoutLink: 'los ajustes de la cuenta',
  },
};

export function monthlySummaryEmail(localeRaw: unknown, params: Params): Email {
  const locale = normalizeLocale(localeRaw);
  const c = COPY[locale];
  const { firstName, total, monthly, cumulative, appDomain } = params;
  const monthName = fmtMonthYear(params.now || new Date(), locale);

  return {
    subject: c.subject(monthName),
    html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:580px;margin:0 auto;color:#0a0a0a;background:#fbfaf7;padding:40px 24px;">
            <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#999;margin:0 0 4px;">CAMBRA · ${monthName}</p>
            <h1 style="font-size:28px;font-weight:900;letter-spacing:-0.03em;margin:0 0 8px;">${c.h1}</h1>
            <p style="font-size:14px;color:#666;margin:0 0 28px;">${c.hi(firstName)}</p>

            <div style="background:#fff;border:1px solid #eee;border-radius:16px;padding:28px;margin-bottom:16px;">
              <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 8px;">${c.identified}</p>
              <p style="font-size:42px;font-weight:900;letter-spacing:-0.04em;margin:0 0 4px;">${fmtEur(total, locale)}</p>
              <p style="font-size:13px;color:#666;margin:0;">${c.perMonth(fmtEur(monthly, locale))}</p>
            </div>

            <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin-bottom:24px;">
              <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 4px;">${c.cumulative}</p>
              <p style="font-size:22px;font-weight:900;margin:0;">${fmtEur(cumulative, locale)}</p>
            </div>

            <a href="https://${appDomain}/Dashboard" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:700;">${c.cta}</a>

            <p style="font-size:11px;color:#999;margin-top:32px;line-height:1.6;">
              ${c.optout(`https://${appDomain}/Account`, c.optoutLink)}
            </p>
          </div>
        `,
  };
}