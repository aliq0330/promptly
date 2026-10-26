"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, History, Lock, MessageCircle, Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentSection } from "@/features/prompts/comment-section";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { spaceActivityHref, spaceHref } from "@/lib/spaces";
import { fetchSpaceActivity, fetchSpaceActivityEvent, setSpaceActivityNote, type SpaceActivity } from "@/lib/supabase/spaces";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { ActivityDiff, activityCategory, useActivityText, type ActivityCategory } from "../activity-parts";
import { useSpaceContext } from "../space-provider";

type Filter = "all" | Exclude<ActivityCategory, "other">;
const FILTERS: { key: Filter; label: "spaces.activity.filterAll" | "spaces.activity.filterPalette" | "spaces.activity.filterItems" | "spaces.activity.filterSettings" }[] = [
  { key: "all", label: "spaces.activity.filterAll" },
  { key: "palette", label: "spaces.activity.filterPalette" },
  { key: "items", label: "spaces.activity.filterItems" },
  { key: "settings", label: "spaces.activity.filterSettings" },
];
const PAGE = 20;

function Actor({ entry, size = 36 }: { entry: SpaceActivity; size?: number }) {
  return entry.actor ? (
    <Link href={profileHref(entry.actor)} className="shrink-0">
      <Avatar src={entry.actor.avatarUrl} alt={entry.actor.displayName} size={size} />
    </Link>
  ) : (
    <span className="shrink-0 rounded-full bg-surface-soft" style={{ width: size, height: size }} />
  );
}

/**
 * Etkinlik sekmesi (docs/history/242-*): `?event=<id>` yoksa önizlemeli liste (her satırda ne değişti: önce/sonra), varsa o etkinliğin özet sayfası.
 * Etkinliği Space'i okuyan herkes görür (varsayılan); sahibi ayarlardan "yalnız üyeler"e çevirebilir — o durumda üye olmayan bu sekmeyi hiç görmez.
 */
export function ActivityTab() {
  const eventId = useSearchParams().get("event");
  return eventId ? <ActivityEventPage eventId={eventId} /> : <ActivityList />;
}

