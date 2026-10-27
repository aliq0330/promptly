"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Highlighter, Loader2, Plus } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { LoadMoreButton } from "@/features/feed/load-more";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-header";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchStoryArchive, fetchStoryArchiveEnabled, setStoryArchiveEnabled } from "@/lib/supabase/stories";
import { hoursLeft, isStoryActive } from "@/lib/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Story } from "@/types";
import { StoryCanvas } from "./story-canvas";
import { HighlightEditor } from "./story-highlights";
import { useStoryViewer } from "./story-viewer-provider";

/**
 * Hikâye arşivi (docs/history/198-*) — YALNIZ sahibine (RLS: başkası süresi dolmuş hikâyeyi göremez). Etkin ve süresi dolmuş
 * hikâyeler gün gün; dokununca görüntüleyicide açılır (oradan yeniden paylaş / öne çıkar / sil). Saklama tercihi buradadır: açıkken
 * süresi dolanlar 1 yıl arşivde kalır, kapalıyken (öne çıkanda değilse) süre dolduktan kısa süre sonra silinir.
 */
export function StoryArchiveView() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const { openStories, changeVersion, notifyChanged } = useStoryViewer();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveEnabled, setArchiveEnabled] = useState<boolean | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    fetchStoryArchive(user.id)
      .then((page) => {
        setStories(page.stories);
        setHasMore(page.hasMore);
        setError(null);
      })
      .catch((err: unknown) => {
        setStories((prev) => prev ?? []);
        setError(err instanceof Error ? err.message : t("stories.error.load"));
      });
  }, [user, t]);

  useEffect(() => {
    load();
  }, [load, changeVersion]);

  useEffect(() => {
    if (!user) return;
    fetchStoryArchiveEnabled(user.id).then(setArchiveEnabled);
  }, [user]);

  const days = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "long", year: "numeric" });
    const groups: { label: string; stories: Story[] }[] = [];
    for (const story of stories ?? []) {
      const label = formatter.format(new Date(story.createdAt));
      const last = groups[groups.length - 1];
      if (last?.label === label) last.stories.push(story);
      else groups.push({ label, stories: [story] });
    }
    return groups;
  }, [stories, language]);

  async function loadMore() {
    if (!user || !stories || stories.length === 0) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchStoryArchive(user.id, stories[stories.length - 1].createdAt);
      setStories((prev) => [...(prev ?? []), ...page.stories]);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.load"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleArchive(next: boolean) {
    if (!user) return;
    const previous = archiveEnabled;
    setArchiveEnabled(next);
    try {
      await setStoryArchiveEnabled(user.id, next);
    } catch {
      setArchiveEnabled(previous);
      setError(t("stories.error.generic"));
    }
  }

  const open = (story: Story) => {
    if (!user || !stories) return;
    openStories({ groups: [{ key: "archive", authorId: user.id, storyIds: stories.map((s) => s.id), mode: "archive" }], startStoryId: story.id });
  };

  return (
    <PageContainer className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">{t("stories.archive.title")}</h1>
          <p className="mt-1 text-small text-text-muted">{t("stories.archive.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stories/create" className={buttonClassName({ variant: "outline", size: "sm" })}>
            <Plus size={14} aria-hidden /> {t("stories.tray.add")}
          </Link>
          <Button
            type="button"
            size="sm"
            variant={selecting ? "secondary" : "outline"}
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((value) => !value);
              setSelected([]);
            }}
          >
            <Highlighter size={14} aria-hidden /> {selecting ? t("common.cancelAction") : t("stories.archive.selectForHighlight")}
          </Button>
        </div>
      </header>

      <label className="flex items-start gap-3 rounded-lg border border-border-soft bg-surface p-3">
        <input
          type="checkbox"
          checked={archiveEnabled ?? true}
          disabled={archiveEnabled === null}
          onChange={(event) => void toggleArchive(event.target.checked)}
          className="mt-0.5 h-5 w-5 accent-[var(--color-primary)]"
        />
        <span>
          <span className="block text-small font-semibold text-text">{t("stories.archive.keep")}</span>
          <span className="block text-caption text-text-muted">{archiveEnabled === false ? t("stories.archive.keepOffHint") : t("stories.archive.keepOnHint")}</span>
        </span>
      </label>

      {error && <p role="alert" className="text-small text-danger">{error}</p>}

      {stories === null ? (
        <p className="flex items-center gap-2 text-small text-text-muted">
          <Loader2 size={15} className="animate-spin" aria-hidden /> {t("common.loading")}
        </p>
      ) : stories.length === 0 ? (
        <EmptyState icon={Archive} title={t("stories.archive.empty")} description={t("stories.archive.emptyHint")} />
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.label} aria-label={day.label} className="space-y-2">
              <h2 className="text-label font-semibold text-text-secondary">{day.label}</h2>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {day.stories.map((story) => {
                  const live = isStoryActive(story.expiresAt);
                  const order = selected.indexOf(story.id);
                  return (
                    <li key={story.id}>
                      <button
                        type="button"
                        data-archive-story={story.id}
                        aria-pressed={selecting ? order >= 0 : undefined}
                        onClick={() => {
                          if (!selecting) open(story);
                          else if (story.moderationStatus === "visible") setSelected((prev) => (order >= 0 ? prev.filter((id) => id !== story.id) : [...prev, story.id]));
                        }}
                        className={cn("relative block w-full overflow-hidden rounded-md ring-1 ring-border-soft", order >= 0 && "ring-2 ring-primary")}
                      >
                        <StoryCanvas mode="thumb" story={story} />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-story-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[11px] font-medium text-story-white">
                          {story.moderationStatus === "removed"
                            ? t("stories.archive.removed")
                            : live
                              ? t("stories.archive.active", { hours: hoursLeft(story.expiresAt) })
                              : t("stories.archive.views", { count: story.viewerCount })}
                        </span>
                        {order >= 0 && (
                          <span className="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold text-primary-foreground">{order + 1}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {hasMore && (
            <LoadMoreButton variant="ghost" className="w-full" wrapperClassName="" label={t("stories.archive.more")} loading={loadingMore} error={Boolean(error)} onLoadMore={() => void loadMore()} />
          )}
        </div>
      )}

      {selecting && selected.length > 0 && (
        <div className="sticky bottom-20 z-20 flex justify-center md:bottom-6">
          <Button type="button" onClick={() => setEditorOpen(true)} className="shadow-pop">
            <Highlighter size={15} aria-hidden /> {t("stories.archive.createHighlight", { count: selected.length })}
          </Button>
        </div>
      )}
      {editorOpen && (
        <HighlightEditor
          highlight={null}
          initialStoryIds={selected}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            setSelecting(false);
            setSelected([]);
            notifyChanged();
          }}
        />
      )}
    </PageContainer>
  );
}
