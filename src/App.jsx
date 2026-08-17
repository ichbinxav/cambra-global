import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
// DASHBOARD-C14 (2026-08-17) — founder decision: /admin/copilot and /admin/aggregate are
// unrouted. Copilot is superseded by CAMBRA Command, which is durable and leaves receipts.
// Aggregate is deferred until there is a collective negotiation to run — its entities and
// getAggregateCommandCenter are untouched, and the page files remain for that day.
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LanguageProvider } from '@/lib/i18n.jsx';
import { MarketProvider } from '@/lib/publicExperience.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { base44 } from '@/api/base44Client';

import LoadingScreen from '@/components/shared/LoadingScreen';
import LegalAcceptanceGate from '@/components/shared/LegalAcceptanceGate';
const Landing = lazy(() => import('@/pages/Landing'));
const Onboarding = lazy(() => import('@/pages/Onboarding.jsx'));
// Chunk 6 CUTOVER — /Analyzer and /Results now serve the Payments-only
// components. The legacy multi-vertical Analyzer / Results / AnalyzerTeaser
// were deleted with the entire wizard + score engine consumer surface.
const PaymentsAnalyzer = lazy(() => import('@/pages/PaymentsAnalyzer'));
// FIX 13b — /Results made lazy: it pulls 20+ paymentsResults sub-components
// into a dedicated chunk instead of the initial bundle. The Suspense +
// LazyFallback + ErrorBoundary pattern is identical to Dashboard/Reports.
const PaymentsResults = lazy(() => import('@/pages/PaymentsResults'));
const LoginGate = lazy(() => import('@/pages/LoginGate'));
const HealthCheck = lazy(() => import('@/pages/HealthCheck.jsx'));
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
const Account = lazy(() => import('@/pages/Account'));
// FASE 1.2 — /UnlockSavings & /RecoveryTracker deprecated with redirect to home.
// Components kept in src/pages/ (dormant) — imports removed so the pages no
// longer ship in the bundle. Restore by re-importing when negotiation ships.
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));
const Dpa = lazy(() => import('@/pages/Dpa'));
const Subprocessors = lazy(() => import('@/pages/Subprocessors'));
const Cookies = lazy(() => import('@/pages/Cookies'));
// FASE 1.2 — /StripeAnalyzer deprecated (superseded by /Analyzer + /ConnectTools + /Results).
const DevExport = lazy(() => import('@/pages/DevExport'));
const DashboardLayout = lazy(() => import('@/components/dashboard/DashboardLayout'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminOverview   = lazy(() => import('@/pages/admin/AdminOverview'));
const AdminRevenue    = lazy(() => import('@/pages/admin/AdminRevenue'));
const AdminBenchmarks = lazy(() => import('@/pages/admin/AdminBenchmarks'));
// BACKLOG-1 T4 — páginas admin lazy: estaban eager y arrastraban sus paneles
// pesados (recharts, tablas) al chunk inicial de cualquier visitante anónimo.
// El <Suspense> con LazyFallback ya envolvía <Routes>.
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminMerchants = lazy(() => import('@/pages/admin/AdminMerchants'));
const AdminUserDetail = lazy(() => import('@/pages/admin/AdminUserDetail'));
// DASHBOARD-C3: /admin/pipeline now renders the workspace projection. The old
// kanban over DealApplication (an entity with zero producers and zero rows) is
// kept on disk unrouted until C13 retires it with its redirect.
const AdminPipelineWorkspace = lazy(() => import('@/pages/admin/AdminPipelineWorkspace'));
// DASHBOARD-C7: the Recover workspace.
const AdminRecover = lazy(() => import('@/pages/admin/AdminRecover'));
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
const AdminCommand = lazy(() => import('@/pages/admin/AdminCommand'));
const AdminAgents = lazy(() => import('@/pages/admin/AdminAgents'));
const AdminDeveloper = lazy(() => import('@/pages/admin/AdminDeveloper'));
const AdminAutomations = lazy(() => import('@/pages/admin/AdminAutomations')); 
const AdminInbox = lazy(() => import('@/pages/admin/AdminInbox'));
// COMMAND-C2: /admin/chat is now the durable conversation workspace. The old
// sessionStorage-backed AdminChat.jsx is kept on disk (it is referenced by the
// approval-registry test) but is no longer routed.
const AdminCommandChat = lazy(() => import('@/pages/admin/AdminCommandChat'));
const AdminDiscovery = lazy(() => import('@/pages/admin/AdminDiscovery'));
const AdminCampaigns = lazy(() => import('@/pages/admin/AdminCampaigns'));
const AdminConversations = lazy(() => import('@/pages/admin/AdminConversations'));
const AdminCommercialAutonomy = lazy(() => import('@/pages/admin/AdminCommercialAutonomy'));
const AdminCommercialOS = lazy(() => import('@/pages/admin/AdminCommercialOS'));
const AdminIntelligence = lazy(() => import('@/pages/admin/AdminIntelligence'));
const AdminMarkets = lazy(() => import('@/pages/admin/AdminMarkets'));
const AdminGrowth = lazy(() => import('@/pages/admin/AdminGrowth'));
const AdminRoutingIntelligence = lazy(() => import('@/pages/admin/AdminRoutingIntelligence'));
const AdminFinance = lazy(() => import('@/pages/admin/AdminFinance'));
// DASHBOARD-C9: the consolidated Finance workspace. The four legacy finance routes
// stay live until C13 retires them; each one now redirects into its tab.
const AdminFinanceWorkspace = lazy(() => import('@/pages/admin/AdminFinanceWorkspace'));
// DASHBOARD-C11: the consolidated Intelligence workspace. The six legacy routes stay live
// until C13 retires them; each one now redirects into its tab.
const AdminIntelligenceWorkspace = lazy(() => import('@/pages/admin/AdminIntelligenceWorkspace'));
// DASHBOARD-C13: the last unbuilt workspace. Entry 8 of the twelve-entry sidebar pointed at
// nothing until now; the backend has existed since C4.
const AdminAudits = lazy(() => import('@/pages/admin/AdminAudits'));
// DASHBOARD-C14: the four shells that absorb the routes the founder mapped.
const AdminFounderOS = lazy(() => import('@/pages/admin/AdminFounderOS'));
const AdminCampaignsWorkspace = lazy(() => import('@/pages/admin/AdminCampaignsWorkspace'));
const AdminDiscoveryWorkspace = lazy(() => import('@/pages/admin/AdminDiscoveryWorkspace'));
const AdminSettingsWorkspace = lazy(() => import('@/pages/admin/AdminSettingsWorkspace'));
const AdminProviderEconomics = lazy(() => import('@/pages/admin/AdminProviderEconomics'));
const AdminFounderControl = lazy(() => import('@/pages/admin/AdminFounderControl'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminMaintenance = lazy(() => import('@/pages/admin/AdminMaintenance'));
const AdminDocumentation = lazy(() => import('@/pages/admin/AdminDocumentation'));
const ReviewQueue = lazy(() => import('@/pages/admin/ReviewQueue'));
const EclOperations = lazy(() => import('@/pages/admin/EclOperations')); 
const AuthRedirect = lazy(() => import('@/pages/AuthRedirect'));
const Pricing = lazy(() => import('@/pages/Pricing.jsx'));
// FASE 1.2 — /Developers, /Developers/MCP, /Snapshot deprecated.
// Frontend pages redirect to home; backend mcpServer function untouched.
// /ForProviders REACTIVADO 2026-07-12 (post-M4) — página viva payments-only
// (dos niveles Listed/Partner). Ver src/pages/ForProviders.jsx.
const ForProviders = lazy(() => import('@/pages/ForProviders'));
const Partners = lazy(() => import('@/pages/Partners'));
const HowItWorks = lazy(() => import('@/pages/HowItWorks'));
const Security = lazy(() => import('@/pages/Security'));
const Contact = lazy(() => import('@/pages/Contact'));
const Help = lazy(() => import('@/pages/Help'));
const HelpCategory = lazy(() => import('@/pages/HelpCategory'));
import HelpSlugRedirect from '@/components/shared/HelpSlugRedirect';
const AdminInvoices = lazy(() => import('@/pages/admin/AdminInvoices'));
const AdminRecoverBilling = lazy(() => import('@/pages/admin/AdminRecoverBilling'));
const AdminWaitlist = lazy(() => import('@/pages/admin/AdminWaitlist'));
const Invoices = lazy(() => import('@/pages/Invoices'));
const Vault = lazy(() => import('@/pages/Vault'));
const Referrals = lazy(() => import('@/pages/Referrals'));
const ConnectIntegrations = lazy(() => import('@/pages/ConnectIntegrations'));
const IntegrationsCallback = lazy(() => import('@/pages/IntegrationsCallback'));
const BrandProfile = lazy(() => import('@/pages/BrandProfile'));
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

  // DPA-1 (2026-08-16) — every authenticated entry passes the legal acceptance
  // gate. It renders nothing while it checks and returns `children` untouched
  // once acceptance for the CURRENT document versions exists, so the normal
  // path is unchanged; only a user who has never accepted (or whose accepted
  // versions are stale) is stopped. Admin routes have their own wrapper and
  // are covered through the same component below.
  return <LegalAcceptanceGate>{children}</LegalAcceptanceGate>;
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
        {/* DPA-1 (2026-08-16) — Data Processing Agreement + its Annex III
            (sub-processor list). Public, same shape as the other legal
            routes: canonical capitalised path + lowercase redirect. */}
        <Route path="/Dpa" element={withBoundary(<Dpa />)} />
        <Route path="/dpa" element={<Navigate to="/Dpa" replace />} />
        <Route path="/Subprocessors" element={withBoundary(<Subprocessors />)} />
        <Route path="/subprocessors" element={<Navigate to="/Subprocessors" replace />} />
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
          <Route path="/admin" element={withBoundary(<AdminFounderOS />)} />
          <Route path="/admin/command" element={withBoundary(<AdminCommand />)} />
          <Route path="/admin/agents" element={withBoundary(<AdminAgents />)} />
          <Route path="/admin/developer" element={withBoundary(<AdminDeveloper />)} />
          <Route path="/admin/automations" element={withBoundary(<AdminAutomations />)} />
          <Route path="/admin/inbox" element={<Navigate to="/admin?tab=queue" replace />} />
          <Route path="/admin/chat" element={withBoundary(<AdminCommandChat />)} />
          <Route path="/admin/discovery" element={withBoundary(<AdminDiscoveryWorkspace />)} />
          <Route path="/admin/campaigns" element={withBoundary(<AdminCampaignsWorkspace />)} />
          <Route path="/admin/conversations" element={withBoundary(<AdminConversations />)} />
          <Route path="/admin/commercial-autonomy" element={<Navigate to="/admin/settings?tab=autonomy" replace />} />
          <Route path="/admin/commercial" element={<Navigate to="/admin/campaigns?tab=commercial" replace />} />
          <Route path="/admin/intelligence" element={withBoundary(<AdminIntelligenceWorkspace />)} />
          <Route path="/admin/markets" element={<Navigate to="/admin/intelligence?tab=markets" replace />} />
          <Route path="/admin/growth" element={<Navigate to="/admin/intelligence?tab=markets&view=growth" replace />} />
          <Route path="/admin/routing-intelligence" element={<Navigate to="/admin/intelligence?tab=routing" replace />} />
          <Route path="/admin/finance" element={withBoundary(<AdminFinanceWorkspace />)} />
          <Route path="/admin/provider-economics" element={<Navigate to="/admin/finance?tab=provider-economics" replace />} />
          <Route path="/admin/founder-control" element={withBoundary(<AdminFounderControl />)} />
          <Route path="/admin/settings" element={withBoundary(<AdminSettingsWorkspace />)} />
          <Route path="/admin/maintenance" element={withBoundary(<AdminMaintenance />)} />
          <Route path="/admin/documentation" element={withBoundary(<AdminDocumentation />)} />
          <Route path="/admin/evidence-review" element={withBoundary(<ReviewQueue />)} />
          <Route path="/admin/ecl-operations" element={withBoundary(<EclOperations />)} />
          <Route path="/admin/overview" element={<Navigate to="/admin?tab=overview" replace />} />
          <Route path="/admin/users" element={<Navigate to="/admin/settings?tab=users" replace />} />
          <Route path="/admin/merchants" element={withBoundary(<AdminMerchants />)} />
          <Route path="/admin/users/:id" element={withBoundary(<AdminUserDetail />)} />
          <Route path="/admin/pipeline" element={withBoundary(<AdminPipelineWorkspace />)} />
          <Route path="/admin/recover" element={withBoundary(<AdminRecover />)} />
          <Route path="/admin/audits" element={withBoundary(<AdminAudits />)} />
          <Route path="/admin/deals" element={withBoundary(<AdminDeals />)} />
          <Route path="/admin/providers" element={<Navigate to="/admin/intelligence?tab=providers" replace />} />
          <Route path="/admin/revenue" element={<Navigate to="/admin/finance?tab=revenue" replace />} />
          <Route path="/admin/benchmarks" element={<Navigate to="/admin/intelligence?tab=benchmarks" replace />} />
          <Route path="/admin/contracts" element={<Navigate to="/admin/recover?tab=contracts" replace />} />
          <Route path="/admin/integrations" element={withBoundary(<AdminIntegrations />)} />
          <Route path="/admin/api-integrations" element={withBoundary(<AdminApiIntegrations />)} />
          <Route path="/admin/control" element={withBoundary(<AdminControl />)} />
          <Route path="/admin/recommendations" element={<Navigate to="/admin/intelligence?tab=recommendations" replace />} />
          <Route path="/admin/compliance" element={withBoundary(<AdminCompliance />)} />
          <Route path="/admin/activity" element={withBoundary(<AdminActivity />)} />
          <Route path="/admin/approvals" element={<Navigate to="/admin?tab=queue" replace />} />
          <Route path="/admin/activation" element={withBoundary(<AdminActivationDetail />)} />
          <Route path="/admin/activation/:id" element={withBoundary(<AdminActivationDetail />)} />
          <Route path="/admin/invoices" element={withBoundary(<AdminInvoices />)} />
          <Route path="/admin/recover-billing" element={<Navigate to="/admin/finance?tab=merchant-billing" replace />} />
          <Route path="/admin/waitlist" element={<Navigate to="/admin/discovery?tab=waitlist" replace />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <LanguageProvider>
      <MarketProvider>
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
      </MarketProvider>
    </LanguageProvider>
  );
}

export default App;
