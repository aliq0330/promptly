"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Ban, Eye, Loader2, Plus, Share, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { LoadMore } from "@/features/feed/load-more";
import { blockUser } from "@/lib/supabase/blocks";
import { ReportModal } from "@/features/moderation/report-modal";
import {
  addStoryToHighlight,
  fetchHighlights,
  fetchPollResults,
  fetchPollVotersPage,
  fetchQuestionAnswersPage,
  fetchStoryViewersPage,
  reshareStory,
  saveHighlight,
} from "@/lib/supabase/stories";
import { STORY_LIMITS, pollPercentages } from "@/lib/stories";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import type { Story, StoryAudience, StoryAuthor, StoryHighlight, StoryPollResults } from "@/types";
import { StoryAudiencePicker } from "./story-audience-picker";

/**
 * Görüntüleyicinin içinde açılan alt sayfalar (docs/history/198-*). Görüntüleyici katmanının İÇİNDE çizilirler (ayrı portal değil),
 * böylece odak ve "aşağı çekip kapat" görüntüleyiciyle çakışmaz; açıkken hikâye duraklar.
 */
export function ViewerSheet({ title, onClose, children, labelId }: { title: string; onClose: () => void; children: ReactNode; labelId: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center" data-story-interactive>
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 cursor-default bg-story-scrim" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="relative z-10 flex max-h-[78%] w-full max-w-md animate-sheet-up flex-col rounded-t-xl bg-surface text-text shadow-pop focus:outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
          <h2 id={labelId} className="text-h3 font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

function PersonRow({ user, trailing, onOpen }: { user: StoryAuthor; trailing?: ReactNode; onOpen: () => void }) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-1.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar src={user.avatarUrl} alt={user.displayName} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-small font-semibold text-text">{user.displayName}</span>
          <span className="block truncate text-caption text-text-muted">@{user.username}</span>
        </span>
      </button>
      {trailing}
    </li>
  );
}

export type ActivityTab = "viewers" | "poll" | "answers";

/**
 * Sahibine: görüntüleyenler (+ tepkileri), anket sonuçları + kim ne verdi, soru yanıtları (+ "hikâyede paylaş"). Açıkken
 * görüntüleyen listesi 20 sn'de bir tazelenir — ayrı bir Realtime kanalı açılmaz (ölçülü abonelik).
 */
