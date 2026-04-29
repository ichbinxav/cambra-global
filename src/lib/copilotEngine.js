import { base44 } from '@/api/base44Client';

const PAGE_META = {
  '/Dashboard': {
    key: 'dashboard',
    title: 'Dashboard',
    description: 'This page shows your current progress, savings visibility and where margin opportunities are building.',
  },
  '/Analyzer': {
    key: 'analyzer',
    title: 'Analyzer',
    description: 'This page starts Cambra audits and helps turn raw cost data into savings estimates.',
  },
  '/Reports': {
    key: 'reports',
    title: 'Reports',
    description: 'This page tracks analysis history, verification progress and what has already been measured.',
  },
  '/Deals': {
    key: 'deals',
    title: 'Deals',
    description: 'This page shows which commercial opportunities are available, active or still blocked.',
  },
  '/Results': {
    key: 'results',
    title: 'Results',
    description: 'This page explains your savings estimate, category breakdown and how strong the signal is.',
  },
  '/ConnectTools': {
    key: 'documents',
    title: 'Connect Tools',
    description: 'This page improves analysis quality by connecting live data sources or adding files.',
  },
  '/Vault': {
    key: 'documents',
    title: 'Documents',
    description: 'This page stores statements, invoices and supporting files used across audits and verification.',
  },
  '/Account': {
    key: 'account',
    title: 'Account',
    description: 'This page holds account and brand profile data that supports onboarding and benchmark accuracy.',
  },
};

const JOURNEY_ORDER = [
  'profile',
  'payments',
  'shipping',
  'saas',
  'savings',
  'eligibility',
  'activation',
];

const JOURNEY_META = {
  profile: { label: 'Profile setup', href: '/Account' },
  payments: { label: 'Payments audit', href: '/Analyzer?mode=questionnaire&module=payments' },
  shipping: { label: 'Shipping audit', href: '/Analyzer?mode=questionnaire&module=shipping' },
  saas: { label: 'SaaS audit', href: '/Analyzer?mode=questionnaire&module=saas' },
  savings: { label: 'Savings estimate', href: '/Results' },
  eligibility: { label: 'Deal eligibility', href: '/Deals' },
  activation: { label: 'Deal activation', href: '/Deals' },
};

function pathKey(pathname) {
  if (pathname.startsWith('/Results')) return '/Results';
  return Object.keys(PAGE_META).find((key) => pathname.startsWith(key)) || pathname;
}

function buildJourney(state) {
  const profileDone = !!state.brand;
  const paymentsDone = !!state.paymentsProfile;
  const shippingDone = !!state.shippingProfile;
  const saasDone = !!state.saasProfile;
  const savingsDone = !!state.latestResult;
  const eligibilityDone = state.userDeals.length > 0;
  const activationDone = state.userDeals.some((deal) => ['active', 'activated', 'live'].includes(deal.status));

  return {
    profile: profileDone ? 'done' : 'pending',
    payments: paymentsDone ? 'done' : 'recommended',
    shipping: shippingDone ? 'done' : (paymentsDone ? 'recommended' : 'pending'),
    saas: saasDone ? 'done' : (paymentsDone || shippingDone ? 'recommended' : 'pending'),
    savings: savingsDone ? 'done' : ((paymentsDone || shippingDone || saasDone) ? 'recommended' : 'blocked'),
    eligibility: eligibilityDone ? 'done' : (savingsDone ? 'recommended' : 'blocked'),
    activation: activationDone ? 'done' : (eligibilityDone ? 'recommended' : 'blocked'),
  };
}

function getMissingData(state) {
  const missing = [];
  if (!state.brand?.name) missing.push('brand profile');
  if (!state.paymentsProfile?.current_psp && !state.paymentsProfile?.psp_actual) missing.push('payment provider');
  if (!state.paymentsProfile?.monthly_volume_eur && !state.paymentsProfile?.vol_mensual) missing.push('monthly payment volume');
  if (!state.shippingProfile?.monthly_orders && !state.shippingProfile?.pedidos_mensuales) missing.push('shipping volume');
  if (!state.shippingProfile?.served_countries?.length && !state.shippingProfile?.paises_serv?.length) missing.push('shipping geography');
  if (!state.saasProfile?.monthly_spend_map && !state.saasProfile?.gasto_mensual_map) missing.push('saas spend map');
  if (!state.documents.length) missing.push('supporting documents');
  return missing;
}

