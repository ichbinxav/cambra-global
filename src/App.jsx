import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LanguageProvider } from '@/lib/i18n.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { base44 } from '@/api/base44Client';

import LoadingScreen from '@/components/shared/LoadingScreen';
import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding.jsx';
// Chunk 6 CUTOVER — /Analyzer and /Results now serve the Payments-only
// components. The legacy multi-vertical Analyzer / Results / AnalyzerTeaser
// were deleted with the entire wizard + score engine consumer surface.
import PaymentsAnalyzer from '@/pages/PaymentsAnalyzer';
// FIX 13b — /Results made lazy: it pulls 20+ paymentsResults sub-components
// into a dedicated chunk instead of the initial bundle. The Suspense +
// LazyFallback + ErrorBoundary pattern is identical to Dashboard/Reports.
const PaymentsResults = lazy(() => import('@/pages/PaymentsResults'));
import LoginGate from '@/pages/LoginGate';
import HealthCheck from '@/pages/HealthCheck.jsx';
import CookieConsent from '@/components/shared/CookieConsent';
// FIX 13 — Lazy load heavy pages (Dashboard + ConnectTools + heavy admin pages).
// FIX 13b — /Results now also lazy (PaymentsResults). Its 20+ sub-components
// (PaymentsGapCard, FeeBreakdownCard, RecoveryRoadmap, PeerBenchmark, …)
// no longer ship in the initial chunk. jspdf was already dynamic (BACKLOG-1 T4).
const Dashboard     = lazy(() => import('@/pages/Dashboard'));
const ConnectTools  = lazy(() => import('@/pages/ConnectTools'));
const Reports = lazy(() => import('@/pages/Reports'));
// FASE 1.2 — /Network, /Insights, /InsightDetail deprecated (multi-vertical /
// pre-pivot collective model). Components kept dormant in src/pages/.
import Account from '@/pages/Account';
// FASE 1.2 — /UnlockSavings & /RecoveryTracker deprecated with redirect to home.
// Components kept in src/pages/ (dormant) — imports removed so the pages no
// longer ship in the bundle. Restore by re-importing when negotiation ships.
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import Cookies from '@/pages/Cookies';
// FASE 1.2 — /StripeAnalyzer deprecated (superseded by /Analyzer + /ConnectTools + /Results).
import DevExport from '@/pages/DevExport';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
const AdminOverview   = lazy(() => import('@/pages/admin/AdminOverview'));
const AdminRevenue    = lazy(() => import('@/pages/admin/AdminRevenue'));
const AdminBenchmarks = lazy(() => import('@/pages/admin/AdminBenchmarks'));
// BACKLOG-1 T4 — páginas admin lazy: estaban eager y arrastraban sus paneles
// pesados (recharts, tablas) al chunk inicial de cualquier visitante anónimo.
// El <Suspense> con LazyFallback ya envolvía <Routes>.
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminUserDetail = lazy(() => import('@/pages/admin/AdminUserDetail'));
const AdminApplications = lazy(() => import('@/pages/admin/AdminApplications'));
const AdminPipeline = lazy(() => import('@/pages/admin/AdminPipeline'));
const AdminDeals = lazy(() => import('@/pages/admin/AdminDeals'));
const AdminProviders = lazy(() => import('@/pages/admin/AdminProviders'));
const AdminContracts = lazy(() => import('@/pages/admin/AdminContracts'));
const AdminIntegrations = lazy(() => import('@/pages/admin/AdminIntegrations'));
const AdminApiIntegrations = lazy(() => import('@/pages/admin/AdminApiIntegrations'));
const AdminControl = lazy(() => import('@/pages/admin/AdminControl'));
const AdminActivationDetail = lazy(() => import('@/pages/admin/AdminActivationDetail'));
const AdminRecommendations = lazy(() => import('@/pages/admin/AdminRecommendations'));
const AdminCompliance = lazy(() => import('@/pages/admin/AdminCompliance'));
const AdminActivity = lazy(() => import('@/pages/admin/AdminActivity'));
const AdminApprovals = lazy(() => import('@/pages/admin/AdminApprovals'));
const AdminCopilot = lazy(() => import('@/pages/admin/AdminCopilot'));
const AdminCommand = lazy(() => import('@/pages/admin/AdminCommand'));
const AdminAgents = lazy(() => import('@/pages/admin/AdminAgents'));
const AdminDeveloper = lazy(() => import('@/pages/admin/AdminDeveloper'));
const AdminAutomations = lazy(() => import('@/pages/admin/AdminAutomations')); 
const AdminInbox = lazy(() => import('@/pages/admin/AdminInbox'));
const AdminChat = lazy(() => import('@/pages/admin/AdminChat'));
const AdminDiscovery = lazy(() => import('@/pages/admin/AdminDiscovery'));
const AdminCommercialAutonomy = lazy(() => import('@/pages/admin/AdminCommercialAutonomy'));
const AdminIntelligence = lazy(() => import('@/pages/admin/AdminIntelligence'));
const AdminRoutingIntelligence = lazy(() => import('@/pages/admin/AdminRoutingIntelligence'));
const AdminAggregate = lazy(() => import('@/pages/admin/AdminAggregate'));
const AdminFinance = lazy(() => import('@/pages/admin/AdminFinance'));
const AdminFounderControl = lazy(() => import('@/pages/admin/AdminFounderControl'));
const ReviewQueue = lazy(() => import('@/pages/admin/ReviewQueue'));
const EclOperations = lazy(() => import('@/pages/admin/EclOperations')); 
import AuthRedirect from '@/pages/AuthRedirect';
import Pricing from '@/pages/Pricing.jsx';
// FASE 1.2 — /Developers, /Developers/MCP, /Snapshot deprecated.
// Frontend pages redirect to home; backend mcpServer function untouched.
// /ForProviders REACTIVADO 2026-07-12 (post-M4) — página viva payments-only
// (dos niveles Listed/Partner). Ver src/pages/ForProviders.jsx.
import ForProviders from '@/pages/ForProviders';
import Partners from '@/pages/Partners';
import HowItWorks from '@/pages/HowItWorks';
import Security from '@/pages/Security';
import Contact from '@/pages/Contact';
import Help from '@/pages/Help';
import HelpCategory from '@/pages/HelpCategory';
import HelpSlugRedirect from '@/components/shared/HelpSlugRedirect';
const AdminInvoices = lazy(() => import('@/pages/admin/AdminInvoices'));
const AdminRecoverBilling = lazy(() => import('@/pages/admin/AdminRecoverBilling'));
const AdminWaitlist = lazy(() => import('@/pages/admin/AdminWaitlist'));
import Invoices from '@/pages/Invoices';
import Vault from '@/pages/Vault';
import Referrals from '@/pages/Referrals';
import ConnectIntegrations from '@/pages/ConnectIntegrations';
import IntegrationsCallback from '@/pages/IntegrationsCallback';
import BrandProfile from '@/pages/BrandProfile';
import BrandGlyph from '@/components/shared/BrandGlyph';
import CopilotPanel from '@/components/copilot/CopilotPanel.jsx';
import ScrollToTop from '@/components/shared/ScrollToTop.jsx';
import SeoMeta from '@/components/shared/SeoMeta.jsx';
import ErrorBoundary from '@/components/shared/ErrorBoundary.jsx';
import { ToastProvider } from '@/components/shared/Toast.jsx';

