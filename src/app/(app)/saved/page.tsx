"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchDefaultCollectionId } from "@/lib/supabase/collections";
import { collectionHref } from "@/lib/utils";

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
  const { user, loading } = useAuth();
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

  if (!loading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Giriş yapmalısın</h1>
        <p className="mb-4 text-sm text-text-muted">Kaydettiklerini görmek için önce giriş yapmalısın.</p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          Giriş Yap
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-text-muted">
        Kaydedilenler şu anda yüklenemedi — lütfen tekrar dene.
      </div>
    );
  }

  return <p className="py-16 text-center text-sm text-text-muted">Yükleniyor…</p>;
}
