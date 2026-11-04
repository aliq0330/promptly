"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PresenceAvatar, PresenceStatusText } from "@/features/presence/presence-ui";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "./real-messages-provider";
import { MessageComposer, useImageDrop } from "./message-composer";
import { useComposerImages } from "./use-composer-images";
import { fetchOwnProfile } from "@/lib/supabase/profiles";
import { getBlockedIds } from "@/lib/supabase/blocked-users";
import { gifAttachment, removeMessageImages, uploadMessageImage } from "@/lib/supabase/message-images";
import type { GifItem } from "@/lib/giphy";
import { conversationIdByUser, filterMessageableUsers, sendMessage } from "@/lib/supabase/messages";
import { useFitPanelToKeyboard } from "./viewport-helpers";
import { DockHeader } from "./dock-header";
import type { DockHandlers } from "./message-dock-provider";
import { messageHref, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation, MessageAttachment, UserProfile } from "@/types";

/**
 * `/messages/local?to=<userId>` — the empty composer behind "Yeni sohbet".
 * Nothing exists in the database yet: the conversation is created (through
 * the same `start_direct_conversation` RPC the profile's "Mesaj Gönder"
 * uses, which re-checks blocks and privacy on the server) only when the first
 * real message is sent. Leaving this page creates nothing. A typed or stale
 * URL is re-checked here: someone who already has a conversation with the
 * person is forwarded to it, and someone who can't be messaged sees the same
 * generic notice the picker shows.
 */
