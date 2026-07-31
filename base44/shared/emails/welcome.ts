// emails/welcome — sent once, when a Brand is created (onboarding complete).
// Triggered by onBrandCreated.
//
// EMAIL-1 (2026-07-31): localized EN/FR/ES. The English copy is the
// payments-only one landed in COPY-2B (the pre-pivot "shipping and SaaS" /
// "Member Network" version is gone); FR and ES are translations of that.

import { normalizeLocale, type EmailLocale } from '../emailLocale.ts';
import { type Email } from './layout.ts';

type Params = { brandName: string; appDomain: string };

const COPY: Record<EmailLocale, {
  subject: string; welcome: (b: string) => string; intro: string;
  unlocked: string;
  f1t: string; f1d: string; f2t: string; f2d: string; f3t: string; f3d: string;
  start: string; cta: string; foot: string;
}> = {
  en: {
    subject: "Welcome to CAMBRA — let's see what you're paying",
    welcome: (b) => `Welcome, ${b}.`,
    intro: "You've joined CAMBRA — we help independent businesses stop overpaying on card payments.",
    unlocked: "What's unlocked",
    f1t: 'The analyzer',
    f1d: 'See what you pay on card payments, and the minimum banks and card networks allow.',
    f2t: 'Verified figures',
    f2d: 'Connect your payment provider, read-only, and your estimate becomes a measured number.',
    f3t: 'The collective',
    f3d: 'Many businesses negotiating as one for a better card rate.',
    start: 'Start with the analyzer — two minutes, and it shows exactly where your card payments cost more than they should.',
    cta: 'Run the analyzer →',
    foot: 'CAMBRA · Payments margin recovery',
  },
  fr: {
    subject: 'Bienvenue chez CAMBRA — voyons ce que vous payez',
    welcome: (b) => `Bienvenue, ${b}.`,
    intro: 'Vous rejoignez CAMBRA — nous aidons les commerces indépendants à cesser de trop payer sur les paiements par carte.',
    unlocked: 'Ce que vous débloquez',
    f1t: "L'analyse",
    f1d: 'Voyez ce que vous payez sur les paiements par carte, et le minimum autorisé par la banque et les réseaux de cartes.',
    f2t: 'Des chiffres vérifiés',
    f2d: 'Connectez votre prestataire de paiement, en lecture seule, et votre estimation devient un chiffre mesuré.',
    f3t: 'Le collectif',
    f3d: 'De nombreux commerces qui négocient comme un seul pour obtenir un meilleur tarif carte.',
    start: "Commencez par l'analyse — deux minutes, et elle montre exactement où vos paiements par carte coûtent plus qu'ils ne devraient.",
    cta: "Lancer l'analyse →",
    foot: 'CAMBRA · Récupération de marge sur les paiements',
  },
  es: {
    subject: 'Bienvenido a CAMBRA — veamos lo que pagas',
    welcome: (b) => `Bienvenido, ${b}.`,
    intro: 'Te has unido a CAMBRA — ayudamos a los comercios independientes a dejar de pagar de más en los pagos con tarjeta.',
    unlocked: 'Lo que desbloqueas',
    f1t: 'El análisis',
    f1d: 'Descubre lo que pagas en los pagos con tarjeta, y el mínimo que permiten el banco y las redes de tarjetas.',
    f2t: 'Cifras verificadas',
    f2d: 'Conecta tu proveedor de pagos, en solo lectura, y tu estimación pasa a ser un número medido.',
    f3t: 'El colectivo',
    f3d: 'Muchos comercios negociando como uno solo para conseguir una tarifa de tarjeta mejor.',
    start: 'Empieza por el análisis — dos minutos, y te muestra exactamente dónde tus pagos con tarjeta cuestan más de lo que deberían.',
    cta: 'Lanzar el análisis →',
    foot: 'CAMBRA · Recuperación de margen en pagos',
  },
};

export function welcomeEmail(localeRaw: unknown, params: Params): Email {
  const locale = normalizeLocale(localeRaw);
  const c = COPY[locale];
  const { brandName, appDomain } = params;

  const feature = (title: string, desc: string, last = false) => `
          <div${last ? '' : ' style="margin-bottom: 12px;"'}>
            <p style="font-weight: 700; margin-bottom: 4px;">${title}</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.5);">${desc}</p>
          </div>`;

  return {
    subject: c.subject,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">CAMBRA</p>
        <h1 style="font-size: 32px; font-weight: 900; letter-spacing: -0.04em; line-height: 1; margin-bottom: 12px;">
          ${c.welcome(brandName)}
        </h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          ${c.intro}
        </p>

        <div style="background: #111; color: #fff; border-radius: 16px; padding: 28px; margin-bottom: 32px;">
          <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 16px;">${c.unlocked}</p>
          ${feature(c.f1t, c.f1d)}
          ${feature(c.f2t, c.f2d)}
          ${feature(c.f3t, c.f3d, true)}
        </div>

        <p style="font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 24px;">
          ${c.start}
        </p>

        <a href="https://${appDomain}/Analyzer" style="display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 100px;">
          ${c.cta}
        </a>

        <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #ccc;">${c.foot}</p>
        </div>
      </div>
    `,
  };
}