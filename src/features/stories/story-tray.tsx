"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RotateCcw, Users, WifiOff } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { fetchStoryTray } from "@/lib/supabase/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { StoryTrayItem } from "@/types";
import { useStoryViewer, type ViewerGroup } from "./story-viewer-provider";

/**
 * Hikâye şeridi (docs/history/198-*). Ana Sayfa'da: kendi halkan + takip ettiklerin + üyesi olduğun toplulukların hikâyeleri;
 * topluluk sayfasında (`communityId`): yalnız o topluluğun hikâyeleri. Sıra sunucuda (görülmemişler önce). Görülmemiş halka sıcak
 * vurgu rengiyle, görülmüş halka sakin; topluluk hikâyesi olan kişide küçük topluluk rozeti. Halkaya dokununca görüntüleyici sayfa
 * değiştirmeden açılır (kaydırma konumu korunur) ve sıradaki kişilere kesintisiz geçer.
 */
export function StoryTray({ communityId, canAdd = true, className }: { communityId?: string; canAdd?: boolean; className?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useOwnProfile();
  const { t } = useTranslation();
  const { openStories, seenIds, changeVersion } = useStoryViewer();
  const [items, setItems] = useState<StoryTrayItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [reloadSeq, setReloadSeq] = useState(0);

  const reload = useCallback(() => setReloadSeq((n) => n + 1), []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchStoryTray(communityId)
      .then((result) => {
        if (!alive) return;
        setItems(result);
        setFailed(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setItems((prev) => prev ?? []);
      });
    return () => {
      alive = false;
    };
  }, [user, communityId, changeVersion, reloadSeq]);

  // Ağ geri gelince ve sekmeye uzun bir aradan sonra dönülünce tazele (zamanlayıcı yok).
  useEffect(() => {
    let hiddenAt = 0;
    const onOnline = () => {
      setOffline(false);
      reload();
    };
    const onOffline = () => setOffline(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) reload();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  if (authLoading || !user) return null;

  const createHref = communityId ? `/stories/create?community=${communityId}` : "/stories/create";
  const own = items?.find((item) => item.author.id === user.id) ?? null;
  const others = (items ?? []).filter((item) => item.author.id !== user.id);
  // Görüntüleyici bu sırayla ilerler: önce benim halkam (varsa), sonra diğerleri.
  const ordered = own ? [own, ...others] : others;
  const groups: ViewerGroup[] = ordered.map((item) => ({ key: item.author.id, authorId: item.author.id, storyIds: item.storyIds, mode: "active" }));
  const isUnseen = (item: StoryTrayItem) => item.unseenCount > 0 && item.storyIds.some((id) => !seenIds.has(id));

  return (
    <nav aria-label={communityId ? t("stories.tray.communityLabel") : t("stories.tray.label")} data-story-tray className={cn("space-y-2", className)}>
      <div className="scrollbar-none -mx-3 flex touch-pan-x gap-4 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:px-0">
        {/* Kendi halkam: hikâyem varsa açar, artı rozeti yenisini başlatır (paylaşma hakkı yoksa yalnız açar). */}
        {(own || canAdd) && (
          <div className="relative flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
            {own ? (
              <button type="button" onClick={() => openStories({ groups, startGroupIndex: 0 })} aria-label={t("stories.tray.openOwn")} className="group rounded-full">
                <Ring state="own">
                  <Avatar src={profile?.avatarUrl ?? own.author.avatarUrl} alt={profile?.displayName ?? own.author.displayName} size={54} />
                </Ring>
              </button>
            ) : (
              <Link href={createHref} aria-label={t("stories.tray.addFirst")} className="group rounded-full">
                <Ring state="none">
                  <Avatar src={profile?.avatarUrl ?? null} alt={profile?.displayName ?? user.email ?? ""} size={54} />
                </Ring>
              </Link>
            )}
            {canAdd && (
              <Link
                href={createHref}
                aria-label={t("stories.tray.add")}
                title={t("stories.tray.add")}
                className="absolute -right-1.5 top-10 flex h-9 w-9 items-center justify-center rounded-full"
              >
                {/* Görünen rozet 24px; dokunma alanı 36px. */}
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                  <Plus size={14} strokeWidth={2.5} aria-hidden />
                </span>
              </Link>
            )}
            <span className="w-full truncate text-caption text-text-secondary">{t("stories.tray.yours")}</span>
          </div>
        )}

        {items === null
          ? Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5" aria-hidden>
                <Skeleton className="h-[66px] w-[66px] rounded-full" />
                <Skeleton className="h-3 w-12 rounded-full" />
              </div>
            ))
          : others.map((item) => {
              const unseen = isUnseen(item);
              const index = groups.findIndex((g) => g.key === item.author.id);
              return (
                <button
                  key={item.author.id}
                  type="button"
                  data-story-ring={unseen ? "unseen" : "seen"}
                  onClick={() => openStories({ groups, startGroupIndex: index })}
                  aria-label={t(unseen ? "stories.tray.openUnseen" : "stories.tray.open", { name: item.author.displayName })}
                  className="group relative flex w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-md text-center"
                >
                  <Ring state={unseen ? "unseen" : "seen"}>
                    <Avatar src={item.author.avatarUrl} alt={item.author.displayName} size={54} />
                  </Ring>
                  {item.communityStoryCount > 0 && !communityId && (
                    <span
                      className="absolute right-0.5 top-[46px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface-elevated text-text-secondary"
                      title={t("stories.tray.communityBadge")}
                    >
                      <Users size={12} aria-hidden />
                    </span>
                  )}
                  <span className={cn("w-full truncate text-caption", unseen ? "font-semibold text-text" : "text-text-secondary")}>{item.author.displayName}</span>
                </button>
              );
            })}
      </div>

      {offline ? (
        <p className="flex items-center gap-1.5 text-caption text-text-muted" role="status">
          <WifiOff size={13} aria-hidden /> {t("stories.tray.offline")}
        </p>
      ) : failed ? (
        <p className="flex items-center gap-2 text-caption text-text-muted" role="status">
          {t("stories.tray.failed")}
          <button type="button" onClick={reload} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 font-semibold text-primary hover:bg-primary-soft">
            <RotateCcw size={12} aria-hidden /> {t("common.retry")}
          </button>
        </p>
      ) : items !== null && others.length === 0 ? (
        <p className="text-caption text-text-muted">{communityId ? t("stories.tray.communityEmpty") : t("stories.tray.empty")}</p>
      ) : null}
    </nav>
  );
}

/** Halka: görülmemiş = sıcak vurgu (kalın), görülmüş = sakin kenar, kendi = marka rengi, hikâyesi yok = kesikli. Durum renkle birlikte kalınlık/desenle de ayrışır. */
export function Ring({ state, size = "md", children }: { state: "unseen" | "seen" | "own" | "none"; size?: "md" | "lg"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex rounded-full p-[3px] transition-transform duration-200 ease-soft group-active:scale-95",
        size === "lg" && "p-1",
        state === "unseen" && "border-[3px] border-secondary",
        state === "seen" && "border-2 border-border",
        state === "own" && "border-[2.5px] border-primary/70",
        state === "none" && "border-[1.5px] border-dashed border-border-strong",
      )}
    >
      {children}
    </span>
  );
}
