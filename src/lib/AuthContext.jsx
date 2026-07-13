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
    // #1 FIX Layer B — MUST run BEFORE the public-landing early-return.
    //
    // Root cause of the "user lands on / after signup" bug:
    // Base44's SIGNUP path drops from_url and returns the user to "/". The
    // landing is public → AuthContext hits the early-return below and NEVER
    // calls checkUserAuth. Layer B rescue that used to live inside
    // checkUserAuth was therefore unreachable exactly when it was needed.
    //
    // Fix: read the pending anon session id here (synchronous storage
    // access, no network) BEFORE any short-circuit. If present + valid UUID
    // v4 + we're not already on /Results, redirect immediately.
    //
    // We read TWO channels in priority order:
    //   1) localStorage       — same-tab LOGIN path (fast, always works).
    //   2) cambra_anon_session cookie — SIGNUP path when Base44 returns
    //      in a different tab/context (OAuth popup, magic-link opened
    //      elsewhere), where localStorage of the origin tab isn't shared.
    // Whichever channel has a valid UUID wins. If both disagree,
    // localStorage takes precedence (more recent, tighter to the tab).
    try {
      if (typeof window !== 'undefined') {
        const uuidRe =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        // Channel 1 — localStorage
        let pending = null;
        try { pending = localStorage.getItem('cambra_pending_anon_session'); }
        catch { /* fall through to cookie */ }

        // Channel 2 — cookie fallback (only if localStorage was empty/unusable)
        if (!pending) {
          try {
            const raw = document.cookie || '';
            const match = raw.match(/(?:^|;\s*)cambra_anon_session=([^;]+)/);
            if (match) pending = decodeURIComponent(match[1]);
          } catch { /* no cookie access — nothing more to try */ }
        }

        if (pending) {
          const looksLikeUuid = uuidRe.test(pending);
          const onResults =
            window.location.pathname === '/Results' &&
            window.location.search.includes('session=');
          if (looksLikeUuid && !onResults) {
            // NOTE: we do NOT clear either channel here. PaymentsResults
            // re-writes both on mount, so leaving them in place is harmless
            // and keeps the rescue idempotent if the redirect itself gets
            // interrupted (flaky network, refresh, etc.).
            window.location.replace(`/Results?session=${encodeURIComponent(pending)}`);
            return;
          }
          // Malformed value → clean up silently in both channels.
          if (!looksLikeUuid) {
            try { localStorage.removeItem('cambra_pending_anon_session'); } catch {}
            try { document.cookie = 'cambra_anon_session=; Max-Age=0; Path=/; SameSite=Lax'; } catch {}
          }
        }
      }
    } catch { /* storage unavailable → nothing we can do, fall through */ }

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

      // Layer B rescue for anonymous-audit continuity now lives at the top
      // of checkAppState() so it runs BEFORE the public-landing early-return.
      // That path is exactly what Base44's signup branch triggers (drops
      // from_url → lands user on "/") and the previous placement here was
      // never reached for that case.
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