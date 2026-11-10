"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check } from "@/components/icons/check";
import { ListChecks } from "@/components/icons/list-checks";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { BoardItem, BoardProposal, BoardState } from "@/lib/supabase/team-center";
import { decideProposal, decideReview } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { boardItemHref, boardProjects, groupBoard } from "@/lib/team-center";
import { projectLink } from "@/lib/team-projects";
import { useMediaQuery } from "@/lib/use-media-query";
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

const COLUMN: Record<BoardState, { dot: string; label: TranslationKey; short: TranslationKey }> = {
  pending: { dot: "bg-warning", label: "tc.appr.pending", short: "tc.appr.pendingShort" },
  changes: { dot: "bg-danger", label: "tc.appr.changes", short: "tc.appr.changesShort" },
  approved: { dot: "bg-success", label: "tc.appr.approved", short: "tc.appr.approvedShort" },
};

/** Karar bekleyen kart: öğe ya da değişiklik önerisi (ikisi de aynı sütunda). */
type Card = { type: "item"; item: BoardItem } | { type: "proposal"; proposal: BoardProposal };

/**
 * Onaylar (`tab=approvals`; docs/history/366-*, mockup B5): ekibin onay panosu. Masaüstünde üç sütun (Senden bekleyen · Değişiklik istenen · Bugün onaylanan),
 * tablet ve telefonda segmentli tek liste. Lider kendi projelerinin her şeyini görür ve karar verir; diğerleri yalnız KENDİ öğelerinin durumunu görür.
 * Karar sunucudadır (`team_review_decide` / `team_review_decide_proposal`): burada yalnız çağrılır, başarısız olursa hata yazılır.
 */