function buildBlockers(state, journey) {
  const blockers = [];
  if (journey.savings === 'blocked') blockers.push('Complete at least one audit before reviewing savings.');
  if (journey.eligibility === 'blocked') blockers.push('Generate a savings estimate before checking deal eligibility.');
  if (journey.activation === 'blocked') blockers.push('Eligibility must be clear before deal activation.');
  return blockers;
}

function cta(label, href) {
  return { label, href };
}

function buildGuidance(state, page, journey, missing, blockers) {
  if (!state.user) {
    return {
      status: 'ready',
      nextStep: 'Explore this page or sign in when you want to save progress.',
      why: 'The copilot is available even without an account and can explain what each page is for.',
      unlocks: 'Signing in later unlocks personalized guidance and saved progress.',
      ctas: [cta('Open analyzer', '/Analyzer'), cta('Join now', '/Onboarding')],
      nudges: ['You can browse freely and sign in only when you are ready.'],
    };
  }

  if (!state.brand) {
    return {
      status: 'action_needed',
      nextStep: 'Complete your brand profile.',
      why: 'Cambra needs baseline brand data to benchmark you against the right cohort.',
      unlocks: 'This unlocks cleaner audit guidance and better benchmark relevance.',
      ctas: [cta('Complete profile', '/Account')],
      nudges: ['Profile context sharpens every audit that follows.'],
    };
  }

  if (page.key === 'analyzer') {
    return {
      status: 'ready',
      nextStep: state.paymentsProfile ? 'Continue with Shipping or SaaS.' : 'Start with the Payments audit.',
      why: state.paymentsProfile
        ? 'You already have payment context. Expanding the audit increases savings visibility.'
        : 'Payments is usually the fastest path to a first savings estimate.',
      unlocks: 'This unlocks your first quantified savings view.',
      ctas: state.paymentsProfile
        ? [cta('Continue audit', '/Analyzer?mode=questionnaire&module=shipping'), cta('Run analysis', '/Results')]
        : [cta('Start audit', '/Analyzer?mode=questionnaire&module=payments'), cta('Upload statement', '/ConnectTools?mode=upload')],
      nudges: ['Most brands your size optimize payments first.'],
    };
  }

  if (page.key === 'results') {
    return {
      status: 'ready',
      nextStep: state.documents.length ? 'Review benchmarks and move toward eligibility.' : 'Connect tools or upload files to strengthen confidence.',
      why: state.documents.length
        ? 'You already have a first estimate. The next step is turning it into action.'
        : 'Results are stronger when supported by real statements or connected sources.',
      unlocks: 'This unlocks clearer eligibility and better activation decisions.',
      ctas: state.documents.length
        ? [cta('View benchmarks', '/Reports'), cta('Check eligibility', '/Deals')]
        : [cta('Connect tools', '/ConnectTools'), cta('Upload statement', '/ConnectTools?mode=upload')],
      nudges: [state.latestResult ? 'You are one step away from operationalizing your first estimate.' : 'No savings estimate exists yet.'],
    };
  }

  if (page.key === 'deals') {
    return {
      status: blockers.length ? 'action_needed' : 'ready',
      nextStep: journey.eligibility === 'blocked' ? 'Generate a savings estimate first.' : 'Review which deals are ready to activate.',
      why: journey.eligibility === 'blocked'
        ? 'Cambra needs audit evidence before it can frame deal relevance.'
        : 'Eligibility is only useful when tied to a clear margin opportunity.',
      unlocks: 'This unlocks deal activation and realized savings.',
      ctas: journey.eligibility === 'blocked'
        ? [cta('Run analysis', '/Analyzer'), cta('View results', '/Results')]
        : [cta('Check eligibility', '/Deals'), cta('Activate deal', '/Deals')],
      nudges: [state.userDeals.length ? 'Some commercial paths are already open.' : 'Deal readiness follows audit clarity.'],
    };
  }

  if (page.key === 'documents') {
    return {
      status: 'ready',
      nextStep: state.documents.length ? 'Add the highest-signal missing file.' : 'Upload your first supporting document.',
      why: 'Statements and invoices improve rate accuracy, benchmark confidence and downstream activation quality.',
      unlocks: 'This unlocks stronger estimates and faster verification.',
      ctas: [cta('Upload statement', '/ConnectTools?mode=upload'), cta('Go to documents', '/Vault')],
      nudges: ['Real files reduce guesswork across the platform.'],
    };
  }

  return {
    status: missing.length || blockers.length ? 'action_needed' : 'ready',
    nextStep: state.latestResult ? 'Review your strongest remaining audit gap.' : 'Start your first audit.',
    why: state.latestResult
      ? 'Your platform context is already partially built. Closing missing inputs sharpens activation paths.'
      : 'Cambra guides best when at least one audit is complete.',
    unlocks: state.latestResult ? 'This unlocks clearer eligibility and stronger prioritization.' : 'This unlocks your first savings estimate.',
    ctas: state.latestResult
      ? [cta('View results', '/Results'), cta('Continue audit', '/Analyzer?mode=questionnaire&module=shipping')]
      : [cta('Start audit', '/Analyzer?mode=questionnaire&module=payments'), cta('Connect tools', '/ConnectTools')],
    nudges: [state.latestResult ? 'You are already carrying signal — now turn it into action.' : 'You are likely leaving margin on the table.'],
  };
}

