import type { Message } from "@/types";
import type { ReactionKey } from "@/lib/reactions";

/** "moderator": grup yöneticisinin (düşük rütbeli üyenin) mesajını herkes için silmesi. */
export type DeleteMode = "everyone" | "me" | "moderator";

/** One person's reaction on a message — one of the six post reactions (docs/history/330-*). */
export interface MessageReactionEntry {
  userId: string;
  reaction: ReactionKey;
}

export interface MessageBubbleActions {
  onStartReply: (message: Message) => void;
  onStartEdit: (message: Message) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: string) => void;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  isSavingEdit: boolean;
  editError: string | null;
  onRequestDelete: (id: string, mode: DeleteMode) => void;
  onCancelDeleteConfirm: () => void;
  deleteConfirm: { id: string; mode: DeleteMode } | null;
  isDeletingId: string | null;
  /** "Benden sil" çıkış animasyonundaki mesaj (docs/history/335-*): kayıp solar, sonra listeden çıkar. */
  isLeavingId?: (id: string) => boolean;
  /** Grup sohbeti: bu mesajı yönetici olarak silebilir miyim (gönderen daha düşük rütbede mi)? Birebir sohbette verilmez. */
  canModerate?: (message: Message) => boolean;
  /** Yıldız (kişiye özel): mesaj benim için yıldızlı mı ve değiştirme. */
  isStarred?: (id: string) => boolean;
  onToggleStar?: (message: Message) => void;
  /** Sabitleme: bu kullanıcı sabitleyebilir mi (arayüz ipucu; gerçek yetki sunucuda), mesaj sabit mi ve değiştirme. */
  canPin?: boolean;
  isPinned?: (id: string) => boolean;
  onTogglePin?: (message: Message) => void;
  onCopy?: (message: Message) => void;
  /** "Mesaj bilgisi" (grup, kendi mesajım): kimler okudu. */
  onShowInfo?: (message: Message) => void;
  /** Topluluk sohbeti: başkasının mesajını topluluk yöneticilerine bildir (sitenin genel şikâyetinden AYRI moderasyon kuyruğu). */
  onReportToStaff?: (message: Message) => void;
}

/** Grup sohbetinde mesajın üstünde gösterilen gönderen bilgisi. */
export interface MessageSender {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  role: import("@/types").GroupRole | null;
}
