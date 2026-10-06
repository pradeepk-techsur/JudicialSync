import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  authControllerAuthorizeUrl,
  authControllerEntitlements,
  authControllerLogout,
  setSessionTokenProvider,
  setUnauthenticatedHandler,
} from '../api/client';

/**
 * ============================================================================
 * AuthProvider — the single source of client-side session and entitlement state.
 * ============================================================================
 *
 * It holds the session token, fetches the caller's computed entitlements, and
 * exposes {@link useAuth}. Three behaviors are load-bearing:
 *
 *   1. ENTITLEMENTS DRIVE THE UI, NEVER THE DECISION. `hasEntitlement` exists
 *      ONLY to decide what to render. `TechArch/03a-api-shared.md` §8.1: "no
 *      client-side ABAC decisions ever trusted — UI gating only." `FRD/F00`
 *      Outputs: entitlements are "never trusted as the sole enforcement point —
 *      server-side ABAC check is authoritative." A forged `hasEntitlement`
 *      would change what this UI draws and nothing else; the request it then
 *      sent would be denied by the guard chain exactly as if it had been honest.
 *
 *   2. REFETCH ON FOCUS. Plan 01-06 revokes sessions and invalidates the
 *      entitlement cache on any grant change. A stale client cache is harmless
 *      (the server re-validates every call) but a UI that never refreshes looks
 *      broken after a grant change, so entitlements refetch on window focus.
 *
 *   3. SESSION TOKEN SOURCE + 401 HANDLER are registered with the API client,
 *      so every generated call carries the bearer token and a server-reported
 *      401 (routine after revocation) clears the session and returns to login.
 */

/** A role assignment as the backend's entitlements payload reports it. */
export interface RoleAssignment {
  role: string;
  court_id?: string | null;
}

/** A scope attribute as the backend's entitlements payload reports it. */
export interface ScopeAttribute {
  scope_type?: string;
  scope_id?: string;
}

/** The authenticated principal, assembled from the entitlements endpoint. */
export interface Principal {
  user_id: string;
  display_name: string;
  roles: RoleAssignment[];
  scopes: ScopeAttribute[];
  entitlements: string[];
}

interface AuthContextValue {
  principal: Principal | null;
  /** True while the session exists but entitlements are still loading. */
  loading: boolean;
  /** UI gating ONLY — the server re-validates every call. */
  hasEntitlement(key: string): boolean;
  /** Begin the real OIDC redirect to Keycloak. */
  login(): Promise<void>;
  /** Revoke the session server-side and clear local state. */
  logout(): Promise<void>;
  /** Persist the session after a successful callback. */
  setSession(token: string): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_STORAGE_KEY = 'judicialsync.session_token';

/** Shapes the backend returns that the generated client types as `unknown`. */
interface AuthorizeUrlResponse {
  authorization_url: string;
  state: string;
}
interface EntitlementsResponse {
  user_id: string;
  display_name?: string;
  roles: RoleAssignment[];
  scopes: ScopeAttribute[];
  entitlements: string[];
}

/**
 * How often, at most, to refetch entitlements. A short window matches the
 * server-side claim cache; the exact value is not security-relevant because the
 * server re-validates every call regardless.
 */
const ENTITLEMENT_STALE_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.sessionStorage.getItem(SESSION_STORAGE_KEY) : null,
  );

  // Register the token source so every API call carries the bearer token.
  useEffect(() => {
    setSessionTokenProvider(() => token);
  }, [token]);

  const clearSession = useCallback(() => {
    setToken(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    queryClient.removeQueries({ queryKey: ['entitlements'] });
  }, [queryClient]);

  // A server-reported 401 (routine after revocation) clears state and the
  // RequireSession wrapper then redirects to /login.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      clearSession();
    });
  }, [clearSession]);

  const setSession = useCallback((newToken: string) => {
    setToken(newToken);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, newToken);
    }
  }, []);

  const entitlementsQuery = useQuery({
    queryKey: ['entitlements', token],
    enabled: token !== null,
    staleTime: ENTITLEMENT_STALE_MS,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<EntitlementsResponse> => {
      const { data, error } = await authControllerEntitlements();
      if (error !== undefined || data === undefined) {
        throw new Error('Failed to load entitlements');
      }
      return data as EntitlementsResponse;
    },
  });

  const principal = useMemo<Principal | null>(() => {
    if (token === null) {
      return null;
    }
    const data = entitlementsQuery.data;
    if (data === undefined) {
      return null;
    }
    return {
      user_id: data.user_id,
      display_name: data.display_name ?? data.user_id,
      roles: data.roles ?? [],
      scopes: data.scopes ?? [],
      entitlements: data.entitlements ?? [],
    };
  }, [token, entitlementsQuery.data]);

  const hasEntitlement = useCallback(
    (key: string): boolean => principal?.entitlements.includes(key) ?? false,
    [principal],
  );

  const login = useCallback(async (): Promise<void> => {
    const { data, error } = await authControllerAuthorizeUrl();
    if (error !== undefined || data === undefined) {
      throw new Error('Could not start sign-in');
    }
    const payload = data as AuthorizeUrlResponse;
    // Preserve state for the callback to validate server-side.
    window.sessionStorage.setItem('judicialsync.oidc_state', payload.state);
    // Full-page navigation to the IdP — the application never sees credentials.
    window.location.assign(payload.authorization_url);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authControllerLogout();
    } finally {
      clearSession();
      window.location.assign('/login');
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      principal,
      loading: token !== null && entitlementsQuery.isLoading,
      hasEntitlement,
      login,
      logout,
      setSession,
    }),
    [principal, token, entitlementsQuery.isLoading, hasEntitlement, login, logout, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
