"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "./real-messages-provider";
import { MessageComposer, useImageDrop } from "./message-composer";
import { useComposerImages } from "./use-composer-images";
import { fetchOwnProfile } from "@/lib/supabase/profiles";
import { getBlockedIds } from "@/lib/supabase/blocked-users";
import { removeMessageImages, uploadMessageImage } from "@/lib/supabase/message-images";
import { conversationIdByUser, filterMessageableUsers, sendMessage } from "@/lib/supabase/messages";
import { computeKeyboardInset } from "./viewport-helpers";
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
export function NewChatDraftView({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { conversations, startConversationWith } = useRealMessages();
  const composerImages = useComposerImages();
  const imageDrop = useImageDrop(composerImages.addFiles, true);
  const panelRef = useRef<HTMLDivElement>(null);
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
          router.replace(messageHref({ id: existing }));
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

  // Mobile keyboard: lift the composer above it (same helper the open thread uses).
  useEffect(() => {
    const panel = panelRef.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!panel || !vv) return;
    let baselineBottom: number | null = null;
    function update() {
      if (!panel || !vv) return;
      if (baselineBottom === null) baselineBottom = parseFloat(getComputedStyle(panel).bottom) || 0;
      const inset = computeKeyboardInset({
        windowInnerHeight: window.innerHeight,
        visualViewportHeight: vv.height,
        visualViewportOffsetTop: vv.offsetTop,
      });
      panel.style.bottom = inset > baselineBottom + 1 ? `${inset}px` : "";
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      panel.style.bottom = "";
    };
  }, []);

  function handleBack() {
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
      router.replace(messageHref(conversation));
    } catch (err) {
      console.error("first message", err);
      // Photos that reached storage but belong to no message.
      if (uploaded.length > 0) void removeMessageImages(uploaded.map((a) => a.path));
      uploaded = [];
      setError(t("messages.draftSendFailed"));
      setIsSending(false);
    }
  }

  if (!user || state === "loading") {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>;
  }

  if (state === "unavailable" || !target) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p role="alert" className="mb-4 text-sm text-text-secondary">
          {t("messages.newChatUnavailable")}
        </p>
        <Link
          href="/messages"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text shadow-xs transition-colors hover:border-border-strong"
        >
          {t("messages.backToMessages")}
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      {...imageDrop.handlers}
      className="fixed inset-x-0 top-16 z-10 flex flex-col bg-background bottom-0 md:static md:inset-auto md:z-auto md:h-full md:min-h-0 md:flex-1"
    >
      <div className="flex items-center gap-1 border-b border-border-soft bg-surface px-2 py-2 lg:px-4">
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
          <Avatar src={target.avatarUrl} alt={target.displayName} size={36} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-text">{target.displayName}</span>
            <span className="block truncate text-caption text-text-muted">@{target.username}</span>
          </span>
        </Link>
      </div>
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
        onAddFiles={composerImages.addFiles}
        onRemoveImage={composerImages.remove}
        onDismissNotice={composerImages.dismissNotice}
        error={error}
        dragActive={imageDrop.isDragging}
      />
    </div>
  );
}
