"use client";

import { useState } from "react";
import { LoadMoreButton } from "@/features/feed/load-more";
import { ConversationRow } from "./conversation-row";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";
import { useOnlineIds } from "@/features/presence/use-presence";
import { sortOnlineFirst } from "@/lib/presence";

/** Paylaşım seçicisinde çevrimiçi sıralaması yalnız ilk bu kadar sohbete uygulanır (tek `presence_lookup` sınırı). */
const SHARE_ONLINE_SORT_LIMIT = 200;

/** Çok sohbetli bir kişide (yüzlerce birebir / topluluk) satırların hepsi bir anda çizilmez: 50'şer, aşağı inince devamı (docs/history/258-*). */
const CONVERSATIONS_SHOWN_STEP = 50;

export function ConversationList({
  conversations,
  shareQuery,
  activeId,
  flush,
  emptyLabel,
  onUnarchive,
  busyId,
  selection,
  onOpen,
}: {
  conversations: Conversation[];
  shareQuery?: string;
  /** Conversation currently open in the right-hand pane (tablet/desktop). */
  activeId?: string | null;
  /** Drop the card border/radius — used inside the side pane, which already has its own frame. */
  flush?: boolean;
  /** Shown when the list is empty (defaults to the inbox wording). */
  emptyLabel?: string;
  /** Archive view only: adds a per-row "Arşivden çıkar" button. */
  onUnarchive?: (conversationId: string) => void;
  /** The conversation whose action is in flight — its button is disabled. */
  busyId?: string | null;
  /** Seçim modu (varsa satırlar seçilebilir olur): hangi kimlikler seçili + seç/bırak. */
  selection?: { selectedIds: ReadonlySet<string>; onToggle: (conversationId: string) => void };
  /** Mesajlar dock'u: satıra basınca sayfaya gitmek yerine bu geri çağrı çalışır. */
  onOpen?: (conversation: Conversation) => void;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(CONVERSATIONS_SHOWN_STEP);
  // Paylaşım seçicisi (`?sharePromptId=` …): çevrimiçi kişilerle sohbetler önce (docs/history/329-*). Gelen kutusu kronolojik kalır.
  const shareHead = shareQuery ? conversations.slice(0, SHARE_ONLINE_SORT_LIMIT) : [];
  const online = useOnlineIds(shareHead.map((conversation) => (conversation.kind === "direct" ? conversation.participants[0]?.id : null)));
  if (shareQuery && online.size > 0) {
    conversations = [
      ...sortOnlineFirst(shareHead, (conversation) => (conversation.kind === "direct" ? conversation.participants[0]?.id : null), online),
      ...conversations.slice(SHARE_ONLINE_SORT_LIMIT),
    ];
  }
  // Açık sohbet pencerenin dışında kalmasın (derin bağlantıyla açılan eski bir sohbet).
  const activeIndex = activeId ? conversations.findIndex((conversation) => conversation.id === activeId) : -1;
  const visibleCount = Math.max(shown, activeIndex + 1);
  if (conversations.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">{emptyLabel ?? t("messages.noConversationsYet")}</p>
    );
  }

  return (
    // Meydan düz liste (WhatsApp tarzı): telefonda sayfa kenarına kadar uzanan kutusuz satırlar; sm+ sayfada hafif kartlı çerçeve.
    <div className={cn("bg-surface", flush ? "" : "-mx-3 sm:mx-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-border-soft sm:shadow-card")}>
      {conversations.slice(0, visibleCount).map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          shareQuery={shareQuery}
          isActive={activeId === conversation.id}
          onUnarchive={onUnarchive ? () => onUnarchive(conversation.id) : undefined}
          unarchiveBusy={busyId === conversation.id}
          onOpen={onOpen}
          expandable={flush}
          selection={selection ? { selected: selection.selectedIds.has(conversation.id), onToggle: () => selection.onToggle(conversation.id) } : undefined}
        />
      ))}
      {conversations.length > visibleCount && (
        <LoadMoreButton variant="ghost" size="sm" wrapperClassName="flex justify-center py-2" onLoadMore={() => setShown(visibleCount + CONVERSATIONS_SHOWN_STEP)} />
      )}
    </div>
  );
}
