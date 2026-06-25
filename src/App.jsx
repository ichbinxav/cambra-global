import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
// TEMP DEBUG — diagnostic overlay for the Safari/iOS black-screen issue.
// Remove once confirmed fixed.
function DebugOverlay() {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const hasToken = typeof window !== "undefined" && (() => {
    try { return !!window.localStorage.getItem("base44_access_token"); } catch { return false; }
  })();
  const rootChildren = typeof document !== "undefined"
    ? (document.getElementById("root")?.children.length ?? 0)
    : 0;
  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        right: 8,
        zIndex: 99999,
        background: "rgba(0,0,0,0.92)",
        border: "1px solid #22d3ee",
        borderRadius: 12,
        padding: 12,
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        color: "#fff",
        lineHeight: 1.6,
        pointerEvents: "none",
        maxWidth: 520,
        marginInline: "auto",
      }}
    >
      <div style={{ color: "#22d3ee", fontWeight: 700, marginBottom: 4 }}>🔍 CAMBRA DEBUG</div>
      <div>path: {path}</div>
      <div>isAuthenticated: {String(isAuthenticated)}</div>
      <div>isLoadingAuth: {String(isLoadingAuth)}</div>
      <div>isLoadingPublicSettings: {String(isLoadingPublicSettings)}</div>
      <div>authError: {authError ? authError.type : "null"}</div>
      <div>hasToken: {String(hasToken)}</div>
      <div>root children: {rootChildren}</div>
    </div>
  );
}
import { LanguageProvider } from '@/lib/i18n.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { base44 } from '@/api/base44Client';

import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding.jsx';
import Analyzer from '@/pages/Analyzer';
// FIX 13 — Lazy load heavy pages (Results, Dashboard, ConnectTools + heavy admin pages)
const Results       = lazy(() => import('@/pages/Results'));
const Dashboard     = lazy(() => import('@/pages/Dashboard'));
const ConnectTools  = lazy(() => import('@/pages/ConnectTools'));
const Reports       = lazy(() => import('@/pages/Reports'));
const Network       = lazy(() => import('@/pages/Network'));
const Insights      = lazy(() => import('@/pages/Insights'));
const InsightDetail = lazy(() => import('@/pages/InsightDetail'));
import Account from '@/pages/Account';
import UnlockSavings from '@/pages/UnlockSavings';
import RecoveryTracker from '@/pages/RecoveryTracker';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import Cookies from '@/pages/Cookies';
import StripeAnalyzer from '@/pages/StripeAnalyzer';
import DevExport from '@/pages/DevExport';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
const AdminOverview   = lazy(() => import('@/pages/admin/AdminOverview'));
const AdminRevenue    = lazy(() => import('@/pages/admin/AdminRevenue'));
const AdminBenchmarks = lazy(() => import('@/pages/admin/AdminBenchmarks'));
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminUserDetail from '@/pages/admin/AdminUserDetail';
import AdminApplications from '@/pages/admin/AdminApplications';
import AdminPipeline from '@/pages/admin/AdminPipeline';
import AdminDeals from '@/pages/admin/AdminDeals';
import AdminProviders from '@/pages/admin/AdminProviders';
import AdminContracts from '@/pages/admin/AdminContracts';
import AdminIntegrations from '@/pages/admin/AdminIntegrations';
import AdminApiIntegrations from '@/pages/admin/AdminApiIntegrations';
import AdminControl from '@/pages/admin/AdminControl';
import AdminActivationDetail from '@/pages/admin/AdminActivationDetail';
import AdminRecommendations from '@/pages/admin/AdminRecommendations';
import AuthRedirect from '@/pages/AuthRedirect';
import LoginGate from '@/pages/LoginGate';
import CookieConsent from '@/components/shared/CookieConsent';
import AdaptiveMarketingRoute from '@/components/shared/AdaptiveMarketingRoute';
import Pricing from '@/pages/Pricing.jsx';
import Developers from '@/pages/Developers.jsx';
import DevelopersMCP from '@/pages/DevelopersMCP.jsx';
import HowItWorks from '@/pages/HowItWorks';
import Testimonials from '@/pages/Testimonials';
import Contact from '@/pages/Contact';
import Help from '@/pages/Help';
import HelpCategory from '@/pages/HelpCategory';
import Snapshot from '@/pages/Snapshot';
import AdminInvoices from '@/pages/admin/AdminInvoices';
import Invoices from '@/pages/Invoices';
import Vault from '@/pages/Vault';
import BrandProfile from '@/pages/BrandProfile';
import BrandGlyph from '@/components/shared/BrandGlyph';
import CopilotPanel from '@/components/copilot/CopilotPanel.jsx';
import CopilotObservations from '@/components/copilot/CopilotObservations.jsx';
import ScrollToTop from '@/components/shared/ScrollToTop.jsx';
import ErrorBoundary from '@/components/shared/ErrorBoundary.jsx';
import { ToastProvider } from '@/components/shared/Toast.jsx';

