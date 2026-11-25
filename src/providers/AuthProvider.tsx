import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  userId: string | null;
  ready: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // never let cached data from one account be shown to another
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      ready,
      // scope 'local' clears this device; refresh token is revoked server-side
      signOut: async () => {
        await supabase.auth.signOut();
        qc.clear();
      },
    }),
    [session, ready, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function useUserId(): string {
  const { userId } = useAuth();
  if (!userId) throw new Error('Not signed in');
  return userId;
}
