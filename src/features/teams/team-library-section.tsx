"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BookOpen } from "@/components/icons/book-open";
import { Search } from "@/components/icons/search";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldLabelClassName } from "@/components/ui/field";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { spaceHref } from "@/lib/spaces";
import {
  addReviewComment,
  decideItem,
  fetchItemReview,
  fetchLibraryCounts,
  listLibraryItems,
  requestReview,
  setItemDeprecated,
  type ItemReview,
  type TeamActionError,
  type TeamLibraryCounts,
  type TeamLibraryItem,
} from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { TeamCtx } from "./team-page";
import { PillChoice, StatTile } from "./team-ui";

type Status = "all" | "approved" | "pending" | "draft" | "deprecated";
const STATUSES: readonly Status[] = ["all", "approved", "pending", "draft", "deprecated"];

const STATE_KEY: Record<TeamLibraryItem["state"], TranslationKey> = {
  draft: "tm.lib.state.draft",
  pending: "tm.lib.state.pending",
  approved: "tm.lib.state.approved",
  deprecated: "tm.lib.state.deprecated",
};
const STATE_TONE: Record<TeamLibraryItem["state"], string> = {
  draft: "bg-surface-soft text-text-secondary",
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  deprecated: "bg-danger/10 text-danger",
};

const CHECKLIST: { key: string; label: TranslationKey }[] = [
  { key: "clear", label: "tm.lib.check.clear" },
  { key: "variables", label: "tm.lib.check.variables" },
  { key: "safe", label: "tm.lib.check.safe" },
];

/**
 * Kütüphane sekmesi: ekibin ortak promptları, durum süzgeci (Hepsi/Onaylı/Onay bekliyor/Taslak/Kullanımdan kalktı), arama, kullanım ve "Çalıştı mı?"
 * göstergeleri ve onay inceleme penceresi (`?review=<öğe>` doğrudan açar). Onay kuralları sunucudadır (`space_decide_item`).
 */