// Inline lazy chunk fallback — NOT fullscreen, so it doesn't blank out the
// screen or fight the auth loading screen. Renders inside whatever shell is
// mounted (e.g. inside DashboardLayout).
function LazyFallback() {
  return <LoadingScreen label="Loading" fullscreen={false} />;
}

// Wrap a route element in a per-route ErrorBoundary so one page crash does not
// take down the whole app.
const withBoundary = (element) => <ErrorBoundary>{element}</ErrorBoundary>;

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return <LoadingScreen label="Checking session" />;
  }

  if (!isAuthenticated) {
    // Persist intended destination so LoginGate / AuthRedirect can resume after Base44 login.
    try {
      const intended = window.location.pathname + window.location.search + window.location.hash;
      sessionStorage.setItem("cambra_redirect_after_login", intended);
      return <Navigate to={`/LoginGate?next=${encodeURIComponent(intended)}`} replace />;
    } catch {
      return <Navigate to="/LoginGate" replace />;
    }
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // v62 C6 — auth.me() had no catch and no finally: a rejected promise left
  // loadingUser=true forever (permanent spinner) and an unhandled rejection.
  // Now: failure is a state, unmount cancels the write, and loading ALWAYS ends.
  useEffect(() => {
    let cancelled = false;
    if (isAuthenticated) {
      setLoadingUser(true);
      setAuthFailed(false);
      base44.auth.me()
        .then(u => { if (!cancelled) setUser(u); })
        .catch(() => { if (!cancelled) { setUser(null); setAuthFailed(true); } })
        .finally(() => { if (!cancelled) setLoadingUser(false); });
    } else if (!isLoadingAuth) {
      setLoadingUser(false);
    }
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoadingAuth, attempt]);

  if (isLoadingAuth || loadingUser) {
    return <LoadingScreen label="Verifying admin access" />;
  }

  // Authorization could not be resolved — never render admin content on doubt.
  if (authFailed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2">Could not verify your access</h1>
          <p className="text-sm text-muted-foreground mb-4">Please try again.</p>
          <button
            onClick={() => setAttempt(a => a + 1)}
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2">Admins only</h1>
          <p className="text-sm text-muted-foreground mb-4">Sign in to continue.</p>
          <a href="/auth/start" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold">Sign in</a>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return <Navigate to="/Dashboard" replace />;
  }
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const isPublicLanding = typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "/Landing" || window.location.pathname === "/landing");

  if (!isPublicLanding && (isLoadingPublicSettings || isLoadingAuth)) {
    return <LoadingScreen label="Loading workspace" />;
  }

  if (!isPublicLanding && authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
  }

  return (
    <Suspense fallback={<LazyFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={withBoundary(<Landing />)} />
        <Route path="/Landing" element={withBoundary(<Landing />)} />
        <Route path="/landing" element={<Navigate to="/Landing" replace />} />
        <Route path="/Onboarding" element={withBoundary(<Onboarding />)} />
        <Route path="/onboarding" element={<Navigate to="/Onboarding" replace />} />
        <Route path="/BrandProfile" element={withBoundary(<BrandProfile />)} />
        <Route path="/brandprofile" element={<Navigate to="/BrandProfile" replace />} />
        {/* CUTOVER — /Analyzer and /Results serve the Payments-only pages.
            Canonical URLs remain unchanged for SEO continuity. */}
        <Route path="/Analyzer" element={withBoundary(<PaymentsAnalyzer />)} />
        <Route path="/analyzer" element={<Navigate to="/Analyzer" replace />} />
        {/* /PaymentsAnalyzer kept as an alias — anything linking to it during
            the transition (marketing, docs, external) still resolves. */}
        <Route path="/PaymentsAnalyzer" element={<Navigate to="/Analyzer" replace />} />
        <Route path="/paymentsanalyzer" element={<Navigate to="/Analyzer" replace />} />
        <Route path="/Results" element={withBoundary(<PaymentsResults />)} />
        <Route path="/results" element={<Navigate to="/Results" replace />} />
        <Route path="/PaymentsResults" element={<Navigate to="/Results" replace />} />
        <Route path="/paymentsresults" element={<Navigate to="/Results" replace />} />
        {/* AnalyzerTeaser deleted in the cutover — public share links now go
            straight to /Results (which handles the missing-session state). */}
        <Route path="/AnalyzerTeaser" element={<Navigate to="/Analyzer" replace />} />
        <Route path="/analyzerteaser" element={<Navigate to="/Analyzer" replace />} />
        <Route path="/ConnectTools" element={<ProtectedRoute>{withBoundary(<ConnectTools />)}</ProtectedRoute>} />
        <Route path="/connecttools" element={<Navigate to="/ConnectTools" replace />} />
        <Route path="/Privacy" element={withBoundary(<Privacy />)} />
        <Route path="/privacy" element={<Navigate to="/Privacy" replace />} />
        <Route path="/Terms" element={withBoundary(<Terms />)} />
        <Route path="/terms" element={<Navigate to="/Terms" replace />} />
        <Route path="/Cookies" element={withBoundary(<Cookies />)} />
        <Route path="/cookies" element={<Navigate to="/Cookies" replace />} />
        {/* FASE 1.2 — payments-only phase: deprecated routes redirect to home.
            Components kept dormant in src/pages/, restore by re-importing. */}
        <Route path="/Deals" element={<Navigate to="/" replace />} />
        <Route path="/deals" element={<Navigate to="/" replace />} />
        <Route path="/UnlockSavings" element={<Navigate to="/" replace />} />
        <Route path="/unlocksavings" element={<Navigate to="/" replace />} />
        <Route path="/RecoveryTracker" element={<Navigate to="/" replace />} />
        <Route path="/recoverytracker" element={<Navigate to="/" replace />} />
        <Route path="/Network" element={<Navigate to="/" replace />} />
        <Route path="/network" element={<Navigate to="/" replace />} />
        <Route path="/Insights" element={<Navigate to="/" replace />} />
        <Route path="/insights" element={<Navigate to="/" replace />} />
        <Route path="/InsightDetail" element={<Navigate to="/" replace />} />
        <Route path="/insightdetail" element={<Navigate to="/" replace />} />
        <Route path="/StripeAnalyzer" element={<Navigate to="/" replace />} />
        <Route path="/stripeanalyzer" element={<Navigate to="/" replace />} />
        <Route path="/Snapshot" element={<Navigate to="/" replace />} />
        <Route path="/snapshot" element={<Navigate to="/" replace />} />
        <Route path="/ForProviders" element={withBoundary(<ForProviders />)} />
        <Route path="/forproviders" element={<Navigate to="/ForProviders" replace />} />
        <Route path="/for-providers" element={<Navigate to="/ForProviders" replace />} />
        <Route path="/Partners" element={withBoundary(<Partners />)} />
        <Route path="/partners" element={<Navigate to="/Partners" replace />} />
        <Route path="/become-a-partner" element={<Navigate to="/Partners#apply" replace />} />
        <Route path="/Developers" element={<Navigate to="/" replace />} />
        <Route path="/developers" element={<Navigate to="/" replace />} />
        <Route path="/Developers/MCP" element={<Navigate to="/" replace />} />
        <Route path="/developers/mcp" element={<Navigate to="/" replace />} />
        <Route path="/Pricing" element={withBoundary(<Pricing />)} />
        <Route path="/pricing" element={<Navigate to="/Pricing" replace />} />
        <Route path="/HowItWorks" element={withBoundary(<HowItWorks />)} />
        <Route path="/howitworks" element={<Navigate to="/HowItWorks" replace />} />
        <Route path="/Security" element={withBoundary(<Security />)} />
        <Route path="/security" element={<Navigate to="/Security" replace />} />
        <Route path="/Testimonials" element={<Navigate to="/" replace />} />
        <Route path="/testimonials" element={<Navigate to="/" replace />} />
        <Route path="/Contact" element={withBoundary(<Contact />)} />
        <Route path="/contact" element={<Navigate to="/Contact" replace />} />
        <Route path="/Help" element={withBoundary(<Help />)} />
        <Route path="/help" element={<Navigate to="/Help" replace />} />
        <Route path="/Help/:slug" element={withBoundary(<HelpCategory />)} />
        {/* v62 H1 — lowercase alias redirects to the canonical /Help/:slug. */}
        <Route path="/help/:slug" element={<HelpSlugRedirect />} />
        <Route path="/auth/start" element={<AuthRedirect />} />
        <Route path="/LoginGate" element={<LoginGate />} />
        <Route path="/logingate" element={<Navigate to="/LoginGate" replace />} />
        <Route path="/HealthCheck" element={<HealthCheck />} />
        <Route path="/healthcheck" element={<Navigate to="/HealthCheck" replace />} />
        <Route path="/dev/export" element={<AdminRoute><DevExport /></AdminRoute>} />

        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/Dashboard" element={withBoundary(<Dashboard />)} />
          <Route path="/Reports" element={withBoundary(<Reports />)} />
          <Route path="/Account" element={withBoundary(<Account />)} />
          <Route path="/Invoices" element={withBoundary(<Invoices />)} />
          <Route path="/Vault" element={withBoundary(<Vault />)} />
          <Route path="/Referrals" element={withBoundary(<Referrals />)} />
          <Route path="/referrals" element={<Navigate to="/Referrals" replace />} />
          <Route path="/ConnectIntegrations" element={withBoundary(<ConnectIntegrations />)} />
          <Route path="/IntegrationsCallback" element={withBoundary(<IntegrationsCallback />)} />
        </Route>

        <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route path="/admin" element={withBoundary(<AdminCommand />)} />
          <Route path="/admin/command" element={withBoundary(<AdminCommand />)} />
          <Route path="/admin/agents" element={withBoundary(<AdminAgents />)} />
          <Route path="/admin/developer" element={withBoundary(<AdminDeveloper />)} />
          <Route path="/admin/automations" element={withBoundary(<AdminAutomations />)} />
          <Route path="/admin/inbox" element={withBoundary(<AdminInbox />)} />
          <Route path="/admin/chat" element={withBoundary(<AdminChat />)} />
          <Route path="/admin/discovery" element={withBoundary(<AdminDiscovery />)} />
          <Route path="/admin/commercial-autonomy" element={withBoundary(<AdminCommercialAutonomy />)} />
          <Route path="/admin/intelligence" element={withBoundary(<AdminIntelligence />)} />
          <Route path="/admin/routing-intelligence" element={withBoundary(<AdminRoutingIntelligence />)} />
          <Route path="/admin/aggregate" element={withBoundary(<AdminAggregate />)} />
          <Route path="/admin/finance" element={withBoundary(<AdminFinance />)} />
          <Route path="/admin/founder-control" element={withBoundary(<AdminFounderControl />)} />
          <Route path="/admin/evidence-review" element={withBoundary(<ReviewQueue />)} />
          <Route path="/admin/ecl-operations" element={withBoundary(<EclOperations />)} />
          <Route path="/admin/overview" element={withBoundary(<AdminOverview />)} />
          <Route path="/admin/users" element={withBoundary(<AdminUsers />)} />
          <Route path="/admin/users/:id" element={withBoundary(<AdminUserDetail />)} />
          <Route path="/admin/applications" element={withBoundary(<AdminApplications />)} />
          <Route path="/admin/pipeline" element={withBoundary(<AdminPipeline />)} />
          <Route path="/admin/deals" element={withBoundary(<AdminDeals />)} />
          <Route path="/admin/providers" element={withBoundary(<AdminProviders />)} />
          <Route path="/admin/revenue" element={withBoundary(<AdminRevenue />)} />
          <Route path="/admin/benchmarks" element={withBoundary(<AdminBenchmarks />)} />
          <Route path="/admin/contracts" element={withBoundary(<AdminContracts />)} />
          <Route path="/admin/integrations" element={withBoundary(<AdminIntegrations />)} />
          <Route path="/admin/api-integrations" element={withBoundary(<AdminApiIntegrations />)} />
          <Route path="/admin/control" element={withBoundary(<AdminControl />)} />
          <Route path="/admin/recommendations" element={withBoundary(<AdminRecommendations />)} />
          <Route path="/admin/compliance" element={withBoundary(<AdminCompliance />)} />
          <Route path="/admin/activity" element={withBoundary(<AdminActivity />)} />
          <Route path="/admin/approvals" element={withBoundary(<AdminApprovals />)} />
          <Route path="/admin/copilot" element={withBoundary(<AdminCopilot />)} />
          <Route path="/admin/activation" element={withBoundary(<AdminActivationDetail />)} />
          <Route path="/admin/activation/:id" element={withBoundary(<AdminActivationDetail />)} />
          <Route path="/admin/invoices" element={withBoundary(<AdminInvoices />)} />
          <Route path="/admin/recover-billing" element={withBoundary(<AdminRecoverBilling />)} />
          <Route path="/admin/waitlist" element={withBoundary(<AdminWaitlist />)} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClientInstance}>
              <Router>
                <ScrollToTop />
                <SeoMeta />
                <AuthenticatedApp />
                <CopilotPanel />
                <CookieConsent />
                </Router>
              <Toaster />
            </QueryClientProvider>
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </LanguageProvider>
  );
}

export default App;