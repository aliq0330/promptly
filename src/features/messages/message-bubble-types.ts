import type { Message } from "@/types";

export type DeleteMode = "everyone" | "me";

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
}
