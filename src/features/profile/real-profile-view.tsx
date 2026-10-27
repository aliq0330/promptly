"use client";

import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProfileView } from "./profile-view";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchProfileByUsername } from "@/lib/supabase/profiles";
import type { UserProfile } from "@/types";

/**
 * Client-rendered counterpart to `/profile/[username]` for a real, signed-up
 * Supabase account — its username was auto-generated at signup (CLAUDE.md
 * Bölüm 18) and was never one of the fixed usernames `generateStaticParams`
 * pre-rendered a page for at build time (mock-only, GitHub Pages static
 * export). Looked up by a `?username=` query param instead of a path
 * segment, same idea as `/prompts/local` — see `profileHref()` in
 * lib/utils.ts for which profiles route here vs. the static pages.
 */
export function RealProfileView() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const username = searchParams.get("username");
  const { user } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not-found">("loading");

  useEffect(() => {
    let cancelled = false;

    if (!username) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no id to look up, nothing async to wait on
      setStatus("not-found");
      return;
    }

    setStatus("loading");
    fetchProfileByUsername(username).then((result) => {
      if (cancelled) return;
      if (!result) {
        setStatus("not-found");
        return;
      }
      // Every list (prompts, requests, workflows, presets) is read a page at a time by the profile itself.
      setProfile(result);
      setStatus("found");
    });

    return () => {
      cancelled = true;
    };
  }, [username]);

  if (status === "loading") {
    return <DetailSkeleton />;
  }

  if (status === "not-found" || !profile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("profile.profileNotFoundTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">
          {t("profile.profileNotFoundBody")}
        </p>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("common.backToHome")}
        </Link>
      </div>
    );
  }

  const isOwnProfile = user?.id === profile.id;

  return (
    <ProfileView
      user={profile}
      isOwnProfile={isOwnProfile}
    />
  );
}
