"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "@/components/icons/check";
import { ProjectPathBar } from "./project-path-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { ListChecks } from "@/components/icons/list-checks";
import { useToast } from "@/features/groups/use-toast";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  decideProposal,
  decideReview,
  fetchReviewQueue,
  type ProjectDetail,
  type ReviewQueue,
  type ReviewQueueItem,
  type ReviewQueueProposal,
} from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { canReview, projectLink } from "@/lib/team-projects";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { TeamCtx } from "./team-page";
import { SectionError } from "./team-ui";

const KIND_KEY: Record<string, TranslationKey> = {
  image: "tp.kind.image",
  prompt: "tp.kind.prompt",
  note: "tp.kind.note",
  palette: "tp.kind.palette",
  content: "tp.kind.content",
};
const kindKey = (kind: string): TranslationKey => KIND_KEY[kind] ?? "tp.kind.content";

/**
 * Lider onay incelemesi (docs/history/362-*): bekleyen öğeler (workflow gibi paketler TEK satır) ve bekleyen değişiklik önerileri.
 * Karar: "Onayla" ya da not yazarak "Değişiklik iste" (not zorunlu). Karar yalnız lidere açıktır; sunucu yine denetler.
 */
export function TeamReviewInbox({ ctx, detail, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; onChanged: () => void }) {
  const { t, language } = useTranslation();
  const { team } = ctx;
  const { project, myRole } = detail;
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [failed, setFailed] = useState(false);
  const [fileFilter, setFileFilter] = useState<string | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { node: toastNode, show } = useToast();
  const allowed = canReview(myRole);

  const load = useCallback(() => {
    void fetchReviewQueue(project.id).then(
      (next) => {
        setFailed(false);
        setQueue(next);
      },
      () => setFailed(true),
    );
  }, [project.id]);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  // Paket (rev_unit) tek satır: ilk öğe temsilcidir; karar paketin tamamına işler.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: ReviewQueueItem[] = [];
    for (const item of queue?.items ?? []) {
      if (fileFilter !== "all" && item.fileId !== fileFilter) continue;
      const key = item.unit ? `${item.spaceId}:${item.unit}` : item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [queue, fileFilter]);
  const proposals = (queue?.proposals ?? []).filter((proposal) => fileFilter === "all" || proposal.fileId === fileFilter);
  const current = rows.find((item) => item.id === selected) ?? rows[0] ?? null;

  const run = async (action: () => Promise<unknown>, doneKey: TranslationKey) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNote("");
      setSelected(null);
      show(t(doneKey));
      load();
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
    } finally {
      setBusy(false);
    }
  };
  const decide = (item: ReviewQueueItem, decision: "approve" | "changes") => {
    if (decision === "changes" && !note.trim()) {
      setError(t("tp.review.noteRequired"));
      return;
    }
    void run(() => decideReview([item.id], decision, note.trim()), decision === "approve" ? "tp.review.approvedToast" : "tp.review.changesToast");
  };

  if (!allowed) {
    return <EmptyState icon={ListChecks} title={t("tp.review.leadOnly")} action={{ label: t("tp.page.back"), href: projectLink(team.id, project.id) }} />;
  }

  return (
    <div className="space-y-5" data-testid="team-review-inbox" data-project-id={project.id}>
      <ProjectPathBar crumbs={[{ label: team.name, href: projectLink(team.id) }, { label: project.title, href: projectLink(team.id, project.id) }, { label: t("tp.review.inboxTitle") }]} backHref={projectLink(team.id, project.id)} />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 text-h1 font-display font-extrabold text-text">{t("tp.review.inboxTitle")}</h1>
        {rows.length > 1 && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => decideReview(rows.map((row) => row.id), "approve"), "tp.review.approvedToast")}
            data-review-approve-all
          >
            <Check size={16} aria-hidden />
            {t("tp.review.approveAll", { count: rows.length })}
          </Button>
        )}
      </header>

      {detail.files.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("tp.review.filterAria")}>
          {[{ id: "all", title: t("common.all") }, ...detail.files.map((file) => ({ id: file.id, title: file.title }))].map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => setFileFilter(file.id)}
              aria-pressed={fileFilter === file.id}
              className={cn("h-8 rounded-full border px-3 text-small", fileFilter === file.id ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border-soft bg-surface text-text-secondary")}
            >
              {file.title}
            </button>
          ))}
        </div>
      )}

      {failed && <SectionError message={t("tp.error.load")} onRetry={load} />}
      {!failed && queue === null && <Skeleton className="h-48 w-full rounded-xl" />}
      {queue !== null && rows.length === 0 && proposals.length === 0 && <EmptyState icon={ListChecks} title={t("tp.review.inboxEmpty")} description={t("tp.review.inboxEmptyBody")} />}

      {queue !== null && rows.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <ul className="space-y-2" data-testid="review-list">
            {rows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(item.id);
                    setNote("");
                    setError(null);
                  }}
                  aria-current={current?.id === item.id ? "true" : undefined}
                  data-review-row={item.id}
                  className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left", current?.id === item.id ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-bold text-text">{item.title || t(kindKey(item.kind))}</span>
                    <span className="block truncate text-caption text-text-muted">
                      {[item.authorName, item.fileTitle ?? t("tp.area.projectWide"), item.submittedAt ? formatRelativeTime(item.submittedAt, language) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {item.unitCount > 1 && <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-surface-soft px-2.5 text-caption font-semibold text-text-secondary">{t("tp.review.packageOf", { count: item.unitCount })}</span>}
                </button>
              </li>
            ))}
          </ul>

          {current && (
            <section className="min-w-0 space-y-4 rounded-lg border border-border-soft bg-surface p-5" data-testid="review-detail" data-review-detail={current.id}>
              <div className="space-y-1">
                <p className="text-caption font-bold uppercase tracking-[0.08em] text-text-muted">
                  {t(kindKey(current.kind))} · {current.fileTitle ?? t("tp.area.projectWide")}
                </p>
                <h2 className="break-words text-h2 font-display font-bold text-text">{current.title || t(kindKey(current.kind))}</h2>
                <p className="text-small text-text-secondary">{t("tp.review.addedBy", { name: current.authorName ?? "" })}</p>
              </div>
              {current.unitCount > 1 && <p className="rounded-lg bg-surface-soft px-3 py-2 text-small text-text-secondary">{t("tp.review.packageHint", { count: current.unitCount })}</p>}
              <ReviewPreview item={current} />
              <div className="space-y-2">
                <label htmlFor="review-note" className="block text-small font-bold text-text">
                  {t("tp.review.noteLabel")} <span className="font-normal text-text-muted">{t("tp.review.noteLabelHint")}</span>
                </label>
                <textarea
                  id="review-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={t("tp.review.notePlaceholder")}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-small"
                />
              </div>
              {error && (
                <p role="alert" className="text-small text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" disabled={busy} onClick={() => decide(current, "approve")} data-review-approve>
                  <Check size={16} aria-hidden />
                  {t("tp.review.approve")}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => decide(current, "changes")} data-review-changes>
                  {t("tp.review.requestChanges")}
                </Button>
                <p className="ml-auto max-w-xs text-right text-caption text-text-muted">{t("tp.review.decisionHint")}</p>
              </div>
            </section>
          )}
        </div>
      )}

      {proposals.length > 0 && (
        <section className="space-y-3" data-testid="review-proposals">
          <h2 className="text-h3 font-display font-bold text-text">{t("tp.review.proposalsTitle", { count: proposals.length })}</h2>
          <ul className="space-y-3">
            {proposals.map((proposal) => (
              <ProposalCard key={proposal.itemId} proposal={proposal} busy={busy} onDecide={(decision, text) => void run(() => decideProposal(proposal.itemId, decision, text), decision === "approve" ? "tp.review.approvedToast" : "tp.review.changesToast")} />
            ))}
          </ul>
        </section>
      )}
      {toastNode}
    </div>
  );
}

