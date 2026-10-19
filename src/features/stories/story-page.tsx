"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleSlash, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchActiveStoryIds, fetchStoryById } from "@/lib/supabase/stories";
import { isStoryActive } from "@/lib/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import { isUuid } from "@/lib/utils";
import { useStoryViewer } from "./story-viewer-provider";

/**
 * `/stories?id=` (bildirimler ve paylaşılan bağlantılar). Bağlantı tek başına erişim VERMEZ: hikâye RLS'le okunur; görülemiyorsa
 * (süresi doldu, silindi, hedef kitlede değilsin, engel) yalnız "artık mevcut değil" denir — varlığı/sahibi sızmaz. Görülebiliyorsa
 * görüntüleyici açılır (etkinse yazarın diğer etkin hikâyeleriyle birlikte); kapanınca geri dönülür.
 */
export function StoryPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const { openStories } = useStoryViewer();
  const [state, setState] = useState<"loading" | "open" | "missing">(id && isUuid(id) ? "loading" : "missing");
  const opened = useRef(false);

  useEffect(() => {
    if (!id || !isUuid(id) || opened.current) return;
    opened.current = true;
    const leave = () => {
      if (window.history.length > 1) router.back();
      else router.replace("/");
    };
    fetchStoryById(id)
      .then(async (story) => {
        if (!story) {
          setState("missing");
          return;
        }
        const active = isStoryActive(story.expiresAt) && story.moderationStatus === "visible";
        const ids = active ? await fetchActiveStoryIds(story.authorId).catch(() => [story.id]) : [story.id];
        setState("open");
        openStories({
          groups: [{ key: story.authorId, authorId: story.authorId, storyIds: ids.includes(story.id) ? ids : [story.id], mode: active ? "active" : "single" }],
          startStoryId: story.id,
          onClose: leave,
        });
      })
      .catch(() => setState("missing"));
  }, [id, openStories, router]);

  if (state === "missing") {
    return (
      <div className="mx-auto max-w-md px-3 py-16">
        <EmptyState
          icon={CircleSlash}
          title={t("stories.page.missingTitle")}
          description={t("stories.page.missingBody")}
          action={{ label: t("stories.page.home"), href: "/" }}
        />
      </div>
    );
  }
  return (
    <p className="flex items-center justify-center gap-2 py-24 text-small text-text-muted" role="status">
      <Loader2 size={16} className="animate-spin" aria-hidden /> {t("stories.page.opening")}
    </p>
  );
}
