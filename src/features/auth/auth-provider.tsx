"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** True until the initial session check resolves — avoids a flash of "logged out" UI on load. */
  loading: boolean;
  /** True while Supabase is mid-password-recovery flow (arrived via a reset-password email link). */
  isPasswordRecovery: boolean;
  /** Called once the recovery flow finishes (password updated) so it doesn't linger for the rest of the session. */
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Tracks the real Supabase Auth session — *who is authenticated*. Paired
 * with `OwnProfileProvider` (the signed-in user's real `profiles` row) for
 * anything that needs their display name/avatar/username too.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setIsPasswordRecovery(false);
  }

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
  }

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isPasswordRecovery,
      clearPasswordRecovery,
      signOut,
    }),
    [session, loading, isPasswordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
