import { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { isBot } from '@/lib/utils';


const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    // Hard stop for public homepage: no auth or app calls on '/'
    const isPublicLandingPath = typeof window !== 'undefined' && (
      window.location.pathname === '/' ||
      window.location.pathname === '/Landing' ||
      window.location.pathname === '/landing'
    );
    if (isPublicLandingPath) {
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError(null);
      return;
    }

    // Skip network calls for crawlers/bots to avoid 4xx XHRs in Google Search Console
    if (isBot) {
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError(null);
      return;
    }
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      try {
        const res = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`, {
          headers: {
            'X-App-Id': appParams.appId,
            ...(appParams.token ? { 'Authorization': `Bearer ${appParams.token}` } : {})
          },
          credentials: 'include'
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const err = new Error('Failed to load app public settings');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        const publicSettings = await res.json();
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();


      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);

      // #1 FIX Layer B (2026-07-12) — rescue anonymous-audit continuity.
      //
      // Root cause: base44.auth.redirectToLogin(nextUrl) encodes nextUrl into
      // /login?from_url=...; that from_url is respected by the LOGIN branch
      // but can be dropped by the SIGNUP branch (new-account creation, which
      // is exactly what the "Stop overpaying" CTA is designed to trigger).
      // When that happens, the freshly-authenticated user lands on "/" (the
      // landing page) instead of their /Results?session=<uuid> — the
      // conversion moment breaks and the audit appears "lost".
      //
      // Layer A (URL ?next=) handles the login branch. This layer handles the
      // signup branch: PaymentsResults writes `cambra_pending_anon_session`
      // to localStorage right before firing redirectToLogin. As soon as the
      // user finishes signup and this AuthContext confirms authentication,
      // we detect that pending id and route them to their Results page.
      //
      // Idempotent: the key is removed immediately after read, so a second
      // login (later) doesn't ping-pong the user. Only fires when NOT already
      // on /Results (avoids interfering with the normal login-branch flow
      // that already lands the user on the right URL via from_url).
      try {
        const pending = localStorage.getItem("cambra_pending_anon_session");
        if (pending && typeof window !== "undefined") {
          localStorage.removeItem("cambra_pending_anon_session");
          const onResults =
            window.location.pathname === "/Results" &&
            window.location.search.includes("session=");
          // UUID v4 shape check — same regex as PaymentsResults reader guard.
          const looksLikeUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pending);
          if (looksLikeUuid && !onResults) {
            window.location.replace(`/Results?session=${encodeURIComponent(pending)}`);
            return;
          }
        }
      } catch { /* storage unavailable → Layer A / from_url still applies */ }
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};