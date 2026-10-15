"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchStarredMessages, toChatFeatureError, unstarMessage } from "@/lib/supabase/chat-features";
import { messageHref, formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { StarredMessage } from "@/types";

type Cursor = { starredAt: string; messageId: string } | null;

/**
 * "Yıldızlı mesajlar" (docs/history/174-*): birebir ve grup sohbetlerindeki yıldızladığım mesajlar TEK listede. Liste kişiye özeldir
 * (`message_stars` yalnız kendi satırlarımı verir) ve sunucu erişimimi yitirdiğim mesajları (gruptan ayrıldım, mesaj silindi,
 * "benden sil" / temizle) hiç döndürmez — içerik erişimin ötesinde gösterilmez. Satıra dokunmak doğru sohbeti açar ve mesaja kaydırır;
 * yıldızı kaldırmak satırı listeden çıkarır. Mesaj kopyalanmaz: yalnız `message_stars` başvurusu vardır.
 */
export function StarredMessagesView() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<StarredMessage[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const userId = user?.id ?? null;

  const loadFirst = useCallback(async () => {
    if (!userId) return;
    const request = ++requestRef.current;
    setStatus("loading");
    try {
      const page = await fetchStarredMessages(userId);
      if (request !== requestRef.current) return;
      setItems(page.items);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setStatus("ready");
    } catch (err) {
      if (request !== requestRef.current) return;
      console.error("fetchStarredMessages", err);
      setStatus("error");
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- açılışta tek seferlik sunucu okuması; yüklenme durumu render sırasında türetilemez
    void loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    if (!userId || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchStarredMessages(userId, cursor);
      setItems((prev) => [...prev, ...page.items.filter((item) => !prev.some((p) => p.messageId === item.messageId))]);
      setCursor(page.cursor ?? cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("fetchStarredMessages (more)", err);
      setActionError(t("chat.starred.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleUnstar(item: StarredMessage) {
    if (!userId || busyId) return;
    setBusyId(item.messageId);
    setActionError(null);
    try {
      await unstarMessage(userId, item.messageId);
      setItems((prev) => prev.filter((p) => p.messageId !== item.messageId));
    } catch (err) {
      console.error("unstarMessage", err);
      setActionError(toChatFeatureError(err instanceof Error ? err : null).message);
    } finally {
      setBusyId(null);
    }
  }

  function snippet(item: StarredMessage): string {
    const body = item.body?.trim();
    if (body) return body.length > 220 ? `${body.slice(0, 220)}…` : body;
    if (item.hasAttachments) return t("chat.starred.photo");
    if (item.hasShared) return t("chat.starred.shared");
    return "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-starred-view>
      <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-5 sm:py-6">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/messages"))}
            aria-label={t("messages.backToListAriaLabel")}
            className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="flex items-center gap-2 text-h2 text-text">
            <Star size={20} className="fill-current text-warning" aria-hidden /> {t("chat.starred.title")}
          </h1>
        </div>

        {actionError && (
          <p role="alert" className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {actionError}
          </p>
        )}

        {status === "loading" && <p className="py-10 text-center text-sm text-text-muted">{t("common.loading")}</p>}
        {status === "error" && (
          <div className="py-10 text-center">
            <p className="mb-3 text-sm text-danger">{t("chat.starred.loadFailed")}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void loadFirst()}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {status === "ready" && items.length === 0 && (
          <EmptyState icon={Star} title={t("chat.starred.empty")} description={t("chat.starred.emptyHint")} compact />
        )}
        {status === "ready" && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.messageId} data-starred-item={item.messageId} className="flex items-stretch gap-1 rounded-lg border border-border-soft bg-surface shadow-xs">
                <Link
                  href={`${messageHref({ id: item.conversationId })}&hl=message:${item.messageId}`}
                  aria-label={t("chat.starred.openChatAria", { name: item.chatName })}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-l-lg px-3 py-3 transition-colors hover:bg-surface-soft"
                >
                  {item.kind === "group" ? (
                    <GroupAvatar name={item.chatName} avatarUrl={item.chatAvatarUrl} size={36} badge />
                  ) : (
                    <Avatar src={item.chatAvatarUrl} alt={item.chatName} size={36} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-caption text-text-muted">
                      <span className="max-w-[12rem] truncate font-semibold text-text-secondary">{item.chatName}</span>
                      {item.kind === "group" && <span className="rounded-full bg-primary-soft px-1.5 py-px text-[10px] font-medium text-primary">{t("chat.starred.groupTag")}</span>}
                      <span className="ml-auto shrink-0">{formatRelativeTime(item.createdAt, language)}</span>
                    </span>
                    <span className="mt-0.5 block text-caption text-text-muted">{item.senderName}</span>
                    <span className="mt-0.5 line-clamp-3 break-words text-sm text-text">{snippet(item)}</span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleUnstar(item)}
                  disabled={busyId === item.messageId}
                  aria-label={t("chat.star.unstar")}
                  title={t("chat.star.unstar")}
                  className="flex w-11 shrink-0 items-center justify-center rounded-r-lg text-warning transition-colors hover:bg-surface-soft disabled:opacity-50"
                >
                  <Star size={16} className="fill-current" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {status === "ready" && hasMore && (
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="ghost" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? t("common.loadingMore") : t("chat.starred.loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
