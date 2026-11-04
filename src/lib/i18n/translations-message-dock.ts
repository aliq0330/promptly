/**
 * Mesajlar dock'u (docs/history/328-*) — TR/EN metinleri. Büyük ekranlarda sağ altta sabit duran hap + açılır sohbet paneli.
 * Sohbet/liste metinleri mevcut `messages.*` / `chat.*` anahtarlarını kullanır; burada yalnız dock'a özgü olanlar var.
 */
export const messageDockTranslations = {
  "dock.open": { tr: "Mesajları aç", en: "Open messages" },
  "dock.minimize": { tr: "Küçült", en: "Minimize" },
  "dock.openPage": { tr: "Mesajlar sayfasında aç", en: "Open the Messages page" },
  "dock.openChatPage": { tr: "Sohbeti tam sayfada aç", en: "Open chat as a full page" },
  "dock.unreadAria": { tr: "{{count}} okunmamış sohbet", en: "{{count}} unread chats" },
} as const;