export async function getCopilotState({ pathname }) {
  const isAuthenticated = await base44.auth.isAuthenticated();
  const user = isAuthenticated ? await base44.auth.me() : null;
  const email = user?.email;

  const [brands, paymentsProfiles, shippingProfiles, saasProfiles, results, documents, userDeals] = email ? await Promise.all([
    base44.entities.Brand.filter({ created_by: email }, '-created_date', 1),
    base44.entities.PaymentsProfile.filter({ created_by: email }, '-created_date', 1),
    base44.entities.ShippingProfile.filter({ created_by: email }, '-created_date', 1),
    base44.entities.SaaSProfile.filter({ created_by: email }, '-created_date', 1),
    base44.entities.AnalyzerResult.filter({ created_by: email }, '-created_date', 3),
    base44.entities.Document.filter({ created_by: email }, '-created_date', 10),
    base44.entities.UserDeal.filter({ user_email: email }, '-created_date', 10),
  ]) : [[], [], [], [], [], [], []];

  const page = PAGE_META[pathKey(pathname)] || {
    key: 'platform',
    title: 'Cambra',
    description: 'This page is part of your Cambra operating margin workflow.',
  };

  const state = {
    user,
    brand: brands[0] || null,
    paymentsProfile: paymentsProfiles[0] || null,
    shippingProfile: shippingProfiles[0] || null,
    saasProfile: saasProfiles[0] || null,
    latestResult: results[0] || null,
    documents,
    userDeals,
  };

  const journey = buildJourney(state);
  const missingData = getMissingData(state);
  const blockers = buildBlockers(state, journey);
  const guidance = buildGuidance(state, page, journey, missingData, blockers);

  return {
    page,
    journey: JOURNEY_ORDER.map((key) => ({ key, ...JOURNEY_META[key], status: journey[key] })),
    missingData,
    blockers,
    guidance,
    summary: {
      current_page: page.title,
      profile_complete: !!state.brand,
      payments_audit: journey.payments,
      shipping_audit: journey.shipping,
      saas_audit: journey.saas,
      documents_uploaded: state.documents.length > 0,
      savings_estimate: !!state.latestResult,
      deal_eligibility: journey.eligibility,
      activation_status: journey.activation,
      available_ctas: guidance.ctas,
    },
  };
}