// Dark-style fallback shown while lazy chunks load.
// NOT fixed-position — it sits inline inside the routed area so DashboardLayout
// chrome (sidebar/header) stays visible around it, instead of a full black screen.
function LazyFallback() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center"
      style={{ background: "#0a0a0a" }}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-10 w-10 rounded-full"
        style={{
          border: "2px solid rgba(255,255,255,0.12)",
          borderTopColor: "#22d3ee",
          animation: "cambra-spin 0.8s linear infinite",
        }}
      />
      <p className="mt-4 text-[11px] font-bold tracking-[0.22em] uppercase text-white/60">Loading</p>
      <style>{`@keyframes cambra-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Wrap a route element in a per-route ErrorBoundary so one page crash does not
// take down the whole app.
const withBoundary = (element) => <ErrorBoundary>{element}</ErrorBoundary>;

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "#0a0a0a" }}
        role="status"
      >
        <span
          className="h-8 w-8 rounded-full"
          style={{
            border: "2px solid rgba(255,255,255,0.12)",
            borderTopColor: "#22d3ee",
            animation: "cambra-spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes cambra-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Persist the originally requested URL so LoginGate / AuthRedirect can restore it.
    try {
      const currentPath = window.location.pathname + window.location.search + window.location.hash;
      if (currentPath && currentPath !== '/LoginGate') {
        sessionStorage.setItem('cambra_redirect_after_login', currentPath);
      }
    } catch (e) { /* noop */ }
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return <Navigate to={`/LoginGate?next=${next}`} replace />;
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      base44.auth.me().then(u => { setUser(u); setLoadingUser(false); });
    } else if (!isLoadingAuth) {
      setLoadingUser(false);
    }
  }, [isAuthenticated, isLoadingAuth]);

  if (isLoadingAuth || loadingUser) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "#0a0a0a" }}
        role="status"
      >
        <span
          className="h-8 w-8 rounded-full"
          style={{
            border: "2px solid rgba(255,255,255,0.12)",
            borderTopColor: "#22d3ee",
            animation: "cambra-spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes cambra-spin { to { transform: rotate(360deg); } }`}</style>
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
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-4"
        style={{ background: "#0a0a0a" }}
        role="status"
        aria-live="polite"
      >
        <div
          className="h-10 w-10 rounded-full"
          style={{
            border: "3px solid rgba(255,255,255,0.15)",
            borderTopColor: "#22d3ee",
            animation: "cambra-spin 0.8s linear infinite",
          }}
        />
        <p className="text-[12px] font-bold tracking-[0.22em] uppercase text-white/70">
          Loading {isLoadingPublicSettings ? "settings" : "session"}…
        </p>
        <style>{`@keyframes cambra-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isPublicLanding && authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    // auth_required → redirect to LoginGate so the user can sign in.
    if (authError.type === 'auth_required') {
      try {
        const currentPath = window.location.pathname + window.location.search + window.location.hash;
        if (currentPath && currentPath !== '/LoginGate') {
          sessionStorage.setItem('cambra_redirect_after_login', currentPath);
        }
      } catch (e) { /* noop */ }
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      return <Navigate to={`/LoginGate?next=${next}`} replace />;
    }
    // Any other auth error → show inline error instead of black screen.
    return (
      <div
        role="alert"
        className="fixed inset-0 flex items-center justify-center px-6"
        style={{ background: "#0a0a0a", color: "#ffffff" }}
      >
        <div className="max-w-sm w-full text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-5 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <span style={{ fontSize: 22 }}>!</span>
          </div>
          <h1 className="text-xl font-black tracking-[-0.02em] mb-2">Couldn’t load the app</h1>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
            {authError.message || "Something went wrong while loading your session."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-white text-black text-sm font-bold hover:opacity-90"
          >
            Refresh page
          </button>
        </div>
      </div>
    );
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
        <Route path="/LoginGate" element={withBoundary(<LoginGate />)} />
        <Route path="/logingate" element={<Navigate to="/LoginGate" replace />} />
        <Route path="/StripeAnalyzer" element={withBoundary(<StripeAnalyzer />)} />
        <Route path="/stripeanalyzer" element={<Navigate to="/StripeAnalyzer" replace />} />
        <Route path="/analyzer" element={<Navigate to="/Analyzer" replace />} />
        <Route path="/results" element={<Navigate to="/Results" replace />} />
        <Route path="/connecttools" element={<Navigate to="/ConnectTools" replace />} />
        <Route path="/Privacy" element={withBoundary(<Privacy />)} />
        <Route path="/privacy" element={<Navigate to="/Privacy" replace />} />
        <Route path="/Terms" element={withBoundary(<Terms />)} />
        <Route path="/terms" element={<Navigate to="/Terms" replace />} />
        <Route path="/Cookies" element={withBoundary(<Cookies />)} />
        <Route path="/cookies" element={<Navigate to="/Cookies" replace />} />
        <Route path="/Snapshot" element={withBoundary(<Snapshot />)} />
        <Route path="/snapshot" element={<Navigate to="/Snapshot" replace />} />
        <Route path="/Deals" element={<Navigate to="/UnlockSavings" replace />} />
        <Route path="/deals" element={<Navigate to="/UnlockSavings" replace />} />
        <Route path="/Pricing" element={<AdaptiveMarketingRoute>{withBoundary(<Pricing />)}</AdaptiveMarketingRoute>} />
        <Route path="/pricing" element={<Navigate to="/Pricing" replace />} />
        <Route path="/Developers" element={<AdaptiveMarketingRoute>{withBoundary(<Developers />)}</AdaptiveMarketingRoute>} />
        <Route path="/developers" element={<Navigate to="/Developers" replace />} />
        <Route path="/Developers/MCP" element={<AdaptiveMarketingRoute>{withBoundary(<DevelopersMCP />)}</AdaptiveMarketingRoute>} />
        <Route path="/developers/mcp" element={<Navigate to="/Developers/MCP" replace />} />
        <Route path="/HowItWorks" element={<AdaptiveMarketingRoute>{withBoundary(<HowItWorks />)}</AdaptiveMarketingRoute>} />
        <Route path="/howitworks" element={<Navigate to="/HowItWorks" replace />} />
        <Route path="/Testimonials" element={<AdaptiveMarketingRoute>{withBoundary(<Testimonials />)}</AdaptiveMarketingRoute>} />
        <Route path="/testimonials" element={<Navigate to="/Testimonials" replace />} />
        <Route path="/Contact" element={<AdaptiveMarketingRoute>{withBoundary(<Contact />)}</AdaptiveMarketingRoute>} />
        <Route path="/contact" element={<Navigate to="/Contact" replace />} />
        <Route path="/Help" element={<AdaptiveMarketingRoute>{withBoundary(<Help />)}</AdaptiveMarketingRoute>} />
        <Route path="/help" element={<Navigate to="/Help" replace />} />
        <Route path="/Help/:slug" element={<AdaptiveMarketingRoute>{withBoundary(<HelpCategory />)}</AdaptiveMarketingRoute>} />
        <Route path="/help/:slug" element={<AdaptiveMarketingRoute>{withBoundary(<HelpCategory />)}</AdaptiveMarketingRoute>} />
        <Route path="/auth/start" element={<AuthRedirect />} />
        <Route path="/dev/export" element={<AdminRoute><DevExport /></AdminRoute>} />

        {/* Protected routes WITHOUT dashboard chrome — full-screen audit flow */}
        <Route path="/Analyzer" element={<ProtectedRoute>{withBoundary(<Analyzer />)}</ProtectedRoute>} />
        <Route path="/Results" element={<ProtectedRoute>{withBoundary(<Results />)}</ProtectedRoute>} />
        <Route path="/ConnectTools" element={<ProtectedRoute>{withBoundary(<ConnectTools />)}</ProtectedRoute>} />

        {/* Protected routes WITH dashboard chrome */}
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/Dashboard" element={withBoundary(<Dashboard />)} />
          <Route path="/Reports" element={withBoundary(<Reports />)} />
          <Route path="/Network" element={withBoundary(<Network />)} />
          <Route path="/Insights" element={withBoundary(<Insights />)} />
          <Route path="/InsightDetail" element={withBoundary(<InsightDetail />)} />
          <Route path="/Account" element={withBoundary(<Account />)} />
          <Route path="/UnlockSavings" element={withBoundary(<UnlockSavings />)} />
          <Route path="/RecoveryTracker" element={withBoundary(<RecoveryTracker />)} />
          <Route path="/Invoices" element={withBoundary(<Invoices />)} />
          <Route path="/Vault" element={withBoundary(<Vault />)} />
        </Route>



        <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route path="/admin" element={withBoundary(<AdminOverview />)} />
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
          <Route path="/admin/activation" element={withBoundary(<AdminActivationDetail />)} />
          <Route path="/admin/activation/:id" element={withBoundary(<AdminActivationDetail />)} />
          <Route path="/admin/invoices" element={withBoundary(<AdminInvoices />)} />
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
                <AuthenticatedApp />
                <CopilotPanel />
                <CopilotObservations />
                <CookieConsent />
                <DebugOverlay />
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