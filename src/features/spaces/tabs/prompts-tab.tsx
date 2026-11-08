"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CircleCheck } from "@/components/icons/circle-check";
import { Pencil } from "@/components/icons/pencil";
import { History } from "@/components/icons/history";
import { Plus } from "@/components/icons/plus";
import { UserCheck } from "@/components/icons/user-check";
import { Search } from "@/components/icons/search";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Button } from "@/components/ui/button";
import { SectionMenu } from "@/features/content/section-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatRelativeTime } from "@/lib/utils";
import { extractVariableTokenNames } from "@/lib/prompt-variables";
import { approvalStateOf, reviewActionOf, reviewStateOf } from "@/lib/space-library";
import { matchesQuery } from "@/lib/spaces";
import type { SpaceItem } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { CopyTextButton, DraftEditorModal, ItemDetailModal, resolveSource, sourceReasonKey, usePlaceNewItems, useItemTitle } from "../space-items";
import { SpaceImage } from "../space-visuals";
import { ApprovalBadge, FillAndCopyModal, ItemVersionsModal, LibraryVariablesPanel, ReviewBadge, useLibraryVariables } from "../library-parts";

type Source = "all" | "post" | "draft" | "image";
type Sort = "newest" | "oldest" | "title";
type Approval = "all" | "approved" | "pending" | "requested";

const APPROVAL_LABEL: Record<Approval, TranslationKey> = {
  all: "spaces.library.statusAll",
  approved: "spaces.library.statusApproved",
  pending: "spaces.library.statusPending",
  requested: "spaces.library.statusRequested",
};

const SOURCE_LABEL: Record<Source, TranslationKey> = {
  all: "spaces.prompts.sourceAll",
  post: "spaces.prompts.sourcePost",
  draft: "spaces.prompts.sourceDraft",
  image: "spaces.prompts.sourceImage",
};

interface Row {
  item: SpaceItem;
  source: Exclude<Source, "all">;
}

/**
 * Promptlar (docs/history/213-*): Space'e bağlanan Promptly promptları, kullanıcının kendi taslakları ve eklenen görsellerin kaynak
 * promptları tek listede; kaynağa göre süzülür, başlığa/tarihe göre sıralanır. Özgün gönderi ile taslak AYRIDIR: taslak düzenlemek
 * gönderiyi değiştirmez ("Taslağa kopyala" bağımsız bir kopya açar, kaynağı yalnız gösterir).
 */
