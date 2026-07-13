import { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { isBot } from '@/lib/utils';


const AuthContext = createContext();

// ── Anonymous-session rescue helpers ───────────────────────────────────────
// The rescue exists for ONE purpose: carry the anonymous Analyzer session id
// across Base44's signup redirect so a freshly-created user who lands on "/"
// gets bounced back to their populated report. It reads two channels because
// Base44's SIGNUP branch can return in a different tab/context (OAuth popup)
// where the origin tab's localStorage isn't shared:
//   1) localStorage['cambra_pending_anon_session'] — same-tab LOGIN path.
//   2) cookie 'cambra_anon_session'                — cross-tab SIGNUP path.
const ANON_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidAnonSession(v) {
  return typeof v === 'string' && ANON_UUID_RE.test(v);
}

function readPendingAnonSession() {
  if (typeof window === 'undefined') return null;
  let pending = null;
  try { pending = localStorage.getItem('cambra_pending_anon_session'); }
  catch { /* fall through to cookie */ }
  if (!pending) {
    try {
      const match = (document.cookie || '').match(/(?:^|;\s*)cambra_anon_session=([^;]+)/);
      if (match) pending = decodeURIComponent(match[1]);
    } catch { /* no cookie access */ }
  }
  return pending;
}

function clearPendingAnonSession() {
  try { localStorage.removeItem('cambra_pending_anon_session'); } catch { /* ignore */ }
  try { document.cookie = 'cambra_anon_session=; Max-Age=0; Path=/; SameSite=Lax'; } catch { /* ignore */ }
}

// Fire the rescue ONLY when it's genuinely the post-signup landing case:
// unauthenticated + on "/" + a valid pending id present. Clears the pending
// id in the SAME tick as the redirect (armed-and-consumed atomically) so it
// can never fire twice → no loop. Returns true if it redirected.
function maybeRescueAnonymousSession() {
  if (typeof window === 'undefined') return false;
  const onLanding =
    window.location.pathname === '/' ||
    window.location.pathname === '/Landing' ||
    window.location.pathname === '/landing';
  if (!onLanding) return false;
  const pending = readPendingAnonSession();
  if (!isValidAnonSession(pending)) return false;
  // Consume immediately — clear BEFORE the redirect so a reload can't re-arm.
  clearPendingAnonSession();
  window.location.replace(`/Results?session=${encodeURIComponent(pending)}`);
  return true;
}

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
    // ─────────────────────────────────────────────────────────────────────
    // SESSION FIX (2026-07-13) — AUTH RESOLVES BEFORE THE ANONYMOUS RESCUE.
    //
    // Previous bug: the anonymous-session rescue ran at the very TOP of
    // checkAppState and could `return` (redirect to /Results) BEFORE auth
    // was ever verified. Because `cambra_pending_anon_session` was never
    // cleared, that rescue fired on EVERY mount — hijacking every navigation
    // of an already-logged-in user back to the anonymous /Results, which the
    // founder experienced as "the app forgets I'm logged in / keeps sending
    // me to the anonymous analysis".
    //
    // New order (see maybeRescueAnonymousSession below for the actual gate):
    //   1. Resolve auth FIRST (checkUserAuth, later in this function).
    //   2. If authenticated → the rescue is DISARMED (pending cleared).
    //   3. ONLY if NOT authenticated AND on "/" AND a valid pending id
    //      exists → rescue (armed-and-consumed atomically: cleared in the
    //      same tick as the redirect, so it can never loop).
    // The rescue can NO LONGER abort checkUserAuth — auth always runs first.
    //
    // Malformed-value cleanup is safe to do up front (no redirect, no return).
    try {
      if (typeof window !== 'undefined') {
        const pending = readPendingAnonSession();
        if (pending && !isValidAnonSession(pending)) {
          clearPendingAnonSession();
        }
      }
    } catch { /* storage unavailable → nothing to clean, fall through */ }

    // Hard stop for public homepage: no auth or app calls on '/'
    const isPublicLandingPath = typeof window !== 'undefined' && (
      window.location.pathname === '/' ||
      window.location.pathname === '/Landing' ||
      window.location.pathname === '/landing'
    );
    if (isPublicLandingPath) {
      // SESSION FIX (2026-07-13, part 2) — PRODUCTION BUG on cambra.global.
      //
      // Verified evidence: on the custom domain the token IS in localStorage,
      // the SDK attaches it, and GET /me returns 200 with the real user — yet
      // the landing rendered the ANONYMOUS view. Root cause found here: this
      // branch used to hard-set isAuthenticated=false and `return` WITHOUT
      // ever calling /me. So isAuthenticated never derived from User.me() on
      // "/" — it derived from "am I on the landing? → false". That is the bug.
      //
      // Fix: still keep the landing INSTANT for anonymous visitors (no token →
      // no network call, exactly as before), but when a token IS present,
      // resolve auth from /me just like every other route. An authenticated
      // user on "/" is now correctly recognized as authenticated.
      setAuthError(null);
      if (appParams.token) {
        const didAuth = await checkUserAuth();
        setIsLoadingPublicSettings(false);
        // Authenticated → DISARM the rescue (an existing user has no pending
        // anonymous report to be bounced to). Only rescue when /me failed.
        if (didAuth) {
          clearPendingAnonSession();
        } else {
          maybeRescueAnonymousSession();
        }
      } else {
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        // Post-signup rescue for the token-less landing case: Base44's signup
        // branch can return the user to "/" with no token in the URL yet.
        // maybeRescueAnonymousSession is self-gated (only "/" + valid pending)
        // and consumes the id atomically, so a genuine new signup is bounced
        // to its report exactly once; a normal landing visit is a no-op.
        maybeRescueAnonymousSession();
      }
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
        
        // AUTH-FIRST: resolve authentication BEFORE the anonymous rescue can
        // act, so the rescue never hijacks a logged-in user's navigation.
        let didAuth = false;
        if (appParams.token) {
          didAuth = await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);

        // Post-auth anonymous-session handling:
        //   • Authenticated → DISARM the rescue (the handoff is done or was
        //     never needed — an existing user has no pending anon report).
        //   • Not authenticated → the rescue MAY fire, but only on "/" with a
        //     valid pending id (handled inside maybeRescueAnonymousSession,
        //     which consumes the id atomically to prevent any loop).
        if (didAuth) {
          clearPendingAnonSession();
        } else {
          maybeRescueAnonymousSession();
        }
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

      // Anonymous-session rescue is orchestrated by checkAppState AFTER this
      // resolves (auth-first ordering). Returning true lets the caller DISARM
      // the rescue for authenticated users.
      return true;
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
      return false;
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