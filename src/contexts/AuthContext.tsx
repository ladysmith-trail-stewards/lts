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
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: undefined,
  role: null,
  regionId: null,
  isAdmin: false,
  loading: true,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<AppRole | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  /** isAdmin is derived from role — no separate state needed. */
  const isAdmin = role === 'admin' || role === 'super_admin';

  /**
   * Load claims from the verified JWT via getClaims().
   *
   * getClaims() verifies the JWT against the server's JWKS endpoint (cached),
   * returning the decoded payload without a DB round-trip. Our custom access
   * token hook injects user_role and region_id into every JWT, so we read
   * them directly from the verified claims here.
   */
  async function loadClaims() {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) {
      setRole(null);
      setRegionId(null);
    } else {
      const claims = data.claims as Record<string, unknown>;
      setRole((claims.user_role as AppRole) ?? null);
      setRegionId(claims.region_id != null ? Number(claims.region_id) : null);
    }
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
    // getClaims() is called after every token refresh so custom claims
    // (role, region) always reflect the latest minted JWT.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const resolved = session?.user ?? null;
      setUser(resolved);
      if (resolved) {
        loadClaims();
      } else {
        setRole(null);
        setRegionId(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, regionId, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext);
}
