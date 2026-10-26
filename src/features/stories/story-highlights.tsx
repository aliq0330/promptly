"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import {
  deleteHighlight,
  fetchActiveStoryIds,
  fetchHighlights,
  fetchSeenStoryIds,
  fetchStoriesByIds,
  fetchStoryArchive,
  saveHighlight,
} from "@/lib/supabase/stories";
import { STORY_LIMITS } from "@/lib/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Story, StoryHighlight } from "@/types";
import { StoryCanvas } from "./story-canvas";
import { Ring } from "./story-tray";
import { useStoryViewer } from "./story-viewer-provider";

/** Hikâyenin yuvarlak küçük resmi (öne çıkan kapağı): 9:16 tuvalin ortası. */
export function StoryCircleThumb({ story, size = 54 }: { story: Story | null; size?: number }) {
  return (
    <span className="relative block overflow-hidden rounded-full bg-surface-soft" style={{ width: size, height: size }}>
      {story && (
        <span className="absolute left-0 top-1/2 block w-full -translate-y-1/2">
          <StoryCanvas mode="thumb" story={story} />
        </span>
      )}
    </span>
  );
}

/**
 * Bir profilin etkin hikâyeleri (avatar halkası için): yalnız çağıranın görebildikleri; görülmemiş var mı. Hikâye yoksa `null`.
 */
export function useProfileStories(userId: string): { ids: string[]; unseen: boolean; open: () => void } | null {
  const { user } = useAuth();
  const { openStories, seenIds, changeVersion } = useStoryViewer();
  const [state, setState] = useState<{ ids: string[]; seen: Set<string> } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchActiveStoryIds(userId)
      .then(async (ids) => {
        const seen = user && ids.length > 0 && user.id !== userId ? await fetchSeenStoryIds(user.id, ids) : new Set<string>();
        if (alive) setState({ ids, seen });
      })
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [userId, user, changeVersion]);

  const open = useCallback(() => {
    if (state && state.ids.length > 0) openStories({ groups: [{ key: userId, authorId: userId, storyIds: state.ids, mode: "active" }] });
  }, [state, openStories, userId]);

  if (!state || state.ids.length === 0) return null;
  const unseen = user?.id !== userId && state.ids.some((id) => !state.seen.has(id) && !seenIds.has(id));
  return { ids: state.ids, unseen, open };
}

/**
 * Profildeki öne çıkanlar (docs/history/198-*): kalıcı hikâye koleksiyonları. Her öğe yalnız ASIL hedef kitlesine görünür — öne
 * çıkana eklemek hikâyeyi kimseye açmaz; ziyaretçinin hiçbir öğesini göremediği öne çıkan hiç çizilmez. Sahibine "Yeni" halkası ve
 * düzenleme düğmesi. Profil şeridinin (`ProfileRail`, docs/history/243-*) ilk grubudur: kendi kaydırma satırı yok, şeridin içine oturur.
 */
export function StoryHighlightsRow({ ownerId, isOwnProfile }: { ownerId: string; isOwnProfile: boolean }) {
  const { t } = useTranslation();
  const { openStories, changeVersion, notifyChanged } = useStoryViewer();
  const [highlights, setHighlights] = useState<StoryHighlight[] | null>(null);
  const [covers, setCovers] = useState<Map<string, Story>>(new Map());
  const [editing, setEditing] = useState<StoryHighlight | "new" | null>(null);

  useEffect(() => {
    let alive = true;
    fetchHighlights(ownerId)
      .then(async (list) => {
        if (!alive) return;
        setHighlights(list);
        const coverIds = list.map((h) => (h.coverStoryId && h.storyIds.includes(h.coverStoryId) ? h.coverStoryId : h.storyIds[0]));
        const stories = await fetchStoriesByIds(coverIds);
        if (alive) setCovers(new Map(stories.map((s) => [s.id, s])));
      })
      .catch(() => alive && setHighlights([]));
    return () => {
      alive = false;
    };
  }, [ownerId, changeVersion]);

  if (highlights === null || (!isOwnProfile && highlights.length === 0)) return null;

  const groups = highlights.map((h) => ({ key: h.id, authorId: ownerId, storyIds: h.storyIds, mode: "highlight" as const, label: h.title }));

  return (
    <div role="group" aria-label={t("stories.highlight.rowLabel")} data-story-highlights data-rail-group="" className="flex shrink-0 gap-4 first:border-l-0 first:pl-0">
      {highlights.map((highlight, index) => {
        const coverId = highlight.coverStoryId && highlight.storyIds.includes(highlight.coverStoryId) ? highlight.coverStoryId : highlight.storyIds[0];
        return (
          <div key={highlight.id} className="relative flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
            <button
              type="button"
              onClick={() => openStories({ groups, startGroupIndex: index })}
              aria-label={t("stories.highlight.open", { title: highlight.title })}
              className="group rounded-full"
            >
              <Ring state="seen">
                <StoryCircleThumb story={covers.get(coverId) ?? null} />
              </Ring>
            </button>
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => setEditing(highlight)}
                aria-label={t("stories.highlight.edit", { title: highlight.title })}
                title={t("stories.highlight.edit", { title: highlight.title })}
                className="absolute -right-1.5 top-10 flex h-9 w-9 items-center justify-center rounded-full"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface-elevated text-text-secondary">
                  <Pencil size={11} aria-hidden />
                </span>
              </button>
            )}
            <span className="w-full truncate text-caption text-text-secondary">{highlight.title}</span>
          </div>
        );
      })}
      {isOwnProfile && (
        <button type="button" onClick={() => setEditing("new")} className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-md text-center">
          <span className="flex h-[66px] w-[66px] items-center justify-center rounded-full border-[1.5px] border-dashed border-border-strong text-text-muted transition-colors group-hover:border-primary group-hover:text-primary">
            <Plus size={22} strokeWidth={2} aria-hidden />
          </span>
          <span className="w-full truncate text-caption text-text-secondary">{t("stories.highlight.new")}</span>
        </button>
      )}
      {editing && (
        <HighlightEditor
          highlight={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notifyChanged();
          }}
        />
      )}
    </div>
  );
}

