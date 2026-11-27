"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { Check } from "@/components/icons/check";
import { ListChecks } from "@/components/icons/list-checks";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { useToast } from "@/features/groups/use-toast";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { BoardItem, BoardProposal } from "@/lib/supabase/team-center";
import { decideProposal, decideReview } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { APPROVAL_SEGMENTS, approvalRows, boardItemHref, findApprovalRow, type ApprovalRow, type ApprovalSegment } from "@/lib/team-center";
import { projectLink } from "@/lib/team-projects";
import { teamLink } from "@/lib/teams";
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

const STATE_LABEL: Record<BoardItem["state"], TranslationKey> = {
  pending: "tc.appr.state.pending",
  changes: "tc.appr.state.changes",
  approved: "tc.appr.state.approved",
};
const SEGMENT_LABEL: Record<ApprovalSegment, TranslationKey> = { inbox: "tc.appr.seg.inbox", sent: "tc.appr.seg.sent", decided: "tc.appr.seg.decided" };

/** Prompt metnindeki `{değişken}` adları (tekrarsız, görünme sırasıyla). */
const variablesOf = (text: string): string[] => [...new Set([...text.matchAll(/\{([^{}\s]{1,40})\}/g)].map((match) => match[1]))];

/**
 * Onaylar (`tab=approvals`; docs/history/366-*, 475-*): ekibin onay kuyruğu, «liste + ayrıntı» düzeninde. Solda üç bölümlü liste (Bana bekleyen ·
 * Gönderdiklerim · Karar verilen), sağda seçilen öğenin ayrıntısı ve karar düğmeleri. Tablette liste 300 px, masaüstünde 420 px; TELEFONDA yalnız
 * liste açılır, satıra dokununca ayrıntı tam ekran sayfa olur (`&decision=<satır>`, Geri listeye döner) ve karar düğmeleri altta sabit durur.
 * Lider kendi projelerinin her şeyini görür ve karar verir; diğerleri yalnız KENDİ öğelerinin durumunu görür. Karar sunucudadır
 * (`team_review_decide` / `team_review_decide_proposal`): burada yalnız çağrılır, başarısız olursa hata yazılır.
 */
