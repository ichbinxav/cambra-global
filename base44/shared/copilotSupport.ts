export const COPILOT_CONTEXT_SCOPES = Object.freeze({
  FOUNDER_CONTROL: 'FOUNDER_CONTROL',
  MERCHANT_PORTFOLIO: 'MERCHANT_PORTFOLIO',
  RESEARCH_KNOWLEDGE: 'RESEARCH_KNOWLEDGE',
});

export type CopilotLocale = 'en' | 'fr' | 'es';

export function sanitizeCopilotConversation(value: any) {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).flatMap((row: any) => {
    const role = row?.role === 'assistant' ? 'assistant' : row?.role === 'user' ? 'user' : null;
    const content = String(row?.text ?? row?.content ?? '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, 2000);
    return role && content ? [{ role, content }] : [];
  });
}

export function normalizeCopilotLocale(value: any): CopilotLocale | null {
  const normalized = String(value || '').trim().toLowerCase().replace('_', '-');
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'fr' || normalized.startsWith('fr-')) return 'fr';
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es';
  return null;
}

const updatedAt = (row: any) => {
  const parsed = Date.parse(String(row?.updated_at || row?.updated_date || row?.created_at || row?.created_date || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Resolve the authenticated user's persisted locale. The request payload is
 * deliberately not an authority source: an admin chat cannot relabel itself
 * by posting a fabricated Founder context or locale preference.
 */
export async function resolveCopilotLocale(svc: any, user: any): Promise<CopilotLocale> {
  const userId = String(user?.id || '');
  const preferenceKey = `${user?.role === 'admin' ? 'admin' : 'user'}:${String(user?.id || user?.email || '')}`;
  try {
    const rows = userId
      ? await svc.entities.LocalePreference.filter({ user_id: userId }, '-updated_at', 20)
      : await svc.entities.LocalePreference.filter({ preference_key: preferenceKey }, '-updated_at', 5);
    const preference = (Array.isArray(rows) ? rows : [])
      .filter((row: any) => row?.preference_key === preferenceKey || (!row?.preference_key && row?.user_id === userId))
      .sort((left: any, right: any) => updatedAt(right) - updatedAt(left))[0] || null;
    const persisted = normalizeCopilotLocale(preference?.language) || normalizeCopilotLocale(preference?.locale);
    if (persisted) return persisted;
  } catch {
    // Locale lookup is presentation-only. A missing preference must not make
    // the assistant unavailable or weaken any authority gate.
  }
  return normalizeCopilotLocale(user?.language) || normalizeCopilotLocale(user?.locale) || 'en';
}

export function projectFounderCopilotContext(snapshot: any) {
  return {
    version: snapshot?.version || null,
    captured_at: snapshot?.captured_at || null,
    global_status: snapshot?.global_status || null,
    emergency: snapshot?.emergency || null,
    capabilities: Array.isArray(snapshot?.capabilities)
      ? snapshot.capabilities.map((item: any) => ({
          key: item?.key || null,
          current_mode: item?.current_mode || 'UNKNOWN',
          effective_capacity: item?.effective_capacity ?? null,
          blockers: Array.isArray(item?.blockers) ? item.blockers.slice(0, 20) : [],
          dependencies: Array.isArray(item?.dependencies)
            ? item.dependencies.slice(0, 20).map((dependency: any) => ({
                key: dependency?.key || null,
                status: dependency?.status || 'UNKNOWN',
                detail: dependency?.detail || null,
              }))
            : [],
        }))
      : [],
    limits: snapshot?.limits || null,
    active_canary: snapshot?.active_canary || null,
    active_shadow: snapshot?.active_shadow || null,
    safe_resume: snapshot?.safe_resume || null,
    freshness: snapshot?.freshness || null,
  };
}

const FALLBACK_COPY = Object.freeze({
  en: {
    here: 'You are in',
    terminal: 'For card terminals, share only the basics: provider, terminal count, monthly cost, in-store sales and transaction fee.',
    shipping: 'CAMBRA currently analyses card-payment costs only (online and in-store terminals). Shipping and logistics are future expansion, not a current service.',
    payment: 'For online payments, share the provider and approximate fee.',
    generic: 'I can guide you step by step with short answers.',
    next: 'Recommended next step:',
    terminal_next: 'complete the analysis.',
    analyzer_next: 'run the Analyzer.',
    payment_next: 'continue the analysis.',
    generic_next: 'continue.',
  },
  fr: {
    here: 'Vous êtes dans',
    terminal: 'Pour les terminaux de paiement, indiquez seulement l’essentiel : fournisseur, nombre de terminaux, coût mensuel, ventes en magasin et commission par transaction.',
    shipping: 'CAMBRA analyse actuellement uniquement les coûts de paiement par carte (en ligne et en magasin). La livraison et la logistique sont une extension future, pas un service actuel.',
    payment: 'Pour les paiements en ligne, indiquez le fournisseur et la commission approximative.',
    generic: 'Je peux vous guider étape par étape avec des réponses courtes.',
    next: 'Prochaine étape recommandée :',
    terminal_next: 'terminez l’analyse.',
    analyzer_next: 'lancez l’Analyzer.',
    payment_next: 'poursuivez l’analyse.',
    generic_next: 'continuez.',
  },
  es: {
    here: 'Estás en',
    terminal: 'Para el TPV, dinos solo lo básico: proveedor, número de terminales, coste mensual, ventas en tienda y comisión por transacción.',
    shipping: 'CAMBRA actualmente solo analiza costes de pago con tarjeta (online y TPV). Los envíos y la logística son una expansión futura, no un servicio actual.',
    payment: 'Para pagos online, comparte el proveedor y la comisión aproximada.',
    generic: 'Te guío paso a paso con respuestas cortas.',
    next: 'Siguiente paso recomendado:',
    terminal_next: 'completa el análisis.',
    analyzer_next: 'ejecuta el Analyzer.',
    payment_next: 'continúa con el análisis.',
    generic_next: 'continúa.',
  },
});

export function buildLocalizedCopilotFallback(input: {
  question?: any;
  pageTitle?: any;
  pageDescription?: any;
  nextStep?: any;
  locale?: any;
}) {
  const locale = normalizeCopilotLocale(input?.locale) || 'en';
  const copy = FALLBACK_COPY[locale];
  const question = String(input?.question || '').toLowerCase();
  const pageTitle = String(input?.pageTitle || '').trim() || (locale === 'fr' ? 'cette page' : locale === 'es' ? 'esta página' : 'this page');
  const pageDescription = String(input?.pageDescription || '').trim();
  const prefix = `${copy.here} ${pageTitle}.${pageDescription ? ` ${pageDescription}` : ''}`;
  let answer = copy.generic;
  let defaultNext = copy.generic_next;
  if (question.includes('tpe') || question.includes('terminal') || question.includes('datáfono') || question.includes('card machine')) {
    answer = copy.terminal;
    defaultNext = copy.terminal_next;
  } else if (question.includes('shipping') || question.includes('envío') || question.includes('livraison')) {
    answer = copy.shipping;
    defaultNext = copy.analyzer_next;
  } else if (question.includes('payment') || question.includes('pago') || question.includes('paiement') || question.includes('psp')) {
    answer = copy.payment;
    defaultNext = copy.payment_next;
  }
  return `${prefix} ${answer} ${copy.next} ${String(input?.nextStep || '').trim() || defaultNext}`;
}
