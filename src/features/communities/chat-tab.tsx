"use client";

import Link from "next/link";
import { BellOff, MessageSquare, Pin, Search, Star } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import type { CommunityTabProps } from "./community-page";
import { communityChatHref } from "@/lib/communities";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Sohbet sekmesi: topluluğun sohbeti, Mesajlar çalışma alanındaki grup sohbetidir (ikinci bir sohbet altyapısı yoktur): mesaj gönderme ve
 * geçmiş, yanıt/tepki, okundu bilgisi, "yazıyor", mesaj sabitleme, sohbet içi arama, kişiye özel yıldızlı mesajlar, engelleme/raporlama
 * orada çalışır. Üyelik biter bitmez (ayrılma/çıkarılma) sohbete yazma ve geçmişi okuma sona erer (RLS). Bu sekme durumu özetler.
 */
export function ChatTab({ group, unread }: CommunityTabProps & { unread: number }) {
  const { t, language } = useTranslation();
  const { conversations } = useRealMessages();
  const conversation = conversations.find((c) => c.id === group.id);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <MessageSquare size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-sm font-semibold text-text">{t("communities.chat.title")}</h2>
            <p className="text-small text-text-muted">{group.postingPolicy === "admins" ? t("communities.chat.staffOnly") : t("communities.chat.everyone")}</p>
          </div>
        </div>

        {group.closedAt && <p role="status" className="rounded-md bg-warning/10 px-3 py-2 text-small text-text">{t("communities.chat.closedNote")}</p>}

        <div className="rounded-lg bg-surface-soft px-3.5 py-3">
          {conversation && conversation.lastMessageAt ? (
            <>
              <p className="line-clamp-2 break-words text-small text-text">{conversation.lastMessage}</p>
              <p className="mt-0.5 text-caption text-text-muted">
                {formatRelativeTime(conversation.lastMessageAt, language)}
                {unread > 0 && ` · ${t("communities.chat.unread", { count: unread })}`}
                {conversation.mutedAt && (
                  <span className="ml-1.5 inline-flex items-center gap-1">
                    <BellOff size={11} aria-hidden /> {t("communities.chat.muted")}
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="text-small text-text-muted">{t("communities.chat.noMessages")}</p>
          )}
        </div>

        <Link href={communityChatHref(group.id)} className={buttonClassName({ size: "md", className: "w-full sm:w-auto" })}>
          <MessageSquare size={15} /> {t("communities.detail.openChat")}
        </Link>
      </section>

      <ul className="grid gap-2 text-small text-text-secondary sm:grid-cols-3">
        <li className="flex items-start gap-2 rounded-lg border border-border-soft bg-surface px-3.5 py-3">
          <Pin size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden /> {t("communities.chat.featPins")}
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border-soft bg-surface px-3.5 py-3">
          <Search size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden /> {t("communities.chat.featSearch")}
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border-soft bg-surface px-3.5 py-3">
          <Star size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden /> {t("communities.chat.featStars")}
        </li>
      </ul>
    </div>
  );
}
