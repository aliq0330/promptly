import type { Message } from "@/types";

/** "moderator": grup yöneticisinin (düşük rütbeli üyenin) mesajını herkes için silmesi. */
export type DeleteMode = "everyone" | "me" | "moderator";

export interface MessageReactionEntry {
  userId: string;
  emoji: string;
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
}

/** Grup sohbetinde mesajın üstünde gösterilen gönderen bilgisi. */
export interface MessageSender {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  role: import("@/types").GroupRole | null;
}
