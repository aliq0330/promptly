"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { clearMediaUrlCache } from "@/lib/supabase/media-url";
import { clearSwitchOrigin } from "@/lib/supabase/account-switch";
import { useRouter, usePathname } from "next/navigation";
import { absoluteUrl } from "@/lib/utils";
import { userSignature } from "@/lib/user-identity";
import { clearSnapshots } from "@/lib/feed-snapshot";

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
  const lastUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (lastUserIdRef.current === null) lastUserIdRef.current = data.session?.user?.id ?? null;
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
      // Oturum kapanınca ya da kullanıcı değişince (hesap değiştirme / çıkış-giriş) önceki kullanıcının BELLEKTEKİ her kopyası atılır:
      // medya imzaları, sağlayıcıların içerik önbellekleri (prompt/istek/workflow/hazır ayar), modül düzeyindeki depolar. Bunların tek tek
      // temizlenmesi unutulabilir ve sızar — yeni hesap önceki hesabın görebildiği özel topluluk içeriğini önbellekten görürdü — bu yüzden sayfa baştan
      // yüklenir (docs/history/195-*). Yalnız GERÇEK bir kimlik değişiminde: ilk yükleme, aynı kullanıcının belirteç yenilemesi ve giriş yapma (misafir → kullanıcı) etkilenmez.
      const nextUserId = nextSession?.user?.id ?? null;
      const previousUserId = lastUserIdRef.current;
      const identityChanged = previousUserId !== null && nextUserId !== previousUserId;
      lastUserIdRef.current = nextUserId;
      if (identityChanged) {
        clearMediaUrlCache();
        // Cihazda saklanan son listeler (docs/history/466-*) kişiye göre ayrıdır; çıkışta yine de hepsi silinir (paylaşılan cihaz).
        if (nextUserId === null) clearSnapshots();
        if (typeof window !== "undefined") {
          if (nextUserId === null) window.location.replace(absoluteUrl("/"));
          else window.location.reload();
        }
        return;
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  async function signOut() {
    clearSnapshots();
    await supabase.auth.signOut();
    clearSwitchOrigin();
    setIsPasswordRecovery(false);
  }

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
  }

  // Aynı kişinin `user` nesnesi SABİT kalır (docs/history/466-*): supabase-js her oturum olayında (getSession, INITIAL_SESSION, SIGNED_IN, saatlik
  // TOKEN_REFRESHED) yeni bir nesne verir; `[user]`'a bağlı her efekt (hikâye şeridi, bildirim sayaçları, Sana özel, öneriler…) aynı kullanıcı için baştan
  // çalışır ve canlıda aynı istek 4–7 kez gidiyordu. Kimlik ya da görünen alanlar değişmedikçe önceki nesne yeniden kullanılır.
  const stableUser = useStableUser(session?.user ?? null);

  const value = useMemo(
    () => ({
      user: stableUser,
      session,
      loading,
      isPasswordRecovery,
      clearPasswordRecovery,
      signOut,
    }),
    [session, stableUser, loading, isPasswordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** İmza (`userSignature`, `lib/user-identity.ts`) değişmedikçe önceki `user` nesnesini döndürür. */
function useStableUser(next: User | null): User | null {
  const signature = userSignature(next);
  // Bilerek yalnız imzaya bağlı: aynı imzalı yeni nesne gelince eskisi kalır (efektler gereksiz yere yeniden çalışmasın).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => next, [signature]);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
