/**
 * Sohbet yeniden çizimi (docs/history/270-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...chatRedesignTranslations`).
 * Gün ayracı, Kişi bilgisi (sayılar, sessize alma) ve Topluluk bilgisi sayfası.
 */
export const chatRedesignTranslations = {
  // ---- Gün ayracı ----
  "chat.day.today": { tr: "Bugün", en: "Today" },
  "chat.day.yesterday": { tr: "Dün", en: "Yesterday" },

  // ---- Kişi bilgisi ----
  "messages.contact.stats": { tr: "{{prompts}} prompt · {{followers}} takipçi · {{following}} takip", en: "{{prompts}} prompts · {{followers}} followers · {{following}} following" },
  "messages.contact.statsNoPrompts": { tr: "{{followers}} takipçi · {{following}} takip", en: "{{followers}} followers · {{following}} following" },
  "messages.contact.mute": { tr: "Sessize al", en: "Mute" },
  "messages.contact.unmute": { tr: "Sesi aç", en: "Unmute" },
  "messages.contact.mutedToast": { tr: "Sohbet sessize alındı.", en: "Chat muted." },
  "messages.contact.unmutedToast": { tr: "Sohbetin sesi açıldı.", en: "Chat unmuted." },

  // ---- Topluluk bilgisi ----
  "groups.info.title": { tr: "Topluluk bilgisi", en: "Community info" },
  "groups.info.communityPageTile": { tr: "Topluluk sayfası", en: "Community page" },
  "groups.info.communityNotifyValue": { tr: "Düzenle", en: "Edit" },
} as const;
