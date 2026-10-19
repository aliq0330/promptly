"use client";

import { useEffect, useState } from "react";
import { CircleSlash } from "lucide-react";
import { fetchStoryById } from "@/lib/supabase/stories";
import { isStoryActive } from "@/lib/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Story } from "@/types";
import { StoryCanvas } from "./story-canvas";
import { useStoryViewer } from "./story-viewer-provider";

/**
 * Sohbette "hikâyeye yanıt" başlığı (docs/history/198-*). Hikâye okuyanın kendi yetkisiyle yüklenir: süresi dolmuş, silinmiş ya da
 * artık göremediği bir hikâye için yalnız "artık mevcut değil" yazar — içeriği/medyası mesaj geçmişinden sızmaz. Görülebiliyorsa
 * küçük resme dokununca görüntüleyici açılır.
 */
export function StoryReplyCard({ storyId, isMe }: { storyId: string | null; isMe: boolean }) {
  const { t } = useTranslation();
  const { openStories } = useStoryViewer();
  const [story, setStory] = useState<Story | null | undefined>(storyId ? undefined : null);

  useEffect(() => {
    if (!storyId) return;
    let alive = true;
    fetchStoryById(storyId)
      .then((value) => alive && setStory(value))
      .catch(() => alive && setStory(null));
    return () => {
      alive = false;
    };
  }, [storyId]);

  const label = isMe ? t("stories.reply.youReplied") : t("stories.reply.repliedToYours");
  return (
    <div data-story-reply-card={story ? "ready" : story === null ? "gone" : "loading"} className={cn("flex items-center gap-2", isMe ? "self-end" : "self-start")}>
      {story ? (
        <button
          type="button"
          onClick={() =>
            openStories({
              groups: [{ key: story.id, authorId: story.authorId, storyIds: [story.id], mode: isStoryActive(story.expiresAt) ? "active" : "single" }],
            })
          }
          aria-label={t("stories.reply.openStory")}
          className="block w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-border-soft"
        >
          <StoryCanvas mode="thumb" story={story} />
        </button>
      ) : story === null ? (
        <span className="flex h-[100px] w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text-muted">
          <CircleSlash size={16} aria-hidden />
        </span>
      ) : (
        <span className="h-[100px] w-14 shrink-0 animate-pulse rounded-md bg-surface-soft" />
      )}
      <span className="text-caption text-text-muted">
        {label}
        {story === null && <span className="block">{t("stories.reply.storyGone")}</span>}
      </span>
    </div>
  );
}
