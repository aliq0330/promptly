"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useTranslation } from "@/lib/i18n/language-provider";
import { authHref } from "@/lib/auth-redirect";

/**
 * Route-level guard for member-only pages (/messages, /notifications,
 * /saved, /following, /followers, /settings, /profile/edit). Hiding the nav
 * icon is not enough: a guest who types the URL is sent to /login (with
 * `?next=` so they land back here afterwards). While the session is
 * resolving it renders neither the page nor a redirect.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    router.replace(authHref("/login", pathname + window.location.search));
  }, [status, router, pathname]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <div role="status" className="mx-auto max-w-md px-4 py-16 text-center text-small text-text-muted">
      {status === "unauthenticated" ? t("auth.redirectingToLogin") : <span className="sr-only">{t("common.loading")}</span>}
    </div>
  );
}
