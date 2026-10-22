"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/features/auth/auth-provider";
import { authHref } from "@/lib/auth-redirect";
import { useTranslation } from "@/lib/i18n/language-provider";
import { openSpaceLink } from "@/lib/supabase/spaces";
import { parseSpaceLinkToken, spaceHref } from "@/lib/spaces";

/**
 * `/spaces/link#<token>` (docs/history/213-*): "bağlantıya sahip olanlar" paylaşımının açılış sayfası. Token URL parçasındadır
 * (sunucu günlüklerine gitmez). Oturum ister: sunucu, bağlantıyı açan kullanıcıya iptal edilene kadar geçerli bir okuma hakkı
 * kaydeder (Storage politikası token göremez). Geçersiz / iptal edilmiş / görünürlüğü değişmiş bağlantı tek tip hata verir.
 */
const PENDING_KEY = "promptly-space-link";

export function SpaceLinkPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [state, setState] = useState<"checking" | "invalid" | "guest">("checking");

  useEffect(() => {
    if (loading) return;
    // Girişe giderken token sorguya (sunucu günlüklerine) konmaz: oturum deposunda bekler, dönüşte buradan okunur.
    let token = parseSpaceLinkToken(window.location.hash);
    try {
      if (token) sessionStorage.setItem(PENDING_KEY, token);
      else token = parseSpaceLinkToken(sessionStorage.getItem(PENDING_KEY) ?? "");
    } catch {
      // Depo kapalıysa yalnız adresteki token kullanılır.
    }
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the token lives in the URL fragment, read once after mount
      setState("invalid");
      return;
    }
    if (!user) {
      setState("guest");
      return;
    }
    let alive = true;
    const clear = () => {
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        // yok say
      }
    };
    openSpaceLink(token)
      .then((id) => {
        clear();
        if (alive) router.replace(spaceHref(id));
      })
      .catch(() => {
        clear();
        if (alive) setState("invalid");
      });
    return () => {
      alive = false;
    };
  }, [loading, user, router]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16" data-testid="space-link-page" data-state={state}>
      {state === "checking" ? (
        <p className="flex items-center justify-center gap-2 text-small text-text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          {t("spaces.link.checking")}
        </p>
      ) : state === "guest" ? (
        <div className="space-y-4 text-center">
          <EmptyState icon={Link2} title={t("spaces.link.signInTitle")} description={t("spaces.link.signInBody")} />
          <Link href={authHref("/login", "/spaces/link")} className={buttonClassName()}>
            {t("header.login")}
          </Link>
        </div>
      ) : (
        <EmptyState icon={Link2} title={t("spaces.link.invalidTitle")} description={t("spaces.link.invalidBody")} action={{ label: t("spaces.page.backToSpaces"), href: "/spaces" }} />
      )}
    </div>
  );
}
