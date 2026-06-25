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

import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding.jsx';
import Analyzer from '@/pages/Analyzer';
// FIX 13 — Lazy load heavy pages (Results, Dashboard, ConnectTools + heavy admin pages)
const Results       = lazy(() => import('@/pages/Results'));
const Dashboard     = lazy(() => import('@/pages/Dashboard'));
const ConnectTools  = lazy(() => import('@/pages/ConnectTools'));
import Reports from '@/pages/Reports';
import Network from '@/pages/Network';
import Insights from '@/pages/Insights';
import InsightDetail from '@/pages/InsightDetail';
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

// FIX 13 — Dark-style fallback shown while lazy chunks load
function LazyFallback() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "#0a0a0a" }}
      role="status"
      aria-live="polite"
    >
      <div className="h-10 w-10 text-white/90" style={{ animation: 'spin 4s linear infinite' }}>
        <BrandGlyph className="h-10 w-10" />
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="h-8 w-8" style={{ animation: 'spin 4s linear infinite' }}>
          <BrandGlyph className="h-8 w-8" />
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2">Sign-in required</h1>
          <p className="text-sm text-muted-foreground mb-4">Open the login window and return automatically.</p>
          <a
            href="/auth/start"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold"
          >
            Sign in
          </a>
        </div>
      </div>
    );
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
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="h-8 w-8" style={{ animation: 'spin 4s linear infinite' }}>
          <BrandGlyph className="h-8 w-8" />
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background" role="status" aria-live="polite">
        <div className="h-12 w-12 text-foreground/90" style={{ animation: 'spin 4s linear infinite' }}>
          <BrandGlyph className="h-12 w-12" />
        </div>
        <p className="mt-3 text-sm text-foreground/70">Loading…</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
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
        <Route path="/Analyzer" element={withBoundary(<Analyzer />)} />
        <Route path="/ConnectTools" element={withBoundary(<ConnectTools />)} />
        <Route path="/connecttools" element={<Navigate to="/ConnectTools" replace />} />
        <Route path="/StripeAnalyzer" element={withBoundary(<StripeAnalyzer />)} />
        <Route path="/stripeanalyzer" element={<Navigate to="/StripeAnalyzer" replace />} />
        <Route path="/Results" element={withBoundary(<Results />)} />
        <Route path="/analyzer" element={<Navigate to="/Analyzer" replace />} />
        <Route path="/results" element={<Navigate to="/Results" replace />} />
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
        <Route path="/Pricing" element={withBoundary(<Pricing />)} />
        <Route path="/pricing" element={<Navigate to="/Pricing" replace />} />
        <Route path="/Developers" element={withBoundary(<Developers />)} />
        <Route path="/developers" element={<Navigate to="/Developers" replace />} />
        <Route path="/Developers/MCP" element={withBoundary(<DevelopersMCP />)} />
        <Route path="/developers/mcp" element={<Navigate to="/Developers/MCP" replace />} />
        <Route path="/HowItWorks" element={withBoundary(<HowItWorks />)} />
        <Route path="/howitworks" element={<Navigate to="/HowItWorks" replace />} />
        <Route path="/Testimonials" element={withBoundary(<Testimonials />)} />
        <Route path="/testimonials" element={<Navigate to="/Testimonials" replace />} />
        <Route path="/Contact" element={withBoundary(<Contact />)} />
        <Route path="/contact" element={<Navigate to="/Contact" replace />} />
        <Route path="/Help" element={withBoundary(<Help />)} />
        <Route path="/help" element={<Navigate to="/Help" replace />} />
        <Route path="/Help/:slug" element={withBoundary(<HelpCategory />)} />
        <Route path="/help/:slug" element={withBoundary(<HelpCategory />)} />
        <Route path="/auth/start" element={<AuthRedirect />} />
        <Route path="/dev/export" element={<AdminRoute><DevExport /></AdminRoute>} />

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