export function NewChatDraftView({ userId, dock }: { userId: string; dock?: DockHandlers & { onOpenConversation: (conversationId: string) => void } }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { conversations, startConversationWith } = useRealMessages();
  const composerImages = useComposerImages();
  const imageDrop = useImageDrop(composerImages.addFiles, true);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  // Kept across retries: a failed first send must not create a second conversation.
  const createdRef = useRef<Conversation | null>(null);

  const [target, setTarget] = useState<UserProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = conversationIdByUser(conversations).get(userId);
        if (existing) {
          if (dock) dock.onOpenConversation(existing);
          else router.replace(messageHref({ id: existing }));
          return;
        }
        const [profile, reachable, blockedIds] = await Promise.all([
          fetchOwnProfile(userId),
          filterMessageableUsers([userId]),
          getBlockedIds(),
        ]);
        if (cancelled) return;
        if (!profile || userId === user.id || !reachable.has(userId) || blockedIds.has(userId)) {
          setState("unavailable");
          return;
        }
        setTarget(profile);
        setState("ready");
      } catch (err) {
        console.error("new chat draft check", err);
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
    // `conversations` is read once for the forward-to-existing check; later list changes must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userId]);

  const isDock = Boolean(dock);

  // Mobile keyboard: fit the panel to the visible area (same hook the open thread uses, docs/history/332-*).
  useFitPanelToKeyboard(panelEl, !isDock);

  function handleBack() {
    if (dock) {
      dock.onBack();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/messages");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    const staged = composerImages.images.filter((image) => image.status === "ready");
    if (!user || !target || isSending || composerImages.isPreparing || (!trimmed && staged.length === 0)) return;

    setIsSending(true);
    setError(null);
    let uploaded: MessageAttachment[] = [];
    try {
      // The first real message is what creates the conversation (server re-checks blocks + privacy).
      if (!createdRef.current) createdRef.current = await startConversationWith(target);
      const conversation = createdRef.current;
      for (const image of staged) {
        if (!image.prepared) throw new Error(t("image.processFailed"));
        uploaded.push(await uploadMessageImage(conversation.id, user.id, image.prepared));
      }
      await sendMessage(conversation.id, user.id, { body: trimmed || undefined, attachments: uploaded });
      for (const image of composerImages.take()) URL.revokeObjectURL(image.previewUrl);
      if (dock) dock.onOpenConversation(conversation.id);
      else router.replace(messageHref(conversation));
    } catch (err) {
      console.error("first message", err);
      // Photos that reached storage but belong to no message.
      if (uploaded.length > 0) void removeMessageImages(uploaded.map((a) => a.path));
      uploaded = [];
      setError(t("messages.draftSendFailed"));
      setIsSending(false);
    }
  }

  /** İlk mesaj olarak GIF: sohbeti açar, GIF'i gönderir (dosya yüklenmez, yalnız GIPHY kimliği). */
  async function handleGif(gif: GifItem) {
    if (!user || !target || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      if (!createdRef.current) createdRef.current = await startConversationWith(target);
      const conversation = createdRef.current;
      await sendMessage(conversation.id, user.id, { attachments: [gifAttachment(gif)] });
      if (dock) dock.onOpenConversation(conversation.id);
      else router.replace(messageHref(conversation));
    } catch (err) {
      console.error("first message (gif)", err);
      setError(t("messages.gifSendFailed"));
      setIsSending(false);
    }
  }

  if (!user || state === "loading") {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>;
  }

  if (state === "unavailable" || !target) {
    const backClass = "inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text shadow-xs transition-colors hover:border-border-strong";
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p role="alert" className="mb-4 text-sm text-text-secondary">
          {t("messages.newChatUnavailable")}
        </p>
        {dock ? (
          <button type="button" onClick={dock.onBack} className={backClass}>
            {t("messages.backToMessages")}
          </button>
        ) : (
          <Link href="/messages" className={backClass}>
            {t("messages.backToMessages")}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setPanelEl}
      {...imageDrop.handlers}
      className={
        dock
          ? "relative flex h-full min-h-0 flex-1 flex-col bg-surface"
          : "fixed inset-x-0 top-0 z-10 flex flex-col bg-background bottom-0 md:static md:inset-auto md:z-auto md:h-full md:min-h-0 md:flex-1"
      }
    >
      {dock ? (
        <DockHeader onBack={dock.onBack} onMinimize={dock.onMinimize}>
          <span className="flex min-w-0 items-center gap-2.5" data-dock-chat-title="">
            <PresenceAvatar userId={target.id} src={target.avatarUrl} alt={target.displayName} size={34} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[1rem] font-semibold tracking-[-0.01em] text-text">{target.displayName}</span>
              <PresenceStatusText userId={target.id} fallback={`@${target.username}`} showDot={false} className="flex max-w-full text-caption text-text-muted" />
            </span>
          </span>
        </DockHeader>
      ) : (
      <div className="flex items-center gap-1 border-b border-border-soft bg-surface px-2 py-2 max-md:pt-[calc(0.5rem+env(safe-area-inset-top))] lg:px-4">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("messages.backToListAriaLabel")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text md:hidden"
        >
          <ArrowLeft size={20} />
        </button>
        <Link
          href={profileHref(target)}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1 transition-colors duration-200 ease-soft hover:bg-surface-soft"
        >
          <PresenceAvatar userId={target.id} src={target.avatarUrl} alt={target.displayName} size={36} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-text">{target.displayName}</span>
            <PresenceStatusText userId={target.id} fallback={`@${target.username}`} showDot={false} className="flex max-w-full text-caption text-text-muted" />
          </span>
        </Link>
      </div>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
        <p className="max-w-xs text-center text-sm text-text-muted">{t("messages.draftHint")}</p>
      </div>
      <MessageComposer
        draft={draft}
        onDraftChange={setDraft}
        placeholder={t("messages.writeMessagePlaceholder")}
        disabled={false}
        canSend={(Boolean(draft.trim()) || composerImages.images.length > 0) && !isSending && !composerImages.isPreparing}
        isSending={isSending}
        onSubmit={handleSubmit}
        images={composerImages.images}
        imageNotice={composerImages.notice}
        onPickGif={(gif) => void handleGif(gif)}
        onAddFiles={composerImages.addFiles}
        onRemoveImage={composerImages.remove}
        onDismissNotice={composerImages.dismissNotice}
        error={error}
        dragActive={imageDrop.isDragging}
      />
    </div>
  );
}
