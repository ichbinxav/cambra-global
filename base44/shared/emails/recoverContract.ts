// emails/recoverContract — RECOVER-3 (2026-08-03).
//
// The transactional email that delivers the Recover Margin agreement.
//
// TWO MUTUALLY EXCLUSIVE BODIES, exactly one per message: either the document is
// attached, or it is available via a secure download. Never both — a merchant who
// reads "attached" and finds nothing attached has been told something false.
// TODAY the platform's send integration accepts no attachments, so callers pass
// `attached: false` and the download variant is used; the attached wording exists
// so switching providers is a flag, not a rewrite.
//
// This email is TRANSACTIONAL: no marketing, no opt-in, no newsletter. It also
// claims nothing that may not be true yet — no payment method, no invoice, no
// charge, no completed migration, and never a qualified signature.

import { normalizeLocale, type EmailLocale } from '../emailLocale.ts';
import { shell, eyebrow, h1, p, footer, button, type Email } from './layout.ts';

type Vars = {
  firstName: string;
  acceptanceDate: string;
  reference: string;
  downloadUrl: string;
  attached: boolean;
  // v61 (Checkpoint C) — contractual fee duration from the resolved contract
  // economic view (buildContractEconomicView), never a hardcoded 24.
  durationMonths: number;
};

const COPY = {
  en: {
    subject: 'Your Recover Margin agreement',
    eyebrow: 'Recover Margin',
    title: 'Your agreement is recorded',
    hello: (n: string) => `Hello ${n},`,
    recorded: 'Your electronic acceptance of Recover Margin has been recorded.',
    terms: (d: string, m: number) =>
      `Your agreement includes the verified baseline, the applicable success fee and the ${m}-month term accepted on ${d}. No payment was taken when you completed the acceptance.`,
    attached: 'Your agreement is attached to this email.',
    download: 'You can download your agreement securely from your CAMBRA account.',
    cta: 'Download your agreement',
    fee: 'Recover Margin will only generate a CAMBRA fee when a positive verified saving is achieved, under the conditions stated in your agreement.',
    ref: (r: string) => `Agreement reference: ${r}`,
    help: 'If you have any questions, reply to this email or contact CAMBRA support.',
  },
  fr: {
    subject: 'Votre accord Recover Margin',
    eyebrow: 'Recover Margin',
    title: 'Votre accord est enregistré',
    hello: (n: string) => `Bonjour ${n},`,
    recorded: 'Votre acceptation électronique de Recover Margin a bien été enregistrée.',
    terms: (d: string, m: number) =>
      `Votre accord reprend la référence vérifiée, la commission de succès applicable et la durée de ${m} mois acceptées le ${d}. Aucun paiement n'a été prélevé lors de votre acceptation.`,
    attached: 'Votre accord est joint à cet e-mail.',
    download: 'Vous pouvez télécharger votre accord de manière sécurisée depuis votre compte CAMBRA.',
    cta: 'Télécharger votre accord',
    fee: "Recover Margin ne génère une commission CAMBRA que lorsqu'une économie vérifiée positive est obtenue, conformément aux conditions de votre accord.",
    ref: (r: string) => `Référence de l'accord : ${r}`,
    help: 'Si vous avez des questions, répondez à cet e-mail ou contactez le support CAMBRA.',
  },
  es: {
    subject: 'Tu acuerdo Recover Margin',
    eyebrow: 'Recover Margin',
    title: 'Tu acuerdo está registrado',
    hello: (n: string) => `Hola ${n},`,
    recorded: 'Tu aceptación electrónica de Recover Margin se ha registrado correctamente.',
    terms: (d: string, m: number) =>
      `Tu acuerdo recoge el baseline verificado, la comisión de éxito aplicable y la duración de ${m} meses que aceptaste el ${d}. No se realizó ningún cobro al completar la aceptación.`,
    attached: 'Tu acuerdo está adjunto a este email.',
    download: 'Puedes descargar tu acuerdo de forma segura desde tu cuenta de CAMBRA.',
    cta: 'Descargar tu acuerdo',
    fee: 'Recover Margin solo genera una comisión de CAMBRA cuando se consigue un ahorro verificado positivo, de acuerdo con las condiciones de tu contrato.',
    ref: (r: string) => `Referencia del acuerdo: ${r}`,
    help: 'Si tienes alguna pregunta, responde a este email o contacta con el equipo de soporte de CAMBRA.',
  },
} as const;

export function recoverContractEmail(locale: unknown, vars: Vars): Email {
  const l: EmailLocale = normalizeLocale(locale);
  const c = COPY[l];

  const parts = [
    eyebrow(c.eyebrow),
    h1(c.title),
    p(c.hello(vars.firstName)),
    p(c.recorded),
    p(c.terms(vars.acceptanceDate, vars.durationMonths)),
    // Exactly one of the two — never both.
    p(vars.attached ? c.attached : c.download),
  ];
  if (!vars.attached) parts.push(`<p style="margin:8px 0 24px;">${button(vars.downloadUrl, c.cta)}</p>`);
  parts.push(p(c.fee));
  parts.push(p(c.ref(vars.reference)));
  parts.push(footer(`${c.help}<br/>CAMBRA GLOBAL`));

  return { subject: c.subject, html: shell(parts.join('')) };
}