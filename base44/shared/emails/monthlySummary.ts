// emails/monthlySummary — the monthly savings summary sent to opted-in users.
// Triggered by sendMonthlySavingsSummary.
//
// EMAIL-1 (2026-07-31):
//   · localized EN/FR/ES (subject + body + month name + currency grouping);
//   · pre-pivot copy corrected: "how your infrastructure is performing" and
//     "Infra Score" are gone (multi-vertical, pre-payments-cutover language),
//     and the dashboard/account links now use APP_DOMAIN instead of the
//     hardcoded app.base44.com host.
//
// NOT changed: the arithmetic. total / monthly / cumulative / score / the
// breakdown rows are computed by the caller exactly as before — this module
// only renders them. The breakdown labels keep all four verticals because the
// caller still filters rows to v > 0, and post-pivot only the payments row is
// populated; a legacy row from an old analysis still renders with a real name.

import { normalizeLocale, fmtEur, fmtMonthYear, type EmailLocale } from '../emailLocale.ts';
import { type Email } from './layout.ts';

type BreakdownRow = { key: 'payments' | 'shipping' | 'saas' | 'insurance'; v: number };

type Params = {
  firstName: string;
  total: number;
  monthly: number;
  cumulative: number;
  score: number;
  breakdown: BreakdownRow[];
  appDomain: string;
  now?: Date;
};

const COPY: Record<EmailLocale, {
  subject: (month: string) => string;
  h1: string;
  hi: (name: string) => string;
  identified: string;
  perMonth: (amount: string) => string;
  score: string;
  cumulative: string;
  breakdownTitle: string;
  rows: Record<BreakdownRow['key'], string>;
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
    score: 'Efficiency score',
    cumulative: 'Cumulative est.',
    breakdownTitle: 'Breakdown by area',
    rows: { payments: 'Card payments', shipping: 'Shipping', saas: 'Software', insurance: 'Insurance' },
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
    score: "Score d'efficacité",
    cumulative: 'Cumul estimé',
    breakdownTitle: 'Détail par poste',
    rows: { payments: 'Paiements par carte', shipping: 'Livraison', saas: 'Logiciels', insurance: 'Assurance' },
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
    score: 'Puntuación de eficiencia',
    cumulative: 'Acumulado est.',
    breakdownTitle: 'Desglose por área',
    rows: { payments: 'Pagos con tarjeta', shipping: 'Envíos', saas: 'Software', insurance: 'Seguros' },
    cta: 'Abrir el panel →',
    optout: (href, label) => `Recibes este correo porque tienes activados los resúmenes mensuales en tu cuenta de CAMBRA. Puedes desactivarlos cuando quieras en <a href="${href}" style="color:#666;">${label}</a>.`,
    optoutLink: 'los ajustes de la cuenta',
  },
};

export function monthlySummaryEmail(localeRaw: unknown, params: Params): Email {
  const locale = normalizeLocale(localeRaw);
  const c = COPY[locale];
  const { firstName, total, monthly, cumulative, score, breakdown, appDomain } = params;
  const monthName = fmtMonthYear(params.now || new Date(), locale);

  const breakdownHtml = breakdown.map((b) => `
          <tr>
            <td style="padding:10px 0;color:#525252;font-size:14px;">${c.rows[b.key]}</td>
            <td style="padding:10px 0;text-align:right;font-weight:700;color:#0a0a0a;font-size:14px;">${fmtEur(b.v, locale)}</td>
          </tr>
        `).join('');

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

            <div style="display:flex;gap:8px;margin-bottom:24px;">
              <div style="flex:1;background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;">
                <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 4px;">${c.score}</p>
                <p style="font-size:22px;font-weight:900;margin:0;">${score}/100</p>
              </div>
              <div style="flex:1;background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;">
                <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 4px;">${c.cumulative}</p>
                <p style="font-size:22px;font-weight:900;margin:0;">${fmtEur(cumulative, locale)}</p>
              </div>
            </div>

            ${breakdown.length ? `
              <div style="background:#fff;border:1px solid #eee;border-radius:16px;padding:24px;margin-bottom:24px;">
                <p style="font-size:12px;font-weight:700;margin:0 0 12px;">${c.breakdownTitle}</p>
                <table style="width:100%;border-collapse:collapse;">${breakdownHtml}</table>
              </div>
            ` : ''}

            <a href="https://${appDomain}/Dashboard" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:700;">${c.cta}</a>

            <p style="font-size:11px;color:#999;margin-top:32px;line-height:1.6;">
              ${c.optout(`https://${appDomain}/Account`, c.optoutLink)}
            </p>
          </div>
        `,
  };
}