function ReviewPreview({ item }: { item: ReviewQueueItem }) {
  const { t } = useTranslation();
  if (item.kind === "image" && item.mediaUrl) {
    return <StorageImg src={item.mediaUrl} alt={item.title} className="max-h-80 w-full rounded-xl object-contain" />;
  }
  if (item.body) {
    return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-soft p-3 font-mono text-small text-text">{item.body}</pre>;
  }
  return <p className="rounded-xl bg-surface-soft p-3 text-small text-text-muted">{t(item.kind === "content" ? "tp.review.contentPreview" : "tp.review.noPreview")}</p>;
}

function ProposalCard({ proposal, busy, onDecide }: { proposal: ReviewQueueProposal; busy: boolean; onDecide: (decision: "approve" | "changes", note: string) => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <li className="space-y-3 rounded-lg border border-border-soft bg-surface p-4" data-review-proposal={proposal.itemId}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-small font-bold text-text">
          {proposal.proposed.title || proposal.current.title || t(kindKey(proposal.kind))}
          <span className="ml-2 font-normal text-text-muted">{t("tp.review.proposedBy", { name: proposal.proposerName ?? "" })}</span>
        </span>
        <Button type="button" size="sm" disabled={busy} onClick={() => onDecide("approve", "")} data-proposal-approve>
          {t("tp.review.approve")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen((v) => !v)}>
          {t("tp.review.requestChanges")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DiffBlock label={t("tp.review.current")} value={proposal.current} />
        <DiffBlock label={t("tp.review.proposed")} value={proposal.proposed} highlight />
      </div>
      {open && (
        <div className="flex items-center gap-2">
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} aria-label={t("tp.review.noteLabel")} placeholder={t("tp.review.notePlaceholder")} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-small" />
          <Button type="button" size="sm" disabled={busy || !note.trim()} onClick={() => onDecide("changes", note.trim())}>
            {t("tp.review.send")}
          </Button>
        </div>
      )}
    </li>
  );
}

function DiffBlock({ label, value, highlight = false }: { label: string; value: { title: string; body: string; note: string }; highlight?: boolean }) {
  return (
    <div className={cn("space-y-1 rounded-lg p-3 text-small", highlight ? "bg-success/10" : "bg-surface-soft")}>
      <p className="text-caption font-bold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      {value.title && <p className="font-semibold text-text">{value.title}</p>}
      {value.body && <p className="whitespace-pre-wrap break-words font-mono text-caption text-text">{value.body}</p>}
      {value.note && <p className="whitespace-pre-wrap break-words text-caption text-text-secondary">{value.note}</p>}
    </div>
  );
}
