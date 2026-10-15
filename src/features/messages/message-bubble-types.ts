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
}

/** Grup sohbetinde mesajın üstünde gösterilen gönderen bilgisi. */
export interface MessageSender {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  role: import("@/types").GroupRole | null;
}
