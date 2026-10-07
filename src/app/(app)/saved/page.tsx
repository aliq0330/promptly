"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchDefaultCollectionId } from "@/lib/supabase/collections";
import { collectionHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Bottom-nav "Kaydedilenler" shortcut — redirects straight to the viewer's
 * own default ("Genel") collection, the exact same real collection Profile
 * > Kaydedilenler shows first. This used to render its own separate,
 * `prompt_saves`-backed flat list; now there is a single source of truth
 * for "what's generally saved" (membership in the default collection), so
 * this route reuses the one real implementation (`CollectionDetailView`)
 * instead of maintaining a second list/removal code path that could drift
 * out of sync with it (CLAUDE.md Bölüm 9.22).
 */
export default function SavedPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    fetchDefaultCollectionId(user.id).then((id) => {
      if (cancelled) return;
      if (id) {
        router.replace(collectionHref({ id }));
      } else {
        setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-text-muted">
        {t("saved.loadFailed")}
      </div>
    );
  }

  return <p className="py-16 text-center text-sm text-text-muted">{t("common.loading")}</p>;
}
