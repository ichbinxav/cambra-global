import React from "react";
import { useAuth } from "@/lib/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Outlet } from "react-router-dom";

/**
 * Wraps a marketing page so that:
 *  - Logged-out visitors see it as a normal public page (MarketingPageShell
 *    already paints the full dark shell + MarketingNavbar).
 *  - Logged-in users see it INSIDE the DashboardLayout chrome (sidebar etc.),
 *    so navigating from the in-app navbar feels continuous instead of jumping
 *    to a black full-screen takeover.
 *
 * MarketingPageShell itself detects auth and switches to its inline dark-card
 * mode when rendered inside DashboardLayout.
 */
export default function AdaptiveMarketingRoute({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return children;
  }

  if (isAuthenticated) {
    return (
      <DashboardLayout>
        {children}
      </DashboardLayout>
    );
  }

  return children;
}

/**
 * Variant for use with React Router <Route element={...}><Route /></Route>:
 * renders <Outlet /> inside the adaptive wrapper.
 */
export function AdaptiveMarketingLayout() {
  return (
    <AdaptiveMarketingRoute>
      <Outlet />
    </AdaptiveMarketingRoute>
  );
}