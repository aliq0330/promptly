"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchBlockedProfiles } from "@/lib/supabase/profiles";
import { unblockUser } from "@/lib/supabase/blocks";
import { profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

export default function BlockedUsersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<UserProfile[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    fetchBlockedProfiles(user.id).then((profiles) => {
      if (!cancelled) setBlocked(profiles);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleUnblock(target: UserProfile) {
    if (!user || busyId) return;
    setBusyId(target.id);
    setError("");
    try {
      await unblockUser(user.id, target.id);
      setBlocked((current) => (current ?? []).filter((profile) => profile.id !== target.id));
    } catch (err) {
      console.error("unblockUser", err);
      setError(t("settings.unblockError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl animate-fade-in space-y-5 px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-10">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft size={14} />
        {t("settings.backToSettings")}
      </Link>
      <h1 className="text-h1 text-text">{t("settings.blockedUsers")}</h1>
      {error && <p className="text-sm text-danger">{error}</p>}
      {blocked === null ? (
        <p className="py-10 text-center text-sm text-text-muted">{t("settings.loadingEllipsis")}</p>
      ) : blocked.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-soft py-10 text-center text-sm text-text-muted">{t("settings.blockedEmpty")}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card">
          {blocked.map((profile) => (
            <div key={profile.id} className="flex items-center gap-3 border-b border-border-soft px-4 py-3 last:border-0">
              <Link href={profileHref(profile)} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={profile.avatarUrl} alt={profile.displayName} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{profile.displayName}</p>
                  <p className="truncate text-xs text-text-muted">@{profile.username}</p>
                </div>
              </Link>
              <Button type="button" size="sm" variant="outline" disabled={busyId === profile.id} onClick={() => handleUnblock(profile)} className="shrink-0">
                {t("settings.unblock")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