/** Öne çıkan oluştur/düzenle: başlık + arşivden hikâye seçimi (seçim sırası = gösterim sırası) + kapak. */
export function HighlightEditor({
  highlight,
  initialStoryIds = [],
  onClose,
  onSaved,
}: {
  highlight: StoryHighlight | null;
  initialStoryIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [title, setTitle] = useState(highlight?.title ?? "");
  const [selected, setSelected] = useState<string[]>(highlight?.storyIds ?? initialStoryIds);
  const [cover, setCover] = useState<string | null>(highlight?.coverStoryId ?? null);
  const [archive, setArchive] = useState<Story[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(
    (before: string | null) => {
      if (!user) return;
      setLoading(true);
      fetchStoryArchive(user.id, before)
        .then((page) => {
          setArchive((prev) => [...prev, ...page.stories.filter((s) => s.moderationStatus === "visible")]);
          setHasMore(page.hasMore);
        })
        .catch(() => setError(t("stories.error.load")))
        .finally(() => setLoading(false));
    },
    [user, t],
  );

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchStoryArchive(user.id)
      .then((page) => {
        if (!alive) return;
        setArchive(page.stories.filter((s) => s.moderationStatus === "visible"));
        setHasMore(page.hasMore);
      })
      .catch(() => alive && setError(t("stories.error.load")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user, t]);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveHighlight({ id: highlight?.id ?? null, title, storyIds: selected, coverStoryId: cover && selected.includes(cover) ? cover : null });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
      setBusy(false);
    }
  }

  async function remove() {
    if (!highlight || !window.confirm(t("stories.highlight.deleteConfirm", { title: highlight.title }))) return;
    setBusy(true);
    try {
      await deleteHighlight(highlight.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="highlight-editor-title">
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
          <h2 id="highlight-editor-title" className="text-h3 font-semibold text-text">
            {highlight ? t("stories.highlight.editTitle") : t("stories.highlight.newTitle")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block space-y-1">
            <span className="text-label font-semibold text-text">{t("stories.highlight.titleLabel")}</span>
            <input
              value={title}
              maxLength={STORY_LIMITS.highlightTitleMax}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <p className="text-caption text-text-muted">{t("stories.highlight.privacyNote")}</p>
          <p className="text-label font-semibold text-text">{t("stories.highlight.pick", { count: selected.length })}</p>
          {archive.length === 0 && !loading ? (
            <p className="py-4 text-center text-small text-text-muted">{t("stories.archive.empty")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {archive.map((story) => {
                const order = selected.indexOf(story.id);
                const isCover = (cover ?? selected[0]) === story.id && order >= 0;
                return (
                  <li key={story.id} className="space-y-1">
                    <button
                      type="button"
                      aria-pressed={order >= 0}
                      aria-label={t("stories.archive.itemLabel", { time: formatRelativeTime(story.createdAt, language) })}
                      onClick={() => toggle(story.id)}
                      className={cn("relative block w-full overflow-hidden rounded-md ring-1 ring-border-soft", order >= 0 && "ring-2 ring-primary")}
                    >
                      <StoryCanvas mode="thumb" story={story} />
                      {order >= 0 && (
                        <span className="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold text-primary-foreground">{order + 1}</span>
                      )}
                    </button>
                    {order >= 0 && (
                      <button type="button" onClick={() => setCover(story.id)} aria-pressed={isCover} className={cn("flex min-h-9 w-full items-center justify-center gap-1 rounded-full text-caption", isCover ? "font-semibold text-primary" : "text-text-muted hover:text-text")}>
                        {isCover && <Check size={12} aria-hidden />} {isCover ? t("stories.highlight.cover") : t("stories.highlight.makeCover")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {loading && (
            <p className="flex items-center justify-center gap-2 py-3 text-small text-text-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden /> {t("common.loading")}
            </p>
          )}
          {hasMore && !loading && (
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => loadMore(archive[archive.length - 1]?.createdAt ?? null)}>
              {t("stories.archive.more")}
            </Button>
          )}
          {error && <p role="alert" className="text-small text-danger">{error}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-3">
          {highlight ? (
            <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => void remove()} disabled={busy}>
              <Trash2 size={14} aria-hidden /> {t("stories.highlight.delete")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={() => void save()} disabled={busy || !title.trim() || selected.length === 0}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />} {t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
