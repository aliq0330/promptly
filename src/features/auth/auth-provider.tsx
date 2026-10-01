"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";

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
  const router = useRouter();
  const pathname = usePathname();
  // Ref so the one-time auth listener always sees the current path.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch((err) => {
        // A real network failure throws instead of resolving — without this,
        // `loading` would stay true forever and every page waiting on auth
        // state (header, nav, forms) would hang.
        console.error("getSession", err);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        // Safety net: if Supabase's Site URL / redirect allow-list sent the
        // recovery link to some other page (e.g. the home page), still land
        // on the reset form instead of leaving the user stranded.
        if (!pathnameRef.current.startsWith("/reset-password")) {
          router.replace("/reset-password");
        }
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

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
