"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive } from "@/components/icons/archive";
import { Inbox } from "@/components/icons/inbox";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import { Star } from "@/components/icons/star";
import { Briefcase } from "@/components/icons/briefcase";
import { Users } from "@/components/icons/users";
import { ConversationList } from "./conversation-list";
import { ConversationsMoreMenu, SelectionActionBar, SelectionHeader, useSelectionChrome } from "./conversation-selection";
import { NewChatModal } from "./new-chat-modal";
import { useRealMessages } from "./real-messages-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Portal } from "@/components/ui/portal";
import { useToast } from "@/features/groups/use-toast";
import { bucketConversations, filterConversationsByQuery, rollUpTeamChannels } from "@/lib/conversation-lists";
import { TeamChannelsInbox } from "@/features/teams/team-channels-inbox";
import { listMyTeams } from "@/lib/supabase/teams";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, messageHref } from "@/lib/utils";
import { Eyebrow } from "@/features/content/detail-parts";
import { ListControlRow, SadeTitle } from "@/features/content/list-control-row";
import { CONTROL_ICON_BUTTON, type SectionMenuItem } from "@/features/content/section-menu";
import type { Conversation } from "@/types";

type KindFilter = "all" | "personal" | "community" | "team";

/** Sohbet türü çipleri (docs/history/352-*): Tümü · Kişisel · Topluluk · Ekip (ekip kanalları AYNI konuşmadır, docs/history/353-*; ekip sayfasının Sohbet sekmesi de aynısını açar). */
function kindOf(conversation: Conversation): Exclude<KindFilter, "all"> {
  if (conversation.kind !== "group" || !conversation.group) return "personal";
  return conversation.group.team ? "team" : "community";
}

type MessagesView = "inbox" | "requests" | "archived" | "starred" | "communities" | "teams";

/**
 * The conversation list (message requests + chats) with its own search box.
 * One component, two placements: full-page on phones (`/messages`) and the
 * fixed left pane beside the open chat on tablet/desktop (`embedded`) —
 * same data (`useRealMessages`), same rows, no second messaging list.
 */