export function TeamApprovalsSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, board, reloadBoard } = ctx;
  const wide = useMediaQuery("(min-width: 1024px)");
  const [project, setProject] = useState<string>("all");
  const [segment, setSegment] = useState<BoardState>("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<Card | null>(null);
  const { node: toastNode, show } = useToast();

  const columns = useMemo(() => groupBoard(board?.items ?? [], project), [board, project]);
  const projects = useMemo(() => boardProjects(board?.items ?? []), [board]);
  const proposals = useMemo(() => (board?.proposals ?? []).filter((proposal) => project === "all" || proposal.projectId === project), [board, project]);
  const pendingCards: Card[] = [...columns[0].rows.map((item): Card => ({ type: "item", item })), ...proposals.map((proposal): Card => ({ type: "proposal", proposal }))];
  const cardsOf = (state: BoardState): Card[] => (state === "pending" ? pendingCards : columns[state === "changes" ? 1 : 2].rows.map((item): Card => ({ type: "item", item })));
  const decidable = columns[0].rows.filter((item) => item.canDecide);

  if (!board) {
    return (
      <section data-testid="team-approvals" className="space-y-3">
        {ctx.boardFailed ? <SectionError message={t("tp.error.load")} onRetry={reloadBoard} /> : <Skeleton className="h-64 w-full rounded-2xl" />}
      </section>
    );
  }

  const run = async (action: () => Promise<unknown>, doneKey: TranslationKey) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      show(t(doneKey));
      reloadBoard();
      return true;
    } catch (e) {
      setError((e as TeamActionError).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const approve = (card: Card) =>
    void run(() => (card.type === "item" ? decideReview([card.item.id], "approve", "") : decideProposal(card.proposal.itemId, "approve", "")), "tp.review.approvedToast");
  const requestChanges = async (card: Card, note: string) => {
    const done = await run(() => (card.type === "item" ? decideReview([card.item.id], "changes", note) : decideProposal(card.proposal.itemId, "changes", note)), "tp.review.changesToast");
    if (done) setChanging(null);
  };
  const empty = board.items.length === 0 && board.proposals.length === 0;

  const renderColumn = (state: BoardState) => {
    const cards = cardsOf(state);
    return (
      <ul className="space-y-2.5" data-board-column={state}>
        {cards.length === 0 && <li className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-6 text-center text-small text-text-muted">{t("tc.appr.columnEmpty")}</li>}
        {cards.map((card) => (
          <li key={card.type === "item" ? card.item.id : `p-${card.proposal.itemId}`}>
            <BoardCard teamId={team.id} card={card} state={state} busy={busy} onApprove={() => approve(card)} onChanges={() => setChanging(card)} />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section className="space-y-4" data-testid="team-approvals">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-h2 font-bold text-text">{t("tc.appr.title")}</h2>
          <p className="text-small text-text-secondary">{t("tc.appr.subtitle")}</p>
        </div>
        {decidable.length > 1 && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => decideReview(decidable.map((item) => item.id), "approve"), "tp.review.approvedToast")} data-board-approve-all>
            <Check size={15} aria-hidden />
            {t("tp.review.approveAll", { count: decidable.length })}
          </Button>
        )}
      </header>

      {projects.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("tp.review.filterAria")}>
          {[{ id: "all", title: t("tc.appr.allProjects"), count: 0 }, ...projects].map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setProject(entry.id)}
              aria-pressed={project === entry.id}
              data-board-project={entry.id}
              className={cn("h-9 rounded-full border px-3.5 text-small font-semibold", project === entry.id ? "border-text bg-text text-background" : "border-border-soft bg-surface text-text-secondary hover:bg-surface-soft")}
            >
              {entry.title}
              {entry.count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{entry.count}</span>}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}

      {empty ? (
        <EmptyState icon={ListChecks} title={t("tc.appr.empty")} description={t("tc.appr.emptyBody")} />
      ) : wide ? (
        <div className="grid grid-cols-3 gap-4" data-board-layout="columns">
          {(["pending", "changes", "approved"] as const).map((state) => (
            <div key={state} className="rounded-[20px] bg-surface-soft p-3">
              <h3 className="mb-2.5 flex items-center gap-2 px-1.5 font-display text-body font-bold text-text">
                <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", COLUMN[state].dot)} />
                {t(COLUMN[state].label)}
                <span className="ml-auto font-sans text-small font-bold text-text-muted">{cardsOf(state).length}</span>
              </h3>
              {renderColumn(state)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3" data-board-layout="segments">
          <div role="group" aria-label={t("tc.appr.statusAria")} className="flex rounded-full bg-surface-soft p-[3px] text-small font-semibold">
            {(["pending", "changes", "approved"] as const).map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setSegment(state)}
                aria-pressed={segment === state}
                data-board-segment={state}
                className={cn("h-11 flex-1 rounded-full px-2", segment === state ? "bg-surface text-text shadow-xs" : "text-text-muted")}
              >
                {t(COLUMN[state].short)} {cardsOf(state).length}
              </button>
            ))}
          </div>
          {renderColumn(segment)}
        </div>
      )}

      {changing && <ChangesDialog busy={busy} onClose={() => setChanging(null)} onSubmit={(note) => void requestChanges(changing, note)} />}
      {toastNode}
    </section>
  );
}

function BoardCard({ teamId, card, state, busy, onApprove, onChanges }: { teamId: string; card: Card; state: BoardState; busy: boolean; onApprove: () => void; onChanges: () => void }) {
  const { t, language } = useTranslation();
  if (card.type === "proposal") {
    const p = card.proposal;
    return (
      <article className="space-y-2 rounded-2xl bg-surface p-3.5" data-board-proposal={p.itemId}>
        <span className="block text-caption font-bold uppercase tracking-[0.06em] text-text-muted">
          {t("tc.appr.proposal")} · {p.fileTitle ?? p.projectTitle}
        </span>
        <Link href={p.fileId ? projectLink(teamId, p.projectId, { file: p.fileId, item: p.itemId }) : projectLink(teamId, p.projectId, { board: p.spaceId, item: p.itemId })} className="block text-body font-bold text-text hover:text-primary">
          {p.proposedTitle || p.currentTitle || t(kindKey(p.kind))}
        </Link>
        <p className="text-small text-text-secondary">{t("tp.review.proposedBy", { name: p.proposerName ?? "" })}</p>
        {p.proposedBody && <p className="line-clamp-3 whitespace-pre-wrap break-words rounded-lg bg-surface-soft p-2.5 font-mono text-caption text-text">{p.proposedBody}</p>}
        <Actions busy={busy} onApprove={onApprove} onChanges={onChanges} />
      </article>
    );
  }
  const item = card.item;
  const when = item.decidedAt ?? item.submittedAt;
  return (
    <article className="space-y-2 rounded-2xl bg-surface p-3.5" data-board-card={item.id} data-board-state={item.state}>
      <span className="block text-caption font-bold uppercase tracking-[0.06em] text-text-muted">
        {item.unitCount > 1 ? t("tc.appr.package", { count: item.unitCount }) : t(kindKey(item.kind))} · {item.fileTitle ?? t("tp.area.projectWide")}
      </span>
      <Link href={boardItemHref(teamId, item)} className="block text-body font-bold text-text hover:text-primary" data-board-open>
        {item.title || t(kindKey(item.kind))}
      </Link>
      <p className="text-small text-text-secondary">
        {[state === "approved" ? t("tc.appr.approvedAt") : item.authorName, when ? formatRelativeTime(when, language) : null].filter(Boolean).join(" · ")}
      </p>
      {item.unitCount > 1 && <p className="text-caption text-text-muted">{t("tp.review.packageHint", { count: item.unitCount })}</p>}
      <Preview item={item} />
      {state === "changes" && item.note && <p className="rounded-lg bg-danger/10 px-2.5 py-2 text-small text-danger">{t("tc.appr.leadNote", { note: item.note })}</p>}
      {state === "changes" && <p className="text-caption font-bold text-danger">{item.mine ? t("tc.appr.fixIt") : t("tc.appr.waitingAuthor", { name: item.authorName ?? "" })}</p>}
      {state === "pending" && item.canDecide && <Actions busy={busy} onApprove={onApprove} onChanges={onChanges} />}
      {state === "pending" && !item.canDecide && <p className="text-caption text-text-muted">{t("tc.appr.leadOnly")}</p>}
    </article>
  );
}

function Preview({ item }: { item: BoardItem }) {
  if (item.kind === "image" && item.mediaUrl) return <StorageImg src={item.mediaUrl} alt={item.title} className="h-24 w-full rounded-lg object-cover" />;
  if (item.body) return <p className="line-clamp-3 whitespace-pre-wrap break-words rounded-lg bg-surface-soft p-2.5 font-mono text-caption text-text">{item.body}</p>;
  return null;
}

function Actions({ busy, onApprove, onChanges }: { busy: boolean; onApprove: () => void; onChanges: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 pt-1">
      <Button type="button" variant="outline" size="sm" className="h-11 flex-1 md:h-9" disabled={busy} onClick={onChanges} data-board-changes>
        {t("tp.review.requestChanges")}
      </Button>
      <Button type="button" size="sm" className="h-11 flex-1 bg-success hover:bg-success/90 md:h-9" disabled={busy} onClick={onApprove} data-board-approve>
        {t("tp.review.approve")}
      </Button>
    </div>
  );
}

/** "Değişiklik iste": not ZORUNLUDUR (sunucu da ister). */
function ChangesDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <SpaceDialog
      title={t("tp.review.requestChanges")}
      onClose={onClose}
      busy={busy}
      formTestId="board-changes-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!note.trim()) {
          setError(t("tp.review.noteRequired"));
          return;
        }
        onSubmit(note.trim());
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("tp.review.send")}
          </Button>
        </>
      }
    >
      <label className="block text-small font-bold text-text" htmlFor="board-changes-note">
        {t("tp.review.noteLabel")}
      </label>
      <textarea id="board-changes-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={4} placeholder={t("tp.review.notePlaceholder")} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-small" />
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
    </SpaceDialog>
  );
}
