import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LanguageProvider } from '@/lib/i18n.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding';
import Analyzer from '@/pages/Analyzer';
import Results from '@/pages/Results';
import Dashboard from '@/pages/Dashboard';
import Reports from '@/pages/Reports';
import Network from '@/pages/Network';
import Deals from '@/pages/Deals';
import Insights from '@/pages/Insights';
import InsightDetail from '@/pages/InsightDetail';
import Account from '@/pages/Account';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import ConnectTools from '@/pages/ConnectTools';
import StripeAnalyzer from '@/pages/StripeAnalyzer';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminOverview from '@/pages/admin/AdminOverview';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminUserDetail from '@/pages/admin/AdminUserDetail';
import AdminApplications from '@/pages/admin/AdminApplications';
import AdminPipeline from '@/pages/admin/AdminPipeline';
import AdminDeals from '@/pages/admin/AdminDeals';
import AdminProviders from '@/pages/admin/AdminProviders';
import AdminRevenue from '@/pages/admin/AdminRevenue';
import AdminBenchmarks from '@/pages/admin/AdminBenchmarks';
import { base44 } from '@/api/base44Client';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return null;
  if (!isAuthenticated) {
    base44.auth.redirectToLogin(window.location.href);
    return null;
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

  if (isLoadingAuth || loadingUser) return null;
  if (!isAuthenticated) {
    base44.auth.redirectToLogin(window.location.href);
    return null;
  }
  if (user?.role !== "admin") {
    return <Navigate to="/Dashboard" replace />;
  }
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
        <div
          className="text-4xl text-foreground/30 select-none"
          style={{ animation: "spin 4s linear infinite" }}
        >✱</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    // Don't redirect for auth_required — let the app show public pages
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/Landing" replace />} />
        <Route path="/Landing" element={<Landing />} />
        <Route path="/Onboarding" element={<Onboarding />} />
        <Route path="/Analyzer" element={<Analyzer />} />
        <Route path="/ConnectTools" element={<ConnectTools />} />
        <Route path="/StripeAnalyzer" element={<StripeAnalyzer />} />
        <Route path="/Results" element={<Results />} />
        <Route path="/Privacy" element={<Privacy />} />
        <Route path="/Terms" element={<Terms />} />

        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/Dashboard" element={<Dashboard />} />
          <Route path="/Reports" element={<Reports />} />
          <Route path="/Network" element={<Network />} />
          <Route path="/Deals" element={<Deals />} />
          <Route path="/Insights" element={<Insights />} />
          <Route path="/InsightDetail" element={<InsightDetail />} />
          <Route path="/Account" element={<Account />} />
        </Route>

        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          <Route path="/admin/applications" element={<AdminApplications />} />
          <Route path="/admin/pipeline" element={<AdminPipeline />} />
          <Route path="/admin/deals" element={<AdminDeals />} />
          <Route path="/admin/providers" element={<AdminProviders />} />
          <Route path="/admin/revenue" element={<AdminRevenue />} />
          <Route path="/admin/benchmarks" element={<AdminBenchmarks />} />
        </Route>

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;