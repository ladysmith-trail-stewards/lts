import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

// ── Types ─────────────────────────────────────────────────────────────────────

type AppRole = Database['public']['Enums']['app_role'];

export interface AuthState {
  /** undefined = still loading, null = no session */
  user: User | null | undefined;
  role: AppRole | null;
  regionId: number | null;
  /** Convenience helper — true when role is 'admin' or 'super_admin'. */
  isAdmin: boolean;
  /** Convenience helper — true only when role is 'super_admin'. */
  isSuperAdmin: boolean;
  /** True when the user has accepted the membership policy. Sourced from the
   *  `policy_accepted` JWT claim stamped by custom_access_token_hook. */
  policyAccepted: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: undefined,
  role: null,
  regionId: null,
  isAdmin: false,
  isSuperAdmin: false,
  policyAccepted: false,
  loading: true,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<AppRole | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  /** isAdmin is derived from role — no separate state needed. */
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isSuperAdmin = role === 'super_admin';

  /**
   * Apply claims from a JWT payload to context state.
   * When onAuthStateChange fires with a fresh session we decode the access
   * token directly — this is always the newest JWT, avoiding getClaims()
   * returning a stale cached token after a refresh.
   * On mount (no session yet) we fall back to getClaims().
   */
  async function loadClaims(session?: { access_token: string } | null) {
    let claims: Record<string, unknown> = {};

    if (session?.access_token) {
      // Decode the JWT payload directly — no network call, always fresh.
      try {
        const payload = session.access_token.split('.')[1];
        claims = JSON.parse(atob(payload));
      } catch {
        // Malformed token — fall through to empty claims
      }
    } else {
      // Fallback for initial mount where we don't have a session object handy.
      const { data, error } = await supabase.auth.getClaims();
      if (!error && data) {
        claims = data.claims as Record<string, unknown>;
      }
    }

    setRole((claims.user_role as AppRole) ?? null);
    setRegionId(claims.region_id != null ? Number(claims.region_id) : null);
    setPolicyAccepted(claims.policy_accepted === true);
    setLoading(false);
  }

  useEffect(() => {
    // On mount, check for an existing session and load claims if present.
    // getUser() hits the Auth server to confirm the session is still valid.
    supabase.auth.getUser().then(({ data, error }) => {
      const resolved = error || !data?.user ? null : data.user;
      setUser(resolved);
      if (resolved) {
        loadClaims();
      } else {
        setLoading(false);
      }
    });

    // Keep state in sync on sign-in, sign-out, and token-refresh.
    // We pass the session directly so loadClaims can decode the fresh JWT
    // rather than relying on getClaims() which may return a cached token.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const resolved = session?.user ?? null;
      setUser(resolved);
      if (resolved) {
        loadClaims(session);
      } else {
        setRole(null);
        setRegionId(null);
        setPolicyAccepted(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        regionId,
        isAdmin,
        isSuperAdmin,
        policyAccepted,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext);
}
