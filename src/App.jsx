import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
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
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
        <div className="text-4xl animate-spin" style={{ animationDuration: "3s" }}>✱</div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Landing" replace />} />
      <Route path="/Landing" element={<Landing />} />
      <Route path="/Onboarding" element={<Onboarding />} />
      <Route path="/Analyzer" element={<Analyzer />} />
      <Route path="/Results" element={<Results />} />

      {/* Dashboard routes with layout */}
      <Route element={<DashboardLayout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Reports" element={<Reports />} />
        <Route path="/Network" element={<Network />} />
        <Route path="/Deals" element={<Deals />} />
        <Route path="/Insights" element={<Insights />} />
        <Route path="/InsightDetail" element={<InsightDetail />} />
        <Route path="/Account" element={<Account />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App