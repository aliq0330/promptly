"use client";

import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { fetchChatSharedItems, type ChatSharedItem, type ChatSharedKind } from "@/lib/supabase/messages";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { messagePreviewText } from "./message-preview";
import { useMessageImageUrls } from "./message-image-grid";

const LIMIT = 100;
const URL_PATTERN = /https?:\/\/[^\s]+/i;

/** Mesaj gövdesindeki ilk bağlantı (sunucu `https?://` içeren kart-dışı mesajları verir). */
export function firstLink(body: string | null): string | null {
  const match = body?.match(URL_PATTERN);
  return match ? match[0].replace(/[).,;]+$/, "") : null;
}

/**
 * Sohbetin paylaşılanları (docs/history/271-*): "Medya ve bağlantılar" (Fotoğraflar · Bağlantılar sekmeleri) ve "Paylaşılan içerik" (prompt / istek /
 * workflow / hazır ayar / Space / topluluk gönderisi kartları). Okuma sunucudadır (`chat_shared_items`); satıra dokunmak o mesaja götürür.
 */
export function ChatSharedModal({
  conversationId,
  mode,
  onClose,
  onJumpToMessage,
}: {
  conversationId: string;
  /** "media" = Fotoğraflar + Bağlantılar sekmeleri; "content" = yalnız paylaşılan içerik listesi. */
  mode: "media" | "content";
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ChatSharedKind>(mode === "media" ? "photos" : "content");
  return (
    <Modal onClose={onClose} labelledBy="chat-shared-title" overLayers>
      <div data-chat-shared className="flex max-h-[min(80dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-[22px] bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-5">
          <h2 id="chat-shared-title" className="font-display text-h3 font-bold text-text">
            {mode === "media" ? t("messages.shared.mediaLinks") : t("messages.shared.content")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>
        {mode === "media" && (
          <div role="tablist" className="flex shrink-0 gap-1.5 px-5 pb-3">
            {(["photos", "links"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={tab === kind}
                onClick={() => setTab(kind)}
                className={cn(
                  "h-9 rounded-full px-4 text-small font-medium transition-colors",
                  tab === kind ? "bg-text text-background" : "bg-surface-soft text-text-secondary hover:text-text",
                )}
              >
                {kind === "photos" ? t("messages.shared.tabPhotos") : t("messages.shared.tabLinks")}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
          <SharedList key={tab} conversationId={conversationId} kind={tab} onJump={onJumpToMessage} />
        </div>
      </div>
    </Modal>
  );
}

function SharedList({ conversationId, kind, onJump }: { conversationId: string; kind: ChatSharedKind; onJump: (messageId: string) => void }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<{ items: ChatSharedItem[]; truncated: boolean } | "error" | null>(null);

  useEffect(() => {
    let alive = true;
    fetchChatSharedItems(conversationId, kind, LIMIT)
      .then((result) => {
        if (alive) setState(result);
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [conversationId, kind]);

  const photos = state && state !== "error" && kind === "photos" ? state.items.flatMap((item) => item.attachments.map((attachment) => ({ messageId: item.id, attachment }))) : [];
  const urls = useMessageImageUrls(photos.map((photo) => photo.attachment));

  if (state === null) {
    return (
      <p role="status" className="px-3 py-8 text-center text-small text-text-muted">
        {t("common.loading")}
      </p>
    );
  }
  if (state === "error") {
    return (
      <p role="alert" className="px-3 py-8 text-center text-small text-danger">
        {t("messages.shared.loadError")}
      </p>
    );
  }
  if (state.items.length === 0) {
    return <p className="px-3 py-8 text-center text-small text-text-muted">{t(kind === "photos" ? "messages.shared.emptyPhotos" : kind === "links" ? "messages.shared.emptyLinks" : "messages.shared.emptyContent")}</p>;
  }

  const note = state.truncated ? <p className="px-3 pt-3 text-center text-caption text-text-muted">{t("messages.shared.truncated", { count: LIMIT })}</p> : null;

  if (kind === "photos") {
    return (
      <>
        <ul className="grid grid-cols-3 gap-1.5 px-2" data-chat-shared-photos>
          {photos.map((photo, index) => {
            const url = urls.get(photo.attachment.path);
            return (
              <li key={`${photo.messageId}:${photo.attachment.path}:${index}`}>
                <button
                  type="button"
                  onClick={() => onJump(photo.messageId)}
                  aria-label={t("messages.contact.openPhotoAria", { index: index + 1 })}
                  className="relative block aspect-square w-full overflow-hidden rounded-xl bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element -- imzalı (signed) özel bucket adresi
                    <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {note}
      </>
    );
  }

  return (
    <>
      <ul className="space-y-1" data-chat-shared-list>
        {state.items.map((item) => {
          const link = kind === "links" ? firstLink(item.body) : null;
          const title = link ?? messagePreviewText(item, t).split("\n")[0] ?? "";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onJump(item.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {kind === "links" && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-secondary" aria-hidden>
                    <Link2 size={17} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-body text-text", kind === "links" && "text-primary")}>{title}</span>
                  <span className="block truncate text-caption text-text-muted">
                    {kind === "links" && item.body && link && item.body.replace(link, "").trim() ? `${item.body.replace(link, "").trim().slice(0, 80)} · ` : ""}
                    {formatRelativeTime(item.createdAt, language)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {note}
    </>
  );
}