export function OwnerActivitySheet({ story, initialTab, onClose, onLeave }: { story: Story; initialTab: ActivityTab; onClose: () => void; onLeave: () => void }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<ActivityTab>(initialTab);
  const [pollResults, setPollResults] = useState<StoryPollResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());

  // Her liste 50'şerli sayfa, devamı kaydırınca (docs/history/258-*: eskiden 500 / 300'de kesiliyordu). Görüntüleyenler açıkken 20 sn'de bir
  // yalnız İLK sayfa tazelenir (kaydırmış okuyucunun listesine dokunulmaz).
  const viewerPages = usePagedList(`viewers|${story.id}`, tab === "viewers", (offset) => fetchStoryViewersPage(story.id, offset), (row) => row.user.id);
  const voterPages = usePagedList(`voters|${story.id}`, tab === "poll", (offset) => fetchPollVotersPage(story.id, offset), (row) => row.user.id);
  const answerPages = usePagedList(`answers|${story.id}`, tab === "answers", (offset) => fetchQuestionAnswersPage(story.id, offset));
  const viewers = viewerPages.loading ? null : viewerPages.items;
  const refreshViewers = viewerPages.refresh;

  useEffect(() => {
    if (tab !== "viewers") return;
    const timer = window.setInterval(() => void refreshViewers(), 20_000);
    return () => window.clearInterval(timer);
  }, [tab, refreshViewers]);

  useEffect(() => {
    if (tab === "poll" && !pollResults) {
      fetchPollResults(story.id)
        .then(setPollResults)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : t("stories.error.generic")));
    }
  }, [tab, pollResults, story.id, t]);

  const openProfile = (person: StoryAuthor) => {
    onLeave();
    router.push(profileHref(person));
  };

  async function block(person: StoryAuthor) {
    if (!user || !window.confirm(t("stories.viewers.blockConfirm", { name: person.displayName }))) return;
    try {
      await blockUser(user.id, person.id);
      setBlocked((prev) => new Set(prev).add(person.id));
    } catch {
      setError(t("stories.error.generic"));
    }
  }

  const tabs: { key: ActivityTab; label: string }[] = [{ key: "viewers", label: t("stories.viewers.tab", { count: story.viewerCount }) }];
  if (story.sticker?.kind === "poll") tabs.push({ key: "poll", label: t("stories.poll.tab") });
  if (story.sticker?.kind === "question") tabs.push({ key: "answers", label: t("stories.question.tab") });

  return (
    <ViewerSheet title={t("stories.activity.title")} onClose={onClose} labelId="story-activity-title">
      {tabs.length > 1 && (
        <div role="tablist" className="mb-3 flex gap-1.5">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "min-h-9 rounded-full px-3 text-label font-medium transition-colors",
                tab === item.key ? "bg-primary text-primary-foreground" : "bg-surface-soft text-text-secondary hover:text-text",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mb-2 text-small text-danger">
          {error}
        </p>
      )}

      {tab === "viewers" &&
        (viewers === null ? (
          <SheetLoading />
        ) : viewers.length === 0 ? (
          <p className="py-6 text-center text-small text-text-muted">{t("stories.viewers.none")}</p>
        ) : (
          <>
            <p className="mb-1 flex items-center gap-1.5 text-caption text-text-muted">
              <Eye size={13} aria-hidden /> {t("stories.viewers.summary", { viewers: story.viewerCount, views: story.viewCount })}
            </p>
            <ul className="divide-y divide-border-soft">
              {viewers.map((row) => (
                <PersonRow
                  key={row.user.id}
                  user={row.user}
                  onOpen={() => openProfile(row.user)}
                  trailing={
                    <span className="flex shrink-0 items-center gap-2">
                      {row.reaction && <span className="text-lg leading-none" aria-label={t("stories.viewers.reacted", { emoji: row.reaction })}>{row.reaction}</span>}
                      <span className="text-caption text-text-muted">{formatRelativeTime(row.lastViewedAt, language)}</span>
                      {blocked.has(row.user.id) ? (
                        <span className="text-caption text-text-muted">{t("stories.viewers.blocked")}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void block(row.user)}
                          aria-label={t("stories.viewers.block", { name: row.user.displayName })}
                          title={t("stories.viewers.block", { name: row.user.displayName })}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-danger"
                        >
                          <Ban size={15} aria-hidden />
                        </button>
                      )}
                    </span>
                  }
                />
              ))}
            </ul>
            <LoadMore failed={viewerPages.failed} hasMore={viewerPages.hasMore} loadingMore={viewerPages.loadingMore} onLoadMore={() => void viewerPages.loadMore()} />
          </>
        ))}

      {tab === "poll" &&
        story.sticker?.kind === "poll" &&
        (pollResults === null ? (
          <SheetLoading />
        ) : (
          <div className="space-y-4">
            <p className="font-semibold">{story.sticker.question}</p>
            <ul className="space-y-2">
              {story.sticker.options.map((option, index) => {
                const percent = pollResults.counts ? pollPercentages(pollResults.counts)[index] : 0;
                return (
                  <li key={index}>
                    <div className="flex items-center justify-between text-small">
                      <span className="font-medium">{option}</span>
                      <span className="tabular-nums text-text-muted">
                        {pollResults.counts?.[index] ?? 0} · {percent}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-soft">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-caption text-text-muted">{t("stories.poll.totalVotes", { count: pollResults.total ?? 0 })}</p>
            {voterPages.items.length > 0 && (
              <>
              <ul className="divide-y divide-border-soft">
                {voterPages.items.map((row) => (
                  <PersonRow
                    key={row.user.id}
                    user={row.user}
                    onOpen={() => openProfile(row.user)}
                    trailing={<span className="max-w-[40%] truncate text-caption text-text-muted">{story.sticker?.kind === "poll" ? story.sticker.options[row.option] : ""}</span>}
                  />
                ))}
              </ul>
              <LoadMore failed={voterPages.failed} hasMore={voterPages.hasMore} loadingMore={voterPages.loadingMore} onLoadMore={() => void voterPages.loadMore()} />
              </>
            )}
          </div>
        ))}

      {tab === "answers" &&
        (answerPages.loading ? (
          <SheetLoading />
        ) : answerPages.items.length === 0 ? (
          <p className="py-6 text-center text-small text-text-muted">{t("stories.question.noAnswers")}</p>
        ) : (
          <>
            <p className="mb-2 text-caption text-text-muted">{t("stories.question.shareHint")}</p>
            <ul className="space-y-2">
              {answerPages.items.map((answer) => (
                <li key={answer.id} className="rounded-md border border-border-soft bg-surface-soft p-3">
                  <p className="break-words text-small text-text">{answer.body}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-caption text-text-muted">
                    <span className="truncate">
                      {answer.responder ? `@${answer.responder.username}` : ""} · {formatRelativeTime(answer.createdAt, language)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onLeave();
                        router.push(`/stories/create?story=${story.id}&answer=${answer.id}`);
                      }}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 font-semibold text-primary hover:bg-primary-soft"
                    >
                      <Share size={13} aria-hidden /> {t("stories.question.shareAnswer")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <LoadMore failed={answerPages.failed} hasMore={answerPages.hasMore} loadingMore={answerPages.loadingMore} onLoadMore={() => void answerPages.loadMore()} />
          </>
        ))}
    </ViewerSheet>
  );
}

function SheetLoading() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center justify-center gap-2 py-6 text-small text-text-muted">
      <Loader2 size={15} className="animate-spin" aria-hidden /> {t("common.loading")}
    </p>
  );
}

/** Hikâye şikâyeti: merkezi şikâyet penceresi (docs/history/284-*); hikâye görüntüleyicisi açıkken oynatma durur (`sheet` durumu). */
export function ReportStorySheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  return <ReportModal target={{ type: "story", id: storyId }} onClose={onClose} />;
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ViewerSheet title={title} onClose={onClose} labelId="story-confirm-title">
      <p className="text-small text-text-secondary">{body}</p>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
          {t("common.cancelAction")}
        </Button>
        <Button
          type="button"
          variant="danger"
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
            } catch (err) {
              setError(err instanceof Error ? err.message : t("stories.error.generic"));
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : confirmLabel}
        </Button>
      </div>
    </ViewerSheet>
  );
}

