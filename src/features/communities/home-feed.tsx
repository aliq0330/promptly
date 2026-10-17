"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { ApplicationCard } from "./application-card";
import { FEED_ITEM_CLASS } from "./community-layout";
import { createSeenTracker, type SeenTracker } from "./seen-tracker";
import { VisibilityLabel } from "./visibility-label";
import { communityHref } from "@/lib/communities";
import type { DiscoverFeedSource } from "@/lib/community-home";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { CommunityCard } from "@/lib/supabase/chat-groups";
import type { CommunityPost } from "@/lib/supabase/communities";
import type { EngageMode } from "./post-engagement";

const SOURCE_LABEL: Record<DiscoverFeedSource, TranslationKey> = {
  member: "communities.home.source.member",
  followed: "communities.home.source.followed",
  public: "communities.home.source.public",
};

/** Akış tek bir izleyici paylaşır (sayfa ömrü boyunca); ayrılırken bekleyen "görüldü"ler gönderilir. */
export function useSeenTracker(enabled: boolean): SeenTracker | null {
  const [tracker] = useState<SeenTracker | null>(() => (enabled ? createSeenTracker() : null));
  useEffect(() => {
    const onHide = () => tracker?.flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      tracker?.dispose();
    };
  }, [tracker]);
  return tracker;
}

/**
 * Topluluklar ana sayfasının birleşik akış öğesi: üstte hangi topluluktan olduğu (+ Keşfet'te neden gösterildiği), altta MEVCUT kart ailesi —
 * yerel gönderi normal içerik kartı, başvuru/eski gönderi `ApplicationCard` (kendi beğeni/yorum/kaydet/istatistik/paylaş). Topluluk yönetimi
 * (sabitle/kaldır/bildir) bu akışta yoktur; topluluğun kendi akışındadır. `mode`: üyeysem "open", değilsem "join" (okur, yazmak için katılır).
 */
export function HomeFeedItem({
  post,
  community,
  mode,
  source,
  tracker,
  onToast,
}: {
  post: CommunityPost;
  community: CommunityCard | undefined;
  mode: EngageMode;
  source?: DiscoverFeedSource;
  tracker: SeenTracker | null;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const itemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const element = itemRef.current;
    if (!element || !tracker) return;
    return tracker.watch(element, post.id);
  }, [tracker, post.id]);

  const content = post.content;
  return (
    <li ref={itemRef} data-home-post={post.id} data-post-kind={post.kind} data-post-source={source ?? "member"} data-post-community={post.communityId} className={FEED_ITEM_CLASS}>
      <div className="flex items-center gap-2 px-1 text-caption text-text-muted">
        {community ? (
          <>
            <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={20} />
            <Link href={communityHref(post.communityId)} className="min-w-0 truncate font-medium text-text-secondary hover:underline">
              {community.name}
            </Link>
            <VisibilityLabel visibility={community.visibility} size={11} />
          </>
        ) : (
          <>
            <Users size={14} aria-hidden />
            <Link href={communityHref(post.communityId)} className="font-medium text-text-secondary hover:underline">
              {t("communities.home.openCommunity")}
            </Link>
          </>
        )}
        {source && source !== "member" && <span className="ml-auto shrink-0">{t(SOURCE_LABEL[source])}</span>}
      </div>
      {post.kind === "native" && content ? (
        <>
          {content.type === "prompt" && <PromptCard prompt={content.data} />}
          {content.type === "request" && <RequestCard request={content.data} />}
          {content.type === "workflow" && <WorkflowCard workflow={content.data} />}
          {content.type === "preset" && <PresetCard preset={content.data} />}
        </>
      ) : (
        <ApplicationCard post={post} mode={mode} onToast={onToast} />
      )}
    </li>
  );
}
