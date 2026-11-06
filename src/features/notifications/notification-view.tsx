"use client";

import { useEffect, useMemo, useState } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { BellOff } from "@/components/icons/bell-off";
import { Clock } from "@/components/icons/clock";
import { Info } from "@/components/icons/info";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { MailOpen } from "@/components/icons/mail-open";
import { MessageCircle } from "@/components/icons/message-circle";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { UserPlus } from "@/components/icons/user-plus";
import { Users } from "@/components/icons/users";
import { useNotifications } from "./notifications-provider";
import type { SectionMenuItem } from "@/features/content/section-menu";
import type { NotificationCardsQuery } from "@/lib/supabase/notifications";
import type { NotificationCategoryName } from "@/lib/notification-mirror";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

/** "Tümü ▾" menüsünün seçenekleri: tümü, okunmamış, kategoriler, ertelenenler (docs/history/326-*; eski `/notifications` kategori menüsü + iki yeni öğe). */
export type NotificationView = "all" | "unread" | NotificationCategoryName | "snoozed";

const CATEGORY_ORDER: NotificationCategoryName[] = ["posts", "requests", "follow", "messages", "community", "system"];

const CATEGORY_LABEL: Record<NotificationCategoryName, TranslationKey> = {
  posts: "notifications.categoryPosts",
  requests: "nav.requestsShort",
  follow: "notifications.categoryFollow",
  messages: "header.messagesAriaLabel",
  community: "nav.communities",
  system: "notifications.categorySystem",
};

const CATEGORY_ICONS: Record<NotificationCategoryName, IconComponent> = {
  posts: SquareTerminal,
  requests: Sparkles,
  follow: UserPlus,
  messages: MessageCircle,
  community: Users,
  system: Info,
};

export function viewToQuery(view: NotificationView): NotificationCardsQuery {
  if (view === "all") return {};
  if (view === "unread") return { unreadOnly: true };
  if (view === "snoozed") return { snoozedOnly: true };
  return { category: view };
}

/** Menü öğeleri + sayılar: okunmamış kart sayısı sağlayıcıdan, kategori sayıları (tek RPC) menü açıkken/sayaç değişince, ertelenenler sağlayıcıdan. */
export function useNotificationViewMenu(): SectionMenuItem<NotificationView>[] {
  const { t } = useTranslation();
  const { unreadCount, snoozedCount, loadCategoryCounts } = useNotifications();
  const [byCategory, setByCategory] = useState<Partial<Record<NotificationCategoryName, number>>>({});

  useEffect(() => {
    let cancelled = false;
    void loadCategoryCounts().then((counts) => {
      if (!cancelled) setByCategory(counts);
    });
    return () => {
      cancelled = true;
    };
  }, [loadCategoryCounts, unreadCount]);

  return useMemo(
    () => [
      { key: "all" as const, label: t("common.all"), icon: LayoutGrid },
      { key: "unread" as const, label: t("nc.view.unread"), icon: MailOpen, count: unreadCount || undefined },
      ...CATEGORY_ORDER.map((key, index) => ({
        key,
        label: t(CATEGORY_LABEL[key]),
        icon: CATEGORY_ICONS[key],
        count: byCategory[key] || undefined,
        dividerBefore: index === 0,
      })),
      { key: "snoozed" as const, label: t("nc.view.snoozed"), icon: snoozedCount > 0 ? Clock : BellOff, meta: snoozedCount || undefined, dividerBefore: true },
    ],
    [t, unreadCount, snoozedCount, byCategory],
  );
}
