import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

// ── Types ─────────────────────────────────────────────────────────────────────

type AppRole = Database['public']['Enums']['app_role'];

export interface AuthState {
  /** null = not loaded yet, undefined = no session */
  user: User | null | undefined;
  role: AppRole | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: undefined,
  role: null,
  loading: true,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    const { data: r } = await supabase.rpc('get_my_role');
    setRole((r as AppRole) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    // Initial session check
    supabase.auth.getUser().then(({ data, error }) => {
      const resolved = error || !data?.user ? null : data.user;
      setUser(resolved);
      if (resolved) {
        loadProfile();
      } else {
        setLoading(false);
      }
    });

    // Stay in sync with sign-in / sign-out events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const resolved = session?.user ?? null;
      setUser(resolved);
      if (resolved) {
        loadProfile();
      } else {
        setRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext);
}