export function ConversationsPane({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { conversations, startConversationWith, unarchiveConversation, archiveConversation, pinConversation, deleteConversation, markConversationRead } = useRealMessages();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MessagesView>("inbox");
  // Ekip kanallarında okunmamış toplamı (docs/history/353-*): "Ekip sohbetleri" satırında sayaç.
  const [teamUnread, setTeamUnread] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void listMyTeams(0).then(
      (page) => !cancelled && setTeamUnread(page.items.reduce((sum, team) => sum + team.unreadCount, 0)),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  // Seçim modu (WhatsApp tarzı): seçili sohbetlere toplu Arşivle / Okundu / Sil — her biri tek tek sunucuya yazılır, yerel durum yalnız onaydan sonra değişir.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { node: toastNode, show: showToast } = useToast();

  const sharePromptId = searchParams.get("sharePromptId");
  const shareRequestId = searchParams.get("shareRequestId");
  // Workflow / preset ride the same conversation-picker via a client-side query param (no embed column), as plain text.
  const shareWorkflowId = searchParams.get("shareWorkflowId");
  const sharePresetId = searchParams.get("sharePresetId");
  // Topluluk başvuru gönderisi de aynı yolla (düz metin bloğu) taşınır.
  const sharePostId = searchParams.get("sharePostId");
  const isSharing = Boolean(sharePromptId || shareRequestId || shareWorkflowId || sharePresetId || sharePostId);
  const shareQuery = sharePromptId
    ? `sharePromptId=${sharePromptId}`
    : shareRequestId
      ? `shareRequestId=${shareRequestId}`
      : shareWorkflowId
        ? `shareWorkflowId=${shareWorkflowId}`
        : sharePresetId
          ? `sharePresetId=${sharePresetId}`
          : sharePostId
            ? `sharePostId=${sharePostId}`
            : undefined;

  const activeId = pathname.startsWith("/messages/local") ? searchParams.get("id") : null;

  // Archive / "deleted from my list" are per-viewer state: every list below derives from the viewer's own rows.
  const buckets = useMemo(() => bucketConversations(conversations), [conversations]);
  const matches = (list: Conversation[]) => filterConversationsByQuery(list, query);

  const byKind = (list: Conversation[]) => (kindFilter === "all" ? list : list.filter((c) => kindOf(c) === kindFilter));
  // Bir ekibin kanalları listede TEK satırdır (Yön A, docs/history/353-*): aramada eşleşen kanallardan toplanır, açılan satır temsilci kanaldır.
  const accepted = byKind(rollUpTeamChannels(matches(buckets.inbox)));
  const activeTeamId = activeId ? (conversations.find((c) => c.id === activeId)?.group?.team?.id ?? null) : null;
  const teamChannelIds = (teamId: string) => buckets.inbox.filter((c) => c.group?.team?.id === teamId).map((c) => c.id);
  const kindCount = accepted.length;
  const kindUnread = accepted.reduce((sum, c) => sum + (c.unreadCount > 0 && !c.mutedAt ? c.unreadCount : 0), 0);
  const pending = matches(buckets.requests);
  const archived = matches(buckets.archived);
  const searching = query.trim() !== "";
  const inArchive = view === "archived";
  const inRequests = view === "requests";
  const noMatches = searching && (inArchive ? archived.length === 0 : inRequests ? pending.length === 0 : accepted.length === 0 && pending.length === 0);
  const kindEmpty = !searching && view === "inbox" && kindFilter !== "all" && accepted.length === 0 && buckets.inbox.length > 0;
  const nothingAtAll = !searching && view === "inbox" && buckets.inbox.length === 0 && buckets.requests.length === 0;

  // Seçim yalnız gelen kutusunda ve arşivde (istekler kendi kabul/ret akışına sahip).
  const canSelectHere = (view === "inbox" || view === "archived") && !isSharing;
  const selectableList = inArchive ? archived : accepted;
  const selectedList = selectableList.filter((c) => selectedIds.has(c.id));
  const selectionActive = selecting && canSelectHere;
  const unreadList = buckets.inbox.filter((c) => c.unreadCount > 0);
  useSelectionChrome(selectionActive);

  function exitSelection() {
    setSelecting(false);
    setSelectedIds(new Set());
    setConfirmDelete(false);
    setBulkError(null);
  }
  function toggleSelected(conversationId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  }

  /** Eylemi sohbetlere 6'şarlı gruplarla uygular; başarısız olanların kimliklerini döndürür (sessiz başarı yok). */
  async function runBulk(ids: string[], act: (conversationId: string) => Promise<void>): Promise<string[]> {
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i += 6) {
      const chunk = ids.slice(i, i + 6);
      const results = await Promise.allSettled(chunk.map(act));
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error("conversation bulk action", result.reason);
          failed.push(chunk[index]);
        }
      });
    }
    return failed;
  }

  async function applyBulk(kind: "archive" | "read" | "delete" | "readAll" | "pin") {
    if (bulkBusy) return;
    // Ekip satırı tüm kanallarını temsil eder: toplu eylem ekibin her kanalına uygulanır.
    const ids = [...new Set((kind === "readAll" ? unreadList : selectedList).flatMap((c) => (c.teamRollup && c.group?.team ? teamChannelIds(c.group.team.id) : [c.id])))];
    if (ids.length === 0) {
      if (kind === "readAll") showToast(t("messages.nothingUnreadToast"));
      return;
    }
    setBulkBusy(true);
    setBulkError(null);
    // Sabitle: seçilenlerin hepsi zaten sabitliyse sabitleme kalkar, değilse hepsi sabitlenir (tek dokunuşla ters çevrilir).
    const unpinning = kind === "pin" && selectedList.every((c) => Boolean(c.pinnedAt));
    const act =
      kind === "pin"
        ? (conversationId: string) => pinConversation(conversationId, !unpinning)
        : kind === "archive"
          ? inArchive
            ? unarchiveConversation
            : archiveConversation
          : kind === "delete"
            ? deleteConversation
            : markConversationRead;
    const failed = await runBulk(ids, act);
    const done = ids.length - failed.length;
    if (done > 0) {
      if (kind === "pin") {
        showToast(unpinning ? t("rooms.list.unpinnedToast") : t("rooms.list.pinnedToast"));
      } else {
        const toastKey =
          kind === "archive" ? (inArchive ? "messages.bulkUnarchivedToast" : "messages.bulkArchivedToast") : kind === "delete" ? "messages.bulkDeletedToast" : "messages.bulkReadToast";
        showToast(t(toastKey, { count: done }));
      }
    }
    setConfirmDelete(false);
    if (failed.length > 0) {
      setBulkError(t("messages.bulkPartialFailed", { failed: failed.length }));
      if (kind !== "readAll") setSelectedIds(new Set(failed));
    } else if (kind !== "readAll") {
      exitSelection();
    }
    setBulkBusy(false);
  }

  const withShare = (href: string) => (shareQuery ? `${href}&${shareQuery}` : href);

  async function handleUnarchive(conversationId: string) {
    setBusyId(conversationId);
    setActionError(false);
    try {
      await unarchiveConversation(conversationId);
    } catch (err) {
      console.error("unarchiveConversation", err);
      setActionError(true);
    } finally {
      setBusyId(null);
    }
  }

  const menuItems: SectionMenuItem<MessagesView>[] = [
    { key: "inbox", label: t("messages.chatsHeading"), icon: MessagesSquare },
    { key: "requests", label: t("messages.messageRequestsHeading"), icon: Inbox, count: buckets.requests.length || undefined },
    { key: "archived", label: t("messages.archivedHeading"), icon: Archive, meta: buckets.archived.length },
    // Not views but doors: the starred messages screen and the communities (their chats live there).
    { key: "starred", label: t("chat.starred.title"), icon: Star, dividerBefore: true },
    { key: "communities", label: t("communities.messages.entryAria"), icon: Users },
    // Ekip sohbetleri Topluluk sohbetlerinden ayrı bir kapıdır (docs/history/350-*).
    { key: "teams", label: t("tm.messages.entry"), icon: Briefcase, count: teamUnread || undefined },
  ];
  function pickView(next: MessagesView) {
    if (next === "starred") return router.push("/messages/starred");
    if (next === "communities") return router.push("/communities");
    setView(next);
    setActionError(false);
    exitSelection();
  }
  const searchShown = searchOpen || searching;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", embedded ? "" : "mx-auto w-full max-w-3xl px-3 pb-6 pt-3 sm:px-5 sm:pt-5")}>
      <div className={cn(embedded && "px-4 pt-4")}>
        {selectionActive ? (
          <SelectionHeader count={selectedList.length} onDone={exitSelection} embedded={embedded} />
        ) : (
          <>
        {embedded ? <h1 className="mb-3 font-display text-[1.875rem] font-bold leading-[1.1] tracking-[-0.02em] text-text">{t("header.messagesAriaLabel")}</h1> : <SadeTitle className="mb-4">{t("header.messagesAriaLabel")}</SadeTitle>}
        {/* Sade düzen (docs/history/234-*): tek "Sohbetler ▾" menüsü (istekler sayaçlı, arşiv, yıldızlı, topluluk sohbetleri) + arama simgesi + `⋯` (Sohbet seç · Tümü okundu) + yeni sohbet. */}
        <div className="mb-3">
          <ListControlRow
            menu={{ items: menuItems, active: view, onChange: pickView, ariaLabel: t("messages.sectionsAria"), title: t("header.messagesAriaLabel") }}
            search={{ open: searchShown, onToggle: () => (searchShown ? (setQuery(""), setSearchOpen(false)) : setSearchOpen(true)), label: t("messages.searchConversations") }}
            trailing={
              <>
                {canSelectHere && (
                  <ConversationsMoreMenu
                    canSelect={selectableList.length > 0}
                    canMarkAllRead={unreadList.length > 0}
                    onSelect={() => setSelecting(true)}
                    onMarkAllRead={() => void applyBulk("readAll")}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setNewChatOpen(true)}
                  aria-label={t("messages.newChatAria")}
                  title={t("messages.newChat")}
                  aria-haspopup="dialog"
                  className={cn(CONTROL_ICON_BUTTON, "bg-surface-soft hover:bg-border-soft")}
                >
                  <Plus size={22} strokeWidth={1.75} aria-hidden />
                </button>
              </>
            }
          />
        </div>
          </>
        )}
        {!selectionActive && view === "inbox" && (
          <div role="group" aria-label={t("rooms.filter.aria")} data-kind-chips className="mb-3 flex gap-2 overflow-x-auto scrollbar-none">
            {(["all", "personal", "community", "team"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={kindFilter === key}
                data-kind-chip={key}
                onClick={() => setKindFilter(key)}
                className={cn(
                  "shrink-0 rounded-full text-small transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  embedded ? "h-9 px-3.5" : "h-10 px-[18px]",
                  kindFilter === key ? "bg-primary font-semibold text-primary-foreground" : "border border-border-soft bg-surface font-medium text-text hover:border-border-strong",
                )}
              >
                {t(`rooms.filter.${key}` as const)}
              </button>
            ))}
          </div>
        )}
        {!selectionActive && view === "inbox" && (kindFilter === "team" || kindFilter === "community") && kindCount > 0 && (
          <p data-kind-summary className="mb-2 px-1 text-caption text-text-muted">
            {t(kindFilter === "team" ? "tm.list.summaryTeams" : "tm.list.summaryCommunities", { count: kindCount, unread: kindUnread })}
          </p>
        )}
        {searchShown && (
          <label className="relative mb-3 block">
            <span className="sr-only">{t("messages.searchConversations")}</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("messages.searchConversations")}
              autoFocus
              className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </label>
        )}
        {view === "inbox" && buckets.requests.length > 0 && !searching && !selectionActive && (
          <button
            type="button"
            onClick={() => setView("requests")}
            data-message-requests-banner=""
            className="mb-3 flex w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft/60 px-3 py-2.5 text-left transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
              <Inbox size={17} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{t("messages.requestsBanner", { count: buckets.requests.length })}</span>
            <span className="shrink-0 text-small font-semibold text-primary">{t("messages.requestsOpen")}</span>
          </button>
        )}
        {bulkError && (
          <p role="alert" className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {bulkError}
          </p>
        )}
        {actionError && (
          <p role="alert" className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {t("messages.stateUpdateFailed")}
          </p>
        )}
        {isSharing && (
          <p className="mb-3 rounded-lg border border-primary/20 bg-primary-soft/50 px-3 py-2 text-sm text-text">
            {t("messages.pickAConversationBody")}
          </p>
        )}
      </div>
      <div className={cn("min-h-0 flex-1", embedded && "overflow-y-auto", selectionActive && !embedded && "pb-28")}>
        {view === "teams" ? (
          <div className={cn(embedded && "px-4")}>
            <TeamChannelsInbox />
          </div>
        ) : noMatches ? (
          <p className="py-10 text-center text-sm text-text-muted">{t("messages.noConversationMatches")}</p>
        ) : kindEmpty ? (
          <p data-kind-empty className="py-10 text-center text-sm text-text-muted">{t("rooms.filter.empty")}</p>
        ) : inArchive ? (
          <ConversationList
            conversations={archived}
            shareQuery={shareQuery}
            activeId={activeId}
            flush={embedded}
            emptyLabel={t("messages.archivedEmpty")}
            onUnarchive={handleUnarchive}
            busyId={busyId}
            selection={selectionActive ? { selectedIds, onToggle: toggleSelected } : undefined}
          />
        ) : inRequests ? (
          <>
            <p className={cn("mb-2 text-xs text-text-muted", embedded ? "px-4" : "px-1")}>{t("messages.messageRequestsHint")}</p>
            <ConversationList conversations={pending} shareQuery={shareQuery} activeId={activeId} flush={embedded} emptyLabel={t("messages.requestsEmpty")} />
          </>
        ) : nothingAtAll ? (
          <EmptyState
            icon={MessagesSquare}
            title={t("messages.emptyTitle")}
            description={t("messages.emptyDescription")}
            action={{ label: t("messages.startChat"), onClick: () => setNewChatOpen(true), variant: "primary" }}
            className="mx-1"
            compact
          />
        ) : (
          (accepted.length > 0 || pending.length === 0 || searching) && (
            <>
              {searching && pending.length > 0 && (
                <>
                  <Eyebrow as="h2" className={cn("mb-1.5", embedded ? "px-4" : "px-1")}>
                    {t("messages.messageRequestsHeading")} ({pending.length})
                  </Eyebrow>
                  <div className="mb-4">
                    <ConversationList conversations={pending} shareQuery={shareQuery} activeId={activeId} flush={embedded} />
                  </div>
                  {accepted.length > 0 && (
                    <Eyebrow as="h2" className={cn("mb-2", embedded ? "px-4" : "px-1")}>
                      {t("messages.chatsHeading")}
                    </Eyebrow>
                  )}
                </>
              )}
              <ConversationList
                conversations={accepted}
                shareQuery={shareQuery}
                activeId={activeId}
                activeTeamId={activeTeamId}
                showKindTag={kindFilter === "all"}
                flush={embedded}
                selection={selectionActive ? { selectedIds, onToggle: toggleSelected } : undefined}
              />
              {!selectionActive && !searching && (kindFilter === "team" || kindFilter === "community") && (
                <Link
                  href={kindFilter === "team" ? "/teams" : "/communities/all"}
                  data-kind-cta={kindFilter}
                  className={cn(
                    "mt-3 flex h-14 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed text-small font-bold transition-colors",
                    embedded && "mx-4",
                    kindFilter === "team" ? "border-primary/30 text-primary hover:bg-primary-soft" : "border-success/40 text-success hover:bg-success/10",
                  )}
                >
                  {kindFilter === "team" ? <Plus size={18} aria-hidden /> : <Search size={18} aria-hidden />}
                  {t(kindFilter === "team" ? "tm.create" : "tm.list.discoverCommunities")}
                </Link>
              )}
            </>
          )
        )}
        {selectionActive && embedded && (
          <SelectionActionBar
            embedded
            archiveLabel={inArchive ? t("messages.unarchive") : t("messages.archive")}
            disabled={selectedList.length === 0}
            busy={bulkBusy}
            onArchive={() => void applyBulk("archive")}
            onPin={inArchive ? undefined : () => void applyBulk("pin")}
            pinLabel={selectedList.length > 0 && selectedList.every((c) => Boolean(c.pinnedAt)) ? t("rooms.list.unpin") : t("rooms.list.pin")}
            onRead={() => void applyBulk("read")}
            onDelete={() => setConfirmDelete(true)}
          />
        )}
      </div>
      {selectionActive && !embedded && (
        <Portal>
          <SelectionActionBar
            archiveLabel={inArchive ? t("messages.unarchive") : t("messages.archive")}
            disabled={selectedList.length === 0}
            busy={bulkBusy}
            onArchive={() => void applyBulk("archive")}
            onPin={inArchive ? undefined : () => void applyBulk("pin")}
            pinLabel={selectedList.length > 0 && selectedList.every((c) => Boolean(c.pinnedAt)) ? t("rooms.list.unpin") : t("rooms.list.pin")}
            onRead={() => void applyBulk("read")}
            onDelete={() => setConfirmDelete(true)}
          />
        </Portal>
      )}
      {confirmDelete && selectedList.length > 0 && (
        <Modal onClose={bulkBusy ? () => undefined : () => setConfirmDelete(false)} labelledBy="bulk-delete-title">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
            <h2 id="bulk-delete-title" className="text-base font-semibold text-text">
              {t("messages.bulkDeleteTitle", { count: selectedList.length })}
            </h2>
            {selectedList.some((c) => c.kind !== "group") && <p className="text-small text-text-secondary">{t("messages.deleteChatConfirm")}</p>}
            {selectedList.some((c) => c.kind === "group") && <p className="text-small text-text-secondary">{t("groups.chat.hideFromListConfirm")}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={bulkBusy}>
                {t("common.cancel")}
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={() => void applyBulk("delete")} disabled={bulkBusy}>
                {bulkBusy ? t("common.loading") : t("common.delete")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {toastNode}
      {newChatOpen && (
        <NewChatModal
          onClose={() => setNewChatOpen(false)}
          showCommunitiesLink={!isSharing}
          onOpenConversation={(conversationId) => {
            setNewChatOpen(false);
            router.push(withShare(messageHref({ id: conversationId })));
          }}
          onStartDraft={async (person) => {
            if (shareQuery) {
              // Picking someone to SHARE content with is an immediate send intent, so the conversation is created now (same as the profile's "Mesaj Gönder").
              const conversation = await startConversationWith(person);
              setNewChatOpen(false);
              router.push(withShare(messageHref(conversation)));
              return;
            }
            setNewChatOpen(false);
            router.push(`/messages/local?to=${person.id}`);
          }}
        />
      )}
    </div>
  );
}
