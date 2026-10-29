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

  // ---- Paylaşılanlar (docs/history/271-*) ----
  "messages.shared.mediaLinks": { tr: "Medya ve bağlantılar", en: "Media and links" },
  "messages.shared.content": { tr: "Paylaşılan içerik", en: "Shared content" },
  "messages.shared.tabPhotos": { tr: "Fotoğraflar", en: "Photos" },
  "messages.shared.tabLinks": { tr: "Bağlantılar", en: "Links" },
  "messages.shared.emptyPhotos": { tr: "Bu sohbette henüz fotoğraf paylaşılmadı.", en: "No photos have been shared in this chat yet." },
  "messages.shared.emptyLinks": { tr: "Bu sohbette henüz bağlantı paylaşılmadı.", en: "No links have been shared in this chat yet." },
  "messages.shared.emptyContent": { tr: "Bu sohbette henüz prompt, istek, workflow, hazır ayar ya da Space paylaşılmadı.", en: "No prompts, requests, workflows, presets or Spaces have been shared in this chat yet." },
  "messages.shared.loadError": { tr: "Liste yüklenemedi, lütfen tekrar dene.", en: "Couldn't load the list — please try again." },
  "messages.shared.truncated": { tr: "En yeni {{count}} mesaj gösteriliyor.", en: "Showing the latest {{count}} messages." },
  "messages.contact.commonCommunities": { tr: "Ortak topluluklar", en: "Communities in common" },
  "messages.contact.commonWith": { tr: "Sen ve {{name}} ikiniz de üyesiniz", en: "You and {{name}} are both members" },
} as const;