function ActivityList() {
  const { t, language } = useTranslation();
  const { space, items } = useSpaceContext();
  const activityText = useActivityText();
  const [list, setList] = useState<SpaceActivity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    fetchSpaceActivity(space.id, limit)
      .then((rows) => alive && (setList(rows), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [space.id, limit, items.length, space.updatedAt]);

  const shown = (list ?? []).filter((entry) => filter === "all" || activityCategory(entry.action) === filter);
  return (
    <section className="max-w-3xl space-y-4" data-testid="space-activity-tab">
      <p className="text-small text-text-muted">{t("spaces.activity.intro")}</p>
      {space.activityVisibility === "members" && (
        <p className="flex items-center gap-1.5 text-caption text-text-muted">
          <Lock size={12} aria-hidden /> {t("spaces.activity.membersOnlyNotice")}
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("spaces.tab.activity")}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn("rounded-full border px-3.5 py-1.5 text-small font-medium transition-colors", filter === f.key ? "border-text bg-text text-background" : "border-border bg-surface text-text-secondary hover:border-border-strong")}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      {failed ? (
        <p className="text-small text-text-muted">{t("spaces.activity.loadError")}</p>
      ) : list === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={History} title={t("spaces.activity.empty")} />
      ) : (
        <ul className="space-y-3">
          {shown.map((entry) => (
            <li key={entry.id} data-activity={entry.action} data-activity-id={entry.id} className="flex gap-3">
              <Actor entry={entry} />
              <div className="min-w-0 flex-1 rounded-2xl border border-border-soft bg-surface p-3.5">
                <p className="text-small text-text">
                  <span className="font-semibold">{entry.actor?.displayName ?? t("spaces.activity.someone")}</span> {activityText(entry)}
                  <span className="text-caption text-text-muted"> · {formatRelativeTime(entry.createdAt, language)}</span>
                </p>
                <div className="mt-2.5 empty:hidden">
                  <ActivityDiff entry={entry} />
                </div>
                {entry.authorNote && (
                  <p className="mt-2.5 rounded-xl bg-surface-soft px-3 py-2 text-small text-text">
                    <span className="block text-label font-semibold uppercase tracking-[0.06em] text-text-muted">{t("spaces.activity.noteBy", { name: entry.actor?.displayName ?? t("spaces.activity.someone") })}</span>
                    {entry.authorNote}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-4">
                  <Link href={spaceActivityHref(space.id, entry.id)} className="inline-flex items-center gap-1.5 text-small font-semibold text-primary hover:underline" data-activity-open="">
                    <MessageCircle size={14} aria-hidden />
                    {entry.commentCount > 0 ? t("spaces.activity.comments", { count: entry.commentCount }) : t("spaces.activity.writeComment")}
                  </Link>
                  <Link href={spaceActivityHref(space.id, entry.id)} className="inline-flex items-center gap-1 text-small text-text-muted hover:text-text">
                    {t("spaces.activity.openEvent")}
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list && list.length >= limit && (
        <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="text-small font-semibold text-primary hover:underline">
          {t("spaces.activity.more")}
        </button>
      )}
    </section>
  );
}

/** Tek etkinliğin özet sayfası: ne değişti (önce/sonra), yapanın notu, yorumlar; bir önceki / sonraki etkinliğe geçiş. */
function ActivityEventPage({ eventId }: { eventId: string }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { space } = useSpaceContext();
  const activityText = useActivityText();
  const [state, setState] = useState<{ event: SpaceActivity; previous: SpaceActivity | null; next: SpaceActivity | null } | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const hl = searchParams.get("hl");
  const highlightCommentId = hl?.startsWith("comment:") ? hl.slice("comment:".length) : null;

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- etkinlik değişince yeniden yükle
    setState(undefined);
    fetchSpaceActivityEvent(space.id, eventId)
      .then((result) => alive && (setState(result), setFailed(false), setEditingNote(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [space.id, eventId]);

  const go = useCallback((id: string) => router.replace(spaceActivityHref(space.id, id), { scroll: false }), [router, space.id]);

  async function saveNote() {
    if (!state) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      await setSpaceActivityNote(state.event.id, noteDraft);
      setState({ ...state, event: { ...state.event, authorNote: noteDraft.trim() || null } });
      setEditingNote(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setNoteBusy(false);
    }
  }

  const back = (
    <Link href={spaceHref(space.id, "activity")} className="inline-flex items-center gap-1.5 text-small text-text-muted hover:text-text" data-activity-back="">
      <ArrowLeft size={14} aria-hidden /> {t("spaces.activity.backToList")}
    </Link>
  );

  if (failed || state === null) {
    return (
      <div className="max-w-3xl space-y-4">
        {back}
        <p role="alert" className="text-small text-text-muted">{t("spaces.activity.eventNotFound")}</p>
      </div>
    );
  }
  if (state === undefined) return <Skeleton className="h-48 w-full max-w-3xl rounded-2xl" />;

  const { event, previous, next } = state;
  const mine = Boolean(user) && user?.id === event.actorId;
  return (
    <article className="max-w-3xl space-y-5" data-activity-page={event.id}>
      {back}
      <header className="flex gap-3">
        <Actor entry={event} size={44} />
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase tracking-[0.08em] text-text-muted">{t("spaces.activity.summaryTitle")}</p>
          <h2 className="text-h3 font-bold text-text">
            {event.actor?.displayName ?? t("spaces.activity.someone")} {activityText(event)}
          </h2>
          <p className="text-caption text-text-muted">{formatRelativeTime(event.createdAt, language)}</p>
        </div>
      </header>

      <ActivityDiff entry={event} emptyNote />

      <section aria-label={t("spaces.activity.noteBy", { name: event.actor?.displayName ?? "" })} className="space-y-2">
        {editingNote ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveNote();
            }}
            className="space-y-2"
          >
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              maxLength={280}
              rows={3}
              autoFocus
              placeholder={t("spaces.activity.notePlaceholder")}
              data-activity-note-input=""
              className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={noteBusy}>
                {t("spaces.activity.noteSave")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingNote(false)} disabled={noteBusy}>
                {t("common.cancel")}
              </Button>
              <span className="ml-auto text-caption tabular-nums text-text-muted">{noteDraft.length}/280</span>
            </div>
            {noteError && <p role="alert" className="text-caption text-danger">{noteError}</p>}
          </form>
        ) : (
          <>
            {event.authorNote && (
              <p className="rounded-xl bg-surface-soft px-3.5 py-3 text-small text-text" data-activity-note="">
                <span className="block text-label font-semibold uppercase tracking-[0.06em] text-text-muted">{t("spaces.activity.noteBy", { name: event.actor?.displayName ?? t("spaces.activity.someone") })}</span>
                {event.authorNote}
              </p>
            )}
            {mine && (
              <button type="button" onClick={() => (setNoteDraft(event.authorNote ?? ""), setNoteError(null), setEditingNote(true))} className="inline-flex items-center gap-1.5 text-small font-semibold text-primary hover:underline" data-activity-add-note="">
                {event.authorNote && <Pencil size={13} aria-hidden />}
                {event.authorNote ? t("spaces.activity.editNote") : t("spaces.activity.addNote")}
                {!event.authorNote && <span className="font-normal text-text-muted">({t("spaces.activity.noteOnlyAuthor")})</span>}
              </button>
            )}
          </>
        )}
      </section>

      <nav aria-label={t("spaces.tab.activity")} className="flex flex-wrap items-center justify-between gap-2 border-y border-border-soft py-3">
        <Button type="button" variant="outline" size="sm" disabled={!previous} onClick={() => previous && go(previous.id)} data-activity-prev="">
          <ArrowLeft size={14} aria-hidden /> {t("spaces.activity.previous")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!next} onClick={() => next && go(next.id)} data-activity-next="">
          {t("spaces.activity.next")} <ArrowRight size={14} aria-hidden />
        </Button>
      </nav>

      <section className="space-y-3" aria-label={t("spaces.activity.eventComments")}>
        <div>
          <h3 className="text-h3 font-bold text-text">{t("spaces.activity.eventComments")}</h3>
          <p className="text-caption text-text-muted">{t("spaces.activity.eventCommentsHint")}</p>
        </div>
        <CommentSection target={{ spaceId: space.id, spaceActivityId: event.id }} headless highlightCommentId={highlightCommentId} />
      </section>
    </article>
  );
}
