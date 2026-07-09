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

// FASE 1.3 — payments-only. Shipping/SaaS journey steps removed.
const JOURNEY_ORDER = [
  'profile',
  'payments',
  'savings',
  'eligibility',
  'activation',
];

const JOURNEY_META = {
  profile: { label: 'Profile setup', href: '/Account' },
  payments: { label: 'Payments audit', href: '/Analyzer' },
  savings: { label: 'Savings estimate', href: '/Results' },
  // FASE 1.2 — /Deals deprecated; eligibility/activation route to Dashboard.
  eligibility: { label: 'Deal eligibility', href: '/Dashboard' },
  activation: { label: 'Deal activation', href: '/Dashboard' },
};

function pathKey(pathname) {
  if (pathname.startsWith('/Results')) return '/Results';
  return Object.keys(PAGE_META).find((key) => pathname.startsWith(key)) || pathname;
}

function buildJourney(state) {
  const profileDone = !!state.brand;
  const paymentsDone = !!state.paymentsProfile;
  const savingsDone = !!state.latestResult;
  const eligibilityDone = state.userDeals.length > 0;
  const activationDone = state.userDeals.some((deal) => ['active', 'activated', 'live'].includes(deal.status));

  return {
    profile: profileDone ? 'done' : 'pending',
    payments: paymentsDone ? 'done' : 'recommended',
    savings: savingsDone ? 'done' : (paymentsDone ? 'recommended' : 'blocked'),
    eligibility: eligibilityDone ? 'done' : (savingsDone ? 'recommended' : 'blocked'),
    activation: activationDone ? 'done' : (eligibilityDone ? 'recommended' : 'blocked'),
  };
}

function getMissingData(state) {
  const missing = [];
  if (!state.brand?.name) missing.push('brand profile');
  if (!state.paymentsProfile?.current_psp && !state.paymentsProfile?.psp_actual) missing.push('payment provider');
  if (!state.paymentsProfile?.monthly_volume_eur && !state.paymentsProfile?.vol_mensual) missing.push('monthly payment volume');
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
      nextStep: state.paymentsProfile ? 'Connect Stripe to verify your numbers.' : 'Start the Payments audit now.',
      why: state.paymentsProfile
        ? 'You already have a payments estimate. Connecting Stripe turns it into a verified figure.'
        : 'This is the fastest way to get a clear savings estimate.',
      unlocks: 'This gets you to results faster and makes tool connection more useful.',
      ctas: state.paymentsProfile
        ? [cta('Connect Stripe', '/ConnectTools'), cta('View results', '/Results')]
        : [cta('Start analyzer', '/Analyzer'), cta('Connect tools', '/ConnectTools')],
      nudges: ['Do the Analyzer first. Then connect Stripe to verify.'],
    };
  }

  if (page.key === 'results') {
    return {
      status: 'ready',
      nextStep: state.documents.length ? 'Connect your tools to make the result stronger.' : 'Connect tools or upload one file now.',
      why: state.documents.length
        ? 'You have a first result. Now improve it with real data.'
        : 'Real data makes the Analyzer more useful and actionable.',
      unlocks: 'This sharpens accuracy and helps you move faster.',
      ctas: [cta('Connect tools', '/ConnectTools'), cta('Run analyzer', '/Analyzer?mode=questionnaire&module=payments')],
      nudges: ['Best flow: Analyzer first, tools second, results stronger.'],
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
        : [cta('Check eligibility', '/Dashboard'), cta('Activate deal', '/Dashboard')],
      nudges: [state.userDeals.length ? 'Some commercial paths are already open.' : 'Deal readiness follows audit clarity.'],
    };
  }

  if (page.key === 'documents') {
    return {
      status: 'ready',
      nextStep: state.documents.length ? 'Connect a tool or add one more high-signal file.' : 'Connect a tool or upload your first file.',
      why: 'Connected sources and key files make the Analyzer sharper.',
      unlocks: 'This improves accuracy and makes next steps easier.',
      ctas: [cta('Connect tools', '/ConnectTools'), cta('Upload file', '/ConnectTools?mode=upload')],
      nudges: ['Fastest path: Analyzer, then connect tools.'],
    };
  }

  return {
    status: missing.length || blockers.length ? 'action_needed' : 'ready',
    nextStep: state.latestResult ? 'Connect tools or finish the next audit step.' : 'Start the Analyzer now.',
    why: state.latestResult
      ? 'You already have signal. Now make it stronger with better data.'
      : 'The Analyzer is the fastest way to get value from Cambra.',
    unlocks: state.latestResult ? 'This makes your next action clearer.' : 'This gets you to your first savings estimate fast.',
    ctas: [cta('Start analyzer', '/Analyzer'), cta('Connect tools', '/ConnectTools')],
    nudges: ['Keep it simple: Analyzer first, tools next.'],
  };
}

export async function getCopilotState({ pathname }) {
  const isAuthenticated = await base44.auth.isAuthenticated();
  const user = isAuthenticated ? await base44.auth.me() : null;
  const email = user?.email;

  // FASE 1.3 — payments-only. ShippingProfile/SaaSProfile reads removed.
  const [brands, paymentsProfiles, results, documents, userDeals] = email ? await Promise.all([
    base44.entities.Brand.filter({ created_by: email }, '-created_date', 1),
    base44.entities.PaymentsProfile.filter({ created_by: email }, '-created_date', 1),
    base44.entities.AnalyzerResult.filter({ created_by: email }, '-created_date', 3),
    base44.entities.Document.filter({ created_by: email }, '-created_date', 10),
    base44.entities.UserDeal.filter({ user_email: email }, '-created_date', 10),
  ]) : [[], [], [], [], []];

  const page = PAGE_META[pathKey(pathname)] || {
    key: 'platform',
    title: 'Cambra',
    description: 'This page is part of your Cambra operating margin workflow.',
  };

  const state = {
    user,
    brand: brands[0] || null,
    paymentsProfile: paymentsProfiles[0] || null,
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
      documents_uploaded: state.documents.length > 0,
      savings_estimate: !!state.latestResult,
      deal_eligibility: journey.eligibility,
      activation_status: journey.activation,
      available_ctas: guidance.ctas,
    },
  };
}