export function TeamLibrarySection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { team, can } = ctx;
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("status");
  const [status, setStatus] = useState<Status>(STATUSES.includes(initial as Status) ? (initial as Status) : "all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<TeamLibraryCounts | null>(null);
  const [version, setVersion] = useState(0);
  const [reviewId, setReviewId] = useState<string | null>(params.get("review"));
  const { node: toastNode, show } = useToast();

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);
  useEffect(() => {
    void fetchLibraryCounts(team.id).then(setCounts, () => setCounts(null));
  }, [team.id, version]);

  const list = usePagedList<TeamLibraryItem>(`team-lib|${team.id}|${status}|${query}|${version}`, true, (offset) =>
    listLibraryItems(team.id, status === "all" ? null : status, query, offset),
  );

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      show(done);
      refresh();
    } catch (error) {
      show((error as TeamActionError).message);
    }
  };

  const closeReview = () => {
    setReviewId(null);
    if (params.get("review")) router.replace(teamLink(team.id, "library"));
  };

  return (
    <section className="space-y-4" data-testid="team-library">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("tm.lib.state.approved")} value={counts?.approved ?? "–"} />
        <StatTile label={t("tm.lib.state.pending")} value={counts?.pending ?? "–"} delta={counts?.oldestPendingAt ? t("tm.lib.oldest", { time: formatRelativeTime(counts.oldestPendingAt, language) }) : undefined} />
        <StatTile label={t("tm.lib.state.draft")} value={counts?.draft ?? "–"} />
        <StatTile label={t("tm.lib.state.deprecated")} value={counts?.deprecated ?? "–"} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillChoice<Status>
          ariaLabel={t("tm.lib.filter")}
          value={status}
          onChange={setStatus}
          options={STATUSES.map((key) => ({ key, label: key === "all" ? t("tm.lib.all") : t(STATE_KEY[key]) }))}
        />
        <label className="relative ml-auto block w-full sm:w-64">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("tm.lib.search")}
            aria-label={t("tm.lib.search")}
            className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-3 text-small"
          />
        </label>
      </div>

      <PagedListState list={list}>
        {list.items.length === 0 && !list.failed ? (
          <EmptyState icon={BookOpen} title={t("tm.lib.empty.title")} description={t("tm.lib.empty.body")} action={team.librarySpaceId ? { label: t("tm.lib.openSpace"), href: spaceHref(team.librarySpaceId, "prompts") } : undefined} />
        ) : (
          <ul className="divide-y divide-border-soft rounded-lg border border-border-soft bg-surface" data-testid="team-library-list">
            {list.items.map((item) => (
              <li key={item.id} data-library-item={item.id} data-state={item.state} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-small font-medium">{item.title}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-caption font-medium", STATE_TONE[item.state])}>{t(STATE_KEY[item.state])}</span>
                    {item.state === "pending" && item.approvalsNeeded > 1 && (
                      <span className="text-caption text-text-muted">{t("tm.lib.approvals", { have: item.approvals, need: item.approvalsNeeded })}</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-caption text-text-muted">
                    {[item.groupName, item.updatedByName, formatRelativeTime(item.updatedAt, language)].filter(Boolean).join(" · ")}
                    {item.useCount > 0 && ` · ${t("tm.lib.uses", { count: item.useCount })}`}
                    {item.worksYes + item.worksNo > 0 && ` · ${t("tm.lib.works", { yes: item.worksYes, total: item.worksYes + item.worksNo })}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {item.state === "pending" && (
                    <Button type="button" size="sm" onClick={() => setReviewId(item.id)} data-review-open>
                      {t("tm.lib.review")}
                    </Button>
                  )}
                  {item.state === "draft" && can("create_spaces") && (
                    <Button type="button" size="sm" variant="outline" onClick={() => void act(() => requestReview(item.id), t("tm.lib.requested"))}>
                      {t("tm.lib.requestReview")}
                    </Button>
                  )}
                  {item.state === "pending" && can("create_spaces") && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void act(() => requestReview(item.id, true), t("tm.lib.withdrawn"))}>
                      {t("tm.lib.withdraw")}
                    </Button>
                  )}
                  {can("approve_library") && item.state === "approved" && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void act(() => setItemDeprecated(item.id, true), t("tm.lib.deprecated"))}>
                      {t("tm.lib.deprecate")}
                    </Button>
                  )}
                  {can("approve_library") && item.state === "deprecated" && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void act(() => setItemDeprecated(item.id, false), t("tm.lib.restored"))}>
                      {t("tm.lib.restore")}
                    </Button>
                  )}
                  {team.librarySpaceId && (
                    <Link href={spaceHref(team.librarySpaceId, "prompts")} className="text-caption text-primary hover:underline">
                      {t("tm.lib.open")}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PagedListState>

      {toastNode}
      {reviewId && (
        <ReviewDialog
          itemId={reviewId}
          onClose={closeReview}
          onChanged={() => {
            refresh();
            closeReview();
          }}
        />
      )}
    </section>
  );
}

/** Onay inceleme penceresi: önceki onaylı sürümle fark, kontrol listesi, not ve yorum akışı; karar `space_decide_item`. */
function ReviewDialog({ itemId, onClose, onChanged }: { itemId: string; onClose: () => void; onChanged: () => void }) {
  const { t, language } = useTranslation();
  const [review, setReview] = useState<ItemReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void fetchItemReview(itemId).then(setReview, (e: TeamActionError) => setError(e.message));
  }, [itemId]);
  useEffect(load, [load]);

  const decide = async (decision: "approve" | "changes") => {
    setBusy(true);
    setError(null);
    try {
      await decideItem(itemId, decision, note.trim(), CHECKLIST.map((c) => ({ key: c.key, done: Boolean(checks[c.key]) })));
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };
  const send = async () => {
    if (!comment.trim()) return;
    try {
      await addReviewComment(itemId, comment.trim());
      setComment("");
      load();
    } catch (e) {
      setError((e as TeamActionError).message);
    }
  };

  const baseChanged = review?.base && review.base.body !== review.item.body;

  return (
    <SpaceDialog title={review ? t("tm.lib.reviewTitle", { title: review.item.title }) : t("tm.lib.review")} onClose={onClose} busy={busy} wide formTestId="team-review">
      {!review ? (
        <p className="text-small text-text-muted" role={error ? "alert" : undefined}>
          {error ?? t("common.loading")}
        </p>
      ) : (
        <div className="space-y-4" data-testid="team-review">
          <div>
            <span className={fieldLabelClassName}>{t("tm.lib.current")}</span>
            <pre className="prompt-text max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-soft p-3 text-small">{review.item.body}</pre>
          </div>
          {review.base && (
            <div>
              <span className={fieldLabelClassName}>{t(baseChanged ? "tm.lib.baseChanged" : "tm.lib.baseSame", { author: review.base.author ?? "" })}</span>
              {baseChanged && <pre className="prompt-text max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-soft p-3 text-small text-text-secondary">{review.base.body}</pre>}
            </div>
          )}
          <p className="text-caption text-text-muted">{t("tm.lib.needed", { have: review.approvals.filter((a) => a.decision === "approve").length, need: review.needed })}</p>

          {review.canDecide && (
            <div className="space-y-3 rounded-lg border border-border-soft p-3">
              <fieldset>
                <legend className={fieldLabelClassName}>{t("tm.lib.checklist")}</legend>
                {CHECKLIST.map((check) => (
                  <label key={check.key} className="flex min-h-9 items-center gap-2 text-small">
                    <input type="checkbox" checked={Boolean(checks[check.key])} onChange={(event) => setChecks((prev) => ({ ...prev, [check.key]: event.target.checked }))} />
                    {t(check.label)}
                  </label>
                ))}
              </fieldset>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={2}
                placeholder={t("tm.lib.note")}
                aria-label={t("tm.lib.note")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-small"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" disabled={busy || !note.trim()} onClick={() => void decide("changes")} data-review-changes>
                  {t("tm.lib.requestChanges")}
                </Button>
                <Button type="button" disabled={busy} onClick={() => void decide("approve")} data-review-approve>
                  {t("tm.lib.approve")}
                </Button>
              </div>
            </div>
          )}

          <div>
            <span className={fieldLabelClassName}>{t("tm.lib.comments")}</span>
            <ul className="space-y-2">
              {review.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-surface-soft px-3 py-2 text-small">
                  <span className="font-medium">{c.name ?? t("tm.lib.system")}</span>
                  <span className="text-caption text-text-muted"> · {formatRelativeTime(c.at, language)}</span>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("tm.lib.commentPlaceholder")}
                aria-label={t("tm.lib.commentPlaceholder")}
                maxLength={1000}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-small"
              />
              <Button type="button" variant="outline" disabled={!comment.trim()} onClick={() => void send()}>
                {t("tm.lib.send")}
              </Button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </SpaceDialog>
  );
}