export function TeamApprovalsSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, board, reloadBoard } = ctx;
  const router = useRouter();
  const params = useSearchParams();
  const phone = useMediaQuery("(max-width: 767.98px)");
  const [segment, setSegment] = useState<ApprovalSegment>("inbox");
  const [noteState, setNoteState] = useState<{ key: string; text: string }>({ key: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { node: toastNode, show } = useToast();

  const items = board?.items;
  const proposals = board?.proposals;
  const rows = useMemo(() => approvalRows(items ?? [], proposals ?? [], segment), [items, proposals, segment]);
  const requestedKey = params.get("decision");
  const requested = useMemo(() => findApprovalRow(items ?? [], proposals ?? [], requestedKey), [items, proposals, requestedKey]);
  // Masaüstü/tablette her zaman bir satır seçilidir (adresteki ya da bölümün ilki); telefonda yalnız adreste istenen açılır.
  const selected: ApprovalRow | null = phone ? requested : (requested ?? rows[0] ?? null);
  const noteText = selected && noteState.key === selected.key ? noteState.text : "";
  const decidable = rows.filter((row) => row.type === "item" && row.item.state === "pending" && row.item.canDecide);

  const listHref = teamLink(team.id, "approvals");
  const rowHref = (row: ApprovalRow) => teamLink(team.id, "approvals", { decision: row.key });
  const open = (row: ApprovalRow) => {
    setError(null);
    if (phone) router.push(rowHref(row));
    else router.replace(rowHref(row), { scroll: false });
  };

  if (!board) {
    return (
      <section data-testid="team-approvals" className="space-y-3">
        {ctx.boardFailed ? <SectionError message={t("tp.error.load")} onRetry={reloadBoard} /> : <Skeleton className="h-64 w-full rounded-lg" />}
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
  const afterDecision = (done: boolean) => {
    if (!done) return;
    setNoteState({ key: "", text: "" });
    if (phone) router.replace(listHref, { scroll: false });
  };
  const approve = async (row: ApprovalRow) =>
    afterDecision(await run(() => (row.type === "item" ? decideReview([row.item.id], "approve", "") : decideProposal(row.proposal.itemId, "approve", "")), "tp.review.approvedToast"));
  const requestChanges = async (row: ApprovalRow) => {
    if (!noteText.trim()) {
      setError(t("tp.review.noteRequired"));
      return;
    }
    afterDecision(
      await run(() => (row.type === "item" ? decideReview([row.item.id], "changes", noteText.trim()) : decideProposal(row.proposal.itemId, "changes", noteText.trim())), "tp.review.changesToast"),
    );
  };
  const empty = board.items.length === 0 && board.proposals.length === 0;

  const detail = selected && (
    <ApprovalDetail
      key={selected.key}
      teamId={team.id}
      row={selected}
      busy={busy}
      error={error}
      note={noteText}
      onNote={(text) => setNoteState({ key: selected.key, text })}
      onApprove={() => void approve(selected)}
      onChanges={() => void requestChanges(selected)}
      phone={phone}
    />
  );

  // Telefonda açık bir satır: bant/sekmeler gizlidir (team-page), ayrıntı tam ekran sayfadır; geri listeye döner.
  if (phone && selected) {
    return (
      <section data-testid="team-approvals" data-board-layout="detail" className="-mx-3">
        <div className="flex h-14 items-center gap-1 border-b border-border-soft bg-surface px-2">
          <Link href={listHref} aria-label={t("common.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-sm text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" data-phone-back="">
            <ArrowLeft size={20} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-small font-semibold text-text">{rowTitle(selected, t)}</span>
            <span className="block truncate text-caption text-text-secondary">{team.name} › {t("tc.tab.approvals")}</span>
          </div>
        </div>
        <div className="px-3 pb-44 pt-4">{detail}</div>
        {toastNode}
      </section>
    );
  }

  const list = (
    <div className="flex min-w-0 flex-col" data-board-list="">
      <div className="space-y-2 px-3 py-3 md:px-4">
        <div role="group" aria-label={t("tc.appr.statusAria")} className="flex rounded-sm bg-surface-soft p-1 text-label font-semibold">
          {APPROVAL_SEGMENTS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSegment(key)}
              aria-pressed={segment === key}
              data-board-segment={key}
              className={cn("h-9 flex-1 truncate rounded-sm px-2", segment === key ? "bg-surface text-text shadow-xs" : "text-text-muted hover:text-text")}
            >
              {t(SEGMENT_LABEL[key])}
            </button>
          ))}
        </div>
        {decidable.length > 1 && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} data-board-approve-all onClick={() => void run(() => decideReview(decidable.flatMap((row) => (row.type === "item" ? [row.item.id] : [])), "approve"), "tp.review.approvedToast")}>
            <Check size={16} aria-hidden />
            {t("tp.review.approveAll", { count: decidable.length })}
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-small text-text-muted" data-board-column={segment}>
          {t("tc.appr.columnEmpty")}
        </p>
      ) : (
        <ul aria-label={t("tc.appr.listAria")} data-board-column={segment}>
          {rows.map((row) => (
            <li key={row.key}>
              <ApprovalListRow row={row} selected={selected?.key === row.key} onOpen={() => open(row)} />
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 py-3 text-caption text-text-muted">{t("tc.appr.leadsSeeAll")}</p>
    </div>
  );

  return (
    <section className="space-y-3" data-testid="team-approvals">
      {empty ? (
        <EmptyState scene="inbox" icon={ListChecks} title={t("tc.appr.empty")} description={t("tc.appr.emptyBody")} />
      ) : phone ? (
        <div data-board-layout="list">{list}</div>
      ) : (
        <div className="grid border-t border-border-soft md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]" data-board-layout="split">
          <div className="min-w-0 border-border-soft md:border-r md:max-h-[calc(100dvh-16rem)] md:overflow-y-auto">{list}</div>
          <div className="min-w-0 px-4 py-5 md:px-6 xl:px-9 xl:py-6">{detail ?? <p className="py-8 text-center text-small text-text-muted">{t("tc.appr.columnEmpty")}</p>}</div>
        </div>
      )}
      {toastNode}
    </section>
  );
}

function rowTitle(row: ApprovalRow, t: (key: TranslationKey) => string): string {
  if (row.type === "proposal") return row.proposal.proposedTitle || row.proposal.currentTitle || t(kindKey(row.proposal.kind));
  return row.item.title || t(kindKey(row.item.kind));
}

function rowWhere(row: ApprovalRow, t: (key: TranslationKey) => string): string {
  if (row.type === "proposal") return [row.proposal.proposerName, row.proposal.fileTitle ? `${row.proposal.projectTitle} › ${row.proposal.fileTitle}` : row.proposal.projectTitle].filter(Boolean).join(" · ");
  const place = row.item.fileTitle ? `${row.item.projectTitle} › ${row.item.fileTitle}` : `${row.item.projectTitle} › ${t("tp.area.projectWide")}`;
  return [row.item.authorName, place].filter(Boolean).join(" · ");
}

function ApprovalListRow({ row, selected, onOpen }: { row: ApprovalRow; selected: boolean; onOpen: () => void }) {
  const { t, language } = useTranslation();
  const isProposal = row.type === "proposal";
  const state = row.type === "item" ? row.item.state : "pending";
  const waiting = state === "pending" && (isProposal || row.item.canDecide);
  const when = row.type === "item" ? (row.item.decidedAt ?? row.item.submittedAt) : row.proposal.proposedAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      data-board-card={row.type === "item" ? row.item.id : undefined}
      data-board-proposal={row.type === "proposal" ? row.proposal.itemId : undefined}
      data-board-state={state}
      className={cn(
        "flex w-full min-w-0 flex-col gap-0.5 border-b border-border-soft px-4 py-3 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
        selected && "bg-surface-soft",
      )}
    >
      <span className="flex items-center gap-2 text-caption font-semibold text-text-muted">
        {waiting && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
        <span className="truncate">{isProposal ? t("tc.appr.proposal") : t(STATE_LABEL[state])}</span>
        {when && <span className="ml-auto shrink-0 font-normal">{formatRelativeTime(when, language)}</span>}
      </span>
      <span className="truncate text-body font-semibold text-text">{rowTitle(row, t)}</span>
      <span className="truncate text-small text-text-muted">{rowWhere(row, t)}</span>
    </button>
  );
}

/** Seçilen satırın ayrıntısı: durum etiketi, başlık, yazar/yer, içerik, karar notu + düğmeler, geçmiş. */
function ApprovalDetail({
  teamId,
  row,
  busy,
  error,
  note,
  onNote,
  onApprove,
  onChanges,
  phone,
}: {
  teamId: string;
  row: ApprovalRow;
  busy: boolean;
  error: string | null;
  note: string;
  onNote: (text: string) => void;
  onApprove: () => void;
  onChanges: () => void;
  phone: boolean;
}) {
  const { t, language } = useTranslation();
  const isProposal = row.type === "proposal";
  const item: BoardItem | null = row.type === "item" ? row.item : null;
  const proposal: BoardProposal | null = row.type === "proposal" ? row.proposal : null;
  const state = item?.state ?? "pending";
  const canDecide = isProposal || Boolean(item?.canDecide && item.state === "pending");
  const body = proposal ? proposal.proposedBody : (item?.body ?? "");
  const when = item ? (item.decidedAt ?? item.submittedAt) : proposal?.proposedAt ?? null;
  const author = item?.authorName ?? proposal?.proposerName ?? "";
  const href = item
    ? boardItemHref(teamId, item)
    : proposal && (proposal.fileId ? projectLink(teamId, proposal.projectId, { file: proposal.fileId, item: proposal.itemId }) : projectLink(teamId, proposal.projectId, { board: proposal.spaceId, item: proposal.itemId }));
  const noteId = "board-decision-note";
  const kind = item?.kind ?? proposal?.kind ?? "content";
  const variables = kind === "prompt" ? variablesOf(body) : [];
  const history: string[] = [];
  if (proposal) history.push(t("tc.appr.history.proposed", { name: author, time: formatRelativeTime(proposal.proposedAt, language) }));
  if (item?.submittedAt) history.push(t("tc.appr.history.submitted", { name: author, time: formatRelativeTime(item.submittedAt, language) }));
  if (item?.decidedAt && item.state === "approved") history.push(t("tc.appr.history.approved", { time: formatRelativeTime(item.decidedAt, language) }));
  if (item?.decidedAt && item.state === "changes") history.push(t("tc.appr.history.changes", { time: formatRelativeTime(item.decidedAt, language) }));

  const actions = canDecide ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size={phone ? "lg" : "md"} className={cn("xl:h-12 xl:px-6", phone && "order-2 flex-1")} disabled={busy} onClick={onApprove} data-board-approve>
        {t("tp.review.approve")}
      </Button>
      <Button type="button" variant="outline" size={phone ? "lg" : "md"} className={cn("xl:h-12 xl:px-6", phone && "order-1 flex-1")} disabled={busy} onClick={onChanges} data-board-changes>
        {t("tp.review.requestChanges")}
      </Button>
      {href && !phone && (
        <Link href={href} className={buttonClassName({ variant: "ghost", className: "xl:h-12 xl:px-6" })} data-board-open="">
          {t("tc.appr.openItem")}
        </Link>
      )}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-3">
      {state === "pending" && <p className="text-caption text-text-muted">{t("tc.appr.leadOnly")}</p>}
      {state === "changes" && item && <p className="text-caption font-semibold text-danger">{item.mine ? t("tc.appr.fixIt") : t("tc.appr.waitingAuthor", { name: item.authorName ?? "" })}</p>}
      {href && (
        <Link href={href} className={buttonClassName({ variant: "outline" })} data-board-open="">
          {t("tc.appr.openItem")}
        </Link>
      )}
    </div>
  );

  return (
    <article className="space-y-5" data-board-detail={row.key}>
      <header className="space-y-2">
        <span className={cn("inline-flex items-center rounded-xs px-2 py-0.5 text-caption font-semibold", state === "approved" ? "bg-success-soft text-success" : state === "changes" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-text")}>
          {isProposal ? t("tc.appr.proposal") : t(STATE_LABEL[state])}
        </span>
        <h2 className="break-words font-display text-h2 font-bold text-text xl:text-h1">{rowTitle(row, t)}</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
          <Avatar src={null} alt={author} size={24} className="rounded-full" />
          <span>
            {[author, rowWhere(row, t).split(" · ").slice(1).join(" · "), when ? formatRelativeTime(when, language) : null, t(kindKey(kind))].filter(Boolean).join(" · ")}
          </span>
        </p>
        {item && item.unitCount > 1 && <p className="text-caption text-text-muted">{t("tc.appr.packageNote", { count: item.unitCount })}</p>}
      </header>

      <Content item={item} proposal={proposal} body={body} />
      {variables.length > 0 && (
        <div className="flex flex-wrap gap-2" data-board-variables="">
          {variables.map((name) => (
            <span key={name} className="inline-flex h-8 items-center rounded-sm bg-surface-soft px-3 text-label font-semibold text-text">{`{${name}}`}</span>
          ))}
        </div>
      )}
      {item?.state === "changes" && item.note && <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-small text-danger">{t("tc.appr.leadNote", { note: item.note })}</p>}
      {proposal?.note && <p className="rounded-lg bg-surface-soft px-3 py-2.5 text-small text-text-secondary">{proposal.note}</p>}

      {canDecide && (
        <div className="space-y-2">
          <label htmlFor={noteId} className="sr-only">
            {t("tp.review.noteLabel")}
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => onNote(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t("tc.appr.notePlaceholder")}
            className="w-full rounded-sm border border-[var(--p-control-border,var(--color-border-strong))] bg-surface px-3 py-3 text-body text-text shadow-xs placeholder:text-text-muted focus:border-focus focus:outline-none focus:shadow-focus"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}

      {phone ? (
        // Telefon: karar düğmeleri alt menünün üstünde sabit durur; klavye açılınca gizlenir (data-keyboard-hide).
        <div data-keyboard-hide="" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-border-soft bg-surface px-3 py-2.5">
          {actions}
        </div>
      ) : (
        actions
      )}

      {history.length > 0 && (
        <section className="space-y-1.5 border-t border-border-soft pt-4" aria-label={t("tc.appr.history")}>
          <h3 className="text-label font-semibold text-text-muted">{t("tc.appr.history")}</h3>
          <ul className="space-y-1 text-small text-text">
            {history.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** Öğenin içeriği: görsel büyük, prompt koyu mono blokta (`{değişken}`ler vurgulu), diğerleri sade metin. */
function Content({ item, proposal, body }: { item: BoardItem | null; proposal: BoardProposal | null; body: string }): ReactNode {
  const { t } = useTranslation();
  if (item?.kind === "image" && item.mediaUrl) return <StorageImg src={item.mediaUrl} alt={item.title} className="max-h-[28rem] w-full rounded-lg object-cover" />;
  if (!body) return null;
  const kind = item?.kind ?? proposal?.kind;
  if (kind === "prompt") {
    const parts = body.split(/(\{[^{}\s]{1,40}\})/g);
    return (
      <div className="whitespace-pre-wrap break-words rounded-lg bg-text p-4 text-background prompt-text" data-board-body="">
        {proposal && <span className="mb-2 block font-sans text-caption font-semibold opacity-80">{t("tc.appr.proposalFrom")}</span>}
        {parts.map((part, index) => (
          <Fragment key={index}>{/^\{[^{}\s]{1,40}\}$/.test(part) ? <span className="font-semibold text-primary">{part}</span> : part}</Fragment>
        ))}
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap break-words rounded-lg bg-surface-soft p-4 text-small text-text" data-board-body="">
      {proposal && <span className="mb-2 block text-caption font-semibold text-text-muted">{t("tc.appr.proposalFrom")}</span>}
      {body}
    </div>
  );
}