export function PromptsTab({ onShowOnBoard }: { onShowOnBoard: (id: string) => void }) {
  const { t, language } = useTranslation();
  const { space, items, sources, readable, caps, addItems, approveItem, requestReview, restoreVersion } = useSpaceContext();
  const isLibrary = space.kind === "team_library";
  const library = useLibraryVariables(space.id, isLibrary && caps.member);
  const itemTitle = useItemTitle();
  const place = usePlaceNewItems();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [approval, setApproval] = useState<Approval>("all");
  const [filling, setFilling] = useState<{ title: string; text: string } | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [versionsOf, setVersionsOf] = useState<SpaceItem | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SpaceItem | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (item.kind === "prompt") {
        out.push({ item, source: item.isDraft ? "draft" : "post" });
        if (item.promptId) seen.add(item.promptId);
      }
    }
    for (const item of items) {
      if (item.kind === "image" && item.promptId && !seen.has(item.promptId) && sources.prompts.get(item.promptId)?.promptText) {
        seen.add(item.promptId);
        out.push({ item, source: "image" });
      }
    }
    return out;
  }, [items, sources]);

  const visible = rows
    .filter((row) => source === "all" || row.source === source)
    .filter((row) => {
      if (approval === "all") return true;
      if (approval === "requested") return reviewStateOf(row.item) === "requested";
      return approvalStateOf(row.item) === (approval === "approved" ? "approved" : "pending");
    })
    .filter((row) => {
      const resolved = resolveSource(row.item, sources, readable);
      return matchesQuery(query, row.item.title, row.item.body, row.item.note, resolved.prompt?.title, resolved.prompt?.promptText);
    })
    .sort((a, b) => {
      if (sort === "title") return itemTitle(a.item).localeCompare(itemTitle(b.item), language);
      return sort === "oldest" ? a.item.createdAt.localeCompare(b.item.createdAt) : b.item.createdAt.localeCompare(a.item.createdAt);
    });

  async function copyAsDraft(item: SpaceItem) {
    const prompt = item.promptId ? sources.prompts.get(item.promptId) : null;
    if (!prompt) return;
    setError(null);
    try {
      await addItems(place([{ spaceId: space.id, kind: "prompt", isDraft: true, sourcePromptId: prompt.id, title: prompt.title, body: prompt.promptText }]));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  async function toggleApproval(item: SpaceItem) {
    setError(null);
    setApproving(item.id);
    try {
      await approveItem(item.id, !item.approvedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setApproving(null);
    }
  }

  async function toggleReview(item: SpaceItem, withdraw: boolean) {
    setError(null);
    setReviewing(item.id);
    try {
      await requestReview(item.id, withdraw);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="space-prompts">
      {isLibrary && caps.member && <LibraryVariablesPanel library={library} canEdit={caps.edit} />}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("spaces.prompts.search")}
            aria-label={t("spaces.prompts.search")}
            className="h-11 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-small text-text placeholder:text-text-muted"
          />
        </div>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label={t("spaces.sort.label")} className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-small font-medium text-text sm:flex-none">
            <option value="newest">{t("profile.sortNewest")}</option>
            <option value="oldest">{t("profile.sortOldest")}</option>
            <option value="title">{t("spaces.sort.title")}</option>
          </select>
          {caps.edit && (
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} aria-hidden />
              {t("spaces.prompts.newDraft")}
            </Button>
          )}
        </div>
      </div>
      {/* docs/history/236-*: dört kaynak süzgeci tek menüde. */}
      <div className="flex items-center">
        <SectionMenu
          items={(Object.keys(SOURCE_LABEL) as Source[]).map((key) => ({ key, label: t(SOURCE_LABEL[key]) }))}
          active={source}
          onChange={setSource}
          ariaLabel={t("spaces.prompts.sourceFilter")}
          title={t("spaces.prompts.sourceFilter")}
        />
        {isLibrary && (
          <SectionMenu
            items={(Object.keys(APPROVAL_LABEL) as Approval[]).map((key) => ({ key, label: t(APPROVAL_LABEL[key]) }))}
            active={approval}
            onChange={setApproval}
            ariaLabel={t("spaces.library.statusFilter")}
            title={t("spaces.library.statusFilter")}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={SquareTerminal}
          title={t("spaces.prompts.empty")}
          description={caps.edit ? t("spaces.prompts.emptyEditor") : undefined}
          action={caps.edit ? { label: t("spaces.prompts.newDraft"), onClick: () => setEditing("new") } : undefined}
        />
      ) : visible.length === 0 ? (
        approval === "approved" ? (
          <EmptyState icon={CircleCheck} title={t("spaces.library.emptyApproved")} description={t("spaces.library.emptyApprovedHelp")} compact />
        ) : approval === "requested" ? (
          <EmptyState icon={UserCheck} title={t("spaces.library.emptyRequested")} compact />
        ) : (
          <EmptyState icon={Search} title={t("spaces.home.noResults")} compact />
        )
      ) : (
        <ul className="space-y-3">
          {visible.map(({ item, source: rowSource }) => {
            const resolved = resolveSource(item, sources, readable);
            const reason = rowSource === "draft" ? null : sourceReasonKey(resolved.state);
            const text = rowSource === "draft" ? item.body : (resolved.prompt?.promptText ?? "");
            const approvalState = isLibrary ? approvalStateOf(item) : "none";
            const hasVariables = isLibrary && Boolean(text) && !reason && extractVariableTokenNames(text).length > 0;
            return (
              <li key={`${rowSource}-${item.id}`} data-prompt-row={rowSource} className="rounded-lg border border-border-soft bg-surface p-3.5 shadow-xs">
                <div className="flex items-start gap-3">
                  {rowSource === "image" && <SpaceImage url={item.mediaUrl} alt="" available={!reason} className="h-14 w-14 shrink-0 rounded-md" />}
                  <div className="min-w-0 flex-1 space-y-1">
                    <button type="button" onClick={() => setOpenId(item.id)} className="block max-w-full truncate text-left text-body font-semibold text-text hover:text-primary">
                      {rowSource === "image" ? (resolved.prompt?.title ?? itemTitle(item)) : itemTitle(item)}
                    </button>
                    <p className="text-caption text-text-muted">
                      {t(SOURCE_LABEL[rowSource])}
                      {resolved.prompt && rowSource !== "draft" && <> · {resolved.prompt.author.displayName}</>}
                      {" · "}
                      {formatRelativeTime(item.createdAt, language)}
                    </p>
                    {approvalState !== "none" && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <ApprovalBadge state={approvalState} approvedAt={item.approvedAt} />
                        {reviewStateOf(item) === "requested" && <ReviewBadge />}
                      </span>
                    )}
                  </div>
                </div>
                {reason ? (
                  <p className="mt-2 rounded-md bg-surface-soft px-3 py-2 text-small text-text-muted">{t(reason)}</p>
                ) : (
                  text && <pre className="prompt-text mt-2 line-clamp-3 whitespace-pre-wrap break-words rounded-md bg-surface-soft p-3 text-small text-text">{text}</pre>
                )}
                {item.note && <p className="mt-2 break-words text-caption text-text-secondary">{item.note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {text && !reason && <CopyTextButton text={text} />}
                  {hasVariables && (
                    <Button variant="outline" size="sm" onClick={() => setFilling({ title: itemTitle(item), text })}>
                      {t("spaces.library.fillCopy")}
                    </Button>
                  )}
                  {isLibrary && rowSource === "draft" && reviewActionOf(item, caps) !== null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={reviewing === item.id}
                      onClick={() => void toggleReview(item, reviewActionOf(item, caps) === "withdraw")}
                      title={reviewActionOf(item, caps) === "request" ? t("spaces.library.requestReviewHint") : undefined}
                      data-review-action={reviewActionOf(item, caps)}
                    >
                      <UserCheck size={14} aria-hidden />
                      {reviewActionOf(item, caps) === "request" ? t("spaces.library.requestReview") : t("spaces.library.withdrawReview")}
                    </Button>
                  )}
                  {isLibrary && rowSource === "draft" && caps.member && (
                    <Button variant="ghost" size="sm" onClick={() => setVersionsOf(item)} data-item-versions>
                      <History size={14} aria-hidden />
                      {t("spaces.library.versions")}
                    </Button>
                  )}
                  {caps.approve && approvalState !== "none" && (
                    <Button variant="ghost" size="sm" disabled={approving === item.id} onClick={() => void toggleApproval(item)} title={t("spaces.library.approvalHint")}>
                      <CircleCheck size={14} aria-hidden />
                      {item.approvedAt ? t("spaces.library.unapprove") : t("spaces.library.approve")}
                    </Button>
                  )}
                  {resolved.href && rowSource !== "draft" && (
                    <Link href={resolved.href} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-label font-semibold text-text-secondary hover:bg-surface-soft hover:text-text">
                      <ArrowUpRight size={14} aria-hidden />
                      {t("spaces.source.open")}
                    </Link>
                  )}
                  {caps.edit && rowSource === "draft" && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                      <Pencil size={14} aria-hidden />
                      {t("spaces.prompts.editDraft")}
                    </Button>
                  )}
                  {caps.edit && rowSource !== "draft" && resolved.prompt && (
                    <Button variant="ghost" size="sm" onClick={() => void copyAsDraft(item)}>
                      <Pencil size={14} aria-hidden />
                      {t("spaces.prompts.copyAsDraft")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openId && <ItemDetailModal itemId={openId} onClose={() => setOpenId(null)} onShowOnBoard={onShowOnBoard} />}
      {filling && <FillAndCopyModal title={filling.title} text={filling.text} shared={library.shared} onClose={() => setFilling(null)} />}
      {versionsOf && (
        <ItemVersionsModal
          itemId={versionsOf.id}
          itemTitle={itemTitle(versionsOf)}
          canRestore={caps.edit && !versionsOf.locked}
          onRestore={(version) => restoreVersion(versionsOf.id, version)}
          onClose={() => setVersionsOf(null)}
        />
      )}
      {editing && <DraftEditorModal draft={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