/** Arşivden yeniden paylaş: YENİ hikâye (yeni 24 saat, seçilen kitle); orijinal olduğu gibi kalır. Çift dokunma tek hikâye üretir. */
export function ReshareSheet({ story, onClose, onDone }: { story: Story; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [audience, setAudience] = useState<StoryAudience>(story.audience);
  const [communityId, setCommunityId] = useState<string | null>(story.communityId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(crypto.randomUUID());
  return (
    <ViewerSheet title={t("stories.reshare.title")} onClose={onClose} labelId="story-reshare-title">
      <p className="mb-3 text-small text-text-secondary">{t("stories.reshare.body")}</p>
      <StoryAudiencePicker
        audience={audience}
        communityId={communityId}
        onChange={(nextAudience, nextCommunity) => {
          setAudience(nextAudience);
          setCommunityId(nextCommunity);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="mt-4 w-full"
        disabled={busy || (audience === "community" && !communityId)}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await reshareStory(story.id, audience, communityId, token.current);
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : t("stories.error.generic"));
            setBusy(false);
          }
        }}
      >
        {busy ? t("stories.create.publishing") : t("stories.reshare.submit")}
      </Button>
    </ViewerSheet>
  );
}

/** Öne çıkanlara ekle: mevcut bir öne çıkana ya da yeni bir tanesine. Öne çıkana eklemek hikâyenin hedef kitlesini DEĞİŞTİRMEZ. */
export function AddToHighlightSheet({ storyId, onClose, onDone }: { storyId: string; onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [highlights, setHighlights] = useState<StoryHighlight[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchHighlights(user.id)
      .then(setHighlights)
      .catch(() => setHighlights([]));
  }, [user]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
      setBusy(false);
    }
  }

  return (
    <ViewerSheet title={t("stories.highlight.addTitle")} onClose={onClose} labelId="story-highlight-title">
      <p className="mb-3 text-caption text-text-muted">{t("stories.highlight.privacyNote")}</p>
      {highlights === null ? (
        <SheetLoading />
      ) : (
        highlights.length > 0 && (
          <ul className="mb-4 space-y-1">
            {highlights.map((highlight) => {
              const already = highlight.storyIds.includes(storyId);
              return (
                <li key={highlight.id}>
                  <button
                    type="button"
                    disabled={busy || already}
                    onClick={() => void run(() => addStoryToHighlight(highlight.id, storyId), t("stories.highlight.added", { title: highlight.title }))}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-small hover:bg-surface-soft disabled:opacity-60"
                  >
                    <span className="truncate font-medium">{highlight.title}</span>
                    <span className="text-caption text-text-muted">{already ? t("stories.highlight.alreadyIn") : t("stories.highlight.count", { count: highlight.storyIds.length })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) void run(() => saveHighlight({ id: null, title, storyIds: [storyId], coverStoryId: storyId }), t("stories.highlight.added", { title: title.trim() }));
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={STORY_LIMITS.highlightTitleMax}
          placeholder={t("stories.highlight.newPlaceholder")}
          aria-label={t("stories.highlight.newPlaceholder")}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
        <Button type="submit" disabled={busy || !title.trim()}>
          <Plus size={15} aria-hidden /> {t("stories.highlight.create")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
    </ViewerSheet>
  );
}
